import { createHash } from "node:crypto";
import type { Pool } from "@filmfund/db";
import { assertSourcePermitted } from "../sourceGate.js";
import { CURATED_BODIES, type CuratedBody } from "../sources/curatedBodies.js";

/**
 * Ingests the curated institutional funders (Phase 3). Idempotent by
 * website_domain (migration 0003 unique key); every body gets an evidence row
 * linking to its official site. `funding_types` is always set, which is what
 * distinguishes a curated funder from a Wikidata production company (whose
 * funding_types stay empty) in the dashboard directory.
 *
 * No films or financing_relationships are created here — these are entities
 * with public mandates, not evidenced deals. They contribute to the funding
 * directory and, once linked to films by later phases, to qualification.
 */

export interface CuratedStats {
  considered: number;
  upserted: number;
  genreTagged: number;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export async function runIngestCurated(
  pool: Pool,
  bodies: CuratedBody[] = CURATED_BODIES
): Promise<CuratedStats> {
  await assertSourcePermitted(pool, "curated_public_bodies");

  const stats: CuratedStats = { considered: bodies.length, upserted: 0, genreTagged: 0 };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO raw_documents (source_name, url, fetched_via, robots_ok, tos_verdict, content_hash, retrieved_at)
       VALUES ('curated_public_bodies', 'curated:institutional_funders', 'curated', true, 'permitted', $1, now())
       ON CONFLICT (source_name, content_hash) DO NOTHING`,
      [sha256(`curated:v1:${bodies.length}`)]
    );

    for (const b of bodies) {
      const genres = b.genres ?? [];
      const evidence = await client.query<{ id: string }>(
        `INSERT INTO evidence (source_name, source_license, url, retrieved_at, excerpt, content_hash)
         VALUES ('curated_public_bodies', 'curated', $1, now(), $2, $3)
         ON CONFLICT (source_name, content_hash) WHERE content_hash IS NOT NULL DO UPDATE SET retrieved_at = now()
         RETURNING id`,
        [`https://${b.website}`, `${b.name} — ${b.mandate}`, sha256(`curated:${b.website}`)]
      );

      // Select-then-upsert by website_domain (no unique index required, and
      // safe against any pre-existing duplicate domains). If a Wikidata/SEC
      // entity already holds this domain, fold the curated tags into it.
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM entities WHERE website_domain = $1 ORDER BY created_at LIMIT 1`,
        [b.website]
      );
      if (existing.rows[0]) {
        await client.query(
          `UPDATE entities SET
             type = $2::entity_type,
             display_name = $3,
             normalized_name = lower($3),
             country = COALESCE(country, $4),
             genre_affinity = (
               SELECT COALESCE(array_agg(DISTINCT g), '{}'::genre_band[])
               FROM unnest(genre_affinity || $5::genre_band[]) AS g
             ),
             funding_types = (
               SELECT COALESCE(array_agg(DISTINCT f), '{}'::financier_role[])
               FROM unnest(funding_types || $6::financier_role[]) AS f
             )
           WHERE id = $1`,
          [existing.rows[0].id, b.type, b.name, b.country, genres, b.fundingTypes]
        );
      } else {
        await client.query(
          `INSERT INTO entities
             (type, display_name, normalized_name, country, website_domain, genre_affinity, funding_types)
           VALUES ($1::entity_type, $2, lower($2), $3, $4, $5::genre_band[], $6::financier_role[])`,
          [b.type, b.name, b.country, b.website, genres, b.fundingTypes]
        );
      }

      // Provenance alias so the evidence is queryable per entity.
      await client.query(
        `INSERT INTO entity_aliases (entity_id, alias, source, evidence_id)
         SELECT id, $1, 'curated_public_bodies', $2 FROM entities WHERE website_domain = $3
         ON CONFLICT DO NOTHING`,
        [b.name, evidence.rows[0]!.id, b.website]
      );

      stats.upserted++;
      if (genres.length) stats.genreTagged++;
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return stats;
}
