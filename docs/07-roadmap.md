# 07 — Phased Build Roadmap

Ships value early, defers the expensive/risky pieces, and keeps every phase honest.
Nothing here is built until you approve the plan.

## Phase 0 — Foundations (skeleton, no scraping yet)

- Supabase project: schema from [03](03-data-schema.md), CHECK constraints, RLS for
  the small team, `pgvector` enabled.
- pg-boss queue + one Railway worker + Next.js dashboard skeleton with Supabase Auth
  (invite-only).
- Source registry table encoding the [02](02-data-source-matrix.md) verdicts, so
  🔴/🟡-without-license sources are **blocked in code** from ingestion.
- **Exit criteria:** can insert a hand-entered entity+film+evidence and see it in the
  dashboard; ToS gate rejects a prohibited source.

## Phase 1 — Hard-evidence ingestion (highest signal, lowest legal risk)

- **SEC EDGAR (Form C / 1-A)** ingestion via official API → film raises, issuers,
  principals. This is the cleanest financier evidence and it's 🟢.
- **Wikidata (CC0)** + **Wikipedia (CC BY-SA, via API)** for film/entity backbone and
  budget *citations*.
- **Company registries** (SEC CIK, Companies House) for entity-resolution keys.
- Extraction (Haiku) + first pass of the money-vs-craft classifier (Opus).
- **Exit criteria:** a queryable set of entities with grounded financing evidence and
  provenance; budgets carry confidence; "unknown" is respected.

## Phase 2 — Entity resolution + qualification

- Resolution stage: blocking + pgvector similarity + strong-key overrides + SPV
  parent-linking + `merge_decisions` audit + low-confidence review queue.
- Implement the **cluster rule** and bucketing (`qualified_sub10m` /
  `insufficient_data` / `mixed_scale` / `out_of_band`).
- Hand-label ~50–100 entities; wire the precision/recall eval and tune thresholds
  (precision-first).
- **Exit criteria:** ranked list of `qualified_sub10m` entities with explanations;
  eval precision above the agreed floor; false-positive (one-off) cases demoted.

## Phase 3 — Mandates, soft money, and the wider "everything" scope

- **Film-fund / prodco own sites** (🟢) for mandates + budget bands + genre focus +
  contact.
- **Soft-money bodies** (BFI, BBC Film, Telefilm, Eurimages, Creative Europe MEDIA,
  national/regional funds) + **film-commission / tax-credit directories** + **grant
  directories**.
- Sales agents / MG distributors and gap lenders from permitted deal-announcement
  channels.
- Genre-affinity tagging and budget-band-focus populated across the corpus.
- **Exit criteria:** the full funding-type enum is represented; genre-forward ranking
  works; UK/EU/Canada soft money is mapped.

### Phase 3 execution risks & mitigations

The hard part of Phase 3 is **breadth and brittleness, not algorithmic difficulty.**
Each source is the same shape (fetch → LLM-extract → resolve → score), and because
extraction runs through Claude we **do not hand-write a parser per fund site** — a new
source is mostly config (URL + ToS verdict + extraction-prompt variant). Expect Phase
3 to be the *slowest* phase and the one that never fully "closes," but not the one
that gets *stuck*. Specific risks:

| Risk | Why it bites | Mitigation (built into the design) |
|------|--------------|-----------------------------------|
| **Heterogeneity × volume** — dozens of funds/commissions, each idiosyncratic | Long tail of small adapters; tedium + upkeep, not complexity | Per-source-*type* adapter pattern (not per-site parsers); new sources are config, not code. |
| **Multi-language (EU)** — mandates/eligibility in FR/DE/ES/etc. | Tagging + dedup must be language-robust, not English-only | Claude extraction is multilingual; add language-robust normalization to entity resolution; validate on non-English sources before trusting tags. |
| **PDFs & documents** — guidelines/awardee lists often published as PDF | PDF layout extraction is reliably messier than HTML | Dedicated document-extraction path (the `pdf` capability); treat PDF-derived fields as needing an extra confidence check. |
| **Fuzzy mandate → structured tags** — "we back bold auteur voices" ≠ a budget band | Phase 3 output is inherently softer than Phase 1 hard evidence | Genre/budget-band tags from mandates are stored as **low-confidence** (schema already supports it); ranked below filing-grade evidence, never presented as hard fact. |
| **Brittleness / maintenance** — sites redesign | Adapters rot; breadth = ongoing upkeep | Content-hash change detection flags when a source's structure shifts; adapters fail loudly into a review queue rather than silently mis-extracting. |
| **ToS gating shrinks coverage** — some 🟡 sources return prohibited | Breadth is capped by what's actually permitted; expect gaps | ToS verdict is a hard gate ([02](02-data-source-matrix.md)); dropped sources are logged so coverage gaps are visible, not silent. |
| **Entity-resolution load grows** — more sources = more name variants/SPVs | Dedup quality can degrade as breadth increases | Resolution review queue + `merge_decisions` audit ([03](03-data-schema.md)) scales with volume; re-run eval as breadth grows. |

**Judgment calls that need a human, not more code** (flagged so they're not assumed
away): which funds/commissions to include for a genre-forward focus (curation),
live ToS go/no-go on borderline sources, and validating that a mandate actually maps
to the band/genre it was tagged with. These are exactly the tasks where cheap
delegated labor underdelivers — the *coding* of Phase 3 is delegable, the *judgment*
is not.

**Sequencing to de-risk:** Pareto-first — the ~30–40 major institutional bodies (BFI,
BBC Film, Telefilm, Eurimages, Creative Europe MEDIA, the largest national/regional
funds and film commissions) cover the large majority of institutional soft money and
ship first. The long tail of small regional funds is deferred, not front-loaded.

## Phase 4 — Contacts + verification + assisted drafting

- Pull contact channels from entities' **own public sites / filings** only.
- **Email verification** (the one paid line item); enforce verified-only in exports;
  90-day re-check.
- **Assisted drafting** view: Claude drafts a personalized outreach message per
  entity/project; human copies/sends **from their own inbox** (no bulk send).
- GDPR handling: `is_personal_data`, `gdpr_basis='legitimate_interest'`, suppression
  list, opt-out honoring (see [09](09-legal-ethical-guardrails.md)).
- **Exit criteria:** ranked, contactable, correctly-qualified shortlist with verified
  contacts and ready-to-personalize drafts; coverage caveat shown.

## Phase 5 — Dashboard polish + ranked export

- Filters (budget band, genre, geography, funding type, warm-signal recency),
  per-project matching, CSV/sheet export of the ranked list.
- "Why ranked here" explanations surfaced in the UI.
- **Exit criteria:** the two output forms you asked for — searchable DB + ranked list
  **and** dashboard — are usable by the small team.

## Deferred (explicitly out of v1)

- **Bulk email send** (Resend at scale) — only if you later want the agent to send;
  triggers CAN-SPAM/ESP obligations.
- **Contact-enrichment API** — pluggable behind a flag; add when finding (not just
  verifying) contacts becomes the bottleneck.
- **Licensed budget data** (OpusData / IMDb) — add only if budget coverage becomes
  the binding constraint on qualification quality.
- **Public filmmaker-facing product** (multi-tenant sign-up) — current scope is
  you + a few collaborators.

## Sequencing logic

Hard evidence (Phase 1) before soft signal (Phase 3); resolution + qualification
(Phase 2) before contacts (Phase 4), because there's no point verifying contacts for
entities we haven't correctly qualified or deduplicated. Legal-risk-lowest sources
first; anything 🟡 is gated and reviewed before it's turned on.
