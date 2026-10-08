import { query } from '../db';

/**
 * The shared part of the Writing guide (writing_docs): writing rules, banned phrases, modules, screening answers and the checklist.
 * The app's writer and the Claude plugin both follow it; the proposal types themselves are the templates.
 */
export interface Guide { rules: string | null; banned: string | null; modules: string | null; screening: string | null; checklist: string | null }

export async function loadGuide(): Promise<Guide> {
  const docs = await query<any>("SELECT kind, content FROM writing_docs WHERE active=1 AND kind<>'type' ORDER BY sort_order");
  const one = (k: string) => docs.filter((d) => d.kind === k).map((d) => d.content.trim()).join('\n\n') || null;
  return { rules: one('rules'), banned: one('banned'), modules: one('modules'), screening: one('screening'), checklist: one('checklist') };
}

/** The quoted phrases of the banned list ("I'm excited to apply"), as patterns: "[project]" matches any short text. */
export function bannedPatterns(banned: string | null): { phrase: string; re: RegExp }[] {
  if (!banned) return [];
  const out: { phrase: string; re: RegExp }[] = [];
  for (const line of banned.split('\n')) {
    if (!/^\s*[*-]\s/.test(line)) continue;
    for (const m of line.matchAll(/["“]([^"”]{3,80})["”]/g)) {
      const phrase = m[1].trim();
      const body = phrase.split(/\[[^\]]*\]/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[’']/g, "['’]")).join('.{1,60}?');
      out.push({ phrase, re: new RegExp(body, 'i') });
    }
  }
  return out;
}

/** "Length: 120 to 200 words" in a type's text. */
export function wordRange(text: string): [number, number] | null {
  const m = /Length:\**\s*(\d+)\s*(?:to|-|–)\s*(\d+)\s*words/i.exec(text);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** "Chosen when: ..." and "Length: ..." lines of a type's text, for listing the types. */
export function typeFacts(plain: string): { chosen_when: string | null; length: string | null } {
  const pick = (label: string) => (new RegExp(`${label}:\\s*([^\\n]+)`, 'i').exec(plain)?.[1] ?? '').replace(/\s*Length:.*$/i, '').trim() || null;
  return { chosen_when: pick('Chosen when'), length: pick('Length') };
}

/** The guide as one block of the writer's prompt. */
export function guideBlock(g: Guide): string {
  const parts = [
    g.rules && `WRITING RULES\n${g.rules}`,
    g.banned && `BANNED PHRASES (never use them)\n${g.banned}`,
    g.modules && `MODULES (add the ones the DETECTED SIGNALS call for, one or two sentences each, where they read naturally)\n${g.modules}`,
    g.screening && `SCREENING ANSWERS (when the post has screening questions, write them after the cover letter, under a line "Screening answers", numbered in the client's order)\n${g.screening}`,
    g.checklist && `CHECK BEFORE ANSWERING (anything that still fails goes in "warnings")\n${g.checklist}`,
  ].filter(Boolean);
  return parts.length ? `HOUSE WRITING GUIDE (shared with the Claude plugin; the NON-NEGOTIABLE RULES above win over it)\n\n${parts.join('\n\n')}` : '';
}
