-- The project library and the profiles hold what the Claude plugin uses, so the app and the plugin work from the same records.
-- Projects: every kind of link the team keeps (the proposal link is chosen from them in order), the overview and the case study.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS landing_link VARCHAR(500) NULL AFTER live_link,
  ADD COLUMN IF NOT EXISTS system_link VARCHAR(500) NULL AFTER landing_link,
  ADD COLUMN IF NOT EXISTS mobile_link VARCHAR(500) NULL AFTER system_link,
  ADD COLUMN IF NOT EXISTS staging_link VARCHAR(500) NULL AFTER mobile_link,
  ADD COLUMN IF NOT EXISTS case_study_link VARCHAR(500) NULL AFTER staging_link,
  ADD COLUMN IF NOT EXISTS overview TEXT NULL AFTER notes,
  ADD COLUMN IF NOT EXISTS case_study_summary TEXT NULL AFTER overview,
  ADD COLUMN IF NOT EXISTS added_via VARCHAR(30) NULL;
-- Profiles: what the writer needs to sound like that person and what the plugin uses to suggest one.
ALTER TABLE upwork_profiles
  ADD COLUMN IF NOT EXISTS github_url VARCHAR(255) NULL AFTER gitlab_account,
  ADD COLUMN IF NOT EXISTS lowest_price DECIMAL(10,2) NULL AFTER price,
  ADD COLUMN IF NOT EXISTS services TEXT NULL,
  ADD COLUMN IF NOT EXISTS industries VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS voice VARCHAR(300) NULL,
  ADD COLUMN IF NOT EXISTS signature VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS stats_allowed VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS submitted_by VARCHAR(300) NULL,
  ADD COLUMN IF NOT EXISTS rules TEXT NULL,
  ADD COLUMN IF NOT EXISTS added_via VARCHAR(30) NULL;
