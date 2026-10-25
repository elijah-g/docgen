import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ZodError } from "zod";
import * as YAML from "yaml";
import {
  convertTallyupWorkflow,
  WalkthroughDocSchema,
  docToWalkthrough,
} from "../walkthrough/index.js";

export interface ImportResult {
  input: string;
  output: string;
  walkthrough: string;
  steps: number;
}

/** `foo.json` -> `foo.yaml`; anything else gets `.yaml` appended rather than replacing nothing. */
function defaultOutFile(input: string): string {
  return /\.json$/i.test(input) ? input.replace(/\.json$/i, ".yaml") : `${input}.yaml`;
}

/** Reduces an error to one short line — never dumps a raw stack or a full ZodError blob. */
function formatCliError(err: unknown): string {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const path = first?.path.join(".");
    return `invalid data${path ? ` at "${path}"` : ""}: ${first?.message ?? "schema validation failed"}`;
  }
  if (err instanceof Error) return err.message.split("\n")[0];
  return String(err);
}

export function runImportTallyup(
  input: string,
  output: string | undefined,
  json: boolean,
  force = false,
): number {
  try {
    const outFile = output ?? defaultOutFile(input);
    if (resolve(outFile) === resolve(input)) {
      throw new Error(
        `refusing to write output to the input file "${input}" — pass -o/--output with a different path`,
      );
    }
    if (!force && existsSync(outFile)) {
      throw new Error(`"${outFile}" already exists — pass --force to overwrite it`);
    }

    const raw = JSON.parse(readFileSync(input, "utf8"));
    const doc = convertTallyupWorkflow(raw);

    // Fail loudly if the conversion produced something our own schema rejects.
    const parsed = WalkthroughDocSchema.parse(doc);
    const walkthrough = docToWalkthrough(parsed);

    writeFileSync(outFile, YAML.stringify(doc), "utf8");

    const result: ImportResult = {
      input,
      output: outFile,
      walkthrough: walkthrough.walkthrough,
      steps: walkthrough.steps.length,
    };

    if (json) {
      console.log(JSON.stringify(result));
    } else {
      console.log(`imported ${result.walkthrough}: ${result.steps} steps -> ${outFile}`);
    }
    return 0;
  } catch (err) {
    const message = formatCliError(err);
    if (json) {
      console.log(JSON.stringify({ input, output: null, error: message }));
    } else {
      console.error(`error: ${message}`);
    }
    return 1;
  }
}
