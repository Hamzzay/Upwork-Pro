/**
 * R132 (Hamza): the parts offered beside a proposal the person edited by hand (projects changed after it was written), put in where
 * they belong instead of at the end. A new project takes the place of the project it replaces: the old one's lines (its name line,
 * then its link lines) become the new block. A project taken out without a replacement is offered as "Take it out". Missing links go
 * under their project, the Loom line before the sign off. Pure: works on the editor's HTML, no database.
 */
import { escapeHtml } from '../html';

export interface Offer { kind: 'project' | 'links' | 'remove' | 'video' | 'signoff'; label: string; text: string; project?: string; replaces?: string; old_links?: string[] }

const decode = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const plain = (h: string) => decode(h.replace(/<a [^>]*href="([^"]*)"[^>]*>[\s\S]*?<\/a>/g, ' $1 ').replace(/<[^>]+>/g, '')).trim();
const bare = (u: string) => u.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
const flat = (t: string) => t.toLowerCase().replace(/https?:\/\/(www\.)?/g, '');
/** Its name, and its name without a part in brackets ("Open Dental AI Calling (Chloe)"). */
const namesOf = (n: string) => [n, n.replace(/\s*\([^)]*\)\s*/g, ' ').trim()].map((x) => x.toLowerCase()).filter((x) => x.length > 2);
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const names = (text: string, name: string) => namesOf(name).some((x) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(x)}($|[^\\p{L}\\p{N}])`, 'u').test(text.toLowerCase()));
const hasLink = (text: string, links: string[]) => links.some((u) => u && flat(text).includes(bare(u)));
/** A line that is only links (and maybe a label like "Live:" or "Android link:"). */
const linkOnly = (t: string) => /https?:\/\/|www\./i.test(t) && t.replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/\b(web|android|ios|app store|google play|play store|live|link|links|site|website|demo)\b|[|:,()\-–—]/gi, '').trim() === '';

/** The text as HTML lines for one paragraph (links made clickable, the way textToHtml does). */
const linesHtml = (text: string) => text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim()).map((l) => escapeHtml(l.trim()).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, (u) => `<a href="${u}">${u}</a>`));
const para = (text: string) => text.replace(/\r\n/g, '\n').trim().split(/\n{2,}/).map((p) => `<p>${linesHtml(p).join('<br>')}</p>`).join('');

/** The editor's HTML as its top-level blocks; each paragraph also as its lines. */
interface Block { html: string; p: boolean; lines: string[] }
function blocksOf(html: string): Block[] {
  const out: Block[] = []; const re = /<(p|h[1-6]|ul|ol|blockquote|pre)\b[^>]*>[\s\S]*?<\/\1>|<hr\s*\/?>/gi; let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m.index > last && html.slice(last, m.index).trim()) out.push({ html: html.slice(last, m.index), p: false, lines: [] });
    const isP = /^<p\b/i.test(m[0]); const inner = isP ? m[0].replace(/^<p\b[^>]*>|<\/p>$/gi, '') : '';
    out.push({ html: m[0], p: isP, lines: isP ? inner.split(/<br\s*\/?>/i) : [] }); last = re.lastIndex;
  }
  if (html.slice(last).trim()) out.push({ html: html.slice(last), p: false, lines: [] });
  return out;
}
const join = (bs: Block[]) => bs.map((b) => (b.p ? (b.lines.some((l) => plain(l)) ? `<p>${b.lines.join('<br>')}</p>` : '') : b.html)).join('');

/** A place in the text: a paragraph and a line in it. */
interface Pos { b: number; i: number }
/** The library, so a project's block is known to stop where another project starts. */
export interface LibProject { name: string; links: string[] }

/**
 * Where a project's block is in the text (R132, second pass after job 264): from its title line through its last link, across
 * paragraphs. A proof block is often a title, a blank line, the description and the links under it, so the paragraph that names it
 * is only the start. Its start is the mention followed by its own link (the block, not a passing mention in the opening); the block
 * runs to its last link line and never past a line that names another project or the sign off. A project with no link in the text:
 * its title line, and the paragraph under a title that stands alone. Null when the text neither names it nor has its link.
 */
function findSpan(bs: Block[], name: string, links: string[], others: string[]): { from: Pos; to: Pos } | null {
  const flat: (Pos & { t: string })[] = [];
  bs.forEach((blk, b) => { if (blk.p) blk.lines.forEach((l, i) => flat.push({ b, i, t: plain(l) })); else flat.push({ b, i: -1, t: '\u0000' }); }); // a list or heading: a wall
  const stop = (t: string) => t === '\u0000' || others.some((n) => names(t, n)) || /^(best regards|kind regards|warm regards|regards|best|thanks|thank you|many thanks|cheers|sincerely)\b/i.test(t);
  // a line that also names another project ("I built Apex and Kruzee") is never where its block starts: it is not its block
  const starts = flat.map((x, k) => ({ x, k })).filter(({ x }) => x.t !== '\u0000' && (names(x.t, name) || hasLink(x.t, links)) && !others.some((n) => names(x.t, n)));
  if (!starts.length) return null;
  let best: { from: number; to: number; score: number } | null = null;
  for (const { x, k } of starts) {
    let lastLink = hasLink(x.t, links) ? k : -1;
    for (let j = k + 1; j < flat.length && j <= k + 14 && !stop(flat[j].t); j++) if (hasLink(flat[j].t, links)) lastLink = j;
    let to = lastLink >= 0 ? lastLink : k;
    while (to + 1 < flat.length && flat[to + 1].b === flat[to].b && linkOnly(flat[to + 1].t) && !stop(flat[to + 1].t)) to++; // its link lines right under it
    if (lastLink < 0) { // no link of its own: a title that stands alone takes the paragraph under it
      const alone = bs[x.b].lines.filter((l) => plain(l)).length === 1 && x.t.length <= 140;
      const next = flat.findIndex((y) => y.b > x.b);
      if (alone && next >= 0 && !stop(flat[next].t)) { to = next; while (to + 1 < flat.length && flat[to + 1].b === flat[next].b) to++; }
    }
    const score = (lastLink >= 0 ? 4 : 0) + (x.t.toLowerCase().startsWith(name.toLowerCase().slice(0, 6)) ? 2 : 0) + (to > k ? 1 : 0);
    if (!best || score > best.score) best = { from: k, to, score };
  }
  return { from: { b: flat[best!.from].b, i: flat[best!.from].i }, to: { b: flat[best!.to].b, i: flat[best!.to].i } };
}
/**
 * R132 (job 264): a structured proposal names a project in several places (the opening sentence, a "links below" list, its own
 * section). Once its section is swapped, every other mention follows: its links become the new project's (the first of them for a
 * link with no match), its name the new name, and a link line that repeats the one above it goes. Words around them stay. For a
 * project taken out, a line that is only its name and links goes; a sentence that names it is left, and counted.
 */
function renameRest(bs: Block[], oldName: string, oldLinks: string[], newName: string | null, newLinks: string[]): { bs: Block[]; renamed: number; left: number } {
  let renamed = 0, left = 0;
  const swapLinks = (line: string) => { let out = line;
    oldLinks.forEach((u, k) => { const target = newLinks[k] ?? newLinks[0]; if (!u) return;
      const re = new RegExp(`https?:\\/\\/(www\\.)?${esc(bare(u))}\\/?(?![\\w-])`, 'gi');
      out = out.replace(re, target ?? ''); });
    return out; };
  const nameRe = new RegExp(`(^|[^\\p{L}\\p{N}])(${namesOf(oldName).map(esc).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'giu');
  const swapName = (line: string) => line.split(/(<[^>]+>)/).map((part) => (part.startsWith('<') || /^\s*https?:\/\//.test(part) ? part : part.replace(nameRe, (_m, pre) => pre + newName))).join('');
  for (const blk of bs) {
    if (!blk.p) continue;
    const next: string[] = [];
    for (const line of blk.lines) {
      const t = plain(line); if (!names(t, oldName) && !hasLink(t, oldLinks)) { next.push(line); continue; }
      if (newName == null) { // taken out: a line of only its name and links goes; a sentence stays, and is counted
        const rest = namesOf(oldName).reduce((x, n) => x.toLowerCase().split(n).join(''), t);
        if (linkOnly(rest) || !rest.replace(/[\s\-\u2013\u2014:|,.]/g, '')) { renamed++; continue; }
        left++; next.push(line); continue;
      }
      const changed = swapName(swapLinks(line)); renamed++;
      if (linkOnly(plain(changed)) && next.length && plain(next[next.length - 1]).includes(plain(changed).replace(/^.*?(https?:\/\/\S+).*$/, '$1'))) continue; // the same link twice in a row
      next.push(changed);
    }
    blk.lines = next;
  }
  return { bs, renamed, left };
}

/** The text with a span replaced by new paragraphs: what was before it in its first paragraph and after it in its last stays, apart. */
function spliceSpan(bs: Block[], sp: { from: Pos; to: Pos }, insert: Block[]): Block[] {
  const before = bs[sp.from.b].lines.slice(0, sp.from.i), after = bs[sp.to.b].lines.slice(sp.to.i + 1);
  const keep = (lines: string[]): Block[] => (lines.some((l) => plain(l)) ? [{ html: '', p: true, lines }] : []);
  return [...bs.slice(0, sp.from.b), ...keep(before), ...insert, ...keep(after), ...bs.slice(sp.to.b + 1)];
}
const paraBlocks = (text: string): Block[] => text.replace(/\r\n/g, '\n').trim().split(/\n{2,}/).filter((x) => x.trim()).map((x) => ({ html: '', p: true, lines: linesHtml(x) }));

/** The sign off: the last paragraph that opens with a closing ("Best regards,"), else none. */
const signoffAt = (bs: Block[]) => { for (let i = bs.length - 1; i >= 0; i--) if (bs[i].p && /^(best regards|kind regards|warm regards|regards|best|thanks|thank you|many thanks|cheers|sincerely)\b/i.test(plain(bs[i].lines[0] ?? ''))) return i; return -1; };

/**
 * One offer put into the editor's HTML. `chosen` are the projects of the proposal now (names), so a line that also names one of them is
 * never taken out with the old project. Returns the new HTML and where it went, in words.
 */
export function applyOffer(html: string, o: Offer, chosen: string[] = [], library: LibProject[] = []): { html: string; where: string } {
  let bs = blocksOf(html);
  const linksOf = (n: string) => library.find((x) => x.name.toLowerCase() === n.toLowerCase())?.links ?? [];
  const othersThan = (n: string) => [...new Set([...chosen, ...library.map((x) => x.name)])].filter((x) => x.toLowerCase() !== n.toLowerCase() && !n.toLowerCase().includes(x.toLowerCase()));
  const spanOf = (n: string, links = linksOf(n)) => findSpan(bs, n, links, othersThan(n));
  if ((o.kind === 'project' && o.replaces) || o.kind === 'remove') {
    const old = o.replaces ?? o.project ?? '';
    const sp = spanOf(old, [...new Set([...(o.old_links ?? []), ...linksOf(old)])]);
    if (sp) {
      bs = spliceSpan(bs, sp, o.kind === 'remove' ? [] : paraBlocks(o.text));
      // its other mentions follow (job 264: the opening sentence and a "links below" list still named the old project)
      const rest = renameRest(bs, old, [...new Set([...(o.old_links ?? []), ...linksOf(old)])], o.kind === 'remove' ? null : o.project ?? null, o.project ? linksOf(o.project) : []);
      const more = rest.renamed ? `, and ${o.kind === 'remove' ? 'took it out of' : `put ${o.project} in`} ${rest.renamed} other place${rest.renamed === 1 ? '' : 's'}` : '';
      const still = rest.left ? `. ${old} is still named in ${rest.left} sentence${rest.left === 1 ? '' : 's'}: edit ${rest.left === 1 ? 'it' : 'them'}` : '';
      return { html: join(rest.bs), where: (o.kind === 'remove' ? `Took out ${old}` : `Put it in place of ${old}`) + more + still };
    }
    if (o.kind === 'remove') return { html, where: `${old} is not in the text any more` };
  }
  if (o.kind === 'links' && o.project) { // right under the project's block (its last link line, else its title)
    const sp = spanOf(o.project);
    if (sp) { bs[sp.to.b].lines.splice(sp.to.i + 1, 0, ...linesHtml(o.text)); return { html: join(bs), where: `Put them under ${o.project}` }; }
  }
  if (o.kind === 'project') { // nothing to replace: after the last of the other projects' blocks
    const ends = chosen.filter((c) => c.toLowerCase() !== (o.project ?? '').toLowerCase()).map((c) => spanOf(c)).filter(Boolean) as { from: Pos; to: Pos }[];
    if (ends.length) {
      const last = ends.reduce((a, x) => (x.to.b > a.to.b || (x.to.b === a.to.b && x.to.i > a.to.i) ? x : a));
      const tail = bs[last.to.b].lines.slice(last.to.i + 1);
      bs[last.to.b].lines = bs[last.to.b].lines.slice(0, last.to.i + 1);
      bs.splice(last.to.b + 1, 0, ...paraBlocks(o.text), ...(tail.some((l) => plain(l)) ? [{ html: '', p: true, lines: tail }] : []));
      return { html: join(bs), where: 'Put it after the other projects' };
    }
  }
  const at = o.kind === 'video' ? signoffAt(bs) : -1;
  if (at >= 0) { bs.splice(at, 0, ...paraBlocks(o.text)); return { html: join(bs), where: 'Put it before the sign off' }; }
  return { html: join(bs) + para(o.text), where: 'Put it at the end' };
}

/**
 * Which project each new one replaces: the projects the text still names that are no longer chosen, in the order the text has them,
 * paired with the new projects in their order. Old ones left over are offered to take out.
 */
export function pairReplacements(text: string, newOnes: string[], library: string[], chosen: string[]): { pairs: Map<string, string>; leftover: string[] } {
  const t = text.toLowerCase(), chosenSet = new Set(chosen.map((c) => c.toLowerCase()));
  const old = library.filter((n) => !chosenSet.has(n.toLowerCase()) && names(t, n) && !chosen.some((c) => c.toLowerCase().includes(n.toLowerCase())))
    .map((n) => ({ n, at: Math.min(...namesOf(n).map((x) => t.indexOf(x)).filter((i) => i >= 0)) })).sort((a, b) => a.at - b.at).map((x) => x.n);
  const pairs = new Map<string, string>();
  newOnes.forEach((n, i) => { if (old[i]) pairs.set(n, old[i]); });
  return { pairs, leftover: old.slice(newOnes.length) };
}
