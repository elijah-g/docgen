// Builds the real TallyUp page from its actual capture output. Skips (rather than fails) when
// the fixture isn't present — this repo never commits build output, see AGENTS.md.
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { loadWalkthroughFile } from "../../src/walkthrough/index.js";
import { buildPage } from "../../src/pages/build.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const WALKTHROUGH_FILE = path.resolve(here, "../../../../examples/tallyup/walkthroughs/add-competitor-and-entry.yaml");
const CAPTURE_DIR = path.resolve(
  here,
  "../../../../examples/tallyup/.build/add-competitor-and-entry/capture",
);

const fixturePresent = existsSync(path.join(CAPTURE_DIR, "manifest.json")) && existsSync(WALKTHROUGH_FILE);

describe.skipIf(!fixturePresent)("buildPage: real TallyUp capture", () => {
  let outDir: string;

  afterAll(async () => {
    if (outDir) await rm(outDir, { recursive: true, force: true });
  });

  it(
    "builds a publishable page with one annotated screenshot per step",
    async () => {
      outDir = await mkdtemp(path.join(os.tmpdir(), "docgen-pages-tallyup-"));
      const wf = loadWalkthroughFile(WALKTHROUGH_FILE);

      const result = await buildPage(wf, CAPTURE_DIR, outDir);

      expect(result.passed).toBe(true);
      expect(result.publishable).toBe(true);
      expect(result.problems).toHaveLength(0);
      expect(result.screenshots.length).toBe(wf.steps.length);
      for (const s of result.screenshots) expect(existsSync(s)).toBe(true);

      const content = readFileSync(result.indexFile, "utf8");
      expect(content).toContain(wf.title);
      expect(content).toContain("Part 1:");
      expect(content).toContain("Part 2:");
      expect(content).toContain(`#### ${wf.steps.length}.`);
      expect(content).toContain("Good to know");
      console.log(`[pages integration] ${result.screenshots.length} screenshots -> ${result.indexFile}`);
    },
    120_000,
  );
});
