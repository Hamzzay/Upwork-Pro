-- The writing guide the Claude plugin follows (proposal types, writing rules, banned phrases, modules, screening answers, checklist),
-- kept in Upwork Pro so every Claude reads the same text and an edit here reaches all of them. Every save is a new version.
CREATE TABLE IF NOT EXISTS writing_docs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  doc_key VARCHAR(60) NOT NULL,
  kind ENUM('type','rules','banned','modules','screening','checklist') NOT NULL,
  title VARCHAR(160) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  content MEDIUMTEXT NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  updated_by INT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_writing_doc (doc_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS writing_doc_versions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  doc_id INT UNSIGNED NOT NULL,
  content MEDIUMTEXT NOT NULL,
  note VARCHAR(250) NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_wdv_doc (doc_id),
  FOREIGN KEY (doc_id) REFERENCES writing_docs(id) ON DELETE CASCADE
) ENGINE=InnoDB;
