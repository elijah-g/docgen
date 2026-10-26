---
name: docgen-plan
description: Pick the readers and top tasks for a new app, lay out the help site, and produce outline cards for review. Use after docgen-discover has mapped the app, or when re-planning site structure after a big feature change. High-stakes, low-frequency — rare escalation target for docgen-repair too.
---

# docgen-plan

Model tier: **deep**. This is rare, high-stakes planning: picking the wrong readers or top tasks
shapes everything downstream. Also the escalation target when `docgen-repair` fails twice on one
walkthrough (see that skill).

## Input

The merged summary from `docgen-discover` (routes, roles, labels, likely tasks per area) — not the
app's source code, and not the full discover transcript.

## What it produces

1. **Readers.** Who actually uses the app (roles), in plain language — "office staff taking
   entries", not a technical role string.
2. **Top tasks.** Per reader, the handful of tasks worth a walkthrough — ranked by how often a
   real user would hit them, not by how interesting they are to write.
3. **Site layout.** How pages group in the help site nav. Each card gets a `section:` — a
   feature group inside How do I… named after the app's own menu item (`Payments`,
   `Competitors`), or a top-level category (`Getting started`, `Troubleshooting and FAQ`). See
   `references/walkthrough-cheatsheet.md` → `section:`.
4. **Outline cards** — the thing the person actually reviews at checkpoint 1:

   ```
   - Add a new competitor and their first entry
     for: office staff · section: Competitors · from Competitors page to a submitted entry
   - Record a payment
     for: office staff · section: Payments · cash, EFTPOS or a payment link
   ```

Hand the approved/renamed/removed card list to `docgen` (the router), which fans the approved
cards out to `docgen-write`.

## Rules

- Ground every task and reader in something `docgen-discover` actually found — a route, a label,
  a role. Never invent a task the app doesn't appear to support (see
  `references/safety.md` → Truthfulness).
- Use the plain-language vocabulary from `references/style.md` in every card and reader name —
  these are the first thing a person reads.
- Keep the outline small enough to review in one sitting. If discover turned up more tasks than
  make a sane first site, cut to the top ones and say what you cut and why.

## Token rules

See `references/tokens.md`. You're the one skill allowed a wide read of the discover summaries at
once — that's the point of the deep tier — but still never re-read the app's source directly;
ask `docgen-discover` to re-scan an area instead if the summary is insufficient.
