import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as YAML from "yaml";
import {
  convertTallyupWorkflow,
  docToWalkthrough,
  loadWalkthroughText,
  WalkthroughDocSchema,
} from "../../src/walkthrough/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const workflowPath = join(here, "../../../../reference/tallyup/workflow.json");
const raw = JSON.parse(readFileSync(workflowPath, "utf8"));

describe("convertTallyupWorkflow", () => {
  it("converts and validates with nothing dropped", () => {
    const doc = convertTallyupWorkflow(raw);
    const parsed = WalkthroughDocSchema.parse(doc);
    const wt = docToWalkthrough(parsed);

    expect(wt.walkthrough).toBe(raw.id);
    expect(wt.title).toBe(raw.title);
    expect(wt.for).toBe(raw.audience);
    expect(wt.steps).toHaveLength(raw.steps.length);

    // The full structured action list must match workflow.json's, step for step.
    for (let i = 0; i < raw.steps.length; i++) {
      expect(wt.steps[i].actions).toEqual(raw.steps[i].actions);
      expect(wt.steps[i].say).toBe(raw.steps[i].voice);
      expect(wt.steps[i].caption).toBe(raw.steps[i].caption);
      expect(wt.steps[i].page_text).toBe(raw.steps[i].doc);
      expect(wt.steps[i].chapter).toBe(raw.steps[i].chapter);
    }

    expect(wt.validate?.database).toEqual(raw.validate.database);
    expect(wt.data).toEqual(raw.data);
    expect(wt.voice).toEqual(raw.voice);
    expect(wt.intro?.say).toBe(raw.intro.voice);
    expect(wt.outro?.recap).toEqual(raw.outro.recap);
  });

  it("round-trips through YAML text and the loader with the same actions", () => {
    const doc = convertTallyupWorkflow(raw);
    const yamlText = YAML.stringify(doc);
    const wt = loadWalkthroughText(yamlText, "add-competitor-and-entry.yaml");

    for (let i = 0; i < raw.steps.length; i++) {
      expect(wt.steps[i].actions).toEqual(raw.steps[i].actions);
    }
    expect(wt.steps).toHaveLength(15);
  });
});
