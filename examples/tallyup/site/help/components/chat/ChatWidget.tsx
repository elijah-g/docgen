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
  /** Panel heading, e.g. "TallyUp help". */
  title?: string;
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

export function ChatWidget({ apiBase = "/api/chat", currentPath, title = "Help chat" }: ChatWidgetProps) {
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

  const empty = turns.length === 0;

  return (
    <div className="not-prose fixed bottom-4 right-4 z-50 text-sm print:hidden">
      {open ? (
        <div
          role="dialog"
          aria-label={title}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          className="flex h-[min(34rem,calc(100vh-2rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[calc(var(--brand-radius,0.5rem)+6px)] border border-fd-border bg-fd-background shadow-2xl"
        >
          <div className="flex items-center gap-3 border-b border-fd-border bg-fd-card px-4 py-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-fd-primary text-fd-primary-foreground">
              <ChatIcon />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{title}</div>
              <div className="truncate text-xs text-fd-muted-foreground">Answers come from these help guides</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close help chat"
              className="rounded-md p-1.5 text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-foreground"
            >
              <CloseIcon />
            </button>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {empty ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-fd-muted-foreground">
                <span className="flex size-10 items-center justify-center rounded-full bg-fd-primary/10 text-fd-primary">
                  <ChatIcon />
                </span>
                <p className="font-medium text-fd-foreground">Ask a question</p>
                <p className="max-w-[16rem] text-xs">
                  For example, “How do I record a payment?” You&apos;ll get an answer with links to the guide.
                </p>
              </div>
            ) : null}
            {turns.map((turn, i) => (
              <div key={i} className={turn.role === "user" ? "flex justify-end" : "flex flex-col items-start gap-2"}>
                <div
                  className={
                    turn.role === "user"
                      ? "max-w-[85%] rounded-2xl rounded-br-md bg-fd-primary px-3 py-2 text-fd-primary-foreground"
                      : "max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-fd-muted px-3 py-2 text-fd-foreground"
                  }
                >
                  {turn.text ||
                    (busy && turn.role === "assistant" && i === turns.length - 1 ? (
                      <span className="inline-flex gap-1 py-1" aria-label="Thinking">
                        <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-current" />
                      </span>
                    ) : null)}
                  {turn.error ? <div className="text-red-600 dark:text-red-400">{turn.error}</div> : null}
                </div>
                {turn.procedure?.firstScreenshot ? (
                  <img
                    src={withOrigin(turn.procedure.firstScreenshot, origin)}
                    alt={turn.procedure.title}
                    className="max-w-[92%] rounded-lg border border-fd-border"
                  />
                ) : null}
                {turn.citations && turn.citations.length > 0 ? (
                  <ul className="flex max-w-[92%] flex-wrap gap-1.5">
                    {turn.citations.map((c) => (
                      <li key={c.n}>
                        <a
                          href={withOrigin(c.url, origin)}
                          className="inline-flex items-center gap-1 rounded-full border border-fd-border bg-fd-card px-2.5 py-1 text-xs hover:border-fd-primary/50 hover:text-fd-primary"
                        >
                          <span className="font-semibold text-fd-primary">{c.n}</span>
                          {c.title}
                          {c.heading ? ` · ${c.heading}` : ""}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
          <form
            className="flex items-center gap-2 border-t border-fd-border bg-fd-card p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const q = question;
              setQuestion("");
              void ask(q);
            }}
          >
            <input
              className="min-w-0 flex-1 rounded-full border border-fd-border bg-fd-background px-4 py-2 outline-none focus:border-fd-primary focus:ring-2 focus:ring-fd-primary/20"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question…"
              aria-label="Ask the help chat"
              disabled={busy}
              autoFocus
            />
            <button
              type="submit"
              aria-label="Send"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-fd-primary text-fd-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              disabled={busy || !question.trim()}
            >
              <SendIcon />
            </button>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask a question"
          className="inline-flex items-center gap-2 rounded-full bg-fd-primary p-3 font-medium text-fd-primary-foreground shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl sm:py-2.5 sm:pe-4 sm:ps-3"
        >
          <ChatIcon />
          <span className="hidden sm:inline">Ask a question</span>
        </button>
      )}
    </div>
  );
}

// Inline icons, so this file stays copy-and-paste portable (no icon library needed).
function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
    </svg>
  );
}
