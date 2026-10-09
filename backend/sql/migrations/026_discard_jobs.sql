-- An admin can discard a job (a test, a mistake): it is hidden from every list, count, report and export, and from Claude.
-- Nothing is deleted, so an admin can restore it.
ALTER TABLE screenings
  ADD COLUMN IF NOT EXISTS discarded_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS discarded_by INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS discard_reason VARCHAR(300) NULL;
