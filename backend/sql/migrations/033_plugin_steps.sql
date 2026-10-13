-- The Claude plugin saves every step as it happens (14 October). Two things had nowhere to live before the proposal exists:
-- the rate the person chose with the profile, and the proposal type they picked before anything is written.
ALTER TABLE screenings
  ADD COLUMN IF NOT EXISTS proposal_rate DECIMAL(8,2) NULL,
  ADD COLUMN IF NOT EXISTS chosen_template_id INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS chosen_template_name VARCHAR(160) NULL;
