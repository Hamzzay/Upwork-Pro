CREATE TABLE IF NOT EXISTS early_drafts (
  screening_id INT UNSIGNED NOT NULL PRIMARY KEY,
  status ENUM('queued','running','done','error','skipped') NOT NULL DEFAULT 'queued',
  project_ids VARCHAR(100) NOT NULL,
  profile_id INT UNSIGNED NOT NULL,
  result_json MEDIUMTEXT NULL,
  error_code VARCHAR(60) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  used_at DATETIME NULL,
  KEY idx_early_status (status),
  FOREIGN KEY (screening_id) REFERENCES screenings(id) ON DELETE CASCADE,
  FOREIGN KEY (profile_id) REFERENCES upwork_profiles(id)
) ENGINE=InnoDB
