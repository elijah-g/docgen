---
name: docgen-write
description: Write one walkthrough's YAML from an approved outline card, in plain words using on-screen names, then validate and capture it. Runs as one subagent per walkthrough, in parallel with others. Use after docgen-plan's outline is approved, when a person asks to change one specific walkthrough's steps or wording, or when docgen ci flags a new route no walkthrough covers (tier "new") with its exact draft command.
---

# docgen-write

Model tier: **standard**. Needs care with the app's real names and flow, but is routine once the
outline card and glossary exist. Run **one subagent per walkthrough, in parallel** — each sees
only its own card, the glossary, the style guide, and (on a retry) its own capture report. Parallel
subagents may only write and validate YAML concurrently — the engine replays captures against one
shared app/db, so capture itself must never run from two subagents at once (see step 6).

## How

0. Run `docgen catch-up --since last` before anything else — it lists edits a person made in the
   Studio since this skill last looked, so a rewrite never clobbers a change made since.
1. Start from the approved outline card (title, reader, one-line purpose) and the relevant slice
   of the discover summary (routes/labels for that task only) — or, when run from `docgen ci`'s
   "new" tier comment, from the route path and file it named directly; there's no outline card for
   this case, just one new page to cover. Either way, label the PR `docs:new` when you're done
   (decisions #24) — the reviewer `docgen ci`'s comment names is the app PR's author.
   Set `section:` from the card (or, for a "new" tier page, from the app's menu item for that
   route, matching the `section:` other walkthroughs in that area already use).
2. **Before writing any step**, run `docgen inspect <path> --config <cfg> --json` on the
   walkthrough's start page, and again on every page a step navigates to — never guess a role,
   name, or option label from memory or from reading the app's source. It opens that one page
   signed in and prints every interactive element's exact role, accessible name, required/
   disabled state and (for a native `<select>`) its exact option labels, capped around 80 lines
   (`references/tokens.md` has the cost). Use its output verbatim in every target: the role it
   reports (`button` vs `link` — a wrong guess here is the single most common first-capture
   failure), the exact name, and the exact option label for a `select:` action. A field's printed
   line is its **short name** — e.g. `textbox "Address" (label: "Address Optional", optional)` —
   use the quoted short name (`"Address"`) in the target, not the full label text in parens; if a
   field is marked `[required]`, the walkthrough must fill it, don't skip it hoping the app allows
   it empty. Opening a menu or dialog first: `docgen inspect <path> --config <cfg> --click "Open
   menu" --json` (button/menuitem/tab/combobox, or any trigger with `aria-haspopup="listbox"` —
   never a save/submit-shaped name; every non-GET request is blocked for the whole scan, so this
   can never submit anything). A custom combobox (e.g. a Radix "Select competitor…" trigger) opens
   the same way; `--click`'s output lists its listbox options (capped at 15) before closing it
   again with Escape. A field that only appears after checking a radio/checkbox, or after picking
   an option in a native `<select>` or custom combobox (conditional fields): `docgen inspect <path>
   --config <cfg> --check "Other" --json` or `--select "<field>" "<option>"` reveals it before
   scanning. `--area <cssOrLandmark>` scopes a long page down (e.g. `--area dialog`, `--area
   main`).
3. **New walkthrough**: write the YAML file from scratch per
   `references/walkthrough-cheatsheet.md`: `start`, `data` (demo values only — see below), `steps`
   with `do`/`say`/`caption`/`page_text`/`actions`. Use on-screen labels for every target
   (`role`+`name`, `label`, `placeholder`, `text`) — never raw CSS unless nothing else identifies
   the element, and use the exact role/name/option-label `docgen inspect` reported, not a guess.
   **Changing an existing walkthrough** (e.g. "say Tally Up not Tallyup"): change the
   field through `docgen edit`, never a raw file edit — it's lock-aware (skips a step a person has
   locked) and keeps edit history:
   ```
   docgen edit setStepField <file> <stepId> say "Then open Tally Up from the menu." --by agent --json
   docgen edit setStepField <file> <stepId> do 'click "Add competitor" button' --by agent --json
   docgen edit setStepActions <file> <stepId> '[{"do":"click","target":{"role":"button","name":"Add competitor"}}]' --by agent --json
   ```
   (or `reorderSteps`/`removeStep`/`setPageBlock`, see `docgen edit --help`). `setStepField`
   covers `say`/`caption`/`page_text`/`title`/`hold` and the plain-words `do`/`check` locator
   fields; `setStepActions` replaces a step's whole structured `actions:` list in one go, for a
   change plain words can't express; `docgen edit setData <file> <dotted.path> <value>` changes a
   value in the walkthrough's `data:` block (e.g. `docgen edit setData <file> competitor.phone
   "0491 570 100" --by agent --json`) instead of hand-editing the YAML — it rejects an edit that
   would leave any `{{...}}` reference elsewhere unresolved.
4. **Demo data**: invented values through example.com/reserved phone ranges (see
   `references/safety.md`), written into `data:` directly when authoring, or via `docgen edit
   setData` on a repair/retry (e.g. a run-unique value to dodge a duplicate-check failure — see
   `docgen-repair`). If the task needs data seeded a different way, hand off to `docgen-demo-data`
   instead of writing it inline.
5. Validate: `npx tsx packages/engine/src/cli.ts validate <file>` (or `docgen validate` once
   installed). Fix schema errors yourself before capturing.
6. Capture: `docgen capture <walkthrough-id>`. This runs the walkthrough in a real browser against
   the app and writes `manifest.json`/`validation.json`/`failure.json` (on failure) to the build
   dir. **Never run two of these at once** — captures share one app/db, and parallel subagents
   racing their own `docgen capture` calls corrupts both runs. If the router is writing several
   walkthroughs in parallel, let it run them one at a time (or as one `docgen capture a b c`)
   after every subagent's YAML is ready, rather than each subagent capturing for itself.
7. **If capture fails**, hand off to `docgen-repair` with just the trimmed failure report (step,
   error, accessibility snapshot) — don't try to fix it yourself by re-guessing locators; that's
   `docgen-repair`'s job and it's tuned for it.
8. On success, report back to the router: walkthrough id, pass/fail, and the step count — not the
   full YAML or capture output.

## Writing rules

- Plain words, on-screen names, per `references/style.md`. No invented buttons or results — only
  what the capture actually showed (write a first draft from the card, then correct it against
  the capture result once it runs).
- Never a production write step without explicit sign-off (see `references/safety.md`).
- Keep `say`/`caption`/`page_text` distinct per the style guide — don't just copy one into all
  three.
- After a save action, don't assume it navigates: `waitForUrl` fails forever if the save just
  updates the same page (a toast, an updated heading, a closed dialog). Run `docgen inspect` again
  right after the save to see what actually changed, and write a `waitFor`/`expect` against that
  (the toast text, the new heading, the dialog closing) instead of guessing `waitForUrl`.
- `highlight: true` must sit on the action whose target the doc screenshot actually shows — never
  on a click that navigates away, or the box lands over whatever's now sitting in that spot on the
  new page; put it on the `expect`/`waitFor` after the navigation instead.

## Token rules

See `references/tokens.md`. You see only this one walkthrough's card and capture report — never
another walkthrough's files, and never the full app digest.
