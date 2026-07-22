import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { migrate } from "@filmfund/db";
import { runIngestSecEdgar } from "../src/ingest/secEdgarIngest.js";
import { cleanDisplayName } from "../src/sources/secEdgar.js";

const ADMIN_URL =
  process.env.ADMIN_DATABASE_URL ?? "postgres://root@localhost/postgres?host=%2Fvar%2Frun%2Fpostgresql";
const TEST_DB = "filmfund_sec_test";

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

// Synthetic fixtures in EDGAR response shapes: fake CIKs/accessions, "Test …" names.
const FTS_FIXTURE = {
  hits: {
    hits: [
      {
        _id: "0009000001-24-000001:primary_doc.xml",
        _source: {
          ciks: ["0009000001"],
          display_names: ["Test Haunted Feature LLC (CIK 0009000001)"],
          file_date: "2024-08-15",
          forms: "C",
        },
      },
      {
        _id: "0009000002-23-000002:primary_doc.xml",
        _source: {
          ciks: ["0009000002"],
          display_names: ["Test Orbit Picture Inc (CIK 0009000002)"],
          file_date: "2023-03-01",
          forms: "C",
        },
      },
    ],
  },
};

const FORM_C_XML: Record<string, string> = {
  "9000001": `<?xml version="1.0"?>
<edgarSubmission>
  <formData>
    <issuerInformation>
      <nameOfIssuer>Test Haunted Feature, LLC</nameOfIssuer>
      <issuerWebsite>https://testhauntedfeature.example/about</issuerWebsite>
      <jurisdictionOrganization>DE</jurisdictionOrganization>
    </issuerInformation>
    <offeringInformation>
      <intermediaryCompanyName>Test Portal Inc</intermediaryCompanyName>
      <intermediaryCommissionCik>9000099</intermediaryCommissionCik>
      <offeringAmount>1070000</offeringAmount>
      <deadlineDate>2024-12-31</deadlineDate>
    </offeringInformation>
  </formData>
</edgarSubmission>`,
  "9000002": `<?xml version="1.0"?>
<edgarSubmission>
  <formData>
    <issuerInformation>
      <nameOfIssuer>Test Orbit Picture Inc</nameOfIssuer>
    </issuerInformation>
    <offeringInformation>
      <intermediaryCompanyName>Test Portal Inc</intermediaryCompanyName>
      <intermediaryCommissionCik>9000099</intermediaryCommissionCik>
      <offeringAmount>500000</offeringAmount>
    </offeringInformation>
  </formData>
</edgarSubmission>`,
};

const fetchFixture = async (url: string): Promise<Response> => {
  if (url.includes("efts.sec.gov")) {
    return new Response(JSON.stringify(FTS_FIXTURE), { status: 200 });
  }
  const cik = url.match(/edgar\/data\/(\d+)\//)?.[1];
  const body = cik ? FORM_C_XML[cik] : undefined;
  return body
    ? new Response(body, { status: 200 })
    : new Response("not found", { status: 404 });
};

test("cleanDisplayName strips the CIK suffix", () => {
  assert.equal(cleanDisplayName("Foo Films LLC (CIK 0001234567)"), "Foo Films LLC");
  assert.equal(cleanDisplayName("Bare Name"), "Bare Name");
});

test("ingests issuers + portal with evidence, no films/relationships until classifier grounds them", async () => {
  const stats = await runIngestSecEdgar(pool, { fetchImpl: fetchFixture });
  assert.equal(stats.filingsFound, 2);
  assert.equal(stats.filingsIngested, 2);
  assert.equal(stats.issuersUpserted, 2);
  assert.equal(stats.portalsUpserted, 2); // same portal upserted per filing

  const { rows: entities } = await pool.query(
    "SELECT display_name, type, sec_cik, website_domain, is_active_signal::text FROM entities ORDER BY sec_cik"
  );
  assert.equal(entities.length, 3); // 2 issuers + 1 portal (deduped by CIK)
  const issuer = entities.find((e) => e.sec_cik === "9000001");
  assert.equal(issuer.display_name, "Test Haunted Feature, LLC"); // XML name wins
  assert.equal(issuer.type, "production_company");
  assert.equal(issuer.website_domain, "testhauntedfeature.example");
  assert.equal(issuer.is_active_signal, "2024-08-15");
  const portal = entities.find((e) => e.sec_cik === "9000099");
  assert.equal(portal.type, "crowdfunding_platform");
  assert.equal(portal.is_active_signal, "2024-08-15"); // GREATEST of both filings

  // deliberately no speculative film linkage
  const { rows: counts } = await pool.query(
    `SELECT (SELECT count(*) FROM films) AS films,
            (SELECT count(*) FROM financing_relationships) AS rels`
  );
  assert.deepEqual(counts[0], { films: "0", rels: "0" });

  // alias captured where FTS and XML names differ
  const { rows: aliases } = await pool.query("SELECT alias FROM entity_aliases");
  assert.deepEqual(aliases.map((a) => a.alias), ["Test Haunted Feature LLC"]);
});

test("re-running skips already-ingested accessions", async () => {
  const stats = await runIngestSecEdgar(pool, { fetchImpl: fetchFixture });
  assert.equal(stats.skippedAlreadyIngested, 2);
  assert.equal(stats.filingsIngested, 0);
  const { rows } = await pool.query("SELECT count(*) AS n FROM entities");
  assert.equal(rows[0].n, "3");
});

test("a failed filing fetch is counted, not fatal", async () => {
  const flaky = async (url: string): Promise<Response> => {
    if (url.includes("efts.sec.gov")) {
      return new Response(
        JSON.stringify({
          hits: {
            hits: [
              {
                _id: "0009000003-24-000003:primary_doc.xml",
                _source: {
                  ciks: ["0009000003"],
                  display_names: ["Test Broken Fetch LLC (CIK 0009000003)"],
                  file_date: "2024-01-01",
                  forms: "C",
                },
              },
            ],
          },
        }),
        { status: 200 }
      );
    }
    return new Response("boom", { status: 500 });
  };
  const stats = await runIngestSecEdgar(pool, { fetchImpl: flaky });
  assert.equal(stats.fetchErrors, 1);
  assert.equal(stats.filingsIngested, 0);
});
