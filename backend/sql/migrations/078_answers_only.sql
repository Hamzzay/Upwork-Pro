-- R146 (Hamza): Match the chosen projects updates the answers and nothing else, so the queued refresh has to know it is that one.
ALTER TABLE proposals ADD COLUMN answers_only TINYINT(1) NOT NULL DEFAULT 0 AFTER parts_status;
