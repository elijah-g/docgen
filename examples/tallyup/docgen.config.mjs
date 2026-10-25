// docgen config for the TallyUp demo app (~/competition-management), Phase 0's
// real-app proof. Points capture at the local demo server (demo-env/serve.sh,
// 127.0.0.1:3100) with the demo-only sign-in and database adapters — never
// training or production. See docs/origin-tallyup.md.
import { defineConfig } from "docgen";
import signIn from "./adapters/sign-in.mjs";
import database from "./adapters/db-check.mjs";

export default defineConfig({
  app: {
    baseUrl: process.env.TUTORIAL_DEMO_BASE_URL ?? "http://127.0.0.1:3100",
  },
  walkthroughsDir: "./walkthroughs",
  buildDir: "./.build",
  viewport: { width: 1440, height: 810 },
  deviceScaleFactor: 2,
  locale: "en-AU",
  timezone: "Australia/Perth",
  signIn,
  database,
  // Kokoro (local, free) is the project default (docs/scope.md "Swappable providers"); the
  // real-build run no longer needs a MiniMax API key. Swap provider/model/voiceId back to
  // MiniMax or ElevenLabs for a studio-quality narration pass.
  voice: {
    provider: "kokoro",
    speed: 1,
    gapSeconds: 0.45,
  },
  // Exercises docgen build's index stage (search-index.json, llms.txt, page copy) against the
  // help app scaffolded by `docgen init examples/tallyup/site --app-repo ~/competition-management`
  // — kept inside the repo (mirrors examples/emh-check's site/help layout) instead of /tmp, which
  // is tmpfs and gets cleaned/filled on this host.
  helpApp: "./site/help",
  budget: {
    usd: 5,
    tokens: 2_000_000,
  },
});
