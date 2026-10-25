// Pure state-math port of assets/player/player.js's renderAt(t) lookups (lastAtOrBefore,
// cameraAt, cursorAt, and the highlight/caption/chip "active at t" finds). player.js's header
// comment says it best: "every visual is a pure function of time" — renderAt(t) reads nothing
// but `window.TIMELINE` and `t`. segments.ts needs exactly that same function of time, evaluated
// at a scene's t0, to know what state an earlier scene hands into this one (the frame still on
// screen, the cursor/camera mid-move, an open highlight) without spinning up a browser. Keep
// this in sync with player.js's `lastAtOrBefore`/`cameraAt`/`cursorAt`/highlight-find by hand —
// same pattern as timeline.ts's header note that it's a hand-kept port of compose.mjs.
import type { CameraFrame, Point, Timeline, TimelineCaption, TimelineChip, TimelineFrameCue, TimelineHighlight } from "./types.js";

function lastAtOrBefore<T>(list: T[], t: number, key: (item: T) => number): number {
  let lo = 0;
  let hi = list.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (key(list[m]) <= t) {
      ans = m;
      lo = m + 1;
    } else {
      hi = m - 1;
    }
  }
  return ans;
}

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
const ease = (p: number): number => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const ramp = (t: number, t0: number, d: number): number => clamp((t - t0) / d, 0, 1);

/** The frame cue on screen at `t` — mirrors player.js's `lastAtOrBefore(TL.frames, t)` fallback
 * to index 0 when `t` is before the first cue (there's always at least one frame cue). */
export function frameAt(tl: Timeline, t: number): TimelineFrameCue {
  const fi = Math.max(0, lastAtOrBefore(tl.frames, t, (f) => f.t));
  return tl.frames[fi];
}

/** Mirrors player.js's `cameraAt`. */
export function cameraAt(tl: Timeline, t: number): CameraFrame {
  const i = lastAtOrBefore(tl.cameras, t, (c) => c.t0);
  if (i < 0) return tl.cameras[0].from;
  const c = tl.cameras[i];
  const p = ease(ramp(t, c.t0, c.t1 - c.t0));
  return { z: lerp(c.from.z, c.to.z, p), cx: lerp(c.from.cx, c.to.cx, p), cy: lerp(c.from.cy, c.to.cy, p) };
}

/** Mirrors player.js's `cursorAt` (including the sideways "arc" bend). */
export function cursorAt(tl: Timeline, t: number): Point {
  const i = lastAtOrBefore(tl.moves, t, (m) => m.t0);
  if (i < 0) return { ...tl.cursorStart };
  const m = tl.moves[i];
  const p = ease(ramp(t, m.t0, m.t1 - m.t0));
  const dx = m.to.x - m.from.x;
  const dy = m.to.y - m.from.y;
  const bend = Math.sin(Math.PI * p) * 0.08;
  return { x: lerp(m.from.x, m.to.x, p) - dy * bend, y: lerp(m.from.y, m.to.y, p) + dx * bend };
}

/** Mirrors player.js's highlight find: `TL.highlights.find((h) => t >= h.t0 && t <= h.t1)`. */
export function highlightAt(tl: Timeline, t: number): TimelineHighlight | undefined {
  return tl.highlights.find((h) => t >= h.t0 && t <= h.t1);
}

/** Mirrors player.js's caption find. */
export function captionAt(tl: Timeline, t: number): TimelineCaption | undefined {
  return tl.captions.find((c) => t >= c.t0 && t <= c.t1);
}

/** Mirrors player.js's chip find. */
export function chipAt(tl: Timeline, t: number): TimelineChip | undefined {
  return tl.chips.find((c) => t >= c.t0 && t < c.t1);
}

/** Everything `renderAt(t0)` depends on that isn't already in the scene's own sliced cues —
 * i.e. state carried in from earlier timeline activity: the frame still visible from a previous
 * step, a cursor/camera move that started earlier and is still animating in, or a highlight
 * opened by a previous step and not yet closed. `sliceTimelineForScene` includes this in each
 * scene's hash so the hash covers exactly what the player reads when it enters the scene. */
export interface SceneEntryState {
  frame: { src: string; transition: string };
  camera: CameraFrame;
  cursor: Point;
  highlight: { t0: number; t1: number; box: TimelineHighlight["box"] } | null;
  caption: string | null;
  chip: string | null;
}

export function stateAt(tl: Timeline, t: number): SceneEntryState {
  const f = frameAt(tl, t);
  const hi = highlightAt(tl, t);
  const cap = captionAt(tl, t);
  const chip = chipAt(tl, t);
  return {
    frame: { src: f.src, transition: f.transition },
    camera: cameraAt(tl, t),
    cursor: cursorAt(tl, t),
    highlight: hi ? { t0: hi.t0, t1: hi.t1, box: hi.box } : null,
    caption: cap?.text ?? null,
    chip: chip ? `${chip.num}|${chip.eyebrow}|${chip.title}` : null,
  };
}
