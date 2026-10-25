# Decisions

Last updated 2026-10-25. "Agreed direction" means discussed and accepted in planning, not yet tested
in code. Revisit any of them with evidence from Phase 0.

## Agreed direction

| # | Decision | Why |
| --- | --- | --- |
| 1 | Build it: there is a real gap | No existing tool combines app capture, docs, video, chat, MCP, any agent, any voice, self-hosting and CI updates ([landscape.md](landscape.md)) |
| 2 | Vibe coders are the priority user; engineers get full control underneath | The user's steer; engineers are already served by docs-as-code tools |
| 3 | One walkthrough file per task is the single source of truth | Proven in TallyUp: one `workflow.json` drove video, captions, guide and checks |
| 4 | Deterministic engine + thin agent skills | Repeatable results; works with weaker agents; any agent with a shell can drive it |
| 5 | Agent-agnostic via Agent Skills (`SKILL.md`) + `AGENTS.md`, CLI, generator MCP server and a built-in agent loop | Claude Code and Codex read skills natively; MCP and the built-in loop cover the rest |
| 6 | Provider adapters for voice, model, search, renderer, hosting; free local defaults | No API key needed for a first run; no lock-in |
| 7 | CI auto-update is core, not an add-on | Keeping docs current is the main reason to use it |
| 8 | Three change tiers: cosmetic auto-publishes; broken and new go to review | Speed without silent meaning changes |
| 9 | Editing three ways (Studio, words, files) on the same files, HyperFrames-style; edits stored as intent | No tool lock-in; edits survive rebuilds |
| 10 | Safe by default: demo data, masking, PII and secret scans, no production writes, human-approved first publish | TallyUp's training data was a copy of production |
| 11 | Nothing documented that wasn't seen working | Trust; avoids hallucinated features |
| 12 | TypeScript engine, run with `npx` | Playwright, Astro, MCP SDK and the TallyUp scripts are all Node |
| 13 | Start from the TallyUp pipeline (Phase 0) | It already works end to end |
| 14 | Node is the only runtime; no Docker required | Vibe coders don't have Docker; cloud agent sandboxes often can't run it; Playwright pins Chromium and `ffmpeg-static` covers FFmpeg |
| 15 | Capture defaults to the app's preview or live URL plus a test account; demo data goes in through the app's own screens or API | Most target apps are Next.js or Vite + Supabase with preview deploys; no database access or seed scripts needed |
| 16 | Output is a prescaffolded Next.js help app (`help/`): site, chat and MCP as Next.js routes; `docgen publish --to <host>` | One project, one deploy; Vercel, AWS Amplify and Netlify support Next.js natively, Cloudflare via OpenNext, any Node server via `next start`; static export for GitHub Pages or S3 (no chat/MCP). Replaces the earlier Starlight + separate function idea |
| 17 | The coding agent does the work with docgen's skills; the engine (npm) does the repeatable parts in the coding environment or CI; the host only runs `next build` | Matches how vibe coders and engineers already work; no Playwright or FFmpeg on the host |
| 18 | The help app is separate from the user's app by default; `/help` on their domain via a host rewrite or Next.js multi-zones | Never touches their code; works whatever their app is built with. Replaces the earlier "inside the app at /help" default |
| 19 | The Studio is a dev-only `/studio` route in the help app that edits repo files (Keystatic/TinaCMS style); later it can run on a preview deploy behind sign-in, committing to GitHub | Runs where the agent runs; gives a path to a hosted Studio without a separate cloud editor |
| 20 | Token efficiency is a design goal: model tokens only for judgment; three model tiers (fast, standard, deep) per skill; subagents per app area and per walkthrough; small engine outputs; per-run token report and budget | The user's steer (2026-10-22); model tokens are the main running cost and long contexts make weaker agents fumble |
| 21 | docgen itself is built by an orchestrating agent with subagents on matched models (Haiku for lookups, Sonnet for building, Opus for design and review), tested against `~/competition-management` (TallyUp) | Same principle applied to the build; see [build-plan.md](build-plan.md) |
| 22 | No model API keys in docgen's own pipeline: judgment work runs through Claude Code. CI does deterministic work only (affected, capture, screenshot diffs, PR comment); broken or new walkthroughs are flagged with the command to run. Optional: the Claude Code GitHub Action on the user's subscription (`claude setup-token` OAuth token) repairs on request. No dollar budget cap | The user's steer (2026-10-25); keeps the engine keyless and free to run |
| 23 | PR screenshot diffs are committed to a `docgen-previews` orphan branch in the app repo and shown inline in one PR comment; Actions artifacts as fallback. No preview deploys for now | Needs only the workflow's own GitHub token; no extra service or key |
| 24 | Docs PRs from docgen request review from the app PR's author (configurable); drafted walkthroughs get the `docs:new` label | The author knows what changed |
| 25 | docgen is a public repo; GitHub owner and repo are per-user settings, never hardcoded. Help chat is off until an owner adds their own key | Open-source engine; the chat can't run through Claude Code |

## Open

| Decision | Options | Recommendation |
| --- | --- | --- |
| Business model | Open-source engine plus paid cloud; done-for-you service through Bunbury AI; internal tool first | Open-source engine now, done-for-you service for early clients, paid cloud once Phase 2 holds up |
| First target user | Vibe coders in Cursor or Claude Code (agent door first); Lovable and Bolt users (GitHub App first) | Agent door first |
| Walkthrough format | YAML with a schema; Markdown with step notes (Doc Detective style); JSON (Argo/TallyUp style) | YAML with a schema, after comparing Argo, Doc Detective and TallyUp's `workflow.json` |
| Docs layer in the Next.js help app | Fumadocs; Nextra; custom | Fumadocs (built for the App Router); check print support in Phase 1 |
| Licence | Apache-2.0; MIT; source-available | Apache-2.0 |
| Second app to test on | Another app in the workspace; a friendly client's app | One with a different stack from TallyUp |
| Name | docgen is a placeholder | Pick before the first public release |
| Video timeline in the Studio | Own build; embed/extend HyperFrames Studio; export-only | Export-only in Phase 1; test embedding before Phase 2 |
| Video renderer | TallyUp's HTML player + FFmpeg; HyperFrames | Keep TallyUp's player for Phase 0; decide with the timeline question |
