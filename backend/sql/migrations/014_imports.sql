-- Task 2: importing sheet data through Claude (MCP). Personal access tokens, and a staging area so every import is previewed before it is saved and can be undone.
CREATE TABLE IF NOT EXISTS api_tokens (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  last_used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_token_hash (token_hash),
  KEY idx_token_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS import_batches (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  kind VARCHAR(30) NOT NULL,
  source VARCHAR(190) NULL,
  allow_changes TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('open','committing','committed','undoing','undone','discarded') NOT NULL DEFAULT 'open',
  chunks INT UNSIGNED NOT NULL DEFAULT 0,
  chunk_sums TEXT NULL,
  ignored_columns VARCHAR(500) NULL,
  summary_json TEXT NULL,
  expires_at DATETIME NOT NULL,
  committed_at DATETIME NULL,
  undone_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_batch_user (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS import_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_id INT UNSIGNED NOT NULL,
  row_no INT UNSIGNED NOT NULL,
  action ENUM('create','update','unchanged','blocked','invalid') NOT NULL,
  key_text VARCHAR(300) NOT NULL,
  messages TEXT NULL,
  payload MEDIUMTEXT NULL,
  before_json MEDIUMTEXT NULL,
  applied TINYINT(1) NOT NULL DEFAULT 0,
  KEY idx_item_batch (batch_id, id),
  KEY idx_item_key (batch_id, key_text(190)),
  FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
) ENGINE=InnoDB;
