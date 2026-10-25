import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  DatabaseAdapter,
  DatabaseAdapterRef,
  DocgenConfig,
  ResolvedConfig,
  SignInAdapter,
  SignInAdapterRef,
} from "./types.js";
import { resolveCaptureSettings } from "./types.js";

let tsxRegistered = false;

/**
 * True when this process's own ESM loader chain already includes tsx — i.e. we were started as
 * `tsx <script>` / `npx tsx <script>` (tsx's CLI adds `--import tsx/dist/loader.mjs` to
 * `process.execArgv`). In that case tsx already intercepts `.ts` imports, so a `.ts` config file
 * can just be imported directly; registering tsx *again* (via `node:module`'s `register`, which
 * needs `--import`, or otherwise) throws "tsx must be loaded with --import instead of --loader"
 * because tsx's own loader is already active as a `--loader`-style hook from inside the running
 * process, not from a fresh `--import` flag.
 */
function runningUnderTsx(): boolean {
  if (typeof process === "undefined") return false;
  // tsx's own CLI (and `npx tsx <script>`) launches Node with its ESM loader pre-registered via
  // `--import tsx/dist/loader.mjs` in process.execArgv. No env var or globalThis marker is set —
  // this is the one reliable signal.
  return process.execArgv.some((arg) => /tsx[\\/]dist[\\/]loader\.mjs/.test(arg));
}

/**
 * Registers tsx's ESM loader (once) if `file` needs it and it isn't already active — shared by
 * the config-file import below and `importAdapter()`, so a `.ts`/`.mts`/`.cts` *adapter*
 * referenced by an otherwise-plain `.mjs` config also gets tsx support. Before this, adapters
 * were imported with a plain dynamic `import()` regardless of the main config's extension, so
 * `node dist/cli.js inspect|capture` against a `.mjs` config whose `signIn`/`database` adapter is
 * a `.ts` file failed with `ERR_UNKNOWN_FILE_EXTENSION ".ts"` the moment the adapter resolved —
 * only a `.ts` *config* ever got tsx registered (build-plan.md M14 log).
 */
async function ensureTsxForFile(file: string): Promise<void> {
  if (!/\.(ts|mts|cts)$/.test(file)) return;
  if (tsxRegistered || runningUnderTsx()) return;
  const { register } = await import("tsx/esm/api");
  register();
  tsxRegistered = true;
}

/**
 * Imports a `docgen.config.ts`/`.mjs`/`.js` file and resolves it into a
 * `ResolvedConfig`: adapters loaded, paths made absolute. `.mjs`/`.js` use a plain dynamic
 * `import()`. `.ts` either imports directly (when tsx's own loader is already active in this
 * process — see `runningUnderTsx`) or registers tsx via its supported `tsx/esm/api` `register()`
 * function (not `node:module`'s `register`, which requires tsx to have been loaded with
 * `--import` from the start — see the error above).
 */
export async function loadConfig(configPath: string): Promise<ResolvedConfig> {
  const file = resolve(configPath);
  if (!existsSync(file)) {
    throw new Error(`no config file at ${file}`);
  }
  await ensureTsxForFile(file);

  const mod = (await import(`${pathToFileURL(file).href}?t=${Date.now()}`)) as {
    default?: DocgenConfig | { __esModule: true; default: DocgenConfig };
    config?: DocgenConfig;
  };
  let raw: unknown = mod.default ?? mod.config;
  // tsx's own CJS/ESM interop can double-wrap a `.ts` config's default export as
  // `{ __esModule: true, default: {...} }` when the config file isn't inside a package that
  // declares `"type": "module"` (tsx then compiles it to CJS, and Node's loader re-wraps it as
  // an ESM default) — seen via the `tsx/esm/api` register() path above, not the direct-tsx path.
  // Unwrap once more in that case.
  if (raw && typeof raw === "object" && (raw as { __esModule?: boolean }).__esModule === true && "default" in raw) {
    raw = (raw as { default: unknown }).default;
  }
  const config = raw as DocgenConfig | undefined;
  if (!config) {
    throw new Error(`${file} has no default export (use defineConfig({...}) and export default)`);
  }

  const configDir = dirname(file);
  return resolveConfig(config, configDir);
}

async function resolveConfig(config: DocgenConfig, configDir: string): Promise<ResolvedConfig> {
  if (!config.app?.baseUrl) throw new Error("config.app.baseUrl is required");
  if (!config.walkthroughsDir) throw new Error("config.walkthroughsDir is required");

  const signIn = config.signIn ? await resolveSignIn(config.signIn, configDir) : undefined;
  const database = config.database ? await resolveDatabase(config.database, configDir) : undefined;

  return {
    ...config,
    configDir,
    walkthroughsDir: absolute(configDir, config.walkthroughsDir),
    outDir: absolute(configDir, config.outDir ?? "help"),
    buildDir: absolute(configDir, config.buildDir ?? ".build"),
    helpApp: config.helpApp ? absolute(configDir, config.helpApp) : undefined,
    capture: resolveCaptureSettings(config.capture),
    signIn,
    database,
  };
}

function absolute(configDir: string, p: string): string {
  return isAbsolute(p) ? p : join(configDir, p);
}

async function resolveSignIn(ref: SignInAdapterRef, configDir: string): Promise<SignInAdapter> {
  if (typeof ref === "function") return ref;
  if (typeof ref === "string") return importAdapter<SignInAdapter>(ref, configDir, undefined);
  return importAdapter<SignInAdapter>(ref.modulePath, configDir, ref.export);
}

async function resolveDatabase(ref: DatabaseAdapterRef, configDir: string): Promise<DatabaseAdapter> {
  if (typeof ref === "string") return importAdapter<DatabaseAdapter>(ref, configDir, undefined);
  if ("modulePath" in ref) return importAdapter<DatabaseAdapter>(ref.modulePath, configDir, ref.export);
  return ref;
}

async function importAdapter<T>(modulePath: string, configDir: string, exportName: string | undefined): Promise<T> {
  const file = isAbsolute(modulePath) ? modulePath : join(configDir, modulePath);
  await ensureTsxForFile(file);
  // A bare `.ts`/`.mts`/`.cts` adapter path, imported right after tsx's loader was registered at
  // runtime via `ensureTsxForFile()` above (rather than tsx's own `--import`-started loader, the
  // `runningUnderTsx()` case), can mis-detect the file's module format on its first-ever import
  // and throw Node's `ERR_REQUIRE_CYCLE_MODULE` — the same cache-busting query `loadConfig()`
  // already puts on a `.ts` config's own import avoids it here too.
  const needsCacheBust = /\.(ts|mts|cts)$/.test(file) && !runningUnderTsx();
  const href = pathToFileURL(file).href + (needsCacheBust ? `?t=${Date.now()}` : "");
  const mod = (await import(href)) as Record<string, unknown>;
  let value = exportName ? mod[exportName] : (mod.default ?? mod.signIn ?? mod.database ?? mod.adapter);
  // Mirror loadConfig()'s own unwrap: tsx's runtime-registered loader can double-wrap a `.ts`
  // adapter's default export the same way it does a `.ts` config's (see the comment on
  // `loadConfig` above) when the adapter file isn't inside a package declaring `"type":
  // "module"`.
  if (value && typeof value === "object" && (value as { __esModule?: boolean }).__esModule === true && "default" in value) {
    value = (value as { default: unknown }).default;
  }
  if (!value) {
    throw new Error(`${file} has no usable export (expected a default export or a named adapter export)`);
  }
  return value as T;
}
