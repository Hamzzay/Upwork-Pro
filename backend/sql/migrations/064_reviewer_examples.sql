-- The reviewer's examples (R115): real proposals with the score Stackup says they deserve, and why, so the reviewer scores on the same
-- standard. A library, not part of a version: admins add to it over time (from any job, or pasted). A version says whether to use it
-- and how many per review; the same proposal type comes first.
CREATE TABLE IF NOT EXISTS reviewer_examples (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  template_name VARCHAR(160) NULL,          -- the proposal type it is an example of; NULL for any type
  title VARCHAR(200) NOT NULL,
  score TINYINT UNSIGNED NOT NULL,
  why TEXT NOT NULL,
  proposal_text MEDIUMTEXT NOT NULL,
  job_text MEDIUMTEXT NULL,
  screening_id INT UNSIGNED NULL,           -- the job it came from, when it came from one
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rx_type (active, template_name)
) ENGINE=InnoDB;
