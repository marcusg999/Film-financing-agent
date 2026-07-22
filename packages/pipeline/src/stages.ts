import type { Pool } from "@filmfund/db";
import { assertSourcePermitted } from "./sourceGate.js";
import type { IngestJob, ExtractJob, ResolveJob, EnrichJob, ScoreJob } from "./queues.js";

/**
 * Stage handlers. Phase 0 ships the skeleton with the ToS gate live in
 * ingest; extraction/resolution/enrichment/scoring land in Phases 1–4
 * (docs/07). Each unimplemented stage throws loudly rather than silently
 * succeeding, so a misconfigured queue can't fake progress.
 */

export class NotImplementedError extends Error {
  constructor(stage: string, phase: string) {
    super(`${stage} is not implemented yet (lands in ${phase})`);
    this.name = "NotImplementedError";
  }
}

export async function ingest(pool: Pool, job: IngestJob): Promise<void> {
  await assertSourcePermitted(pool, job.sourceName);
  throw new NotImplementedError("ingest fetch", "Phase 1");
}

export async function extract(_pool: Pool, _job: ExtractJob): Promise<void> {
  throw new NotImplementedError("extract", "Phase 1");
}

export async function resolve(_pool: Pool, _job: ResolveJob): Promise<void> {
  throw new NotImplementedError("resolve", "Phase 2");
}

export async function enrich(_pool: Pool, _job: EnrichJob): Promise<void> {
  throw new NotImplementedError("enrich", "Phase 4");
}

export async function score(_pool: Pool, _job: ScoreJob): Promise<void> {
  throw new NotImplementedError("score", "Phase 2");
}
