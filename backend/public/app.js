'use strict';
// All text goes in through textContent, never innerHTML, so job text and model output cannot inject markup.
// The only innerHTML below is for the fixed icon strings in ICONS.
const $app = document.getElementById('app');
let me = null;
let CFG = null; // admin settings (GET /settings), loaded after sign-in
const cfg = (k, d) => (CFG && CFG[k] !== undefined ? CFG[k] : d);

// ---------- helpers ----------
const ICONS = {
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  logo: '<path d="M6 4v7a6 6 0 0 0 12 0V4"/><path d="M12 15V7M9 10l3-3 3 3"/>', // a U with an upward arrow: Upwork Pro
  screen: '<path d="M12 5v14M5 12h14"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  skill: '<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  audit: '<path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="9"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  warn: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/>',
  x: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  // one icon per page and section (R86), so the slim sidebar can be read by its icons alone
  message: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 10.5h7M8.5 13.5h4"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  books: '<path d="M4 4h4v16H4z"/><path d="M10 4h4v16h-4z"/><path d="M16 5.5l3.4-.9 3.1 14.6-3.4.9z"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  signal: '<circle cx="12" cy="10" r="2"/><path d="M12 12v9"/><path d="M8.5 6.5a5 5 0 0 0 0 7M15.5 6.5a5 5 0 0 1 0 7M5.5 3.5a9 9 0 0 0 0 13M18.5 3.5a9 9 0 0 1 0 13"/>',
  review: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M8 11l2 2 4-4"/>',
  funnel: '<path d="M3 4h18l-7 9v6l-4 2v-8z"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h6M9 18h3"/>',
  scale: '<path d="M12 3v18M7 21h10M5 7h14"/><path d="M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12 15h5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17h.01"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  compare: '<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/>',
  clip: '<path d="M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>',
  doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
  badge: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="11" r="2.5"/><path d="M5.5 17c.8-2 2.2-3 3.5-3s2.7 1 3.5 3M15 9h3M15 13h3"/>',
  building: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
  chart: '<path d="M3 20h18M7 20v-8M12 20V5M17 20v-11"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>',
  tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><path d="M7.5 7.5h.01"/>',
};
function icon(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'i'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] || '';
  return s;
}
// The browser prints a missing piece as the word "null" when it is handed to append, prepend or replaceChildren. Nothing in
// this app means that, so a missing piece is left out, everywhere, the same way h() leaves it out.
for (const m of ['append', 'prepend', 'replaceChildren']) {
  const native = Element.prototype[m];
  Element.prototype[m] = function (...kids) { return native.apply(this, kids.filter((k) => k != null && k !== false)); };
}
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
async function api(method, path, body) {
  // anything but GET goes as JSON, even with nothing to send (a delete): the server refuses other requests (cross-site form posts)
  const json = method !== 'GET';
  const r = await fetch('/api' + path, { method, headers: json ? { 'Content-Type': 'application/json' } : {}, body: json ? JSON.stringify(body || {}) : undefined });
  const data = await r.json().catch(() => ({}));
  // R122: the web server in front of the app refuses a request bigger than its limit before the app sees it (attached files, mostly)
  if (r.status === 413) { const e = new Error('The files are too big for the server to accept. Attach fewer or smaller files at a time, or ask an admin to raise the upload limit (Settings, Check file reading).'); e.status = 413; throw e; }
  if (!r.ok) { const e = new Error(data.error || (r.status >= 502 ? 'The server did not answer. Try again in a minute.' : 'Something went wrong. Try again.')); e.status = r.status; e.data = data; throw e; }
  return data;
}
/** First letter up: model-written values often start lower case ("not shown"). */
const cap = (v) => (typeof v === 'string' && v ? v[0].toUpperCase() + v.slice(1) : v);
// Every time from the server is Pakistan time (UTC+5); it is shown in your own zone (TZ below), whatever the device's own zone.
// the zone you see times in: Pakistan time unless you chose another (Your account, Your time zone). Set once you are signed in.
let TZ = 'Asia/Karachi';
const ZONE_NAMES = { 'Asia/Karachi': 'Pakistan time', 'America/New_York': 'US Eastern', 'America/Chicago': 'US Central', 'America/Denver': 'US Mountain', 'America/Los_Angeles': 'US Pacific', 'Europe/London': 'UK', 'Asia/Dubai': 'UAE', UTC: 'UTC' };
const toDate = (s) => { if (!s) return null; const t = String(s).replace(' ', 'T'); return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : (t.length <= 10 ? t + 'T00:00:00' : t) + '+05:00'); };
function ago(s) {
  const d = toDate(s); if (!d) return '';
  const sec = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'Just now';
  if (sec < 3600) return Math.floor(sec / 60) + ' min ago';
  if (sec < 86400) return Math.floor(sec / 3600) + ' h ago';
  if (sec < 604800) return Math.floor(sec / 86400) + ' d ago';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
}
/** ago() inside a sentence: "Finished just now", not "Finished Just now". */
const agoIn = (s) => { const t = ago(s); return t === 'Just now' ? 'just now' : t; };
/** A day in a table: 7 Oct 2026. */
const dayText = (s) => { if (!s) return ''; const t = String(s); const d = toDate(t); return isNaN(d) ? t : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }); };
const full = (s) => { const d = toDate(s); return d ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ }) : ''; };
const initials = (n) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

function toast(msg, bad) {
  let box = document.querySelector('.toasts');
  if (!box) { box = h('div', { class: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: 'toast' + (bad ? ' bad' : '') }, msg);
  box.append(t); setTimeout(() => t.remove(), 3800);
}
function modal({ title, body, confirm = 'Confirm', danger, onConfirm, wide, extra, noConfirm }) {
  const dlg = h('dialog', {});
  const err = h('div', { class: 'err', hidden: true });
  const ok = h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button' }, confirm);
  ok.onclick = async () => {
    err.hidden = true; ok.disabled = true;
    try { if ((await onConfirm()) !== false) dlg.close(); } catch (e) { err.textContent = e.message; err.hidden = false; }
    ok.disabled = false;
  };
  if (wide) dlg.classList.add('wide');
  dlg.append(h('div', { class: 'dh' }, h('h2', {}, title)), h('div', { class: 'db' }, body, err),
    h('div', { class: 'df' }, extra ? h('span', { style: 'margin-right:auto' }, extra(dlg)) : null,
      h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, noConfirm ? 'Close' : 'Cancel'), noConfirm ? null : ok));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg); dlg.showModal();
  return dlg;
}
/** A password box with a Show / Hide button. Returns the wrapper; read the value from the input you passed in. */
function withShow(input) {
  const b = h('button', { type: 'button', class: 'pwshow', 'aria-label': 'Show the password', 'aria-pressed': 'false' }, 'Show');
  b.onclick = () => { const on = input.type === 'password'; input.type = on ? 'text' : 'password'; b.textContent = on ? 'Hide' : 'Show'; b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? 'Hide the password' : 'Show the password'); input.focus(); };
  return h('div', { class: 'pwwrap' }, input, b);
}
/** Change your own password: the current one, then the new one twice. */
function changePassword() {
  const mk = (id, ac) => h('input', { type: 'password', id, autocomplete: ac });
  const cur = mk('cp0', 'current-password'), nw = mk('cp1', 'new-password'), again = mk('cp2', 'new-password');
  modal({ title: 'Change your password', confirm: 'Change password', body: h('div', {},
    h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'cp0' }, 'Current password'), withShow(cur)),
    h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'cp1' }, 'New password'), withShow(nw), h('div', { class: 'hint' }, 'At least 10 characters.')),
    h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'cp2' }, 'New password again'), withShow(again)),
    h('p', { class: 'hint' }, 'You stay signed in here. Any other place you are signed in is signed out.')),
    onConfirm: async () => {
      if (nw.value !== again.value) throw new Error('The two new passwords are not the same');
      await api('POST', '/me/password', { current: cur.value, password: nw.value }); toast('Password changed');
    } });
  cur.focus();
}
/** A person's picture (R87), or their initials when they have none. */
function avatarEl(u, size) {
  const el = h('div', { class: 'avatar', style: size ? `width:${size}px;height:${size}px;font-size:${Math.round(size / 2.6)}px` : null });
  if (u && u.avatar_v != null) el.append(h('img', { src: `/api/users/${u.id}/avatar?v=${u.avatar_v}`, alt: '', onerror: (e) => { e.target.remove(); el.textContent = initials(u.name); } }));
  else el.textContent = initials(u ? u.name : '');
  return el;
}
/** A picture from the computer, cut to a centered square of 256 pixels and saved as a JPEG, in the browser. */
function squareImage(file) {
  // read straight from the file (no image address: the app's security rules allow images from itself only)
  return (async () => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Choose a JPEG, PNG or WebP picture');
    if (file.size > 15 * 1024 * 1024) throw new Error('That picture is larger than 15 MB');
    let img; try { img = await createImageBitmap(file); } catch { throw new Error('That picture could not be opened'); }
    const side = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 256, 256);
    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
    if (img.close) img.close();
    return c.toDataURL('image/jpeg', 0.88);
  })();
}
/** Your account (R87): your picture, your name, and your password. Your email is how you sign in: an admin changes it. */
function accountDialog() {
  const pic = h('div', { class: 'acctpic' });
  const drawPic = () => pic.replaceChildren(avatarEl(me, 84));
  drawPic();
  const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true });
  const up = h('button', { type: 'button', class: 'btn sm', onclick: () => file.click() }, 'Upload a picture');
  const rm = h('button', { type: 'button', class: 'btn sm', hidden: me.avatar_v == null }, 'Remove');
  file.onchange = async () => {
    const f = file.files[0]; file.value = ''; if (!f) return;
    btnBusy(up, 'Saving');
    try { const r = await api('PUT', '/me/avatar', { data: await squareImage(f) }); me.avatar_v = r.avatar_v; drawPic(); rm.hidden = false; toast('Picture saved'); refreshSide(); }
    catch (x) { toast(x.message, true); }
    up.disabled = false; up.replaceChildren('Upload a picture');
  };
  rm.onclick = async () => { try { await api('DELETE', '/me/avatar'); me.avatar_v = null; drawPic(); rm.hidden = true; toast('Picture removed'); refreshSide(); } catch (x) { toast(x.message, true); } };
  const name = h('input', { type: 'text', id: 'acname', maxlength: 120, value: me.name });
  const saveName = h('button', { type: 'button', class: 'btn sm primary' }, 'Save name');
  saveName.onclick = async () => {
    btnBusy(saveName, 'Saving');
    try { const r = await api('PUT', '/me/name', { name: name.value }); me.name = r.name; drawPic(); toast('Name saved'); refreshSide(); }
    catch (x) { toast(x.message, true); }
    saveName.disabled = false; saveName.replaceChildren('Save name');
  };
  const refreshSide = () => document.querySelectorAll('.me').forEach((el) => { const a = el.querySelector('.avatar'); if (a) a.replaceWith(avatarEl(me)); const w = el.querySelector('.who strong'); if (w) w.textContent = me.name; });
  modal({ title: 'Your account', noConfirm: true, body: h('div', { class: 'stack', style: 'gap:18px' },
    h('div', { class: 'row', style: 'gap:16px;align-items:center' }, pic, h('div', { class: 'stack', style: 'gap:6px' }, h('div', { class: 'row', style: 'gap:6px' }, up, rm), h('span', { class: 'hint', style: 'margin:0' }, 'A square is cut from the middle of the picture.')), file),
    h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'acname' }, 'Your name'), h('div', { class: 'row', style: 'gap:8px;flex-wrap:nowrap' }, name, saveName)),
    (() => { // your time zone: how the app shows you times and counts your days
      const sel = h('select', { id: 'actz', 'aria-label': 'Your time zone' }, Object.entries(ZONE_NAMES).map(([id, label]) => h('option', { value: id, selected: id === TZ }, label + (id === 'Asia/Karachi' ? ' (the app\'s own)' : ''))));
      const save = h('button', { type: 'button', class: 'btn sm primary' }, 'Save time zone');
      save.onclick = async () => { btnBusy(save, 'Saving'); try { await api('PUT', '/me/time-zone', { time_zone: sel.value }); TZ = sel.value; me.prefs = { ...(me.prefs || {}), time_zone: sel.value }; toast('Time zone saved'); route(); } catch (x) { toast(x.message, true); } save.disabled = false; save.replaceChildren('Save time zone'); };
      return h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'actz' }, 'Your time zone'), h('div', { class: 'row', style: 'gap:8px;flex-wrap:nowrap' }, sel, save),
        h('div', { class: 'hint' }, 'The app shows you times, and counts your days (Today, the dates you filter by), in this zone. Only for you; everyone else keeps their own.'));
    })(),
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Email'), h('div', {}, me.email), h('div', { class: 'hint' }, 'You sign in with it. An admin can change it on the Users page.')),
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Password'), h('div', {}, h('button', { type: 'button', class: 'btn sm', onclick: (e) => { e.currentTarget.closest('dialog').close(); changePassword(); } }, 'Change your password')))) });
}
// ---------- loading screens (R99): every wait says what is being done, with real detail, and how long is left ----------
let LOADER_FACTS = null, loaderFactsP = null;
/** The rules, tag categories and projects the AI works through, and the usual time of each step (one call, then kept). */
function loaderFacts() {
  if (LOADER_FACTS) return Promise.resolve(LOADER_FACTS);
  return (loaderFactsP = loaderFactsP || api('GET', '/loader-facts').then((d) => (LOADER_FACTS = d)).catch(() => (LOADER_FACTS = { rules: [], categories: [], projects: [], typical: {} })));
}
const LOADERS = new Map(); // a loader keeps its place across redraws of the page under it
const fmtLeft = (n) => (n < 60 ? `${Math.max(5, Math.round(n / 5) * 5)} s` : `${Math.floor(n / 60)} min${n % 60 >= 30 ? ' 30 s' : ''}`);
const fmtSoFar = (n) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
const shuffleOnce = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
/**
 * R101 (Ahmad): one plain loading screen everywhere. A title with the time on the right, a thin bar that never goes back, and the
 * step it is on ("Step 2 of 3: Checking the rules"). Nothing else moves. It keeps its place when the page under it refreshes.
 * o: { id, title, steps: [{ key, label, share? }], stage: () => key, typical?: seconds, elapsed?: seconds }
 */
function liveLoader(o) {
  let st = LOADERS.get(o.id);
  if (!st) { st = { at: Date.now() - (o.elapsed || 0) * 1000, key: null, since: 0, pct: 0 }; LOADERS.set(o.id, st); }
  const total = o.steps.reduce((n, x) => n + (x.share || 1), 0);
  let acc = 0; const band = {}; for (const x of o.steps) { const w = ((x.share || 1) / total) * 97; band[x.key] = [acc, acc + w, (x.share || 1) / total]; acc += w; }
  const time = h('span', { class: 'ldtime' }), bar = h('i', {}), step = h('div', { class: 'ldstep' });
  const el = h('div', { class: 'ld', role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'ldhead' }, h('strong', {}, o.title), time), h('div', { class: 'ldbar' }, bar), step);
  let seen = false;
  const paint = () => {
    if (el.isConnected) seen = true; else if (seen) return false;
    const key = o.stage(), now = Date.now();
    if (key !== st.key) { st.key = key; st.since = now; }
    const idx = Math.max(0, o.steps.findIndex((x) => x.key === key)), x = o.steps[idx];
    const [from, to, share] = band[key] || [0, 97, 1], T = Number(o.typical) || 0, inStage = (now - st.since) / 1000, sec = (now - st.at) / 1000;
    st.pct = Math.max(st.pct, from + (to - from) * (1 - Math.exp(-inStage / Math.max(3, share * (T || 90)))) * 0.95);
    bar.style.width = st.pct.toFixed(1) + '%';
    const left = T - sec;
    time.textContent = fmtSoFar(sec) + (T ? (left > 6 ? ` · about ${fmtLeft(left)} left` : ' · almost done') : '');
    const txt = o.steps.length > 1 ? `Step ${idx + 1} of ${o.steps.length}: ${x ? x.label : ''}` : x ? x.label : '';
    if (step.textContent !== txt) step.textContent = txt;
    return true;
  };
  paint();
  const t = setInterval(() => { if (!paint()) clearInterval(t); }, 500);
  return el;
}
/** The one-line version for the smaller waits: a spinner, what it is doing, the time so far, and a thin bar. */
function liveLine(o) {
  let st = LOADERS.get(o.id); if (!st) { st = { at: Date.now() }; LOADERS.set(o.id, st); }
  const time = h('span', { class: 'ldtime' }), fill = h('i');
  const el = h('div', { class: 'ldline', role: 'status' }, h('div', { class: 'ldhead' }, h('span', { class: 'row', style: 'gap:8px;min-width:0' }, h('span', { class: 'spin' }), h('span', { class: 'ldlabel' }, o.label)), time),
    h('div', { class: 'ldbar thin' }, fill));
  let seen = false;
  const paint = () => {
    if (el.isConnected) seen = true; else if (seen) return false;
    const sec = (Date.now() - st.at) / 1000, T = Number(o.typical) || 40;
    fill.style.width = (96 * (1 - Math.exp(-sec / (T * 0.6)))).toFixed(1) + '%';
    time.textContent = fmtSoFar(sec);
    return true;
  };
  paint(); const t = setInterval(() => { if (!paint()) clearInterval(t); }, 500);
  return el;
}
const forgetLoader = (id) => LOADERS.delete(id);
function btnBusy(btn, label) { btn.disabled = true; btn.replaceChildren(h('span', { class: 'spin' }), label); }
const emptyState = (iconName, title, text, action) =>
  h('div', { class: 'empty' }, h('div', { class: 'ico' }, icon(iconName)), h('strong', {}, title), h('div', {}, text), action ? h('div', { style: 'margin-top:16px' }, action) : null);
const VERDICT_WORD = { PASS: 'Pass', FLAG: 'Flag', FAIL: 'Fail' };
/** The gate result as a badge: Pass, Flag or Fail everywhere (never in capitals). */
const vword = (v) => (VERDICT_WORD[v] || String(v || '')).toLowerCase();
const verdictBadge = (v) => h('span', { class: 'vbadge ' + v }, VERDICT_WORD[v] || v);
const verdictPill = (v, status) =>
  v ? verdictBadge(v)
    : status === 'error' ? h('span', { class: 'pill bad' }, 'Failed')
    : h('span', { class: 'pill wait busy' }, status === 'running' ? 'Screening' : 'Queued');
/** On or off, the same badge on every list: green when on, grey when off. */
const onOff = (on, yes = 'Active', no = 'Inactive') => h('span', { class: 'pill ' + (Number(on) ? 'PASS' : 'wait') }, Number(on) ? yes : no);
/**
 * The status in a list, as a switch: click it, confirm in the popup, done. `url` is PATCHed with { active } (or `body(active)`).
 * Without the right to change it (`can` false) it is the plain status.
 */
function activeSwitch(on, { name, url, yes = 'Active', no = 'Inactive', can = true, body, after = () => route(), offText }) {
  if (!can) return onOff(on, yes, no);
  const isOn = !!Number(on), next = isOn ? no : yes;
  const b = h('button', { type: 'button', class: 'pill pillbtn ' + (isOn ? 'PASS' : 'wait'), title: `${isOn ? yes : no}. Click to make it ${next.toLowerCase()}` }, isOn ? yes : no);
  b.onclick = async (e) => {
    e.stopPropagation(); e.preventDefault();
    const ok = await ask(`Make ${name} ${next.toLowerCase()}?`, isOn ? (offText || 'It stays saved and can be switched back here at any time, but it is no longer used.') : 'It is used again from now on.', `Make ${next.toLowerCase()}`, isOn);
    if (!ok) return;
    try { await api('PATCH', url, body ? body(!isOn) : { active: !isOn }); toast(`${name}: ${next.toLowerCase()}`); after(); } catch (x) { toast(x.message, true); }
  };
  return b;
}
/** A yes/no question in the app's own dialog (never the browser's). Resolves true when confirmed. */
function ask(title, text, confirm = 'Continue', danger = false) {
  return new Promise((resolve) => {
    let yes = false;
    const dlg = modal({ title, confirm, danger, body: h('p', { class: 'muted' }, text), onConfirm: async () => { yes = true; } });
    dlg.addEventListener('close', () => resolve(yes));
  });
}
/** A date filter that says what it is: the word sits inside the control. */
function dateField(label, value, onChange) {
  const el = h('input', { type: 'date', 'aria-label': label + ' date', value });
  el.onchange = () => onChange(el.value);
  return h('label', { class: 'datefield' }, label, el);
}
/** A table's last cell: the row's buttons, right aligned. */
const acts = (...btns) => h('td', { class: 'acts' }, btns);

// ---------- searchable dropdowns ----------
/**
 * Every <select> in the app becomes searchable: a button that opens a list with a search box (type to filter,
 * arrow keys, Enter, Escape). The real <select> stays in the page, hidden, and keeps the value, so every existing
 * `el.value` read and `change` listener works unchanged. Applied automatically to any select added to the page.
 */
function searchableSelect(sel) {
  if (sel.__ss || sel.dataset.plain !== undefined) return;
  sel.__ss = true;
  // R129: a <select multiple> picks several: each option is ticked on and off, the list stays open, and .value reads "a|b"
  const multi = sel.multiple;
  const wrap = h('div', { class: 'ss ' + (sel.className || '') });
  if (sel.getAttribute('style')) wrap.setAttribute('style', sel.getAttribute('style'));
  const btn = h('button', { type: 'button', class: 'ss-btn', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': sel.getAttribute('aria-label') || null });
  const search = h('input', { type: 'search', class: 'ss-search', placeholder: 'Search...', 'aria-label': 'Search options', autocomplete: 'off' });
  const list = h('ul', { class: 'ss-list', role: 'listbox' });
  const pop = h('div', { class: 'ss-pop' + (multi ? ' multi' : ''), hidden: true }, search, list);
  // a chosen value can be cleared in one click when "nothing chosen" is allowed (an option with value "")
  const clearBtn = h('button', { type: 'button', class: 'ss-clear', title: 'Clear', 'aria-label': 'Clear ' + (sel.getAttribute('aria-label') || 'selection') }, '×');
  clearBtn.onclick = (e) => { e.stopPropagation(); close(); if (multi) [...sel.options].forEach((o) => { o.selected = false; }); else sel.value = ''; label(); sel.dispatchEvent(new Event('change', { bubbles: true })); btn.focus(); };
  sel.parentNode.insertBefore(wrap, sel);
  wrap.append(btn, clearBtn, pop, sel);
  sel.classList.add('ss-native'); sel.tabIndex = -1;
  let active = -1, shown = [];
  const picked = () => [...sel.options].filter((o) => o.selected && o.value !== '');
  const label = () => {
    if (multi) {
      const on = picked(), any = [...sel.options].find((o) => o.value === '');
      btn.textContent = !on.length ? (any ? any.textContent : '') : on.length === 1 ? on[0].textContent : `${on[0].textContent} +${on.length - 1}`;
      btn.title = on.map((o) => o.textContent).join(', '); btn.classList.toggle('ph', !on.length); btn.disabled = sel.disabled;
      wrap.classList.toggle('has-value', !!on.length && !sel.disabled); clearBtn.hidden = !on.length || sel.disabled; return;
    }
    const o = sel.options[sel.selectedIndex]; btn.textContent = o ? o.textContent : ''; btn.classList.toggle('ph', !sel.value); btn.disabled = sel.disabled;
    const clearable = !!sel.value && !sel.disabled && [...sel.options].some((x) => x.value === '');
    wrap.classList.toggle('has-value', clearable); clearBtn.hidden = !clearable;
  };
  // R136 (Hamza): a multi pick applies as it is ticked, after a short pause (ticking three names quickly is one reload), and at once on close
  let applied = null, pending = null;
  const apply = () => { clearTimeout(pending); pending = null; if (sel.value !== applied) { applied = sel.value; sel.dispatchEvent(new Event('change', { bubbles: true })); } };
  const choose = (o) => {
    if (o.disabled) return;
    if (multi) { // tick it on or off and stay open; the "Any ..." line takes them all off
      if (o.value === '') [...sel.options].forEach((x) => { x.selected = false; }); else o.selected = !o.selected;
      label(); draw(); clearTimeout(pending); pending = setTimeout(apply, 350); return;
    }
    sel.value = o.value; label(); close(); sel.dispatchEvent(new Event('change', { bubbles: true })); btn.focus(); };
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    shown = [...sel.options].filter((o) => !q || o.textContent.toLowerCase().includes(q));
    if (active >= shown.length) active = shown.length - 1;
    const on = (o) => (multi ? (o.value === '' ? !picked().length : o.selected) : o.selected);
    list.setAttribute('aria-multiselectable', multi ? 'true' : 'false');
    list.replaceChildren(...(shown.length ? shown.map((o, i) => h('li', { role: 'option', 'aria-selected': on(o), class: (on(o) ? 'sel ' : '') + (i === active ? 'act' : '') + (o.disabled ? ' dis' : '') + (multi && o.value === '' ? ' any' : ''),
      onmousedown: (e) => { e.preventDefault(); e.stopPropagation(); choose(o); }, /* stopped: the list is redrawn, so this item leaves the page and would read as a click outside */ onmousemove: () => { if (active !== i) { active = i; draw(); } } }, o.textContent)) : [h('li', { class: 'none' }, 'No matches')]));
    list.querySelector('.act')?.scrollIntoView({ block: 'nearest' });
  };
  const open = () => {
    if (sel.disabled) return;
    document.querySelectorAll('.ss.open').forEach((x) => x !== wrap && x.__close && x.__close());
    pop.hidden = false; wrap.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
    search.value = ''; active = multi ? 0 : Math.max(0, sel.selectedIndex); if (multi) applied = sel.value; draw(); search.focus();
  };
  const close = () => {
    const was = !pop.hidden; pop.hidden = true; wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
    if (multi && was && pending) apply(); // a tick still waiting goes now
  };
  wrap.__close = close;
  btn.onclick = () => (pop.hidden ? open() : close());
  btn.onkeydown = (e) => { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); } };
  search.oninput = () => { active = 0; draw(); };
  search.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(shown.length - 1, active + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) choose(shown[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); btn.focus(); }
    else if (e.key === 'Tab') close();
  };
  sel.addEventListener('change', label);
  // code that sets .value or disabled without an event: keep the button text in step
  new MutationObserver(label).observe(sel, { attributes: true, childList: true, subtree: true });
  const v = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  if (multi) Object.defineProperty(sel, 'value', { get() { return picked().map((o) => o.value).join('|'); },
    set(x) { const want = String(x ?? '').split('|').filter(Boolean); [...this.options].forEach((o) => { o.selected = o.value !== '' && want.includes(o.value); }); label(); }, configurable: true });
  else Object.defineProperty(sel, 'value', { get() { return v.get.call(this); }, set(x) { v.set.call(this, x); label(); }, configurable: true });
  label();
}
document.addEventListener('mousedown', (e) => { document.querySelectorAll('.ss.open').forEach((w) => { if (!w.contains(e.target)) w.__close(); }); });
// a <label for="id"> of a hidden select opens its searchable button instead
document.addEventListener('click', (e) => {
  const lab = e.target.closest && e.target.closest('label[for]'); if (!lab) return;
  const sel = document.getElementById(lab.htmlFor);
  if (sel && sel.tagName === 'SELECT' && sel.__ss) { e.preventDefault(); sel.parentNode.querySelector('.ss-btn').click(); }
});
new MutationObserver((muts) => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) (n.tagName === 'SELECT' ? [n] : n.querySelectorAll('select')).forEach(searchableSelect); })
  .observe(document.documentElement, { childList: true, subtree: true });

// R93: a text box grows to show what is in it (up to most of the screen), so long instructions are never cut off mid-line. It only
// grows: its own minimum height stays, and the chat box keeps its size.
function fitTextarea(t) {
  if (!t.isConnected || t.closest('.composer') || t.dataset.fixed != null || !t.offsetParent) return;
  const max = Math.round(innerHeight * 0.7);
  if (t.scrollHeight > t.clientHeight + 2 && t.clientHeight < max) t.style.height = Math.min(max, t.scrollHeight + 4) + 'px';
}
new MutationObserver((muts) => { const found = []; for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) found.push(...(n.tagName === 'TEXTAREA' ? [n] : n.querySelectorAll('textarea')));
  if (found.length) requestAnimationFrame(() => found.forEach(fitTextarea)); }).observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('input', (e) => { if (e.target.tagName === 'TEXTAREA') fitTextarea(e.target); });
document.addEventListener('focusin', (e) => { if (e.target.tagName === 'TEXTAREA') fitTextarea(e.target); }); // one shown after it was added (a tab)
document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('[role=tab], summary')) requestAnimationFrame(() => document.querySelectorAll('textarea').forEach(fitTextarea)); });

// ---------- pagination ----------
// Rows per page (R82): each person picks 20, 50, 100 or 200 at the bottom of any list; it is kept with their account.
const PAGE_SIZES = [20, 50, 100, 200];
const pageSize = () => (me && PAGE_SIZES.includes(Number(me.page_size)) ? Number(me.page_size) : 20);
function hashParams() { return Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || '')); }
function setHashParams(patch) { // keeps page and filters in the URL so Back from a record returns to the same list, without re-running the route
  const next = { ...hashParams(), ...patch }; const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v !== '' && v != null && v !== false && !(k === 'page' && Number(v) === 1)) sp.set(k, v);
  history.replaceState(null, '', location.hash.split('?')[0] + (sp.toString() ? '?' + sp : ''));
}
const lastList = { history: '#/history', projects: '#/projects', industries: '#/industries' };
function pager(total, page, onPage) {
  if (!total) return null;
  const pages = Math.ceil(total / pageSize()), from = (page - 1) * pageSize() + 1, to = Math.min(total, page * pageSize());
  const want = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const nums = []; let prev = 0;
  for (const n of [...want].sort((a, b) => a - b)) { if (n - prev > 1) nums.push('…'); nums.push(n); prev = n; }
  const go = (n) => () => { onPage(n); window.scrollTo({ top: 0 }); };
  const btn = (label, n, disabled, cur) => h('button', { type: 'button', class: 'pg' + (cur ? ' on' : ''), disabled, 'aria-label': cur ? `Page ${n}, current page` : /^\d+$/.test(label) ? `Page ${n}` : label, 'aria-current': cur ? 'page' : null, onclick: go(n) }, label);
  // how many rows a page shows: saved with the person's account, then the list is drawn again from its first page
  const sizeSel = h('select', { class: 'sm', 'aria-label': 'Rows per page', 'data-plain': '' }, PAGE_SIZES.map((n) => h('option', { value: n, selected: n === pageSize() }, String(n))));
  sizeSel.onchange = async () => {
    const n = Number(sizeSel.value);
    try { await api('PUT', '/me/page-size', { size: n }); me.page_size = n; setHashParams({ page: 1 }); route(); }
    catch (x) { toast(x.message, true); sizeSel.value = pageSize(); }
  };
  return h('div', { class: 'pager' }, h('span', { class: 'row muted small', style: 'gap:12px' }, `Showing ${from.toLocaleString()} to ${to.toLocaleString()} of ${total.toLocaleString()}`,
    h('label', { class: 'row', style: 'gap:6px' }, 'Rows per page', sizeSel)),
    pages > 1 ? h('nav', { class: 'pgs', 'aria-label': 'Pagination' }, btn('Previous', page - 1, page <= 1),
      nums.map((n) => (n === '…' ? h('span', { class: 'gap' }, '…') : btn(String(n), n, false, n === page))), btn('Next', page + 1, page >= pages)) : null);
}
/** Paginates a list that is already in memory. `render(slice)` returns the table. */
function clientPaged(items, render) {
  const box = h('div', {}); let page = Math.max(1, Number(hashParams().page) || 1);
  const draw = () => {
    page = Math.min(page, Math.max(1, Math.ceil(items.length / pageSize())));
    box.replaceChildren(render(items.slice((page - 1) * pageSize(), page * pageSize())), pager(items.length, page, (n) => { page = n; setHashParams({ page: n }); draw(); }));
  };
  draw(); return box;
}
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ---------- filters: one bar for every list ----------
// Every list in the app starts with the same bar: a search box, then its filters in equal columns, then the list's own
// buttons at the right end. "Clear filters" appears only while something is filtered. Add a list: use listCard() or filterBar().
function fSearch(placeholder, value, onInput) {
  const input = h('input', { type: 'search', placeholder, 'aria-label': placeholder, value: value || '' });
  input.oninput = debounce(() => onInput(input.value.trim()), 250);
  const el = h('div', { class: 'search' }, icon('search'), input);
  el.input = input;
  return el;
}
/** R129: `multi` picks several; the value is then "a|b" both ways. */
const isOn = (value, v) => String(value ?? '').split('|').includes(String(v));
function fSelect(label, options, value, onChange, multi = true) { // R129: a filter picks several unless told otherwise
  const el = h('select', { 'aria-label': label, class: 'fsel', multiple: multi || null }, h('option', { value: '' }, label), options.map(([v, l]) => h('option', { value: v, selected: multi ? isOn(value, v) : String(value) === String(v) }, l)));
  el.onchange = () => onChange(el.value);
  return el;
}
function filterBar(controls, opts = {}) {
  const clear = opts.onClear ? h('button', { class: 'btn', type: 'button', hidden: true, onclick: opts.onClear }, 'Clear filters') : null;
  const extra = [opts.actions].flat().filter(Boolean);
  const bar = h('div', { class: 'filterbar' }, controls.filter(Boolean), h('div', { class: 'fb-actions' + (extra.length ? ' wide' : '') }, clear, extra));
  bar.setActive = (on) => { if (clear) clear.hidden = !on; };
  return bar;
}
/** The usual on/off filter. `get(item)` returns the item's active flag. */
const statusFilter = (get, off = 'Inactive') => ({ key: 'status', label: 'Any status', options: [['1', 'Active'], ['0', off]], test: (it, v) => String(Number(get(it))) === v });
/**
 * A list that is already in memory, with the filter bar on top: search, dropdown filters, pages, and an empty state.
 * o: { items, search: { placeholder, text(item) }, filters: [{ key, label, options, test(item, value) }], render(slice), icon, emptyTitle, emptyText,
 *      emptyAction, actions, paged (false shows everything), bare (true: the bar in its own card, the list below it), onSync }.
 * Search, filters and the page are kept in the URL, so Back returns to the same view.
 */
function listCard(o) {
  const filters = o.filters || [], hp = hashParams();
  const st = { q: hp.q || '', page: Math.max(1, Number(hp.page) || 1) };
  for (const f of filters) st[f.key] = hp[f.key] || '';
  const size = o.paged === false ? Infinity : pageSize();
  const body = h('div', {});
  const reset = () => { st.page = 1; draw(); };
  const searchEl = o.search ? fSearch(o.search.placeholder, st.q, (v) => { st.q = v; reset(); }) : null;
  const sels = filters.map((f) => fSelect(f.label, f.options, st[f.key], (v) => { st[f.key] = v; reset(); }));
  const bar = filterBar([searchEl, ...sels], { actions: o.actions, onClear: () => { st.q = ''; if (searchEl) searchEl.input.value = ''; filters.forEach((f, i) => { st[f.key] = ''; sels[i].value = ''; }); reset(); } });
  function draw() {
    const q = st.q.toLowerCase();
    const shown = o.items.filter((it) => (!q || o.search.text(it).toLowerCase().includes(q)) && filters.every((f) => !st[f.key] || String(st[f.key]).split('|').some((v) => f.test(it, v))));
    st.page = Math.min(st.page, Math.max(1, Math.ceil(shown.length / size)));
    setHashParams({ q: st.q, page: st.page, ...Object.fromEntries(filters.map((f) => [f.key, st[f.key]])) });
    if (o.onSync) o.onSync();
    const active = !!(st.q || filters.some((f) => st[f.key]));
    bar.setActive(active);
    const slice = size === Infinity ? shown : shown.slice((st.page - 1) * size, st.page * size);
    const empty = () => emptyState(o.icon || 'list', active ? 'No matches' : o.emptyTitle || 'Nothing here yet', active ? 'Try a different search or filter.' : o.emptyText || '', !active && o.emptyAction ? o.emptyAction : null);
    body.replaceChildren(...[shown.length ? o.render(slice, active) : o.bare ? h('div', { class: 'card' }, empty()) : empty(),
      size === Infinity ? null : pager(shown.length, st.page, (n) => { st.page = n; draw(); })].filter(Boolean));
  }
  draw();
  return o.bare ? [h('div', { class: 'card' }, bar), body] : h('div', { class: 'card' }, bar, body);
}
/** A plain table: `heads` are the column names ('' for the actions column), `rows` the <tr> elements. */
/** R93: dataTable.fixed keeps the same column widths in every copy of a table (one per profile, say). */
const dataTable = (heads, rows, cls) => h('div', { class: 'tablewrap' }, h('table', { class: cls || null }, h('thead', {}, h('tr', {}, heads.filter((x) => x !== null).map((t) => h('th', { class: t ? null : 'acts' }, t)))), h('tbody', {}, rows)));
dataTable.fixed = (heads, rows) => dataTable(heads, rows, 'fixedcols');

// ---------- layout ----------
const APP_NAME = 'Upwork Pro';
const STAFF = ['manager', 'admin'], ADMIN = ['admin'];
/** The sidebar, in order. A link without roles is for everyone. */
// The sidebar (R80, Ahmad): the daily work, then four sections (Library, Writing, Screening, Admin), each a row with an arrow that
// opens and closes its pages under it, one at a time: opening one closes the others, and the open one can be closed too. The
// section you are in and the page you are on are both lit. The open section is kept in this browser; going to a page opens its own. Guide and Connect Claude sit in a small row above your name.
const NAV = [
  { key: 'dashboard', icon: 'home', label: 'Dashboard' },
  { key: 'new', icon: 'screen', label: 'Screen a job' },
  { key: 'history', icon: 'list', label: () => (me.role === 'employee' ? 'My jobs' : 'Jobs') },
  { key: 'reports', icon: 'chart', label: 'Reports' },
  { key: 'clients', icon: 'users', label: 'Clients' },
  { key: 'feedback', icon: 'message', label: 'Proposal feedback' },
  { key: 'flagreview', icon: 'flag', label: 'Flag review', roles: STAFF },
];
const SETUP = [
  { label: 'Library', icon: 'books', links: [
    { key: 'projects', icon: 'folder', label: 'Projects' },
    { key: 'industries', icon: 'building', label: 'Industries' },
    { key: 'dictionary', icon: 'tag', label: 'Tag dictionary', roles: ADMIN },
    { key: 'profiles', icon: 'badge', label: 'Upwork profiles', roles: ADMIN },
    { key: 'looms', icon: 'video', label: 'Loom videos', roles: ADMIN }] },
  { label: 'Writing', icon: 'pen', links: [
    { key: 'writing', icon: 'doc', label: 'Writing guide' },
    { key: 'signals', icon: 'signal', label: 'Signals', roles: STAFF },
    { key: 'reviewer', icon: 'review', label: 'Reviewer' }] },
  { label: 'Screening', icon: 'funnel', links: [
    { key: 'skill', icon: 'clipboard', label: 'Gate instructions', roles: ADMIN },
    { key: 'rules', icon: 'scale', label: 'Rules', roles: ADMIN }] },
  { label: 'Admin', icon: 'shield', links: [
    { key: 'settings', icon: 'gear', label: 'Settings', roles: ADMIN },
    { key: 'users', icon: 'users', label: 'Users', roles: ADMIN },
    { key: 'changes', icon: 'history', label: 'Changes', roles: ADMIN },
    { key: 'audit', icon: 'terminal', label: 'Logs', roles: ADMIN }] },
];
const allowed = (l) => !l.roles || l.roles.includes(me.role);
const NAV_FOOT = [{ key: 'connect', icon: 'link', label: 'Connect Claude' }, { href: '/guide/', icon: 'help', label: 'Guide' }]; // the guide opens in its own tab
let navOpen = null; // the sections open in this browser
const navOpenSet = () => { if (!navOpen) { try { navOpen = new Set(JSON.parse(localStorage.getItem('nav.open2') || '[]')); } catch { navOpen = new Set(); } } return navOpen; };
const saveNavOpen = () => { try { localStorage.setItem('nav.open2', JSON.stringify([...navOpen])); } catch { /* storage blocked */ } };
let navLastActive = null;
// the slim sidebar (R86): icons only, for small screens; kept in this browser, since it is about this screen
const navMini = () => { try { return localStorage.getItem('nav.mini') === '1'; } catch { return false; } };
const setNavMini = (on) => { try { localStorage.setItem('nav.mini', on ? '1' : '0'); } catch { /* storage blocked */ } };
/** In the slim sidebar a section's pages open beside it, in a small panel; a click anywhere else closes it. */
function navFlyout(head, g, link) {
  document.querySelectorAll('.navfly').forEach((x) => x.remove());
  const r = head.getBoundingClientRect();
  const fly = h('div', { class: 'navfly', role: 'menu', style: `top:${Math.max(8, Math.min(r.top - 6, window.innerHeight - 60 - g.links.length * 38))}px;left:${r.right + 8}px` },
    h('div', { class: 'navflyhead' }, g.label), g.links.map(link));
  document.body.append(fly);
  const close = (e) => { if (!fly.contains(e.target) && e.target !== head && !head.contains(e.target)) { fly.remove(); document.removeEventListener('mousedown', close); } };
  setTimeout(() => document.addEventListener('mousedown', close));
  fly.addEventListener('click', (e) => { if (e.target.closest('a')) fly.remove(); });
}

function shell(active, content, wide) {
  const a = ([key, ic, label]) => (key.startsWith('/') ? h('a', { href: key, target: '_blank', rel: 'noopener' }, icon(ic), h('span', {}, label))
    : h('a', { href: '#/' + key, class: active === key ? 'active' : '', 'aria-current': active === key ? 'page' : null }, icon(ic), h('span', {}, label)));
  const linksOf = (ls) => ls.filter(allowed).map((l) => [l.href || l.key, l.icon, typeof l.label === 'function' ? l.label() : l.label]);
  const mini = navMini();
  const navLink = ([key, ic, label]) => h('a', { href: '#/' + key, class: active === key ? 'active' : '', 'aria-current': active === key ? 'page' : null, title: mini ? label : null, 'aria-label': mini ? label : null }, icon(ic), h('span', {}, label));
  const opened = navOpenSet();
  const sections = SETUP.map((g) => ({ ...g, links: linksOf(g.links) })).filter((g) => g.links.length);
  // going to a page opens its section, and only it (once per page, so the person can still close it)
  const here = sections.find((g) => g.links.some(([k]) => k === active));
  if (here && navLastActive !== active) { opened.clear(); opened.add(here.label); saveNavOpen(); }
  navLastActive = active;
  const section = (g) => {
    const isHere = g === here, isOpen = opened.has(g.label);
    const body = h('div', { class: 'nav-sub', hidden: !isOpen }, g.links.map(navLink));
    const head = h('button', { type: 'button', class: 'nav-sec' + (isHere ? ' here' : ''), 'aria-expanded': String(isOpen), title: mini ? g.label : null, 'aria-label': mini ? g.label : null }, icon(g.icon), h('span', {}, g.label), h('span', { class: 'nav-chev', 'aria-hidden': 'true' }));
    head.onclick = () => {
      if (mini) return navFlyout(head, g, navLink); // slim: the pages open beside the icon
      const open = body.hidden;
      // one section at a time: opening this one closes the others
      if (open) head.closest('.nav').querySelectorAll('.nav-sec[aria-expanded="true"]').forEach((x) => { x.setAttribute('aria-expanded', 'false'); x.nextElementSibling.hidden = true; });
      body.hidden = !open; head.setAttribute('aria-expanded', String(open));
      opened.clear(); if (open) opened.add(g.label); saveNavOpen();
    };
    return h('div', { class: 'nav-group' }, head, body);
  };
  const menu = h('button', { class: 'btn sm navtoggle', type: 'button', 'aria-expanded': 'false', onclick: () => { const open = menu.closest('.shell').classList.toggle('navopen'); menu.setAttribute('aria-expanded', String(open)); } }, icon('list'), 'Menu');
  // the switch between the full sidebar and the slim one, on the name's row (under the logo when slim)
  const slim = h('button', { type: 'button', class: 'iconbtn navmini', title: mini ? 'Show the full sidebar' : 'Collapse the sidebar to icons', 'aria-label': mini ? 'Show the full sidebar' : 'Collapse the sidebar to icons', 'aria-pressed': String(mini),
    onclick: () => { setNavMini(!mini); document.querySelectorAll('.navfly').forEach((x) => x.remove()); route(); } }, icon('panel'));
  $app.replaceChildren(h('div', { class: 'shell' + (mini ? ' mini' : '') },
    h('aside', { class: 'side' },
      h('div', { class: 'brandrow' }, h('a', { class: 'brand', href: '#/dashboard', style: 'color:inherit;text-decoration:none', title: mini ? APP_NAME : null }, h('div', { class: 'logo' }, icon('logo')), h('span', { class: 'brandname' }, APP_NAME)), slim),
      menu,
      h('nav', { class: 'nav', 'aria-label': 'Main' }, linksOf(NAV).map(navLink), sections.length ? [h('div', { class: 'nav-sep' }), sections.map(section)] : null),
      h('div', { class: 'nav-foot' }, linksOf(NAV_FOOT).map(([k, ic, label]) => { const el = a([k, ic, label]); if (mini) { el.title = label; el.setAttribute('aria-label', label); } return el; })),
      h('div', { class: 'me' }, h('button', { type: 'button', class: 'mebtn', title: 'Your account: name, picture, password', 'aria-label': 'Your account', onclick: accountDialog }, avatarEl(me),
        h('span', { class: 'who' }, h('strong', {}, me.name), h('span', {}, me.role))),
        h('button', { class: 'iconbtn', title: 'Sign out', 'aria-label': 'Sign out', onclick: async () => { await api('POST', '/logout', {}); me = null; CFG = null; route(); } }, icon('out')))),
    h('main', { class: 'content' }, h('div', { class: 'page' }, content))));
  window.scrollTo(0, 0);
}
/**
 * The header every page uses: an optional back link, the title with its badges beside it, one quiet line under it,
 * and the page's buttons on the right. `opts.back` is [href, label]; `opts.badges` sit next to the title.
 */
const pageHead = (title, sub, actions, opts = {}) =>
  h('div', {}, opts.back ? h('a', { href: opts.back[0], class: 'back' }, icon('back'), opts.back[1]) : null,
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'titlerow' }, h('h1', {}, title), opts.badges || null), sub ? h('p', { class: 'sub' }, sub) : null),
      actions ? h('div', { class: 'actions' }, actions) : null));

// ---------- login ----------
function loginView() {
  const err = h('div', { class: 'err', hidden: true });
  const email = h('input', { type: 'email', id: 'em', autocomplete: 'username', required: true, placeholder: 'you@company.com' });
  const pw = h('input', { type: 'password', id: 'pw', autocomplete: 'current-password', required: true, placeholder: 'Your password' });
  const btn = h('button', { class: 'btn primary lg', type: 'submit', style: 'width:100%;margin-top:20px' }, 'Sign in');
  $app.replaceChildren(h('div', { class: 'auth' }, h('div', { class: 'card' },
    h('div', { class: 'brand' }, h('div', { class: 'logo' }, icon('logo')), APP_NAME),
    h('h1', {}, 'Welcome back'), h('p', { class: 'jp-label', style: 'margin-bottom:22px' }, 'Sign in to screen Upwork jobs and write proposals.'),
    h('form', { onsubmit: async (e) => {
      e.preventDefault(); err.hidden = true; btnBusy(btn, 'Signing in');
      try { me = (await api('POST', '/login', { email: email.value, password: pw.value })).user; me = (await api('GET', '/me')).user || me; location.hash = '#/dashboard'; route(); }
      catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; btn.disabled = false; btn.replaceChildren('Sign in'); }
    } }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'em' }, 'Email'), email),
      h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'pw' }, 'Password'), withShow(pw)), err, btn))));
  email.focus();
}

// ---------- documents attached to a job (R74) ----------
// R123: any file the client sent is taken (a brief, a spec, a sheet, slides, screenshots...); it travels in pieces, so size is no problem
const FILE_MAX = 100 * 1024 * 1024, FILES_MAX = 12;
const fileSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const toB64 = (blob, name) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => no(new Error('Could not read ' + name)); r.readAsDataURL(blob); });
/** A request tried again when the network or the server failed for a moment: up to five times, waiting longer each time. */
async function apiTry(method, path, body, tries = 5) {
  let wait = 800;
  for (let i = 1; ; i++) {
    try { return await api(method, path, body); }
    catch (x) { const again = !x.status || x.status >= 500 || x.status === 408 || x.status === 429; if (!again || i >= tries) throw x; await new Promise((r) => setTimeout(r, wait)); wait *= 2; }
  }
}
/**
 * R123 (Hamza): files go up in pieces of about half a MB, so no limit in front of the app (nginx, a proxy) can refuse them. A piece
 * refused as too big is sent in smaller pieces; a piece lost to the network is sent again (it lands in the same place). On an older
 * server without pieces, the whole file goes in the request, as before. Returns what the job names: { upload } (or { name, data }).
 */
async function uploadOne(f, onBytes) {
  const start = await apiTry('POST', '/uploads', { name: f.name, size: f.size });
  let size = start.chunk || 512 * 1024, off = 0;
  while (off < f.size) {
    const piece = f.slice(off, off + size);
    try { await apiTry('POST', `/uploads/${start.id}/chunk`, { offset: off, data: await toB64(piece, f.name) }); off += piece.size; onBytes(piece.size); }
    catch (x) { if (x.status === 413 && size > 16 * 1024) { size = Math.floor(size / 2); continue; } throw x; }
  }
  await apiTry('POST', `/uploads/${start.id}/finish`, {});
  return { upload: start.id };
}
async function uploadFiles(files, onProgress) {
  const total = files.reduce((n, f) => n + f.size, 0) || 1, out = []; let done = 0;
  for (const f of files) {
    try { out.push(await uploadOne(f, (n) => { done += n; if (onProgress) onProgress(Math.min(1, done / total)); })); }
    catch (x) { if (x.status === 404 || x.status === 405) out.push({ name: f.name, data: await toB64(f, f.name) }); else throw x; } // a server without pieces
  }
  return out;
}
/** The button shows how far the upload is. */
const uploadProgress = (b) => (p) => b.replaceChildren(h('span', { class: 'spin' }), `Uploading ${Math.round(p * 100)}%`);
/** Choose files (button, or drop them on `dropOn`): kept in a list with a remove button each, checked for kind and size. */
function filePicker(dropOn, max = FILES_MAX) {
  let chosen = [];
  const input = h('input', { type: 'file', multiple: true, hidden: true });
  const list = h('div', { class: 'chips filechips' });
  const add = (files) => {
    for (const f of files) {
      if (!f.size) { toast(`${f.name} is empty`, true); continue; }
      if (f.size > FILE_MAX) { toast(`${f.name} is larger than ${FILE_MAX / 1048576} MB`, true); continue; }
      if (chosen.length >= max) { toast(`At most ${max} files`, true); break; }
      if (!chosen.some((x) => x.name === f.name && x.size === f.size)) chosen.push(f);
    }
    draw();
  };
  const draw = () => list.replaceChildren(...chosen.map((f, i) => h('span', { class: 'chip' }, icon(/\.(png|jpe?g|webp|gif)$/i.test(f.name) ? 'doc' : 'doc'), `${f.name} · ${fileSize(f.size)}`,
    h('button', { type: 'button', class: 'chipx', 'aria-label': 'Remove ' + f.name, onclick: () => { chosen.splice(i, 1); draw(); } }, '×'))));
  input.onchange = () => { add([...input.files]); input.value = ''; };
  const btn = h('button', { type: 'button', class: 'btn sm', onclick: () => input.click() }, icon('clip'), 'Attach files');
  if (dropOn) {
    dropOn.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); dropOn.classList.add('dropping'); } });
    dropOn.addEventListener('dragleave', () => dropOn.classList.remove('dropping'));
    dropOn.addEventListener('drop', (e) => { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); dropOn.classList.remove('dropping'); add([...e.dataTransfer.files]); });
  }
  return { btn, input, list, files: () => chosen, clear: () => { chosen = []; draw(); } };
}
const READ_WORD = { code: 'Read', ai: 'Read by the AI', person: 'Described by you' };
/**
 * The document viewer (R83): a job's files, one at a time, on a full screen inside the app. Left and right (buttons, the arrow
 * keys, or a swipe on a phone) go to the previous and next file. A PDF opens in the browser's own viewer, an image as a picture,
 * a text, CSV or Markdown file as text, a Word file as a page made from it. Open in a new tab, Download and Close are always there.
 */
function docViewer(files, start = 0) {
  let i = Math.max(0, Math.min(files.length - 1, start)), gen = 0;
  const title = h('strong', { class: 'dvname' }), count = h('span', { class: 'faint small' });
  const body = h('div', { class: 'dvbody' });
  const prev = h('button', { class: 'dvnav prev', type: 'button', 'aria-label': 'Previous document', onclick: () => go(i - 1) }, '‹');
  const next = h('button', { class: 'dvnav next', type: 'button', 'aria-label': 'Next document', onclick: () => go(i + 1) }, '›');
  const openTab = h('a', { class: 'btn sm', target: '_blank', rel: 'noopener' }, 'Open in a new tab');
  const download = h('a', { class: 'btn sm' }, 'Download');
  const KIND = { pdf: 'PDF', docx: 'Word', text: 'Text', image: 'Image' };
  const draw = async () => {
    const my = ++gen, f = files[i], url = `/api/attachments/${f.id}/file`;
    title.textContent = f.file_name; count.textContent = `${KIND[f.kind] || ''} · ${fileSize(f.size_bytes)}${files.length > 1 ? ` · ${i + 1} of ${files.length}` : ''}`;
    openTab.href = url; download.href = url; download.setAttribute('download', f.file_name);
    prev.disabled = i === 0; next.disabled = i === files.length - 1; prev.style.visibility = next.style.visibility = files.length < 2 ? 'hidden' : ''; // one file: no arrows, but they keep their place so the file stays in the middle
    if (f.kind === 'pdf') return body.replaceChildren(h('iframe', { class: 'dvframe', src: url, title: f.file_name }));
    if (f.kind === 'image') return body.replaceChildren(h('div', { class: 'dvimg' }, h('img', { src: url, alt: f.file_name })));
    body.replaceChildren(h('div', { class: 'row muted small', style: 'padding:24px' }, h('span', { class: 'spin' }), 'Opening...'));
    try {
      const r = await api('GET', `/attachments/${f.id}/view`); if (my !== gen) return;
      if (r.html != null) { const page = h('div', { class: 'dvdoc' }); page.innerHTML = r.html || '<p>(The document is empty.)</p>'; body.replaceChildren(h('div', { class: 'dvpaper' }, page)); } // sanitized on the server
      else body.replaceChildren(h('div', { class: 'dvpaper' }, h('pre', { class: 'dvtext' }, r.text ?? '')));
    } catch (x) { if (my === gen) body.replaceChildren(h('div', { class: 'card-pad' }, h('p', { class: 'err' }, x.message))); }
  };
  const go = (n) => { if (n < 0 || n >= files.length || n === i) return; i = n; draw(); };
  const onKey = (e) => { if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); } else if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); } };
  const dlg = h('dialog', { class: 'fullview docview', 'aria-label': 'Document viewer' },
    h('div', { class: 'fvbar' }, h('div', { class: 'fvtitle' }, title, count), openTab, download, h('button', { class: 'btn sm', type: 'button', onclick: () => dlg.close() }, icon('x'), 'Close')),
    h('div', { class: 'dvstage' }, prev, body, next));
  // a swipe on a phone or a touchpad: left for the next file, right for the previous
  let sx = null; body.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  body.addEventListener('touchend', (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 60) go(i + (dx < 0 ? 1 : -1)); }, { passive: true });
  dlg.addEventListener('keydown', onKey);
  dlg.addEventListener('close', () => { gen++; dlg.remove(); });
  document.body.append(dlg); dlg.showModal(); draw();
}
/** R123: the kinds of file, as a person says them. */
const FILE_KIND = { pdf: 'PDF', docx: 'Word', doc: 'Word (old)', odt: 'OpenOffice', rtf: 'RTF', pptx: 'PowerPoint', sheet: 'Spreadsheet', text: 'Text', image: 'Image', other: 'File' };
/** The Job post tab's documents: what the client attached, what the AI reads from each, and adding more. */
function attachmentsCard(s) {
  const owner = s.user_id === me.id, canEdit = owner || me.role === 'admin';
  const body = h('div', {});
  const card = h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, icon('clip'), 'Attached documents'), h('span', { class: 'sub' }, 'The client\'s files. The AI reads them with the job post.')), body);
  let timer = null;
  const picker = canEdit ? filePicker(card) : null;
  const upload = picker ? h('button', { class: 'btn sm primary', type: 'button' }, 'Upload') : null;
  if (upload) upload.onclick = async () => {
    const files = picker.files(); if (!files.length) return toast('Choose files first', true);
    btnBusy(upload, 'Uploading');
    try { const r = await apiTry('POST', `/screenings/${s.id}/attachments`, { files: await uploadFiles(files, uploadProgress(upload)) }); picker.clear();
      if (r.errors.length) toast(r.errors.join(' · '), true); else toast(`${r.saved} file${r.saved === 1 ? '' : 's'} added`); draw(r.items); }
    catch (x) { toast(x.message, true); }
    upload.disabled = false; upload.replaceChildren('Upload');
  };
  const showText = async (a) => { const r = await api('GET', `/attachments/${a.id}/text`);
    modal({ title: a.file_name, noConfirm: true, wide: true, body: h('div', {}, h('p', { class: 'jp-label', style: 'margin-top:0' }, 'What the AI reads from this file, with the job post.'), h('pre', { class: 'proposal-text', style: 'max-height:60vh' }, r.text || '(nothing)')) }); };
  const describe = (a) => { const ta = h('textarea', { rows: 6, maxlength: 20000, placeholder: 'For example: a mockup of the booking screen: a calendar on the left, the patient\'s details on the right, a Confirm button.' });
    modal({ title: 'What does ' + a.file_name + ' show?', confirm: 'Save', body: h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Describe it for the AI'), ta, h('div', { class: 'hint' }, 'The AI reads this instead of the file.')),
      onConfirm: async () => { await api('PUT', `/attachments/${a.id}/text`, { text: ta.value }); load(); } }); };
  const row = (a) => {
    const busy = a.status === 'queued' || a.status === 'running';
    const retrying = busy && Number(a.attempts) > 0; // R123: the AI could not read it yet: it is tried again by itself, later each time
    const state = busy ? h('span', { class: 'row small muted', style: 'gap:6px' }, h('span', { class: 'lldots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), retrying ? `Reading again${a.next_try_at ? ' at ' + full(a.next_try_at) : ''}` : 'The AI is reading it') : a.status === 'error' ? h('span', { class: 'pill FAIL' }, 'Not read yet')
      : h('span', { class: 'pill PASS' }, READ_WORD[a.read_by] || 'Read');
    const btn = (label, fn, danger) => h('button', { class: 'btn sm' + (danger ? ' danger' : ''), type: 'button', onclick: fn }, label);
    return h('div', { class: 'filerow' },
      h('div', { style: 'min-width:0' }, h('a', { href: `/api/attachments/${a.id}/file`, class: 'filename', onclick: (e) => { e.preventDefault(); docViewer(current, current.findIndex((x) => x.id === a.id)); } }, a.file_name),
        h('div', { class: 'faint small' }, [FILE_KIND[a.kind] || 'File', fileSize(a.size_bytes), a.status === 'done' ? `${Number(a.chars).toLocaleString()} characters for the AI` : null, a.status === 'done' && a.method ? `read by ${a.method}` : null,
          a.digest_status === 'done' ? 'long: digested section by section' : null, a.user_name, ago(a.created_at)].filter(Boolean).join(' · ')),
        retrying ? h('div', { class: 'faint small' }, a.error || 'The AI could not read it yet; it tries again by itself.') : null,
        a.status === 'error' ? h('div', { class: 'err small' }, a.error || 'The AI could not read it.') : null,
        a.added_after_screening ? h('div', { class: 'faint small' }, 'Added after the screening: the matching, the proposal, the chat and the review read it from now on.') : null),
      h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;justify-content:flex-end' }, state,
        btn('View', () => docViewer(current, current.findIndex((x) => x.id === a.id))),
        a.status === 'done' ? btn('What the AI reads', () => showText(a).catch((x) => toast(x.message, true))) : null,
        canEdit && (a.status === 'error' || (a.kind === 'image' && !busy)) ? btn(a.status === 'error' ? 'Describe it' : 'Change description', () => describe(a)) : null,
        canEdit && a.status === 'error' ? btn('Read again', async () => { try { await api('POST', `/attachments/${a.id}/read`, {}); load(); } catch (x) { toast(x.message, true); } }) : null,
        canEdit ? btn('Remove', () => modal({ title: 'Remove ' + a.file_name + '?', confirm: 'Remove', danger: true, body: h('p', { class: 'muted' }, 'The file and what the AI read from it are removed from this job. Proposals already written keep their text.'),
          onConfirm: async () => { await api('DELETE', `/attachments/${a.id}`); load(); } }), true) : null));
  };
  let current = [];
  const draw = (items) => {
    current = items;
    clearTimeout(timer);
    body.replaceChildren(...[
      items.length ? h('div', {}, items.map(row)) : h('div', { class: 'card-pad faint small' }, canEdit ? 'No documents. If the client attached files to the job on Upwork, download them and add them here.' : 'No documents.'),
      picker ? h('div', { class: 'card-pad', style: 'border-top:1px solid var(--line);display:grid;gap:8px' }, h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, picker.btn, upload, h('span', { class: 'faint small' }, 'PDF, Word, text, CSV, Markdown or images, up to 10 MB each. Or drop them here.')), picker.input, picker.list) : null,
    ].filter(Boolean));
    if (items.some((a) => a.status === 'queued' || a.status === 'running')) timer = setTimeout(() => { if (card.isConnected) load(); }, 2500);
  };
  const load = async () => { try { draw((await api('GET', `/screenings/${s.id}/attachments`)).items); } catch (x) { body.replaceChildren(h('p', { class: 'err card-pad' }, x.message)); } };
  draw(s.attachments || []);
  return card;
}

// ---------- screen a job ----------
async function newView() {
  const box = h('textarea', { id: 'jobin', 'aria-label': 'Job link or page text', placeholder: 'Paste an Upwork job link, or copy the whole job page and paste it here.\n\nInclude the "About the client" section: the screening depends on it.' });
  const chip = h('span', { class: 'chip' }, 'Waiting for input');
  const err = h('div', { class: 'err', hidden: true });
  const btn = h('button', { class: 'btn', type: 'button' }, 'Screen this job');
  // auto mode (R75): screened and written with no questions in between; the finished proposal opens at the end
  const autoBtn = h('button', { class: 'btn primary', type: 'button', title: 'Screens the job, picks the recommended projects, a profile and the proposal type, and writes the proposal. A FAIL stops for you to decide.' }, 'Auto: screen and write');
  const urlIn = h('input', { type: 'text', id: 'joburl', placeholder: 'https://www.upwork.com/jobs/...' });
  const detect = () => {
    const v = box.value.trim();
    if (!v) chip.replaceChildren('Waiting for input'), chip.className = 'chip';
    else if (!/\s/.test(v) && /^https?:\/\//i.test(v)) chip.replaceChildren(icon('link'), 'Job link'), chip.className = 'chip brand';
    else chip.replaceChildren(icon('doc'), `Pasted text, ${v.length.toLocaleString()} characters`), chip.className = 'chip brand';
  };
  box.addEventListener('input', detect);
  const submit = async (auto) => {
    const b = auto ? autoBtn : btn, label = b.textContent;
    err.hidden = true; btnBusy(b, 'Sending');
    try {
      const files = picker.files().length ? await uploadFiles(picker.files(), uploadProgress(b)) : undefined;
      if (files) b.replaceChildren(h('span', { class: 'spin' }), 'Sending');
      const r = await api('POST', '/screenings', { input: box.value, job_url: urlIn.value.trim() || null, files, auto: !!auto });
      if (r.files && r.files.errors.length) toast('Not attached: ' + r.files.errors.join(' · '), true);
      location.hash = '#/s/' + r.id + (auto ? '/overview' : '/screening'); // a new job opens on its Screening tab; in auto mode on its progress
    } catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; b.disabled = false; b.replaceChildren(label); }
  };
  btn.onclick = () => submit(false); autoBtn.onclick = () => submit(true);
  box.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(); });
  const composer = h('div', { class: 'card composer' });
  const picker = filePicker(composer); // the client's attached documents (R74): read with the job post
  shell('new', [
    pageHead('Screen a job', 'Check an Upwork job against the SOP before anyone spends Connects on it.'),
    (composer.append(box, picker.list, picker.input,
      h('div', { class: 'composer-bar' }, chip, picker.btn, h('span', { class: 'grow' }), h('span', { class: 'faint small' }, (navigator.platform || '').startsWith('Mac') ? 'Cmd + Enter to screen' : 'Ctrl + Enter to screen'), btn, autoBtn)), composer),
    h('div', { class: 'field', style: 'max-width:520px' }, h('label', { class: 'lbl', for: 'joburl' }, 'Job link (optional)'), urlIn, h('div', { class: 'hint' }, 'Saved with the record when you paste text instead of a link.')),
    err,
    h('div', { class: 'steps' },
      h('div', { class: 'step' }, h('div', { class: 'n' }, '1'), h('strong', {}, 'Paste the job'), h('p', {}, 'A job link, or the full page text copied from Upwork.')),
      h('div', { class: 'step' }, h('div', { class: 'n' }, '2'), h('strong', {}, 'We screen it'), h('p', {}, 'The SOP rules run in about a minute and return PASS, FLAG or FAIL.')),
      h('div', { class: 'step' }, h('div', { class: 'n' }, '3'), h('strong', {}, 'Decide, then write'), h('p', {}, `Continue (a FLAG or FAIL needs a reason), pick ${cfg('selection.min', 1) === cfg('selection.max', 2) ? cfg('selection.max', 2) : cfg('selection.min', 1) + ' to ' + cfg('selection.max', 2)} projects, a profile and the proposal type, and the proposal is written for you.`))),
    h('div', { class: 'notice' }, icon('info'), h('div', {}, 'Links are read through the Upwork API, which is not connected yet. For now, paste the page text.')),
  ]);
  box.focus();
}

// ---------- dashboard ----------
const PERIODS = [['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['month', 'This month'], ['all', 'All time']];
const ymd = (d) => d.toLocaleDateString('sv', { timeZone: TZ }); // YYYY-MM-DD in your time zone
function periodRange(key) {
  const now = new Date(), t = ymd(now);
  if (key === 'today') return { from: t, to: t };
  if (key === '7' || key === '30' || key === '90d') { const d = new Date(now); d.setDate(d.getDate() - parseInt(key, 10) + 1); return { from: ymd(d), to: t }; }
  if (key === 'month') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: t };
  return {};
}
const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '-');

async function dashboardView() {
  const hp = hashParams();
  const st = { period: PERIODS.some(([k]) => k === hp.period) ? hp.period : '30', profile: hp.profile || '', user: hp.user || '', mine: hp.mine === '1' };
  const opts = await api('GET', '/screenings/filter-options');
  const body = h('div', { class: 'stack' });
  const sel = (key, label, options) => { // R129: profile and person pick several
    const el = h('select', { 'aria-label': label, class: 'fsel', multiple: true }, h('option', { value: '' }, label), options.map(([v, l]) => h('option', { value: v, selected: isOn(st[key], v) }, l)));
    el.onchange = () => { st[key] = el.value; load(); };
    return el;
  };
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Period' });
  const drawSeg = () => seg.replaceChildren(...PERIODS.map(([k, l]) => h('button', { type: 'button', class: st.period === k ? 'on' : '', 'aria-pressed': st.period === k, onclick: () => { st.period = k; drawSeg(); load(); } }, l)));
  drawSeg();
  const mineBox = h('input', { type: 'checkbox', id: 'dmine', checked: st.mine }); mineBox.onchange = () => { st.mine = mineBox.checked; load(); };
  const profSel = sel('profile', 'Any profile', opts.profiles.map((p) => [p.id, p.name])), userSel = opts.users.length ? sel('user', 'Anyone', opts.users.map((u) => [u.id, u.name])) : null;
  const fbar = filterBar([seg, profSel, userSel, me.role !== 'employee' ? h('label', { class: 'check', for: 'dmine' }, mineBox, 'Only mine') : null],
    { onClear: () => { st.profile = ''; st.user = ''; st.mine = false; profSel.value = ''; if (userSel) userSel.value = ''; mineBox.checked = false; load(); } });
  const bar = h('div', { class: 'card' }, fbar);

  /** A link to the Jobs list with the dashboard's filters plus `extra`, so every number can be opened. */
  const jobsLink = (extra = {}) => {
    const r = periodRange(st.period); const q = new URLSearchParams();
    if (r.from) q.set('from', r.from); if (r.to) q.set('to', r.to);
    for (const k of ['profile', 'user']) if (st[k]) q.set(k, st[k]); if (st.mine) q.set('mine', '1');
    for (const [k, v] of Object.entries(extra)) if (v !== '' && v != null) q.set(k, v);
    return '#/history?' + q;
  };
  /** R117: the jobs behind a number here, exactly (a report line: the totals, a person or a profile; the part: sent, hired...). */
  const exact = (part, extra = {}, rdim = 'funnel', rkey = 'all', label = 'the Dashboard') => { const d = directFilters(rdim, rkey, part); // R119: real filters first
    return d ? jobsLink({ ...d, ...extra }) : jobsLink({ rdim, rkey, rpart: part === 'all' ? '' : part, rlabel: label, ...extra }); };
  const kpi = (label, value, sub, link, cls) => h(link ? 'a' : 'div', { class: 'stat kpi ' + (cls || ''), href: link || null }, h('span', { class: 'k' }, label), h('span', { class: 'v' }, value), sub ? h('span', { class: 'sub small muted' }, sub) : null);
  const panel = (title, sub, content, wide, after) => h('div', { class: 'card dpanel' + (wide ? ' wide' : '') }, h('div', { class: 'card-head' }, h('h2', {}, title), sub ? h('span', { class: 'sub' }, sub) : null), h('div', { class: 'card-pad' }, content, after || null));
  const hbar = (label, value, max, extra, link, shown) => h(link ? 'a' : 'div', { class: 'hbar', href: link || null }, h('span', { class: 'lbl', title: label }, label),
    h('span', { class: 'track' }, h('i', { style: `width:${max ? Math.max(value ? 2 : 0, (value / max) * 100) : 0}%` })), h('span', { class: 'num' }, shown ?? value.toLocaleString()), h('span', { class: 'ext small muted' }, extra || ''));

  function draw(d) {
    const c = d.counts, t = d.timings;
    // R105: from Sent on, proposals only; an invite opens the chat itself, so invites are counted under the funnel
    const inv = c.invites || { sent: 0, interviewed: 0, hired: 0 }, P = { invite: 'no' };
    const funnel = [['Screened', c.screened, exact('all')], ['Continued', c.continued, exact('continued')], ['Proposal written', c.proposals, exact('written')], ['Proposal sent', c.sent, exact('sent', P)],
      ['Client viewed', c.viewed, exact('viewed', P)], ['Chat opened', c.replied, exact('chat', P)], ['Interview', c.interviewed, exact('interview', P)], ['Hired', c.hired, exact('hired', P)]];
    const needs = d.needs_action.reduce((a, k) => a + (d.stages[k] || 0), 0);
    const maxDay = Math.max(1, ...d.daily.map((x) => x.screened));
    // R117: a person's or a profile's line opens their jobs, and each number its own jobs (the Reports lines by person and by profile)
    const people = (rows, key) => rows.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['', 'Screened', 'Continued', 'Proposals', 'Sent', 'Hired', 'Avg to proposal'].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((r) => { const dim = key === 'user' ? 'person' : 'profile', rk = r.id == null ? 'none' : String(r.id), lbl = `${key === 'user' ? 'Person' : 'Profile'}: ${r.name || 'No profile yet'}`;
        const go = (part) => exact(part, {}, dim, rk, lbl), n = (part, v) => (v ? h('a', { class: 'cellink', href: go(part), onclick: (e) => e.stopPropagation(), title: 'Open these jobs' }, String(v)) : '0');
        return h('tr', { class: 'click', onclick: () => (location.hash = go('all')) },
        h('td', {}, r.name || h('span', { class: 'faint' }, 'No profile yet')), h('td', {}, n('all', r.screened)), h('td', {}, n('continued', r.continued)), h('td', {}, n('written', r.proposals)), h('td', {}, n('sent', r.sent)), h('td', {}, n('hired', r.hired)), h('td', {}, mins(r.avg_to_proposal) || h('span', { class: 'faint' }, '-'))); })))) : h('p', { class: 'muted' }, 'Nothing in this period.');
    body.replaceChildren(
      h('div', { class: 'stats six' },
        kpi('Screened', c.screened, `${c.PASS} pass · ${c.FLAG} flag · ${c.FAIL} fail`, exact('all')),
        kpi('Continued', c.continued, `${pct(c.continued, c.screened)} of screened · ${c.overridden} past a flag/fail`, exact('continued')),
        kpi('Proposals', c.proposals, `${c.finalized} finished`, exact('written')),
        kpi('Sent', c.sent + inv.sent, (inv.sent ? `${c.sent} proposals · ${inv.sent} invite${inv.sent === 1 ? '' : 's'}` : c.connects ? `${c.connects} Connects` : 'Connects not recorded'), exact('sent')),
        kpi('Hired', c.hired + inv.hired, inv.hired ? `${pct(c.hired, c.sent)} of proposals · ${inv.hired} from invites` : `${pct(c.hired, c.sent)} of ${inv.sent ? 'proposals ' : ''}sent`, exact('hired'), 'PASS'),
        kpi('Needs action', needs, 'Waiting on someone', jobsLink({ stage: 'needs_action' }), 'NEED')),
      // R82: how proposals are made now, and how good the review judged them (each opens its report or page)
      d.quality ? h('div', { class: 'qrow' }, h('div', { class: 'qhead' }, h('h2', {}, 'Proposal quality'), h('span', { class: 'faint small' }, 'For the jobs in this period')),
        h('div', { class: 'stats six' },
          kpi('Review score', d.quality.avg_review != null ? d.quality.avg_review + ' / 10' : '-', d.quality.reviewed ? `average of ${d.quality.reviewed} reviewed` : 'No reviews yet', '#/reports?dim=review'),
          kpi('Auto mode', d.quality.auto, d.quality.auto ? `${d.quality.auto_written} written · ${d.quality.auto_stopped} stopped` : 'No jobs in auto mode', '#/reports?dim=mode'),
          kpi('Opening picked', d.quality.opening_used, `${pct(d.quality.opening_used, c.proposals)} of proposals used another opening`, '#/reports?dim=opening'),
          kpi('Experience', d.quality.gaps_yes, d.quality.gaps_open ? `confirmed · ${d.quality.gaps_open} question${d.quality.gaps_open === 1 ? '' : 's'} waiting` : 'confirmed · none waiting', '#/reports?dim=gaps'),
          kpi('Feedback', d.quality.feedback, 'notes on proposals, to fix the setup', '#/feedback'),
          kpi('Documents', d.quality.with_docs, 'jobs with the client\'s files attached', '#/reports?dim=documents'))) : null,
      h('div', { class: 'dgrid' },
        panel('Funnel', 'From screening to hire', h('div', { class: 'hbars' }, funnel.map(([l, v, link]) => hbar(l, v, c.screened, pct(v, c.screened), link))), false,
          inv.sent ? h('a', { class: 'small muted', style: 'display:block;margin-top:10px', href: exact('sent', { invite: 'yes' }, 'funnel', 'all', 'the Dashboard\u2019s invites') }, `Invites, counted apart: ${inv.sent} sent · ${inv.interviewed} interview${inv.interviewed === 1 ? '' : 's'} · ${inv.hired} hired`) : null),
        panel('Speed', 'Paste to proposal ready', h('div', {},
          h('div', { class: 'bigtime' }, mins(t.avg_to_proposal) || '-', h('span', { class: 'small muted', style: 'font-weight:400;letter-spacing:0' }, ' average')),
          h('p', { class: 'small muted', style: 'margin:2px 0 14px' }, t.min_to_proposal != null ? `fastest ${mins(t.min_to_proposal)} · slowest ${mins(t.max_to_proposal)}` : 'No proposals in this period'),
          h('div', { class: 'hbars' }, [['Screening', t.avg_screening], ['Project matching', t.avg_matching], ['Writing (after the profile)', t.avg_writing]].map(([l, v]) =>
            hbar(l, v || 0, Math.max(t.avg_screening || 0, t.avg_matching || 0, t.avg_writing || 0, 1), null, null, v == null ? '-' : mins(v)))),
          h('p', { class: 'hint' }, 'Averages per step, model time only. Person time (reading, picking) is the rest.'))),
        panel('Needs attention', needs ? `${needs} job${needs === 1 ? '' : 's'} waiting` : 'Nothing waiting', d.waiting.length
          ? h('div', {}, h('div', { class: 'chips', style: 'margin-bottom:10px' }, d.needs_action.filter((k) => d.stages[k]).map((k) => h('a', { class: 'chip', href: jobsLink({ stage: k }) }, `${STAGE_INFO[k][1]}: ${d.stages[k]}`))),
            h('ul', { class: 'waitlist' }, d.waiting.map((r) => h('li', {}, h('a', { href: jobHref(r) }, r.title || 'Job #' + r.id), h('span', { class: 'small muted' }, `${STAGE_INFO[r.stage][1]} · ${r.user_name} · ${ago(r.created_at)}`)))))
          : h('p', { class: 'muted' }, 'Every job in this period is complete or skipped.')),
        panel('Jobs per day', 'Screened and proposals written', d.daily.length ? h('div', { class: 'daybars' }, d.daily.map((x) => h('div', { class: 'day', title: `${x.day}: ${x.screened} screened, ${x.continued} continued, ${x.proposals} proposals` },
          h('div', { class: 'col' }, h('i', { class: 's', style: `height:${(x.screened / maxDay) * 100}%` }), h('i', { class: 'p', style: `height:${(x.proposals / maxDay) * 100}%` })),
          h('span', { class: 'small muted nowrap' }, toDate(x.day + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: TZ }))))) : h('p', { class: 'muted' }, 'No jobs in this period.'), false,
          d.daily.length ? h('div', { class: 'legend' }, h('span', {}, h('i', { class: 's' }), 'Screened'), h('span', {}, h('i', {}), 'Proposals')) : null),
        panel('Rules that fire most', 'And how often people continue anyway', d.rules.length ? h('div', { class: 'hbars' }, d.rules.map((r) =>
          hbar(r.code + (r.rule ? '  ' + r.rule : ''), r.fired, d.rules[0].fired, `${pct(r.continued, r.fired)} continued`, jobsLink({ rule: r.code })))) : h('p', { class: 'muted' }, 'No rules fired in this period.'), true),
        d.by_user.length ? panel('By person', null, people(d.by_user, 'user'), true) : null,
        panel('By profile', null, people(d.by_profile, 'profile'), true)));
  }
  async function load() {
    const r = periodRange(st.period); const q = new URLSearchParams();
    if (r.from) q.set('from', r.from); if (r.to) q.set('to', r.to);
    for (const k of ['profile', 'user']) if (st[k]) q.set(k, st[k]); if (st.mine) q.set('mine', '1');
    setHashParams({ period: st.period === '30' ? '' : st.period, profile: st.profile, user: st.user, mine: st.mine ? '1' : '' });
    fbar.setActive(!!(st.profile || st.user || st.mine));
    draw(await api('GET', '/dashboard?' + q));
    live.textContent = 'Live \u00b7 updated ' + new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: TZ });
  }
  // R127: live. Every 10 seconds (and on coming back to the tab) it asks whether anything changed, and only then reloads the numbers
  const live = h('span', { class: 'livetag small muted', title: 'The numbers update by themselves when anything changes' });
  let stamp = null, timer = null, busy = false;
  const check = async () => {
    clearTimeout(timer);
    if (!body.isConnected) { document.removeEventListener('visibilitychange', onVis); return; } // left the Dashboard
    if (!document.hidden && !busy) {
      busy = true;
      try { const r = await api('GET', '/dashboard/stamp'); if (stamp !== null && r.stamp !== stamp) await load(); stamp = r.stamp; } catch { /* the next check tries again */ }
      busy = false;
    }
    timer = setTimeout(check, 10_000);
  };
  const onVis = () => { if (!document.hidden) check(); };
  document.addEventListener('visibilitychange', onVis);
  shell('dashboard', [pageHead('Dashboard', 'How the team is doing: what came in, what went out, how fast, and what is waiting.', h('div', { class: 'row', style: 'gap:12px;align-items:center' }, live, h('a', { class: 'btn primary', href: '#/new' }, icon('screen'), 'Screen a job'))), bar, body], 1480);
  body.append(h('div', { class: 'card card-pad' }, h('div', { class: 'skel', style: 'width:60%' })));
  try { stamp = (await api('GET', '/dashboard/stamp')).stamp; } catch { /* the first check takes it */ } // before loading: a change while it loads is not missed
  await load();
  timer = setTimeout(check, 10_000);
}

// ---------- reports: every trend, for the jobs the filters match ----------
/** Save rows as a CSV file from the browser (a cell that starts like a formula gets a quote, so a spreadsheet never runs it). */
function downloadCsv(name, heads, rows) {
  const cell = (v) => { let t = v == null ? '' : String(v); if (/^[=+\-@]/.test(t)) t = "'" + t; return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const blob = new Blob(['﻿' + [heads, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const REPORT_PERIODS = [['', 'All time'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['month', 'This month'], ['custom', 'Custom dates']];
/** The rates every report row shows, each as [share, of how many]. */
const RATES = [['view', 'View rate', (r) => [r.viewed, r.sent]], ['chat', 'Chat rate', (r) => [r.chat, r.sent]], ['interview', 'Interview rate', (r) => [r.interview, r.sent]], ['hire', 'Hire rate', (r) => [r.hired, r.sent]]];
const share = (a, b) => (b ? a / b : null);
const pctText = (v) => (v == null ? '' : Math.round(v * 100) + '%');

async function reportsView() {
  const hp = hashParams();
  const st = { period: hp.period ?? '90', from: hp.from || '', to: hp.to || '', basis: hp.basis === 'sent' ? 'sent' : 'screened', profile: hp.profile || '', user: hp.user || '', source: hp.source || '', v: hp.v || '',
    dim: hp.dim || 'profile', min: Number(hp.min) || 1, sort: hp.sort || 'sent', dir: hp.dir === 'asc' ? 'asc' : 'desc',
    invite: hp.invite === 'yes' || hp.invite === 'all' ? hp.invite : 'no' }; // R105: proposals only unless asked
  if (!REPORT_PERIODS.some(([k]) => k === st.period)) st.period = '90';
  const opts = await api('GET', '/screenings/filter-options');
  const body = h('div', { class: 'stack' });
  let data = null;
  const range = () => { if (st.period === 'custom') return { from: st.from, to: st.to }; if (st.period === '7' || st.period === '30' || st.period === '90' || st.period === 'month') return periodRange(st.period === '90' ? '90d' : st.period); return {}; };
  /** The same filters as a Jobs list link, plus `extra` (a row's own filter). */
  const jobsLink = (extra) => {
    const r = range(), q = new URLSearchParams(), pre = st.basis === 'sent' ? 'sent_' : '';
    if (r.from) q.set(pre + 'from', r.from); if (r.to) q.set(pre + 'to', r.to);
    for (const k of ['profile', 'user', 'source', 'v']) if (st[k]) q.set(k, st[k]);
    if (st.invite !== 'all') q.set('invite', st.invite);
    for (const [k, v] of Object.entries(extra || {})) if (v !== '' && v != null) q.set(k, v);
    return '#/history?' + q;
  };
  const fromIn = dateField('From', st.from, (v) => { st.from = v; load(); }), toIn = dateField('To', st.to, (v) => { st.to = v; load(); });
  const syncDates = () => { fromIn.hidden = toIn.hidden = st.period !== 'custom'; };
  // R129: profile, person and gate result pick several
  const sel = (key, label, options, keep) => { const el = fSelect(label, options, st[key], (v) => { st[key] = v || (keep ?? ''); if (key === 'period') syncDates(); load(); }); return el; };
  const periodSel = h('select', { 'aria-label': 'Period', class: 'fsel', 'data-plain': true }, REPORT_PERIODS.map(([k, l]) => h('option', { value: k, selected: st.period === k }, l)));
  periodSel.onchange = () => { st.period = periodSel.value; syncDates(); load(); };
  const basisSel = h('select', { 'aria-label': 'Dates by', class: 'fsel', 'data-plain': true }, [['screened', 'Date screened'], ['sent', 'Date sent']].map(([k, l]) => h('option', { value: k, selected: st.basis === k }, l)));
  basisSel.onchange = () => { st.basis = basisSel.value; load(); };
  // R105: an invite opens the chat itself, so its view and chat would blur the proposals' rates: proposals only by default
  // R129: proposals, invites, or both ticked (nothing ticked is both too)
  const inviteSel = fSelect('Proposals and invites', [['no', 'Proposals'], ['yes', 'Invites']], st.invite === 'all' ? 'no|yes' : st.invite, (v) => { st.invite = v === 'no' || v === 'yes' ? v : 'all'; load(); });
  const profSel = sel('profile', 'Any profile', opts.profiles.map((p) => [p.id, p.name])), userSel = opts.users.length ? sel('user', 'Anyone', opts.users.map((u) => [u.id, u.name])) : null;
  const srcSel = sel('source', 'Any tool', [['app', 'Upwork Pro'], ['claude_plugin', 'Claude plugin']]), vSel = sel('v', 'Any verdict', [['PASS', 'Pass'], ['FLAG', 'Flag'], ['FAIL', 'Fail']]);
  const exportBtn = h('button', { class: 'btn', type: 'button', onclick: () => { if (!data) return;
    downloadCsv(`upwork-pro-report-${ymd(new Date())}.csv`, ['Report', 'Group', 'Jobs', 'Continued', 'Proposals written', 'Sent', 'Viewed', 'Chat opened', 'Interview', 'Hired', 'Lost', 'Connects', 'View rate', 'Chat rate', 'Interview rate', 'Hire rate'],
      [{ label: 'Everything', rows: [data.totals] }, ...data.dims].flatMap((d) => d.rows.map((r) => [d.label, r.name, r.jobs, r.continued, r.written, r.sent, r.viewed, r.chat, r.interview, r.hired, r.lost, r.connects, ...RATES.map(([, , f]) => pctText(share(...f(r))))]))); toast('Report saved as a CSV file'); } }, icon('doc'), 'Export');
  // R120 (Hamza): one row, as on the Jobs list: the period (and its two dates), what the dates count, proposals or invites, profile,
  // person, written in, gate result, and Export at the end; the filters in use as chips under it, each with its own x
  const clearAll = () => { Object.assign(st, { profile: '', user: '', source: '', v: '' }); for (const x of [profSel, userSel, srcSel, vSel]) if (x) x.value = ''; load(); };
  const chipsEl = h('div', { class: 'fb-chips' });
  const drawChips = () => {
    const name = (sel) => (sel ? [...sel.selectedOptions].filter((o) => o.value !== '').map((o) => o.textContent).join(', ') : ''); // R129: every value picked
    const chips = [['profile', 'Profile', profSel], ['user', 'Person', userSel], ['source', 'Written in', srcSel], ['v', 'Gate result', vSel]].filter(([k, , el]) => st[k] && el)
      .map(([k, label, el]) => h('button', { type: 'button', class: 'chip fb-chip', title: 'Remove this filter', onclick: () => { st[k] = ''; el.value = ''; load(); } }, `${label}: ${name(el)}`, h('span', { 'aria-hidden': 'true' }, ' \u00d7')));
    chipsEl.hidden = !chips.length;
    chipsEl.replaceChildren(...(chips.length ? [h('span', { class: 'jp-label' }, 'Filtered by'), ...chips, h('button', { type: 'button', class: 'linkbtn small', onclick: clearAll }, 'Clear all')] : []));
  };
  const fbar = h('div', { class: 'jobfilters' }, h('div', { class: 'fb-row' }, periodSel, h('span', { class: 'fb-dates' }, fromIn, toIn), basisSel, inviteSel, profSel, userSel, srcSel, vSel,
    ), chipsEl);
  fbar.setActive = drawChips;
  syncDates();

  /** R117: the jobs behind a report line, or one of its numbers (part), in the Jobs list with the same filters. */
  const rowLink = (dimKey, label, row, part = 'all') => { const d = directFilters(dimKey, row.key, part); // R119: real filters first
    return d ? jobsLink({ ...d, tab: '' }) : jobsLink({ rdim: dimKey, rkey: row.key, rpart: part === 'all' ? '' : part, rlabel: label, tab: '' }); };
  const PART_OF = { view: 'viewed', chat: 'chat', interview: 'interview', hire: 'hired' };
  /** A number in a report line that opens its own jobs (it never opens the line's jobs instead). */
  const numLink = (href, text, title) => h('a', { class: 'cellink', href, title, onclick: (e) => e.stopPropagation() }, text);
  const rateCell = (r, f, href) => { const [a, b] = f(r), v = share(a, b); return h('td', { class: 'num', title: b ? `${a} of ${b} sent` : 'Nothing sent yet' }, v == null ? h('span', { class: 'faint' }, 'No data')
    : (href && a ? numLink(href, [h('span', { class: 'ratebar', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.round(v * 100)}%` })), pctText(v)], `Open the ${a} job${a === 1 ? '' : 's'}`) : [h('span', { class: 'ratebar', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.round(v * 100)}%` })), pctText(v)])); };
  const sortVal = { name: (r) => r.name.toLowerCase(), jobs: (r) => r.jobs, sent: (r) => r.sent, view: (r) => share(r.viewed, r.sent) ?? -1, chat: (r) => share(r.chat, r.sent) ?? -1, interview: (r) => share(r.interview, r.sent) ?? -1, hire: (r) => share(r.hired, r.sent) ?? -1, cost: (r) => (r.sent ? r.connects / r.sent : -1) };
  function breakdown(d) {
    const rows = d.rows.filter((r) => (d.basis === 'sent' ? r.sent : Math.max(r.sent, st.min === 1 ? r.jobs : 0)) >= st.min && (st.min === 1 || r.sent >= st.min));
    const keep = d.key === 'week' && st.sort === 'sent' && st.dir === 'desc'; // weeks read in time order unless another column is chosen
    if (!keep) rows.sort((a, b) => { const x = sortVal[st.sort](a), y = sortVal[st.sort](b); return (x < y ? -1 : x > y ? 1 : 0) * (st.dir === 'asc' ? 1 : -1); });
    const th = (label, key, num) => { const on = st.sort === key; const b = h('button', { type: 'button', class: 'sortbtn' + (on ? ' on' : '') }, label, on ? (st.dir === 'asc' ? ' ▲' : ' ▼') : '');
      b.onclick = () => { if (on) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.sort = key; st.dir = key === 'name' ? 'asc' : 'desc'; } draw(); }; return h('th', { class: num ? 'num' : null, 'aria-sort': on ? (st.dir === 'asc' ? 'ascending' : 'descending') : null }, b); };
    return rows.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'report' }, h('thead', {}, h('tr', {}, th(d.label, 'name'), th('Jobs', 'jobs', true), th('Sent', 'sent', true), ...(st.invite === 'yes' ? [] : [th('View rate', 'view', true), th('Chat rate', 'chat', true)]), th('Interview rate', 'interview', true), th('Hire rate', 'hire', true), th('Connects per proposal', 'cost', true))),
      h('tbody', {}, rows.map((r) => { const lbl = `${d.label}: ${r.name}`, all = rowLink(d.key, lbl, r); // R117: every line opens its jobs; each number, its own
        return h('tr', { class: 'click', tabindex: 0, title: 'Open these jobs', onclick: () => (location.hash = all), onkeydown: (e) => { if (e.key === 'Enter') location.hash = all; } },
        h('td', {}, h('strong', {}, r.name)), h('td', { class: 'num' }, numLink(all, String(r.jobs), 'Open these jobs')), h('td', { class: 'num' }, r.sent ? numLink(rowLink(d.key, lbl, r, 'sent'), String(r.sent), 'Open the sent ones') : '0'),
        RATES.filter(([k]) => st.invite !== 'yes' || (k !== 'view' && k !== 'chat')).map(([k, , f]) => rateCell(r, f, rowLink(d.key, lbl, r, PART_OF[k]))),
        h('td', { class: 'num' }, r.sent && r.connects ? (r.connects / r.sent).toFixed(1) : h('span', { class: 'faint' }, 'No data'))); }))))
      : emptyState('chart', 'Nothing to compare yet', st.min > 1 ? `No group has ${st.min} sent proposals in this period. Lower "At least" or widen the dates.` : d.basis === 'sent' ? 'This report counts sent proposals, and none is recorded for these filters.' : 'No jobs match these filters.');
  }
  /** What is working: for the dimensions that matter most, the group with the best rate, among groups with enough sent proposals to mean something. */
  function highlights() {
    if (st.invite === 'yes') return h('p', { class: 'jp-label', style: 'margin:0' }, 'These compare view and chat rates, which an invite does not have (the client opened the chat). Switch to Proposals only, or open the Proposal or invite report below.');
    const need = Math.max(3, st.min), out = [];
    for (const [key, rateKey] of [['profile', 'view'], ['profile', 'chat'], ['type', 'chat'], ['project', 'chat'], ['industry', 'chat'], ['person', 'chat'], ['loom', 'chat'], ['source', 'chat'], ['sent_weekday', 'view'], ['boost', 'view']]) {
      const d = data.dims.find((x) => x.key === key), [, label, f] = RATES.find((x) => x[0] === rateKey);
      const ok = d.rows.filter((r) => r.sent >= need); if (ok.length < 2) continue;
      const best = [...ok].sort((a, b) => share(...f(b)) - share(...f(a)))[0], [a, b] = f(best), rest = ok.filter((r) => r !== best), ra = rest.reduce((n, r) => n + f(r)[0], 0), rb = rest.reduce((n, r) => n + f(r)[1], 0);
      if (!a || share(a, b) <= share(ra, rb)) continue;
      out.push(h('li', {}, h('button', { type: 'button', class: 'linkbtn', onclick: () => { st.dim = key; dimSel.value = key; draw(); document.getElementById('breakdown').scrollIntoView({ behavior: 'smooth' }); } }, d.label),
        h('span', {}, ': ', h('a', { href: rowLink(key, `${d.label}: ${best.name}`, best, 'sent'), title: 'Open its sent proposals' }, h('strong', {}, best.name)), ` has the best ${label.toLowerCase()}, ${pctText(share(a, b))} (${a} of ${b} sent). The others together: ${pctText(share(ra, rb))}.`)));
    }
    return out.length ? h('ul', { class: 'jp-list', style: 'margin:0' }, out) : h('p', { class: 'jp-label', style: 'margin:0' }, `Not enough sent proposals to compare yet. A group needs at least ${need} sent proposals, and there must be two such groups. Keep recording Sent, Viewed, Chat opened, Interview and the outcome on each job.`);
  }
  const dimSel = h('select', { 'aria-label': 'Break down by', class: 'fsel' });
  dimSel.onchange = () => { st.dim = dimSel.value; draw(); };
  const minSel = h('select', { 'aria-label': 'At least', class: 'fsel', 'data-plain': true }, [[1, 'Every group'], [3, 'At least 3 sent'], [5, 'At least 5 sent'], [10, 'At least 10 sent'], [25, 'At least 25 sent']].map(([v, l]) => h('option', { value: v, selected: st.min === v }, l)));
  minSel.onchange = () => { st.min = Number(minSel.value); draw(); };

  function draw() {
    const t = data.totals, tm = data.timing;
    setHashParams({ period: st.period === '90' ? '' : st.period || 'all', from: st.period === 'custom' ? st.from : '', to: st.period === 'custom' ? st.to : '', basis: st.basis === 'sent' ? 'sent' : '', profile: st.profile, user: st.user, source: st.source, v: st.v, invite: st.invite === 'no' ? '' : st.invite,
      dim: st.dim === 'profile' ? '' : st.dim, min: st.min === 1 ? '' : st.min, sort: st.sort === 'sent' ? '' : st.sort, dir: st.dir === 'desc' ? '' : st.dir });
    fbar.setActive(!!(st.profile || st.user || st.source || st.v));
    if (!dimSel.options.length) dimSel.replaceChildren(...data.dims.map((d) => h('option', { value: d.key }, `By ${d.label[0].toLowerCase()}${d.label.slice(1)}`)));
    if (!data.dims.some((d) => d.key === st.dim)) st.dim = 'profile';
    dimSel.value = st.dim;
    const d = data.dims.find((x) => x.key === st.dim);
    const kpi = (label, value, sub, link) => h(link ? 'a' : 'div', { class: 'stat kpi', href: link || null, style: link ? null : 'cursor:default' }, h('span', { class: 'k' }, label), h('span', { class: 'v' }, value), h('span', { class: 'sub muted' }, sub));
    const rate = (a, b) => (b ? pctText(a / b) : 'No data');
    const inv = st.invite === 'yes'; // invites only: no view or chat step, the client opened the chat
    const tot = (part) => rowLink('funnel', 'Reports', { key: 'all' }, part); // R117: the totals line
    const funnel = [['Screened', t.jobs, 'all'], ['Continued', t.continued, 'continued'], ['Proposal written', t.written, 'written'], ['Sent', t.sent, 'sent'], ...(inv ? [] : [['Viewed', t.viewed, 'viewed'], ['Chat opened', t.chat, 'chat']]), ['Interview', t.interview, 'interview'], ['Hired', t.hired, 'hired']];
    const hours = (v) => (v == null ? 'No data' : v < 1 ? Math.round(v * 60) + ' min' : v < 48 ? v + ' h' : Math.round(v / 24) + ' days');
    const weeks = data.dims.find((x) => x.key === 'week').rows, maxW = Math.max(1, ...weeks.map((w) => w.jobs));
    // a small card per report, so every trend is on the page at once; its top groups by sent, with the chat rate
    const mini = (x) => { const top = x.rows.filter((r) => r.sent || x.basis === 'jobs').slice(0, 4);
      const open = () => { st.dim = x.key; draw(); document.getElementById('breakdown').scrollIntoView({ behavior: 'smooth' }); };
      return h('div', { class: 'card card-pad minirep' + (x.key === st.dim ? ' on' : '') },
        h('button', { type: 'button', class: 'minihead', title: 'See this report in full', onclick: open }, h('strong', {}, x.label), h('span', { class: 'small muted' }, 'In full ›')),
        top.length ? h('div', { class: 'minirows' }, top.map((r) => h('a', { class: 'minirow', href: rowLink(x.key, `${x.label}: ${r.name}`, r), title: 'Open these jobs' }, h('span', { class: 'clip' }, r.name), h('span', { class: 'muted' }, r.sent ? `${r.sent} sent · ${rate(r.viewed, r.sent)} viewed` : `${r.jobs} job${r.jobs === 1 ? '' : 's'}`))))
          : h('div', { class: 'jp-label' }, 'Nothing recorded yet')); };
    body.replaceChildren(...[
      data.capped ? h('div', { class: 'notice' }, icon('info'), `Showing the newest ${data.limit.toLocaleString()} jobs these filters match. Narrow the dates to count them all.`) : null,
      inv ? h('div', { class: 'stats' },
        kpi('Invites sent', t.sent, `${t.jobs > t.sent ? `of ${t.jobs} invites · ` : ''}${t.connects} Connects`, tot('sent')),
        kpi('Interview rate', rate(t.interview, t.sent), `${t.interview} interviews`, tot('interview')),
        kpi('Hire rate', rate(t.hired, t.sent), `${t.hired} hired`, tot('hired')),
        kpi('Lost', t.lost, `${rate(t.lost, t.sent)} of invites sent`, tot('lost')),
        kpi('Connects per hire', t.hired && t.connects ? Math.round(t.connects / t.hired) : 'No data', 'An invite opens the chat itself: no view or chat rate'))
      : h('div', { class: 'stats six' },
        kpi('Sent', t.sent, `of ${t.jobs} screened · ${t.connects} Connects`, tot('sent')),
        kpi('View rate', rate(t.viewed, t.sent), `${t.viewed} viewed`, tot('viewed')),
        kpi('Chat rate', rate(t.chat, t.sent), `${t.chat} chats opened`, tot('chat')),
        kpi('Interview rate', rate(t.interview, t.sent), `${t.interview} interviews`, tot('interview')),
        kpi('Hire rate', rate(t.hired, t.sent), `${t.hired} hired · ${t.lost} lost`, tot('hired')),
        kpi('Connects per hire', t.hired && t.connects ? Math.round(t.connects / t.hired) : 'No data', t.sent && t.connects ? `${(t.connects / t.sent).toFixed(1)} per proposal` : 'Record Connects on each job')),
      h('div', { class: 'dgrid' },
        h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Funnel'), h('span', { class: 'sub' }, 'Each step as a share of the one before')),
          h('div', { class: 'card-pad hbars' }, funnel.map(([l, v, part], i) => h('a', { class: 'hbar', href: tot(part), title: `Open the ${v} job${v === 1 ? '' : 's'}` }, h('span', { class: 'lbl' }, l), h('span', { class: 'track' }, h('i', { style: `width:${t.jobs ? Math.max(v ? 2 : 0, (v / t.jobs) * 100) : 0}%` })),
            h('span', { class: 'num' }, v), h('span', { class: 'ext muted' }, i ? rate(v, funnel[i - 1][1]) : ''))))),
        h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'What is working'), h('span', { class: 'sub' }, 'The best group in each report')), h('div', { class: 'card-pad' }, highlights())),
        h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Over time'), h('span', { class: 'sub' }, 'Jobs screened and proposals sent, by week')),
          h('div', { class: 'card-pad' }, weeks.length ? [h('div', { class: 'daybars' }, weeks.map((w) => h('a', { class: 'day', href: rowLink('week', w.name, w), title: `${w.name}: ${w.jobs} screened, ${w.sent} sent, ${w.viewed} viewed, ${w.chat} chats, ${w.hired} hired` },
            h('div', { class: 'col' }, h('i', { class: 's', style: `height:${(w.jobs / maxW) * 100}%` }), h('i', { class: 'p', style: `height:${(w.sent / maxW) * 100}%` })),
            h('span', { class: 'small muted nowrap' }, toDate(w.key + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: TZ }))))),
            h('div', { class: 'legend' }, h('span', {}, h('i', { class: 's' }), 'Screened'), h('span', {}, h('i', {}), 'Sent'))] : h('p', { class: 'muted' }, 'No jobs in this period.'))),
        h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'How long things take'), h('span', { class: 'sub' }, 'Averages')),
          h('div', { class: 'card-pad' }, h('dl', { class: 'facts' }, [['Paste to proposal ready', tm.secs_to_proposal == null ? 'No data' : mins(tm.secs_to_proposal)], ...(inv ? [] : [['Sent to first view', hours(tm.hours_to_view)], ['Sent to chat opened', hours(tm.hours_to_chat)]]), ['Sent to closed', tm.days_to_close == null ? 'No data' : tm.days_to_close + ' days']]
            .map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', { class: v === 'No data' ? 'ns' : '' }, v))))))),
      h('div', { class: 'card', id: 'breakdown' }, h('div', { class: 'card-head' }, h('h2', {}, 'Break it down'), h('span', { class: 'sub' }, d.help)),
        h('div', { class: 'filterbar' }, dimSel, minSel, h('div', { class: 'fb-actions wide' }, h('span', { class: 'jp-label' }, 'A row opens its jobs. A column title sorts.'))),
        breakdown(d)),
      h('div', {}, h('h2', {}, 'Every report'), h('p', { class: 'jp-label' }, 'Each card is one way to cut the same jobs. Open one to see it in full above.')),
      h('div', { class: 'grid4 minigrid' }, data.dims.map(mini)),
      h('div', { class: 'notice' }, icon('info'), h('span', {}, 'A rate is only as good as what is recorded: mark each proposal Sent, then Viewed, Chat opened, Interview and its outcome (the Update status button), and record Connects, boost and the Loom video when you mark it sent (or on the job Overview, Edit details). Small groups swing a lot: use "At least" to hide them.')),
    ].filter(Boolean));
  }
  async function load() {
    const r = range(), q = new URLSearchParams(), pre = st.basis === 'sent' ? 'sent_' : '';
    if (r.from) q.set(pre + 'from', r.from); if (r.to) q.set(pre + 'to', r.to);
    for (const [k, api] of [['profile', 'profile'], ['user', 'user'], ['source', 'source'], ['v', 'verdict']]) if (st[k]) q.set(api, st[k]);
    if (st.invite !== 'all') q.set('invite', st.invite);
    data = await api('GET', '/reports?' + q); draw();
  }
  shell('reports', [pageHead('Reports', 'What is working and what is not: the same jobs counted by profile, person, proposal type, project, industry, tag, signal, rule, Loom video and more. Every row and number opens the jobs behind it.', exportBtn),
    h('div', { class: 'card' }, fbar), body]);
  body.append(h('div', { class: 'card card-pad' }, h('div', { class: 'skel', style: 'width:60%' })));
  await load();
}

// ---------- status: what happened on Upwork after the proposal ----------
/** Now, as the value a datetime-local input takes (local time, to the minute). */
const nowLocal = () => new Date().toLocaleString('sv', { timeZone: TZ }).replace(' ', 'T').slice(0, 16); // now in your time zone; the server stores it as Pakistan time
const NEXT_STATUS = { '': 'Sent', Sent: 'Viewed', Viewed: 'Chat opened', 'Chat opened': 'Interview' };
const canTrack = (userId) => userId === me.id || me.role === 'admin' || me.role === 'manager';
/** One click to record a status and when it happened (now, unless changed). Every change is kept in the history. */
async function statusDialog(id, onDone, invite) {
  const d = await api('GET', `/screenings/${id}/status`);
  const inv = !d.current && invite !== undefined ? inviteBox(!!Number(invite), false) : null; // only when it is first marked sent
  let pick = NEXT_STATUS[d.current || ''] || d.choices[0];
  let draw;
  const when = h('input', { type: 'datetime-local', id: 'sat', value: nowLocal(), max: nowLocal() });
  const reason = h('select', { id: 'srs', style: 'width:100%' }, h('option', { value: '' }, 'Choose a reason'), d.loss_reasons.map((r) => h('option', { value: r }, r)));
  const note = h('textarea', { id: 'snt', style: 'min-height:64px', maxlength: 2000, placeholder: 'Anything the client said, or what we could do differently (optional)' });
  const lossBox = h('div', { class: 'field', style: 'margin-top:14px' }, h('label', { class: 'lbl', for: 'srs' }, 'Why didn\u2019t the client go ahead? (required)'), reason, h('div', { style: 'height:8px' }), note);
  // R124: going back to a step that already happened keeps its time; going back takes back the steps after it (said here first)
  const asInput = (v) => { const t = toDate(v); return t ? t.toLocaleString('sv', { timeZone: TZ }).replace(' ', 'T').slice(0, 16) : nowLocal(); };
  const order = ['Sent', 'Viewed', 'Chat opened', 'Interview'], rank = (c) => (c === d.not_sent ? -1 : order.includes(c) ? order.indexOf(c) : order.length);
  const undoNote = h('div', { class: 'hint', style: 'margin-top:10px' });
  const syncLoss = () => {
    lossBox.hidden = !d.loss_outcomes.includes(pick);
    when.value = d.times?.[pick] ? asInput(d.times[pick]) : nowLocal(); whenBox.hidden = pick === d.not_sent;
    whenHint.textContent = d.times?.[pick] ? `When ${pick} was recorded. Change it only if that was wrong.` : 'Set to now. Change it only if it happened earlier.';
    const back = d.current && pick !== d.current && rank(pick) < rank(d.current);
    undoNote.textContent = pick === d.not_sent ? `This takes the job back to not sent: ${d.current} and everything before it are undone. The history keeps what was recorded.`
      : back ? `This goes back from ${d.current} to ${pick}: the steps after ${pick} are undone. The history keeps what was recorded.` : '';
    undoNote.hidden = !undoNote.textContent;
  };
  const whenHint = h('div', { class: 'hint' });
  const whenBox = h('div', { class: 'field', style: 'margin-top:14px' }, h('label', { class: 'lbl', for: 'sat' }, 'When it happened'), when, whenHint);
  const grid = h('div', { class: 'statuspick', role: 'radiogroup', 'aria-label': 'Status' });
  draw = () => grid.replaceChildren(...d.choices.map((c) => h('button', { type: 'button', role: 'radio', 'aria-checked': pick === c, class: 'chip' + (pick === c ? ' brand' : '') + (c === d.current ? ' cur' : '') + (d.loss_outcomes.includes(c) ? ' loss' : ''), onclick: () => { pick = c; draw(); } }, c)));
  const draw0 = draw; draw = () => { draw0(); syncLoss(); };
  draw();
  modal({ title: 'Update status', confirm: 'Save status', body: h('div', {},
    d.current ? h('p', { class: 'small muted', style: 'margin-top:0' }, 'Now: ', h('strong', {}, d.current)) : null,
    grid,
    undoNote,
    lossBox,
    whenBox,
    inv ? h('div', { style: 'margin-top:14px' }, inv.el) : null,
    d.events.length ? h('details', { class: 'desc', style: 'margin-top:12px' }, h('summary', {}, `History (${d.events.length})`),
      h('ul', { class: 'plain' }, d.events.map((e) => h('li', {}, h('strong', {}, e.status), h('span', { class: 'muted' }, ` · ${full(e.happened_at)}${e.user_name ? ' · ' + e.user_name : ''}${e.reason ? ' · ' + e.reason : ''}`))))) : null),
    onConfirm: async () => {
      const lost = d.loss_outcomes.includes(pick);
      await api('POST', `/screenings/${id}/status`, { status: pick, at: when.value, reason: lost ? reason.value || null : null, note: note.value.trim() || null, ...(inv && inv.changed() ? { invited: inv.on() } : {}) });
      toast(`Status: ${pick}`); if (onDone) await onDone();
    } });
}

/** Connects, boost, the Loom video and notes for a job. */
async function detailsDialog(s, onDone) {
  const { videos } = await api('GET', '/looms');
  const f = trackFields(s, videos);
  modal({ title: 'Edit details', confirm: 'Save', body: h('div', { class: 'stack' }, f.body),
    onConfirm: async () => { await api('PATCH', `/screenings/${s.id}/tracking`, f.values()); toast('Saved'); if (onDone) await onDone(); } });
}
function trackFields(s, videos) {
  // the sending profile's videos first; a video that was sent before stays in the list even if it was disabled since
  const mine = videos.filter((v) => (Number(v.active) || v.id === s.loom_video_id) && (!s.upwork_profile_id || v.profile_id === s.upwork_profile_id));
  const loom = h('select', { id: 'tl', style: 'width:100%' }, h('option', { value: '' }, 'No Loom video'), mine.map((v) => h('option', { value: v.id, selected: v.id === s.loom_video_id }, v.title + (s.upwork_profile_id ? '' : ' (' + v.profile_name + ')'))));
  const c = h('input', { type: 'number', id: 'tc', min: 0, max: 1000, value: s.connects_spent ?? '' });
  const bo = h('input', { type: 'number', id: 'tb', min: 0, max: 1000, value: s.boost_connects ?? '' });
  const no = h('textarea', { id: 'tn', style: 'min-height:70px', maxlength: 4000, placeholder: 'Anything worth knowing later (optional)' }); no.value = s.notes || '';
  const link = h('input', { type: 'url', id: 'tjl', maxlength: 500, placeholder: 'https://www.upwork.com/jobs/~02...', value: s.source_url || '' }); // R139
  const num = (el) => (el.value === '' ? null : Number(el.value));
  const inv = inviteBox(!!s.invite, s.invite_by_type);
  return {
    body: [inv.el, h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tc' }, 'Connects spent'), c), h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tb' }, 'Boost (Connects)'), bo)),
      h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tl' }, 'Loom video sent with the proposal'), loom,
        h('div', { class: 'hint' }, mine.length ? 'Recorded so the reports can compare proposals with a video against those without.' : 'This profile has no Loom videos yet. An admin adds them under Loom videos.')),
      h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tjl' }, 'Job link'), link, h('div', { class: 'hint' }, 'The Upwork link of this job. Saved by itself when the page you paste has it.')),
      h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tn' }, 'Notes'), no)],
    values: () => ({ connects_spent: num(c), boost_connects: num(bo), notes: no.value.trim() || null, loom_video_id: num(loom), ...(link.value.trim() !== (s.source_url || '') ? { source_url: link.value.trim() || null } : {}), ...(inv.changed() ? { invited: inv.on() ? 'yes' : 'no' } : {}) }),
  };
}
/** R105: "The client invited us". An invite opens the chat itself, so the reports keep it apart from proposals. */
function inviteBox(on, byType) {
  const box = h('input', { type: 'checkbox', id: 'tinv', checked: on });
  return { el: h('div', { class: 'field' }, h('label', { class: 'check', for: 'tinv' }, box, 'The client invited us (an invite)'),
      h('div', { class: 'hint' }, byType && on ? 'Ticked because it was written with the Invite type. An invite opens the chat itself, so reports count it apart from proposals.' : 'An invite opens the chat itself, so reports count it apart from proposals.')),
    on: () => box.checked, changed: () => box.checked !== on };
}
/** Mark the proposal as sent, in one popup: the status and when, Connects, boost, the Loom video and notes. */
async function sentDialog(s, onDone) {
  const [d, { videos }] = await Promise.all([api('GET', `/screenings/${s.id}/status`), api('GET', '/looms')]);
  let pick = 'Sent';
  const f = trackFields(s, videos);
  const when = h('input', { type: 'datetime-local', id: 'sat', value: nowLocal(), max: nowLocal() });
  const reason = h('select', { id: 'srs', style: 'width:100%' }, h('option', { value: '' }, 'Choose a reason'), d.loss_reasons.map((r) => h('option', { value: r }, r)));
  const lossBox = h('div', { class: 'field', hidden: true }, h('label', { class: 'lbl', for: 'srs' }, 'Why didn\u2019t the client go ahead? (required)'), reason);
  const grid = h('div', { class: 'statuspick', role: 'radiogroup', 'aria-label': 'Status' });
  const draw = () => { grid.replaceChildren(...d.choices.map((c) => h('button', { type: 'button', role: 'radio', 'aria-checked': pick === c, class: 'chip' + (pick === c ? ' brand' : '') + (d.loss_outcomes.includes(c) ? ' loss' : ''), onclick: () => { pick = c; draw(); } }, c))); lossBox.hidden = !d.loss_outcomes.includes(pick); };
  draw();
  modal({ title: 'Mark as sent', confirm: 'Save', wide: true, body: h('div', { class: 'stack' },
    h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Status'), grid, h('div', { class: 'hint' }, 'Sent, unless more has happened already.')), lossBox,
    h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'sat' }, 'When it happened'), when, h('div', { class: 'hint' }, 'Set to now, in your time zone. Change it only if it happened earlier.')),
    f.body),
    onConfirm: async () => {
      const lost = d.loss_outcomes.includes(pick);
      if (lost && !reason.value) throw new Error('Choose why the client did not go ahead.');
      await api('PATCH', `/screenings/${s.id}/tracking`, f.values());
      // a later status needs "Sent" first: record it at the same time
      if (pick !== 'Sent' && !d.current) await api('POST', `/screenings/${s.id}/status`, { status: 'Sent', at: when.value });
      await api('POST', `/screenings/${s.id}/status`, { status: pick, at: when.value, reason: lost ? reason.value : null, note: null });
      toast(`Marked as ${pick.toLowerCase()}`); if (onDone) await onDone();
    } });
}

// ---------- jobs list ----------
/**
 * Our own work, counted only where the job waits on a person (steps 1 to 5); then Upwork.
 * "Screening" and "Writing" are the AI at work for a minute or two, so they get no step number.
 */
const STAGE_INFO = {
  decide: [1, 'Decision pending'], projects: [2, 'Projects pending'], profile: [3, 'Profile pending'], type: [4, 'Proposal type pending'], review: [4, 'Review pending'], ready: [5, 'Ready to send'],
  screening: [0, 'Screening…'], writing: [0, 'Writing…'],
  submitted: [0, 'Submitted'], closed: [0, 'Closed'], skipped: [0, 'Skipped'], failed: [0, 'Failed'],
};
const IN_PROGRESS_STEPS = 5;
/** "Step 2 of 5 · Projects pending" with a thin bar while it waits on us; a short label otherwise. */
function progressStep(stage) {
  const [n, label] = STAGE_INFO[stage] || [0, stage];
  if (stage === 'screening' || stage === 'writing') return h('span', { class: 'small muted row', style: 'gap:6px' }, h('span', { class: 'spin' }), label);
  if (!n) return h('span', { class: 'chip ' + (stage === 'failed' ? 'bad' : stage === 'skipped' ? '' : 'brand') }, label);
  return h('div', { class: 'stepind', title: `Step ${n} of ${IN_PROGRESS_STEPS}: ${label}` },
    h('div', { class: 'small' }, h('span', { class: 'muted' }, `Step ${n} of ${IN_PROGRESS_STEPS} · `), h('strong', {}, label)),
    h('div', { class: 'stepbar', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.round((n / IN_PROGRESS_STEPS) * 100)}%` })));
}
const progressDots = progressStep; // older callers
// R93: one way to write a duration everywhere (it mixed "18:38" with "4 h 11 min")
const mins = (sec) => { if (sec == null) return ''; sec = Math.round(Number(sec)); const m = Math.floor(sec / 60), s = sec % 60;
  return sec < 60 ? sec + ' s' : sec < 600 ? m + ' min' + (s ? ' ' + s + ' s' : '') : sec < 3600 ? m + ' min' : Math.floor(sec / 3600) + ' h ' + Math.floor((sec % 3600) / 60) + ' min'; };
const yn = (v) => (v === 'yes' ? 'Yes' : v === 'no' ? 'No' : '');
/** Long model-written values (budget, client) stay on one line; the full text is on hover. */
const clip = (v, w) => (v ? h('span', { class: 'clip', title: cap(v), style: `max-width:${w}px` }, cap(v)) : '');
// ---------- list cells: one look for every phase, and a detail panel on click ----------
/** A small panel under `anchor`, closed by a click elsewhere or Escape. `build` returns its content (it may be async). */
function popover(anchor, build) {
  document.querySelectorAll('.pop').forEach((p) => p.remove());
  const pop = h('div', { class: 'pop', role: 'dialog' }, h('div', { class: 'skel', style: 'width:70%' }));
  document.body.append(pop);
  const place = () => { const r = anchor.getBoundingClientRect(); const w = pop.offsetWidth; pop.style.top = (r.bottom + window.scrollY + 6) + 'px'; pop.style.left = Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - w - 12)) + 'px'; };
  place();
  const close = () => { pop.remove(); document.removeEventListener('mousedown', out, true); document.removeEventListener('keydown', esc, true); };
  const out = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
  const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  setTimeout(() => { document.addEventListener('mousedown', out, true); document.addEventListener('keydown', esc, true); });
  Promise.resolve(build(close)).then((c) => { if (pop.isConnected) { pop.replaceChildren(...[c].flat().filter(Boolean)); place(); } }).catch((x) => pop.replaceChildren(h('p', { class: 'err' }, x.message)));
  return pop;
}
const cellBtn = (content, title, onOpen) => h('button', { type: 'button', class: 'cellbtn', title, onclick: (e) => { e.stopPropagation(); onOpen(e.currentTarget); } }, content);

/** The phase colour and one label for every job, so all tabs read the same way. */
function standing(r) {
  const won = r.outcome && !cfg('tracking.loss_outcomes', []).includes(r.outcome);
  const info = STAGE_INFO[r.stage] || [0, r.stage];
  if (r.stage === 'screening' || r.stage === 'writing') return { tone: 'busy', label: info[1], detail: 'The AI is working', bar: r.stage === 'writing' ? 3.5 / 5 : 0 };
  if (info[0]) return { tone: 'inprog', label: info[1], detail: `In progress · Step ${info[0]} of ${IN_PROGRESS_STEPS}`, bar: info[0] / IN_PROGRESS_STEPS };
  if (r.stage === 'submitted') return { tone: 'submitted', label: r.current_status || 'Sent', detail: 'Submitted' + (r.status_at ? ' · ' + ago(r.status_at) : ''), bar: 1 };
  if (r.stage === 'closed') return { tone: won ? 'won' : 'lost', label: r.outcome, detail: 'Closed' + (r.days_to_close != null ? ` · ${r.days_to_close} d after sending` : ''), bar: 1 };
  if (r.stage === 'failed') return { tone: 'off', label: 'Screening failed', detail: 'Not pursued', bar: 1 };
  return { tone: 'off', label: 'Skipped', detail: 'Not pursued', bar: 1 };
}
function standsCell(r) {
  const x = standing(r);
  return cellBtn(h('div', { class: 'stand ' + x.tone },
    h('div', { class: 'l1' }, x.tone === 'busy' ? h('span', { class: 'spin' }) : h('i', { class: 'dot' }), h('strong', {}, x.label)),
    h('div', { class: 'l2' }, x.detail), h('div', { class: 'bar' }, h('i', { style: `width:${Math.round(x.bar * 100)}%` }))),
  'Where this job stands: click for its journey', (a) => popover(a, () => journeyPanel(r)));
}
/** The job's journey so far: every step with its date, from the timeline. */
async function journeyPanel(r) {
  const { events } = await api('GET', `/screenings/${r.id}/timeline`);
  const steps = events.filter((e) => e.kind === 'step' || e.kind === 'error');
  const x = standing(r);
  return [h('div', { class: 'pop-head' }, h('strong', {}, x.label), h('span', { class: 'small muted' }, x.detail)),
    h('ol', { class: 'tl compact' }, steps.map((e) => h('li', { class: 'tl-' + e.kind }, h('span', { class: 'when', title: full(e.at) }, shortDate(e.at)),
      h('div', {}, h('span', {}, e.what), e.who ? h('span', { class: 'muted' }, ' · ' + e.who) : null, e.detail ? h('div', { class: 'small muted' }, e.detail) : null)))),
    h('a', { class: 'btn sm', href: '#/s/' + r.id, style: 'margin-top:8px' }, 'Open job')];
}
const shortDate = (s) => { const d = toDate(s); return d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: TZ }) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : ''; };

/** The gate result: a quiet badge, the rule codes as chips (three, then "+N"), and the details on click. */
function resultCell(r) {
  if (!r.verdict) return verdictPill(r.verdict, r.status);
  const codes = (r.rule_codes || '').split(/\s*,\s*/).filter(Boolean);
  const content = h('div', { class: 'result' }, verdictBadge(r.verdict),
    codes.length ? h('span', { class: 'codes' }, codes.slice(0, 2).map((c) => h('span', { class: 'code ' + (c[0] === 'F' ? 'F' : 'G') }, c)), codes.length > 2 ? h('span', { class: 'code more' }, '+' + (codes.length - 2)) : null) : null); // R93: two, then +N (every one is in the popover)
  return codes.length ? cellBtn(content, 'See each rule and the value behind it', (a) => popover(a, () => flagsPanel(r))) : content;
}
async function flagsPanel(r) {
  const d = await api('GET', `/screenings/${r.id}/flags`);
  const item = (x, kind) => h('li', { class: kind }, h('div', {}, h('span', { class: 'code ' + (kind === 'fail' ? 'F' : 'G') }, x.code), ' ', h('strong', {}, x.rule)), x.value ? h('div', { class: 'small muted' }, cap(x.value)) : null);
  return [h('div', { class: 'pop-head' }, verdictBadge(d.verdict),
      h('span', { class: 'small muted' }, `${d.fails.length} fail rule${d.fails.length === 1 ? '' : 's'} · ${d.flags.length} flag${d.flags.length === 1 ? '' : 's'}`)),
    h('ul', { class: 'flaglist' }, d.fails.map((x) => item(x, 'fail')), d.flags.map((x) => item(x, 'flag'))),
    h('a', { class: 'btn sm', href: '#/s/' + r.id, style: 'margin-top:8px' }, 'Open job')];
}
/** Submitted jobs: Sent, Viewed, Chat opened, Interview as a strip, each with its date on hover. */
function journeyStrip(r) {
  const steps = [['Sent', r.proposal_sent_at || r.proposal_sent_date], ['Viewed', r.client_viewed === 'yes' && (r.client_viewed_at || true)],
    ['Chat', r.client_replied === 'yes' && (r.client_replied_at || true)], ['Interview', r.interviewed === 'yes' && (r.interviewed_at || true)]];
  return h('div', { class: 'strip' }, steps.map(([label, at], i) => [i ? h('span', { class: 'link' + (at ? ' on' : '') }) : null,
    h('span', { class: 'ms' + (at ? ' on' : ''), title: at ? `${label}${typeof at === 'string' ? ': ' + full(at) : ''}` : `${label}: not yet` }, h('i', {}), label)]));
}
function outcomeCell(r) {
  if (!r.outcome) return '';
  const won = !cfg('tracking.loss_outcomes', []).includes(r.outcome);
  return h('div', { class: 'outc' }, h('span', { class: 'obadge ' + (won ? 'won' : 'lost') }, r.outcome), r.outcome_reason ? h('div', { class: 'small muted' }, r.outcome_reason) : null);
}
const whyNot = (r) => (r.stage === 'failed' ? cap(r.error_message || 'The screening did not finish') : r.stage === 'skipped' ? skipWhy(r) : '');
/** Why a job was skipped: the quick reason and the note, or the older free notes. */
function skipWhy(r) { return [r.skip_reason, r.skip_note].filter(Boolean).join('. ') || cap(r.notes || 'Skipped after screening'); }

/** Every column the Jobs list can show, and which ones each tab starts with. */
const JOB_COLS = [
  { key: 'progress', label: 'Where it stands', sort: 'stage', cell: (r) => standsCell(r) },
  { key: 'journey', label: 'On Upwork', cell: (r) => journeyStrip(r) },
  { key: 'why', label: 'Why not pursued', cell: (r) => clip(whyNot(r), 260) },
  { key: 'status', label: 'Status', sort: 'quiet', cell: (r) => [r.current_status ? h('span', { class: 'chip brand' }, r.current_status) : h('span', { class: 'faint small' }, 'Not sent'), r.status_at ? h('div', { class: 'meta', title: full(r.status_at) }, ago(r.status_at)) : null] },
  { key: 'since', label: 'Last update', sort: 'quiet', cell: (r) => (r.days_since_update == null ? '' : h('span', { class: r.stage === 'submitted' && r.days_since_update >= cfg('tracking.quiet_days', 5) ? 'quiet' : 'muted' }, r.days_since_update === 0 ? 'Today' : `${r.days_since_update} d ago`)) },
  { key: 'verdict', label: 'Result', sort: 'verdict', cell: (r) => resultCell(r) },
  { key: 'country', label: 'Client', sort: 'country', cell: (r) => clip(r.client_country, 110) },
  { key: 'budget', label: 'Budget', cell: (r) => [clip(r.budget, 190), r.job_type ? h('div', { class: 'meta' }, r.job_type) : null] },
  { key: 'hire_rate', label: 'Hire rate', sort: 'hire_rate', cell: (r) => clip(r.hire_rate, 120) },
  { key: 'profile', label: 'Profile', sort: 'profile', cell: (r) => clip(r.profile_name, 110) },
  { key: 'user', label: 'By', sort: 'user', cell: (r) => r.user_name },
  { key: 'template', label: 'Template', cell: (r) => clip(r.template_name, 180) },
  { key: 'sent', label: 'Sent', cell: (r) => (r.proposal_sent_at || r.proposal_sent_date ? h('span', { title: full(r.proposal_sent_at || r.proposal_sent_date) }, dayText(r.proposal_sent_at || r.proposal_sent_date)) : '') },
  { key: 'connects', label: 'Connects', cell: (r) => (r.connects_spent != null ? r.connects_spent + (r.boost_connects ? ' + ' + r.boost_connects : '') : '') },
  { key: 'response', label: 'Viewed / chat / interview', cell: (r) => [yn(r.client_viewed), yn(r.client_replied), yn(r.interviewed)].map((v) => v || '-').join(' / ') },
  { key: 'outcome', label: 'Outcome', sort: 'outcome', cell: (r) => outcomeCell(r) },
  { key: 'reason', label: 'Why lost', cell: (r) => clip(r.outcome_reason, 180) },
  { key: 'close', label: 'Sent to close', cell: (r) => (r.days_to_close == null ? '' : r.days_to_close === 0 ? 'Same day' : `${r.days_to_close} d`) },
  { key: 'time', label: 'To proposal', sort: 'time', cell: (r) => mins(r.secs_to_proposal) },
  { key: 'created', label: 'Screened', sort: 'created', cell: (r) => h('span', { class: 'muted', title: full(r.created_at) }, ago(r.created_at)) },
];
/** The tabs: each is a phase, with its own starting columns, stage filter and counter tile. */
const JOB_TABS = [
  { key: '', label: 'All', cols: ['progress', 'verdict', 'country', 'profile', 'user', 'created'] },
  { key: 'in_progress', label: 'In progress', cols: ['progress', 'verdict', 'country', 'budget', 'profile', 'user', 'created'], stages: ['decide', 'projects', 'profile', 'type', 'review', 'ready', 'screening', 'writing'], need: true },
  { key: 'submitted', label: 'Submitted', cols: ['progress', 'journey', 'since', 'sent', 'connects', 'profile', 'user'], quiet: true },
  { key: 'closed', label: 'Closed', cols: ['outcome', 'close', 'sent', 'verdict', 'profile', 'user', 'country'] },
  { key: 'not_pursued', label: 'Not pursued', cols: ['progress', 'why', 'verdict', 'country', 'budget', 'user', 'created'], stages: ['skipped', 'failed'] },
];
/** A tab's columns as this person keeps them (R85): which are shown, in their order. Kept with their account; the tab's own set until
 *  they change it (a choice kept in this browser before R85 is taken over once). */
const colsKey = (tab) => 'jobs_cols.' + (tab || 'all');
const tabCols = (tab) => (JOB_TABS.find((t) => t.key === tab) || JOB_TABS[0]).cols;
function savedCols(tab) {
  const known = new Set(JOB_COLS.map((c) => c.key));
  const mine = me && me.prefs && me.prefs[colsKey(tab)];
  if (Array.isArray(mine)) return mine.filter((k) => known.has(k));
  try { const v = JSON.parse(localStorage.getItem('jobs.cols2.' + (tab || 'all')) || 'null'); if (Array.isArray(v)) { const order = tabCols(tab); return [...order.filter((k) => v.includes(k)), ...v.filter((k) => !order.includes(k) && known.has(k))]; } } catch { /* storage blocked */ }
  return [...tabCols(tab)];
}
async function saveCols(tab, cols) {
  const value = cols ? [...cols] : null;
  const r = await api('PUT', '/me/prefs', { key: colsKey(tab), value });
  me.prefs = r.prefs;
  try { localStorage.removeItem('jobs.cols2.' + (tab || 'all')); } catch { /* storage blocked */ }
}
const NEEDS_ACTION_STAGES = ['decide', 'projects', 'profile', 'type', 'review', 'ready'];
/** What the person does next, as a button label, for each step that waits on them. */
const NEXT_ACTION = { decide: 'Decide', projects: 'Pick projects', profile: 'Pick profile', type: 'Pick proposal type', review: 'Review proposal', ready: 'Mark as sent' };
/** The workflow step a stage opens at. */
const STEP_OF_STAGE = { decide: 1, projects: 2, profile: 3, type: 4, review: 4 };
/** Where a job link goes: a job waiting on you opens the workflow at its step, anything else the job page. Same rule everywhere. */
const jobHref = (r) => (r.user_id === me.id && TAB_OF_STAGE[r.stage] ? `#/s/${r.id}/${TAB_OF_STAGE[r.stage]}` : '#/s/' + r.id);
/** R117: the part of a report line a number stands for. */
const RPART = { continued: 'continued', written: 'with a proposal written', sent: 'sent', viewed: 'viewed', chat: 'with a chat opened', interview: 'interviewed', hired: 'hired', lost: 'lost' };
/**
 * R119 (Hamza): a report line opens the Jobs list with real filters wherever the list has one for it (the profile, the person, the type,
 * the project, the rule...), so the dropdowns show them and can be changed; the part clicked (sent, viewed, hired...) becomes "Got as far
 * as". Null when the list has no filter for it (a signal, a review score, a speed...): then the exact jobs are opened instead (rdim).
 */
const DIRECT = { profile: (k) => (k === 'none' ? null : { profile: k }), person: (k) => ({ user: k }), type: (k) => ({ ptype: k }), project: (k) => ({ project: k }),
  industry: (k) => ({ industry: k }), tag: (k) => ({ tag: k }), rule: (k) => ({ rule: k }), verdict: (k) => ({ v: k }), source: (k) => ({ source: k }), loom: (k) => ({ loom: k }),
  mode: (k) => ({ auto: k === 'auto' ? 'yes' : 'no' }), documents: (k) => ({ docs: k }), invite: (k) => ({ invite: k === 'invite' ? 'yes' : 'no' }), outcome: (k) => ({ outcome: k }), funnel: () => ({}) };
const SENT_BASIS = new Set(['loom', 'invite', 'outcome', 'boost', 'connects', 'loom_video', 'sent_weekday', 'sent_time', 'loss_reason', 'opening']);
function directFilters(dim, key, part = 'all') {
  const f = DIRECT[dim] ? DIRECT[dim](String(key)) : null;
  if (!f || part === 'lost') return null;
  // a report of sent proposals counts only sent ones: there, all, continued and written all mean sent
  const reached = SENT_BASIS.has(dim) && ['all', 'continued', 'written'].includes(part) ? 'sent' : part !== 'all' ? part : '';
  return { ...f, ...(reached ? { reached } : {}) };
}
const FILTER_KEYS = ['v', 'q', 'mine', 'from', 'to', 'rule', 'profile', 'user', 'outcome', 'stage', 'tab', 'ptype', 'source', 'tag', 'project', 'loom', 'sent_from', 'sent_to', 'invite', 'client', 'rdim', 'rkey', 'rpart', 'rlabel', 'job_type', 'country', 'auto', 'docs', 'reached', 'industry', 'discarded'];
/** The list's filters as API query parameters (the export uses the same ones). */
function jobQuery(st) {
  const qs = new URLSearchParams();
  const map = { v: 'verdict', q: 'q', from: 'from', to: 'to', rule: 'rule', profile: 'profile', user: 'user', outcome: 'outcome', stage: 'stage', tab: 'phase', ptype: 'ptype', source: 'source', tag: 'tag', project: 'project', loom: 'loom', sent_from: 'sent_from', sent_to: 'sent_to', invite: 'invite', client: 'client', rdim: 'rdim', rkey: 'rkey', rpart: 'rpart', job_type: 'job_type', country: 'country', auto: 'auto', docs: 'docs', reached: 'reached', industry: 'industry', discarded: 'discarded' };
  for (const [k, api] of Object.entries(map)) if (st[k]) qs.set(api, st[k]);
  if (st.mine) qs.set('mine', '1');
  return qs;
}
/** Discard a job (admins): asks first, with an optional reason. It leaves every list, count and report; Restore brings it back. */
function discardJob(id, title, after) {
  const why = h('input', { type: 'text', id: 'dwhy', maxlength: 300, placeholder: 'For example: a test job' });
  modal({ title: 'Discard this job?', confirm: 'Discard job', danger: true, body: h('div', {},
    h('p', { class: 'muted', style: 'margin-top:0' }, `"${title}" will disappear from the Jobs list, the Dashboard, Reports, exports and Claude, for everyone. Nothing is deleted: an admin can restore it from Jobs, Discarded jobs.`),
    h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'dwhy' }, 'Why (optional)'), why)),
    onConfirm: async () => { await api('POST', `/admin/screenings/${id}/discard`, { reason: why.value.trim() || undefined }); toast('Job discarded'); if (after) await after(); } });
}
async function restoreJob(id, after) { try { await api('POST', `/admin/screenings/${id}/restore`, {}); toast('Job restored'); if (after) await after(); } catch (x) { toast(x.message, true); } }

/** The one action a row offers, by where the job stands. */
function rowAction(r, reload) {
  if (r.discarded_at) return me.role === 'admin' ? h('button', { class: 'btn sm', type: 'button', onclick: (e) => { e.stopPropagation(); restoreJob(r.id, reload); } }, 'Restore') : null;
  if (r.status !== 'done' || !canTrack(r.user_id)) return null;
  const stop = (e) => e.stopPropagation();
  if (STEP_OF_STAGE[r.stage] && r.user_id === me.id) return h('a', { class: 'btn sm', href: jobHref(r), onclick: stop }, NEXT_ACTION[r.stage]);
  if (r.stage === 'ready') return h('button', { class: 'btn sm primary', type: 'button', onclick: (e) => { stop(e); statusDialog(r.id, reload, r.invite); } }, 'Mark as sent');
  if (r.stage === 'submitted' || r.stage === 'closed') return h('button', { class: 'btn sm', type: 'button', onclick: (e) => { stop(e); statusDialog(r.id, reload); } }, 'Update status');
  return null;
}

async function historyView() {
  const hp = hashParams();
  const st = Object.fromEntries(FILTER_KEYS.map((k) => [k, hp[k] || '']));
  if (!JOB_TABS.some((t) => t.key === st.tab)) st.tab = '';
  st.mine = hp.mine === '1'; st.page = Math.max(1, Number(hp.page) || 1); st.sort = hp.sort || 'created'; st.dir = hp.dir === 'asc' ? 'asc' : 'desc';
  let stats = { total: 0, PASS: 0, FLAG: 0, FAIL: 0, overridden: 0, needs_action: 0, quiet: 0, tabs: {} };
  const opts = await api('GET', '/screenings/filter-options');
  const tab = () => JOB_TABS.find((t) => t.key === st.tab) || JOB_TABS[0];
  let cols = savedCols(st.tab);
  const tabsEl = h('div', { class: 'jobtabs', role: 'tablist' }), statsEl = h('div', { class: 'stats' }), bodyEl = h('div', {}), filters = h('div', {});
  const listActs = h('div', { class: 'jobacts' }); // R118: Columns, Export and Select to discard, beside the tabs
  let fbar = null;

  // R129: the filters that are lists pick several (any of them); yes or no, two-way and "got as far as" stay one choice
  const sel = (key, label, options) => {
    const multi = key !== 'discarded'; // every filter picks several; live or discarded is a switch
    const el = h('select', { 'aria-label': label, class: 'fsel', multiple: multi || null }, h('option', { value: '' }, label), options.map(([v, l]) => h('option', { value: v, selected: multi ? isOn(st[key], v) : String(st[key]) === String(v) }, l)));
    el.onchange = () => { st[key] = el.value; st.page = 1; load(); };
    return el;
  };
  const dateIn = (key, label) => dateField(label, st[key], (v) => { st[key] = v; st.page = 1; load(); });
  const searchIn = h('input', { type: 'search', placeholder: 'Search jobs', 'aria-label': 'Search jobs', title: 'Search by job, client country, person, profile, rule or link', value: st.q });
  searchIn.oninput = debounce(() => { st.q = searchIn.value.trim(); st.page = 1; load().catch((x) => toast(x.message, true)); }, 300);
  const mineBox = h('input', { type: 'checkbox', id: 'mine', checked: st.mine }); mineBox.onchange = () => { st.mine = mineBox.checked; st.page = 1; load(); };
  const outcomes = [...new Set([...outcomeList(), ...opts.outcomes])];
  const colBtn = h('button', { class: 'btn', type: 'button' }, 'Columns');
  // R94 (Ahmad): the main admin can pick many jobs and discard them at once (the first jobs were all tests). Nothing is deleted:
  // each one is discarded as it would be alone, and can be restored from the Discarded jobs view.
  let picking = false; const picked = new Set();
  const pickBtn = me.main_admin ? h('button', { class: 'btn', type: 'button' }, 'Select to discard') : null;
  if (pickBtn) pickBtn.onclick = () => { picking = !picking; picked.clear(); pickBtn.replaceChildren(picking ? 'Stop selecting' : 'Select to discard'); pickBtn.classList.toggle('on', picking); load(); };
  function discardPicked() {
    const ids = [...picked], reason = h('input', { type: 'text', id: 'dmr', maxlength: 300, value: 'Test job' });
    modal({ title: `Discard ${ids.length} job${ids.length === 1 ? '' : 's'}?`, confirm: `Discard ${ids.length} job${ids.length === 1 ? '' : 's'}`, danger: true,
      body: h('div', { class: 'stack', style: 'gap:12px' },
        h('p', { class: 'muted', style: 'margin:0' }, 'They leave every list, count, report and export, and Claude no longer sees them. Nothing is deleted: each one can be restored from Live jobs, Discarded jobs.'),
        h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'dmr' }, 'Reason (optional)'), reason)),
      onConfirm: async () => {
        const r = await api('POST', '/admin/screenings/discard-many', { ids, reason: reason.value.trim() || undefined });
        toast(`${r.discarded} job${r.discarded === 1 ? '' : 's'} discarded${r.skipped ? ` (${r.skipped} already were)` : ''}`);
        picked.clear(); picking = false; if (pickBtn) { pickBtn.replaceChildren('Select to discard'); pickBtn.classList.remove('on'); } load();
      } });
  }
  // the columns of this tab, the person's own (R85): drag (or the arrows) to order, Hide and Show; saved at once, for them alone
  colBtn.onclick = () => {
    const shownEl = h('ol', { class: 'colorder' }), hiddenEl = h('div', { class: 'colhidden' });
    let dragFrom = null;
    const commit = async () => { draw(); try { await saveCols(st.tab, cols); } catch (x) { toast(x.message, true); } load(); };
    const move = (i, j) => { if (j < 0 || j >= cols.length) return; const [k] = cols.splice(i, 1); cols.splice(j, 0, k); commit(); };
    const label = (k) => (JOB_COLS.find((c) => c.key === k) || {}).label || k;
    const draw = () => {
      shownEl.replaceChildren(...cols.map((k, i) => {
        const li = h('li', { class: 'colitem', draggable: 'true' }, h('span', { class: 'colgrip', title: 'Drag to move', 'aria-hidden': 'true' }, '⋮⋮'), h('span', { class: 'colname' }, label(k)),
          h('span', { class: 'row', style: 'gap:4px' },
            h('button', { type: 'button', class: 'btn sm', 'aria-label': `Move ${label(k)} up`, disabled: i === 0, onclick: () => move(i, i - 1) }, '↑'),
            h('button', { type: 'button', class: 'btn sm', 'aria-label': `Move ${label(k)} down`, disabled: i === cols.length - 1, onclick: () => move(i, i + 1) }, '↓'),
            h('button', { type: 'button', class: 'btn sm', disabled: cols.length === 1, onclick: () => { cols.splice(i, 1); commit(); } }, 'Hide')));
        li.addEventListener('dragstart', (e) => { dragFrom = i; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
        li.addEventListener('dragend', () => { li.classList.remove('dragging'); shownEl.querySelectorAll('.over').forEach((x) => x.classList.remove('over')); });
        li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('over'); });
        li.addEventListener('dragleave', () => li.classList.remove('over'));
        li.addEventListener('drop', (e) => { e.preventDefault(); if (dragFrom != null && dragFrom !== i) move(dragFrom, i); dragFrom = null; });
        return li;
      }));
      const rest = JOB_COLS.filter((c) => !cols.includes(c.key));
      hiddenEl.replaceChildren(...(rest.length ? rest.map((c) => h('button', { type: 'button', class: 'chip qchip', onclick: () => { cols.push(c.key); commit(); } }, '+ ' + c.label)) : [h('span', { class: 'faint small' }, 'Every column is shown.')]));
    };
    draw();
    modal({ title: `Columns in ${tab().label}`, noConfirm: true, body: h('div', { class: 'stack', style: 'gap:12px' },
      h('p', { class: 'jp-label', style: 'margin:0' }, 'Drag a column by its handle, or use the arrows, to put it where you want it. You can also drag a column header in the table itself. Your order is kept for you alone, on every device.'),
      shownEl, h('div', {}, h('div', { class: 'lbl', style: 'margin-bottom:6px' }, 'Hidden columns'), hiddenEl)),
      extra: () => h('button', { type: 'button', class: 'linkbtn', onclick: async () => { cols = [...tabCols(st.tab)]; draw(); try { await saveCols(st.tab, null); } catch (x) { toast(x.message, true); } load(); } }, 'Reset to default') });
  };
  const clearBtn = h('button', { class: 'btn', type: 'button', onclick: () => { location.hash = '#/history' + (st.tab ? '?tab=' + st.tab : ''); route(); } }, 'Clear filters');
  // the export uses the filters on screen, so "last month's lost jobs" is two clicks
  const exportBtn = h('button', { class: 'btn', type: 'button' }, icon('doc'), 'Export');
  exportBtn.onclick = () => {
    const qs = jobQuery(st); qs.set('sort', st.sort); qs.set('dir', st.dir);
    const n = st.v ? st.v.split('|').reduce((a, v) => a + (stats[v] || 0), 0) : stats.total; // the counters ignore the verdict, so add up its own counts
    const link = (fmt, text) => h('a', { class: 'btn' + (fmt === 'xlsx' ? ' primary' : ''), href: `/api/screenings/export?format=${fmt}&${qs}`, download: '' }, text);
    modal({ title: 'Export jobs', noConfirm: true, body: h('div', {},
      h('p', { class: 'muted', style: 'margin-top:0' }, `Exports the ${n.toLocaleString()} job${n === 1 ? '' : 's'} on screen (${tab().label}${st.v ? ', ' + st.v.split('|').join(' or ') + ' only' : ''}, with the filters): the job post, the gate result, the decision, projects, profile, the final proposal, every status with its date and reason, and the full change history.`),
      h('div', { class: 'row', style: 'margin-top:16px;gap:8px' }, link('xlsx', 'Excel (.xlsx)'), link('csv', 'CSV'))) });
  };
  /**
   * R118 (Hamza): the filters, cleaner. One row: search, the date, profile, person, and the step or outcome of the tab. Every other filter
   * is under "More filters", in groups. The active ones are chips under the bar, each with its own x, and Clear all.
   */
  const ymdOf = (d) => ymd(d);
  const DATES = [['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90d', 'Last 90 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['custom', 'Choose dates\u2026']];
  const rangeOf = (k) => { if (k === 'lastmonth') { const n = new Date(); return { from: ymdOf(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: ymdOf(new Date(n.getFullYear(), n.getMonth(), 0)) }; } return periodRange(k); };
  let customDates = false;
  const dateKey = () => { if (!st.from && !st.to) return customDates ? 'custom' : ''; const hit = DATES.find(([k]) => k !== 'custom' && rangeOf(k).from === st.from && rangeOf(k).to === st.to); return hit ? hit[0] : 'custom'; };
  const FDEF = () => [
    { group: 'Screening', key: 'v', label: 'Gate result', opts: [['PASS', 'Pass'], ['FLAG', 'Flag'], ['FAIL', 'Fail']] },
    { group: 'Screening', key: 'rule', label: 'Rule fired', opts: opts.rules.map((r) => [r.code, `${r.code}  ${r.rule}`]), short: (v) => v },
    { group: 'Proposal', key: 'ptype', label: 'Proposal type', opts: (opts.types || []).map((x) => [x, x]) },
    { group: 'Proposal', key: 'source', label: 'Written in', opts: [['app', 'Upwork Pro'], ['claude_plugin', 'The Claude plugin']] },
    { group: 'Proposal', key: 'project', label: 'Project shown', opts: (opts.projects || []).map((x) => [x, x]) },
    { group: 'Proposal', key: 'loom', label: 'Loom video', opts: [['yes', 'With a Loom video'], ['no', 'Without a video']] },
    { group: 'Proposal', key: 'auto', label: 'Auto mode', opts: [['yes', 'Written in auto mode'], ['no', 'Step by step']] },
    { group: 'Client and job', key: 'client', label: 'Returning client', opts: [...(opts.clients || []).map((c) => [c.id, `${clientId(c.id)}${c.name ? ' \u00b7 ' + c.name : ''} \u00b7 ${c.jobs} jobs`]),
      ...(st.client && !(opts.clients || []).some((c) => String(c.id) === String(st.client)) ? [[st.client, clientId(st.client)]] : [])], short: (v) => clientId(v) },
    { group: 'Client and job', key: 'industry', label: 'Industry', opts: (opts.industries || []).map((x) => [x, x]) },
    { group: 'Client and job', key: 'tag', label: 'Job tag', opts: (opts.tags || []).map((t) => [t.name, `${t.name} (${t.category})`]), short: (v) => v },
    { group: 'Client and job', key: 'country', label: 'Client country', opts: (opts.countries || []).map((x) => [x, x]) },
    { group: 'Client and job', key: 'job_type', label: 'Job type', opts: [['hourly', 'Hourly'], ['fixed', 'Fixed price']] },
    { group: 'Client and job', key: 'docs', label: 'Client files', opts: [['yes', 'With attached files'], ['no', 'No files']] },
    { group: 'Upwork', key: 'invite', label: 'Proposals or invites', opts: [['no', 'Proposals only'], ['yes', 'Invites only']] },
    { group: 'Upwork', key: 'reached', label: 'Got as far as', opts: [['continued', 'Continued'], ['written', 'Proposal written'], ['sent', 'Sent'], ['viewed', 'Viewed'], ['chat', 'Chat opened'], ['interview', 'Interview'], ['hired', 'Hired']] },
    { group: 'Upwork', key: 'outcome', label: 'Outcome', opts: [['none', 'No outcome yet'], ...outcomes.map((o) => [o, o])] },
    ...(me.role === 'admin' ? [{ group: 'Upwork', key: 'discarded', label: 'Live or discarded', any: 'Live jobs', opts: [['1', 'Discarded jobs']] }] : []),
  ];
  const named1 = (f, v) => { const o = f.opts.find(([k]) => String(k) === String(v)); return f.short ? f.short(v) : o ? o[1] : v; };
  const named = (f, v) => String(v).split('|').map((x) => named1(f, x)).join(', ');
  let moreOpen = false; try { moreOpen = localStorage.getItem('jobs.more') === '1'; } catch { /* storage blocked */ }
  function drawFilters() {
    const t = tab();
    const stageOpts = t.stages ? [...(t.need ? [['needs_action', 'Needs action']] : []), ...t.stages.map((x) => [x, STAGE_INFO[x][1]])] : t.quiet ? [['quiet', 'Gone quiet']] : null;
    // the date of screening: a preset, or two dates
    const dsel = h('select', { 'aria-label': 'Screened', class: 'fsel', 'data-plain': true }, h('option', { value: '' }, 'Any date'), DATES.map(([k, l]) => h('option', { value: k, selected: dateKey() === k }, l)));
    dsel.onchange = () => { const k = dsel.value; if (k === 'custom') { customDates = true; drawFilters(); return; } customDates = false; const r = k ? rangeOf(k) : {}; st.from = r.from || ''; st.to = r.to || ''; st.page = 1; drawFilters(); load(); };
    const custom = dateKey() === 'custom' ? h('span', { class: 'fb-dates' }, dateIn('from', 'From'), dateIn('to', 'To')) : null;
    const defs = FDEF(), main = new Set(['outcome']);
    const moreKeys = defs.filter((f) => !(main.has(f.key) && (t.key === 'closed' || t.key === 'submitted' || !t.key))).map((f) => f.key);
    const moreN = moreKeys.filter((k) => st[k]).length + (st.sent_from || st.sent_to ? 1 : 0) + (st.mine ? 1 : 0);
    const moreBtn = h('button', { type: 'button', class: 'btn' + (moreOpen ? ' on' : ''), 'aria-expanded': String(moreOpen), onclick: () => { moreOpen = !moreOpen; try { localStorage.setItem('jobs.more', moreOpen ? '1' : '0'); } catch { /* storage blocked */ } drawFilters(); } },
      icon('funnel'), 'More filters', h('span', { class: 'fb-n', hidden: !moreN }, String(moreN)));
    const row = h('div', { class: 'fb-row' },
      h('div', { class: 'search' }, icon('search'), searchIn), dsel, custom,
      sel('profile', 'Any profile', opts.profiles.map((p) => [p.id, p.name])),
      opts.users.length ? sel('user', 'Anyone', opts.users.map((u) => [u.id, u.name])) : null,
      stageOpts ? sel('stage', t.key === 'in_progress' ? 'Any step' : t.quiet ? 'Any submitted' : 'Skipped or failed', stageOpts) : null,
      t.key === 'closed' || t.key === 'submitted' || !t.key ? sel('outcome', 'Any outcome', defs.find((f) => f.key === 'outcome').opts) : null,
      moreBtn);
    listActs.replaceChildren(...[st.discarded ? null : pickBtn, colBtn, exportBtn].filter(Boolean));
    // More filters: every other filter, in groups, each with its name above it
    const groups = [...new Set(defs.map((f) => f.group))];
    const field = (f) => h('label', { class: 'fb-field' }, h('span', { class: 'fb-lbl' }, f.label), sel(f.key, f.any || 'Any', f.opts));
    const more = moreOpen ? h('div', { class: 'fb-more' },
      groups.map((g) => h('div', { class: 'fb-group' }, h('div', { class: 'fb-gtitle' }, g), defs.filter((f) => f.group === g && moreKeys.includes(f.key)).map(field),
        g === 'Upwork' ? h('div', { class: 'fb-field' }, h('span', { class: 'fb-lbl' }, 'Sent between'), h('span', { class: 'fb-dates' }, dateIn('sent_from', 'From'), dateIn('sent_to', 'To'))) : null)),
      me.role !== 'employee' ? h('div', { class: 'fb-group' }, h('div', { class: 'fb-gtitle' }, 'People'), h('label', { class: 'check', for: 'mine' }, mineBox, 'Only my jobs')) : null) : null;
    fbar = h('div', { class: 'jobfilters' }, row, more, activeChips());
    fbar.setActive = () => {};
    filters.replaceChildren(fbar);
  }
  function refreshChips() {
    if (!fbar) return;
    const old = fbar.querySelector('.fb-chips'), c = activeChips();
    if (old) old.replaceWith(c || document.createComment('')); else if (c) fbar.append(c);
    const n = FDEF().filter((f) => st[f.key] && !(f.key === 'outcome' && (tab().key === 'closed' || tab().key === 'submitted' || !tab().key))).length + (st.sent_from || st.sent_to ? 1 : 0) + (st.mine ? 1 : 0);
    const badge = fbar.querySelector('.fb-n'); if (badge) { badge.textContent = String(n); badge.hidden = !n; }
  }
  /** The filters in use, as chips: each one's x takes it off; Clear all takes them all off (the tab stays). */
  function activeChips() {
    const defs = FDEF(), chips = [];
    const add = (label, clear) => chips.push(h('button', { type: 'button', class: 'chip fb-chip', title: 'Remove this filter', onclick: () => { clear(); st.page = 1; drawFilters(); load(); } }, label, h('span', { 'aria-hidden': 'true' }, ' \u00d7')));
    if (st.q) add(`Search: ${st.q}`, () => { st.q = ''; searchIn.value = ''; });
    if (st.from || st.to) add(`Screened: ${(DATES.find(([k]) => k === dateKey()) || [])[1] && dateKey() !== 'custom' ? DATES.find(([k]) => k === dateKey())[1] : `${st.from ? dayText(st.from) : '\u2026'} to ${st.to ? dayText(st.to) : '\u2026'}`}`, () => { st.from = ''; st.to = ''; customDates = false; });
    const each = (v, name) => String(v).split('|').map(name).join(', ');
    if (st.profile) add(`Profile: ${each(st.profile, (x) => (opts.profiles.find((p) => String(p.id) === x) || {}).name || x)}`, () => { st.profile = ''; });
    if (st.user) add(`Person: ${each(st.user, (x) => (opts.users.find((u) => String(u.id) === x) || {}).name || x)}`, () => { st.user = ''; });
    if (st.stage) add(`Step: ${each(st.stage, (x) => (x === 'needs_action' ? 'Needs action' : x === 'quiet' ? 'Gone quiet' : (STAGE_INFO[x] || [])[1] || x))}`, () => { st.stage = ''; });
    for (const f of defs) if (st[f.key]) add(`${f.label}: ${named(f, st[f.key])}`, () => { st[f.key] = ''; });
    if (st.sent_from || st.sent_to) add(`Sent: ${st.sent_from ? dayText(st.sent_from) : '\u2026'} to ${st.sent_to ? dayText(st.sent_to) : '\u2026'}`, () => { st.sent_from = ''; st.sent_to = ''; });
    if (st.mine) add('Only my jobs', () => { st.mine = false; mineBox.checked = false; });
    if (!chips.length) return null;
    return h('div', { class: 'fb-chips' }, h('span', { class: 'jp-label' }, 'Filtered by'), chips,
      h('button', { type: 'button', class: 'linkbtn small', onclick: () => { location.hash = '#/history' + (st.tab ? '?tab=' + st.tab : ''); route(); } }, 'Clear all'));
  }
  function drawTabs() {
    const total = Object.values(stats.tabs || {}).reduce((a, b) => a + b, 0);
    tabsEl.replaceChildren(...JOB_TABS.map((t) => h('button', { type: 'button', role: 'tab', 'aria-selected': st.tab === t.key, class: st.tab === t.key ? 'on' : '',
      onclick: () => { if (st.tab === t.key) return; st.tab = t.key; st.stage = ''; st.outcome = t.key === 'in_progress' || t.key === 'not_pursued' ? '' : st.outcome; st.page = 1; cols = savedCols(st.tab); drawFilters(); load(); } },
      t.label, h('span', { class: 'n' }, String(t.key ? stats.tabs[t.key] || 0 : total)))));
  }
  const tile = (key, label, value, onClick, on) => h('button', { class: `stat ${key} ${on ? 'on' : ''}`, onclick: onClick }, h('span', { class: 'k' }, label), h('span', { class: 'v' }, value));
  const setV = (v) => () => { const on = st.v ? st.v.split('|') : []; st.v = (on.includes(v) ? on.filter((x) => x !== v) : [...on, v]).join('|'); st.page = 1; load(); }; // R129: tiles add up
  function drawStats() {
    const t = tab();
    const extra = t.need ? tile('NEED', 'Needs action', stats.needs_action, () => { st.stage = st.stage === 'needs_action' ? '' : 'needs_action'; st.page = 1; drawFilters(); load(); }, st.stage === 'needs_action')
      : t.quiet ? tile('QUIET', `Gone quiet (${stats.quiet_days}+ days)`, stats.quiet, () => { st.stage = st.stage === 'quiet' ? '' : 'quiet'; st.page = 1; drawFilters(); load(); }, st.stage === 'quiet')
      : h('div', { class: 'stat', style: 'cursor:default' }, h('span', { class: 'k' }, 'Continued anyway'), h('span', { class: 'v' }, stats.overridden));
    statsEl.replaceChildren(tile('', 'All results', stats.total, () => { st.v = ''; st.page = 1; load(); }, !st.v),
      tile('PASS', 'Pass', stats.PASS, setV('PASS'), isOn(st.v, 'PASS')), tile('FLAG', 'Flag', stats.FLAG, setV('FLAG'), isOn(st.v, 'FLAG')), tile('FAIL', 'Fail', stats.FAIL, setV('FAIL'), isOn(st.v, 'FAIL')), extra);
  }
  function headCell(label, sortKey) {
    if (!sortKey) return h('th', {}, label);
    const on = st.sort === sortKey;
    const b = h('button', { type: 'button', class: 'sortbtn' + (on ? ' on' : '') }, label, on ? (st.dir === 'asc' ? ' ▲' : ' ▼') : '');
    b.onclick = () => { if (on) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.sort = sortKey; st.dir = sortKey === 'created' || sortKey === 'time' ? 'desc' : 'asc'; } load(); };
    return h('th', { 'aria-sort': on ? (st.dir === 'asc' ? 'ascending' : 'descending') : null }, b);
  }
  // a column header can be dragged onto another to move the column there (R85): saved for this person, as in the Columns window
  let dragCol = null;
  function movableHead(c) {
    const th = headCell(c.label, c.sort);
    th.draggable = true; th.classList.add('movable'); th.title = 'Drag to move this column';
    th.addEventListener('dragstart', (e) => { dragCol = c.key; th.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.key); });
    th.addEventListener('dragend', () => { dragCol = null; th.classList.remove('dragging'); document.querySelectorAll('table.jobs th.dropl, table.jobs th.dropr').forEach((x) => x.classList.remove('dropl', 'dropr')); });
    th.addEventListener('dragover', (e) => {
      if (!dragCol || dragCol === c.key) return; e.preventDefault();
      const after = cols.indexOf(dragCol) < cols.indexOf(c.key); th.classList.toggle('dropr', after); th.classList.toggle('dropl', !after); });
    th.addEventListener('dragleave', () => th.classList.remove('dropl', 'dropr'));
    th.addEventListener('drop', async (e) => {
      e.preventDefault(); th.classList.remove('dropl', 'dropr');
      if (!dragCol || dragCol === c.key) return;
      const from = cols.indexOf(dragCol), to = cols.indexOf(c.key); const [k] = cols.splice(from, 1); cols.splice(to, 0, k); dragCol = null;
      load(); try { await saveCols(st.tab, cols); } catch (x) { toast(x.message, true); }
    });
    return th;
  }
  function drawRows(rows, total) {
    const shown = cols.map((k) => JOB_COLS.find((c) => c.key === k)).filter(Boolean); // in the person's own order (R85)
    const filtered = FILTER_KEYS.some((k) => k !== 'tab' && st[k]);
    if (fbar) fbar.setActive(filtered);
    // R94: picking jobs to discard (the main admin): a box on each row, one for the page, and a bar with the count
    const pickOn = picking && !st.discarded;
    const toggle = (id) => { if (picked.has(id)) picked.delete(id); else picked.add(id); drawRows(rows, total); };
    const pageBox = h('input', { type: 'checkbox', 'aria-label': 'Select every job on this page', checked: rows.length > 0 && rows.every((r) => picked.has(r.id)) });
    pageBox.indeterminate = !pageBox.checked && rows.some((r) => picked.has(r.id));
    pageBox.onchange = () => { const all = rows.every((r) => picked.has(r.id)); rows.forEach((r) => (all ? picked.delete(r.id) : picked.add(r.id))); drawRows(rows, total); };
    const pickBar = pickOn ? h('div', { class: 'pickbar' }, h('span', {}, h('strong', {}, `${picked.size} selected`), picked.size ? '' : ': tick the jobs to discard, on any page'),
      h('span', { class: 'row', style: 'gap:8px' }, picked.size ? h('button', { class: 'btn sm', type: 'button', onclick: () => { picked.clear(); drawRows(rows, total); } }, 'Clear') : null,
        h('button', { class: 'btn sm danger', type: 'button', disabled: !picked.size || null, onclick: discardPicked }, `Discard selected${picked.size ? ' (' + picked.size + ')' : ''}`))) : null;
    const empty = { in_progress: 'Nothing in progress', submitted: 'Nothing submitted yet', closed: 'Nothing closed yet', not_pursued: 'Nothing skipped or failed' }[st.tab] || 'No jobs yet';
    const table = !rows.length
      ? emptyState('list', filtered ? 'No matches' : empty, filtered ? 'Try different filters.' : st.tab ? 'Jobs move here as they progress.' : 'Screen your first job to see it here.', filtered ? clearBtn.cloneNode(true) : st.tab ? null : h('a', { class: 'btn primary', href: '#/new' }, 'Screen a job'))
      : h('div', { class: 'tablewrap' }, h('table', { class: 'jobs' + (pickOn ? ' picking' : '') }, h('thead', {}, h('tr', {}, pickOn ? h('th', { class: 'pickcell' }, pageBox) : null, headCell('Job', 'title'), shown.map(movableHead), h('th', { class: 'pin' }, ''))),
        h('tbody', {}, rows.map((r) => h('tr', { class: 'click' + (pickOn && picked.has(r.id) ? ' picked' : ''), tabindex: 0, onclick: () => (pickOn ? toggle(r.id) : (location.hash = '#/s/' + r.id)), onkeydown: (e) => { if (e.key === 'Enter') { if (pickOn) toggle(r.id); else location.hash = '#/s/' + r.id; } } },
          pickOn ? h('td', { class: 'pickcell', onclick: (e) => e.stopPropagation() }, h('input', { type: 'checkbox', checked: picked.has(r.id), 'aria-label': 'Select job #' + r.id, onchange: () => toggle(r.id) })) : null,
          h('td', { class: 'jobcell' }, h('span', { class: 'title' }, r.title || (r.input_type === 'link' ? 'Upwork link' : 'Pasted job text')), h('span', { class: 'meta' }, '#' + r.id, r.source === 'claude_plugin' ? h('span', { class: 'srcchip' }, 'Claude plugin') : null,
            Number(r.invite) ? h('span', { class: 'srcchip' }, 'Invite') : null, r.client_id ? clientChip(r) : null, r.discarded_at ? h('span', { class: 'pill wait', style: 'margin-left:8px', title: r.discard_reason || '' }, 'Discarded') : null)),
          shown.map((c) => h('td', {}, c.cell(r))),
          // the row's action stays pinned to the right edge, visible however far the table scrolls
          h('td', { class: 'pin' }, rowAction(r, load)))))));
    if (!rows.length && filtered) table.querySelector('button')?.addEventListener('click', () => { location.hash = '#/history' + (st.tab ? '?tab=' + st.tab : ''); route(); });
    // R117: opened from a number in Reports or the Dashboard: say which, and how to get back or see every job
    const fromReport = st.rdim ? h('div', { class: 'notice fromrep' }, icon('chart'), h('span', {}, `Showing the ${total} job${total === 1 ? '' : 's'} counted under `, h('strong', {}, st.rlabel || 'a report line'),
      st.rpart && st.rpart !== 'all' ? `, only those ${RPART[st.rpart] || st.rpart}` : '', '. Same period and filters.'),
      h('span', { class: 'row', style: 'gap:8px;margin-left:auto' }, h('button', { type: 'button', class: 'btn sm', onclick: () => history.back() }, icon('back'), 'Back'),
        h('button', { type: 'button', class: 'btn sm', onclick: () => { for (const k of ['rdim', 'rkey', 'rpart', 'rlabel']) st[k] = ''; st.page = 1; load(); } }, 'Show every job'))) : null;
    const EXTRA = {}; // R118: the filters in use are chips under the bar now
    const extras = [];
    const note = extras.length ? h('div', { class: 'toolbar', style: 'gap:6px' }, h('span', { class: 'jp-label' }, 'Also filtered by'), extras.map((k) => h('button', { type: 'button', class: 'chip', title: 'Remove this filter', onclick: () => { st[k] = ''; st.page = 1; load(); } },
      `${EXTRA[k]}: ${k === 'loom' ? (st[k] === 'yes' ? 'with a video' : 'without a video') : k.startsWith('sent_') ? dayText(st[k]) : st[k]}`, h('span', { 'aria-hidden': 'true' }, ' ×')))) : null;
    bodyEl.replaceChildren(...[fromReport, pickBar, note, table, pager(total, st.page, (n) => { st.page = n; load(); })].filter(Boolean));
  }
  let seq = 0;
  async function load() {
    refreshChips(); // R118: the chips and the count follow every change
    const my = ++seq;
    const qs = jobQuery(st); const sq = new URLSearchParams(qs); sq.delete('verdict');
    qs.set('page', st.page); qs.set('sort', st.sort); qs.set('dir', st.dir);
    const [list, s2] = await Promise.all([api('GET', '/screenings?' + qs), api('GET', '/screenings/stats?' + sq)]);
    if (my !== seq) return; // a newer request was started while this one was loading
    st.page = list.page; stats = s2;
    setHashParams({ ...Object.fromEntries(FILTER_KEYS.map((k) => [k, st[k]])), mine: st.mine ? '1' : '', page: st.page, sort: st.sort === 'created' ? '' : st.sort, dir: st.dir === 'desc' ? '' : st.dir });
    lastList.history = location.hash; lastList.query = jobQuery(st).toString();
    drawTabs(); drawStats(); drawRows(list.screenings, list.total);
  }
  drawFilters();
  shell('history', [pageHead(me.role === 'employee' ? 'My jobs' : 'Jobs', 'Every job, from screening to outcome. In progress: we are preparing the proposal. Submitted: applied on Upwork, waiting on the client. Closed: hired or lost.',
    h('a', { class: 'btn primary', href: '#/new' }, icon('screen'), 'Screen a job')), h('div', { class: 'jobbar' }, tabsEl, listActs), statsEl, h('div', { class: 'card' }, filters, bodyEl)]);
  bodyEl.append(h('div', { class: 'card-pad' }, h('div', { class: 'skel', style: 'width:60%;margin-bottom:12px' }), h('div', { class: 'skel', style: 'width:80%;margin-bottom:12px' }), h('div', { class: 'skel', style: 'width:45%' })));
  await load();
}

// ---------- report ----------
const VERDICT_TEXT = {
  PASS: ['Clears the SOP gate', 'No fail rule applied and nothing needs a second look.'],
  FLAG: ['Needs a human look', 'No fail rule applied, but some points need a decision before applying.'],
  FAIL: ['Fails the SOP gate', 'At least one fail rule applied. You can still continue, with a reason.'],
};
const vIcon = { PASS: 'check', FLAG: 'warn', FAIL: 'x' };
function kvCard(title, rows) {
  return h('div', { class: 'card kv-card' }, h('h3', { class: 'section-title' }, title),
    rows.length ? h('dl', { class: 'kv' }, rows.map((r) => {
      const ns = /^not shown$/i.test(r.value.trim());
      return h('div', {}, h('dt', {}, r.label), h('dd', { class: ns ? 'ns' : '' }, cap(r.value)));
    })) : h('p', { class: 'faint small' }, 'Nothing reported'));
}
function issues(items, kind) {
  return h('div', { class: 'issues' }, items.map((i) => h('div', { class: 'issue ' + kind }, icon(kind === 'fail' ? 'x' : 'warn'),
    h('div', { class: 'body' }, h('strong', {}, i.rule), h('span', {}, i.value)))));
}
function jobReportView(j, multi) {
  const [t, s] = VERDICT_TEXT[j.verdict];
  return h('section', { style: 'display:grid;gap:16px' },
    h('div', { class: 'verdict-banner ' + j.verdict }, h('div', { class: 'vicon' }, icon(vIcon[j.verdict])),
      h('div', {}, h('div', { class: 'vt' }, VERDICT_WORD[j.verdict]), h('h2', {}, multi ? j.title : t), h('div', { class: 'vs' }, multi ? t + '. ' + s : s))),
    j.fails.length ? h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, `Failed rules (${j.fails.length})`), issues(j.fails, 'fail'),
      j.override_note ? h('div', { class: 'callout', style: 'margin-top:12px' }, j.override_note) : null) : null,
    j.flags.length ? h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, `Flags (${j.flags.length})`), issues(j.flags, 'flag')) : null,
    h('div', { class: 'grid3' }, kvCard('Job', j.job), kvCard('Client', j.client), kvCard('Competition', j.competition)),
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'Fit with ' + cfg('company.name', 'us')), h('p', {}, j.fit)),
    j.proposal_notes.length ? h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'Notes for the proposal'),
      h('ul', { class: 'plain' }, j.proposal_notes.map((n) => h('li', {}, n)))) : null);
}

/** Step 1 while the gate runs (R99): the steps, the rules it checks one after another, a moving bar and the time left. */
function progressCard(status, s) {
  const f = LOADER_FACTS || { rules: [], typical: {} }, T = f.typical.screening || 45;
  if (!LOADER_FACTS) loaderFacts().then(() => { const el = document.querySelector('.ld[data-l="screen"]'); if (el && s) el.replaceWith(progressCard(s.status, s)); });
  const id = 'screen-' + (s ? s.id : 0), started = Date.now() - ((s && s.run_elapsed_seconds) || 0) * 1000;
  const el = liveLoader({ id, title: status === 'running' ? 'Screening this job' : 'Waiting for a free slot', typical: status === 'running' ? T : null, elapsed: s ? s.run_elapsed_seconds : 0,
    sub: 'You can leave this page. It carries on, and the result is saved.', typicalLabel: 'It starts as soon as a slot is free',
    stage: () => (status !== 'running' ? 'queued' : (Date.now() - started) / 1000 < T * 0.7 ? 'rules' : 'verdict'),
    steps: [
      { key: 'queued', label: 'Waiting for a free slot', hint: 'Another job is being worked on. This one is next.', share: 0.4 },
      { key: 'rules', label: 'Checking the job against the rules', hint: 'The job, the client and the competition, against each fail and flag rule.', now: 'Checking', share: 3,
        items: f.rules.map((r) => `${r.code} ${r.rule}`) },
      { key: 'verdict', label: 'Writing the verdict', hint: 'Pass, flag or fail with the reasons, the fit with ' + cfg('company.name', 'us') + ', and notes for the proposal.', share: 1 },
    ] });
  el.dataset.l = 'screen';
  return el;
}


function matchingSection(s, initial) {
  const owner = s.user_id === me.id;
  const setActions = actionsFor();
  const box = h('div', {});
  let m = initial, timer = null, picked = null, showMore = null, libList = null; // showMore: null until the person opens or hides the extra projects
  // R95 (Ahmad): the job's tags a project is missing, named, and added to the project right here (compliance first)
  const gapOpen = new Set(), gapTicks = new Map();
  const canTeach = owner || me.role === 'admin' || me.role === 'manager';
  // R102: an industry is matched by the project's own industry (Industries page), never as a shared tag: a project of the same
  // industry has it (it showed Legal as missing on projects whose industry is Legal)
  const missingOf = (r) => { const have = new Set((r.shared || []).map((t) => t.id));
    return (m.tags || []).filter((t) => t.id && !have.has(t.id) && (Number(t.weight) > 0 || Number(t.compliance)) && !(t.category === 'Industry' && r.pool === 'same') && !Number(t.practice)); };
  function gapBlock(r) {
    const miss = missingOf(r); if (!miss.length || !r.project_id) return null;
    const comp = miss.filter((t) => Number(t.compliance)), other = miss.filter((t) => !Number(t.compliance));
    const ticks = gapTicks.get(r.project_id) || new Set();
    const stop = (e) => e.stopPropagation(); // the card itself picks the project
    if (!gapOpen.has(r.project_id) || !canTeach) {
      return h('div', { class: 'mgap', onclick: stop },
        comp.length ? h('div', { class: 'mcomp short' }, h('div', { class: 't' }, icon('warn'), `Missing compliance: ${comp.map((t) => t.name).join(', ')}`)) : null,
        h('div', { class: 'fold' }, h('span', {}, 'Missing ', h('b', {}, String(miss.length)), ` of the job's tags: ${miss.map((t) => t.name).join(', ')}`),
          canTeach && (!busy() || quiet) ? h('button', { type: 'button', class: 'btn sm', onclick: () => { gapOpen.add(r.project_id); draw(); } }, 'Add tags') : null)); // R100: also while the order updates
    }
    const chip = (t) => { const on = ticks.has(t.id);
      return h('button', { type: 'button', class: 'tgadd' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', title: t.reason || t.category,
        onclick: () => { if (on) ticks.delete(t.id); else ticks.add(t.id); gapTicks.set(r.project_id, ticks); draw(); } }, h('span', { class: 'pl', 'aria-hidden': 'true' }, on ? '✓' : '+'), t.name, h('span', { class: 'cat' }, t.category)); };
    const save = h('button', { type: 'button', class: 'btn sm primary', disabled: !ticks.size || null }, ticks.size ? `Add ${ticks.size} tag${ticks.size === 1 ? '' : 's'} to ${r.project_name}` : 'Tick the tags it has');
    save.onclick = async () => {
      btnBusy(save, 'Adding');
      try {
        const res = await api('POST', `/screenings/${s.id}/projects/${r.project_id}/tags`, { tag_ids: [...ticks] });
        gapTicks.delete(r.project_id); gapOpen.delete(r.project_id);
        if (res.rematch) { // the card shows the tags at once; the order is worked out in the background
          const added = (m.tags || []).filter((t) => (ticks.has(t.id) || res.added?.includes(t.id)) && t.category !== 'Industry'); if ((m.tags || []).some((t) => ticks.has(t.id) && t.category === 'Industry')) r.pool = 'same';
          r.shared = [...(r.shared || []), ...added.filter((t) => !(r.shared || []).some((x) => x.id === t.id)).map((t) => ({ id: t.id, name: t.name, category: t.category, weight: Number(t.weight), compliance: !!Number(t.compliance) }))];
          const already = quiet; quiet = true; m = { ...m, status: busy() ? m.status : 'queued' }; draw(); if (!already) timer = setTimeout(poll, 2500);
          toast(`Added to ${r.project_name}. The order updates in the background.`); }
        else { toast(`Added to ${r.project_name}. The proposal keeps its projects.`); m = (await api('GET', `/screenings/${s.id}/matching`)).matching; draw(); }
      } catch (x) { toast(x.message, true); save.disabled = false; save.replaceChildren(`Add ${ticks.size} tags to ${r.project_name}`); }
    };
    return h('div', { class: 'mgap', onclick: stop },
      h('div', { class: 'mghead' }, h('span', {}, `Missing ${miss.length} of the job's tags. Tick the ones ${r.project_name} really has.`), h('button', { type: 'button', class: 'linkbtn small', onclick: () => { gapOpen.delete(r.project_id); draw(); } }, 'Hide')),
      comp.length ? h('div', { class: 'mcomp' }, h('div', { class: 't' }, icon('warn'), 'Compliance this job needs'), h('div', { class: 's' }, 'Without it this project ranks below projects that have it. Tick it only if the project really handled this.'), h('div', { class: 'chips' }, comp.map(chip))) : null,
      other.length ? h('div', { class: 'chips' }, other.map(chip)) : null,
      h('div', { class: 'addrow' }, h('span', {}, m.has_proposal ? 'Added to the project in the library. The proposal keeps its projects.' : 'Added to the project in the library; the projects are matched again' + (m.confirmed_at ? ', keeping your choice.' : '.')), save));
  }
  const busy = () => m.status === 'queued' || m.status === 'running';
  const dateTxt = (d) => full(d);

  // R95: after tags are added on a card the projects are matched again quietly: the cards stay as they are (with the new tags) and
  // only change once the new order is in; nothing else on the page is redrawn
  let quiet = false;
  async function poll() {
    clearTimeout(timer);
    if (!box.isConnected) return; // the page was left: stop polling
    try {
      const next = (await api('GET', `/screenings/${s.id}/matching`)).matching;
      if (quiet && (next.status === 'queued' || next.status === 'running')) m = { ...m, status: next.status };
      else {
        if (quiet) { // R100: the projects ticked stay ticked (those still in the list); nothing is picked again for you
          quiet = false;
          if (picked && !next.confirmed_at) { const ids = new Set((next.matches || []).map((x) => x.project_id)); picked = new Set([...picked].filter((x) => ids.has(x))); if (!picked.size) picked = null; } else picked = null;
          if (next.status === 'done') toast('The order is updated with the new tags');
        }
        m = next; draw();
      }
    } catch (e) { /* try again next time */ }
    if (m && busy()) timer = setTimeout(poll, quiet ? 2500 : 1000);
  }
  const start = async (btn) => {
    btnBusy(btn, 'Starting');
    try { await api('POST', `/screenings/${s.id}/matching/start`, {}); picked = null; m = { ...m, status: 'queued', error: null }; draw(); timer = setTimeout(poll, 1000); }
    catch (x) { toast(x.message, true); btn.disabled = false; btn.replaceChildren('Try again'); }
  };

  // "Skip tech stack tags": the same matching without the job's Tech stack tags (Node.js, React and so on); flipping it matches again
  function stackSwitch() {
    const on = !!m.skip_tech_stack, can = owner && !m.has_proposal;
    const sw = h('button', { type: 'button', role: 'switch', class: 'switch' + (on ? ' on' : ''), 'aria-checked': on, 'aria-label': 'Skip tech stack tags', disabled: !can }, h('span', { class: 'knob' }));
    sw.onclick = async () => {
      sw.disabled = true;
      try { await api('PUT', `/screenings/${s.id}/skip-tech-stack`, { skip: !on }); picked = null; m = { ...m, status: 'queued', error: null, skip_tech_stack: !on }; toast(`Skip tech stack tags: ${on ? 'off' : 'on'}`); draw(); timer = setTimeout(poll, 1000); }
      catch (x) { toast(x.message, true); sw.disabled = false; }
    };
    const help = m.has_proposal ? 'A proposal is already written with the projects picked, so this can no longer change.'
      : on ? 'The projects are matched without the job\'s Tech stack tags. Everything else counts as usual.'
      : 'Match the projects without the job\'s Tech stack tags (languages, frameworks, databases). Everything else counts as usual. The projects are matched again and you confirm them again.';
    return h('div', { class: 'card card-pad' }, h('div', { class: 'setrow' }, h('div', {}, h('strong', {}, 'Skip tech stack tags'), h('div', { class: 'jp-label' }, help)),
      h('div', { class: 'setin switchin' }, h('span', { class: 'switchlbl' }, on ? 'On' : 'Off'), sw)));
  }

  function tagsBlock() {
    const cats = [...new Set(m.tags.map((t) => t.category))];
    return h('details', { class: 'card fold' },
      h('summary', {}, `Why these projects: the job's ${m.tags.length} tags`),
      h('div', { class: 'tagsgrid' }, cats.map((c) => h('div', { class: 'tg' }, h('div', { class: 'tc-title' }, c, m.skip_tech_stack && c === 'Tech stack' ? h('span', { class: 'faint' }, ' (skipped in matching)') : null),
        m.tags.filter((t) => t.category === c).map((t) => h('div', { class: 'trow' },
          h('div', { class: 'tname' }, h('strong', {}, t.name), h('span', { class: 'wt', title: 'Match weight' }, '×' + t.weight), t.core_rank ? h('span', { class: 'chip brand' }, t.core_rank === 1 ? 'Main work' : 'Core work') : null), h('div', { class: 'treason' }, t.reason)))))));
  }

  function matchesBlock() {
    const rows = m.matches;
    if (rows.length < 2) {
      return h('div', { class: 'notice' }, icon('info'), rows.length ? 'Only one project shares tags with this job, so there is nothing to choose between.' : 'No project shares useful tags with this job.');
    }
    if (!picked) picked = new Set((m.confirmed_at ? rows.filter((r) => r.selected) : rows.filter((r) => r.recommended)).map((r) => r.project_id));
    const confirmedIds = new Set(rows.filter((r) => r.selected).map((r) => r.project_id));
    const changed = !m.confirmed_at || picked.size !== confirmedIds.size || [...picked].some((i) => !confirmedIds.has(i));
    const pmin = cfg('selection.min', 2), pmax = cfg('selection.max', 2), okSize = picked.size >= pmin && picked.size <= pmax;
    const range = pmin === pmax ? `${pmax}` : `${pmin} to ${pmax}`;
    const count = h('span', { class: 'counter' + (okSize ? ' ok' : '') }, `${picked.size} of ${pmax} selected`);
    const err = h('div', { class: 'err', hidden: true });
    // one press: confirming (or keeping) the choice moves straight on to the profile
    const confirmLabel = !m.confirmed_at ? 'Confirm and continue' : 'Save and continue';
    const save = async (ids, btn, label) => {
      if (ids.length < pmin || ids.length > pmax) { err.replaceChildren(icon('x'), `Choose ${range} project${pmax === 1 ? '' : 's'} first.`); err.hidden = false; return; }
      err.hidden = true; btnBusy(btn, 'Saving');
      try {
        await api('PUT', `/screenings/${s.id}/selection`, { project_ids: ids });
        if (stepCtx) await stepCtx.advanceTo(2); else { toast('Selection saved'); await poll(); }
      }
      catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; btn.disabled = false; btn.replaceChildren(label); }
    };
    const recIds = rows.filter((r) => r.recommended).map((r) => r.project_id);
    const isRec = picked.size === recIds.length && recIds.every((i) => picked.has(i));
    // the tab row: confirm (or save a changed choice); "use recommended" only when the choice differs from it
    if (owner) setActions(
      !isRec && recIds.length >= pmin && recIds.length <= pmax ? actBtn('Use recommended', () => { picked = new Set(recIds); draw(); }) : null,
      changed ? actBtn(confirmLabel, (e) => save([...picked], e.currentTarget, confirmLabel), true) : null);
    const rec = rows.filter((r) => r.recommended), rest = rows.filter((r) => !r.recommended && !r.alternative && !r.extra), alt = rows.filter((r) => r.alternative);
    const extra = rows.filter((r) => r.extra), moreOpen = showMore === true || (showMore !== false && extra.some((r) => picked.has(r.project_id))); // R100: can be hidden again
    const POOL = { same: 'Same industry', related: 'Related industry', other: 'Other industry' };
    // R100: when the right project is not in the list: the next best ones from the library, or any one found by name, industry or tag
    const finder = () => {
      const inList = new Set(rows.map((r) => r.project_id));
      const more = h('button', { class: 'btn', type: 'button' }, icon('screen'), 'Load 10 more from the library');
      more.onclick = async () => { btnBusy(more, 'Loading');
        try { const r = await api('POST', `/screenings/${s.id}/matches/more`, {}); m = (await api('GET', `/screenings/${s.id}/matching`)).matching; showMore = true;
          toast(r.added ? `${r.added} more project${r.added === 1 ? '' : 's'} added below${r.left ? `, ${r.left} more left` : ''}` : 'No other project shares anything with this job. Search for one by name instead.'); draw(); }
        catch (x) { toast(x.message, true); draw(); } };
      const q = h('input', { type: 'search', class: 'findin', placeholder: 'Find a project by name, industry or tag', 'aria-label': 'Find a project in the library' });
      const results = h('div', { class: 'findres', hidden: true });
      const show = () => {
        const t = q.value.trim().toLowerCase(); if (!t || !libList) { results.hidden = true; return; }
        const hit = libList.filter((p) => Number(p.active) !== 0 && [p.name, ...(p.tags || []).map((x) => x.name), ...(p.industries || []).map((x) => x.name || x)].join(' ').toLowerCase().includes(t))
          .sort((a, b) => Number(inList.has(a.id)) - Number(inList.has(b.id)) || Number(!a.name.toLowerCase().includes(t)) - Number(!b.name.toLowerCase().includes(t))).slice(0, 8); // new ones first, name matches first
        results.hidden = false;
        results.replaceChildren(...(hit.length ? hit.map((p) => { const there = inList.has(p.id);
          return h('button', { type: 'button', class: 'findrow', disabled: there || null, onclick: async (e) => { btnBusy(e.currentTarget, 'Adding');
            try { await api('POST', `/screenings/${s.id}/matches/more`, { project_id: p.id }); m = (await api('GET', `/screenings/${s.id}/matching`)).matching; showMore = true; toast(`${p.name} added below. Tick it to use it.`); draw(); }
            catch (x) { toast(x.message, true); draw(); } } },
            h('strong', {}, p.name), h('span', { class: 'small muted' }, there ? 'Already in the list' : ((p.industries || []).map((x) => x.name || x).join(', ') || (p.tags || []).slice(0, 4).map((x) => x.name).join(', ')))); })
          : [h('div', { class: 'faint small', style: 'padding:8px 10px' }, 'No project matches that.')]));
      };
      q.oninput = () => { if (!libList) api('GET', '/projects').then((r) => { libList = r.projects; show(); }).catch(() => undefined); else show(); };
      return h('div', { class: 'finder' }, h('div', { class: 'jp-sec' }, 'Not the right project?'),
        h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;align-items:flex-start' }, more, h('div', { class: 'findwrap' }, q, results)));
    };
    // R95: the job's tags none of the projects shown has (a later step can still write about them from the post)
    const noneHas = () => { const shown = rows.filter((r) => !r.extra && r.project_id); if (!shown.length) return null;
      const none = (m.tags || []).filter((t) => t.id && (Number(t.weight) > 0 || Number(t.compliance)) && !Number(t.practice) && shown.every((r) => missingOf(r).some((x) => x.id === t.id)));
      return none.length ? h('div', { class: 'gapsum' }, h('strong', {}, `No project shown has: ${none.map((t) => t.name).join(', ')}`),
        h('div', { class: 'small muted' }, canTeach ? 'If one of these projects did this work, add the tag on its card. A tag no project has can still be written about from the job post.' : 'A tag no project has can still be written about from the job post.')) : null; };
    const card = (r) => {
      const on = picked.has(r.project_id), locked = !owner || !r.project_id || (picked.size >= pmax && !on);
      const cb = h('input', { type: 'checkbox', id: 'mp' + r.rank, checked: on, disabled: locked, 'aria-label': 'Select ' + r.project_name });
      cb.onchange = () => { if (cb.checked) picked.add(r.project_id); else picked.delete(r.project_id); draw(); };
      const toggle = (e) => { if (locked || e.target.closest('a, input')) return; cb.checked = !cb.checked; cb.onchange(); }; // the whole card picks the project
      return h('div', { class: 'mcard' + (on ? ' on' : '') + (r.recommended ? ' rec' : '') + (owner && !locked ? ' pickable' : ''), onclick: owner ? toggle : null },
        h('div', { class: 'mtop' }, owner ? cb : null, h('span', { class: 'rank' }, '#' + r.rank),
          h('div', { class: 'mname' }, r.project_id ? h('a', { href: '#/p/' + r.project_id }, r.project_name) : h('span', {}, r.project_name, h('span', { class: 'faint small' }, ' (removed from library)'))),
          r.recommended ? h('span', { class: 'chip brand' }, 'Recommended') : h('span', { class: 'chip', title: r.added ? 'You brought it into the list (Load more or the search)' : null }, r.alternative ? 'Alternative' : r.added ? 'Added' : 'Match')),
        r.ai_reason ? h('p', { class: 'jp-body', style: 'margin:2px 0 0' }, r.ai_reason) : null,
        r.ai_fits === false ? h('div', { class: 'cgap' }, icon('warn'), 'The AI judged it a weak fit for this job') : null,
        r.proves_work === false ? h('div', { class: 'cgap' }, icon('warn'), 'Shares none of the job\'s core work (workflow or AI capability)') : null,
        POOL[r.pool] || r.platform ? h('div', { class: 'jp-label' }, [POOL[r.pool], r.platform && r.platform !== 'not known' ? 'Runs on ' + r.platform : null].filter(Boolean).join(' · ')) : null,
        h('div', { class: 'mscore' }, h('div', { class: 'bar', role: 'img', 'aria-label': `Score ${r.score} of ${r.max_score}` }, h('i', { style: `width:${Math.max(3, r.percent)}%` })),
          h('span', { class: 'sc' }, h('strong', {}, r.score), ` of ${r.max_score} · ${r.percent}%`)),
        r.shared.length ? h('div', { class: 'sharedlbl' }, 'Shares with the job') : null,
        h('div', { class: 'chips' }, r.shared.map((t) => h('span', { class: 'chip', title: `${t.category}, weight ${t.weight}` }, t.name, h('span', { class: 'faint' }, ' ×' + t.weight)))),
        gapBlock(r)); // R95: what it is missing, named, with Add tags (it replaced "Missing N compliance tags")
    };
    return h('div', { class: 'stack' },
      h('div', { class: 'card card-pad' },
        h('div', { class: 'row spread' }, h('div', { class: 'jp-sec' }, owner && !m.confirmed_at ? `Choose ${range} project${pmax === 1 ? '' : 's'} for the proposal` : 'Projects for the proposal'), owner ? count : null),
        m.job_needs ? h('p', { class: 'jp-body', style: 'margin:2px 0 4px' }, h('strong', {}, 'Job needs: '), m.job_needs) : null,
        quiet && busy() ? h('div', { class: 'quietnote', role: 'status' }, h('span', { class: 'spin' }), 'Updating the order with the new tags. You can keep working; the cards change when it is done.') : null,
        noneHas(),
        h('div', { class: 'jp-label', style: 'margin:2px 0 12px' }, m.confirmed_at ? `Confirmed${m.confirmed_by ? ' by ' + m.confirmed_by : ''} ${dateTxt(m.confirmed_at)}.${owner ? ' Pick others to change it.' : ''}`
          : owner ? 'The recommended ones are ticked. Swap them if you like, then confirm at the top right.' : 'Only the person who submitted this job can choose the projects.'),
        err,
        h('div', { class: 'mgrid' }, rec.map(card)), rest.length ? h('div', { class: 'mgrid', style: 'margin-top:12px' }, rest.map(card)) : null,
        alt.length ? h('div', { style: 'margin-top:16px' }, h('div', { class: 'jp-sec' }, 'Alternative from another industry'),
          h('p', { class: 'jp-label', style: 'margin:2px 0 10px' }, 'It shares much more with this job than the best project from the same industry. Use it when the work matters more than the industry.'),
          h('div', { class: 'mgrid' }, alt.map(card))) : null,
        extra.length && moreOpen ? h('div', { style: 'margin-top:16px' }, h('div', { class: 'row spread' }, h('div', { class: 'jp-sec' }, `More projects (${extra.length})`),
            h('button', { class: 'btn sm', type: 'button', onclick: () => { showMore = false; draw(); } }, 'Hide')),
          h('p', { class: 'jp-label', style: 'margin:2px 0 10px' }, 'The next best matches, in the same order, then any you added.' + (extra.some((r) => picked.has(r.project_id)) ? ' The ones you ticked stay picked when this is hidden.' : '')), h('div', { class: 'mgrid' }, extra.map(card))) : null,
        extra.length && !moreOpen ? h('div', { style: 'margin-top:14px' }, h('button', { class: 'btn', type: 'button', onclick: () => { showMore = true; draw(); } }, `Show ${extra.length} more project${extra.length === 1 ? '' : 's'}`)) : null,
        owner && !busy() ? finder() : null,
        owner && picked.size >= pmax ? h('p', { class: 'jp-label', style: 'margin:10px 0 0' }, 'Untick one to choose a different project.') : null,
        h('p', { class: 'jp-label', style: 'margin:10px 0 0' }, m.order === 'ai'
          ? 'How these were chosen: the tags made the shortlist (what the job runs on, its core work, its industry), then the AI read each project\'s overview and case study and put them in order for this job. The line under each name is its reason. Score: the weights of the tags a project shares with the job (see Tag dictionary, How the scores work).'
          : 'Ordered by the tag score: projects that did the job\'s core work first, then the job\'s industry, then the score. Score: the weights of the tags a project shares with the job (see Tag dictionary, How the scores work).')));
  }


  function draw() {
    let body;
    if (!busy()) forgetLoader('match-' + s.id); // R99: a later matching starts its loader afresh
    if (busy() && !(quiet && (m.matches || []).length)) {
      // R99: the steps, the tag categories and the projects it weighs one after another, a moving bar and the time left
      const f = LOADER_FACTS || { categories: [], projects: [], typical: {} }, T = f.typical.matching || 60, again = !!(m.tags && m.tags.length);
      if (!LOADER_FACTS) loaderFacts().then(() => { if (box.isConnected && busy()) draw(); });
      const started = (LOADERS.get('match-' + s.id) || { at: Date.now() }).at;
      body = liveLoader({ id: 'match-' + s.id, title: again ? 'Matching the projects again' : 'Finding the projects that prove this work', typical: m.status === 'running' ? T : null,
        sub: 'You can leave this page. The projects are here when it is done.', typicalLabel: 'It starts as soon as a slot is free',
        stage: () => { const sec = (Date.now() - started) / 1000; return m.status !== 'running' ? 'queued' : !again && sec < T * 0.4 ? 'tags' : sec < T * 0.75 ? 'score' : 'order'; },
        steps: [
          { key: 'queued', label: 'Waiting for a free slot', hint: 'Another job is being worked on. This one is next.', share: 0.3 },
          ...(again ? [] : [{ key: 'tags', label: 'Tagging the job', hint: 'What it runs on, the core work, the industry, the tools and the stack, from the tag dictionary.', now: 'Tagging', share: 2, items: f.categories }]),
          { key: 'score', label: 'Scoring the projects', hint: 'Each project scores the weights of the tags it shares with the job; the core work and the industry come first.', now: 'Weighing', share: 1.5, items: f.projects },
          { key: 'order', label: 'Putting the best ones in order', hint: 'The AI reads the overview and case study of the shortlist and orders them for this job, with a reason each.', now: 'Reading', share: 1.5,
            items: (m.matches || []).length ? m.matches.map((x) => x.project_name) : f.projects },
        ] });
    } else if (m.status === 'error') {
      if (owner) setActions(actBtn('Try again', (e) => start(e.currentTarget), true));
      body = h('div', { class: 'stack' }, h('div', { class: 'card card-pad' }, h('div', { class: 'jp-sec' }, 'Project matching did not finish'), h('p', { class: 'jp-body', style: 'margin:6px 0 0' }, m.error || 'Something went wrong.')),
        m.tags && m.tags.length ? stackSwitch() : null);
    } else if (m.status === 'done' || (quiet && busy())) { // R95: a quiet re-match keeps showing the cards
      body = h('div', { class: 'stack' }, stackSwitch(), matchesBlock(), m.tags && m.tags.length ? tagsBlock() : null);
    } else { // continued before this step existed
      if (owner) setActions(actBtn('Find matching projects', (e) => start(e.currentTarget), true));
      body = h('div', { class: 'card card-pad' }, h('div', { class: 'jp-sec' }, 'Match this job with projects'), h('p', { class: 'jp-body', style: 'margin:6px 0 0' }, 'The job is tagged and compared with the project library.'));
    }
    if (busy()) setActions();
    box.replaceChildren(busy() ? h('div', { class: 'card' }, body) : body);
  }
  draw(); if (busy()) timer = setTimeout(poll, 1000);
  return box;
}

// ---------- tracking and record details ----------
const outcomeList = () => cfg('tracking.outcomes', ['Pending', 'Hired', 'Not hired', 'No response', 'Withdrawn', 'Job closed']);
const yesNo = (id, value) => h('select', { id, style: 'width:100%' }, [['', 'Not known'], ['yes', 'Yes'], ['no', 'No']].map(([v, l]) => h('option', { value: v, selected: (value || '') === v }, l)));
const numIn = (id, value, placeholder) => h('input', { type: 'number', id, min: 0, max: 1000, step: 1, value: value ?? '', placeholder });
/** After the proposal: what happened on Upwork. `onSaved` is called with the saved values. */

/** The end of the journey: what was sent and what happened, with the next things to do. */

/** "name @ price / GitLab" pieces for a profile, as one readable line (or null). */
const profileGitlab = (v) => { const g = gitlabLink(v); return g ? h('a', { href: g.href, target: '_blank', rel: 'noopener noreferrer' }, g.label) : null; };
function profileSummary(p) {
  const bits = [p.tagline, p.price !== null && p.price !== undefined ? money(p.price) + ' / hr' : null, p.gitlab_account ? 'GitLab ' + ((gitlabLink(p.gitlab_account) || {}).label || '') : null].filter(Boolean);
  return bits.length ? bits.join('  ·  ') : null;
}
function recordDetails(s, override, matching, proposal) {
  const link = (u) => (/^https?:\/\//i.test(u || '') ? h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, u) : u);
  const rows = [
    ['Date screened', full(s.created_at)], ['Upwork profile', s.profile_name], ['Profile tagline', s.profile_tagline],
    ['Profile price', s.profile_price !== null && s.profile_price !== undefined ? money(s.profile_price) + ' / hr' : null], ['Profile GitLab account', profileGitlab(s.profile_gitlab)], ['Job title', s.title], ['Job URL', link(s.source_url)],
    ['Posted', s.posted], ['Job type', s.job_type], ['Budget', s.budget], ['Length and hours per week', s.length_hours], ['Experience level', s.experience_level],
    ['Service category', s.service_category], ['Required skills and tools', s.required_skills], ['Client country', s.client_country],
    ['Payment verified', s.payment_verified], ['Client rating (reviews)', s.client_rating], ['Jobs posted', s.jobs_posted], ['Hire rate', s.hire_rate],
    ['Total spent', s.total_spent], ['Hires', s.hires], ['Avg spend per hire', s.avg_spend_per_hire], ['Avg hourly paid', s.avg_hourly_paid],
    ['Member since', s.member_since], ['Proposals', s.proposals], ['Interviewing', s.interviewing], ['Invites sent', s.invites_sent],
    ['Connects cost', s.connects_cost], ['Screening\'s first look at projects', s.sample_match], ['Verdict', s.verdict], ['Fail reasons', s.fail_reasons],
    ['Flag reasons', s.flag_reasons], ['Rule codes', s.rule_codes], ['Proceeded', s.proceeded], ['Override reason', override ? override.reason : null],
    ['Selected projects', matching && matching.confirmed_at ? matching.matches.filter((x) => x.selected).map((x) => x.project_name).join('; ') : null],
    ['Written with template', proposal && proposal.template ? proposal.template.name : null],
    ['Proposal sent date', s.proposal_sent_date ? dayText(s.proposal_sent_date) : null], ['Outcome', s.outcome], ['Notes', s.notes],
  ];
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, 'Record details'), h('span', { class: 'sub' }, 'Every tracked field')),
    h('div', { class: 'card-pad' }, h('dl', { class: 'kv cols2' }, rows.map(([l, v]) => h('div', {}, h('dt', {}, l), h('dd', { class: v ? '' : 'ns' }, cap(v) || 'Not recorded')))),
      s.job_description ? h('details', { class: 'desc' }, h('summary', {}, 'Job description (the pasted page text)'), h('pre', {}, s.job_description)) : null));
}

// ---------- the record page as a stepper ----------
let stepCtx = null; // the stepper that is on screen, so a section can refresh it or move it on
const STEPS = [['screening', 'Screening'], ['projects', 'Projects'], ['profile', 'Profile'], ['proposal', 'Proposal'], ['tracking', 'Tracking']];

/** What is finished and what is open, from the server's state. */
function stepState(matching, proposal) {
  const done = [!!(matching && matching.continued), !!(matching && matching.confirmed_at), !!(matching && matching.proposal_profile), !!(proposal && proposal.finalized_at), false];
  const unlocked = [true, done[0], done[1], done[2], done[3]];
  let current = 0;
  for (let i = 0; i < STEPS.length; i++) if (unlocked[i]) { current = i; if (!done[i]) break; }
  return { done, unlocked, current };
}

/** Choose the one Upwork profile the proposal is sent from, as cards in a grid. Confirming it opens the Proposal tab, where the type is chosen. */
function profileSection(s, initial) {
  const owner = s.user_id === me.id;
  const setActions = actionsFor();
  const box = h('div', { class: 'stack' });
  let m = initial, chosen;
  async function reload() { m = (await api('GET', `/screenings/${s.id}/matching`)).matching; }
  function draw() {
    const profs = (m.profiles || []).filter((p) => Number(p.active) === 1 || (m.proposal_profile && m.proposal_profile.id === p.id)), saved = m.proposal_profile;
    const current = chosen !== undefined ? chosen : (saved ? saved.id : null);
    const err = h('div', { class: 'err', hidden: true });
    const confirmIt = async (e) => {
      if (!current) { err.replaceChildren(icon('x'), 'Pick a profile first.'); err.hidden = false; return; }
      const b = e.currentTarget; btnBusy(b, 'Saving');
      try {
        const r = await api('PUT', `/screenings/${s.id}/proposal-profile`, { profile_id: current });
        toast('Profile saved'); chosen = undefined;
        if (stepCtx) await stepCtx.advanceTo(3); else { await reload(); if (matching) Object.assign(matching, m); draw(); } // R91: no whole page load
      } catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; b.disabled = false; b.replaceChildren(saved ? 'Use this profile instead' : 'Confirm and continue'); }
    };
    if (owner) setActions(!saved ? actBtn('Confirm and continue', confirmIt, true) : current && current !== saved.id ? actBtn('Use this profile instead', confirmIt, true) : null);
    const card = (p) => {
      const on = current === p.id;
      const pick = () => { if (!owner) return; chosen = p.id; err.hidden = true; draw(); };
      return h('button', { type: 'button', class: 'pcard2' + (on ? ' on' : ''), role: 'radio', 'aria-checked': on, disabled: !owner || null, onclick: pick },
        h('div', { class: 'row spread' }, h('span', { class: 'jp-sec' }, p.name), saved && saved.id === p.id ? h('span', { class: 'tagpill' }, 'Chosen') : on ? icon('check') : null),
        h('div', { class: 'jp-label' }, [p.price !== null && p.price !== undefined ? money(p.price) + ' / hr' : null, p.tagline].filter(Boolean).join(' · ') || 'No rate or headline yet'),
        p.services ? h('div', { class: 'jp-label clamp2' }, p.services) : null,
        p.loom ? h('div', { class: 'jp-label', title: 'Shares ' + p.loom.shared.join(', ') + ' with this job' }, 'Loom video that fits: ' + p.loom.title) : null);
    };
    box.replaceChildren(h('div', { class: 'card card-pad' },
      h('div', { class: 'jp-sec' }, saved ? `Sent from ${saved.name}` : 'Which profile sends this proposal?'),
      h('div', { class: 'jp-label', style: 'margin:2px 0 14px' }, saved ? `Confirmed${saved.confirmed_by ? ' by ' + saved.confirmed_by : ''} ${full(saved.confirmed_at)}.${owner ? ' Pick another to change it.' : ''}`
        : owner ? 'Pick one, then confirm at the top right. Next you choose the proposal type.' : 'Chosen by the person who submitted this job.'),
      err,
      profs.length ? h('div', { class: 'pgrid2', role: 'radiogroup', 'aria-label': 'Upwork profile' }, profs.map(card)) : h('p', { class: 'jp-body' }, 'No Upwork profiles are set up yet. An admin can add them under Upwork profiles.')));
  }
  box.replaceChildren(h('div', { class: 'card card-pad' }, h('div', { class: 'skel', style: 'width:50%' })));
  reload().then(draw).catch((e) => box.replaceChildren(h('div', { class: 'card card-pad' }, h('p', { class: 'err' }, e.message))));
  return box;
}

/** The job post as copied from Upwork, in fields: terms, description, skills, questions, activity, the client and their history. */
function postingCard(s, open = true, setButtons = null) {
  const p = s.posting;
  const body = h('div', { class: 'card-pad posting' });
  const box = h('details', { class: 'card', open: open || null, style: 'margin-top:16px' },
    h('summary', { class: 'card-head', style: 'cursor:pointer;list-style:none' }, h('h2', {}, 'Job posting'), h('span', { class: 'sub' }, 'Everything copied from Upwork')), body);
  const raw = s.job_description ? h('details', { class: 'desc' }, h('summary', {}, 'The full pasted text'), h('pre', {}, s.job_description)) : null;
  const grid = (rows) => (rows && rows.length ? h('dl', { class: 'terms' }, rows.filter((r) => r.value).map((r) => h('div', {}, h('dt', {}, cap(r.label)), h('dd', {}, cap(r.value))))) : null);
  if (!p) {
    const busy = s.posting_status === 'queued' || s.posting_status === 'running';
    const go = h('button', { class: 'btn primary', type: 'button' }, s.posting_status === 'error' ? 'Try again' : 'Extract the posting');
    // refresh only this card, never the page: the workflow may hold unsaved text
    const refresh = async () => { if (!box.isConnected) return; try { const d = await api('GET', '/screenings/' + s.id); box.replaceWith(postingCard(d.screening, box.open, setButtons)); } catch { /* try again on the next visit */ } };
    go.onclick = async () => { btnBusy(go, 'Starting'); try { await api('POST', `/screenings/${s.id}/posting`, {}); toast('Reading the job post...'); setTimeout(refresh, 2500); } catch (x) { toast(x.message, true); go.disabled = false; } };
    if (busy) setTimeout(refresh, 2000);
    body.replaceChildren(busy ? liveLine({ id: 'post-' + s.id, label: 'Reading the job post into fields', now: 'Finding ', typical: 30, items: ['the budget and job type', 'the client history', 'the skills it asks for', 'the screening questions', 'the timeline', 'the attachments it mentions'] })
      : h('div', {}, h('p', { class: 'muted', style: 'margin-top:0' }, s.posting_status === 'error' ? (s.posting_error || 'The job post could not be read into fields.') : 'This job was pasted before the posting was read into fields.'), canTrack(s.user_id) && !setButtons ? go : null), raw);
    if (setButtons) setButtons(!busy && canTrack(s.user_id) ? actBtn(go.textContent, () => go.click(), true) : null); // on the job page the button sits in the tab row
    return box;
  }
  body.replaceChildren(...[ // replaceChildren does not unpack nested lists, so flatten them first
    h('div', { style: 'margin-bottom:6px' }, h('strong', {}, p.title || s.title || ''), h('div', { class: 'small muted' }, [p.posted, p.location].filter(Boolean).join(' · '))),
    grid(p.terms),
    p.skills.length ? [h('h3', {}, 'Skills'), h('div', { class: 'chips' }, p.skills.map((x) => h('span', { class: 'chip' }, x)))] : null,
    [h('h3', {}, 'Description'), h('div', { class: 'desc-text' }, p.description || 'Not shown')],
    p.screening_questions.length ? [h('h3', {}, 'Screening questions'), h('ol', {}, p.screening_questions.map((q) => h('li', {}, q)))] : null,
    p.activity.length ? [h('h3', {}, 'Activity on this job'), grid(p.activity)] : null,
    p.client.length ? [h('h3', {}, 'About the client'), grid(p.client)] : null,
    p.client_history.length ? [h('h3', {}, `Client's recent history (${p.client_history.length})`), h('ul', { class: 'hist' }, p.client_history.map((x) => h('li', {},
      h('strong', {}, x.title || 'Untitled job'), h('div', { class: 'small muted' }, [x.dates, x.amount, x.rating ? 'Rating ' + x.rating : ''].filter(Boolean).join(' · ')), x.feedback ? h('div', { class: 'small' }, x.feedback) : null)))] : null,
    p.other_open_jobs.length ? [h('h3', {}, 'Other open jobs'), h('ul', {}, p.other_open_jobs.map((x) => h('li', {}, x)))] : null,
    raw].flat(Infinity).filter(Boolean));
  return box;
}

/** Every step of a job in time order, with who did it and each AI call. Loaded when opened. */
function timelineCard(id) {
  const body = h('div', { class: 'card-pad' });
  const box = h('details', { class: 'card timeline' }, h('summary', { class: 'card-head' }, h('h2', {}, 'Timeline'), h('span', { class: 'sub' }, 'Every step, who did it, and each AI call')), body);
  box.addEventListener('toggle', async () => {
    if (!box.open || body.dataset.loaded) return; body.dataset.loaded = '1';
    body.replaceChildren(h('div', { class: 'skel', style: 'width:60%' }));
    try {
      const { events } = await api('GET', `/screenings/${id}/timeline`);
      const t0 = events.length ? toDate(events[0].at).getTime() : 0;
      body.replaceChildren(h('ol', { class: 'tl' }, events.map((e) => h('li', { class: 'tl-' + e.kind },
        h('span', { class: 'when', title: full(e.at) }, '+' + mins(Math.round((toDate(e.at).getTime() - t0) / 1000))),
        h('div', {}, h('strong', {}, e.what), e.who ? h('span', { class: 'muted' }, ' · ' + e.who) : null, e.detail ? h('div', { class: 'small muted mono' }, e.detail) : null)))));
    } catch (x) { body.replaceChildren(h('p', { class: 'err' }, x.message)); }
  });
  return box;
}

/** Where a job stands, worked out the same way as the Jobs list (stageSql on the server). */
function stageOf(s, matching, proposal) {
  if (s.status === 'queued' || s.status === 'running') return 'screening';
  if (s.status === 'error') return 'failed';
  if (s.proceeded === 'no') return 'skipped';
  if (s.outcome && s.outcome !== 'Pending') return 'closed';
  if (s.proposal_sent_at || s.proposal_sent_date) return 'submitted';
  if (!(matching && matching.continued)) return 'decide';
  if (!matching.confirmed_at) return 'projects';
  if (!matching.proposal_profile) return 'profile';
  if (!proposal) return 'type';
  if (proposal.status === 'queued' || proposal.status === 'running') return 'writing';
  if (!proposal.finalized_at) return 'review';
  return 'ready';
}

/** The job page's header: the title with its verdict and where it stands, then one quiet line of details. No buttons (they live in the tab row). */
function jobHeader(s, stage) {
  const title = s.title || (s.input_type === 'link' ? 'Upwork link' : 'Pasted job text');
  const [n, label] = STAGE_INFO[stage] || [0, ''];
  const sep = () => h('span', { class: 'dot' }, '·');
  const bits = [s.source === 'claude_plugin' ? 'From the Claude plugin' : null, s.user_name, h('span', { title: full(s.created_at) }, ago(s.created_at)),
    s.profile_name, gateChip(s), s.source_url ? h('a', { href: s.source_url, target: '_blank', rel: 'noopener noreferrer' }, 'Upwork post') : null].filter(Boolean);
  // R135 (Hamza): the job's key facts, the ones a person checks before spending Connects, in a row of their own under the title: each a
  // short value (shortened, never cut off) with a second line of detail, and the full text on hover. Colour marks what needs a look.
  const known = (v) => v != null && String(v).trim() && !/^(not shown|not known|none|n\/a|-|unknown)\b/i.test(String(v).trim());
  const k = (v) => (known(v) ? String(v).trim() : '');
  const money = (v) => k(v).replace(/(\d)\.00\b/g, '$1').replace(/\s*\((stated|about|approx\.?)\)/gi, '').replace(/\s*(per hour|an hour|\/\s*hr|\/\s*hour)\b/gi, '/hr').trim();
  const budget = money(s.budget).replace(/\s+to\s+/i, '\u2013').replace(/^(\$[\d,.]+)\u2013\$/, '$1\u2013');
  const kind = /hour/i.test(s.job_type || '') ? 'Hourly' : /fixed/i.test(s.job_type || '') ? 'Fixed price' : '';
  const cm = /^([^(,]+?)\s*(?:\((.+)\)|,\s*(.+))?$/.exec(k(s.client_country)) || [];
  const rating = /^([\d.]+)\s*\((\d+)\)/.exec(k(s.client_rating));
  const pct = (v) => Number((/(\d+)\s*%/.exec(k(v)) || [])[1]);
  const hr = pct(s.hire_rate), props = Number((/(\d+)/.exec(k(s.proposals)) || [])[1]), bucket = (/\((\d+\+?(?:\s*to\s*\d+)?)\)/.exec(k(s.proposals)) || [])[1];
  const unverified = /^no\b/i.test(k(s.payment_verified));
  const since = k(s.member_since).replace(/^(\w{3})\w*\s+\d{1,2},\s*(\d{4})$/, '$1 $2');
  const join = (...x) => x.filter(Boolean).join(' \u00b7 ');
  const FACTS = [
    { k: 'Budget', v: budget, sub: join(kind, k(s.experience_level)) },
    { k: 'Client', v: (cm[1] || '').trim(), sub: join(unverified ? 'Payment not verified' : /^yes\b/i.test(k(s.payment_verified)) ? 'Payment verified' : '', rating ? `\u2605 ${rating[1]} (${rating[2]})` : '', since ? 'since ' + since : ''), tone: unverified ? 'bad' : '' },
    { k: 'Client spend', v: money(s.total_spent), sub: join(k(s.hires) ? `${k(s.hires)} hires` : '', Number.isFinite(hr) ? `${hr}% hire rate` : '', k(s.jobs_posted) ? `${k(s.jobs_posted)} jobs` : ''),
      mark: Number.isFinite(hr) ? [`${hr}% hire rate`, hr >= 70 ? 'good' : hr < 40 ? 'bad' : ''] : null }, // the colour on the hire rate, not on the money
    { k: 'Avg paid', v: money(s.avg_hourly_paid), sub: k(s.avg_spend_per_hire) ? money(s.avg_spend_per_hire).replace(/^about\s+/i, '~').replace(/\s*\(.*\)$/, '') + ' per hire' : '' },
    { k: 'Competition', v: k(s.proposals) ? (bucket ? `${bucket} proposals` : `${k(s.proposals)} proposals`) : '', sub: join(k(s.interviewing) ? `${k(s.interviewing)} interviewing` : '', k(s.invites_sent) ? `${k(s.invites_sent)} invites` : ''), tone: props >= 50 || /50/.test(bucket || '') ? 'warn' : '' },
    { k: 'Connects', v: k(s.connects_cost), sub: k(s.posted) ? 'posted ' + k(s.posted).replace(/^posted\s+/i, '') : '' },
  ].filter((f) => f.v || f.sub).map((f) => { if (f.v) return f; const [first, ...rest] = f.sub.split(' \u00b7 '); return { ...f, v: first, sub: rest.join(' \u00b7 ') }; }); // no main value: its detail moves up
  const raw = { Budget: [s.budget, s.job_type, s.experience_level], Client: [s.client_country, s.payment_verified && 'Payment verified: ' + s.payment_verified, s.client_rating && 'Rating: ' + s.client_rating, s.member_since && 'Member since ' + s.member_since],
    'Client spend': [s.total_spent && 'Spent ' + s.total_spent, s.hires && s.hires + ' hires', s.hire_rate && 'Hire rate ' + s.hire_rate, s.jobs_posted && s.jobs_posted + ' jobs posted'], 'Avg paid': [s.avg_hourly_paid, s.avg_spend_per_hire && 'Per hire ' + s.avg_spend_per_hire],
    Competition: [s.proposals && 'Proposals ' + s.proposals, s.interviewing && 'Interviewing ' + s.interviewing, s.invites_sent && 'Invites sent ' + s.invites_sent], Connects: [s.connects_cost, s.posted && 'Posted ' + s.posted] };
  const subOf = (f) => { if (!f.mark || !f.mark[1] || !f.sub.includes(f.mark[0])) return f.sub; const [a, b] = f.sub.split(f.mark[0]); return [a, h('span', { class: 'tone-' + f.mark[1] }, f.mark[0]), b]; };
  const factsRow = FACTS.length ? h('dl', { class: 'jp-facts' + (FACTS.length < 4 ? ' few' : ''), style: `--n:${FACTS.length}` }, FACTS.map((f) => h('div', { class: f.tone || null, title: (raw[f.k] || []).filter(known).map((x) => cap(String(x))).join('\n') },
    h('dt', {}, f.k), h('dd', {}, f.v), f.sub ? h('div', { class: 'jp-fsub' }, subOf(f)) : null))) : null;
  return [
    h('a', { href: lastList.history, class: 'jp-back' }, icon('back'), 'Jobs'),
    h('div', { class: 'jp-headmain' },
      h('div', { class: 'jp-title' }, h('h1', {}, title), s.verdict ? verdictBadge(s.verdict) : null,
        label ? h('span', { class: 'jp-stage' }, n ? `Step ${n} of 5 · ${label}` : label) : null),
      h('div', { class: 'jp-meta' }, bits.flatMap((b, i) => (i ? [sep(), b] : [b])))),
    factsRow,
  ];
}

/** Which gate instructions version and which rules screened this job; click to see the rules exactly as they were applied. */
function gateChip(s) {
  if (!s.skill_version) return null;
  const rules = s.gate_rules;
  if (!rules) return h('span', { title: 'Screened before the rules were kept with each job' }, 'Gate v' + s.skill_version);
  const show = () => modal({ title: `Rules this job was screened against`, noConfirm: true, wide: true, body: h('div', {},
    h('p', { class: 'muted', style: 'margin-top:0' }, `Gate instructions version ${s.skill_version}, with these ${rules.length} rules as they were worded at the time.`),
    ['fail', 'flag'].map((t) => h('div', {}, h('h3', {}, t === 'fail' ? 'FAIL rules' : 'FLAG rules'), h('ul', { class: 'plain' }, rules.filter((r) => r.type === t).map((r) =>
      h('li', { style: 'margin-bottom:6px' }, h('strong', { class: 'mono' }, r.code), ' ', r.rule, r.details ? h('div', { class: 'small muted' }, 'How to apply: ' + r.details) : null))))))
  });
  return h('button', { type: 'button', class: 'linkbtn', title: 'See the rules this job was screened against', onclick: show }, `Gate v${s.skill_version} · ${rules.length} rules`);
}

// ---------- one page per job, in tabs: Overview, Job post, the five steps, History ----------
// Design rules (keep them when you change this page):
// 1. Every page-level button sits in one place: the right end of the tab row, which stays on screen. Sections hand their
//    buttons to setActions(); nothing else puts buttons in the header, in a bottom bar or in a card. Controls that belong to
//    a widget (the chat's Send, the version picker, a collapsible panel's own control) stay in that widget.
// 2. A button appears only when pressing it does something; nothing is shown greyed out. A missing input is explained inline.
// 3. Each tab opens with what the decision needs; supporting detail comes after, collapsed when long.
const JOBPAGE_TABS = [['overview', 'Overview'], ['post', 'Job post'], ['screening', 'Screening', 0], ['projects', 'Projects', 1], ['profile', 'Profile', 2],
  ['proposal', 'Proposal', 3], ['history', 'History']];
// no Tracking tab (13 October): the proposal is marked sent from the Proposal tab; Overview shows the status and the details
const STEP_TAB = ['screening', 'projects', 'profile', 'proposal', 'overview'];
/** The tab a job opens on when it is waiting on you. */
const TAB_OF_STAGE = { screening: 'screening', failed: 'screening', decide: 'screening', projects: 'projects', profile: 'profile', type: 'proposal', writing: 'proposal', review: 'proposal' };
/** The tab row's button slot, set while a job page is on screen. */
let tabActions = null, tabGen = 0;
const setActions = (...btns) => { if (tabActions) tabActions(btns.flat().filter(Boolean)); };
/** A section's own setter: it only works while the tab that built the section is still on screen, so a section that finishes
 *  loading after you switched tabs can never put its buttons on another tab. */
const actionsFor = () => { const g = tabGen; return (...btns) => { if (g === tabGen) setActions(...btns); }; };
const actBtn = (label, onclick, primary = false) => h('button', { class: 'btn sm' + (primary ? ' primary' : ''), type: 'button', onclick }, label);

async function jobPage(id, want) {
  let { screening: s, override, matching, proposal, attachments, client } = await api('GET', '/screenings/' + id);
  if (!new RegExp(`^#/s/${id}(/|$|[?])`).test(location.hash)) return; // you moved on while this job loaded: never draw it over the next page
  const owner = s.user_id === me.id, canEdit = owner || me.role === 'admin' || me.role === 'manager';
  let st = stepState(matching, proposal), stage = stageOf(s, matching, proposal);
  const stepOf = (k) => STEP_TAB.indexOf(k);
  const defaultTab = () => (Number(s.auto_mode) && s.auto_state === 'running' ? 'overview' : s.status !== 'done' ? 'screening' : (owner && TAB_OF_STAGE[stage]) || 'overview');
  let tab = JOBPAGE_TABS.some(([k]) => k === want) ? want : defaultTab();
  if (stepOf(tab) > 0 && stepOf(tab) < 4 && !st.unlocked[stepOf(tab)]) tab = defaultTab();
  const tabsEl = h('div', { class: 'jobtabs', role: 'tablist', 'aria-label': 'Job sections' });
  const actionsEl = h('div', { class: 'jobacts' });
  const bar = h('div', { class: 'jobbar' }, tabsEl, actionsEl);
  const content = h('div', { class: 'jobtab' });
  const headEl = h('div', { class: 'jobhead' });
  let active = null;
  tabActions = (btns) => actionsEl.replaceChildren(...btns);

  const leaveOk = async () => !(active && active.__dirty && active.__dirty()) || ask('Leave without saving?', 'You have unsaved changes in the proposal. They are lost if you leave this tab.', 'Leave this tab', true);
  async function setTab(k) {
    if (k !== tab && !(await leaveOk())) return;
    tab = k; history.replaceState(null, '', `#/s/${id}/${k}`);
    drawTabs(); drawContent(); window.scrollTo({ top: 0 });
  }
  async function refresh() {
    const d = await api('GET', '/screenings/' + id);
    s = d.screening; override = d.override; matching = d.matching; proposal = d.proposal; attachments = d.attachments; client = d.client;
    st = stepState(matching, proposal); stage = stageOf(s, matching, proposal); drawTabs();
    headEl.replaceChildren(...jobHeader(s, stage)); // the step and status in the header follow too
  }
  stepCtx = { go: (n) => setTab(STEP_TAB[n]), refresh, advanceTo: async (n) => { await refresh(); active = null; await setTab(STEP_TAB[n]); } };
  const statusUpdate = () => statusDialog(id, async () => { await refresh(); drawContent(); });

  function drawTabs() {
    tabsEl.replaceChildren(...JOBPAGE_TABS.map(([k, label, n]) => {
      const step = n !== undefined, locked = step && !st.unlocked[n], done = step && st.done[n];
      return h('button', { type: 'button', role: 'tab', class: 'jt' + (k === tab ? ' on' : '') + (done ? ' done' : ''), 'aria-selected': k === tab, 'aria-disabled': locked || null,
        title: locked ? 'Finish the earlier steps first' : null, onclick: () => { if (locked) toast('Finish the earlier steps first'); else setTab(k); } },
        step ? (done ? icon('check') : h('span', { class: 'jn' }, String(n + 1) + '.')) : null, label);
    }));
  }

  /** R106 (Hamza): a client we have seen before: the other jobs from the same Upwork client, who had them and how each went. */
  /** R106, R112: the client, for the column beside the overview: who they are, their other jobs with us and how each went, why matched. */
  function clientCard() {
    if (!client) return null;
    const who = client.name || client.company || client.contact_name, n = (client.jobs || []).length;
    if (!n && !who && !client.notes) return null;
    const how = (j) => j.outcome || (j.interviewed === 'yes' ? 'Interview' : j.client_replied === 'yes' ? 'Chat opened' : j.client_viewed === 'yes' ? 'Viewed' : j.sent_at ? 'Sent' : j.proceeded === 'no' ? 'Skipped' : j.continued ? 'In progress' : 'Screened');
    const reasons = [...new Set(client.jobs.flatMap((j) => j.why || []))];
    return h('div', { class: 'card card-pad ovside clientcard' },
      h('div', { class: 'row spread', style: 'gap:8px' }, h('h3', { class: 'section-title', style: 'margin:0' }, n ? 'Returning client' : 'Client'), h('span', { class: 'cidchip' + (n ? ' ret' : '') }, clientId(client.id))),
      h('div', { class: 'small muted', style: 'margin-top:4px' }, [who, client.country, client.member_since ? 'member since ' + client.member_since : null].filter(Boolean).join(' \u00b7 ') || ''),
      n ? h('div', { class: 'ovjobs' }, client.jobs.slice(0, 5).map((j) => h(j.can_open ? 'a' : 'div', { class: 'ovjob', href: j.can_open ? '#/s/' + j.id : null, title: j.title || '' },
        h('div', { class: 'clclip', style: 'color:var(--text);font-weight:500' }, j.title || 'Untitled'),
        h('div', { class: 'small muted' }, `#${j.id} \u00b7 ${dayText(j.created_at)} \u00b7 ${j.profile_name || j.user_name} \u00b7 `, h('span', { class: 'ovhow' }, how(j)))))) : null,
      n > 5 ? h('div', { class: 'small muted' }, `and ${n - 5} more`) : null,
      reasons.length ? h('div', { class: 'small faint', style: 'margin-top:8px' }, 'Joined because ' + reasons.join('; ') + '.') : null,
      client.notes ? h('div', { class: 'small ovnote' }, client.notes) : null,
      h('a', { class: 'btn sm', style: 'margin-top:10px;align-self:flex-start', href: '#/clients/' + client.id }, 'Client profile'));
  }
  /** R112: why the gate said what it said, beside the decision, so the overview shows the flags themselves, not only their codes. */
  function gateCard() {
    const j = s.report && s.report.jobs && s.report.jobs[0];
    if (!j || !s.verdict) return null;
    const items = [...(j.fails || []).map((x) => ({ ...x, kind: 'FAIL' })), ...(j.flags || []).map((x) => ({ ...x, kind: 'FLAG' }))];
    const decision = override ? `Continued past the ${vword(override.verdict_at_time)}` : matching && matching.continued ? 'Continued' : s.proceeded === 'no' ? 'Skipped: ' + skipWhy(s) : 'No decision yet';
    return h('div', { class: 'card card-pad' },
      h('div', { class: 'row spread', style: 'gap:10px;flex-wrap:wrap' }, h('div', { class: 'row', style: 'gap:10px' }, verdictBadge(s.verdict), h('strong', {}, decision)),
        h('button', { class: 'linkbtn small', type: 'button', onclick: () => setTab('screening') }, 'Open the screening')),
      override && override.reason ? h('p', { class: 'small muted', style: 'margin:6px 0 0' }, override.reason) : null,
      items.length ? h('div', { class: 'ovflags' }, items.slice(0, 8).map((x) => h('div', { class: 'ovflag' }, h('span', { class: 'pill ' + x.kind }, x.code || x.kind), h('div', {}, h('span', { class: 'ovrule' }, x.rule || ''), x.value ? h('span', { class: 'muted' }, ': ' + x.value) : null)))) : null,
      items.length > 8 ? h('div', { class: 'small muted', style: 'margin-top:6px' }, `and ${items.length - 8} more on the screening`) : null);
  }

  // ---- Overview: where it stands, what is next (its button is in the tab row), and the facts that have a value
  function overviewTab() {
    const who = owner ? '' : ` Waiting for ${s.user_name}.`;
    const next = {
      screening: ['Screening this job', 'This takes about a minute.'],
      failed: ['The screening did not finish', s.error_message || ''],
      decide: ['Decide: continue or skip', `The gate says ${vword(s.verdict)}${s.rule_codes ? ' (' + s.rule_codes + ')' : ''}.${who}`],
      projects: ['Pick the projects', 'Choose the projects the proposal will show.' + who],
      profile: ['Pick the profile', 'Choose the Upwork profile that sends it.' + who],
      type: ['Pick the proposal type', 'Choose how the proposal is written. The types that suit this job come first.' + who],
      writing: ['The proposal is being written', 'A few minutes. You can leave this page.'],
      review: ['Review the proposal', 'Read it, edit it or ask the AI, then send it on Upwork and press Save and mark sent.' + who],
      ready: ['Ready to send', 'Send it on Upwork, then mark it as sent.'],
      submitted: ['Waiting on the client', 'Record what happens: viewed, chat, interview, outcome.'],
      closed: [`Closed: ${s.outcome || 'done'}`, s.outcome_reason ? s.outcome_reason + (s.outcome_note ? ': ' + s.outcome_note : '') : ''],
      skipped: ['Skipped', skipWhy(s)],
    }[stage] || ['', ''];
    const go = (k, label) => actBtn(label, () => setTab(k), true);
    const discard = me.role !== 'admin' ? null : s.discarded_at ? actBtn('Restore job', () => restoreJob(id, async () => { await refresh(); route(); }), true)
      : actBtn('Discard job', () => discardJob(id, s.title || 'This job', async () => { location.hash = lastList.history; }));
    setActions(discard, s.discarded_at ? null : {
      failed: owner && go('screening', 'Open screening'), decide: owner && go('screening', 'Decide'), projects: owner && go('projects', 'Pick projects'),
      profile: owner && go('profile', 'Pick profile'), type: owner && go('proposal', 'Pick proposal type'), writing: go('proposal', 'Open the proposal'), review: owner && go('proposal', 'Review proposal'),
      ready: canEdit && actBtn('Mark as sent', () => sentDialog(s, async () => { await refresh(); drawContent(); }), true), submitted: canEdit && actBtn('Update status', statusUpdate, true), closed: canEdit && actBtn('Update status', statusUpdate),
    }[stage] || null, canEdit && ['ready', 'submitted', 'closed'].includes(stage) && !s.discarded_at ? actBtn('Edit details', editDetails) : null);
    const chosen = matching && matching.confirmed_at ? matching.matches.filter((x) => x.selected) : [];
    const toProposal = proposal && proposal.finished_at && s.source !== 'claude_plugin' ? Math.round((toDate(proposal.finished_at) - toDate(s.created_at)) / 1000) : null;
    const status = s.outcome && s.outcome !== 'Pending' ? s.outcome : s.interviewed === 'yes' ? 'Interview' : s.client_replied === 'yes' ? 'Chat opened' : s.client_viewed === 'yes' ? 'Viewed' : s.proposal_sent_at || s.proposal_sent_date ? 'Sent' : null;
    const facts = [
      ['Projects', chosen.length ? chosen.map((x) => x.project_name).join(', ') : null],
      ['Profile', matching && matching.proposal_profile ? matching.proposal_profile.name : null],
      ['Proposal type', proposal && proposal.template ? proposal.template.name : null],
      ['Proposal', proposal ? (proposal.finalized_at ? 'Finished ' + agoIn(proposal.finalized_at) : proposal.status === 'done' ? 'Written, not finished' : null) : null],
      ['Status', status], ['Invite', s.invite ? 'Yes, the client invited us' : null], ['Sent', s.proposal_sent_date ? dayText(s.proposal_sent_date) + (proposal && proposal.sent_version_no ? ` · version ${proposal.sent_version_no}` : '') : null],
      // R104: the opening the proposal went out with (the one picked, else its type's default)
      ['Opening', proposal && proposal.openings && (proposal.openings.used != null || proposal.openings.default) ? (proposal.openings.used != null && proposal.openings.items[proposal.openings.used] ? proposal.openings.items[proposal.openings.used].style : proposal.openings.default) : null],
      ['Connects', s.connects_spent != null ? `${s.connects_spent}${s.boost_connects ? ' + ' + s.boost_connects + ' boost' : ''}` : null],
      ['Paste to proposal', toProposal != null && toProposal >= 0 ? mins(toProposal) : null],
      ['Client location', s.client_country], ['Budget', s.budget], ['Hire rate', s.hire_rate], ['Avg hourly paid', s.avg_hourly_paid],
    ].filter(([, v]) => v);
    const nextEl = next[0] && !(Number(s.auto_mode) && s.auto_state === 'running') ? h('div', { class: 'card card-pad nextline' }, h('div', { class: 'jp-sec' }, next[0]), next[1] ? h('div', { class: 'jp-label' }, next[1]) : null) : null;
    const factsEl = facts.length ? h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'The job so far'), h('dl', { class: 'facts' }, facts.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, cap(v)))))) : null;
    const side = clientCard();
    const main = h('div', { class: 'stack' }, Number(s.auto_mode) && s.auto_state ? autoCard() : null, gateCard(), factsEl, ['ready', 'submitted', 'closed'].includes(stage) ? trackingCard() : null);
    return h('div', { class: 'stack' },
      s.discarded_at ? h('div', { class: 'warnbox' }, h('strong', {}, icon('warn'), 'This job is discarded'),
        h('div', { style: 'margin-top:4px' }, `It is hidden from every list, count, report and export, and from Claude. Discarded ${full(s.discarded_at)}${s.discarded_by_name ? ' by ' + s.discarded_by_name : ''}${s.discard_reason ? ': ' + s.discard_reason : '.'}`)) : null,
      nextEl, side ? h('div', { class: 'opgrid ovgrid' }, main, h('div', { class: 'stack', style: 'gap:14px' }, side)) : main);
  }

  // ---- auto mode (R75): each step as it is done for you; the proposal opens by itself when it is written
  function autoCard() {
    const chosen = matching && matching.confirmed_at ? matching.matches.filter((x) => x.selected).map((x) => x.project_name) : [];
    const pstat = proposal ? proposal.status : null;
    const step = (done, busy, title, detail) => h('li', { class: 'autostep' + (done ? ' done' : busy ? ' busy' : '') },
      h('span', { class: 'autoicon' }, done ? icon('check') : busy ? h('span', { class: 'spin' }) : h('span', { class: 'dot' })), h('div', {}, h('strong', {}, title), detail ? h('div', { class: 'jp-label' }, detail) : null));
    const screened = s.status === 'done', continued = !!(matching && matching.continued);
    const matched = !!(matching && matching.confirmed_at), profiled = !!(matching && matching.proposal_profile), written = pstat === 'done';
    const stopped = s.auto_state === 'stopped';
    const card = h('div', { class: 'card card-pad autocard' + (stopped ? ' stopped' : '') },
      h('div', { class: 'row spread' }, h('div', { class: 'jp-sec' }, stopped ? 'Auto mode stopped' : s.auto_state === 'done' ? 'Written in auto mode' : 'Auto mode: writing the proposal for you'),
        s.auto_state === 'done' ? actBtn('Open the proposal', () => setTab('proposal'), true) : null),
      stopped && s.auto_note ? h('div', { class: 'warnbox', style: 'margin:8px 0' }, h('strong', {}, icon('warn'), s.auto_note)) : null,
      h('ol', { class: 'autosteps' },
        step(screened, !screened, 'Screening', screened ? `${cap(vword(s.verdict))}${s.rule_codes ? ' · ' + s.rule_codes : ''}${s.verdict === 'FLAG' && continued ? ': continued by auto mode' : ''}` : 'Checking the job against the rules'),
        step(matched, screened && continued && !matched && !stopped, 'Projects', matched ? chosen.join(', ') : 'The recommended projects'),
        step(profiled && matched, false, 'Profile', profiled && matched ? matching.proposal_profile.name : 'The profile whose services fit the job'),
        step(written, matched && !written && !stopped, 'Proposal', written ? (proposal.template ? proposal.template.name : 'Written') : pstat === 'error' ? 'Could not be written' : 'The suggested proposal type, then the writing')));
    if (s.auto_state === 'running') return autoProgress(); // R97: the steps, a moving bar and the time left, as on the proposal page
    return card;
  }
  /**
   * R97 (Ahmad): auto mode as it happens: screening, projects, profile and the proposal (with its own steps), a bar that keeps moving,
   * the time so far and about how long is left (from how long jobs in auto mode took here). Only this card is redrawn.
   */
  let autoProg = { key: null, since: 0, pct: 0, at: 0 };
  function autoProgress() { // R101: the same plain loader as everywhere, inside the auto mode card
    const screened = s.status === 'done', matched = !!(matching && matching.confirmed_at);
    const sub = proposal && proposal.status !== 'queued' && ['signals', 'template', 'writing', 'checking'].includes(proposal.stage) ? proposal.stage : 'signals';
    const key = !screened ? 'screening' : !matched || !proposal ? 'projects' : 'p:' + sub;
    const card = h('div', { class: 'card card-pad autold' }, liveLoader({ id: 'auto-' + s.id, title: 'Auto mode: writing the proposal for you', typical: s.auto_typical_seconds, elapsed: s.auto_elapsed_seconds, stage: () => key,
      steps: [{ key: 'screening', label: 'Screening the job', share: 2 }, { key: 'projects', label: 'Picking the projects and the profile', share: 2 }, { key: 'p:signals', label: 'Reading the job for the proposal', share: 1 },
        { key: 'p:template', label: 'Choosing the proposal type', share: 0.5 }, { key: 'p:writing', label: 'Writing the proposal', share: 2.5 }, { key: 'p:checking', label: 'Checking it', share: 0.7 }] }));
    // the data every few seconds; only this card is swapped, the rest of the page stays as it is
    const tick = async () => {
      if (!card.isConnected) return;
      try { await refresh(); } catch { return void setTimeout(tick, 4000); }
      if (!card.isConnected) return;
      if (s.auto_state === 'done' && tab === 'overview') { autoProg = { key: null, since: 0, pct: 0, at: 0 }; return void setTab('proposal'); }
      if (s.auto_state !== 'running') return void drawContent(); // stopped: the summary, with why
      card.replaceWith(autoProgress());
    };
    setTimeout(tick, 3000);
    return card;
  }

  // ---- what happened after sending: the status history, Connects, boost, the Loom video and notes (on Overview)
  function trackingCard() {
    const box = h('div', { class: 'card card-pad' }, h('div', { class: 'skel', style: 'width:50%' }));
    api('GET', `/screenings/${id}/status`).then((d) => {
      if (!box.isConnected) return;
      box.replaceChildren(h('div', { class: 'jp-sec' }, 'Tracking'),
        h('div', { class: 'jp-label', style: 'margin-bottom:8px' }, d.current ? 'Status now: ' + d.current : 'Not marked as sent yet.'),
        d.events.length ? h('ol', { class: 'statuslist' }, d.events.map((e) => h('li', {}, h('span', { class: 'jp-sec' }, e.status),
          h('span', { class: 'jp-label' }, ` ${full(e.happened_at)}${e.user_name ? ' · ' + e.user_name : ''}`), e.reason ? h('div', { class: 'jp-label' }, e.reason + (e.note ? ': ' + e.note : '')) : null))) : null,
        h('dl', { class: 'facts', style: 'margin-top:10px' }, [['Invite', s.invite ? 'Yes' : 'No'], ['Connects spent', s.connects_spent], ['Boost', s.boost_connects], ['Loom video', s.loom_video_title], ['Notes', s.notes]].map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', { class: v == null || v === '' ? 'ns' : '' }, v == null || v === '' ? 'Not recorded' : String(v))))));
    }).catch((x) => box.replaceChildren(h('p', { class: 'err' }, x.message)));
    return box;
  }
  const editDetails = () => detailsDialog(s, async () => { await refresh(); drawContent(); });

  // ---- the projects that fit, the same list as the Projects step (one list, so screening and the projects never disagree)
  function fitProjectsCard() {
    const box = h('div', { class: 'card card-pad' });
    const draw = (mm) => {
      const busy = mm && (mm.status === 'queued' || mm.status === 'running');
      const top = mm && mm.status === 'done' ? mm.matches.filter((x) => !x.extra).slice(0, cfg('matching.shown', 5)) : [];
      box.replaceChildren(h('div', { class: 'jp-sec' }, 'Projects that fit'),
        busy ? h('div', { style: 'margin-top:6px' }, liveLine({ id: 'fitp-' + s.id, label: 'Finding the projects that fit this job', now: 'Weighing ', typical: (LOADER_FACTS && LOADER_FACTS.typical.matching) || 60, items: LOADER_FACTS ? LOADER_FACTS.projects : [], hint: 'They appear here in a minute or two' }))
          : top.length ? h('ol', { class: 'jp-list', style: 'margin-top:6px' }, top.map((x) => h('li', {}, h('strong', {}, x.project_name), x.recommended ? h('span', { class: 'tagpill', style: 'margin-left:6px' }, 'Recommended') : null,
              x.ai_reason ? h('div', { class: 'jp-label' }, x.ai_reason) : null)))
          : h('p', { class: 'jp-label', style: 'margin:6px 0 0' }, mm && mm.status === 'done' ? 'No project in the library proves this kind of work.' : 'The projects are found once you continue with this job.'),
        top.length ? h('div', { class: 'jp-label', style: 'margin-top:6px' }, 'The same list as the Projects step, where you choose the ones to use.') : null);
      if (busy) setTimeout(async () => { if (!box.isConnected) return; try { draw((await api('GET', `/screenings/${id}/matching`)).matching); } catch { /* next time */ } }, 1500);
    };
    draw(matching);
    return box;
  }

  // ---- Screening: the verdict, the flags and the decision first; the job, client and competition facts after, collapsed
  function screeningTab() {
    if (s.status === 'queued' || s.status === 'running') return h('div', { class: 'stack' }, progressCard(s.status, s));
    if (s.status === 'error') {
      if (owner) setActions(actBtn('Paste the text instead', () => { location.hash = '#/new'; }), actBtn('Try again', async (e) => { btnBusy(e.currentTarget, 'Retrying'); try { await api('POST', `/screenings/${id}/retry`, {}); route(); } catch (x) { toast(x.message, true); } }, true));
      return h('div', { class: 'card card-pad' }, h('div', { class: 'jp-sec' }, 'The screening did not finish'), h('p', { class: 'jp-body' }, s.error_message || 'Something went wrong.'));
    }
    if (!s.report) return h('div', { class: 'card card-pad' }, h('p', { class: 'jp-body' }, 'This job has no screening report.'));
    const j = s.report.jobs[0];
    const [title, sub] = VERDICT_TEXT[j.verdict];
    const decided = !!override || !!(matching && matching.continued);
    const parts = [];
    // the verdict, in one line
    parts.push(h('div', { class: 'card card-pad verdictline ' + j.verdict }, verdictBadge(j.verdict), h('div', {}, h('div', { class: 'jp-sec' }, title), h('div', { class: 'jp-label' }, sub))));
    const cc = clientCard(); if (cc) parts.push(cc); // R106: before the decision, say we know this client
    // the decision
    if (decided) {
      parts.push(h('div', { class: 'card card-pad' }, h('div', { class: 'jp-sec' }, override ? `Continued despite the ${vword(override.verdict_at_time)}` : 'Continued'),
        override ? h('p', { class: 'jp-body', style: 'margin:6px 0 0' }, override.reason) : null,
        h('div', { class: 'jp-label' }, override ? `${override.user_name} · ${full(override.created_at)}` : 'Taken forward to the projects.')));
    } else if (!owner) {
      parts.push(h('div', { class: 'card card-pad' }, h('p', { class: 'jp-body', style: 'margin:0' }, s.proceeded === 'no' ? 'Skipped: ' + skipWhy(s) : `No decision yet. Only ${s.user_name} can continue with this job.`)));
    } else {
      const needReason = j.verdict !== 'PASS', minLen = cfg('override.min_reason', 15);
      const ta = needReason ? h('textarea', { id: 'why', style: 'min-height:84px', placeholder: 'For example: the client has a strong history with us, and the scope was clarified on a call.' }) : null;
      const err = h('div', { class: 'err', hidden: true });
      const fail = (msg) => { err.replaceChildren(icon('x'), msg); err.hidden = false; if (ta) ta.focus(); };
      // quick reasons: a click writes one into the box, a second click takes it out; words can be added around them. R96: first the
      // ones written for this job from its fit summary, then the stock ones from Settings
      const reasonChip = (r) => { const b = h('button', { type: 'button', class: 'tagbtn', 'aria-pressed': 'false' }, r);
        b.onclick = () => {
          const parts = ta.value.split(/(?<=\.)\s+/).map((x) => x.trim()).filter(Boolean), at = parts.findIndex((x) => x.replace(/\.$/, '') === r);
          if (at >= 0) parts.splice(at, 1); else { if (parts.length && !/[.!?]$/.test(parts[parts.length - 1])) parts[parts.length - 1] += '.'; parts.push(r + '.'); }
          ta.value = parts.join(' ') + (parts.length ? ' ' : ''); ta.dispatchEvent(new Event('input')); ta.focus();
        };
        return b; };
      let fitReasons = s.fit_reasons || [], fitStatus = s.fit_reasons_status;
      const fitBox = h('div', { class: 'fitreasons' });
      const drawFit = () => {
        const writing = fitStatus === 'queued' || fitStatus === 'running';
        fitBox.replaceChildren(h('div', { class: 'jp-label' }, 'From the fit with ' + cfg('company.name', 'us')),
          fitReasons.length ? h('div', { class: 'chips' }, fitReasons.map(reasonChip))
            : writing ? liveLine({ id: 'fit-' + s.id, label: 'Writing reasons from the fit summary', now: 'Answering ', typical: 12, items: [...(j.flags || []), ...(j.fails || [])].map((x) => `${x.code} ${x.rule}`) })
              : h('div', { class: 'faint small' }, fitStatus === 'error' ? 'They could not be written this time; the reasons below still work.' : 'None for this job.'));
        markPicks();
      };
      // a job screened before R96 asks for its reasons now; then the panel checks back quietly, nothing else is redrawn
      const watchFit = async (tries = 0) => {
        if (!fitBox.isConnected && tries > 0) return;
        try { const r = await api('GET', `/screenings/${s.id}/fit-reasons`); fitStatus = r.status; fitReasons = r.reasons || []; drawFit(); } catch { /* next time */ }
        if ((fitStatus === 'queued' || fitStatus === 'running') && tries < 60) setTimeout(() => watchFit(tries + 1), 2000);
      };
      const stock = h('div', {}, h('div', { class: 'jp-label' }, 'Other reasons'), h('div', { class: 'chips' }, cfg('override.reasons', []).map(reasonChip)));
      const picks = needReason ? h('div', { class: 'reasonpicks' }, fitBox, stock) : null;
      const allReasons = () => [...fitReasons, ...cfg('override.reasons', [])];
      const markPicks = () => picks && picks.querySelectorAll('.tagbtn').forEach((x) => { const on = ta.value.split(/(?<=\.)\s+/).some((p) => p.trim().replace(/\.$/, '') === x.textContent); x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
      if (needReason) {
        drawFit();
        if (!fitReasons.length && fitStatus !== 'error' && fitStatus !== 'done') (fitStatus ? Promise.resolve() : api('POST', `/screenings/${s.id}/fit-reasons`, {}).then((r) => { if (r.queued) fitStatus = 'queued'; drawFit(); })).then(() => setTimeout(() => watchFit(1), 1500)).catch(() => undefined);
      }
      if (ta) ta.oninput = () => { err.hidden = true; markPicks(); };
      const cont = actBtn('Continue', async (e) => {
        const reason = ta ? ta.value.trim() : '';
        if (needReason && reason.length < minLen) return fail(`Write why you continue (at least ${minLen} characters). It stays on record.`);
        const b = e.currentTarget; btnBusy(b, 'Continuing');
        // the quick reasons in the box are sent as a list too, so the Flag review can count them per rule
        const picked = needReason ? allReasons().filter((r) => reason.split(/(?<=\.)\s+/).some((p) => p.trim().replace(/\.$/, '') === r)) : [];
        try { await api('POST', `/screenings/${s.id}/${needReason ? 'override' : 'continue'}`, needReason ? { reason, picks: picked } : {}); await stepCtx.advanceTo(1); }
        catch (x) { fail(x.message); b.disabled = false; b.replaceChildren('Continue'); }
      }, true);
      // skipping asks why: a quick reason, a note, or both, kept with the job for reports
      const skip = actBtn('Skip', () => {
        let pick = '';
        const chips = h('div', { class: 'chips' }, cfg('skip.reasons', []).map((r) => {
          const b = h('button', { type: 'button', class: 'tagbtn', 'aria-pressed': 'false' }, r);
          b.onclick = () => { pick = pick === r ? '' : r; chips.querySelectorAll('.tagbtn').forEach((x) => { const on = x.textContent === pick; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }); };
          return b;
        }));
        const note = h('textarea', { id: 'skipnote', maxlength: 2000, style: 'min-height:72px', placeholder: 'Anything else worth knowing (optional when a reason is picked)' });
        modal({ title: 'Why skip this job?', confirm: 'Skip job', body: h('div', {},
          h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Quick reason'), chips),
          h('div', { class: 'field', style: 'margin-top:14px' }, h('label', { class: 'lbl', for: 'skipnote' }, 'Note'), note),
          h('div', { class: 'hint' }, 'Kept with the job, so skipped jobs can be reported on.')),
          onConfirm: async () => {
            if (!pick && !note.value.trim()) throw new Error('Pick a reason or write a note.');
            await api('PATCH', `/screenings/${s.id}/tracking`, { proceeded: 'no', skip_reason: pick || null, skip_note: note.value.trim() || null });
            toast('Skipped. It is under Not pursued.'); await refresh(); drawContent();
          } });
      });
      setActions(s.proceeded === 'no' ? null : skip, cont);
      parts.push(h('div', { class: 'card card-pad' },
        h('div', { class: 'jp-sec' }, s.proceeded === 'no' ? 'You skipped this job. Continue anyway?' : needReason ? `Continue despite the ${vword(j.verdict)}?` : 'Continue with this job?'),
        s.proceeded === 'no' ? h('p', { class: 'jp-body', style: 'margin:4px 0 6px' }, 'Skipped because: ' + skipWhy(s)) : null,
        h('div', { class: 'jp-label', style: 'margin-bottom:10px' }, needReason ? 'Pick a quick reason, write your own, or both. The reason stays on record, visible to managers and admins. Continue and Skip are at the top right.' : 'Continue to match it with projects, or skip it. The buttons are at the top right.'),
        picks, ta, err));
    }
    if (j.fails.length) parts.push(h('div', { class: 'card card-pad' }, h('div', { class: 'jp-sec' }, `Failed rules (${j.fails.length})`), issues(j.fails, 'fail'),
      j.override_note ? h('p', { class: 'jp-label', style: 'margin-top:10px' }, j.override_note) : null));
    if (j.flags.length) parts.push(h('div', { class: 'card card-pad' }, h('div', { class: 'jp-sec' }, `Flags (${j.flags.length})`), issues(j.flags, 'flag')));
    parts.push(fitProjectsCard());
    parts.push(h('div', { class: 'card card-pad' }, h('div', { class: 'jp-sec' }, 'Fit with ' + cfg('company.name', 'us')), h('p', { class: 'jp-body', style: 'margin:6px 0 0' }, j.fit),
      j.proposal_notes.length ? [h('div', { class: 'jp-sec', style: 'margin-top:14px' }, 'Notes for the proposal'), h('ul', { class: 'jp-list' }, j.proposal_notes.map((n) => h('li', {}, n)))] : null));
    const facts = (t, rows) => h('div', {}, h('div', { class: 'jp-label', style: 'margin-bottom:6px' }, t),
      h('dl', { class: 'facts one' }, rows.map((r) => h('div', {}, h('dt', {}, r.label), h('dd', { class: /^not shown$/i.test(r.value.trim()) ? 'ns' : '' }, cap(r.value))))));
    parts.push(h('details', { class: 'card fold' }, h('summary', {}, 'Job, client and competition'),
      h('div', { class: 'card-pad threecol' }, facts('Job', j.job), facts('Client', j.client), facts('Competition', j.competition))));
    return h('div', { class: 'stack' }, parts);
  }

  // ---- Tracking: the status history; Update status and Edit details in the tab row
  function historyTab() {
    const tl = timelineCard(id); setTimeout(() => { tl.open = true; tl.dispatchEvent(new Event('toggle')); });
    return h('div', { class: 'stack' }, tl, h('details', { class: 'card fold' }, h('summary', {}, 'Record details'), recordDetails(s, override, matching, proposal)));
  }

  function drawContent() {
    active = null; tabGen++; setActions();
    const build = {
      overview: overviewTab, post: () => h('div', {}, attachmentsCard({ ...s, attachments }), postingCard(s, true, actionsFor())), screening: screeningTab,
      projects: () => (matching && matching.continued ? matchingSection(s, matching) : h('div', { class: 'card card-pad' }, h('p', { class: 'jp-body', style: 'margin:0' }, 'Decide on the Screening tab first.'))),
      profile: () => profileSection(s, matching), proposal: () => proposalSection(s, proposal, matching), history: historyTab,
    }[tab];
    const el = build(); content.replaceChildren(el); active = el;
  }

  if (s.status === 'queued' || s.status === 'running') setTimeout(() => { if (new RegExp(`^#/s/${id}(/|$|[?])`).test(location.hash)) route(); }, 1500);
  history.replaceState(null, '', `#/s/${id}/${tab}`);
  drawTabs(); drawContent();
  headEl.replaceChildren(...jobHeader(s, stage));
  shell('history', h('div', { class: 'jobpage' }, headEl, bar, content));
}

// ---------- industries ----------
function industryEditor(ind, projects, after) {
  const picked = new Set(ind ? ind.projects.map((p) => p.id) : []);
  const f = { name: h('input', { type: 'text', id: 'in', maxlength: 120, value: ind ? ind.name : '' }), desc: h('input', { type: 'text', id: 'id', maxlength: 500, value: ind && ind.description ? ind.description : '' }),
    related: h('input', { type: 'text', id: 'ir', maxlength: 500, value: ind && ind.related ? ind.related : '', placeholder: 'For example: Healthcare, Insurance' }),
    active: h('input', { type: 'checkbox', id: 'ia', checked: ind ? !!Number(ind.active) : true }) };
  modal({ title: ind ? 'Edit industry' : 'Add an industry', confirm: ind ? 'Save industry' : 'Add industry', wide: true,
    body: h('div', {}, h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'in' }, 'Industry name'), f.name),
      h('div', { class: 'field row', style: 'align-self:end;padding-bottom:8px' }, f.active, h('label', { for: 'ia', style: 'font-weight:600' }, 'Active'))),
      h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'id' }, 'Description (optional)'), f.desc),
      h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'ir' }, 'Related industries (optional)'), f.related,
        h('div', { class: 'hint' }, 'Industry names, separated by commas. For a job in this industry, projects from these come after projects from the same industry.')),
      h('div', { style: 'margin-top:16px' }, multiPick('Projects in this industry', projects, picked, 'Find a project'))),
    extra: ind ? () => h('button', { class: 'btn danger', type: 'button', onclick: () => modal({ title: 'Delete ' + ind.name + '?', confirm: 'Delete industry', danger: true,
      body: h('p', { class: 'muted' }, 'This removes the industry and unlinks it from its projects. The projects stay. It cannot be undone.'),
      onConfirm: async () => { await api('DELETE', '/industries/' + ind.id); document.querySelectorAll('dialog').forEach((d) => d.close()); toast('Industry deleted'); after(null); } }) }, 'Delete') : null,
    onConfirm: async () => {
      const r = await api(ind ? 'PATCH' : 'POST', ind ? '/industries/' + ind.id : '/industries', { name: f.name.value, description: f.desc.value.trim() || null, related: f.related.value.trim() || null, active: f.active.checked, project_ids: [...picked] });
      toast(ind ? 'Industry saved' : 'Industry added'); after(r.id);
    } });
}

async function industriesView() {
  const [{ industries }, { projects }] = await Promise.all([api('GET', '/industries'), api('GET', '/projects')]);
  const canEdit = canEditProjects();
  const open = (i) => () => { location.hash = '#/i/' + i.id; };
  const add = canEdit ? h('button', { class: 'btn primary', onclick: () => industryEditor(null, projects, () => route()) }, icon('screen'), 'Add industry') : null;
  shell('industries', [pageHead('Industries', `The industries ${cfg('company.name', 'the company')} has worked in.` + ' A project can belong to several industries, and an industry can have several projects.', add),
    listCard({ items: industries, icon: 'building', emptyTitle: 'No industries yet', emptyText: `Add the industries ${cfg('company.name', 'the company')} has worked in.`,
      search: { placeholder: 'Search industries', text: (i) => i.name + ' ' + (i.description || '') + ' ' + i.projects.map((p) => p.name).join(' ') },
      filters: [statusFilter((i) => i.active)],
      onSync: () => { lastList.industries = location.hash; },
      render: (slice) => dataTable(['Industry', 'Projects', 'Status', canEdit ? '' : null], slice.map((i) => h('tr', { class: 'click', tabindex: 0, onclick: open(i), onkeydown: (e) => { if (e.key === 'Enter') open(i)(); } },
        h('td', {}, h('strong', {}, i.name), i.description ? h('div', { class: 'meta' }, i.description.slice(0, 90)) : null),
        h('td', {}, i.projects.length ? h('div', { class: 'chips' }, i.projects.slice(0, 3).map((p) => h('span', { class: 'chip' }, p.name)),
          i.projects.length > 3 ? h('span', { class: 'chip', title: 'Show all ' + i.projects.length + ' projects' }, '+' + (i.projects.length - 3)) : null) : h('span', { class: 'faint' }, 'No projects yet')),
        h('td', {}, activeSwitch(i.active, { name: i.name, url: '/industries/' + i.id, can: canEdit, offText: 'It stays saved with its projects, but it is no longer offered when editing a project and its related industries are no longer used in matching.' })),
        canEdit ? acts(h('button', { class: 'btn sm', onclick: (e) => { e.stopPropagation(); industryEditor(i, projects, () => route()); } }, 'Edit')) : null))) })]);
}

async function industryDetailView(id) {
  const [{ industry: i }, { projects }] = await Promise.all([api('GET', '/industries/' + id), api('GET', '/projects')]);
  const canEdit = canEditProjects();
  shell('industries', [
    pageHead(i.name, `${i.projects.length} project${i.projects.length === 1 ? '' : 's'}`,
      canEdit ? h('button', { class: 'btn primary', onclick: () => industryEditor(i, projects, (nid) => (nid ? route() : (location.hash = lastList.industries))) }, 'Edit industry') : null,
      { back: [lastList.industries, 'Industries'], badges: onOff(i.active) }),
    i.description ? h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'About'), h('p', {}, i.description)) : null,
    i.related ? h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'Related industries'), h('p', {}, i.related)) : null,
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, `Projects (${i.projects.length})`),
      i.projects.length ? h('div', { class: 'chips' }, i.projects.map((p) => h('a', { class: 'chip brand', href: '#/p/' + p.id }, p.name))) : emptyState('folder', 'No projects yet', canEdit ? 'Edit the industry to add projects.' : 'No projects are linked to this industry yet.')),
  ]);
}

// ---------- tag dictionary (admin) ----------
async function dictionaryView() {
  const { categories } = await api('GET', '/tags');
  const hp = hashParams();
  const st = { tab: hp.tab === 'categories' ? 'categories' : 'tags' };
  const all = categories.flatMap((c) => c.tags.map((t) => ({ ...t, category: c.name })));
  const bodyEl = h('div', {});
  const tabsEl = h('div', { class: 'tabs', role: 'tablist' });
  const actionsEl = h('div', {});

  async function tagDialog(t) {
    // the projects that have this tag, picked with a search, as on the Industries page
    const { projects } = await api('GET', '/projects');
    const picked = new Set(t ? projects.filter((p) => p.tags.some((x) => x.id === t.id)).map((p) => p.id) : []);
    const f = { name: h('input', { type: 'text', id: 'tn1', maxlength: 120, value: t ? t.name : '' }),
      cat: h('select', { id: 'tc1', style: 'width:100%' }, categories.map((c) => h('option', { value: c.id, selected: t ? c.id === t.category_id : c.id === (Number(hashParams().cat) || categories[0].id) }, c.name))),
      score: h('input', { type: 'number', id: 'ts1', min: 0, max: 10, step: 1, value: t ? t.weight : 1 }), desc: h('input', { type: 'text', id: 'td1', maxlength: 500, value: t && t.description ? t.description : '' }),
      active: h('input', { type: 'checkbox', id: 'ta1', checked: t ? !!Number(t.active) : true }),
      practice: h('input', { type: 'checkbox', id: 'tpw1', checked: t ? !!Number(t.practice) : false }) };
    modal({ title: t ? 'Edit tag' : 'Add a tag', confirm: t ? 'Save tag' : 'Add tag', wide: true,
      body: h('div', {}, h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tn1' }, 'Tag name'), f.name), h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tc1' }, 'Category'), f.cat)),
        h('div', { class: 'grid2', style: 'margin-top:16px' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'ts1' }, 'Score (match weight, 0 to 10)'), f.score,
          h('div', { class: 'hint' }, 'What a shared tag is worth when jobs are matched to projects. 0 means the tag is ignored.')),
          h('div', { class: 'field', style: 'align-self:start;padding-top:24px;display:grid;gap:10px' },
            h('div', { class: 'row', style: 'gap:8px;flex-wrap:nowrap' }, f.active, h('label', { for: 'ta1', style: 'font-weight:600' }, 'Active (used for tagging jobs)')),
            h('div', { class: 'row', style: 'gap:8px;flex-wrap:nowrap;align-items:flex-start' }, f.practice, h('label', { for: 'tpw1' }, h('strong', {}, 'Practice-wide'), h('span', { class: 'hint', style: 'display:block;margin:2px 0 0' }, 'Applies to all our work, not one project (documentation, QA, Claude Code). Left out of project matching; the writer says it as how we work.'))))),
        h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'td1' }, 'What it means (shown to the model when it tags jobs)'), f.desc),
        h('div', { style: 'margin-top:16px' }, multiPick('Projects with this tag', projects.filter((p) => Number(p.active) || picked.has(p.id)), picked, 'Find a project'),
          h('div', { class: 'hint' }, 'Tick every project that did this kind of work. For an Industry tag, the project\'s industry follows on the Industries page.'))),
      extra: t ? () => h('button', { class: 'btn danger', type: 'button', onclick: () => modal({ title: 'Delete ' + t.name + '?', confirm: 'Delete tag', danger: true,
        body: h('p', { class: 'muted' }, t.project_count ? `${t.project_count} project${t.project_count === 1 ? ' uses' : 's use'} this tag, so it cannot be deleted. Remove it from them, or disable it instead.` : 'This removes the tag. Past job results keep its name. It cannot be undone.'),
        onConfirm: async () => { await api('DELETE', '/admin/tags/' + t.id); document.querySelectorAll('dialog').forEach((d) => d.close()); toast('Tag deleted'); route(); } }) }, 'Delete') : null,
      onConfirm: async () => {
        const body = { category_id: Number(f.cat.value), name: f.name.value, weight: Number(f.score.value), description: f.desc.value.trim() || null, active: f.active.checked, practice: f.practice.checked, project_ids: [...picked] };
        await api(t ? 'PATCH' : 'POST', t ? '/admin/tags/' + t.id : '/admin/tags', body); toast(t ? 'Tag saved' : 'Tag added'); route();
      } });
  }
  function categoryDialog(c) {
    const f = { name: h('input', { type: 'text', id: 'cn1', maxlength: 120, value: c ? c.name : '' }), order: h('input', { type: 'number', id: 'co1', min: 0, step: 1, value: c ? c.sort_order : categories.length + 1 }),
      comp: h('input', { type: 'checkbox', id: 'cc1', checked: c ? c.is_compliance : false }) };
    modal({ title: c ? 'Edit category' : 'Add a category', confirm: c ? 'Save category' : 'Add category',
      body: h('div', {}, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'cn1' }, 'Category name'), f.name),
        h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'co1' }, 'Order'), f.order, h('div', { class: 'hint' }, 'Smaller numbers come first.')),
        h('div', { class: 'field row' }, f.comp, h('label', { for: 'cc1', style: 'font-weight:600' }, 'This is a compliance category')),
        h('div', { class: 'hint' }, 'Tags in a compliance category (for example HIPAA) are only added to a job when the post states the requirement, and projects without them rank lower.')),
      extra: c ? () => h('button', { class: 'btn danger', type: 'button', onclick: () => modal({ title: 'Delete ' + c.name + '?', confirm: 'Delete category', danger: true,
        body: h('p', { class: 'muted' }, c.tags.length ? `This category still has ${c.tags.length} tag${c.tags.length === 1 ? '' : 's'}. Move or delete them first.` : 'This removes the empty category. It cannot be undone.'),
        onConfirm: async () => { await api('DELETE', '/admin/categories/' + c.id); document.querySelectorAll('dialog').forEach((d) => d.close()); toast('Category deleted'); route(); } }) }, 'Delete') : null,
      onConfirm: async () => { const body = { name: f.name.value, sort_order: Number(f.order.value), is_compliance: f.comp.checked }; await api(c ? 'PATCH' : 'POST', c ? '/admin/categories/' + c.id : '/admin/categories', body); toast(c ? 'Category saved' : 'Category added'); route(); } });
  }

  async function saveScore(t, input) {
    const v = Number(input.value);
    if (!Number.isInteger(v) || v < 0 || v > 10) { toast('The score must be a whole number from 0 to 10', true); input.value = t.weight; return; }
    if (v === t.weight) return;
    try { await api('PATCH', '/admin/tags/' + t.id, { weight: v }); t.weight = v; toast(`Score for ${t.name} is now ${v}`); }
    catch (x) { toast(x.message, true); input.value = t.weight; }
  }
  const tagsList = () => listCard({ items: all, icon: 'tag', emptyTitle: 'No tags yet', emptyText: 'Add the tags jobs and projects are described with.',
    search: { placeholder: 'Search tags', text: (t) => t.name + ' ' + (t.description || '') },
    filters: [{ key: 'cat', label: 'Any category', options: categories.map((c) => [c.id, c.name]), test: (t, v) => String(t.category_id) === v }, statusFilter((t) => t.active, 'Disabled'),
      { key: 'scope', label: 'Any scope', options: [['practice', 'Practice-wide'], ['project', 'Per project']], test: (t, v) => (v === 'practice' ? !!Number(t.practice) : !Number(t.practice)) }],
    render: (slice) => dataTable(['Tag', 'Category', 'Score', 'Projects', 'Status', ''], slice.map((t) => {
      const inp = h('input', { type: 'number', class: 'scoreinp', min: 0, max: 10, step: 1, value: t.weight, 'aria-label': 'Score for ' + t.name });
      inp.onchange = () => saveScore(t, inp);
      return h('tr', {}, h('td', {}, h('strong', {}, t.name), Number(t.practice) ? h('span', { class: 'chip brand', style: 'margin-left:8px', title: 'Applies to all our work, not one project' }, 'Practice-wide') : null, t.description ? h('div', { class: 'meta' }, t.description.slice(0, 100)) : null), h('td', { class: 'muted' }, t.category), h('td', {}, inp),
        h('td', { class: 'muted' }, t.project_count), h('td', {}, activeSwitch(t.active, { name: t.name, url: '/admin/tags/' + t.id, no: 'Disabled', offText: 'It stays on its projects, but jobs are no longer tagged with it and it no longer counts in matching.' })),
        acts(h('button', { class: 'btn sm', onclick: () => tagDialog(t) }, 'Edit')));
    })) });
  const categoriesList = () => listCard({ items: categories, icon: 'tag', emptyTitle: 'No categories yet', emptyText: 'Add a category, then its tags.',
    search: { placeholder: 'Search categories', text: (c) => c.name },
    filters: [{ key: 'kind', label: 'Any kind', options: [['1', 'Compliance'], ['0', 'Not compliance']], test: (c, v) => String(Number(!!c.is_compliance)) === v }],
    render: (slice) => dataTable(['Order', 'Category', 'Tags', ''], slice.map((c) => h('tr', {},
      h('td', { class: 'muted' }, c.sort_order),
      h('td', {}, h('strong', {}, c.name), c.is_compliance ? h('span', { class: 'pill wait', style: 'margin-left:8px' }, 'Compliance') : null),
      h('td', { class: 'muted' }, `${c.tags.length} (${c.tags.filter((t) => Number(t.active)).length} active)`),
      acts(h('button', { class: 'btn sm', onclick: () => categoryDialog(c) }, 'Edit'))))) });
  function drawTabs() {
    tabsEl.replaceChildren(...[['tags', 'Tags', all.length], ['categories', 'Categories', categories.length]].map(([k, l, n]) =>
      h('button', { class: 'tab' + (st.tab === k ? ' on' : ''), role: 'tab', 'aria-selected': st.tab === k ? 'true' : 'false', onclick: () => { if (st.tab === k) return; st.tab = k; history.replaceState(null, '', '#/dictionary' + (k === 'tags' ? '' : '?tab=' + k)); drawAll(); } }, l, h('span', { class: 'n' }, String(n)))));
    actionsEl.replaceChildren(st.tab === 'tags' ? h('button', { class: 'btn primary', onclick: () => tagDialog(null) }, icon('screen'), 'Add tag') : h('button', { class: 'btn primary', onclick: () => categoryDialog(null) }, icon('screen'), 'Add category'));
  }
  function drawAll() { drawTabs(); bodyEl.replaceChildren(st.tab === 'tags' ? tagsList() : categoriesList()); }
  // how the scores are used, in one place (Hamza asked on 13 October)
  const howScores = h('details', { class: 'card fold' }, h('summary', {}, 'How the scores work'),
    h('div', { class: 'card-pad', style: 'padding-top:0' }, h('ul', { class: 'jp-list' },
      h('li', {}, 'Each tag has a score from 0 to 10: what it is worth when a job shares it with a project. 0 means it is ignored.'),
      h('li', {}, 'A project\'s match score is the total score of the tags it shares with the job. Industry tags are not counted: the industry decides the order instead.'),
      h('li', {}, '"27 of 42" on the Projects step means the project shares 27 of the 42 points the job\'s tags could give.'),
      h('li', {}, 'The order on the Projects step: projects that did the job\'s core work come first (the tagger names it, the main work first); then the job\'s industry, then related industries, then the rest; then the score.'),
      h('li', {}, 'The usual scores: Workflow type 3, AI capability up to 3 (AI powered 0), Project stage, Product type, Automation, Compliance and Industry 2, tools, AI models and tech stack 1. Change a score here and the next matching uses it.'))));
  shell('dictionary', [pageHead('Tag dictionary', 'The tags jobs and projects are described with. The score is what a shared tag is worth when a job is matched to projects.', actionsEl), howScores, tabsEl, bodyEl], true);
  drawAll();
}

// ---------- Upwork profiles (admin) ----------
const money = (v) => (v === null || v === undefined || v === '' ? '' : '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: Number.isInteger(Number(v)) ? 0 : 2, maximumFractionDigits: 2 }));
/** A GitLab account may be a username or a full https link. Returns {label, href}. */
function gitlabLink(v) {
  if (!v) return null;
  if (/^https:\/\//i.test(v)) return { label: v.replace(/^https:\/\//i, ''), href: v };
  return { label: '@' + v, href: 'https://gitlab.com/' + encodeURIComponent(v) };
}

async function profilesView() {
  const { profiles } = await api('GET', '/profiles?all=1');
  // every field the writer and the Claude plugin use; long ones are text areas
  const FIELDS = [
    ['tagline', 'Headline', 'text', 200, 'The headline shown on the Upwork profile.', 'For example: AI automation and voice agents for service businesses'],
    ['price', 'Default hourly rate', 'number', 0, 'The rate this profile quotes.', 'For example: 35'],
    ['lowest_price', 'Lowest rate', 'number', 0, 'The lowest rate when work is slow.', 'For example: 25'],
    ['profile_url', 'Upwork profile link', 'text', 300, '', 'https://www.upwork.com/freelancers/...'],
    ['github_url', 'GitHub link', 'text', 255, 'Used in the sign-off when there is no GitLab account.', 'https://github.com/username'],
    ['gitlab_account', 'GitLab account', 'text', 255, 'A username or the full link. Used in the sign-off first.', 'username or https://gitlab.com/username'],
    ['services', 'Services', 'area', 2000, 'What this profile sells. Used to suggest a profile for a job.', 'For example: AI agents, RAG, AI voice agents, SaaS platforms'],
    ['industries', 'Industries to lead with', 'text', 500, '', 'For example: Healthcare, Real estate'],
    ['voice', 'Voice', 'text', 300, 'How the proposal speaks.', 'For example: I, as named lead, with team backup where useful'],
    ['signature', 'Signature', 'text', 500, 'How the proposal signs off.', 'For example: the name, then the GitHub link on the next line'],
    ['stats_allowed', 'Upwork stats allowed in proposals', 'text', 500, 'The only figures the writer may use about this profile.', 'For example: Top Rated Plus, 100% Job Success Score'],
    ['rules', 'Profile rules', 'area', 4000, 'Followed in every proposal from this profile, before the proposal type.', 'For example: no pricing and no timeline unless the client asks'],
    ['certifications', 'Certifications', 'area', 2000, 'One per line: name, issuer, year. Used in a proposal only when the client requires a certification, and never one that is not listed here.', 'For example: AWS Certified Solutions Architect Associate, Amazon Web Services, 2024'],
    ['submitted_by', 'Who submits', 'text', 300, '', 'For example: Hassan'],
    ['notes', 'Notes', 'text', 500, '', 'For example: main freelancer profile'],
  ];
  function form(p) {
    const f = { name: h('input', { type: 'text', id: 'pn', value: p ? p.name : '', maxlength: 120 }) };
    for (const [k, , type, max, , ph] of FIELDS) {
      const v = p && p[k] !== null && p[k] !== undefined ? p[k] : '';
      f[k] = type === 'area' ? h('textarea', { id: 'pf_' + k, maxlength: max, placeholder: ph, style: 'min-height:72px' }) : h('input', { type, id: 'pf_' + k, maxlength: type === 'number' ? null : max, min: type === 'number' ? 0 : null, step: type === 'number' ? '0.01' : null, placeholder: ph, value: type === 'number' && v !== '' ? Number(v) : v });
      if (type === 'area') f[k].value = v;
    }
    const fld = ([k, label, , , hint]) => h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'pf_' + k }, label), f[k], hint ? h('div', { class: 'hint' }, hint) : null);
    const by = (k) => FIELDS.find((x) => x[0] === k);
    return { f, body: h('div', { style: 'display:grid;gap:16px' },
      h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'pn' }, 'Profile name'), f.name),
      fld(by('tagline')),
      h('div', { class: 'grid2' }, fld(by('price')), fld(by('lowest_price'))),
      fld(by('profile_url')),
      h('div', { class: 'grid2' }, fld(by('github_url')), fld(by('gitlab_account'))),
      fld(by('services')), fld(by('industries')),
      h('div', { class: 'grid2' }, fld(by('voice')), fld(by('signature'))),
      fld(by('stats_allowed')), fld(by('rules')), fld(by('certifications')),
      h('div', { class: 'grid2' }, fld(by('submitted_by')), fld(by('notes')))) };
  }
  const values = (f) => Object.fromEntries([['name', f.name.value], ...FIELDS.map(([k, , type]) => [k, type === 'number' ? (f[k].value === '' ? null : Number(f[k].value)) : (f[k].value.trim() || null)])]);
  function add() { const { f, body } = form(null); modal({ title: 'Add an Upwork profile', confirm: 'Add profile', body, wide: true, onConfirm: async () => { await api('POST', '/profiles', values(f)); toast('Profile added'); route(); } }); }
  function edit(p) { const { f, body } = form(p); modal({ title: 'Edit ' + p.name, confirm: 'Save profile', body, wide: true, extra: () => h('button', { class: 'btn danger', type: 'button', onclick: () => remove(p) }, 'Delete'),
    onConfirm: async () => { await api('PATCH', '/profiles/' + p.id, values(f)); toast('Profile saved'); route(); } }); }
  const remove = (p) => modal({ title: 'Delete ' + p.name + '?', confirm: 'Delete profile', danger: true,
    body: h('p', { class: 'muted' }, 'A profile that already has screenings cannot be deleted. Disable it instead and it disappears from the screening form.'),
    onConfirm: async () => { await api('DELETE', '/profiles/' + p.id); document.querySelectorAll('dialog').forEach((d) => d.close()); toast('Profile deleted'); route(); } });
  const row = (p) => h('tr', {},
    h('td', {}, h('strong', {}, p.name), p.added_via === 'claude_plugin' ? h('span', { class: 'srcchip' }, 'Added by the Claude plugin') : null,
      p.services || p.notes ? h('div', { class: 'meta clamp1', title: p.services || p.notes, style: 'max-width:420px' }, p.services || p.notes) : null,
      p.profile_url ? h('div', { class: 'meta' }, h('a', { href: p.profile_url, target: '_blank', rel: 'noopener noreferrer' }, 'Open on Upwork')) : null),
    h('td', {}, p.tagline ? h('span', {}, p.tagline) : h('span', { class: 'faint' }, 'Not set')),
    h('td', { class: 'nowrap' }, p.price !== null && p.price !== undefined ? money(p.price) + ' / hr' : h('span', { class: 'faint' }, 'Not set')),
    h('td', {}, (() => { const g = gitlabLink(p.gitlab_account) || (p.github_url ? { href: p.github_url, label: p.github_url.replace(/^https?:\/\//, '') } : null); return g ? h('a', { href: g.href, target: '_blank', rel: 'noopener noreferrer' }, g.label) : h('span', { class: 'faint' }, 'Not set'); })()),
    h('td', {}, activeSwitch(p.active, { name: p.name, url: '/profiles/' + p.id, no: 'Disabled', offText: 'It stays saved with its jobs, but it is no longer offered when screening or choosing who sends a proposal.' })),
    acts(h('button', { class: 'btn sm', onclick: () => edit(p) }, 'Edit')));
  shell('profiles', [
    pageHead('Upwork profiles', 'The profiles your team applies from. Every proposal is sent from one, in its voice and with its rates and rules.', h('button', { class: 'btn primary', onclick: add }, icon('screen'), 'Add profile')),
    listCard({ items: profiles, icon: 'badge', emptyTitle: 'No profiles yet', emptyText: 'Add the Upwork profiles your team applies from.', emptyAction: h('button', { class: 'btn primary', onclick: add }, 'Add profile'),
      search: { placeholder: 'Search profiles', text: (p) => [p.name, p.tagline, p.services, p.industries, p.notes, p.submitted_by].filter(Boolean).join(' ') },
      filters: [statusFilter((p) => p.active, 'Disabled'),
        { key: 'filled', label: 'Any setup', options: [['1', 'Ready (rate and headline set)'], ['0', 'Needs filling in']], test: (p, v) => String(Number(p.price != null && !!p.tagline)) === v }],
      render: (slice) => dataTable(['Profile', 'Headline', 'Rate', 'Code link', 'Status', ''], slice.map(row)) }),
  ]);
}

// ---------- Loom videos ----------
/** Short Loom videos per profile (5 to 7 general topics), each tagged with the job tags it suits. The Profile step suggests the best one. */
async function loomsView() {
  const [{ videos }, { profiles }, { categories }] = await Promise.all([api('GET', '/looms'), api('GET', '/profiles?all=1'), api('GET', '/tags')]);
  function editor(v, profileId) {
    const picked = new Set(v ? v.tags.map((t) => t.id) : []);
    const f = {
      profile: h('select', { id: 'lp' }, h('option', { value: '' }, 'Choose a profile'), profiles.map((p) => h('option', { value: p.id, selected: (v ? v.profile_id : profileId) === p.id || null }, p.name + (Number(p.active) ? '' : ' (disabled)')))),
      title: h('input', { type: 'text', id: 'lt', maxlength: 200, value: v ? v.title : '', placeholder: 'For example: How we build AI voice agents' }),
      url: h('input', { type: 'text', id: 'lu', maxlength: 500, value: v ? v.url : '', placeholder: 'https://www.loom.com/share/...' }),
      topic: h('textarea', { id: 'lc', maxlength: 1000, style: 'min-height:64px', placeholder: 'What the video shows, in a sentence or two' }),
      order: h('input', { type: 'number', id: 'lo', min: 0, max: 1000, value: v ? v.sort_order : 0 }),
      active: h('input', { type: 'checkbox', id: 'la', checked: v ? !!Number(v.active) : true }),
    };
    f.topic.value = v && v.topic ? v.topic : '';
    const fld = (id, label, el, hint) => h('div', { class: 'field' }, h('label', { class: 'lbl', for: id }, label), el, hint ? h('div', { class: 'hint' }, hint) : null);
    modal({ title: v ? 'Edit video' : 'Add a Loom video', confirm: v ? 'Save video' : 'Add video', wide: true,
      body: h('div', { style: 'display:grid;gap:16px' },
        h('div', { class: 'grid2' }, fld('lp', 'Profile', f.profile), h('div', { class: 'grid2' }, fld('lo', 'Order', f.order), h('div', { class: 'field row', style: 'align-self:end;padding-bottom:8px' }, f.active, h('label', { for: 'la', style: 'font-weight:600' }, 'Active')))),
        fld('lt', 'Title', f.title), fld('lu', 'Loom link', f.url), fld('lc', 'What it shows (optional)', f.topic),
        h('div', {}, tagPicker(categories, picked), h('div', { class: 'hint' }, 'The job tags this video suits, industries included. For each job, the video sharing the most tag weight with it is suggested.'))),
      extra: v ? () => h('button', { class: 'btn danger', type: 'button', onclick: () => modal({ title: 'Delete ' + v.title + '?', confirm: 'Delete video', danger: true,
        body: h('p', { class: 'muted' }, 'The video is removed from Upwork Pro. The Loom itself is not touched.'),
        onConfirm: async () => { await api('DELETE', '/looms/' + v.id); document.querySelectorAll('dialog').forEach((d) => d.close()); toast('Video deleted'); route(); } }) }, 'Delete') : null,
      onConfirm: async () => {
        await api(v ? 'PATCH' : 'POST', v ? '/looms/' + v.id : '/looms', { profile_id: Number(f.profile.value) || 0, title: f.title.value, url: f.url.value.trim(), topic: f.topic.value.trim() || null,
          sort_order: Number(f.order.value) || 0, active: f.active.checked, tag_ids: [...picked] });
        toast(v ? 'Video saved' : 'Video added'); route();
      } });
  }
  const shownProfiles = profiles.filter((p) => Number(p.active) || videos.some((v) => v.profile_id === p.id));
  const card = (p, mine) => h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, p.name), h('span', { class: 'sub' }, `${mine.length} video${mine.length === 1 ? '' : 's'}${Number(p.active) ? '' : ' · profile disabled'}`),
      h('button', { class: 'btn sm', onclick: () => editor(null, p.id) }, 'Add video')),
    mine.length ? dataTable.fixed(['Video', 'Tags', 'Status', ''], mine.map((v) => h('tr', {}, // R93: the same column widths in every profile's card
      h('td', {}, h('a', { href: v.url, target: '_blank', rel: 'noopener noreferrer' }, h('strong', {}, v.title)), v.topic ? h('div', { class: 'meta' }, v.topic) : null),
      h('td', {}, v.tags.length ? h('div', { class: 'chips', title: v.tags.map((t) => t.name).join(', ') }, ...v.tags.slice(0, 10).map((t) => h('span', { class: 'chip' }, t.name)), v.tags.length > 10 ? h('span', { class: 'chip' }, `+${v.tags.length - 10}`) : null) : h('span', { class: 'faint' }, 'No tags: never suggested')),
      h('td', {}, activeSwitch(v.active, { name: v.title, url: '/looms/' + v.id, no: 'Disabled', offText: 'It stays saved, but it is no longer suggested or offered for proposals.' })),
      acts(h('button', { class: 'btn sm', onclick: () => editor(v) }, 'Edit')))))
      : h('p', { class: 'card-pad jp-label', style: 'margin:0' }, 'No videos yet. Add the first one for this profile.'));
  // one row per profile, so the shared list can search and filter them; each carries its videos
  const groups = shownProfiles.map((p) => ({ p, videos: videos.filter((v) => v.profile_id === p.id) }));
  const hit = (v, q) => !q || (v.title + ' ' + (v.topic || '') + ' ' + v.tags.map((t) => t.name).join(' ')).toLowerCase().includes(q);
  shell('looms', [
    pageHead('Loom videos', 'Short videos per profile, each tagged with the jobs it suits. On a job\'s Profile step, each profile shows the video that fits best.',
      h('button', { class: 'btn primary', onclick: () => editor(null, null) }, icon('screen'), 'Add video')),
    listCard({ items: groups, bare: true, paged: false, icon: 'video', emptyTitle: 'No profiles yet', emptyText: 'Add an Upwork profile first, then its videos.',
      search: { placeholder: 'Search videos', text: (g) => g.p.name + ' ' + g.videos.map((v) => v.title + ' ' + (v.topic || '') + ' ' + v.tags.map((t) => t.name).join(' ')).join(' ') },
      filters: [{ key: 'profile', label: 'Any profile', options: shownProfiles.map((p) => [p.id, p.name]), test: (g, v) => String(g.p.id) === v },
        { key: 'status', label: 'Any status', options: [['1', 'Active videos'], ['0', 'Disabled videos'], ['none', 'Profiles without a video']], test: (g, v) => (v === 'none' ? !g.videos.length : g.videos.some((x) => String(Number(x.active)) === v)) },
        { key: 'tagged', label: 'Any tagging', options: [['1', 'Tagged'], ['0', 'Not tagged (never suggested)']], test: (g, v) => g.videos.some((x) => String(Number(x.tags.length > 0)) === v) }],
      render: (slice) => { const hp = hashParams(), q = (hp.q || '').toLowerCase();
        return h('div', { class: 'stack' }, slice.map((g) => card(g.p, g.videos.filter((v) => (g.p.name.toLowerCase().includes(q) || hit(v, q)) && (!['1', '0'].includes(hp.status) || String(Number(v.active)) === hp.status) && (!hp.tagged || String(Number(v.tags.length > 0)) === hp.tagged))))); } }),
  ]);
}

// ---------- projects ----------
const SHOWABLE = ['Yes with client name', 'Yes without client name', 'No'];
const canEditProjects = () => me.role === 'admin' || me.role === 'manager';


/** A searchable set of toggle chips. `items` is [{id, name}], `selected` a Set of ids (changed in place). */
function multiPick(label, items, selected, placeholder) {
  const find = h('input', { type: 'search', placeholder: placeholder || 'Find', 'aria-label': placeholder || 'Find' });
  const count = h('span', { class: 'small muted' });
  const wrap = h('div', { class: 'tagpick', style: 'max-height:220px' });
  const upd = () => { count.textContent = `${selected.size} selected`; };
  function draw() {
    const term = find.value.toLowerCase();
    const shown = items.filter((i) => !term || i.name.toLowerCase().includes(term));
    wrap.replaceChildren(shown.length ? h('div', { class: 'chips' }, shown.map((i) => h('button', { type: 'button', class: 'tagbtn' + (selected.has(i.id) ? ' on' : ''), 'aria-pressed': selected.has(i.id) ? 'true' : 'false',
      onclick: (e) => { if (selected.has(i.id)) selected.delete(i.id); else selected.add(i.id); e.currentTarget.classList.toggle('on'); e.currentTarget.setAttribute('aria-pressed', selected.has(i.id) ? 'true' : 'false'); upd(); } }, i.name)))
      : h('p', { class: 'faint small' }, items.length ? 'No matches.' : 'Nothing to choose from yet.'));
  }
  find.oninput = draw; draw(); upd();
  return h('div', {}, h('div', { class: 'row spread', style: 'margin-bottom:8px' }, h('label', { class: 'lbl', style: 'margin:0' }, label), count), find, wrap);
}

function tagPicker(categories, selected) {
  const find = h('input', { type: 'search', placeholder: 'Find a tag', 'aria-label': 'Find a tag' });
  const count = h('span', { class: 'small muted' });
  const wrap = h('div', { class: 'tagpick' });
  const upd = () => { count.textContent = `${selected.size} selected`; };
  function drawTags() {
    const term = find.value.toLowerCase();
    wrap.replaceChildren(...categories.map((c) => {
      const tags = c.tags.filter((t) => (Number(t.active) || selected.has(t.id)) && (!term || t.name.toLowerCase().includes(term) || c.name.toLowerCase().includes(term)));
      if (!tags.length) return null;
      return h('div', { class: 'tagcat' }, h('div', { class: 'tc-title' }, c.name, h('span', { class: 'faint' }, ` (${tags.filter((t) => selected.has(t.id)).length}/${tags.length})`)),
        h('div', { class: 'chips' }, tags.map((t) => h('button', { type: 'button', class: 'tagbtn' + (selected.has(t.id) ? ' on' : ''), 'aria-pressed': selected.has(t.id) ? 'true' : 'false', title: t.description || '',
          onclick: (e) => { if (selected.has(t.id)) selected.delete(t.id); else selected.add(t.id); e.currentTarget.classList.toggle('on'); e.currentTarget.setAttribute('aria-pressed', selected.has(t.id) ? 'true' : 'false'); upd(); } }, t.name))));
    }).filter(Boolean)); // replaceChildren prints a null as the text "null"
  }
  find.oninput = drawTags; drawTags(); upd();
  return h('div', {}, h('div', { class: 'row spread', style: 'margin-bottom:8px' }, h('label', { class: 'lbl', style: 'margin:0' }, 'Tags'), count), find, wrap);
}

/** The add / edit form. `after(id)` runs once it is saved or deleted. */
function projectEditor(p, categories, after, industries = []) {
  const selected = new Set(p ? p.tags.map((t) => t.id) : []);
  const pickedInd = new Set(p && p.industries ? p.industries.map((i) => i.id) : []);
  const f = { name: h('input', { type: 'text', id: 'jn', maxlength: 190, value: p ? p.name : '' }), link: h('input', { type: 'text', id: 'jl', value: p && p.live_link ? p.live_link : '', placeholder: 'https://...' }),
    show: h('input', { type: 'text', id: 'js', list: 'showlist', maxlength: 60, value: p && p.showable_publicly ? p.showable_publicly : '' }),
    notes: h('textarea', { id: 'jt', style: 'min-height:70px', maxlength: 4000 }), active: h('input', { type: 'checkbox', id: 'ja', checked: p ? !!Number(p.active) : true }) };
  f.notes.value = p && p.notes ? p.notes : '';
  // the links the team keeps, the overview and the case study (as in the project sheet); the writer uses the overview and the case study
  const LINKS = [['landing_link', 'Landing page link'], ['system_link', 'System link'], ['android_link', 'Android link (Google Play)'], ['ios_link', 'iOS link (App Store)'], ['mobile_link', 'Other mobile link (optional)'], ['staging_link', 'Staging link'], ['case_study_link', 'Case study link']];
  for (const [k] of LINKS) f[k] = h('input', { type: 'text', id: 'jx_' + k, maxlength: 500, value: p && p[k] ? p[k] : '', placeholder: 'https://...' });
  f.overview = h('textarea', { id: 'jx_overview', style: 'min-height:90px', maxlength: 8000 }); f.overview.value = p && p.overview ? p.overview : '';
  f.case_study_summary = h('textarea', { id: 'jx_cs', style: 'min-height:90px', maxlength: 8000 }); f.case_study_summary.value = p && p.case_study_summary ? p.case_study_summary : '';
  const lf = ([k, label]) => h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'jx_' + k }, label), f[k]);
  modal({ title: p ? 'Edit project' : 'Add a project', confirm: p ? 'Save project' : 'Add project', wide: true,
    body: h('div', {}, h('datalist', { id: 'showlist' }, SHOWABLE.map((o) => h('option', { value: o }))),
      h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'jn' }, 'Project name'), f.name), h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'jl' }, 'Proposal link (optional)'), f.link, h('div', { class: 'hint' }, 'The link a proposal uses. Usually the landing page, or the store or live system link.'))),
      h('div', { class: 'grid2', style: 'margin-top:16px' }, lf(LINKS[0]), lf(LINKS[1])),
      h('div', { class: 'grid2', style: 'margin-top:16px' }, lf(LINKS[2]), lf(LINKS[3])),
      h('div', { class: 'grid2', style: 'margin-top:16px' }, lf(LINKS[4]), h('div', {})),
      h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'jx_overview' }, 'Project overview'), f.overview, h('div', { class: 'hint' }, 'What was built. The proposal writer describes the project from this.')),
      h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'jx_cs' }, 'Case study summary'), f.case_study_summary, h('div', { class: 'hint' }, 'Results and facts the writer may use. Figures here are allowed in proposals.')),
      h('div', { class: 'grid2', style: 'margin-top:16px' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'js' }, 'Showable publicly'), f.show),
        h('div', { class: 'field row', style: 'align-self:end;padding-bottom:8px' }, f.active, h('label', { for: 'ja', style: 'font-weight:600' }, 'Active (used for matching)'))),
      h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'jt' }, 'Notes (optional)'), f.notes),
      h('div', { style: 'margin-top:16px' }, multiPick('Industries', industries.filter((i) => Number(i.active) || pickedInd.has(i.id)), pickedInd, 'Find an industry')),
      h('div', { style: 'margin-top:16px' }, tagPicker(categories, selected))),
    extra: p ? () => h('button', { class: 'btn danger', type: 'button', onclick: () => modal({ title: 'Delete ' + p.name + '?', confirm: 'Delete project', danger: true,
      body: h('p', { class: 'muted' }, 'This removes the project and its tags. It cannot be undone. To keep it but stop using it, untick Active instead.'),
      onConfirm: async () => { await api('DELETE', '/projects/' + p.id); document.querySelectorAll('dialog').forEach((d) => d.close()); toast('Project deleted'); after(null); } }) }, 'Delete') : null,
    onConfirm: async () => {
      const body = { name: f.name.value, live_link: f.link.value.trim() || null, showable_publicly: f.show.value.trim() || null, notes: f.notes.value.trim() || null, active: f.active.checked, tag_ids: [...selected], industry_ids: [...pickedInd],
        ...Object.fromEntries([...LINKS.map(([k]) => k), 'overview', 'case_study_summary'].map((k) => [k, f[k].value.trim() || null])) };
      const r = await api(p ? 'PATCH' : 'POST', p ? '/projects/' + p.id : '/projects', body); toast(p ? 'Project saved' : 'Project added'); after(r.id);
    } });
}

async function projectsView() {
  const [{ projects }, { categories }, { industries }] = await Promise.all([api('GET', '/projects'), api('GET', '/tags'), api('GET', '/industries')]);
  const canEdit = canEditProjects();
  const afterEdit = () => route();
  const detail = (p) => () => { location.hash = '#/p/' + p.id; };
  const add = canEdit ? h('button', { class: 'btn primary', onclick: () => projectEditor(null, categories, afterEdit, industries) }, icon('screen'), 'Add project') : null;
  shell('projects', [pageHead('Projects', `The work ${cfg('company.name', 'the company')} has delivered.` + " Tags are how a new job is matched to the projects that prove the same kind of work.", add),
    listCard({ items: projects, icon: 'folder', emptyTitle: 'No projects yet', emptyText: `Add the projects ${cfg('company.name', 'the company')} has delivered.`,
      search: { placeholder: 'Search projects', text: (p) => p.name + ' ' + p.tags.map((t) => t.name).join(' ') + ' ' + p.industries.map((i) => i.name).join(' ') },
      filters: [
        { key: 'industry', label: 'Any industry', options: industries.map((i) => [i.id, i.name]), test: (p, v) => p.industries.some((i) => String(i.id) === v) },
        { key: 'tag', label: 'Any tag', options: categories.flatMap((c) => c.tags.filter((t) => Number(t.active)).map((t) => [t.id, `${t.name} (${c.name})`])), test: (p, v) => p.tags.some((t) => String(t.id) === v) },
        { key: 'has', label: 'Any content', options: [['case', 'Has a case study'], ['nocase', 'No case study'], ['nolink', 'No proposal link'], ['notags', 'Not tagged']],
          test: (p, v) => (v === 'case' ? !!p.case_study_summary : v === 'nocase' ? !p.case_study_summary : v === 'nolink' ? !p.live_link : !p.tags.length) },
        statusFilter((p) => p.active)],
      onSync: () => { lastList.projects = location.hash; },
      render: (slice) => dataTable(['Project', 'Industries', 'Tags', 'Status', canEdit ? '' : null], slice.map((p) => h('tr', { class: 'click', tabindex: 0, onclick: detail(p), onkeydown: (e) => { if (e.key === 'Enter') detail(p)(); } },
        h('td', {}, h('strong', {}, p.name), p.live_link ? h('div', { class: 'meta' }, p.live_link.replace(/^https?:\/\//, '').slice(0, 50)) : null),
        h('td', {}, p.industries.length ? h('div', { class: 'chips' }, p.industries.slice(0, 2).map((i) => h('span', { class: 'chip' }, i.name)), p.industries.length > 2 ? h('span', { class: 'chip' }, '+' + (p.industries.length - 2)) : null) : h('span', { class: 'faint' }, 'None')),
        h('td', {}, p.tags.length ? h('div', { class: 'chips' }, p.tags.slice(0, 4).map((t) => h('span', { class: 'chip' }, t.name)),
          p.tags.length > 4 ? h('span', { class: 'chip', title: 'Show all ' + p.tags.length + ' tags' }, '+' + (p.tags.length - 4)) : null) : h('span', { class: 'faint' }, 'Not tagged yet')),
        h('td', {}, activeSwitch(p.active, { name: p.name, url: '/projects/' + p.id, can: canEdit, offText: 'It stays saved, and jobs that used it keep it, but it is no longer matched to new jobs.' })),
        canEdit ? acts(h('button', { class: 'btn sm', onclick: (e) => { e.stopPropagation(); projectEditor(p, categories, afterEdit, industries); } }, 'Edit')) : null))) })], true);
}

async function projectDetailView(id) {
  const [{ project: p }, { categories }, { industries }] = await Promise.all([api('GET', '/projects/' + id), api('GET', '/tags'), api('GET', '/industries')]);
  const canEdit = canEditProjects();
  const own = new Set(p.tags.map((t) => t.id));
  const groups = categories.map((c) => ({ name: c.name, tags: c.tags.filter((t) => own.has(t.id)) })).filter((g) => g.tags.length);
  const ext = (u) => (/^https?:\/\//i.test(u || '') ? h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, u) : null);
  const link = ext(p.live_link);
  const urlList = (v) => (v ? h('div', { style: 'display:grid;gap:2px' }, v.split(/\s+/).filter(Boolean).map((u) => ext(u) || u)) : null);
  const kv = (label, v) => h('div', {}, h('dt', {}, label), h('dd', { class: v ? '' : 'ns' }, v || 'Not recorded'));
  shell('projects', [
    pageHead(p.name, `${p.tags.length} tag${p.tags.length === 1 ? '' : 's'} across ${groups.length} categor${groups.length === 1 ? 'y' : 'ies'}`,
      canEdit ? h('button', { class: 'btn primary', onclick: () => projectEditor(p, categories, (nid) => (nid ? route() : (location.hash = lastList.projects)), industries) }, 'Edit project') : null,
      { back: [lastList.projects, 'Projects'], badges: onOff(p.active) }),
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'Details'), h('dl', { class: 'kv cols2' },
      kv('Proposal link', link), kv('Landing page', ext(p.landing_link)), kv('System', ext(p.system_link)), kv('Android', ext(p.android_link)), kv('iOS', ext(p.ios_link)), p.mobile_link ? kv('Other mobile', urlList(p.mobile_link)) : null,
      kv('Staging', ext(p.staging_link)), kv('Case study', ext(p.case_study_link)),
      h('div', {}, h('dt', {}, 'Showable publicly'), h('dd', { class: p.showable_publicly ? '' : 'ns' }, p.showable_publicly || 'Not recorded')),
      h('div', {}, h('dt', {}, 'Added'), h('dd', {}, full(p.created_at))), h('div', {}, h('dt', {}, 'Last updated'), h('dd', {}, full(p.updated_at))),
      p.added_via === 'claude_plugin' ? h('div', {}, h('dt', {}, 'Added by'), h('dd', {}, 'The Claude plugin')) : null,
      p.notes ? h('div', { style: 'grid-column:1/-1' }, h('dt', {}, 'Notes'), h('dd', {}, p.notes)) : null)),
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'Overview'), p.overview ? h('p', { style: 'margin:0;white-space:pre-wrap' }, p.overview) : h('p', { class: 'faint small' }, 'No overview yet. The proposal writer describes the project from it.'),
      p.case_study_summary ? [h('h3', { class: 'section-title', style: 'margin-top:18px' }, 'Case study summary'), h('p', { style: 'margin:0;white-space:pre-wrap' }, p.case_study_summary)] : null),
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, `Industries (${p.industries.length})`),
      p.industries.length ? h('div', { class: 'chips' }, p.industries.map((i) => h('a', { class: 'chip brand', href: '#/i/' + i.id }, i.name))) : h('p', { class: 'faint small' }, 'No industries yet.')),
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, `Tags (${p.tags.length})`),
      groups.length ? h('div', { style: 'display:grid;gap:18px' }, groups.map((g) => h('div', {}, h('div', { class: 'tc-title' }, g.name, h('span', { class: 'faint' }, ` (${g.tags.length})`)),
        h('div', { class: 'chips' }, g.tags.map((t) => h('span', { class: 'chip', title: t.description || '' }, t.name))))))
        : emptyState('tag', 'No tags yet', canEdit ? 'Edit the project to add tags.' : 'This project has not been tagged yet.')),
  ], true);
}

// ---------- users (admin) ----------
async function usersView() {
  const { users, i_am_main: iAmMain } = await api('GET', '/admin/users');
  const patch = async (id, body, msg) => { try { await api('PATCH', '/admin/users/' + id, body); toast(msg); route(); } catch (x) { toast(x.message, true); route(); } };
  const roleSel = (cur, onchange) => h('select', { onchange }, ['employee', 'manager', 'admin'].map((r) => h('option', { value: r, selected: r === cur }, r[0].toUpperCase() + r.slice(1))));
  function addUser() {
    const f = { name: h('input', { type: 'text', id: 'un' }), email: h('input', { type: 'email', id: 'ue' }), pw: h('input', { type: 'password', id: 'up', autocomplete: 'new-password' }), role: roleSel('employee') };
    f.role.style.width = '100%';
    modal({ title: 'Add a user', confirm: 'Create user',
      body: h('div', {}, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'un' }, 'Full name'), f.name), h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'ue' }, 'Email'), f.email),
        h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'up' }, 'Temporary password'), withShow(f.pw), h('div', { class: 'hint' }, 'At least 10 characters. Share it securely, and ask them to change it (the key button next to their name).')),
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Role'), f.role,
          h('div', { class: 'hint' }, 'Employee: own records. Manager: sees all records. Admin: also manages users, the library and the job gate.'))),
      onConfirm: async () => { await api('POST', '/admin/users', { name: f.name.value, email: f.email.value, password: f.pw.value, role: f.role.value }); toast('User created'); route(); } });
  }
  function resetPw(u) {
    const pw = h('input', { type: 'password', id: 'rp', autocomplete: 'new-password' });
    modal({ title: 'Reset password for ' + u.name, confirm: 'Reset password', body: h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'rp' }, 'New password'), withShow(pw), h('div', { class: 'hint' }, 'At least 10 characters. They will be signed out everywhere.')),
      onConfirm: async () => { await api('PATCH', '/admin/users/' + u.id, { password: pw.value }); toast('Password reset'); } });
  }
  /** The main admin can only be changed by the main admin. */
  const locked = (u) => u.main && !iAmMain;
  const row = (u) => h('tr', {},
    h('td', {}, h('div', { class: 'row', style: 'gap:10px;flex-wrap:nowrap' }, avatarEl(u),
      h('div', {}, h('strong', {}, u.name, u.id === me.id ? h('span', { class: 'faint', style: 'font-weight:400' }, ' (you)') : null, u.main ? h('span', { class: 'srcchip', title: 'The first admin account. Only this person can change it.' }, 'Main admin') : null), h('div', { class: 'meta' }, u.email)))),
    h('td', {}, u.id === me.id || locked(u) ? cap(u.role) : roleSel(u.role, (e) => patch(u.id, { role: e.target.value }, 'Role updated'))),
    h('td', {}, activeSwitch(u.active, { name: u.name, url: '/admin/users/' + u.id, no: 'Disabled', can: u.id !== me.id && !locked(u), offText: 'They can no longer sign in. Their jobs stay as they are.' })),
    h('td', { class: 'muted nowrap', title: full(u.created_at) }, ago(u.created_at)),
    u.id === me.id ? acts(h('button', { class: 'btn sm', onclick: changePassword }, 'Change password')) : locked(u) ? acts() : acts(h('button', { class: 'btn sm', onclick: () => resetPw(u) }, 'Reset password')));
  shell('users', [pageHead('Users', 'Who can sign in, and what each person can see and change.', h('button', { class: 'btn primary', onclick: addUser }, icon('screen'), 'Add user')),
    listCard({ items: users, icon: 'users', emptyTitle: 'No users yet', emptyText: 'Add the people who will use Upwork Pro.',
      search: { placeholder: 'Search users', text: (u) => u.name + ' ' + u.email },
      filters: [{ key: 'role', label: 'Any role', options: [['employee', 'Employee'], ['manager', 'Manager'], ['admin', 'Admin']], test: (u, v) => u.role === v }, statusFilter((u) => u.active, 'Disabled')],
      render: (slice) => dataTable(['User', 'Role', 'Status', 'Added', ''], slice.map(row)) })]);
}

/** A card listing saved versions, newest first, with a search over their notes. `item(v)` draws one; `text(v)` is what the search reads. */
function versionsCard(versions, item, text) {
  const list = h('div', { class: 'vlist' });
  const draw = (q) => { const shown = versions.filter((v) => !q || text(v).toLowerCase().includes(q.toLowerCase()));
    list.replaceChildren(...(shown.length ? shown.map(item) : [h('p', { class: 'card-pad jp-label', style: 'margin:0' }, 'No version matches.')])); };
  draw('');
  return h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Versions'), h('span', { class: 'sub' }, String(versions.length))),
    h('div', { class: 'filterbar' }, fSearch('Search versions', '', draw)), list);
}

// ---------- Gate instructions: the method part of the gate prompt (admin); the rules come from the Rules page ----------
async function skillView() {
  const { versions } = await api('GET', '/admin/skill');
  const active = versions.find((v) => Number(v.is_active)) || versions[0];
  const cur = active ? (await api('GET', '/admin/skill/' + active.id)).skill : { content: '' };
  const ta = h('textarea', { class: 'editor', id: 'sk', spellcheck: 'false', 'aria-label': 'Gate instructions' }); ta.value = cur.content;
  const dirty = h('span', { class: 'chip', hidden: true }, 'Unsaved changes');
  ta.oninput = () => { dirty.hidden = ta.value === cur.content; };
  const note = h('input', { type: 'text', id: 'cn', placeholder: 'What did you change and why?' });
  const sample = h('textarea', { style: 'min-height:110px', placeholder: 'Paste a sample job page to try the draft above. Nothing is saved.' });
  const out = h('div', { style: 'display:grid;gap:16px;margin-top:16px' });
  const testBtn = h('button', { class: 'btn', type: 'button' }, 'Test draft on sample');
  testBtn.onclick = async () => {
    btnBusy(testBtn, 'Testing'); out.replaceChildren();
    try { const r = await api('POST', '/admin/skill/test', { content: ta.value, sample: sample.value }); out.replaceChildren(...r.report.jobs.map((j) => jobReportView(j, r.report.jobs.length > 1))); }
    catch (x) { toast(x.message, true); }
    testBtn.disabled = false; testBtn.replaceChildren('Test draft on sample');
  };
  const previewBtn = h('button', { class: 'btn', type: 'button' }, 'See full prompt');
  previewBtn.onclick = async () => {
    try {
      const r = await api('POST', '/admin/skill/preview', { content: ta.value });
      modal({ title: 'Full prompt for one job', noConfirm: true, wide: true, body: h('div', {},
        h('p', { class: 'muted', style: 'margin-top:0' }, `The instructions in the editor, then the ${r.rules} active rules from the Rules page, then the fixed output format and the ${r.projects} library projects. The job page is sent separately.`),
        h('pre', { class: 'proposal-text', style: 'max-height:60vh;overflow:auto;white-space:pre-wrap' }, r.prompt)) });
    } catch (x) { toast(x.message, true); }
  };
  const saveBtn = h('button', { class: 'btn primary', type: 'button' }, 'Save as new version');
  saveBtn.onclick = async () => {
    btnBusy(saveBtn, 'Saving');
    try { await api('POST', '/admin/skill', { content: ta.value, change_note: note.value }); toast('Saved as a new version. Activate it to use it.'); route(); }
    catch (x) { toast(x.message, true); saveBtn.disabled = false; saveBtn.replaceChildren('Save as new version'); }
  };
  const vitem = (v) => h('div', { class: 'vitem' }, h('div', { class: 'top' }, h('strong', {}, 'Version ' + v.version), Number(v.is_active) ? h('span', { class: 'pill PASS' }, 'Active') : null),
    h('div', { class: 'small muted' }, (v.change_note || 'No note') + ' · ' + ago(v.created_at)),
    h('div', { class: 'row', style: 'gap:6px' },
      h('button', { class: 'btn sm', onclick: async () => { const s = (await api('GET', '/admin/skill/' + v.id)).skill; ta.value = s.content; dirty.hidden = ta.value === cur.content; toast('Loaded version ' + v.version + ' into the editor'); window.scrollTo(0, 0); } }, 'Load'),
      Number(v.is_active) ? null : h('button', { class: 'btn sm', onclick: () => modal({ title: 'Activate version ' + v.version + '?', confirm: 'Activate', body: h('p', { class: 'muted' }, 'New screenings will use these instructions, with the current rules, straight away. Past records keep the version and rules they used.'),
        onConfirm: async () => { await api('POST', `/admin/skill/${v.id}/activate`, {}); toast('Version ' + v.version + ' is now active'); route(); } }) }, 'Activate')));
  shell('skill', [pageHead('Gate instructions', 'How the gate reads and judges a job. Saving never overwrites: it creates a new version.'),
    h('div', { class: 'notice' }, icon('info'), h('span', {}, 'The FAIL and FLAG rules are not written here: they come from the ', h('a', { href: '#/rules' }, 'Rules'), ' page and are added after these instructions for every job. The report layout is fixed by the app. Test a draft before you activate it.')),
    h('div', { class: 'two' }, h('div', {},
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Instructions'), h('span', { class: 'sub' }, dirty, ' Editing from version ' + (active ? active.version : '-'))), ta,
        h('div', { class: 'card-pad', style: 'border-top:1px solid var(--line)' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'cn' }, 'Change note'), note), h('div', { class: 'row', style: 'margin-top:14px;gap:8px' }, saveBtn, previewBtn))),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Try the draft')), h('div', { class: 'card-pad' }, sample, h('div', { style: 'margin-top:12px' }, testBtn), out))),
      versionsCard(versions, vitem, (v) => `version ${v.version} ${v.change_note || ''}`))], true);
}

// ---------- Reviewer: full control of the independent proposal reviewer (R61); admins edit, everyone reads ----------
const RV_CONTEXT = { signals: 'What the post signals', writing_rules: 'The writing rules', banned_phrases: 'The banned phrases', checklist: 'The verification checklist', automatic_checks: 'What the automatic checks found',
  experience: 'The experience the sender confirmed for the job', documents: 'The client\'s documents', type_samples: 'Sample proposals of the same type' };
/** A review's detail since R115: each criterion's score, the opening, body and answers apart, and the caps that held the score down. */
function reviewDetail(rv) {
  if (!rv) return null;
  const crit = rv.criteria_scores && rv.criteria_scores.length ? h('div', {}, h('div', { class: 'jp-label' }, 'By criterion' + (rv.weighted != null ? ` (weighted ${rv.weighted})` : '')),
    h('ul', { class: 'jp-list', style: 'margin:4px 0 0' }, rv.criteria_scores.map((c) => h('li', {}, h('strong', {}, `${c.criterion}: ${c.score}/10`), c.why ? ' ' + c.why : '')))) : null;
  const pt = rv.parts ? h('div', {}, h('div', { class: 'jp-label' }, 'By part'), h('ul', { class: 'jp-list', style: 'margin:4px 0 0' },
    [['Opening', rv.parts.opening], ['Body', rv.parts.body], ['Screening answers', rv.parts.answers]].filter(([, x]) => x).map(([l, x]) => h('li', {}, h('strong', {}, `${l}: ${x.score}/10`), x.note ? ' ' + x.note : '')))) : null;
  const caps = rv.capped_by && rv.capped_by.length ? h('div', { class: 'warnline' }, icon('warn'), ` Capped at ${Math.min(...rv.capped_by.map((c) => c.max))}: ` + rv.capped_by.map((c) => c.rule).join(' ')) : null;
  return [caps, crit, pt].filter(Boolean);
}
async function reviewerView() {
  const edit = me.role === 'admin';
  const { versions, active, full, types } = await api('GET', '/reviewer');
  let base = active.sections; // what the editor was loaded from, to tell unsaved changes
  const lines = (xs) => (xs || []).join('\n');
  const toList = (t) => t.split('\n').map((x) => x.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  const area = (id, label, rows) => h('textarea', { id, rows, 'aria-label': label, readOnly: !edit, spellcheck: 'true' });
  const f = {
    method: area('rv-method', 'How to review', 6), concerns: area('rv-concerns', 'Key concerns', 7), dos: area('rv-dos', 'Dos', 5), donts: area('rv-donts', "Don'ts", 5),
    score_guide: area('rv-guide', 'Score guide', 6), score_limits: area('rv-limits', 'Score limits', 3), writing: area('rv-writing', 'How to write the review', 5),
  };
  const num = (id, min, max) => h('input', { type: 'number', id, min, max, step: 1, readOnly: !edit, style: 'width:90px' });
  const n = { strengths: num('rv-ns', 0, 5), problems: num('rv-np', 1, 6), suggestions: num('rv-ng', 0, 5) };
  const ctx = Object.fromEntries(Object.keys(RV_CONTEXT).map((k) => [k, h('input', { type: 'checkbox', id: 'rv-c-' + k, disabled: !edit })]));
  // R115: criteria with weights, caps, key points (general and per type), examples, parts
  const crit = h('div', { class: 'stack', style: 'gap:10px' }), capsEl = h('div', { class: 'stack', style: 'gap:8px' });
  const keyPoints = area('rv-keys', 'Key points', 6);
  const typeAreas = Object.fromEntries((types || []).map((t) => [t, area('rv-type-' + t.replace(/\W+/g, '-'), 'Key points for ' + t, 4)]));
  const exUse = h('input', { type: 'checkbox', id: 'rv-exuse', disabled: !edit }), exN = num('rv-exn', 0, 6), partsCb = h('input', { type: 'checkbox', id: 'rv-parts', disabled: !edit });
  const weightSum = h('span', { class: 'jp-label' });
  const sumWeights = () => { const t = [...crit.querySelectorAll('.rv-w')].reduce((x, el) => x + (Number(el.value) || 0), 0); weightSum.textContent = crit.children.length ? `Weights add up to ${t}${t === 100 ? '' : ' (they are scaled, so they need not add up to 100)'}` : 'No criteria: the reviewer gives one overall score, as before.'; };
  const critRow = (c = { name: '', weight: 10, look_for: '', high: '', low: '' }) => {
    const ta = (v, ph) => { const el = h('textarea', { rows: 2, readOnly: !edit, placeholder: ph }); el.value = v || ''; return el; };
    const name = h('input', { type: 'text', class: 'rv-n', value: c.name, readOnly: !edit, placeholder: 'For example: Opening', maxlength: 80 });
    const w = h('input', { type: 'number', class: 'rv-w', min: 0, max: 100, step: 1, value: c.weight, readOnly: !edit, style: 'width:80px' });
    const look = ta(c.look_for, 'What it looks at'), hi = ta(c.high, 'What a high score looks like'), lo = ta(c.low, 'What a low score looks like');
    look.classList.add('rv-look'); hi.classList.add('rv-hi'); lo.classList.add('rv-lo');
    const row = h('div', { class: 'card card-pad stack', style: 'gap:6px' }, h('div', { class: 'row', style: 'gap:8px;flex-wrap:nowrap' }, name, h('label', { class: 'row', style: 'gap:6px' }, h('span', { class: 'jp-label' }, 'Weight'), w),
      edit ? h('button', { type: 'button', class: 'btn sm', onclick: () => { row.remove(); sumWeights(); check(); } }, 'Remove') : null), look, h('div', { class: 'two' }, hi, lo));
    [name, w, look, hi, lo].forEach((el) => el.addEventListener('input', () => { sumWeights(); check(); }));
    return row;
  };
  const capRow = (c = { rule: '', max: 5 }) => {
    const rule = h('input', { type: 'text', class: 'rv-cr', value: c.rule, readOnly: !edit, placeholder: 'For example: It invents a fact that is not in the facts given.' });
    const mx = h('input', { type: 'number', class: 'rv-cm', min: 1, max: 10, step: 1, value: c.max, readOnly: !edit, style: 'width:70px' });
    const row = h('div', { class: 'row', style: 'gap:8px;flex-wrap:nowrap' }, rule, h('span', { class: 'jp-label nowrap' }, 'no higher than'), mx, edit ? h('button', { type: 'button', class: 'btn sm', onclick: () => { row.remove(); check(); } }, 'Remove') : null);
    [rule, mx].forEach((el) => el.addEventListener('input', check));
    return row;
  };
  const fill = (sec) => {
    crit.replaceChildren(...(sec.criteria || []).map(critRow)); sumWeights();
    capsEl.replaceChildren(...(sec.caps || []).map(capRow));
    keyPoints.value = lines(sec.key_points);
    for (const t of Object.keys(typeAreas)) typeAreas[t].value = lines(((sec.per_type || []).find((x) => x.type === t) || {}).key_points);
    exUse.checked = !!(sec.examples && sec.examples.use); exN.value = (sec.examples && sec.examples.per_review) || 0; partsCb.checked = !!sec.parts;
    f.method.value = sec.method; f.concerns.value = lines(sec.concerns); f.dos.value = lines(sec.dos); f.donts.value = lines(sec.donts);
    f.score_guide.value = sec.score_guide; f.score_limits.value = lines(sec.score_limits); f.writing.value = sec.writing || '';
    for (const k of Object.keys(n)) n[k].value = sec.limits[k];
    for (const k of Object.keys(ctx)) ctx[k].checked = !!sec.context[k];
  };
  const read = () => ({
    method: f.method.value.trim(), concerns: toList(f.concerns.value), dos: toList(f.dos.value), donts: toList(f.donts.value),
    score_guide: f.score_guide.value.trim(), score_limits: toList(f.score_limits.value), writing: f.writing.value.trim(),
    limits: { strengths: Number(n.strengths.value), problems: Number(n.problems.value), suggestions: Number(n.suggestions.value) },
    context: Object.fromEntries(Object.keys(ctx).map((k) => [k, ctx[k].checked])),
    criteria: [...crit.children].map((row) => ({ name: row.querySelector('.rv-n').value.trim(), weight: Number(row.querySelector('.rv-w').value) || 0, look_for: row.querySelector('.rv-look').value.trim(),
      high: row.querySelector('.rv-hi').value.trim(), low: row.querySelector('.rv-lo').value.trim() })).filter((c) => c.name),
    caps: [...capsEl.children].map((row) => ({ rule: row.querySelector('.rv-cr').value.trim(), max: Number(row.querySelector('.rv-cm').value) || 5 })).filter((c) => c.rule),
    key_points: toList(keyPoints.value),
    per_type: Object.entries(typeAreas).map(([type, el]) => ({ type, key_points: toList(el.value) })).filter((t) => t.key_points.length),
    examples: { use: exUse.checked, per_review: Number(exN.value) || 0 }, parts: partsCb.checked,
  });
  const dirty = h('span', { class: 'chip', hidden: true }, 'Unsaved changes');
  fill(base);
  const baseJson = () => { const keep = read(); fill(base); const b = JSON.stringify(read()); fill(keep); return b; };
  const check = () => { dirty.hidden = JSON.stringify(read()) === baseJson(); };
  [...Object.values(f), ...Object.values(n), keyPoints, exN, ...Object.values(typeAreas)].forEach((el) => el.addEventListener('input', check));
  [exUse, partsCb].forEach((el) => el.addEventListener('change', check));
  Object.values(ctx).forEach((el) => el.addEventListener('change', check));
  const loadedFrom = h('span', {}, ` Editing from version ${active.version}`);

  const sec = (title, hint, body) => h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, title)), h('div', { class: 'card-pad' }, hint ? h('p', { class: 'jp-label', style: 'margin:0 0 8px' }, hint) : null, body));
  const editor = h('div', { class: 'stack' },
    sec('How to review', 'Who the reviewer is, who it reads for, and how it should think about a proposal. It comes first in its instructions.', f.method),
    sec('Key concerns', 'What matters most, one per line, most important first. The reviewer judges the proposal on these, in this order.', f.concerns),
    sec('Criteria and weights', 'What the reviewer scores, each from 1 to 10, with its weight. The app works out the final score from these (a weighted average), so the same judgements always give the same score. No criteria: one overall score, as before.',
      h('div', { class: 'stack', style: 'gap:8px' }, crit, weightSum, edit ? h('div', {}, h('button', { type: 'button', class: 'btn sm', onclick: () => { crit.append(critRow()); sumWeights(); check(); } }, 'Add a criterion')) : null)),
    sec('Caps', 'Rules that always hold: when one applies, the score can be no higher than its number. The reviewer says which apply; the app caps the score.',
      h('div', { class: 'stack', style: 'gap:8px' }, capsEl, edit ? h('div', {}, h('button', { type: 'button', class: 'btn sm', onclick: () => { capsEl.append(capRow()); check(); } }, 'Add a cap')) : null)),
    sec('Key points', 'What Stackup expects in every proposal, one per line. The reviewer holds every proposal to these.', keyPoints),
    sec('Key points by proposal type', 'Added to the general key points when a proposal of that type is reviewed. One per line; leave a type empty to use only the general ones.',
      h('div', { class: 'stack', style: 'gap:10px' }, Object.entries(typeAreas).map(([t, el]) => h('details', { class: 'fold' }, h('summary', {}, t + (el.value.trim() ? '' : ' (none yet)')), el)))),
    sec('Examples and parts', 'Examples: proposals from the library below, with the score Stackup says they deserve, shown to the reviewer so it scores on the same standard (the same type first). Parts: the opening, the body and the screening answers each get their own score too.',
      h('div', { class: 'stack', style: 'gap:8px' }, h('label', { class: 'row', style: 'gap:8px' }, exUse, h('span', {}, 'Show the reviewer examples from the library'), h('span', { class: 'jp-label' }, 'how many per review'), exN),
        h('label', { class: 'row', style: 'gap:8px' }, partsCb, h('span', {}, 'Score the opening, the body and the screening answers apart')))),
    h('div', { class: 'two' }, sec('Dos', 'One per line.', f.dos), sec("Don'ts", 'One per line.', f.donts)),
    sec('Score guide', 'What each score means, one line per band. Scores are whole numbers from 1 to 10.', f.score_guide),
    sec('Score limits', 'Rules that always hold, one per line, for example "A proposal with an invented fact cannot score above 6."', f.score_limits),
    sec('How to write the review', 'How the verdict, the problems and the suggestions should be written.', f.writing),
    sec('How many', 'The most of each the reviewer gives. Suggestions 0 turns them off.', h('div', { class: 'row', style: 'gap:18px;flex-wrap:wrap' },
      ...[['Strengths', n.strengths], ['Problems', n.problems], ['Suggestions', n.suggestions]].map(([l, el]) => h('label', { class: 'row', style: 'gap:8px' }, h('span', {}, l), el)))),
    sec('What it reads', 'The job, the proposal and its screening answers, the profile, the projects, the proposal type and the client requirements are always given. These are optional.',
      h('div', { class: 'stack', style: 'gap:6px' }, Object.entries(RV_CONTEXT).map(([k, l]) => h('label', { class: 'row', style: 'gap:8px' }, ctx[k], h('span', {}, l))))));

  // try it: a past proposal, the draft above, nothing saved
  const { jobs } = edit ? await api('GET', '/admin/reviewer/jobs') : { jobs: [] };
  const jobSel = h('select', { id: 'rv-job', 'aria-label': 'Job to try it on' }, jobs.length ? jobs.map((j) => h('option', { value: j.id }, `#${j.id} ${j.title || 'Untitled'}${j.template_name ? ' · ' + j.template_name : ''}`)) : h('option', { value: '' }, 'No written proposals yet'));
  const out = h('div', { class: 'stack', style: 'margin-top:14px' });
  const reviewCard = (title, rv, sub) => {
    if (!rv) return h('div', { class: 'card card-pad' }, h('div', { class: 'jp-sec' }, title), h('p', { class: 'jp-label' }, 'No review yet.'));
    const tone = rv.score >= 8 ? 'PASS' : rv.score >= 5 ? 'FLAG' : 'FAIL';
    const ul = (t, xs) => (xs && xs.length ? h('div', {}, h('div', { class: 'jp-label' }, t), h('ul', { class: 'jp-list', style: 'margin:4px 0 0' }, xs.map((x) => h('li', {}, x)))) : null);
    return h('div', { class: 'card card-pad stack', style: 'gap:10px' }, h('div', { class: 'jp-sec' }, title), sub ? h('div', { class: 'jp-label' }, sub) : null,
      h('div', { class: 'reviewscore ' + tone }, h('span', { class: 'num' }, String(rv.score)), h('span', { class: 'of' }, 'out of 10')),
      h('p', { class: 'jp-body', style: 'margin:0' }, rv.verdict), ...(reviewDetail(rv) || []), ul('What hurts it', rv.problems), ul('What works', rv.strengths),
      rv.suggestions && rv.suggestions.length ? h('div', {}, h('div', { class: 'jp-label' }, 'Suggestions'), h('ul', { class: 'jp-list', style: 'margin:4px 0 0' }, rv.suggestions.map((sg) => h('li', {}, h('strong', {}, sg.title), ': ', sg.instruction)))) : null);
  };
  const testBtn = h('button', { class: 'btn', type: 'button', disabled: !jobs.length || null }, 'Try the draft');
  testBtn.onclick = async () => {
    btnBusy(testBtn, 'Reviewing'); forgetLoader('rvtry'); out.replaceChildren(liveLine({ id: 'rvtry', label: 'The reviewer is reading it with your draft', now: 'Judging ', typical: 60, items: ['the first two lines', 'what the post asks', 'the proof against the facts', 'the format and length', 'the writing rules'] }));
    try {
      const r = await api('POST', '/admin/reviewer/test', { sections: read(), screening_id: Number(jobSel.value) });
      out.replaceChildren(h('div', { class: 'two' }, reviewCard('With the draft above', r.review, `Proposal version ${r.proposal_version}. Not saved.`),
        reviewCard('The review it has now', r.current, r.current ? `Proposal version ${r.current.proposal_version}${r.current.reviewer_version ? ', reviewer version ' + r.current.reviewer_version : ''}` : null)));
    } catch (x) { out.replaceChildren(); toast(x.message, true); }
    testBtn.disabled = false; testBtn.replaceChildren('Try the draft');
  };
  const previewBtn = h('button', { class: 'btn', type: 'button', disabled: !jobs.length || null }, 'See full prompt');
  previewBtn.onclick = async () => {
    try {
      const r = await api('POST', '/admin/reviewer/preview', { sections: read(), screening_id: Number(jobSel.value) });
      modal({ title: 'What the reviewer gets', noConfirm: true, wide: true, body: h('div', {},
        h('p', { class: 'muted', style: 'margin-top:0' }, 'Its instructions: the sections above, then the fixed output format and the facts of this job. Then the job page and the proposal.'),
        h('pre', { class: 'proposal-text', style: 'max-height:60vh;overflow:auto;white-space:pre-wrap' }, r.system + '\n\n----------\n\n' + r.prompt)) });
    } catch (x) { toast(x.message, true); }
  };
  const note = h('input', { type: 'text', id: 'rv-note', placeholder: 'What did you change and why?' });
  const saveBtn = h('button', { class: 'btn primary', type: 'button' }, 'Save as new version');
  saveBtn.onclick = async () => {
    btnBusy(saveBtn, 'Saving');
    try { const r = await api('POST', '/admin/reviewer', { sections: read(), change_note: note.value || undefined }); toast(`Saved as version ${r.version}. Try it, then activate it to use it.`); route(); }
    catch (x) { toast(x.message, true); saveBtn.disabled = false; saveBtn.replaceChildren('Save as new version'); }
  };
  // R115: one starting point. The old simple reviewer is version 1 in the list below (Load).
  const fullBtn = h('button', { class: 'btn', type: 'button', title: 'Criteria with weights, caps, key points for each proposal type and examples. Nothing changes until you save and activate it.' }, 'Load the recommended reviewer');
  fullBtn.onclick = () => { fill(full); check(); loadedFrom.textContent = ' Editing from the recommended reviewer'; toast('The recommended reviewer is in the editor. Try it on the test bench, then save it as a new version.'); };

  // ---- the test bench: the draft on several past proposals at once, beside the score each has now and what the client did
  function benchCard() {
    const count = h('input', { type: 'number', min: 1, max: 12, value: 6, style: 'width:80px', 'aria-label': 'How many proposals' });
    const res = h('div', { style: 'margin-top:12px' });
    const go = h('button', { class: 'btn', type: 'button' }, 'Run the draft on them');
    go.onclick = async () => {
      btnBusy(go, 'Reviewing'); res.replaceChildren(h('div', { class: 'row muted small' }, h('span', { class: 'spin' }), `Reviewing ${count.value} proposals with the draft, three at a time. About a minute each.`));
      try {
        const r = await api('POST', '/admin/reviewer/bench', { sections: read(), count: Number(count.value) || 6 });
        res.replaceChildren(h('p', { class: 'jp-body', style: 'margin:0 0 8px' }, `Average with the draft: ${r.average ?? '-'} · with the reviews they have now: ${r.live_average ?? '-'}`),
          dataTable(['Job', 'Type', 'Draft', 'Now', 'What happened', 'Why'], r.rows.map((x) => h('tr', {},
            h('td', {}, h('a', { href: '#/s/' + x.id + '/proposal' }, '#' + x.id), ' ', (x.title || '').slice(0, 50)), h('td', { class: 'muted' }, x.type || '-'),
            h('td', {}, x.error ? h('span', { class: 'err' }, x.error) : h('strong', {}, String(x.score)), x.capped_by && x.capped_by.length ? h('span', { class: 'jp-label' }, ' capped') : null),
            h('td', { class: 'muted' }, x.live_score == null ? '-' : String(x.live_score)), h('td', {}, x.result || '-'),
            h('td', { class: 'small', style: 'white-space:normal;min-width:260px' }, x.verdict || '', x.criteria && x.criteria.length ? h('div', { class: 'jp-label' }, x.criteria.map((c) => `${c.criterion} ${c.score}`).join(' · ')) : null)))));
      } catch (x) { res.replaceChildren(); toast(x.message, true); }
      go.disabled = false; go.replaceChildren('Run the draft on them');
    };
    return h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Test bench')), h('div', { class: 'card-pad' },
      h('p', { class: 'jp-label', style: 'margin:0 0 8px' }, 'Runs the draft above on the most recent proposals (those a client viewed first), beside the score each has now and what the client did. Nothing is saved. Use it to check the draft scores good proposals 7 or 8 and weak ones lower.'),
      h('div', { class: 'row', style: 'gap:8px' }, h('span', { class: 'jp-label' }, 'Proposals'), count, go), res));
  }
  // ---- the examples library: proposals with the score Stackup says they deserve, and why (not part of a version; used when a version says so)
  function examplesCard() {
    const box = h('div', { class: 'stack', style: 'gap:8px' });
    const form = (x) => {
      const typ = h('select', { 'aria-label': 'Proposal type' }, h('option', { value: '' }, 'Any type'), (types || []).map((t) => h('option', { value: t, selected: !!(x && x.template_name === t) || null }, t)));
      const title = h('input', { type: 'text', maxlength: 200, value: x ? x.title : '', placeholder: 'For example: Strong opening on a HIPAA build' });
      const score = h('input', { type: 'number', min: 1, max: 10, step: 1, value: x ? x.score : 8, style: 'width:80px' });
      const why = h('textarea', { rows: 4, placeholder: 'Why it deserves that score: what works, what does not' }); why.value = x ? x.why : '';
      const text = h('textarea', { rows: 10, placeholder: 'The proposal, as sent' }); text.value = x ? x.proposal_text : '';
      modal({ title: x ? 'Edit example' : 'Add an example', confirm: 'Save example', wide: true, body: h('div', { class: 'stack' },
        h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Proposal type'), typ), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Score it deserves (1 to 10)'), score)),
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Title'), title), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Why'), why), h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'The proposal'), text),
        h('div', { class: 'hint' }, 'Tip: on any job, an admin can add its proposal from the review there (Use as reviewer example).')),
        onConfirm: async () => {
          const body = { template_name: typ.value || null, title: title.value, score: Number(score.value), why: why.value, proposal_text: text.value };
          await api(x ? 'PATCH' : 'POST', x ? '/admin/reviewer/examples/' + x.id : '/admin/reviewer/examples', body); toast('Example saved'); load();
        } });
    };
    async function load() {
      const { examples } = await api('GET', '/reviewer/examples');
      box.replaceChildren(examples.length ? dataTable(['Example', 'Type', 'Score', 'Status', ''], examples.map((x) => h('tr', {},
        h('td', { style: 'white-space:normal' }, h('strong', {}, x.title), h('div', { class: 'meta' }, x.why.slice(0, 160))), h('td', { class: 'muted' }, x.template_name || 'Any type'), h('td', {}, h('strong', {}, x.score + '/10')),
        h('td', {}, activeSwitch(x.active, { name: x.title, url: '/admin/reviewer/examples/' + x.id, no: 'Off', can: edit, after: load, offText: 'The reviewer no longer sees it.' })),
        edit ? acts(h('button', { class: 'btn sm', onclick: () => form(x) }, 'Edit')) : h('td', {}))))
        : h('p', { class: 'jp-label' }, 'No examples yet. Add proposals the team sent, good and weak, with the score each deserves and why.'));
    }
    load();
    return h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Examples library'), edit ? h('button', { class: 'btn sm primary', type: 'button', onclick: () => form(null) }, 'Add an example') : null),
      h('div', { class: 'card-pad' }, h('p', { class: 'jp-label', style: 'margin:0 0 8px' }, 'Real proposals with the score Stackup says they deserve, and why. A reviewer version that uses examples shows the reviewer the most relevant few (the same type first, a spread of scores), so it scores on Stackup\'s standard.'), box));
  }
  const vitem = (v) => h('div', { class: 'vitem' }, h('div', { class: 'top' }, h('strong', {}, 'Version ' + v.version), v.is_active ? h('span', { class: 'pill PASS' }, 'Active') : null),
    h('div', { class: 'small muted' }, (v.change_note || 'No note') + (v.created_by_name ? ' · ' + v.created_by_name : '') + ' · ' + ago(v.created_at)),
    h('div', { class: 'row', style: 'gap:6px' },
      h('button', { class: 'btn sm', onclick: async () => { const r = (await api('GET', '/reviewer/' + v.id)).version; base = r.sections; fill(base); check(); loadedFrom.textContent = ` Editing from version ${v.version}`; toast('Loaded version ' + v.version + ' into the editor'); window.scrollTo(0, 0); } }, 'Load'),
      edit && !v.is_active ? h('button', { class: 'btn sm', onclick: () => modal({ title: 'Activate version ' + v.version + '?', confirm: 'Activate',
        body: h('p', { class: 'muted' }, 'Every review from now on, in the app and from Claude, uses this version. Reviews already made keep the version that made them.'),
        onConfirm: async () => { await api('POST', `/admin/reviewer/${v.id}/activate`, {}); toast('Version ' + v.version + ' is now active'); route(); } }) }, 'Activate') : null));

  shell('reviewer', [pageHead('Reviewer', 'How the independent reviewer scores every proposal, in the app and from Claude. Saving never overwrites: it creates a new version.'),
    h('div', { class: 'notice' }, icon('info'), h('span', {}, edit ? 'Change any part, try the draft on a past proposal, save it as a new version, then activate it. The facts the reviewer reads and the shape of its answer (score, verdict, problems, strengths, suggestions) are fixed by the app.'
      : 'Only an admin changes the reviewer. This is the active version.')),
    h('div', { class: 'two' }, h('div', { class: 'stack' },
      h('div', { class: 'row spread' }, h('span', { class: 'sub' }, dirty, loadedFrom), edit ? fullBtn : null),
      editor,
      edit ? h('div', { class: 'card card-pad' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'rv-note' }, 'Change note'), note), h('div', { class: 'row', style: 'margin-top:14px;gap:8px' }, saveBtn)) : null,
      edit ? h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Try the draft')), h('div', { class: 'card-pad' },
        h('p', { class: 'jp-label', style: 'margin:0 0 8px' }, 'Reviews the newest version of a past proposal with the sections above, beside the review it has now. Nothing is saved.'),
        jobSel, h('div', { class: 'row', style: 'margin-top:12px;gap:8px' }, testBtn, previewBtn), out)) : null,
      edit ? benchCard() : null, examplesCard()),
      versionsCard(versions, vitem, (v) => `version ${v.version} ${v.change_note || ''}`))], true);
}

// ---------- changes (admin): every change to the setup, to review and put back ----------
const CHANGE_ACTION = { create: 'Added', update: 'Changed', switch_off: 'Switched off', switch_on: 'Switched on', delete: 'Deleted', revert: 'Put back' };
/** Where an item of each kind is opened in the app, when it has a page of its own. */
const CHANGE_LINK = { project: (id) => '#/p/' + id, industry: (id) => '#/i/' + id, signal: (id) => '#/sig/' + id, template: (id) => '#/t/' + id, writing_doc: (id) => '#/wg/' + id, rule: () => '#/rules', tag: () => '#/dictionary',
  tag_category: () => '#/dictionary?tab=categories', profile: () => '#/profiles', loom_video: () => '#/looms', setting: () => '#/settings', gate_instructions: () => '#/skill', reviewer_instructions: () => '#/reviewer' };
async function changesView() {
  const hp = hashParams();
  const st = { kind: hp.kind || '', user: hp.user || '', source: hp.source || '', status: hp.status || '', from: hp.from || '', to: hp.to || '', q: hp.q || '', page: Math.max(1, Number(hp.page) || 1) };
  const holder = h('div', {}), head = h('div', {});
  let first = null, fbar = null;
  const putBack = (c, force) => modal({ title: force ? 'Put it back anyway?' : `Put back this change?`, confirm: force ? 'Put it back anyway' : 'Put it back', danger: true,
    body: h('div', {}, h('p', { class: 'muted', style: 'margin-top:0' }, force
      ? `${c.kind_label} "${c.entity_name || ''}" was changed again after this change. Putting it back returns the item to how it was before change ${c.id}, which also undoes what came later:`
      : `${c.kind_label} "${c.entity_name || ''}" returns to how it was before this change. This is recorded as a change of its own, so it can be put back too.`),
      force ? changesList(JSON.stringify(force)) : changesList(JSON.stringify(c.changes))),
    onConfirm: async () => {
      try { await api('POST', `/admin/changes/${c.id}/revert`, force ? { force: true } : {}); toast('Put back'); await load(); }
      catch (x) { if (x.status === 409 && x.data && x.data.can_force) { setTimeout(() => putBack(c, x.data.changed_since || []), 0); return; } throw x; }
    } });
  async function load() {
    const q = new URLSearchParams({ page: st.page }); for (const k of ['kind', 'user', 'source', 'status', 'from', 'to', 'q']) if (st[k]) q.set(k, st[k]);
    setHashParams({ ...Object.fromEntries(['kind', 'user', 'source', 'status', 'from', 'to', 'q'].map((k) => [k, st[k]])), page: st.page });
    const d = await api('GET', '/admin/changes?' + q);
    if (!first) { first = d;
      const sel = (key, label, options) => fSelect(label, options, st[key], (v) => { st[key] = v; st.page = 1; load(); });
      fbar = filterBar([fSearch('Search by name or reason', st.q, (v) => { st.q = v; st.page = 1; load(); }),
        sel('status', 'Any status', [['review', 'To review'], ['applied', 'Applied'], ['reverted', 'Put back']]), sel('kind', 'Anything', d.kinds.map((k) => [k.key, k.label])),
        sel('user', 'Anyone', d.people.map((u) => [u.id, u.name])), sel('source', 'App and Claude', [['app', 'Made in the app'], ['claude_plugin', 'Made from Claude']]),
        dateField('From', st.from, (v) => { st.from = v; st.page = 1; load(); }), dateField('To', st.to, (v) => { st.to = v; st.page = 1; load(); })],
        { onClear: () => { location.hash = '#/changes'; route(); } });
    }
    fbar.setActive(['kind', 'user', 'source', 'status', 'from', 'to', 'q'].some((k) => st[k]));
    head.replaceChildren(d.to_review ? h('div', { class: 'notice' }, icon('info'), h('span', { style: 'flex:1' }, d.i_am_main
        ? `${d.to_review} change${d.to_review === 1 ? '' : 's'} by other people to look at. Each is already applied; mark it seen, or put it back.`
        : `${d.to_review} change${d.to_review === 1 ? ' is' : 's are'} waiting for the main admin to look at. They are already applied.`),
      d.i_am_main ? h('button', { class: 'btn sm', type: 'button', onclick: async () => { await api('POST', '/admin/changes/seen-all', {}); toast('All marked as seen'); load(); } }, 'Mark all as seen') : null) : '');
    const badge = (c) => (c.status === 'reverted' ? h('span', { class: 'pill wait', title: c.reverted_at ? `Put back ${full(c.reverted_at)}${c.reverted_by_name ? ' by ' + c.reverted_by_name : ''}` : '' }, 'Put back')
      : c.needs_review ? h('span', { class: 'pill FLAG' }, 'To review') : h('span', { class: 'pill PASS', title: c.reviewed_at ? `Seen ${full(c.reviewed_at)}${c.reviewed_by_name ? ' by ' + c.reviewed_by_name : ''}` : '' }, c.reviewed_at ? 'Seen' : 'Applied'));
    const link = (c) => { const f = CHANGE_LINK[c.entity]; return f && c.action !== 'delete' ? h('a', { href: f(c.entity_id) }, c.entity_name || c.kind_label) : h('span', {}, c.entity_name || c.kind_label); };
    holder.replaceChildren(...[d.changes.length ? dataTable(['When', 'Who', 'What', 'Change', 'Status', ''], d.changes.map((c) => h('tr', { class: 'toprow' },
      h('td', { class: 'muted nowrap', title: full(c.created_at) }, ago(c.created_at), h('div', { class: 'meta' }, '#' + c.id)),
      h('td', { class: 'nowrap' }, c.user_name || 'System', h('div', { class: 'meta' }, c.source === 'claude_plugin' ? 'From Claude' : 'In the app')),
      h('td', { style: 'min-width:180px' }, h('strong', {}, link(c)), h('div', { class: 'meta' }, `${c.kind_label} · ${CHANGE_ACTION[c.action] || c.action}${c.reverts_set ? ' (change #' + c.reverts_set + ')' : ''}`)),
      h('td', { style: 'overflow-wrap:anywhere;min-width:300px' }, c.reason ? h('div', { class: 'muted', style: 'margin-bottom:4px' }, c.reason) : null, changesList(JSON.stringify(c.changes)) || h('span', { class: 'faint' }, 'No field changed')),
      h('td', {}, badge(c)),
      acts(d.i_am_main && c.needs_review && c.status === 'applied' ? h('button', { class: 'btn sm', type: 'button', onclick: async () => { await api('POST', `/admin/changes/${c.id}/seen`, {}); load(); } }, 'Seen') : null,
        d.i_am_main && c.status === 'applied' ? h('button', { class: 'btn sm', type: 'button', onclick: () => putBack(c) }, 'Put back') : null))))
      : emptyState('back', ['kind', 'user', 'source', 'status', 'from', 'to', 'q'].some((k) => st[k]) ? 'No matches' : 'No changes yet', 'Every change to projects, tags, profiles, rules, the writing guide and the rest of the setup shows here, from the app and from Claude.'),
      pager(d.total, d.page, (n) => { st.page = n; load(); })].filter(Boolean));
    if (!holder.parentNode) return;
  }
  await load();
  shell('changes', [pageHead('Changes', 'Every change to the setup, from the app and from Claude: who made it, what changed and why. The main admin can put any change back.'), head, h('div', { class: 'card' }, fbar, holder)]);
}

// ---------- logs (admin): activity and AI calls ----------
/** What a log entry changed: each field with its old and new value, the lines removed and added, the names removed and added. */
function changesList(json) {
  let list; try { list = JSON.parse(json || '[]'); } catch { list = []; }
  if (!list.length) return null;
  const name = (f) => cap(String(f).replace(/_html$/, '').replace(/[._]/g, ' '));
  const val = (v) => (v == null || v === '' ? h('span', { class: 'faint' }, 'empty') : h('span', {}, v));
  const rows = list.map((c) => h('li', {}, h('strong', {}, name(c.field) + ': '),
    c.removed || c.added ? h('div', { class: 'chglines' }, ...(c.removed || []).map((l) => h('div', { class: 'del' }, '− ' + l)), ...(c.added || []).map((l) => h('div', { class: 'add' }, '+ ' + l)),
      !(c.removed || []).length && !(c.added || []).length ? h('span', { class: 'faint' }, 'only spacing changed') : null)
      : h('span', {}, val(c.from), ' → ', val(c.to))));
  const ul = h('ul', { class: 'chglist' }, rows);
  return list.length <= 3 ? ul : h('details', { class: 'chgfold' }, h('summary', {}, `What changed (${list.length})`), ul);
}
async function auditView() {
  const hp = hashParams();
  const st = { tab: hp.tab === 'calls' ? 'calls' : 'activity', page: Math.max(1, Number(hp.page) || 1), action: hp.action || '', user: hp.user || '', from: hp.from || '', to: hp.to || '', kind: hp.kind || '', ok: hp.ok || '', model: hp.model || '', job: hp.job || '' };
  const opts = await api('GET', '/screenings/filter-options');
  const holder = h('div', { class: 'card' });
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const drawTabs = () => tabs.replaceChildren(...[['activity', 'Activity'], ['calls', 'AI calls']].map(([k, l]) =>
    h('button', { type: 'button', role: 'tab', 'aria-selected': st.tab === k, class: 'tab' + (st.tab === k ? ' on' : ''), onclick: () => { st.tab = k; st.page = 1; drawTabs(); load(); } }, l)));
  drawTabs();
  const sel = (key, label, options) => { const el = h('select', { class: 'fsel', 'aria-label': label, multiple: true }, h('option', { value: '' }, label), options.map(([v, l]) => h('option', { value: v, selected: isOn(st[key], v) }, l))); /* R129: several */ el.onchange = () => { st[key] = el.value; st.page = 1; load(); }; return el; };
  const dateIn = (key, label) => dateField(label, st[key], (v) => { st[key] = v; st.page = 1; load(); });
  const secs = (ms) => (ms / 1000).toFixed(1) + ' s';
  /** The shared filter bar; Clear empties the keys this tab filters by. */
  const bar = (controls, keys) => { const b = filterBar(controls, { onClear: () => { for (const k of keys) st[k] = ''; delete bars[st.tab]; st.page = 1; load(); } }); b.setActive(keys.some((k) => st[k])); return b; };
  // R136: each tab's bar is made once and kept, so a dropdown stays open while its ticks apply and the list reloads under it
  const bars = {};
  const barOnce = (make, keys) => { if (!bars[st.tab]) bars[st.tab] = make(); bars[st.tab].setActive(keys.some((k) => st[k])); return bars[st.tab]; };
  async function load() {
    const keys = st.tab === 'calls' ? ['kind', 'ok', 'model', 'from', 'to', 'job'] : ['action', 'user', 'from', 'to'];
    const q = new URLSearchParams({ page: st.page }); for (const k of keys) if (st[k]) q.set(k, st[k]);
    setHashParams({ tab: st.tab === 'activity' ? '' : st.tab, page: st.page, ...Object.fromEntries(['action', 'user', 'from', 'to', 'kind', 'ok', 'model', 'job'].map((k) => [k, keys.includes(k) ? st[k] : ''])) });
    if (st.tab === 'activity') {
      const d = await api('GET', '/admin/audit?' + q);
      holder.replaceChildren(barOnce(() => bar([sel('action', 'Any action', d.actions.map((a) => [a, cap(a.replace(/_/g, ' '))])), sel('user', 'Anyone', opts.users.map((u) => [u.id, u.name])), dateIn('from', 'From'), dateIn('to', 'To')], ['action', 'user', 'from', 'to']), ['action', 'user', 'from', 'to']),
        d.log.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['When', 'Who', 'Action', 'Detail'].map((t) => h('th', {}, t)))),
          h('tbody', {}, d.log.map((l) => h('tr', {}, h('td', { class: 'muted nowrap', title: full(l.created_at) }, ago(l.created_at)), h('td', { class: 'nowrap' }, l.user_name || 'System'),
            h('td', { class: 'nowrap' }, cap(l.action.replace(/_/g, ' '))), h('td', { style: 'overflow-wrap:anywhere;min-width:280px' }, h('div', { class: 'muted' }, l.detail || ''), changesList(l.changes))))))) : emptyState('audit', 'Nothing here', 'No activity matches these filters.'),
        pager(d.total, d.page, (n) => { st.page = n; load(); }));
    } else {
      const d = await api('GET', '/admin/calls?' + q);
      const errs = d.summary.reduce((a, r) => a + r.errors, 0), all = d.summary.reduce((a, r) => a + r.calls, 0);
      holder.replaceChildren(barOnce(() => bar([sel('kind', 'Any job type', d.kinds.map((k) => [k, cap(k.replace(/_/g, ' '))])), sel('ok', 'Any result', [['1', 'Succeeded'], ['0', 'Failed']]),
          sel('model', 'Any model', d.models.map((m) => [m, m])), dateIn('from', 'From'), dateIn('to', 'To')], ['kind', 'ok', 'model', 'from', 'to', 'job']), ['kind', 'ok', 'model', 'from', 'to', 'job']),
        h('div', { class: 'card-head', style: 'border-bottom:0' }, h('h2', {}, 'By step'), h('span', { class: 'sub' }, `${all.toLocaleString()} call${all === 1 ? '' : 's'} · ${errs} failed`)),
        h('div', {},
          d.summary.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Job type', 'Step', 'Model', 'Calls', 'Failed', 'Average', 'Slowest'].map((t) => h('th', {}, t)))),
            h('tbody', {}, d.summary.map((r) => h('tr', {}, h('td', {}, cap(r.kind.replace(/_/g, ' '))), h('td', {}, cap(r.step || '-')), h('td', { class: 'mono' }, r.model || '-'), h('td', {}, r.calls),
              h('td', {}, r.errors ? h('span', { class: 'pill bad' }, r.errors) : '0'), h('td', {}, secs(r.avg_ms)), h('td', {}, secs(r.max_ms))))))) : null),
        h('div', { class: 'card-head', style: 'border-top:1px solid var(--line);border-bottom:0' }, h('h2', {}, 'Every call')),
        d.calls.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['When', 'Job', 'Type and step', 'Model', 'Time', 'Result'].map((t) => h('th', {}, t)))),
          h('tbody', {}, d.calls.map((c) => h('tr', {}, h('td', { class: 'muted nowrap', title: full(c.created_at) }, ago(c.created_at)),
            h('td', {}, c.screening_id ? h('a', { href: '#/s/' + c.screening_id }, '#' + c.screening_id + ' ' + (c.title || '').slice(0, 40)) : h('span', { class: 'faint' }, '-')),
            h('td', {}, cap(`${c.kind.replace(/_/g, ' ')}${c.step ? ' / ' + c.step : ''}`)), h('td', { class: 'mono' }, c.model || ''), h('td', {}, secs(c.ms)),
            h('td', {}, Number(c.ok) ? h('span', { class: 'pill PASS' }, 'OK') : h('span', { class: 'pill bad', title: c.error || '' }, c.error || 'Failed'))))))) : emptyState('audit', 'No AI calls yet', 'Calls are logged from now on: every screening, tagging, signal reading and proposal.'),
        pager(d.total, d.page, (n) => { st.page = n; load(); }));
    }
  }
  shell('audit', [pageHead('Logs', 'Activity: who did what. AI calls: every model call, how long it took and whether it failed.'), tabs, holder], 1480);
  await load();
}

// ---------- rules (admin) ----------
async function rulesView() {
  const { rules } = await api('GET', '/admin/rules');
  const fields = (r) => {
    const rule = h('textarea', { id: 'rr', style: 'min-height:70px', maxlength: 300 }); rule.value = r ? r.rule : '';
    const det = h('textarea', { id: 'rd', style: 'min-height:90px', maxlength: 1000, placeholder: 'Optional. Exceptions, how to measure it, examples. e.g. A paid test is fine.' }); det.value = r?.details || '';
    return { rule, det, body: (hint) => h('div', {},
      h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'rr' }, 'Rule'), rule, h('div', { class: 'hint' }, hint)),
      h('div', { class: 'field', style: 'margin-top:12px' }, h('label', { class: 'lbl', for: 'rd' }, 'How to apply'), det, h('div', { class: 'hint' }, 'Sent to the AI with the rule. It is how the gate knows the exceptions.'))) };
  };
  const add = (type) => {
    const f = fields(null);
    f.rule.placeholder = type === 'fail' ? 'e.g. Client asks for work outside Upwork' : 'e.g. Job needs a language we do not use';
    modal({ title: type === 'fail' ? 'Add a fail rule' : 'Add a flag rule', confirm: 'Add rule', body: f.body('It gets the next free code. Codes are never reused, so old jobs keep their meaning. The gate applies it from the next job on.'),
      onConfirm: async () => { const r = await api('POST', '/admin/rules', { type, rule: f.rule.value, details: f.det.value }); toast('Added ' + r.code); route(); } });
  };
  const edit = (r) => {
    const f = fields(r);
    modal({ title: 'Edit ' + r.code, confirm: 'Save', body: f.body('Keep the meaning: jobs already flagged with ' + r.code + ' were judged by the old wording. For a new meaning, add a new rule.'),
      onConfirm: async () => { await api('PATCH', '/admin/rules/' + r.code, { rule: f.rule.value, details: f.det.value }); toast(r.code + ' saved'); route(); } });
  };
  const row = (r) => h('tr', { class: r.active ? '' : 'retired' },
    h('td', {}, h('span', { class: 'code ' + (r.type === 'fail' ? 'F' : 'G') }, r.code)),
    h('td', {}, h('span', { class: 'vbadge ' + (r.type === 'fail' ? 'FAIL' : 'FLAG') }, r.type === 'fail' ? 'Fail' : 'Flag')),
    h('td', { style: 'white-space:normal' }, r.rule, r.details ? h('div', { class: 'meta', style: 'margin-top:2px' }, 'How to apply: ' + r.details) : null),
    h('td', { class: 'nowrap' }, r.fired ? h('a', { href: `#/history?rule=${r.code}` }, `${r.fired} job${r.fired === 1 ? '' : 's'}`) : h('span', { class: 'faint' }, 'None')),
    h('td', {}, activeSwitch(r.active, { name: r.code, url: '/admin/rules/' + r.code, no: 'Retired', offText: 'New screenings no longer use it. Jobs it already fired on keep it.' })),
    acts(h('button', { class: 'btn sm', onclick: () => edit(r) }, 'Edit')));
  shell('rules', [pageHead('Rules', 'The fail and flag rules the gate applies. Codes are never renumbered or reused: a rule is reworded or retired, and a new meaning gets a new code.',
      [h('a', { class: 'btn', href: '#/flagreview' }, icon('audit'), 'Flag review'), h('button', { class: 'btn', onclick: () => add('flag') }, icon('screen'), 'Add flag rule'), h('button', { class: 'btn primary', onclick: () => add('fail') }, icon('screen'), 'Add fail rule')]),
    h('div', { class: 'notice' }, icon('info'), h('span', {}, 'Every active rule, with its "How to apply" note, is added after the ', h('a', { href: '#/skill' }, 'Gate instructions'), ' for every job. A change here applies from the next job on, and each job keeps the rules it was screened against.')),
    listCard({ items: rules, paged: false, icon: 'warn', emptyTitle: 'No rules yet', emptyText: 'Add the first fail or flag rule.',
      search: { placeholder: 'Search rules', text: (r) => r.code + ' ' + r.rule + ' ' + (r.details || '') },
      filters: [{ key: 'type', label: 'Fail and flag', options: [['fail', 'Fail rules'], ['flag', 'Flag rules']], test: (r, v) => r.type === v },
        { key: 'status', label: 'Any status', options: [['1', 'Active'], ['0', 'Retired']], test: (r, v) => String(Number(!!r.active)) === v },
        { key: 'fired', label: 'Fired or not', options: [['1', 'Fired on a job'], ['0', 'Never fired']], test: (r, v) => String(Number(r.fired > 0)) === v }],
      render: (slice) => dataTable(['Code', 'Type', 'Rule', 'Fired on', 'Status', ''], slice.map(row), 'rulestable') })], true);
}

// ---------- Proposal feedback (R67): what people said was wrong in proposals, to read the patterns and fix the setup ----------
async function feedbackView() {
  const r = await api('GET', '/feedback');
  const total = r.counts.reduce((n, c) => n + Number(c.n), 0);
  const counts = h('div', { class: 'card card-pad' }, h('div', { class: 'jp-sec' }, `${total} feedback entr${total === 1 ? 'y' : 'ies'}`),
    h('div', { class: 'chips', style: 'margin-top:8px' }, r.counts.length ? r.counts.map((c) => h('span', { class: 'chip' }, `${c.category} ${c.n}`)) : h('span', { class: 'faint' }, 'None yet. Add feedback from the proposal page, beside the review.')),
    h('p', { class: 'jp-label', style: 'margin:10px 0 0' }, 'After 20 or 30 proposals, read these by category: a wrong fact means a project or profile to fix; a wrong project means tags; tone, length and openings mean the proposal type or the writing guide; a banned phrase means the banned phrases list.'));
  const row = (f) => h('tr', {},
    h('td', { class: 'nowrap' }, full(f.created_at), h('div', { class: 'small muted' }, f.user_name || '')),
    h('td', { style: 'white-space:normal;min-width:180px' }, h('a', { href: `#/s/${f.screening_id}/proposal` }, f.job_title || ('Job #' + f.screening_id)), h('div', { class: 'small muted' }, [f.profile_name, f.template_name, f.version_no ? 'version ' + f.version_no : null].filter(Boolean).join(' · '))),
    h('td', {}, h('span', { class: 'chip' }, f.category)),
    h('td', { style: 'white-space:pre-wrap;min-width:220px;max-width:360px' }, f.excerpt.length > 400 ? f.excerpt.slice(0, 400) + '...' : f.excerpt),
    h('td', { style: 'white-space:pre-wrap;min-width:200px;max-width:320px' }, f.feedback));
  const waiting = r.waiting && r.waiting.length ? h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Experience waiting for the library'), h('span', { class: 'sub' }, String(r.waiting.length))),
    h('div', { class: 'card-pad stack', style: 'gap:8px' }, h('p', { class: 'jp-label', style: 'margin:0' }, 'Confirmed on a proposal, not yet a tag on the project: an existing tag that would change the matching, or an answer by someone who cannot change the library.'),
      r.waiting.map((g) => h('div', { class: 'suggestion' }, h('div', {}, h('strong', {}, `${g.tag_name || g.skill} on ${g.project_name || 'no project'}`), h('div', { class: 'jp-label' }, g.note || ''),
        h('div', { class: 'faint small' }, `${g.user_name || ''}, job #${g.screening_id}`)),
        me.role === 'admin' && g.project_name ? h('button', { class: 'btn sm', type: 'button', onclick: async (e) => { btnBusy(e.currentTarget, 'Adding'); try { await api('POST', `/admin/gaps/${g.id}/link`, { project_id: g.project_id }); toast('Added to the project'); route(); } catch (x) { toast(x.message, true); route(); } } }, 'Add to library') : null)))) : null;
  shell('feedback', [pageHead('Proposal feedback', 'What was wrong in proposals, each kept with the proposal as it was. Read it by category to see what to fix in the setup.'),
    counts, waiting,
    listCard({ items: r.items, paged: true, icon: 'audit', emptyTitle: 'No feedback yet', emptyText: 'On a proposal, use the Feedback card beside the review.',
      search: { placeholder: 'Search the text, the feedback and the job', text: (f) => [f.excerpt, f.feedback, f.job_title, f.projects].join(' ') },
      filters: [{ key: 'category', label: 'Any category', options: r.categories.map((c) => [c, c]), test: (f, v) => f.category === v },
        { key: 'profile', label: 'Any profile', options: [...new Set(r.items.map((f) => f.profile_name).filter(Boolean))].map((x) => [x, x]), test: (f, v) => f.profile_name === v },
        { key: 'type', label: 'Any type', options: [...new Set(r.items.map((f) => f.template_name).filter(Boolean))].map((x) => [x, x]), test: (f, v) => f.template_name === v },
        { key: 'person', label: 'Anyone', options: [...new Set(r.items.map((f) => f.user_name).filter(Boolean))].map((x) => [x, x]), test: (f, v) => f.user_name === v }],
      render: (slice) => dataTable(['When', 'Job', 'What kind', 'The part', 'Feedback'], slice.map(row), 'rulestable') })], true);
}

// ---------- Clients (R106, R107, Hamza): every Upwork client we screened a job for, in one place ----------
const howWent = (j) => j.current_status || (j.stage ? (STAGE_INFO[j.stage] || [])[1] : '') || '';
/** R110: a client's short ID, the same on every job of theirs: "C-12". */
const clientId = (id) => 'C-' + id;
/** The client's ID on a job in the Jobs list: highlighted when they are returning; it lists that client's jobs. */
const clientChip = (r) => { const more = Number(r.client_jobs) || 0; if (!more) return null; // R110: only a returning client is worth a tag
  return h('a', { class: 'cidchip' + (more ? ' ret' : ''), href: '#/history?client=' + r.client_id, onclick: (e) => e.stopPropagation(),
    title: more ? `Returning client: ${more} other job${more === 1 ? '' : 's'} with ${clientId(r.client_id)}. Click to list them.` : `Client ${clientId(r.client_id)}: their first job with us` },
    h('b', {}, clientId(r.client_id)), more ? ` \u00b7 ${more + 1} jobs` : null); };
const clientName = (c) => c.name || c.company || c.contact_name || (c.last_title && !/^not shown/i.test(c.last_title) ? c.last_title : null) || 'Client #' + c.id;
async function clientsView() {
  const r = await api('GET', '/clients');
  // R110: the ID first (the same one each of their jobs shows), then who they are, their jobs, and who handled them
  const row = (c) => { const named = c.name || c.company || c.contact_name, latest = c.last_title && !/^not shown/i.test(c.last_title) ? c.last_title : null;
    return h('tr', { class: 'click', onclick: () => (location.hash = '#/clients/' + c.id) },
      h('td', { class: 'nowrap' }, h('span', { class: 'cidchip' + (c.jobs > 1 ? ' ret' : '') }, clientId(c.id))),
      h('td', { class: 'clcell' }, named ? h('strong', {}, named) : h('div', { class: 'clclip strong', title: latest || '' }, latest || 'No job title'),
        named && latest ? h('div', { class: 'clclip', title: latest }, 'Latest: ' + latest) : null,
        c.country || c.member_since ? h('div', { class: 'small faint' }, [c.country, c.member_since ? 'member since ' + c.member_since : null].filter(Boolean).join(' \u00b7 ')) : null),
      h('td', { class: 'nowrap' }, h('strong', {}, String(c.jobs)), c.jobs > 1 ? h('span', { class: 'small muted' }, ' returning') : null,
        c.invites || c.hired ? h('div', { class: 'small muted' }, [c.invites ? `${c.invites} invite${c.invites === 1 ? '' : 's'}` : null, c.hired ? `hired us ${c.hired === 1 ? 'once' : c.hired + ' times'}` : null].filter(Boolean).join(' \u00b7 ')) : null),
      h('td', { class: 'clcell' }, c.profiles ? h('div', { class: 'chips' }, c.profiles.split(', ').map((x) => h('span', { class: 'chip' }, x))) : h('span', { class: 'faint' }, 'No profile yet'),
        c.people ? h('div', { class: 'small muted', style: 'margin-top:4px' }, c.people) : null),
      h('td', { class: 'nowrap' }, dayText(c.last_seen), c.jobs > 1 && dayText(c.first_seen) !== dayText(c.last_seen) ? h('div', { class: 'small muted' }, 'first ' + dayText(c.first_seen)) : null)); };
  const returning = r.clients.filter((c) => c.jobs > 1).length;
  shell('clients', [pageHead('Clients', `Every Upwork client we screened a job for: ${r.clients.length} client${r.clients.length === 1 ? '' : 's'}, ${returning} returning. Each has an ID, and every job of theirs shows the same one in the Jobs list. Jobs are joined by themselves from each post: the same Upwork job, the client\u2019s recent history or other open jobs, past jobs in common, or the company or name the post states. A new client\u2019s join date and country alone never join two jobs.`),
    listCard({ items: r.clients, paged: true, icon: 'users', emptyTitle: 'No clients yet', emptyText: 'Each job\u2019s client is added here once its post is read.',
      search: { placeholder: 'Search by ID (C-12), name, company, country, notes or job', text: (c) => [clientId(c.id), 'C' + c.id, c.name, c.company, c.contact_name, c.country, c.last_title, c.notes, c.profiles, c.people].join(' ') },
      filters: [{ key: 'kind', label: 'Every client', options: [['returning', 'Returning clients'], ['invites', 'Sent us invites'], ['hired', 'Hired us']], test: (c, v) => (v === 'returning' ? c.jobs > 1 : v === 'invites' ? c.invites > 0 : c.hired > 0) },
        { key: 'profile', label: 'Any profile', options: [...new Set(r.clients.flatMap((c) => (c.profiles || '').split(', ')).filter(Boolean))].sort().map((x) => [x, x]), test: (c, v) => (c.profiles || '').split(', ').includes(v) }],
      render: (slice) => dataTable(['ID', 'Client', 'Jobs', 'Profiles and people', 'Last seen'], slice.map(row), 'rulestable cltable') })], true);
}
async function clientView(id) {
  const r = await api('GET', '/clients/' + id), c = r.client;
  if (c.id !== id) { location.hash = '#/clients/' + c.id; return; } // merged into another profile
  const jobs = r.jobs, n = jobs.length, invites = jobs.filter((j) => j.invite).length, hired = jobs.filter((j) => /^hired$/i.test(j.current_status || '')).length;
  const named = c.name || c.company || c.contact_name;
  // R107 refinement: a short name for the heading (never a long job title), the key facts as chips under it
  const chips = [h('span', { class: 'cidchip' + (n > 1 ? ' ret' : '') }, clientId(c.id)), n > 1 ? h('span', { class: 'chip brand' }, 'Returning') : null, c.country ? h('span', { class: 'chip' }, c.country) : null,
    c.member_since ? h('span', { class: 'chip' }, 'Member since ' + c.member_since) : null, h('span', { class: 'chip' }, `${n} job${n === 1 ? '' : 's'} with us`),
    invites ? h('span', { class: 'chip' }, `${invites} invite${invites === 1 ? '' : 's'}`) : null, hired ? h('span', { class: 'chip good' }, `Hired us ${hired === 1 ? 'once' : hired + ' times'}`) : null].filter(Boolean);
  const merge = r.can_fix ? h('button', { class: 'btn', type: 'button', onclick: () => mergeDialog(c) }, 'Same client as another') : null;
  const head = h('div', {}, h('a', { href: '#/clients', class: 'back' }, icon('back'), 'Clients'),
    h('div', { class: 'page-head' }, h('div', { style: 'min-width:0' }, h('h1', {}, named || 'Unnamed client'),
      h('div', { class: 'chips', style: 'margin-top:8px' }, chips),
      !named && n ? h('p', { class: 'sub' }, 'Give them a name in Your notes. Upwork does not show who the client is.') : null),
      merge ? h('div', { class: 'actions' }, merge) : null));

  // why these jobs are one client: said once, not under every job
  const reasons = [...new Set(jobs.flatMap((j) => (j.why || []).flatMap((w) => w.why)))];
  const why = n > 1 && reasons.length ? h('div', { class: 'notice' }, icon('info'), h('span', {}, h('strong', {}, 'Joined because '), reasons.join('; ') + '.')) : null;

  const tone = (t) => /^hired$/i.test(t) ? 'PASS' : /lost|not hired|declined|closed|cancel/i.test(t) ? 'FAIL' : /skipped|not continued/i.test(t) ? 'wait' : 'brand';
  const separate = (j) => r.can_fix && n > 1 ? h('button', { class: 'linkbtn small', type: 'button', title: 'This job is from another client: give it a profile of its own', onclick: async (e) => { e.preventDefault(); e.stopPropagation();
    if (!(await ask('Not this client?', `Job #${j.id} gets a client profile of its own, and the matching leaves it there.`, 'Take it out'))) return;
    try { const x = await api('POST', `/screenings/${j.id}/client/separate`, {}); toast('Taken out'); location.hash = '#/clients/' + x.client_id; } catch (x) { toast(x.message, true); } } }, 'Not this client') : null;
  const jobRow = (j) => h(j.can_open ? 'a' : 'div', { class: 'cjob', href: j.can_open ? '#/s/' + j.id : null },
    h('div', { class: 'cjob-main' }, h('div', { class: 'cjob-title' }, j.title || 'Untitled'),
      h('div', { class: 'cjob-meta' }, [`#${j.id}`, dayText(j.created_at), j.profile_name ? `${j.user_name} as ${j.profile_name}` : j.user_name, j.template_name, [j.job_type, j.budget].filter((x) => x && !/^not shown$/i.test(x)).join(' ')].filter(Boolean).join(' \u00b7 ')),
      j.manual ? h('div', { class: 'cjob-meta faint' }, 'Placed in this client by hand') : null),
    h('div', { class: 'cjob-side' }, h('div', { class: 'row', style: 'gap:6px;justify-content:flex-end;flex-wrap:wrap' }, j.invite ? h('span', { class: 'srcchip' }, 'Invite') : null, h('span', { class: 'pill ' + tone(howWent(j)) }, howWent(j) || 'Screened')), separate(j)));
  const card = (title, sub, body) => h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, title), sub ? h('span', { class: 'sub' }, sub) : null), body);
  const empty = (t) => h('p', { class: 'card-pad muted', style: 'margin:0' }, t);

  const history = c.history.length ? h('div', { class: 'clist' }, c.history.map((x) => h('div', { class: 'citem' },
    h('div', { class: 'row spread', style: 'gap:10px;align-items:baseline' }, h('strong', {}, x.title), x.rating ? h('span', { class: 'small nowrap', title: 'The client\u2019s rating of that job' }, '\u2605 ' + x.rating) : null),
    h('div', { class: 'small muted' }, [x.dates, x.amount].filter(Boolean).join(' \u00b7 ')),
    x.feedback ? h('blockquote', { class: 'cquote' }, x.feedback) : null))) : empty('No history on the posts we saw.');
  const open = c.open_jobs.length ? h('div', { class: 'clist' }, c.open_jobs.map((x) => h('div', { class: 'citem citem-row' }, h('span', {}, x.title), h('span', { class: 'small muted nowrap' }, 'seen ' + dayText(x.seen))))) : null;

  const main = h('div', { class: 'stack' }, why,
    card('Their jobs with us', h('a', { href: '#/history?client=' + c.id }, 'Open in the Jobs list'), n ? h('div', { class: 'clist' }, jobs.map(jobRow)) : empty('No jobs.')),
    card('Their history on Upwork', `${c.history.length} past job${c.history.length === 1 ? '' : 's'}, from every post of theirs we saw`, history),
    open ? card('Their other open jobs', 'As listed on their posts', open) : null);

  // the side: what you know about them, then what Upwork shows
  const input = (key, label, max, placeholder) => { const el = h('input', { type: 'text', id: 'c_' + key, maxlength: max, value: c[key] || '', placeholder }); return { key, el, box: h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'c_' + key }, label), el) }; };
  const fName = input('name', 'Name', 190, 'For example: the dental clinic in Austin'), fCo = input('company', 'Company', 190, 'If you know it'), fWho = input('contact_name', 'Person', 120, 'Who posts');
  const notes = h('textarea', { id: 'cnotes', maxlength: 4000, rows: 4, placeholder: 'How they talk, what they care about, what did not work last time' }); notes.value = c.notes || '';
  const save = h('button', { class: 'btn primary', type: 'button', onclick: async (e) => { btnBusy(e.currentTarget, 'Saving');
    try { await api('PATCH', '/clients/' + id, { ...Object.fromEntries([fName, fCo, fWho].map((f) => [f.key, f.el.value.trim() || null])), notes: notes.value.trim() || null }); toast('Saved'); route(); } catch (x) { toast(x.message, true); route(); } } }, 'Save');
  const side = h('div', { class: 'stack', style: 'gap:14px' },
    h('div', { class: 'card card-pad stack', style: 'gap:12px' }, h('h3', { class: 'section-title', style: 'margin:0' }, 'Your notes'), fName.box, h('div', { class: 'grid2', style: 'gap:10px' }, fCo.box, fWho.box),
      h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'cnotes' }, 'Notes'), notes), h('div', {}, save)),
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'What Upwork shows'), c.about_from ? h('div', { class: 'small muted', style: 'margin:-4px 0 10px' }, `From their newest post, job #${c.about_from}`) : null,
      c.about.length ? h('dl', { class: 'cfacts' }, c.about.map((x) => h('div', {}, h('dt', {}, x.label), h('dd', {}, x.value)))) : h('p', { class: 'muted small', style: 'margin:0' }, 'Not shown on the posts we saw.')));
  shell('clients', [head, h('div', { class: 'opgrid' }, main, side)], true);
}
async function mergeDialog(c) {
  const { clients } = await api('GET', '/clients');
  const others = clients.filter((x) => x.id !== c.id);
  const sel = h('select', { id: 'minto', style: 'width:100%' }, h('option', { value: '' }, 'Choose the client'), others.map((x) => h('option', { value: x.id }, `${clientName(x)} \u00b7 ${x.jobs} job${x.jobs === 1 ? '' : 's'}${x.country ? ' \u00b7 ' + x.country : ''}`)));
  modal({ title: 'Same client as another', confirm: 'Merge', body: h('div', { class: 'stack' }, h('p', { class: 'muted', style: 'margin:0' }, 'Every job of this client moves to the one you choose. Its name stays, and these notes are added to its notes.'),
    h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'minto' }, 'Merge into'), sel)),
    onConfirm: async () => { if (!sel.value) throw new Error('Choose the client'); const x = await api('POST', `/clients/${c.id}/merge`, { into: Number(sel.value) }); toast('Merged'); location.hash = '#/clients/' + x.id; } });
}

// ---------- Flag review (R63): per rule, what people did when it fired and how those jobs went; for relaxing rules with evidence ----------
const FR_HINT = { relax: ['Candidate to relax', 'PASS'], keep: ['Keep it', 'FAIL'], working: ['Doing its job', ''], mixed: ['Mixed', 'FLAG'], too_few: ['Too few jobs yet', 'wait'] };
/** R117: a number on the Flag review opens its jobs: the jobs the rule fired on that were continued, sent or hired (the Reports line for the rule). */
const frLink = (x, part, text, n) => (n ? h('a', { class: 'cellink', href: '#/history?' + new URLSearchParams(directFilters('rule', x.code, part)), title: 'Open these jobs' }, text) : text);
async function flagReviewView() {
  const r = await api('GET', '/reports/flag-review');
  const pct = (n, d) => (d ? Math.round((n / d) * 100) + '%' : '-');
  const b = r.baseline;
  const progress = Math.min(100, Math.round((r.screened / r.target) * 100));
  const summary = h('div', { class: 'card card-pad stack', style: 'gap:10px' },
    h('div', { class: 'row spread' }, h('div', { class: 'jp-sec' }, `${r.screened} of ${r.target} jobs screened`), h('span', { class: 'jp-label' }, r.screened >= r.target ? 'Enough to review' : 'Keep going: the hints get reliable with volume')),
    h('div', { class: 'bar', role: 'img', 'aria-label': `${progress}% of the way to ${r.target} jobs` }, h('i', { style: `width:${Math.max(2, progress)}%` })),
    h('div', { class: 'jp-label' }, `Quick reasons recorded on ${r.overrides_with_picks} of the ${r.overrides} jobs continued past a flag or fail. `,
      `The comparison is clean passes: ${b.sent} sent, ${pct(b.viewed, b.sent)} viewed, ${pct(b.chat, b.sent)} got a chat, ${pct(b.interview, b.sent)} an interview, ${pct(b.hired, b.sent)} hired.`),
    h('div', { class: 'jp-label' }, `A hint needs a rule to have fired on at least ${r.enough.fired} jobs, and for "relax" or "keep" at least ${r.enough.sent} of the continued proposals sent. The hint is a starting point: read the reasons and open the jobs before you change a rule.`));
  const reasons = (xs, none) => (xs.length ? h('ul', { class: 'jp-list', style: 'margin:4px 0 0' }, xs.map((x) => h('li', {}, `${x.reason} (${x.jobs})`))) : h('div', { class: 'faint small' }, none));
  const row = (x) => {
    const decided = x.continued + x.skipped, f = x.continued_funnel, [hl, ht] = FR_HINT[x.hint.key];
    return h('tr', { class: x.active ? '' : 'retired' },
      h('td', {}, h('span', { class: 'code ' + (x.type === 'fail' ? 'F' : 'G') }, x.code)),
      h('td', { style: 'white-space:normal;min-width:180px' }, x.rule, x.active ? null : h('span', { class: 'faint small' }, ' (retired)'),
        h('details', { class: 'reviewfold', style: 'margin-top:6px' }, h('summary', {}, 'Reasons and details'),
          h('div', { class: 'stack', style: 'gap:8px;margin-top:6px' },
            h('div', {}, h('div', { class: 'jp-label' }, 'Why people continued'), reasons(x.continue_reasons, 'No quick reason picked yet.'), x.own_words_only ? h('div', { class: 'small muted' }, `Own words only: ${x.own_words_only}`) : null),
            h('div', {}, h('div', { class: 'jp-label' }, 'Why people skipped'), reasons(x.skip_reasons, 'Not skipped yet.')),
            h('div', {}, h('div', { class: 'jp-label' }, 'When it was the only rule that fired'),
              h('div', { class: 'small' }, `${x.alone.fired} jobs: ${x.alone.continued} continued, ${x.alone.skipped} skipped; of the continued, ${x.alone.funnel.sent} sent, ${pct(x.alone.funnel.chat, x.alone.funnel.sent)} got a chat, ${x.alone.funnel.hired} hired.`))))),
      h('td', { class: 'nowrap' }, x.fired ? h('a', { href: `#/history?rule=${x.code}` }, `${x.fired} job${x.fired === 1 ? '' : 's'}`) : h('span', { class: 'faint' }, 'None')),
      h('td', { style: 'white-space:normal;min-width:140px;max-width:170px' }, decided ? `${pct(x.continued, decided)} continued` : '-', decided ? h('div', { class: 'small muted' }, frLink(x, 'continued', `${x.continued} on`, x.continued), ', ', x.skipped ? h('a', { class: 'cellink', href: `#/history?rule=${x.code}&stage=skipped` }, `${x.skipped} skipped`) : '0 skipped', x.undecided ? ', ' + x.undecided + ' open' : '') : null),
      h('td', { style: 'white-space:normal;min-width:160px;max-width:220px' }, x.continue_reasons.length ? x.continue_reasons.slice(0, 2).map((c) => h('div', { class: 'small' }, `${c.reason} (${c.jobs})`)) : h('span', { class: 'faint small' }, 'None yet')),
      h('td', { style: 'white-space:normal;min-width:150px;max-width:190px' }, f.sent ? `${pct(f.chat, f.sent)} chat` : '-', f.sent ? h('div', { class: 'small muted' }, frLink(x, 'sent', `${f.sent} sent`, f.sent), ', ', frLink(x, 'hired', `${f.hired} hired`, f.hired), ` · passes ${pct(b.chat, b.sent)}`) : null),
      h('td', { style: 'white-space:normal;min-width:200px;max-width:280px' }, h('span', { class: 'pill ' + ht }, hl), h('div', { class: 'small muted', style: 'margin-top:4px' }, x.hint.text)));
  };
  shell('flagreview', [pageHead('Flag review', 'For every gate rule: what people did when it fired and how those jobs went. Use it to relax a rule with evidence, without losing the ones that protect you.',
      me.role === 'admin' ? [h('a', { class: 'btn', href: '#/rules' }, icon('warn'), 'Rules')] : null),
    summary,
    listCard({ items: r.rules, paged: false, icon: 'warn', emptyTitle: 'No rules yet', emptyText: 'Rules appear here once they exist.',
      search: { placeholder: 'Search rules', text: (x) => x.code + ' ' + x.rule },
      filters: [{ key: 'hint', label: 'Any hint', options: Object.entries(FR_HINT).map(([k, [l]]) => [k, l]), test: (x, v) => x.hint.key === v },
        { key: 'type', label: 'Fail and flag', options: [['fail', 'Fail rules'], ['flag', 'Flag rules']], test: (x, v) => x.type === v },
        { key: 'status', label: 'Any status', options: [['1', 'Active'], ['0', 'Retired']], test: (x, v) => String(Number(!!x.active)) === v }],
      render: (slice) => dataTable(['Code', 'Rule', 'Fired on', 'Decided', 'Top reasons to continue', 'Continued and sent', 'Hint'], slice.map(row), 'rulestable') })], true);
}

// ---------- writing guide: what the Claude plugin writes by (proposal types, rules, banned phrases, modules, screening answers, checklist) ----------
const WG_KIND = { type: 'Proposal type', rules: 'Writing rules', banned: 'Banned phrases', modules: 'Modules', screening: 'Screening answers', checklist: 'Verification checklist', selection: 'Type selection', opening: 'Opening lines' };
/** One opening template, to add or change (R88): what it does, its first words, and its two possible exceptions. */
/**
 * R101 (Ahmad): an opening template on its own page, not a small window: what it does, the examples written for it, the openings
 * learned from edits on proposals (each can be removed, or kept as a written example), how it is used, and exactly what the AI reads.
 */
async function openingView(idStr) {
  const isNew = idStr === 'new';
  const d = isNew ? { item: null, block: '', max_examples: 5 } : await api('GET', '/opening-templates/' + idStr);
  const o = d.item, MAX = d.max_examples || 5, staff = me.role === 'admin' || me.role === 'manager';
  const f = { name: h('input', { type: 'text', id: 'oname', maxlength: 80, value: o ? o.name : '', placeholder: 'For example: Problem first opening' }),
    ins: h('textarea', { id: 'oins', maxlength: 3000, style: 'min-height:220px', placeholder: 'Line one ... Line two ... Tone ... Why the client reads on ...' }),
    starts: h('input', { type: 'text', id: 'ostarts', maxlength: 200, value: o && o.starts ? o.starts : '', placeholder: 'For example: Understood.' }),
    greet: h('input', { type: 'checkbox', id: 'ogreet', checked: !!(o && o.may_greet) }), us: h('input', { type: 'checkbox', id: 'ous', checked: !!(o && o.may_talk_about_us) }),
    match: h('input', { type: 'checkbox', id: 'omatch', checked: !!(o && o.match_examples) }) };
  f.ins.value = o ? o.instructions : '';
  // R101: every example kept, written or learned, each in use or not; at most MAX_ACTIVE in use across both
  const examples = ((o && o.all_examples) || []).map((x) => ({ ...x })), learned = ((o && o.all_learned) || []).map((x) => ({ ...x }));
  const MAXON = d.max_active || 10, onCount = () => examples.filter((x) => x.on && x.text.trim()).length + learned.filter((x) => x.on).length;
  const dirtyChip = h('span', { class: 'chip', hidden: true }, 'Unsaved changes');
  const dirty = () => { dirtyChip.hidden = false; drawCount(); };
  for (const el of [f.name, f.ins, f.starts]) el.addEventListener('input', dirty);
  for (const el of [f.greet, f.us, f.match]) el.addEventListener('change', dirty);
  const exList = h('div', { class: 'stack', style: 'gap:10px' }), learnList = h('div', { class: 'stack', style: 'gap:8px' });
  const exHead = h('span', {}), learnHead = h('span', {}), countEl = h('span', { class: 'chip' });
  const drawCount = () => { const n = onCount(); countEl.textContent = `${n} of ${MAXON} in use`; countEl.className = 'chip' + (n >= MAXON ? ' warnchip' : ' brand'); };
  const useBox = (x, redraw) => { const b = h('input', { type: 'checkbox', checked: !!x.on, 'aria-label': 'In use' });
    b.onchange = () => { if (b.checked && onCount() >= MAXON) { b.checked = false; return toast(`At most ${MAXON} examples can be in use. Switch one off first.`, true); } x.on = b.checked; dirty(); redraw(); };
    return h('label', { class: 'usebox' + (x.on ? ' on' : '') }, b, 'In use'); };
  const exAdd = h('button', { class: 'btn sm', type: 'button', onclick: () => { examples.push({ text: '', on: onCount() < MAXON }); dirty(); drawEx(); const tas = exList.querySelectorAll('textarea'); tas[tas.length - 1]?.focus(); } }, icon('screen'), 'Add example');
  function drawEx() {
    exHead.textContent = `Examples you wrote (${examples.length})`;
    f.match.disabled = !onCount();
    exList.replaceChildren(...(examples.length ? examples.map((x, i) => {
      const ta = h('textarea', { rows: 3, maxlength: 1500, placeholder: 'An opening that worked, as it was sent (no client names).' }); ta.value = x.text;
      ta.oninput = () => { x.text = ta.value; dirty(); };
      return h('div', { class: 'exrow' + (x.on ? '' : ' off') }, h('div', { class: 'row spread' }, h('span', { class: 'jp-label' }, 'Example ' + (i + 1)),
        h('span', { class: 'row', style: 'gap:12px' }, useBox(x, drawEx), h('button', { class: 'linkbtn small', type: 'button', onclick: () => { examples.splice(i, 1); dirty(); drawEx(); } }, 'Remove'))), ta);
    }) : [h('div', { class: 'faint small' }, 'None yet. Add openings that worked, to show the AI what this one sounds like.')]));
  }
  function drawLearned() {
    learnHead.textContent = `Learned from your edits (${learned.length})`;
    learnList.replaceChildren(...(learned.length ? learned.map((x, i) => h('div', { class: 'learnrow' + (x.on ? '' : ' off') }, h('div', { class: 'txt' }, x.text,
      x.at ? h('div', { class: 'faint small', style: 'margin-top:4px' }, 'Edited ' + ago(x.at)) : null),
      h('div', { class: 'row', style: 'gap:12px;flex:none' }, useBox(x, drawLearned),
        h('button', { class: 'linkbtn small', type: 'button', title: 'Move it to the examples you wrote', onclick: () => { examples.push({ text: x.text, on: x.on }); learned.splice(i, 1); dirty(); drawEx(); drawLearned(); } }, 'Keep as an example'),
        h('button', { class: 'linkbtn small', type: 'button', onclick: () => { learned.splice(i, 1); dirty(); drawLearned(); drawEx(); } }, 'Remove'))))
      : [h('div', { class: 'faint small' }, 'None yet. When someone edits this opening on a proposal and uses it, their version is kept here, newest first.')]));
  }
  drawEx(); drawLearned(); drawCount();
  const err = h('div', { class: 'err', hidden: true });
  const save = h('button', { class: 'btn primary', type: 'button' }, isNew ? 'Add opening' : 'Save');
  save.onclick = async () => {
    err.hidden = true; btnBusy(save, 'Saving');
    const ex = examples.map((x) => ({ text: x.text.trim(), on: !!x.on })).filter((x) => x.text);
    const body = { name: f.name.value.trim(), instructions: f.ins.value.trim(), starts: f.starts.value.trim() || null, may_greet: f.greet.checked, may_talk_about_us: f.us.checked,
      examples: ex, match_examples: onCount() > 0 && f.match.checked, ...(isNew ? {} : { learned }) };
    try { const r = await api(isNew ? 'POST' : 'PATCH', isNew ? '/opening-templates' : '/opening-templates/' + o.id, body); toast(isNew ? 'Opening added' : 'Opening saved');
      if (isNew) location.hash = '#/o/' + r.id; else route(); }
    catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; save.disabled = false; save.replaceChildren(isNew ? 'Add opening' : 'Save'); }
  };
  const used = o && o.used_by ? o.used_by.split(', ') : [];
  const side = isNew ? null : h('div', { class: 'stack', style: 'gap:14px' },
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'How it is used'),
      h('dl', { class: 'facts one' },
        h('div', {}, h('dt', {}, 'Rank'), h('dd', {}, `#${o.position} of ${o.of}`)),
        h('div', {}, h('dt', {}, 'Sent with it'), h('dd', {}, `${o.sent} proposal${o.sent === 1 ? '' : 's'}`)),
        h('div', {}, h('dt', {}, 'What happened'), h('dd', {}, h('span', { class: 'opres' }, ...[['Viewed', o.viewed], ['Chat', o.chat], ['Hired', o.hired]].map(([k, v]) =>
          h('span', {}, h('strong', {}, String(v || 0)), ' ' + k.toLowerCase() + (o.sent ? ` (${Math.round(100 * (v || 0) / o.sent)}%)` : '')))))),
        h('div', {}, h('dt', {}, 'Score'), h('dd', {}, `${o.rank} = ${o.earned ?? o.sent} earned${o.boost ? ` + ${o.boost} by hand` : ''}`, h('div', { class: 'faint small' }, '1 per proposal sent, +1 viewed, +2 chat, +5 hired'))),
        h('div', {}, h('dt', {}, 'Default of'), h('dd', {}, used.length ? used.join(', ') : 'No proposal type (it is written as an alternative)'))),
      h('p', { class: 'hint', style: 'margin:10px 0 0' }, 'The ranking is changed on the Writing guide, Openings, Change ranking.')),
    h('details', { class: 'card fold' }, h('summary', {}, 'What the AI reads for this opening'), h('div', { class: 'card-pad' }, h('pre', { class: 'aiblock' }, d.block || ''),
      h('p', { class: 'hint', style: 'margin:8px 0 0' }, 'Saved changes show here. The rules for every opening are given before it.'))));
  const main = h('div', { class: 'stack', style: 'gap:14px' },
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'What this opening does'),
      h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'oname' }, 'Name'), f.name),
      h('div', { class: 'field', style: 'margin-top:14px' }, h('label', { class: 'lbl', for: 'oins' }, 'Instructions'), f.ins, h('div', { class: 'hint' }, 'What line one and line two do, the tone, and why the client reads on. The rules for every opening apply on top, except where the options below say otherwise.')),
      h('div', { class: 'grid2', style: 'margin-top:14px' },
        h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'ostarts' }, 'First words (optional)'), f.starts, h('div', { class: 'hint' }, 'It must begin with this. For a choice, put | between them. A client’s own required words come first.')),
        h('div', { class: 'field', style: 'display:grid;gap:10px;align-content:start;padding-top:24px' },
          h('label', { class: 'row', for: 'ogreet', style: 'gap:8px;flex-wrap:nowrap' }, f.greet, 'May open with a greeting by the client’s name'),
          h('label', { class: 'row', for: 'ous', style: 'gap:8px;flex-wrap:nowrap' }, f.us, 'May say how we would start (talk about us)')))),
    h('div', { class: 'card card-pad' }, h('div', { class: 'row spread' }, h('h3', { class: 'section-title', style: 'margin:0' }, exHead), h('span', { class: 'row', style: 'gap:8px' }, countEl, exAdd)),
      h('p', { class: 'hint', style: 'margin:6px 0 12px' }, `Openings that worked, to show the AI what this one sounds like. Keep as many as you like; the ones in use (at most ${MAXON}, counting the learned ones below) are what the writer reads and what each new opening is scored against.`),
      exList,
      h('label', { class: 'row matchrow', for: 'omatch' }, f.match, h('span', {}, h('strong', {}, 'Match the examples'), h('span', { class: 'hint', style: 'display:block;margin:2px 0 0' }, 'Write it 80 to 90 percent like the closest example: its structure, sentence order, length and wording, with only this job’s facts changed.')))),
    isNew ? null : h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, learnHead),
      h('p', { class: 'hint', style: 'margin:0 0 12px' }, 'Openings someone edited on a proposal and used, newest first. Every one is kept. A new one comes in use; past the limit, the oldest learned one in use is switched off.'), learnList),
    err);
  shell('writing', [pageHead(isNew ? 'New opening' : o.name, isNew ? 'An opening template: what the first paragraph of a proposal does.' : 'An opening template: what the first paragraph of a proposal does, with its examples.',
    staff ? [dirtyChip, save] : null, { back: ['#/writing?tab=openings', 'Writing guide'], badges: isNew ? null : activeSwitch(o.active, { name: o.name, url: '/opening-templates/' + o.id, yes: 'On', no: 'Off', can: staff, offText: 'It is no longer written as an alternative. A proposal type that uses it as its default must get another default first.' }) }),
    h('div', { class: side ? 'opgrid' : '' }, main, side)], true);
}
/**
 * Change the ranking by hand (R92): drag or move the openings into the order wanted. Each one's score is the proposals sent with
 * it plus points added by hand; the points are worked out so the scores follow this order, from the bottom up, never below what
 * was sent. Real use still adds points, so a template that keeps being sent can overtake the order set here.
 */
function rankingEditor(items, after) {
  const order = items.slice().sort((a, b) => b.rank - a.rank || a.sort_order - b.sort_order || a.id - b.id);
  const list = h('ol', { class: 'ranklist' });
  let dragging = null;
  const points = () => { // the points each needs for the scores to follow the order: bottom up, one more than the one below
    const out = new Map(); let below = null;
    for (let i = order.length - 1; i >= 0; i--) { const o = order[i]; const base = o.earned ?? o.sent; const score = below == null ? base : Math.max(base, below + 1); out.set(o.id, score - base); below = score; } // R104: from what it earned
    return out;
  };
  const draw = () => {
    const pts = points();
    list.replaceChildren(...order.map((o, i) => {
      const move = (d) => { const j = i + d; if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; draw(); list.children[j]?.querySelector(d < 0 ? '.up' : '.down')?.focus(); };
      const li = h('li', { draggable: 'true', class: o.active ? '' : 'off' },
        h('span', { class: 'grip', 'aria-hidden': 'true' }, '⋮⋮'), h('span', { class: 'pos' }, String(i + 1)),
        h('span', { class: 'nm' }, h('strong', {}, o.name), h('span', { class: 'small muted' }, `${o.earned ?? o.sent} earned (${o.sent} sent, ${o.viewed || 0} viewed, ${o.chat || 0} chat, ${o.hired || 0} hired)${pts.get(o.id) ? ` + ${pts.get(o.id)} by hand` : ''} = ${(o.earned ?? o.sent) + pts.get(o.id)}${o.active ? '' : ' · off'}`)),
        h('span', { class: 'row', style: 'gap:4px;flex-wrap:nowrap' },
          h('button', { type: 'button', class: 'btn sm up', 'aria-label': `Move ${o.name} up`, disabled: i === 0 || null, onclick: () => move(-1) }, '↑'),
          h('button', { type: 'button', class: 'btn sm down', 'aria-label': `Move ${o.name} down`, disabled: i === order.length - 1 || null, onclick: () => move(1) }, '↓')));
      li.addEventListener('dragstart', (e) => { dragging = i; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
      li.addEventListener('dragend', () => { dragging = null; li.classList.remove('dragging'); });
      li.addEventListener('dragover', (e) => { e.preventDefault(); });
      li.addEventListener('drop', (e) => { e.preventDefault(); if (dragging == null || dragging === i) return; const [m] = order.splice(dragging, 1); order.splice(i, 0, m); dragging = null; draw(); });
      return li;
    }));
  };
  draw();
  const reset = () => h('button', { class: 'btn', type: 'button', onclick: () => { order.sort((a, b) => (b.earned ?? b.sent) - (a.earned ?? a.sent) || a.sort_order - b.sort_order || a.id - b.id); draw(); } }, 'Order by results only');
  modal({ title: 'Change the ranking', confirm: 'Save ranking', wide: true, extra: reset,
    body: h('div', { class: 'stack', style: 'gap:12px' },
      h('p', { class: 'hint', style: 'margin:0' }, 'Drag the openings, or use the arrows, into the order you want. The ones at the top are written first on every proposal. Each score is what it earned (1 per proposal sent with it, +1 viewed, +2 chat, +5 hired) plus points added here; results later keep adding points, so a template that keeps working can still move up.'),
      list),
    onConfirm: async () => {
      const pts = points(); const changed = order.filter((o) => pts.get(o.id) !== o.boost);
      for (const o of changed) await api('PATCH', '/opening-templates/' + o.id, { rank_boost: pts.get(o.id) });
      toast(changed.length ? 'Ranking saved' : 'The ranking was already in this order'); after();
    } });
}
/** Word shortcuts (R92): a main word and the short word every proposal uses instead. */
function shortcutEditor(x, after) {
  const f = { main: h('input', { type: 'text', id: 'scm', maxlength: 80, value: x ? x.main_word : '', placeholder: 'WhatsApp' }), short: h('input', { type: 'text', id: 'scs', maxlength: 40, value: x ? x.short_word : '', placeholder: 'WA' }),
    active: h('input', { type: 'checkbox', id: 'sca', checked: x ? !!Number(x.active) : true }) };
  modal({ title: x ? 'Change the shortcut for ' + x.main_word : 'Add a word shortcut', confirm: x ? 'Save' : 'Add shortcut',
    body: h('div', { class: 'stack', style: 'gap:14px' },
      h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'scm' }, 'Main word'), f.main), h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'scs' }, 'Short word'), f.short)),
      h('p', { class: 'hint', style: 'margin:0' }, 'Every proposal uses the short word instead: the writer is told to, and any main word the AI still writes is swapped. Any case matches; links and email addresses are never changed; your own edits stay as you type them.'),
      h('label', { class: 'row', for: 'sca', style: 'gap:8px' }, f.active, 'On: used in every proposal')),
    extra: x ? (dlg) => h('button', { class: 'btn danger', type: 'button', onclick: () => modal({ title: `Delete the shortcut for ${x.main_word}?`, confirm: 'Delete shortcut', danger: true,
      body: h('p', { class: 'muted' }, 'Proposals already written keep their words. To stop using it but keep it, switch it off instead.'),
      onConfirm: async () => { await api('DELETE', '/shortcuts/' + x.id); dlg.close(); toast('Shortcut deleted'); after(); } }) }, 'Delete') : null,
    onConfirm: async () => {
      const body = { main_word: f.main.value.trim(), short_word: f.short.value.trim(), active: f.active.checked };
      if (x) await api('PATCH', '/shortcuts/' + x.id, body); else await api('POST', '/shortcuts', body);
      toast(x ? 'Shortcut saved' : 'Shortcut added'); after();
    } });
}
function shortcutsSection(items, staff) {
  return listCard({ items, paged: false, icon: 'doc', emptyTitle: 'No word shortcuts yet', emptyText: staff ? 'Add the first one: a main word, like WhatsApp, and the short word every proposal uses instead, like WA.' : '',
    search: { placeholder: 'Search shortcuts', text: (x) => x.main_word + ' ' + x.short_word },
    filters: [statusFilter((x) => x.active, 'Off')],
    render: (slice) => dataTable(['Main word', '', 'Short word', 'Status', staff ? '' : null], slice.map((x) => h('tr', { class: staff ? 'click' : null, tabindex: staff ? 0 : null, onclick: staff ? () => shortcutEditor(x, route) : null, onkeydown: staff ? (e) => { if (e.key === 'Enter') shortcutEditor(x, route); } : null },
      h('td', {}, h('strong', {}, x.main_word)), h('td', { class: 'faint', 'aria-hidden': 'true' }, '→'), h('td', {}, h('span', { class: 'chip brand' }, x.short_word)),
      h('td', {}, activeSwitch(x.active, { name: x.main_word, url: '/shortcuts/' + x.id, no: 'Off', yes: 'On', can: staff, offText: 'Proposals stop using its short word.' })),
      staff ? acts(h('button', { class: 'btn sm', type: 'button', onclick: (e) => { e.stopPropagation(); shortcutEditor(x, route); } }, 'Edit')) : null))) });
}
/** The Openings section of the Writing guide (R88): the rules for every opening, and the templates, with which type uses each by default. */
function openingsSection(data, staff) {
  const card = (o, i) => h('button', { type: 'button', class: 'card card-pad cardlink openingcard', onclick: () => { location.hash = '#/o/' + o.id; } },
    h('div', { class: 'row spread', style: 'flex-wrap:nowrap;align-items:flex-start' }, h('strong', {}, o.name), o.active ? null : h('span', { class: 'pill wait' }, 'Off')),
    h('div', { class: 'small', title: 'Its score: 1 per proposal sent with it, +1 viewed, +2 chat, +5 hired, plus points added by hand. The alternatives on a proposal are written and shown in this order.' }, h('span', { class: 'rankn' }, '#' + (i + 1)),
      ` ${o.sent} sent · ${o.viewed || 0} viewed · ${o.chat || 0} chat · ${o.hired || 0} hired${o.boost ? ` · +${o.boost} by hand` : ''}`),
    h('div', { class: 'jp-label clamp2' }, o.instructions),
    h('div', { class: 'chips' }, ...[o.used_by ? h('span', { class: 'chip brand' }, 'Default of ' + o.used_by.replace(/Type (\d+)\. /g, 'Type $1 ')) : h('span', { class: 'chip' }, 'Alternative only'),
      o.starts ? h('span', { class: 'chip' }, 'Starts: ' + o.starts.split('|').join(' or ')) : null, o.may_greet ? h('span', { class: 'chip' }, 'May greet') : null, o.may_talk_about_us ? h('span', { class: 'chip' }, 'May say how we start') : null,
      o.examples && o.examples.length ? h('span', { class: 'chip' }, `${o.examples.length} example${o.examples.length === 1 ? '' : 's'}${o.match_examples ? ', matched' : ''}`) : null,
      o.learned && o.learned.length ? h('span', { class: 'chip brand' }, `${o.learned.length} learned from edits`) : null].filter(Boolean)));
  return h('div', { class: 'stack', style: 'gap:12px' },
    data.rules_doc_id ? h('a', { class: 'card card-pad cardlink rulesrow', href: '#/wg/' + data.rules_doc_id }, h('div', { class: 'row', style: 'gap:10px' }, icon('doc'), h('div', {}, h('strong', {}, 'Rules for every opening'), h('div', { class: 'jp-label' }, 'What every opening must and must not do. A template can make the exceptions its options allow.')))) : null,
    data.items.length ? h('div', { class: 'grid3' }, data.items.map(card)) : emptyState('doc', 'No opening templates yet', 'Add the first one: what the opening does, and its first words if it has any.'));
}
/**
 * The Writing guide (R89): four tabs, so each part has the page to itself. Openings (the templates and the rules for every opening),
 * Proposal types, Rules for every proposal, and Retired types. The tab is kept in the address, so Back returns to it.
 */
async function writingView() {
  const [{ types, docs: allDocs }, openingData, { items: shortcuts }] = await Promise.all([api('GET', '/writing-docs'), api('GET', '/opening-templates'), api('GET', '/shortcuts')]);
  const docs = allDocs.filter((d) => d.kind !== 'opening'); // the rules for every opening sit with the openings
  const staff = me.role === 'admin' || me.role === 'manager';
  const docCard = (d) => h('a', { class: 'card card-pad cardlink', href: '#/wg/' + d.id },
    h('div', { class: 'row spread' }, h('strong', {}, d.title), Number(d.active) ? null : h('span', { class: 'pill wait' }, 'Off')),
    h('div', { class: 'jp-label' }, `${WG_KIND[d.kind]} · ${d.versions} version${Number(d.versions) === 1 ? '' : 's'} · edited ${ago(d.updated_at)}${d.updated_by_name ? ' by ' + d.updated_by_name : ''}`));
  const openingName = new Map(openingData.items.map((o) => [o.id, o.name]));
  const typeCard = (t) => h(staff ? 'a' : 'div', { class: 'card card-pad cardlink', href: staff ? '#/t/' + t.id : null },
    h('div', { class: 'row spread' }, h('strong', {}, t.name), Number(t.active) ? null : h('span', { class: 'pill wait' }, 'Retired')),
    t.chosen_when ? h('div', { class: 'jp-label clamp2', title: t.chosen_when }, 'Chosen when ' + t.chosen_when) : t.description ? h('div', { class: 'jp-label clamp2' }, t.description.slice(0, 140)) : null,
    h('div', { class: 'small faint' }, [t.length, `${t.signal_count} signal${Number(t.signal_count) === 1 ? '' : 's'}`, `${t.sample_count} sample${Number(t.sample_count) === 1 ? '' : 's'}`].filter(Boolean).join(' · ')),
    t.default_opening_id && openingName.get(t.default_opening_id) ? h('div', { class: 'small' }, h('span', { class: 'faint' }, 'Opening: '), openingName.get(t.default_opening_id)) : null);
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });
  const active = types.filter((t) => Number(t.active)).sort(byName), retired = types.filter((t) => !Number(t.active)).sort(byName);
  const TABS = [
    { key: 'openings', label: 'Openings', n: openingData.items.length, sub: 'The first two lines Upwork shows in the preview. Each proposal type is written with its default opening; the other openings that are on are written beside it three at a time, the best ranked first. Ranked by results: 1 per proposal sent, +1 viewed, +2 chat, +5 hired, plus points added by hand.' },
    { key: 'types', label: 'Proposal types', n: active.length, sub: 'One is picked for each job from its signals. Each has its format, length, signals, samples and default opening.' },
    { key: 'shortcuts', label: 'Shortcuts', n: shortcuts.length, sub: 'A main word and the short word every proposal uses instead (WhatsApp becomes WA). The app\'s writer and the Claude plugin both use them; links are never changed.' },
    { key: 'rules', label: 'Rules for every proposal', n: docs.length, sub: 'Applied with every type: by the app\'s writer, its checks, the review and the plugin.' },
    { key: 'retired', label: 'Retired', n: retired.length, sub: 'No longer chosen. Kept for reference and for the proposals already written with them.' },
  ];
  let tab = TABS.some((t) => t.key === hashParams().tab) ? hashParams().tab : 'openings';
  const tabsEl = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Writing guide' });
  const head = h('div', {}), body = h('div', { class: 'stack', style: 'gap:14px' });
  const typeList = (list, empty) => listCard({ items: list, paged: false, icon: 'doc', emptyTitle: empty, emptyText: '',
    search: { placeholder: 'Search proposal types', text: (t) => [t.name, t.chosen_when, t.description, t.length].filter(Boolean).join(' ') },
    filters: [{ key: 'ready', label: 'Any setup', options: [['nosamples', 'Without samples'], ['nosignals', 'Without signals'], ['noopening', 'Without a default opening']],
      test: (t, v) => (v === 'nosamples' ? !Number(t.sample_count) : v === 'nosignals' ? !Number(t.signal_count) : !t.default_opening_id) }],
    render: (slice) => h('div', { class: 'grid3 card-pad' }, slice.map(typeCard)) });
  const draw = () => {
    const t = TABS.find((x) => x.key === tab);
    tabsEl.replaceChildren(...TABS.map((x) => h('button', { type: 'button', role: 'tab', class: 'tab' + (x.key === tab ? ' on' : ''), 'aria-selected': x.key === tab,
      onclick: () => { if (x.key === tab) return; tab = x.key; setHashParams({ tab, q: '', page: '', ready: '', status: '' }); draw(); } }, x.label, h('span', { class: 'n' }, String(x.n)))));
    const action = !staff ? null : tab === 'openings'
      ? [openingData.items.length > 1 ? h('button', { class: 'btn', type: 'button', onclick: () => rankingEditor(openingData.items, route) }, 'Change ranking') : null,
        h('button', { class: 'btn primary', type: 'button', disabled: openingData.items.length >= openingData.max || null, onclick: () => { location.hash = '#/o/new'; } }, icon('screen'), `Add opening (${openingData.items.length} of ${openingData.max})`)].filter(Boolean)
      : tab === 'types' ? h('a', { class: 'btn primary', href: '#/t/new' }, icon('screen'), 'Add proposal type')
        : tab === 'shortcuts' ? h('button', { class: 'btn primary', type: 'button', onclick: () => shortcutEditor(null, route) }, icon('screen'), 'Add shortcut') : null;
    head.replaceChildren(pageHead('Writing guide', 'How every proposal is written, by the app and by the Claude plugin alike. One copy, kept here: an edit applies to the next proposal everywhere.', action));
    body.replaceChildren(h('p', { class: 'jp-label', style: 'margin:0' }, t.sub),
      tab === 'openings' ? openingsSection(openingData, staff)
        : tab === 'shortcuts' ? shortcutsSection(shortcuts, staff)
        : tab === 'types' ? typeList(active, 'No proposal types yet')
          : tab === 'retired' ? (retired.length ? h('div', { class: 'grid3' }, retired.map(typeCard)) : emptyState('doc', 'Nothing retired', 'A proposal type switched off shows here.'))
            : h('div', { class: 'grid3' }, docs.map(docCard)));
  };
  shell('writing', [head, tabsEl, body], true);
  draw();
}
async function writingDocView(id) {
  const { doc, versions } = await api('GET', '/writing-docs/' + id);
  const canEdit = me.role === 'admin' || me.role === 'manager';
  const ta = h('textarea', { class: 'editor', style: 'min-height:420px', 'aria-label': doc.title, readonly: !canEdit || null }); ta.value = doc.content;
  const note = h('input', { type: 'text', placeholder: 'What did you change and why? (optional)', maxlength: 250 });
  const dirty = h('span', { class: 'chip', hidden: true }, 'Unsaved changes');
  ta.oninput = () => { dirty.hidden = ta.value === doc.content; };
  const save = h('button', { class: 'btn primary', type: 'button' }, 'Save');
  save.onclick = async () => { btnBusy(save, 'Saving'); try { await api('PUT', '/writing-docs/' + id, { content: ta.value, note: note.value }); toast('Saved. Every Claude uses it from its next proposal.'); route(); } catch (x) { toast(x.message, true); save.disabled = false; save.replaceChildren('Save'); } };
  const toggle = h('button', { class: 'btn', type: 'button' }, Number(doc.active) ? 'Turn off' : 'Turn on');
  toggle.onclick = async () => { try { await api('PUT', '/writing-docs/' + id, { content: doc.content, active: !Number(doc.active) }); toast(Number(doc.active) ? 'Turned off: the plugin no longer sees it' : 'Turned on'); route(); } catch (x) { toast(x.message, true); } };
  const vrow = (v) => h('div', { class: 'vitem' }, h('div', { class: 'top' }, h('strong', {}, full(v.created_at))), h('div', { class: 'small muted' }, (v.note || 'No note') + (v.created_by_name ? ' · ' + v.created_by_name : '')),
    canEdit ? h('div', {}, h('button', { class: 'btn sm', onclick: async () => { const r = await api('GET', `/writing-docs/${id}/versions/${v.id}`); ta.value = r.version.content; dirty.hidden = ta.value === doc.content; toast('Loaded into the editor. Save to restore it.'); window.scrollTo(0, 0); } }, 'Load')) : null);
  shell('writing', [
    pageHead(doc.title, `${WG_KIND[doc.kind]}. Written in Markdown.`, canEdit ? toggle : null, { back: [doc.kind === 'opening' ? '#/writing?tab=openings' : '#/writing?tab=rules', 'Writing guide'], badges: onOff(doc.active, 'On', 'Off') }),
    h('div', { class: 'two' }, h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Text'), h('span', { class: 'sub' }, dirty)), ta,
      canEdit ? h('div', { class: 'card-pad', style: 'border-top:1px solid var(--line);display:grid;gap:12px' }, note, h('div', {}, save)) : null),
      versionsCard(versions, vrow, (v) => `${full(v.created_at)} ${v.note || ''} ${v.created_by_name || ''}`))], true);
}

// ---------- settings (admin) ----------
/**
 * R122 (Hamza): Check file reading. Files attached on the server were not read while the same files worked locally: this tests each part
 * on the server, in plain words. The upload size is tested from this page, through the web server in front of the app, the way a real
 * upload goes: growing test uploads until one is refused.
 */
function fileCheckCard() {
  const out = h('div', { class: 'stack', style: 'gap:6px;margin-top:10px' });
  const line = (ok, label, detail) => h('div', { class: 'row', style: 'gap:8px;align-items:baseline' }, h('span', { class: 'pill ' + (ok === true ? 'PASS' : ok === false ? 'FAIL' : 'wait') }, ok === true ? 'OK' : ok === false ? 'Problem' : '\u2026'), h('strong', {}, label), detail ? h('span', { class: 'small muted' }, detail) : null);
  const go = async (e, ai) => {
    const b = e.currentTarget; btnBusy(b, 'Checking'); out.replaceChildren(line(null, 'Checking\u2026'));
    try {
      const r = await api('GET', '/admin/check-files' + (ai ? '?ai=1' : ''));
      const rows = [line(r.pdf_in_code.ok, 'PDF read in code', r.pdf_in_code.ok ? `${r.pdf_in_code.chars} characters in ${r.pdf_in_code.ms} ms` : r.pdf_in_code.error + ' (PDFs then go to the AI, slower)'),
        line(r.pdf_module.ok, 'PDF reader module', r.pdf_module.ok ? 'installed' : r.pdf_module.error + ' (run npm ci in backend on the server)'),
        line(r.word_in_code.ok, 'Word file read in code', r.word_in_code.ok ? `${r.word_in_code.chars} characters` : r.word_in_code.error),
        line(true, 'Server', `Node ${r.node}, ${r.platform}`)];
      if (r.picture_by_ai) rows.push(line(r.picture_by_ai.ok, 'Picture read by the AI', r.picture_by_ai.ok ? `read "${r.picture_by_ai.read}" in ${Math.round(r.picture_by_ai.ms / 1000)} s` : (r.picture_by_ai.error || `read "${r.picture_by_ai.read}"`) + ' (check the AI in Settings)'));
      out.replaceChildren(...rows, line(null, 'Largest upload the server accepts', 'testing\u2026'));
      // the upload size, through the web server: 1, 3, 6, 12, 25 MB until one is refused
      let okMb = 0, failMb = 0;
      for (const mb of [1, 3, 6, 12, 25]) {
        try { await api('POST', '/admin/check-upload', { data: 'a'.repeat(mb * 1024 * 1024) }); okMb = mb; } catch (x) { if (x.status === 413) { failMb = mb; break; } throw x; }
      }
      const files = (mb) => Math.floor((mb / 1.37) * 10) / 10; // files travel about 37% bigger than they are
      out.lastChild.replaceWith(failMb
        ? line(false, 'Largest upload the server accepts', `between ${okMb} and ${failMb} MB, so files of about ${files(okMb)} MB in all. The app allows 10 MB a file: raise client_max_body_size in the server's nginx to 50m (see Server setup).`)
        : line(true, 'Largest upload the server accepts', `${okMb} MB or more: files of ${files(okMb)} MB in all go through`));
    } catch (x) { out.replaceChildren(line(false, 'The check did not finish', x.message)); }
    finally { b.disabled = false; b.replaceChildren(ai ? 'Check, with the AI too' : 'Check file reading'); }
  };
  return h('div', { class: 'card card-pad' }, h('div', { class: 'row spread', style: 'gap:10px;flex-wrap:wrap' }, h('div', {}, h('h2', { class: 'section-title', style: 'margin:0' }, 'Check file reading'),
      h('div', { class: 'jp-label' }, 'When the client\u2019s attached files are not read, this shows which part fails on this server.')),
    h('div', { class: 'row', style: 'gap:8px' }, h('button', { class: 'btn', type: 'button', onclick: (e) => go(e, false) }, 'Check file reading'),
      h('button', { class: 'btn', type: 'button', title: 'Also reads a picture with the AI (one AI call)', onclick: (e) => go(e, true) }, 'Check, with the AI too'))), out);
}
async function settingsView() {
  const { settings, meta } = await api('GET', '/settings');
  const save = async (key, value, btn) => {
    btnBusy(btn, 'Saving');
    try { await api('PUT', '/admin/settings/' + key, { value }); CFG = null; toast('Saved'); route(); }
    catch (x) { toast(x.message, true); btn.disabled = false; btn.replaceChildren('Save'); }
  };
  const row = (key, input, read) => {
    const btn = h('button', { class: 'btn sm', type: 'button' }, 'Save');
    btn.onclick = () => { let v; try { v = read(); } catch (x) { return toast(x.message, true); } save(key, v, btn); };
    return h('div', { class: 'setrow' }, h('div', {}, h('strong', {}, meta[key].label), meta[key].help ? h('div', { class: 'jp-label' }, meta[key].help) : null), h('div', { class: 'setin' }, input, btn));
  };
  const num = (key) => { const el = h('input', { type: 'number', min: 0, step: 1, value: settings[key], style: 'width:110px' }); return row(key, el, () => Number(el.value)); };
  // an on / off setting: a switch that saves as soon as it is flipped (no Save button needed)
  const onoff = (key) => {
    const on = !!settings[key];
    const sw = h('button', { type: 'button', role: 'switch', class: 'switch' + (on ? ' on' : ''), 'aria-checked': on, 'aria-label': meta[key].label }, h('span', { class: 'knob' }));
    const state = h('span', { class: 'switchlbl' }, on ? 'On' : 'Off');
    sw.onclick = async () => {
      sw.disabled = true;
      try { await api('PUT', '/admin/settings/' + key, { value: !on }); CFG = null; toast(`${meta[key].label}: ${on ? 'off' : 'on'}`); route(); }
      catch (x) { toast(x.message, true); sw.disabled = false; }
    };
    return h('div', { class: 'setrow' }, h('div', {}, h('strong', {}, meta[key].label), meta[key].help ? h('div', { class: 'jp-label' }, meta[key].help) : null),
      h('div', { class: 'setin switchin' }, state, sw));
  };
  // R93: a list shows every item (a one-line box cut them off): a box that grows, one comma between items
  const list = (key, ph) => { const el = h('textarea', { rows: 2, class: 'listin', placeholder: ph, 'aria-label': key }); el.value = settings[key].join(', '); return row(key, el, () => el.value.split(/[,\n]/).map((x) => x.trim()).filter(Boolean)); };
  // which AI does the work: checked on the server (key present) before it is saved
  const ai = await api('GET', '/admin/ai');
  const aiCard = (() => {
    const provSel = h('select', { id: 'aiprov', 'aria-label': 'AI provider' }, ai.providers.map((p) => h('option', { value: p.id, selected: p.id === ai.current.provider }, p.label + (p.key_present ? '' : ' (key missing)'))));
    const modelIn = h('input', { type: 'text', id: 'aimodel', list: 'aimodels', autocomplete: 'off', style: 'width:100%' });
    const dl = h('datalist', { id: 'aimodels' });
    const info = h('div', { class: 'small muted' });
    const keyChip = h('span', { class: 'pill' });
    const result = h('div', { class: 'small', role: 'status', style: 'margin-top:8px;min-height:1.2em' });
    const cur = () => ai.providers.find((p) => p.id === provSel.value);
    const sync = (keepModel) => {
      const p = cur();
      if (!keepModel) modelIn.value = p.model;
      dl.replaceChildren(...p.models.map((m) => h('option', { value: m.id }, m.label)));
      info.textContent = p.note;
      keyChip.className = 'pill ' + (p.key_present ? 'PASS' : 'FAIL');
      keyChip.textContent = p.key_present ? 'Key found' : `Key missing: add ${p.key_env} to .env`;
      result.textContent = '';
    };
    provSel.onchange = () => sync(false); sync(false);
    const testBtn = h('button', { class: 'btn sm', type: 'button' }, 'Test connection');
    const saveBtn = h('button', { class: 'btn sm primary', type: 'button' }, 'Use this AI');
    testBtn.onclick = async () => {
      btnBusy(testBtn, 'Testing'); result.className = 'small muted'; result.textContent = 'Calling ' + cur().label + '. This can take a few seconds.';
      try { const r = await api('POST', '/admin/ai/test', { provider: provSel.value, model: modelIn.value.trim() }); result.className = 'small ' + (r.ok ? 'ok' : 'bad'); result.textContent = r.message; }
      catch (x) { result.className = 'small bad'; result.textContent = x.message; }
      testBtn.disabled = false; testBtn.replaceChildren('Test connection');
    };
    saveBtn.onclick = async () => {
      btnBusy(saveBtn, 'Saving');
      try { await api('PUT', '/admin/ai', { provider: provSel.value, model: modelIn.value.trim() }); toast('Now using ' + cur().label); route(); }
      catch (x) { toast(x.message, true); saveBtn.disabled = false; saveBtn.replaceChildren('Use this AI'); }
    };
    const now = ai.providers.find((p) => p.id === ai.current.provider);
    return h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'AI'), h('span', { class: 'sub' }, ai.mock ? 'Mock mode: no real AI is called' : `Now using ${now.label}, ${ai.current.model}`)),
      h('div', { class: 'card-pad' },
        ai.mock ? h('div', { class: 'notice', style: 'margin-bottom:12px' }, icon('info'),  'The server is in mock mode (LLM_PROVIDER=mock in .env). Switch it to claude-cli to use a real AI. The choice below is kept but is not used until then.') : null,
        h('p', { class: 'muted', style: 'margin:0 0 12px' }, 'Which AI does the screening, tagging, signals, proposals and chat. A change applies to the next job, with no restart. Keys stay in the .env file and are never shown here.'),
        h('div', { class: 'grid2' },
          h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'aiprov' }, 'Provider'), provSel, h('div', { style: 'margin-top:6px' }, keyChip)),
          h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'aimodel' }, 'Model'), modelIn, dl, h('div', { class: 'hint' }, 'Pick one or type another model name.'))),
        info, result,
        h('div', { class: 'row', style: 'gap:8px;margin-top:12px;justify-content:flex-end' }, testBtn, saveBtn)));
  })();
  const sig = settings['writer.structured_signal'];
  const sigNum = h('input', { type: 'number', min: 1, value: sig.signal, style: 'width:90px', 'aria-label': 'Signal number' });
  const sigVal = h('input', { type: 'text', value: sig.value, style: 'width:140px', 'aria-label': 'Value' });
  const group = (title, rows) => h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, title)), h('div', { class: 'setlist', style: 'padding-left:20px;padding-right:20px' }, rows));
  shell('settings', [pageHead('Settings', 'The AI that does the work, and the numbers and lists the app runs on. A change applies to the next job, with no restart.'), aiCard, fileCheckCard(),
    (() => {
      const el = h('input', { type: 'text', value: settings['company.name'], style: 'min-width:280px', 'aria-label': 'Company name' });
      // the team's working day: the zone Claude's updates count days in (the app shows each person their own zone)
      const tz = h('select', { 'aria-label': 'The team\'s working day' }, Object.entries(ZONE_NAMES).map(([id, label]) => h('option', { value: id, selected: id === settings['time.team_zone'] }, label)));
      return group('Company', [row('company.name', el, () => el.value.trim()), row('time.team_zone', tz, () => tz.value)]);
    })(),
    group('Independent reviewer', [onoff('review.auto')]),
    group('Project matching and auto mode', [num('matching.auto_max_flags'), list('auto.stop_rules', 'G15, G18'), onoff('matching.ai_order'), num('matching.shown'), num('matching.recommended'), num('matching.min_score'), num('selection.min'), num('selection.max')]),
    group('Screening and tracking', [num('override.min_reason'), list('tracking.outcomes', 'Pending, Hired, ...'), list('tracking.loss_outcomes', 'Not hired, No response, ...'), list('tracking.loss_reasons', 'Budget too low, ...'), list('override.reasons', 'Invited by the client, ...'), list('skip.reasons', 'Budget or rate too low, ...'), num('tracking.quiet_days')]),
    group('Proposal writer', [list('writer.requirement_rules', 'G11, G12, G13'),
      (() => { const el = h('textarea', { rows: 2, style: 'min-width:380px;min-height:56px', 'aria-label': 'The Loom video line' }); el.value = settings['writer.loom_line']; return row('writer.loom_line', el, () => el.value.trim()); })(),
      row('writer.structured_signal', h('span', { class: 'row', style: 'gap:6px' }, 'Signal', sigNum, 'is', sigVal), () => ({ signal: Number(sigNum.value), value: sigVal.value.trim() }))])], true);
}

// ---------- connect Claude: personal tokens for the import MCP ----------
async function connectView() {
  const [{ tokens }, { types }, conn, plug] = await Promise.all([api('GET', '/tokens'), api('GET', '/import/types'), api('GET', '/oauth/connections'), api('GET', '/plugin/info').catch(() => ({ available: false }))]);
  const name = h('input', { type: 'text', id: 'tkname', maxlength: 80, placeholder: 'e.g. My laptop, Claude Desktop' });
  const days = h('select', { id: 'tkdays', 'aria-label': 'Expires after' }, [[30, '30 days'], [90, '90 days'], [365, '1 year']].map(([v, l]) => h('option', { value: v, selected: v === 90 }, l)));
  const out = h('div', { 'aria-live': 'polite' });
  const make = h('button', { class: 'btn primary', type: 'button' }, 'Make a token');
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); toast(what + ' copied'); } catch { toast('Could not copy: select the text and copy it', true); } };
  make.onclick = async () => {
    btnBusy(make, 'Making');
    try {
      const r = await api('POST', '/tokens', { name: name.value, days: Number(days.value) });
      const snippet = JSON.stringify({ mcpServers: { 'upwork-pro': { command: 'node', args: ['/path/to/Upwork-Pro/mcp/dist/src/index.js'], env: { UPWORK_PRO_URL: location.origin, UPWORK_PRO_TOKEN: r.token, IMPORT_DIR: '/path/to/your/workbooks' } } } }, null, 2);
      out.replaceChildren(h('div', { class: 'warnbox', style: 'margin-top:16px' }, h('strong', {}, icon('warn'), 'Copy this token now. It is shown once and cannot be recovered.'),
        h('code', { class: 'mono', style: 'display:block;word-break:break-all;margin:8px 0;user-select:all' }, r.token),
        h('div', { class: 'row', style: 'gap:8px' }, h('button', { class: 'btn sm', type: 'button', onclick: () => copy(r.token, 'Token') }, 'Copy token'), h('button', { class: 'btn sm', type: 'button', onclick: () => copy(snippet, 'Settings') }, 'Copy Claude Desktop settings')),
        h('pre', { class: 'mono small', style: 'white-space:pre-wrap;margin-top:12px;overflow:auto' }, snippet)));
      name.value = '';
    } catch (x) { toast(x.message, true); }
    make.disabled = false; make.replaceChildren('Make a token');
  };
  const revoke = (t) => modal({ title: 'Revoke "' + t.name + '"?', confirm: 'Revoke', danger: true, body: h('p', {}, 'Anything using this token stops working at once. This cannot be undone.'),
    onConfirm: async () => { await api('DELETE', '/tokens/' + t.id); toast('Token revoked'); route(); } });
  const status = (t) => (t.revoked_at ? h('span', { class: 'pill wait' }, 'Revoked') : toDate(t.expires_at) < new Date() ? h('span', { class: 'pill wait' }, 'Expired') : h('span', { class: 'pill PASS' }, 'Active'));
  const rows = tokens.map((t) => h('tr', {}, h('td', {}, t.name), h('td', {}, status(t)), h('td', {}, ago(t.created_at)), h('td', {}, t.last_used_at ? ago(t.last_used_at) : h('span', { class: 'faint' }, 'Never')), h('td', {}, dayText(t.expires_at)),
    acts(!t.revoked_at && toDate(t.expires_at) > new Date() ? h('button', { class: 'btn sm', type: 'button', onclick: () => revoke(t) }, 'Revoke') : null)));
  // sign-in (OAuth): the way for everyone; tokens stay for a local setup
  const disconnect = (c) => modal({ title: 'Disconnect ' + c.client_name + '?', confirm: 'Disconnect', danger: true, body: h('p', {}, 'That Claude stops reaching Upwork Pro at once. To use it again, sign in from Claude again.'),
    onConfirm: async () => { await api('DELETE', '/oauth/connections/' + c.grant_id); toast('Disconnected'); route(); } });
  const signInCard = h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Connect with sign-in'), h('span', { class: 'sub' }, 'Recommended: no token to copy')),
    h('div', { class: 'card-pad' },
      h('p', { class: 'muted', style: 'margin:0 0 12px' }, 'Each person connects their own Claude and signs in with their own Upwork Pro account. Everything that Claude saves is recorded as them.'),
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Connector link'), h('div', { class: 'row', style: 'gap:8px;flex-wrap:nowrap' },
        h('code', { class: 'mono', style: 'flex:1;min-width:0;overflow-wrap:anywhere;padding:9px 12px;border:1px solid var(--line-strong);border-radius:var(--radius-sm);background:var(--surface-2)' }, conn.mcp_url),
        h('button', { class: 'btn', type: 'button', onclick: () => copy(conn.mcp_url, 'Link') }, 'Copy'))),
      h('ol', { class: 'small', style: 'margin:12px 0 0;padding-left:20px;display:grid;gap:4px' },
        h('li', {}, 'In Claude: Settings, Connectors, Add custom connector. Name it Upwork Pro and paste the link.'),
        h('li', {}, 'Press Connect. A Upwork Pro page opens: sign in with your own email and password, then Allow.'),
        h('li', {}, 'In Claude Code instead: claude mcp add --transport http upwork-pro ' + conn.mcp_url)),
      h('p', { class: 'hint' }, 'Claude reaches the link from the internet, so this works once Upwork Pro is online with https. Until then, use a token below.')),
    conn.connections.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Connected app', 'Since', 'Last used', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, conn.connections.map((c) => h('tr', {}, h('td', {}, h('strong', {}, c.client_name)), h('td', { title: full(c.connected_at) }, ago(c.connected_at)),
        h('td', {}, c.last_used_at ? ago(c.last_used_at) : h('span', { class: 'faint' }, 'Not yet')), acts(h('button', { class: 'btn sm', type: 'button', onclick: () => disconnect(c) }, 'Disconnect')))))))
      : h('div', { class: 'card-pad', style: 'border-top:1px solid var(--line)' }, h('p', { class: 'muted', style: 'margin:0' }, 'No Claude connected with sign-in yet.')));
  shell('connect', [pageHead('Connect Claude', 'Connect your own Claude to Upwork Pro and get the plugin: Claude then screens jobs and writes proposals our way, saves them here under your name, and can read the numbers back.'),
    signInCard,
    plug.available ? h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Get the Claude plugin'), h('span', { class: 'sub' }, `Stackup proposals, version ${plug.version}`),
        h('a', { class: 'btn primary', href: '/api/plugin/download', download: plug.file }, icon('doc'), 'Download the plugin')),
      h('div', { class: 'card-pad' },
        h('p', { class: 'muted', style: 'margin:0 0 12px' }, 'The plugin is what makes Claude work our way: it screens a job, matches projects, asks for the profile, the proposal type and the Loom video, writes the proposal, and saves everything here. It reads the library, rules and writing guide from Upwork Pro, so it always uses the current ones.'),
        h('ol', { class: 'small', style: 'margin:0;padding-left:20px;display:grid;gap:4px' },
          h('li', {}, 'Connect your Claude first (the card above).'),
          h('li', {}, `Press Download the plugin. You get the file ${plug.file}.`),
          h('li', {}, 'In Claude: open Plugins, add a plugin from a file, and choose that file. Then restart Claude.'),
          h('li', {}, 'In Claude, type /proposal and paste a job. To see what is working, ask "which profile had the best view rate last month?".')),
        h('p', { class: 'hint' }, `When this page shows a newer version than the one you installed, download it again and add it the same way. It has ${plug.skills.length} skills: ${plug.skills.join(', ')}.`))) : null,
    h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'What you can import')),
      h('div', { class: 'card-pad' }, h('div', { class: 'stack', style: 'gap:12px' }, types.map((k) => h('div', {}, h('div', { class: 'row', style: 'gap:8px' }, h('strong', {}, k.label), k.allowed ? h('span', { class: 'pill PASS' }, 'You can') : h('span', { class: 'pill wait' }, cap(k.roles.join(' or ')) + ' only')),
        h('div', { class: 'jp-label' }, k.description)))),
        h('p', { class: 'hint' }, 'You can only import what your role lets you edit on the website. Every import is previewed first, is written to the Logs, and can be undone as a whole.'))),
    h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Or make a token'), h('span', { class: 'sub' }, 'For a local setup (Upwork Pro on this computer)')),
      h('div', { class: 'card-pad' },
        h('p', { class: 'muted', style: 'margin:0 0 12px' }, 'A token is like a password for Claude: as you, it can import sheets, look things up, and save the jobs, proposals and statuses from your Claude plugin. Nothing else (no users, no settings). Keep it private. Revoke it if it leaks.'),
        h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tkname' }, 'Name'), name), h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tkdays' }, 'Expires after'), days)),
        h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:12px' }, make), out)),
    h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Your tokens')),
      tokens.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Name', 'Status', 'Made', 'Last used', 'Expires', ''].map((x) => h('th', {}, x)))), h('tbody', {}, rows)))
        : h('div', { class: 'card-pad' }, h('p', { class: 'muted' }, 'No tokens yet.')))], true);
}

// ---------- router ----------
async function route() {
  try {
    if (!me) { me = (await api('GET', '/me')).user; if (me) TZ = (me.prefs && me.prefs.time_zone) || 'Asia/Karachi'; }
    if (!me) return loginView();
    if (!CFG) CFG = (await api('GET', '/settings')).settings;
    loaderFacts(); // R99: what the loading screens name, fetched once in the background
    const [, a, b, c] = location.hash.split('?')[0].split('/');
    if (a === 's' && b) { // #/s/12, #/s/12/proposal, and the older #/s/12/work?step=4
      const step = Number(hashParams().step);
      return await jobPage(Number(b), c === 'work' ? (step >= 1 && step <= 5 ? STEP_TAB[step - 1] : undefined) : c === 'tracking' ? 'overview' : c);
    }
    if (a === 'history') return await historyView();
    if (a === 'dashboard' || !a) return await dashboardView();
    if (a === 'reports') return await reportsView();
    if (a === 'clients') return b ? await clientView(Number(b)) : await clientsView();
    if (a === 'templates') { location.hash = '#/writing?tab=types'; return; } // the proposal types live on the Writing guide now
    if (a === 't' && b && me.role !== 'employee') return await templateView(b);
    if (a === 'o' && b) return await openingView(b); // R101: an opening template's own page
    if (a === 'signals' && me.role !== 'employee') return await signalsView();
    if (a === 'writing') return await writingView();
    if (a === 'wg' && b) return await writingDocView(Number(b));
    if (a === 'sig' && b && me.role !== 'employee') return await signalView(Number(b));
    if (a === 'i' && b) return await industryDetailView(Number(b));
    if (a === 'industries') return await industriesView();
    if (a === 'dictionary' && me.role === 'admin') return await dictionaryView();
    if (a === 'p' && b) return await projectDetailView(Number(b));
    if (a === 'projects') return await projectsView();
    if (a === 'profiles' && me.role === 'admin') return await profilesView();
    if (a === 'looms' && me.role === 'admin') return await loomsView();
    if (a === 'users' && me.role === 'admin') return await usersView();
    if (a === 'skill' && me.role === 'admin') return await skillView();
    if (a === 'reviewer') return await reviewerView();
    if (a === 'feedback') return await feedbackView();
    if (a === 'rules' && me.role === 'admin') return await rulesView();
    if (a === 'flagreview' && (me.role === 'admin' || me.role === 'manager')) return await flagReviewView();
    if (a === 'settings' && me.role === 'admin') return await settingsView();
    if (a === 'setup') { location.hash = '#/dashboard'; return; } // the Setup page of R79 became the sidebar's sections
    if (a === 'connect') return await connectView();
    if (a === 'changes' && me.role === 'admin') return await changesView();
    if (a === 'audit' && me.role === 'admin') return await auditView();
    return newView();
  } catch (e) {
    if (e.status === 401) { me = null; return loginView(); }
    if (me) shell('', emptyState('x', 'Could not load this page', e.message, h('a', { class: 'btn', href: '#/new' }, 'Go to Screen a job')));
    else loginView();
  }
}
addEventListener('hashchange', route);
route();
