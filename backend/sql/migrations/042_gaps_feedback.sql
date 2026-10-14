-- R67. Experience gaps: what the client asks for that our facts do not show, found when a proposal is written. The person answers
-- Yes (with the project where it was done, if any, and a note) or No; a Yes updates the proposal and, with a project, the library.
CREATE TABLE IF NOT EXISTS proposal_gaps (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  proposal_id INT UNSIGNED NOT NULL,
  screening_id INT UNSIGNED NOT NULL,
  version_no INT UNSIGNED NULL,            -- the version it was found in
  skill VARCHAR(120) NOT NULL,             -- short: "Grok", "HIPAA compliance"
  ask VARCHAR(400) NOT NULL,               -- what the client wants, in a sentence
  quote VARCHAR(400) NULL,                 -- the client's own words
  category VARCHAR(120) NULL,              -- the tag category the writer suggests for it
  status VARCHAR(10) NOT NULL DEFAULT 'open',   -- open, yes, no
  project_id INT UNSIGNED NULL,
  note VARCHAR(600) NULL,
  tag_name VARCHAR(120) NULL,
  library VARCHAR(20) NULL,                -- what the library got: added (a switched off tag on the project, and the note), note (the note
                                           -- only), waiting (an existing tag that is on, not linked yet: it would change the matching),
                                           -- to_add (an employee's answer, for an admin), none (no project named)
  applied_version INT UNSIGNED NULL,       -- the version the Yes was written into
  answered_by INT UNSIGNED NULL,
  answered_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_gap_proposal (proposal_id),
  KEY idx_gap_status (status),
  FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE
) ENGINE=InnoDB;
-- updating the proposal from the answers: queued, running, done, error (a worker job)
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS gaps_status VARCHAR(10) NULL,
  ADD COLUMN IF NOT EXISTS gaps_error VARCHAR(300) NULL;

-- R67. Feedback on a proposal: the part of the text, a category and what is wrong, kept with what the proposal was at that moment,
-- so after a few dozen proposals the patterns can be read and fixed in the setup.
CREATE TABLE IF NOT EXISTS proposal_feedback (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  screening_id INT UNSIGNED NOT NULL,
  proposal_id INT UNSIGNED NULL,
  version_no INT UNSIGNED NULL,
  profile_name VARCHAR(120) NULL,
  template_name VARCHAR(160) NULL,
  projects VARCHAR(600) NULL,
  excerpt TEXT NOT NULL,
  category VARCHAR(40) NOT NULL,
  feedback TEXT NOT NULL,
  user_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_fb_screening (screening_id),
  KEY idx_fb_created (created_at)
) ENGINE=InnoDB;
