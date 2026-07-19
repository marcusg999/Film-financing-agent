/**
 * Wikidata SPARQL source (CC0 — docs/02). Structured film backbone:
 * horror/sci-fi films with production-company attachments (P272), cost
 * claims (P2130), origin country (P495).
 *
 * Fetch is injectable so tests run offline and the live fetcher can carry
 * a proxy dispatcher where the environment requires one.
 */

export const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";
export const USER_AGENT = "FilmFundingAgent/0.1 (marcusgraydev@gmail.com)";

/** Direct P136 genre → our bands. Subgenre traversal (P279*) is deferred —
 *  it multiplies query cost; note in docs/08 if coverage looks thin. */
export const GENRE_MAP: Record<string, "genre_horror" | "sci_fi"> = {
  "http://www.wikidata.org/entity/Q200092": "genre_horror",
  "http://www.wikidata.org/entity/Q471839": "sci_fi",
};

/** USD unit QID — the only budget unit we accept until currency
 *  normalization lands (docs/04: currency drift). Others stay "unknown". */
export const USD_UNIT = "http://www.wikidata.org/entity/Q4917";

/** Scope: US / UK / EU / Canada (docs/00 decision #2). QIDs for US, Canada,
 *  UK, and the EU-27. Films with no listed origin country are excluded and
 *  counted, not silently kept. */
export const COUNTRY_ALLOWLIST = new Set(
  [
    "Q30", // United States
    "Q16", // Canada
    "Q145", // United Kingdom
    "Q40","Q31","Q219","Q224","Q229","Q213","Q35","Q191","Q33","Q142",
    "Q183","Q41","Q28","Q27","Q38","Q211","Q37","Q32","Q233","Q55",
    "Q36","Q45","Q218","Q214","Q215","Q29","Q34", // EU-27 (Austria…Sweden)
  ].map((q) => `http://www.wikidata.org/entity/${q}`)
);

export function buildFilmQuery(opts: { since: string; limit: number; offset?: number }): string {
  const genreValues = Object.keys(GENRE_MAP)
    .map((iri) => `<${iri}>`)
    .join(" ");
  return `
SELECT ?film ?filmLabel ?date ?genre ?prodco ?prodcoLabel ?country ?budgetAmount ?budgetUnit WHERE {
  ?film wdt:P31 wd:Q11424 ;
        wdt:P136 ?genre ;
        wdt:P577 ?date ;
        wdt:P272 ?prodco .
  VALUES ?genre { ${genreValues} }
  FILTER(?date >= "${opts.since}T00:00:00Z"^^xsd:dateTime)
  OPTIONAL { ?film wdt:P495 ?country }
  OPTIONAL {
    ?film p:P2130/psv:P2130 ?budgetNode .
    ?budgetNode wikibase:quantityAmount ?budgetAmount ;
                wikibase:quantityUnit ?budgetUnit .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY ?film
LIMIT ${opts.limit}${opts.offset ? ` OFFSET ${opts.offset}` : ""}`;
}

interface SparqlBinding {
  type: string;
  value: string;
}
export interface SparqlResponse {
  results: { bindings: Record<string, SparqlBinding | undefined>[] };
}

export interface WikidataFilmRow {
  filmIri: string;
  filmQid: string;
  title: string;
  date: string;
  genreIri: string;
  prodcoIri: string;
  prodcoQid: string;
  prodcoName: string;
  countryIri?: string;
  budgetAmount?: string;
  budgetUnitIri?: string;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function qidOf(iri: string): string {
  return iri.slice(iri.lastIndexOf("/") + 1);
}

export function parseSparqlResponse(body: SparqlResponse): WikidataFilmRow[] {
  const rows: WikidataFilmRow[] = [];
  for (const b of body.results.bindings) {
    const film = b.film?.value;
    const prodco = b.prodco?.value;
    const genre = b.genre?.value;
    if (!film || !prodco || !genre || !b.date?.value) continue;
    rows.push({
      filmIri: film,
      filmQid: qidOf(film),
      title: b.filmLabel?.value ?? qidOf(film),
      date: b.date.value,
      genreIri: genre,
      prodcoIri: prodco,
      prodcoQid: qidOf(prodco),
      prodcoName: b.prodcoLabel?.value ?? qidOf(prodco),
      countryIri: b.country?.value,
      budgetAmount: b.budgetAmount?.value,
      budgetUnitIri: b.budgetUnit?.value,
    });
  }
  return rows;
}

export async function fetchFilmRows(
  opts: { since: string; limit: number; offset?: number },
  fetchImpl: FetchLike = fetch
): Promise<{ rows: WikidataFilmRow[]; rawBody: string }> {
  const query = buildFilmQuery(opts);
  const url = `${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(query)}`;
  const res = await fetchImpl(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/sparql-results+json",
    },
  });
  if (!res.ok) {
    throw new Error(`wikidata sparql failed: ${res.status} ${res.statusText}`);
  }
  const rawBody = await res.text();
  return { rows: parseSparqlResponse(JSON.parse(rawBody) as SparqlResponse), rawBody };
}
