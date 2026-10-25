// Timeline + render option/result types. The timeline is the deterministic, serializable
// intermediate the player (assets/player/*) renders frame-by-frame — it is the one thing
// both the Playwright renderer and a human opening index.html in a browser consume.

import type { Box, Point } from "../capture/index.js";
export type { Box, Point };

/** The player's pan/zoom state: `z` is zoom, `(cx, cy)` the centre in capture-viewport px. */
export interface CameraFrame {
  z: number;
  cx: number;
  cy: number;
}

export interface TimelineFrameCue {
  t: number;
  src: string;
  transition: "cut" | "fade";
}

export interface TimelineMove {
  t0: number;
  t1: number;
  from: Point;
  to: Point;
}

export interface TimelineClick {
  t: number;
  x: number;
  y: number;
}

export interface TimelineHighlight {
  t0: number;
  t1: number;
  box: Box;
}

export interface TimelineCamera {
  t0: number;
  t1: number;
  from: CameraFrame;
  to: CameraFrame;
}

export interface TimelineCaption {
  t0: number;
  t1: number;
  text: string;
}

export interface TimelineChip {
  t0: number;
  t1: number;
  num: string;
  eyebrow: string;
  title: string;
}

export interface TimelineAudioCue {
  id: string;
  file: string;
  t: number;
}

/** One playback scene (intro, a step, or outro) as a `[t0, t1)` slice of the full timeline's
 * time range. Scenes are rendered to their own segment and concatenated (docs/scope.md "Only
 * rebuild what changed": "A video re-renders only if one of its scenes changed"). `id` matches
 * `beatIds()` (intro, the step's id, or outro). */
export interface TimelineScene {
  id: string;
  t0: number;
  t1: number;
}

export interface Timeline {
  fps: number;
  viewport: { w: number; h: number };
  stage: { x: number; y: number; w: number; h: number };
  fade: number;
  brand: { name: string; logoSrc?: string };
  intro: { eyebrow: string; titleHtml: string; subtitle: string };
  outro: { title: string; recap: string[] };
  chapters: string[];
  frames: TimelineFrameCue[];
  moves: TimelineMove[];
  clicks: TimelineClick[];
  highlights: TimelineHighlight[];
  cameras: TimelineCamera[];
  captions: TimelineCaption[];
  chips: TimelineChip[];
  audio: TimelineAudioCue[];
  cursorStart: Point;
  stageIn: { t0: number; t1: number };
  stageOut: { t0: number; t1: number };
  duration: number;
  previewAudio: string;
  /** Scene boundaries in playback order: intro, each step, outro. See `TimelineScene`.
   * Optional so existing hand-built `Timeline` fixtures in tests outside render/** stay valid;
   * `buildTimeline()` always populates it. Render-side code should fall back to `[]`. */
  scenes?: TimelineScene[];
}

/** Narration for one beat (intro, a step, or outro), already resolved to a file + length. */
export interface NarrationBeat {
  /** Absolute path, or a path relative to the voice dir the audio was synthesized into. */
  audioPath: string;
  durationMs: number;
}

export interface RenderQuality {
  fps: number;
  crf: number;
  preset: string;
  /** Playwright `deviceScaleFactor` against the player's fixed 1920x1080 CSS canvas — the knob
   * that gives draft its reduced output resolution (e.g. 0.5 -> 960x540) without touching
   * player layout. 1 for full quality. */
  deviceScaleFactor: number;
}

export interface RenderOptions {
  /** Where to write `<id>/<id>.mp4` etc. */
  outDir: string;
  /** Capture dir containing manifest.json, validation.json and frames/. */
  captureDir: string;
  /** Narration beats keyed by beat id (intro, each step's id, outro). */
  narration: Record<string, NarrationBeat>;
  /** Lower fps/crf, ultrafast preset — for quick previews. Default false (full quality). */
  draft?: boolean;
  /** Override fps (otherwise draft ? 15 : 30). */
  fps?: number;
  /** Render these instants as stills instead of (or in addition to) the full video. */
  stills?: number[];
  /** Validation.json's ok must be true unless this is set. */
  force?: boolean;
  /** Re-render even if a matching .hash sidecar is found. */
  noCache?: boolean;
  ffmpegPath?: string;
  ffprobePath?: string;
  /** Browser pages to render scenes concurrently. Default `min(4, cpus/2)`. */
  concurrency?: number;
}

export interface RenderResult {
  id: string;
  outDir: string;
  mp4?: string;
  srt: string;
  vtt: string;
  chaptersVtt: string;
  timelineJson: string;
  stills: string[];
  durationSec: number;
  skipped: boolean;
  frames: number;
  wallTimeMs: number;
  /** Per-scene render report (docs/scope.md "Only rebuild what changed"): total scenes, how
   * many were actually rendered vs. reused from a matching cached segment. Absent when the
   * whole video was skipped (`skipped: true`) or only stills were requested. */
  scenesTotal?: number;
  scenesRendered?: number;
  scenesReused?: number;
}
