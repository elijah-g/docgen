// Server-only helpers shared by the Studio's route handlers. Thin by design (AGENTS.md: "keep
// the app thin, put logic in the engine package") — this just resolves file paths for the
// conventional `docgen init` layout (docgen.config.ts at the help app root, walkthroughsDir:
// "./walkthroughs", outDir: ".") and calls straight into the "docgen" engine package for
// everything else.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
// Deep imports (not the "docgen" package barrel): the barrel's index.ts re-exports the capture/
// voice/config modules too, and config/load.ts does a non-literal dynamic `import()` that
// Turbopack/webpack can't trace statically, which breaks bundling route handlers that pull in
// the barrel. Importing the specific submodules this file needs avoids that entirely.
import { loadWalkthroughFile, type Walkthrough } from "docgen/dist/walkthrough/index.js";

/** The help app root — route handlers run with cwd at the help app root in both `next dev` and
 * `next start`. */
export function helpRoot(): string {
  return process.cwd();
}

export function walkthroughsDir(): string {
  return join(helpRoot(), "walkthroughs");
}

export function pagesDir(): string {
  return join(helpRoot(), "pages");
}

// Same slug the engine's walkthrough schema enforces for a walkthrough's own `walkthrough` id
// (packages/engine/src/walkthrough/schema.ts) — lowercase letters/digits, starting with one,
// hyphens as separators. Every route handler validates an id against this before using it,
// rather than trusting a request body/query string to be well-formed.
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function isSlug(id: string): boolean {
  return SLUG_PATTERN.test(id);
}

export function assertSlug(id: string): void {
  if (!isSlug(id)) throw new Error(`"${id}" is not a valid walkthrough id`);
}

/** Throws unless `file` resolves to inside `dir` — a belt-and-suspenders check behind
 * resolveWalkthroughFile/pageFileFor, which already only ever return paths they found by
 * listing `dir` themselves (never a caller-supplied path), so this should never actually fire. */
function assertInside(dir: string, file: string): void {
  const rel = relative(resolve(dir), resolve(file));
  if (rel.startsWith("..") || rel.split(/[\\/]/)[0] === "..") {
    throw new Error(`"${file}" resolved outside ${dir}`);
  }
}

export interface WalkthroughSummary {
  id: string;
  file: string;
  title: string;
  stepCount: number;
}

/** Every walkthrough under walkthroughsDir, parsed enough to list in the Studio sidebar. Files
 * that fail to parse are skipped rather than failing the whole list. */
export function listWalkthroughs(): WalkthroughSummary[] {
  const dir = walkthroughsDir();
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => [".yaml", ".yml"].includes(extname(f)));
  const out: WalkthroughSummary[] = [];
  for (const f of files) {
    const file = join(dir, f);
    try {
      const wt = loadWalkthroughFile(file);
      out.push({ id: wt.walkthrough, file, title: wt.title, stepCount: wt.steps.length });
    } catch {
      // Skip invalid files — the Studio lists what it can; `docgen validate` reports the rest.
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

/** Resolves a walkthrough id to its YAML file, scanning walkthroughsDir. Throws if not found. */
export function resolveWalkthroughFile(id: string): string {
  assertSlug(id);
  const match = listWalkthroughs().find((w) => w.id === id);
  if (!match) throw new Error(`no walkthrough "${id}" under ${walkthroughsDir()}`);
  assertInside(walkthroughsDir(), match.file);
  return match.file;
}

export function loadWalkthroughById(id: string): Walkthrough {
  return loadWalkthroughFile(resolveWalkthroughFile(id));
}

/** The built page file for a walkthrough, if `docgen pages`/`docgen build` has run — tries the
 * `.mdx` then `.md` conventional output path (outDir: "."  -> ./pages/<id>/index.*). Returns
 * undefined if no page has been built yet. */
export function pageFileFor(id: string): string | undefined {
  assertSlug(id);
  const dir = join(pagesDir(), id);
  for (const name of ["index.mdx", "index.md"]) {
    const file = join(dir, name);
    if (existsSync(file)) {
      assertInside(pagesDir(), file);
      return file;
    }
  }
  return undefined;
}

export function readPageText(id: string): { file?: string; text?: string } {
  const file = pageFileFor(id);
  if (!file) return {};
  return { file, text: readFileSync(file, "utf8") };
}
