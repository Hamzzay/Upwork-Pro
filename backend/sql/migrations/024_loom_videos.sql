-- Loom videos: several short videos per Upwork profile (5 to 7 general topics), each tagged with the job tags it suits, so the best
-- one for a job can be suggested with the profile. Proposal types that link a video come later, once the topics are chosen.
CREATE TABLE IF NOT EXISTS loom_videos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  profile_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  url VARCHAR(500) NOT NULL,
  topic VARCHAR(1000) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_loom_profile_title (profile_id, title),
  FOREIGN KEY (profile_id) REFERENCES upwork_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS loom_video_tags (
  video_id INT UNSIGNED NOT NULL,
  tag_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (video_id, tag_id),
  FOREIGN KEY (video_id) REFERENCES loom_videos(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB;
