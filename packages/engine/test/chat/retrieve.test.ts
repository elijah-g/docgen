import { describe, expect, it } from "vitest";
import { retrieve } from "../../src/chat/retrieve.js";
import type { SearchIndexEntry } from "../../src/index-search/index.js";
import type { Procedure } from "../../src/procedures/index.js";

const entries: SearchIndexEntry[] = [
  { url: "/add-competitor", title: "Add a competitor", text: "Click Add competitor to create a new competitor record." },
  { url: "/add-competitor", title: "Add a competitor", heading: "Search first", text: "Search competitors before adding a duplicate." },
  { url: "/invoices", title: "Invoices", text: "Invoices list every payment received this show." },
];

const procedures: Procedure[] = [
  {
    id: "add-competitor",
    title: "Add a competitor",
    start: { page: "/competitors", role: "office-staff" },
    steps: [{ n: 1, title: "Open competitors", instruction: "Click Competitors.", screenshot: "/screenshots/add-competitor/step-01.png" }],
    impactRoutes: ["/competitors"],
  },
];

describe("retrieve", () => {
  it("ranks the most relevant section first for a matching query", () => {
    const result = retrieve("how do I add a competitor", entries, procedures);
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits[0].url.startsWith("/add-competitor")).toBe(true);
    expect(result.hits.some((h) => h.url.startsWith("/invoices"))).toBe(false);
  });

  it("boosts hits matching the current in-app page and attaches the matching procedure", () => {
    const withoutBoost = retrieve("competitor", entries, procedures);
    const withBoost = retrieve("competitor", entries, procedures, { currentPath: "/competitors" });
    // The boosted search still ranks /add-competitor on top either way (it's the best lexical
    // match already) — what the boost changes is the score, which should increase.
    const scoreWithout = withoutBoost.hits.find((h) => h.url === "/add-competitor")?.score ?? 0;
    const scoreWith = withBoost.hits.find((h) => h.url === "/add-competitor")?.score ?? 0;
    expect(scoreWith).toBeGreaterThan(scoreWithout);
    expect(withBoost.procedure?.id).toBe("add-competitor");
  });

  it("returns a zero top score and no procedure for a question nothing matches", () => {
    const result = retrieve("gibberish nonsense zzzzz", entries, procedures);
    expect(result.topScore).toBe(0);
    expect(result.procedure).toBeUndefined();
  });
});
