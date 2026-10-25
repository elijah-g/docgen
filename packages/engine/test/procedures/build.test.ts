import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import type { Walkthrough } from "../../src/walkthrough/index.js";
import type { CaptureManifest, ValidationResult } from "../../src/capture/index.js";
import { buildProcedure, buildProcedures } from "../../src/procedures/index.js";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const dirs: string[] = [];
function tmpDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}
afterEach(async () => {
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
});

function walkthrough(): Walkthrough {
  return {
    walkthrough: "add-competitor",
    title: "Add a competitor",
    for: "office staff",
    start: { signed_in_as: "office-staff", page: "/competitors" },
    steps: [
      { id: "open", title: "Open competitors", page_text: "Click **Competitors** in the menu.", actions: [] },
      { id: "fill", title: "Fill the form", page_text: "Enter their *first name*.", actions: [] },
    ],
  };
}

function writeCapture(captureDir: string, opts: { ok?: boolean } = {}): void {
  mkdirSync(join(captureDir, "frames"), { recursive: true });
  writeFileSync(join(captureDir, "frames", "s1.png"), TINY_PNG);
  writeFileSync(join(captureDir, "frames", "s2.png"), TINY_PNG);

  const manifest: CaptureManifest = {
    workflow: "add-competitor",
    capturedAt: "2026-10-20T00:00:00.000Z",
    baseUrl: "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 810 },
    deviceScaleFactor: 2,
    steps: [
      {
        id: "open",
        camera: "full",
        cameraBox: null,
        events: [],
        doc: { image: "s1.png", highlights: [] },
        impact: { urls: ["http://127.0.0.1:3100/competitors"], requests: [] },
        checks: [],
      },
      {
        id: "fill",
        camera: "full",
        cameraBox: null,
        events: [],
        doc: { image: "s2.png", highlights: [] },
        impact: { urls: [], requests: [] },
        checks: [],
      },
    ],
  } as unknown as CaptureManifest;
  writeFileSync(join(captureDir, "manifest.json"), JSON.stringify(manifest));

  const ok = opts.ok ?? true;
  const validation: ValidationResult = {
    ok,
    ranAt: "2026-10-20T00:00:05.000Z",
    steps: [
      { id: "open", ok: true },
      { id: "fill", ok },
    ],
    problems: { page: [], server: [] },
    dbChecks: [],
  } as unknown as ValidationResult;
  writeFileSync(join(captureDir, "validation.json"), JSON.stringify(validation));
}

describe("buildProcedure", () => {
  it("builds ordered steps with plain-text instructions and a screenshot URL, only for passed captures", () => {
    const captureDir = tmpDir("docgen-proc-capture-");
    const publicDir = tmpDir("docgen-proc-public-");
    writeCapture(captureDir);

    const proc = buildProcedure(walkthrough(), captureDir, { publicDir });
    expect(proc).toBeDefined();
    expect(proc!.id).toBe("add-competitor");
    expect(proc!.start).toEqual({ page: "/competitors", role: "office-staff" });
    expect(proc!.steps).toHaveLength(2);
    expect(proc!.steps[0]).toMatchObject({ n: 1, title: "Open competitors", instruction: "Click Competitors in the menu." });
    expect(proc!.steps[0].screenshot).toBe("/screenshots/add-competitor/step-01.png");
    expect(existsSync(join(publicDir, "screenshots", "add-competitor", "step-01.png"))).toBe(true);
    expect(proc!.impactRoutes).toEqual(["/competitors"]);
  });

  it("returns undefined when the capture didn't pass — never hands an agent an unverified procedure", () => {
    const captureDir = tmpDir("docgen-proc-capture-");
    writeCapture(captureDir, { ok: false });
    const proc = buildProcedure(walkthrough(), captureDir, { publicDir: tmpDir("docgen-proc-public-") });
    expect(proc).toBeUndefined();
  });
});

describe("buildProcedures", () => {
  it("writes procedures.json sorted by id, skipping failed walkthroughs", () => {
    const passDir = tmpDir("docgen-proc-capture-");
    writeCapture(passDir);
    const failDir = tmpDir("docgen-proc-capture-");
    writeCapture(failDir, { ok: false });
    const publicDir = tmpDir("docgen-proc-public-");

    const failingWf: Walkthrough = { ...walkthrough(), walkthrough: "zzz-fails" };

    const result = buildProcedures({
      sources: [
        { wf: walkthrough(), captureDir: passDir },
        { wf: failingWf, captureDir: failDir },
      ],
      publicDir,
    });

    expect(result.procedures).toHaveLength(1);
    expect(result.procedures[0].id).toBe("add-competitor");
    expect(result.outFile).toBe(join(publicDir, "procedures.json"));
    const onDisk = JSON.parse(readFileSync(result.outFile!, "utf8"));
    expect(onDisk).toHaveLength(1);
  });

  // Regression (review finding index-stage.ts:179): `docgen build <one-id>` used to rebuild
  // procedures.json from just that run's sources, wiping every other walkthrough's entry.
  it("merges this run's procedures with existing ones by id, keeping an untouched walkthrough's entry", () => {
    const passDir = tmpDir("docgen-proc-capture-");
    writeCapture(passDir);
    const publicDir = tmpDir("docgen-proc-public-");

    const untouched = { id: "untouched-flow", title: "Untouched flow", start: {}, steps: [] };
    const result = buildProcedures({
      sources: [{ wf: walkthrough(), captureDir: passDir }],
      publicDir,
      existing: [untouched],
    });

    expect(result.procedures.map((p) => p.id).sort()).toEqual(["add-competitor", "untouched-flow"]);
    const onDisk = JSON.parse(readFileSync(result.outFile!, "utf8"));
    expect(onDisk.map((p: { id: string }) => p.id).sort()).toEqual(["add-competitor", "untouched-flow"]);
  });

  it("prunes an existing entry this run attempted but could no longer build (unpublishable)", () => {
    const failDir = tmpDir("docgen-proc-capture-");
    writeCapture(failDir, { ok: false });
    const publicDir = tmpDir("docgen-proc-public-");

    const stale = { id: "add-competitor", title: "Stale", start: {}, steps: [] };
    const result = buildProcedures({
      sources: [{ wf: walkthrough(), captureDir: failDir }], // fails validation -> no procedure produced
      publicDir,
      existing: [stale],
      attemptedIds: ["add-competitor"],
    });

    expect(result.procedures).toHaveLength(0);
  });

  it("prunes an existing entry whose walkthrough no longer exists on disk (validIds given)", () => {
    const publicDir = tmpDir("docgen-proc-public-");
    const deleted = { id: "deleted-flow", title: "Deleted", start: {}, steps: [] };
    const kept = { id: "kept-flow", title: "Kept", start: {}, steps: [] };

    const result = buildProcedures({
      sources: [],
      publicDir,
      existing: [deleted, kept],
      validIds: ["kept-flow"],
    });

    expect(result.procedures.map((p) => p.id)).toEqual(["kept-flow"]);
  });
});
