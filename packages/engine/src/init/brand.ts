// Best-effort brand guesser for `docgen init` (scope.md "Theme from config":
// "brand colours/logo/font name in docgen.config.ts -> CSS variables"). Reads
// a handful of conventional files in a Next.js/Tailwind repo and never writes
// anything. Every field is optional — a repo that doesn't match any pattern
// just gets an empty `BrandConfig`, and `docgen init` falls back to the
// template's defaults.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { BrandConfig } from "../config/types.js";

const CSS_CANDIDATES = [
  join("app", "globals.css"),
  join("src", "app", "globals.css"),
  join("styles", "globals.css"),
  join("src", "styles", "globals.css"),
];

const TAILWIND_CONFIG_CANDIDATES = ["tailwind.config.ts", "tailwind.config.js", "tailwind.config.mjs", "tailwind.config.cjs"];

const LAYOUT_CANDIDATES = [join("app", "layout.tsx"), join("src", "app", "layout.tsx"), join("app", "layout.jsx")];

function readIfExists(repoDir: string, relPath: string): string | undefined {
  const file = join(repoDir, relPath);
  if (!existsSync(file)) return undefined;
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

function firstExisting(repoDir: string, candidates: string[]): { relPath: string; content: string } | undefined {
  for (const rel of candidates) {
    const content = readIfExists(repoDir, rel);
    if (content !== undefined) return { relPath: rel, content };
  }
  return undefined;
}

/** `--primary: 235 55% 42%;` (or `#hex`/`rgb(...)`) inside a `:root { ... }` block. */
function primaryFromCss(css: string): string | undefined {
  const rootMatch = css.match(/:root\s*{([^}]*)}/);
  const scope = rootMatch ? rootMatch[1] : css;
  const match = scope.match(/--(?:primary|brand|brand-primary)\s*:\s*([^;]+);/i);
  return match ? match[1].trim() : undefined;
}

function fontFromCss(css: string): string | undefined {
  const rootMatch = css.match(/:root\s*{([^}]*)}/);
  const scope = rootMatch ? rootMatch[1] : css;
  const match = scope.match(/--font-sans\s*:\s*([^;]+);/i);
  return match ? match[1].trim() : undefined;
}

/** `primary: { DEFAULT: "#4338ca" }` or `primary: "hsl(var(--primary))"` in a Tailwind config — only resolves a literal colour, not a CSS var reference. */
function primaryFromTailwindConfig(src: string): string | undefined {
  const block = src.match(/primary\s*:\s*\{([^}]*)\}/);
  if (block) {
    const defaultMatch = block[1].match(/DEFAULT\s*:\s*['"`]([^'"`]+)['"`]/);
    if (defaultMatch && !defaultMatch[1].includes("var(")) return defaultMatch[1];
  }
  const literal = src.match(/primary\s*:\s*['"`]([^'"`]+)['"`]/);
  if (literal && !literal[1].includes("var(")) return literal[1];
  return undefined;
}

/** First `next/font/google` import's export name, e.g. `import { Inter } from "next/font/google"` -> "Inter". */
function fontFromLayout(src: string): string | undefined {
  const match = src.match(/import\s*\{\s*([A-Z][A-Za-z0-9_]*)/);
  if (match && src.includes("next/font/google")) return match[1];
  return undefined;
}

function findLogo(repoDir: string): string | undefined {
  const publicDir = join(repoDir, "public");
  if (!existsSync(publicDir)) return undefined;
  let entries: string[] = [];
  try {
    entries = readdirSync(publicDir).filter((f) => /logo/i.test(f));
  } catch {
    return undefined;
  }
  if (entries.length === 0) return undefined;
  // Prefer a named brand logo over a generic scaffold placeholder, then a
  // "main" variant, then a vector format, then whatever sorts first.
  const nonPlaceholder = entries.filter((f) => !/placeholder/i.test(f));
  const pool = nonPlaceholder.length > 0 ? nonPlaceholder : entries;
  pool.sort((a, b) => {
    const score = (f: string) => (/main/i.test(f) ? 0 : f.endsWith(".svg") ? 1 : 2);
    return score(a) - score(b) || a.localeCompare(b);
  });
  return join("public", pool[0]);
}

/**
 * Guesses a Next.js/Tailwind repo's primary colour, logo and font, read-only.
 * Tries `app/globals.css`'s `:root` CSS vars first (shadcn/Tailwind v3 convention), then a
 * Tailwind config's `theme.colors.primary`, then a `next/font/google` import in `app/layout.tsx`.
 */
export function extractBrand(repoDir: string): BrandConfig {
  const brand: BrandConfig = {};

  const css = firstExisting(repoDir, CSS_CANDIDATES);
  if (css) {
    brand.primaryColor = primaryFromCss(css.content);
    brand.font = fontFromCss(css.content);
  }

  if (!brand.primaryColor) {
    const tw = firstExisting(repoDir, TAILWIND_CONFIG_CANDIDATES);
    if (tw) brand.primaryColor = primaryFromTailwindConfig(tw.content);
  }

  if (!brand.font) {
    const layout = firstExisting(repoDir, LAYOUT_CANDIDATES);
    if (layout) brand.font = fontFromLayout(layout.content);
  }

  const logo = findLogo(repoDir);
  if (logo) brand.logo = logo;

  return brand;
}
