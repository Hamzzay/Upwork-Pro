-- R106 (Hamza). Two things.
-- 1. A chat to edit an opening with the AI. Each turn is kept: what the person asked, the opening it was asked about, and the AI's answer
-- with its new version of the opening. A thread belongs to one opening of one set of openings (openings_version), like the openings.
CREATE TABLE IF NOT EXISTS opening_messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  proposal_id INT UNSIGNED NOT NULL,
  opening_index INT NULL,
  openings_version INT NOT NULL,
  role ENUM('user','assistant') NOT NULL,
  content TEXT NOT NULL,
  base_text TEXT NULL,
  draft TEXT NULL,
  status ENUM('queued','running','done','error') NOT NULL DEFAULT 'done',
  error_message VARCHAR(500) NULL,
  user_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_om_thread (proposal_id, openings_version, id),
  KEY idx_om_status (status),
  FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
-- 2. Returning clients: jobs found to be from the same Upwork client (their history, open jobs or member-since date) share a client.
CREATE TABLE IF NOT EXISTS clients (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(190) NULL,
  country VARCHAR(120) NULL,
  member_since VARCHAR(60) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS client_id INT UNSIGNED NULL;
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS client_match_json TEXT NULL;
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS client_checked_at DATETIME NULL;
CREATE INDEX IF NOT EXISTS idx_screenings_client ON screenings (client_id);
