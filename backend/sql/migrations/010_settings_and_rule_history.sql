CREATE TABLE IF NOT EXISTS app_settings (
  k VARCHAR(80) NOT NULL PRIMARY KEY,
  v TEXT NOT NULL,
  updated_by INT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
INSERT IGNORE INTO app_settings (k, v) VALUES
  ('matching.shown', '5'),
  ('matching.recommended', '2'),
  ('matching.min_score', '1'),
  ('selection.min', '1'),
  ('selection.max', '2'),
  ('override.min_reason', '15'),
  ('tracking.outcomes', '["Pending","Hired","Not hired","No response","Withdrawn","Job closed"]'),
  ('writer.requirement_rules', '["G11","G12","G13"]'),
  ('writer.structured_signal', '{"signal":5,"value":"Yes"}');
ALTER TABLE rules
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
