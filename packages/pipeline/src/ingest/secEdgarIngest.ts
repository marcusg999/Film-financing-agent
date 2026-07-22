import { createHash } from "node:crypto";
import type { Pool } from "@filmfund/db";
import { assertSourcePermitted } from "../sourceGate.js";
import {
  searchFilmFormC,
  fetchFormCDetails,
  type FetchLike,
} from "../sources/secEdgar.js";

/**
 * SEC EDGAR Form C ingest (docs/07 Phase 1). What a Form C proves is that
 * the ISSUER ran a regulated raise via a FUNDING PORTAL — hard evidence of
 * financing activity. What it does NOT prove yet is which film (that lives
 * in the narrative attachments and needs the Claude extraction pass), so
 * this stage deliberately creates:
 *   - issuer entity  (production_company / SPV, sec_cik strong key)
 *   - portal entity  (crowdfunding_platform)
 *   - evidence rows + raw document
 * and NO film or financing_relationship rows — those land when the
 * classifier can ground the film linkage. Recall over precision on the
 * film-term search; the classifier prunes non-film issuers later.
 */

export interface SecIngestStats {
  filingsFound: number;
  filingsIngested: number;
  issuersUpserted: number;
  portalsUpserted: number;
  skippedAlreadyIngested: number;
  fetchErrors: number;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export async function runIngestSecEdgar(
  pool: Pool,
  opts: { from?: string; to?: string; maxFilings?: number; fetchImpl?: FetchLike } = {}
): Promise<SecIngestStats> {
  await assertSourcePermitted(pool, "sec_edgar");

  const filings = await searchFilmFormC({ from: opts.from, to: opts.to }, opts.fetchImpl);
  const stats: SecIngestStats = {
    filingsFound: filings.length,
    filingsIngested: 0,
    issuersUpserted: 0,
    portalsUpserted: 0,
    skippedAlreadyIngested: 0,
    fetchErrors: 0,
  };

  const max = opts.maxFilings ?? filings.length;
  for (const filing of filings.slice(0, max)) {
    // Dedupe by accession before spending a fetch on the filing body.
    const { rowCount } = await pool.query(
      `SELECT 1 FROM raw_documents WHERE source_name = 'sec_edgar' AND content_hash = $1`,
      [sha256(`accession:${filing.accession}`)]
    );
    if (rowCount) {
      stats.skippedAlreadyIngested++;
      continue;
    }

    let details, rawBody;
    try {
      ({ details, rawBody } = await fetchFormCDetails(filing, opts.fetchImpl));
    } catch {
      stats.fetchErrors++;
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO raw_documents (source_name, url, fetched_via, robots_ok, tos_verdict, content_hash, retrieved_at)
         VALUES ('sec_edgar', $1, 'sec_api', true, 'permitted', $2, now())
         ON CONFLICT (source_name, content_hash) DO NOTHING`,
        [filing.filingUrl, sha256(`accession:${filing.accession}`)]
      );

      const issuerName = details.issuerName ?? filing.issuerName;
      const evidenceRes = await client.query<{ id: string }>(
        `INSERT INTO evidence (source_name, source_license, url, retrieved_at, excerpt, content_hash)
         VALUES ('sec_edgar', 'public', $1, now(), $2, $3)
         ON CONFLICT (source_name, content_hash) WHERE content_hash IS NOT NULL DO UPDATE SET retrieved_at = now()
         RETURNING id`,
        [
          filing.filingUrl,
          `Form C ${filing.accession} filed ${filing.fileDate}: issuer ${issuerName}` +
            (details.portalName ? ` via funding portal ${details.portalName}` : "") +
            (details.offeringAmount ? `, offering amount $${details.offeringAmount}` : "") +
            ` — film linkage pending classifier pass`,
          sha256(`formc:${filing.accession}`),
        ]
      );
      const evidenceId = evidenceRes.rows[0]!.id;

      // Issuer: the raise vehicle (often a per-film SPV — surfaced, labeled).
      await client.query(
        `INSERT INTO entities (type, display_name, normalized_name, sec_cik, country, website_domain, funding_types, is_active_signal)
         VALUES ('production_company', $1, lower($1), $2, 'US', $3, '{crowdfunding}', $4)
         ON CONFLICT (sec_cik) WHERE sec_cik IS NOT NULL DO UPDATE SET
           display_name = EXCLUDED.display_name,
           normalized_name = EXCLUDED.normalized_name,
           website_domain = COALESCE(EXCLUDED.website_domain, entities.website_domain),
           is_active_signal = GREATEST(entities.is_active_signal, EXCLUDED.is_active_signal)`,
        [
          issuerName,
          filing.cik,
          details.issuerWebsite?.replace(/^https?:\/\//, "").replace(/\/.*$/, "") ?? null,
          filing.fileDate,
        ]
      );
      stats.issuersUpserted++;

      // Funding portal: a place filmmakers can actually raise — a funding
      // source in its own right (docs/00 scope includes crowdfunding).
      if (details.portalName && details.portalCik) {
        await client.query(
          `INSERT INTO entities (type, display_name, normalized_name, sec_cik, country, funding_types, is_active_signal)
           VALUES ('crowdfunding_platform', $1, lower($1), $2, 'US', '{crowdfunding}', $3)
           ON CONFLICT (sec_cik) WHERE sec_cik IS NOT NULL DO UPDATE SET
             is_active_signal = GREATEST(entities.is_active_signal, EXCLUDED.is_active_signal)`,
          [details.portalName, details.portalCik, filing.fileDate]
        );
        stats.portalsUpserted++;
      }

      // Alias trail: FTS display name vs XML issuer name feed resolution.
      if (details.issuerName && details.issuerName !== filing.issuerName) {
        await client.query(
          `INSERT INTO entity_aliases (entity_id, alias, source, evidence_id)
           SELECT id, $1, 'sec_edgar', $2 FROM entities WHERE sec_cik = $3
           ON CONFLICT DO NOTHING`,
          [filing.issuerName, evidenceId, filing.cik]
        );
      }

      await client.query("COMMIT");
      stats.filingsIngested++;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  return stats;
}
