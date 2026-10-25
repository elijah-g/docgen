// Orchestrates one walkthrough's PDFs (`<id>.pdf`, `<id>.card.pdf`) and the combined
// `manual.pdf`, from already-built page input (pages/build.ts's output — this module never
// touches the walkthrough loader or capture manifests itself). See docs/scope.md "Printable
// guides" and build-plan.md M12.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Browser } from "playwright";
import { PDFDocument } from "pdf-lib";
import { checkPersonalData, checkSecrets } from "../qa/index.js";
import { buildCardHtml, buildCoverHtml, buildPageHtml, buildTocHtml, type TocEntry } from "./html.js";
import { launchBrowser, renderHtmlToPdf, renderHtmlToPdfBytes, writePdfBytes } from "./render.js";
import { pdfInputHash, matchesCache, writeCacheSidecar, deletePdfOutput } from "./cache.js";
import { makeThumbnails } from "./thumbnail.js";
import type { BuildPdfOptions, ManualBuildResult, PdfBrand, PdfBuildResult, PdfPageInput } from "./types.js";

export { launchBrowser };
export type { BuildPdfOptions, ManualBuildResult, PdfBrand, PdfBuildResult, PdfPageInput } from "./types.js";

/** QA gate (ground rule 3 / docs/scope.md "Safe by default"): scans the HTML a PDF is about to
 * be rendered from — not just the source Markdown — so anything the HTML step adds (brand logo
 * alt text, footer text) is covered too. Returns problems found; empty means clear to render. */
function qaScanHtml(html: string): string[] {
  const pii = checkPersonalData(html);
  const secrets = checkSecrets(html);
  return [...pii.problems, ...secrets.problems];
}

function pdfFile(pdfDir: string, id: string): string {
  return path.join(pdfDir, `${id}.pdf`);
}
function cardFile(pdfDir: string, id: string): string {
  return path.join(pdfDir, `${id}.card.pdf`);
}

/** The `<id>.pdf`/`<id>.card.pdf` paths for a walkthrough, for callers (pipeline.ts) that need
 * to remove a stale PDF outside of `buildWalkthroughPdf` itself — e.g. a page whose QA check
 * fails *after* its PDF was already rendered this run (review finding index-stage.ts:152). */
export function pdfOutputPaths(pdfDir: string, id: string): { file: string; card: string } {
  return { file: pdfFile(pdfDir, id), card: cardFile(pdfDir, id) };
}

/** Builds (or skips, if the cache matches) one walkthrough's `<id>.pdf` and `<id>.card.pdf`.
 * Never renders a page whose capture didn't pass (docs/scope.md: "Never include pages with
 * passed:false") — `excluded: true`, and any PDF/card left over from an earlier, passing build
 * is deleted so `stagePdfsToHelpApp`/`buildManualPdf` can never pick up stale output for a page
 * that's no longer publishable (review finding pdf/build.ts:45). The same cleanup runs if this
 * run's HTML fails the QA scan below — a QA failure must leave nothing published, not just skip
 * writing something new. */
export async function buildWalkthroughPdf(
  input: PdfPageInput,
  opts: BuildPdfOptions,
  browser: Browser,
): Promise<PdfBuildResult & { qaProblems?: string[] }> {
  const file = pdfFile(opts.pdfDir, input.id);
  const card = cardFile(opts.pdfDir, input.id);

  if (!input.publishable || !input.passed) {
    deletePdfOutput(file);
    deletePdfOutput(card);
    return { id: input.id, file, cardFile: card, skipped: false, excluded: true };
  }

  const paper = opts.paper ?? "A4";
  const hash = pdfInputHash({
    markdown: input.markdown,
    screenshots: input.cardSteps.map((s) => s.screenshot).filter((s): s is string => Boolean(s)),
    paper,
    brand: opts.brand,
    lastChecked: input.lastChecked,
  });

  if (!opts.force && matchesCache([file, card], hash)) {
    return { id: input.id, file, cardFile: card, skipped: true, excluded: false };
  }

  const pageHtml = buildPageHtml(input, opts.brand, opts.allowRemoteImages);
  const thumbnails = await makeThumbnails(browser, input.cardSteps.map((s) => s.screenshot));
  const cardSteps = input.cardSteps.map((s) => ({
    ...s,
    thumbnailSrc: s.screenshot ? thumbnails.get(s.screenshot) : undefined,
  }));
  const cardHtml = await fitCardHtml(browser, { ...input, cardSteps }, opts.brand, paper);

  const problems = [...qaScanHtml(pageHtml), ...qaScanHtml(cardHtml)];
  if (problems.length > 0) {
    deletePdfOutput(file);
    deletePdfOutput(card);
    throw new Error(`pdf qa scan found ${problems.length} problem(s) for "${input.id}": ${problems.slice(0, 3).join("; ")}`);
  }

  const bytes = await renderHtmlToPdf(browser, pageHtml, file, { paper, footer: { title: input.title, lastChecked: input.lastChecked } });
  const cardBytes = await renderHtmlToPdf(browser, cardHtml, card, { paper });

  writeCacheSidecar(file, hash);
  writeCacheSidecar(card, hash);

  return { id: input.id, file, cardFile: card, skipped: false, excluded: false, bytes, cardBytes };
}

/** Finds a card-HTML rendering that fits on one PDF page: full text + thumbnails, then no
 * thumbnails, then progressively smaller font down to a floor, then truncated with "See full
 * guide" (docs/scope.md: "must fit one page (shrink text down to a floor, then truncate...)"). */
async function fitCardHtml(browser: Browser, input: PdfPageInput, brand: PdfBrand | undefined, paper: "A4" | "Letter"): Promise<string> {
  const attempts: Array<{ minFontPt: number; withThumbnails: boolean; truncateAt?: number }> = [
    { minFontPt: 10, withThumbnails: true },
    { minFontPt: 10, withThumbnails: false },
    { minFontPt: 9, withThumbnails: false },
    { minFontPt: 8, withThumbnails: false },
    { minFontPt: 7.5, withThumbnails: false },
  ];
  for (const attempt of attempts) {
    const html = buildCardHtml(input.title, input.cardSteps, brand, attempt);
    const bytes = await renderHtmlToPdfBytes(browser, html, { paper });
    if (await pageCount(bytes) <= 1) return html;
  }
  // Still doesn't fit at the font floor: truncate the step list and append "See full guide",
  // shrinking the truncation point until it fits.
  for (let n = input.cardSteps.length - 1; n >= 1; n--) {
    const html = buildCardHtml(input.title, input.cardSteps, brand, { minFontPt: 7.5, withThumbnails: false, truncateAt: n });
    const bytes = await renderHtmlToPdfBytes(browser, html, { paper });
    if (await pageCount(bytes) <= 1) return html;
  }
  // Degenerate case (even one step's title alone doesn't fit — shouldn't happen in practice):
  // render just the title and a "See full guide" note.
  return buildCardHtml(input.title, [], brand, { minFontPt: 7.5, withThumbnails: false, truncateAt: 0 });
}

export async function pageCount(bytes: Buffer): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

/** Builds `manual.pdf`: cover, table of contents (by reader), then every publishable
 * walkthrough's own page PDF, merged in order. Reuses each walkthrough's already-rendered
 * `<id>.pdf` when present (from `buildWalkthroughPdf`) rather than re-rendering. */
export async function buildManualPdf(
  inputs: PdfPageInput[],
  opts: BuildPdfOptions,
  browser: Browser,
): Promise<ManualBuildResult> {
  const paper = opts.paper ?? "A4";
  const file = path.join(opts.pdfDir, "manual.pdf");
  const included = inputs.filter((i) => i.publishable && i.passed);

  const hash = pdfInputHash({
    markdown: included.map((i) => `${i.id}\n${i.markdown}`).join("\n---\n"),
    screenshots: [],
    paper,
    brand: opts.brand,
    extra: included.map((i) => i.lastChecked),
  });
  if (!opts.force && matchesCache([file], hash)) {
    return { file, skipped: true, included: included.map((i) => i.id) };
  }

  if (included.length === 0) {
    const manual = await PDFDocument.create();
    writeFileSync(file, Buffer.from(await manual.save()));
    writeCacheSidecar(file, hash);
    return { file, skipped: false, pageCount: 0, included: [] };
  }

  // Render (or reuse) each walkthrough's own page PDF first, so page numbers for the TOC are
  // known exactly before the TOC page itself is rendered. Reuse is only valid when the existing
  // `<id>.pdf`'s cache sidecar matches this exact input's hash — otherwise it's stale (built from
  // an older markdown/screenshot/brand) and must be re-rendered rather than silently included in
  // the manual (review finding pdf/build.ts:147: "reuses any existing <id>.pdf without checking
  // it's current").
  const perWalkthrough: Buffer[] = [];
  for (const input of included) {
    const own = pdfFile(opts.pdfDir, input.id);
    const ownHash = pdfInputHash({
      markdown: input.markdown,
      screenshots: input.cardSteps.map((s) => s.screenshot).filter((s): s is string => Boolean(s)),
      paper,
      brand: opts.brand,
      lastChecked: input.lastChecked,
    });
    if (existsSync(own) && matchesCache([own], ownHash)) {
      perWalkthrough.push(readFileSync(own));
    } else {
      const html = buildPageHtml(input, opts.brand, opts.allowRemoteImages);
      const problems = qaScanHtml(html);
      if (problems.length > 0) {
        throw new Error(`pdf qa scan found ${problems.length} problem(s) for "${input.id}": ${problems.slice(0, 3).join("; ")}`);
      }
      perWalkthrough.push(await renderHtmlToPdfBytes(browser, html, { paper, footer: { title: input.title, lastChecked: input.lastChecked } }));
    }
  }

  const coverHtml = buildCoverHtml("Help manual", new Date().toISOString().slice(0, 10), opts.brand);
  const coverBytes = await renderHtmlToPdfBytes(browser, coverHtml, { paper });
  const coverPages = await pageCount(coverBytes);

  // First pass: build TOC without page numbers to learn its own page count, then a second pass
  // with real numbers (cover + toc + cumulative walkthrough page counts).
  const draftToc = buildTocHtml(included.map((i) => ({ title: i.title, reader: i.for ?? "General" })), opts.brand);
  const draftTocBytes = await renderHtmlToPdfBytes(browser, draftToc, { paper });
  const tocPages = await pageCount(draftTocBytes);

  let cursor = coverPages + tocPages + 1;
  const entries: TocEntry[] = [];
  for (let i = 0; i < included.length; i++) {
    entries.push({ title: included[i].title, reader: included[i].for ?? "General", page: cursor });
    cursor += await pageCount(perWalkthrough[i]);
  }
  const tocHtml = buildTocHtml(entries, opts.brand);
  const tocBytes = await renderHtmlToPdfBytes(browser, tocHtml, { paper });

  const manual = await PDFDocument.create();
  for (const bytes of [coverBytes, tocBytes, ...perWalkthrough]) {
    const src = await PDFDocument.load(bytes);
    const pages = await manual.copyPages(src, src.getPageIndices());
    for (const p of pages) manual.addPage(p);
  }
  const finalBytes = Buffer.from(await manual.save());
  writePdfBytes(file, finalBytes);
  writeCacheSidecar(file, hash);

  return { file, skipped: false, pageCount: manual.getPageCount(), included: included.map((i) => i.id) };
}
