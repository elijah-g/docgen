// `docgen init [dir] [--app-repo <path>] [--json]` — scope.md "First run:
// engineer" step 1. Copies the help-app template into `<dir>/help`, detects
// the target app's framework/routes (comments only) and brand, and writes
// `docgen.config.ts`. Never overwrites a file that's already there.
import { resolve, relative } from "node:path";
import { detectFramework } from "../init/detect.js";
import { extractBrand } from "../init/brand.js";
import { copyTemplate } from "../init/copy-template.js";
import { writeDocgenConfig } from "../init/write-config.js";
import { writeCiWorkflow } from "../init/ci.js";
import type { BrandConfig } from "../config/types.js";

export interface InitOptions {
  /** Repo to add the help app to; `<dir>/help` is the destination. Default cwd. */
  dir?: string;
  /** App repo to detect brand/framework/routes from. Default: same as `dir`. */
  appRepo?: string;
  /** App directory within a workspace monorepo (relative to appRepo, or absolute). Required when
   * `appRepo` is a monorepo with several Next.js apps. */
  app?: string;
  /** Default app URL written into docgen.config.ts when nothing better is known. */
  appUrl?: string;
  /** Also writes `.github/workflows/docgen.yml` (build-plan.md M18). */
  ci?: boolean;
  /** `--ci`'s app-start command. Default "npm run dev". */
  ciStartCommand?: string;
  /** `--ci`'s `uses:` line for the docgen action. Default "elijah-g/docgen@main" (decisions #25). */
  ciUses?: string;
}

export interface InitResult {
  destDir: string;
  appRepoDir: string;
  framework: string;
  routes: string[];
  brand: BrandConfig;
  copied: number;
  skipped: string[];
  config: { file: string; written: boolean };
  ci?: { file: string; written: boolean };
}

export function runInitCommand(options: InitOptions): InitResult {
  const dir = resolve(options.dir ?? process.cwd());
  const appRepoDir = resolve(options.appRepo ?? dir);
  const destDir = resolve(dir, "help");

  const detected = detectFramework(appRepoDir, { app: options.app });
  if (detected.apps && detected.apps.length > 1) {
    const list = detected.apps.map((a) => `${a.path} (${a.routeCount} routes)`).join(", ");
    throw new Error(`found ${detected.apps.length} Next.js apps in this workspace — pass --app <path> to pick one: ${list}`);
  }
  const brand = extractBrand(appRepoDir);
  const { copied, skipped } = copyTemplate(destDir);
  const config = writeDocgenConfig({
    destDir,
    appUrl: options.appUrl ?? "http://localhost:3000",
    brand,
    detected,
  });

  let ci: { file: string; written: boolean } | undefined;
  if (options.ci) {
    ci = writeCiWorkflow({
      appRepo: appRepoDir,
      configPath: `${relative(appRepoDir, destDir)}/docgen.config.ts`,
      startCommand: options.ciStartCommand,
      uses: options.ciUses,
    });
  }

  return {
    destDir,
    appRepoDir,
    framework: detected.framework,
    routes: detected.routes,
    brand,
    copied: copied.length,
    skipped,
    config,
    ci,
  };
}

export function runInit(options: InitOptions, json: boolean): number {
  let result: InitResult;
  try {
    result = runInitCommand(options);
  } catch (err) {
    const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
    if (json) {
      console.log(JSON.stringify({ error: message }));
    } else {
      console.error(`error: ${message}`);
    }
    return 1;
  }

  if (json) {
    console.log(JSON.stringify(result));
    return 0;
  }

  console.log(`help app scaffolded at ${result.destDir}`);
  console.log(`  app repo: ${result.appRepoDir} (${result.framework})`);
  if (result.routes.length > 0) console.log(`  routes seen: ${result.routes.join(", ")}`);
  const brandEntries = Object.entries(result.brand);
  if (brandEntries.length > 0) {
    console.log(`  brand: ${brandEntries.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }
  console.log(`  files written: ${result.copied}`);
  if (result.skipped.length > 0) {
    console.log(`  skipped (already present): ${result.skipped.join(", ")}`);
  }
  console.log(result.config.written ? `  wrote ${result.config.file}` : `  left existing ${result.config.file} untouched`);
  if (result.ci) {
    console.log(result.ci.written ? `  wrote ${result.ci.file}` : `  left existing ${result.ci.file} untouched`);
  }
  return 0;
}
