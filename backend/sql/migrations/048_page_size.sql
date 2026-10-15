-- R82. How many rows a list shows per page, chosen by each person at the bottom of any list (20, 50, 100 or 200) and kept with
-- their account, so it is the same on every device and every list.
ALTER TABLE users ADD COLUMN IF NOT EXISTS page_size SMALLINT UNSIGNED NOT NULL DEFAULT 20;
