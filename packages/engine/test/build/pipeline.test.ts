// Regression tests for the review findings fixed in build/pipeline.ts:
//  1. pagesInputHash must change on a validation pass<->fail flip (+ wf.start/readers).
//  2. the index stage must only see walkthroughs whose pages/qa passed and are publishable.
//  8. videoPresent must check `<videoDir>/<id>/<id>.mp4`, not `<videoDir>/<id>.mp4`.
//  9. buildPage must be called with `readers: config.readers`.
// 10. render/pages must be skipped when this run's capture validation (or voice) failed.
// 11. voice (the one built-in paid stage) must stop once the run budget is exceeded.
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedConfig } from "../../src/config/index.js";
import type { CaptureManifest, ValidationResult } from "../../src/capture/index.js";
import type { BuildPageResult } from "../../src/pages/index.js";

vi.mock("../../src/capture/index.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../src/capture/index.js")>();
  return {
    ...mod,
    runCapture: vi.fn(),
    withFrameStabilization: vi.fn(async (_outDir: string, _opts: unknown, run: () => Promise<unknown>) => ({
      result: await run(),
      frameDiff: { kept: 0, changed: 0 },
    })),
  };
});
vi.mock("../../src/commands/voice.js", () => ({ buildVoiceManifest: vi.fn() }));
vi.mock("../../src/render/index.js", () => ({
  loadNarrationBeats: vi.fn(() => undefined),
  render: vi.fn(),
}));
vi.mock("../../src/pages/index.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../src/pages/index.js")>();
  return { ...mod, buildPage: vi.fn() };
});
vi.mock("../../src/qa/index.js", () => ({ runQa: vi.fn() }));

const { runCapture } = await import("../../src/capture/index.js");
const { buildVoiceManifest } = await import("../../src/commands/voice.js");
const { render } = await import("../../src/render/index.js");
const { buildPage } = await import("../../src/pages/index.js");
const { runQa } = await import("../../src/qa/index.js");
const { runPipeline, pagesInputHash } = await import("../../src/build/pipeline.js");

const dirs: string[] = [];
function tmpDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}
afterEach(async () => {
  vi.mocked(runCapture).mockReset();
  vi.mocked(buildVoiceManifest).mockReset();
  vi.mocked(render).mockReset();
  vi.mocked(buildPage).mockReset();
  vi.mocked(runQa).mockReset();
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
});

function writeWalkthrough(walkthroughsDir: string, id: string): void {
  writeFileSync(
    join(walkthroughsDir, `${id}.yaml`),
    [`walkthrough: ${id}`, `title: "${id}"`, "steps:", "  - id: only-step", '    title: "Do the thing"'].join("\n"),
  );
}

function fakeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  const root = tmpDir("docgen-pipeline-test-");
  const walkthroughsDir = join(root, "walkthroughs");
  mkdirSync(walkthroughsDir, { recursive: true });
  return {
    app: { baseUrl: "http://localhost:3000" },
    walkthroughsDir,
    outDir: join(root, "out"),
    buildDir: join(root, ".build"),
    configDir: root,
    ...overrides,
  } as ResolvedConfig;
}

function fakeManifest(): CaptureManifest {
  return {
    workflow: "fixture",
    baseUrl: "http://localhost:3000",
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 1,
    steps: [{ id: "only-step", camera: "full", cameraBox: null, events: [], doc: { image: null, highlights: [] }, impact: { urls: [], requests: [] }, checks: [] }],
  };
}

function fakeValidation(ok: boolean): ValidationResult {
  return {
    workflow: "fixture",
    ranAt: "2026-01-01T00:00:00.000Z",
    baseUrl: "http://localhost:3000",
    ok,
    steps: [{ id: "only-step", title: "Do the thing", checks: [], ok, ms: 10 }],
    dbChecks: [],
    problems: { console: [], page: [], server: [] },
  };
}

function mockCaptureOnce(ok: boolean): void {
  vi.mocked(runCapture).mockResolvedValueOnce({
    manifest: fakeManifest(),
    run: { capturedAt: new Date().toISOString(), durationMs: 1 },
    validation: fakeValidation(ok),
    framesDir: "/tmp/frames",
  });
}

/** Builds a fake BuildPageResult *and* actually writes its indexFile/plainFile to disk — the
 * real pages-stage cache check (`runPagesStage`) does `existsSync(cache.result.indexFile)`, so a
 * mock that leaves no file on disk would always force a rebuild regardless of the cache hash,
 * making any test of the hash (bug 1/8/9) vacuous. */
function fakePageResult(id: string, pagesDir: string, publishable = true): BuildPageResult {
  const outDir = join(pagesDir, id);
  const indexFile = join(outDir, "index.mdx");
  const plainFile = join(outDir, "index.plain.md");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(indexFile, "---\ntitle: x\npassed: true\n---\n\nbody\n");
  writeFileSync(plainFile, "body\n");
  return {
    id,
    outDir,
    indexFile,
    plainFile,
    screenshotsDir: join(outDir, "screenshots"),
    screenshots: [],
    passed: publishable,
    publishable,
    problems: publishable ? [] : ["not publishable in this fixture"],
    suggestions: [],
  };
}

describe("runPipeline (review-finding regressions)", () => {
  it("bug 9: passes config.readers through to buildPage", async () => {
    const config = fakeConfig({ readers: ["office-staff"] });
    writeWalkthrough(config.walkthroughsDir, "add-thing");
    mockCaptureOnce(true);
    vi.mocked(buildPage).mockResolvedValueOnce(fakePageResult("add-thing", join(config.outDir, "pages")));

    await runPipeline(config, { configPath: "x", walkthroughIds: [], only: ["capture", "pages"], json: false });

    expect(buildPage).toHaveBeenCalledTimes(1);
    const opts = vi.mocked(buildPage).mock.calls[0][3];
    expect(opts).toMatchObject({ readers: ["office-staff"] });
  });

  it("bug 10: skips render and pages for a walkthrough whose capture validation failed this run", async () => {
    const config = fakeConfig();
    writeWalkthrough(config.walkthroughsDir, "broken-flow");
    mockCaptureOnce(false); // validation.ok === false

    const result = await runPipeline(config, { configPath: "x", walkthroughIds: [], json: false });

    expect(render).not.toHaveBeenCalled();
    expect(buildPage).not.toHaveBeenCalled();
    const w = result.walkthroughs[0];
    expect(w.stages.render?.status).toBe("skipped");
    expect(w.stages.pages?.status).toBe("skipped");
  });

  it("bug 10 (control): render and pages still run when capture passes", async () => {
    const config = fakeConfig();
    writeWalkthrough(config.walkthroughsDir, "good-flow");
    mockCaptureOnce(true);
    vi.mocked(render).mockResolvedValueOnce({
      id: "good-flow",
      outDir: join(config.outDir, "videos", "good-flow"),
      srt: "",
      vtt: "",
      chaptersVtt: "",
      timelineJson: "",
      stills: [],
      durationSec: 1,
      skipped: false,
      frames: 1,
      wallTimeMs: 1,
    });
    vi.mocked(buildPage).mockResolvedValueOnce(fakePageResult("good-flow", join(config.outDir, "pages")));

    await runPipeline(config, { configPath: "x", walkthroughIds: [], only: ["capture", "render", "pages"], json: false });

    expect(render).toHaveBeenCalledTimes(1);
    expect(buildPage).toHaveBeenCalledTimes(1);
  });

  it("round 3: `--only pages` (capture not selected) still loads an existing capture manifest off disk, " +
    "so pages doesn't fail with \"no capture manifest available\" (bug: --skip-capture only mattered " +
    "inside runCaptureStage, which never runs once --only drops \"capture\")", async () => {
    const config = fakeConfig();
    writeWalkthrough(config.walkthroughsDir, "reused-capture");
    const captureDir = join(config.buildDir, "reused-capture", "capture");
    mkdirSync(captureDir, { recursive: true });
    writeFileSync(join(captureDir, "manifest.json"), JSON.stringify(fakeManifest()));
    writeFileSync(join(captureDir, "validation.json"), JSON.stringify(fakeValidation(true)));
    vi.mocked(buildPage).mockResolvedValueOnce(fakePageResult("reused-capture", join(config.outDir, "pages")));

    const result = await runPipeline(config, {
      configPath: "x",
      walkthroughIds: [],
      only: ["pages"],
      skipCapture: true,
      json: false,
    });

    expect(runCapture).not.toHaveBeenCalled();
    expect(buildPage).toHaveBeenCalledTimes(1);
    const w = result.walkthroughs[0];
    expect(w.stages.capture?.status).toBe("not-selected");
    expect(w.stages.pages?.status).not.toBe("failed");
  });

  it("bug 2: the index stage excludes a walkthrough whose qa stage failed this run, even though its page is publishable", async () => {
    const config = fakeConfig({ helpApp: join(fakeConfig().outDir, "..", "help") });
    const helpApp = join(config.outDir, "..", "help");
    mkdirSync(helpApp, { recursive: true });
    const configWithHelp = { ...config, helpApp };
    writeWalkthrough(config.walkthroughsDir, "flaky-qa");
    mockCaptureOnce(true);
    const pagesDir = join(config.outDir, "pages");
    const page = fakePageResult("flaky-qa", pagesDir, true);
    vi.mocked(buildPage).mockResolvedValueOnce(page);
    vi.mocked(runQa).mockResolvedValueOnce({ ok: false, target: page.outDir, checks: [{ check: "secrets", ok: false, details: "found one", problems: ["aws key"] }] });

    const result = await runPipeline(configWithHelp, {
      configPath: "x",
      walkthroughIds: [],
      only: ["capture", "pages", "qa", "index"],
      json: false,
    });

    expect(result.walkthroughs[0].stages.qa?.status).toBe("failed");
    expect(result.index?.pageCount).toBe(0);
    expect(existsSync(join(helpApp, "content", "docs", "flaky-qa"))).toBe(false);
  });

  it("bug 8: videoPresent checks <videoDir>/<id>/<id>.mp4, not <videoDir>/<id>.mp4 (affects the pages-stage cache key)", async () => {
    const config = fakeConfig();
    writeWalkthrough(config.walkthroughsDir, "has-video");
    const videoDir = join(config.outDir, "videos");
    const pagesDir = join(config.outDir, "pages");

    // No video on disk at all, first build.
    mockCaptureOnce(true);
    vi.mocked(buildPage).mockResolvedValueOnce(fakePageResult("has-video", pagesDir));
    await runPipeline(config, { configPath: "x", walkthroughIds: [], only: ["capture", "pages"], json: false });
    expect(buildPage).toHaveBeenCalledTimes(1);

    // Second build: same manifest/validation, but now a video exists at the *correct* nested
    // path render actually writes to (<videoDir>/<id>/<id>.mp4). videoPresent must flip to
    // true, busting the pages cache (a wrong flat-path check would never see this file and
    // would wrongly keep serving the cached, video-less page).
    mkdirSync(join(videoDir, "has-video"), { recursive: true });
    writeFileSync(join(videoDir, "has-video", "has-video.mp4"), "fake mp4 bytes");
    mockCaptureOnce(true);
    vi.mocked(buildPage).mockResolvedValueOnce(fakePageResult("has-video", pagesDir));
    await runPipeline(config, { configPath: "x", walkthroughIds: [], only: ["capture", "pages"], json: false });
    expect(buildPage).toHaveBeenCalledTimes(2);
  });

  it("bug 11: skips a later walkthrough's voice stage once the run budget is exceeded by an earlier one's voice cost", async () => {
    const config = fakeConfig({
      budget: { usd: 0.01 },
      voice: { provider: "minimax", pricePerChar: 1 }, // $1/char — trivially trips a $0.01 budget
    });
    writeWalkthrough(config.walkthroughsDir, "wt-a");
    writeWalkthrough(config.walkthroughsDir, "wt-b");
    mockCaptureOnce(true);
    mockCaptureOnce(true);
    vi.mocked(buildVoiceManifest).mockResolvedValueOnce({
      id: "wt-a",
      manifestFile: "/tmp/a.json",
      report: { results: [], summary: { synthesized: 1, cached: 0, charsBilled: 10 } },
      skipped: false,
    });

    const result = await runPipeline(config, { configPath: "x", walkthroughIds: [], only: ["capture", "voice"], json: false });

    expect(buildVoiceManifest).toHaveBeenCalledTimes(1); // wt-b's voice stage never ran
    const [a, b] = result.walkthroughs;
    expect(a.stages.voice?.status).toBe("ok");
    expect(b.stages.voice?.status).toBe("skipped");
    expect(b.stages.voice?.detail).toMatch(/budget/);
  });
});

describe("pagesInputHash (bug 1: must bust the pages cache on a capture validation pass<->fail flip)", () => {
  function wf(overrides: Record<string, unknown> = {}) {
    return {
      walkthrough: "add-thing",
      title: "Add a thing",
      steps: [{ id: "only-step", title: "Do it" }],
      ...overrides,
    } as import("../../src/walkthrough/index.js").Walkthrough;
  }

  it("changes when validation.ok flips, even though the manifest and text are unchanged", () => {
    const manifest = fakeManifest();
    const passing = fakeValidation(true);
    const failing = fakeValidation(false);
    const a = pagesInputHash(wf(), manifest, passing, undefined, false);
    const b = pagesInputHash(wf(), manifest, failing, undefined, false);
    expect(a).not.toBe(b);
  });

  it("changes when a step's own ok flips, even if the overall validation.ok stays the same", () => {
    const manifest = fakeManifest();
    const v1 = fakeValidation(true);
    const v2 = { ...v1, steps: v1.steps.map((s) => ({ ...s, ok: false })) };
    const a = pagesInputHash(wf(), manifest, v1, undefined, false);
    const b = pagesInputHash(wf(), manifest, v2, undefined, false);
    expect(a).not.toBe(b);
  });

  it("ignores validation's volatile ranAt/ms fields", () => {
    const manifest = fakeManifest();
    const v1 = fakeValidation(true);
    const v2 = { ...v1, ranAt: "2030-01-01T00:00:00.000Z", steps: v1.steps.map((s) => ({ ...s, ms: 99999 })) };
    expect(pagesInputHash(wf(), manifest, v1, undefined, false)).toBe(pagesInputHash(wf(), manifest, v2, undefined, false));
  });

  it("changes when config.readers changes (bug 9's flip-flop guard)", () => {
    const manifest = fakeManifest();
    const v = fakeValidation(true);
    const a = pagesInputHash(wf(), manifest, v, ["office-staff"], false);
    const b = pagesInputHash(wf(), manifest, v, ["judges"], false);
    expect(a).not.toBe(b);
  });

  it("changes when wf.start changes", () => {
    const manifest = fakeManifest();
    const v = fakeValidation(true);
    const a = pagesInputHash(wf({ start: { page: "/a" } }), manifest, v, undefined, false);
    const b = pagesInputHash(wf({ start: { page: "/b" } }), manifest, v, undefined, false);
    expect(a).not.toBe(b);
  });
});
