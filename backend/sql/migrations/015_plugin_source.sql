ALTER TABLE screenings
  ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'app',
  ADD KEY IF NOT EXISTS idx_screening_source (source),
  ADD KEY IF NOT EXISTS idx_screening_jobid (upwork_job_id);
ALTER TABLE proposal_versions
  MODIFY source ENUM('ai','manual','chat','restore','plugin') NOT NULL
