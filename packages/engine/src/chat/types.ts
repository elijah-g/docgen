// Shared types for the help chat (docs/scope.md "Help chat"; build-plan.md M15 step 4).
import type { SearchHit } from "../index-search/index.js";
import type { Procedure } from "../procedures/index.js";

export interface ChatHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

/** The request body the chat route accepts: `POST {question, currentPath?, history?}`. */
export interface ChatRequest {
  question: string;
  /** The in-app widget's current page path (e.g. "/competitors") — boosts docs whose
   * walkthrough `start.page` or impact routes match (scope.md "Help chat": "Inside the app it
   * knows which screen the user is on"). */
  currentPath?: string;
  history?: ChatHistoryTurn[];
}

/** One citation shown alongside the answer: `[n]` -> page URL (+ heading anchor). */
export interface ChatCitation {
  n: number;
  url: string;
  title: string;
  heading?: string;
}

/** Everything retrieved for one question, before the model sees it (chat/retrieve.ts). */
export interface RetrievedContext {
  hits: SearchHit[];
  procedure?: Procedure;
  /** Top retrieval score — compared against `chat.unansweredScoreThreshold` to decide whether
   * this question counts as answered. */
  topScore: number;
}

/** First NDJSON event streamed to the client: citations + the matched procedure, before any
 * answer text, so the widget can render the sources/screenshot immediately. */
export interface ChatMetaEvent {
  type: "meta";
  citations: ChatCitation[];
  procedure?: { id: string; title: string; firstScreenshot?: string; firstVideoTimeSec?: number };
}

export interface ChatDeltaEvent {
  type: "delta";
  text: string;
}

export interface ChatDoneEvent {
  type: "done";
  /** True when the model said it doesn't know / retrieval scored below threshold — the question
   * was logged to the unanswered-questions store. */
  unanswered: boolean;
}

export interface ChatErrorEvent {
  type: "error";
  message: string;
}

export type ChatStreamEvent = ChatMetaEvent | ChatDeltaEvent | ChatDoneEvent | ChatErrorEvent;

export interface ChatTokenUsage {
  model: string;
  input: number;
  output: number;
  cacheRead: number;
}

export interface ChatHandlerOptions {
  request: ChatRequest;
  /** Resolved `config.chat` (defaults already filled in — see `resolveChatConfig`). */
  config: ResolvedChatConfig;
  /** The site's search-index entries (help-app reads `public/search-index.json`). */
  searchIndexEntries: import("../index-search/index.js").SearchIndexEntry[];
  /** Every procedure (help-app reads `public/procedures.json`). */
  procedures: Procedure[];
  /** `process.env.ANTHROPIC_API_KEY` — passed explicitly so the handler stays testable and the
   * caller controls exactly where the key comes from (decisions.md #40: owner's key only). */
  apiKey: string | undefined;
  /** Client identifier for rate limiting (usually the request IP). */
  clientId: string;
  /** Called once per request with token usage, for the "log token usage per request" requirement
   * — the route handler forwards this to its server log. */
  onUsage?: (usage: ChatTokenUsage) => void;
  /** Store unanswered questions go to — default is a no-op; route handlers wire a real store. */
  unansweredStore?: import("./unanswered.js").UnansweredStore;
  /** Overrides the Anthropic client — tests inject a mock. Production code should leave this
   * unset so the handler builds a real `Anthropic` client from `apiKey`. */
  anthropicClient?: unknown;
}

export interface ResolvedChatConfig {
  model: string;
  supportContact?: string;
  allowedOrigins: string[];
  retrievalLimit: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  unansweredScoreThreshold: number;
  rateLimitPerMinute: number;
  globalRateLimitPerMinute: number;
  trustProxyHeader?: string;
}
