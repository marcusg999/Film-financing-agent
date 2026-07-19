-- 0002_source_registry: per-source ToS verdicts (docs/02) enforced as a gate.
-- A raw_document may only be stored when its source is registered AND its
-- verdict is 'permitted', or 'needs_license' with a held license. Prohibited
-- sources are blocked at the database, not just in application code.

CREATE TABLE source_registry (
  source_name  text PRIMARY KEY,
  tos_verdict  tos_verdict NOT NULL,
  license_held boolean NOT NULL DEFAULT false,
  notes        text,
  terms_url    text,
  checked_at   date NOT NULL
);

CREATE FUNCTION enforce_source_gate() RETURNS trigger AS $$
DECLARE
  reg source_registry%ROWTYPE;
BEGIN
  SELECT * INTO reg FROM source_registry WHERE source_name = NEW.source_name;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_gate: source "%" is not in source_registry — register it with a ToS verdict before ingesting', NEW.source_name;
  END IF;
  IF reg.tos_verdict = 'prohibited' THEN
    RAISE EXCEPTION 'source_gate: source "%" is prohibited by its terms of service — ingestion is designed out', NEW.source_name;
  END IF;
  IF reg.tos_verdict = 'needs_license' AND NOT reg.license_held THEN
    RAISE EXCEPTION 'source_gate: source "%" requires a license that is not held', NEW.source_name;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER raw_documents_source_gate BEFORE INSERT ON raw_documents
  FOR EACH ROW EXECUTE FUNCTION enforce_source_gate();

-- ---------- seed: verdicts verified during planning (docs/02) ----------
-- checked_at reflects the planning review; re-check periodically — terms change.

INSERT INTO source_registry (source_name, tos_verdict, license_held, notes, terms_url, checked_at) VALUES
  -- Permitted (official/public access)
  ('sec_edgar',          'permitted',     false, 'Official API + full-text search; fair-access rate limits + declared User-Agent', 'https://www.sec.gov/developer', '2026-07-19'),
  ('wikidata',           'permitted',     false, 'CC0 structured data; SPARQL/dumps', 'https://www.wikidata.org/wiki/Wikidata:Licensing', '2026-07-19'),
  ('wikipedia',          'permitted',     false, 'CC BY-SA 4.0 via MediaWiki API; follow citations to primary sources for budgets', 'https://creativecommons.org/2023/06/29/wikipedia-moves-to-cc-4-0-licenses/', '2026-07-19'),
  ('companies_house',    'permitted',     false, 'Free official API', 'https://developer.company-information.service.gov.uk/', '2026-07-19'),
  ('entity_own_site',    'permitted',     false, 'A fund/prodco''s own public site: mandates + contact; respect robots.txt + rate limits', NULL, '2026-07-19'),
  ('soft_money_bodies',  'permitted',     false, 'BFI, BBC Film, Telefilm, Eurimages, Creative Europe MEDIA, national/regional funds', NULL, '2026-07-19'),
  ('film_commissions',   'permitted',     false, 'State/provincial/national incentive directories; public-sector data', NULL, '2026-07-19'),
  ('grant_directories',  'permitted',     false, 'Sundance Inst., IDA, Doc Society, foundations', NULL, '2026-07-19'),
  ('trade_press_rss',    'permitted',     false, 'Official RSS/sitemaps only; store extracted facts + citation, never article bodies', NULL, '2026-07-19'),

  -- Needs-license / conditional (blocked until license_held is flipped after review)
  ('the_numbers',        'needs_license', false, 'Scraping/redistribution reserved to OpusData customers; AI-dataset use needs written permission', 'https://www.the-numbers.com/terms-of-service', '2026-07-19'),
  ('opusdata',           'needs_license', false, 'Licensed budget data; flip license_held on subscription/extract purchase', 'https://www.opusdata.com/', '2026-07-19'),
  ('imdb_commercial',    'needs_license', false, 'AWS Data Exchange / imdb-licensing@imdb.com; quote-based', 'https://developer.imdb.com/', '2026-07-19'),
  ('cinando',            'needs_license', false, 'Via Marché du Film / AFM accreditation', 'https://www.marchedufilm.com/about/cinando/', '2026-07-19'),
  ('trade_press_full',   'needs_license', false, 'Full article bodies (Variety/Deadline/THR/ScreenDaily/IndieWire) require a licensed feed', NULL, '2026-07-19'),
  ('festival_databases', 'needs_license', false, 'Per-festival terms review required before automated access (Sundance/SXSW/Tribeca/TIFF/Cannes)', NULL, '2026-07-19'),
  ('crowdfunding_platforms','needs_license', false, 'Wefunder/StartEngine/Republic: per-platform ToS review; prefer SEC Form C for the same raise', NULL, '2026-07-19'),
  ('opencorporates',     'needs_license', false, 'Use the API under its terms, not scraping', 'https://opencorporates.com/legal/terms', '2026-07-19'),

  -- Prohibited (designed out — never ingested)
  ('imdb',               'prohibited',    false, 'Conditions of Use forbid data mining/robots/screen scraping', 'https://www.imdb.com/conditions/', '2026-07-19'),
  ('imdb_pro',           'prohibited',    false, 'Explicitly forbids scraping; ban + legal exposure', 'https://www.imdb.com/conditions/', '2026-07-19'),
  ('linkedin',           'prohibited',    false, 'User Agreement bans scraping', 'https://www.linkedin.com/legal/user-agreement', '2026-07-19'),
  ('box_office_mojo',    'prohibited',    false, 'IMDb/Amazon Conditions-of-Use family', 'https://www.imdb.com/conditions/', '2026-07-19');
