-- R98 (Ahmad). An opening picked on a proposal and edited there before use is saved back to its opening template as a learned example
-- (the five most recent, newest first), kept apart from the up to five examples written by hand, so the writer learns from what the
-- team actually changed and sent.
ALTER TABLE opening_templates ADD COLUMN IF NOT EXISTS learned_json TEXT NULL;
