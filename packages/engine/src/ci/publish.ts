// `docgen ci --publish` (build-plan.md M19 "Merge behaviour hook"): on a push to main (a merged
// PR), re-captures the walkthroughs the merge affected and refreshes their published
// screenshots/pages in the help app — the "cosmetic changes... refresh and publish on merge"
// half of docs/scope.md "Three kinds of change". No model, no API key, no video render (that's a
// `docgen build` concern, not a CI concern — decisions #22 "CI does deterministic work only").
// The generated workflow (init/ci.ts) runs this with `GITHUB_TOKEN` and commits the result
// directly to main; this module itself never touches git.
import { join } from "node:path";
import { loadConfig } from "../config/index.js";
import { computeAffected } from "../impact/index.js";
import { listWalkthroughs } from "../impact/walkthroughs.js";
import { buildPage } from "../pages/index.js";
import type { BuildPageResult } from "../pages/index.js";
import { runIndexStage } from "../build/index-stage.js";
import { captureWalkthroughForCi } from "./capture.js";

export interface RunCiPublishOptions {
  configPath: string;
  /** Previous commit — usually the push event's `before` sha (what main was before this merge). */
  base: string;
  /** Default `"HEAD"`. */
  head?: string;
  /** Overrides config.app.baseUrl for this run. */
  appUrl?: string;
  /** Overrides config.impact?.appRepo. Default: cwd. */
  appRepo?: string;
}

export interface CiPublishResult {
  /** Walkthroughs re-captured and republished. */
  published: string[];
  /** Walkthroughs whose capture failed — left as whatever was last published; not an error on
   * its own (the next PR's `docgen ci` already flagged it as broken before this ran). */
  failed: string[];
  /** True when `computeAffected` couldn't map the push precisely — every walkthrough was
   * republished rather than just the affected ones. */
  all: boolean;
  copiedToHelpApp: boolean;
  ok: boolean;
}

/**
 * Re-captures every walkthrough this push affected and republishes its page/screenshots into
 * `config.helpApp` (or `config.outDir` when there's no help app). Deterministic, keyless, no
 * video — `docgen build` (run locally or in its own job) is still what produces the video.
 */
export async function runCiPublish(opts: RunCiPublishOptions): Promise<CiPublishResult> {
  const config = await loadConfig(opts.configPath);
  const head = opts.head ?? "HEAD";
  const appRepo = opts.appRepo ?? config.impact?.appRepo ?? process.cwd();

  const affected = await computeAffected({ appRepo, base: opts.base, head, config, app: config.impact?.app });
  const walkthroughEntries = listWalkthroughs(config.walkthroughsDir, config.buildDir);
  const idsToPublish = affected.all ? walkthroughEntries.map((w) => w.id) : affected.walkthroughs.filter((w) => w.affected).map((w) => w.id);

  const pagesOutDir = join(config.buildDir, "ci", "pages");
  const published: string[] = [];
  const failed: string[] = [];
  const pages: BuildPageResult[] = [];

  for (const id of idsToPublish) {
    const entry = walkthroughEntries.find((w) => w.id === id);
    if (!entry) continue;

    const captured = await captureWalkthroughForCi(entry.file, config, opts.appUrl);
    if (!captured.ok) {
      failed.push(id);
      continue;
    }

    let page: BuildPageResult;
    try {
      page = await buildPage(captured.walkthrough, captured.captureDir, pagesOutDir, { readers: config.readers });
    } catch {
      failed.push(id);
      continue;
    }
    if (!page.publishable) {
      failed.push(id);
      continue;
    }

    pages.push(page);
    published.push(id);
  }

  const index = runIndexStage({
    pagesDir: pagesOutDir,
    outDir: config.outDir,
    helpApp: config.helpApp,
    pages,
    walkthroughIds: walkthroughEntries.map((w) => w.id),
  });

  return { published, failed, all: affected.all, copiedToHelpApp: index.copiedToHelpApp, ok: failed.length === 0 };
}
