-- 0009_principals: the named individuals behind an entity (a celebrity/founder
-- production company, a family-office fund, an individual financier's vehicle).
-- These are public, professional identities — the person's name in their
-- business capacity — NOT scraped personal contact data. Contact still happens
-- through the entity's professional channels (docs/09).

ALTER TABLE entities ADD COLUMN principals text[] NOT NULL DEFAULT '{}';
