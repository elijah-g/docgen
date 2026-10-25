"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";
import type { StudioStep } from "./types";

const FIELDS: { key: "title" | "say" | "caption" | "page_text"; label: string; multiline?: boolean }[] = [
  { key: "title", label: "Title" },
  { key: "say", label: "Narration (say)", multiline: true },
  { key: "caption", label: "Caption", multiline: true },
  { key: "page_text", label: "Page text", multiline: true },
];

/** One step's inline-editable fields. Calls `onSave(field, value)` per field on blur (if
 * changed), so one field's typo doesn't block saving another. */
export function StepEditor({
  step,
  index,
  selected,
  onSelect,
  onSave,
  saving,
}: {
  step: StudioStep;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onSave: (field: "title" | "say" | "caption" | "page_text" | "hold", value: string | number) => void;
  saving: boolean;
}) {
  return (
    <div
      className={cn("rounded-lg border p-3", selected ? "border-fd-primary ring-1 ring-fd-primary" : "border-fd-border")}
      onClick={onSelect}
    >
      <div className="mb-2 flex items-center justify-between text-xs text-fd-muted-foreground">
        <span>
          Step {index + 1} {step.id ? `· ${step.id}` : ""}
        </span>
        <span>
          hold{" "}
          <input
            type="number"
            step="0.1"
            defaultValue={step.hold ?? ""}
            className="w-16 rounded border border-fd-border bg-transparent px-1 py-0.5 text-right"
            onBlur={(e) => {
              const v = e.target.value;
              if (v !== "") onSave("hold", Number(v));
            }}
          />
          s
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {FIELDS.map((f) => (
          <EditableField
            key={f.key}
            label={f.label}
            value={step[f.key] ?? ""}
            multiline={f.multiline}
            onCommit={(value) => onSave(f.key, value)}
          />
        ))}
      </div>
      {saving ? <p className="mt-1 text-xs text-fd-muted-foreground">Saving…</p> : null}
    </div>
  );
}

function EditableField({
  label,
  value,
  multiline,
  onCommit,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <label className="flex flex-col gap-0.5 text-sm">
      <span className="text-xs font-medium text-fd-muted-foreground">{label}</span>
      {multiline ? (
        <textarea
          className="min-h-16 rounded-md border border-fd-border bg-transparent px-2 py-1 text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== value) onCommit(draft);
          }}
        />
      ) : (
        <input
          className="rounded-md border border-fd-border bg-transparent px-2 py-1 text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== value) onCommit(draft);
          }}
        />
      )}
    </label>
  );
}
