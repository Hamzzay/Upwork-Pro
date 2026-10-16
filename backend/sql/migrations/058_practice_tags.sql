-- R102 (Ahmad). Some tags are not about one project but about how the whole company works (Claude Code, documentation, QA testing,
-- consultation, server setup): practice-wide. They do not count when projects are matched (every project would have them), are
-- never shown as a project's missing tag, and the writer may say them as part of how we work. An experience question can be answered
-- "across all our work", which marks its tag practice-wide.
ALTER TABLE tags ADD COLUMN IF NOT EXISTS practice TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE proposal_gaps ADD COLUMN IF NOT EXISTS practice TINYINT(1) NOT NULL DEFAULT 0;
