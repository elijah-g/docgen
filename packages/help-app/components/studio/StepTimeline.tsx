"use client";
import { cn } from "@/lib/cn";
import type { StudioStep } from "./types";

// ~14 characters/second is a rough, locale-agnostic stand-in for a spoken narration's length —
// close enough for a timeline's relative bar widths; the exact figure (voice.ts's measured audio
// duration) only exists once narration has been synthesized, which the Studio doesn't require
// just to lay out steps. Floors at 1.5s so an empty/very short line still shows a visible bar.
function estimateSeconds(step: StudioStep): number {
  const say = step.say ?? "";
  return Math.max(1.5, say.length / 14) + (step.hold ?? 0);
}

/** A simple horizontal timeline (M22): one block per step, width proportional to its estimated
 * duration (narration length + hold), labelled with its title/id. Clicking a block selects that
 * step, same as clicking its card in the main list. */
export function StepTimeline({
  steps,
  selectedStepId,
  onSelect,
}: {
  steps: StudioStep[];
  selectedStepId?: string;
  onSelect: (stepId: string) => void;
}) {
  if (steps.length === 0) return null;
  const durations = steps.map(estimateSeconds);
  const total = durations.reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="flex flex-col gap-1 border-b p-3">
      <div className="flex items-center justify-between text-xs text-fd-muted-foreground">
        <span>Timeline</span>
        <span>~{Math.round(total)}s total</span>
      </div>
      <div className="flex h-10 w-full overflow-hidden rounded-md border border-fd-border">
        {steps.map((step, i) => {
          const widthPct = (durations[i] / total) * 100;
          const selected = step.id === selectedStepId;
          return (
            <button
              key={step.id ?? i}
              type="button"
              title={`${step.title ?? step.id ?? `Step ${i + 1}`} · ~${durations[i].toFixed(1)}s`}
              onClick={() => step.id && onSelect(step.id)}
              style={{ width: `${widthPct}%` }}
              className={cn(
                "flex items-center justify-center truncate border-r border-fd-border/60 px-1 text-[10px] last:border-r-0",
                selected ? "bg-fd-primary text-fd-primary-foreground" : "bg-fd-muted hover:bg-fd-muted/70",
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
