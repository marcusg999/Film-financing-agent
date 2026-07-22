import { THRESHOLDS, type QualBucket } from "../phase2/thresholds.js";

/**
 * The cluster rule (docs/04 problem 2) as a pure function — the guard
 * against the one-off false positive: a single sub-$10M credit does not
 * make an entity a sub-$10M financier.
 */

export interface QualInput {
  /** Budgets (USD) of the entity's qualifying financed films that HAVE a
   *  known budget. Films with unknown budgets are excluded here but counted
   *  in totalQualifying. */
  knownBudgets: number[];
  /** Count of all qualifying financed films (financial + conf ≥ τ_fin),
   *  known-budget or not. */
  totalQualifying: number;
}

export interface QualResult {
  bucket: QualBucket;
  knownBudgetFilms: number;
  totalQualifying: number;
  knownCoverage: number | null;
  medianBudgetUsd: number | null;
  fracUnderCap: number | null;
  maxBudgetUsd: number | null;
  reasons: string[];
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function qualifyEntity(input: QualInput, t = THRESHOLDS): QualResult {
  const K = input.knownBudgets;
  const nKnown = K.length;
  const reasons: string[] = [];

  const base = {
    knownBudgetFilms: nKnown,
    totalQualifying: input.totalQualifying,
    knownCoverage: input.totalQualifying > 0 ? nKnown / input.totalQualifying : null,
    medianBudgetUsd: nKnown ? median(K) : null,
    fracUnderCap: nKnown ? K.filter((b) => b <= t.capUsd).length / nKnown : null,
    maxBudgetUsd: nKnown ? Math.max(...K) : null,
  };

  // 1. Enough known-budget data points to judge at all.
  if (nKnown < t.minKnownFilms) {
    reasons.push(`only ${nKnown} known-budget financed films (need ${t.minKnownFilms})`);
    return { ...base, bucket: "insufficient_data", reasons };
  }
  // 2. Known-budget coverage — we know budgets for enough of the slate.
  if ((base.knownCoverage ?? 0) < t.minKnownCoverage) {
    reasons.push(`known-budget coverage ${(base.knownCoverage! * 100).toFixed(0)}% below ${t.minKnownCoverage * 100}%`);
    return { ...base, bucket: "insufficient_data", reasons };
  }

  const med = base.medianBudgetUsd!;
  const frac = base.fracUnderCap!;
  const max = base.maxBudgetUsd!;

  // 4. Mixed-scale demotion: really a bigger-budget shop that dipped low once.
  if (max > t.megaBudgetUsd && med > t.capUsd) {
    reasons.push(`max budget $${(max / 1e6).toFixed(1)}M with above-cap median — mixed scale`);
    return { ...base, bucket: "mixed_scale", reasons };
  }

  // 3. Central tendency: median ≤ cap AND ≥60% of known films ≤ cap.
  const medianOk = med <= t.capUsd;
  const fracOk = frac >= t.minFracUnderCap;
  if (medianOk && fracOk) {
    reasons.push(`median $${(med / 1e6).toFixed(1)}M ≤ cap, ${(frac * 100).toFixed(0)}% of ${nKnown} films ≤ cap`);
    return { ...base, bucket: "qualified_sub10m", reasons };
  }

  // Consistently above the band.
  if (!medianOk) reasons.push(`median $${(med / 1e6).toFixed(1)}M above cap`);
  if (!fracOk) reasons.push(`only ${(frac * 100).toFixed(0)}% of films ≤ cap (need ${t.minFracUnderCap * 100}%)`);
  return { ...base, bucket: "out_of_band", reasons };
}
