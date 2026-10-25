// Builds a `PdfPageInput` from a walkthrough + its already-built page (pages/build.ts's
// `BuildPageResult`) — the one place the pdf module reaches into pages' output shape, kept
// small and isolated so pages/pdf can keep evolving independently.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Walkthrough } from "../walkthrough/index.js";
import type { BuildPageResult } from "../pages/index.js";
import type { ResolvedConfig } from "../config/index.js";
import { cardStepsFor } from "./html.js";
import type { PdfBrand, PdfPageInput } from "./types.js";

/** `config.brand` -> `PdfBrand`, with `logo` resolved to an absolute path (same source the
 * help app's theme reads — config.brand — so a PDF and the site always match). */
export function resolvePdfBrand(config: ResolvedConfig): PdfBrand | undefined {
  if (!config.brand) return undefined;
  return {
    primaryColor: config.brand.primaryColor,
    font: config.brand.font,
    logoPath: config.brand.logo ? path.resolve(config.configDir, config.brand.logo) : undefined,
  };
}

/** `index.plain.md` starts with the page's own YAML frontmatter fence (pages/content.ts
 * `buildFrontmatterBlock`) — useful as llms.txt's raw source, but not something a reader should
 * see rendered as prose in a PDF. Strips it; the PDF gets its own title/footer from `wf`/
 * `BuildPageResult` instead. */
function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

export function pdfInputFromPage(wf: Walkthrough, page: BuildPageResult): PdfPageInput {
  const markdown = stripFrontmatter(readFileSync(page.plainFile, "utf8"));
  const screenshotByStep = new Map<number, string>();
  for (const file of page.screenshots) {
    const m = /step-(\d+)\.png$/.exec(file);
    if (m) screenshotByStep.set(Number(m[1]), file);
  }
  return {
    id: wf.walkthrough,
    title: wf.title,
    summary: wf.summary,
    for: wf.for,
    markdown,
    baseDir: page.outDir,
    lastChecked: page.lastChecked,
    passed: page.passed,
    publishable: page.publishable,
    cardSteps: cardStepsFor(wf, (n) => screenshotByStep.get(n)),
  };
}

/**
 * Site-root-absolute URLs for a walkthrough's PDFs, for its page frontmatter's `pdf`/`pdfCard`
 * keys. Root-absolute (not relative to the page's own directory) because `stagePdfsToHelpApp`
 * (build/pipeline.ts) always copies `<outDir>/pdf/*` into `<helpApp>/public/pdf/`, and Next.js
 * serves everything under `public/` from the site root regardless of which page links to it.
 */
export function pdfPublicLinks(id: string): { pdf: string; pdfCard: string } {
  return { pdf: `/pdf/${id}.pdf`, pdfCard: `/pdf/${id}.card.pdf` };
}
