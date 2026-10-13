-- Skipping a job asks why: one of the quick reasons (Settings, "skip.reasons") and/or a note.
ALTER TABLE screenings
  ADD COLUMN IF NOT EXISTS skip_reason VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS skip_note TEXT NULL;
