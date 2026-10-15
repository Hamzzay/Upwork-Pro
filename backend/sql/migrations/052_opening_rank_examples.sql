-- R91 (Ahmad). Openings: up to 20 templates, written three at a time (more on request), ranked by how often each one went out.
-- Each template may hold up to five example openings (examples_json), and match_examples asks for openings written 80 to 90 percent
-- like them. proposals.openings_more: the queued openings job adds the next three instead of starting over.
ALTER TABLE opening_templates
  ADD COLUMN IF NOT EXISTS examples_json TEXT NULL,                  -- up to five example openings, a JSON array of strings
  ADD COLUMN IF NOT EXISTS match_examples TINYINT(1) NOT NULL DEFAULT 0;

-- the opening template a proposal was finalized with: the one picked from the alternatives, else its type's default. The ranking
-- counts these, so an opening scores a point each time a proposal goes out with it.
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS final_opening_id INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS openings_more TINYINT(1) NOT NULL DEFAULT 0;

-- the proposals already finalized: the opening picked, else the default the openings were written beside, else the type's default now
UPDATE proposals p LEFT JOIN templates t ON t.id = p.template_id
  SET p.final_opening_id = COALESCE(
    IF(JSON_TYPE(JSON_EXTRACT(p.openings_json, '$.used')) = 'INTEGER',
      CAST(JSON_UNQUOTE(JSON_EXTRACT(p.openings_json, CONCAT('$.items[', JSON_EXTRACT(p.openings_json, '$.used'), '].template_id'))) AS UNSIGNED), NULL),
    IF(JSON_TYPE(JSON_EXTRACT(p.openings_json, '$.default_id')) = 'INTEGER', CAST(JSON_EXTRACT(p.openings_json, '$.default_id') AS UNSIGNED), NULL),
    t.default_opening_id)
  WHERE p.finalized_at IS NOT NULL AND p.final_opening_id IS NULL;
UPDATE proposals SET final_opening_id = NULL WHERE final_opening_id = 0;
