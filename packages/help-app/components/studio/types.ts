// Client-side types mirroring the engine's Walkthrough/Step shape (kept minimal — the Studio UI
// only needs the fields it edits).
export interface StudioStep {
  id?: string;
  title?: string;
  say?: string;
  caption?: string;
  page_text?: string;
  hold?: number;
}

export interface StudioWalkthrough {
  walkthrough: string;
  title: string;
  steps: StudioStep[];
}

export interface WalkthroughSummary {
  id: string;
  file: string;
  title: string;
  stepCount: number;
}

export interface HistoryEntry {
  at: string;
  by: "person" | "agent";
  action: string;
  target: string;
  before: unknown;
  after: unknown;
  file?: string;
}
