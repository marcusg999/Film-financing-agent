import PgBoss from "pg-boss";

/**
 * Stage queues (docs/01): ingest → extract → resolve → enrich → score.
 * Each stage is independently retryable and rate-limited; per-source
 * politeness is enforced by keeping ingest concurrency low.
 */

export const QUEUES = {
  ingest: "ingest",
  extract: "extract",
  resolve: "resolve",
  enrich: "enrich",
  score: "score",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface IngestJob {
  sourceName: string;
  url: string;
}
export interface ExtractJob {
  rawDocumentId: string;
}
export interface ResolveJob {
  candidateEntityId: string;
}
export interface EnrichJob {
  entityId: string;
}
export interface ScoreJob {
  entityId: string;
  projectId?: string;
}

const RETRY = { retryLimit: 3, retryDelay: 30, retryBackoff: true } as const;

export async function createBoss(databaseUrl = process.env.DATABASE_URL): Promise<PgBoss> {
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const boss = new PgBoss({ connectionString: databaseUrl });
  await boss.start();
  for (const name of Object.values(QUEUES)) {
    await boss.createQueue(name, { name, ...RETRY });
  }
  return boss;
}
