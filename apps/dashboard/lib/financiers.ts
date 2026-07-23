/**
 * Builds the parameterized financier-directory query from a set of filters.
 * Kept as a pure function so the filter semantics are testable independently
 * of Next. Every filter is optional; omitted filters widen the result.
 */

export interface FinancierFilters {
  type?: string; // entity_type
  provides?: string; // financier_role in funding_types
  genre?: string; // genre_band in genre_affinity (institutional bodies always match)
  country?: string; // ISO-2
  bucket?: string; // qualification bucket
  warm?: string; // "1" | "3" | "5" — active within N years
  contactable?: string; // "1" — has a verified contact
}

const ENTITY_TYPES = new Set([
  "individual", "fund", "production_company", "distributor", "sales_agent",
  "gap_lender", "tax_credit_broker", "soft_money_body", "grant_body",
  "crowdfunding_platform", "crowdfunding_backer", "unknown",
]);
const ROLES = new Set([
  "equity", "executive_producer", "producer", "co_financier", "gap_loan",
  "mg_advance", "presale", "grant", "tax_credit", "crowdfunding", "unknown",
]);
const GENRES = new Set([
  "genre_horror", "thriller", "sci_fi", "prestige_drama", "comedy", "doc",
  "action", "family", "other",
]);
const BUCKETS = new Set(["qualified_sub10m", "insufficient_data", "mixed_scale", "out_of_band"]);

export function buildFinancierQuery(f: FinancierFilters): { text: string; values: unknown[] } {
  const cond: string[] = [];
  const vals: unknown[] = [];
  const p = (v: unknown) => {
    vals.push(v);
    return `$${vals.length}`;
  };

  // Validate against known enum values so a bad querystring can't inject or error.
  if (f.type && ENTITY_TYPES.has(f.type)) cond.push(`e.type = ${p(f.type)}::entity_type`);
  if (f.provides && ROLES.has(f.provides)) cond.push(`${p(f.provides)}::financier_role = ANY(e.funding_types)`);
  if (f.genre && GENRES.has(f.genre)) {
    // Genre-tagged financiers match by tag; institutional bodies match too, but
    // only the genre-agnostic ones (a sci-fi-specific grant shouldn't appear
    // under a horror filter).
    cond.push(
      `(${p(f.genre)} = ANY(e.genre_affinity::text[]) OR (e.type IN ('soft_money_body','grant_body','tax_credit_broker') AND array_length(e.genre_affinity, 1) IS NULL))`
    );
  }
  if (f.country && /^[A-Z]{2}$/.test(f.country)) cond.push(`e.country = ${p(f.country)}`);
  if (f.bucket && BUCKETS.has(f.bucket)) cond.push(`q.bucket = ${p(f.bucket)}`);
  if (f.warm && ["1", "3", "5"].includes(f.warm)) {
    cond.push(`e.is_active_signal >= (CURRENT_DATE - make_interval(years => ${p(Number(f.warm))}))`);
  }
  if (f.contactable === "1") {
    cond.push(`EXISTS (SELECT 1 FROM usable_contacts uc WHERE uc.entity_id = e.id)`);
  }

  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  const text = `
    SELECT e.id, e.display_name, e.type, e.country,
           e.genre_affinity::text[]  AS genre_affinity,
           e.funding_types::text[]   AS funding_types,
           e.is_active_signal::text  AS is_active_signal,
           q.bucket,
           s.final_score::text       AS final_score,
           EXISTS (SELECT 1 FROM usable_contacts uc WHERE uc.entity_id = e.id) AS contactable
      FROM entities e
      LEFT JOIN entity_qualification q ON q.entity_id = e.id
      LEFT JOIN scores s ON s.entity_id = e.id AND s.project_id IS NULL
      ${where}
      ORDER BY (q.bucket = 'qualified_sub10m') DESC NULLS LAST,
               s.final_score DESC NULLS LAST,
               e.display_name
      LIMIT 500`;
  return { text, values: vals };
}
