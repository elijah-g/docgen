// `docgen ci`'s core (build-plan.md M18; decisions #22-23): affected -> capture -> screenshot
// diff -> one result object. No model, no API key — every decision here is a pixel diff or a
// git lookup. `commands/ci.ts` turns this into the CLI command; `ci/github.ts` turns the result
// into a PR comment + pushed preview images.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../config/index.js";
import type { ResolvedConfig } from "../config/index.js";
import { computeAffected } from "../impact/index.js";
import { listWalkthroughs } from "../impact/walkthroughs.js";
import { buildPage } from "../pages/index.js";
import { resolveCaptureSettings } from "../config/types.js";
import { buildDigest } from "../digest/index.js";
import { captureWalkthroughForCi } from "./capture.js";
import { diffAgainstBaseline } from "./diff.js";
import { resolveBaselineLookup, diskBaselineSource, gitBaselineSource, type BaselineSource } from "./baseline.js";
import { tierForStatus, repairCommandFor, findNewUncoveredRoutes } from "./tiers.js";
import type { CiResult, CiWalkthroughResult, FailureSummary } from "./types.js";

export interface RunCiOptions {
  configPath: string;
  base: string;
  head?: string;
  prNumber?: number;
  /** Overrides config.app.baseUrl for this run (e.g. the Action's own started-app URL). */
  appUrl?: string;
  /** Overrides config.impact?.appRepo — same as `docgen affected --app-repo`. Default: cwd. */
  appRepo?: string;
  /**
   * Where the baseline (published) screenshots come from. "disk" (default): whatever's already
   * in the checkout's help app — in a normal single-repo CI run that's main's last publish. No
   * second checkout or git-history lookup needed. "git": `git show <base>:...` in whatever repo
   * contains the help app — use this when the working tree has already moved past `base` (e.g.
   * replaying one historic commit in isolation) and the on-disk screenshots don't reflect it, or
   * when `base`/`head` are refs in a different repo than the one the help app's screenshots are
   * committed in (then "disk" can't line up with `base` at all).
   */
  baseline?: "disk" | "git";
  /** Builds the result (and before/after/diff images) without pushing anything or calling
   * GitHub — `commands/ci.ts --dry-run` writes them to a local dir instead. */
  dryRun?: boolean;
}

function publicDirFor(config: ResolvedConfig): string {
  return config.helpApp ? join(config.helpApp, "public") : config.outDir;
}

function failureSummaryFor(id: string, configPath: string, error: string, step: string | undefined): FailureSummary {
  const stepPart = step ? `step "${step}": ` : "";
  return { summary: `${stepPart}${error}`, repairCommand: repairCommandFor(id, configPath) };
}

export async function runCi(opts: RunCiOptions): Promise<CiResult> {
  const config = await loadConfig(opts.configPath);
  const head = opts.head ?? "HEAD";
  const appRepo = opts.appRepo ?? config.impact?.appRepo ?? process.cwd();

  const affected = await computeAffected({
    appRepo,
    base: opts.base,
    head,
    config,
    app: config.impact?.app,
  });

  const outDir = join(config.buildDir, "ci", "diff");
  mkdirSync(outDir, { recursive: true });

  const publicDir = publicDirFor(config);
  const baselineMode = opts.baseline ?? "disk";
  const source: BaselineSource =
    baselineMode === "git" ? gitBaselineSource(resolveBaselineLookup(publicDir), opts.base) : diskBaselineSource(publicDir);
  const captureSettings = resolveCaptureSettings(config.capture);

  const walkthroughEntries = listWalkthroughs(config.walkthroughsDir, config.buildDir);
  const idsToCheck = affected.all ? walkthroughEntries.map((w) => w.id) : affected.walkthroughs.filter((w) => w.affected).map((w) => w.id);

  const results: CiWalkthroughResult[] = [];
  const pagesOutDir = join(config.buildDir, "ci", "pages");

  for (const id of idsToCheck) {
    const entry = walkthroughEntries.find((w) => w.id === id);
    if (!entry) continue;

    const captured = await captureWalkthroughForCi(entry.file, config, opts.appUrl);
    if (!captured.ok) {
      results.push({
        walkthrough: id,
        status: "failed",
        tier: tierForStatus("failed"),
        changedSteps: [],
        failure: failureSummaryFor(id, opts.configPath, captured.failure?.error ?? "capture failed", captured.failure?.step),
      });
      continue;
    }

    let page;
    try {
      page = await buildPage(captured.walkthrough, captured.captureDir, pagesOutDir, { readers: config.readers });
    } catch (err) {
      results.push({
        walkthrough: id,
        status: "failed",
        tier: tierForStatus("failed"),
        changedSteps: [],
        failure: failureSummaryFor(id, opts.configPath, (err as Error).message.split("\n")[0], undefined),
      });
      continue;
    }
    if (!page.passed) {
      results.push({
        walkthrough: id,
        status: "failed",
        tier: tierForStatus("failed"),
        changedSteps: [],
        failure: failureSummaryFor(id, opts.configPath, page.problems[0] ?? "capture validation failed", undefined),
      });
      continue;
    }

    const changedSteps = diffAgainstBaseline(
      id,
      page.screenshotsDir,
      page.screenshots.map((s) => s.split("/").pop()!),
      source,
      captureSettings.frameDiffTolerance,
      outDir,
    );

    if (changedSteps === undefined) {
      results.push({ walkthrough: id, status: "new", tier: tierForStatus("new"), changedSteps: [] });
    } else if (changedSteps.length === 0) {
      results.push({ walkthrough: id, status: "unchanged", tier: tierForStatus("unchanged"), changedSteps: [] });
    } else {
      results.push({ walkthrough: id, status: "changed", tier: tierForStatus("changed"), changedSteps });
    }
  }

  const currentIds = new Set(walkthroughEntries.map((w) => w.id));
  const stalePages = source.listWalkthroughIds().filter((id) => !currentIds.has(id));

  let newRoutes: CiResult["newRoutes"] = [];
  try {
    const headDigest = buildDigest(appRepo, { app: config.impact?.app });
    if (!headDigest.apps || headDigest.apps.length === 0) {
      newRoutes = findNewUncoveredRoutes({
        appRepo,
        base: opts.base,
        head,
        routes: headDigest.routes,
        walkthroughs: walkthroughEntries,
        configPath: opts.configPath,
      });
    }
  } catch {
    // Best-effort: an ambiguous monorepo, a shallow clone, or a missing base ref shouldn't fail
    // the whole CI run over the "new" tier — cosmetic/broken results above are the load-bearing
    // part of `docgen ci`.
  }

  return {
    base: opts.base,
    head,
    affected: idsToCheck,
    all: affected.all,
    allReason: affected.reason,
    results,
    newRoutes,
    stalePages,
    outDir,
  };
}
