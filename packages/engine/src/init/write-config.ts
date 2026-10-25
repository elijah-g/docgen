// Writes `docgen.config.ts` into a freshly-copied help app, filling in the
// detected app URL, brand and (as comments) the routes `detectFramework`
// found. Never overwrites an existing config — a second `docgen init` leaves
// a config the user has started editing alone and reports it skipped, same as
// every other template file (see copy-template.ts).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BrandConfig } from "../config/types.js";
import type { DetectResult } from "./detect.js";

export interface WriteConfigOptions {
  destDir: string;
  appUrl: string;
  brand: BrandConfig;
  detected: DetectResult;
}

export interface WriteConfigResult {
  file: string;
  written: boolean;
}

function brandBlock(brand: BrandConfig): string {
  const fields = Object.entries(brand).filter(([, v]) => v !== undefined);
  if (fields.length === 0) return "";
  const lines = fields.map(([k, v]) => `    ${k}: ${JSON.stringify(v)},`);
  return `  brand: {\n${lines.join("\n")}\n  },\n`;
}

function routesComment(detected: DetectResult): string {
  if (detected.framework !== "nextjs") {
    return "// Framework: not detected as Next.js — fill in app.baseUrl by hand below.\n";
  }
  const lines = [`// Detected: Next.js App Router (${detected.appDir ?? "app/"})`];
  if (detected.routes.length > 0) lines.push(`// Routes seen: ${detected.routes.join(", ")}`);
  if (detected.authLibrary) lines.push(`// Sign-in: looks like ${detected.authLibrary} — see docs/scope.md "Capture modes".`);
  return lines.map((l) => `${l}\n`).join("");
}

/** Writes `<destDir>/docgen.config.ts`. No-ops (and reports `written: false`) when the file already exists. */
export function writeDocgenConfig(opts: WriteConfigOptions): WriteConfigResult {
  const file = join(opts.destDir, "docgen.config.ts");
  if (existsSync(file)) {
    return { file, written: false };
  }

  const content = `// Written by \`docgen init\`; safe to edit by hand afterwards. See
// packages/engine/src/config/types.ts for every field, and docs/scope.md
// ("The help app", "Swappable providers") for what each one does.
${routesComment(opts.detected)}import { defineConfig } from "docgen";

export default defineConfig({
  app: {
    baseUrl: ${JSON.stringify(opts.appUrl)},
  },
  walkthroughsDir: "./walkthroughs",
  // This config lives inside the help app itself, so generated output goes
  // right here rather than into a nested \`help/\` folder.
  outDir: ".",
  buildDir: "./.build",
  // This help app is its own target: the index stage mirrors built pages into
  // its own content/docs + public/ so the help site actually shows them.
  helpApp: ".",
${brandBlock(opts.brand)}});
`;

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
  return { file, written: true };
}
