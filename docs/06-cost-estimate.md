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
