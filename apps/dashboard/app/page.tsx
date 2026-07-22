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

interface RankedRow {
  entity_id: string;
  display_name: string;
  entity_type: string;
  bucket: string | null;
  deal_count: string;
  last_deal: string;
  last_deal_estimated: boolean;
  final_score: string | null;
  has_verified_contact: boolean;
}

const label: React.CSSProperties = {
  fontFamily: "Helvetica Neue, Arial, sans-serif",
  fontSize: 12,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#e9a23b",
};

const BUCKETS: Record<string, { text: string; bg: string; label: string }> = {
  qualified_sub10m: { text: "#0a0d13", bg: "#5bc98a", label: "Qualified ≤$10M" },
  insufficient_data: { text: "#c9cdd4", bg: "rgba(230,235,245,0.10)", label: "Insufficient data" },
  mixed_scale: { text: "#e9a23b", bg: "rgba(233,162,59,0.14)", label: "Mixed scale" },
  out_of_band: { text: "#e08a7d", bg: "rgba(224,138,125,0.14)", label: "Above $10M band" },
};

function Bucket({ b }: { b: string | null }) {
  const s = BUCKETS[b ?? "insufficient_data"] ?? BUCKETS.insufficient_data;
  return (
    <span
      style={{
        fontFamily: "Helvetica Neue, Arial, sans-serif",
        fontSize: 11,
        fontWeight: 700,
        padding: "3px 9px",
        borderRadius: 999,
        color: s.text,
        background: s.bg,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

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
    // Genre financiers joined with qualification bucket + rank + contactability.
    // Ordered so qualified entities lead, then by score — the bucket is a gate,
    // never hidden.
    pool.query<RankedRow>(
      `SELECT g.entity_id, g.display_name, g.entity_type,
              q.bucket, g.deal_count::text, g.last_deal, g.last_deal_estimated,
              s.final_score::text,
              EXISTS (SELECT 1 FROM usable_contacts uc WHERE uc.entity_id = g.entity_id) AS has_verified_contact
         FROM recent_genre_financiers($1, $2) g
         LEFT JOIN entity_qualification q ON q.entity_id = g.entity_id
         LEFT JOIN scores s ON s.entity_id = g.entity_id AND s.project_id IS NULL
        ORDER BY (q.bucket = 'qualified_sub10m') DESC NULLS LAST,
                 s.final_score DESC NULLS LAST,
                 g.last_deal DESC`,
      [genre, since]
    ),
    pool.query<{ entities: string; qualified: string; relationships: string }>(
      `SELECT
         (SELECT count(*) FROM entities) AS entities,
         (SELECT count(*) FROM entity_qualification WHERE bucket = 'qualified_sub10m') AS qualified,
         (SELECT count(*) FROM financing_relationships) AS relationships`
    ),
  ]);
  const c = counts[0];

  return (
    <>
      <p style={label}>Film Funding Agent · genre financiers</p>
      <h1 style={{ fontFamily: "Helvetica Neue, Arial, sans-serif", letterSpacing: "-0.02em" }}>
        Recent financiers of {genre.replace(/_/g, " ")}
      </h1>
      <p style={{ color: "#9aa3b2" }}>
        {c?.entities ?? 0} entities · {c?.qualified ?? 0} qualified ≤$10M · {c?.relationships ?? 0}{" "}
        financing relationships. Money-classified only (τ ≥ 0.6); deals since {since}. This lists the{" "}
        <em>visible</em> financing world — never a complete one. Buckets are honest: only{" "}
        <strong>Qualified ≤$10M</strong> is a confirmed sub-$10M financier.
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
          No financiers for this genre/window yet. Run the backfill (docs/12) then{" "}
          <code>npm run qualify</code>.
        </p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Entity", "Bucket", "Deals", "Last deal", "Contact"].map((h) => (
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
                  <span style={{ color: "#6a7484", fontSize: 13 }}> · {f.entity_type.replace(/_/g, " ")}</span>
                </td>
                <td style={{ padding: "12px 8px", borderBottom: "1px solid rgba(230,235,245,0.06)" }}>
                  <Bucket b={f.bucket} />
                </td>
                <td style={{ padding: "12px 8px", borderBottom: "1px solid rgba(230,235,245,0.06)" }}>
                  {f.deal_count}
                </td>
                <td style={{ padding: "12px 8px", borderBottom: "1px solid rgba(230,235,245,0.06)" }}>
                  {new Date(f.last_deal).toISOString().slice(0, 10)}
                  {f.last_deal_estimated ? (
                    <span style={{ color: "#6a7484", fontSize: 12 }}> (est.)</span>
                  ) : null}
                </td>
                <td style={{ padding: "12px 8px", borderBottom: "1px solid rgba(230,235,245,0.06)", color: f.has_verified_contact ? "#5bc98a" : "#6a7484" }}>
                  {f.has_verified_contact ? "verified" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
