export interface CheckInput {
  text: string;
  selectedProjects: { name: string; live_link: string | null; notes: string | null; /** R116: its other links (site, App Store, Google Play) */ links?: string[] }[];
  otherProjectNames: string[];       // every other library project
  foreignNames: string[];            // names of sample authors and people named in templates
  sender: { name: string; gitlab_link: string | null; loom_link?: string | null; /** R142: the videos added after the first */ loom_links?: string[] };
  banned?: { phrase: string; re: RegExp }[];   // from the Writing guide
  wordRange?: [number, number] | null;          // the proposal type's length, for the cover letter
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
  // a name made only of the sender's own name words ("Hamza" for Hamza Yaseen) is the sender, not someone from a sample
  const own = new Set(String(i.sender.name ?? '').toLowerCase().split(/\s+/).filter(Boolean));
  const isSender = (n: string) => n.toLowerCase().split(/\s+/).filter(Boolean).every((x) => own.has(x));
  for (const n of i.foreignNames) if (n && !isSender(n) && has(t, n)) w.push(`The proposal contains the name "${n}", which comes from a sample or template. Remove it.`);
  const allowed = new Set([...i.selectedProjects.flatMap((p) => [p.live_link, ...(p.links ?? [])]).filter(Boolean), i.sender.gitlab_link, i.sender.loom_link, ...(i.sender.loom_links ?? [])].filter(Boolean).map((u) => norm(String(u))));
  for (const u of new Set(urls(t))) if (!allowed.has(norm(u))) w.push(`The link ${u} is not one of the provided project or profile links. Check it.`);
  if (!has(t, i.sender.name)) w.push(`The sign-off does not contain the sender name "${i.sender.name}".`);
  if (i.sender.loom_link && !t.toLowerCase().includes(norm(i.sender.loom_link))) w.push('The Loom video you chose is not in the proposal. Add its link, or write it again.');
  if (i.sender.gitlab_link && !t.toLowerCase().includes(norm(i.sender.gitlab_link))) w.push('The sign-off does not contain the sender\'s code link (GitLab link or GitHub link).');
  const given = i.selectedProjects.map((p) => p.notes ?? '').join(' ');
  const pct = [...new Set(t.match(/\d+(?:\.\d+)?\s*(?:[-–—]\s*\d+(?:\.\d+)?\s*)?%/g) ?? [])].filter((x) => !given.includes(x.replace(/\s+/g, '')) && !given.includes(x));
  if (pct.length) w.push(`The proposal contains a figure (${pct.join(', ')}) that is not in the project facts. Remove it unless it is true.`);
  if (/\b(we|our|ours)\b/i.test(t.replace(/https?:\/\/\S+/g, ''))) w.push('The proposal says "we" or "our". The templates ask for "I".');
  // the Writing guide: banned phrases, dashes, and the type's length (the cover letter only, not the screening answers)
  const letter = t.split(/\n\s*Screening answers\s*:?\s*\n/i)[0];
  for (const b of i.banned ?? []) if (b.re.test(letter)) w.push(`The proposal uses a banned phrase: "${b.phrase}". Rewrite that line.`);
  const dashLines = t.split('\n').filter((l) => /[–—]/.test(l.replace(/https?:\/\/\S+/g, ''))
    && !i.selectedProjects.some((p) => l.trim().toLowerCase().startsWith(p.name.toLowerCase())));
  if (dashLines.length) w.push('The proposal contains a dash (– or —) outside a "Project name – Project title" line. The writing guide allows none elsewhere.');
  if (i.wordRange) {
    const words = letter.replace(/https?:\/\/\S+/g, '').split(/\s+/).filter(Boolean).length;
    const [lo, hi] = i.wordRange;
    if (words < lo * 0.85 || words > hi * 1.15) w.push(`The cover letter is ${words} words; this proposal type asks for ${lo} to ${hi}.`);
  }
  return w;
}

/**
 * The first two lines (what Upwork shows in the preview), checked against the type's opening rules where a machine can: no greeting
 * (except an invite's "Hi [name]"), no project name, no stats, no talk about us when the type forbids it, and the required start.
 * A client's own required opening (`clientOpening`) switches off the start and greeting checks.
 */
export function checkOpening(text: string, o: { noUs: boolean; starts: string | null; projectNames: string[]; invite: boolean; clientOpening: boolean }): string[] {
  const letter = String(text ?? '').split(/\n\s*Screening answers\s*:?\s*\n/i)[0].trim();
  const lines = letter.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  // an invite's greeting line does not count as one of the two lines
  const body = o.invite && lines[0] && /^(hi|hello|hey)\b/i.test(lines[0]) && lines[0].length < 80 ? lines.slice(1) : lines;
  const sentences = body.join(' ').match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [];
  const first = sentences.slice(0, 2).join(' ').trim();
  const out: string[] = [];
  if (!first) return out;
  if (!o.clientOpening && !o.invite && /^(hi|hello|hey|dear|greetings|good (morning|afternoon|evening))\b/i.test(first)) out.push('starts with a greeting');
  if (/\b(my name is|i am a|i'm a|as a (senior|full|certified|top))\b/i.test(first)) out.push('introduces us instead of the client\'s problem');
  for (const n of o.projectNames) if (n && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(first)) out.push(`names a project (${n})`);
  if (/\b\d+(\.\d+)?\s*%|\btop rated\b|\bjob success\b|\b\d+\+?\s*(years|projects|clients)\b/i.test(first)) out.push('gives stats or ratings');
  if (o.noUs && /\b(i|i'm|i've|i'd|i'll|we|we're|we've|we'd|we'll|our|my)\b/i.test(first.replace(/^understood\.?\s*/i, ''))) out.push('talks about us');
  if (o.starts && !o.clientOpening) {
    const ok = o.starts.split('|').map((x) => x.trim()).filter(Boolean).some((x) => letter.toLowerCase().startsWith(x.toLowerCase()));
    if (!ok) out.push(`does not start with ${o.starts.split('|').map((x) => '"' + x.trim() + '"').join(' or ')}`);
  }
  return out;
}
