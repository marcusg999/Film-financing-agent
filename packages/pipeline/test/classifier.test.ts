import { test } from "node:test";
import assert from "node:assert/strict";
import { RuleClassifier } from "../src/classify/classifier.js";
import { getClassifier } from "../src/classify/claude.js";

const rc = new RuleClassifier();

test("producer credit defaults to craft, not money", async () => {
  const r = await rc.classify({ role: "producer", excerpt: "Directed by X, produced by Y." });
  assert.equal(r.isFinancial, false);
  assert.ok(r.confidence >= 0.6);
});

test("EP credit with no financing language is unknown, never money", async () => {
  const r = await rc.classify({ role: "executive_producer", excerpt: "Executive producer: Jane Doe." });
  assert.equal(r.isFinancial, null); // the honest state
});

test("EP credit WITH financing language reads as money, modest confidence", async () => {
  const r = await rc.classify({
    role: "executive_producer",
    excerpt: "The film was financed by Jane Doe, who takes an executive producer credit.",
  });
  assert.equal(r.isFinancial, true);
  assert.ok(r.confidence <= 0.7);
});

test("financial roles are money by definition", async () => {
  for (const role of ["equity", "gap_loan", "mg_advance", "co_financier", "grant"]) {
    const r = await rc.classify({ role, excerpt: null });
    assert.equal(r.isFinancial, true, role);
  }
});

test("securities-filing provenance is high-confidence money", async () => {
  const r = await rc.classify({ role: "equity", excerpt: "Issuer of record.", classificationMethod: "sec_filing" });
  assert.equal(r.isFinancial, true);
  assert.ok(r.confidence >= 0.9);
});

test("producer WITH explicit financing language flips to money", async () => {
  const r = await rc.classify({ role: "producer", excerpt: "Producer and financier; provided equity investment." });
  assert.equal(r.isFinancial, true);
});

test("factory returns the rule classifier when no API key is set", () => {
  const c = getClassifier({} as NodeJS.ProcessEnv);
  assert.equal(c.method, "rule:money_v_craft");
});

test("factory returns the Claude classifier when the key is set", () => {
  const c = getClassifier({ ANTHROPIC_API_KEY: "sk-test" } as unknown as NodeJS.ProcessEnv);
  assert.equal(c.method, "llm:money_v_craft");
});

test("Claude classifier falls back to the rule result on API error", async () => {
  const failing = getClassifier(
    { ANTHROPIC_API_KEY: "sk-test" } as unknown as NodeJS.ProcessEnv,
    async () => new Response("nope", { status: 500 })
  );
  const r = await failing.classify({ role: "producer", excerpt: "produced by Y" });
  assert.equal(r.isFinancial, false); // rule result surfaced
  assert.match(r.rationale, /llm fallback/);
});
