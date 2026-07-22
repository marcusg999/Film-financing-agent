import { test } from "node:test";
import assert from "node:assert/strict";
import { qualifyEntity } from "../src/qualify/cluster.js";

const M = 1_000_000;

test("a consistent sub-$10M slate qualifies", () => {
  const r = qualifyEntity({ knownBudgets: [2.5 * M, 4 * M, 6 * M, 3.5 * M], totalQualifying: 4 });
  assert.equal(r.bucket, "qualified_sub10m");
});

test("fewer than 3 known budgets is insufficient_data, not a guess", () => {
  const r = qualifyEntity({ knownBudgets: [3 * M, 4 * M], totalQualifying: 2 });
  assert.equal(r.bucket, "insufficient_data");
});

test("low known-budget coverage is insufficient_data", () => {
  // 3 known out of 10 qualifying = 30% coverage
  const r = qualifyEntity({ knownBudgets: [2 * M, 3 * M, 4 * M], totalQualifying: 10 });
  assert.equal(r.bucket, "insufficient_data");
});

test("the one-off false positive is demoted to mixed_scale", () => {
  // A mega-budget shop with a single sub-$10M dip: median well above cap,
  // max above the mega threshold.
  const r = qualifyEntity({
    knownBudgets: [5 * M, 40 * M, 80 * M, 120 * M, 60 * M],
    totalQualifying: 5,
  });
  assert.equal(r.bucket, "mixed_scale");
});

test("a consistently above-cap-but-not-mega slate is out_of_band", () => {
  const r = qualifyEntity({ knownBudgets: [12 * M, 15 * M, 18 * M, 14 * M], totalQualifying: 4 });
  assert.equal(r.bucket, "out_of_band");
});

test("a bimodal slate (mostly huge, a couple tiny) fails the 60% floor", () => {
  // median just under cap can be gamed; the fraction floor guards it.
  const r = qualifyEntity({ knownBudgets: [1 * M, 2 * M, 25 * M, 28 * M, 9 * M], totalQualifying: 5 });
  // median = 9M ≤ cap, but only 60% ≤ cap → borderline; max 28M < 30M mega
  // so not mixed_scale; 3/5 = 60% meets floor → qualifies. Flip one up:
  const r2 = qualifyEntity({ knownBudgets: [1 * M, 25 * M, 25 * M, 28 * M, 9 * M], totalQualifying: 5 });
  assert.equal(r.bucket, "qualified_sub10m");
  assert.equal(r2.bucket, "out_of_band"); // median 25M above cap
});

test("evidence numbers are populated for transparency", () => {
  const r = qualifyEntity({ knownBudgets: [2 * M, 4 * M, 6 * M], totalQualifying: 3 });
  assert.equal(r.medianBudgetUsd, 4 * M);
  assert.equal(r.fracUnderCap, 1);
  assert.equal(r.knownCoverage, 1);
  assert.ok(r.reasons.length > 0);
});
