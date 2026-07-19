# 04 — Investor-Qualification Methodology

This doc makes the Step 2 hard problems concrete. The naive spec — "find people who
invested in a film under $10M" — is a trap for three reasons, each addressed below.

## Problem 1 — Investor vs. creative credit (money vs. craft)

**The trap:** treating every "producer" as a financier. A *producer* credit is
often creative (physical production, packaging, showrunning). An *executive
producer* credit *sometimes* signals money but is unreliable — it's handed out for
financing, for talent attachment, for a favor, or for a sales guarantee.

**Our approach — a classifier with a confidence score, not a role lookup.**

For each `financing_relationship`, we output `is_financial ∈ {true,false,unknown}`
and `financier_confidence ∈ [0,1]` using layered signals:

| Signal | Weight toward "financial" | Example |
|--------|---------------------------|---------|
| Named in an SEC Form C / 1-A as issuer, principal, or investor | Very high | Hard filing evidence. |
| Trade-press sentence explicitly attributing financing ("financed by", "fully funded by", "equity from", "MG from", "gap loan from") | High | Deal announcements. |
| Fund/prodco with a public *mandate* to finance at this budget band | High | The entity says it invests. |
| "Executive Producer" credit with **no** financing language nearby | Low / ambiguous → `unknown` | Could be money, could be a favor. |
| "Producer" / "Co-Producer" credit only | Very low (defaults to craft) | Treated as creative unless other evidence. |
| Sales agent / distributor attached (MG context) | Medium (financial, but debt/advance not equity) | Classify role precisely, not just "investor". |

Implementation: Claude (`claude-opus-4-8` for this call) reads the evidence excerpt
and returns `{is_financial, role, confidence, rationale}` constrained to a JSON
schema, **citing the span** that justifies it. Rules override the model on strong
evidence (a Form C naming the entity forces `is_financial=true`). Anything the
model can't ground stays `unknown` — we do **not** promote craft credits to money.

**Consequence for qualification:** only relationships with
`is_financial=true AND financier_confidence ≥ τ_fin` (τ_fin ≈ 0.6, tunable) count
toward qualifying an entity as a financier. EP/producer credits below the threshold
are stored for context but don't qualify anyone.

## Problem 2 — Cluster logic, not one-off logic

**The trap:** flagging a financier who normally backs $80M studio films because they
once touched a $4M passion project. One sub-$10M credit ≠ a sub-$10M financier.

**The cluster rule (explicit and testable):**

An entity **qualifies as a sub-$10M financier** only if *all* of:

1. **Minimum data points:** it has `N ≥ 3` financing relationships where
   `is_financial=true AND financier_confidence ≥ τ_fin`, **and** the associated films
   have a *known* budget (`budget_confidence ∈ {reported, estimated}`). Call this the
   set `K` (known-budget financed films).
2. **Known-budget coverage:** `|K| / (total qualifying financed films) ≥ 0.5` — we
   know budgets for at least half its financing activity. Below this, the entity is
   `insufficient_data`, **not** auto-qualified and **not** auto-rejected.
3. **Central-tendency test:** `median(budget of K) ≤ $10M` **AND** at least
   `⌈0.6·|K|⌉` of `K` are `≤ $10M`. Median guards against one big outlier; the 60%
   floor guards against a bimodal "mostly huge, a couple tiny" profile.
4. **Not primarily a mega-budget shop:** if `max(K)` is `> $30M` *and* the entity's
   *overall* known slate skews above $10M, it's flagged `mixed_scale` and
   down-ranked, even if criteria 1–3 technically pass on a subset.

Entities are bucketed:

- `qualified_sub10m` — passes all four.
- `insufficient_data` — too few known budgets to judge (the honest state for a lot of
  private/opaque backers).
- `mixed_scale` — backs sub-$10M sometimes but is really a bigger-budget player.
- `out_of_band` — consistently finances above $10M.

Only `qualified_sub10m` is presented as a primary match; `insufficient_data` can be
surfaced as "worth investigating" **clearly labeled as unverified**, never as a
confirmed sub-$10M financier.

Thresholds (`N`, coverage 0.5, 60% floor, $30M) live in config and are tunable with
a labeled test set (see [05](05-verification-and-honest-math.md)).

## Problem 3 — Budget provenance

**The trap:** budget figures are frequently missing, estimated, or wrong — and a
qualification decision built on a fabricated number is worse than no decision.

**Rules:**

- Every budget used in a decision carries `budget_confidence ∈ {reported, estimated,
  unknown}` **and** an evidence link.
  - `reported` — a primary or citable source states the figure (a filing, a
    financing announcement, a Wikipedia-*cited* primary source). We store the
    citation, not "Wikipedia says."
  - `estimated` — a range or trade estimate; used with reduced weight.
  - `unknown` — no defensible figure. **This is valid.** The film simply doesn't
    contribute a budget to the cluster math; it's counted in "total financed films"
    but not in `K`.
- **Never fabricate** a budget to force a decision. If a decision needs a budget we
  don't have, the output is `insufficient_data`, not a guess.
- **Currency + year normalization:** convert to USD at film-year rates for banding;
  record original currency/amount in evidence.

## Genre affinity (your genre-forward, tag-all decision)

We do not pre-filter by genre. Each entity carries `genre_affinity[]` inferred from
the genres of the films it has financed and its stated mandate. In ranking, matches
whose `genre_affinity` includes the project's band get a boost, with **genre/horror
weighted up** per your focus — but a genre-agnostic financier isn't excluded.

## Ranking (what "ranked list" means)

`final_score` combines, per project (or globally if no project):

1. **Cluster pass** (gate): non-`qualified_sub10m` entities are ranked below all
   qualified ones and labeled.
2. **Budget-band match** — closeness of the entity's observed bands to the project's.
3. **Genre-affinity match** — with genre/horror weighting.
4. **Warm signal** — recency and relevance of the last qualifying deal, measured by
   `financing_relationships.deal_date` (a fund active this year outranks one last seen
   in 2015). **Genre-specific recency** is first-class: for a horror project, the
   signal that matters most is *"financed a `genre_horror` film recently,"* not
   *"financed anything recently."* The ranker computes recency **within the project's
   genre band** — an entity whose last horror deal was 2024 outranks one whose last
   horror deal was 2016 even if it financed a drama last month.
5. **Contactability** — a verified contact present outranks none (an entity you can't
   reach is a weak lead regardless of fit).

Every score row stores an `explanation` so the dashboard can show *why* an entity is
ranked where it is — no black-box ordering.

## Named output: "recent financiers of genre X"

This is a first-class query and export, because it's one of the most useful views for
a filmmaker: **who put actual money into films of my genre, recently?**

Definition (all conditions):
- `financing_relationships.is_financial = true AND financier_confidence ≥ τ_fin`
  (money, not craft),
- linked `films.genre_bands` contains the target band (e.g. `genre_horror`),
- `deal_date` within the chosen window (default: last 3 years; user-adjustable),
- geography ∈ the project's markets.

The result is the set of entities meeting the above, ranked by genre-specific warm
signal + budget-band fit + contactability, each row carrying the films/deals that put
it on the list and their evidence. Entities that pass the genre/recency filter but
fail the sub-$10M **cluster rule** are shown **labeled** (`mixed_scale` /
`insufficient_data`), not silently mixed in with confirmed sub-$10M financiers.

Honest caveats that ship with this view:
- **Recency is only as good as `deal_date` coverage.** Where we could only date a
  deal to the film's year, the row is marked estimated; undatable deals are excluded
  from the window rather than assumed recent.
- **It lists the *visible* financiers of the genre** — the private individual / SPV
  that quietly funded a horror film with no filing or announcement won't appear (see
  [05](05-verification-and-honest-math.md), coverage reality).

## Worked example (illustrative)

- Entity: "Nightshade Pictures" (`production_company`).
- 5 qualifying financial relationships; 4 have known budgets: $2.5M, $4M, $6M, $3.5M
  (`K`, coverage 4/5 = 0.8 ≥ 0.5 ✓). Median $3.75M ≤ $10M ✓; 4/4 ≤ $10M ≥ 60% ✓;
  max $6M not > $30M ✓ → **`qualified_sub10m`**.
- Genre affinity: {genre_horror, thriller} → strong boost for a horror project.
- Warm signal: last deal 2025 → high.
- Verified contact from their own site → contactable.
- Result: top-ranked for a $4M horror project, with an explanation citing the four
  budgeted films and the 2025 deal.

Contrast: "Atlas Global Films" once EP'd a $5M film but its other 12 known films are
$40M–$120M → median well above $10M → **`mixed_scale`**, down-ranked and labeled,
even though it has one sub-$10M credit. That's the one-off false-positive control
working as intended.
