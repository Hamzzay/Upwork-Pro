-- Screening answers apart from the proposal (R59): each version keeps the cover letter in content_html and the answers here,
-- as [{ "question": ..., "answer": ... }]. NULL: the version has no answers, or it was saved before R59 with the answers inside
-- its text (they are split apart when read).
ALTER TABLE proposal_versions ADD COLUMN IF NOT EXISTS answers_json MEDIUMTEXT NULL;
