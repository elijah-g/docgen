// Types for `docgen build`'s per-walkthrough, per-stage pipeline and its run report.
// See docs/scope.md "Pipeline" and "Only rebuild what changed", and docs/build-plan.md M6.
export type BuildStageName = "capture" | "voice" | "render" | "pages" | "pdf" | "index" | "qa";

export type StageStatus = "ok" | "skipped" | "failed" | "not-selected";

export interface StageResult {
  status: StageStatus;
  skipped: boolean;
  ms: number;
  /** Short human-readable detail (error message, or a skip/ok reason). */
  detail?: string;
}

export interface WalkthroughBuildResult {
  walkthrough: string;
  ok: boolean;
  stages: Partial<Record<BuildStageName, StageResult>>;
  voice?: { charsBilled: number; cached: number; synthesized: number; costUsd: number };
  render?: { durationSec: number; wallTimeMs: number };
  qa?: { ok: boolean; problems: number };
}

export interface BuildOptions {
  configPath: string;
  walkthroughIds: string[];
  draft?: boolean;
  only?: BuildStageName[];
  skipCapture?: boolean;
  noReset?: boolean;
  json: boolean;
}

export interface ModelsUsageSection {
  totals: Array<{
    model: string;
    tier: string;
    calls: number;
    input: number;
    output: number;
    cacheRead: number;
    costUsd: number;
  }>;
  totalCostUsd: number;
  totalTokens: number;
}

export interface BuildReport {
  generatedAt: string;
  configPath: string;
  draft: boolean;
  walkthroughs: WalkthroughBuildResult[];
  index?: StageResult & { searchIndexFile?: string; llmsTxtFile?: string; pageCount?: number };
  /** `models.totalCostUsd`/`totalTokens` cover only this run (see `assembleReport`'s `since`). */
  models: ModelsUsageSection;
  /** This run's total voice-synthesis cost (sum of every walkthrough's `voice.costUsd`). */
  voice: { charsBilled: number; costUsd: number };
  budget?: { usd?: number; tokens?: number; exceeded: boolean; reasons: string[] };
  ok: boolean;
}

export const ALL_STAGES: BuildStageName[] = ["capture", "voice", "render", "pages", "pdf", "index", "qa"];
