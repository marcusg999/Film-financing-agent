import type { Pool, PoolClient } from "@filmfund/db";

/**
 * Entity resolution (docs/01: the silent killer — a first-class stage with
 * an audit trail, not a cleanup afterthought).
 *
 * Two paths:
 *   - strong-key auto-merge: entities sharing a canonical website domain are
 *     the same org (sec_cik / wikidata_qid are already unique, so they can't
 *     be *duplicate* keys — the real duplication is one entity from Wikidata
 *     and another from SEC for the same company, caught by domain or name).
 *   - similarity candidates: high trigram name similarity + a shared signal
 *     (same film, or same country) → auto-merge above a high bar, else a
 *     resolution_candidates row for human review.
 *
 * Every merge repoints relationships/contacts/aliases to the kept entity and
 * writes a reversible merge_decisions row. SPVs are NOT collapsed into their
 * backers — only same-org duplicates are merged.
 */

export interface ResolveStats {
  autoMergedStrongKey: number;
  autoMergedSimilarity: number;
  candidatesQueued: number;
}

const AUTO_MERGE_BAR = 0.9;
const CANDIDATE_BAR = 0.72;

async function mergeEntities(
  client: PoolClient,
  keptId: string,
  mergedId: string,
  method: string,
  score: number,
  features: Record<string, unknown>
): Promise<void> {
  // Repoint dependents; ON CONFLICT guards the unique keys we added.
  await client.query(
    `UPDATE financing_relationships SET entity_id = $1 WHERE entity_id = $2
       AND NOT EXISTS (
         SELECT 1 FROM financing_relationships k
         WHERE k.entity_id = $1 AND k.film_id = financing_relationships.film_id
           AND k.role = financing_relationships.role)`,
    [keptId, mergedId]
  );
  await client.query(`DELETE FROM financing_relationships WHERE entity_id = $1`, [mergedId]);
  await client.query(`UPDATE contacts SET entity_id = $1 WHERE entity_id = $2`, [keptId, mergedId]);
  await client.query(`UPDATE entity_aliases SET entity_id = $1 WHERE entity_id = $2`, [keptId, mergedId]);

  // Preserve the merged entity's display name as an alias of the survivor.
  await client.query(
    `INSERT INTO entity_aliases (entity_id, alias, source)
     SELECT $1, display_name, 'merge' FROM entities WHERE id = $2
     ON CONFLICT DO NOTHING`,
    [keptId, mergedId]
  );
  // Fold genre affinity forward.
  await client.query(
    `UPDATE entities SET genre_affinity = COALESCE((
       SELECT array_agg(DISTINCT g) FROM unnest(
         (SELECT genre_affinity FROM entities WHERE id = $1) ||
         (SELECT genre_affinity FROM entities WHERE id = $2)
       ) AS g), '{}'::genre_band[])
     WHERE id = $1`,
    [keptId, mergedId]
  );

  await client.query(
    `INSERT INTO merge_decisions (kept_entity_id, merged_entity_id, method, score, features, decided_by)
     VALUES ($1,$2,$3,$4,$5,'system')`,
    [keptId, mergedId, method, score, JSON.stringify(features)]
  );
  await client.query(`DELETE FROM entities WHERE id = $1`, [mergedId]);
}

/** Prefer the entity with a strong key, else more evidence, as the survivor. */
function pickSurvivor(a: EntityRow, b: EntityRow): [string, string] {
  const strong = (e: EntityRow) => (e.sec_cik ? 2 : 0) + (e.wikidata_qid ? 1 : 0);
  if (strong(a) !== strong(b)) return strong(a) > strong(b) ? [a.id, b.id] : [b.id, a.id];
  return a.id < b.id ? [a.id, b.id] : [b.id, a.id];
}

interface EntityRow {
  id: string;
  normalized_name: string;
  website_domain: string | null;
  sec_cik: string | null;
  wikidata_qid: string | null;
  parent_entity_id: string | null;
}

export async function runResolve(pool: Pool): Promise<ResolveStats> {
  const stats: ResolveStats = { autoMergedStrongKey: 0, autoMergedSimilarity: 0, candidatesQueued: 0 };

  // --- Strong key: same canonical website domain ---
  const domainDupes = await pool.query<{ ids: string[] }>(
    `SELECT array_agg(id ORDER BY id) AS ids
       FROM entities WHERE website_domain IS NOT NULL
      GROUP BY website_domain HAVING count(*) > 1`
  );
  for (const grp of domainDupes.rows) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<EntityRow>(
        `SELECT id, normalized_name, website_domain, sec_cik, wikidata_qid, parent_entity_id
           FROM entities WHERE id = ANY($1)`,
        [grp.ids]
      );
      // Fold all into one survivor.
      let survivor = rows[0]!;
      for (const other of rows.slice(1)) {
        const [keep, drop] = pickSurvivor(survivor, other);
        await mergeEntities(client, keep, drop, "strong_key:website_domain", 1, {
          domain: survivor.website_domain,
        });
        survivor = rows.find((r) => r.id === keep)!;
        stats.autoMergedStrongKey++;
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // --- Similarity: trigram name match + a shared signal ---
  // Candidate pairs, excluding those already in an SPV parent relationship.
  const pairs = await pool.query<{
    a: string;
    b: string;
    sim: number;
    shared_films: number;
    same_country: boolean;
  }>(
    `SELECT e1.id AS a, e2.id AS b,
            similarity(e1.normalized_name, e2.normalized_name) AS sim,
            (SELECT count(*) FROM financing_relationships r1
               JOIN financing_relationships r2 ON r1.film_id = r2.film_id
              WHERE r1.entity_id = e1.id AND r2.entity_id = e2.id) AS shared_films,
            (e1.country IS NOT DISTINCT FROM e2.country) AS same_country
       FROM entities e1
       JOIN entities e2 ON e1.id < e2.id
      WHERE e1.parent_entity_id IS NULL AND e2.parent_entity_id IS NULL
        AND e1.normalized_name % e2.normalized_name
        AND similarity(e1.normalized_name, e2.normalized_name) >= $1`,
    [CANDIDATE_BAR]
  );

  for (const p of pairs.rows) {
    // Score = name similarity, boosted by shared films (a strong co-signal).
    const score = Math.min(1, Number(p.sim) + (p.shared_films > 0 ? 0.15 : 0) + (p.same_country ? 0.03 : 0));
    const features = {
      sim: Number(p.sim),
      shared_films: Number(p.shared_films),
      same_country: p.same_country,
    };

    if (score >= AUTO_MERGE_BAR && p.shared_films > 0) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query<EntityRow>(
          `SELECT id, normalized_name, website_domain, sec_cik, wikidata_qid, parent_entity_id
             FROM entities WHERE id = ANY($1)`,
          [[p.a, p.b]]
        );
        if (rows.length === 2) {
          const [keep, drop] = pickSurvivor(rows[0]!, rows[1]!);
          await mergeEntities(client, keep, drop, "similarity", score, features);
          stats.autoMergedSimilarity++;
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } else {
      // Queue for human review rather than silently merging.
      const { rowCount } = await pool.query(
        `INSERT INTO resolution_candidates (entity_a, entity_b, score, features)
         VALUES ($1,$2,$3,$4) ON CONFLICT (entity_a, entity_b) DO NOTHING`,
        [p.a, p.b, score, JSON.stringify(features)]
      );
      if (rowCount) stats.candidatesQueued++;
    }
  }

  return stats;
}
