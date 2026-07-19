import { getPool } from "../lib/db";

export const dynamic = "force-dynamic";

const GENRES = [
  "genre_horror",
  "thriller",
  "sci_fi",
  "prestige_drama",
  "comedy",
  "doc",
  "action",
  "family",
  "other",
] as const;

interface FinancierRow {
  entity_id: string;
  display_name: string;
  entity_type: string;
  deal_count: string;
  last_deal: string;
  last_deal_estimated: boolean;
}

const label: React.CSSProperties = {
  fontFamily: "Helvetica Neue, Arial, sans-serif",
  fontSize: 12,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#e9a23b",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string; since?: string }>;
}) {
  const params = await searchParams;
  const genre = GENRES.includes(params.genre as (typeof GENRES)[number])
    ? (params.genre as (typeof GENRES)[number])
    : "genre_horror";
  const since = /^\d{4}-\d{2}-\d{2}$/.test(params.since ?? "") ? params.since! : "2016-01-01";

  const pool = getPool();
  const [{ rows: financiers }, { rows: counts }] = await Promise.all([
    pool.query<FinancierRow>("SELECT * FROM recent_genre_financiers($1, $2)", [genre, since]),
    pool.query<{ entities: string; films: string; relationships: string }>(
      `SELECT
         (SELECT count(*) FROM entities)                AS entities,
         (SELECT count(*) FROM films)                   AS films,
         (SELECT count(*) FROM financing_relationships) AS relationships`
    ),
  ]);
  const c = counts[0];

  return (
    <>
      <p style={label}>Film Funding Agent · Phase 0 skeleton</p>
      <h1 style={{ fontFamily: "Helvetica Neue, Arial, sans-serif", letterSpacing: "-0.02em" }}>
        Recent financiers of {genre.replace(/_/g, " ")}
      </h1>
      <p style={{ color: "#9aa3b2" }}>
        {c?.entities ?? 0} entities · {c?.films ?? 0} films · {c?.relationships ?? 0} financing
        relationships in the corpus. Money-classified relationships only (τ ≥ 0.6); deals since{" "}
        {since}. Lists the <em>visible</em> financing world — coverage is never complete.
      </p>
      <nav style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "18px 0 28px" }}>
        {GENRES.map((g) => (
          <a
            key={g}
            href={`/?genre=${g}&since=${since}`}
            style={{
              ...label,
              color: g === genre ? "#0a0d13" : "#e9a23b",
              background: g === genre ? "#e9a23b" : "transparent",
              border: "1px solid #e9a23b",
              borderRadius: 999,
              padding: "5px 12px",
              textDecoration: "none",
            }}
          >
            {g.replace(/_/g, " ")}
          </a>
        ))}
      </nav>
      {financiers.length === 0 ? (
        <p style={{ color: "#6a7484" }}>
          No qualifying financiers for this genre/window yet — the corpus fills in Phase 1
          (SEC EDGAR + Wikidata ingestion).
        </p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Entity", "Type", "Deals", "Last deal"].map((h) => (
                <th
                  key={h}
                  style={{
                    ...label,
                    color: "#6a7484",
                    textAlign: "left",
                    padding: "10px 8px",
                    borderBottom: "1px solid rgba(230,235,245,0.13)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {financiers.map((f) => (
              <tr key={f.entity_id}>
                <td style={{ padding: "12px 8px", borderBottom: "1px solid rgba(230,235,245,0.06)" }}>
                  {f.display_name}
                </td>
                <td style={{ padding: "12px 8px", borderBottom: "1px solid rgba(230,235,245,0.06)", color: "#9aa3b2" }}>
                  {f.entity_type.replace(/_/g, " ")}
                </td>
                <td style={{ padding: "12px 8px", borderBottom: "1px solid rgba(230,235,245,0.06)" }}>
                  {f.deal_count}
                </td>
                <td style={{ padding: "12px 8px", borderBottom: "1px solid rgba(230,235,245,0.06)" }}>
                  {new Date(f.last_deal).toISOString().slice(0, 10)}
                  {f.last_deal_estimated ? " (estimated)" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
