// Assembles the chat request sent to Claude (docs/scope.md "Help chat"; "Token efficiency and
// models": "Stable prompt parts (style guide, glossary, schema) come first so provider prompt
// caching applies"). The system prompt (rules) never varies per request and is built first;
// retrieved context and the question are per-request and come after it.
//
// Caching decision (review finding prompt.ts:99): this chat model defaults to Haiku 4.5, whose
// minimum cacheable prefix is 4096 tokens (claude-api skill, shared/prompt-caching.md "API
// reference") — the system prompt here is ~170 tokens, so a `cache_control` breakpoint on it
// never actually caches (`cache_creation_input_tokens` stays 0; it's inert, not harmful) and
// only adds complexity. Padding it to 4096+ tokens just to clear the minimum would add that many
// extra input tokens — a third-to-half of the whole `maxInputTokens` budget — to *every* request
// whether or not anything ever reads the cache, which costs more than it could ever save for a
// prompt this small. So: no `cache_control` for now. Revisit once there's a genuinely large,
// stable prefix to cache (e.g. a full site glossary/page index bundled into the system prompt)
// and request volume dense enough, relative to the 5-minute ephemeral TTL, for reads to amortize
// the extra write cost.
import type { ChatHistoryTurn, ChatCitation, RetrievedContext } from "./types.js";

/** The stable system prompt: the rules never change between requests (no timestamps, no
 * request-specific data), so this exact string is what provider prompt caching keys on. */
export function buildSystemPrompt(supportContact: string | undefined): string {
  const support = supportContact
    ? `When you don't know, say so plainly and point the reader to ${supportContact}.`
    : `When you don't know, say so plainly and suggest contacting support.`;
  return [
    "You are the help chat for this app's documentation site.",
    "Answer only using the information in the provided documentation sections below — never from",
    "general knowledge, and never guess at app-specific behaviour that isn't in the docs.",
    "Cite every claim with its source number in square brackets, like [1], matching the numbered",
    "sections given to you. If a step-by-step procedure is given, walk through its steps in order,",
    "mention that a screenshot and a video moment are available for the relevant step, and still",
    "cite the procedure's source number.",
    support,
    "Keep answers short and direct — a few sentences or a short numbered list, not an essay.",
  ].join(" ");
}

/** Numbers retrieved sections/procedure for `[n]` citations, in the order they'll be shown to
 * the model (procedure first, when present, since it's usually the more specific match). */
export function buildCitations(context: RetrievedContext): ChatCitation[] {
  const citations: ChatCitation[] = [];
  let n = 1;
  if (context.procedure) {
    citations.push({ n: n++, url: `/${context.procedure.id}`, title: context.procedure.title });
  }
  for (const hit of context.hits) {
    citations.push({ n: n++, url: hit.url, title: hit.title, heading: hit.heading });
  }
  return citations;
}

/** Plain-text block the model sees for the retrieved context, each section/procedure prefixed
 * with its citation number so the model's `[n]` references line up with `buildCitations()`. */
export function buildContextBlock(context: RetrievedContext, citations: ChatCitation[]): string {
  const parts: string[] = [];
  let i = 0;
  if (context.procedure) {
    const c = citations[i++];
    const steps = context.procedure.steps
      .map((s) => `  ${s.n}. ${s.title}${s.instruction ? ` — ${s.instruction}` : ""}`)
      .join("\n");
    parts.push(`[${c.n}] Procedure: ${context.procedure.title}\n${steps}`);
  }
  for (const hit of context.hits) {
    const c = citations[i++];
    const heading = hit.heading ? ` — ${hit.heading}` : "";
    parts.push(`[${c.n}] ${hit.title}${heading}\n${hit.text}`);
  }
  return parts.length > 0 ? parts.join("\n\n") : "(no matching documentation found)";
}

/**
 * A minimal shape of Anthropic's `MessageCreateParams`, kept local so this module (and its
 * tests) don't need the SDK installed just to assemble a request — the chat handler maps this
 * onto the real `Anthropic.MessageCreateParamsStreaming` shape, which is structurally identical.
 */
export interface AssembledRequest {
  system: { type: "text"; text: string; cache_control?: { type: "ephemeral" } }[];
  messages: { role: "user" | "assistant"; content: string }[];
}

// Hard caps on untrusted request input (review finding prompt.ts:101): without these, a client
// could send an arbitrarily long question, forge a long or non-alternating history, or otherwise
// pad the request well past `maxInputTokens` — running up usage on the site owner's API key
// (decisions.md #40: owner's key, chat's cost is the owner's cost).
export const MAX_QUESTION_CHARS = 1_000;
export const MAX_HISTORY_TURNS = 6;
export const MAX_HISTORY_CHARS = 6_000;

/**
 * Validates an incoming chat request's `question`/`history` shape before any tokens are spent.
 * Returns an error message for the handler to turn into a 400, or `undefined` when valid.
 * Malformed shape (wrong types, a role other than "user"/"assistant", turns not alternating
 * starting with "user") is rejected outright — forging history is exactly the "only context
 * capped" gap this closes. Oversized-but-well-formed input (a long question, too much history)
 * is *not* rejected here; `assembleRequest`/`capHistory` cap it silently instead, since a client
 * legitimately building up a long conversation isn't malformed.
 */
export function validateChatInput(question: unknown, history: unknown): string | undefined {
  if (typeof question !== "string" || !question.trim()) return "question is required";
  if (question.length > MAX_QUESTION_CHARS) {
    return `question must be ${MAX_QUESTION_CHARS} characters or fewer`;
  }
  if (history === undefined) return undefined;
  if (!Array.isArray(history)) return "history must be an array";
  for (let i = 0; i < history.length; i++) {
    const turn = history[i] as { role?: unknown; content?: unknown } | null;
    if (!turn || typeof turn !== "object") return "each history entry must be an object";
    if (turn.role !== "user" && turn.role !== "assistant") {
      return 'history entries must have role "user" or "assistant"';
    }
    if (typeof turn.content !== "string") return "history entries must have string content";
    const expectedRole = i % 2 === 0 ? "user" : "assistant";
    if (turn.role !== expectedRole) return "history must alternate turns, starting with a user turn";
  }
  return undefined;
}

/**
 * Caps already-validated history to the last `MAX_HISTORY_TURNS` turns and `MAX_HISTORY_CHARS`
 * total characters, dropping from the front (oldest first). Re-checks that the kept slice still
 * starts on a "user" turn after each trim — truncating a valid alternating sequence at an even
 * offset can otherwise leave an assistant turn first, which is itself a (locally) malformed
 * shape `assembleRequest` would otherwise hand the model.
 */
export function capHistory(history: ChatHistoryTurn[]): ChatHistoryTurn[] {
  let capped = history.slice(-MAX_HISTORY_TURNS);
  while (capped.length > 0 && capped.reduce((n, t) => n + t.content.length, 0) > MAX_HISTORY_CHARS) {
    capped = capped.slice(1);
  }
  if (capped.length > 0 && capped[0].role !== "user") capped = capped.slice(1);
  return capped;
}

/**
 * Builds the full request: system prompt (always first/stable) -> prior history -> this turn's
 * retrieved context + question (volatile, always last). History is capped first (`capHistory`),
 * then the context block is capped to whatever's left of `maxInputTokens` after the question and
 * the (now-capped) history, trimming retrieved sections from the end (least relevant first,
 * since `retrieve()` returns hits best-first) — so history counts against the same budget
 * instead of only the context ever being capped (review finding prompt.ts:101).
 */
export function assembleRequest(
  supportContact: string | undefined,
  context: RetrievedContext,
  citations: ChatCitation[],
  question: string,
  history: ChatHistoryTurn[] | undefined,
  maxInputTokens: number,
): AssembledRequest {
  const system = buildSystemPrompt(supportContact);
  const cappedHistory = capHistory(history ?? []);
  const historyChars = cappedHistory.reduce((n, h) => n + h.content.length, 0);

  let contextBlock = buildContextBlock(context, citations);

  // Rough char-per-token budget (~4 chars/token) — a cheap guard, not exact token counting;
  // `client.messages.countTokens` would be exact but costs an extra round trip per request.
  // History and the question are charged against the same budget as the context block, not
  // left uncapped.
  const charBudget = Math.max(0, maxInputTokens * 4 - historyChars - question.length);
  if (contextBlock.length > charBudget) {
    contextBlock = `${contextBlock.slice(0, charBudget)}\n…(truncated)`;
  }

  const userContent = `Documentation:\n${contextBlock}\n\nQuestion: ${question}`;

  return {
    system: [{ type: "text", text: system }],
    messages: [
      ...cappedHistory.map((h) => ({ role: h.role, content: h.content })),
      { role: "user" as const, content: userContent },
    ],
  };
}
