-- R71. An experience confirmed on a proposal can have been done in several projects: one row per project, each with what the library
-- got for it (added, waiting, note, to_add). proposal_gaps.project_id stays, holding the first project, for anything older that reads it.
CREATE TABLE IF NOT EXISTS proposal_gap_projects (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  gap_id INT UNSIGNED NOT NULL,
  project_id INT UNSIGNED NOT NULL,
  library VARCHAR(20) NULL,
  UNIQUE KEY uq_gap_project (gap_id, project_id),
  FOREIGN KEY (gap_id) REFERENCES proposal_gaps(id) ON DELETE CASCADE
) ENGINE=InnoDB;
-- the answers given before: their one project
INSERT IGNORE INTO proposal_gap_projects (gap_id, project_id, library)
  SELECT id, project_id, library FROM proposal_gaps WHERE status='yes' AND project_id IS NOT NULL;
