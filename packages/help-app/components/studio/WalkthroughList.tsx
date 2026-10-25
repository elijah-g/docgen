"use client";
import { cn } from "@/lib/cn";
import type { WalkthroughSummary } from "./types";

export function WalkthroughList({
  walkthroughs,
  selectedId,
  onSelect,
}: {
  walkthroughs: WalkthroughSummary[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  if (walkthroughs.length === 0) {
    return <p className="p-3 text-sm text-fd-muted-foreground">No walkthroughs found under ./walkthroughs.</p>;
  }
  return (
    <ul className="flex flex-col gap-1 p-2">
      {walkthroughs.map((w) => (
        <li key={w.id}>
          <button
            type="button"
            onClick={() => onSelect(w.id)}
            className={cn(
              "w-full rounded-md px-3 py-2 text-left text-sm",
              w.id === selectedId ? "bg-fd-primary/10 font-medium text-fd-primary" : "hover:bg-fd-muted",
            )}
          >
            <div>{w.title}</div>
            <div className="text-xs text-fd-muted-foreground">
              {w.id} · {w.stepCount} step{w.stepCount === 1 ? "" : "s"}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
