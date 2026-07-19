import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { migrate } from "@filmfund/db";
import { assertSourcePermitted, SourceGateError } from "../src/sourceGate.js";

const ADMIN_URL =
  process.env.ADMIN_DATABASE_URL ?? "postgres://root@localhost/postgres?host=%2Fvar%2Frun%2Fpostgresql";
const TEST_DB = "filmfund_pipe_test";

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

test("gate passes a permitted source", async () => {
  const row = await assertSourcePermitted(pool, "sec_edgar");
  assert.equal(row.tos_verdict, "permitted");
});

test("gate throws for a prohibited source (IMDb/LinkedIn are designed out)", async () => {
  for (const source of ["imdb", "imdb_pro", "linkedin", "box_office_mojo"]) {
    await assert.rejects(
      assertSourcePermitted(pool, source),
      (err: unknown) => err instanceof SourceGateError && err.reason === "prohibited"
    );
  }
});

test("gate throws for needs-license sources until license_held is flipped", async () => {
  await assert.rejects(
    assertSourcePermitted(pool, "the_numbers"),
    (err: unknown) => err instanceof SourceGateError && err.reason === "unlicensed"
  );
  await pool.query(
    "UPDATE source_registry SET license_held = true WHERE source_name = 'opusdata'"
  );
  const row = await assertSourcePermitted(pool, "opusdata");
  assert.equal(row.license_held, true);
});

test("gate throws for an unregistered source", async () => {
  await assert.rejects(
    assertSourcePermitted(pool, "mystery_site"),
    (err: unknown) => err instanceof SourceGateError && err.reason === "unregistered"
  );
});
