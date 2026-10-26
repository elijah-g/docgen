# Walkthrough YAML cheat sheet

Derived from `packages/engine/schema/walkthrough.schema.json`. Validate every walkthrough you
write or edit with `npx tsx packages/engine/src/cli.ts validate <file>` (or `docgen validate` once
installed) before handing it off — don't hand-check against this sheet alone.

## Top level

```yaml
walkthrough: add-competitor      # slug, matches filename
version: 1
title: Add a new competitor      # user-facing
summary: One or two sentences.
product: TallyUp
for: Office staff taking entries
section: Competitors             # optional: where the page sits in the help site (see below)
verifiedAgainst: { app: "...", routes: [...], sources: [...] }  # filled in after capture, not before
start:
  signed_in_as: office_staff
  page: /dashboard
  baseUrl: http://127.0.0.1:3100
  persona: { role, name, email, cognitoSub }
data: { <any demo values the steps reference via {{dotted.path}}> }
voice: { provider, model, voiceId, speed, gapSeconds }
intro: { eyebrow, title, subtitle, say, caption }
outro: { title, recap: [...], say, caption }
steps: [ ... ]        # minItems: 1
validate: { database: [ { name, sql, params, expect } ] }   # optional, engineer-owned
```

### `section:` — where the page sits

Optional. Leave it out and the page goes straight into **How do I…**. A value whose first part
names a top-level category — `Getting started`, `How do I…`, `Screens and settings`, `Words we
use`, `Troubleshooting and FAQ`, `What's new` (title or slug, any case) — goes into that category;
anything else is a feature group inside How do I…. Nest with ` / `:

```yaml
section: Payments                      # How do I… / Payments
section: Entries / Late entries        # How do I… / Entries / Late entries
section: Getting started               # Getting started
```

Plain words only (letters, numbers, spaces, light punctuation). Use the app's own name for the
area (the menu item a reader clicks), and reuse the same value across walkthroughs in that area.

## A step

```yaml
- id: open-competitors
  chapter: Add the competitor      # groups steps into video chapters / page sections
  title: Open Competitors
  say: Then open Competitors from the menu.
  caption: Then open Competitors from the menu.
  page_text: Click **Competitors** in the left-hand menu.
  camera: full   # or { focus: <target>, zoom: 1.25, align: top|left|right }
  hold: 1.5       # optional seconds to hold the frame
  mask: ["{{competitor.email}}"]   # optional values to blur in screenshots/video
  actions: [ ... ]
```

## Actions (each has `do` + a target, except `waitForUrl`/`goto`)

| `do` | Needs | Notes |
| --- | --- | --- |
| `click` | `target`, optional `highlight` | |
| `type` | `target`, `text` | `text` may use `{{data.path}}` |
| `select` | `target`, `option` | native `<select>` — runs as Playwright's `selectOption`, not a click |
| `point` | `target`, optional `highlight` | no interaction, just calls out something |
| `expect` | `target`, optional `highlight` | assertion; capture fails if not visible |
| `waitFor` | `target`, optional `snapshot`, `highlight` | pauses until visible |
| `waitForUrl` | `pattern` | regex string |
| `scrollTo` | `target` | |
| `goto` | `path` | direct navigation |

## Plain-words `do:`/`check:` (a step may use these instead of, or alongside, `actions:`)

```yaml
do: click "Add competitor" button
do: fill "First name" with "{{competitor.firstName}}"
do: select "Class" option "Open"          # native <select> only — see `select` above
check: text "Competitor added" is visible
do: go to /competitors
do: wait for url /competitors/*
```

Unrecognised phrasing is rejected at validate/edit time — write an explicit `actions:` entry
instead. `docgen edit setStepField <file> <id> do '...'` / `... check '...'` repairs one of these
in place; `docgen edit setStepActions <file> <id> '[...]'` replaces the whole `actions:` list for
anything plain words can't say.

## Targets (locator, matches Playwright role/label/text locators — never raw CSS unless needed)

```yaml
target: { role: button, name: "Create Competitor", exact: true }
target: { label: "First Name" }
target: { placeholder: "Search competitors..." }
target: { text: "Competitors for Riverbend Show 2026" }
target: { css: "aside" }           # last resort — on-screen label locators survive redesigns
target: { role: row, hasText: "...", within: { css: "main" } }
target: { role: button, name: "Delete", within: { role: group, name: "Riverbend entry" } }
target: { role: button, name: "Delete", nth: 1 }
```

`role` + `text` isn't a second way to name the element — `text` filters the role/name match down
to elements whose text contains it (same as the explicit `hasText` field), useful when a role+name
still returns several elements (e.g. a `row` with a cell's contents as `text`).

**Two interactive elements with the same role+name** (e.g. a "Delete" button in every row):
`docgen inspect` prints a disambiguator after each one — `(within: "Riverbend entry")` when there's
a nearest named group/fieldset/region/dialog to scope by, else `(nth: N)`. Prefer `within` (a
target scoped to `{ role: group, name: "..." }` or whatever the printed name's role is — survives
reordering); fall back to `nth` (0-based, applied last, after every other narrowing) only when
there's no containing landmark to scope by.

**Label matching is tolerant by default**, tried in this order:

1. Exact match against the element's full accessible name.
2. The label's own short name — the text of the `<label>` itself with any nested hint element
   (e.g. a `<span>Optional</span>`) stripped out, so `<label>Address <span>Optional</span></label>`
   matches a target of `"Address"` even though the accessible name is "Address Optional". This is
   the same short name `docgen inspect` prints in parens (`label: "Address Optional"`) — use the
   quoted short name in the target, not the full accessible name.
3. A marker-stripped starts-with match: trailing `*`/`(required)`/`(optional)` hint text ignored,
   for a label that doesn't wrap its hint in its own element (so a form adding "(optional)" to a
   label doesn't break an existing walkthrough).

Set `exact: true` on the target to force a strict match (step 1 only) when two labels only differ
by hint text.

`highlight` can be `true` or its own target (e.g. highlight a containing row while clicking a link
inside it). `padUnion` on a target grows the highlight box to include another target.

## Interpolation

`{{competitor.firstName}}` etc. pull from the walkthrough's own `data` block. Never hardcode a
value that should come from `data` — it makes repair and demo-data swaps harder.

## Forbidden in user-facing fields (`title`, `say`, `caption`, `page_text`, `intro`, `outro`)

See `references/style.md`. No "IR", "journey", or exposing the internal step-file format name.
