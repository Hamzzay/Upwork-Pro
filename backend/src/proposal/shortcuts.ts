/**
 * Word shortcuts (R92, Ahmad): a main word and the short word every proposal uses instead (WhatsApp, WA). The writer is told to
 * use the short words (guide.ts), and every version the AI writes has any main word it missed swapped (addVersion). A person's own
 * edits are left as they typed them. Links and email addresses are never touched.
 */
import { query } from '../db';
import { cached } from '../cache';

export interface Shortcut { id: number; main_word: string; short_word: string; active: boolean }

export const activeShortcuts = (): Promise<Shortcut[]> => cached('shortcuts', async () =>
  (await query<any>('SELECT id, main_word, short_word, active FROM word_shortcuts WHERE active=1 ORDER BY CHAR_LENGTH(main_word) DESC, id'))
    .map((r) => ({ id: Number(r.id), main_word: r.main_word, short_word: r.short_word, active: true })));

/** One pattern per shortcut: the whole word or phrase, in any case, never inside a link, an address or a longer word. */
const patterns = (list: Shortcut[]) => list.filter((s) => s.main_word.trim() && s.short_word.trim() && s.main_word.trim().toLowerCase() !== s.short_word.trim().toLowerCase())
  .map((s) => ({ s, re: new RegExp(`(?<![\\w/@.:#-])${s.main_word.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}(?![\\w@]|[./:-]\\w)`, 'gi') }));

/** Plain text with every main word swapped for its short word. Longer main words go first ("WhatsApp Business" before "WhatsApp"). */
export function shortenText(text: string, list: Shortcut[]): string {
  if (!text || !list.length) return text;
  let out = text;
  for (const { s, re } of patterns(list)) out = out.replace(re, s.short_word.trim());
  return out;
}
/** HTML with the swap made in its text only: never in a tag, an attribute or a link's address. */
export function shortenHtml(html: string, list: Shortcut[]): string {
  if (!html || !list.length) return html;
  return html.split(/(<[^>]*>)/).map((part) => (part.startsWith('<') ? part : shortenText(part, list))).join('');
}
/** The writer's instruction. */
export function shortcutsBlock(list: Shortcut[]): string {
  return list.length ? `WORD SHORTCUTS (always write the short word, never the main word, anywhere in the proposal and its answers; links stay as they are)\n${list.map((s) => `- ${s.main_word}: ${s.short_word}`).join('\n')}` : '';
}
