# 10 — Producer Brief (scoped deliverable)

A scoped instantiation of the plan for a specific prospective client — a film
producer who may fund the data setup + build. Shareable versions:

- **Web one-pager (artifact):** https://claude.ai/code/artifact/50e96da0-fc64-48c6-8867-5977f9c1e15b
- **PDF:** [`producer-brief.pdf`](producer-brief.pdf) · source: [`producer-brief.content.html`](producer-brief.content.html) (artifact) / [`producer-brief.standalone.html`](producer-brief.standalone.html) (PDF render)

## The producer's ask

> "Basically looking for every movie financing company in the last 10 years that has
> made horror and sci-fi movies in both America, Europe and Canada."

## How it maps to the plan

This is the **"recent financiers of genre X"** named output ([04](04-qualification-methodology.md))
scoped to: genre = horror + sci-fi; territory = US / Europe / Canada; window = last
10 years (by `deal_date`); entity types = all; and the **money-vs-craft** classifier
turns "made" into "financed."

## Scope (confirmed with the intermediary)

| Dimension | Decision |
|-----------|----------|
| Genre | Horror + sci-fi (incl. genre-blend; boundary confirmed before the run) |
| Territory | US, Europe, Canada |
| Window | Financing active in the last 10 years (deal-dated) |
| Budget band | **≤ $10M indie band first**; all-budgets is a funded add-on, not a rebuild |
| Entity types | Companies & funds, **sales agents / MG distributors**, tax-credit / soft-money bodies, and individual financiers where public |
| "Financed, not filmed" | Only entities evidenced as putting up money; craft credits excluded |

> Genre note: horror/sci-fi money is disproportionately **sales-agent / MG-driven**,
> so including those entity types is substantive, not padding.

## The coverage promise (the credibility-saver)

Delivered: **every financier discoverable from public record**, correctly qualified
and ranked, with provenance + confidence on every claim. **Not** promised: "every
financier, full stop" — private individuals, family offices, and single-film SPVs
leave no public trace and will be missed. Comprehensive and evidenced, not "complete."

## What the producer's money buys (data quality)

Recommended up front for this genre ask:
- **OpusData** — reliable budgets (the weak link) — ~$20–250/mo or one-time extract.
- **Cinando (Cannes / AFM)** — sales-agent / buyer database, where genre money sits —
  ~$50–100/mo amortized via accreditation.

Optional, only if a measured gap demands it: IMDb commercial (~$500–2,000+/mo),
Variety Insight / Studio System (~$300–1,000+/mo). See [06](06-cost-estimate.md) for
the full optimization framework.

## The numbers (planning-grade; confirm with vendor quotes)

| Item | Amount |
|------|--------|
| One-time data setup & corpus build | $400–900 |
| Market-data access — Cinando (1 yr, optional) | $300–700 |
| Platform & running data | $115–350 / mo |
| Professional fee — build & delivery | **to be set by Marcus** (suggested: fixed project fee, ~3–5 focused weeks) |
| **To start** | **~$900–1,900 + fee** |

## Delivery

- **Weeks 1–2** — first ranked draft from hard evidence (filings + trade announcements).
- **Weeks 3–5** — breadth (sales agents, soft money, fund/prodco mandates) + verified contacts.
- **Weeks 6–8** — full delivery: searchable DB, ranked shortlist, dashboard, export.

## To green-light

1. Confirm the genre boundary (sci-fi tightness / genre-blend).
2. Confirm the European territories that matter most.
3. Approve the one-time data setup.
4. Agree the professional fee.

> Regenerate the PDF after editing `producer-brief.content.html`: rebuild
> `producer-brief.standalone.html` (wrap with `data-theme="light"`) and print via
> headless Chromium. Republish the artifact from `producer-brief.content.html` to keep
> the same URL.
