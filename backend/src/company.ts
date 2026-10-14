/**
 * The company the app works for (setting "Company name"). It is in every AI instruction (the gate, the tagger, the signals, the
 * project judge, the writer, the reviewer), so a fresh copy of Upwork Pro writes for its own company. Kept here so the prompt
 * builders stay plain functions: it is updated every time the settings are read (settings.ts), which happens before any prompt.
 */
let name = 'Stackup Solutions';
export const companyName = () => name;
export function setCompanyName(n: string | null | undefined) { if (n && n.trim()) name = n.trim(); }
/** "{company}" in admin text (the reviewer's version 1) becomes the company name. */
export const withCompany = (text: string) => text.replace(/\{company\}/g, name);
