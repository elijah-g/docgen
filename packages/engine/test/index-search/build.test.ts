import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildSearchIndex } from "../../src/index-search/build.js";

const createdDirs: string[] = [];

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "docgen-search-index-test-"));
  createdDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (createdDirs.length > 0) {
    rmSync(createdDirs.pop()!, { recursive: true, force: true });
  }
});

describe("buildSearchIndex", () => {
  it("builds one entry per lead paragraph/heading, with urls derived from the file tree", () => {
    const dir = tmpDir();
    mkdirSync(join(dir, "how-do-i", "add-competitor"), { recursive: true });
    writeFileSync(
      join(dir, "how-do-i", "add-competitor", "index.md"),
      [
        "---",
        'title: "Add a competitor"',
        "passed: true",
        "---",
        "",
        "Here's how to add a new competitor to a show.",
        "",
        "## Open the competitors page",
        "",
        'Select **Competitors** from the sidebar, then <!-- docgen:begin step-1 -->click Add<!-- docgen:end step-1 -->.',
        "",
        "## Fill in their details",
        "",
        "Type their first and last name.",
      ].join("\n"),
    );

    const result = buildSearchIndex(dir);

    expect(result.pageCount).toBe(1);
    expect(result.entries.length).toBe(3);
    expect(result.entries[0]).toMatchObject({ url: "/how-do-i/add-competitor", title: "Add a competitor" });
    expect(result.entries[0].heading).toBeUndefined();
    expect(result.entries[0].text).toContain("add a new competitor");
    expect(result.entries.map((e) => e.heading)).toEqual([undefined, "Open the competitors page", "Fill in their details"]);
    // docgen marker comments never leak into indexed text.
    expect(result.entries.some((e) => e.text.includes("docgen:"))).toBe(false);
  });

  it("strips MDX-comment-style docgen markers ({/* docgen:begin k */}), not just the HTML-comment form (bug: MDX markers leaked into search snippets)", () => {
    const dir = tmpDir();
    mkdirSync(join(dir, "add-competitor"), { recursive: true });
    writeFileSync(
      join(dir, "add-competitor", "index.mdx"),
      [
        "---",
        'title: "Add a competitor"',
        "passed: true",
        "---",
        "",
        "Here's how to add a new competitor to a show.",
        "",
        "## Open the competitors page",
        "",
        "Select Competitors from the sidebar, then {/* docgen:begin step-1 */}click Add{/* docgen:end step-1 */}.",
      ].join("\n"),
    );

    const result = buildSearchIndex(dir);

    expect(result.entries.some((e) => e.text.includes("docgen:"))).toBe(false);
    expect(result.entries.some((e) => e.text.includes("click Add"))).toBe(true);
  });

  it("skips pages marked passed: false", () => {
    const dir = tmpDir();
    writeFileSync(join(dir, "broken.md"), '---\ntitle: "Broken"\npassed: false\n---\n\nShould not appear.\n');

    const result = buildSearchIndex(dir);
    expect(result.pageCount).toBe(0);
    expect(result.entries).toEqual([]);
  });

  it("maps content/docs/index.mdx to the root url and writes outFile when given", () => {
    const dir = tmpDir();
    writeFileSync(join(dir, "index.mdx"), '---\ntitle: "Welcome"\n---\n\nStart here.\n');
    const outFile = join(tmpDir(), "search-index.json");

    const result = buildSearchIndex(dir, outFile);

    expect(result.entries[0].url).toBe("/");
    expect(result.outFile).toBe(outFile);
    const written = JSON.parse(readFileSync(outFile, "utf8"));
    expect(written).toEqual(result.entries);
  });

  it("returns an empty result for a missing content directory", () => {
    const result = buildSearchIndex(join(tmpdir(), "does-not-exist-" + Date.now()));
    expect(result).toEqual({ entries: [], pageCount: 0 });
  });
});
