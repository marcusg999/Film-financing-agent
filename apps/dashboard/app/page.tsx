import { getPool } from "../lib/db";
import { buildFinancierQuery, type FinancierFilters } from "../lib/financiers";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  display_name: string;
  type: string;
  country: string | null;
  genre_affinity: string[];
  funding_types: string[];
  is_active_signal: string | null;
  bucket: string | null;
  final_score: string | null;
  contactable: boolean;
}

const sans = "Helvetica Neue, Arial, sans-serif";
const label: React.CSSProperties = { fontFamily: sans, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#e9a23b" };
const th: React.CSSProperties = { ...label, color: "#6a7484", textAlign: "left", padding: "10px 8px", borderBottom: "1px solid rgba(230,235,245,0.13)" };
const td: React.CSSProperties = { padding: "11px 8px", borderBottom: "1px solid rgba(230,235,245,0.06)", verticalAlign: "top" };
const chip = (c?: React.CSSProperties): React.CSSProperties => ({ fontFamily: sans, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(230,235,245,0.18)", color: "#9aa3b2", marginRight: 5, whiteSpace: "nowrap", ...c });
const selectStyle: React.CSSProperties = { fontFamily: sans, fontSize: 12, background: "#12161f", color: "#e7e9ed", border: "1px solid rgba(230,235,245,0.18)", borderRadius: 8, padding: "7px 9px" };

const BUCKETS: Record<string, { text: string; bg: string; label: string }> = {
  qualified_sub10m: { text: "#0a0d13", bg: "#5bc98a", label: "Qualified ≤$10M" },
  insufficient_data: { text: "#c9cdd4", bg: "rgba(230,235,245,0.10)", label: "Insufficient data" },
  mixed_scale: { text: "#e9a23b", bg: "rgba(233,162,59,0.14)", label: "Mixed scale" },
  out_of_band: { text: "#e08a7d", bg: "rgba(224,138,125,0.14)", label: "Above band" },
};

function Select({ name, value, options, any }: { name: string; value: string; options: [string, string][]; any: string }) {
  return (
    <select name={name} defaultValue={value} style={selectStyle}>
      <option value="">{any}</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const filters: FinancierFilters = {
    type: sp.type, provides: sp.provides, genre: sp.genre, country: sp.country,
    bucket: sp.bucket, warm: sp.warm, contactable: sp.contactable,
  };
  const { text, values } = buildFinancierQuery(filters);

  const pool = getPool();
  const [{ rows }, { rows: counts }, { rows: countries }] = await Promise.all([
    pool.query<Row>(text, values),
    pool.query<{ total: string; qualified: string; contactable: string }>(
      `SELECT (SELECT count(*) FROM entities) AS total,
              (SELECT count(*) FROM entity_qualification WHERE bucket='qualified_sub10m') AS qualified,
              (SELECT count(*) FROM usable_contacts) AS contactable`
    ),
    pool.query<{ country: string }>(
      `SELECT DISTINCT country FROM entities WHERE country IS NOT NULL ORDER BY country`
    ),
  ]);
  const c = counts[0];

  return (
    <>
      <p style={label}>
        Film Funding Agent · financiers ·{" "}
        <a href="/bodies" style={{ color: "#e9a23b", textDecoration: "none" }}>Funding bodies →</a>
      </p>
      <h1 style={{ fontFamily: sans, letterSpacing: "-0.02em" }}>Financiers</h1>
      <p style={{ color: "#9aa3b2" }}>
        {c?.total ?? 0} entities · {c?.qualified ?? 0} qualified ≤$10M · {c?.contactable ?? 0} with a
        verified contact. Filter to organize; only <strong>Qualified ≤$10M</strong> is a confirmed
        sub-$10M financier. Coverage is never complete.
      </p>

      <form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "18px 0 26px" }}>
        <Select name="type" value={sp.type ?? ""} any="Any type" options={[
          ["production_company", "Production company"], ["fund", "Fund"], ["sales_agent", "Sales agent"],
          ["distributor", "Distributor"], ["soft_money_body", "Soft money"], ["grant_body", "Grant body"],
          ["tax_credit_broker", "Tax credit"], ["gap_lender", "Gap lender"], ["individual", "Individual"],
          ["crowdfunding_platform", "Crowdfunding platform"],
        ]} />
        <Select name="provides" value={sp.provides ?? ""} any="Provides…" options={[
          ["equity", "Equity"], ["grant", "Grant"], ["tax_credit", "Tax credit"], ["mg_advance", "MG advance"],
          ["presale", "Presale"], ["gap_loan", "Gap loan"], ["co_financier", "Co-finance"],
        ]} />
        <Select name="genre" value={sp.genre ?? ""} any="Any genre" options={[
          ["genre_horror", "Horror"], ["sci_fi", "Sci-fi"], ["thriller", "Thriller"],
          ["prestige_drama", "Prestige drama"], ["doc", "Documentary"],
        ]} />
        <Select name="country" value={sp.country ?? ""} any="Any region" options={countries.map((r) => [r.country, r.country])} />
        <Select name="bucket" value={sp.bucket ?? ""} any="Any status" options={[
          ["qualified_sub10m", "Qualified ≤$10M"], ["insufficient_data", "Insufficient data"],
          ["mixed_scale", "Mixed scale"], ["out_of_band", "Above band"],
        ]} />
        <Select name="warm" value={sp.warm ?? ""} any="Any time" options={[["1", "Active ≤1y"], ["3", "Active ≤3y"], ["5", "Active ≤5y"]]} />
        <label style={{ fontFamily: sans, fontSize: 12, color: "#9aa3b2", display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" name="contactable" value="1" defaultChecked={sp.contactable === "1"} /> Contactable
        </label>
        <button type="submit" style={{ ...selectStyle, background: "#e9a23b", color: "#0a0d13", fontWeight: 700, cursor: "pointer" }}>Apply</button>
        <a href="/" style={{ fontFamily: sans, fontSize: 12, color: "#6a7484", textDecoration: "none" }}>Clear</a>
      </form>

      <p style={{ ...label, color: "#6a7484", marginBottom: 8 }}>{rows.length} result{rows.length === 1 ? "" : "s"}{rows.length === 500 ? " (capped)" : ""}</p>
      {rows.length === 0 ? (
        <p style={{ color: "#6a7484" }}>No financiers match. Widen the filters, or run the ingest + <code>npm run qualify</code>.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Financier", "Type", "Region", "Provides", "Genre", "Status", "Contact"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => {
              const b = BUCKETS[r.bucket ?? ""] ?? null;
              return (
                <tr key={r.id}>
                  <td style={td}>{r.display_name}</td>
                  <td style={{ ...td, color: "#9aa3b2" }}>{r.type.replace(/_/g, " ")}</td>
                  <td style={{ ...td, color: "#9aa3b2" }}>{r.country ?? "—"}</td>
                  <td style={td}>{r.funding_types.length ? r.funding_types.map((f) => <span key={f} style={chip()}>{f.replace(/_/g, " ")}</span>) : <span style={{ color: "#6a7484" }}>—</span>}</td>
                  <td style={td}>{r.genre_affinity.length ? r.genre_affinity.map((g) => <span key={g} style={chip({ color: "#e9a23b", borderColor: "rgba(233,162,59,0.4)" })}>{g.replace(/_/g, " ")}</span>) : <span style={{ color: "#6a7484", fontSize: 12 }}>—</span>}</td>
                  <td style={td}>{b ? <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, color: b.text, background: b.bg, whiteSpace: "nowrap" }}>{b.label}</span> : <span style={{ color: "#6a7484" }}>—</span>}</td>
                  <td style={{ ...td, color: r.contactable ? "#5bc98a" : "#6a7484" }}>{r.contactable ? "verified" : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
