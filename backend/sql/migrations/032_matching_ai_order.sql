-- Matching, last step (13 October): the AI orders the shortlist after reading each project's overview and case study.
ALTER TABLE job_matches
  ADD COLUMN IF NOT EXISTS ai_reason VARCHAR(300) NULL,
  ADD COLUMN IF NOT EXISTS ai_fits TINYINT(1) NULL;
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS matching_order VARCHAR(10) NULL;
