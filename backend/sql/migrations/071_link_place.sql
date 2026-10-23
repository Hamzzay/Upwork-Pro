-- R134 (Hamza): a project's links go where its proposal type puts them (under the project's title line), not under the block.
-- Written and not sent yet: rebuilt once more so they follow their type (a version a person edited only gets offers, as before).
UPDATE proposals SET parts_status='queued', parts_error=NULL
  WHERE status='done' AND sent_version_no IS NULL AND (parts_status IS NULL OR parts_status IN ('done','error'))
    AND EXISTS (SELECT 1 FROM proposal_versions v WHERE v.proposal_id=proposals.id);
