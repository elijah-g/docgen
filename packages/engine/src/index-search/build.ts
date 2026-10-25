// Builds the help app's client-side search index (scope.md "Swappable
// providers" / M7 scope item 6): walks a Fumadocs `content/` directory, pulls
// each page's frontmatter + headings, and writes one flat JSON file read by
// help-app/components/search-box.tsx — no server, no database, works on a
// fully static export. `docgen build` calls this after the page builder
// (packages/engine/src/pages) has written content/.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import type { BuildSearchIndexResult, SearchIndexEntry } from "./types.js";

const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx"]);
// Matches both the legacy HTML-comment marker (`<!-- docgen:begin key -->`) and the current
// MDX-comment form (`{/* docgen:begin key */}`) — see pages/markers.ts. Previously only the
// HTML form was stripped, so an MDX page's markers leaked into search snippets verbatim.
const DOCGEN_MARKER = /<!--\s*docgen:(?:begin|end)[^>]*-->|\{\/\*\s*docgen:(?:begin|end)[^*]*\*\/\}/g;
const SNIPPET_LENGTH = 300;

function findContentFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (MARKDOWN_EXTENSIONS.has(extname(entry.name))) {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out.sort();
}

function parseFrontmatter(raw: string): { data: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, body: raw };
  const data = (parseYaml(match[1]) as Record<string, unknown>) ?? {};
  return { data, body: raw.slice(match[0].length) };
}

/** `content/docs/how-do-i/add-competitor/index.md` -> `/how-do-i/add-competitor`; `content/docs/index.mdx` -> `/`. */
function urlFor(contentDir: string, file: string): string {
  const rel = relative(contentDir, file).split(sep).join("/");
  const withoutExt = rel.replace(/\.(mdx?|md)$/, "");
  const withoutIndex = withoutExt.replace(/(^|\/)index$/, "");
  return withoutIndex === "" ? "/" : `/${withoutIndex}`;
}

/** Exported for reuse by procedures/build.ts (walkthrough `page_text` -> plain instruction). */
export function stripMarkdown(text: string): string {
  return text
    .replace(DOCGEN_MARKER, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links -> link text
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits a page body into a lead section (before the first heading) and one section per `##`/`###` heading. */
function sectionsOf(body: string): { heading?: string; text: string }[] {
  const lines = body.split("\n");
  const sections: { heading?: string; text: string }[] = [];
  let current: { heading?: string; text: string } = { text: "" };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{2,3})\s+(.*)$/);
    if (headingMatch) {
      if (current.text.trim()) sections.push(current);
      current = { heading: stripMarkdown(headingMatch[2]), text: "" };
    } else {
      current.text += `${line}\n`;
    }
  }
  if (current.text.trim() || current.heading) sections.push(current);

  return sections
    .map((s) => ({ heading: s.heading, text: stripMarkdown(s.text).slice(0, SNIPPET_LENGTH) }))
    .filter((s) => s.text.length > 0 || s.heading);
}

/**
 * Walks `contentDir` (a Fumadocs `content/docs`-style tree) and builds a flat search index: one
 * entry per page lead paragraph plus one per heading. Pages whose frontmatter sets `passed: false`
 * are skipped, matching the page builder's publish filter. Pass `outFile` to also write the result
 * as JSON (the shape `help-app`'s search box fetches).
 */
export function buildSearchIndex(contentDir: string, outFile?: string): BuildSearchIndexResult {
  const files = existsSync(contentDir) ? findContentFiles(contentDir) : [];
  const entries: SearchIndexEntry[] = [];
  let pageCount = 0;

  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const { data, body } = parseFrontmatter(raw);
    if (data.passed === false) continue;

    const title = typeof data.title === "string" ? data.title : relative(contentDir, file);
    const url = urlFor(contentDir, file);
    pageCount += 1;

    for (const section of sectionsOf(body)) {
      entries.push({ url, title, heading: section.heading, text: section.text });
    }
  }

  const result: BuildSearchIndexResult = { entries, pageCount };

  if (outFile) {
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, JSON.stringify(entries, null, 2), "utf8");
    result.outFile = outFile;
  }

  return result;
}
