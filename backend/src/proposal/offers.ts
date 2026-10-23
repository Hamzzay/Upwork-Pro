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

/**
 * Where a project is in the text: the paragraph and line that name it (or hold its link), and the lines after it that are its links,
 * running on into the next paragraph when that one is only its links. Null when the text neither names it nor has its link.
 */
function findProject(bs: Block[], name: string, links: string[]): { b: number; from: number; to: number; nextLinkParas: number } | null {
  for (let b = 0; b < bs.length; b++) {
    if (!bs[b].p) continue;
    const at = bs[b].lines.findIndex((l) => names(plain(l), name) || hasLink(plain(l), links));
    if (at < 0) continue;
    let to = at; while (to + 1 < bs[b].lines.length && (hasLink(plain(bs[b].lines[to + 1]), links) || linkOnly(plain(bs[b].lines[to + 1])))) to++;
    let next = 0; // the link on a paragraph of its own under the name
    if (to === bs[b].lines.length - 1) while (bs[b + 1 + next]?.p && bs[b + 1 + next].lines.every((l) => !plain(l) || hasLink(plain(l), links) || linkOnly(plain(l)))) next++;
    return { b, from: at, to, nextLinkParas: next };
  }
  return null;
}

/** The sign off: the last paragraph that opens with a closing ("Best regards,"), else none. */
const signoffAt = (bs: Block[]) => { for (let i = bs.length - 1; i >= 0; i--) if (bs[i].p && /^(best regards|kind regards|warm regards|regards|best|thanks|thank you|many thanks|cheers|sincerely)\b/i.test(plain(bs[i].lines[0] ?? ''))) return i; return -1; };

/**
 * One offer put into the editor's HTML. `chosen` are the projects of the proposal now (names), so a line that also names one of them is
 * never taken out with the old project. Returns the new HTML and where it went, in words.
 */
export function applyOffer(html: string, o: Offer, chosen: string[] = []): { html: string; where: string } {
  const bs = blocksOf(html);
  const end = (): { html: string; where: string } => { const at = o.kind === 'video' ? signoffAt(bs) : -1;
    if (at >= 0) { bs.splice(at, 0, { html: para(o.text), p: false, lines: [] }); return { html: join(bs), where: 'Put it before the sign off' }; }
    return { html: join(bs) + para(o.text), where: 'Put it at the end' }; };
  const sharesLine = (l: string, old: string) => chosen.some((c) => c.toLowerCase() !== old.toLowerCase() && names(plain(l), c));
  if ((o.kind === 'project' && o.replaces) || o.kind === 'remove') {
    const old = o.replaces ?? o.project ?? '';
    const hit = findProject(bs, old, o.old_links ?? []);
    if (hit && !bs[hit.b].lines.slice(hit.from, hit.to + 1).some((l) => sharesLine(l, old))) {
      const blk = bs[hit.b], whole = hit.from === 0 && hit.to === blk.lines.length - 1;
      const lines = o.kind === 'remove' ? [] : linesHtml(o.text);
      bs.splice(hit.b + 1, hit.nextLinkParas); // its link paragraphs go with it
      if (whole) bs.splice(hit.b, 1, ...(o.kind === 'remove' ? [] : [{ html: '', p: true, lines }]));
      else blk.lines.splice(hit.from, hit.to - hit.from + 1, ...lines);
      return { html: join(bs), where: o.kind === 'remove' ? `Took out ${old}` : `Put it in place of ${old}` };
    }
    if (o.kind === 'remove') return { html, where: `${old} is not in the text any more` };
  }
  if (o.kind === 'links' && o.project) { // under the project's last link line, else under its name line
    const hit = findProject(bs, o.project, []);
    if (hit) {
      const blk = bs[hit.b + hit.nextLinkParas], lines = linesHtml(o.text);
      if (hit.nextLinkParas) blk.lines.push(...lines); else blk.lines.splice(hit.to + 1, 0, ...lines);
      return { html: join(bs), where: `Put them under ${o.project}` };
    }
  }
  if (o.kind === 'project') { // a project with nothing to replace: after the last project block, before the paragraph that follows the proof
    const projs = chosen.filter((c) => c.toLowerCase() !== (o.project ?? '').toLowerCase());
    let lastAt = -1; for (let b = 0; b < bs.length; b++) if (bs[b].p && bs[b].lines.some((l) => projs.some((c) => names(plain(l), c)))) lastAt = b;
    if (lastAt >= 0) { let b = lastAt; while (bs[b + 1]?.p && bs[b + 1].lines.every((l) => !plain(l) || linkOnly(plain(l)))) b++;
      bs.splice(b + 1, 0, { html: para(o.text), p: false, lines: [] }); return { html: join(bs), where: 'Put it after the other projects' }; }
  }
  return end();
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
