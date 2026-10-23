-- R123 (Hamza). A file is never "could not be read": it travels in chunks, is read by a chain of fallbacks, and the AI step retries.
-- How many tries so far and when the next one is due, which method read it, how many pages, and a digest of a document too long to
-- give the AI whole (read a section at a time).
ALTER TABLE job_attachments ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
ALTER TABLE job_attachments ADD COLUMN IF NOT EXISTS next_try_at DATETIME NULL;
ALTER TABLE job_attachments ADD COLUMN IF NOT EXISTS method VARCHAR(80) NULL;
ALTER TABLE job_attachments ADD COLUMN IF NOT EXISTS pages INT NULL;
ALTER TABLE job_attachments ADD COLUMN IF NOT EXISTS digest MEDIUMTEXT NULL;
ALTER TABLE job_attachments ADD COLUMN IF NOT EXISTS digest_status VARCHAR(10) NULL;
ALTER TABLE job_attachments MODIFY kind VARCHAR(12) NOT NULL;
