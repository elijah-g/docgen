// Retrieval step of the chat pipeline (docs/scope.md "Help chat"; build-plan.md M15 step 4):
// top-k search-index sections, boosted by the in-app widget's current page, plus the best
// matching procedure (for the step screenshot + video jump).
import { LexicalSearchProvider, type SearchHit, type SearchIndexEntry } from "../index-search/index.js";
import type { Procedure } from "../procedures/index.js";
import type { RetrievedContext } from "./types.js";

/** URLs to boost for this request: the current in-app page itself, plus every procedure whose
 * `start.page` or `impactRoutes` match it (scope.md "Help chat": "boosts docs whose walkthrough
 * start.page or impact routes match"). */
function boostUrlsFor(currentPath: string | undefined, procedures: Procedure[]): string[] {
  if (!currentPath) return [];
  const urls = [currentPath];
  for (const proc of procedures) {
    const matches = proc.start.page === currentPath || (proc.impactRoutes ?? []).includes(currentPath);
    if (matches) urls.push(`/${proc.id}`);
  }
  return urls;
}

/** The procedure whose walkthrough id matches one of the retrieved hits' URLs most closely —
 * matched by url path prefix, since a page's URL is `/<id>` (content/docs/<id>/index.mdx). */
function matchingProcedure(hits: SearchHit[], procedures: Procedure[], currentPath: string | undefined): Procedure | undefined {
  for (const hit of hits) {
    const id = hit.url.split("#")[0].replace(/^\//, "");
    const proc = procedures.find((p) => p.id === id);
    if (proc) return proc;
  }
  if (currentPath) {
    return procedures.find((p) => p.start.page === currentPath || (p.impactRoutes ?? []).includes(currentPath));
  }
  return undefined;
}

export function retrieve(
  question: string,
  searchIndexEntries: SearchIndexEntry[],
  procedures: Procedure[],
  opts: { currentPath?: string; limit?: number } = {},
): RetrievedContext {
  const provider = new LexicalSearchProvider(searchIndexEntries);
  const boostUrls = boostUrlsFor(opts.currentPath, procedures);
  const hits = provider.search(question, { limit: opts.limit ?? 5, boostUrls });
  const procedure = matchingProcedure(hits, procedures, opts.currentPath);
  const topScore = hits.length > 0 ? hits[0].score : 0;
  return { hits, procedure, topScore };
}
