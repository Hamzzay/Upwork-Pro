-- R88. Openings in one place (Ahmad): up to 10 opening templates, each active or not. Every proposal type picks one as its default;
-- the proposal is written with it, and one opening per other active template is written beside it to swipe through and pick.
-- The rules for every opening stay in the Writing guide ("Opening lines (all types)"). A template's own exceptions are explicit:
-- required first words, whether it may greet, whether it may talk about us.
CREATE TABLE IF NOT EXISTS opening_templates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  instructions TEXT NOT NULL,              -- what this opening does: what it leads with, its tone and line of thought
  starts VARCHAR(200) NULL,                -- required first words; | between choices ("For your platform,|For you,")
  may_greet TINYINT(1) NOT NULL DEFAULT 0, -- may open with a greeting by name (the Invite opening)
  may_talk_about_us TINYINT(1) NOT NULL DEFAULT 0, -- may say how we would start (the Approach first opening)
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 100,
  source_template_id INT UNSIGNED NULL,    -- the proposal type it was moved from (R88), for the record
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_opening_name (name)
) ENGINE=InnoDB;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS default_opening_id INT UNSIGNED NULL;

-- each active proposal type's own first two lines rules become an opening template, and that type's default (names without "Type N.")
INSERT IGNORE INTO opening_templates (name, instructions, starts, may_greet, may_talk_about_us, active, sort_order, source_template_id)
  SELECT LEFT(CONCAT(TRIM(SUBSTRING_INDEX(t.name, '. ', -1)), ' opening'), 80), t.opening_rules, NULLIF(TRIM(t.opening_starts), ''),
    t.name LIKE '%Invite%', IF(t.opening_no_us = 0, 1, 0), 1, t.priority, t.id
  FROM templates t WHERE t.active = 1 AND t.opening_rules IS NOT NULL AND TRIM(t.opening_rules) <> '' AND NOT EXISTS (SELECT 1 FROM opening_templates);
UPDATE templates t JOIN opening_templates o ON o.source_template_id = t.id SET t.default_opening_id = o.id WHERE t.default_opening_id IS NULL;

-- the opening styles from Settings (R73) move here too: as an admin left them, or else the one that adds a new direction
INSERT IGNORE INTO opening_templates (name, instructions, active, sort_order)
  SELECT JSON_UNQUOTE(JSON_EXTRACT(s.v, CONCAT('$[', n.i, '].name'))), JSON_UNQUOTE(JSON_EXTRACT(s.v, CONCAT('$[', n.i, '].instructions'))),
    JSON_EXTRACT(s.v, CONCAT('$[', n.i, '].active')) = true, 200 + n.i
  FROM app_settings s JOIN (SELECT 0 AS i UNION SELECT 1 UNION SELECT 2 UNION SELECT 3) n
  WHERE s.k = 'writer.opening_styles' AND JSON_EXTRACT(s.v, CONCAT('$[', n.i, '].name')) IS NOT NULL;
INSERT IGNORE INTO opening_templates (name, instructions, active, sort_order)
  SELECT 'The outcome', 'Lead with the result the client is after and what it changes for them or their customers once it works. Warm and personal, still specific to their post. The line of thought: they read on because they can picture it done.', 1, 200
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE k = 'writer.opening_styles');
