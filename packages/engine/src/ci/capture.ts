// Captures one walkthrough for `docgen ci` — no video, no voice, no frame-stabilization against
// a previous build (CI compares straight to the baseline screenshot, not to "last run"). Mirrors
// the capture step of commands/capture.ts (db-reset-before-capture, trimmed failure report) but
// kept separate so `docgen ci` never pulls in capture's video/voice build stages.
import { createHash } from "node:crypto";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import type { ResolvedConfig } from "../config/index.js";
import { loadWalkthroughFile } from "../walkthrough/index.js";
import type { Walkthrough } from "../walkthrough/index.js";
import { runCapture } from "../capture/index.js";
import { assertLocalDatabase } from "../capture/write-guard.js";
import type { CaptureRunResult } from "../capture/runner.js";
import type { FailureReport } from "../capture/types.js";

function storageStateKey(baseUrl: string, walkthrough: Walkthrough): string {
  const persona = walkthrough.start?.persona ?? walkthrough.start?.signed_in_as ?? null;
  const hash = createHash("sha256").update(JSON.stringify({ baseUrl, persona })).digest("hex").slice(0, 16);
  return hash;
}

function firstLine(message: string): string {
  return message.split("\n")[0] ?? message;
}

export interface CiCaptureResult {
  walkthrough: Walkthrough;
  captureDir: string;
  ok: boolean;
  failure?: FailureReport;
}

/** Loads `file`, runs capture into `<buildDir>/<id>/ci/capture`, and returns the outcome without
 * throwing — a failed capture is a normal `docgen ci` result (status "failed"), not a crash. */
export async function captureWalkthroughForCi(file: string, config: ResolvedConfig, appUrl: string | undefined): Promise<CiCaptureResult> {
  const walkthrough = loadWalkthroughFile(file);
  const captureDir = join(config.buildDir, walkthrough.walkthrough, "ci", "capture");
  mkdirSync(captureDir, { recursive: true });

  const baseUrl = appUrl ?? walkthrough.start?.baseUrl ?? config.app.baseUrl;
  const storageStatePath = join(config.buildDir, ".docgen-session", `storageState-ci-${storageStateKey(baseUrl, walkthrough)}.json`);

  try {
    const needsDbReset = Boolean(config.database && walkthrough.validate?.database?.length);
    if (needsDbReset && config.database) {
      const dbUrl = await config.database.url();
      assertLocalDatabase(dbUrl);
      await config.database.reset?.();
    }

    const result: CaptureRunResult = await runCapture({
      walkthrough,
      config: { ...config, app: { ...config.app, baseUrl } },
      outDir: captureDir,
      storageStatePath,
    });
    writeFileSync(join(captureDir, "manifest.json"), `${JSON.stringify(result.manifest, null, 2)}\n`);
    writeFileSync(join(captureDir, "run.json"), `${JSON.stringify(result.run, null, 2)}\n`);
    writeFileSync(join(captureDir, "validation.json"), `${JSON.stringify(result.validation, null, 2)}\n`);
    return { walkthrough, captureDir, ok: result.validation.ok, failure: result.failure };
  } catch (err) {
    const error = err as Error;
    const failure: FailureReport = {
      step: undefined,
      action: "run",
      error: firstLine(error.message ?? String(err)),
      url: "",
      snapshot: "",
      screenshotPath: null,
    };
    writeFileSync(join(captureDir, "failure.json"), `${JSON.stringify(failure, null, 2)}\n`);
    return { walkthrough, captureDir, ok: false, failure };
  }
}
