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
    if (matches) urls.push(procedureUrl(proc));
  }
  return urls;
}

/** A procedure's page URL: its `url` (the nested library URL, e.g.
 * "/how-do-i/payments/record-a-payment"), or the legacy flat `/<id>` for a procedures.json
 * written before pages were nested. */
export function procedureUrl(proc: Procedure): string {
  return proc.url ?? `/${proc.id}`;
}

/** The procedure whose page one of the retrieved hits is on — matched by the page URL (hit URL
 * without its `#anchor`), falling back to the URL's last segment, which is always the
 * walkthrough id (walkthrough/placement.ts) — so an older flat `/<id>` index still matches. */
function matchingProcedure(hits: SearchHit[], procedures: Procedure[], currentPath: string | undefined): Procedure | undefined {
  for (const hit of hits) {
    const pageUrl = hit.url.split("#")[0].replace(/\/+$/, "");
    const lastSegment = pageUrl.split("/").pop() ?? "";
    const proc = procedures.find((p) => procedureUrl(p) === pageUrl) ?? procedures.find((p) => p.id === lastSegment);
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
