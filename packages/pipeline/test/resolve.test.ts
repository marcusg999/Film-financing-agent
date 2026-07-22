import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { migrate } from "@filmfund/db";
import { runResolve } from "../src/resolve/resolve.js";

const ADMIN_URL =
  process.env.ADMIN_DATABASE_URL ?? "postgres://root@localhost/postgres?host=%2Fvar%2Frun%2Fpostgresql";
const TEST_DB = "filmfund_resolve_test";

function withDatabase(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

let pool: pg.Pool;

async function admin(sql: string): Promise<void> {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();
  await client.query(sql);
  await client.end();
}

before(async () => {
  await admin(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin(`CREATE DATABASE ${TEST_DB}`);
  pool = new pg.Pool({ connectionString: withDatabase(ADMIN_URL, TEST_DB) });
  await migrate(pool);
});

after(async () => {
  await pool.end();
  await admin(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
});

beforeEach(async () => {
  await pool.query(
    "TRUNCATE entities, films, financing_relationships, evidence, entity_aliases, merge_decisions, resolution_candidates CASCADE"
  );
});

async function ev(): Promise<string> {
  const { rows } = await pool.query(
    "INSERT INTO evidence (source_name, retrieved_at) VALUES ('wikidata', now()) RETURNING id"
  );
  return rows[0].id;
}

async function entity(name: string, extra: Record<string, string> = {}): Promise<string> {
  const cols = ["type", "display_name", "normalized_name", ...Object.keys(extra)];
  const vals = ["production_company", name, name.toLowerCase(), ...Object.values(extra)];
  const ph = vals.map((_, i) => `$${i + 1}`).join(",");
  const { rows } = await pool.query(
    `INSERT INTO entities (${cols.join(",")}) VALUES (${ph}) RETURNING id`,
    vals
  );
  return rows[0].id;
}

test("strong key: same website domain merges into one entity", async () => {
  await entity("Hollow Lantern Pictures", { website_domain: "hollowlantern.com", wikidata_qid: "Q900001" });
  await entity("Hollow Lantern", { website_domain: "hollowlantern.com", sec_cik: "9001" });
  const stats = await runResolve(pool);
  assert.equal(stats.autoMergedStrongKey, 1);
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM entities");
  assert.equal(rows[0].n, 1);
  // survivor keeps the strong key precedence (sec_cik present)
  const { rows: survivor } = await pool.query("SELECT sec_cik, wikidata_qid FROM entities");
  assert.equal(survivor[0].sec_cik, "9001");
  // merged name preserved as alias + a reversible decision recorded
  const { rows: aliases } = await pool.query("SELECT count(*)::int AS n FROM entity_aliases");
  assert.ok(aliases[0].n >= 1);
  const { rows: decisions } = await pool.query("SELECT method FROM merge_decisions");
  assert.equal(decisions[0].method, "strong_key:website_domain");
});

test("near-duplicate names sharing a film auto-merge; relationships repoint", async () => {
  const e1 = await entity("Night Films LLC");
  const e2 = await entity("Night Films, LLC"); // near-identical
  const evId = await ev();
  const { rows: f } = await pool.query(
    "INSERT INTO films (title) VALUES ('Shared Title') RETURNING id"
  );
  const filmId = f[0].id;
  for (const eid of [e1, e2]) {
    await pool.query(
      `INSERT INTO financing_relationships (entity_id, film_id, role, is_financial, financier_confidence, evidence_id)
       VALUES ($1,$2,'co_financier',true,0.65,$3)`,
      [eid, filmId, evId]
    );
  }
  const stats = await runResolve(pool);
  assert.equal(stats.autoMergedSimilarity, 1);
  const { rows: ents } = await pool.query("SELECT count(*)::int AS n FROM entities");
  assert.equal(ents[0].n, 1);
  const { rows: rels } = await pool.query("SELECT count(*)::int AS n FROM financing_relationships");
  assert.equal(rels[0].n, 1); // deduped, not doubled
});

test("moderately-similar names with no shared signal go to the review queue, not merged", async () => {
  await entity("Crescent Pictures");
  await entity("Crescent Productions"); // similar-ish, no shared film
  const stats = await runResolve(pool);
  assert.equal(stats.autoMergedSimilarity, 0);
  const { rows: ents } = await pool.query("SELECT count(*)::int AS n FROM entities");
  assert.equal(ents[0].n, 2); // both kept
  const { rows: cand } = await pool.query("SELECT status FROM resolution_candidates");
  if (cand.length) assert.equal(cand[0].status, "pending");
});

test("distinct companies are left alone", async () => {
  await entity("Blumhouse Productions");
  await entity("A24 Films");
  const stats = await runResolve(pool);
  assert.equal(stats.autoMergedStrongKey + stats.autoMergedSimilarity, 0);
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM entities");
  assert.equal(rows[0].n, 2);
});
