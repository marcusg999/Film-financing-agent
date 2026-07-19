import { createPool } from "@filmfund/db";
import { runIngestSecEdgar } from "../ingest/secEdgarIngest.js";

/**
 * Backfill CLI: npm run ingest:sec -w @filmfund/pipeline -- --from 2016-01-01 --to 2026-07-01
 * Needs egress to efts.sec.gov + www.sec.gov (Railway or a machine with
 * network access; the remote-session container blocks data hosts).
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const pool = createPool();
runIngestSecEdgar(pool, {
  from: arg("from"),
  to: arg("to"),
  maxFilings: arg("max") ? Number(arg("max")) : undefined,
})
  .then((stats) => {
    console.log(JSON.stringify(stats, null, 2));
    return pool.end();
  })
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
    return pool.end();
  });
