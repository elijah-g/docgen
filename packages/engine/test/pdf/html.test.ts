import { describe, expect, it } from "vitest";
import { buildCardHtml, buildCoverHtml, buildPageHtml, buildTocHtml } from "../../src/pdf/html.js";
import type { CardStepInput, PdfPageInput } from "../../src/pdf/types.js";

function pageInput(overrides: Partial<PdfPageInput> = {}): PdfPageInput {
  return {
    id: "add-thing",
    title: "Add a thing",
    markdown: "# Add a thing\n\nDo the thing.\n",
    baseDir: "/tmp",
    passed: true,
    publishable: true,
    cardSteps: [],
    ...overrides,
  };
}

// Regression (review finding pdf/html.ts:166, also L59/L90/L117): titles, step text and reader
// names are interpolated into the print HTML Chromium renders straight off file://. Unescaped,
// an `<iframe src=file:///home/u/.env>` in any of these fields gets printed into the PDF as a
// live tag instead of inert text, and a plain "<" silently drops the rest of the line.
const IFRAME_PAYLOAD = '<iframe src="file:///home/u/.env"></iframe>';

describe("buildPageHtml", () => {
  it("escapes an iframe payload and a bare '<' in the page title", () => {
    const html = buildPageHtml(pageInput({ title: IFRAME_PAYLOAD }));
    expect(html).not.toContain("<iframe");
    expect(html).toContain("&lt;iframe");
  });

  it("escapes 'a < b' instead of dropping it", () => {
    const html = buildPageHtml(pageInput({ title: "a < b" }));
    expect(html).toContain("a &lt; b");
  });

  it("emits a Content-Security-Policy meta tag blocking scripts/frames/remote loads by default", () => {
    const html = buildPageHtml(pageInput());
    expect(html).toMatch(/<meta http-equiv="Content-Security-Policy"/);
    expect(html).toMatch(/frame-src 'none'/);
    expect(html).toMatch(/script-src 'none'/);
    expect(html).not.toMatch(/img-src[^;]*https:/);
  });

  it("allows https: in the CSP img-src only when allowRemoteImages is set", () => {
    const html = buildPageHtml(pageInput(), undefined, true);
    expect(html).toMatch(/img-src[^;]*https:/);
  });
});

describe("buildCoverHtml", () => {
  it("escapes an iframe payload in the cover title", () => {
    const html = buildCoverHtml(IFRAME_PAYLOAD, "2026-10-22");
    expect(html).not.toContain("<iframe");
    expect(html).toContain("&lt;iframe");
  });
});

describe("buildTocHtml", () => {
  it("escapes an iframe payload in a reader name and a walkthrough title", () => {
    const html = buildTocHtml([{ title: IFRAME_PAYLOAD, reader: IFRAME_PAYLOAD }]);
    expect(html).not.toContain("<iframe");
    expect(html).toContain("&lt;iframe");
  });
});

describe("buildCardHtml", () => {
  it("escapes an iframe payload in a card step's caption text", () => {
    const steps: CardStepInput[] = [{ number: 1, title: "Step 1", text: IFRAME_PAYLOAD }];
    const html = buildCardHtml("Card title", steps, undefined, {});
    expect(html).not.toContain("<iframe");
    expect(html).toContain("&lt;iframe");
  });

  it("escapes an iframe payload in the card title", () => {
    const html = buildCardHtml(IFRAME_PAYLOAD, [], undefined, {});
    expect(html).not.toContain("<iframe");
    expect(html).toContain("&lt;iframe");
  });
});
