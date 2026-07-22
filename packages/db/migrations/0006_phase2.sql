-- 0006_phase2: entity resolution + qualification support.

CREATE EXTENSION IF NOT EXISTS pg_trgm; -- name blocking for resolution

-- Qualification bucket per entity (docs/04 cluster rule). Recomputed each
-- run; evidence jsonb records the numbers behind the verdict so the
-- dashboard can show *why* an entity landed in its bucket.
CREATE TABLE entity_qualification (
  entity_id             uuid PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  bucket                text NOT NULL,   -- qualified_sub10m | insufficient_data | mixed_scale | out_of_band
  known_budget_films    int NOT NULL,
  total_qualifying      int NOT NULL,
  known_coverage        numeric,
  median_budget_usd     numeric,
  frac_under_cap        numeric,
  max_budget_usd        numeric,
  evidence              jsonb NOT NULL,
  computed_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX entity_qualification_bucket_idx ON entity_qualification (bucket);

-- Low-confidence merge candidates for human review (docs/01: resolution is
-- a first-class stage with a review queue, not silent auto-merge).
CREATE TABLE resolution_candidates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_a     uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  entity_b     uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  score        numeric NOT NULL,
  features     jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'pending', -- pending | merged | rejected
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_a, entity_b)
);

CREATE INDEX resolution_candidates_status_idx ON resolution_candidates (status);

CREATE INDEX entities_normalized_name_trgm ON entities USING gin (normalized_name gin_trgm_ops);
