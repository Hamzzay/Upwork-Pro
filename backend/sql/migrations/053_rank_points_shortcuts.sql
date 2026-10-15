-- R92 (Ahmad). Openings can be ranked by hand too: a template's score is the proposals sent with it plus its manual points
-- (rank_boost), so a person can put one first and real use can still overtake it later.
ALTER TABLE opening_templates ADD COLUMN IF NOT EXISTS rank_boost INT NOT NULL DEFAULT 0;

-- Word shortcuts: a main word and the short word every proposal uses instead (WhatsApp, WA). The writer is told to use the short
-- word, and every version the AI writes has the main word swapped for it.
CREATE TABLE IF NOT EXISTS word_shortcuts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  main_word VARCHAR(80) NOT NULL,
  short_word VARCHAR(40) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_shortcut_main (main_word)
) ENGINE=InnoDB;
