-- Every change to the setup (from the app or from Claude) is kept as a change set: who, what, the item before and after in
-- full, and why. The main admin can review each one and put it back. See PLAN-PLUGIN.md, Part B.
CREATE TABLE IF NOT EXISTS change_sets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  source ENUM('app','claude_plugin') NOT NULL DEFAULT 'app',
  entity VARCHAR(40) NOT NULL,
  entity_id VARCHAR(80) NULL,
  entity_name VARCHAR(200) NULL,
  action ENUM('create','update','switch_off','switch_on','delete','revert') NOT NULL,
  before_json MEDIUMTEXT NULL,
  after_json MEDIUMTEXT NULL,
  changes_json MEDIUMTEXT NULL,
  reason TEXT NULL,
  status ENUM('applied','reverted') NOT NULL DEFAULT 'applied',
  needs_review TINYINT(1) NOT NULL DEFAULT 0,
  reviewed_by INT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  reverted_by INT UNSIGNED NULL,
  reverted_at DATETIME NULL,
  reverted_by_set INT UNSIGNED NULL,
  reverts_set INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cs_status (status, needs_review),
  KEY idx_cs_entity (entity, entity_id),
  KEY idx_cs_created (created_at)
) ENGINE=InnoDB;
