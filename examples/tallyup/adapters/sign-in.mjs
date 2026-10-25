// TallyUp's sign-in adapter: mints the same HMAC ticket capture.mjs used
// (mirrors competition-management's lib/auth/sign-in-ticket.ts) and posts it
// to the real app's Auth.js credentials callback. No real login, ever — the
// throwaway secret lives only under $TUTORIAL_DEMO_STATE (demo-env/serve.sh
// writes it), default /tmp/tallyup-video-demo, and is never copied into a repo.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

/** @type {import("docgen").SignInAdapter} */
export default async function signIn({ context, baseUrl, persona, env }) {
  const state = env.TUTORIAL_DEMO_STATE ?? "/tmp/tallyup-video-demo";
  const secret = readFileSync(path.join(state, "auth-secret"), "utf8").trim();
  const body = Buffer.from(
    JSON.stringify({
      cognitoSub: persona?.cognitoSub,
      email: persona?.email,
      name: persona?.name,
      exp: Date.now() + 60_000,
    }),
  ).toString("base64url");
  const ticket = `${body}.${createHmac("sha256", secret).update(`sign-in-ticket:${body}`).digest("base64url")}`;

  const { csrfToken } = await (await context.request.get(`${baseUrl}/api/auth/csrf`)).json();
  const res = await context.request.post(`${baseUrl}/api/auth/callback/credentials`, {
    form: { csrfToken, ticket, callbackUrl: baseUrl },
    maxRedirects: 0,
  });
  const cookies = await context.cookies();
  if (!cookies.some((c) => c.name.includes("session-token"))) {
    throw new Error(`sign-in failed (HTTP ${res.status()})`);
  }
}
