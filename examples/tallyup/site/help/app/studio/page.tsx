// The Studio (M9): a dev-only `/studio` route that edits the help app's own repo files directly
// (Keystatic/TinaCMS style) — see docs/scope.md "The Studio" and decisions #9/#19. Phase 1 scope:
// edit walkthrough step fields (say/caption/page_text/title/hold), callouts and blur boxes
// (M22), with a preview of the built page/video and the edit history.
//
// Dev-only by contract (AGENTS.md: "the Studio is a dev-only /studio route") — this guard is the
// enforcement point: anything under app/studio/** must stay unreachable in a production build, so
// a host that accidentally serves it never exposes an editor. Every route handler under
// app/studio/api/** has the matching guard (`_lib/dev-only.ts`).
import { StudioApp } from "@/components/studio/StudioApp";
import { assertDevPage } from "./_lib/dev-only";
import { getStudioToken } from "./_lib/security";
import "./studio.css";

export const metadata = { title: "Studio" };

export default function StudioPage() {
  assertDevPage();
  // The token is embedded here, in a same-origin server-rendered response — a cross-site request
  // has no way to read it. StudioApp sends it back on every /studio/api/** call (security.ts).
  return <StudioApp studioToken={getStudioToken()} />;
}
