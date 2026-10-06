export interface CheckInput {
  text: string;
  selectedProjects: { name: string; live_link: string | null; notes: string | null }[];
  otherProjectNames: string[];       // every other library project
  foreignNames: string[];            // names of sample authors and people named in templates
  sender: { name: string; gitlab_link: string | null };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (hay: string, needle: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(needle)}($|[^\\p{L}\\p{N}])`, 'iu').test(hay);
const urls = (t: string) => (t.match(/https?:\/\/[^\s<>"')\]]+/g) ?? []).map((u) => u.replace(/[.,;:!?]+$/, ''));
const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '').toLowerCase();

/** Checks the writer cannot be trusted to do for itself. Returns plain-language warnings for the person who will send the proposal. */
export function checkProposal(i: CheckInput): string[] {
  const w: string[] = [];
  const t = i.text;
  for (const p of i.selectedProjects) {
    if (!has(t, p.name)) w.push(`The proposal does not mention the selected project "${p.name}".`);
    if (!p.live_link) w.push(`"${p.name}" has no live link, so its link line was left out. Add a link to the project in Projects if you want one here.`);
  }
  for (const n of i.otherProjectNames) if (n.length >= 4 && !i.selectedProjects.some((p) => p.name.toLowerCase() === n.toLowerCase()) && has(t, n)) w.push(`The proposal names "${n}", which is not one of the 2 selected projects. Check or remove it.`);
  for (const n of i.foreignNames) if (n && n.toLowerCase() !== i.sender.name.toLowerCase() && has(t, n)) w.push(`The proposal contains the name "${n}", which comes from a sample or template. Remove it.`);
  const allowed = new Set([...i.selectedProjects.map((p) => p.live_link).filter(Boolean), i.sender.gitlab_link].filter(Boolean).map((u) => norm(String(u))));
  for (const u of new Set(urls(t))) if (!allowed.has(norm(u))) w.push(`The link ${u} is not one of the provided project or profile links. Check it.`);
  if (!has(t, i.sender.name)) w.push(`The sign-off does not contain the sender name "${i.sender.name}".`);
  if (i.sender.gitlab_link && !t.toLowerCase().includes(norm(i.sender.gitlab_link))) w.push('The sign-off does not contain the sender\'s GitLab link.');
  const given = i.selectedProjects.map((p) => p.notes ?? '').join(' ');
  const pct = [...new Set(t.match(/\d+(?:\.\d+)?\s*(?:[-–—]\s*\d+(?:\.\d+)?\s*)?%/g) ?? [])].filter((x) => !given.includes(x.replace(/\s+/g, '')) && !given.includes(x));
  if (pct.length) w.push(`The proposal contains a figure (${pct.join(', ')}) that is not in the project facts. Remove it unless it is true.`);
  if (/\b(we|our|ours)\b/i.test(t.replace(/https?:\/\/\S+/g, ''))) w.push('The proposal says "we" or "our". The templates ask for "I".');
  return w;
}
