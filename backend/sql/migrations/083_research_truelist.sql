-- R155 (Hamza): the emails a client research finds are checked with TrueList (the same account as LeadWorks). The batch id is saved
-- before anything waits on it, so a batch is never lost; a failed check is kept with its reason and can be run again.
ALTER TABLE client_research ADD COLUMN IF NOT EXISTS truelist_batch_id VARCHAR(40) NULL;
ALTER TABLE client_research ADD COLUMN IF NOT EXISTS truelist_error VARCHAR(200) NULL;
