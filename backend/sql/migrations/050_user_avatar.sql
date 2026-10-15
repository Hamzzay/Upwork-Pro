-- R87. A person's own picture, shown in the sidebar and on the Users page. The picture is a small square image (256 pixels, made in
-- the browser) kept in the database, so it needs no files on disk and goes with a backup. avatar_v changes with every new picture,
-- so browsers fetch the new one.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar MEDIUMBLOB NULL,
  ADD COLUMN IF NOT EXISTS avatar_type VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS avatar_v INT UNSIGNED NOT NULL DEFAULT 0;
