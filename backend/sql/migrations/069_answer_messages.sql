-- R128 (Hamza): a screening answer edited with the AI, the way an opening is (R106): one thread per answer of a proposal.
CREATE TABLE answer_messages (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  proposal_id INT UNSIGNED NOT NULL,
  answer_index INT NOT NULL,
  role ENUM('user','assistant') NOT NULL,
  content TEXT NOT NULL,
  base_text TEXT NULL,
  draft TEXT NULL,
  status ENUM('queued','running','done','error') NOT NULL DEFAULT 'done',
  error_message VARCHAR(500) NULL,
  user_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_am_thread (proposal_id, answer_index, id),
  KEY idx_am_status (status),
  CONSTRAINT answer_messages_proposal FOREIGN KEY (proposal_id) REFERENCES proposals (id) ON DELETE CASCADE,
  CONSTRAINT answer_messages_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
