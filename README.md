# Film-financing-agent

An agent that discovers, qualifies, and ranks **funding sources for independent
filmmakers with projects budgeted at $10M or less** — across equity, film funds,
production companies, sales agents / MG distributors, gap/bridge lenders, tax-credit
& soft-money brokers, grants, and equity-crowdfunding, in the US / UK / EU / Canada.

## Status: Phase 0 complete (foundations)

The plan lives in [`docs/`](docs/00-README.md). The build is underway per
[docs/07-roadmap.md](docs/07-roadmap.md):

- ✅ **Phase 0** — schema with integrity constraints (budget provenance, evidence-required
  claims), ToS source gate (DB trigger + code), pg-boss queue skeleton, dashboard
  skeleton with fail-closed auth gate.
- ✅ **Phase 1 (code)** — Wikidata SPARQL + SEC EDGAR Form C ingestion, idempotent,
  evidence on every claim, fixture-tested (20 tests green). Live backfill runs on
  Railway per [docs/11-deployment.md](docs/11-deployment.md) — this container has
  no data-host egress.
- ✅ **Phase 2** — entity resolution (blocking + strong-key merge + review queue),
  money-vs-craft classifier (rule default + Claude adapter behind `ANTHROPIC_API_KEY`),
  cluster-rule qualification, and ranking. `npm run qualify` runs the chain; the
  dashboard shows honest bucket labels. 42 tests green.
- 🟡 **Phase 3 (in progress)** — breadth. Curated institutional funders (national
  film bodies, soft money, grants, tax credits, genre financiers; US/UK/EU/Canada)
  seeded offline via `npm run ingest:bodies`, browsable at `/bodies`. Live fund/prodco
  site scraping (Firecrawl) is deferred until API key + egress. 46 tests green.

### Development

```bash
npm install
# local Postgres with pgvector, then:
export DATABASE_URL='postgres://root@localhost/filmfund_dev?host=%2Fvar%2Frun%2Fpostgresql'
npm run migrate         # apply packages/db/migrations
npm test                # 11 integrity tests (creates/drops its own test DBs)
npm run build -w @filmfund/dashboard && npm run start -w @filmfund/dashboard
```

Layout: `packages/db` (migrations + client) · `packages/pipeline` (queues, ToS gate,
stage skeletons) · `apps/dashboard` (Next.js, read-only skeleton).

Start here → **[docs/00-README.md](docs/00-README.md)**

| Doc | Contents |
|-----|----------|
| [01-architecture.md](docs/01-architecture.md) | Pipeline + stack (scrape → extract → resolve → enrich → score) |
| [02-data-source-matrix.md](docs/02-data-source-matrix.md) | Every source + a legality verdict |
| [03-data-schema.md](docs/03-data-schema.md) | Entity / Film / FinancingRelationship / Contact / Evidence |
| [04-qualification-methodology.md](docs/04-qualification-methodology.md) | Money-vs-craft, the cluster rule, budget provenance |
| [05-verification-and-honest-math.md](docs/05-verification-and-honest-math.md) | Verification rules + honest coverage limits |
| [06-cost-estimate.md](docs/06-cost-estimate.md) | Realistic run-rate cost |
| [07-roadmap.md](docs/07-roadmap.md) | Phased build |
| [08-gotchas.md](docs/08-gotchas.md) | Traps to avoid |
| [09-legal-ethical-guardrails.md](docs/09-legal-ethical-guardrails.md) | ToS / GDPR / CAN-SPAM posture |

**Core honesty principle:** a large share of sub-$10M film financing comes from
private individuals, family offices, and single-purpose SPVs that leave little public
trace. This agent is designed toward *discoverable, contactable, correctly-qualified*
sources ranked by warm signal — **not** toward a complete list of investors.
