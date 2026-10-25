import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractBrand } from "../../src/init/brand.js";

const createdDirs: string[] = [];

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "docgen-brand-test-"));
  createdDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (createdDirs.length > 0) {
    rmSync(createdDirs.pop()!, { recursive: true, force: true });
  }
});

describe("extractBrand", () => {
  it("reads a primary colour and font from app/globals.css :root vars", () => {
    const dir = tmpDir();
    mkdirSync(join(dir, "app"), { recursive: true });
    writeFileSync(
      join(dir, "app", "globals.css"),
      `:root {\n  --primary: 235 55% 42%;\n  --font-sans: "Geist", sans-serif;\n}\n`,
    );

    const brand = extractBrand(dir);
    expect(brand.primaryColor).toBe("235 55% 42%");
    expect(brand.font).toBe(`"Geist", sans-serif`);
  });

  it("falls back to a Tailwind config's literal primary colour", () => {
    const dir = tmpDir();
    writeFileSync(
      join(dir, "tailwind.config.ts"),
      `export default { theme: { extend: { colors: { primary: { DEFAULT: "#4338ca" } } } } };`,
    );

    expect(extractBrand(dir).primaryColor).toBe("#4338ca");
  });

  it("ignores a Tailwind primary colour that just points back at a CSS var", () => {
    const dir = tmpDir();
    writeFileSync(
      join(dir, "tailwind.config.ts"),
      `export default { theme: { extend: { colors: { primary: { DEFAULT: "hsl(var(--primary))" } } } } };`,
    );

    expect(extractBrand(dir).primaryColor).toBeUndefined();
  });

  it("picks a logo from public/, preferring .svg", () => {
    const dir = tmpDir();
    mkdirSync(join(dir, "public"), { recursive: true });
    writeFileSync(join(dir, "public", "acme-logo.png"), "");
    writeFileSync(join(dir, "public", "acme-logo.svg"), "");

    expect(extractBrand(dir).logo).toBe(join("public", "acme-logo.svg"));
  });

  it("finds a next/font/google import in app/layout.tsx", () => {
    const dir = tmpDir();
    mkdirSync(join(dir, "app"), { recursive: true });
    writeFileSync(
      join(dir, "app", "layout.tsx"),
      `import { Inter } from "next/font/google";\nconst inter = Inter({ subsets: ["latin"] });\n`,
    );

    expect(extractBrand(dir).font).toBe("Inter");
  });

  it("returns an empty object for a repo with none of these patterns", () => {
    const dir = tmpDir();
    expect(extractBrand(dir)).toEqual({});
  });
});
