-- Flag review (R63): the quick reasons picked when continuing past a FLAG or FAIL, as a JSON list, so they can be counted per rule.
-- NULL for reasons given before R63: the review then finds the quick reasons inside the reason's text.
ALTER TABLE overrides ADD COLUMN IF NOT EXISTS reason_picks TEXT NULL;
