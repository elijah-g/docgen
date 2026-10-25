"use client";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/cn";
import type { StudioBlur, StudioBox, StudioCallout, StudioManifestStep, StudioStep, StudioTarget } from "./types";

const STUDIO_TOKEN_HEADER = "x-docgen-studio-token";

type Mode = "callout" | "blur";

interface Draft {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The target each of a step's manifest-recorded `highlights` boxes came from, in the same order
 * `runner.ts` emits `highlight` events (and so builds `ManifestStep.doc.highlights`): one per
 * action whose `highlight` is truthy, in action order. `highlight: true` means "the action's own
 * target"; a `Target` object means "highlight a different element" — mirrors capture/runner.ts's
 * `highlightBox(page, a.highlight, a.target)`. Returns `undefined` at an index whose action has
 * no usable target (shouldn't happen if the manifest and walkthrough agree, but a mismatch — the
 * walkthrough edited since the last capture — must degrade to "pin by box", never throw). */
function highlightTargetsOf(step: StudioStep): (StudioTarget | undefined)[] {
  return (step.actions ?? [])
    .filter((a) => Boolean(a.highlight))
    .map((a) => (a.highlight === true ? a.target : (a.highlight as StudioTarget | undefined)));
}

interface DraftPin {
  box: StudioBox;
  /** Set when the drag was really a click that snapped onto a manifest highlight box whose
   * target we could resolve — writing `target:` instead of `box:` so the callout/blur follows
   * the element when the layout moves, same as M22's capture-side `target:` pinning. */
  target?: StudioTarget;
}

/** Converts a drag's two viewport-px corners into a pin: snapping to the nearest highlight box
 * (M22's "pin to the element under the pointer") when the drag is really a click (near-zero
 * area) that landed inside one — with its target, when `highlightTargetsOf` could resolve one —
 * otherwise the drawn box itself, clamped to a sane minimum size. */
function draftToPin(d: Draft, highlights: StudioBox[], highlightTargets: (StudioTarget | undefined)[]): DraftPin {
  const x = Math.min(d.x0, d.x1);
  const y = Math.min(d.y0, d.y1);
  const w = Math.abs(d.x1 - d.x0);
  const h = Math.abs(d.y1 - d.y0);
  if (w < 6 && h < 6) {
    const idx = highlights.findIndex((b) => d.x0 >= b.x && d.x0 <= b.x + b.w && d.y0 >= b.y && d.y0 <= b.y + b.h);
    if (idx !== -1) {
      const target = highlightTargets[idx];
      return target ? { box: highlights[idx], target } : { box: highlights[idx] };
    }
    return { box: { x: Math.round(x - 16), y: Math.round(y - 16), w: 32, h: 32 } };
  }
  return { box: { x: Math.round(x), y: Math.round(y), w: Math.round(Math.max(w, 4)), h: Math.round(Math.max(h, 4)) } };
}

export function ScreenshotEditor({
  walkthroughId,
  step,
  stepNumber,
  manifestStep,
  viewport,
  studioToken,
  onChanged,
}: {
  walkthroughId: string;
  step: StudioStep;
  stepNumber: number;
  manifestStep?: StudioManifestStep;
  viewport?: { width: number; height: number };
  studioToken: string;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<Mode>("callout");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string>();
  const [imgUrl, setImgUrl] = useState<string>();
  const wrapRef = useRef<HTMLDivElement>(null);
  const hasImage = Boolean(manifestStep?.image);

  // A plain <img src="..."> can't carry the Studio token header assertStudioRequest requires
  // (security.ts), so the screenshot is fetched here instead and handed to <img> as a blob URL.
  useEffect(() => {
    if (!hasImage) return;
    let cancelled = false;
    let objectUrl: string | undefined;
    fetch(`/studio/api/screenshot?id=${encodeURIComponent(walkthroughId)}&step=${stepNumber}`, {
      headers: { [STUDIO_TOKEN_HEADER]: studioToken },
    })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setImgUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setImgUrl(undefined);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [walkthroughId, stepNumber, studioToken, hasImage]);

  if (!manifestStep?.image || !viewport) {
    return (
      <p className="rounded-md border border-dashed border-fd-border p-3 text-xs text-fd-muted-foreground">
        No captured screenshot for this step yet — run <code>docgen capture</code> to add callouts or blur boxes here.
      </p>
    );
  }

  const vp = viewport;
  const callouts = step.callouts ?? [];
  const blurBoxes = step.blur ?? [];
  const highlightTargets = highlightTargetsOf(step);
  const resolvedCallouts = new Map((manifestStep.callouts ?? []).map((c) => [c.id, c.box]));
  const resolvedBlur = new Map((manifestStep.blur ?? []).map((b) => [b.id, b.box]));

  const toFraction = (b: StudioBox) => ({
    left: `${(b.x / viewport.width) * 100}%`,
    top: `${(b.y / viewport.height) * 100}%`,
    width: `${(b.w / viewport.width) * 100}%`,
    height: `${(b.h / viewport.height) * 100}%`,
  });

  function post<T>(body: unknown): Promise<T> {
    return fetch("/studio/api/edit", {
      method: "POST",
      headers: { "content-type": "application/json", [STUDIO_TOKEN_HEADER]: studioToken },
      body: JSON.stringify(body),
    }).then(async (res) => {
      const data = (await res.json()) as T & { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) throw new Error(data.error ?? `${res.status}`);
      return data;
    });
  }

  function pointerToViewportPx(e: ReactPointerEvent<HTMLDivElement>): { x: number; y: number } {
    const rect = wrapRef.current!.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    return { x: fx * vp.width, y: fy * vp.height };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const p = pointerToViewportPx(e);
    setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!draft) return;
    const p = pointerToViewportPx(e);
    setDraft({ ...draft, x1: p.x, y1: p.y });
  }
  function onPointerUp() {
    if (!draft) return;
    const pin = draftToPin(draft, manifestStep!.highlights, highlightTargets);
    setDraft(null);
    setError(undefined);
    const id = `${mode}-${Date.now().toString(36)}`;
    const action = mode === "callout" ? "addCallout" : "addBlur";
    const pinFields = pin.target ? { target: pin.target } : { box: pin.box };
    const payload =
      mode === "callout"
        ? { action, walkthroughId, stepId: step.id, callout: { id, ...pinFields } satisfies StudioCallout }
        : { action, walkthroughId, stepId: step.id, blur: { id, ...pinFields } satisfies StudioBlur };
    post(payload).then(onChanged).catch((err) => setError(String(err)));
  }

  function removeItem(kind: Mode, itemId: string) {
    const action = kind === "callout" ? "removeCallout" : "removeBlur";
    post({ action, walkthroughId, stepId: step.id, itemId }).then(onChanged).catch((err) => setError(String(err)));
  }

  function setLabel(itemId: string, label: string) {
    post({ action: "updateCallout", walkthroughId, stepId: step.id, itemId, patch: { label } })
      .then(onChanged)
      .catch((err) => setError(String(err)));
  }

  function move(itemId: string, dir: -1 | 1) {
    const ids = callouts.map((c) => c.id);
    const i = ids.indexOf(itemId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const newOrder = [...ids];
    [newOrder[i], newOrder[j]] = [newOrder[j], newOrder[i]];
    post({ action: "reorderCallouts", walkthroughId, stepId: step.id, newOrder }).then(onChanged).catch((err) => setError(String(err)));
  }

  const draftPin = draft ? draftToPin(draft, manifestStep.highlights, highlightTargets) : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium text-fd-muted-foreground">Click or drag on the screenshot to add:</span>
        <button
          type="button"
          onClick={() => setMode("callout")}
          className={cn("rounded-full px-2 py-0.5", mode === "callout" ? "bg-red-600 text-white" : "border border-fd-border")}
        >
          Numbered callout
        </button>
        <button
          type="button"
          onClick={() => setMode("blur")}
          className={cn("rounded-full px-2 py-0.5", mode === "blur" ? "bg-slate-700 text-white" : "border border-fd-border")}
        >
          Blur box
        </button>
      </div>

      <div
        ref={wrapRef}
        className="relative w-full cursor-crosshair select-none overflow-hidden rounded-md border border-fd-border"
        style={{ aspectRatio: `${viewport.width} / ${viewport.height}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- dev-only Studio, blob URL from our own fetch */}
        {imgUrl ? (
          <img src={imgUrl} alt={`Step ${stepNumber} screenshot`} className="absolute inset-0 h-full w-full" draggable={false} />
        ) : null}

        {blurBoxes.map((b) => {
          // A box-pinned item shows immediately from its own authored box (no capture needed);
          // a target-pinned one only shows once a capture run has resolved it into the manifest.
          const box = resolvedBlur.get(b.id) ?? b.box;
          if (!box) return null;
          return (
            <div
              key={b.id}
              className={cn("group absolute border-2 bg-slate-900/40", b.target ? "border-amber-400" : "border-slate-500")}
              style={toFraction(box)}
              title={b.target ? "Pinned to an element — follows it when the layout moves" : "Fixed position"}
            >
              <button
                type="button"
                onClick={() => removeItem("blur", b.id)}
                className="absolute -right-2 -top-2 hidden h-5 w-5 rounded-full bg-slate-700 text-[10px] text-white group-hover:block"
              >
                ×
              </button>
            </div>
          );
        })}

        {callouts.map((c, i) => {
          const box = resolvedCallouts.get(c.id) ?? c.box;
          if (!box) return null;
          return (
            <div
              key={c.id}
              className="group absolute"
              style={toFraction(box)}
              title={c.target ? "Pinned to an element — follows it when the layout moves" : "Fixed position"}
            >
              <span
                className={cn(
                  "absolute -left-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white shadow",
                  c.target ? "bg-amber-500" : "bg-red-600",
                )}
              >
                {i + 1}
              </span>
              <button
                type="button"
                onClick={() => removeItem("callout", c.id)}
                className="absolute -right-2 -top-2 hidden h-5 w-5 rounded-full bg-red-800 text-[10px] text-white group-hover:block"
              >
                ×
              </button>
            </div>
          );
        })}

        {draftPin ? (
          <div
            className={cn(
              "pointer-events-none absolute border-2 border-dashed",
              draftPin.target ? "border-amber-400" : mode === "callout" ? "border-red-500" : "border-slate-400",
            )}
            style={toFraction(draftPin.box)}
          />
        ) : null}
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      {callouts.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs">
          {callouts.map((c, i) => (
            <li key={c.id} className="flex items-center gap-1">
              <span className="w-4 font-semibold text-red-600">{i + 1}.</span>
              <span title={c.target ? "Pinned to an element" : "Fixed position"}>{c.target ? "📌" : "▫️"}</span>
              <input
                defaultValue={c.label ?? ""}
                placeholder="label (optional)"
                className="flex-1 rounded border border-fd-border bg-transparent px-1 py-0.5"
                onBlur={(e) => {
                  if (e.target.value !== (c.label ?? "")) setLabel(c.id, e.target.value);
                }}
              />
              <button type="button" onClick={() => move(c.id, -1)} disabled={i === 0} className="disabled:opacity-30">
                ↑
              </button>
              <button type="button" onClick={() => move(c.id, 1)} disabled={i === callouts.length - 1} className="disabled:opacity-30">
                ↓
              </button>
              <button type="button" onClick={() => removeItem("callout", c.id)} className="text-red-600">
                remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
