-- Two-way sync between the Google Sheet "Stackup Project Tag Library" and the app, for projects, tags and profiles.
-- Both are sources of truth. The base is each record as it was after the last sync: comparing the sheet and the app with it
-- tells which side changed what, so an addition on either side is copied over and never discarded.
CREATE TABLE IF NOT EXISTS sheet_sync_base (
  kind ENUM('project','tag','profile') NOT NULL,
  rkey VARCHAR(255) NOT NULL,
  data MEDIUMTEXT NOT NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (kind, rkey)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sheet_sync_runs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL,
  trigger_kind VARCHAR(30) NOT NULL,
  ok TINYINT(1) NULL,
  summary MEDIUMTEXT NULL,
  error VARCHAR(1000) NULL,
  KEY idx_sync_started (started_at)
) ENGINE=InnoDB;

-- The same field changed differently on both sides: the sheet's value is kept, the app's value is kept here to use instead.
CREATE TABLE IF NOT EXISTS sheet_sync_conflicts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  run_id INT UNSIGNED NULL,
  kind ENUM('project','tag','profile') NOT NULL,
  rkey VARCHAR(255) NOT NULL,
  field VARCHAR(60) NOT NULL,
  sheet_value TEXT NULL,
  app_value TEXT NULL,
  status ENUM('open','kept_sheet','used_app') NOT NULL DEFAULT 'open',
  resolved_by INT UNSIGNED NULL,
  resolved_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_conflict_status (status)
) ENGINE=InnoDB;

-- A record removed from the sheet is put aside in the app (not deleted: jobs may point at it); re-adding it in the sheet brings it back.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sheet_removed_at DATETIME NULL;
ALTER TABLE upwork_profiles ADD COLUMN IF NOT EXISTS sheet_removed_at DATETIME NULL;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS sheet_removed_at DATETIME NULL;
