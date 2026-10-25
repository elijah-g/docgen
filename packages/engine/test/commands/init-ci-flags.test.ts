// `docgen init --ci --claude --docs-repo <owner/repo>` wiring (build-plan.md M19 items 2-3):
// both workflows get written and config.ci carries the matching flags, so `docgen ci`'s own
// comment text and docs-repo config line up with what was actually installed.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runInitCommand } from "../../src/commands/init.js";

const createdDirs: string[] = [];
function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "docgen-init-ci-flags-test-"));
  createdDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (createdDirs.length > 0) rmSync(createdDirs.pop()!, { recursive: true, force: true });
});

describe("runInitCommand --ci --claude --docs-repo", () => {
  it("writes both workflows and the matching config.ci block", () => {
    const dir = tmpDir();

    const result = runInitCommand({ dir, ci: true, ciClaude: true, ciDocsRepo: "acme/docgen-docs" });

    expect(result.ci?.written).toBe(true);
    expect(result.claudeRepair?.written).toBe(true);
    expect(existsSync(join(dir, ".github", "workflows", "docgen.yml"))).toBe(true);
    expect(existsSync(join(dir, ".github", "workflows", "docgen-repair.yml"))).toBe(true);

    const ciWorkflow = readFileSync(join(dir, ".github", "workflows", "docgen.yml"), "utf8");
    expect(ciWorkflow).toContain("repository: acme/docgen-docs");
    expect(ciWorkflow).toContain("config: .docgen-docs/help/docgen.config.ts");

    const config = readFileSync(result.config.file, "utf8");
    expect(config).toContain("claudeAction: true");
    expect(config).toContain('docsRepo: "acme/docgen-docs"');
  });

  it("writes neither workflow, and no ci block, when --ci is omitted", () => {
    const dir = tmpDir();
    const result = runInitCommand({ dir, ciClaude: true, ciDocsRepo: "acme/docgen-docs" });

    expect(result.ci).toBeUndefined();
    expect(result.claudeRepair).toBeUndefined();
    expect(existsSync(join(dir, ".github"))).toBe(false);
    const config = readFileSync(result.config.file, "utf8");
    expect(config).not.toMatch(/\bci:\s*\{/);
  });
});
