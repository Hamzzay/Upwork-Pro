-- Matching, one workflow (13 October): the work first, then one industry, then tags; screening's projects always in the list;
-- ten more projects behind "Show 10 more projects".
ALTER TABLE job_matches
  ADD COLUMN IF NOT EXISTS proves_work TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS named_in_screening TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra TINYINT(1) NOT NULL DEFAULT 0;

-- the job's core work, chosen by the tagger: 1 is the main work, 2 and 3 the rest; NULL for other tags
ALTER TABLE job_tags ADD COLUMN IF NOT EXISTS core_rank TINYINT NULL;
