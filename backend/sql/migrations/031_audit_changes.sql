-- Logs say what changed, not only that something changed: each entry keeps the fields with their old and new values (JSON).
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS changes MEDIUMTEXT NULL;
