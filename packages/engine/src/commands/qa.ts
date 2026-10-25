import { runQa, formatQaReport, toJson } from "../qa/index.js";

/** Runs `docgen qa <path>`: checks a video, captions file, or a whole output directory. */
export async function runQaCommand(target: string, json: boolean): Promise<number> {
  const report = await runQa(target);
  console.log(json ? toJson(report) : formatQaReport(report));
  return report.ok ? 0 : 1;
}
