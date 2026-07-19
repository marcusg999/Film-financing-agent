import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { migrate } from "@filmfund/db";
import { runIngestWikidata } from "../src/ingest/wikidataIngest.js";
import type { SparqlResponse } from "../src/sources/wikidata.js";

const ADMIN_URL =
  process.env.ADMIN_DATABASE_URL ?? "postgres://root@localhost/postgres?host=%2Fvar%2Frun%2Fpostgresql";
const TEST_DB = "filmfund_wikidata_test";

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

// Synthetic fixture in real SPARQL result shape. Deliberately fake QIDs
// (Q9xxxxxxx) and "Test …" names — fixtures never fabricate real-world claims.
const wd = (q: string) => ({ type: "uri", value: `http://www.wikidata.org/entity/${q}` });
const lit = (v: string) => ({ type: "literal", value: v });

const FIXTURE: SparqlResponse = {
  results: {
    bindings: [
      // Test Film One: US horror, USD budget, two prodcos
      {
        film: wd("Q900000001"), filmLabel: lit("Test Film One"),
        date: lit("2024-06-01T00:00:00Z"), genre: wd("Q200092"),
        prodco: wd("Q910000001"), prodcoLabel: lit("Test Prodco Alpha"),
        country: wd("Q30"), budgetAmount: lit("4500000"), budgetUnit: wd("Q4917"),
      },
      {
        film: wd("Q900000001"), filmLabel: lit("Test Film One"),
        date: lit("2024-06-01T00:00:00Z"), genre: wd("Q200092"),
        prodco: wd("Q910000002"), prodcoLabel: lit("Test Prodco Beta"),
        country: wd("Q30"), budgetAmount: lit("4500000"), budgetUnit: wd("Q4917"),
      },
      // Test Film Two: UK sci-fi, budget in EUR (Q4916) → budget must stay unknown
      {
        film: wd("Q900000002"), filmLabel: lit("Test Film Two"),
        date: lit("2023-02-10T00:00:00Z"), genre: wd("Q471839"),
        prodco: wd("Q910000001"), prodcoLabel: lit("Test Prodco Alpha"),
        country: wd("Q145"), budgetAmount: lit("2000000"), budgetUnit: wd("Q4916"),
      },
      // Test Film Three: out-of-scope country (Japan) → skipped
      {
        film: wd("Q900000003"), filmLabel: lit("Test Film Three"),
        date: lit("2022-01-01T00:00:00Z"), genre: wd("Q200092"),
        prodco: wd("Q910000003"), prodcoLabel: lit("Test Prodco Gamma"),
        country: wd("Q17"),
      },
      // Test Film Four: no country data → excluded and counted
      {
        film: wd("Q900000004"), filmLabel: lit("Test Film Four"),
        date: lit("2022-05-01T00:00:00Z"), genre: wd("Q200092"),
        prodco: wd("Q910000003"), prodcoLabel: lit("Test Prodco Gamma"),
      },
    ],
  },
};

const fetchFixture = async (): Promise<Response> =>
  new Response(JSON.stringify(FIXTURE), {
    status: 200,
    headers: { "content-type": "application/sparql-results+json" },
  });

test("ingests in-scope films with prodcos, budgets USD-only, evidence everywhere", async () => {
  const stats = await runIngestWikidata(pool, { fetchImpl: fetchFixture });
  assert.equal(stats.filmsUpserted, 2); // One + Two
  assert.equal(stats.skippedOutOfScopeCountry, 1); // Three
  assert.equal(stats.skippedNoCountry, 1); // Four
  assert.equal(stats.budgetsSet, 1); // USD only
  assert.equal(stats.skippedBudgetNonUsd, 1); // EUR held at unknown

  const { rows: films } = await pool.query(
    "SELECT title, budget_amount_usd, budget_confidence FROM films ORDER BY title"
  );
  assert.deepEqual(
    films.map((f) => [f.title, f.budget_amount_usd === null ? null : Number(f.budget_amount_usd), f.budget_confidence]),
    [
      ["Test Film One", 4500000, "estimated"],
      ["Test Film Two", null, "unknown"],
    ]
  );

  // every relationship carries evidence + the rule method
  const { rows: rels } = await pool.query(
    `SELECT classification_method, financier_confidence, evidence_id FROM financing_relationships`
  );
  assert.equal(rels.length, 3); // Alpha+Beta on One, Alpha on Two
  for (const r of rels) {
    assert.equal(r.classification_method, "rule:wikidata_p272");
    assert.equal(Number(r.financier_confidence), 0.65);
    assert.ok(r.evidence_id);
  }
});

test("re-running is idempotent (no duplicate films/entities/relationships)", async () => {
  await runIngestWikidata(pool, { fetchImpl: fetchFixture });
  const counts = await pool.query(
    `SELECT
       (SELECT count(*) FROM films) AS films,
       (SELECT count(*) FROM entities) AS entities,
       (SELECT count(*) FROM financing_relationships) AS rels`
  );
  assert.deepEqual(counts.rows[0], { films: "2", entities: "2", rels: "3" });
});

test("the genre query surfaces the ingested prodco with year-fallback recency", async () => {
  const { rows } = await pool.query(
    "SELECT * FROM recent_genre_financiers('genre_horror', '2020-01-01')"
  );
  const names = rows.map((r) => r.display_name).sort();
  assert.deepEqual(names, ["Test Prodco Alpha", "Test Prodco Beta"]);
  assert.ok(rows.every((r) => r.last_deal_estimated === true)); // no deal_date → film-year fallback, labeled
});

test("genre affinity accumulates across films", async () => {
  const { rows } = await pool.query(
    "SELECT genre_affinity::text[] AS genre_affinity FROM entities WHERE display_name = 'Test Prodco Alpha'"
  );
  assert.deepEqual([...rows[0].genre_affinity].sort(), ["genre_horror", "sci_fi"]);
});
