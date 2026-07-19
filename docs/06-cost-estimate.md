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

> **If you're building the MVP yourself in this environment**, skip to
> [Setup + run cost for a solo build](#setup--run-cost-for-a-solo-build-you--claude-in-this-environment)
> below — that's the section keyed to *your* case (no labor line; ~$0 to set up,
> ~$75–200/mo to run, Claude API the main cost).

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

## Setup + run cost for a solo build (you + Claude, in this environment)

This is the version that matters if **you** build the whole MVP here: there's no
engineering-labor line, so the only question is cash to stand it up and keep it
running. Pricing below was checked against current (2026) plans (sources at bottom).

### What you actually sign up for

| Service | Free tier (start here) | Paid when you outgrow it | Notes for this build |
|---------|------------------------|--------------------------|----------------------|
| **Supabase** | **$0** — 500 MB DB, 50k MAU auth, pgvector included | **Pro $25/mo** (8 GB DB, backups, no pausing) | Free tier **pauses a project after 1 week idle and has no backups** — fine for early dev, but move to Pro before you're relying on the data. |
| **Railway** | **$5 trial credit (30 days), no card** | **Hobby $5/mo** (includes $5 usage) | One dashboard + one worker fits in/near the $5 usage. |
| **Firecrawl** | **$0** — 1,000 pages/mo, no card | **Hobby $16/mo** (5,000 credits) | Free tier covers early dev; upgrade during corpus backfill. **Stealth mode = 5× credits** — avoid bot-protected sites (we don't scrape those anyway). |
| **Claude API** | none (pay-as-you-go) | usage-based | **The dominant real cost.** Iteration + the initial backfill classification pass (Opus) is where the money goes. |
| **Email verification** | free tiers ~100–1,000 checks | ~$0.003–0.008/check | Not needed until Phase 4. $0 to start. |
| **SEC EDGAR / Wikidata / Companies House** | **$0** (public/official) | — | Free forever; declared User-Agent + rate limits only. |
| **Domain** (optional for MVP) | — | ~$10–15/yr | Skip until you need a public dashboard URL. |

### Cash, tiered honestly

- **Rock-bottom (all free tiers): ~$30–120/mo** — infra effectively **$0** (Supabase
  free, Railway trial, Firecrawl free), and essentially **all of it is Claude API
  tokens**. Trade-off: Supabase pausing + no backups, and the 1,000-page/mo crawl cap.
  Good for the first few weeks of Phase 0–1 dev.
- **Recommended lean MVP: ~$75–200/mo** —
  Supabase Pro **$25** + Railway **$5** + Firecrawl Hobby **$16** + Claude API
  **$30–150** + email verify **$0–15**. This is the realistic steady number while you
  build here.
- **One-time-ish backfill (building the initial corpus):** an extra **~$100–400** in
  Claude + Firecrawl spend, spread over the weeks you build Phases 1–3, front-loaded
  by the Opus classification pass. (The $400–1,000 figure earlier assumes a *full*
  multi-thousand-entity corpus; an initial MVP corpus is smaller.)

### Bottom line for a solo build here

- **To set up: ~$0 out of pocket.** Lean on free tiers; the only account that bills
  from day one is Claude API, and only as you make calls.
- **To run during the build: ~$75–200/mo**, of which **Claude API is the swing
  factor** — controllable via the Haiku-for-extraction / Opus-only-for-hard-calls
  split, prompt caching, and idempotent (no re-spend) ingestion already in the design.
- **Deferred and still $0 until you choose them:** contact-enrichment API
  ($100–500/mo) and licensed budget data ($1k+/mo). The MVP never requires them.

## Comparison: built traditionally with engineers

Same scope, same roadmap — but paying an engineering team instead of building it
yourself here. The effort estimate (Phases 0–5 = **45–77 eng-days ≈ 360–616 hours**;
first useful slice, Phases 0–2 = **21–35 eng-days ≈ 168–280 hours**) is the same; only
the labor cost changes. Rates below are current (2026) market ranges for senior
full-stack/data engineers (sources at bottom).

### Labor cost to a working v1 (Phases 0–5)

| Sourcing | Effective rate | Labor to v1 | First useful slice (0–2) |
|----------|----------------|-------------|--------------------------|
| **Offshore** (S. Asia / Africa) | ~$20–45/hr | **~$10k–28k** | ~$4k–13k |
| **Nearshore / Eastern-EU** (mid–senior) | ~$50–85/hr | **~$20k–52k** | ~$9k–24k |
| **US/Western senior freelancer** | ~$90–165/hr | **~$35k–100k** | ~$16k–46k |
| **US/Western agency** (PM + QA blended) | ~$150–250/hr | **~$60k–155k** | ~$28k–70k |

> **Loaded cost is higher than the raw rate.** For a *team* (not a single freelancer),
> real loaded cost typically runs **1.4–1.8×** the quoted rate once management,
> ramp-up, coordination, and QA are priced in — already baked into the agency row,
> and something to add on top of the offshore/nearshore rows if you're coordinating
> multiple people. Agencies also usually attach an ongoing **maintenance retainer**
> (commonly ~$1–4k/mo) that the solo build doesn't incur.

### The cloud/API run-rate is the same either way

Whoever builds it, the infrastructure + Claude API spend is identical: **~$0 to set
up, ~$75–200/mo to run, plus ~$100–400 one-time backfill.** That's a rounding error
next to traditional labor — which is the entire point of the comparison.

### Side-by-side

| | **Build it here (you + Claude)** | **Traditional (engineers)** |
|---|---|---|
| Engineering labor to v1 | **$0** (your time) | **~$10k–155k** depending on sourcing |
| Setup cash | ~$0 (free tiers) | ~$0 (free tiers) |
| Run-rate while building + after | ~$75–200/mo | ~$75–200/mo (same) |
| One-time corpus backfill | ~$100–400 | ~$100–400 (same) |
| Ongoing maintenance | your time | often a retainer (~$1–4k/mo, agency) |
| Calendar time to v1 | ~6–10 wks focused / 9–15 part-time | ~8–14 wks (team parallelism offset by coordination) |
| **All-in cash to first working v1** | **~$700–1,600** (mostly Claude tokens) | **~$11k–157k** (labor dominates) |

### Honest caveats on the comparison

- **Rates vary enormously** by geography, seniority, and stack — treat these as
  planning-grade ranges, not quotes. Get real bids before budgeting.
- **The hard part is Phase 2** (entity resolution + the money-vs-craft classifier +
  eval tuning). Rock-bottom offshore labor often *underdelivers* precisely there — a
  cheap day rate that produces a weak classifier is a false economy for this domain.
- **The AI-leverage assumption cuts both ways:** the eng-day estimate assumes an
  engineer working *with* Claude (as you would). A team not leaning on AI heavily may
  run longer, pushing the traditional numbers up, not down.
- **"$0 labor" isn't free** — it's your time. The honest framing is: building here
  converts a **$10k–155k cash line into your own hours**, at the cost of you being the
  single point of delivery.

### The honest caveat on build cost

The dominant real cost is **engineering time on Phase 2** (entity resolution +
qualification), not cloud spend. If a specific budget-data or contact-finding gap
turns out to gate quality, the licensed options above ($1k+/mo OpusData/IMDb, or
$100–500/mo enrichment) are the lever — but they're deferred precisely so you don't
pay for them until the free path proves insufficient. The numbers here are
planning-grade ranges; they'll tighten once Phase 0–1 reveal real corpus size and
per-source extraction cost.

## Pricing sources (checked during planning, 2026)

- Firecrawl pricing — https://www.firecrawl.dev/pricing (Free 1,000 pages/mo; Hobby $16/mo/5,000 credits; stealth mode 5× credits).
- Supabase pricing — https://supabase.com/pricing (Free: 500 MB DB, 50k MAU, pauses after 1 week idle, no backups; Pro $25/mo/project).
- Railway pricing — https://docs.railway.com/pricing/plans (Trial $5 credit/30 days; Hobby $5/mo incl. $5 usage).
- Claude API pricing — see the `claude-api` reference / https://www.anthropic.com/pricing (pay-as-you-go; Haiko/Opus split drives cost).

> Re-check before committing spend — provider plans and limits change.

## Labor-rate sources (checked during planning, 2026)

- US senior full-stack contractor rates (~$80–165/hr for specialized project work) — https://www.fullstack.com/labs/resources/blog/software-development-price-guide-hourly-rate-comparison ; https://www.kore1.com/tech-contractor-hourly-rates-2026/
- Offshore / nearshore rates by region (offshore ~$20–45/hr; Eastern-EU/LATAM senior ~$60–85/hr; 40–70% cheaper than onshore) — https://distantjob.com/blog/offshore-developer-rates/ ; https://www.aalpha.net/articles/offshore-software-development-hourly-rates/
- Loaded-cost multiplier (1.4–1.8× quoted rate for teams) — https://distantjob.com/blog/offshore-developer-rates/

> As with the infra pricing: re-check with real bids before committing. Labor rates
> move and vary far more than cloud pricing.
