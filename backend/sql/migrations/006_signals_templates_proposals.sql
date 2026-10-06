CREATE TABLE IF NOT EXISTS signal_layers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  intro TEXT NULL,
  rule_note TEXT NULL,
  UNIQUE KEY uq_layer_code (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS signals (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  number INT UNSIGNED NOT NULL,
  layer_id INT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  decides TEXT NULL,
  multi_select TINYINT(1) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_signal_number (number),
  UNIQUE KEY uq_signal_name (name),
  FOREIGN KEY (layer_id) REFERENCES signal_layers(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS signal_values (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  signal_id INT UNSIGNED NOT NULL,
  name VARCHAR(200) NOT NULL,
  detect TEXT NULL,
  move TEXT NULL,
  is_fallback TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_signal_value (signal_id, name),
  FOREIGN KEY (signal_id) REFERENCES signals(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS templates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  description VARCHAR(1000) NULL,
  body_html MEDIUMTEXT NOT NULL,
  prompt MEDIUMTEXT NULL,
  priority INT NOT NULL DEFAULT 100,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_template_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS template_signals (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  template_id INT UNSIGNED NOT NULL,
  signal_id INT UNSIGNED NOT NULL,
  value_id INT UNSIGNED NULL,
  weight TINYINT UNSIGNED NOT NULL DEFAULT 1,
  source ENUM('starter','manual') NOT NULL DEFAULT 'manual',
  UNIQUE KEY uq_template_signal_value (template_id, signal_id, value_id),
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
  FOREIGN KEY (signal_id) REFERENCES signals(id) ON DELETE CASCADE,
  FOREIGN KEY (value_id) REFERENCES signal_values(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS template_samples (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  template_id INT UNSIGNED NOT NULL,
  title VARCHAR(250) NOT NULL,
  author VARCHAR(120) NULL,
  job_url VARCHAR(500) NULL,
  job_keywords VARCHAR(500) NULL,
  content MEDIUMTEXT NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sample_template (template_id),
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS job_signals (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  screening_id INT UNSIGNED NOT NULL,
  signal_id INT UNSIGNED NULL,
  signal_number INT UNSIGNED NOT NULL,
  signal_name VARCHAR(160) NOT NULL,
  value_id INT UNSIGNED NULL,
  value_name VARCHAR(200) NOT NULL,
  is_fallback TINYINT(1) NOT NULL DEFAULT 0,
  is_primary TINYINT(1) NOT NULL DEFAULT 1,
  confidence ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  evidence VARCHAR(700) NULL,
  reason VARCHAR(700) NULL,
  move_text TEXT NULL,
  KEY idx_js_screening (screening_id),
  FOREIGN KEY (screening_id) REFERENCES screenings(id) ON DELETE CASCADE,
  FOREIGN KEY (signal_id) REFERENCES signals(id) ON DELETE SET NULL,
  FOREIGN KEY (value_id) REFERENCES signal_values(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS proposals (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  screening_id INT UNSIGNED NOT NULL,
  status ENUM('queued','running','done','error') NOT NULL DEFAULT 'queued',
  stage VARCHAR(40) NULL,
  error_code VARCHAR(60) NULL,
  error_message VARCHAR(500) NULL,
  template_id INT UNSIGNED NULL,
  template_name VARCHAR(160) NULL,
  template_score INT NULL,
  template_choice ENUM('auto','manual') NOT NULL DEFAULT 'auto',
  template_ranking TEXT NULL,
  warnings TEXT NULL,
  model VARCHAR(80) NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  UNIQUE KEY uq_proposal_screening (screening_id),
  KEY idx_proposal_status (status),
  FOREIGN KEY (screening_id) REFERENCES screenings(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS proposal_versions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  proposal_id INT UNSIGNED NOT NULL,
  version_no INT UNSIGNED NOT NULL,
  content_html MEDIUMTEXT NOT NULL,
  source ENUM('ai','manual','chat','restore') NOT NULL,
  note VARCHAR(255) NULL,
  based_on_version INT UNSIGNED NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_proposal_version (proposal_id, version_no),
  FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS proposal_messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  proposal_id INT UNSIGNED NOT NULL,
  role ENUM('user','assistant') NOT NULL,
  content TEXT NOT NULL,
  status ENUM('queued','running','done','error') NOT NULL DEFAULT 'done',
  error_message VARCHAR(500) NULL,
  user_id INT UNSIGNED NULL,
  based_on_version INT UNSIGNED NULL,
  result_version INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_msg_proposal (proposal_id, id),
  KEY idx_msg_status (status),
  FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB
