# 08 — Gotchas (running list)

Traps and mistakes to avoid. Seeded from the brief and expanded during planning.
Treat this as living — add to it as we build.

## Seed list (from the brief)

1. **EP/producer credit ≠ money.** Don't treat credits as financing without
   classification. A "producer" is often craft; an "executive producer" is an
   unreliable money signal. Use the classifier + confidence, and let low-confidence
   credits stay `unknown` (see [04](04-qualification-methodology.md)).
2. **IMDbPro & LinkedIn scraping is prohibited — never design it in.** Their terms
   forbid automated access; it risks bans and legal exposure. Public IMDb pages are
   also ToS-restricted. If IMDb data is truly needed, license it (see
   [02](02-data-source-matrix.md)).
3. **Budget data is unreliable and often missing.** Provenance + an explicit
   `unknown` state are required. Never fabricate a number to force a decision.
4. **Entity resolution is the silent killer.** The same fund/person appears under
   many spellings and shell LLCs. Resolution is a first-class stage with an audit
   trail, not a cleanup afterthought.
5. **Stale contacts.** Film-company emails rot fast. Verify before use and re-verify
   on a freshness window (90 days).
6. **The one-off false positive.** A single sub-$10M credit doesn't make someone a
   sub-$10M financier. The cluster rule (N≥3 known budgets, median ≤ $10M, 60% floor,
   mixed-scale demotion) is the control.
7. **Silent private money.** The biggest slice of indie funding — private
   individuals, family offices, single-purpose SPVs — is invisible to public
   scraping. Don't promise completeness; rank the visible set well.

## Added during planning

8. **robots.txt permission ≠ ToS permission.** Firecrawl honoring robots.txt is
   necessary but not sufficient. Several sources (IMDb family, LinkedIn, some trade
   press) forbid automated access in their Terms regardless of robots.txt. The ToS
   verdict is a hard gate in code, checked before storing anything.
9. **Wikipedia is a pointer, not a source.** A Wikipedia budget is only as good as
   its citation. Follow the citation to the primary source and record *that* as
   provenance. Also: Wikipedia is CC BY-SA (attribution + share-alike); Wikidata is
   CC0 (no attribution) — don't conflate their license obligations.
10. **The Numbers / Box Office Mojo are not free-scrape budget sources.** The
    Numbers reserves scraping/redistribution to licensed OpusData customers and
    restricts AI-dataset use; Box Office Mojo is in the IMDb/Amazon ToS family. Use
    them as manual references or license OpusData — don't automate against the free
    HTML.
11. **"Executive Producer" inflation.** Vanity/again-favor EP credits are common on
    indies. Don't let a pile of EP credits masquerade as a financing pattern; require
    financing *language* or filing evidence.
12. **SPV name collisions.** `<Common Word> Productions LLC` recurs across unrelated
    films. Don't merge SPVs on name alone; require shared principals/address/filing
    evidence, and keep SPVs distinct from their backers via `parent_entity_id`.
13. **Currency and year drift.** A "£3M" 2012 budget and a "$3M" 2024 budget aren't
    the same band. Normalize to USD at film-year rates before banding; keep originals
    in evidence.
14. **Role confusion in the financing enum.** An MG advance or gap loan is *money*
    but it's **debt/advance, not equity** — classify the role precisely. A filmmaker
    needs to know whether a source gives equity, lends, or guarantees a sale.
15. **Sales agents ≠ financiers (usually).** A sales agent attaching to a film is a
    market signal and sometimes provides an MG, but attachment alone isn't financing.
    Tag the relationship type honestly.
16. **GDPR applies because geography includes UK/EU.** Individuals' contact data is
    personal data. Minimize collection, record `legitimate_interest`, keep it
    relevant to the recipient's role, honor opt-outs, and maintain a suppression
    list — even though v1 doesn't bulk-send (see [09](09-legal-ethical-guardrails.md)).
17. **Assisted-draft ≠ licence to spam.** Because a human sends from their own inbox,
    we avoid bulk-sender rules — but the same GDPR relevance/consent-basis and
    opt-out expectations still apply to the *stored* data and any message sent.
18. **Trade-press article text is not ours to store.** Extract and store *facts +
    citation*, not the article body, from 🟡 publisher sources. Keep excerpts minimal
    and attributable.
19. **Confidence is not certainty.** A high classifier confidence is still a model
    judgment on ambiguous evidence. Keep `rationale` + evidence so a human can
    overturn any classification; surface confidence in the UI, never hide it.
20. **Threshold overfitting.** The cluster-rule thresholds can be tuned to look great
    on the labeled set and fail in the wild. Keep the eval set representative, prefer
    precision, and re-label periodically.
21. **Coverage caveat must survive to the export.** It's easy to show honesty in the
    UI and drop it from the CSV a filmmaker actually uses. The completeness caveat
    travels with every export.
22. **"Active" ≠ "still investing."** A fund with a 2019 mandate page may be dormant.
    Warm-signal recency guards against presenting stale players as live money.
