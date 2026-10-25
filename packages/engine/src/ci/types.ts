// Result shapes for `docgen ci` (build-plan.md M18; decisions #22-25). Deliberately keyless and
// deterministic: `runCi` never calls a model or needs an API key — it maps a diff to affected
// walkthroughs, captures them, and diffs the new screenshots against the baseline (published)
// screenshots for that walkthrough at `base`. M19 (change tiers + repair) builds on this result
// shape, so keep it stable.

/** One step whose screenshot changed between `base` and `head`. Paths are absolute, under the
 * run's `outDir` (see `CiResult.outDir`) — `github.ts` reads them to push to the previews branch;
 * `--dry-run` copies them into a local dir instead. */
export interface ChangedStep {
  step: string;
  before: string;
  after: string;
  diff: string;
  changeRatio: number;
}

export type WalkthroughCiStatus = "unchanged" | "changed" | "failed" | "new";

export interface FailureSummary {
  /** First line of the capture failure's error, plus step/action — never the full snapshot/log
   * (docs/scope.md "trimmed failure report"). */
  summary: string;
  /** Exact command to run locally in Claude Code to fix it (decisions #22). */
  repairCommand: string;
}

export interface CiWalkthroughResult {
  walkthrough: string;
  status: WalkthroughCiStatus;
  changedSteps: ChangedStep[];
  failure?: FailureSummary;
}

export interface CiResult {
  base: string;
  head: string;
  /** Every walkthrough id the diff touched (from `computeAffected`); `results` has one entry per
   * id in this list. */
  affected: string[];
  /** True when `computeAffected` couldn't map the diff precisely and treated every walkthrough as
   * affected — mirrors `AffectedResult.all`/`reason`. */
  all: boolean;
  allReason?: string;
  results: CiWalkthroughResult[];
  /** Walkthrough ids with a published page at `base` that no longer exist in
   * `config.walkthroughsDir` at `head`. */
  stalePages: string[];
  /** Where before/after/diff PNGs and (in `--dry-run`) the comment markdown were written. */
  outDir: string;
}
