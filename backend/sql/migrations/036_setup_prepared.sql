-- A setup change prepared from Claude: checked and shown to the person, saved only when they say yes (setup_apply).
-- Kept after it is applied, with the change set it became, so the two steps can be traced.
CREATE TABLE IF NOT EXISTS setup_prepared (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  kind VARCHAR(40) NOT NULL,
  action VARCHAR(20) NOT NULL,
  entity_id VARCHAR(80) NULL,
  entity_name VARCHAR(200) NULL,
  method VARCHAR(8) NOT NULL,
  path VARCHAR(200) NOT NULL,
  body_json MEDIUMTEXT NOT NULL,
  before_json MEDIUMTEXT NULL,
  reason VARCHAR(2000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at DATETIME NULL,
  change_set_id INT UNSIGNED NULL,
  KEY idx_setup_prepared_user (user_id, created_at)
);
