import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeCiWorkflow } from "../../src/init/ci.js";

const createdDirs: string[] = [];
function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "docgen-init-ci-test-"));
  createdDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (createdDirs.length > 0) rmSync(createdDirs.pop()!, { recursive: true, force: true });
});

describe("writeCiWorkflow", () => {
  it("writes .github/workflows/docgen.yml with the configured action, config path and app url", () => {
    const appRepo = tmpDir();
    const result = writeCiWorkflow({ appRepo, configPath: "help/docgen.config.ts", waitOnUrl: "http://localhost:3100", uses: "elijah-g/docgen@main" });

    expect(result.written).toBe(true);
    expect(result.file).toBe(join(appRepo, ".github", "workflows", "docgen.yml"));
    const content = readFileSync(result.file, "utf8");
    expect(content).toContain("uses: elijah-g/docgen@main");
    expect(content).toContain("config: help/docgen.config.ts");
    expect(content).toContain("pr-number:");
    expect(content).toContain("http://localhost:3100");
    expect(content).toContain("on:");
    expect(content).toContain("pull_request");
    expect(content).toContain("permissions:");
    expect(content).toContain("contents: write");
    expect(content).toContain("pull-requests: write");
  });

  it("never overwrites an existing workflow file", () => {
    const appRepo = tmpDir();
    mkdirSync(join(appRepo, ".github", "workflows"), { recursive: true });
    const existing = join(appRepo, ".github", "workflows", "docgen.yml");
    writeFileSync(existing, "# hand-edited\n");

    const result = writeCiWorkflow({ appRepo });
    expect(result.written).toBe(false);
    expect(readFileSync(existing, "utf8")).toBe("# hand-edited\n");
  });

  it("adds a postgres service block when requested", () => {
    const appRepo = tmpDir();
    const result = writeCiWorkflow({ appRepo, postgres: true });
    const content = readFileSync(result.file, "utf8");
    expect(content).toContain("services:");
    expect(content).toContain("postgres:16");
  });

  it("includes a prune job for closed PRs", () => {
    const appRepo = tmpDir();
    const result = writeCiWorkflow({ appRepo });
    const content = readFileSync(result.file, "utf8");
    expect(content).toContain("docgen-prune-previews");
    expect(content).toContain("docgen-previews");
  });

  it("never uses pull_request_target as a trigger, triggers only on pull_request, and skips the prune job for forks", () => {
    const appRepo = tmpDir();
    const result = writeCiWorkflow({ appRepo });
    const content = readFileSync(result.file, "utf8");
    const onBlock = content.slice(content.indexOf("\non:"), content.indexOf("\npermissions:"));
    expect(onBlock).toContain("pull_request:");
    expect(onBlock).not.toContain("pull_request_target");
    expect(content).toContain("is-fork");
    expect(content).toContain("github.event.pull_request.head.repo.full_name != github.repository");
    expect(content).toContain("github.event.pull_request.head.repo.full_name == github.repository");
  });

  it("declares no top-level permissions and pins every action to a major version", () => {
    const appRepo = tmpDir();
    const result = writeCiWorkflow({ appRepo });
    const content = readFileSync(result.file, "utf8");
    expect(content).toContain("permissions: {}");
    const usesLines = content.split("\n").filter((l) => l.includes("uses:"));
    expect(usesLines.length).toBeGreaterThan(0);
    for (const line of usesLines) {
      expect(line).toMatch(/@(v\d+|main)\b/);
    }
  });
});
