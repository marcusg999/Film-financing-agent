import type { Pool } from "@filmfund/db";
import type { Classifier } from "./classifier.js";
import { getClassifier } from "./claude.js";

/**
 * Re-scores financing_relationships with the money-vs-craft classifier.
 * Reads each relationship's role + evidence excerpt, writes back
 * is_financial / financier_confidence / classification_method.
 *
 * Rule-classified ingest signals (e.g. rule:wikidata_p272) are left as-is
 * unless `includeRuleClassified` is set — the LLM pass is where you'd flip
 * that on once the key exists, to re-judge borderline co-financier calls.
 */

export interface ReclassifyStats {
  method: string;
  considered: number;
  updated: number;
  toUnknown: number;
}

export async function runReclassify(
  pool: Pool,
  opts: { classifier?: Classifier; includeRuleClassified?: boolean; limit?: number } = {}
): Promise<ReclassifyStats> {
  const classifier = opts.classifier ?? getClassifier();
  const includeRule = opts.includeRuleClassified ?? false;

  const { rows } = await pool.query<{
    id: string;
    role: string;
    classification_method: string | null;
    excerpt: string | null;
  }>(
    `SELECT fr.id, fr.role, fr.classification_method, e.excerpt
       FROM financing_relationships fr
       LEFT JOIN evidence e ON e.id = fr.evidence_id
      WHERE ($1 OR fr.classification_method IS NULL OR fr.classification_method NOT LIKE 'rule:wikidata%')
      ${opts.limit ? "LIMIT " + Number(opts.limit) : ""}`,
    [includeRule]
  );

  const stats: ReclassifyStats = { method: classifier.method, considered: rows.length, updated: 0, toUnknown: 0 };

  for (const r of rows) {
    const result = await classifier.classify({
      role: r.role,
      excerpt: r.excerpt,
      classificationMethod: r.classification_method,
    });
    if (result.isFinancial === null) stats.toUnknown++;
    await pool.query(
      `UPDATE financing_relationships
          SET is_financial = $2,
              financier_confidence = $3,
              classification_method = $4,
              updated_at = now()
        WHERE id = $1`,
      [r.id, result.isFinancial, result.confidence, result.method]
    );
    stats.updated++;
  }
  return stats;
}
