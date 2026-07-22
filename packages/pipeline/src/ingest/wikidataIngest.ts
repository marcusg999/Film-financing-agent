import { createHash } from "node:crypto";
import type { Pool } from "@filmfund/db";
import { assertSourcePermitted } from "../sourceGate.js";
import {
  COUNTRY_ALLOWLIST,
  GENRE_MAP,
  USD_UNIT,
  fetchFilmRows,
  type FetchLike,
  type WikidataFilmRow,
} from "../sources/wikidata.js";

/**
 * Wikidata ingest+extract (structured source, so the two stages collapse —
 * docs/01). Idempotent by wikidata_qid natural keys (migration 0003).
 *
 * Classification stance (docs/04): a production-company attachment (P272)
 * is a rule-classified co-financier signal at confidence 0.65 — just above
 * τ_fin, deliberately: in the indie band the prodco typically co-finances,
 * but this is a rule, not filing evidence, and the Claude classifier
 * re-scores these once ANTHROPIC_API_KEY is provisioned. Budgets are only
 * taken in USD (currency normalization is future work) and stored as
 * "estimated" — Wikidata cost claims are frequently unsourced.
 */

export interface IngestStats {
  rowsFetched: number;
  filmsUpserted: number;
  entitiesUpserted: number;
  relationshipsUpserted: number;
  budgetsSet: number;
  skippedNoCountry: number;
  skippedOutOfScopeCountry: number;
  skippedBudgetNonUsd: number;
}

const P272_CONFIDENCE = 0.65;
const P272_METHOD = "rule:wikidata_p272";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export async function runIngestWikidata(
  pool: Pool,
  opts: { since?: string; limit?: number; offset?: number; fetchImpl?: FetchLike } = {}
): Promise<IngestStats> {
  const since = opts.since ?? "2016-01-01";
  const limit = opts.limit ?? 1000;

  await assertSourcePermitted(pool, "wikidata");

  const { rows, rawBody } = await fetchFilmRows(
    { since, limit, offset: opts.offset },
    opts.fetchImpl
  );

  const stats: IngestStats = {
    rowsFetched: rows.length,
    filmsUpserted: 0,
    entitiesUpserted: 0,
    relationshipsUpserted: 0,
    budgetsSet: 0,
    skippedNoCountry: 0,
    skippedOutOfScopeCountry: 0,
    skippedBudgetNonUsd: 0,
  };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO raw_documents (source_name, url, fetched_via, robots_ok, tos_verdict, content_hash, retrieved_at)
       VALUES ('wikidata', $1, 'sparql', true, 'permitted', $2, now())
       ON CONFLICT (source_name, content_hash) DO NOTHING`,
      ["https://query.wikidata.org/sparql", sha256(rawBody)]
    );

    // Group multi-valued bindings (genre × country × prodco) per film.
    const films = new Map<string, WikidataFilmRow[]>();
    for (const row of rows) {
      const list = films.get(row.filmQid) ?? [];
      list.push(row);
      films.set(row.filmQid, list);
    }

    for (const [filmQid, filmRows] of films) {
      const first = filmRows[0]!;
      const countries = new Set(filmRows.map((r) => r.countryIri).filter(Boolean) as string[]);
      if (countries.size === 0) {
        stats.skippedNoCountry++;
        continue;
      }
      if (![...countries].some((c) => COUNTRY_ALLOWLIST.has(c))) {
        stats.skippedOutOfScopeCountry++;
        continue;
      }

      const genres = [...new Set(filmRows.map((r) => GENRE_MAP[r.genreIri]).filter(Boolean))];
      const year = Number(first.date.slice(0, 4));

      // Evidence for the film-level claims (one row per film per run-content).
      const filmEvidence = await client.query<{ id: string }>(
        `INSERT INTO evidence (source_name, source_license, url, retrieved_at, excerpt, content_hash)
         VALUES ('wikidata', 'CC0', $1, now(), $2, $3)
         ON CONFLICT (source_name, content_hash) WHERE content_hash IS NOT NULL DO UPDATE SET retrieved_at = now()
         RETURNING id`,
        [
          first.filmIri,
          `Wikidata claims for ${first.title} (${filmQid}): P31 film, P136 genre, P577 ${first.date.slice(0, 10)}, P272 production company`,
          sha256(`film:${filmQid}`),
        ]
      );
      const filmEvidenceId = filmEvidence.rows[0]!.id;

      // Budget: USD-only, "estimated", with its own evidence trail.
      let budgetAmount: string | null = null;
      let budgetEvidenceId: string | null = null;
      const budgetRow = filmRows.find((r) => r.budgetAmount);
      if (budgetRow?.budgetAmount) {
        if (budgetRow.budgetUnitIri === USD_UNIT) {
          const be = await client.query<{ id: string }>(
            `INSERT INTO evidence (source_name, source_license, url, retrieved_at, excerpt, content_hash)
             VALUES ('wikidata', 'CC0', $1, now(), $2, $3)
             ON CONFLICT (source_name, content_hash) WHERE content_hash IS NOT NULL DO UPDATE SET retrieved_at = now()
             RETURNING id`,
            [
              budgetRow.filmIri,
              `Wikidata P2130 cost claim: USD ${budgetRow.budgetAmount} (often unsourced upstream — held at "estimated")`,
              sha256(`budget:${filmQid}:${budgetRow.budgetAmount}`),
            ]
          );
          budgetAmount = budgetRow.budgetAmount;
          budgetEvidenceId = be.rows[0]!.id;
          stats.budgetsSet++;
        } else {
          stats.skippedBudgetNonUsd++;
        }
      }

      const filmRes = await client.query<{ id: string }>(
        `INSERT INTO films (title, year, wikidata_qid, genre_bands, budget_amount_usd, budget_currency, budget_confidence, budget_evidence_id)
         VALUES ($1, $2, $3, $4::genre_band[], $5::numeric,
                 CASE WHEN $5::numeric IS NOT NULL THEN 'USD' END,
                 CASE WHEN $5::numeric IS NOT NULL THEN 'estimated'::budget_confidence ELSE 'unknown'::budget_confidence END,
                 $6::uuid)
         ON CONFLICT (wikidata_qid) WHERE wikidata_qid IS NOT NULL DO UPDATE SET
           title = EXCLUDED.title,
           year = EXCLUDED.year,
           genre_bands = (
             SELECT array_agg(DISTINCT g) FROM unnest(films.genre_bands || EXCLUDED.genre_bands) AS g
           ),
           budget_amount_usd = COALESCE(EXCLUDED.budget_amount_usd, films.budget_amount_usd),
           budget_currency = COALESCE(EXCLUDED.budget_currency, films.budget_currency),
           budget_confidence = CASE WHEN EXCLUDED.budget_amount_usd IS NOT NULL THEN EXCLUDED.budget_confidence ELSE films.budget_confidence END,
           budget_evidence_id = COALESCE(EXCLUDED.budget_evidence_id, films.budget_evidence_id)
         RETURNING id`,
        [first.title, year, filmQid, genres, budgetAmount, budgetEvidenceId]
      );
      const filmId = filmRes.rows[0]!.id;
      stats.filmsUpserted++;

      // Production companies on this film.
      const prodcos = new Map(filmRows.map((r) => [r.prodcoQid, r]));
      for (const [prodcoQid, r] of prodcos) {
        const entRes = await client.query<{ id: string }>(
          `INSERT INTO entities (type, display_name, normalized_name, wikidata_qid, genre_affinity)
           VALUES ('production_company', $1, lower($1), $2, $3::genre_band[])
           ON CONFLICT (wikidata_qid) WHERE wikidata_qid IS NOT NULL DO UPDATE SET
             display_name = EXCLUDED.display_name,
             normalized_name = EXCLUDED.normalized_name,
             genre_affinity = (
               SELECT array_agg(DISTINCT g) FROM unnest(entities.genre_affinity || EXCLUDED.genre_affinity) AS g
             )
           RETURNING id`,
          [r.prodcoName, prodcoQid, genres]
        );
        const entityId = entRes.rows[0]!.id;
        stats.entitiesUpserted++;

        const relEvidence = await client.query<{ id: string }>(
          `INSERT INTO evidence (source_name, source_license, url, retrieved_at, excerpt, content_hash)
           VALUES ('wikidata', 'CC0', $1, now(), $2, $3)
           ON CONFLICT (source_name, content_hash) WHERE content_hash IS NOT NULL DO UPDATE SET retrieved_at = now()
           RETURNING id`,
          [
            r.filmIri,
            `Wikidata P272: ${r.prodcoName} (${prodcoQid}) is a production company of ${first.title} (${filmQid})`,
            sha256(`rel:${prodcoQid}:${filmQid}`),
          ]
        );

        await client.query(
          `INSERT INTO financing_relationships
             (entity_id, film_id, role, is_financial, financier_confidence, deal_date, deal_date_confidence, classification_method, evidence_id)
           VALUES ($1, $2, 'co_financier', true, $3, NULL, 'estimated', $4, $5)
           ON CONFLICT ON CONSTRAINT financing_relationships_entity_film_role_key DO UPDATE SET
             financier_confidence = EXCLUDED.financier_confidence,
             classification_method = EXCLUDED.classification_method,
             updated_at = now()`,
          [entityId, filmId, P272_CONFIDENCE, P272_METHOD, relEvidence.rows[0]!.id]
        );
        stats.relationshipsUpserted++;
      }
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
