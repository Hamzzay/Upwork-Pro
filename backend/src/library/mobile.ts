/**
 * Projects keep two store links, Android (Google Play) and iOS (App Store). Older data kept them together in one "mobile link"
 * ("Android: https://play... iOS: https://apps..."). This splits such text: the Google Play link, the App Store link, and anything
 * else, which stays as the "other mobile link" so nothing is lost. Pure function.
 */
export function splitMobile(text: string | null | undefined): { android: string | null; ios: string | null; other: string | null } {
  const t = String(text ?? '').replace(/\\n/g, ' ').trim();
  if (!t) return { android: null, ios: null, other: null };
  const urls = t.match(/https?:\/\/[^\s,;|]+/gi) ?? [];
  const host = (u: string) => { try { return new URL(u).hostname; } catch { return ''; } };
  const android = urls.find((u) => /(^|\.)play\.google\.com$/i.test(host(u))) ?? null;
  const ios = urls.find((u) => /(^|\.)(apps|itunes)\.apple\.com$/i.test(host(u))) ?? null;
  // what is left once the two store links and their labels are taken out
  let rest = t;
  for (const u of [android, ios]) if (u) rest = rest.split(u).join(' ');
  rest = rest.replace(/\b(android|ios|iphone|ipad|google play|play store|app store)\s*:?/gi, ' ').replace(/\s+/g, ' ').trim();
  return { android, ios, other: rest || null };
}
