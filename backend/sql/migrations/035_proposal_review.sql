-- An independent reviewer scores each proposal before anyone copies it: a score out of 10, key points and two or three
-- suggestions. Kept with the proposal, with the version it was written about.
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS review_status ENUM('queued','running','done','error') NULL,
  ADD COLUMN IF NOT EXISTS review_json MEDIUMTEXT NULL,
  ADD COLUMN IF NOT EXISTS review_version INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS review_error VARCHAR(300) NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at DATETIME NULL;
