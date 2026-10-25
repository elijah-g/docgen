// Shared CSRF/cross-site guard for every /studio/api/** route handler. The Studio only runs in
// `next dev` (see dev-only.ts), but a dev server is still a plain HTTP server that any page open
// in the same browser can reach: a malicious page in another tab can POST to these routes
// directly, and a `text/plain` body skips the CORS preflight that would otherwise block a
// cross-site JSON-shaped request. Since `{/* docgen:begin k */}` is valid JS/JSX, a cross-site
// write into e.g. app/api/chat/route.ts can inject code that runs the next time `next dev`
// rebuilds — see the finding this guards against. Every handler under app/studio/api/** must
// call `assertStudioRequest(request)` first and return its result if non-null.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextResponse } from "next/server";

// Next's dev server (Turbopack) compiles the page and each route handler into separate module
// graphs, so a plain `const STUDIO_TOKEN = randomBytes(...)` at module scope is NOT guaranteed to
// be the same value in page.tsx's copy as in a given route.ts's copy — each gets its own module
// instance. A real file, outside the repo (so it's never committed and never shows up in `git
// status`), is what makes the token the same value everywhere: generated once, lazily, and read
// back by whichever module needs it. Keyed by the help app's own path so unrelated projects on
// the same machine don't share a token.
function tokenFilePath(): string {
  const key = createHash("sha256").update(process.cwd()).digest("hex").slice(0, 24);
  const dir = join(tmpdir(), "docgen-studio-token");
  mkdirSync(dir, { recursive: true });
  return join(dir, key);
}

let cachedToken: string | undefined;

export function getStudioToken(): string {
  if (cachedToken) return cachedToken;
  const file = tokenFilePath();
  if (existsSync(file)) {
    const existing = readFileSync(file, "utf8").trim();
    if (existing) {
      cachedToken = existing;
      return existing;
    }
  }
  const fresh = randomBytes(24).toString("hex");
  writeFileSync(file, fresh, { mode: 0o600 });
  cachedToken = fresh;
  return fresh;
}

export const STUDIO_TOKEN_HEADER = "x-docgen-studio-token";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function hostnameOf(hostHeader: string | null): string | undefined {
  if (!hostHeader) return undefined;
  // Host header is "<hostname>[:<port>]"; IPv6 literals are bracketed, e.g. "[::1]:3000".
  if (hostHeader.startsWith("[")) {
    const end = hostHeader.indexOf("]");
    return end === -1 ? hostHeader : hostHeader.slice(0, end + 1);
  }
  return hostHeader.split(":")[0];
}

/** Extra hostnames the Studio accepts besides localhost, from `DOCGEN_STUDIO_ALLOWED_HOSTS`
 * (comma-separated, e.g. a dev proxy like "dev.example.com"). Opt-in only: anyone who can reach
 * an allowed host can edit this help app's files, so only list hosts behind your own sign-in. */
function allowedHostnames(): Set<string> {
  const extra = (process.env.DOCGEN_STUDIO_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...LOCAL_HOSTNAMES, ...extra]);
}

function isLocalHostname(hostname: string | undefined): boolean {
  return Boolean(hostname) && allowedHostnames().has(hostname!.toLowerCase());
}

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

function forbidden(): NextResponse {
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

/**
 * Guards every /studio/api/** handler against cross-site requests. In order: the request's own
 * Host must be localhost-ish (the dev server's own host — rules out DNS-rebinding-style attacks
 * that spoof Host); an Origin header, if present, must also be localhost-ish (a fetch() call
 * always sets Origin; a plain top-level navigation doesn't, but those only ever GET); a
 * body-bearing request must declare `Content-Type: application/json` (closing the `text/plain`
 * simple-request loophole); and the per-process Studio token header must match. Returns a 403
 * `NextResponse` to return immediately, or `null` to continue handling the request.
 */
export function assertStudioRequest(request: Request): NextResponse | null {
  if (!isLocalHostname(hostnameOf(request.headers.get("host")))) {
    return forbidden();
  }

  const origin = request.headers.get("origin");
  if (origin) {
    let originHostname: string;
    try {
      originHostname = new URL(origin).hostname;
    } catch {
      return forbidden();
    }
    if (!isLocalHostname(originHostname)) return forbidden();
  }

  if (BODY_METHODS.has(request.method)) {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) return forbidden();
  }

  if (request.headers.get(STUDIO_TOKEN_HEADER) !== getStudioToken()) return forbidden();

  return null;
}
