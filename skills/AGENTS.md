# docgen skills

This repo uses [docgen](https://github.com/) to generate and keep its help site, help chat, and
agent connector current from walkthrough files. Point your coding agent at the `docgen` skill for
anything help-docs related — "make help docs for my app", "update the help site", "why didn't the
payments page update".

Install once: `npx docgen skills install` copies this `skills/` directory into `.claude/skills/`
and `skills/agents/` into `.claude/agents/` (Claude Code), or leaves it here for Codex and other
agents that read `AGENTS.md`/`SKILL.md` directly.

Read `skills/docgen/SKILL.md` first — it's the entry point and routes to the rest
(`docgen-discover`, `docgen-plan`, `docgen-write`, `docgen-repair`, `docgen-review`,
`docgen-demo-data`). Don't read every skill up front; each one is short on purpose and loads its
own reference files only when needed.

Ground rules this project expects any agent to follow, from the docgen repo's own `AGENTS.md`:
walkthrough files are the single source of truth; never capture against production data or real
logins; demo data uses `example.com` emails and reserved fictional phone ranges; never copy an API
key into the repo; use "walkthrough", "help site", "help chat", "agent connector", and "Studio" in
anything a reader sees.
