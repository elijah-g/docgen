import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runImportTallyup } from "../../src/commands/import-tallyup.js";

const MINIMAL_WORKFLOW = {
  id: "add-competitor",
  title: "Add a competitor",
  steps: [{ actions: [{ do: "click", target: { role: "button", name: "Save" } }] }],
};

describe("runImportTallyup", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "docgen-import-tallyup-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes foo.json -> foo.yaml by default", async () => {
    const input = path.join(dir, "workflow.json");
    await writeFile(input, JSON.stringify(MINIMAL_WORKFLOW), "utf8");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const code = runImportTallyup(input, undefined, false);
      expect(code).toBe(0);
    } finally {
      log.mockRestore();
    }
    const outContent = await readFile(path.join(dir, "workflow.yaml"), "utf8");
    expect(outContent).toContain("walkthrough: add-competitor");
  });

  it("appends .yaml (not a no-op replace) for a non-.json input, instead of overwriting it", async () => {
    // Regression: `input.replace(/\.json$/i, ".yaml")` is a no-op when input has no .json
    // extension, so outFile === input and writeFileSync clobbered the source file.
    const input = path.join(dir, "workflow.txt");
    const originalContent = JSON.stringify(MINIMAL_WORKFLOW);
    await writeFile(input, originalContent, "utf8");

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const code = runImportTallyup(input, undefined, false);
      expect(code).toBe(0);
    } finally {
      log.mockRestore();
    }

    // The source file must be untouched...
    expect(await readFile(input, "utf8")).toBe(originalContent);
    // ...and the output went to workflow.txt.yaml instead.
    const outContent = await readFile(`${input}.yaml`, "utf8");
    expect(outContent).toContain("walkthrough: add-competitor");
  });

  it("refuses to run when the resolved output path equals the input path", async () => {
    const input = path.join(dir, "workflow.json");
    const originalContent = JSON.stringify(MINIMAL_WORKFLOW);
    await writeFile(input, originalContent, "utf8");

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const code = runImportTallyup(input, input, false); // --output explicitly set to the input
      expect(code).toBe(1);
    } finally {
      errorSpy.mockRestore();
    }
    // Source must survive untouched.
    expect(await readFile(input, "utf8")).toBe(originalContent);
  });

  it("refuses to overwrite an existing output file without --force", async () => {
    const input = path.join(dir, "workflow.json");
    await writeFile(input, JSON.stringify(MINIMAL_WORKFLOW), "utf8");
    const outFile = path.join(dir, "workflow.yaml");
    await writeFile(outFile, "existing: true\n", "utf8");

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const code = runImportTallyup(input, undefined, false);
      expect(code).toBe(1);
    } finally {
      errorSpy.mockRestore();
    }
    // The existing output must survive untouched.
    expect(await readFile(outFile, "utf8")).toBe("existing: true\n");
  });

  it("overwrites an existing output file when --force is passed", async () => {
    const input = path.join(dir, "workflow.json");
    await writeFile(input, JSON.stringify(MINIMAL_WORKFLOW), "utf8");
    const outFile = path.join(dir, "workflow.yaml");
    await writeFile(outFile, "existing: true\n", "utf8");

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const code = runImportTallyup(input, undefined, false, true);
      expect(code).toBe(0);
    } finally {
      log.mockRestore();
    }
    expect(await readFile(outFile, "utf8")).toContain("walkthrough: add-competitor");
  });

  it("catches bad input and emits a short structured JSON error instead of a raw stack/ZodError dump", async () => {
    const input = path.join(dir, "not-json.json");
    await writeFile(input, "{ this is not valid json", "utf8");

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const code = runImportTallyup(input, undefined, true);
      expect(code).toBe(1);
      expect(log).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(log.mock.calls[0][0] as string);
      expect(payload.error).toBeDefined();
      expect(payload.error.split("\n")).toHaveLength(1);
    } finally {
      log.mockRestore();
    }
  });

  it("catches a schema-invalid walkthrough id and reports one short line, not a ZodError dump", async () => {
    const input = path.join(dir, "bad-id.json");
    await writeFile(input, JSON.stringify({ ...MINIMAL_WORKFLOW, id: "Not A Slug!" }), "utf8");

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const code = runImportTallyup(input, undefined, false);
      expect(code).toBe(1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const message = errorSpy.mock.calls[0][0] as string;
      expect(message.split("\n")).toHaveLength(1);
      expect(message).toMatch(/slug/);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
