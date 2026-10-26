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
  // From `docgen theme --detect --app-repo ~/competition-management`. Asset paths point at the
  // TallyUp checkout next to this repo; without it, `docgen theme` keeps the last copied files.
  brand: {
    name: "TallyUp",
    primaryColor: "235 55% 42%",
    accentColor: "183 68% 30%",
    colors: {
      primaryForeground: "0 0% 100%",
      background: "222 26% 97%",
      foreground: "224 42% 14%",
      card: "0 0% 100%",
      muted: "220 24% 93%",
      mutedForeground: "222 16% 40%",
      border: "220 20% 89%",
    },
    dark: {
      primary: "236 72% 71%",
      primaryForeground: "234 52% 12%",
      accent: "181 58% 48%",
      background: "224 44% 7%",
      foreground: "213 34% 96%",
      card: "224 38% 11%",
      muted: "223 30% 18%",
      mutedForeground: "217 20% 70%",
      border: "223 26% 22%",
    },
    logo: "../../../../../competition-management/public/TallyUp-Logo-Main.png",
    logoDark: "../../../../../competition-management/public/TallyUp-Logo-Flat-White.png",
    icon: "../../../../../competition-management/public/apple-touch-icon.png",
    font: "Inter",
    fontUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
    radius: "10px",
  },
});
