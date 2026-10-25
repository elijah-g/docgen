"use client";

/**
 * A simple preview of the built help page's text. Phase 1 scope is text edits only (no
 * timeline/screenshots yet — see docs/scope.md "Editing"), so this renders the page's Markdown
 * with docgen's generated-block markers stripped, using a small regex-based formatter rather
 * than pulling the full Fumadocs/MDX pipeline into the Studio (keeps the app thin).
 */
export function PagePreview({ text, found }: { text?: string; found: boolean }) {
  if (!found) {
    return (
      <p className="p-4 text-sm text-fd-muted-foreground">
        No page built yet for this walkthrough — run <code>docgen pages</code> (or{" "}
        <code>docgen build</code>) to see a preview here.
      </p>
    );
  }
  return (
    <div className="prose prose-sm max-w-none p-4 dark:prose-invert">
      {(text ?? "").split(/\n{2,}/).map((block, i) => (
        <PreviewBlock key={i} block={block} />
      ))}
    </div>
  );
}

function PreviewBlock({ block }: { block: string }) {
  if (block.startsWith("### ")) return <h3>{inline(block.slice(4))}</h3>;
  if (block.startsWith("## ")) return <h2>{inline(block.slice(3))}</h2>;
  if (block.startsWith("# ")) return <h1>{inline(block.slice(2))}</h1>;
  if (block.startsWith("![")) {
    const m = /!\[([^\]]*)\]\(([^)]*)\)/.exec(block);
    // eslint-disable-next-line @next/next/no-img-element
    return m ? <img alt={m[1]} src={m[2]} /> : <p>{block}</p>;
  }
  if (block.startsWith("- ")) {
    return (
      <ul>
        {block.split("\n").map((line, i) => (
          <li key={i}>{inline(line.replace(/^- /, ""))}</li>
        ))}
      </ul>
    );
  }
  return <p dangerouslySetInnerHTML={{ __html: inline(block) }} />;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** `**bold**` and `*italic*` only — enough to make a preview readable without a Markdown dep.
 * Input is HTML-escaped first, so this never introduces unescaped user text into the DOM. */
function inline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}
