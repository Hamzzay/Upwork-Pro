-- R75. Auto mode: screen a job and write its proposal with no questions in between (recommended projects, a profile, the suggested
-- proposal type). A FAIL stops it for a person to decide. auto_state: running, done, stopped (auto_note says why).
ALTER TABLE screenings
  ADD COLUMN IF NOT EXISTS auto_mode TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_state VARCHAR(10) NULL,
  ADD COLUMN IF NOT EXISTS auto_note VARCHAR(300) NULL;

-- R76. Two versions of a proposal compared by the AI: what is good and weak in each against the other, which is stronger, and
-- what is worth bringing over. Kept per pair, so opening the same comparison again costs nothing.
CREATE TABLE IF NOT EXISTS proposal_comparisons (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  proposal_id INT UNSIGNED NOT NULL,
  version_a INT UNSIGNED NOT NULL,
  version_b INT UNSIGNED NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'queued',   -- queued, running, done, error
  result_json MEDIUMTEXT NULL,
  error VARCHAR(300) NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cmp (proposal_id, version_a, version_b),
  KEY idx_cmp_status (status),
  FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE
) ENGINE=InnoDB;
