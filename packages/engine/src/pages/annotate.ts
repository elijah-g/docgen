// Draws numbered highlight callouts onto a captured frame for the printed/site guide. Port of
// reference/tallyup/pipeline/docs.mjs's `annotate()`, moved off sharp + inline SVG onto
// Playwright (already a dependency for capture/render) so pages needs no new native deps: an
// HTML page positions the frame image and CSS-drawn callout(s) over it, then a Chromium
// screenshot rasterises the result.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Box } from "../capture/types.js";

export interface AnnotateOptions {
  /** Output width in px; height follows the frame's own aspect ratio. Default 1280. */
  width?: number;
}

const DEFAULT_WIDTH = 1280;
const PAD = 8;
const CALLOUT_COLOR = "#2563eb";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function overlayHtml(box: Box, scale: number, stepNumber: number): string {
  const x = (box.x - PAD) * scale;
  const y = (box.y - PAD) * scale;
  const w = (box.w + PAD * 2) * scale;
  const h = (box.h + PAD * 2) * scale;
  const badgeSize = 28;
  return `
    <div style="position:absolute; left:${x}px; top:${y}px; width:${w}px; height:${h}px;
      border-radius:10px; border:4px solid ${CALLOUT_COLOR};
      box-shadow:0 0 0 9999px rgba(15,23,42,0.32); pointer-events:none;"></div>
    <div style="position:absolute; left:${x - badgeSize / 2}px; top:${y - badgeSize / 2}px;
      width:${badgeSize}px; height:${badgeSize}px; border-radius:50%; background:${CALLOUT_COLOR};
      color:#fff; font:700 15px/1 -apple-system,Helvetica,Arial,sans-serif; display:flex;
      align-items:center; justify-content:center; box-shadow:0 1px 4px rgba(0,0,0,0.4);">${stepNumber}</div>`;
}

/**
 * Renders one annotated screenshot: `framePath` (the captured frame) resized to `opts.width`,
 * with a numbered callout drawn over each box in `highlights`. When `highlights` is empty, the
 * step's number is still stamped in the corner so readers can match image to step.
 */
export async function annotateFrame(
  page: import("playwright").Page,
  framePath: string,
  frameSize: { width: number; height: number },
  highlights: Box[],
  stepNumber: number,
  outPath: string,
  opts: AnnotateOptions = {},
): Promise<void> {
  const width = opts.width ?? DEFAULT_WIDTH;
  const scale = width / frameSize.width;
  const height = Math.round(frameSize.height * scale);

  const overlays = highlights.length > 0
    ? highlights.map((b) => overlayHtml(b, scale, stepNumber)).join("\n")
    : `<div style="position:absolute; left:12px; top:12px; width:28px; height:28px; border-radius:50%;
        background:${CALLOUT_COLOR}; color:#fff; font:700 15px/1 -apple-system,Helvetica,Arial,sans-serif;
        display:flex; align-items:center; justify-content:center; box-shadow:0 1px 4px rgba(0,0,0,0.4);">${stepNumber}</div>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"></head>
    <body style="margin:0; width:${width}px; height:${height}px; position:relative; overflow:hidden;">
      <img src="file://${encodeURI(framePath)}" width="${width}" height="${height}"
        style="display:block; width:${width}px; height:${height}px;" alt="${escapeHtml(String(stepNumber))}" />
      ${overlays}
    </body></html>`;

  // page.setContent() leaves the document at the "about:blank" origin, from which Chromium
  // refuses to load file:// images — so write the markup to a real file:// page instead (same
  // trick render/bundle.ts uses for the player bundle) and navigate there.
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "docgen-annotate-"));
  const tmpHtml = path.join(tmpDir, `annotate-${stepNumber}.html`);
  await writeFile(tmpHtml, html);
  try {
    await page.setViewportSize({ width, height });
    await page.goto(`file://${tmpHtml}`, { waitUntil: "load" });
    await page.waitForFunction(() => {
      const img = document.querySelector("img");
      return Boolean(img && (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0);
    });
    await mkdir(path.dirname(outPath), { recursive: true });
    await page.screenshot({ path: outPath });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
