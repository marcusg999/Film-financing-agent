import { createPool } from "@filmfund/db";
import { runIngestWikidata } from "../ingest/wikidataIngest.js";

/**
 * Backfill CLI: npm run ingest:wikidata -w @filmfund/pipeline -- --limit 2000
 * Needs network egress to query.wikidata.org (Railway, or a local machine;
 * the remote-session container's network policy blocks data hosts).
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const pool = createPool();
runIngestWikidata(pool, {
  since: arg("since") ?? "2016-01-01",
  limit: Number(arg("limit") ?? 1000),
  offset: arg("offset") ? Number(arg("offset")) : undefined,
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
