// Client-side search over the engine-built public/search-index.json (see
// packages/engine/src/index-search). No server route, no database — this is
// the "Search" row of scope.md's Swappable providers table: built in by
// default, works on a fully static export. Sites that outgrow it can swap in
// Supabase pgvector, Upstash Vector or Cloudflare Vectorize behind the same
// SearchResult shape without changing this component's props.
"use client";

import { useEffect, useMemo, useState } from "react";

export interface SearchIndexEntry {
  url: string;
  title: string;
  heading?: string;
  text: string;
}

export function SearchBox() {
  const [index, setIndex] = useState<SearchIndexEntry[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/search-index.json")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: SearchIndexEntry[]) => setIndex(Array.isArray(data) ? data : []))
      .catch(() => setIndex([]));
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return index
      .filter(
        (entry) =>
          entry.title.toLowerCase().includes(q) ||
          entry.heading?.toLowerCase().includes(q) ||
          entry.text.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [index, query]);

  return (
    <div className="not-prose">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the help site…"
        className="w-full rounded-md border px-3 py-2 text-sm"
        aria-label="Search the help site"
      />
      {results.length > 0 ? (
        <ul className="mt-2 divide-y rounded-md border text-sm">
          {results.map((r) => (
            <li key={`${r.url}-${r.heading ?? ""}`}>
              <a href={r.url} className="block px-3 py-2 hover:bg-fd-accent">
                <div className="font-medium">{r.heading ? `${r.title} — ${r.heading}` : r.title}</div>
                <div className="text-fd-muted-foreground line-clamp-1">{r.text}</div>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
