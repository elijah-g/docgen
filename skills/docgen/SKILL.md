---
name: docgen
description: Entry point for "make help docs for my app", "update the help site", or anything about docgen's help site, help chat, walkthroughs, or Studio. Orchestrates discover/plan/write/repair/review as subagents and drives the docgen engine CLI. Use this first for any docgen request; it hands off to the other docgen-* skills.
---

# docgen — entry point

Model tier: standard. You orchestrate; you don't do the discovery, planning, writing, or review
work yourself — hand each to its skill, run as a subagent, and hold only its summary. Read
`references/tokens.md` once per session, not per step.

## What this is

docgen turns a running web app into a self-updating help site: doc pages, narrated videos, help
chat, and an agent connector (MCP server) — all generated from walkthrough YAML files that are
replayed against the real app. See `AGENTS.md` and `docs/scope.md` in the target repo for the
full plan; you don't need to re-read them every run, just this skill and the one you hand off to.

## The six-step first run

Follow `docs/scope.md` → "First run: vibe coder in a coding agent". Ask at most **three plain
questions** total across the whole run (not per step):

1. **Read the repo.** Hand off to `docgen-discover` (fan-out, one subagent per app area). It
   returns readers, routes, and likely tasks. Ask your first question here if needed: "start the
   app locally with demo data, or use a test login on the live site?"
2. **Plan.** Hand off to `docgen-plan`. It returns outline cards (walkthrough titles + one-line
   purpose) for the reviewer to approve, rename, or remove — **review checkpoint 1: Outline**.
3. **Write.** For each approved card, hand off to `docgen-write` (one subagent per walkthrough) to
   write and validate its YAML — run these subagents **in parallel**. Capture is a different
   story: the engine replays each walkthrough against the one real app/db, so captures must run
   one at a time, never from parallel subagents (see `docgen-write`'s own note). Either capture
   each walkthrough as its subagent finishes writing (serialised), or batch them with one
   `docgen capture <id1> <id2> <id3>` call once every card is written. Failures go to
   `docgen-repair`. Present results as the **step sheet** (screenshots + narration text, no
   video) — **checkpoint 2**.
4. **Build.** Run `docgen build` for everything that passed — it captures (or reuses the capture
   from step 3 with `--skip-capture`), narrates, renders, builds pages + the search index, and
   runs QA in one call. Open the Studio (`npm run dev` in `help/`, then `/studio`) so the person
   can see video and pages — **checkpoint 3: Build**.
5. **Changes in plain words.** Route any follow-up request ("make this slower", "say Tally Up not
   Tallyup") to the matching skill — most go through `docgen-write` or `docgen-repair` on just the
   one affected walkthrough, never a full rebuild.
6. **Publish.** Only on the person's explicit OK — **checkpoint 4: Publish**, and only ever a
   person, never auto-run on a first publish (see `references/safety.md`). Run
   `docgen publish --to <host>` (or hand off to the engineer path if no host is picked yet), then
   explain in one sentence what happens on future app changes.

## Re-capturing a walkthrough that saves data

Before any re-capture of a walkthrough that creates/edits a record (not just a read-only check),
reset demo data first — a configured database adapter's `reset()`, or run-unique values via
`docgen edit setData` when there's no reset hook — so a retry never collides with what the last
run already saved. `docgen-repair` does this by default; explain a duplicate/unique-constraint
failure as this, not a locator bug, before touching any target.

## Orchestration rules

- Each hand-off is a subagent call, not an inline tool loop in this skill. Give the subagent only
  what its own skill says it needs (its walkthrough, its app area, its capture report) — never the
  whole conversation.
- Hold summaries only: after each hand-off, keep the short result (cards, pass/fail list, a
  one-line QA verdict), not the subagent's full transcript.
- Route by model tier: discover → fast, plan → deep, write/repair/demo-data → standard,
  review → standard-in-a-fresh-context. See `skills/agents/*.md` for the Claude Code subagent
  definitions with `model:` set, and `skills/agents/codex-note.md` if the host agent can't switch
  models.
- Never skip checkpoints 1 and 4. Checkpoints 2–3 can be skipped only for a CI-triggered
  cosmetic update (see `references/safety.md`).

## Install

`docgen skills install --target <repo>` copies `skills/*` into `.claude/skills/` and
`skills/agents/*` into `.claude/agents/` in the target repo. Run `docgen skills install --help`
for the exact flags.

## Engine commands this run assumes

`validate`, `capture`, `render`, `pages`, `qa`, `init`, `digest`, and `build` all exist — run
`docgen <command> --help` for exact flags. Report tokens as you go with `docgen usage add` after
each subagent turn, and print the run's total with `docgen usage report` (see
`references/tokens.md`).
