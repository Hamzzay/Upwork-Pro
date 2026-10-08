-- Matching the way the team's plugin does: platform first (a mobile project never proves a web job), then industry (same, related,
-- other), then tags. Each industry lists its related industries (comma separated names, editable on the Industries page).
ALTER TABLE industries ADD COLUMN IF NOT EXISTS related VARCHAR(500) NULL AFTER description;
ALTER TABLE job_matches
  ADD COLUMN IF NOT EXISTS pool ENUM('same','related','other','none') NULL,
  ADD COLUMN IF NOT EXISTS alternative TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform VARCHAR(40) NULL;
-- what the job needs, in one line (platform, product, workflow, industry), shown above the projects
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS job_needs VARCHAR(500) NULL;
