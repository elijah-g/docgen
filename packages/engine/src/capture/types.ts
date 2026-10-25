import type { Camera, Viewport } from "../walkthrough/index.js";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export type Transition = "cut" | "fade";

/**
 * One event in a step's playback timeline — the same vocabulary TallyUp's
 * compose.mjs animates: frame, move, click, highlight, hold, plus the
 * per-character/per-scroll-increment frame bursts.
 */
export type CaptureEvent =
  | { type: "frame"; image: string; transition: Transition }
  | { type: "move"; to: Point }
  | { type: "click"; at: Point }
  | { type: "highlight"; box: Box }
  | { type: "clearHighlight" }
  | { type: "hold"; seconds: number }
  | { type: "scrollFrames"; images: string[] }
  | { type: "typeFrames"; images: string[]; text: string };

/** One same-origin network request a step's actions triggered. */
export interface ImpactRequest {
  method: string;
  path: string;
}

/** docgen addition: what a step touched, for the CI impact map. */
export interface StepImpact {
  urls: string[];
  requests: ImpactRequest[];
}

/** docgen addition: per-step check outcomes, mirrored into the manifest (not just validation.json). */
export interface CheckResult {
  [key: string]: unknown;
  ok: boolean;
}

/** A step's callout/blur box, resolved at capture time (M22) — `id` matches the walkthrough
 * step's `callouts`/`blur` entry it was resolved from, so pages/render can look up the label
 * (callouts only) and ordering from the walkthrough while trusting this box, which already
 * followed a `target` to wherever it actually rendered this run. Entries whose target couldn't
 * be found this run are simply absent — pages/render skip them rather than drawing a stale box. */
export interface ResolvedBox {
  id: string;
  box: Box;
}

export interface ManifestStep {
  id: string | undefined;
  camera: Camera;
  cameraBox: Box | null;
  events: CaptureEvent[];
  doc: { image: string | null; highlights: Box[]; callouts?: ResolvedBox[]; blur?: ResolvedBox[] };
  impact: StepImpact;
  checks: CheckResult[];
}

/**
 * Same shape as TallyUp's `capture/manifest.json` (render/compose reads this),
 * plus the `impact` and `checks` additions on each step. Deliberately holds
 * nothing time-based (no `capturedAt`/durations) — identical input must
 * produce a byte-identical manifest across runs. Wall-clock metadata lives in
 * `run.json` (see `RunInfo` in `./runner.js`) instead.
 */
export interface CaptureManifest {
  workflow: string;
  /**
   * @deprecated No longer written by the capture runner (it broke
   * byte-for-byte determinism across identical runs) — see `run.json`
   * (`RunInfo` in `./runner.js`) instead. Kept optional so code reading an
   * older manifest.json still type-checks.
   */
  capturedAt?: string;
  baseUrl: string;
  viewport: Viewport;
  deviceScaleFactor: number;
  steps: ManifestStep[];
  finalUrl?: string;
}

export interface ProblemEntry {
  url: string;
  text?: string;
  status?: number;
}

export interface StepResult {
  id: string | undefined;
  title: string | undefined;
  checks: CheckResult[];
  ok: boolean;
  ms: number;
  error?: string;
  failureFrame?: string | null;
}

export interface DatabaseCheckResult {
  name: string;
  ok: boolean;
  row?: Record<string, unknown>;
  expect?: Record<string, unknown>;
  error?: string;
}

/** Same shape as TallyUp's `capture/validation.json`. */
export interface ValidationResult {
  workflow: string;
  ranAt: string;
  baseUrl: string;
  database?: string;
  ok: boolean;
  steps: StepResult[];
  dbChecks: DatabaseCheckResult[];
  problems: {
    console: ProblemEntry[];
    page: ProblemEntry[];
    server: ProblemEntry[];
  };
}

/** The trimmed, agent-safe report for a failed step. Never full HTML/logs. */
export interface FailureReport {
  step: string | undefined;
  action: string;
  error: string;
  url: string;
  /** `page.ariaSnapshot()`/`locator('body').ariaSnapshot()`, capped to ~60 lines. */
  snapshot: string;
  screenshotPath: string | null;
}

/** Frame-stabilization counts for this capture run; see capture/frame-diff.ts stabilizeFrames(). */
export interface FrameDiffSummary {
  kept: number;
  changed: number;
}

export interface CaptureSummary {
  walkthrough: string;
  ok: boolean;
  steps: { total: number; passed: number };
  frames: number;
  durationMs: number;
  failure?: FailureReport;
  frameDiff?: FrameDiffSummary;
}
