import { readFileSync } from "node:fs";
import * as YAML from "yaml";
import { WalkthroughDocSchema, docToWalkthrough } from "./schema.js";
import type { Walkthrough } from "./types.js";

/** A validation problem with a short message and, where known, a location. */
export interface WalkthroughError {
  message: string;
  file: string;
  line?: number;
  path: string;
}

export class WalkthroughValidationError extends Error {
  constructor(public readonly errors: WalkthroughError[]) {
    super(errors.map((e) => formatError(e)).join("\n"));
    this.name = "WalkthroughValidationError";
  }
}

function formatError(e: WalkthroughError): string {
  const loc = e.line ? `${e.file}:${e.line}` : e.file;
  return `${loc}: ${e.message}${e.path ? ` (at ${e.path})` : ""}`;
}

/** Parses and validates one walkthrough YAML file, returning its typed form. */
export function loadWalkthroughFile(file: string): Walkthrough {
  const text = readFileSync(file, "utf8");
  return loadWalkthroughText(text, file);
}

/** Parses and validates walkthrough YAML already read into memory. */
export function loadWalkthroughText(text: string, file = "<walkthrough>"): Walkthrough {
  const lineCounter = new YAML.LineCounter();
  let doc: YAML.Document.Parsed;
  try {
    doc = YAML.parseDocument(text, { lineCounter, prettyErrors: true });
  } catch (err) {
    throw new WalkthroughValidationError([
      { message: `could not parse YAML: ${(err as Error).message}`, file, path: "" },
    ]);
  }
  if (doc.errors.length > 0) {
    throw new WalkthroughValidationError(
      doc.errors.map((e) => ({ message: e.message, file, line: lineOf(lineCounter, e), path: "" })),
    );
  }

  const raw: unknown = doc.toJS();
  const result = WalkthroughDocSchema.safeParse(raw);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => {
      const path = issue.path.join(".");
      const node = path ? doc.getIn(issue.path, true) : undefined;
      const line = node && hasRange(node) ? lineCounter.linePos(node.range[0]).line : undefined;
      return { message: issue.message, file, line, path };
    });
    throw new WalkthroughValidationError(errors);
  }

  return docToWalkthrough(result.data);
}

function hasRange(node: unknown): node is { range: [number, number, number] } {
  return Boolean(node && typeof node === "object" && "range" in node && Array.isArray((node as { range: unknown }).range));
}

function lineOf(lineCounter: YAML.LineCounter, e: { pos?: [number, number] }): number | undefined {
  return e.pos ? lineCounter.linePos(e.pos[0]).line : undefined;
}
