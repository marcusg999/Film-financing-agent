# Film-financing-agent

An agent that discovers, qualifies, and ranks **funding sources for independent
filmmakers with projects budgeted at $10M or less** — across equity, film funds,
production companies, sales agents / MG distributors, gap/bridge lenders, tax-credit
& soft-money brokers, grants, and equity-crowdfunding, in the US / UK / EU / Canada.

## Status: planning only

No production code yet. The complete plan lives in [`docs/`](docs/00-README.md) and
is awaiting approval before anything is scaffolded.

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
