CREATE TABLE IF NOT EXISTS llm_calls (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  screening_id INT UNSIGNED NULL,
  proposal_id INT UNSIGNED NULL,
  kind VARCHAR(30) NOT NULL,
  step VARCHAR(60) NULL,
  model VARCHAR(80) NULL,
  provider VARCHAR(20) NULL,
  ms INT UNSIGNED NOT NULL,
  ok TINYINT(1) NOT NULL,
  error VARCHAR(200) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_llm_screening (screening_id),
  KEY idx_llm_created (created_at),
  KEY idx_llm_ok (ok)
) ENGINE=InnoDB
