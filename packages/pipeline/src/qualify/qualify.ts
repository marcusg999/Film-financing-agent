import type { Pool } from "@filmfund/db";
import { THRESHOLDS } from "../phase2/thresholds.js";
import { qualifyEntity } from "./cluster.js";

/**
 * Runs the cluster rule over every entity and writes entity_qualification.
 * "Qualifying" financed films = relationships that are is_financial AND
 * financier_confidence ≥ τ_fin (docs/04); of those, the ones whose film has
 * a known budget (reported|estimated) form K.
 */

export interface QualifyStats {
  entitiesProcessed: number;
  qualified: number;
  insufficientData: number;
  mixedScale: number;
  outOfBand: number;
}

export async function runQualify(pool: Pool, t = THRESHOLDS): Promise<QualifyStats> {
  // Per entity: budgets of known-budget qualifying films, and the total
  // qualifying financed-film count.
  const { rows } = await pool.query<{
    entity_id: string;
    known_budgets: string[] | null;
    total_qualifying: string;
  }>(
    `SELECT e.id AS entity_id,
            array_remove(array_agg(f.budget_amount_usd) FILTER (
              WHERE f.budget_amount_usd IS NOT NULL
              AND f.budget_confidence IN ('reported','estimated')
            ), NULL) AS known_budgets,
            count(DISTINCT fr.film_id) AS total_qualifying
       FROM entities e
       JOIN financing_relationships fr ON fr.entity_id = e.id
       JOIN films f ON f.id = fr.film_id
      WHERE fr.is_financial = true
        AND fr.financier_confidence >= $1
      GROUP BY e.id`,
    [t.tauFin]
  );

  const stats: QualifyStats = {
    entitiesProcessed: 0,
    qualified: 0,
    insufficientData: 0,
    mixedScale: 0,
    outOfBand: 0,
  };

  for (const row of rows) {
    const knownBudgets = (row.known_budgets ?? []).map(Number);
    // total_qualifying counts distinct films; a film can appear once, but
    // known budgets are per distinct film too — dedupe defensively.
    const result = qualifyEntity(
      { knownBudgets, totalQualifying: Number(row.total_qualifying) },
      t
    );

    await pool.query(
      `INSERT INTO entity_qualification
         (entity_id, bucket, known_budget_films, total_qualifying, known_coverage,
          median_budget_usd, frac_under_cap, max_budget_usd, evidence, computed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
       ON CONFLICT (entity_id) DO UPDATE SET
         bucket = EXCLUDED.bucket,
         known_budget_films = EXCLUDED.known_budget_films,
         total_qualifying = EXCLUDED.total_qualifying,
         known_coverage = EXCLUDED.known_coverage,
         median_budget_usd = EXCLUDED.median_budget_usd,
         frac_under_cap = EXCLUDED.frac_under_cap,
         max_budget_usd = EXCLUDED.max_budget_usd,
         evidence = EXCLUDED.evidence,
         computed_at = now()`,
      [
        row.entity_id,
        result.bucket,
        result.knownBudgetFilms,
        result.totalQualifying,
        result.knownCoverage,
        result.medianBudgetUsd,
        result.fracUnderCap,
        result.maxBudgetUsd,
        JSON.stringify({ reasons: result.reasons, thresholds: t }),
      ]
    );

    stats.entitiesProcessed++;
    if (result.bucket === "qualified_sub10m") stats.qualified++;
    else if (result.bucket === "insufficient_data") stats.insufficientData++;
    else if (result.bucket === "mixed_scale") stats.mixedScale++;
    else stats.outOfBand++;
  }

  return stats;
}
