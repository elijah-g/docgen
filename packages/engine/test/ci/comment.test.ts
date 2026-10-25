import { describe, expect, it } from "vitest";
import { buildCommentMarkdown, COMMENT_MARKER } from "../../src/ci/comment.js";
import type { CiResult } from "../../src/ci/types.js";

const baseResult: CiResult = {
  base: "abc1234abc1234abc1234abc1234abc1234abcd",
  head: "def5678def5678def5678def5678def5678defg",
  affected: ["add-entry", "record-payment", "broken-one", "new-one"],
  all: false,
  results: [
    {
      walkthrough: "add-entry",
      status: "changed",
      changedSteps: [
        { step: "step-01.png", before: "/tmp/out/add-entry/before-step-01.png", after: "/tmp/out/add-entry/after-step-01.png", diff: "/tmp/out/add-entry/diff-step-01.png", changeRatio: 0.042 },
      ],
    },
    { walkthrough: "record-payment", status: "unchanged", changedSteps: [] },
    {
      walkthrough: "broken-one",
      status: "failed",
      changedSteps: [],
      failure: { summary: `step "submit": locator not found`, repairCommand: `claude -p "load the docgen-repair skill and fix 'broken-one'"` },
    },
    { walkthrough: "new-one", status: "new", changedSteps: [] },
  ],
  stalePages: ["deleted-flow"],
  outDir: "/tmp/out",
};

const images = { urlFor: (p: string) => `https://raw.githubusercontent.com/acme/app/${p.split("/").slice(-2).join("/")}` };

describe("ci/comment buildCommentMarkdown", () => {
  it("includes the hidden marker for upsert lookups", () => {
    const md = buildCommentMarkdown(baseResult, images, { prNumber: 42 });
    expect(md.startsWith(COMMENT_MARKER)).toBe(true);
  });

  it("matches the expected markdown shape", () => {
    const md = buildCommentMarkdown(baseResult, images, { prNumber: 42 });
    expect(md).toMatchSnapshot();
  });

  it("shows the repair command for a broken walkthrough and a table for a changed one", () => {
    const md = buildCommentMarkdown(baseResult, images, { prNumber: 42 });
    expect(md).toContain("broken-one");
    expect(md).toContain("load the docgen-repair skill");
    expect(md).toContain("add-entry");
    expect(md).toContain("| step | before | after | diff | change |");
    expect(md).toContain("4.2%");
  });

  it("lists stale pages and the PR number in the footer", () => {
    const md = buildCommentMarkdown(baseResult, images, { prNumber: 42 });
    expect(md).toContain("deleted-flow");
    expect(md).toContain("PR #42");
  });
});
