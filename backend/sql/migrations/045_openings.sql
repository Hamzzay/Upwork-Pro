-- R73. Three openings for every proposal, each a different direction, tone and line of thought, to pick from on the proposal page.
-- Written by a worker job after the proposal (like the independent review): queued, running, done, error.
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS openings_status VARCHAR(10) NULL,
  ADD COLUMN IF NOT EXISTS openings_json MEDIUMTEXT NULL,      -- { version, first, items: [{ angle, tone, why, text }], used }
  ADD COLUMN IF NOT EXISTS openings_error VARCHAR(300) NULL;
