-- A proposal in parts (PLAN-SPEED point 1): each version made from parts keeps them (the letter, a proof block per project, the
-- Loom video, the sign off), so a change of projects, video or profile redoes only that part. NULL: edited by hand or by the chat.
ALTER TABLE proposal_versions ADD COLUMN IF NOT EXISTS parts_json MEDIUMTEXT NULL;
-- the parts brought up to date after a change (queued, running, done, error), and the parts offered when the text was edited by hand
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS parts_status VARCHAR(10) NULL,
  ADD COLUMN IF NOT EXISTS parts_offer_json MEDIUMTEXT NULL,
  ADD COLUMN IF NOT EXISTS parts_error VARCHAR(300) NULL;
