import type { Page, BrowserContext } from "playwright";
import type { Persona, Viewport } from "../walkthrough/index.js";
import type { PronunciationMap } from "../voice/types.js";

/** Context passed to a sign-in adapter: everything it needs to establish a session. */
export interface SignInContext {
  page: Page;
  context: BrowserContext;
  baseUrl: string;
  persona?: Persona;
  /** Process environment, passed explicitly so adapters stay testable. */
  env: Record<string, string | undefined>;
}

/** Signs a browser context in, then returns — capture reuses the resulting storage state. */
export type SignInAdapter = (ctx: SignInContext) => Promise<void> | void;

/** One row-shaped result from a database adapter's query. */
export type DatabaseRow = Record<string, unknown>;

/**
 * Optional hook backing a walkthrough's `validate.database` checks. Generic by
 * design: docgen never talks to a database itself. `url()` is used only to
 * enforce the local-only safety check before any query runs.
 */
export interface DatabaseAdapter {
  url(): Promise<string> | string;
  /**
   * `context`, when given, carries the `url` the capture runner already
   * validated with `assertLocalDatabase` — adapters should connect with that
   * exact URL rather than re-deriving it, closing the gap between the check
   * and the query.
   */
  query(sql: string, params?: unknown[], context?: { url: string }): Promise<DatabaseRow[]>;
  close?(): Promise<void> | void;
  /** Recreates throwaway demo data (TallyUp's `db.sh reset`). Skipped by `--no-reset`. */
  reset?(): Promise<void> | void;
}

/** A module path (resolved relative to the config file) or an adapter value/factory. */
export type SignInAdapterRef = string | SignInAdapter | { modulePath: string; export?: string };
export type DatabaseAdapterRef = string | DatabaseAdapter | { modulePath: string; export?: string };

export interface ModelTiers {
  fast?: string;
  standard?: string;
  deep?: string;
}

export interface BudgetConfig {
  usd?: number;
  tokens?: number;
}

export interface VoiceSettings {
  provider?: string;
  model?: string;
  voiceId?: string;
  speed?: number;
  gapSeconds?: number;
  /** Word -> spoken-form replacements (e.g. "TallyUp" -> "Tally Up"); see src/voice/types.ts. */
  pronunciation?: PronunciationMap;
  /**
   * USD per character billed by this provider, for budget accounting (see usage/prices.ts
   * `VOICE_PRICES`). `kokoro`/`silent` are free and ignore this; set it for `minimax`/
   * `elevenlabs` to match the actual rate on the account in use. Unset: 0 (reports $0, doesn't
   * trip a budget — set this to get real enforcement for a paid voice provider).
   */
  pricePerChar?: number;
}

/** Page-level masking, applied before every screenshot (see capture/mask.ts). */
export interface MaskConfig {
  /** Default true: scan every screenshot for personal data (emails/phones) and blur matches, even
   * when a step doesn't list the field in its own `mask`. example.com-style domains and the
   * reserved fictional phone ranges are always allowed through, regardless of this setting. */
  personalData?: boolean;
  /** Extra CSS selectors always blurred, independent of the personal-data scan. */
  selectors?: string[];
}

/**
 * Frame-stabilization settings for capture (docs/scope.md "Only rebuild what changed": "A
 * screenshot that moved less than a set threshold is kept."). See capture/frame-diff.ts.
 */
export interface CaptureSettings {
  /**
   * Fraction of pixels (0-1) that may differ (beyond `frameDiffTolerance`) before a frame
   * counts as changed, rather than kept as the previous capture's frame. Default `0.001`
   * (0.1%).
   */
  frameDiffThreshold?: number;
  /** Per-channel (0-255) tolerance before a pixel counts as differing at all. Default `8`. */
  frameDiffTolerance?: number;
  /** Longest a `type` action types visibly, in ms, before filling the rest at once. Default `1500`. */
  maxTypeMs?: number;
}

/**
 * `docgen publish --to <host>` settings (src/publish/**; docs/scope.md "Runs on Node, deploys
 * like any Next.js app", "Safety and trust"; decisions #16-18; build-plan.md M13).
 */
export interface PublishConfig {
  /**
   * Forces videos to blob storage regardless of size, and picks which provider. Unset: blob
   * storage only kicks in when a video exceeds the target host's static-asset limit (e.g.
   * Cloudflare's 25 MiB/file), using that host's default provider.
   */
  videoStorage?: "vercel-blob" | "s3" | "netlify-blobs" | "r2" | "supabase-storage";
}

/**
 * `docgen affected` settings (docs/scope.md "Only rebuild what changed" -> "Impact map";
 * build-plan.md M17). `ignore`/`all` extend (never replace) the built-in glob lists in
 * src/impact/glob.ts.
 */
export interface ImpactConfig {
  /**
   * Path to the app repo whose git diff maps to walkthroughs, relative to the config file (or
   * absolute). Unset: the `--app-repo` CLI flag is required instead.
   */
  appRepo?: string;
  /** Explicit app directory within a workspace monorepo (relative to `appRepo`, or absolute) —
   * same as `digest`'s `--app`/`app` option. */
  app?: string;
  /** Extra glob patterns always treated as irrelevant to every walkthrough (docs/tests/etc. are
   * built in; this adds more without disabling the defaults). */
  ignore?: string[];
  /** Extra glob patterns that force "every walkthrough is affected" when matched (lockfiles,
   * the root layout, the auth gate, and db migrations are built in; this adds more). */
  all?: string[];
  /**
   * Fraction of routes (0-1) a changed file must be imported by (via the static import graph)
   * before it's treated as affecting every walkthrough, rather than just the routes that import
   * it. Default 0.6 (60%) — a file imported by more than that share of routes is "shared enough"
   * that per-route precision isn't worth trusting.
   */
  allThreshold?: number;
}

/**
 * Help chat settings (docs/scope.md "Help chat"; "Token efficiency": "help chat answers from
 * retrieved pages" = fast tier; decisions.md #40 "owner's key when self-hosting"). The owner's
 * `ANTHROPIC_API_KEY` env var is the only key source — never put a key in this file.
 */
export interface ChatConfig {
  /** Defaults to `models.fast` (Haiku 4.5) — chat answers are a fast-tier job. */
  model?: string;
  /** Shown when chat can't answer from the docs (scope.md "Truthfulness": "says when it doesn't
   * know, pointing to support"). Plain text or a mailto:/https: URL. */
  supportContact?: string;
  /** Origins allowed to call /api/chat cross-origin (the in-app widget's own origin) — the help
   * site's own origin is always allowed. Empty/unset: no cross-origin widget use. */
  allowedOrigins?: string[];
  /** Max sections/procedures retrieved per question. Default 5. */
  retrievalLimit?: number;
  /** Hard cap on input tokens sent to the model (retrieved context + question), so one long
   * question/history can't blow the budget. Default 8000. */
  maxInputTokens?: number;
  /** `max_tokens` for the chat completion. Default 1024. */
  maxOutputTokens?: number;
  /** Retrieval score below which an answer is treated as "don't know" and logged to the
   * unanswered-questions store. Default 0.01 (BM25 scores are unbounded; see chat/retrieve.ts). */
  unansweredScoreThreshold?: number;
  /** Requests allowed per IP per minute before /api/chat returns 429. Default 20. */
  rateLimitPerMinute?: number;
  /** Requests allowed across *all* clients per minute, independent of any one client's budget —
   * a floor under `rateLimitPerMinute` so many distinct (or spoofed) client IPs together still
   * can't run the owner's API key up without bound. Default 300. */
  globalRateLimitPerMinute?: number;
  /** Header name to trust as the client's IP, set by the deployment's own reverse proxy (e.g. a
   * load balancer in front of the host's platform headers). When unset, the client IP is taken
   * from the first present platform header among `x-vercel-forwarded-for`, `x-real-ip`,
   * `x-nf-client-connection-ip`, `cf-connecting-ip`, falling back to the *last* hop of
   * `X-Forwarded-For` (the hop the nearest proxy appended) — never the client-controlled first
   * hop. Only set this to a header you know your own infra sets; trusting an arbitrary header
   * here reopens the same spoofing the default avoids. */
  trustProxyHeader?: string;
}

/** Help-app theme, guessed by `extractBrand()` (src/init/brand.ts) or set by hand. */
export interface BrandConfig {
  /** CSS colour value (hex or `H S% L%` HSL triplet) used for `--primary` in the help app. */
  primaryColor?: string;
  /** Path to a logo file, relative to the config file (usually under `public/`). */
  logo?: string;
  /** Font family name, e.g. "Inter" or "Geist". */
  font?: string;
}

/** The shape a user's `docgen.config.ts`/`.mjs` default-exports (via `defineConfig`). */
export interface DocgenConfig {
  app: {
    baseUrl: string;
  };
  /** Directory of `*.yaml` walkthrough files, relative to the config file. */
  walkthroughsDir: string;
  /** Where rendered output (site, videos, pdfs) is written. Default `help/`. */
  outDir?: string;
  /** Where intermediate build artifacts (capture frames, manifests) are written. Default `.build`. */
  buildDir?: string;
  viewport?: Viewport;
  deviceScaleFactor?: number;
  locale?: string;
  timezone?: string;
  /** Default `"reduce"` — most real apps' CSS/JS honour it, which keeps captures still for crisper frames. */
  reducedMotion?: "no-preference" | "reduce";
  /**
   * ISO-8601 timestamp to pin `page.clock` to for the whole run. Unset by
   * default: only set this when the app under capture needs a fixed "now" to
   * produce deterministic output, and the fixture/seed data it reads is
   * itself fixed (not computed relative to the real wall clock at seed time,
   * which a pinned clock could drift out of sync with).
   */
  clock?: string;
  /** Allow write (click/type) steps to run against a non-local baseUrl. Default false. */
  allowWrites?: boolean;
  signIn?: SignInAdapterRef;
  database?: DatabaseAdapterRef;
  voice?: VoiceSettings;
  models?: ModelTiers;
  budget?: BudgetConfig;
  /** Who the help site is written for, e.g. ["office-staff", "judges"]. Site-copy only. */
  readers?: string[];
  /** Page-level masking before every screenshot; see `MaskConfig`. */
  mask?: MaskConfig;
  /** Help-app theme (colours/logo/font); see `BrandConfig`. */
  brand?: BrandConfig;
  /** Deploy target hint for `docgen publish` / docs, e.g. "vercel", "netlify", "amplify". */
  host?: string;
  /**
   * Path to a Next.js help app (containing `content/docs` and `public/`), relative to the
   * config file. When set, `docgen build`'s index stage copies each walkthrough's page into
   * `<helpApp>/content/docs/<id>/` and writes `search-index.json`/`llms.txt` into
   * `<helpApp>/public/`. Unset: pages/index artifacts stay under `outDir` only.
   */
  helpApp?: string;
  /** Frame-stabilization settings for capture; see `CaptureSettings`. */
  capture?: CaptureSettings;
  /** Printable-guide PDF settings (docs/scope.md "Printable guides"); see `PdfSettings`. */
  pdf?: PdfSettings;
  /** `docgen publish --to <host>` settings; see `PublishConfig`. */
  publish?: PublishConfig;
  /** Help chat settings; see `ChatConfig`. */
  chat?: ChatConfig;
  /** `docgen affected` settings; see `ImpactConfig`. */
  impact?: ImpactConfig;
}

/** Settings for the `pdf` build stage / `docgen pdf` command (src/pdf/**). */
export interface PdfSettings {
  /** Page size for every generated PDF. Default "A4". */
  paper?: "A4" | "Letter";
}

/** `DocgenConfig` with adapters resolved to functions/objects and paths made absolute. */
export interface ResolvedConfig extends Omit<DocgenConfig, "signIn" | "database" | "capture"> {
  /** Absolute path to the directory the config file lives in. */
  configDir: string;
  walkthroughsDir: string;
  outDir: string;
  buildDir: string;
  signIn?: SignInAdapter;
  database?: DatabaseAdapter;
  /**
   * `capture` with defaults resolved by `loadConfig()`. Left optional (rather than
   * `Required<CaptureSettings>`) so a `ResolvedConfig` built by hand (as several tests do,
   * without going through `loadConfig()`) still type-checks without it; call sites that need
   * concrete settings should go through `resolveCaptureSettings()` below.
   */
  capture?: CaptureSettings;
  /** `impact.appRepo`/`impact.app`, when set, resolved to absolute paths by `loadConfig()`. */
  impact?: ImpactConfig;
}

/** Fills in defaults for any settings `config.capture` left unset — use at capture call sites
 * instead of reading `config.capture` directly, since a hand-built `ResolvedConfig` (as in
 * several tests) may omit it entirely. */
export function resolveCaptureSettings(capture: CaptureSettings | undefined): Required<CaptureSettings> {
  return {
    frameDiffThreshold: capture?.frameDiffThreshold ?? DEFAULT_CAPTURE_SETTINGS.frameDiffThreshold,
    frameDiffTolerance: capture?.frameDiffTolerance ?? DEFAULT_CAPTURE_SETTINGS.frameDiffTolerance,
    maxTypeMs: capture?.maxTypeMs ?? DEFAULT_CAPTURE_SETTINGS.maxTypeMs,
  };
}

export const DEFAULT_CAPTURE_SETTINGS: Required<CaptureSettings> = {
  frameDiffThreshold: 0.001,
  frameDiffTolerance: 8,
  maxTypeMs: 1500,
};

export const DEFAULT_MODEL_TIERS: Required<ModelTiers> = {
  fast: "claude-haiku-4-5",
  standard: "claude-sonnet-5",
  deep: "claude-opus-5-5",
};
