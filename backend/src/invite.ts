/**
 * R105 (Ahmad): an invite. The client asked us, so Upwork opens the chat at once: its view and chat say nothing about how the
 * proposal did. Reports count invites apart, and an opening earns no view or chat points from one.
 */

/** Words Upwork shows on an invitation, never on a plain job post ("Invites sent" in the activity box is not one). */
const INVITE_RE = /invited you to (submit a proposal|interview|apply)|invitation to interview|accept interview|decline interview|been invited to (this job|interview)/i;

/** Whether a pasted page (or its link) is an invitation. */
export function looksInvited(text: string | null | undefined, url?: string | null): boolean {
  return INVITE_RE.test(text ?? '') || /upwork\.com\/(ab\/)?proposals\/interview\//i.test(url ?? '');
}

/** SQL: true when the job is an invite. Said on the job (yes / no) wins; else a job written with the Invite type is one. Needs s and p. */
export const inviteSql = `(COALESCE(s.invited, IF(p.template_name LIKE '%Invite%', 'yes', 'no'))='yes')`;
