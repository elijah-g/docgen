// Renders self-contained print HTML (html.ts) to PDF bytes with Playwright Chromium's
// `page.pdf()`. No running Next server is involved — `page.goto("about:blank")` then
// `page.setContent()` would refuse to load `file://` images (same issue pages/annotate.ts
// hit), so this writes the HTML to a temp file and navigates to it, exactly like annotate.ts.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import os from "node:os";
import path from "node:path";
import type { Browser } from "playwright";

export interface RenderPdfOptions {
  paper: "A4" | "Letter";
  /** When set, adds a header/footer with the title, "Last checked <date>" and page numbers
   * (docs/scope.md "Printable guides"). Omitted for the one-page quick-reference card. */
  footer?: { title: string; lastChecked?: string };
}

export async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright");
  return chromium.launch();
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function footerTemplate(title: string, lastChecked?: string): string {
  const checked = lastChecked ? `Last checked ${lastChecked.slice(0, 10)} · ` : "";
  return `<div style="font-size:8px; width:100%; text-align:center; color:#64748b; font-family:-apple-system,Helvetica,Arial,sans-serif; padding-top:2px;">
    ${escapeHtmlAttr(title)} · ${checked}Page <span class="pageNumber"></span> of <span class="totalPages"></span>
  </div>`;
}

/** Renders `html` to a PDF file via `browser`, returning the byte size written. Caller owns
 * the browser's lifecycle (reused across many renders — one Chromium launch per build run). */
export async function renderHtmlToPdf(browser: Browser, html: string, outFile: string, opts: RenderPdfOptions): Promise<number> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "docgen-pdf-"));
  const tmpHtml = path.join(tmpDir, "page.html");
  await writeFile(tmpHtml, html);
  const page = await browser.newPage();
  try {
    await page.goto(`file://${tmpHtml}`, { waitUntil: "load" });
    // Wait for every image (screenshots, logo) to finish loading before printing, or Chromium
    // can rasterize a blank/broken image into the PDF.
    await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete));
    mkdirSync(dirname(outFile), { recursive: true });
    const bytes = await page.pdf({
      path: outFile,
      format: opts.paper,
      printBackground: true,
      displayHeaderFooter: Boolean(opts.footer),
      headerTemplate: "<span></span>",
      footerTemplate: opts.footer ? footerTemplate(opts.footer.title, opts.footer.lastChecked) : "<span></span>",
      margin: opts.footer
        ? { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" }
        : { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
    });
    return bytes.length;
  } finally {
    await page.close();
    await rm(tmpDir, { recursive: true, force: true });
  }
}

/** Measures the rendered page count of `html` without keeping the bytes — used by the card
 * renderer's shrink/truncate loop to find a setting that fits on one page. */
export async function renderHtmlToPdfBytes(browser: Browser, html: string, opts: RenderPdfOptions): Promise<Buffer> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "docgen-pdf-"));
  const tmpHtml = path.join(tmpDir, "page.html");
  await writeFile(tmpHtml, html);
  const page = await browser.newPage();
  try {
    await page.goto(`file://${tmpHtml}`, { waitUntil: "load" });
    await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete));
    const bytes = await page.pdf({
      format: opts.paper,
      printBackground: true,
      displayHeaderFooter: Boolean(opts.footer),
      headerTemplate: "<span></span>",
      footerTemplate: opts.footer ? footerTemplate(opts.footer.title, opts.footer.lastChecked) : "<span></span>",
      margin: opts.footer
        ? { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" }
        : { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
    });
    return bytes;
  } finally {
    await page.close();
    await rm(tmpDir, { recursive: true, force: true });
  }
}

export function writePdfBytes(outFile: string, bytes: Buffer): void {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, bytes);
}
