// Fumadocs source loader. Content and frontmatter come entirely from the docgen
// engine's page builder (packages/engine/src/pages) — this file only wires
// Fumadocs up to read it. Keep it thin: no app logic here.
import { loader } from "fumadocs-core/source";
import { defineDocs } from "fumadocs-mdx/macro";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { z } from "zod";

// Extends Fumadocs' page schema with the frontmatter docgen's page builder
// writes (packages/engine/src/pages/content.ts: title/for/walkthrough/
// lastChecked/passed/video/srt/vtt). Pages with `passed: false` are filtered
// out of the production build in app/(site)/[[...slug]]/page.tsx.
export const docgenPageSchema = pageSchema.extend({
  for: z.string().optional(),
  walkthrough: z.string().optional(),
  lastChecked: z.string().optional(),
  passed: z.boolean().optional(),
  video: z.string().optional(),
  srt: z.string().optional(),
  vtt: z.string().optional(),
  // Printable guides (packages/engine/src/pdf): paths to the page's own PDF and one-page
  // quick-reference card, written by the pdf build stage (pdf/frontmatter.ts). Optional — unset
  // until `docgen build`/`docgen pdf` has run at least once.
  pdf: z.string().optional(),
  pdfCard: z.string().optional(),
});

const docs = defineDocs({
  dir: "content/docs",
  docs: { schema: docgenPageSchema },
  meta: { schema: metaSchema },
});

// See https://fumadocs.dev/docs/headless/source-api
export const source = loader({
  baseUrl: "/",
  source: docs.toFumadocsSource(),
});
