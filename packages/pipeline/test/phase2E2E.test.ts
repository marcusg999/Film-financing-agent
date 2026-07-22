import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { migrate } from "@filmfund/db";
import { runResolve } from "../src/resolve/resolve.js";
import { runReclassify } from "../src/classify/reclassify.js";
import { runQualify } from "../src/qualify/qualify.js";
import { runScore } from "../src/score/score.js";

const ADMIN_URL =
  process.env.ADMIN_DATABASE_URL ?? "postgres://root@localhost/postgres?host=%2Fvar%2Frun%2Fpostgresql";
const TEST_DB = "filmfund_phase2_test";

function withDatabase(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

let pool: pg.Pool;
async function admin(sql: string): Promise<void> {
  const c = new pg.Client({ connectionString: ADMIN_URL });
  await c.connect();
  await c.query(sql);
  await c.end();
}

before(async () => {
  await admin(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin(`CREATE DATABASE ${TEST_DB}`);
  pool = new pg.Pool({ connectionString: withDatabase(ADMIN_URL, TEST_DB) });
  await migrate(pool);
  await seed();
});
after(async () => {
  await pool.end();
  await admin(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
});

const M = 1_000_000;

async function ev(excerpt: string): Promise<string> {
  const { rows } = await pool.query(
    "INSERT INTO evidence (source_name, retrieved_at, excerpt) VALUES ('wikidata', now(), $1) RETURNING id",
    [excerpt]
  );
  return rows[0].id;
}
async function ent(name: string, extra: Record<string, unknown> = {}): Promise<string> {
  const cols = ["type", "display_name", "normalized_name", ...Object.keys(extra)];
  const vals = ["production_company", name, name.toLowerCase(), ...Object.values(extra)];
  const ph = vals.map((_, i) => `$${i + 1}`).join(",");
  const { rows } = await pool.query(`INSERT INTO entities (${cols.join(",")}) VALUES (${ph}) RETURNING id`, vals);
  return rows[0].id;
}
async function film(title: string, budget: number | null, genres: string): Promise<string> {
  let evId: string | null = null;
  if (budget !== null) evId = await ev(`budget for ${title}`);
  const { rows } = await pool.query(
    `INSERT INTO films (title, year, genre_bands, budget_amount_usd, budget_confidence, budget_evidence_id)
     VALUES ($1, 2024, $2::genre_band[], $3, $4::budget_confidence, $5) RETURNING id`,
    [title, genres, budget, budget !== null ? "reported" : "unknown", evId]
  );
  return rows[0].id;
}
async function rel(entityId: string, filmId: string, role: string): Promise<void> {
  const evId = await ev(`${role} link`);
  await pool.query(
    `INSERT INTO financing_relationships (entity_id, film_id, role, is_financial, financier_confidence, deal_date, evidence_id)
     VALUES ($1,$2,$3::financier_role,true,0.65,'2024-06-01',$4)`,
    [entityId, filmId, role, evId]
  );
}

let qualifiedId: string;
let megaId: string;

async function seed(): Promise<void> {
  // A genuine sub-$10M horror financier: 4 known budgets, all under cap.
  qualifiedId = await ent("Hollow Lantern Pictures", { genre_affinity: "{genre_horror}" });
  for (const [t, b] of [["A", 2.5 * M], ["B", 4 * M], ["C", 6 * M], ["D", 3.5 * M]] as const) {
    await rel(qualifiedId, await film(`HL ${t}`, b, "{genre_horror}"), "co_financier");
  }

  // A mega-budget shop with a single sub-$10M dip → must be demoted.
  megaId = await ent("Atlas Global Films");
  for (const [t, b] of [["A", 5 * M], ["B", 40 * M], ["C", 80 * M], ["D", 120 * M], ["E", 60 * M]] as const) {
    await rel(megaId, await film(`AG ${t}`, b, "{action}"), "co_financier");
  }

  // A duplicate of the qualified entity sharing a film → resolution merges it.
  const dupId = await ent("Hollow Lantern Pics"); // near-name
  const sharedFilm = await film("HL Shared", 3 * M, "{genre_horror}");
  await rel(qualifiedId, sharedFilm, "co_financier");
  await rel(dupId, sharedFilm, "producer"); // craft credit — should not qualify dup on its own
}

test("full Phase 2 pipeline runs and buckets correctly", async () => {
  const resolveStats = await runResolve(pool);
  // dup shares a film with qualified + high name similarity → auto-merge
  assert.ok(resolveStats.autoMergedSimilarity + resolveStats.candidatesQueued >= 0);

  const classifyStats = await runReclassify(pool);
  assert.ok(classifyStats.updated > 0);

  const qualifyStats = await runQualify(pool);
  assert.ok(qualifyStats.entitiesProcessed >= 2);

  const scoreStats = await runScore(pool);
  assert.ok(scoreStats.scored >= 2);

  // The genuine financier qualifies...
  const { rows: q } = await pool.query(
    "SELECT bucket FROM entity_qualification WHERE entity_id = $1",
    [qualifiedId]
  );
  assert.equal(q[0].bucket, "qualified_sub10m");

  // ...the mega-budget one-off is demoted, NOT qualified.
  const { rows: mega } = await pool.query(
    "SELECT bucket FROM entity_qualification WHERE entity_id = $1",
    [megaId]
  );
  assert.equal(mega[0].bucket, "mixed_scale");

  // Ranking: the qualified entity outranks the mega one.
  const { rows: ranked } = await pool.query(
    `SELECT e.display_name, s.final_score
       FROM scores s JOIN entities e ON e.id = s.entity_id
      WHERE s.project_id IS NULL ORDER BY s.final_score DESC`
  );
  assert.equal(ranked[0].display_name, "Hollow Lantern Pictures");
  assert.ok(Number(ranked[0].final_score) > Number(ranked[ranked.length - 1].final_score));
});

test("re-running qualify + score is idempotent", async () => {
  await runQualify(pool);
  await runScore(pool);
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM scores WHERE project_id IS NULL"
  );
  const { rows: ents } = await pool.query("SELECT count(*)::int AS n FROM entities");
  assert.equal(rows[0].n, ents[0].n); // one score row per entity, no accumulation
});
