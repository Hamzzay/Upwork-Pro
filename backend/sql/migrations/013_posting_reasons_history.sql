ALTER TABLE screenings
  ADD COLUMN IF NOT EXISTS posting_json MEDIUMTEXT NULL,
  ADD COLUMN IF NOT EXISTS posting_status ENUM('queued','running','done','error') NULL,
  ADD COLUMN IF NOT EXISTS posting_error VARCHAR(200) NULL,
  ADD COLUMN IF NOT EXISTS outcome_reason VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS outcome_note TEXT NULL;
ALTER TABLE status_events
  ADD COLUMN IF NOT EXISTS reason VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS note TEXT NULL;
CREATE TABLE IF NOT EXISTS field_changes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  screening_id INT UNSIGNED NOT NULL,
  field VARCHAR(60) NOT NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  source VARCHAR(30) NOT NULL,
  user_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_changes_screening (screening_id, id),
  FOREIGN KEY (screening_id) REFERENCES screenings(id) ON DELETE CASCADE
) ENGINE=InnoDB;
INSERT IGNORE INTO app_settings (k, v) VALUES
  ('tracking.loss_outcomes', '["Not hired","No response","Withdrawn","Job closed"]'),
  ('tracking.loss_reasons', '["Budget too low","Hired someone else","Went quiet after chat","Scope or timeline did not fit","Job cancelled by client","We withdrew","Other"]');
UPDATE status_events SET status='Chat opened' WHERE status='Replied'
