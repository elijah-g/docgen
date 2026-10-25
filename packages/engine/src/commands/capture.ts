import { createHash } from "node:crypto";
import { join } from "node:path";
import { existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { loadConfig } from "../config/index.js";
import { loadWalkthroughFile } from "../walkthrough/index.js";
import type { Walkthrough } from "../walkthrough/index.js";
import { runCapture, withFrameStabilization } from "../capture/index.js";
import { assertLocalDatabase } from "../capture/write-guard.js";
import type { CaptureManifest, CaptureSummary, FailureReport } from "../capture/types.js";
import { resolveCaptureSettings } from "../config/types.js";

export interface RunCaptureOptions {
  configPath: string;
  walkthroughIds: string[];
  json: boolean;
  noReset?: boolean;
}

/** Resolves which walkthrough YAML files to capture: named ids/slugs, or every file in the dir. */
function findWalkthroughs(dir: string, ids: string[]): string[] {
  const all = readdirSync(dir)
    .filter((f) => /\.(ya?ml)$/i.test(f))
    .map((f) => join(dir, f))
    .sort();
  if (ids.length === 0) return all;
  return ids.map((id) => {
    if (existsSync(id)) return id;
    const match = all.find((f) => f.endsWith(`/${id}.yaml`) || f.endsWith(`/${id}.yml`));
    if (!match) throw new Error(`no walkthrough found for "${id}" in ${dir}`);
    return match;
  });
}

/**
 * Keys the reused sign-in session file by baseUrl + persona, so two
 * walkthroughs that sign in as different hosts/people never share (or
 * clobber) one another's storage state.
 */
function storageStateKey(baseUrl: string, walkthrough: Walkthrough): string {
  const persona = walkthrough.start?.persona ?? walkthrough.start?.signed_in_as ?? null;
  const hash = createHash("sha256").update(JSON.stringify({ baseUrl, persona })).digest("hex").slice(0, 16);
  return hash;
}

/** First line only — an adapter/Playwright error's message can run to a multi-line call log. */
function firstLine(message: string): string {
  return message.split("\n")[0] ?? message;
}

/** Runs `docgen capture`, writing `.build/<id>/capture/{manifest,run,validation}.json` per walkthrough. */
export async function runCaptureCommand(opts: RunCaptureOptions): Promise<number> {
  const config = await loadConfig(opts.configPath);
  const files = findWalkthroughs(config.walkthroughsDir, opts.walkthroughIds);

  const summaries: CaptureSummary[] = [];
  let ok = true;

  for (const file of files) {
    const walkthrough: Walkthrough = loadWalkthroughFile(file);
    const outDir = join(config.buildDir, walkthrough.walkthrough, "capture");
    mkdirSync(outDir, { recursive: true });

    const baseUrl = walkthrough.start?.baseUrl ?? config.app.baseUrl;
    const storageStatePath = join(
      config.buildDir,
      ".docgen-session",
      `storageState-${storageStateKey(baseUrl, walkthrough)}.json`,
    );

    const started = Date.now();
    try {
      // Only reset the database for walkthroughs that actually assert
      // against it — and never without first proving the URL is local.
      // `reset()` is destructive; it must not run against an unverified or
      // needlessly touched database. Inside the same try/catch as the
      // capture itself, so a refusal here is reported like any other
      // per-walkthrough failure instead of crashing the whole command.
      const needsDbReset = Boolean(config.database && walkthrough.validate?.database?.length);
      if (!opts.noReset && needsDbReset && config.database) {
        const dbUrl = await config.database.url();
        assertLocalDatabase(dbUrl);
        await config.database.reset?.();
      }

      const captureSettings = resolveCaptureSettings(config.capture);
      const stabilizeOpts = { threshold: captureSettings.frameDiffThreshold, tolerance: captureSettings.frameDiffTolerance };
      const { result, frameDiff } = await withFrameStabilization(outDir, stabilizeOpts, () =>
        runCapture({
          walkthrough,
          config,
          outDir,
          storageStatePath,
          log: opts.json ? undefined : (...a: unknown[]) => console.error("[capture]", ...a),
        }),
      );
      writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(result.manifest, null, 2)}\n`);
      writeFileSync(join(outDir, "run.json"), `${JSON.stringify(result.run, null, 2)}\n`);
      writeFileSync(join(outDir, "validation.json"), `${JSON.stringify(result.validation, null, 2)}\n`);

      const passed = result.validation.steps.filter((s) => s.ok).length;
      const frames = countFrames(result.manifest);
      const summary: CaptureSummary = {
        walkthrough: walkthrough.walkthrough,
        ok: result.validation.ok,
        steps: { total: result.validation.steps.length, passed },
        frames,
        durationMs: Date.now() - started,
        failure: result.failure,
        frameDiff,
      };
      summaries.push(summary);
      if (!summary.ok) ok = false;
    } catch (err) {
      ok = false;
      const error = err as Error;
      const failure: FailureReport = {
        step: undefined,
        action: "run",
        // First line only, never the full Playwright call log (which can
        // run to dozens of lines and leak page state into CI output).
        error: firstLine(error.message ?? String(err)),
        url: "",
        snapshot: "",
        screenshotPath: null,
      };
      // This catch is for failures before/around `runCapture` itself (db reset, config errors) —
      // `runCapture` persists its own step-failure report, but a failure here never reaches it,
      // so write failure.json here too; an agent reading the capture dir shouldn't have to know
      // which of the two failure paths produced it.
      writeFileSync(join(outDir, "failure.json"), `${JSON.stringify(failure, null, 2)}\n`);
      summaries.push({
        walkthrough: walkthrough.walkthrough,
        ok: false,
        steps: { total: 0, passed: 0 },
        frames: 0,
        durationMs: Date.now() - started,
        failure,
      });
    }
  }

  printSummaries(summaries, opts.json);
  return ok ? 0 : 1;
}

function countFrames(manifest: CaptureManifest): number {
  const names = new Set<string>();
  for (const step of manifest.steps) {
    for (const e of step.events) {
      if (e.type === "frame") names.add(e.image);
      if (e.type === "scrollFrames" || e.type === "typeFrames") {
        for (const img of e.images) names.add(img);
      }
    }
  }
  return names.size;
}

function printSummaries(summaries: CaptureSummary[], json: boolean): void {
  if (json) {
    console.log(JSON.stringify({ walkthroughs: summaries }));
    return;
  }
  for (const s of summaries) {
    const status = s.ok ? "PASS" : "FAIL";
    const frameDiff = s.frameDiff ? `  (${s.frameDiff.kept} kept / ${s.frameDiff.changed} changed)` : "";
    console.log(
      `${status}  ${s.walkthrough}  steps ${s.steps.passed}/${s.steps.total}  frames ${s.frames}${frameDiff}  ${s.durationMs}ms`,
    );
    if (!s.ok && s.failure) {
      printFailure(s.failure);
    }
  }
}

function printFailure(f: FailureReport): void {
  console.log(`  step: ${f.step ?? "(unknown)"}`);
  console.log(`  action: ${f.action}`);
  console.log(`  error: ${f.error}`);
  console.log(`  url: ${f.url}`);
  if (f.screenshotPath) console.log(`  screenshot: ${f.screenshotPath}`);
  if (f.snapshot) {
    console.log("  snapshot:");
    for (const line of f.snapshot.split("\n")) console.log(`    ${line}`);
  }
}
