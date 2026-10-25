// Renders one help page from content/docs (written by the docgen engine's page
// builder, packages/engine/src/pages). Pages with `passed: false` are kept out
// of production builds — a walkthrough that hasn't verified clean against the
// real app shouldn't ship — but still render in dev so the Studio/editors can
// see what's wrong.
import { source } from "@/lib/source";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getMDXComponents } from "@/components/mdx";
import { PrintButton } from "@/components/print-button";
import { DownloadPdfLinks } from "@/components/download-pdf-links";
import { LastCheckedBadge } from "@/components/last-checked-badge";
import { VideoEmbed } from "@/components/video-embed";

export default async function Page(props: PageProps<"/[[...slug]]">) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  // Build-time filter (scope.md "Last checked" badge / pages half): a page
  // the last capture marked failed never reaches a production build.
  if (process.env.NODE_ENV === "production" && page.data.passed === false) {
    notFound();
  }

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-2">{page.data.description}</DocsDescription>
      <div className="mb-4 flex flex-wrap items-center gap-2 border-b pb-4">
        <LastCheckedBadge lastChecked={page.data.lastChecked} passed={page.data.passed ?? false} />
        <PrintButton />
        <DownloadPdfLinks pdf={page.data.pdf} pdfCard={page.data.pdfCard} />
      </div>
      {page.data.video ? (
        <VideoEmbed src={page.data.video} vtt={page.data.vtt} srt={page.data.srt} title={page.data.title} />
      ) : null}
      <DocsBody>
        <MDX components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: PageProps<"/[[...slug]]">): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
