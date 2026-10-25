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

/**
 * docs/scope.md "Three kinds of change" (decisions #8, #22); build-plan.md M19. Deterministic
 * from `WalkthroughCiStatus` (see `ci/tiers.ts`'s `tierForStatus`) plus the separate
 * `CiResult.newRoutes` list for app screens no walkthrough covers at all yet:
 *   - "cosmetic": capture passed (status "unchanged"/"changed"/"new" — "new" here means a
 *     walkthrough with no baseline yet, so there's nothing to compare, not "undocumented route").
 *     Refreshes and publishes on merge; nobody is asked.
 *   - "broken": capture failed (status "failed") — flagged with the repair command.
 *   - "new": not a per-walkthrough tier at all — see `NewRouteResult` below.
 */
export type ChangeTier = "cosmetic" | "broken";

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
  /** docs/scope.md "Three kinds of change" tier for this walkthrough — see `ChangeTier`. */
  tier: ChangeTier;
  changedSteps: ChangedStep[];
  failure?: FailureSummary;
}

/**
 * A page route added in this diff that no walkthrough's manifest visits — the "new" tier
 * (docs/scope.md "Three kinds of change"; build-plan.md M19). Listed separately from
 * `CiWalkthroughResult` because there's no walkthrough yet to attach a result to.
 */
export interface NewRouteResult {
  /** Route path, e.g. "/dashboard/teams/[id]". */
  path: string;
  /** File path relative to the scanned app root, e.g. "app/dashboard/teams/[id]/page.tsx". */
  file: string;
  /** Exact command to run locally in Claude Code to draft a walkthrough for this route
   * (the docgen-write skill), labelled `docs:new` (decisions #24). */
  draftCommand: string;
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
  /** New page routes in this diff that no walkthrough covers yet — the "new" tier. */
  newRoutes: NewRouteResult[];
  /** Walkthrough ids with a published page at `base` that no longer exist in
   * `config.walkthroughsDir` at `head`. */
  stalePages: string[];
  /** Where before/after/diff PNGs and (in `--dry-run`) the comment markdown were written. */
  outDir: string;
}
