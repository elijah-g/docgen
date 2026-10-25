// `docgen inspect <path> --config <cfg>`: opens one app page signed in, then prints a compact
// map of what a walkthrough author needs — role/name/required/disabled/select-options for every
// interactive element in the main landmark (or open dialog) — without the author (or an agent)
// reading the app's source. Read-only: the only click it ever makes is `--click`, and that's
// restricted to button/menuitem/tab and refuses submit-shaped names (see inspect/click.ts).
//
// Reuses capture's own building blocks rather than re-implementing them: `config.signIn` (the
// same adapter capture uses) and a session file under `config.buildDir/.docgen-session` keyed
// the same way commands/capture.ts keys it, so a session capture already signed in with is
// reused here too; `assertWritesAllowed`/`isLocalBaseUrl` (capture/write-guard.ts) gate the one
// write-shaped thing inspect can do (`--click`), the same way capture gates click/type/select.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { NAME_SHIM_SCRIPT } from "../capture/init-scripts.js";
import type { Browser, BrowserContext, Page } from "playwright";
import { loadConfig } from "../config/index.js";
import type { ResolvedConfig } from "../config/index.js";
import { loadWalkthroughFile } from "../walkthrough/index.js";
import type { Persona } from "../walkthrough/index.js";
import { isLocalBaseUrl } from "../capture/index.js";
import { scanPage, clickToOpen, checkToReveal, selectOption, InspectClickRefusedError } from "../inspect/index.js";
import type { InspectResult } from "../inspect/index.js";

export interface RunInspectOptions {
  configPath: string;
  path: string;
  as?: string;
  area?: string;
  click?: string;
  check?: string;
  /** `[field, option]` — see inspect/click.ts's `selectOption`. */
  select?: [string, string];
}

/**
 * Blocks every non-GET request for the lifetime of an inspect session — the real safety net
 * behind `--click`/`--check` (see inspect/click.ts): no matter what an element's role, type, or
 * name suggest, a write can never actually leave the browser once this is installed. Applied
 * after sign-in completes (sign-in itself may legitimately need to POST a session ticket) and
 * before anything in the scan does its own clicking/scanning.
 */
async function blockNonGetRequests(page: Page): Promise<void> {
  await page.route("**/*", (route) => {
    if (route.request().method() === "GET") return route.continue();
    return route.abort();
  });
}

/** Same persona+baseUrl -> session-file hash commands/capture.ts uses, so a session either
 * command signs in reuses across both. */
function storageStateKey(baseUrl: string, persona: Persona | undefined): string {
  const hash = createHash("sha256").update(JSON.stringify({ baseUrl, persona: persona ?? null })).digest("hex");
  return hash.slice(0, 16);
}

/** Finds a persona to sign in as: `--as <role>` matches a walkthrough whose `start.persona.role`
 * or `start.signed_in_as` equals it; with no `--as`, the first walkthrough with any persona at
 * all. `undefined` when the walkthroughs dir has nothing usable (inspect still runs — a page
 * that needs no sign-in works fine with no persona). */
function resolvePersona(walkthroughsDir: string, as: string | undefined): Persona | undefined {
  let files: string[] = [];
  try {
    files = readdirSync(walkthroughsDir)
      .filter((f) => /\.(ya?ml)$/i.test(f))
      .map((f) => join(walkthroughsDir, f))
      .sort();
  } catch {
    return undefined;
  }

  for (const file of files) {
    let wt;
    try {
      wt = loadWalkthroughFile(file);
    } catch {
      continue;
    }
    const persona = wt.start?.persona;
    const role = persona?.role ?? wt.start?.signed_in_as;
    if (as === undefined) {
      if (persona) return persona;
      continue;
    }
    if (role === as) return persona ?? { role };
  }

  if (as !== undefined) {
    throw new Error(`no walkthrough in ${walkthroughsDir} signs in as "${as}" (checked start.persona.role / start.signed_in_as)`);
  }
  return undefined;
}

const SIGN_IN_REDIRECT = /\/(sign-in|signin|login|auth)(\/|$|\?)/i;

async function openSignedIn(
  config: ResolvedConfig,
  path: string,
  persona: Persona | undefined,
): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const baseUrl = config.app.baseUrl;
  const storageStatePath = join(config.buildDir, ".docgen-session", `storageState-${storageStateKey(baseUrl, persona)}.json`);
  const reuseState = existsSync(storageStatePath) ? storageStatePath : undefined;

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: config.viewport ?? { width: 1440, height: 810 },
    deviceScaleFactor: config.deviceScaleFactor ?? 2,
    locale: config.locale ?? "en-AU",
    timezoneId: config.timezone ?? "Australia/Perth",
    colorScheme: "light",
    reducedMotion: config.reducedMotion ?? "reduce",
    ...(reuseState ? { storageState: reuseState } : {}),
  });

  await context.addInitScript(NAME_SHIM_SCRIPT);
  const page = await context.newPage();

  const doSignIn = async (): Promise<void> => {
    if (!config.signIn) return;
    await config.signIn({ page, context, baseUrl, persona, env: process.env });
    mkdirSync(dirname(storageStatePath), { recursive: true });
    await context.storageState({ path: storageStatePath });
  };

  if (!reuseState && config.signIn) {
    await doSignIn();
  }

  await page.goto(baseUrl + path, { waitUntil: "networkidle", timeout: 120_000 });

  if (reuseState && config.signIn && SIGN_IN_REDIRECT.test(new URL(page.url()).pathname)) {
    await doSignIn();
    await page.goto(baseUrl + path, { waitUntil: "networkidle", timeout: 120_000 });
  }

  return { browser, context, page };
}

function formatText(result: InspectResult): string {
  const header = `${result.url}${result.area ? `  (area: ${result.area})` : ""}`;
  const clickLines: string[] = [];
  if (result.click) {
    clickLines.push(`--click: dialog opened=${result.click.dialogOpened}, blocked write=${result.click.blockedWrite}`);
    if (result.click.warning) clickLines.push(`  warning: ${result.click.warning}`);
    if (result.click.listboxOptions) {
      clickLines.push(`  listbox options: ${result.click.listboxOptions.map((o) => JSON.stringify(o)).join(", ")}`);
      if (result.click.listboxTruncated) clickLines.push(`  (+more, capped at 15)`);
    }
  }
  return [header, ...clickLines, result.snapshot].join("\n");
}

/** Runs `docgen inspect`. Returns 0 on success, 1 on a refused/failed scan. */
export async function runInspectCommand(opts: RunInspectOptions, json: boolean): Promise<number> {
  const config = await loadConfig(opts.configPath);
  let persona: Persona | undefined;
  try {
    persona = resolvePersona(config.walkthroughsDir, opts.as);
  } catch (err) {
    const message = (err as Error).message;
    if (json) console.log(JSON.stringify({ ok: false, error: message }));
    else console.error(`inspect failed: ${message}`);
    return 1;
  }

  let browser: Browser | undefined;
  try {
    const opened = await openSignedIn(config, opts.path, persona);
    browser = opened.browser;
    const { page } = opened;

    // From here on, nothing this scan does — `--click`, `--check`, or the scan itself — can
    // write anything: every non-GET request is aborted before it reaches the wire.
    await blockNonGetRequests(page);

    let click: InspectResult["click"];
    if (opts.click) {
      click = await clickToOpen(page, opts.click);
    }
    if (opts.check) {
      await checkToReveal(page, opts.check);
    }
    if (opts.select) {
      const [field, option] = opts.select;
      await selectOption(page, field, option);
    }

    const scanned = await scanPage(page, { area: opts.area });
    const result: InspectResult = click ? { ...scanned, click } : scanned;

    if (json) {
      console.log(JSON.stringify({ ok: true, ...result }));
    } else {
      console.log(formatText(result));
    }
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
    const refused = err instanceof InspectClickRefusedError;
    if (json) console.log(JSON.stringify({ ok: false, error: message, refused }));
    else console.error(`inspect failed: ${message}`);
    return 1;
  } finally {
    await browser?.close().catch(() => {});
  }
}

// Re-exported so a test (or `docgen digest`-style scripting) can check a baseUrl's write-safety
// the same way this command does, without reaching into capture/write-guard.ts directly.
export { isLocalBaseUrl };
