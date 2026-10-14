-- The independent reviewer's instructions, in versions (R61, the Reviewer page): how it reviews, key concerns, dos and don'ts,
-- the score guide and limits, how to write the review, how many of each, which facts it reads. One version is active; saving
-- makes a new version that is used only once activated. Version 1 (the reviewer as it was in code) is added by the app itself.
CREATE TABLE IF NOT EXISTS reviewer_versions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  version INT UNSIGNED NOT NULL,
  sections_json MEDIUMTEXT NOT NULL,
  change_note VARCHAR(250) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reviewer_version (version),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
-- which reviewer version wrote a review
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS review_reviewer_version INT UNSIGNED NULL;
