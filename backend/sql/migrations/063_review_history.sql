-- Every independent review is kept (R114), not only the latest, so Claude and the team can see how a proposal's score moved
-- version by version. The proposal row still holds the latest for the page.
CREATE TABLE IF NOT EXISTS proposal_reviews (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  proposal_id INT UNSIGNED NOT NULL,
  version_no INT NULL,
  reviewer_version INT NULL,
  score DECIMAL(4,1) NULL,
  review_json MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_reviews_proposal (proposal_id, id),
  FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE
) ENGINE=InnoDB;
-- the latest review of every proposal so far becomes the first kept
INSERT INTO proposal_reviews (proposal_id, version_no, reviewer_version, score, review_json, created_at)
  SELECT p.id, p.review_version, p.review_reviewer_version, JSON_EXTRACT(p.review_json, '$.score'), p.review_json, COALESCE(p.reviewed_at, p.updated_at)
  FROM proposals p WHERE p.review_json IS NOT NULL AND NOT EXISTS (SELECT 1 FROM proposal_reviews r WHERE r.proposal_id=p.id);
