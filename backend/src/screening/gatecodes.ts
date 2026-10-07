export interface CodedRule { code: string; type: 'fail' | 'flag' }

/**
 * Writes the rule codes into a gate prompt whose FAIL and FLAG lists are numbered "1. ..." (the original SKILL.md layout):
 * the FAIL list becomes "F1. ...", the FLAG list "G1. ...". The Nth line of each list takes the Nth active code of that type, so the
 * count of lines must equal the count of active rules, or the function refuses to guess.
 */
export function addRuleCodes(content: string, rules: CodedRule[]): { text: string; fail: number; flag: number } {
  const order = (type: 'fail' | 'flag') => rules.filter((r) => r.type === type).map((r) => r.code).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const lines = content.split('\n');
  const sectionOf = (l: string) => (/^###\s+FAIL\b/.test(l) ? 'fail' : /^###\s+FLAG\b/.test(l) ? 'flag' : /^#{1,3}\s/.test(l) ? 'other' : null);
  let section: 'fail' | 'flag' | 'other' | null = null; let n = 0;
  const counts = { fail: 0, flag: 0 };
  const out: string[] = [];
  for (const l of lines) {
    const s = sectionOf(l);
    if (s) { section = s; n = 0; out.push(l); continue; }
    const m = /^(\d+)\.\s+(.*)$/.exec(l);
    if (m && (section === 'fail' || section === 'flag')) { n++; counts[section]++; out.push(`${section === 'fail' ? 'F' : 'G'}${n}. ${m[2]}`); continue; }
    out.push(l);
  }
  const failCodes = order('fail'), flagCodes = order('flag');
  if (counts.fail !== failCodes.length || counts.flag !== flagCodes.length) {
    throw new Error(`the prompt has ${counts.fail} FAIL and ${counts.flag} FLAG lines but the Rules page has ${failCodes.length} and ${flagCodes.length} active rules`);
  }
  // the numbering the lines now carry must be the codes themselves
  const want = new Set([...failCodes, ...flagCodes]);
  const got = new Set<string>(); for (const l of out) { const m = /^([FG]\d+)\.\s/.exec(l); if (m) got.add(m[1]); }
  for (const c of want) if (!got.has(c)) throw new Error(`rule ${c} is not in the prompt after numbering`);
  return { text: out.join('\n'), fail: counts.fail, flag: counts.flag };
}

/** Which active codes the prompt text does not mention (as a whole word). */
export function codesMissingFromPrompt(content: string, rules: { code: string; active: boolean }[]): string[] {
  return rules.filter((r) => r.active && !new RegExp(`(^|[^A-Za-z0-9])${r.code}(?![0-9])`).test(content)).map((r) => r.code);
}
