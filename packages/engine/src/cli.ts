#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runValidate } from "./commands/validate.js";
import { runImportTallyup } from "./commands/import-tallyup.js";
import { runImportPlaywright } from "./commands/import-playwright.js";
import { runRender } from "./commands/render.js";
import { runCaptureCommand } from "./commands/capture.js";
import { runInspectCommand } from "./commands/inspect.js";
import { runInit } from "./commands/init.js";
import { runTheme } from "./commands/theme.js";
import { runPages } from "./commands/pages.js";
import { runQaCommand } from "./commands/qa.js";
import { runBuild } from "./commands/build.js";
import { runVoiceCommand } from "./commands/voice.js";
import { runDigest } from "./commands/digest.js";
import { runAffected } from "./commands/affected.js";
import { runCiCli, runCiPublishCli } from "./commands/ci.js";
import { runVersionFreeze, runVersionList } from "./commands/version.js";
import { runWhatsNew } from "./commands/whats-new.js";
import { runSkillsInstall } from "./commands/skills.js";
import { runUsageAdd, runUsageReport } from "./commands/usage.js";
import type { ModelTier } from "./usage/index.js";
import { runCatchUpCommand, runEditCommand, runUndoCommand } from "./commands/edit.js";
import type { EditBy } from "./edit/index.js";
import { runPublish } from "./commands/publish.js";
import { runPdfCommand } from "./commands/pdf.js";
import { runSuggest } from "./commands/suggest.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as {
  version: string;
};

const program = new Command();
program.name("docgen").description("Self-updating help docs, generated from walkthrough files.");
program.version(pkg.version);

// Command registry: each milestone adds its command here. Every command
// prints a short human summary by default, and one JSON object with --json.
//   M1  validate, import tallyup        <- this milestone
//   M2  capture
//   M3  voice
//   M4  render
//   M6  build, digest

program
  .command("validate <target>")
  .description("validate all walkthroughs in a file or directory")
  .option("--json", "print a single JSON object instead of a summary")
  .action((target: string, opts: { json?: boolean }) => {
    process.exitCode = runValidate(target, Boolean(opts.json));
  });

const importCmd = program.command("import").description("convert another tool's format into a walkthrough");

importCmd
  .command("tallyup <workflowJson>")
  .description("convert a TallyUp v0 workflow.json into walkthrough YAML")
  .option("-o, --output <file>", "output YAML file (default: same name, .yaml)")
  .option("--force", "overwrite the output file if it already exists")
  .option("--json", "print a single JSON object instead of a summary")
  .action((workflowJson: string, opts: { output?: string; json?: boolean; force?: boolean }) => {
    process.exitCode = runImportTallyup(workflowJson, opts.output, Boolean(opts.json), Boolean(opts.force));
  });

importCmd
  .command("playwright <testFileOrGlob>")
  .description("convert Playwright test(s) into draft walkthrough YAML")
  .option("-o, --out <dir>", "output directory (default: next to each input file)")
  .option("--force", "overwrite existing drafts")
  .option("--json", "print a single JSON object instead of a summary")
  .action((pattern: string, opts: { out?: string; json?: boolean; force?: boolean }) => {
    process.exitCode = runImportPlaywright(pattern, opts.out, Boolean(opts.json), Boolean(opts.force));
  });

program
  .command("capture [walkthroughs...]")
  .description("replay walkthroughs in a browser and capture frames, manifest and validation")
  .requiredOption("--config <path>", "path to docgen.config.ts/.mjs")
  .option("--json", "print a single JSON object instead of a summary")
  .option("--no-reset", "skip the configured database reset before capturing")
  .action(async (walkthroughs: string[], opts: { config: string; json?: boolean; reset: boolean }) => {
    process.exitCode = await runCaptureCommand({
      configPath: opts.config,
      walkthroughIds: walkthroughs,
      json: Boolean(opts.json),
      noReset: !opts.reset,
    });
  });

program
  .command("inspect <path>")
  .description(
    "open one app page signed in and print a compact, read-only map of its interactive elements " +
      "(role, accessible name, required/disabled, native <select> options, dialog/menu contents) " +
      "— what a walkthrough author needs before writing `do:`/`target:` locators",
  )
  .requiredOption("--config <path>", "path to docgen.config.ts/.mjs")
  .option("--as <persona>", "sign in as the walkthrough persona whose start.persona.role/signed_in_as matches this")
  .option("--area <cssOrLandmark>", "scope the scan to this CSS selector or ARIA landmark role (main, navigation, dialog, ...)")
  .option("--click <name>", "click this button/menuitem/tab/combobox first, to open a menu, dialog or custom listbox before scanning (every non-GET request is blocked for the whole scan, so this can never submit anything)")
  .option("--check <name>", "check this radio/checkbox first, to reveal any field it conditionally shows before scanning")
  .option("--select <values...>", 'choose an option: --select "<field>" "<option>" — native <select> or custom combobox/listbox, to reveal any field it conditionally shows before scanning (non-GET requests stay blocked)')
  .option("--json", "print a single JSON object instead of a summary")
  .action(async (path: string, opts: { config: string; as?: string; area?: string; click?: string; check?: string; select?: string[]; json?: boolean }) => {
    if (opts.select && opts.select.length !== 2) {
      console.error('--select needs exactly two values: --select "<field>" "<option>"');
      process.exitCode = 1;
      return;
    }
    process.exitCode = await runInspectCommand(
      {
        configPath: opts.config,
        path,
        as: opts.as,
        area: opts.area,
        click: opts.click,
        check: opts.check,
        select: opts.select as [string, string] | undefined,
      },
      Boolean(opts.json),
    );
  });

program
  .command("render <walkthrough>")
  .description("render a walkthrough's capture + narration into a video, captions and chapters")
  .requiredOption("--capture <dir>", "capture dir (manifest.json, validation.json, frames/)")
  .requiredOption("--voice <manifestOrDir>", "voice manifest file or its containing dir")
  .option("--draft", "lower fps/crf, ultrafast preset — for quick previews")
  .option("--stills <times>", "comma-separated seconds to render as PNG stills instead of a full render")
  .option("-o, --out-dir <dir>", "output dir (default dist/videos)")
  .option("--force", "render even if capture validation failed")
  .option("--no-cache", "re-render even if a matching .hash sidecar exists")
  .option("--config <path>", "docgen config whose brand (colours, logo, font) styles the video")
  .option("--json", "print a single JSON object instead of a summary")
  .action(async (walkthrough: string, opts: {
    config?: string;
    capture: string;
    voice: string;
    draft?: boolean;
    stills?: string;
    outDir?: string;
    force?: boolean;
    cache: boolean;
    json?: boolean;
  }) => {
    process.exitCode = await runRender(walkthrough, {
      capture: opts.capture,
      voice: opts.voice,
      draft: Boolean(opts.draft),
      stills: opts.stills,
      outDir: opts.outDir,
      force: Boolean(opts.force),
      noCache: !opts.cache,
      configPath: opts.config,
    }, Boolean(opts.json));
  });

program
  .command("pages <walkthrough>")
  .description("build a walkthrough's help page (Markdown + annotated screenshots) from its capture")
  .requiredOption("--config <path>", "path to docgen.config.ts/.mjs")
  .option("--video-dir <dir>", "where rendered videos/captions live (default <outDir>/videos)")
  .option("-o, --out-dir <dir>", "output dir (default <outDir>/pages)")
  .option("--json", "print a single JSON object instead of a summary")
  .action(async (walkthrough: string, opts: { config: string; videoDir?: string; outDir?: string; json?: boolean }) => {
    process.exitCode = await runPages(
      walkthrough,
      { configPath: opts.config, videoDir: opts.videoDir, outDir: opts.outDir },
      Boolean(opts.json),
    );
  });

program
  .command("pdf [walkthroughs...]")
  .description("render each walkthrough's PDF guide + quick-reference card, and the combined manual.pdf")
  .requiredOption("--config <path>", "path to docgen.config.ts/.mjs")
  .option("--force", "re-render even if a matching .hash sidecar exists")
  .option("--json", "print a single JSON object instead of a summary")
  .action(async (walkthroughs: string[], opts: { config: string; force?: boolean; json?: boolean }) => {
    process.exitCode = await runPdfCommand(
      { configPath: opts.config, walkthroughIds: walkthroughs, force: Boolean(opts.force) },
      Boolean(opts.json),
    );
  });

program
  .command("qa <path>")
  .description("run QA checks (video, captions, personal data, secrets) against a file or output directory")
  .option("--json", "print a single JSON object instead of a summary")
  .action(async (target: string, opts: { json?: boolean }) => {
    process.exitCode = await runQaCommand(target, Boolean(opts.json));
  });

program
  .command("voice <walkthrough>")
  .description("narrate a walkthrough's intro/step/outro lines, writing a voice manifest render can read")
  .requiredOption("--config <path>", "path to docgen.config.ts/.mjs")
  .option("--force", "re-synthesize even if a cached clip matches")
  .option("--json", "print a single JSON object instead of a summary")
  .action(async (walkthrough: string, opts: { config: string; force?: boolean; json?: boolean }) => {
    process.exitCode = await runVoiceCommand(walkthrough, { configPath: opts.config, force: opts.force }, Boolean(opts.json));
  });

program
  .command("build [walkthroughs...]")
  .description("capture, narrate, render, build pages + index, and check every walkthrough — the one-command build")
  .requiredOption("--config <path>", "path to docgen.config.ts/.mjs")
  .option("--draft", "lower fps/crf, ultrafast preset — for quick previews")
  .option("--only <stages>", "comma-separated subset of: capture,voice,render,pages,pdf,index,qa")
  .option("--skip-capture", "reuse the last capture instead of replaying the browser")
  .option("--no-reset", "skip the configured database reset before capturing")
  .option("--json", "print a single JSON object instead of a summary")
  .action(async (walkthroughs: string[], opts: {
    config: string;
    draft?: boolean;
    only?: string;
    skipCapture?: boolean;
    reset: boolean;
    json?: boolean;
  }) => {
    process.exitCode = await runBuild({
      configPath: opts.config,
      walkthroughIds: walkthroughs,
      draft: Boolean(opts.draft),
      only: opts.only,
      skipCapture: Boolean(opts.skipCapture),
      noReset: !opts.reset,
    }, Boolean(opts.json));
  });

program
  .command("digest")
  .description("compact map of a target app repo's routes, roles and on-screen labels — so an agent doesn't read the whole repo")
  .option("--app-repo <path>", "app repo to scan (default: cwd)")
  .option("--app <path>", "app directory within a workspace monorepo (e.g. apps/web) — required when several Next.js apps are found")
  .option("--area <routePrefix>", "scope the digest to routes under this prefix")
  .option("--json", "print a single JSON object instead of a summary")
  .action((opts: { appRepo?: string; app?: string; area?: string; json?: boolean }) => {
    process.exitCode = runDigest({ appRepo: opts.appRepo ?? process.cwd(), area: opts.area, app: opts.app }, Boolean(opts.json));
  });

program
  .command("affected")
  .description("map a git diff to the walkthroughs it touches (routes, API calls, walkthrough files); unknown means all")
  .requiredOption("--config <path>", "path to docgen.config.ts/.mjs")
  .requiredOption("--base <ref>", "git ref to diff --head against")
  .option("--head <ref>", "git ref to compare (default: HEAD); use --base <commit>^ --head <commit> for one past commit")
  .option("--app-repo <path>", "app repo to diff (default: config.impact.appRepo, then cwd)")
  .option("--app <path>", "app directory within a workspace monorepo (e.g. apps/web)")
  .option("--include-working-tree", "also consider uncommitted changes")
  .option("--json", "print a single JSON object instead of a summary")
  .action(
    async (opts: { config: string; base: string; head?: string; appRepo?: string; app?: string; includeWorkingTree?: boolean; json?: boolean }) => {
      process.exitCode = await runAffected(
        { configPath: opts.config, appRepo: opts.appRepo, base: opts.base, head: opts.head, app: opts.app, includeWorkingTree: opts.includeWorkingTree },
        Boolean(opts.json),
      );
    },
  );

const versionCmd = program.command("version").description("manage frozen docs versions (release tags)");

versionCmd
  .command("freeze <name>")
  .description("snapshot the current build's search index, procedures and llms.txt into public/versions/<name>")
  .requiredOption("--help-app <dir>", "the help app directory (holds public/)")
  .option("--git-ref <ref>", "git ref this version corresponds to")
  .option("--force", "overwrite an existing version")
  .option("--json", "print a single JSON object instead of a summary")
  .action((name: string, opts: { helpApp: string; gitRef?: string; force?: boolean; json?: boolean }) => {
    process.exitCode = runVersionFreeze(
      { helpApp: opts.helpApp, name, gitRef: opts.gitRef, force: Boolean(opts.force) },
      Boolean(opts.json),
    );
  });

versionCmd
  .command("list")
  .description("list frozen docs versions")
  .requiredOption("--help-app <dir>", "the help app directory (holds public/)")
  .option("--json", "print a single JSON object instead of a summary")
  .action((opts: { helpApp: string; json?: boolean }) => {
    process.exitCode = runVersionList({ helpApp: opts.helpApp }, Boolean(opts.json));
  });

program
  .command("whats-new")
  .description("build the What's new page from merged PRs since the last frozen version (or --since)")
  .requiredOption("--config <path>", "path to docgen.config.ts/.mjs")
  .option("--since <ref>", "git ref to start from")
  .option("--from-github", "use gh pr list instead of git log")
  .option("--app-repo <path>", "app repo to read history from (default: config.impact.appRepo, then the config's directory)")
  .option("--json", "print a single JSON object instead of a summary")
  .action(async (opts: { config: string; since?: string; fromGithub?: boolean; appRepo?: string; json?: boolean }) => {
    process.exitCode = await runWhatsNew(
      { configPath: opts.config, since: opts.since, fromGithub: Boolean(opts.fromGithub), appRepo: opts.appRepo },
      Boolean(opts.json),
    );
  });

program
  .command("suggest")
  .description("group logged unanswered chat questions into suggested new walkthroughs (keyword clustering, no model call)")
  .option("--dir <path>", "directory holding .docgen/unanswered.jsonl (default: cwd)")
  .option("--from <logfile|->", "read unanswered questions from host log text instead (a file path, or - for stdin) — for a prod deployment that logs to the console instead of .docgen/unanswered.jsonl")
  .option("--json", "print a single JSON object instead of a summary")
  .action((opts: { dir?: string; from?: string; json?: boolean }) => {
    process.exitCode = runSuggest({ dir: opts.dir, from: opts.from }, Boolean(opts.json));
  });

const usageCmd = program.command("usage").description("track and report model token/cost usage for a build");

usageCmd
  .command("add")
  .description("record one model call to the build's usage ledger")
  .requiredOption("--stage <stage>", "build stage that made the call, e.g. voice, pages, discover")
  .requiredOption("--tier <tier>", "fast | standard | deep")
  .option("--model <id>", "model id, e.g. claude-sonnet-5 — required unless --estimate is set, in which case it defaults to the tier's default model")
  .requiredOption("--input <n>", "input tokens", (v: string) => Number(v))
  .requiredOption("--output <n>", "output tokens", (v: string) => Number(v))
  .option("--cache-read <n>", "cache-read input tokens", (v: string) => Number(v))
  .option("--build-dir <dir>", "build dir the ledger lives in (default .build)", ".build")
  .option("--note <text>", "free-text note on this entry (why it was recorded, what it estimates, etc.)")
  .option("--estimate", "mark this entry as an estimate, not a real call's reported counts — kept out of the real total in `usage report`")
  .option("--json", "print a single JSON object instead of a summary")
  .action((opts: {
    stage: string;
    tier: ModelTier;
    model?: string;
    input: number;
    output: number;
    cacheRead?: number;
    buildDir: string;
    note?: string;
    estimate?: boolean;
    json?: boolean;
  }) => {
    process.exitCode = runUsageAdd({
      buildDir: opts.buildDir,
      stage: opts.stage,
      tier: opts.tier,
      model: opts.model,
      input: opts.input,
      output: opts.output,
      cacheRead: opts.cacheRead,
      note: opts.note,
      estimate: Boolean(opts.estimate),
    }, Boolean(opts.json));
  });

usageCmd
  .command("report")
  .description("print the build's aggregated token/cost usage")
  .option("--build-dir <dir>", "build dir the ledger lives in (default .build)", ".build")
  .option("--json", "print a single JSON object instead of a summary")
  .action((opts: { buildDir: string; json?: boolean }) => {
    process.exitCode = runUsageReport(opts.buildDir, Boolean(opts.json));
  });

const skillsCmd = program.command("skills").description("install docgen's Agent Skills + subagent definitions into a repo");

skillsCmd
  .command("install")
  .description("copy skills/** into <target>/.claude/skills/ and agents into <target>/.claude/agents/")
  .option("--target <repo>", "target repo (default: cwd)")
  .option("--json", "print a single JSON object instead of a summary")
  .action((opts: { target?: string; json?: boolean }) => {
    process.exitCode = runSkillsInstall({ target: opts.target }, Boolean(opts.json));
  });

program
  .command("init [dir]")
  .description("scaffold the help app template into <dir>/help, detecting the app's framework, routes and brand")
  .option("--app-repo <path>", "app repo to detect framework/routes/brand from (default: <dir>)")
  .option("--app <path>", "app directory within a workspace monorepo (e.g. apps/web) — required when several Next.js apps are found")
  .option("--ci", "also write .github/workflows/docgen.yml (PR check with screenshot diffs, publish-on-merge)")
  .option("--ci-start-command <cmd>", "command that starts the app in CI (default: npm run dev)")
  .option("--ci-uses <ownerRepoAtRef>", "the docgen action to use (default: elijah-g/docgen@main)")
  .option("--claude", "also write .github/workflows/docgen-repair.yml: opt-in Claude Code repair on an @claude comment or the docs:repair label (requires --ci)")
  .option("--claude-trigger-phrase <phrase>", "--claude's PR-comment trigger phrase (default: @claude)")
  .option("--claude-label <label>", "--claude's label trigger (default: docs:repair)")
  .option("--docs-repo <ownerRepo>", "walkthroughs/help app live in a separate repo — the workflow checks it out to .docgen-docs with secrets.DOCGEN_DOCS_TOKEN (requires --ci)")
  .option("--json", "print a single JSON object instead of a summary")
  .action(
    (
      dir: string | undefined,
      opts: {
        appRepo?: string;
        app?: string;
        ci?: boolean;
        ciStartCommand?: string;
        ciUses?: string;
        claude?: boolean;
        claudeTriggerPhrase?: string;
        claudeLabel?: string;
        docsRepo?: string;
        json?: boolean;
      },
    ) => {
      process.exitCode = runInit(
        {
          dir,
          appRepo: opts.appRepo,
          app: opts.app,
          ci: opts.ci,
          ciStartCommand: opts.ciStartCommand,
          ciUses: opts.ciUses,
          ciClaude: opts.claude,
          ciClaudeTriggerPhrase: opts.claudeTriggerPhrase,
          ciClaudeLabel: opts.claudeLabel,
          ciDocsRepo: opts.docsRepo,
        },
        Boolean(opts.json),
      );
    },
  );

program
  .command("theme [dir]")
  .description("rewrite the help app's theme files (app/brand.css, lib/brand.json, public/brand/) from docgen.config's brand")
  .option("--config <path>", "path to docgen.config.ts/.mjs (default: <dir>/docgen.config.* or <dir>/help/docgen.config.*)")
  .option("--detect", "re-detect the brand from the app and print a suggested brand block (writes nothing)")
  .option("--app-repo <path>", "app repo to detect from with --detect (default: impact.appRepo, else the config's directory)")
  .option("--json", "print a single JSON object instead of a summary")
  .action(async (dir: string | undefined, opts: { config?: string; detect?: boolean; appRepo?: string; json?: boolean }) => {
    process.exitCode = await runTheme({ dir, config: opts.config, detect: Boolean(opts.detect), appRepo: opts.appRepo }, Boolean(opts.json));
  });

program
  .command("ci")
  .description("PR check: affected walkthroughs, capture, screenshot diff, one PR comment (no model, no API keys)")
  .requiredOption("--config <path>", "path to docgen.config.ts/.mjs")
  .requiredOption("--base <ref>", "git ref to diff --head against")
  .option("--head <ref>", "git ref to compare (default: HEAD)")
  .option("--pr <number>", "pull request number, for the PR comment")
  .option("--app-url <url>", "override config.app.baseUrl for this run")
  .option("--app-repo <path>", "app repo to diff (default: config.impact.appRepo, then cwd)")
  .option("--baseline <source>", "where before-screenshots come from: disk (help app, default) or git (at --base)")
  .option("--fork-pr", "PR comes from a fork (read-only token): skip push and comment, write an artifact")
  .option("--dry-run", "write the comment and images to a local dir instead of GitHub")
  .option(
    "--publish",
    "merge-behaviour hook (build-plan.md M19): re-capture and republish what --base..--head affected into the help app, no PR/comment — run this on push to main",
  )
  .option("--json", "print a single JSON object instead of a summary")
  .action(
    async (opts: {
      config: string;
      base: string;
      head?: string;
      pr?: string;
      appUrl?: string;
      appRepo?: string;
      baseline?: string;
      forkPr?: boolean;
      dryRun?: boolean;
      publish?: boolean;
      json?: boolean;
    }) => {
      if (opts.publish) {
        process.exitCode = await runCiPublishCli(
          { configPath: opts.config, base: opts.base, head: opts.head, appUrl: opts.appUrl, appRepo: opts.appRepo },
          Boolean(opts.json),
        );
        return;
      }
      if (opts.baseline && opts.baseline !== "disk" && opts.baseline !== "git") {
        console.error(`--baseline must be "disk" or "git", got "${opts.baseline}"`);
        process.exitCode = 2;
        return;
      }
      process.exitCode = await runCiCli(
        {
          configPath: opts.config,
          base: opts.base,
          head: opts.head,
          prNumber: opts.pr ? Number(opts.pr) : undefined,
          appUrl: opts.appUrl,
          appRepo: opts.appRepo,
          baseline: opts.baseline as "disk" | "git" | undefined,
          forkPr: Boolean(opts.forkPr),
          dryRun: Boolean(opts.dryRun),
        },
        Boolean(opts.json),
      );
    },
  );

program
  .command("edit <action> [args...]")
  .description(
    "apply a shared edit action: setStepField <file> <stepId> <say|caption|page_text|title|hold|do|check> <value> | " +
      "setStepActions <file> <stepId> <actionsJson> | reorderSteps <file> <id1,id2,...> | " +
      "removeStep <file> <stepId> | " +
      "insertStep <file> --after <stepId>|--before <stepId>|--at-start --id <newId> --do \"...\" [--say ..] [--caption ..] [--page-text ..] [--title ..] [--chapter ..] [--camera full|<targetJson>] | " +
      "setData <file> <dotted.path> <value> | " +
      "setPageBlock <pageFile> <key> <text> | lock <anchorFile> <item> | unlock <anchorFile> <item> | " +
      "addCallout <file> <stepId> <calloutJson> | updateCallout <file> <stepId> <calloutId> <patchJson> | " +
      "removeCallout <file> <stepId> <calloutId> | reorderCallouts <file> <stepId> <id1,id2,...> | " +
      "addBlur <file> <stepId> <blurJson> | updateBlur <file> <stepId> <blurId> <patchJson> | " +
      "removeBlur <file> <stepId> <blurId>",
  )
  // insertStep's position/field flags (--after/--before/--at-start/--id/--do/--say/--caption/
  // --page-text/--title/--chapter/--camera) aren't declared options on this command — they're
  // parsed out of `args` by dispatchEdit — so Commander must not reject them as unknown options.
  .allowUnknownOption()
  .option("--by <who>", "agent | person (default agent)", "agent")
  .option("--json", "print a single JSON object instead of a summary")
  .action((action: string, args: string[], opts: { by: EditBy; json?: boolean }) => {
    process.exitCode = runEditCommand(action, args, { by: opts.by, json: Boolean(opts.json) });
  });

program
  .command("undo")
  .description("revert the last edit (optionally the last by agent or person only)")
  .option("--by <who>", "agent | person — only undo the last edit by this author")
  .option("--dir <path>", "any path inside the help app (default: cwd)")
  .option("--json", "print a single JSON object instead of a summary")
  .action((opts: { by?: EditBy; dir?: string; json?: boolean }) => {
    process.exitCode = runUndoCommand(opts.dir, { by: opts.by, json: Boolean(opts.json) });
  });

program
  .command("catch-up")
  .description("list edits a person made in the Studio since a point in time — for an agent to read at the start of a turn")
  .option("--since <isoOrLast>", "ISO timestamp, or \"last\" for since this command's last call")
  .option("--dir <path>", "any path inside the help app (default: cwd)")
  .option("--json", "print a single JSON object instead of a summary")
  .action((opts: { since?: string; dir?: string; json?: boolean }) => {
    process.exitCode = runCatchUpCommand(opts.dir, opts.since, { json: Boolean(opts.json) });
  });

program
  .command("publish")
  .description("write a host's config, optionally upload videos to blob storage, then deploy through the host's own CLI")
  .requiredOption("--config <path>", "path to docgen.config.ts/.mjs")
  .option("--to <host>", "vercel | netlify | amplify | cloudflare | node | static (default: config.host)")
  .option("--prod", "production publish (default: preview)")
  .option("--dry-run", "print the plan only — no gates, no file write, no deploy")
  .option("--approve", "record first-production-publish approval (must be used with --by person)")
  .option("--by <who>", "who --approve is on behalf of — must be \"person\"")
  .option("--json", "print a single JSON object instead of a summary")
  .action(async (opts: { config: string; to?: string; prod?: boolean; dryRun?: boolean; approve?: boolean; by?: string; json?: boolean }) => {
    process.exitCode = await runPublish(
      {
        configPath: opts.config,
        to: opts.to,
        prod: Boolean(opts.prod),
        dryRun: Boolean(opts.dryRun),
        approve: Boolean(opts.approve),
        approveBy: opts.by,
      },
      Boolean(opts.json),
    );
  });

program.parse();
