# 02 — Data-Source Matrix (with a legality verdict per source)

**Verdicts were checked against current (2026) terms during planning, not assumed
from training data.** Sources and links reviewed are listed at the bottom. Verdicts:

- 🟢 **Permitted** — public/official access, terms allow our use (often with
  attribution or rate limits).
- 🟡 **Needs-license / conditional** — usable only under a license, an official API
  key, or narrow conditions; do not scrape the free HTML.
- 🔴 **Prohibited** — terms forbid automated access; **do not design scraping of it.**

> A recurring rule: **robots.txt permission is not ToS permission.** Firecrawl
> honoring robots.txt is necessary but not sufficient — the Terms of Use govern,
> and several sources below forbid automated access regardless of robots.txt.

## The matrix

| Source | Provides | Access method | Verdict | Notes / how we use it |
|--------|----------|---------------|---------|-----------------------|
| **IMDb (public pages)** | Credits, some budgets | HTML | 🔴 Prohibited | Conditions of Use forbid "data mining, robots, screen scraping, or similar." Do **not** scrape. If IMDb data is needed, use **IMDb commercial licensing** (🟡). |
| **IMDbPro** | Contacts, reps, credits | HTML (auth) | 🔴 Prohibited | Explicitly forbids scraping; account ban + legal exposure. **Never designed in.** |
| **LinkedIn** | People, roles, employers | HTML (auth) | 🔴 Prohibited | User Agreement bans scraping in plain terms. **Never designed in.** |
| **IMDb commercial data license** | Budgets, credits, titles | Licensed feed | 🟡 Needs-license | The compliant way to get IMDb data. Out of v1 budget (public-data-only), noted as a future paid option. |
| **The Numbers (the-numbers.com)** | Reported budgets, box office | HTML / OpusData API | 🟡 Needs-license | Personal-use viewing only; "systematic copying, scraping, redistribution reserved to licensed OpusData customers," and AI-dataset use needs written permission. So: **no scraping.** Use as a manual reference, or license **OpusData** for programmatic budgets. |
| **Box Office Mojo** | Box office (few budgets) | HTML | 🔴 Prohibited (scraping) | Amazon/IMDb-owned; same Conditions-of-Use family as IMDb. Treat as prohibited for automated access. |
| **Wikipedia** | Budgets *with citations*, credits | API / dumps | 🟢 Permitted (CC BY-SA 4.0) | Commercial reuse allowed **with attribution + share-alike**. Use the **MediaWiki API / dumps**, not scraping. Crucially: follow the **citation** on a budget to the primary source and record *that* as provenance — Wikipedia is a pointer, not the authority. |
| **Wikidata** | Structured film/entity facts | SPARQL / dumps | 🟢 Permitted (CC0) | Public-domain structured data, no attribution required. Excellent backbone for entity IDs and disambiguation. |
| **SEC EDGAR — Reg CF / Form C** | Film equity-crowdfunding raises, issuer, target, security, principals | Official API + full-text search + bulk | 🟢 Permitted | U.S. government data, public. Best *hard-evidence* source for actual film financing entities. Fair-access rate limits + declared User-Agent required. High-value: names issuers, amounts, and often principals. |
| **SEC EDGAR — Reg A / Form 1-A** | Larger film raises | Official API | 🟢 Permitted | Same as above for Reg A film offerings. |
| **Equity-crowdfunding platforms** (Wefunder, StartEngine, Republic, etc.) | Live film raises, backers count, terms | HTML / any official API | 🟡 Conditional | Check each platform's ToS before automated access; several restrict scraping. Prefer their APIs/RSS where offered, else the SEC Form C for the same raise. Backer *identities* are generally not public — don't imply they are. |
| **Trade press — Variety, Deadline, THR, ScreenDaily, IndieWire** | Financing/packaging/sales deal announcements | HTML | 🟡 Conditional | These announce *who financed/sold/packaged* a film — extremely high signal. **But** major publisher terms (incl. PMC-owned Variety/Deadline/THR) restrict automated scraping and AI use. Posture: read **official RSS/sitemaps** and **licensed news APIs** where available; for full articles rely on human-in-the-loop capture or a licensed feed. **Do not build silent bulk scraping of paywalled trade press.** Store only extracted facts + citation, not article text. |
| **Festival databases** (Sundance, SXSW, Tribeca, TIFF, Cannes Marché) | Selected films, producers, sales status | HTML / some APIs | 🟡 Conditional | Public program pages are usually readable; check each festival's terms and rate-limit. Great for surfacing active indie titles and their teams to trace financing from. |
| **Film-fund & production-company websites** | Mandates, budget bands, genre focus, submission process, **contact** | HTML | 🟢 Permitted (with care) | An entity's *own* public site is the cleanest, most defensible contact + mandate source. Respect robots.txt/rate limits. This is the primary contact channel in v1. |
| **Soft-money / public film bodies** (BFI, BBC Film, Telefilm Canada, Eurimages, Creative Europe MEDIA, national/regional funds) | Grant/loan mandates, eligibility, deadlines, sometimes awardee lists | HTML / open-data portals | 🟢 Permitted | Core of the UK/EU/Canada soft-money map. Many publish open data on awards — high-value, low-risk. |
| **Film commissions & incentive directories** (state/provincial/national) | Tax-credit programs, brokers, eligibility | HTML / gov open data | 🟢 Permitted | Public-sector data. Maps the tax-credit/soft-money side of "everything" scope. |
| **Grant directories** (Sundance Inst., IDA, Doc Society, foundations) | Grants, criteria, deadlines | HTML | 🟢 Permitted (with care) | Especially relevant for the doc-adjacent and prestige bands; readable public pages, respect terms. |
| **Company registries** (SEC CIK, UK Companies House, OpenCorporates) | Legal entity identity, principals, addresses | Official API / bulk | 🟢 Permitted (Companies House, SEC) / 🟡 (OpenCorporates: API terms) | Backbone for **entity resolution** and shell-LLC untangling. Companies House has a free official API; SEC provides CIK. OpenCorporates has its own API terms — use the API, not scraping. |

## Source strategy summary

- **Hard evidence of financing** comes cleanly from **SEC EDGAR (Form C / 1-A)** and
  **public soft-money bodies** — build on these first; they're 🟢 and authoritative.
- **Deal signal** comes from **trade press** — high value but 🟡; we extract *facts +
  citations* via permitted channels, never bulk-scrape paywalled article bodies.
- **Mandates + contacts** come from **entities' own public sites** (🟢) — the
  defensible way to get contactable, current outreach targets.
- **Identity/dedup backbone** comes from **Wikidata (CC0)**, **Wikipedia (CC BY-SA)**,
  and **company registries** (🟢).
- **Budgets** are the weak link: the good machine-readable sources (The Numbers,
  IMDb) are 🟡 needs-license. In v1 we take budgets from **Wikipedia-cited primary
  sources** and **trade-press announcements**, mark them `reported`/`estimated`/
  `unknown`, and treat "unknown" as valid (see [04](04-qualification-methodology.md)).
- **Never**: IMDb/IMDbPro/LinkedIn scraping (🔴). These are designed *out*.

## Sources reviewed during planning

- IMDb Conditions of Use — https://www.imdb.com/conditions/ ; "Can I use IMDb data in my software?" help article.
- The Numbers Terms of Service — https://www.the-numbers.com/terms-of-service ; Data Services / OpusData — https://www.the-numbers.com/data-services
- SEC EDGAR Reg CF guidance — https://www.sec.gov/resources-small-businesses/small-business-compliance-guides/regulation-crowdfunding-guidance-issuers ; Form C EDGAR filing guidance.
- Firecrawl robots.txt handling — https://webscraping.ai/faq/firecrawl/how-does-firecrawl-handle-robots-txt-files
- Wikidata Licensing (CC0) — https://www.wikidata.org/wiki/Wikidata:Licensing ; Wikipedia CC BY-SA 4.0 move — https://creativecommons.org/2023/06/29/wikipedia-moves-to-cc-4-0-licenses/
- General scraping-legality / ToS-vs-robots.txt — https://cloro.dev/blog/website-scraping-legal/ , https://www.browserless.io/blog/is-web-scraping-legal

> These verdicts should be **re-checked before build**, and re-checked periodically —
> terms change. The matrix is a living document; treat any 🟡/🔴 as a hard gate in code.
