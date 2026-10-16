-- R104 (Ahmad). The version of a proposal that was sent: kept when the job is marked Sent, so later edits never blur what the client
-- read. Jobs already sent take their newest version (what the app assumed until now).
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS sent_version_no INT NULL;
UPDATE proposals p JOIN screenings s ON s.id = p.screening_id
  SET p.sent_version_no = (SELECT MAX(v.version_no) FROM proposal_versions v WHERE v.proposal_id = p.id)
  WHERE p.sent_version_no IS NULL AND (s.proposal_sent_at IS NOT NULL OR s.proposal_sent_date IS NOT NULL);
-- and the opening it went out with, for sent jobs that were never marked finished in the app
UPDATE proposals p JOIN screenings s ON s.id = p.screening_id LEFT JOIN templates t ON t.id = p.template_id
  SET p.final_opening_id = COALESCE(
    IF(JSON_TYPE(JSON_EXTRACT(p.openings_json, '$.used')) = 'INTEGER',
      CAST(JSON_UNQUOTE(JSON_EXTRACT(p.openings_json, CONCAT('$.items[', JSON_EXTRACT(p.openings_json, '$.used'), '].template_id'))) AS UNSIGNED), NULL),
    IF(JSON_TYPE(JSON_EXTRACT(p.openings_json, '$.default_id')) = 'INTEGER', CAST(JSON_EXTRACT(p.openings_json, '$.default_id') AS UNSIGNED), NULL),
    t.default_opening_id)
  WHERE p.final_opening_id IS NULL AND (s.proposal_sent_at IS NOT NULL OR s.proposal_sent_date IS NOT NULL);
UPDATE proposals SET final_opening_id = NULL WHERE final_opening_id = 0;
