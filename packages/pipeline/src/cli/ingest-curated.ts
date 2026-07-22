import { createPool } from "@filmfund/db";
import { runIngestCurated } from "../ingest/curatedIngest.js";

/**
 * Seeds the curated institutional funders. Runs fully offline (no network,
 * no API key): npm run ingest:bodies -w @filmfund/pipeline
 */
const pool = createPool();
runIngestCurated(pool)
  .then((stats) => {
    console.log(JSON.stringify(stats, null, 2));
    return pool.end();
  })
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
    return pool.end();
  });
