import sanitizeHtml from 'sanitize-html';

/** The only markup the app ever stores or renders for templates and proposals. Everything else is removed on every write. */
const OPTS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'a', 'hr', 'code', 'pre'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    div: 'p', // contenteditable makes <div> for new lines
    a: (_tag, attribs): sanitizeHtml.Tag => (/^\s*(https?:|mailto:)/i.test(attribs.href ?? '')
      ? { tagName: 'a', attribs: { href: attribs.href.trim(), target: '_blank', rel: 'noopener noreferrer' } }
      : { tagName: 'a', attribs: {} }), // not a safe address: stripped to a bare <a>, which is unwrapped below
    b: 'strong', i: 'em',
  },
};

export function sanitizeRich(html: string): string {
  return sanitizeHtml(String(html ?? ''), OPTS).replace(/<a>([\s\S]*?)<\/a>/g, '$1').trim(); // a link without a safe address goes, its text stays
}

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const decode = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** Sanitized HTML -> plain text with line breaks and visible URLs. Used for "Copy as plain text" and to show a template or proposal to the model. */
export function htmlToPlain(html: string): string {
  let t = sanitizeRich(html);
  t = t.replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_m, href: string, text: string) => {
    const label = decode(text.replace(/<[^>]+>/g, '')).trim(); const url = decode(href);
    return !label || label === url || label === url.replace(/^https?:\/\//, '') ? url : `${label} (${url})`;
  });
  t = t.replace(/<br\s*\/?>/g, '\n').replace(/<\/(p|h[1-4]|blockquote|pre)>/g, '\n\n').replace(/<li>/g, '- ').replace(/<\/li>/g, '\n').replace(/<\/(ul|ol)>/g, '\n').replace(/<hr\s*\/?>/g, '\n---\n');
  t = decode(t.replace(/<[^>]+>/g, ''));
  return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Plain text from the model -> safe HTML: paragraphs on blank lines, single newlines kept, http(s) links made clickable. Model output is never trusted as HTML. */
export function textToHtml(text: string): string {
  const paras = String(text ?? '').replace(/\r\n/g, '\n').trim().split(/\n{2,}/).filter((p) => p.trim());
  return sanitizeRich(paras.map((p) => {
    const esc = escapeHtml(p.trim()).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, (u) => `<a href="${u}">${u}</a>`);
    return `<p>${esc.replace(/\n/g, '<br>')}</p>`;
  }).join(''));
}
