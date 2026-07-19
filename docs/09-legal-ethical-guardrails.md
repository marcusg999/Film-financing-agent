# 09 — Legal & Ethical Guardrails

Covers Step 7: ToS compliance per source, personal-data handling, and
CAN-SPAM / GDPR posture given your **US/UK/EU/Canada** geography and **assisted-
drafting** outreach model. Where something can't be done compliantly, it says so and
gives the compliant alternative.

## 1. ToS compliance per source (enforced, not aspirational)

- Every source carries a **ToS verdict** (🟢 permitted / 🟡 needs-license / 🔴
  prohibited) in a source-registry table. Ingestion **refuses** 🔴 and
  🟡-without-license sources — it's a hard gate in code, not a guideline (see
  [02](02-data-source-matrix.md), [03](03-data-schema.md)).
- **Prohibited and designed out:** IMDb / IMDbPro / Box Office Mojo scraping,
  LinkedIn scraping. Compliant alternatives: IMDb commercial license; SEC/Wikidata/
  Companies House for the identity backbone; entities' own sites for contacts.
- **Needs-license, handled without scraping:** The Numbers/OpusData (license or use
  manually), trade press (RSS/licensed feeds; store facts+citation, not article
  bodies), equity-crowdfunding platforms (APIs where offered, else SEC Form C).
- **robots.txt is respected but not treated as sufficient** — ToS governs. Rate
  limits and declared User-Agent on every fetch.
- Verdicts are **re-checked before build and periodically after** — terms change.

## 2. Personal contact data — minimize and protect

- **Minimization:** collect the least personal data needed to make contact — prefer
  **role/company channels** (info@, submissions@, a fund's contact form) over named
  individuals' personal addresses. `contacts.is_personal_data` flags anything tied to
  an identifiable individual.
- **Provenance:** every contact links to evidence showing where it was obtained
  (the entity's own public site or a filing). No pattern-guessed addresses.
- **Suppression / opt-out:** a `suppressed` flag and a suppression list; any opt-out
  request is honored across the system and blocks future surfacing.
- **Access control:** invite-only Supabase Auth; RLS so only the small team sees
  contact data. No public exposure of contacts.
- **Retention:** stale/invalid contacts are re-verified or aged out; don't hoard
  personal data indefinitely.

## 3. GDPR (live because geography includes UK + EU)

- **Legal basis:** **legitimate interest** for B2B outreach relevant to the
  recipient's professional role (the recognized basis for targeted, relevant B2B
  contact — not bulk consent). Documented via `contacts.gdpr_basis`.
- **The three-part test is recorded, not assumed:** purpose (help a filmmaker reach a
  genuinely-relevant funder), necessity (contact data is needed to make the intro),
  balancing (targeted, role-relevant, low-volume, easy opt-out → does not override
  the individual's rights). Keep records of *how each contact was acquired and why
  it's relevant* — GDPR expects demonstrable compliance.
- **Data-subject rights:** support access/erasure/objection requests; the suppression
  list operationalizes objection/erasure.
- **Individuals over businesses:** a `production_company` inbox is lower-risk than a
  named person's address. The design biases toward the former.

## 4. CAN-SPAM (US) — and why v1 mostly sidesteps it

- Your outreach decision is **discovery + assisted drafting, human sends from their
  own inbox** — so the agent is **not** a bulk sender in v1. That keeps us out of the
  bulk-sender machinery.
- **Still applied to any message a human sends** with our drafts: accurate From/
  subject, identify the message as outreach, include a physical postal address, and
  honor opt-outs promptly. These are baked into the draft template.
- **If you later enable agent-sent bulk email (Resend):** full CAN-SPAM + GDPR
  sending obligations kick in — verified sender domains (SPF/DKIM/DMARC), one-click
  unsubscribe, suppression enforcement at send time, and per-recipient legal-basis
  checks. That's a deliberate, separate decision — deferred, not assumed.

## 5. Ethical posture

- **Honesty over completeness.** The coverage caveat (private money is invisible)
  ships in the UI *and* every export. We never present a guess as a fact or an
  `insufficient_data` entity as a confirmed financier.
- **No fabricated people.** We surface vehicles (SPVs) and filings as evidence; we do
  not invent investor identities to fill gaps.
- **Filmmaker-serving, not spam-generating.** The tool's worth is a short list of
  correct, reachable, well-fit sources — not volume. Ranking and verification exist to
  keep outreach relevant and welcome.

## 6. What can't be done compliantly (and the alternative)

| Wanted | Why it's not compliant | Compliant alternative |
|--------|------------------------|-----------------------|
| Scrape IMDb/IMDbPro for budgets & contacts | ToS forbids automated access | IMDb commercial license; SEC/Wikidata/own-site for the same needs |
| Scrape LinkedIn for decision-makers | User Agreement forbids scraping | Entities' own public sites; conference/festival public listings; filings |
| Bulk-scrape trade-press articles & store text | Publisher ToS restricts automated access & AI use | RSS/licensed feeds; store extracted facts + citation only |
| Auto-send cold email at scale in v1 | CAN-SPAM/GDPR sender obligations + reputation risk | Assisted drafting; human sends from own inbox; defer bulk send behind a flag |
| Guess `name@company.com` to fill contacts | Unverified personal data; low quality; GDPR risk | Verified addresses from the entity's own public channels only |
