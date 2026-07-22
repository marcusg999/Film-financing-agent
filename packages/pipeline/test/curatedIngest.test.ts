import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { migrate } from "@filmfund/db";
import { runIngestCurated } from "../src/ingest/curatedIngest.js";
import type { CuratedBody } from "../src/sources/curatedBodies.js";

const ADMIN_URL =
  process.env.ADMIN_DATABASE_URL ?? "postgres://root@localhost/postgres?host=%2Fvar%2Frun%2Fpostgresql";
const TEST_DB = "filmfund_curated_test";

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

// Small synthetic set exercising the shapes (real dataset ingested by the CLI).
const SAMPLE: CuratedBody[] = [
  { name: "Test National Film Fund", type: "soft_money_body", country: "GB", website: "testnff.example", fundingTypes: ["grant"], mandate: "National film fund." },
  { name: "Test Genre Financier", type: "production_company", country: "US", website: "testgenre.example", fundingTypes: ["equity"], genres: ["genre_horror", "sci_fi"], mandate: "Horror/sci-fi financier." },
];

test("curated bodies ingest with evidence + funding_types set", async () => {
  const stats = await runIngestCurated(pool, SAMPLE);
  assert.equal(stats.upserted, 2);
  assert.equal(stats.genreTagged, 1);

  const { rows } = await pool.query(
    "SELECT display_name, type, funding_types::text[] AS ft, genre_affinity::text[] AS ga FROM entities ORDER BY display_name"
  );
  const fund = rows.find((r) => r.display_name === "Test National Film Fund");
  assert.equal(fund.type, "soft_money_body");
  assert.deepEqual(fund.ft, ["grant"]);
  assert.deepEqual(fund.ga, []); // national fund is genre-agnostic

  const genre = rows.find((r) => r.display_name === "Test Genre Financier");
  assert.deepEqual([...genre.ga].sort(), ["genre_horror", "sci_fi"]);

  // every curated body has an evidence row linking to its site
  const { rows: ev } = await pool.query(
    "SELECT count(*)::int AS n FROM evidence WHERE source_name = 'curated_public_bodies'"
  );
  assert.ok(ev[0].n >= 2);
});

test("re-running is idempotent (dedupe by website domain)", async () => {
  await runIngestCurated(pool, SAMPLE);
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM entities");
  assert.equal(rows[0].n, 2);
});

test("curated funders are distinguishable from Wikidata prodcos by funding_types", async () => {
  // a Wikidata-style prodco with no funding_types
  await pool.query(
    `INSERT INTO entities (type, display_name, normalized_name, wikidata_qid) VALUES
     ('production_company','Some Wikidata Prodco','some wikidata prodco','Q999999')`
  );
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM entities WHERE funding_types <> '{}'"
  );
  assert.equal(rows[0].n, 2); // only the two curated bodies, not the wikidata prodco
});

test("real dataset ingests cleanly and hits all four regions", async () => {
  await admin(`DROP DATABASE IF EXISTS ${TEST_DB}_full WITH (FORCE)`);
  await admin(`CREATE DATABASE ${TEST_DB}_full`);
  const p2 = new pg.Pool({ connectionString: withDatabase(ADMIN_URL, `${TEST_DB}_full`) });
  try {
    await migrate(p2);
    const stats = await runIngestCurated(p2); // default = full CURATED_BODIES
    assert.ok(stats.upserted >= 30, `expected 30+ bodies, got ${stats.upserted}`);
    const { rows } = await p2.query(
      `SELECT count(DISTINCT country)::int AS c FROM entities WHERE funding_types <> '{}'`
    );
    assert.ok(rows[0].c >= 8, "expected funders across many countries");
  } finally {
    await p2.end();
    await admin(`DROP DATABASE IF EXISTS ${TEST_DB}_full WITH (FORCE)`);
  }
});
