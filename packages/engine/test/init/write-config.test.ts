import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeDocgenConfig } from "../../src/init/write-config.js";
import type { DetectResult } from "../../src/init/detect.js";

const createdDirs: string[] = [];

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "docgen-write-config-test-"));
  createdDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (createdDirs.length > 0) {
    rmSync(createdDirs.pop()!, { recursive: true, force: true });
  }
});

const detectedNext: DetectResult = {
  framework: "nextjs",
  appDir: "/repo/app",
  routes: ["/dashboard", "/login"],
  authLibrary: "Auth.js (next-auth)",
};

describe("writeDocgenConfig", () => {
  it("writes a config with the app URL, brand and detected routes as comments", () => {
    const dir = tmpDir();
    const result = writeDocgenConfig({
      destDir: dir,
      appUrl: "http://127.0.0.1:3100",
      brand: { primaryColor: "235 55% 42%", logo: "public/logo.svg" },
      detected: detectedNext,
    });

    expect(result.written).toBe(true);
    const content = readFileSync(result.file, "utf8");
    expect(content).toContain('baseUrl: "http://127.0.0.1:3100"');
    expect(content).toContain("primaryColor");
    expect(content).toContain("235 55% 42%");
    expect(content).toContain("/dashboard, /login");
    expect(content).toContain("import { defineConfig } from \"docgen\"");
  });

  it("sets helpApp so the generated config points the index stage at its own help site (bug: fresh help site never showed built pages)", () => {
    const dir = tmpDir();
    const result = writeDocgenConfig({
      destDir: dir,
      appUrl: "http://127.0.0.1:3100",
      brand: {},
      detected: detectedNext,
    });

    const content = readFileSync(result.file, "utf8");
    expect(content).toMatch(/helpApp:\s*"\."/);
  });

  it("never overwrites an existing docgen.config.ts", () => {
    const dir = tmpDir();
    const file = join(dir, "docgen.config.ts");
    writeFileSync(file, "// hand-edited\n");

    const result = writeDocgenConfig({
      destDir: dir,
      appUrl: "http://example.com",
      brand: {},
      detected: { framework: "unknown", routes: [] },
    });

    expect(result.written).toBe(false);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8")).toBe("// hand-edited\n");
  });
});
