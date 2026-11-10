-- R149 (Hamza): the Chats page. A job that reached a chat has a chat stage; the stages Upwork Pro already tracks (Chat opened,
-- Interview, Hired, a lost outcome) stay on the job, and only "Proposal sent" is kept here. Every move is kept with its note.
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS chat_stage VARCHAR(20) NULL;
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS chat_moved_at DATETIME NULL;
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS chat_note VARCHAR(500) NULL;
CREATE TABLE IF NOT EXISTS chat_events (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  screening_id INT UNSIGNED NOT NULL,
  stage VARCHAR(20) NOT NULL,
  note VARCHAR(500) NULL,
  user_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_chat_events_job (screening_id, id),
  FOREIGN KEY (screening_id) REFERENCES screenings(id) ON DELETE CASCADE
) ENGINE=InnoDB;
