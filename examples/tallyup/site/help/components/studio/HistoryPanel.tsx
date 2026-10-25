"use client";
import { cn } from "@/lib/cn";
import type { HistoryEntry } from "./types";

export function HistoryPanel({
  entries,
  onUndo,
  undoing,
}: {
  entries: HistoryEntry[];
  onUndo: (by?: "agent" | "person") => void;
  undoing: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 border-t p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">History</h2>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={undoing}
            onClick={() => onUndo()}
            className="rounded-md border border-fd-border px-2 py-1 text-xs hover:bg-fd-muted disabled:opacity-50"
          >
            Undo
          </button>
          <button
            type="button"
            disabled={undoing}
            onClick={() => onUndo("agent")}
            className="rounded-md border border-fd-border px-2 py-1 text-xs hover:bg-fd-muted disabled:opacity-50"
          >
            Undo agent's last
          </button>
        </div>
      </div>
      <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-xs">
        {entries.length === 0 ? <li className="text-fd-muted-foreground">No edits yet.</li> : null}
        {entries.map((e, i) => (
          <li key={i} className="flex items-center gap-2">
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                e.by === "person" ? "bg-fd-primary/10 text-fd-primary" : "bg-fd-muted text-fd-muted-foreground",
              )}
            >
              {e.by}
            </span>
            <span className="truncate">
              {e.action} {e.target}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
