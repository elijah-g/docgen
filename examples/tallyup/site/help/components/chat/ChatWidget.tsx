// Help chat UI (scope.md "Help chat": "On the site and as a drop-in widget inside the app").
// Talks to this app's own /api/chat route — all retrieval/model logic lives in the engine
// package; this component only renders the NDJSON event stream the route forwards
// (packages/engine/src/chat/handler.ts `ChatStreamEvent`). Exported for two uses: inline on the
// site (see app/(site)/layout.tsx) and from a consuming app via a React import (documented in
// this package's README) — `public/widget.js` is the no-build drop-in alternative for apps that
// aren't React.
"use client";

import { useRef, useState } from "react";

interface Citation {
  n: number;
  url: string;
  title: string;
  heading?: string;
}

interface ProcedureMeta {
  id: string;
  title: string;
  firstScreenshot?: string;
  firstVideoTimeSec?: number;
}

interface Turn {
  role: "user" | "assistant";
  text: string;
  citations?: Citation[];
  procedure?: ProcedureMeta;
  error?: string;
}

export interface ChatWidgetProps {
  /** Overrides where the widget posts questions — default "/api/chat" (same-origin: the help
   * site itself). The in-app widget (public/widget.js) sets this to the help site's full
   * origin, since it runs on the user's own app's pages. */
  apiBase?: string;
  /** The in-app page the reader is currently on, so retrieval can boost matching walkthroughs
   * (scope.md "Help chat": "Inside the app it knows which screen the user is on"). Defaults to
   * `location.pathname` when running in the browser. */
  currentPath?: string;
}

/**
 * Resolves the help site's own origin from `apiBase` (review finding ChatWidget.tsx:146,139):
 * citation `url`s and a procedure's `firstScreenshot` come back as root-relative paths on the
 * help site (e.g. "/add-competitor", "/screenshots/add-competitor/step-01.png"). Rendered inline
 * on the help site itself that's correct, but the in-app widget (`public/widget.js`) embeds this
 * component on a *different* origin — the host app's own pages — where a root-relative `href`/
 * `src` resolves against the host app instead of the help site and 404s. `apiBase` already
 * carries the help site's full origin in that case (see `ChatWidgetProps.apiBase`), so derive it
 * from there instead of adding a second prop. Returns `undefined` outside the browser (SSR) or
 * for an unparseable `apiBase` — callers then leave the path unprefixed rather than throw.
 */
export function helpSiteOrigin(apiBase: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return new URL(apiBase, window.location.href).origin;
  } catch {
    return undefined;
  }
}

/** Prefixes a root-relative help-site path with `origin` (a no-op when `path` is already an
 * absolute URL, or when `origin` couldn't be resolved). */
export function withOrigin(path: string, origin: string | undefined): string {
  if (!origin || /^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

async function* parseNdjson(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) yield JSON.parse(line) as Record<string, unknown>;
    }
  }
}

// `docgen publish --to static` sets this at build time (engine's publish/hosts/static.ts) —
// a static export has no server to run /api/chat on, so the widget hides itself instead of
// showing a button that always 501s on click.
const CHAT_UNAVAILABLE = process.env.NEXT_PUBLIC_DOCGEN_STATIC_EXPORT === "1";

export function ChatWidget({ apiBase = "/api/chat", currentPath }: ChatWidgetProps) {
  if (CHAT_UNAVAILABLE) return null;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- CHAT_UNAVAILABLE is a build-time
  // constant (inlined by Next from NEXT_PUBLIC_DOCGEN_STATIC_EXPORT), never toggles at runtime.
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const origin = helpSiteOrigin(apiBase);

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    setBusy(true);
    setTurns((t) => [...t, { role: "user", text: q }, { role: "assistant", text: "" }]);
    historyRef.current.push({ role: "user", content: q });

    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          currentPath: currentPath ?? (typeof location !== "undefined" ? location.pathname : undefined),
          history: historyRef.current.slice(0, -1),
        }),
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({ error: `request failed (${res.status})` }));
        setTurns((t) => replaceLastAssistant(t, { role: "assistant", text: "", error: body.error ?? "something went wrong" }));
        return;
      }

      let answer = "";
      for await (const event of parseNdjson(res.body)) {
        if (event.type === "meta") {
          setTurns((t) =>
            replaceLastAssistant(t, { role: "assistant", text: answer, citations: event.citations as Citation[], procedure: event.procedure as ProcedureMeta | undefined }),
          );
        } else if (event.type === "delta") {
          answer += event.text as string;
          setTurns((t) => replaceLastAssistant(t, { ...lastAssistant(t), text: answer }));
        } else if (event.type === "error") {
          setTurns((t) => replaceLastAssistant(t, { ...lastAssistant(t), error: event.message as string }));
        }
      }
      historyRef.current.push({ role: "assistant", content: answer });
    } catch {
      setTurns((t) => replaceLastAssistant(t, { role: "assistant", text: "", error: "couldn't reach help chat" }));
    } finally {
      setBusy(false);
    }
  }

  function lastAssistant(t: Turn[]): Turn {
    return t[t.length - 1] ?? { role: "assistant", text: "" };
  }
  function replaceLastAssistant(t: Turn[], next: Turn): Turn[] {
    return [...t.slice(0, -1), next];
  }

  return (
    <div className="not-prose fixed bottom-4 right-4 z-50 text-sm">
      {open ? (
        <div className="flex h-96 w-80 flex-col rounded-lg border bg-fd-background shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="font-medium">Help chat</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close help chat">
              ✕
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {turns.map((turn, i) => (
              <div key={i} className={turn.role === "user" ? "text-right" : ""}>
                <div className={`inline-block rounded-md px-2 py-1 ${turn.role === "user" ? "bg-fd-accent" : "bg-fd-muted"}`}>
                  {turn.text || (busy && turn.role === "assistant" && i === turns.length - 1 ? "…" : "")}
                  {turn.error ? <div className="text-red-600">{turn.error}</div> : null}
                </div>
                {turn.procedure?.firstScreenshot ? (
                  <div className="mt-1">
                    <img src={withOrigin(turn.procedure.firstScreenshot, origin)} alt={turn.procedure.title} className="rounded border" />
                  </div>
                ) : null}
                {turn.citations && turn.citations.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-xs text-fd-muted-foreground">
                    {turn.citations.map((c) => (
                      <li key={c.n}>
                        <a href={withOrigin(c.url, origin)} className="underline">
                          [{c.n}] {c.title}
                          {c.heading ? ` — ${c.heading}` : ""}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
          <form
            className="flex gap-1 border-t p-2"
            onSubmit={(e) => {
              e.preventDefault();
              const q = question;
              setQuestion("");
              void ask(q);
            }}
          >
            <input
              className="flex-1 rounded border px-2 py-1"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question…"
              aria-label="Ask the help chat"
              disabled={busy}
            />
            <button type="submit" className="rounded bg-fd-primary px-2 py-1 text-fd-primary-foreground" disabled={busy}>
              Send
            </button>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full bg-fd-primary px-4 py-2 text-fd-primary-foreground shadow-lg"
        >
          Help
        </button>
      )}
    </div>
  );
}
