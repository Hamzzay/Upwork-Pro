-- R151 (Hamza): what the team knows to reach a client (email, phone, website, LinkedIn), and the research on who they are. Each run of
-- the research is kept: what it was given, what it found, how sure it is that it found the right person, and its sources.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email VARCHAR(190) NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone VARCHAR(60) NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS website VARCHAR(300) NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS linkedin VARCHAR(300) NULL;
CREATE TABLE IF NOT EXISTS client_research (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id INT UNSIGNED NOT NULL,
  screening_id INT UNSIGNED NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'queued',
  stage VARCHAR(30) NULL,
  source VARCHAR(12) NOT NULL DEFAULT 'app',
  inputs_json MEDIUMTEXT NULL,
  result_json MEDIUMTEXT NULL,
  confidence VARCHAR(12) NULL,
  error VARCHAR(300) NULL,
  user_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  KEY idx_client_research_client (client_id, id),
  KEY idx_client_research_status (status, id)
) ENGINE=InnoDB;
