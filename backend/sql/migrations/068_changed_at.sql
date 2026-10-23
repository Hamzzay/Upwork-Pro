-- R127 (Hamza): the Dashboard updates by itself. Any change to a job moves changed_at, so the page can ask "anything new?" cheaply.
ALTER TABLE screenings ADD COLUMN changed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), ADD INDEX idx_screenings_changed (changed_at);
