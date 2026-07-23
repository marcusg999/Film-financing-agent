import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { migrate } from "@filmfund/db";
import { runIngestCurated } from "../src/ingest/curatedIngest.js";
import { CURATED_INDIVIDUALS } from "../src/sources/curatedIndividuals.js";
import { buildFinancierQuery } from "../../../apps/dashboard/lib/financiers.ts";

const ADMIN_URL =
  process.env.ADMIN_DATABASE_URL ?? "postgres://root@localhost/postgres?host=%2Fvar%2Frun%2Fpostgresql";
const TEST_DB = "filmfund_individuals_test";

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
});
after(async () => {
  await pool.end();
  await admin(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
});

test("individual-backed vehicles ingest with principals + evidence, no personal contacts", async () => {
  const stats = await runIngestCurated(pool, CURATED_INDIVIDUALS);
  assert.ok(stats.upserted >= 12);

  // Every ingested vehicle has principals recorded.
  const { rows } = await pool.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM entities WHERE array_length(principals,1) IS NOT NULL"
  );
  assert.equal(rows[0].n, stats.upserted);

  // A specific check: the vehicle carries the principal names, not a person row.
  const { rows: spring } = await pool.query<{ principals: string[] }>(
    "SELECT principals::text[] AS principals FROM entities WHERE website_domain = 'springhillcompany.com'"
  );
  assert.ok(spring[0].principals.includes("LeBron James"));

  // No personal contact data was created for anyone (compliance).
  const { rows: contacts } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM contacts");
  assert.equal(contacts[0].n, 0);
});

test("the 'individual-backed' filter returns only vehicles with principals", async () => {
  // Add a non-individual entity with no principals.
  await pool.query(
    `INSERT INTO entities (type, display_name, normalized_name, funding_types) VALUES
     ('soft_money_body','Some Fund','some fund','{grant}')`
  );
  const { text, values } = buildFinancierQuery({ backed: "individual" });
  const { rows } = await pool.query<{ display_name: string }>(text, values);
  assert.ok(rows.length >= 12);
  assert.ok(!rows.some((r) => r.display_name === "Some Fund"));
  assert.ok(rows.some((r) => r.display_name === "The SpringHill Company"));
});

test("genre + individual-backed narrows to genre-specialized vehicles", async () => {
  const { text, values } = buildFinancierQuery({ backed: "individual", genre: "genre_horror" });
  const { rows } = await pool.query<{ display_name: string }>(text, values);
  const names = rows.map((r) => r.display_name);
  assert.ok(names.includes("Atomic Monster")); // horror-tagged individual vehicle
  assert.ok(!names.includes("The SpringHill Company")); // general vehicle, not horror-tagged
});
