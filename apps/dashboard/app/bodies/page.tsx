import { getPool } from "../../lib/db";

export const dynamic = "force-dynamic";

interface BodyRow {
  id: string;
  display_name: string;
  type: string;
  country: string | null;
  genre_affinity: string[];
  funding_types: string[];
  website_domain: string | null;
}

const label: React.CSSProperties = {
  fontFamily: "Helvetica Neue, Arial, sans-serif",
  fontSize: 12,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#e9a23b",
};

const chip = (extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "Helvetica Neue, Arial, sans-serif",
  fontSize: 11,
  fontWeight: 600,
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid rgba(230,235,245,0.18)",
  color: "#9aa3b2",
  marginRight: 6,
  whiteSpace: "nowrap",
  ...extra,
});

export default async function Bodies({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string; country?: string }>;
}) {
  const params = await searchParams;
  const genre = /^[a-z_]+$/.test(params.genre ?? "") ? params.genre! : "";
  const country = /^[A-Z]{2}$/.test(params.country ?? "") ? params.country! : "";

  const pool = getPool();
  // Curated funders are the entities with funding_types populated (Wikidata
  // prodcos have none). Genre filter includes genre-agnostic bodies (empty
  // genre_affinity), since national funds back every genre.
  const { rows } = await pool.query<BodyRow>(
    `SELECT id, display_name, type, country,
            genre_affinity::text[] AS genre_affinity,
            funding_types::text[] AS funding_types,
            website_domain
       FROM entities
      WHERE funding_types <> '{}'
        AND ($1 = '' OR $1 = ANY(genre_affinity::text[]) OR array_length(genre_affinity, 1) IS NULL)
        AND ($2 = '' OR country = $2)
      ORDER BY country, display_name`,
    [genre, country]
  );

  const genres = ["genre_horror", "sci_fi", "thriller", "prestige_drama", "doc"];
  const countries = [...new Set(rows.map((r) => r.country).filter(Boolean))] as string[];

  return (
    <>
      <p style={label}>
        <a href="/" style={{ color: "#e9a23b", textDecoration: "none" }}>← Financiers</a> · Funding bodies
      </p>
      <h1 style={{ fontFamily: "Helvetica Neue, Arial, sans-serif", letterSpacing: "-0.02em" }}>
        Funding bodies &amp; mandates
      </h1>
      <p style={{ color: "#9aa3b2" }}>
        {rows.length} institutional funders — national film bodies, soft money, grants, tax-credit
        offices, and genre financiers (US / UK / EU / Canada). A curated Pareto seed; each row links
        to its official site. Genre filter also shows genre-agnostic bodies, since national funds
        back every genre.
      </p>

      <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0 8px" }}>
        <a href="/bodies" style={{ ...label, color: genre === "" ? "#0a0d13" : "#e9a23b", background: genre === "" ? "#e9a23b" : "transparent", border: "1px solid #e9a23b", borderRadius: 999, padding: "5px 12px", textDecoration: "none" }}>All genres</a>
        {genres.map((g) => (
          <a key={g} href={`/bodies?genre=${g}${country ? `&country=${country}` : ""}`} style={{ ...label, color: g === genre ? "#0a0d13" : "#e9a23b", background: g === genre ? "#e9a23b" : "transparent", border: "1px solid #e9a23b", borderRadius: 999, padding: "5px 12px", textDecoration: "none" }}>{g.replace(/_/g, " ")}</a>
        ))}
      </nav>
      <nav style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "0 0 24px" }}>
        <a href={`/bodies${genre ? `?genre=${genre}` : ""}`} style={chip(country === "" ? { color: "#e7e9ed", borderColor: "#e9a23b" } : {})}>All regions</a>
        {countries.map((c) => (
          <a key={c} href={`/bodies?country=${c}${genre ? `&genre=${genre}` : ""}`} style={{ ...chip(c === country ? { color: "#e7e9ed", borderColor: "#e9a23b" } : {}), textDecoration: "none" }}>{c}</a>
        ))}
      </nav>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Body", "Type", "Region", "Provides", "Genre focus", "Site"].map((h) => (
              <th key={h} style={{ ...label, color: "#6a7484", textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(230,235,245,0.13)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ padding: "11px 8px", borderBottom: "1px solid rgba(230,235,245,0.06)" }}>{r.display_name}</td>
              <td style={{ padding: "11px 8px", borderBottom: "1px solid rgba(230,235,245,0.06)", color: "#9aa3b2" }}>{r.type.replace(/_/g, " ")}</td>
              <td style={{ padding: "11px 8px", borderBottom: "1px solid rgba(230,235,245,0.06)", color: "#9aa3b2" }}>{r.country}</td>
              <td style={{ padding: "11px 8px", borderBottom: "1px solid rgba(230,235,245,0.06)" }}>
                {r.funding_types.map((f) => <span key={f} style={chip()}>{f.replace(/_/g, " ")}</span>)}
              </td>
              <td style={{ padding: "11px 8px", borderBottom: "1px solid rgba(230,235,245,0.06)" }}>
                {r.genre_affinity.length
                  ? r.genre_affinity.map((g) => <span key={g} style={chip({ color: "#e9a23b", borderColor: "rgba(233,162,59,0.4)" })}>{g.replace(/_/g, " ")}</span>)
                  : <span style={{ color: "#6a7484", fontSize: 12 }}>all genres</span>}
              </td>
              <td style={{ padding: "11px 8px", borderBottom: "1px solid rgba(230,235,245,0.06)" }}>
                {r.website_domain ? <a href={`https://${r.website_domain}`} target="_blank" rel="noreferrer" style={{ color: "#5fd0de", textDecoration: "none" }}>{r.website_domain}</a> : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
