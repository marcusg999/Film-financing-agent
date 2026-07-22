-- 0004_contact_dedupe: one row per (entity, channel, value) so enrichment
-- re-runs upsert instead of duplicating. Phones and emails share the same
-- provenance/verification machinery; values are normalized before insert
-- (emails lowercased, phones E.164) — convention documented in docs/03.

ALTER TABLE contacts
  ADD CONSTRAINT contacts_entity_channel_value_key
  UNIQUE (entity_id, channel, value);
