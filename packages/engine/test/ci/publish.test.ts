// `docgen ci --publish` (build-plan.md M19 "Merge behaviour hook"): re-captures what a push
// affected and republishes it via `runIndexStage`, skipping video. Mocks the capture/pages/index
// stages (each already tested on its own) so this is a fast unit test of the wiring: which
// walkthroughs get published, which get skipped as failed, and that `runIndexStage` is called
// with just the republished pages plus the full walkthrough id list (for pruning).
import { describe, expect, it, vi } from "vitest";
import type { ResolvedConfig } from "../../src/config/types.js";
import type { BuildPageResult } from "../../src/pages/types.js";

function fakeConfig(): ResolvedConfig {
  return {
    app: { baseUrl: "http://localhost:3000" },
    configDir: "/tmp",
    walkthroughsDir: "/tmp/walkthroughs",
    outDir: "/tmp/help",
    buildDir: "/tmp/.build",
    helpApp: "/tmp/help-app",
    viewport: { width: 1440, height: 810 },
    deviceScaleFactor: 1,
  };
}

function page(id: string, publishable: boolean): BuildPageResult {
  return {
    id,
    outDir: `/tmp/.build/ci/pages/${id}`,
    indexFile: `/tmp/.build/ci/pages/${id}/index.mdx`,
    plainFile: `/tmp/.build/ci/pages/${id}/index.plain.md`,
    screenshotsDir: `/tmp/.build/ci/pages/${id}/screenshots`,
    screenshots: [],
    passed: publishable,
    publishable,
    problems: publishable ? [] : ["capture failed"],
    suggestions: [],
  };
}

describe("runCiPublish", () => {
  it("publishes a cosmetic walkthrough and skips a broken one, passing the full id list for pruning", async () => {
    vi.resetModules();
    vi.doMock("../../src/config/index.js", () => ({ loadConfig: vi.fn(async () => fakeConfig()) }));
    vi.doMock("../../src/impact/index.js", () => ({
      computeAffected: vi.fn(async () => ({
        base: "base",
        head: "HEAD",
        changedFiles: [],
        all: false,
        walkthroughs: [
          { id: "add-entry", affected: true, reasons: [] },
          { id: "broken-one", affected: true, reasons: [] },
          { id: "untouched", affected: false, reasons: [] },
        ],
      })),
    }));
    vi.doMock("../../src/impact/walkthroughs.js", () => ({
      listWalkthroughs: vi.fn(() => [
        { id: "add-entry", file: "/tmp/walkthroughs/add-entry.yaml", manifest: undefined },
        { id: "broken-one", file: "/tmp/walkthroughs/broken-one.yaml", manifest: undefined },
        { id: "untouched", file: "/tmp/walkthroughs/untouched.yaml", manifest: undefined },
      ]),
    }));
    vi.doMock("../../src/ci/capture.js", () => ({
      captureWalkthroughForCi: vi.fn(async (file: string) => {
        const ok = !file.includes("broken-one");
        return { walkthrough: { walkthrough: file.includes("broken-one") ? "broken-one" : "add-entry" }, captureDir: "/tmp/.build/ci/capture", ok, failure: ok ? undefined : { error: "boom" } };
      }),
    }));
    vi.doMock("../../src/pages/index.js", () => ({
      buildPage: vi.fn(async (wt: { walkthrough: string }) => page(wt.walkthrough, true)),
    }));
    let indexStageOpts: unknown;
    vi.doMock("../../src/build/index-stage.js", () => ({
      runIndexStage: vi.fn((opts: unknown) => {
        indexStageOpts = opts;
        return { contentDir: "/tmp/help-app/content/docs", searchIndexFile: "x", llmsTxtFile: "y", pageCount: 1, copiedToHelpApp: true };
      }),
    }));

    const { runCiPublish } = await import("../../src/ci/publish.js");
    const result = await runCiPublish({ configPath: "docgen.config.ts", base: "base" });

    expect(result.published).toEqual(["add-entry"]);
    expect(result.failed).toEqual(["broken-one"]);
    expect(result.ok).toBe(false);
    expect(result.copiedToHelpApp).toBe(true);
    expect((indexStageOpts as { pages: BuildPageResult[] }).pages.map((p) => p.id)).toEqual(["add-entry"]);
    expect((indexStageOpts as { walkthroughIds: string[] }).walkthroughIds).toEqual(["add-entry", "broken-one", "untouched"]);
    // public/screenshots (the PR check's disk baseline) is refreshed only for what published.
    const sources = (indexStageOpts as { procedureSources: { walkthrough: { walkthrough: string } }[] }).procedureSources;
    expect(sources.map((s) => s.walkthrough.walkthrough)).toEqual(["add-entry"]);

    vi.doUnmock("../../src/config/index.js");
    vi.doUnmock("../../src/impact/index.js");
    vi.doUnmock("../../src/impact/walkthroughs.js");
    vi.doUnmock("../../src/ci/capture.js");
    vi.doUnmock("../../src/pages/index.js");
    vi.doUnmock("../../src/build/index-stage.js");
  });
});
