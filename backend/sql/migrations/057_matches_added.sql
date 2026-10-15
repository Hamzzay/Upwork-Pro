-- R100 (Ahmad). Projects a person brings into a job's list (Load more, or found with the search) are marked, so matching the job
-- again keeps them; and tags added while the projects are being matched again ask for one more pass when it ends.
ALTER TABLE job_matches ADD COLUMN IF NOT EXISTS added TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS rematch_pending TINYINT(1) NOT NULL DEFAULT 0;
