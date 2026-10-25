import { readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import {
  findUnresolvedTemplates,
  loadWalkthroughFile,
  WalkthroughValidationError,
  type Walkthrough,
} from "../walkthrough/index.js";

export interface ValidateResult {
  file: string;
  ok: boolean;
  walkthrough?: string;
  errors?: { message: string; line?: number; path: string }[];
}

/** Finds `.yaml`/`.yml` files under a directory, or returns a single file as-is. */
export function findWalkthroughFiles(target: string): string[] {
  const stat = statSync(target);
  if (stat.isFile()) return [target];

  const files: string[] = [];
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    const path = join(target, entry.name);
    if (entry.isDirectory()) {
      files.push(...findWalkthroughFiles(path));
    } else if ([".yaml", ".yml"].includes(extname(entry.name))) {
      files.push(path);
    }
  }
  return files.sort();
}

/** Every `{{path}}` in `wt` with no matching `data`, across steps/intro/outro/validate. */
function unresolvedTemplatesIn(wt: Walkthrough): string[] {
  const data = wt.data ?? {};
  const unresolved = new Set<string>();
  for (const p of findUnresolvedTemplates(wt.steps, data)) unresolved.add(p);
  if (wt.intro) for (const p of findUnresolvedTemplates(wt.intro, data)) unresolved.add(p);
  if (wt.outro) for (const p of findUnresolvedTemplates(wt.outro, data)) unresolved.add(p);
  if (wt.validate) for (const p of findUnresolvedTemplates(wt.validate, data)) unresolved.add(p);
  return [...unresolved];
}

/** Marks every result sharing a `walkthrough` id with another file in the same run as invalid. */
function markDuplicateIds(results: ValidateResult[]): ValidateResult[] {
  const filesById = new Map<string, string[]>();
  for (const r of results) {
    if (r.ok && r.walkthrough) {
      filesById.set(r.walkthrough, [...(filesById.get(r.walkthrough) ?? []), r.file]);
    }
  }
  const duplicateIds = new Set([...filesById.entries()].filter(([, files]) => files.length > 1).map(([id]) => id));
  if (duplicateIds.size === 0) return results;

  return results.map((r) => {
    if (!r.ok || !r.walkthrough || !duplicateIds.has(r.walkthrough)) return r;
    const others = filesById.get(r.walkthrough)!.filter((f) => f !== r.file);
    return {
      ...r,
      ok: false,
      errors: [
        {
          message: `duplicate walkthrough id "${r.walkthrough}" — also used by ${others.join(", ")}`,
          path: "walkthrough",
        },
      ],
    };
  });
}

/** Validates one file: schema/YAML errors, plus unresolved `{{...}}` templates against `data`. */
function validateFile(file: string): ValidateResult {
  try {
    const walkthrough = loadWalkthroughFile(file);
    const unresolved = unresolvedTemplatesIn(walkthrough);
    if (unresolved.length > 0) {
      return {
        file,
        ok: false,
        walkthrough: walkthrough.walkthrough,
        errors: unresolved.map((path) => ({
          message: `unresolved template placeholder {{${path}}}`,
          path,
        })),
      };
    }
    return { file, ok: true, walkthrough: walkthrough.walkthrough };
  } catch (err) {
    if (err instanceof WalkthroughValidationError) {
      return { file, ok: false, errors: err.errors };
    }
    // Any other failure (unreadable file, unexpected throw) — one short line, never a stack.
    const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
    return { file, ok: false, errors: [{ message, path: "" }] };
  }
}

export function validatePath(target: string): ValidateResult[] {
  const results = findWalkthroughFiles(target).map(validateFile);
  return markDuplicateIds(results);
}

export function runValidate(target: string, json: boolean): number {
  let results: ValidateResult[];
  try {
    results = validatePath(target);
  } catch (err) {
    // e.g. `target` doesn't exist — findWalkthroughFiles/statSync throws outside the
    // per-file try/catch. Report one short line instead of a raw stack, even with --json.
    const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
    if (json) {
      console.log(JSON.stringify({ total: 0, invalid: 0, results: [], error: message }));
    } else {
      console.error(`error: ${message}`);
    }
    return 1;
  }

  const invalid = results.filter((r) => !r.ok);

  if (json) {
    console.log(JSON.stringify({ total: results.length, invalid: invalid.length, results }));
  } else if (results.length === 0) {
    console.log(`no walkthroughs found under ${target}`);
  } else {
    for (const r of results) {
      if (r.ok) {
        console.log(`ok    ${r.file} (${r.walkthrough})`);
      } else {
        console.log(`fail  ${r.file}`);
        for (const e of r.errors ?? []) {
          console.log(`      ${e.line ? `line ${e.line}: ` : ""}${e.message}`);
        }
      }
    }
    console.log(`${results.length - invalid.length}/${results.length} walkthroughs valid`);
  }
  return invalid.length === 0 ? 0 : 1;
}
