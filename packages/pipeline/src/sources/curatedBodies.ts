/**
 * Curated institutional funders (Phase 3 breadth, docs/07). Public-record
 * bodies that don't appear in film-credit data: national film funds, soft-money
 * bodies, grant givers, tax-credit offices, and well-known genre financiers,
 * across US / UK / EU / Canada.
 *
 * This is a hand-compiled Pareto seed (~the biggest institutional players),
 * NOT a complete list. Every entry is ingested with an evidence row linking to
 * its official site, so each is traceable and correctable. Domains + mandates
 * should be re-verified before outreach (docs/08).
 *
 * Genre tags are applied ONLY to genre-specialized financiers; national funds
 * are genre-agnostic (empty `genres`) — they back all genres, so they surface
 * under every genre in the directory rather than being filtered out.
 */

export type EntityTypeLit =
  | "soft_money_body"
  | "grant_body"
  | "tax_credit_broker"
  | "production_company"
  | "sales_agent"
  | "distributor"
  | "fund";

export type GenreLit = "genre_horror" | "thriller" | "sci_fi" | "prestige_drama" | "doc";
export type FundingLit = "equity" | "grant" | "tax_credit" | "mg_advance" | "presale";

export interface CuratedBody {
  name: string;
  type: EntityTypeLit;
  country: string; // ISO 3166-1 alpha-2
  website: string; // canonical domain (also the dedup key)
  fundingTypes: FundingLit[];
  genres?: GenreLit[];
  principals?: string[]; // named individuals behind the vehicle (public/professional)
  mandate: string; // short factual excerpt stored as evidence
}

export const CURATED_BODIES: CuratedBody[] = [
  // ---------- United Kingdom & Ireland ----------
  { name: "British Film Institute (BFI)", type: "soft_money_body", country: "GB", website: "bfi.org.uk", fundingTypes: ["grant"], mandate: "UK national film body; National Lottery development, production and audience funding." },
  { name: "BBC Film", type: "production_company", country: "GB", website: "bbc.co.uk", fundingTypes: ["equity"], mandate: "Feature film arm of the BBC; co-develops and co-finances British features." },
  { name: "Film4", type: "production_company", country: "GB", website: "film4.com", fundingTypes: ["equity"], mandate: "Channel 4's feature film arm; develops and co-finances distinctive British films." },
  { name: "Screen Scotland", type: "soft_money_body", country: "GB", website: "screen.scot", fundingTypes: ["grant"], mandate: "Scotland's screen agency; development and production funding." },
  { name: "Northern Ireland Screen", type: "soft_money_body", country: "GB", website: "northernirelandscreen.co.uk", fundingTypes: ["grant"], mandate: "Northern Ireland screen agency; production funding and incentives." },
  { name: "Screen Ireland (Fís Éireann)", type: "soft_money_body", country: "IE", website: "screenireland.ie", fundingTypes: ["grant"], mandate: "Ireland's national screen agency; development, production and distribution funding." },

  // ---------- Canada ----------
  { name: "Telefilm Canada", type: "soft_money_body", country: "CA", website: "telefilm.ca", fundingTypes: ["grant"], mandate: "Federal cultural agency; production financing for Canadian feature films." },
  { name: "Canada Media Fund", type: "soft_money_body", country: "CA", website: "cmf-fmc.ca", fundingTypes: ["grant"], mandate: "Funds Canadian audiovisual content across platforms." },
  { name: "Ontario Creates", type: "tax_credit_broker", country: "CA", website: "ontariocreates.ca", fundingTypes: ["tax_credit"], mandate: "Ontario agency administering film/TV tax credits and development funds." },
  { name: "Creative BC", type: "tax_credit_broker", country: "CA", website: "creativebc.com", fundingTypes: ["tax_credit"], mandate: "British Columbia agency; tax credits and production support." },
  { name: "SODEC", type: "soft_money_body", country: "CA", website: "sodec.gouv.qc.ca", fundingTypes: ["grant", "tax_credit"], mandate: "Québec's cultural funding agency; production financing and credits." },
  { name: "Raven Banner Entertainment", type: "sales_agent", country: "CA", website: "raven-banner.com", fundingTypes: ["mg_advance", "presale"], genres: ["genre_horror", "sci_fi", "thriller"], mandate: "Genre-focused international sales and distribution (horror, sci-fi, action)." },

  // ---------- European Union / EEA ----------
  { name: "Eurimages", type: "soft_money_body", country: "EU", website: "coe.int", fundingTypes: ["grant"], mandate: "Council of Europe fund; co-production support for European features." },
  { name: "Creative Europe MEDIA", type: "soft_money_body", country: "EU", website: "culture.ec.europa.eu", fundingTypes: ["grant"], mandate: "EU programme supporting development, distribution and co-production." },
  { name: "Centre national du cinéma (CNC)", type: "soft_money_body", country: "FR", website: "cnc.fr", fundingTypes: ["grant"], mandate: "France's national film body; automatic and selective production support." },
  { name: "German Federal Film Board (FFA)", type: "soft_money_body", country: "DE", website: "ffa.de", fundingTypes: ["grant"], mandate: "Germany's federal film funding institution." },
  { name: "Netherlands Film Fund", type: "soft_money_body", country: "NL", website: "filmfonds.nl", fundingTypes: ["grant"], mandate: "Dutch national fund for film development and production." },
  { name: "Danish Film Institute", type: "soft_money_body", country: "DK", website: "dfi.dk", fundingTypes: ["grant"], mandate: "Denmark's national agency; production and development funding." },
  { name: "Swedish Film Institute", type: "soft_money_body", country: "SE", website: "filminstitutet.se", fundingTypes: ["grant"], mandate: "Sweden's national film agency; production support." },
  { name: "Norwegian Film Institute", type: "soft_money_body", country: "NO", website: "nfi.no", fundingTypes: ["grant"], mandate: "Norway's national agency; production grants and incentives." },
  { name: "Finnish Film Foundation", type: "soft_money_body", country: "FI", website: "ses.fi", fundingTypes: ["grant"], mandate: "Finland's national film funder." },
  { name: "Polish Film Institute", type: "soft_money_body", country: "PL", website: "pisf.pl", fundingTypes: ["grant"], mandate: "Poland's national film institute; co-financing of production." },
  { name: "Flanders Audiovisual Fund (VAF)", type: "soft_money_body", country: "BE", website: "vaf.be", fundingTypes: ["grant"], mandate: "Flemish audiovisual fund; development and production support." },
  { name: "Nordisk Film & TV Fond", type: "soft_money_body", country: "EU", website: "nordiskfilmogtvfond.com", fundingTypes: ["grant"], mandate: "Nordic top-up fund for production and versioning." },

  // ---------- United States (incentives & grants) ----------
  { name: "Georgia Film Office", type: "tax_credit_broker", country: "US", website: "georgia.org", fundingTypes: ["tax_credit"], mandate: "Administers Georgia's film production tax credit." },
  { name: "New Mexico Film Office", type: "tax_credit_broker", country: "US", website: "nmfilm.com", fundingTypes: ["tax_credit"], mandate: "Administers New Mexico's film production incentive." },
  { name: "California Film Commission", type: "tax_credit_broker", country: "US", website: "film.ca.gov", fundingTypes: ["tax_credit"], mandate: "Administers California's film & TV tax credit program." },
  { name: "Louisiana Entertainment", type: "tax_credit_broker", country: "US", website: "louisianaentertainment.gov", fundingTypes: ["tax_credit"], mandate: "Administers Louisiana's motion picture production incentive." },
  { name: "Sundance Institute", type: "grant_body", country: "US", website: "sundance.org", fundingTypes: ["grant"], mandate: "Nonprofit; feature film grants, labs and fellowships for independent film." },
  { name: "SFFILM", type: "grant_body", country: "US", website: "sffilm.org", fundingTypes: ["grant"], mandate: "Grants and residencies for narrative and documentary features." },
  { name: "Alfred P. Sloan Foundation (Film Program)", type: "grant_body", country: "US", website: "sloan.org", fundingTypes: ["grant"], genres: ["sci_fi"], mandate: "Funds film and TV that depict science and technology; science-driven and science-fiction narratives." },
  { name: "Cinereach", type: "grant_body", country: "US", website: "cinereach.org", fundingTypes: ["grant"], mandate: "Nonprofit production company and grant-maker for independent features." },

  // ---------- Genre financiers & distributors (US, private) ----------
  { name: "Blumhouse Productions", type: "production_company", country: "US", website: "blumhouse.com", fundingTypes: ["equity"], genres: ["genre_horror", "thriller"], mandate: "Low-budget, high-concept horror and thriller producer/financier." },
  { name: "XYZ Films", type: "production_company", country: "US", website: "xyzfilms.com", fundingTypes: ["equity", "mg_advance"], genres: ["genre_horror", "sci_fi", "thriller"], mandate: "Produces, finances and sells genre features (horror, sci-fi, action, thriller)." },
  { name: "Neon", type: "distributor", country: "US", website: "neonrated.com", fundingTypes: ["mg_advance"], mandate: "Independent distributor; acquires and advances against indie features." },
  { name: "Shudder (AMC Networks)", type: "distributor", country: "US", website: "shudder.com", fundingTypes: ["mg_advance"], genres: ["genre_horror"], mandate: "Horror/thriller streaming distributor; acquisitions and originals." },
];
