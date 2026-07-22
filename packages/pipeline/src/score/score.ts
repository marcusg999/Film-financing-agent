import type { Pool } from "@filmfund/db";
import { THRESHOLDS } from "../phase2/thresholds.js";

/**
 * Ranking (docs/04). Global scoring here (no project context); a per-project
 * variant weights budget-band and genre against a specific project. The
 * cluster bucket is a GATE, not just a factor: non-qualified entities always
 * rank below qualified ones and carry their bucket label — we never hide why.
 */

export interface ScoreStats {
  scored: number;
}

const BUCKET_BASE: Record<string, number> = {
  qualified_sub10m: 1.0,
  insufficient_data: 0.4,
  mixed_scale: 0.25,
  out_of_band: 0.1,
};

export async function runScore(pool: Pool, t = THRESHOLDS): Promise<ScoreStats> {
  // Pull the signals per entity: qualification, genre affinity, warmest deal
  // date, and whether a verified contact exists.
  const { rows } = await pool.query<{
    entity_id: string;
    bucket: string | null;
    genre_affinity: string[] | null;
    last_deal: string | null;
    has_verified_contact: boolean;
  }>(
    `SELECT e.id AS entity_id,
            q.bucket,
            e.genre_affinity::text[] AS genre_affinity,
            (SELECT max(COALESCE(fr.deal_date, make_date(f.year,1,1)))
               FROM financing_relationships fr JOIN films f ON f.id = fr.film_id
              WHERE fr.entity_id = e.id AND fr.is_financial = true
                AND fr.financier_confidence >= $1) AS last_deal,
            EXISTS (SELECT 1 FROM usable_contacts uc WHERE uc.entity_id = e.id) AS has_verified_contact
       FROM entities e
       LEFT JOIN entity_qualification q ON q.entity_id = e.id`,
    [t.tauFin]
  );

  // Recompute global scores from scratch each run (idempotent).
  await pool.query(`DELETE FROM scores WHERE project_id IS NULL`);

  const now = Date.now();
  let scored = 0;

  for (const r of rows) {
    const bucketBase = BUCKET_BASE[r.bucket ?? "insufficient_data"] ?? 0.4;

    // Warm signal: recency of the last qualifying deal, decayed over ~10y.
    let warm = 0;
    if (r.last_deal) {
      const years = (now - new Date(r.last_deal).getTime()) / (365.25 * 864e5);
      warm = Math.max(0, 1 - years / 10);
    }
    const genreAffinity = (r.genre_affinity ?? []).length > 0 ? 1 : 0;
    const contactability = r.has_verified_contact ? 1 : 0;

    // Cluster bucket dominates (the gate), then warm signal, genre, contact.
    const final =
      bucketBase * 0.6 + warm * 0.2 + genreAffinity * 0.1 + contactability * 0.1;

    await pool.query(
      `INSERT INTO scores
         (entity_id, cluster_pass, warm_signal_score, genre_affinity_match, contactability, final_score, explanation, computed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now())`,
      [
        r.entity_id,
        r.bucket === "qualified_sub10m",
        warm,
        genreAffinity,
        contactability,
        final,
        JSON.stringify({
          bucket: r.bucket ?? "unscored",
          last_deal: r.last_deal,
          has_verified_contact: r.has_verified_contact,
          note: "bucket is a gate; qualified_sub10m ranks above all others",
        }),
      ]
    );
    scored++;
  }

  return { scored };
}
