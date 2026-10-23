-- R116 (Hamza). The client's files added or changed after a job was screened: everything written before them is redone or flagged.
-- When they last changed, on the job; and which file texts an early draft was written from, so a draft without the new file is not used.
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS docs_changed_at DATETIME NULL;
ALTER TABLE early_drafts ADD COLUMN IF NOT EXISTS docs_key VARCHAR(500) NULL;
-- and room for the platform with its store links: "web and mobile (App Store / Google Play)"
ALTER TABLE job_matches MODIFY platform VARCHAR(80) NULL;
