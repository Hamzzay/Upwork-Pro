-- R74. Documents attached to a job (the client's files: briefs, specs, screenshots). The file is kept on disk (storage/attachments);
-- its text is kept here and read by the AI with the job post: screening, matching, the proposal, the chat, the review, the openings.
-- A PDF, Word or text file is read in code; an image, or a PDF with no text in it, is read by the AI once (status queued, running).
CREATE TABLE IF NOT EXISTS job_attachments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  screening_id INT UNSIGNED NOT NULL,
  file_name VARCHAR(200) NOT NULL,
  kind VARCHAR(10) NOT NULL,               -- pdf, docx, text, image
  mime VARCHAR(100) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  stored_as VARCHAR(255) NOT NULL,         -- the file's name under storage/attachments
  status VARCHAR(10) NOT NULL DEFAULT 'done',   -- done, queued, running, error
  text_content MEDIUMTEXT NULL,            -- what the AI reads: the file's text, or what an image shows
  read_by VARCHAR(10) NULL,                -- code, ai, person (a description typed in when the AI could not read it)
  error VARCHAR(300) NULL,
  added_after_screening TINYINT(1) NOT NULL DEFAULT 0,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_att_screening (screening_id),
  KEY idx_att_status (status),
  FOREIGN KEY (screening_id) REFERENCES screenings(id) ON DELETE CASCADE
) ENGINE=InnoDB;
