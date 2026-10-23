-- R130 (Hamza): proposals the AI wrote whole (a structured submission, a chat revision) get every project link put right in code too.
-- Written and not sent yet: rebuilt once more (a version a person edited only gets the missing links offered beside the editor).
UPDATE proposals SET parts_status='queued', parts_error=NULL
  WHERE status='done' AND sent_version_no IS NULL AND (parts_status IS NULL OR parts_status IN ('done','error'))
    AND EXISTS (SELECT 1 FROM proposal_versions v WHERE v.proposal_id=proposals.id);
