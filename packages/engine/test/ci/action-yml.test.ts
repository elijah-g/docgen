import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

const actionFile = join(dirname(fileURLToPath(import.meta.url)), "../../../../action.yml");

describe("action.yml", () => {
  const action = YAML.parse(readFileSync(actionFile, "utf8")) as {
    inputs: Record<string, { description?: string }>;
    outputs: Record<string, { description?: string }>;
  };

  // GitHub evaluates `${{ }}` even inside metadata descriptions, where the `github` context
  // doesn't exist, and refuses to load the action ("Unrecognized named-value: 'github'").
  it("has no expressions in input or output descriptions", () => {
    for (const [name, spec] of [...Object.entries(action.inputs), ...Object.entries(action.outputs)]) {
      expect(spec.description ?? "", name).not.toContain("${{");
    }
  });

  it("has a publish input for refreshing docs on push to main", () => {
    expect(action.inputs.publish).toBeDefined();
  });
});
