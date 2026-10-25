/** Thrown by `resolveTemplate`/`resolveTemplatesDeep` for a `{{path}}` that has no data. */
export class UnresolvedTemplateError extends Error {
  constructor(public readonly path: string) {
    super(`unresolved template placeholder "{{${path}}}" — no "${path}" in this walkthrough's data`);
    this.name = "UnresolvedTemplateError";
  }
}

/**
 * Resolves `{{path}}` placeholders against a walkthrough's `data` block,
 * e.g. `{{competitor.firstName}}` reads `data.competitor.firstName`.
 * Placeholders are left in walkthrough actions as authored — capture (M2)
 * calls this at run time, once real values are known.
 *
 * Throws `UnresolvedTemplateError` naming the path if a placeholder has no matching
 * data — left in place silently, it used to pass `{{x}}` straight through to clicks/fills
 * and fail confusingly downstream instead of at the source.
 */
export function resolveTemplate(text: string, data: unknown): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_whole, path: string) => {
    const value = getPath(data, path);
    if (value === undefined) {
      throw new UnresolvedTemplateError(path);
    }
    return String(value);
  });
}

/** Resolves every string field in a JSON-like value, recursively. */
export function resolveTemplatesDeep<T>(value: T, data: unknown): T {
  if (typeof value === "string") {
    return resolveTemplate(value, data) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveTemplatesDeep(v, data)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveTemplatesDeep(v, data);
    }
    return out as T;
  }
  return value;
}

/**
 * Finds every `{{path}}` placeholder in a JSON-like value that has no matching data, without
 * throwing — used by `validate` to report every unresolved template across a walkthrough in
 * one pass, rather than stopping at the first one.
 */
export function findUnresolvedTemplates(value: unknown, data: unknown): string[] {
  const unresolved: string[] = [];
  collectUnresolvedTemplates(value, data, unresolved);
  return unresolved;
}

function collectUnresolvedTemplates(value: unknown, data: unknown, out: string[]): void {
  if (typeof value === "string") {
    for (const m of value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
      const path = m[1];
      if (getPath(data, path) === undefined) out.push(path);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectUnresolvedTemplates(v, data, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectUnresolvedTemplates(v, data, out);
    }
  }
}

function getPath(data: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, data);
}
