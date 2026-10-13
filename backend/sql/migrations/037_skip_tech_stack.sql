-- Skip tech stack tags (14 October): a person can match one job's projects without its Tech stack tags; the rest of the
-- matching stays the same. `rematch_only` asks the worker to score the job's saved tags again instead of tagging it again.
ALTER TABLE screenings
  ADD COLUMN IF NOT EXISTS skip_tech_stack TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rematch_only TINYINT(1) NOT NULL DEFAULT 0;
