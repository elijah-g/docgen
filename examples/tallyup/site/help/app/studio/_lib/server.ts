// Server-only helpers shared by the Studio's route handlers. Thin by design (AGENTS.md: "keep
// the app thin, put logic in the engine package") — this just resolves file paths for the
// conventional `docgen init` layout (docgen.config.ts at the help app root, walkthroughsDir:
// "./walkthroughs", outDir: ".") and calls straight into the "docgen" engine package for
// everything else.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
// Deep imports (not the "docgen" package barrel): the barrel's index.ts re-exports the capture/
// voice/config modules too, and config/load.ts does a non-literal dynamic `import()` that
// Turbopack/webpack can't trace statically, which breaks bundling route handlers that pull in
// the barrel. Importing the specific submodules this file needs avoids that entirely.
import { loadWalkthroughFile, type Walkthrough } from "docgen/dist/walkthrough/index.js";
import type { CaptureManifest } from "docgen/dist/capture/types.js";

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

// Matches `docgen.config.ts`'s `buildDir: "..."` field (defineConfig's own generated shape —
// see packages/engine/src/init/*.ts's scaffold and config/types.ts's `DocgenConfig.buildDir`).
// A plain text regex, not `config/load.ts`'s real loader: that loader's dynamic, non-literal
// `import(pathToFileURL(file).href)` is exactly what this file's other deep imports (see header
// comment) avoid, because it stops Turbopack/webpack from statically tracing a route handler
// that pulls it in. Reading the one field the Studio needs as plain text sidesteps that entirely
// — at the cost of only understanding a literal string (no template/computed path), which is
// what every `docgen init`-generated config and the documented config shape both already use.
function configuredBuildDir(): string {
  for (const name of ["docgen.config.ts", "docgen.config.mjs", "docgen.config.js"]) {
    const file = join(helpRoot(), name);
    // Same reasoning render/edit/page.js's own `resolve(opts.pagesDir)` already carries this
    // comment for: the path really is help-root-scoped at runtime (never user/request input —
    // `name` above is one of three hardcoded literals), Turbopack's static tracer just can't see
    // that through `helpRoot()`'s indirection.
    if (!existsSync(/* turbopackIgnore: true */ file)) continue;
    const text = readFileSync(/* turbopackIgnore: true */ file, "utf8");
    const m = text.match(/buildDir\s*:\s*["'`]([^"'`]+)["'`]/);
    if (m) return m[1];
    break;
  }
  return ".build";
}

/** `<config.buildDir>/<id>/capture` (default `.build`, same as `config/load.ts`'s own default)
 * — read-only lookups go through this (manifest + frame bytes for the screenshot editor); the
 * Studio never writes here. */
export function captureDirFor(id: string): string {
  assertSlug(id);
  const buildDir = configuredBuildDir();
  const resolved = isAbsolute(buildDir) ? buildDir : join(helpRoot(), buildDir);
  return join(resolved, id, "capture");
}

/** The latest capture manifest for a walkthrough, or `undefined` if it hasn't been captured
 * (yet, or ever) under this help app. */
export function readManifest(id: string): CaptureManifest | undefined {
  const file = join(captureDirFor(id), "manifest.json");
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as CaptureManifest;
  } catch {
    return undefined;
  }
}

/** Resolves a step's captured frame image to an absolute path inside `captureDir/frames/`, or
 * `undefined` if the walkthrough/step/frame isn't there. 1-based `stepNumber` matches how the
 * rest of the Studio (and pages/build.ts) numbers steps for people. */
export function frameFileFor(id: string, stepNumber: number): string | undefined {
  const manifest = readManifest(id);
  const step = manifest?.steps[stepNumber - 1];
  const image = step?.doc.image;
  if (!manifest || !step || !image) return undefined;
  const framesDir = join(captureDirFor(id), "frames");
  const file = join(framesDir, image);
  assertInside(framesDir, file);
  if (!existsSync(file)) return undefined;
  return file;
}
