/**
 * SEC EDGAR source (docs/02: permitted — official API, fair-access rules).
 * Two endpoints:
 *  - full-text search (efts.sec.gov) to find film-related Form C filings
 *  - Archives primary_doc.xml for the structured Form C body
 *
 * Fair access: declared User-Agent with contact, requests serialized with a
 * polite delay (SEC allows 10 req/s; we stay far under). Fetch is injectable
 * for offline tests; the live response shapes are asserted defensively and
 * may need adjustment on the first networked run (flagged in docs/08).
 */
import { XMLParser } from "fast-xml-parser";

export const FTS_ENDPOINT = "https://efts.sec.gov/LATEST/search-index";
export const ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data";
export const USER_AGENT = "FilmFundingAgent/0.1 (marcusgraydev@gmail.com)";
export const POLITE_DELAY_MS = 250;

/** Film-related query for Form C full-text search. Recall over precision —
 *  the Phase 2 classifier prunes non-film issuers that slip through. */
export const FILM_QUERY = `"film" "movie"`;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface FtsHit {
  _id: string; // "0001234567-24-000123:primary_doc.xml"
  _source: {
    ciks: string[];
    display_names: string[];
    file_date: string;
    forms: string;
  };
}
export interface FtsResponse {
  hits: { hits: FtsHit[] };
}

export interface FormCFiling {
  accession: string;
  cik: string;
  issuerName: string;
  fileDate: string;
  filingUrl: string;
}

export interface FormCDetails {
  issuerName?: string;
  issuerWebsite?: string;
  jurisdiction?: string;
  portalName?: string;
  portalCik?: string;
  offeringAmount?: string;
  deadlineDate?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function headers(): Record<string, string> {
  return { "User-Agent": USER_AGENT, Accept: "application/json" };
}

/** Strip "(CIK 0001234567)" suffixes EDGAR appends to display names. */
export function cleanDisplayName(name: string): string {
  return name.replace(/\s*\(CIK\s+\d+\)\s*$/i, "").trim();
}

export async function searchFilmFormC(
  opts: { from?: string; to?: string; page?: number },
  fetchImpl: FetchLike = fetch
): Promise<FormCFiling[]> {
  const params = new URLSearchParams({ q: FILM_QUERY, forms: "C" });
  if (opts.from && opts.to) {
    params.set("dateRange", "custom");
    params.set("startdt", opts.from);
    params.set("enddt", opts.to);
  }
  if (opts.page) params.set("from", String(opts.page * 10));
  const res = await fetchImpl(`${FTS_ENDPOINT}?${params}`, { headers: headers() });
  if (!res.ok) throw new Error(`edgar fts failed: ${res.status} ${res.statusText}`);
  const body = (await res.json()) as FtsResponse;

  const filings: FormCFiling[] = [];
  for (const hit of body.hits.hits) {
    const accession = hit._id.split(":")[0];
    const cik = hit._source.ciks[0];
    const name = hit._source.display_names[0];
    if (!accession || !cik || !name) continue;
    filings.push({
      accession,
      cik: cik.replace(/^0+/, ""),
      issuerName: cleanDisplayName(name),
      fileDate: hit._source.file_date,
      filingUrl: `${ARCHIVES_BASE}/${cik.replace(/^0+/, "")}/${accession.replace(/-/g, "")}/primary_doc.xml`,
    });
  }
  return filings;
}

const xml = new XMLParser({ ignoreAttributes: true });

export async function fetchFormCDetails(
  filing: FormCFiling,
  fetchImpl: FetchLike = fetch
): Promise<{ details: FormCDetails; rawBody: string }> {
  await sleep(POLITE_DELAY_MS);
  const res = await fetchImpl(filing.filingUrl, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/xml" },
  });
  if (!res.ok) throw new Error(`edgar archives failed: ${res.status} ${res.statusText}`);
  const rawBody = await res.text();
  const doc = xml.parse(rawBody);

  // Defensive traversal — EDGAR's Form C XML nesting varies by schema year.
  const formData = doc?.edgarSubmission?.formData ?? {};
  const issuer = formData?.issuerInformation ?? {};
  const offering = formData?.offeringInformation ?? {};
  const intermediary = formData?.intermediaryInformation ?? {};

  // The intermediary (funding portal / broker-dealer) is carried in the Form C
  // schema inside issuerInformation as `companyName` + `commissionCik`. Older /
  // alternate layouts put it in offeringInformation or a dedicated
  // intermediaryInformation block — check all three.
  const portalName =
    issuer?.companyName ?? intermediary?.companyName ?? offering?.intermediaryCompanyName;
  const portalCikRaw =
    issuer?.commissionCik ?? intermediary?.commissionCik ?? offering?.intermediaryCommissionCik;

  const details: FormCDetails = {
    issuerName: issuer?.nameOfIssuer ?? issuer?.issuerInfo?.nameOfIssuer,
    issuerWebsite: issuer?.issuerWebsite ?? issuer?.issuerInfo?.issuerWebsite,
    jurisdiction: issuer?.jurisdictionOrganization ?? issuer?.issuerInfo?.jurisdictionOrganization,
    portalName: portalName != null ? String(portalName) : undefined,
    // Strip leading zeros so a portal dedupes by CIK across all its filings.
    portalCik: portalCikRaw != null ? String(portalCikRaw).replace(/^0+/, "") || "0" : undefined,
    offeringAmount: offering?.offeringAmount != null ? String(offering.offeringAmount) : undefined,
    deadlineDate: offering?.deadlineDate,
  };
  return { details, rawBody };
}
