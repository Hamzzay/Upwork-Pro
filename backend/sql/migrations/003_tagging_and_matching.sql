ALTER TABLE screenings
  ADD COLUMN IF NOT EXISTS continued_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS tagging_status ENUM('queued','running','done','error') NULL,
  ADD COLUMN IF NOT EXISTS tagging_error_code VARCHAR(60) NULL,
  ADD COLUMN IF NOT EXISTS tagging_error_message VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS tagging_model VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS tagged_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS selection_confirmed_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS selection_confirmed_by INT UNSIGNED NULL,
  ADD KEY IF NOT EXISTS idx_tagging_status (tagging_status);

UPDATE screenings s JOIN overrides o ON o.screening_id=s.id SET s.continued_at = COALESCE(s.continued_at, o.created_at);

CREATE TABLE IF NOT EXISTS job_tags (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  screening_id INT UNSIGNED NOT NULL,
  tag_id INT UNSIGNED NULL,
  tag_name VARCHAR(120) NOT NULL,
  category_name VARCHAR(120) NOT NULL,
  weight TINYINT UNSIGNED NOT NULL,
  reason VARCHAR(600) NOT NULL,
  UNIQUE KEY uq_job_tag (screening_id, tag_name),
  FOREIGN KEY (screening_id) REFERENCES screenings(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS job_matches (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  screening_id INT UNSIGNED NOT NULL,
  project_id INT UNSIGNED NULL,
  project_name VARCHAR(190) NOT NULL,
  rank_no TINYINT UNSIGNED NOT NULL,
  score INT NOT NULL,
  max_score INT NOT NULL,
  compliance_gap TINYINT UNSIGNED NOT NULL DEFAULT 0,
  recommended TINYINT(1) NOT NULL DEFAULT 0,
  shared_tags TEXT NOT NULL,
  selected TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_match_rank (screening_id, rank_no),
  FOREIGN KEY (screening_id) REFERENCES screenings(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
) ENGINE=InnoDB
