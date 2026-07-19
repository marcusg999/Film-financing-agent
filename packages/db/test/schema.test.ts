import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { migrate } from "../src/migrate.js";

const ADMIN_URL =
  process.env.ADMIN_DATABASE_URL ?? "postgres://root@localhost/postgres?host=%2Fvar%2Frun%2Fpostgresql";
const TEST_DB = "filmfund_db_test";

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
});

after(async () => {
  await pool.end();
  await admin(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
});

async function insertEvidence(): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO evidence (source_name, retrieved_at, url, excerpt)
     VALUES ('sec_edgar', now(), 'https://www.sec.gov/example', 'test excerpt')
     RETURNING id`
  );
  return rows[0].id;
}

test("migrations apply cleanly on a fresh database", async () => {
  const applied = await migrate(pool);
  assert.ok(applied.includes("0001_init.sql"));
  assert.ok(applied.includes("0002_source_registry.sql"));
  // idempotent: second run applies nothing
  assert.deepEqual(await migrate(pool), []);
});

test("rule 1: budget without evidence is rejected", async () => {
  await assert.rejects(
    pool.query(
      `INSERT INTO films (title, budget_amount_usd, budget_confidence)
       VALUES ('No Provenance', 5000000, 'reported')`
    ),
    /films_budget_provenance/
  );
  await assert.rejects(
    pool.query(
      `INSERT INTO films (title, budget_amount_usd, budget_confidence)
       VALUES ('Fabricated', 5000000, 'unknown')`
    ),
    /films_budget_provenance/
  );
});

test("rule 1: budget with confidence + evidence is accepted; unknown budget is a valid state", async () => {
  const evidenceId = await insertEvidence();
  await pool.query(
    `INSERT INTO films (title, year, budget_amount_usd, budget_confidence, budget_evidence_id)
     VALUES ('Provenanced', 2024, 3500000, 'reported', $1)`,
    [evidenceId]
  );
  await pool.query(`INSERT INTO films (title, year) VALUES ('Unknown Budget Is Fine', 2023)`);
});

test("rule 2: financing claim without evidence is rejected", async () => {
  const { rows: eRows } = await pool.query(
    `INSERT INTO entities (type, display_name, normalized_name)
     VALUES ('fund', 'Test Fund', 'test fund') RETURNING id`
  );
  const { rows: fRows } = await pool.query(
    `INSERT INTO films (title) VALUES ('Some Film') RETURNING id`
  );
  await assert.rejects(
    pool.query(
      `INSERT INTO financing_relationships (entity_id, film_id, role, financier_confidence)
       VALUES ($1, $2, 'equity', 0.9)`,
      [eRows[0].id, fRows[0].id]
    ),
    /null value in column "evidence_id"/
  );
});

test("source gate: prohibited and unregistered sources cannot persist raw documents", async () => {
  await assert.rejects(
    pool.query(
      `INSERT INTO raw_documents (source_name, tos_verdict, content_hash, retrieved_at)
       VALUES ('imdb', 'permitted', 'h1', now())`
    ),
    /prohibited by its terms of service/
  );
  await assert.rejects(
    pool.query(
      `INSERT INTO raw_documents (source_name, tos_verdict, content_hash, retrieved_at)
       VALUES ('some_random_site', 'permitted', 'h2', now())`
    ),
    /not in source_registry/
  );
  await assert.rejects(
    pool.query(
      `INSERT INTO raw_documents (source_name, tos_verdict, content_hash, retrieved_at)
       VALUES ('the_numbers', 'needs_license', 'h3', now())`
    ),
    /permitted_only|requires a license/
  );
  // permitted source passes
  await pool.query(
    `INSERT INTO raw_documents (source_name, tos_verdict, content_hash, retrieved_at)
     VALUES ('sec_edgar', 'permitted', 'h4', now())`
  );
});

test("exit criteria: entity + film + evidence + relationship → recent_genre_financiers returns it", async () => {
  const evidenceId = await insertEvidence();
  const { rows: eRows } = await pool.query(
    `INSERT INTO entities (type, display_name, normalized_name, genre_affinity)
     VALUES ('production_company', 'Hollow Lantern Pictures', 'hollow lantern pictures', '{genre_horror,sci_fi}')
     RETURNING id`
  );
  const { rows: fRows } = await pool.query(
    `INSERT INTO films (title, year, genre_bands, budget_amount_usd, budget_confidence, budget_evidence_id)
     VALUES ('Night Signal', 2025, '{genre_horror}', 4000000, 'reported', $1)
     RETURNING id`,
    [evidenceId]
  );
  await pool.query(
    `INSERT INTO financing_relationships
       (entity_id, film_id, role, is_financial, financier_confidence, deal_date, deal_date_confidence, classification_method, evidence_id)
     VALUES ($1, $2, 'equity', true, 0.92, '2025-03-01', 'reported', 'sec_filing', $3)`,
    [eRows[0].id, fRows[0].id, evidenceId]
  );

  // a craft-only credit on the same film must NOT qualify
  const { rows: craftRows } = await pool.query(
    `INSERT INTO entities (type, display_name, normalized_name)
     VALUES ('individual', 'Craft Producer', 'craft producer') RETURNING id`
  );
  await pool.query(
    `INSERT INTO financing_relationships
       (entity_id, film_id, role, is_financial, financier_confidence, evidence_id)
     VALUES ($1, $2, 'producer', false, 0.2, $3)`,
    [craftRows[0].id, fRows[0].id, evidenceId]
  );

  const { rows } = await pool.query(
    `SELECT * FROM recent_genre_financiers('genre_horror', '2023-01-01')`
  );
  const names = rows.map((r) => r.display_name);
  assert.ok(names.includes("Hollow Lantern Pictures"));
  assert.ok(!names.includes("Craft Producer"));
  const row = rows.find((r) => r.display_name === "Hollow Lantern Pictures");
  assert.equal(row.last_deal_estimated, false);
});

test("rule 3: usable_contacts excludes unverified and suppressed contacts", async () => {
  const evidenceId = await insertEvidence();
  const { rows: eRows } = await pool.query(
    `INSERT INTO entities (type, display_name, normalized_name)
     VALUES ('fund', 'Contactable Fund', 'contactable fund') RETURNING id`
  );
  const base = `INSERT INTO contacts (entity_id, channel, value, verification_status, source, evidence_id, is_personal_data, suppressed)`;
  await pool.query(
    `${base} VALUES ($1, 'email', 'ok@fund.example', 'verified', 'entity_own_site', $2, false, false)`,
    [eRows[0].id, evidenceId]
  );
  await pool.query(
    `${base} VALUES ($1, 'email', 'unverified@fund.example', 'unverified', 'entity_own_site', $2, false, false)`,
    [eRows[0].id, evidenceId]
  );
  await pool.query(
    `${base} VALUES ($1, 'email', 'optout@fund.example', 'verified', 'entity_own_site', $2, true, true)`,
    [eRows[0].id, evidenceId]
  );
  const { rows } = await pool.query(
    `SELECT value FROM usable_contacts WHERE entity_id = $1`,
    [eRows[0].id]
  );
  assert.deepEqual(rows.map((r) => r.value), ["ok@fund.example"]);
});

test("phones are first-class contacts under the same rules, deduped per entity+channel+value", async () => {
  const evidenceId = await insertEvidence();
  const { rows: eRows } = await pool.query(
    `INSERT INTO entities (type, display_name, normalized_name)
     VALUES ('sales_agent', 'Phone Fund', 'phone fund') RETURNING id`
  );
  const base = `INSERT INTO contacts (entity_id, channel, value, verification_status, source, evidence_id, is_personal_data)`;
  // verified office line (E.164) surfaces; format-valid-but-unverified does not
  await pool.query(
    `${base} VALUES ($1, 'phone', '+14155550100', 'verified', 'entity_own_site', $2, false)`,
    [eRows[0].id, evidenceId]
  );
  await pool.query(
    `${base} VALUES ($1, 'phone', '+442071838750', 'unverified', 'entity_own_site', $2, false)`,
    [eRows[0].id, evidenceId]
  );
  const { rows } = await pool.query(
    `SELECT value FROM usable_contacts WHERE entity_id = $1 AND channel = 'phone'`,
    [eRows[0].id]
  );
  assert.deepEqual(rows.map((r) => r.value), ["+14155550100"]);
  // duplicate (entity, channel, value) is rejected
  await assert.rejects(
    pool.query(
      `${base} VALUES ($1, 'phone', '+14155550100', 'unverified', 'entity_own_site', $2, false)`,
      [eRows[0].id, evidenceId]
    ),
    /contacts_entity_channel_value_key/
  );
});
