// Client-side types mirroring the engine's Walkthrough/Step shape (kept minimal — the Studio UI
// only needs the fields it edits).
export interface StudioBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StudioTarget {
  role?: string;
  name?: string;
  exact?: boolean;
  label?: string;
  placeholder?: string;
  text?: string;
  css?: string;
  hasText?: string;
  within?: StudioTarget;
  innermost?: boolean;
  nth?: number;
  padUnion?: StudioTarget;
}

export interface StudioCallout {
  id: string;
  target?: StudioTarget;
  box?: StudioBox;
  label?: string;
}

export interface StudioBlur {
  id: string;
  target?: StudioTarget;
  box?: StudioBox;
}

/** Just enough of the engine's `Action` shape for the Studio to find each `highlight` target, in
 * the same order `runner.ts` emits `highlight` events (and so `StudioManifestStep.highlights`
 * boxes) — see `ScreenshotEditor`'s `highlightTargetsOf`. `highlight: true` means "the action's
 * own target"; a `Target` object means "highlight a different element". */
export interface StudioAction {
  target?: StudioTarget;
  highlight?: boolean | StudioTarget;
}

export interface StudioStep {
  id?: string;
  title?: string;
  say?: string;
  caption?: string;
  page_text?: string;
  hold?: number;
  callouts?: StudioCallout[];
  blur?: StudioBlur[];
  actions?: StudioAction[];
}

export interface StudioWalkthrough {
  walkthrough: string;
  title: string;
  steps: StudioStep[];
}

/** One step's resolved overlay boxes from the latest capture manifest (M22) — what the Studio's
 * screenshot editor actually draws against: pinned `callouts`/`blur` entries are only shown once
 * they resolve to a box here (an entry with no matching id just captured yet is a no-op, not a
 * guess), and `highlights` is what a click snaps a new callout/blur to when it lands on an
 * element docgen already knows the box of. */
export interface StudioManifestStep {
  image: string | null;
  highlights: StudioBox[];
  callouts: { id: string; box: StudioBox }[];
  blur: { id: string; box: StudioBox }[];
}

export interface StudioManifest {
  viewport: { width: number; height: number };
  steps: StudioManifestStep[];
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
