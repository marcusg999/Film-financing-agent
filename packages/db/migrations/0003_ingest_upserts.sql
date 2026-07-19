-- 0003_ingest_upserts: natural keys so ingestion is idempotent (docs/01:
-- re-running a source must never duplicate rows).

CREATE UNIQUE INDEX entities_wikidata_qid_key
  ON entities (wikidata_qid) WHERE wikidata_qid IS NOT NULL;

CREATE UNIQUE INDEX films_wikidata_qid_key
  ON films (wikidata_qid) WHERE wikidata_qid IS NOT NULL;

ALTER TABLE financing_relationships
  ADD CONSTRAINT financing_relationships_entity_film_role_key
  UNIQUE (entity_id, film_id, role);

CREATE UNIQUE INDEX evidence_source_hash_key
  ON evidence (source_name, content_hash) WHERE content_hash IS NOT NULL;
