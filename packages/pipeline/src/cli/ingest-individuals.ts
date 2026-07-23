import { createPool } from "@filmfund/db";
import { runIngestCurated } from "../ingest/curatedIngest.js";
import { CURATED_INDIVIDUALS } from "../sources/curatedIndividuals.js";

/**
 * Seeds individual-backed film vehicles (compliant — public vehicles +
 * principal names, professional channels only). Fully offline:
 * npm run ingest:individuals -w @filmfund/pipeline
 */
const pool = createPool();
runIngestCurated(pool, CURATED_INDIVIDUALS)
  .then((stats) => {
    console.log(JSON.stringify(stats, null, 2));
    return pool.end();
  })
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
    return pool.end();
  });
