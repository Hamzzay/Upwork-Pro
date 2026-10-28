-- R142 (Hamza): a Loom video can belong to projects (a generic one has none), and a proposal can carry more than one video.
-- The first video stays screenings.loom_video_id (the standard one, picked by itself); the ones added after it are listed here.
CREATE TABLE loom_video_projects (
  video_id INT UNSIGNED NOT NULL,
  project_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (video_id, project_id),
  KEY idx_lvp_project (project_id),
  CONSTRAINT lvp_video FOREIGN KEY (video_id) REFERENCES loom_videos (id) ON DELETE CASCADE,
  CONSTRAINT lvp_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE screening_looms (
  screening_id INT UNSIGNED NOT NULL,
  loom_video_id INT UNSIGNED NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  title VARCHAR(200) NULL,
  PRIMARY KEY (screening_id, loom_video_id),
  CONSTRAINT sl_screening FOREIGN KEY (screening_id) REFERENCES screenings (id) ON DELETE CASCADE,
  CONSTRAINT sl_video FOREIGN KEY (loom_video_id) REFERENCES loom_videos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
