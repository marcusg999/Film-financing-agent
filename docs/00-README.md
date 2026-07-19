# Indie Film Funding Agent — Planning Docs

**Status: PLAN ONLY. No production code has been written. Awaiting approval.**

This directory is the complete plan for an agent that discovers, qualifies, and
ranks **funding sources for independent filmmakers with projects budgeted at
$10M or less**. The goal is to help indie filmmakers find money — and to do it
honestly, legally, and without over-promising completeness.

## How to read these docs

| Doc | What it answers |
|-----|-----------------|
| [01-architecture.md](01-architecture.md) | The pipeline and stack (scrape → extract → resolve → enrich → score), with the default stack justified or adapted per component. |
| [02-data-source-matrix.md](02-data-source-matrix.md) | Every candidate source: what it provides, access method, and a **legality verdict** (permitted / needs-license / prohibited). |
| [03-data-schema.md](03-data-schema.md) | Entity / Film / FinancingRelationship / Contact / Evidence tables. Confidence + provenance are required fields. |
| [04-qualification-methodology.md](04-qualification-methodology.md) | The Step 2 hard problems made concrete: money vs. craft classification, the cluster rule, budget provenance. |
| [05-verification-and-honest-math.md](05-verification-and-honest-math.md) | Testable verification rules, false-positive controls, and a plain statement of coverage limits. |
| [06-cost-estimate.md](06-cost-estimate.md) | Realistic run-rate (scraping, tokens, storage, verification). Not optimistic. |
| [07-roadmap.md](07-roadmap.md) | Phased build: what ships first, what's deferred. |
| [08-gotchas.md](08-gotchas.md) | Running list of traps to avoid. Seeded and expanded. |
| [09-legal-ethical-guardrails.md](09-legal-ethical-guardrails.md) | ToS per source, personal-data minimization, GDPR/CAN-SPAM posture. |

## Scope decisions (from the Step 1 interview)

These answers drive every doc. If any is wrong, tell me and the plan changes.

| # | Decision | Your answer | Consequence in the plan |
|---|----------|-------------|-------------------------|
| 1 | **Funding scope** | **Everything** — equity investors, film funds, production companies, sales agents / MG-providing distributors, gap/bridge lenders, tax-credit & soft-money brokers, grant bodies, equity-crowdfunding backers | `Entity.type` is a wide enum; each type gets its own qualification logic. "Investor" is never treated as the whole universe. |
| 2 | **Geography** | **US / UK / EU / Canada** | GDPR is live (EU + UK GDPR). Soft-money landscape is large (BFI, BBC Film, Telefilm, Eurimages, national funds, state/provincial credits). |
| 3 | **Genre** | **Genre/horror-forward, but tag all bands** | We don't pre-filter by genre; every source carries `genre_affinity` tags. Genre/horror sources get priority weighting in ranking. |
| 4 | **Output** | **Searchable DB + ranked list *and* dashboard** | Postgres-backed store + a read/filter dashboard for a small team. Ranked export is a first-class output. |
| 5 | **Outreach** | **Discovery + assisted drafting** (human sends from their own inbox) | The agent drafts personalized outreach; it does **not** bulk-send. This keeps us out of CAN-SPAM bulk-sender rules and ESP reputation risk, while GDPR still governs *storing* EU personal contact data. |
| 6 | **Data budget** | **Public data + email-verification only**, architected to add contact enrichment later | No licensed IMDb, no enrichment API in v1. Enrichment is a pluggable interface behind a feature flag so we can add it without refactoring. |
| 7 | **Users** | **Me + a few collaborators** | Small-team auth (Supabase Auth, invite-only). No public multi-tenancy, no filmmaker-facing sign-up in v1. |

## The one-paragraph honest summary

A public-data agent can build a genuinely useful, ranked, contactable map of the
**visible** indie-financing world: funds and prodcos with public mandates, sales
agents and MG distributors named in trade-press deal announcements, soft-money
bodies and grants with published criteria, and equity-crowdfunding raises on file
with the SEC and platforms. It will **systematically miss** the largest slice of
sub-$10M money — private individuals, family offices, and single-purpose SPVs
that leave little to no public trace. We design toward *discoverable, contactable,
correctly-qualified* sources ranked by warm signal, **not** toward a complete list
of investors. Saying otherwise would be dishonest math.
