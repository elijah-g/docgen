// `docgen build [walkthrough...]`: the one-command build (docs/scope.md "Pipeline",
// build-plan.md M6 gate). Runs capture -> voice -> render -> pages per walkthrough, then index,
// then qa; writes `<buildDir>/report.json`; exits 2 when the run exceeds `config.budget`.
import { loadConfig } from "../config/index.js";
import type { BuildStageName } from "../build/index.js";
import { ALL_STAGES, assembleReport, formatReport, runPipeline, writeReport } from "../build/index.js";

export interface RunBuildOptions {
  configPath: string;
  walkthroughIds: string[];
  draft?: boolean;
  only?: string;
  skipCapture?: boolean;
  noReset?: boolean;
}

function parseOnly(only: string | undefined): BuildStageName[] | undefined {
  if (!only) return undefined;
  const requested = only.split(",").map((s) => s.trim());
  const valid = new Set(ALL_STAGES as string[]);
  for (const r of requested) {
    if (!valid.has(r)) throw new Error(`unknown build stage "${r}" — valid: ${ALL_STAGES.join(", ")}`);
  }
  return requested as BuildStageName[];
}

export async function runBuild(opts: RunBuildOptions, json: boolean): Promise<number> {
  const config = await loadConfig(opts.configPath);
  const only = parseOnly(opts.only);

  const { walkthroughs, index, indexStage, runStartedAt } = await runPipeline(config, {
    configPath: opts.configPath,
    walkthroughIds: opts.walkthroughIds,
    draft: opts.draft,
    only,
    skipCapture: opts.skipCapture,
    noReset: opts.noReset,
    json,
  });

  const report = assembleReport(
    config,
    Boolean(opts.draft),
    walkthroughs,
    index ? { ...index, ...indexStage } : indexStage,
    runStartedAt,
  );
  const reportFile = writeReport(config.buildDir, report);

  if (json) {
    console.log(JSON.stringify({ ...report, reportFile }));
  } else {
    console.log(formatReport(report));
    console.log(`report: ${reportFile}`);
  }

  if (report.budget?.exceeded) return 2;
  return report.ok ? 0 : 1;
}
