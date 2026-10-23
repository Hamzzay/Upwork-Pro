-- R126 (Hamza): a proposal shows every link of a project (web, Android, iOS), made in code. Proposals written and not sent yet get
-- their project blocks rebuilt once (no AI call unless their screening answers name a project no longer chosen, R125).
UPDATE proposals SET parts_status='queued', parts_error=NULL
  WHERE status='done' AND sent_version_no IS NULL AND (parts_status IS NULL OR parts_status IN ('done','error'))
    AND EXISTS (SELECT 1 FROM proposal_versions v WHERE v.proposal_id=proposals.id);
