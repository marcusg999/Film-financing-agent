import { createPool } from "@filmfund/db";
import { createBoss, QUEUES } from "./queues.js";
import type { IngestJob, ExtractJob, ResolveJob, EnrichJob, ScoreJob } from "./queues.js";
import * as stages from "./stages.js";

/**
 * Long-lived worker process (deployed on Railway alongside the dashboard).
 * Ingest runs with low concurrency for per-source politeness; downstream
 * stages can fan out wider.
 */
async function main(): Promise<void> {
  const pool = createPool();
  const boss = await createBoss();

  await boss.work<IngestJob>(QUEUES.ingest, { batchSize: 1 }, async ([job]) => {
    if (job) await stages.ingest(pool, job.data);
  });
  await boss.work<ExtractJob>(QUEUES.extract, { batchSize: 5 }, async (jobs) => {
    for (const job of jobs) await stages.extract(pool, job.data);
  });
  await boss.work<ResolveJob>(QUEUES.resolve, { batchSize: 5 }, async (jobs) => {
    for (const job of jobs) await stages.resolve(pool, job.data);
  });
  await boss.work<EnrichJob>(QUEUES.enrich, { batchSize: 2 }, async (jobs) => {
    for (const job of jobs) await stages.enrich(pool, job.data);
  });
  await boss.work<ScoreJob>(QUEUES.score, { batchSize: 10 }, async (jobs) => {
    for (const job of jobs) await stages.score(pool, job.data);
  });

  console.log("worker up: queues", Object.values(QUEUES).join(", "));

  const shutdown = async () => {
    await boss.stop();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
