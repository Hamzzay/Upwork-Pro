-- The first two lines of a proposal (what Upwork shows in the preview) get their own strict rules per proposal type.
ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS opening_rules TEXT NULL,
  ADD COLUMN IF NOT EXISTS opening_no_us TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS opening_starts VARCHAR(200) NULL;
