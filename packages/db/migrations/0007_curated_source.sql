-- 0007_curated_source: register the curated public-bodies source so its
-- evidence/raw_documents pass the ToS gate. It's our own compilation of
-- public-record institutional funders, each evidence-linked to an official
-- site — permitted.

INSERT INTO source_registry (source_name, tos_verdict, license_held, notes, terms_url, checked_at)
VALUES (
  'curated_public_bodies', 'permitted', false,
  'Hand-curated public-record institutional funders (national film bodies, soft money, grants, tax-credit offices, known genre financiers). Pareto seed; each entity carries an evidence link to its official site. Verify/expand before outreach.',
  NULL, CURRENT_DATE
)
ON CONFLICT (source_name) DO NOTHING;
