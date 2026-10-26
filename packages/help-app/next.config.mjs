import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // docgen writes its own Markdown output to a `pages/` folder next to this app. Only .tsx/.ts
  // files are routes, so that folder is never mistaken for Pages Router pages.
  pageExtensions: ["tsx", "ts"],
  // Next.js writes an AGENTS.md into the app on `next dev` unless told not to; this app is
  // generated and owned by docgen, so keep the user's repo free of it.
  agentRules: false,
  // Lets the dev-only Studio load through a dev proxy listed in DOCGEN_STUDIO_ALLOWED_HOSTS.
  allowedDevOrigins: (process.env.DOCGEN_STUDIO_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean),
};

export default withMDX(config);
