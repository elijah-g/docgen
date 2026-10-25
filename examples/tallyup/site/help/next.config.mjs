import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // docgen writes its own Markdown output to a `pages/` folder next to this app. Only .tsx/.ts
  // files are routes, so that folder is never mistaken for Pages Router pages.
  pageExtensions: ["tsx", "ts"],
};

export default withMDX(config);
