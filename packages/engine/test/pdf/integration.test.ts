// Real PDF render against the TallyUp example fixture (examples/tallyup/help/pages/...): proves
// the one-page quick-reference card constraint, that a non-publishable page is excluded, and
// that an unchanged second build skips rendering — using Playwright Chromium for real, not a
// stand-in. Skips (rather than fails) when the fixture isn't present. Multi-second Chromium
// launches — opt in with DOCGEN_TEST_SLOW=1 (see `npm run test:slow`), same as render's own
// integration test.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import type { Browser } from "playwright";
import { loadWalkthroughFile } from "../../src/walkthrough/index.js";
import type { BuildPageResult } from "../../src/pages/index.js";
import { buildManualPdf, buildWalkthroughPdf, launchBrowser, pageCount } from "../../src/pdf/build.js";
import { pdfInputFromPage } from "../../src/pdf/input.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE_ROOT = path.resolve(here, "../../../../examples/tallyup");
const WALKTHROUGH_ID = "add-competitor-and-entry";
const WALKTHROUGH_FILE = path.join(EXAMPLE_ROOT, "walkthroughs", `${WALKTHROUGH_ID}.yaml`);
const PAGE_DIR = path.join(EXAMPLE_ROOT, "help/pages", WALKTHROUGH_ID);

const fixturePresent = existsSync(WALKTHROUGH_FILE) && existsSync(path.join(PAGE_DIR, "index.plain.md"));
const SLOW = process.env.DOCGEN_TEST_SLOW === "1";

function fakePage(overrides: Partial<BuildPageResult> = {}): BuildPageResult {
  const screenshotsDir = path.join(PAGE_DIR, "screenshots");
  const screenshots = existsSync(screenshotsDir)
    ? readdirSync(screenshotsDir).map((f) => path.join(screenshotsDir, f))
    : [];
  return {
    id: WALKTHROUGH_ID,
    outDir: PAGE_DIR,
    indexFile: path.join(PAGE_DIR, "index.mdx"),
    plainFile: path.join(PAGE_DIR, "index.plain.md"),
    screenshotsDir,
    screenshots,
    passed: true,
    publishable: true,
    lastChecked: "2026-10-22T17:58:08.151Z",
    problems: [],
    suggestions: [],
    ...overrides,
  };
}

describe.skipIf(!fixturePresent || !SLOW)("pdf: TallyUp fixture (real Chromium)", () => {
  let browser: Browser;
  const dirs: string[] = [];

  afterAll(async () => {
    if (browser) await browser.close();
    while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
  });

  async function freshPdfDir(prefix: string): Promise<string> {
    const d = await mkdtemp(path.join(os.tmpdir(), prefix));
    dirs.push(d);
    return d;
  }

  it("renders a page PDF and a one-page quick-reference card", async () => {
    browser = await launchBrowser();
    const pdfDir = await freshPdfDir("docgen-pdf-tallyup-");

    const wf = loadWalkthroughFile(WALKTHROUGH_FILE);
    const input = pdfInputFromPage(wf, fakePage());
    expect(input.cardSteps.length).toBe(wf.steps.length);

    const result = await buildWalkthroughPdf(input, { pdfDir, paper: "A4" }, browser);
    expect(result.excluded).toBe(false);
    expect(result.skipped).toBe(false);
    expect(existsSync(result.file)).toBe(true);
    expect(existsSync(result.cardFile)).toBe(true);

    const pagePdfBytes = readFileSync(result.file);
    expect(await pageCount(pagePdfBytes)).toBeGreaterThan(0);

    // The one-page constraint: however many steps/screenshots the fixture has, the card must
    // render to exactly one PDF page (docs/scope.md "Printable guides").
    const cardBytes = readFileSync(result.cardFile);
    expect(await pageCount(cardBytes)).toBe(1);
  }, 120_000);

  it("excludes a page that isn't publishable", async () => {
    browser = browser ?? (await launchBrowser());
    const pdfDir = await freshPdfDir("docgen-pdf-tallyup-excluded-");
    const wf = loadWalkthroughFile(WALKTHROUGH_FILE);
    const input = pdfInputFromPage(wf, fakePage({ passed: false, publishable: false }));
    const result = await buildWalkthroughPdf(input, { pdfDir, paper: "A4" }, browser);
    expect(result.excluded).toBe(true);
  }, 60_000);

  it("skips an unchanged second build", async () => {
    browser = browser ?? (await launchBrowser());
    const pdfDir = await freshPdfDir("docgen-pdf-tallyup-cache-");
    const wf = loadWalkthroughFile(WALKTHROUGH_FILE);
    const input = pdfInputFromPage(wf, fakePage());

    const first = await buildWalkthroughPdf(input, { pdfDir, paper: "A4" }, browser);
    expect(first.skipped).toBe(false);

    const second = await buildWalkthroughPdf(input, { pdfDir, paper: "A4" }, browser);
    expect(second.skipped).toBe(true);
  }, 120_000);

  it("builds manual.pdf covering the fixture walkthrough, with a cover + TOC page before it", async () => {
    browser = browser ?? (await launchBrowser());
    const pdfDir = await freshPdfDir("docgen-pdf-tallyup-manual-");
    const wf = loadWalkthroughFile(WALKTHROUGH_FILE);
    const input = pdfInputFromPage(wf, fakePage());

    const result = await buildManualPdf([input], { pdfDir, paper: "A4" }, browser);
    expect(result.included).toEqual([WALKTHROUGH_ID]);
    expect(existsSync(result.file)).toBe(true);
    const bytes = readFileSync(result.file);
    const own = await buildWalkthroughPdf(input, { pdfDir: path.join(pdfDir, "solo") }, browser);
    const ownBytes = readFileSync(own.file);
    expect(await pageCount(bytes)).toBeGreaterThan(await pageCount(ownBytes));
  }, 120_000);
});
