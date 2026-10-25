import type { Page } from "playwright";
import type { Target } from "../walkthrough/index.js";
import { locateAll } from "./locate.js";
import type { FailureReport } from "./types.js";
import {
  AU_MOBILE_FICTIONAL,
  AU_LANDLINE_FICTIONAL,
  US_FICTIONAL,
  UK_MOBILE_FICTIONAL,
  PHONE_CANDIDATE,
  EMAIL_PATTERN,
  SAFE_EMAIL_DOMAINS,
  looksLikeIdOrHash,
} from "../qa/pii.js";
import { SECRET_PATTERNS } from "../qa/secrets.js";

const SNAPSHOT_LINE_CAP = 60;
/** Top-level landmarks dropped first when a full-body fallback snapshot still won't fit the cap. */
const DROP_FIRST_ROLES = ["navigation", "banner", "contentinfo"];
const DIALOG_ROLES = ["dialog", "alertdialog"] as const;
const LANDMARK_ROLES = [...DIALOG_ROLES, "navigation", "banner", "contentinfo", "complementary", "region", "form", "main"];
const ROOT_ATTR = "data-docgen-failure-root";
const ANCHOR_ATTR = "data-docgen-failure-anchor";

/**
 * Builds the trimmed, agent-safe failure report: step id, action, first line
 * of the error, current URL, and an accessibility snapshot capped to ~60
 * lines, plus a screenshot path. Never full HTML or console logs.
 *
 * The snapshot used to always be `body`'s, flattened to the first ~60 lines —
 * on a real app with a long left-hand nav, that cap was spent entirely on
 * the nav and the actual form (the reason the step failed) never made it in.
 * Now it prefers, in order: the `main` landmark; else the nearest
 * landmark/dialog around the failing target's closest match or the focused
 * element; else `body` (still capped, but dropping nav/banner/contentinfo
 * first). An open dialog is always folded in too, since it's usually the
 * relevant part.
 */
export async function buildFailureReport(
  page: Page,
  step: string | undefined,
  action: string,
  error: Error,
  screenshotPath: string | null,
  failingTarget?: Target,
): Promise<FailureReport> {
  const snapshot = await captureTrimmedSnapshot(page, failingTarget);
  return {
    step,
    action,
    error: error.message.split("\n")[0] ?? String(error),
    url: stripQueryAndHash(page.url()),
    snapshot: redactSnapshot(snapshot),
    screenshotPath,
  };
}

/**
 * Drops the query string and fragment from a URL before it reaches failure.json — an agent-facing
 * file (per this module's own "Never full HTML or console logs" rule) must not leak a token,
 * session id, or other secret that landed in a query param (`?token=...`, `?reset=...`) or hash.
 * Falls back to a simple string cut if the URL doesn't parse (never throws).
 */
function stripQueryAndHash(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return url.split(/[?#]/)[0];
  }
}

/**
 * Redacts personal data and secret-shaped strings out of the aria snapshot before it reaches
 * failure.json — an accessibility snapshot includes live textbox values and table text, so a
 * step that fails mid-form (e.g. right after a `type` into an unmasked-by-name field, or a page
 * that happens to render a real token in a dev banner) must not ship that text into an
 * agent-facing file. Reuses the exact same patterns `qa/pii.ts`/`qa/secrets.ts` scan with (not a
 * parallel redaction vocabulary that could drift from what the QA pass actually flags) —
 * including `qa/pii.ts`'s own UUID/hex-id guard (`looksLikeIdOrHash`), so a database id or hash
 * that merely *looks* like a run of phone-shaped digits (bug: a UUID chunk like
 * "0491-5701-5612-..." was getting flattened to "[REDACTED PHONE]", hiding exactly the id a
 * failing step needed to debug) is left alone instead.
 */
function redactSnapshot(text: string): string {
  // Secrets first: a secret pattern (e.g. an API key's trailing digit run) can overlap what the
  // phone-candidate scan would otherwise grab, and redacting the digits out from under it first
  // would leave a shortened, partially-redacted token that might no longer meet a pattern's own
  // length minimum — the full secret should always be matched and replaced as one unit.
  let result = text;
  for (const { pattern } of SECRET_PATTERNS) {
    result = result.replace(pattern, "[REDACTED SECRET]");
  }
  result = result.replace(EMAIL_PATTERN, (match, domain: string) =>
    SAFE_EMAIL_DOMAINS.includes(domain.toLowerCase()) ? match : "[REDACTED EMAIL]",
  );
  result = result.replace(PHONE_CANDIDATE, (match: string, ...args: unknown[]) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 7) return match;
    if (
      AU_MOBILE_FICTIONAL.test(match) ||
      AU_LANDLINE_FICTIONAL.test(match) ||
      US_FICTIONAL.test(match) ||
      UK_MOBILE_FICTIONAL.test(match)
    ) {
      return match;
    }
    // `String.replace`'s callback gets (match, ...groups, offset, fullString) — PHONE_CANDIDATE
    // has no capture groups, so the last two args are exactly those.
    const offset = args[args.length - 2] as number;
    const full = args[args.length - 1] as string;
    if (looksLikeIdOrHash(full, offset, match)) return match;
    return "[REDACTED PHONE]";
  });
  return result;
}

async function captureTrimmedSnapshot(page: Page, failingTarget?: Target): Promise<string> {
  try {
    let primary: string;
    const main = page.getByRole("main");
    if ((await main.count().catch(() => 0)) > 0) {
      primary = await main.first().ariaSnapshot();
    } else {
      const landmark = await nearestLandmarkOrDialog(page, failingTarget);
      if (landmark) {
        primary = landmark;
      } else {
        const body = await page.locator("body").ariaSnapshot();
        primary = body.split("\n").length > SNAPSHOT_LINE_CAP ? dropTopLevelLandmarks(body.split("\n"), DROP_FIRST_ROLES).join("\n") : body;
      }
    }

    // Always fold in an open dialog too — it's usually the relevant part — unless it's already
    // what we picked above.
    const dialogSnapshot = await openDialogSnapshot(page);
    const parts = dialogSnapshot && !primary.includes(dialogSnapshot) ? [dialogSnapshot, primary] : [primary];

    return capLines(parts.join("\n"));
  } catch (err) {
    return `(could not capture accessibility snapshot: ${(err as Error).message})`;
  }
}

async function openDialogSnapshot(page: Page): Promise<string | null> {
  for (const role of DIALOG_ROLES) {
    const loc = page.getByRole(role).filter({ visible: true });
    if ((await loc.count().catch(() => 0)) > 0) return loc.first().ariaSnapshot().catch(() => null);
  }
  return null;
}

/**
 * Finds the nearest landmark/dialog ancestor of either a loose match for the
 * failing target, or (if that can't be resolved) the currently focused
 * element, and returns its aria snapshot. Returns null if neither exists —
 * the caller falls back to `body`.
 */
async function nearestLandmarkOrDialog(page: Page, failingTarget?: Target): Promise<string | null> {
  if (failingTarget) {
    try {
      const loose: Target = { ...failingTarget, exact: false };
      const loc = await locateAll(loose, page);
      if ((await loc.count().catch(() => 0)) > 0) {
        await loc
          .first()
          .evaluate((el, attr) => el.setAttribute(attr, "1"), ANCHOR_ATTR)
          .catch(() => {});
      }
    } catch {
      // the failing target itself can't be resolved at all — fall through to the focused element
    }
  }

  const assigned = await page.evaluate(
    ({ rootAttr, anchorAttr, roles }) => {
      const roleOf = (el: Element): string | null => {
        const explicit = el.getAttribute("role");
        if (explicit) return explicit;
        switch (el.tagName.toLowerCase()) {
          case "dialog":
            return "dialog";
          case "nav":
            return "navigation";
          case "header":
            return "banner";
          case "footer":
            return "contentinfo";
          case "aside":
            return "complementary";
          case "form":
            // A native <form> is only an ARIA landmark when it has an accessible name — the
            // common nameless <form> wrapping a single widget is not one, and treating it as
            // one would stop the walk-up one level too early (e.g. inside a dialog).
            return el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title")
              ? "form"
              : null;
          case "main":
            return "main";
          default:
            return null;
        }
      };
      const nearestLandmark = (start: Element | null): Element | null => {
        for (let n = start; n; n = n.parentElement) {
          const r = roleOf(n);
          if (r && roles.includes(r)) return n;
        }
        return null;
      };

      const anchorEl = document.querySelector(`[${anchorAttr}]`);
      anchorEl?.removeAttribute(anchorAttr);
      const focusEl = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
      const start = anchorEl ?? focusEl;
      const landmark = start ? nearestLandmark(start) : null;
      if (!landmark) return false;
      landmark.setAttribute(rootAttr, "1");
      return true;
    },
    { rootAttr: ROOT_ATTR, anchorAttr: ANCHOR_ATTR, roles: LANDMARK_ROLES },
  );

  if (!assigned) return null;

  try {
    return await page.locator(`[${ROOT_ATTR}]`).first().ariaSnapshot();
  } finally {
    await page.evaluate((attr) => document.querySelector(`[${attr}]`)?.removeAttribute(attr), ROOT_ATTR).catch(() => {});
  }
}

/** Removes whole top-level landmark subtrees (header line + its indented children) by role name. */
function dropTopLevelLandmarks(lines: string[], roles: string[]): string[] {
  const result: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const isTopLevel = /^- /.test(line);
    if (isTopLevel) {
      const m = line.match(/^- (\w+)/);
      skipping = Boolean(m && roles.includes(m[1]));
      if (skipping) continue;
    } else if (skipping) {
      continue;
    }
    result.push(line);
  }
  return result;
}

function capLines(full: string): string {
  const lines = full.split("\n");
  if (lines.length <= SNAPSHOT_LINE_CAP) return full;
  return [...lines.slice(0, SNAPSHOT_LINE_CAP), `… (${lines.length - SNAPSHOT_LINE_CAP} more lines trimmed)`].join("\n");
}
