// TallyUp's database adapter, backing a walkthrough's `validate.database`
// checks. Talks only to the isolated demo Postgres cluster that
// ~/competition-management/scripts/tutorial-video/demo-env/db.sh manages —
// never the training or production database. docgen's capture runner hard
// refuses any URL that isn't 127.0.0.1/localhost before this adapter's
// `query()` ever runs (see src/capture/write-guard.ts).
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import postgres from "postgres";

const REPO = process.env.TALLYUP_REPO ?? path.join(homedir(), "competition-management");
const DB_SH = path.join(REPO, "scripts/tutorial-video/demo-env/db.sh");

let sql;

/** @type {import("docgen").DatabaseAdapter} */
export default {
  url() {
    return execFileSync(DB_SH, ["url"]).toString().trim();
  },
  async reset() {
    execFileSync(DB_SH, ["reset"], { stdio: ["ignore", "ignore", "inherit"] });
  },
  async query(sqlText, params = [], context) {
    // Connect with the URL the runner already passed `assertLocalDatabase`
    // (`context.url`), not a fresh `this.url()` call — closes the gap between
    // the check and the query that a changed/forwarded URL could slip through.
    if (!sql) sql = postgres(context?.url ?? this.url(), { ssl: "require", max: 1 });
    return sql.unsafe(sqlText, params);
  },
  async close() {
    if (sql) {
      await sql.end();
      sql = undefined;
    }
  },
};
