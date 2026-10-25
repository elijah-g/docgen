// Builds the self-contained print HTML document(s) the pdf module renders with Playwright
// Chromium's `page.pdf()` — no running Next server needed (AGENTS.md "hosts only run `next
// build`"). Shares brand colours/logo with the help app's theme (config.brand).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Walkthrough } from "../walkthrough/index.js";
import { escapeHtml, markdownToHtml } from "./markdown.js";
import type { CardStepInput, PdfBrand, PdfPageInput } from "./types.js";

/** `#4338ca`, `rgb(...)`, or a bare HSL triplet (`235 55% 42%`, as `extractBrand`/config.brand.
 * primaryColor write it) normalised into a CSS colour value page.pdf()'s templates can use. */
export function brandColor(brand?: PdfBrand): string {
  const raw = brand?.primaryColor?.trim();
  if (!raw) return "#2563eb";
  if (/^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/.test(raw)) return `hsl(${raw})`;
  return raw;
}

/** A logo file inlined as a data: URL (so header/footer templates — which Chromium renders in
 * an isolated, file://-less context — and the body both work without a running server). */
export function logoDataUrl(brand?: PdfBrand): string | undefined {
  if (!brand?.logoPath || !existsSync(brand.logoPath)) return undefined;
  const ext = path.extname(brand.logoPath).slice(1).toLowerCase();
  const mime = ext === "svg" ? "image/svg+xml" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
  const data = readFileSync(brand.logoPath).toString("base64");
  return `data:${mime};base64,${data}`;
}

const BASE_STYLE = (accent: string, font?: string): string => `
  * { box-sizing: border-box; }
  body {
    font-family: ${font ? `"${font}", ` : ""}-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #0f172a;
    margin: 0;
    font-size: 11pt;
    line-height: 1.5;
  }
  h1 { font-size: 20pt; margin: 0 0 6pt; color: ${accent}; }
  h2 { font-size: 15pt; margin: 18pt 0 6pt; color: ${accent}; page-break-after: avoid; }
  h3 { font-size: 13pt; margin: 14pt 0 4pt; page-break-after: avoid; }
  h4 { font-size: 12pt; margin: 12pt 0 3pt; page-break-after: avoid; }
  p { margin: 0 0 8pt; }
  ul { margin: 0 0 8pt; padding-left: 18pt; }
  blockquote { margin: 0 0 8pt; padding: 6pt 10pt; border-left: 3pt solid ${accent}; background: #f8fafc; }
  code { background: #f1f5f9; padding: 1pt 3pt; border-radius: 3pt; font-size: 10pt; }
  hr { border: none; border-top: 1pt solid #e2e8f0; margin: 12pt 0; }
  a { color: ${accent}; text-decoration: none; }
  img { max-width: 100%; display: block; margin: 6pt 0 10pt; border: 1pt solid #e2e8f0; border-radius: 4pt; }
  .step { page-break-inside: avoid; }
  .cover { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; }
  .cover img.logo { max-height: 72pt; margin-bottom: 18pt; }
  .cover h1 { font-size: 28pt; }
  .toc-section { margin-bottom: 10pt; }
  .toc-section h2 { font-size: 13pt; margin: 10pt 0 4pt; }
  .toc-row { display: flex; justify-content: space-between; border-bottom: 1pt dotted #cbd5e1; padding: 3pt 0; }
`;

/** Content-Security-Policy for every print document: this HTML is loaded by Chromium straight
 * off `file://` with no server/sandbox in front of it, so an injected (or malformed-escape)
 * `<iframe>`/`<script>`/remote `<img>` would otherwise be free to load local files or reach the
 * network from inside a rendered PDF (review finding pdf/html.ts). `img-src`/`style-src` only
 * allow `https:`/`http:` when the caller explicitly opts into remote images. */
function cspMeta(allowRemote?: boolean): string {
  const remote = allowRemote ? " https: http:" : "";
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file: data:${remote}; style-src 'unsafe-inline'${remote}; font-src file: data:; frame-src 'none'; object-src 'none'; script-src 'none'; base-uri 'none';">`;
}

function htmlDoc(title: string, bodyHtml: string, accent: string, font?: string, allowRemote?: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8">${cspMeta(allowRemote)}<title>${escapeHtml(title)}</title>
    <style>${BASE_STYLE(accent, font)}</style></head><body>${bodyHtml}</body></html>`;
}

/** One walkthrough's full page, built from its already-rendered Markdown (pages/build.ts's
 * `index.plain.md` — the generated-block markers already stripped out). `allowRemoteImages`
 * defaults to false — see `resolveImageSrc` in markdown.ts. */
export function buildPageHtml(input: PdfPageInput, brand?: PdfBrand, allowRemoteImages?: boolean): string {
  const accent = brandColor(brand);
  const body = markdownToHtml(input.markdown, input.baseDir, { allowRemote: allowRemoteImages });
  // Wrap each "#### N. Title" step heading + the content up to the next heading/hr in a
  // `.step` div, so Playwright never splits a step from its screenshot across a page break
  // (docs/scope.md "Printable guides": "page breaks that keep a step with its screenshot").
  const wrapped = wrapSteps(body);
  return htmlDoc(input.title, wrapped, accent, brand?.font, allowRemoteImages);
}

/** Groups each `<h4>...` step heading with everything up to (not including) the next `<h2>`,
 * `<h3>` or `<h4>` into a `page-break-inside: avoid` wrapper. */
function wrapSteps(bodyHtml: string): string {
  const parts = bodyHtml.split(/(?=<h4>)/);
  return parts
    .map((part) => (part.startsWith("<h4>") ? `<div class="step">${part}</div>` : part))
    .join("\n");
}

/** The cover page for `manual.pdf`: logo, title, generated date. */
export function buildCoverHtml(title: string, date: string, brand?: PdfBrand): string {
  const accent = brandColor(brand);
  const logo = logoDataUrl(brand);
  const body = `<div class="cover">
    ${logo ? `<img class="logo" src="${logo}" alt="logo" />` : ""}
    <h1>${escapeHtml(title)}</h1>
    <p>Generated ${escapeHtml(date)}</p>
  </div>`;
  return htmlDoc(title, body, accent, brand?.font);
}

export interface TocEntry {
  title: string;
  reader: string;
  /** 1-based page number this walkthrough's own PDF starts on within the manual. Optional —
   * omitted when not yet known (first pass). */
  page?: number;
}

/** Table of contents grouped by reader/section (docs/scope.md "Printable guides": "a full
 * manual as one PDF" with contents "by section/reader"). */
export function buildTocHtml(entries: TocEntry[], brand?: PdfBrand): string {
  const accent = brandColor(brand);
  const groups = new Map<string, TocEntry[]>();
  for (const e of entries) {
    const key = e.reader || "General";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  const sections = [...groups.entries()]
    .map(
      ([reader, items]) => `<div class="toc-section"><h2>${escapeHtml(reader)}</h2>${items
        .map((it) => `<div class="toc-row"><span>${escapeHtml(it.title)}</span>${it.page ? `<span>${it.page}</span>` : ""}</div>`)
        .join("")}</div>`,
    )
    .join("\n");
  const body = `<h1>Contents</h1>${sections}`;
  return htmlDoc("Contents", body, accent, brand?.font);
}

function firstSentence(text: string): string {
  const m = /^(.*?[.!?])(\s|$)/.exec(text.trim());
  return (m ? m[1] : text).trim();
}

/** Short per-step line for the quick-reference card: the step's caption, or the first sentence
 * of its page text (docs/scope.md "Printable guides": "numbered steps as short lines"). */
export function cardStepsFor(wf: Pick<Walkthrough, "steps">, screenshotFor: (stepNumber: number) => string | undefined): CardStepInput[] {
  return wf.steps.map((step, i) => {
    const stepNumber = i + 1;
    const raw = step.caption?.trim() || firstSentence(step.page_text?.trim() ?? "");
    return {
      number: stepNumber,
      title: step.title ?? step.id ?? `Step ${stepNumber}`,
      text: raw,
      screenshot: screenshotFor(stepNumber),
    };
  });
}

export interface CardRenderOptions {
  /** Font-size shrink floor, in points. Default 7.5. */
  minFontPt?: number;
  /** Include small thumbnails when they fit; set false once a shrink pass decides they don't. */
  withThumbnails?: boolean;
  /** Truncate the step list to this many entries, appending "See full guide". Undefined = no truncation. */
  truncateAt?: number;
}

/** Renders the one-page quick-reference card body at a given font size / thumbnail / truncation
 * setting. `render.ts` calls this at progressively smaller settings until the rendered PDF is
 * exactly one page (docs/scope.md: "must fit one page (shrink text down to a floor, then
 * truncate with 'See full guide')"). */
export function buildCardHtml(title: string, steps: CardStepInput[], brand: PdfBrand | undefined, opts: CardRenderOptions): string {
  const accent = brandColor(brand);
  const fontPt = opts.minFontPt ?? 10;
  const shown = opts.truncateAt !== undefined ? steps.slice(0, opts.truncateAt) : steps;
  const truncated = opts.truncateAt !== undefined && steps.length > opts.truncateAt;
  const rows = shown
    .map((s) => {
      // Prefer the pre-downscaled thumbnail (thumbnail.ts) — only fall back to the full-size
      // screenshot file if no thumbnail could be made, so a thumbnail failure degrades to a
      // slightly larger card rather than a missing image.
      const thumbSrc = s.thumbnailSrc ?? (s.screenshot ? `file://${encodeURI(s.screenshot)}` : undefined);
      const thumb = opts.withThumbnails && thumbSrc ? `<img class="thumb" src="${thumbSrc}" alt="" />` : "";
      return `<div class="card-step">${thumb}<div><strong>${s.number}.</strong> ${escapeHtml(s.text || s.title)}</div></div>`;
    })
    .join("\n");
  const seeMore = truncated ? `<p class="see-more">See full guide for every step.</p>` : "";
  const style = `
    body { font-size: ${fontPt}pt; }
    .card-title { font-size: ${fontPt + 6}pt; color: ${accent}; margin-bottom: 4pt; }
    .card-step { display: flex; align-items: flex-start; gap: 6pt; margin-bottom: ${Math.max(fontPt * 0.35, 2)}pt; page-break-inside: avoid; }
    .card-step strong { color: ${accent}; }
    .thumb { width: 48pt; height: auto; margin: 0; border-radius: 2pt; flex-shrink: 0; }
    .see-more { font-style: italic; color: #64748b; }
  `;
  const body = `<style>${style}</style><h1 class="card-title">${escapeHtml(title)}</h1>${rows}${seeMore}`;
  return htmlDoc(title, body, accent, brand?.font);
}
