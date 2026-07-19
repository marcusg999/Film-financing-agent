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
