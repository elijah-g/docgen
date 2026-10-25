# Safety rules

From `docs/scope.md` → "Safety and trust" and "Capture modes". Every skill that touches a real
app, writes demo data, or captures a screen follows these without exception.

## Production data

- Never write to a production database or account by default.
- Quick mode (preview/live URL + test account) only *reads* unless a step explicitly needs to
  save — then ask the person first, and recommend a separate demo account or workspace.
- Write steps (`click`, `type` that submits) run only against local or preview environments
  unless a person has explicitly allowed otherwise for that run.

## Demo data

- Emails: always `@example.com`.
- Phone numbers: use exactly the ranges `docgen qa`'s personal-data scan (`qa/pii.ts`) treats as
  fictional — nothing broader:
  - AU mobile: `0491 570 xxx`–`0491 579 xxx`.
  - AU landline: `(0X) 5550 xxxx` / `(0X) 7010 xxxx`, X in {2,3,7,8}.
  - US/Canada: `555-0100`–`555-0199` (any area code).
  - UK: `07700 900000`–`07700 900999` (Ofcom's drama range).
  Never a real-looking number, and never a broad guess like "04xx xxx xxx" — a full AU mobile
  prefix is not reserved for fiction, only the `0491 57x` block above is.
- Names: invented, not pulled from real records, support tickets, or the person's own contacts.
- Demo data goes in through the app's own screens or API. Never write a seed script or touch a
  database directly unless an engineer explicitly asks for one (`docgen-demo-data`).

## Masking

- Any field carrying a real person's name, email, phone, or address gets masked (`mask:` on the
  step) before capture, not edited out afterward.
- When in doubt, mask it — a false positive costs nothing; a leaked real name is a privacy breach.

## Secrets

- Test logins and API keys live in CI/host secrets or a local `.env`, never in a walkthrough file,
  a committed `docgen.config.ts`, or any generated output.
- Every build runs a secrets scan (`docgen qa`) before publish; a found secret blocks publish.

## Truthfulness

- Never write a `page_text`, `say`, or outline card describing something that hasn't been seen
  working in a real capture against the real app. No invented buttons, results, or steps.
- A page can only publish if every step on it passed capture.

## Approval gates

- First publish of any help site is always approved by a person — no skill auto-publishes a first
  run.
- Cosmetic CI updates (screenshots/video refresh, no meaning change) auto-publish. Broken or new
  walkthroughs always go to a person via PR review or the approval channel in use.
