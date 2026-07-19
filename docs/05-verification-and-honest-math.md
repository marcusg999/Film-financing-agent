# 05 — Verification & Honest Math

These are stated as explicit, testable rules. They are non-negotiable: the value of
this tool is that its outputs are trustworthy, not that they are numerous.

## Rule 1 — Every budget and every financier classification carries source + confidence

- No `films.budget_amount_usd` without `budget_confidence ∈ {reported, estimated}`
  and a linked `evidence` row (enforced by CHECK + app guard).
- No `financing_relationships` row without `financier_confidence` and an `evidence`
  row.
- Unverifiable data is **flagged** (`unknown` / `insufficient_data`), never guessed.

**Test:** a DB constraint test asserts zero rows violate the above; a CI check fails
the build if any qualifying claim lacks evidence.

## Rule 2 — Contact info must be verified before it's marked usable

- Emails are **verified**, never pattern-guessed. We do **not** synthesize
  `firstname@company.com`.
- Verification in v1: **syntax + MX + SMTP-probe / disposable + role-address check**
  via an email-validation API (the one paid line item allowed by your budget).
  Results map to `verification_status`: `verified | invalid | risky | catch_all |
  unknown`.
- Only `verified` (and non-`suppressed`) contacts appear in exports / draft view.
- `catch_all` and `risky` are shown **labeled**, not as verified.
- Contacts decay: a `verified_at` older than **90 days** is re-checked before reuse
  (film-company emails rot fast — see gotchas).

**Test:** exporter unit test asserts no non-`verified` or `suppressed` contact ever
appears in an outreach draft or CSV export.

## Rule 3 — False-positive controls for the one-off big-financier case

- The **cluster rule** in [04](04-qualification-methodology.md) is the primary
  control: `N ≥ 3` known-budget financed films, ≥50% known-budget coverage, median
  ≤ $10M, ≥60% of known films ≤ $10M, and a `mixed_scale` demotion for
  mostly-mega-budget slates.
- **Labeled evaluation set:** hand-label ~50–100 entities (a mix of true sub-$10M
  financiers, mega-budget shops with a single indie credit, and pure craft-credit
  producers). Measure precision/recall of the `qualified_sub10m` bucket. Tune
  thresholds against this set; **precision is prioritized over recall** — a wrong
  "qualified" is more damaging than a missed lead.
- **Craft-credit guard:** producers/EPs below `τ_fin` never qualify an entity.

**Test:** an eval script reports precision/recall against the labeled set on each
threshold change; a regression that drops `qualified_sub10m` precision below the
agreed floor fails.

## Rule 4 — Coverage reality (said plainly)

> **A large share of sub-$10M film financing comes from private individuals, family
> offices, and single-purpose SPVs that leave little to no public trace. A
> public-data agent will systematically miss them.**

We therefore design toward **discoverable, contactable, correctly-qualified**
entities, ranked by warm signal — **not** toward "a complete list of investors."

Concretely, this means:

- The product **never claims completeness.** UI copy and exports carry a coverage
  caveat.
- What we *can* map well: named funds and prodcos with public mandates, sales agents
  and MG distributors named in deal announcements, soft-money/grant bodies with
  published criteria, and equity-crowdfunding raises on file (SEC / platforms).
- What we *structurally cannot* map: the private individual who wired $2M into a
  friend's SPV with no filing, no announcement, and no web presence. We don't pretend
  otherwise, and we don't fabricate names to fill the gap.
- **SPVs are surfaced but labeled** — a `<Film> Productions LLC` in a Form C is real
  evidence of a raise, but its individual backers are usually not public; we show the
  vehicle and the raise, not invented investor identities.

**Where the ranking earns its keep:** because we can't be complete, we rank the
*visible* set hard by warm signal — recent relevant deals, matching genre/budget
band, and a reachable, verified contact. A short list of correct, reachable,
well-fit sources beats a long list of guesses.

## Rule 5 — Honest run-rate cost (see [06](06-cost-estimate.md))

Cost is estimated realistically, including token spend on classification/resolution
and per-check email verification, with the assumptions shown. No optimistic
hand-waving.

## What "done and verified" means for a claim

A claim (budget, financier status, contact) is **verified** when:

1. It has ≥1 `evidence` row from a **permitted** source (🟢, or 🟡-under-license).
2. Its confidence meets the claim-type threshold.
3. For contacts: it passed email validation within the freshness window.

Anything short of that is surfaced with its actual state (`estimated`, `unknown`,
`unverified`, `insufficient_data`) — visibly, never silently upgraded.
