import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { migrate } from "@filmfund/db";
// The dashboard's pure query builder — tested here against a real DB so the
// filter semantics are covered even though the dashboard itself isn't unit-tested.
import { buildFinancierQuery } from "../../../apps/dashboard/lib/financiers.ts";

const ADMIN_URL =
  process.env.ADMIN_DATABASE_URL ?? "postgres://root@localhost/postgres?host=%2Fvar%2Frun%2Fpostgresql";
const TEST_DB = "filmfund_filter_test";

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

async function run(filters: Parameters<typeof buildFinancierQuery>[0]): Promise<string[]> {
  const { text, values } = buildFinancierQuery(filters);
  const { rows } = await pool.query<{ display_name: string }>(text, values);
  return rows.map((r) => r.display_name).sort();
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

async function seed(): Promise<void> {
  // Horror prodco, US, qualified, with a verified contact.
  const { rows: e1 } = await pool.query(
    `INSERT INTO entities (type, display_name, normalized_name, country, genre_affinity, funding_types, is_active_signal)
     VALUES ('production_company','Horror Co','horror co','US','{genre_horror}','{equity}', CURRENT_DATE) RETURNING id`
  );
  await pool.query(
    `INSERT INTO entity_qualification (entity_id, bucket, known_budget_films, total_qualifying, evidence)
     VALUES ($1,'qualified_sub10m',4,4,'{}')`, [e1[0].id]
  );
  const { rows: ev } = await pool.query(`INSERT INTO evidence (source_name, retrieved_at) VALUES ('wikidata', now()) RETURNING id`);
  await pool.query(
    `INSERT INTO contacts (entity_id, channel, value, verification_status, source, evidence_id, is_personal_data)
     VALUES ($1,'email','ok@horror.example','verified','entity_own_site',$2,false)`, [e1[0].id, ev[0].id]
  );

  // Soft-money body, GB, genre-agnostic (grant).
  await pool.query(
    `INSERT INTO entities (type, display_name, normalized_name, country, genre_affinity, funding_types)
     VALUES ('soft_money_body','UK Fund','uk fund','GB','{}','{grant}')`
  );
  // Sci-fi sales agent, CA, no contact, insufficient_data (stale).
  const { rows: e3 } = await pool.query(
    `INSERT INTO entities (type, display_name, normalized_name, country, genre_affinity, funding_types, is_active_signal)
     VALUES ('sales_agent','SciFi Sales','scifi sales','CA','{sci_fi}','{mg_advance}', DATE '2015-01-01') RETURNING id`
  );
  await pool.query(
    `INSERT INTO entity_qualification (entity_id, bucket, known_budget_films, total_qualifying, evidence)
     VALUES ($1,'insufficient_data',1,5,'{}')`, [e3[0].id]
  );
  // A genre-tagged grant body (like the Sloan Foundation): sci-fi only — must
  // NOT leak into a horror filter despite being institutional.
  await pool.query(
    `INSERT INTO entities (type, display_name, normalized_name, country, genre_affinity, funding_types)
     VALUES ('grant_body','SciFi Grant','scifi grant','US','{sci_fi}','{grant}')`
  );
}

test("no filters returns everything", async () => {
  assert.deepEqual(await run({}), ["Horror Co", "SciFi Grant", "SciFi Sales", "UK Fund"]);
});

test("type filter", async () => {
  assert.deepEqual(await run({ type: "soft_money_body" }), ["UK Fund"]);
});

test("provides filter", async () => {
  assert.deepEqual(await run({ provides: "grant" }), ["SciFi Grant", "UK Fund"]);
  assert.deepEqual(await run({ provides: "mg_advance" }), ["SciFi Sales"]);
});

test("genre filter: tagged entities by tag; only genre-agnostic bodies always included", async () => {
  // Horror: horror prodco + the agnostic UK Fund. NOT the sci-fi sales agent,
  // and NOT the sci-fi-tagged grant body (institutional but genre-specific).
  assert.deepEqual(await run({ genre: "genre_horror" }), ["Horror Co", "UK Fund"]);
  // Sci-fi: the sci-fi sales agent + the sci-fi grant + the agnostic UK Fund.
  assert.deepEqual(await run({ genre: "sci_fi" }), ["SciFi Grant", "SciFi Sales", "UK Fund"]);
});

test("region filter", async () => {
  assert.deepEqual(await run({ country: "CA" }), ["SciFi Sales"]);
});

test("bucket filter", async () => {
  assert.deepEqual(await run({ bucket: "qualified_sub10m" }), ["Horror Co"]);
});

test("warm-signal filter (active within N years)", async () => {
  // Horror Co is active today; SciFi Sales last active 2015 → excluded from ≤5y.
  assert.deepEqual(await run({ warm: "5" }), ["Horror Co"]);
});

test("contactable filter", async () => {
  assert.deepEqual(await run({ contactable: "1" }), ["Horror Co"]);
});

test("combined filters intersect", async () => {
  assert.deepEqual(await run({ genre: "genre_horror", contactable: "1", country: "US" }), ["Horror Co"]);
  assert.deepEqual(await run({ genre: "sci_fi", contactable: "1" }), []); // sci-fi has no verified contact
});

test("bad filter values are ignored, not injected", async () => {
  assert.deepEqual(await run({ type: "'; DROP TABLE entities; --" }), ["Horror Co", "SciFi Grant", "SciFi Sales", "UK Fund"]);
});
