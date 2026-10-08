-- Choosing the proposal type the way the team's plugin does (type-selection.md): per type, required signals (rows in the same
-- req_group are alternatives; every group must be met), supporting signals (each adds one) and excluding signals (any rules it out),
-- applied by priority group (templates.priority / 10), then supporting count, then priority. A "weight" row is the older scoring.
ALTER TABLE template_signals
  ADD COLUMN IF NOT EXISTS role ENUM('weight','required','supporting','exclude') NOT NULL DEFAULT 'weight',
  ADD COLUMN IF NOT EXISTS req_group TINYINT UNSIGNED NULL;
ALTER TABLE template_signals MODIFY weight INT NOT NULL DEFAULT 0;
-- the type used when no type qualifies (Type 1)
ALTER TABLE templates ADD COLUMN IF NOT EXISTS is_default TINYINT(1) NOT NULL DEFAULT 0;
-- the type selection guide is part of the writing guide
ALTER TABLE writing_docs MODIFY kind ENUM('type','rules','banned','modules','screening','checklist','selection') NOT NULL;
-- certifications a profile holds, one per line ("Name, Issuer, year"); used only when a client requires one
ALTER TABLE upwork_profiles ADD COLUMN IF NOT EXISTS certifications TEXT NULL AFTER stats_allowed;
