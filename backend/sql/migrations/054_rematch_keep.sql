-- R95 (Ahmad). Tags added to a project on a job's Projects step match the projects again. When the projects were already confirmed,
-- the confirmed choice is kept here while the matching runs and put back after it (as long as those projects are still shown).
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS rematch_keep TEXT NULL;
