# 01 — Architecture

## Design principles

1. **Async and queued end-to-end.** Ingestion, extraction, resolution, enrichment,
   and scoring are separate stages connected by a job queue. No stage blocks another;
   any stage can be retried, rate-limited, or backfilled independently.
2. **Entity resolution is a first-class stage, not a cleanup step.** The same fund,
   person, or company appears under many spellings and shell LLCs. Resolution runs
   *before* scoring, and every merge decision is auditable.
3. **Provenance travels with every claim.** Nothing enters the store without an
   Evidence row (URL, retrieval date, excerpt). Confidence and source are required,
   not optional (see [03-data-schema.md](03-data-schema.md)).
4. **Prefer official structured access over scraping.** Where a source offers an API
   or bulk dump (SEC EDGAR, Wikidata, some fund registries), we use it. Scraping is
   for sources that only expose HTML *and* permit it (see [02](02-data-source-matrix.md)).

## Pipeline (scrape → extract → resolve → enrich → score)

```
                          ┌─────────────────────────────────────────────┐
                          │                 JOB QUEUE                    │
                          │   (pg-boss on Supabase Postgres, or BullMQ)  │
                          └─────────────────────────────────────────────┘
                                 ▲        ▲        ▲        ▲        ▲
   ┌──────────────┐              │        │        │        │        │
   │  SOURCES     │              │        │        │        │        │
   │              │        ┌─────┴──┐ ┌───┴────┐ ┌─┴──────┐ ┌┴───────┐ ┌┴──────┐
   │ • Trade press│──HTML─▶│ INGEST │▶│EXTRACT │▶│RESOLVE │▶│ENRICH  │▶│ SCORE │
   │ • Fund sites │        │        │ │        │ │        │ │        │ │       │
   │ • Grants     │        │Firecrawl│ │ Claude │ │ dedupe │ │contact │ │qualify│
   │ • SEC EDGAR  │──API──▶│ + API  │ │ struct │ │ +merge │ │+verify │ │+rank  │
   │ • Wikidata   │──dump─▶│ clients│ │ extract│ │(pgvec  │ │(email  │ │(rules │
   │ • Crowdfund  │        │        │ │+classfy│ │ +rules)│ │ valid) │ │ +band)│
   │ • Fest DBs   │        └────────┘ └────────┘ └────────┘ └────────┘ └───────┘
   └──────────────┘             │         │          │          │         │
                                ▼         ▼          ▼          ▼         ▼
                          ┌─────────────────────────────────────────────────┐
                          │            SUPABASE (Postgres + pgvector)        │
                          │  raw_documents · entities · films · financing_   │
                          │  relationships · contacts · evidence · scores    │
                          └─────────────────────────────────────────────────┘
                                                │
                          ┌─────────────────────┴───────────────────────┐
                          │  DASHBOARD (Next.js) + RANKED EXPORT (CSV)   │
                          │  Supabase Auth (invite-only, small team)     │
                          │  Assisted draft view → human sends from own  │
                          │  inbox (Resend deferred; see Outreach below) │
                          └──────────────────────────────────────────────┘
```

### Stage responsibilities

| Stage | Input | Output | Key jobs |
|-------|-------|--------|----------|
| **Ingest** | Source URL / API endpoint / dump | `raw_documents` rows + Evidence | Fetch (Firecrawl for HTML, native clients for APIs), respect robots.txt + rate limits, store raw + retrieval metadata, dedupe by content hash. |
| **Extract** | `raw_documents` | Candidate Entity/Film/Financing/Contact records (unmerged) | Claude structured extraction with a strict JSON schema + **financier-vs-craft classifier** (see [04](04-qualification-methodology.md)). Every field carries a confidence. |
| **Resolve** | Candidate records | Canonical entities with `entity_aliases` | Blocking + embedding similarity (pgvector) + deterministic rules (see below). Human-review queue for low-confidence merges. |
| **Enrich** | Canonical entities | `contacts` with verification status | Pull contact channels from the entity's *own* public site / filing; **verify emails** before marking usable. Enrichment-API hook is stubbed behind a flag (deferred per budget). |
| **Score** | Resolved entities + films + relationships | `scores` rows | Apply the cluster rule + budget-band + genre-affinity + warm-signal ranking (see [04](04-qualification-methodology.md)). |

## Entity resolution (called out because it's the silent killer)

Resolution is a pipeline stage with its own table and review queue, not an
afterthought.

- **Blocking:** cheap candidate grouping by normalized name, soundex/metaphone,
  and country before any expensive comparison.
- **Similarity:** name embeddings (pgvector) + string distance + shared-signal
  features (same films, same address, same website domain, same principals).
- **Deterministic overrides:** an exact match on a strong key (SEC CIK, company
  registration number, canonical website domain) auto-merges; conflicting strong
  keys block a merge.
- **Shell-LLC handling:** SPVs named `<Film Title> Productions LLC` are linked to
  their controlling entity via principals/addresses from filings when available, but
  are kept as distinct `Entity` rows with a `parent_entity_id` — we never silently
  collapse an SPV into its backer without evidence.
- **Auditability:** every merge writes a `merge_decision` with the features and
  score that justified it. Merges are reversible.

## The default stack — justified or adapted

Your canonical stack: **Firecrawl → Claude API → Supabase → Resend → Railway.**

| Component | Verdict | Reasoning for *this* task |
|-----------|---------|---------------------------|
| **Firecrawl (scraping)** | **Keep, but scoped.** | Great for the sources that only exist as HTML and permit access — fund/prodco mandate pages, grant directories, festival pages, and the *public* trade-press pages we're allowed to read. **Adaptation:** it is *not* the ingestion path for SEC EDGAR (official API + bulk data), Wikidata (CC0 dumps/SPARQL), or any source whose ToS prohibits automated access (IMDb, LinkedIn — see [02](02-data-source-matrix.md)). Firecrawl honors robots.txt, which we rely on but do not treat as sufficient — ToS governs too. |
| **Claude API (extract + classify)** | **Keep — central.** | Two jobs perfectly suited to it: (a) structured extraction from messy trade-press prose into our schema, (b) the **financier-vs-craft classifier** with a confidence score. Use `claude-opus-4-8` for hard classification/resolution calls and a cheaper model (`claude-haiku-4-5`) for high-volume extraction to control cost. Prompt-cache the schema + few-shot examples. |
| **Supabase (storage)** | **Keep — expanded role.** | Postgres fits the relational schema; **pgvector** doubles as the entity-resolution embedding store (no separate vector DB needed); **Supabase Auth** covers invite-only small-team access; **pg-boss** (Postgres-native queue) can be the job queue, avoiding a separate Redis in v1. One dependency doing four jobs is the right call at this scale. |
| **Resend (outreach)** | **Deferred / minimized.** | Your outreach decision is *assisted drafting, human sends from their own inbox.* So v1 generates personalized drafts in the dashboard; **we do not bulk-send.** Resend (or just mailto/copy-to-clipboard) becomes relevant only if you later want the agent to send. Keeping send out of v1 avoids CAN-SPAM bulk-sender obligations and ESP-reputation management. Interface is stubbed so we can turn it on later. |
| **Railway (deploy)** | **Keep.** | Hosts the Next.js dashboard + the worker process(es) that drain the queue. Simple, cheap, fits a small team. **Alternative noted:** Supabase Edge Functions could run light workers, but a single long-lived Railway worker is simpler for queued, rate-limited scraping. |

### Net stack for v1

```
Firecrawl (permitted HTML sources only)
  + native API/dump clients (SEC EDGAR, Wikidata, platform APIs)
  → Claude API (Haiku for extraction, Opus for classification/resolution)
  → Supabase (Postgres + pgvector + Auth + pg-boss queue)
  → Next.js dashboard on Railway (ranked list, filters, draft view)
  → [deferred] Resend for send; [deferred, flagged] contact-enrichment API
```

## Why async/queued specifically

- Scraping must be **polite and rate-limited** per domain; a queue with per-source
  concurrency limits enforces that.
- Claude calls are the cost driver; batching and caching require decoupling
  extraction from ingestion.
- Sources refresh at different cadences (trade press daily, SEC as-filed, grants
  quarterly); a queue lets each source have its own schedule and backfill.
- Failures are normal (timeouts, layout changes); per-job retry with backoff keeps
  one bad page from stalling a run.

## Data-flow guarantees

- **No claim without evidence.** Extract/Resolve/Enrich stages refuse to write a
  qualifying fact unless an Evidence row exists.
- **Unknown is a value.** Missing budget or unverified contact is stored as an
  explicit state, never back-filled with a guess.
- **Idempotent ingestion.** Content-hash dedupe means re-running a source doesn't
  duplicate rows; it only adds new evidence and updates confidence.
