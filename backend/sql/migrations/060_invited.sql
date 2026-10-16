-- R105 (Ahmad). Whether a job came as an invite: the client opened the chat, so its view and chat say nothing about the proposal.
-- yes / no when someone (or the pasted post) said so; NULL means not said, and a job written with the Invite type counts as one.
ALTER TABLE screenings ADD COLUMN IF NOT EXISTS invited ENUM('yes','no') NULL;
-- jobs already saved: an invitation in the pasted page, or a flag continued because the client invited us
UPDATE screenings SET invited = 'yes'
  WHERE invited IS NULL AND raw_input REGEXP 'invited you to (submit a proposal|interview|apply)|invitation to interview|accept interview|decline interview|been invited to (this job|interview)';
UPDATE screenings s JOIN overrides o ON o.screening_id = s.id SET s.invited = 'yes'
  WHERE s.invited IS NULL AND (o.reason_picks LIKE '%Invited by the client%' OR o.reason LIKE 'Invited by the client%');
