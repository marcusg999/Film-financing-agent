-- 0008_budget_bands_25m: extend the budget bands past the original $10M indie
-- ceiling to cover projects up to $25M (and beyond). ADD VALUE is allowed
-- inside a transaction on PG 12+ as long as the new value isn't used in the
-- same transaction (it isn't here).
--
-- Note: this only changes the *filter/display* bands. The qualification
-- cluster rule still uses a $10M cap by default (THRESHOLDS.capUsd); raising
-- what counts as "qualified" to $25M is a separate config change.

ALTER TYPE budget_band ADD VALUE IF NOT EXISTS '10m_25m' AFTER '5m_10m';
ALTER TYPE budget_band ADD VALUE IF NOT EXISTS 'over_25m' AFTER '10m_25m';
