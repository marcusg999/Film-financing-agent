/**
 * Phase 2 thresholds (docs/04). Centralized and tunable against the labeled
 * eval set. Precision is prioritized over recall — a wrong "qualified" is
 * worse than a missed lead.
 */
export const THRESHOLDS = {
  /** τ_fin — a relationship counts as financier evidence at/above this. */
  tauFin: 0.6,
  /** The budget cap that defines the target band. */
  capUsd: 10_000_000,
  /** Minimum known-budget financed films to judge an entity. */
  minKnownFilms: 3,
  /** Known-budget coverage floor (|K| / total qualifying financed films). */
  minKnownCoverage: 0.5,
  /** Fraction of K that must be ≤ cap. */
  minFracUnderCap: 0.6,
  /** Above this max single budget + an above-cap median ⇒ mixed_scale. */
  megaBudgetUsd: 30_000_000,
} as const;

export type QualBucket =
  | "qualified_sub10m"
  | "insufficient_data"
  | "mixed_scale"
  | "out_of_band";
