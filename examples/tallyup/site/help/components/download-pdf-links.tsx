// Sits next to the PrintButton: links to the walkthrough's own PDF guide and one-page
// quick-reference card, written by the docgen engine's pdf build stage
// (packages/engine/src/pdf) into `public/pdf/<id>.pdf` / `<id>.card.pdf`, and linked into page
// frontmatter as `pdf`/`pdfCard` (packages/engine/src/pdf/frontmatter.ts). Renders nothing until
// `docgen build`/`docgen pdf` has produced at least one of them.
export interface DownloadPdfLinksProps {
  pdf?: string;
  pdfCard?: string;
}

export function DownloadPdfLinks({ pdf, pdfCard }: DownloadPdfLinksProps) {
  if (!pdf && !pdfCard) return null;
  return (
    <>
      {pdf ? (
        <a
          href={pdf}
          download
          className="print:hidden inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm text-fd-muted-foreground hover:bg-fd-accent"
        >
          Download PDF
        </a>
      ) : null}
      {pdfCard ? (
        <a
          href={pdfCard}
          download
          className="print:hidden inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm text-fd-muted-foreground hover:bg-fd-accent"
        >
          Quick-reference card
        </a>
      ) : null}
    </>
  );
}
