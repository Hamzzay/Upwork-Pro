-- R96 (Ahmad). The quick reasons to continue past a FLAG or FAIL, written for each job from the screening's "Fit with Stackup
-- Solutions" summary: four or five specific reasons, so the reason kept on record is a real judgement and not a stock phrase.
ALTER TABLE screenings
  ADD COLUMN IF NOT EXISTS fit_reasons_json TEXT NULL,
  ADD COLUMN IF NOT EXISTS fit_reasons_status VARCHAR(12) NULL;
