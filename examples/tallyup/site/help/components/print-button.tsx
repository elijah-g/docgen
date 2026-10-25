// Per-page print trigger. PDF generation itself is engine-side (later); this
// just invokes the browser's print dialog against the page's @media print
// styles (app/print.css).
"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm text-fd-muted-foreground hover:bg-fd-accent"
    >
      Print
    </button>
  );
}
