# Build plan

Started 2026-10-22. Test app: TallyUp, `~/competition-management` (read-only for docgen: never edit
its tracked files, never point capture at its `.env` databases; use its `scripts/tutorial-video/demo-env`
only). A snapshot of the original pipeline is in `reference/tallyup/` (the source repo copy is
untracked there).

## How it is built

An orchestrating agent (Opus) runs one milestone per loop turn and delegates:

| Job | Agent | Model |
| --- | --- | --- |
| Locate code, read reference files, check tool availability | investigator / Explore | Haiku |
| Write a module and its tests, port a TallyUp script | general-purpose builder, one per independent module, in parallel | Sonnet |
| Interface design across modules, hard debugging after two failed tries | Plan / general-purpose | Opus |
| Review a milestone's diff | reviewer, fresh context | Opus |

Builders get a self-contained brief (files they own, interfaces, test command) and return a short
receipt, not file dumps. The orchestrator runs `npm test` itself before marking a milestone done.

## Layout

```
packages/engine/     npm package "docgen": CLI, schema, capture, voice, render, pages, qa
packages/help-app/   Next.js help app template (Phase 1)
skills/              SKILL.md files + agents/ (subagent definitions with model tiers)
examples/tallyup/    docgen config + walkthroughs + sign-in adapter for the test app
reference/tallyup/   the original TallyUp pipeline, for porting only
```

## Milestones

Status: `todo`, `doing`, `done`. Gate for Phase 0 (one app for now): `docgen build` rebuilds
TallyUp's page, screenshots, video and captions from one command.

| # | Milestone | Status | Notes |
| --- | --- | --- | --- |
| M0 | Monorepo skeleton: npm workspaces, TypeScript, vitest, `docgen` bin, CLI with `--json` | done | |
| M1 | Walkthrough format v0: YAML + JSON Schema, plain-words `do:` parser, `{{data}}`, `docgen import tallyup` converter, validate | done | |
| M2 | Capture: Playwright runner, repeatable settings, sign-in adapter hook, impact map, trimmed failure report, run manifest | done | Demo env ready: Postgres 18, ffmpeg 8, Playwright 1.63 + Chromium; `db.sh reset` pulls schema only from training (read-only); sign-in = HMAC ticket to Auth.js credentials callback (capture.mjs:51) |
| M3 | Voice: provider interface, content-hash cache, silent (tests), Kokoro (default), MiniMax, ElevenLabs | done | 25 tests; Kokoro q8 works locally (89 MB model, ~7 s first line). mp3 providers need system ffprobe |
| M4 | Render: port HTML player + compose, FFmpeg (system or ffmpeg-static), SRT and VTT | done | Draft render of 110 s TallyUp video: 238 s wall (too slow for "seconds" previews; optimise later), cache skip 14 ms; captions wrapped to 42 chars. Full-quality render not yet exercised | |
| M5 | Pages + QA: Markdown page with screenshots and callouts; loudness, black frames, captions, colour range; personal-data and secret scan | done | QA half done: 46 tests; TallyUp MP4 passes; its SRT fails 42-char line length (render now wraps). Pages done: TallyUp page publishable, 15 annotated screenshots, human-edit blocks preserved. Content fixes for M6: environment notes leak into "Before you start"; raw role id `office_staff` shown | |
| M6 | `docgen build` end to end on TallyUp demo env; token and cost report; `docgen digest` | done | Gate met: one command rebuilds TallyUp page, screenshots, draft video, captions, search index, llms.txt; QA clean. Rerun: voice and pages skip; render still re-runs (frames not byte-identical). Digest of TallyUp: 172 lines, ~3.5k tokens | Phase 0 gate |
| M7 | Help app template (Next.js + Fumadocs), `docgen init`, print styles, search index | done | Next 16.4 + Fumadocs 16.17; `next build` passes with real TallyUp page; TallyUp brand detected (primary colour, logo). Chat/MCP stubs (Phase 3). Gap for M6: page frontmatter wrapped in markers; HTML-comment markers not MDX-safe | Phase 1 |
| M8 | Skills + subagent definitions with model tiers (discover, plan, write, repair, review) | done | 7 skills (355 lines total), 5 Claude Code agent definitions (Haiku discover, Sonnet write/repair/review, Opus plan), check script 62/62 | Phase 1 |
| M9 | Studio v1 at `/studio`: edit walkthrough fields and page text | done | Shared edit actions (YAML comments kept), history + undo by person/agent, locks, catch-up, point-and-say selection; real dev edit saved to disk; /studio and its API 404 in production | Phase 1 |
| M10 | Render speed: render per scene (step) with per-scene cache and concat; content-hash frame fingerprints; parallel frame rendering; draft at reduced resolution | done | Per-scene segments (17 for TallyUp) + concat, sha256 fingerprints, parallel pages, draft 960x540. Warm rerun 33 ms; one changed step 21 s (1/17 scenes). Cold draft 379 s on a busy 4-core host — still not seconds. Full quality not verified (disk quota) | Follow-ups from M4/cleanup |
| M11 | Capture speed: profile frame comparison and page-level masking (238 s vs 123 s), fix | done | Masking scans only on DOM change; frame diff byte fast path + worker pool: both ~3 s combined. Screenshots dominate (~190 s / 185 shots at 2x) but measured while M10 rendered in parallel; re-measure on quiet machine. `DOCGEN_PROFILE=1` prints per-phase timing |
| M12 | PDFs: per-page PDF, full manual PDF, one-page quick reference card, wired into `docgen build` | done | TallyUp: guide PDF 9 pages, card 1 page, manual 11 pages (A4); failed pages excluded; PII/secret scan before writing; `pdf` stage in `docgen build`, staged to public/pdf. Card is 1.78 MB: thumbnails are full-size screenshots (downscale) | Phase 1 |
| M13 | `docgen publish --to <host>`: Vercel, Netlify, Amplify, Cloudflare (OpenNext), Node, static export; video to blob storage; first publish needs a person's OK | done | 6 host adapters behind an injectable command runner, blob storage adapters, gates (build ok, pages passed, person approval for first prod publish; agents can't self-approve). Dry-runs ok. Real static export unproven (sandbox zod mismatch); chat/MCP route handlers may break `output: export` | Phase 1 |
| M14 | Second app: pick a workspace app with a different stack, write walkthroughs with the skills, run `docgen build` | done | emh-check (pnpm monorepo, local Postgres + demo seed): 5 walkthroughs build and publish, QA clean, repo unchanged. First-capture pass rate 2/5 (target 80%): writers guess roles, option labels and required fields — `docgen inspect` being added. TallyUp regression: rerun render 310 s -> 23 s via scene reuse | Phase 0 gate (second app) |
| M15 | Help chat + agent connector (MCP): `search_docs`, `get_page`, `list_walkthroughs`, `get_procedure`; chat answers only from docs with citations; owner's key | done | MCP over Streamable HTTP with 4 read-only tools, verified through the SDK client; chat: BM25 retrieval + current-screen boost, cached system prompt, citations, 503 without key, rate limit, CORS allowlist; unanswered questions redacted, `docgen suggest`; widget.js. No live chat answer tested (no key) | Phase 3 |
| M16 | Speed + size: cold draft render in well under a minute, cheaper screenshots, card thumbnails downscaled | done | Draft 10 fps, JPEG 80, one page per CPU; frames whose timeline state matches the previous frame reuse its screenshot (`frameSignature` in render/state.ts mirrors player.js `renderAt`; slow parity test). Cold TallyUp draft 174 s -> 59 s total (47 s render, 40% of frames skipped) on a quiet 4-core host; full-quality SSIM 0.9998 vs before. Card 1.78 MB -> 65 KB. Fixed relative output dir and a Chromium leak. Capture screenshot cost not re-measured |
| M17 | Impact map: `docgen affected --base <ref>` maps a git diff to the walkthroughs it touches (routes, API calls, components, source files); unknown means all | done | `docgen affected --base <ref> [--head <ref>]`: changed files to routes via Next.js routes and an import graph (tsconfig paths, layout chain), matched to manifest step URLs and API requests. All only for lockfiles, build config, root layout, middleware, globals, DB schema/migrations, files no route reaches, or files used by >60% of routes; sign-in page changes affect every walkthrough when a sign-in adapter is set. Last 12 TallyUp commits: 3 all (Next.js upgrade, migration, root layout), 9 precise (0-4 walkthroughs). Component-level capture not added | Phase 2 |
| M18 | GitHub Action + PR check: `docgen ci`, action.yml, PR comment with screenshot diffs, stale pages and preview link; `docgen init --ci` writes the workflow | done | `docgen ci`: affected -> capture (no video/voice) -> diff against the help app's published screenshots (or git at base) -> before/after/diff images on a `docgen-previews` orphan branch -> one PR comment updated in place; broken walkthroughs listed with the repair command. `action.yml` (inputs via env, fork PRs fall back to an artifact), `docgen init --ci` writes the workflow (`pull_request` only, minimal permissions, no secrets). Real dry run on TallyUp: unchanged steps stay unchanged; real changes found. Pilot workflow drafted (/tmp/tallyup-docgen.yml): schema from the app's own migrations, permission rows from tracked migration files, no training-DB dump | Phase 2 |
| M19 | Change tiers + repair in CI: cosmetic / broken / new; cosmetic publishes, broken gets a built-in agent repair and a docs PR, new gets a `docs:new` draft; budget cap | todo | Phase 2, needs M17, M18 |
| M20 | Playwright test import: turn existing Playwright tests into walkthrough drafts | done | `docgen import playwright <glob>`: TS compiler API, one draft per `test()`, locator chains to target hints, unmappable calls kept as `# TODO from test:` comments, emails/phones masked. emh-check: 42 specs to 343 drafts, all valid; 35% of calls mapped (schema has no press/hover/focus, many custom helpers, negated asserts) | Phase 2 |
| M21 | Versioned docs + What's new: release tag freezes a version; chat and agent connector answer per version; What's new page from merged PRs | done | `docgen version freeze|list` snapshots search index, procedures and llms.txt to `public/versions/<name>` + versions.json; `/v/<name>/...` routes and a version switcher; chat (`version` in body) and MCP (`?version=`) answer per version, unknown version lists the known ones. `docgen whats-new` writes What's new from app-repo git log or `gh pr list`, chores filtered, human edits kept. Orchestrator fixed: newest named version read the current build; unsafe version names; history read from the config's folder instead of the app repo | Phase 2 |
| M22 | Studio Phase 2: numbered callouts and blur boxes pinned to targets, hold times, simple timeline | done | Per-step `callouts` (numbered, labelled) and `blur` boxes, each pinned to a target or a fixed box; capture resolves targets to boxes per step; pages and video burn them in. Blur collapses the box to one colour (mosaic of 1 cell), so nothing is recoverable. Studio: click a highlighted element to pin (`target:`), drag for a fixed box, label, reorder, delete; step timeline; all through shared edit actions with undo, plus `docgen edit`. Orchestrator review found published procedure screenshots copied raw frames (bypassing blur); fixed with a test that scans every output for raw bytes | Phase 2 |

## Log

Newest last. One line per loop turn: date, milestone, result, anything blocked.
- 2026-10-22 · M0+M1 (Sonnet) and M3 (Sonnet) started in parallel; demo-env check (Haiku); shared doc sync (Sonnet).
- 2026-10-22 · Demo-env check done (Haiku, 37k tokens): all prerequisites present, ports idle.
- 2026-10-22 · M3 done (Sonnet, 69k tokens). M5 QA half started (Sonnet); page generation waits for M2.
- 2026-10-22 · M0+M1 done (Sonnet): workspaces/TS/vitest/CLI skeleton; walkthrough YAML+schema, do:/check: parser, {{data}} resolver, tallyup importer round-trips workflow.json losslessly. 42 tests pass (incl. M3's).
- 2026-10-22 · M0+M1 done (Sonnet, 119k tokens); orchestrator verified: typecheck clean, 42 tests pass. M2 capture and M4 render started in parallel (Sonnet).
- 2026-10-22 · M5 QA half done (Sonnet, 101k tokens). Caption-wrap requirement passed to M4 builder.
- 2026-10-22 · M2 done (Sonnet): config loader (`defineConfig`, `.ts` via tsx or `.mjs`, adapters resolved); capture runner ports capture.mjs/lib.mjs generically against Walkthrough/Action/Target, same manifest.json/validation.json shape plus `impact` and `checks` additions; sign-in + database adapter hooks; write-guard (refuses non-local writes/db unless `allowWrites`); mask-via-blur; trimmed failure report (step/action/error/url/60-line ariaSnapshot/screenshot); `docgen capture` CLI. 19 new tests (fixture HTTP server, write-guard, config) all green; `tsc --noEmit` clean. Real run on TallyUp demo env: 15/15 steps passed, 185 frames, 3/3 db checks passed, 0 console/page/5xx problems — matches the original TallyUp manifest's step/frame counts exactly. Demo server and Postgres stopped after; competition-management untouched.
- 2026-10-22 · M2 done (Sonnet, 192k tokens): real TallyUp capture PASS 15/15 steps, 185 frames, 3/3 DB checks, 125 s; orchestrator verified typecheck + test repo untouched. M5 pages (Sonnet) and Opus review of M0–M3 started. Render builder told: transient write seen in test repo, keep outputs out of it.
- 2026-10-22 · Opus review of M0–M3 (99k tokens): 9 bugs, 15 risks (write-guard and local-DB bypasses, unmasked scroll frames, wait-for-url never matching, voice cache key gaps, non-deterministic manifest). Two Sonnet fixers running, split by file ownership.
- 2026-10-22 · M4 done (Sonnet, 221k tokens). M7 help app template started (Sonnet).
- 2026-10-22 · M5 done (Sonnet, 155k tokens). M6 waits for capture fixer (both need the demo env).
- 2026-10-22 · Voice/walkthrough review fixes done (Sonnet, 132k tokens): 8/8 fixed, 67 tests pass.
- 2026-10-22 · M7 done (Sonnet, 170k tokens; full suite 209 pass). M8 skills started (Sonnet).
- 2026-10-22 · Capture review fixes done (Sonnet, 186k tokens): 17 findings fixed, real run 15/15. Left over: page-level personal-data masking (fixer wrongly thought qa/pii.ts missing), `__name is not defined` page error (likely tsx keepNames in addInitScript). M6 split: M6a capture/pages integration fixes, M6b build/voice/digest/usage/skills install (Sonnet x2); M6b's real run waits for M6a.
- 2026-10-22 · M8 done (Sonnet, 93k tokens). M9 Studio started (Sonnet).
- 2026-10-22 · M9 done (Sonnet, 224k tokens). Waiting on M6a then M6b real build for the Phase 0 gate.
- 2026-10-22 · Found: tests leave temp dirs in /tmp (no cleanup); full suite ~7 min due to render integration test. Queue for cleanup pass.
- 2026-10-22 · M6a done (Sonnet, 188k tokens): __name fixed (init script as string), page-level personal-data masking, .mdx with {/* */} markers + plain frontmatter, no env notes/raw role ids, stableHash. Real capture ok, 0 page errors; next build 0 errors. Demo env released to M6b.
- 2026-10-22 · M6b done (Sonnet, 238k tokens). Real build run 1: capture 118 s, voice 17 lines (Kokoro), render 250 s, pages 3 s, QA ok. Run 2: voice + pages skipped, render re-ran. Phase 0 gate met for TallyUp. Final round started: cleanup (Sonnet), review of M4–M9 (Opus), price check (Haiku).
- 2026-10-22 · Price table check (Haiku, 52k tokens): Haiku 4.5 $1/$5, Sonnet 5 $2/$10, Opus 5.5 $4/$20 per MTok match official; IDs match.
- 2026-10-22 · Opus review of M4–M9 (170k tokens): 8 bugs, 17 risks. Worst: Studio edit route took file paths from request with no origin check (dev-time code write from any site); failed pages could publish via stale pages cache or frozen frontmatter; index ignored QA failures; skills told agents to bypass locks and run parallel captures. Three Sonnet fixers running (Studio/edit, build/index, pages/skills).
- 2026-10-22 · Studio/edit fixes done (Sonnet, 165k tokens): no file paths from requests, Host/Origin/JSON/per-session token checks on all /studio/api routes (cross-origin, text/plain, no-token all 403 in smoke), single-entry undo, path-normalised locks. 23 edit tests.
- 2026-10-22 · Build/index fixes done (Sonnet, 221k tokens): 12/12 fixed (pages cache tracks validation; QA-failed and unpublishable pages kept out of site, llms.txt, search; per-run budget with voice cost, checked before paid stages; init config sets helpApp). Full suite 380 pass.
- 2026-10-22 · Pages/skills fixes done (Sonnet, 177k tokens): 11/11 fixed (engine-owned frontmatter always refreshed, stale blocks dropped, steps keyed by id, MDX escaping, import --force, failure.json in capture dir, skills use docgen edit/catch-up/build/usage, serial captures, UK fictional range). 87 pages+qa tests, skills check 62/62.
- 2026-10-22 · Cleanup done (Sonnet, 127k tokens + frame-diff helper 151k): frames within 0.1% kept (real rerun: 183 kept / 2 changed; pages skipped, render still re-ran on 2 changed frames); test temp dirs cleaned; slow tests behind `DOCGEN_TEST_SLOW=1` (`npm run test:slow`). Orchestrator verified: typecheck clean, 380 pass / 3 skipped in 65 s, demo ports free, `~/competition-management` git status unchanged from session start. All milestones M0–M9 done; loop stopped.

- 2026-10-23 · Friction fixes done (Sonnet, 227k tokens): target `nth` + inspect within/nth hints for same-name controls, role+text as hasText, inspect opens comboboxes and `--select`, `--area main` fixed, `usage add --estimate` without model, TallyUp help app moved to examples/tallyup/site/help, `--only ... --skip-capture` pipeline bug fixed. Orchestrator verified: typecheck clean, 760 pass / 9 skipped, skills 63/63, ports free, both test repos unchanged (round-3 status snapshots were truncated by the full /tmp; checked against session start and file times instead). M10–M15 done; loop stopped.
- 2026-10-24 · User: continue. Added M16–M22 (speed follow-ups and Phase 2). Wave 1: M16, M17, M20, M21 in parallel (Sonnet), split by file ownership.
- 2026-10-25 · Wave 1 had not started (no code found). Initial commit `f34f701` (generated example videos/PDFs ignored; author set repo-local to Bunbury AI). Wave 1 builders launched; orchestrator owns cli.ts, index.ts, package.json and this file.
- 2026-10-25 · Wave 1: M20 done (`0e8139c`), M16 part done (`9783df1`), M17 + M21 done. M17 first pass said "all" for nearly every real TallyUp commit (blanket lib/components rules); sent back for an import graph. Full suite 842 pass / 9 skipped in 241 s; typecheck clean.
- 2026-10-25 · M16 done: frame reuse by timeline signature; parity tests added after orchestrator review (unguarded duplicate of player.js math).
- 2026-10-25 · M22 done after review (irreversible blur, no raw frames published, Studio pins to targets, custom buildDir). Full suite 907 pass / 11 skipped.
- 2026-10-25 · M18 done after review (baselines from the help app on disk so diffs are real; CI database from the app's migrations, no training dump; fork PRs and shell-injection hardening). Full suite 909 pass / 11 skipped; typecheck clean.

## Follow-ups

- Cold draft render is ~59 s; typing and scrolling frames are the unskippable rest (incremental reruns are fast: 23 s with changed frames, 33 ms unchanged). Re-measure capture and render on a quiet machine.
- Capture screenshots dominate capture time (~1 s each at device scale 2); not re-measured in M16.
- A `.ts` config or adapter with TypeScript-only syntax fails under the built CLI without tsx.
- Publish stage symlinks app files; check host CLIs follow them. Real deploys need host tokens.
- Help chat untested with a live key; prompt caching off until a large stable prefix exists.
- First-capture misses left: values a free-text field accepts, after-save behaviour. Repeatable captures that save data need a demo-data reset per app (emh-check has none).
- Phase 2 left: GitHub Action and PR check (M18), change tiers and CI repair (M19), Studio callouts and timeline (M22). Answers in decisions 22–25 (no keys in CI, screenshot diffs on an orphan branch, public repo).
- Playwright import maps 35% of emh-check calls: add `press`/`hover`/`focus` actions and exact-text checks to the walkthrough format to raise it.
- Frozen versions don't copy screenshots and render old pages as plain Markdown; What's new lists every commit (dependency upgrades included) under General until it is grouped with the impact map.
- Walkthroughs that save data change each other's screenshots within one run (recording a payment changes unpaid entries): reset demo data per walkthrough or order them.
- TallyUp CI schema: `get_show_id_for_entry()` has no tracked definition (training only); its index is skipped in CI.
- Phase 1 gate needs an outside vibe coder.
