// A large "search the help site" button (home page hero). Opens the same dialog as Ctrl/⌘ K.
"use client";

import { useSearchContext } from "fumadocs-ui/contexts/search";
import { Search } from "lucide-react";

export function SearchTrigger({ placeholder = "Search guides, steps and screens…" }: { placeholder?: string }) {
  const { setOpenSearch } = useSearchContext();
  return (
    <button
      type="button"
      onClick={() => setOpenSearch(true)}
      className="group flex w-full max-w-xl items-center gap-3 rounded-[calc(var(--brand-radius)+4px)] border border-fd-border bg-fd-card px-4 py-3 text-start text-fd-muted-foreground shadow-sm transition hover:border-fd-primary/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-fd-ring"
    >
      <Search className="size-5 shrink-0 text-fd-primary" />
      <span className="flex-1 truncate">{placeholder}</span>
      <kbd className="hidden rounded-md border border-fd-border bg-fd-muted px-1.5 py-0.5 font-sans text-xs sm:inline">⌘ K</kbd>
    </button>
  );
}
