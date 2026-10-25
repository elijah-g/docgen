# docgen (working name)

Point it at an app's repo and running app; get a help centre that keeps itself current: a printable
help site, narrated how-to videos, a help chat, and an agent connector (MCP server) other agents can
use. Works with any coding agent and any voice provider, and updates from CI.

How it works in one line: your coding agent, using docgen's skills and engine, writes walkthrough
files and a prescaffolded Next.js help app into `help/`. You edit it in a local Studio
(`npm run dev` → `/studio`) and deploy it like any Next.js app: Vercel, AWS Amplify, Netlify,
Cloudflare, a Node server, or a static host. Node only, no Docker.

**Status:** Phase 0 done on two apps (TallyUp and emh-check); most of Phase 1 and a first cut of
Phase 3 (help chat and agent connector) are built. Not yet released. Progress, milestones and open
follow-ups are in [docs/build-plan.md](docs/build-plan.md).

## What it makes

From one walkthrough file per task (each step's action, narration, caption, page text and check):

- **Help site.** A Next.js + Fumadocs app with a page per walkthrough, annotated screenshots, search,
  print styles, `llms.txt`, and a "last checked" date. Pages only publish if every step passed
  against the real app.
- **Printable guides.** A PDF per page, a full manual, and a one-page quick reference card.
- **Videos.** Narrated MP4 per walkthrough with captions (SRT, VTT) and chapters. Local Kokoro voice
  by default (no API key); MiniMax and ElevenLabs optional.
- **Help chat.** Answers only from the docs, cites pages, and works on the site or inside your app
  via a script tag. Uses the site owner's Anthropic key; without one the rest of the site still
  works.
- **Agent connector.** A read-only MCP server with `search_docs`, `get_page`, `list_walkthroughs`
  and `get_procedure`.

## Quick start (from this repo)

Requirements: Node 22, `ffmpeg` and `ffprobe` on PATH. Playwright's Chromium installs with
`npx playwright install chromium`.

```bash
npm install
npm test                                     # fast suite, about a minute
npx tsx packages/engine/src/cli.ts --help    # every command; add --help to any command
```

Make docs for an app:

```bash
docgen init <dir> --app-repo <path-to-app>   # scaffold <dir>/help, detect routes and brand
docgen digest --app-repo <path-to-app>       # compact map of routes, roles and labels
docgen inspect /some/page --config <cfg>     # what's on screen: exact names, roles, options
docgen validate <walkthroughs-dir>
docgen build --config <cfg> --draft          # capture, voice, render, pages, PDFs, index, checks
docgen publish --to static --dry-run         # see what would deploy
```

Run `docgen` as `npx tsx packages/engine/src/cli.ts` from this repo, or from `packages/engine/dist`
after `npm run build`. Most commands take `--json` for short, machine-readable output.

Worked example: [examples/tallyup](examples/tallyup) (Next.js + Postgres + Auth.js, captured
through its isolated demo environment).

## Commands

| Command | Does |
| --- | --- |
| `init` | Scaffold the help app into `<dir>/help`, with brand colours and logo guessed from the app |
| `digest` | Compact map of an app's routes, roles and on-screen labels (monorepos via `--app`, detail via `--area`) |
| `inspect` | Open one page signed in and list its interactive elements; read-only |
| `validate`, `import tallyup`, `import playwright` | Check walkthrough files; convert TallyUp's `workflow.json` or existing Playwright tests into draft walkthroughs |
| `capture` | Replay walkthroughs in a browser against the app; screenshots, checks, failure report |
| `voice`, `render` | Narrate, then render video per scene (only changed scenes re-render) |
| `pages`, `pdf` | Help pages with numbered screenshots; PDFs and quick reference cards |
| `qa` | Loudness, black frames, caption timing, personal-data and secret scans |
| `build` | All of the above in order, skipping unchanged work; writes `report.json` |
| `affected` | Map a git diff to the walkthroughs it touches; unknown changes mean all |
| `ci` | PR check: affected walkthroughs, capture, screenshot diff, one PR comment tiered cosmetic/broken/new (no model, no API keys); `--publish` republishes on merge |
| `version freeze`, `version list`, `whats-new` | Freeze a docs version per release; write the What's new page from merged PRs |
| `edit`, `undo`, `catch-up` | The same edits the Studio makes, with history marked person or agent, and locks |
| `publish` | Deploy to `vercel`, `netlify`, `amplify`, `cloudflare`, `node` or `static`; first production publish needs a person's OK |
| `suggest` | Group unanswered chat questions into suggested new walkthroughs |
| `usage` | Log and report model tokens and cost per stage; budget cap per run |
| `skills install` | Copy docgen's skills and subagent definitions into a repo |

## Safety defaults

- Capture writes only to local apps unless `allowWrites` is set; database checks only run against
  local databases.
- Personal details are blurred in screenshots before capture, and every output is scanned for
  personal data and secrets before it publishes.
- Demo data uses example.com and reserved fictional phone ranges.
- Agents can't approve the first production publish; a person has to.

## Keeping docs current in CI

`docgen init --ci` writes a GitHub Action (`.github/workflows/docgen.yml`) that maps a PR's diff
to the walkthroughs it touches, re-captures them, diffs the screenshots, and posts one PR comment
tiered **cosmetic** (refreshes and publishes on merge, nobody's asked), **broken** (the exact
`docgen-repair` command to run locally), or **new** (a route no walkthrough covers yet, with the
`docgen-write` command and the `docs:new` label). No model, no API key, ever, in this base
workflow — see [docs/ci.md](docs/ci.md) for the full setup, the optional Claude Code repair
Action (`--claude`), and the separate-docs-repo option (`--docs-repo <owner/repo>`).

## Agent skills

`skills/` holds the Agent Skills that drive docgen from a coding agent. `docgen` is the entry point
("make help docs for my app"); it hands off to `docgen-discover`, `docgen-plan`, `docgen-write`,
`docgen-repair`, `docgen-review` and `docgen-demo-data`. Each names a model tier, and Claude Code
subagent definitions in `skills/agents/` match them: Haiku for discover, Sonnet for write, repair
and review, Opus for plan. Shared style, safety, token and walkthrough-format references live in
`skills/references/`.

Install into a target repo with `docgen skills install --target <repo>` (copies skills into
`.claude/skills/` and agents into `.claude/agents/`, never overwriting changed files). Codex and
other AGENTS.md-reading agents can point at `skills/AGENTS.md`. Validate with
`node skills/check.mjs`.

## Repo layout

| Path | What |
| --- | --- |
| `packages/engine` | The `docgen` npm package: CLI and every pipeline stage |
| `packages/help-app` | The Next.js help app template (site, chat, agent connector, Studio) |
| `skills/` | Agent skills, subagent definitions and references |
| `examples/` | Configs, walkthroughs and adapters for the test apps |
| `docs/` | Scope, decisions, build plan and history |

## Read first

| Doc | What's in it |
| --- | --- |
| [docs/scope.md](docs/scope.md) | The scope: users, principles, outputs, architecture, editing, CI, safety, token efficiency, phases, risks |
| [docs/decisions.md](docs/decisions.md) | What's agreed and what's still open |
| [docs/build-plan.md](docs/build-plan.md) | Milestones, status, build log and follow-ups |
| [docs/discussion-log.md](docs/discussion-log.md) | How the idea developed |
| [docs/landscape.md](docs/landscape.md) | Existing tools and where the gap is |
| [docs/origin-tallyup.md](docs/origin-tallyup.md) | The TallyUp pilot this grew from |

Shared scope doc for comments: https://claude.ai/artifact/JisTyr7bSDj8tK9KXLuMRr
(`docs/scope.md` mirrors it.)

## Roadmap

| Phase | Name | Gate to move on | Status |
| --- | --- | --- | --- |
| 0 | Prove the engine | TallyUp and one more app rebuild docs and videos from one command | Done |
| 1 | Docs from your coding agent | An outside vibe coder publishes a help site in under 30 minutes, editing no files | Mostly built; needs an outside user |
| 2 | Always up to date | Four weeks of real app changes, docs never more than one deploy behind | Not started (GitHub Action, PR checks) |
| 3 | Ask the docs | Chat answer-rate target met on real questions | Chat and agent connector built; untested with a live key |
| 4 | The no-code door | A Lovable or Bolt user publishes and stays current without opening GitHub | Not started |
| 5 | Reach | — | Not started |

Licence: Apache-2.0.
