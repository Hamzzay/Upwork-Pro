-- R144 (Hamza): the order the chosen projects go in the proposal. Empty on older jobs: they keep the order of the list.
ALTER TABLE job_matches ADD COLUMN pick_no TINYINT UNSIGNED NULL AFTER selected;
