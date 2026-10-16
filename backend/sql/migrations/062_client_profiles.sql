-- R107 (Hamza). Every job has a client profile, not only returning ones: one place for each client's jobs, invites and history.
-- The company and the person's name when a post states them; a profile merged into another keeps a pointer to it.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS company VARCHAR(190) NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_name VARCHAR(120) NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS merged_into INT UNSIGNED NULL;
-- a job a person took out of a client (or put into one) by hand: the matching leaves it where they put it
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS client_manual TINYINT(1) NOT NULL DEFAULT 0;
-- jobs checked without a match get their own profile now: the worker checks them again when it starts
UPDATE screenings SET client_checked_at = NULL WHERE client_id IS NULL;
