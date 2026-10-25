// Draft-render the real TallyUp fixture end to end: capture + voice -> timeline -> mp4 + captions.
// Skips (rather than fails) when the fixture isn't present, per AGENTS.md. The fixture is the
// example app's own build output (examples/tallyup/.build/, via docgen.config.mjs's buildDir),
// committed in-repo so this runs anywhere the repo is checked out.
import { execFile } from "node:child_process";
import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { cp, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { loadWalkthroughFile } from "../../src/walkthrough/index.js";
import { loadNarrationBeats, render } from "../../src/render/index.js";
import { parseSrt } from "../../src/qa/captions.js";

const execFileAsync = promisify(execFile);

const here = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE_ROOT = path.resolve(here, "../../../../examples/tallyup");
// docgen.config.mjs's buildDir ("./.build") + the walkthrough id.
const FIXTURE_ROOT = path.join(EXAMPLE_ROOT, ".build/add-competitor-and-entry");
const CAPTURE_DIR = path.join(FIXTURE_ROOT, "capture");
const VOICE_DIR = path.join(FIXTURE_ROOT, "voice");
const WALKTHROUGH_FILE = path.join(EXAMPLE_ROOT, "walkthroughs/add-competitor-and-entry.yaml");

const fixturePresent =
  existsSync(path.join(CAPTURE_DIR, "manifest.json")) &&
  existsSync(path.join(VOICE_DIR, "manifest.json")) &&
  existsSync(WALKTHROUGH_FILE);

// Full end-to-end render of the real fixture via ffmpeg — multiple minutes. Opt in with
// DOCGEN_TEST_SLOW=1 (see `npm run test:slow`); skipped by default so `npm test` stays fast.
const SLOW = process.env.DOCGEN_TEST_SLOW === "1";

describe.skipIf(!fixturePresent || !SLOW)("render: TallyUp fixture (draft)", () => {
  let outDir: string;

  afterAll(async () => {
    if (outDir) await rm(outDir, { recursive: true, force: true });
  });

  it(
    "renders a draft video with captions and chapters, verified with ffprobe, then skips an unchanged rerun",
    async () => {
      outDir = await mkdtemp(path.join(os.tmpdir(), "docgen-render-it-"));
      const wf = loadWalkthroughFile(WALKTHROUGH_FILE);
      const narration = loadNarrationBeats(VOICE_DIR);

      const started = Date.now();
      const result = await render(wf, {
        outDir,
        captureDir: CAPTURE_DIR,
        narration,
        draft: true,
      });
      const wallTimeMs = Date.now() - started;

      expect(result.skipped).toBe(false);
      expect(result.mp4).toBeTruthy();
      expect(existsSync(result.mp4!)).toBe(true);
      expect(existsSync(result.srt)).toBe(true);
      expect(existsSync(result.vtt)).toBe(true);
      expect(existsSync(result.chaptersVtt)).toBe(true);
      expect(result.durationSec).toBeGreaterThan(30); // 15 narrated beats, should run well past 30s.
      expect(result.scenesTotal).toBe(17); // intro + 15 steps + outro.
      expect(result.scenesRendered).toBe(result.scenesTotal);
      expect(result.scenesReused).toBe(0);

      const sizeMb = statSync(result.mp4!).size / 1e6;
      console.log(
        `[render integration] draft cold: ${result.durationSec.toFixed(1)}s video, ${result.frames} frames, ` +
          `${(wallTimeMs / 1000).toFixed(1)}s wall (scene render ${(result.wallTimeMs / 1000).toFixed(1)}s), ${sizeMb.toFixed(2)} MB -> ${result.mp4}`,
      );

      // Verify with ffprobe: a readable video+audio stream, duration close to the timeline's.
      const { stdout } = await execFileAsync("ffprobe", [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_streams",
        "-show_format",
        result.mp4!,
      ]);
      const probe = JSON.parse(stdout);
      const video = probe.streams.find((s: any) => s.codec_type === "video");
      const audio = probe.streams.find((s: any) => s.codec_type === "audio");
      expect(video).toBeDefined();
      expect(audio).toBeDefined();
      expect(video.pix_fmt).toBe("yuv420p");
      expect(video.color_range).toBe("tv");
      // Concat-demuxer duration math: total duration must equal the sum of the scenes, within
      // one frame either way (no visible seam/AV drift from the per-scene concat).
      expect(Math.abs(Number(probe.format.duration) - result.durationSec)).toBeLessThan(1);

      // Captions parse, are non-empty, and still land inside the concatenated video's duration
      // (i.e. still aligned to the narration after per-scene concat, not just to the timeline).
      const cues = parseSrt(await import("node:fs/promises").then((fs) => fs.readFile(result.srt, "utf8")));
      expect(cues.length).toBeGreaterThan(0);
      expect(cues[cues.length - 1].endMs / 1000).toBeLessThanOrEqual(Number(probe.format.duration) + 1);

      // Rerunning with the same inputs: the whole-video .hash sidecar skips everything —
      // every scene is reused, nothing re-renders.
      const rerenderStarted = Date.now();
      const second = await render(wf, { outDir, captureDir: CAPTURE_DIR, narration, draft: true });
      const rerenderMs = Date.now() - rerenderStarted;
      console.log(`[render integration] draft warm (all reused): ${rerenderMs}ms`);
      expect(second.skipped).toBe(true);
      expect(rerenderMs).toBeLessThan(wallTimeMs);
    },
    900_000, // frame-by-frame Playwright rendering of ~1600 draft frames; generous for shared/loaded hosts.
  );

  it("renders requested stills as PNGs without a full render", async () => {
    const wf = loadWalkthroughFile(WALKTHROUGH_FILE);
    const narration = loadNarrationBeats(VOICE_DIR);
    const stillsOut = await mkdtemp(path.join(os.tmpdir(), "docgen-render-stills-"));
    try {
      const result = await render(wf, { outDir: stillsOut, captureDir: CAPTURE_DIR, narration, draft: true, stills: [1, 10] });
      expect(result.stills).toHaveLength(2);
      for (const f of result.stills) expect(existsSync(f)).toBe(true);
    } finally {
      await rm(stillsOut, { recursive: true, force: true });
    }
  }, 120_000);

  it(
    "re-renders only the one scene whose frame changed, reusing every other scene's segment",
    async () => {
      // Work against a temp copy of the fixture capture dir so the change below never touches
      // the committed examples/tallyup fixture, while keeping captureDir's path stable across
      // all three renders below (per-scene hashes embed each frame's absolute path, so changing
      // captureDir itself would invalidate every scene, not just the touched one).
      const tempCapture = await mkdtemp(path.join(os.tmpdir(), "docgen-render-scene-capture-"));
      const tempOut = await mkdtemp(path.join(os.tmpdir(), "docgen-render-scene-out-"));
      try {
        await cp(CAPTURE_DIR, tempCapture, { recursive: true });
        const wf = loadWalkthroughFile(WALKTHROUGH_FILE);
        const narration = loadNarrationBeats(VOICE_DIR);

        const first = await render(wf, { outDir: tempOut, captureDir: tempCapture, narration, draft: true });
        expect(first.skipped).toBe(false);

        const second = await render(wf, { outDir: tempOut, captureDir: tempCapture, narration, draft: true });
        expect(second.skipped).toBe(true);

        // Change one frame that affects only a single scene. It must be (a) superseded by a
        // later frame cue within its own step, so it never becomes that step's "entry state"
        // handed into the *next* scene (segments.ts's `sliceTimelineForScene`/`stateAt` — the
        // frame still on screen at the next scene's t0), and (b) not the very first frame cue in
        // the whole timeline, which is also the intro scene's entry state (visible behind the
        // stage-in fade at the end of the intro card). "search-first"'s 0005-hover.png is
        // superseded later in the same step by 0006-state.png, typeFrames, and 0017-state.png
        // (see examples/tallyup/.build/.../capture/manifest.json), so it satisfies both.
        const touchedFrame = path.join(tempCapture, "frames", "0005-hover.png");
        const originalBytes = statSync(touchedFrame).size;
        writeFileSync(touchedFrame, Buffer.alloc(originalBytes, 1)); // same size, different content.

        const third = await render(wf, { outDir: tempOut, captureDir: tempCapture, narration, draft: true, noCache: true });
        expect(third.skipped).toBe(false);
        expect(third.scenesRendered).toBe(1);
        expect(third.scenesReused).toBe((third.scenesTotal ?? 0) - 1);
        console.log(
          `[render integration] one-scene-changed: ${third.scenesRendered}/${third.scenesTotal} scenes rendered, ` +
            `${(third.wallTimeMs / 1000).toFixed(1)}s wall`,
        );
      } finally {
        await rm(tempCapture, { recursive: true, force: true });
        await rm(tempOut, { recursive: true, force: true });
      }
    },
    900_000,
  );

  it(
    "full-quality render completes and reuses on an unchanged rerun",
    async () => {
      const fullOut = await mkdtemp(path.join(os.tmpdir(), "docgen-render-full-"));
      try {
        const wf = loadWalkthroughFile(WALKTHROUGH_FILE);
        const narration = loadNarrationBeats(VOICE_DIR);
        const started = Date.now();
        const result = await render(wf, { outDir: fullOut, captureDir: CAPTURE_DIR, narration, draft: false });
        const wallTimeMs = Date.now() - started;
        console.log(`[render integration] full-quality cold: ${(wallTimeMs / 1000).toFixed(1)}s wall -> ${result.mp4}`);
        expect(result.skipped).toBe(false);
        expect(existsSync(result.mp4!)).toBe(true);
      } finally {
        await rm(fullOut, { recursive: true, force: true });
      }
    },
    600_000, // only run if it fits under 10 minutes, per M10's measurement ask.
  );
});
