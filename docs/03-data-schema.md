# 03 — Data Schema

**Rule:** confidence and provenance are **required** fields, not optional. Every
qualifying claim (a budget, a financier classification, a contact) links to at least
one `evidence` row. "Unknown" is a first-class value, never a silent NULL that gets
treated as zero or fabricated.

Target: PostgreSQL (Supabase) with `pgvector`. Types below are indicative.

## Enums

```
entity_type:        individual | fund | production_company | distributor |
                    sales_agent | gap_lender | tax_credit_broker | soft_money_body |
                    grant_body | crowdfunding_platform | crowdfunding_backer | unknown

financier_role:     equity | executive_producer | producer | co_financier |
                    gap_loan | mg_advance | presale | grant | tax_credit |
                    crowdfunding | unknown

budget_confidence:  reported | estimated | unknown        -- provenance quality
claim_confidence:   numeric 0.00–1.00                     -- model/rule confidence
contact_channel:    email | web_form | phone | agent | postal | social
verification_status: verified | unverified | invalid | risky | catch_all | unknown
genre_band:         genre_horror | thriller | prestige_drama | comedy | doc |
                    action | family | other
budget_band:        under_1m | 1m_3m | 3m_5m | 5m_10m | over_10m | unknown
```

## Core tables

### `entities` — a person or company that may provide/broker money

```
id                 uuid pk
type               entity_type          not null
display_name       text                 not null
normalized_name    text                 not null   -- for blocking/resolution
country            text                              -- ISO; for geo + GDPR routing
website_domain     text                              -- strong resolution key
sec_cik            text                              -- strong key (US)
company_number     text                              -- Companies House etc. (strong key)
wikidata_qid       text                              -- CC0 backbone id
parent_entity_id   uuid  fk -> entities(id)          -- SPV/shell -> controlling entity
name_embedding     vector(1024)                      -- pgvector, resolution
genre_affinity     genre_band[]                       -- tags, not a filter
budget_band_focus  budget_band[]                      -- observed bands they back
funding_types      financier_role[]                   -- what they actually do
is_active_signal   date                               -- most recent warm signal date
created_at, updated_at
```

### `entity_aliases` — name variants and shell spellings

```
id                 uuid pk
entity_id          uuid fk -> entities(id) not null
alias              text not null
source             text                 -- where this spelling was seen
evidence_id        uuid fk -> evidence(id)
```

### `films`

```
id                 uuid pk
title              text not null
year               int
wikidata_qid       text
genre_bands        genre_band[]
budget_amount_usd  numeric                     -- NULL allowed; see budget_confidence
budget_currency    text
budget_confidence  budget_confidence not null  -- reported | estimated | unknown
budget_evidence_id uuid fk -> evidence(id)       -- REQUIRED if budget_amount is set
created_at, updated_at
```

> A `films.budget_amount_usd` may only be non-NULL if `budget_confidence` is
> `reported` or `estimated` **and** `budget_evidence_id` is set. Enforced by a
> CHECK constraint + application guard. No evidence → budget stays `unknown`/NULL.

### `financing_relationships` — entity ↔ film, with financier confidence

```
id                     uuid pk
entity_id              uuid fk -> entities(id) not null
film_id                uuid fk -> films(id)    not null
role                   financier_role not null
is_financial           boolean                 -- classifier output: money vs craft
financier_confidence   claim_confidence not null   -- 0..1
deal_date              date                    -- when the financing happened/was announced
deal_date_confidence   budget_confidence           -- reported | estimated | unknown
classification_method  text                    -- 'llm' | 'rule' | 'sec_filing' | 'human'
evidence_id            uuid fk -> evidence(id) not null   -- REQUIRED
created_at, updated_at
```

> `deal_date` is the **date of the financing event** (announcement, filing, or
> award), distinct from `films.year` (the film's release/production year). It is what
> makes **genre-specific recency** queryable — e.g. "entities that financed a
> `genre_horror` film in the last 3 years." When only the film year is known,
> `deal_date` is set from it with `deal_date_confidence='estimated'`; when nothing is
> datable, it stays NULL/`unknown` (never fabricated). Recency ranking uses
> `deal_date` where present and falls back to `films.year` only as an estimate.

> This table is where the **Step 2 "producer credit ≠ money"** problem lives. A row
> with `role = producer` and `is_financial = false, financier_confidence = 0.2` is a
> *craft* credit and must not count toward qualifying the entity as a financier. See
> [04-qualification-methodology.md](04-qualification-methodology.md).

### `contacts`

```
id                   uuid pk
entity_id            uuid fk -> entities(id) not null
channel              contact_channel not null
value                text not null              -- email addr, form URL, etc.
verification_status  verification_status not null default 'unverified'
verified_at          timestamptz
source               text not null              -- where obtained (entity's own site, filing)
evidence_id          uuid fk -> evidence(id) not null
is_personal_data     boolean not null           -- true => GDPR handling (individuals)
gdpr_basis           text                       -- e.g. 'legitimate_interest'
suppressed           boolean not null default false  -- opt-out / do-not-contact
created_at, updated_at
```

> An email is only surfaced as *usable* for assisted drafting when
> `verification_status = 'verified'` and `suppressed = false`. Pattern-guessed
> addresses are **never** written as verified (see [05](05-verification-and-honest-math.md)).

### `evidence` — provenance for every claim

```
id                 uuid pk
url                text                        -- source URL (or SEC accession, dump ref)
source_name        text not null               -- 'SEC EDGAR', 'BFI', 'Variety', 'Wikidata'
source_license     text                        -- 'public' | 'CC0' | 'CC-BY-SA' | 'permitted-tos' ...
retrieved_at       timestamptz not null
excerpt            text                        -- the specific sentence/field supporting the claim
raw_document_id    uuid fk -> raw_documents(id)
content_hash       text                        -- dedupe
created_at
```

### `raw_documents` — what we ingested (idempotency + audit)

```
id                 uuid pk
source_name        text not null
url                text
fetched_via        text        -- 'firecrawl' | 'sec_api' | 'wikidata_sparql' | 'rss'
robots_ok          boolean     -- robots.txt check result at fetch time
tos_verdict        text        -- 'permitted' | 'needs_license' | 'prohibited' (must be permitted to store)
content_hash       text not null
retrieved_at       timestamptz not null
created_at
```

### `scores` — ranking output per entity (optionally per project)

```
id                   uuid pk
entity_id            uuid fk -> entities(id) not null
project_id           uuid                 -- optional; per-project match
cluster_pass         boolean              -- passes the <=$10M cluster rule?
cluster_evidence     jsonb                -- {n_films, median_budget, known_frac, ...}
budget_band_match    numeric
genre_affinity_match numeric
warm_signal_score    numeric              -- recency/relevance of last relevant deal
contactability       numeric              -- verified contact present?
final_score          numeric
explanation          jsonb                -- human-readable "why ranked here"
computed_at          timestamptz
```

### `merge_decisions` — entity-resolution audit (reversible)

```
id                 uuid pk
kept_entity_id     uuid fk -> entities(id)
merged_entity_id   uuid
method             text          -- 'strong_key' | 'embedding' | 'rule' | 'human'
score              numeric
features           jsonb
decided_by         text          -- 'system' | user id
decided_at         timestamptz
reverted_at        timestamptz   -- non-null if undone
```

## Optional / product tables

### `projects` — a filmmaker's project we're matching against

```
id            uuid pk
title         text
genre_bands   genre_band[]
budget_band   budget_band
geography     text[]
owner_user_id uuid
created_at
```

### `outreach_drafts` — assisted drafting (human sends; no bulk send in v1)

```
id            uuid pk
project_id    uuid fk -> projects(id)
entity_id     uuid fk -> entities(id)
contact_id    uuid fk -> contacts(id)
draft_body    text
status        text     -- 'draft' | 'copied' | 'sent_externally'
created_by    uuid
created_at
```

## Integrity rules baked into the schema

1. **No budget without provenance** — CHECK on `films` (budget set ⇒ confidence ∈
   {reported, estimated} ∧ evidence present).
2. **No financing claim without evidence** — `financing_relationships.evidence_id`
   NOT NULL.
3. **No usable contact without verification** — application guard: only
   `verification_status='verified'` contacts appear in outreach/export.
4. **Only permitted sources persist** — insert into `raw_documents` requires
   `tos_verdict='permitted'`; 🔴/🟡-without-license sources never reach storage.
5. **Personal data is flagged and can be suppressed** — `is_personal_data`,
   `gdpr_basis`, `suppressed` support minimization + opt-out (see [09](09-legal-ethical-guardrails.md)).
