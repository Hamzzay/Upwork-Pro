ALTER TABLE tag_categories ADD COLUMN IF NOT EXISTS is_compliance TINYINT(1) NOT NULL DEFAULT 0;

UPDATE tag_categories SET is_compliance=1 WHERE name='Compliance / sensitive data';

CREATE TABLE IF NOT EXISTS industries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_industry_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS project_industries (
  project_id INT UNSIGNED NOT NULL,
  industry_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (project_id, industry_id),
  KEY idx_pi_industry (industry_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (industry_id) REFERENCES industries(id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE screenings
  ADD COLUMN IF NOT EXISTS proposal_profile_id INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS proposal_profile_confirmed_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS proposal_profile_confirmed_by INT UNSIGNED NULL,
  ADD CONSTRAINT fk_screening_proposal_profile FOREIGN KEY (proposal_profile_id) REFERENCES upwork_profiles(id)
