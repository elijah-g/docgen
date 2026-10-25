import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyTemplate } from "../../src/init/copy-template.js";

const createdDirs: string[] = [];

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "docgen-copy-template-test-"));
  createdDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (createdDirs.length > 0) {
    rmSync(createdDirs.pop()!, { recursive: true, force: true });
  }
});

function makeFakeTemplate(): string {
  const dir = tmpDir();
  mkdirSync(join(dir, "app"), { recursive: true });
  writeFileSync(join(dir, "package.json"), "{}");
  writeFileSync(join(dir, "app", "layout.tsx"), "export default function Layout() {}\n");
  mkdirSync(join(dir, "node_modules", "whatever"), { recursive: true });
  writeFileSync(join(dir, "node_modules", "whatever", "index.js"), "module.exports = {};");
  return dir;
}

describe("copyTemplate", () => {
  it("copies every template file into an empty destination", () => {
    const template = makeFakeTemplate();
    const dest = tmpDir();

    const result = copyTemplate(dest, template);

    expect(result.copied.sort()).toEqual(["app/layout.tsx", "package.json"].sort());
    expect(result.skipped).toEqual([]);
    expect(existsSync(join(dest, "package.json"))).toBe(true);
    expect(existsSync(join(dest, "app", "layout.tsx"))).toBe(true);
  });

  it("skips node_modules/.next/.build and never overwrites an existing file", () => {
    const template = makeFakeTemplate();
    const dest = tmpDir();
    writeFileSync(join(dest, "package.json"), '{"already": "here"}');

    const result = copyTemplate(dest, template);

    expect(result.skipped).toEqual(["package.json"]);
    expect(result.copied).toEqual(["app/layout.tsx"]);
    expect(JSON.parse(readFileSync(join(dest, "package.json"), "utf8"))).toEqual({ already: "here" });
    expect(existsSync(join(dest, "node_modules"))).toBe(false);
  });

  it("throws when the template directory doesn't exist", () => {
    expect(() => copyTemplate(tmpDir(), join(tmpdir(), "does-not-exist-template"))).toThrow();
  });
});
