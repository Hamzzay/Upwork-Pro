-- R85. A person's own view settings, kept with their account (so the same on every device, and theirs alone): for now the columns
-- of each tab of the Jobs list, shown and in their order. {"jobs_cols.<tab>": ["progress", "verdict", ...]}
ALTER TABLE users ADD COLUMN IF NOT EXISTS prefs_json TEXT NULL;
