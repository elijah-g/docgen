// Written by `docgen init`; safe to edit by hand afterwards. See
// packages/engine/src/config/types.ts for every field, and docs/scope.md
// ("The help app", "Swappable providers") for what each one does.
// Detected: Next.js App Router (/home/ubuntu/competition-management/app)
// Routes seen: /account-deactivated, /actions, /api, /auth, /components, /config, /dashboard, /display, /embed, /forgot-password, /hooks, /judge, /judge-portal, /lib, /login, /mobile-audit, /oauth, /payments, /post-login, /private, /select-show, /setup-account, /update-password
// Sign-in: looks like Auth.js (next-auth) — see docs/scope.md "Capture modes".
import { defineConfig } from "docgen";

export default defineConfig({
  app: {
    baseUrl: "http://localhost:3000",
  },
  walkthroughsDir: "./walkthroughs",
  // This config lives inside the help app itself, so generated output goes
  // right here rather than into a nested `help/` folder.
  outDir: ".",
  buildDir: "./.build",
  // This help app is its own target: the index stage mirrors built pages into
  // its own content/docs + public/ so the help site actually shows them.
  helpApp: ".",
  brand: {
    primaryColor: "235 55% 42%",
    logo: "public/TallyUp-Logo-Main.png",
  },
});
