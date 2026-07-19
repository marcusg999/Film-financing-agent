# 06 — Cost Estimate (honest run-rate)

Realistic, not optimistic. Figures are planning-grade estimates in USD/month and
should be treated as ranges; actuals depend on volume and how aggressively we
re-crawl. Public-data-only + email-verification budget (your Step 6 choice), small
team (your Step 7 choice).

## Assumptions

- **Corpus scale (v1):** on the order of **3,000–8,000 candidate entities** and
  **10,000–30,000 films/relationships** across US/UK/EU/Canada, built up over the
  first months, then incremental refresh.
- **Refresh cadence:** trade-press / active sources checked frequently; slow sources
  (grants, funds) monthly/quarterly. Idempotent ingestion means steady-state token
  spend is far below the initial backfill.
- **Model mix:** `claude-haiku-4-5` for high-volume extraction; `claude-opus-4-8`
  for the financier-vs-craft classifier and hard entity-resolution calls (a small
  fraction of calls but most of the per-call cost).
- **No licensed data** (no IMDb/OpusData) and **no enrichment API** in v1.

## Line items

| Item | Basis | Initial backfill (one-time-ish) | Steady-state / month |
|------|-------|-------------------------------|----------------------|
| **Firecrawl (scraping)** | Permitted HTML sources only; credit-based plan | $50–$150 during heavy backfill | **$30–$100** |
| **Claude API — extraction (Haiku)** | Many short calls over documents; prompt-cached schema | $150–$400 backfill | **$40–$120** |
| **Claude API — classification/resolution (Opus)** | Fewer, harder calls; the money-vs-craft + merge calls | $200–$600 backfill | **$60–$180** |
| **Supabase** | Postgres + pgvector + Auth + pg-boss queue; Pro tier | — | **$25–$60** |
| **Railway** | 1 web (dashboard) + 1 worker service | — | **$20–$50** |
| **Email verification API** | ~$0.003–$0.008 / check; re-check every 90 days | — | **$15–$60** (scales with contact count) |
| **Domain / misc / logging** | — | — | **$5–$20** |

### Rough totals

- **Initial backfill month(s):** **~$600–$1,300** (front-loaded token + scrape spend
  while building the corpus).
- **Steady-state:** **~$195–$590 / month**, most sessions landing **~$300/mo**.

> These are honest planning numbers. The two swing factors are (a) how much
> trade-press-derived text we push through Opus for classification, and (b) how large
> the verified-contact set grows (verification re-checks). Both are controllable with
> the Haiku/Opus split and the 90-day re-check window.

## Cost-control levers built into the design

- **Model routing:** default to Haiku; escalate to Opus only for ambiguous
  classification and low-confidence merges.
- **Prompt caching:** the extraction schema + few-shot examples are cached, cutting
  input tokens on the high-volume path.
- **Idempotent ingestion / content-hash dedupe:** unchanged pages don't re-spend
  tokens.
- **Official APIs/dumps over scraping** where available (SEC EDGAR, Wikidata) — free
  and cheaper than Firecrawl credits.
- **Batch classification** and per-source rate limits keep spend predictable.

## If/when you add the deferred paid options

- **Contact-enrichment API** (flagged, deferred): typically **$100–$500/mo** depending
  on lookup volume — adds ability to *find* (not just verify) contacts.
- **OpusData / IMDb commercial license** (for reliable budgets): **quote-based**,
  commonly **$1k+/mo** — only worth it if budget coverage becomes the binding
  constraint on qualification quality.

## Build cost (effort to get it working)

The run-rate above is what it costs to *operate*. This section is what it costs to
*build* — mapped to the phases in [07-roadmap.md](07-roadmap.md). Effort is given as
engineering-days for one competent full-stack/data engineer working with Claude; a
calendar range assumes part-time/iterative work, not a full-time crunch.

| Phase | Scope | Eng-days | Notes |
|-------|-------|----------|-------|
| **0 — Foundations** | Supabase schema + constraints, auth, queue/worker, dashboard skeleton, ToS source-registry gate | **4–7** | Mostly wiring; low risk. |
| **1 — Hard-evidence ingestion** | SEC EDGAR + Wikidata/Wikipedia + registries; extraction + first classifier pass | **7–12** | SEC/Wikidata are official APIs → predictable. |
| **2 — Resolution + qualification** | Entity resolution (blocking + pgvector + rules + review queue), cluster rule, labeled eval set + tuning | **10–16** | **Highest-risk / highest-value.** Entity resolution + hand-labeling ~50–100 entities is where time really goes. |
| **3 — Mandates + soft money + full scope** | Fund/prodco sites, soft-money bodies, tax-credit/grant directories, sales agents/gap lenders; genre/budget-band tagging | **8–14** | Breadth work; each 🟡 source needs a ToS check + adapter. |
| **4 — Contacts + verification + assisted drafting** | Contact extraction (own-site/filings only), email verification, GDPR handling/suppression, draft view | **6–10** | Verification + GDPR plumbing, not just the happy path. |
| **5 — Dashboard polish + ranked export** | Filters (genre, budget band, geo, recency), per-project matching, "why ranked" explanations, CSV export | **6–10** | Product surface for the small team. |
| **Cross-cutting** | Rate-limit/politeness harness, retries/backoff, observability, eval CI, docs | **4–8** | Runs alongside all phases. |

- **Total to a usable v1 (Phases 0–5): ~45–77 eng-days** (~9–15 weeks part-time, or
  roughly **6–10 weeks** focused).
- **First genuinely useful slice (Phases 0–2): ~21–35 eng-days.** This gets you
  ranked, correctly-qualified, deduplicated financiers from hard evidence — before the
  breadth and contact work.

### Cash spend to reach a working v1 (build period)

Separate from ongoing run-rate — this is what you actually pay while building:

| Bucket | Estimate | Notes |
|--------|----------|-------|
| Infra during build (Supabase + Railway) | **$45–110/mo × ~2–3 mo** | Same services, lighter load early. |
| Claude API — dev + backfill | **$400–1,000 one-time-ish** | Iterating on prompts/classifier + the initial corpus backfill (the Opus classification pass dominates). |
| Firecrawl — dev + backfill | **$50–150 one-time-ish** | Heaviest during the first crawl. |
| Email verification (Phase 4 on) | **$15–60/mo** | Scales with contact count. |
| **Cash to first working v1** | **~$700–1,600 total** | Excludes engineering labor and any deferred licenses/enrichment. |

### The honest caveat on build cost

The dominant real cost is **engineering time on Phase 2** (entity resolution +
qualification), not cloud spend. If a specific budget-data or contact-finding gap
turns out to gate quality, the licensed options above ($1k+/mo OpusData/IMDb, or
$100–500/mo enrichment) are the lever — but they're deferred precisely so you don't
pay for them until the free path proves insufficient. The numbers here are
planning-grade ranges; they'll tighten once Phase 0–1 reveal real corpus size and
per-source extraction cost.
