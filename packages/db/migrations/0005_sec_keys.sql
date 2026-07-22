-- 0005_sec_keys: SEC CIK as a strong entity-resolution key (docs/01) and
-- idempotent upsert target for EDGAR ingestion.

CREATE UNIQUE INDEX entities_sec_cik_key
  ON entities (sec_cik) WHERE sec_cik IS NOT NULL;
