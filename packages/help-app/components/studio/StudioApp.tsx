"use client";
import { useCallback, useEffect, useState } from "react";
import { WalkthroughList } from "./WalkthroughList";
import { StepEditor } from "./StepEditor";
import { HistoryPanel } from "./HistoryPanel";
import { PagePreview } from "./PagePreview";
import { StepTimeline } from "./StepTimeline";
import { ScreenshotEditor } from "./ScreenshotEditor";
import type { HistoryEntry, StudioManifest, StudioWalkthrough, WalkthroughSummary } from "./types";

// Sent on every /studio/api/** call so the server can tell a same-origin Studio request (which
// read this value out of the server-rendered page) from a cross-site one (which can't read it
// at all) — see app/studio/_lib/security.ts.
const STUDIO_TOKEN_HEADER = "x-docgen-studio-token";

async function getJson<T>(url: string, studioToken: string): Promise<T> {
  const res = await fetch(url, { headers: { [STUDIO_TOKEN_HEADER]: studioToken } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return (await res.json()) as T;
}

async function postJson<T>(url: string, body: unknown, studioToken: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", [STUDIO_TOKEN_HEADER]: studioToken },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string; ok?: boolean };
  if (!res.ok || data.ok === false) throw new Error(data.error ?? `${url} -> ${res.status}`);
  return data;
}

export function StudioApp({ studioToken }: { studioToken: string }) {
  const [walkthroughs, setWalkthroughs] = useState<WalkthroughSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [walkthrough, setWalkthrough] = useState<StudioWalkthrough>();
  const [selectedStepId, setSelectedStepId] = useState<string>();
  const [saving, setSaving] = useState<string>();
  const [error, setError] = useState<string>();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [undoing, setUndoing] = useState(false);
  const [page, setPage] = useState<{ found: boolean; text?: string }>({ found: false });
  const [manifest, setManifest] = useState<StudioManifest | undefined>();

  const refreshWalkthrough = useCallback(() => {
    if (!selectedId) return;
    getJson<{ walkthrough: StudioWalkthrough; manifest?: StudioManifest }>(
      `/studio/api/walkthrough?id=${encodeURIComponent(selectedId)}`,
      studioToken,
    )
      .then((d) => {
        setWalkthrough(d.walkthrough);
        setManifest(d.manifest);
      })
      .catch((e) => setError(String(e)));
  }, [selectedId, studioToken]);

  const refreshHistory = useCallback(() => {
    getJson<{ entries: HistoryEntry[] }>("/studio/api/history", studioToken)
      .then((d) => setHistory(d.entries))
      .catch((e) => setError(String(e)));
  }, [studioToken]);

  useEffect(() => {
    getJson<{ walkthroughs: WalkthroughSummary[] }>("/studio/api/walkthroughs", studioToken)
      .then((d) => {
        setWalkthroughs(d.walkthroughs);
        if (d.walkthroughs.length > 0) setSelectedId(d.walkthroughs[0].id);
      })
      .catch((e) => setError(String(e)));
    refreshHistory();
  }, [refreshHistory, studioToken]);

  useEffect(() => {
    if (!selectedId) return;
    refreshWalkthrough();
    getJson<{ found: boolean; text?: string; plain?: string }>(`/studio/api/page?id=${encodeURIComponent(selectedId)}`, studioToken)
      .then((d) => setPage({ found: d.found, text: d.plain }))
      .catch(() => setPage({ found: false }));
  }, [selectedId, studioToken, refreshWalkthrough]);

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      setSelectedStepId(undefined);
    },
    [],
  );

  const selectStep = useCallback(
    (stepId: string | undefined) => {
      setSelectedStepId(stepId);
      if (!selectedId) return;
      void postJson("/studio/api/selection", { walkthroughId: selectedId, stepId }, studioToken).catch(() => {
        /* best-effort — a failed selection write shouldn't block editing */
      });
    },
    [selectedId, studioToken],
  );

  const saveField = useCallback(
    (stepId: string, field: "title" | "say" | "caption" | "page_text" | "hold", value: string | number) => {
      if (!selectedId) return;
      setSaving(stepId);
      setError(undefined);
      postJson("/studio/api/edit", { action: "setStepField", walkthroughId: selectedId, stepId, field, value }, studioToken)
        .then(() => refreshWalkthrough())
        .then(() => refreshHistory())
        .catch((e) => setError(String(e)))
        .finally(() => setSaving(undefined));
    },
    [selectedId, refreshHistory, refreshWalkthrough, studioToken],
  );

  const undo = useCallback(
    (by?: "agent" | "person") => {
      setUndoing(true);
      postJson("/studio/api/history", { by }, studioToken)
        .then(() => {
          refreshHistory();
          refreshWalkthrough();
        })
        .catch((e) => setError(String(e)))
        .finally(() => setUndoing(false));
    },
    [refreshHistory, refreshWalkthrough, studioToken],
  );

  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-[240px_1fr_360px] overflow-hidden">
      <aside className="flex flex-col overflow-y-auto border-r">
        <h2 className="border-b p-3 text-sm font-semibold">Walkthroughs</h2>
        <WalkthroughList walkthroughs={walkthroughs} selectedId={selectedId} onSelect={select} />
      </aside>

      <main className="flex flex-col overflow-y-auto">
        {walkthrough ? (
          <StepTimeline steps={walkthrough.steps} selectedStepId={selectedStepId} onSelect={selectStep} />
        ) : null}
        <div className="flex flex-col gap-3 overflow-y-auto p-4">
          {error ? <p className="rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p> : null}
          {walkthrough ? (
            <>
              <h1 className="text-lg font-semibold">{walkthrough.title}</h1>
              <div className="flex flex-col gap-3">
                {walkthrough.steps.map((step, i) => (
                  <StepEditor
                    key={step.id ?? i}
                    step={step}
                    index={i}
                    selected={step.id === selectedStepId}
                    saving={saving === step.id}
                    onSelect={() => selectStep(step.id)}
                    onSave={(field, value) => step.id && saveField(step.id, field, value)}
                  >
                    {step.id ? (
                      <ScreenshotEditor
                        walkthroughId={walkthrough.walkthrough}
                        step={step}
                        stepNumber={i + 1}
                        manifestStep={manifest?.steps[i]}
                        viewport={manifest?.viewport}
                        studioToken={studioToken}
                        onChanged={refreshWalkthrough}
                      />
                    ) : null}
                  </StepEditor>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-fd-muted-foreground">Select a walkthrough to start editing.</p>
          )}
        </div>
      </main>

      <aside className="flex flex-col overflow-y-auto border-l">
        <h2 className="border-b p-3 text-sm font-semibold">Page preview</h2>
        <div className="flex-1 overflow-y-auto">
          <PagePreview found={page.found} text={page.text} />
        </div>
        <HistoryPanel entries={history} onUndo={undo} undoing={undoing} />
      </aside>
    </div>
  );
}
