import { describe, expect, it } from "vitest";
import { beatIds, buildTimeline } from "../../src/render/timeline.js";
import type { CaptureManifest } from "../../src/capture/index.js";
import type { Walkthrough } from "../../src/walkthrough/types.js";

function wf(overrides: Partial<Walkthrough> = {}): Walkthrough {
  return {
    walkthrough: "demo",
    title: "Demo walkthrough",
    product: "Demo",
    intro: { eyebrow: "How-to", title: "Demo walkthrough", subtitle: "A short demo", say: "Intro narration", caption: "Intro caption" },
    outro: { title: "Done", recap: ["Step one"], say: "Outro narration", caption: "Outro caption" },
    steps: [
      {
        id: "step-one",
        chapter: "Chapter A",
        title: "Step one",
        say: "Step one narration",
        caption: "Step one caption",
        camera: "full",
        actions: [],
      },
    ],
    ...overrides,
  };
}

function manifest(overrides: Partial<CaptureManifest> = {}): CaptureManifest {
  return {
    workflow: "demo",
    capturedAt: new Date().toISOString(),
    baseUrl: "http://localhost",
    viewport: { width: 1440, height: 810 },
    deviceScaleFactor: 2,
    steps: [
      {
        id: "step-one",
        camera: "full",
        cameraBox: null,
        events: [{ type: "frame", image: "0001-state.png", transition: "cut" }],
        doc: { image: "0001-state.png", highlights: [] },
        impact: { urls: [], requests: [] },
        checks: [],
      },
    ],
    ...overrides,
  };
}

const narration = {
  intro: { audioPath: "/voice/intro.wav", durationMs: 2000 },
  "step-one": { audioPath: "/voice/step-one.wav", durationMs: 2000 },
  outro: { audioPath: "/voice/outro.wav", durationMs: 1000 },
};

describe("beatIds", () => {
  it("lists intro, each step's id, then outro, in order", () => {
    expect(beatIds(wf())).toEqual(["intro", "step-one", "outro"]);
  });

  it("throws when a step has no id", () => {
    expect(() => beatIds(wf({ steps: [{ title: "No id", actions: [] }] }))).toThrow(/has no id/);
  });
});

describe("buildTimeline", () => {
  it("throws if narration for a beat is missing", () => {
    expect(() => buildTimeline(wf(), manifest(), {}, { fps: 30 })).toThrow(/narration for "intro" is missing/);
  });

  it("throws if the capture is missing a step", () => {
    expect(() => buildTimeline(wf(), manifest({ steps: [] }), narration, { fps: 30 })).toThrow(/capture is missing step/);
  });

  it("places the step's narration at a fixed delay after the step starts", () => {
    const tl = buildTimeline(wf(), manifest(), narration, { fps: 30 });
    const stepAudio = tl.audio.find((a) => a.id === "step-one")!;
    const stepCamera = tl.cameras.find((c) => c.t0 >= tl.stageIn.t1 - 0.01);
    expect(stepCamera).toBeDefined();
    // voiceDelay (0.3s) after the step's camera move begins.
    expect(stepAudio.t).toBeCloseTo(stepCamera!.t0 + 0.3, 5);
  });

  it("step length is at least as long as its narration + gap", () => {
    // No capture events at all, so the step's own actions take ~0s: duration should be driven
    // entirely by voiceDelay + narration + gapSeconds.
    const longNarration = { ...narration, "step-one": { audioPath: "/voice/step-one.wav", durationMs: 10_000 } };
    const tl = buildTimeline(
      wf(),
      manifest({ steps: [{ id: "step-one", camera: "full", cameraBox: null, events: [], doc: { image: null, highlights: [] }, impact: { urls: [], requests: [] }, checks: [] }] }),
      longNarration,
      { fps: 30 },
    );
    const stepCamera = tl.cameras.find((c) => c.t0 >= tl.stageIn.t1 - 0.01)!;
    const caption = tl.captions.find((c) => c.text === "Step one caption")!;
    // caption ends >= narration start + its duration, which must fit inside the step.
    expect(caption.t1 - stepCamera.t0).toBeGreaterThanOrEqual(0.3 + 10 + 0.45 - 0.5);
  });

  it("respects a step's `hold`", () => {
    const base = buildTimeline(wf(), manifest(), narration, { fps: 30 });
    const held = buildTimeline(
      wf({ steps: [{ ...wf().steps[0], hold: 5 }] }),
      manifest(),
      narration,
      { fps: 30 },
    );
    // The hold only lengthens the step once it exceeds the slack narration/gap timing already
    // need; with this fixture's short (2s) narration that's most, but not all, of the 5s hold.
    expect(held.duration).toBeGreaterThan(base.duration + 3);
    expect(held.duration).toBeLessThan(base.duration + 5);
  });

  it("produces one chapter chip per step, spanning that step's time", () => {
    const tl = buildTimeline(wf(), manifest(), narration, { fps: 30 });
    expect(tl.chips).toHaveLength(1);
    expect(tl.chips[0].title).toBe("Step one");
    expect(tl.chips[0].t1).toBeGreaterThan(tl.chips[0].t0);
  });

  it("keeps caption cues from overlapping", () => {
    const tl = buildTimeline(wf(), manifest(), narration, { fps: 30 });
    for (let i = 1; i < tl.captions.length; i++) {
      expect(tl.captions[i].t0).toBeGreaterThanOrEqual(tl.captions[i - 1].t1);
    }
  });

  it("is deterministic: same inputs produce the same timeline", () => {
    const a = buildTimeline(wf(), manifest(), narration, { fps: 30 });
    const b = buildTimeline(wf(), manifest(), narration, { fps: 30 });
    expect(a).toEqual(b);
  });

  it("splits into contiguous scenes — intro, each step, outro — matching beatIds order", () => {
    const twoSteps = wf({
      steps: [
        { id: "step-one", chapter: "Chapter A", title: "Step one", say: "s1", caption: "c1", camera: "full", actions: [] },
        { id: "step-two", chapter: "Chapter A", title: "Step two", say: "s2", caption: "c2", camera: "full", actions: [] },
      ],
    });
    const twoStepManifest = manifest({
      steps: [
        { id: "step-one", camera: "full", cameraBox: null, events: [{ type: "frame", image: "0001.png", transition: "cut" }], doc: { image: "0001.png", highlights: [] }, impact: { urls: [], requests: [] }, checks: [] },
        { id: "step-two", camera: "full", cameraBox: null, events: [{ type: "frame", image: "0002.png", transition: "cut" }], doc: { image: "0002.png", highlights: [] }, impact: { urls: [], requests: [] }, checks: [] },
      ],
    });
    const twoStepNarration = { ...narration, "step-two": { audioPath: "/voice/step-two.wav", durationMs: 2000 } };

    const tl = buildTimeline(twoSteps, twoStepManifest, twoStepNarration, { fps: 30 });

    expect(tl.scenes!.map((s) => s.id)).toEqual(beatIds(twoSteps));
    // Contiguous and covering the whole timeline: each scene's t1 is the next scene's t0, the
    // first starts at 0, and the last ends at the timeline's total duration.
    expect(tl.scenes![0].t0).toBe(0);
    for (let i = 1; i < tl.scenes!.length; i++) {
      expect(tl.scenes![i].t0).toBe(tl.scenes![i - 1].t1);
    }
    expect(tl.scenes![tl.scenes!.length - 1].t1).toBe(tl.duration);
    for (const s of tl.scenes!) expect(s.t1).toBeGreaterThan(s.t0);
  });
});
