-- The Google Sheet sync (018) was dropped: the Google key could not be made, and Upwork Pro is the one library every Claude reads.
-- Its tables and columns were never used.
DROP TABLE IF EXISTS sheet_sync_conflicts;
DROP TABLE IF EXISTS sheet_sync_runs;
DROP TABLE IF EXISTS sheet_sync_base;
ALTER TABLE projects DROP COLUMN IF EXISTS sheet_removed_at;
ALTER TABLE upwork_profiles DROP COLUMN IF EXISTS sheet_removed_at;
ALTER TABLE tags DROP COLUMN IF EXISTS sheet_removed_at;
