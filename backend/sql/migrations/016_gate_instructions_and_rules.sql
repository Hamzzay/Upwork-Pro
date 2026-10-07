-- The gate prompt is split in two: the gate instructions (skill_versions, the method) and the rules (one row per code).
-- Both are combined for every job, so each rule carries its own "how to apply" note,
-- and each job keeps the exact rules it was screened against.
ALTER TABLE rules
  ADD COLUMN IF NOT EXISTS details VARCHAR(1000) NULL AFTER rule;
ALTER TABLE screenings
  ADD COLUMN IF NOT EXISTS gate_rules TEXT NULL AFTER skill_version_id;
