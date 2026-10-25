---
name: docgen-demo-data
description: Create demo data for a walkthrough through the app's own screens or API — never direct database writes unless an engineer explicitly asks for a seed script. Use when a walkthrough needs data that doesn't exist yet (a competitor, a show, a class) before capture can run.
---

# docgen-demo-data

Model tier: **standard**. Writing a small script or a sequence of app actions needs care, but it's
routine once the shape of the data is known from the outline card.

## Default path: through the app itself

1. Prefer creating data the same way `docgen-write` already does it — as extra setup steps run
   before the walkthrough's own steps (or as a separate "setup" walkthrough that the main one
   assumes already ran), using the app's own screens or a documented API.
2. All values follow `references/safety.md`: `@example.com` emails, reserved fictional phone
   ranges, invented names. Never copy a real record, even with names changed, as a starting point.
3. Use a dedicated demo account or workspace where the app supports one, never a production
   account. Quick mode (no dedicated demo env) asks the person before saving anything.

## Seed scripts: only on explicit engineer request

- Write a direct-to-database seed script only when an engineer asks for one by name (e.g. "write
  a seed script for the demo DB"). Default users and vibe coders never get one — the whole point
  is docgen needs no database access.
- If you do write one: it targets a database already proven local/non-production
  (`assertLocalDatabase`-style check, matching the engine's own write-guard for capture), it uses
  the same safe demo-data values, and it lives with the app's own seed tooling, not inside a
  walkthrough file.

## Rules

- Never create data as a side effect of a step marked read-only in a walkthrough. If a
  walkthrough needs setup data, make that explicit as its own setup steps, not hidden state.
- Clean up is the walkthrough's own job (a step's `check`/cleanup), not this skill's — demo-data
  only creates what's needed to start the walkthrough from a known state.

## Token rules

See `references/tokens.md`. Small, targeted: the one card's data shape, not the whole schema or
app.
