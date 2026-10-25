# Origin: the TallyUp tutorial pilot

docgen grew out of one Claude Code session that built a narrated tutorial for TallyUp (the
competition-management app). That pipeline is the Phase 0 starting point.

- Session: Omnigent `b0e78af1739d485b90cfef81b869fc2e` ("TallyUp entry tutorial video"),
  https://omni.bunbury.ai/c/b0e78af1739d485b90cfef81b869fc2e
- Repo: `~/competition-management`

> **Heads-up (2026-10-22):** `scripts/tutorial-video/` and `docs/tutorials/` are **untracked** in
> `competition-management` (`git status` shows `??`). Commit them there, or copy them here, before
> anything cleans that working tree.

## What it produced

A 1:50 narrated MP4 that adds a new competitor and enters them in their first class, recorded from
the real TallyUp UI with made-up demo data. Nothing in production or training was changed.

All in `docs/tutorials/add-competitor-and-entry/`:

| File | What it is |
| --- | --- |
| `tallyup-add-competitor-and-entry.mp4` | 1920×1080, 30 fps, captions burned in |
| `tallyup-add-competitor-and-entry.srt` | The same captions as a separate file |
| `README.md` + `screenshots/` | Written how-to, 15 steps with annotated screenshots and a "Good to know" section |
| `workflow.json` | The reusable step definition: what to click, what the voice says, captions, doc text, checks |
| `VALIDATION.md` | Test results |

Reported checks: all 15 steps passed on four runs with no browser or server errors; the database held
exactly one new competitor and one entry afterwards (no double submit); 17 narration lines audible at
the right moments; loudness at −16 LUFS; no black frames; 17 caption cues. The narration still needed
a human listen for pronunciation and pacing.

## The pipeline (`scripts/tutorial-video/`)

```
docs/tutorials/<id>/workflow.json      what to do and say (the reusable definition)
        │
        ├── capture.mjs   Playwright runs the workflow against the demo app,
        │                 validates each step + the database, captures frames
        ├── tts.mjs       MiniMax narration, one clip per beat (cached)
        ├── compose.mjs   timeline → deterministic HTML player → frames → FFmpeg MP4 (+ .srt)
        ├── docs.mjs      README.md + annotated screenshots
        └── qa.mjs        output checks
```

Plus `lib.mjs`, `player/` (the HTML player: `index.html`, `player.css`, `player.js`) and `demo-env/`
(`db.sh`, `seed.sql`, `serve.sh`). The renderer is this custom HTML player plus FFmpeg, **not**
HyperFrames.

Run order: `demo-env/db.sh reset`, `demo-env/serve.sh`, then `capture` → `tts` → `compose` → `docs`
→ `qa`, each with `--workflow <id>`. Useful flags: `tts --force`, `compose --no-render`,
`compose --stills 3,12.5,40`, `capture --no-reset`.

## workflow.json (the v0 walkthrough format)

| Field | Purpose |
| --- | --- |
| `id`, `version`, `title`, `summary`, `product`, `audience` | Identity and who it's for |
| `verifiedAgainst` | App, routes and source files the walkthrough was checked against (seed of the impact map) |
| `environment` | Base URL, start path, viewport (1440×810), device scale, demo persona, show |
| `data` | Values referenced as `{{competitor.firstName}}` in steps and checks |
| `voice` | TTS model, voice id, speed, gap after each beat |
| `intro` / `outro` | Title card text, recap bullets, narration and caption |
| `steps[]` | `id`, `chapter`, `title`, `voice`, `caption`, `doc` (Markdown), `camera`, `actions[]` |
| `validate.database[]` | SQL checks run after the run |

Actions: `click`, `type`, `point`, `expect`, `waitFor` / `waitForUrl` (optional `snapshot`),
`scrollTo`. Targets are Playwright locators (`role`+`name`, `label`, `placeholder`, `text`, `css`),
with `hasText`, `within`, `innermost`, `padUnion`. `camera` is `"full"` or a focus target with zoom
and alignment. Timing is automatic: a step lasts as long as its narration or its actions, whichever
is longer.

Spoken text (`voice`) is written as it should sound ("Tally Up") and on-screen text (`caption`)
separately. That split is where docgen's pronunciation list comes from.

## Demo environment

- **Why:** the training database is a copy of production, and the competitor list shows every
  competitor, so recording there would show real customers. Training sign-in also goes through the
  login system shared with live.
- **Database:** a private local Postgres with the training schema only (`pg_dump --schema-only`),
  role reference tables, and `seed.sql`: a fictional "Riverbend Show 2026". Emails use example.com;
  phone numbers come from Australia's range reserved for fiction.
- **App:** `next dev` on 127.0.0.1:3100 with overrides only: local DB, throwaway `AUTH_SECRET`,
  email blocked, no AWS or OpenAI credentials.
- **Sign-in:** `capture.mjs` mints a sign-in ticket for a synthetic office-staff user with the
  throwaway secret and posts it to the app's real Auth.js credentials callback. No real login.

## Voice

MiniMax, stock voice `English_Aussie_Bloke`. The key is read at run time from the environment or the
`MINIMAX_*` lines of `~/bunbury-ai-marketing/.env`, never copied into a repo. Clips are cached so
only changed wording is billed.

## Lessons that shaped the scope

| What happened in TallyUp | Where it shows up in docgen |
| --- | --- |
| One JSON file drove the video, captions, guide and checks | Walkthrough files as the single source of truth |
| Training data was a copy of production | Safe-by-default capture ladder; PII masking and scans; demo-env contract |
| Real sign-in was shared with live | Test-only sign-in as part of the demo-env contract |
| Steps asserted against UI and database | Walkthroughs double as tests; "nothing documented that wasn't seen working" |
| TTS cached per line | Content-hash caching in CI |
| Colour range and loudness needed fixing before delivery | Video quality checks built into Verify |
| `verifiedAgainst` listed routes and source files | Seed for the CI impact map |
| Pronunciation needed a human listen | Pronunciation list editable in the Studio and by asking |

## Likely TallyUp-specific vs reusable (to confirm in Phase 0)

- **Probably reusable:** capture runner and action vocabulary, TTS caching, timeline and HTML player,
  FFmpeg encode, docs generator, QA checks.
- **Probably TallyUp-specific:** Postgres schema dump and seed, Auth.js ticket minting, show/class
  data, MiniMax-only voice. These become per-app adapters behind the demo-env contract.
