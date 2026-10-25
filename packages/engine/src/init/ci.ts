// Writes `.github/workflows/docgen.yml` into the app repo (`docgen init --ci`; build-plan.md
// M18). No model, no API keys (decisions #22): the workflow starts the app, then hands straight
// off to the `docgen` composite action (action.yml at the docgen repo root), which runs
// `docgen ci`. Never overwrites an existing workflow file — same no-clobber rule as every other
// `docgen init` template file (see copy-template.ts, write-config.ts).
//
// Security (orchestrator review of M18):
//   - Trigger is `pull_request` only, never `pull_request_target` — the latter runs with the
//     base repo's permissions/secrets even for a PR from a fork, which is exactly the "untrusted
//     code with secrets" pattern GitHub's own docs warn against. `pull_request` naturally gets a
//     read-only token for fork PRs, so there's nothing dangerous to opt out of.
//   - Fork PRs: `is-fork` is computed once per run and passed through to the action, which skips
//     the push-to-`docgen-previews`/post-comment step and uploads the diff as an Actions artifact
//     instead (see commands/ci.ts `forkPr`). Pruning on close only runs for same-repo PRs, for
//     the same reason — a fork PR's token can't push to `docgen-previews` either way.
//   - `permissions:` is minimal and scoped per job: the default job only needs `contents: read`
//     to check out; the push+comment step additionally asks for `contents: write`/
//     `pull-requests: write`, which GitHub silently downgrades back to read-only for a fork PR
//     regardless of this block, so declaring it is safe and only takes effect for same-repo PRs.
//   - Every `uses:` is pinned to a major version tag (`@v4`), never a branch or `@master`.
//   - No secrets beyond the workflow's own automatic `GITHUB_TOKEN` — nothing to add in repo
//     settings.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface WriteCiWorkflowOptions {
  /** App repo root — the workflow goes at `<appRepo>/.github/workflows/docgen.yml`. */
  appRepo: string;
  /** Path to the docgen config, relative to the app repo root. Default "help/docgen.config.ts". */
  configPath?: string;
  /** Command that starts the app for capture, e.g. "npm run dev". Default "npm run dev". */
  startCommand?: string;
  /** URL `wait-on` polls before capture starts. Default "http://localhost:3000". */
  waitOnUrl?: string;
  /** `owner/repo@ref` for the `uses:` line. Default "elijah-g/docgen@main" (decisions #25 — the
   * public default, always configurable). */
  uses?: string;
  /** Adds a `services: postgres: ...` block when the app needs a local database to start. */
  postgres?: boolean;
}

export interface WriteCiWorkflowResult {
  file: string;
  written: boolean;
}

function postgresService(): string {
  return `    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: app
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
`;
}

/** Writes the workflow. No-ops (and reports `written: false`) when the file already exists. */
export function writeCiWorkflow(opts: WriteCiWorkflowOptions): WriteCiWorkflowResult {
  const file = join(opts.appRepo, ".github", "workflows", "docgen.yml");
  if (existsSync(file)) {
    return { file, written: false };
  }

  const configPath = opts.configPath ?? "help/docgen.config.ts";
  const startCommand = opts.startCommand ?? "npm run dev";
  const waitOnUrl = opts.waitOnUrl ?? "http://localhost:3000";
  const uses = opts.uses ?? "elijah-g/docgen@main";

  const content = `# Written by \`docgen init --ci\`. Deterministic PR check — no model, no API keys
# (docs/decisions.md #22-25): affected -> capture -> screenshot diff -> one PR comment. Broken or
# new walkthroughs are flagged with the exact repair command to run locally in Claude Code.
#
# Security: pull_request only (never pull_request_target — see init/ci.ts); fork PRs get a
# read-only token automatically, so the push/comment step is skipped for them (is-fork input) and
# the diff is uploaded as an artifact instead; permissions are minimal and scoped per job; every
# action is pinned to a major version; no secrets beyond the automatic GITHUB_TOKEN.
name: docgen

on:
  pull_request:
    types: [opened, synchronize, reopened, closed]

permissions: {}

jobs:
  docgen-ci:
    if: github.event.action != 'closed'
    runs-on: ubuntu-latest
    permissions:
      contents: write # downgraded to read-only by GitHub for fork PRs regardless of this line
      pull-requests: write # same — only takes effect for same-repo PRs
${opts.postgres ? postgresService() : ""}    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install app dependencies
        run: npm ci

      - name: Start the app
        run: ${startCommand} &

      - name: Wait for the app to come up
        run: npx --yes wait-on ${waitOnUrl} --timeout 60000

      - name: Check whether this PR is from a fork
        id: fork
        run: echo "is-fork=\${{ github.event.pull_request.head.repo.full_name != github.repository }}" >> "$GITHUB_OUTPUT"

      - uses: ${uses}
        with:
          config: ${configPath}
          app-url: ${waitOnUrl}
          base: \${{ github.event.pull_request.base.sha }}
          head: \${{ github.sha }}
          pr-number: \${{ github.event.pull_request.number }}
          is-fork: \${{ steps.fork.outputs.is-fork }}
          github-token: \${{ secrets.GITHUB_TOKEN }}

  docgen-prune-previews:
    # Only for same-repo PRs — a fork PR's token can't push to docgen-previews either way, and
    # pull_request (never pull_request_target) means this always runs with a read-only token for
    # a fork PR regardless.
    if: github.event.action == 'closed' && github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: docgen-previews
      - name: Remove this PR's preview folder
        run: |
          rm -rf "pr-\${{ github.event.pull_request.number }}"
          git -c user.email=docgen-ci@users.noreply.github.com -c user.name=docgen-ci add -A
          git diff --cached --quiet || git commit -m "prune previews for closed PR #\${{ github.event.pull_request.number }}"
          git push origin docgen-previews
`;

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
  return { file, written: true };
}
