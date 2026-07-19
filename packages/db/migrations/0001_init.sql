-- 0001_init: core schema from docs/03-data-schema.md
-- Integrity rules are constraints here, not conventions:
--   1. No budget without provenance (CHECK on films)
--   2. No financing claim without evidence (NOT NULL fk)
--   3. Usable contacts = verified AND not suppressed (view)
--   4. Personal data is flagged and suppressible

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid

-- ---------- enums & domains ----------

CREATE TYPE entity_type AS ENUM (
  'individual','fund','production_company','distributor','sales_agent',
  'gap_lender','tax_credit_broker','soft_money_body','grant_body',
  'crowdfunding_platform','crowdfunding_backer','unknown'
);

CREATE TYPE financier_role AS ENUM (
  'equity','executive_producer','producer','co_financier','gap_loan',
  'mg_advance','presale','grant','tax_credit','crowdfunding','unknown'
);

CREATE TYPE budget_confidence AS ENUM ('reported','estimated','unknown');

CREATE TYPE contact_channel AS ENUM ('email','web_form','phone','agent','postal','social');

CREATE TYPE verification_status AS ENUM (
  'verified','unverified','invalid','risky','catch_all','unknown'
);

CREATE TYPE genre_band AS ENUM (
  'genre_horror','thriller','sci_fi','prestige_drama','comedy','doc',
  'action','family','other'
);

CREATE TYPE budget_band AS ENUM (
  'under_1m','1m_3m','3m_5m','5m_10m','over_10m','unknown'
);

CREATE TYPE tos_verdict AS ENUM ('permitted','needs_license','prohibited');

CREATE DOMAIN claim_confidence AS numeric
  CHECK (VALUE >= 0 AND VALUE <= 1);

-- ---------- updated_at helper ----------

CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------- provenance ----------

CREATE TABLE raw_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name   text NOT NULL,
  url           text,
  fetched_via   text,
  robots_ok     boolean,
  tos_verdict   tos_verdict NOT NULL,
  content_hash  text NOT NULL,
  retrieved_at  timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Only permitted sources persist (rule 4 of docs/03)
  CONSTRAINT raw_documents_permitted_only CHECK (tos_verdict = 'permitted')
);

CREATE UNIQUE INDEX raw_documents_content_hash_idx ON raw_documents (source_name, content_hash);

CREATE TABLE evidence (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url             text,
  source_name     text NOT NULL,
  source_license  text,
  retrieved_at    timestamptz NOT NULL,
  excerpt         text,
  raw_document_id uuid REFERENCES raw_documents(id),
  content_hash    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------- entities ----------

CREATE TABLE entities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type              entity_type NOT NULL,
  display_name      text NOT NULL,
  normalized_name   text NOT NULL,
  country           text,
  website_domain    text,
  sec_cik           text,
  company_number    text,
  wikidata_qid      text,
  parent_entity_id  uuid REFERENCES entities(id),
  name_embedding    vector(1024),
  genre_affinity    genre_band[] NOT NULL DEFAULT '{}',
  budget_band_focus budget_band[] NOT NULL DEFAULT '{}',
  funding_types     financier_role[] NOT NULL DEFAULT '{}',
  is_active_signal  date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX entities_normalized_name_idx ON entities (normalized_name);
CREATE INDEX entities_country_idx ON entities (country);
CREATE TRIGGER entities_updated_at BEFORE UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE entity_aliases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  alias       text NOT NULL,
  source      text,
  evidence_id uuid REFERENCES evidence(id)
);

CREATE INDEX entity_aliases_alias_idx ON entity_aliases (alias);

-- ---------- films ----------

CREATE TABLE films (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title              text NOT NULL,
  year               int,
  wikidata_qid       text,
  genre_bands        genre_band[] NOT NULL DEFAULT '{}',
  budget_amount_usd  numeric,
  budget_currency    text,
  budget_confidence  budget_confidence NOT NULL DEFAULT 'unknown',
  budget_evidence_id uuid REFERENCES evidence(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- Rule 1: a budget may only be set when it has a defensible confidence AND evidence.
  -- "Unknown" is a valid state; a fabricated number is not.
  CONSTRAINT films_budget_provenance CHECK (
    budget_amount_usd IS NULL
    OR (budget_confidence IN ('reported','estimated') AND budget_evidence_id IS NOT NULL)
  )
);

CREATE TRIGGER films_updated_at BEFORE UPDATE ON films
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- financing relationships ----------

CREATE TABLE financing_relationships (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  film_id               uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  role                  financier_role NOT NULL,
  is_financial          boolean,
  financier_confidence  claim_confidence NOT NULL,
  deal_date             date,
  deal_date_confidence  budget_confidence,
  classification_method text,
  -- Rule 2: no financing claim without evidence.
  evidence_id           uuid NOT NULL REFERENCES evidence(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX financing_relationships_entity_idx ON financing_relationships (entity_id);
CREATE INDEX financing_relationships_film_idx ON financing_relationships (film_id);
CREATE INDEX financing_relationships_deal_date_idx ON financing_relationships (deal_date);
CREATE TRIGGER financing_relationships_updated_at BEFORE UPDATE ON financing_relationships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- contacts ----------

CREATE TABLE contacts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  channel             contact_channel NOT NULL,
  value               text NOT NULL,
  verification_status verification_status NOT NULL DEFAULT 'unverified',
  verified_at         timestamptz,
  source              text NOT NULL,
  evidence_id         uuid NOT NULL REFERENCES evidence(id),
  is_personal_data    boolean NOT NULL,
  gdpr_basis          text,
  suppressed          boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contacts_entity_idx ON contacts (entity_id);
CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Rule 3: the only contacts the product may surface.
CREATE VIEW usable_contacts AS
  SELECT * FROM contacts
  WHERE verification_status = 'verified' AND NOT suppressed;

-- ---------- scores ----------

CREATE TABLE scores (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id            uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  project_id           uuid,
  cluster_pass         boolean,
  cluster_evidence     jsonb,
  budget_band_match    numeric,
  genre_affinity_match numeric,
  warm_signal_score    numeric,
  contactability       numeric,
  final_score          numeric,
  explanation          jsonb,
  computed_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX scores_entity_idx ON scores (entity_id);

-- ---------- entity-resolution audit ----------

CREATE TABLE merge_decisions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kept_entity_id   uuid NOT NULL REFERENCES entities(id),
  merged_entity_id uuid NOT NULL,
  method           text NOT NULL,
  score            numeric,
  features         jsonb,
  decided_by       text NOT NULL,
  decided_at       timestamptz NOT NULL DEFAULT now(),
  reverted_at      timestamptz
);

-- ---------- product tables ----------

CREATE TABLE projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  genre_bands   genre_band[] NOT NULL DEFAULT '{}',
  budget_band   budget_band NOT NULL DEFAULT 'unknown',
  geography     text[] NOT NULL DEFAULT '{}',
  owner_user_id uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outreach_drafts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  entity_id  uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id),
  draft_body text NOT NULL,
  status     text NOT NULL DEFAULT 'draft',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- the named output: recent financiers of genre X ----------
-- docs/04: money not craft; genre matched; recency by deal_date with the
-- film year as an *estimated* fallback; undatable deals excluded (never
-- assumed recent).

CREATE FUNCTION recent_genre_financiers(
  target_genre genre_band,
  since        date,
  tau_fin      numeric DEFAULT 0.6
) RETURNS TABLE (
  entity_id     uuid,
  display_name  text,
  entity_type   entity_type,
  deal_count    bigint,
  last_deal     date,
  last_deal_estimated boolean
) AS $$
  SELECT
    e.id,
    e.display_name,
    e.type,
    count(*) AS deal_count,
    max(COALESCE(fr.deal_date, make_date(f.year, 1, 1))) AS last_deal,
    bool_or(fr.deal_date IS NULL) AS last_deal_estimated
  FROM financing_relationships fr
  JOIN entities e ON e.id = fr.entity_id
  JOIN films f    ON f.id = fr.film_id
  WHERE fr.is_financial = true
    AND fr.financier_confidence >= tau_fin
    AND target_genre = ANY (f.genre_bands)
    AND COALESCE(fr.deal_date, make_date(f.year, 1, 1)) >= since
    AND (fr.deal_date IS NOT NULL OR f.year IS NOT NULL)
  GROUP BY e.id, e.display_name, e.type
  ORDER BY last_deal DESC;
$$ LANGUAGE sql STABLE;
