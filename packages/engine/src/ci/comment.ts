// Builds the one PR comment `docgen ci` keeps up to date (decisions #23). Short on purpose: a
// summary line, one table per changed walkthrough, stale pages, broken ones with the repair
// command, a footer. The hidden marker lets `github.ts` find and PATCH the same comment on every
// push instead of posting a new one each time.
import type { CiResult, CiWalkthroughResult } from "./types.js";

export const COMMENT_MARKER = "<!-- docgen-ci-comment -->";

export interface CommentImageUrls {
  /** Resolves a `ChangedStep`'s absolute `before`/`after`/`diff` path to a URL usable in the
   * comment (a `raw.githubusercontent.com` URL at the preview commit sha, or a local file:// /
   * relative path in `--dry-run`). */
  urlFor(path: string): string;
}

function statusLabel(status: CiWalkthroughResult["status"]): string {
  switch (status) {
    case "unchanged":
      return "no visible change";
    case "changed":
      return "changed";
    case "new":
      return "new walkthrough — no baseline yet";
    case "failed":
      return "broken";
  }
}

function walkthroughSection(result: CiWalkthroughResult, images: CommentImageUrls): string {
  const lines: string[] = [];
  lines.push(`### \`${result.walkthrough}\` — ${statusLabel(result.status)}`);

  if (result.status === "failed" && result.failure) {
    lines.push("");
    lines.push(`> ${result.failure.summary}`);
    lines.push("");
    lines.push("Run locally in Claude Code:");
    lines.push("```");
    lines.push(result.failure.repairCommand);
    lines.push("```");
    return lines.join("\n");
  }

  if (result.status === "changed" && result.changedSteps.length > 0) {
    lines.push("");
    lines.push("| step | before | after | diff | change |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const step of result.changedSteps) {
      const before = step.before ? `![before](${images.urlFor(step.before)})` : "_(none — new step)_";
      const after = `![after](${images.urlFor(step.after)})`;
      const diff = `![diff](${images.urlFor(step.diff)})`;
      lines.push(`| ${step.step} | ${before} | ${after} | ${diff} | ${(step.changeRatio * 100).toFixed(1)}% |`);
    }
  }

  return lines.join("\n");
}

/** Builds the full comment body. `prNumber`/`appUrl` are shown in the footer only — this never
 * calls out to GitHub or a model. */
export function buildCommentMarkdown(result: CiResult, images: CommentImageUrls, opts: { prNumber?: number } = {}): string {
  const changed = result.results.filter((r) => r.status === "changed");
  const broken = result.results.filter((r) => r.status === "failed");
  const added = result.results.filter((r) => r.status === "new");
  const unchanged = result.results.filter((r) => r.status === "unchanged");

  const lines: string[] = [COMMENT_MARKER];
  lines.push(`## docgen CI`);
  const summaryParts = [
    `${result.affected.length} walkthrough(s) affected`,
    `${changed.length} changed`,
    `${broken.length} broken`,
    `${added.length} new`,
    `${unchanged.length} unchanged`,
  ];
  if (result.all) summaryParts.push(`(all affected — ${result.allReason ?? "diff couldn't be mapped precisely"})`);
  lines.push(summaryParts.join(" · "));
  lines.push("");

  for (const r of [...broken, ...changed, ...added]) {
    lines.push(walkthroughSection(r, images));
    lines.push("");
  }

  if (result.stalePages.length > 0) {
    lines.push(`**Stale pages** (published, source walkthrough no longer exists): ${result.stalePages.map((p) => `\`${p}\``).join(", ")}`);
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`_base \`${result.base.slice(0, 12)}\` → head \`${result.head.slice(0, 12)}\`${opts.prNumber ? ` · PR #${opts.prNumber}` : ""} · updated on every push, no model used._`);

  return lines.join("\n");
}
