import type { CuratedBody } from "./curatedBodies.js";

/**
 * Individual-backed film vehicles (Phase 3b — the compliant version of the
 * "fringe/individual investor" ask). These are real production companies and
 * funds with a PUBLIC film-financing footprint, tied to named principals
 * (athletes, founders, artists, financiers) acting in their professional
 * capacity.
 *
 * Deliberate compliance choices (docs/09):
 *  - The contactable entity is the VEHICLE (a company with public channels),
 *    not a person. We store the principals' names (public/professional), never
 *    their personal phone/email.
 *  - Nothing is scraped and nothing is guessed. This is a curated, verifiable
 *    Pareto seed to review/expand — not a list of "rich people to cold-pitch."
 *  - We do NOT include private individuals with no public film-financing trace;
 *    that's the category the plan (docs/05) says is invisible and shouldn't be
 *    fabricated.
 *
 * Genre tags only where the vehicle genuinely specializes.
 */
export const CURATED_INDIVIDUALS: CuratedBody[] = [
  // ---------- Individual financiers / family-office vehicles ----------
  { name: "Annapurna Pictures", type: "production_company", country: "US", website: "annapurna.com", fundingTypes: ["equity"], principals: ["Megan Ellison"], mandate: "Financier-founded studio backing filmmaker-driven features." },
  { name: "Madison Wells", type: "fund", country: "US", website: "madisonwells.com", fundingTypes: ["equity"], principals: ["Gigi Pritzker"], mandate: "Media finance and production company founded by an individual investor." },
  { name: "Black Bear Pictures", type: "production_company", country: "US", website: "blackbearpictures.com", fundingTypes: ["equity"], principals: ["Teddy Schwarzman"], mandate: "Independent financier/producer of features across budgets." },

  // ---------- Athlete-founded vehicles ----------
  { name: "The SpringHill Company", type: "production_company", country: "US", website: "springhillcompany.com", fundingTypes: ["equity"], principals: ["LeBron James", "Maverick Carter"], mandate: "Athlete-founded media company producing film and TV." },
  { name: "Unanimous Media", type: "production_company", country: "US", website: "unanimousmedia.com", fundingTypes: ["equity"], principals: ["Stephen Curry", "Erick Peyton"], mandate: "Athlete-founded producer of film, TV and digital." },
  { name: "Thirty Five Ventures", type: "production_company", country: "US", website: "thirtyfiveventures.com", fundingTypes: ["equity"], principals: ["Kevin Durant", "Rich Kleiman"], mandate: "Athlete-founded media and production venture." },
  { name: "Seven Bucks Productions", type: "production_company", country: "US", website: "sevenbucksprods.com", fundingTypes: ["equity"], principals: ["Dwayne Johnson", "Dany Garcia"], mandate: "Talent-founded producer of studio and independent features." },

  // ---------- Artist / talent-founded vehicles ----------
  { name: "Plan B Entertainment", type: "production_company", country: "US", website: "planbent.com", fundingTypes: ["equity"], principals: ["Brad Pitt", "Dede Gardner", "Jeremy Kleiner"], mandate: "Talent-founded producer of prestige and independent features." },
  { name: "Hello Sunshine", type: "production_company", country: "US", website: "hello-sunshine.com", fundingTypes: ["equity"], principals: ["Reese Witherspoon"], mandate: "Founder-led media company producing film and TV." },
  { name: "Hoorae Media", type: "production_company", country: "US", website: "hoorae.co", fundingTypes: ["equity"], principals: ["Issa Rae"], mandate: "Founder-led media company across film, TV and digital." },
  { name: "Westbrook Inc", type: "production_company", country: "US", website: "westbrookinc.com", fundingTypes: ["equity"], principals: ["Will Smith", "Jada Pinkett Smith"], mandate: "Talent-founded media and production company." },

  // ---------- Genre-specialized individual vehicles ----------
  { name: "Atomic Monster", type: "production_company", country: "US", website: "atomicmonster.com", fundingTypes: ["equity"], genres: ["genre_horror", "thriller"], principals: ["James Wan"], mandate: "Filmmaker-founded genre (horror/thriller) production company." },
  { name: "Hidden Empire Film Group", type: "production_company", country: "US", website: "hiddenempire.com", fundingTypes: ["equity"], genres: ["genre_horror", "thriller"], principals: ["Deon Taylor", "Roxanne Avent"], mandate: "Independent, self-financing genre producer." },
];
