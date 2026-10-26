// `docgen init [dir] [--app-repo <path>] [--json]` — scope.md "First run:
// engineer" step 1. Copies the help-app template into `<dir>/help`, detects
// the target app's framework/routes (comments only) and brand, and writes
// `docgen.config.ts`, then writes the help app's theme files (app/brand.css, lib/brand.json,
// public/brand/) from that brand. Never overwrites a file that's already there — except the
// generated theme files, and only when the config was freshly written.
import { resolve, relative } from "node:path";
import { detectFramework } from "../init/detect.js";
import { extractBrand, rebaseBrandPaths } from "../init/brand.js";
import { copyTemplate } from "../init/copy-template.js";
import { writeDocgenConfig } from "../init/write-config.js";
import { writeCiWorkflow, writeClaudeRepairWorkflow } from "../init/ci.js";
import type { BrandConfig } from "../config/types.js";
import { writeHelpAppTheme } from "../theme/write.js";

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
  /** Also writes `.github/workflows/docgen-repair.yml` (build-plan.md M19 item 2) — opt-in Claude
   * Code repair on an `@claude` comment or the `docs:repair` label. Requires `ci`. */
  ciClaude?: boolean;
  /** `--claude`'s trigger phrase. Default "@claude". */
  ciClaudeTriggerPhrase?: string;
  /** `--claude`'s label trigger. Default "docs:repair". */
  ciClaudeLabel?: string;
  /** `owner/repo` of a separate docs repo (build-plan.md M19 item 3) — sets `config.ci.docsRepo`
   * and has the generated workflow check it out to `.docgen-docs` with `DOCGEN_DOCS_TOKEN`. */
  ciDocsRepo?: string;
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
  /** Theme files written from the detected brand (only when the config was freshly written —
   * an existing config is the source of truth; run `docgen theme` for it). */
  theme?: { files: string[]; written: string[]; warnings: string[] };
  ci?: { file: string; written: boolean };
  claudeRepair?: { file: string; written: boolean };
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
  // Asset paths come back relative to the app repo; the config wants them relative to itself.
  const brand = rebaseBrandPaths(extractBrand(appRepoDir), appRepoDir, destDir);
  const { copied, skipped } = copyTemplate(destDir);
  const config = writeDocgenConfig({
    destDir,
    appUrl: options.appUrl ?? "http://localhost:3000",
    brand,
    detected,
    ci: options.ci ? { claudeAction: options.ciClaude, docsRepo: options.ciDocsRepo } : undefined,
  });
  let theme: InitResult["theme"];
  if (config.written) {
    const t = writeHelpAppTheme({ brand, configDir: destDir }, destDir);
    theme = { files: t.files, written: t.written, warnings: t.warnings };
  }

  let ci: { file: string; written: boolean } | undefined;
  let claudeRepair: { file: string; written: boolean } | undefined;
  if (options.ci) {
    ci = writeCiWorkflow({
      appRepo: appRepoDir,
      configPath: options.ciDocsRepo ? undefined : `${relative(appRepoDir, destDir)}/docgen.config.ts`,
      startCommand: options.ciStartCommand,
      uses: options.ciUses,
      docsRepo: options.ciDocsRepo,
    });
    if (options.ciClaude) {
      claudeRepair = writeClaudeRepairWorkflow({
        appRepo: appRepoDir,
        triggerPhrase: options.ciClaudeTriggerPhrase,
        labelTrigger: options.ciClaudeLabel,
      });
    }
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
    theme,
    ci,
    claudeRepair,
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
  const brandEntries = Object.entries(result.brand).filter(([, v]) => typeof v === "string");
  if (brandEntries.length > 0) {
    console.log(`  brand: ${brandEntries.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }
  console.log(`  files written: ${result.copied}`);
  if (result.skipped.length > 0) {
    console.log(`  skipped (already present): ${result.skipped.join(", ")}`);
  }
  console.log(result.config.written ? `  wrote ${result.config.file}` : `  left existing ${result.config.file} untouched`);
  if (result.theme) {
    console.log(`  theme: ${result.theme.written.length} file(s) written (app/brand.css, lib/brand.json, public/brand/)`);
    for (const w of result.theme.warnings) console.log(`  warning: ${w}`);
  }
  if (result.ci) {
    console.log(result.ci.written ? `  wrote ${result.ci.file}` : `  left existing ${result.ci.file} untouched`);
  }
  if (result.claudeRepair) {
    console.log(result.claudeRepair.written ? `  wrote ${result.claudeRepair.file}` : `  left existing ${result.claudeRepair.file} untouched`);
  }
  return 0;
}
