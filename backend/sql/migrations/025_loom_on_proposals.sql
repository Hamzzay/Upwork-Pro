-- Which Loom video went with a proposal, so "with a video" against "without" can be reported.
-- The title is kept beside the id, so a job keeps its video's name after the video is deleted.
ALTER TABLE screenings
  ADD COLUMN IF NOT EXISTS loom_video_id INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS loom_video_title VARCHAR(200) NULL;
