CREATE TABLE IF NOT EXISTS upwork_profiles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  profile_url VARCHAR(300) NULL,
  notes VARCHAR(500) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_profile_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tag_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_category_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tags (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  weight TINYINT UNSIGNED NOT NULL DEFAULT 1,
  description VARCHAR(500) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_tag (category_id, name),
  KEY idx_tag_name (name),
  FOREIGN KEY (category_id) REFERENCES tag_categories(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS projects (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  live_link VARCHAR(500) NULL,
  showable_publicly VARCHAR(60) NULL,
  notes TEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_project_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS project_tags (
  project_id INT UNSIGNED NOT NULL,
  tag_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (project_id, tag_id),
  KEY idx_pt_tag (tag_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rules (
  code VARCHAR(8) PRIMARY KEY,
  type ENUM('fail','flag') NOT NULL,
  rule VARCHAR(300) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

ALTER TABLE screenings
  ADD COLUMN upwork_profile_id INT UNSIGNED NULL,
  ADD COLUMN posted VARCHAR(80) NULL,
  ADD COLUMN job_type VARCHAR(40) NULL,
  ADD COLUMN budget VARCHAR(160) NULL,
  ADD COLUMN length_hours VARCHAR(200) NULL,
  ADD COLUMN experience_level VARCHAR(60) NULL,
  ADD COLUMN service_category VARCHAR(300) NULL,
  ADD COLUMN required_skills VARCHAR(800) NULL,
  ADD COLUMN client_country VARCHAR(120) NULL,
  ADD COLUMN payment_verified VARCHAR(80) NULL,
  ADD COLUMN client_rating VARCHAR(80) NULL,
  ADD COLUMN jobs_posted VARCHAR(60) NULL,
  ADD COLUMN hire_rate VARCHAR(60) NULL,
  ADD COLUMN total_spent VARCHAR(80) NULL,
  ADD COLUMN hires VARCHAR(60) NULL,
  ADD COLUMN avg_spend_per_hire VARCHAR(80) NULL,
  ADD COLUMN avg_hourly_paid VARCHAR(160) NULL,
  ADD COLUMN member_since VARCHAR(80) NULL,
  ADD COLUMN proposals VARCHAR(60) NULL,
  ADD COLUMN interviewing VARCHAR(60) NULL,
  ADD COLUMN invites_sent VARCHAR(60) NULL,
  ADD COLUMN connects_cost VARCHAR(60) NULL,
  ADD COLUMN sample_match VARCHAR(800) NULL,
  ADD COLUMN fail_reasons TEXT NULL,
  ADD COLUMN flag_reasons TEXT NULL,
  ADD COLUMN rule_codes VARCHAR(200) NULL,
  ADD COLUMN proceeded ENUM('yes','no') NULL,
  ADD COLUMN proposal_sent_date DATE NULL,
  ADD COLUMN outcome VARCHAR(60) NULL,
  ADD COLUMN notes TEXT NULL,
  ADD KEY idx_profile (upwork_profile_id),
  ADD CONSTRAINT fk_screening_profile FOREIGN KEY (upwork_profile_id) REFERENCES upwork_profiles(id)
