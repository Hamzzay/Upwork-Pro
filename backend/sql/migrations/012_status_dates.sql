ALTER TABLE screenings
  ADD COLUMN IF NOT EXISTS proposal_sent_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS client_viewed_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS client_replied_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS interviewed_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS outcome_at DATETIME NULL;
CREATE TABLE IF NOT EXISTS status_events (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  screening_id INT UNSIGNED NOT NULL,
  status VARCHAR(60) NOT NULL,
  happened_at DATETIME NOT NULL,
  user_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_status_screening (screening_id, happened_at),
  FOREIGN KEY (screening_id) REFERENCES screenings(id) ON DELETE CASCADE
) ENGINE=InnoDB;
UPDATE screenings SET proposal_sent_at = proposal_sent_date WHERE proposal_sent_at IS NULL AND proposal_sent_date IS NOT NULL
