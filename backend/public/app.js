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
  doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
  badge: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="11" r="2.5"/><path d="M5.5 17c.8-2 2.2-3 3.5-3s2.7 1 3.5 3M15 9h3M15 13h3"/>',
  building: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01"/>',
  tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><path d="M7.5 7.5h.01"/>',
};
function icon(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'i'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] || '';
  return s;
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
  const r = await fetch('/api' + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || 'Something went wrong. Try again.'); e.status = r.status; throw e; }
  return data;
}
const toDate = (s) => (s ? new Date(String(s).replace(' ', 'T')) : null);
function ago(s) {
  const d = toDate(s); if (!d) return '';
  const sec = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return Math.floor(sec / 60) + ' min ago';
  if (sec < 86400) return Math.floor(sec / 3600) + ' h ago';
  if (sec < 604800) return Math.floor(sec / 86400) + ' d ago';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
const full = (s) => { const d = toDate(s); return d ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''; };
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
function btnBusy(btn, label) { btn.disabled = true; btn.replaceChildren(h('span', { class: 'spin' }), label); }
const emptyState = (iconName, title, text, action) =>
  h('div', { class: 'empty' }, h('div', { class: 'ico' }, icon(iconName)), h('strong', {}, title), h('div', {}, text), action ? h('div', { style: 'margin-top:16px' }, action) : null);
const verdictPill = (v, status) =>
  v ? h('span', { class: 'pill ' + v }, v)
    : status === 'error' ? h('span', { class: 'pill bad' }, 'Failed')
    : h('span', { class: 'pill wait' }, status === 'running' ? 'Screening' : 'Queued');

// ---------- searchable dropdowns ----------
/**
 * Every <select> in the app becomes searchable: a button that opens a list with a search box (type to filter,
 * arrow keys, Enter, Escape). The real <select> stays in the page, hidden, and keeps the value, so every existing
 * `el.value` read and `change` listener works unchanged. Applied automatically to any select added to the page.
 */
function searchableSelect(sel) {
  if (sel.__ss || sel.multiple || sel.dataset.plain !== undefined) return;
  sel.__ss = true;
  const wrap = h('div', { class: 'ss ' + (sel.className || '') });
  if (sel.getAttribute('style')) wrap.setAttribute('style', sel.getAttribute('style'));
  const btn = h('button', { type: 'button', class: 'ss-btn', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': sel.getAttribute('aria-label') || null });
  const search = h('input', { type: 'search', class: 'ss-search', placeholder: 'Search...', 'aria-label': 'Search options', autocomplete: 'off' });
  const list = h('ul', { class: 'ss-list', role: 'listbox' });
  const pop = h('div', { class: 'ss-pop', hidden: true }, search, list);
  // a chosen value can be cleared in one click when "nothing chosen" is allowed (an option with value "")
  const clearBtn = h('button', { type: 'button', class: 'ss-clear', title: 'Clear', 'aria-label': 'Clear ' + (sel.getAttribute('aria-label') || 'selection') }, '×');
  clearBtn.onclick = (e) => { e.stopPropagation(); close(); sel.value = ''; label(); sel.dispatchEvent(new Event('change', { bubbles: true })); btn.focus(); };
  sel.parentNode.insertBefore(wrap, sel);
  wrap.append(btn, clearBtn, pop, sel);
  sel.classList.add('ss-native'); sel.tabIndex = -1;
  let active = -1, shown = [];
  const label = () => {
    const o = sel.options[sel.selectedIndex]; btn.textContent = o ? o.textContent : ''; btn.classList.toggle('ph', !sel.value); btn.disabled = sel.disabled;
    const clearable = !!sel.value && !sel.disabled && [...sel.options].some((x) => x.value === '');
    wrap.classList.toggle('has-value', clearable); clearBtn.hidden = !clearable;
  };
  const choose = (o) => { if (o.disabled) return; sel.value = o.value; label(); close(); sel.dispatchEvent(new Event('change', { bubbles: true })); btn.focus(); };
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    shown = [...sel.options].filter((o) => !q || o.textContent.toLowerCase().includes(q));
    if (active >= shown.length) active = shown.length - 1;
    list.replaceChildren(...(shown.length ? shown.map((o, i) => h('li', { role: 'option', 'aria-selected': o.selected, class: (o.selected ? 'sel ' : '') + (i === active ? 'act' : '') + (o.disabled ? ' dis' : ''),
      onmousedown: (e) => { e.preventDefault(); choose(o); }, onmousemove: () => { if (active !== i) { active = i; draw(); } } }, o.textContent)) : [h('li', { class: 'none' }, 'No matches')]));
    list.querySelector('.act')?.scrollIntoView({ block: 'nearest' });
  };
  const open = () => {
    if (sel.disabled) return;
    document.querySelectorAll('.ss.open').forEach((x) => x !== wrap && x.__close && x.__close());
    pop.hidden = false; wrap.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
    search.value = ''; active = Math.max(0, sel.selectedIndex); draw(); search.focus();
  };
  const close = () => { pop.hidden = true; wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };
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
  Object.defineProperty(sel, 'value', { get() { return v.get.call(this); }, set(x) { v.set.call(this, x); label(); }, configurable: true });
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

// ---------- pagination ----------
const PAGE_SIZE = 20;
function hashParams() { return Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || '')); }
function setHashParams(patch) { // keeps page and filters in the URL so Back from a record returns to the same list, without re-running the route
  const next = { ...hashParams(), ...patch }; const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v !== '' && v != null && v !== false && !(k === 'page' && Number(v) === 1)) sp.set(k, v);
  history.replaceState(null, '', location.hash.split('?')[0] + (sp.toString() ? '?' + sp : ''));
}
const lastList = { history: '#/history', projects: '#/projects', industries: '#/industries' };
function pager(total, page, onPage) {
  if (!total) return null;
  const pages = Math.ceil(total / PAGE_SIZE), from = (page - 1) * PAGE_SIZE + 1, to = Math.min(total, page * PAGE_SIZE);
  const want = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const nums = []; let prev = 0;
  for (const n of [...want].sort((a, b) => a - b)) { if (n - prev > 1) nums.push('…'); nums.push(n); prev = n; }
  const go = (n) => () => { onPage(n); window.scrollTo({ top: 0 }); };
  const btn = (label, n, disabled, cur) => h('button', { type: 'button', class: 'pg' + (cur ? ' on' : ''), disabled, 'aria-label': cur ? `Page ${n}, current page` : /^\d+$/.test(label) ? `Page ${n}` : label, 'aria-current': cur ? 'page' : null, onclick: go(n) }, label);
  return h('div', { class: 'pager' }, h('span', { class: 'muted small' }, `Showing ${from.toLocaleString()} to ${to.toLocaleString()} of ${total.toLocaleString()}`),
    pages > 1 ? h('nav', { class: 'pgs', 'aria-label': 'Pagination' }, btn('Previous', page - 1, page <= 1),
      nums.map((n) => (n === '…' ? h('span', { class: 'gap' }, '…') : btn(String(n), n, false, n === page))), btn('Next', page + 1, page >= pages)) : null);
}
/** Paginates a list that is already in memory. `render(slice)` returns the table. */
function clientPaged(items, render) {
  const box = h('div', {}); let page = Math.max(1, Number(hashParams().page) || 1);
  const draw = () => {
    page = Math.min(page, Math.max(1, Math.ceil(items.length / PAGE_SIZE)));
    box.replaceChildren(render(items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)), pager(items.length, page, (n) => { page = n; setHashParams({ page: n }); draw(); }));
  };
  draw(); return box;
}
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ---------- layout ----------
const APP_NAME = 'Upwork Pro';
const STAFF = ['manager', 'admin'], ADMIN = ['admin'];
/** The sidebar, in order. A link without roles is for everyone. */
const NAV = [
  { label: 'Work', links: [
    { key: 'dashboard', icon: 'home', label: 'Dashboard' },
    { key: 'new', icon: 'screen', label: 'Screen a job' },
    { key: 'history', icon: 'list', label: () => (me.role === 'employee' ? 'My jobs' : 'Jobs') }] },
  { label: 'Library', links: [
    { key: 'projects', icon: 'folder', label: 'Projects' },
    { key: 'industries', icon: 'building', label: 'Industries' },
    { key: 'dictionary', icon: 'tag', label: 'Tag dictionary', roles: ADMIN },
    { key: 'profiles', icon: 'badge', label: 'Upwork profiles', roles: ADMIN }] },
  { label: 'Proposal setup', links: [
    { key: 'templates', icon: 'doc', label: 'Templates', roles: STAFF },
    { key: 'signals', icon: 'audit', label: 'Signals', roles: STAFF }] },
  { label: 'Admin', links: [
    { key: 'skill', icon: 'skill', label: 'Upwork JobGate', roles: ADMIN },
    { key: 'rules', icon: 'warn', label: 'Rules', roles: ADMIN },
    { key: 'settings', icon: 'gear', label: 'Settings', roles: ADMIN },
    { key: 'users', icon: 'users', label: 'Users', roles: ADMIN },
    { key: 'audit', icon: 'audit', label: 'Logs', roles: ADMIN }] },
];
function shell(active, content, wide) {
  const a = ([key, ic, label]) => h('a', { href: '#/' + key, class: active === key ? 'active' : '', 'aria-current': active === key ? 'page' : null }, icon(ic), h('span', {}, label));
  const groups = NAV.map((g) => [g.label, g.links.filter((l) => !l.roles || l.roles.includes(me.role)).map((l) => [l.key, l.icon, typeof l.label === 'function' ? l.label() : l.label])])
    .filter(([, links]) => links.length);
  $app.replaceChildren(h('div', { class: 'shell' },
    h('aside', { class: 'side' },
      h('div', { class: 'brand' }, h('div', { class: 'logo' }, icon('logo')), APP_NAME),
      h('nav', { class: 'nav', 'aria-label': 'Main' }, groups.map(([label, links]) => [h('div', { class: 'nav-label' }, label), links.map(a)])),
      h('div', { class: 'me' }, h('div', { class: 'avatar' }, initials(me.name)),
        h('div', { class: 'who' }, h('strong', {}, me.name), h('span', {}, me.role)),
        h('button', { class: 'iconbtn', title: 'Sign out', 'aria-label': 'Sign out', onclick: async () => { await api('POST', '/logout', {}); me = null; CFG = null; route(); } }, icon('out')))),
    h('main', { class: 'content' }, h('div', { class: 'page' }, content))));
  window.scrollTo(0, 0);
}
const pageHead = (title, sub, actions) =>
  h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, title), sub ? h('p', { class: 'sub' }, sub) : null), actions ? h('div', { class: 'actions' }, actions) : null);

// ---------- login ----------
function loginView() {
  const err = h('div', { class: 'err', hidden: true });
  const email = h('input', { type: 'email', id: 'em', autocomplete: 'username', required: true, placeholder: 'you@company.com' });
  const pw = h('input', { type: 'password', id: 'pw', autocomplete: 'current-password', required: true, placeholder: 'Your password' });
  const btn = h('button', { class: 'btn primary lg', type: 'submit', style: 'width:100%;margin-top:20px' }, 'Sign in');
  $app.replaceChildren(h('div', { class: 'auth' }, h('div', { class: 'card' },
    h('div', { class: 'brand' }, h('div', { class: 'logo' }, icon('logo')), APP_NAME),
    h('h1', {}, 'Welcome back'), h('p', { class: 'muted', style: 'margin-bottom:22px' }, 'Sign in to screen Upwork jobs and write proposals.'),
    h('form', { onsubmit: async (e) => {
      e.preventDefault(); err.hidden = true; btnBusy(btn, 'Signing in');
      try { me = (await api('POST', '/login', { email: email.value, password: pw.value })).user; location.hash = '#/dashboard'; route(); }
      catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; btn.disabled = false; btn.replaceChildren('Sign in'); }
    } }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'em' }, 'Email'), email),
      h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'pw' }, 'Password'), pw), err, btn))));
  email.focus();
}

// ---------- screen a job ----------
async function newView() {
  const box = h('textarea', { id: 'jobin', 'aria-label': 'Job link or page text', placeholder: 'Paste an Upwork job link, or copy the whole job page and paste it here.\n\nInclude the "About the client" section: the screening depends on it.' });
  const chip = h('span', { class: 'chip' }, 'Waiting for input');
  const err = h('div', { class: 'err', hidden: true });
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, 'Screen this job');
  const urlIn = h('input', { type: 'text', id: 'joburl', placeholder: 'https://www.upwork.com/jobs/...' });
  const detect = () => {
    const v = box.value.trim();
    if (!v) chip.replaceChildren('Waiting for input'), chip.className = 'chip';
    else if (!/\s/.test(v) && /^https?:\/\//i.test(v)) chip.replaceChildren(icon('link'), 'Job link'), chip.className = 'chip brand';
    else chip.replaceChildren(icon('doc'), `Pasted text, ${v.length.toLocaleString()} characters`), chip.className = 'chip brand';
  };
  box.addEventListener('input', detect);
  const submit = async () => {
    err.hidden = true; btnBusy(btn, 'Sending');
    try {
      const r = await api('POST', '/screenings', { input: box.value, job_url: urlIn.value.trim() || null });
      location.hash = '#/s/' + r.id + '/work'; // a new job goes straight into the workflow
    } catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; btn.disabled = false; btn.replaceChildren('Screen this job'); }
  };
  btn.onclick = submit;
  box.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(); });
  shell('new', [
    pageHead('Screen a job', 'Check an Upwork job against the SOP before anyone spends Connects on it.'),
    h('div', { class: 'card composer' }, box,
      h('div', { class: 'composer-bar' }, chip, h('span', { class: 'grow' }), h('span', { class: 'faint small' }, 'Ctrl + Enter to send'), btn)),
    h('div', { class: 'field', style: 'margin-top:16px;max-width:520px' }, h('label', { class: 'lbl', for: 'joburl' }, 'Job link (optional)'), urlIn, h('div', { class: 'hint' }, 'Saved with the record when you paste text instead of a link.')),
    err,
    h('div', { class: 'steps' },
      h('div', { class: 'step' }, h('div', { class: 'n' }, '1'), h('strong', {}, 'Paste the job'), h('p', {}, 'A job link, or the full page text copied from Upwork.')),
      h('div', { class: 'step' }, h('div', { class: 'n' }, '2'), h('strong', {}, 'We screen it'), h('p', {}, 'The SOP rules run in about a minute and return PASS, FLAG or FAIL.')),
      h('div', { class: 'step' }, h('div', { class: 'n' }, '3'), h('strong', {}, 'Decide, then write'), h('p', {}, `Continue (a FLAG or FAIL needs a reason), pick ${cfg('selection.min', 1) === cfg('selection.max', 2) ? cfg('selection.max', 2) : cfg('selection.min', 1) + ' to ' + cfg('selection.max', 2)} projects and a profile, and the proposal is written for you.`))),
    h('div', { class: 'notice' }, icon('info'), h('div', {}, 'Links are read through the Upwork API, which is not connected yet. For now, paste the page text.')),
  ]);
  box.focus();
}

// ---------- dashboard ----------
const PERIODS = [['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['month', 'This month'], ['all', 'All time']];
const ymd = (d) => d.toLocaleDateString('sv'); // YYYY-MM-DD in local time
function periodRange(key) {
  const now = new Date(), t = ymd(now);
  if (key === 'today') return { from: t, to: t };
  if (key === '7' || key === '30') { const d = new Date(now); d.setDate(d.getDate() - Number(key) + 1); return { from: ymd(d), to: t }; }
  if (key === 'month') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: t };
  return {};
}
const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '-');

async function dashboardView() {
  const hp = hashParams();
  const st = { period: PERIODS.some(([k]) => k === hp.period) ? hp.period : '30', profile: hp.profile || '', user: hp.user || '', mine: hp.mine === '1' };
  const opts = await api('GET', '/screenings/filter-options');
  const body = h('div', {});
  const sel = (key, label, options) => {
    const el = h('select', { 'aria-label': label, class: 'fsel' }, h('option', { value: '' }, label), options.map(([v, l]) => h('option', { value: v, selected: String(st[key]) === String(v) }, l)));
    el.onchange = () => { st[key] = el.value; load(); };
    return el;
  };
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Period' });
  const drawSeg = () => seg.replaceChildren(...PERIODS.map(([k, l]) => h('button', { type: 'button', class: st.period === k ? 'on' : '', 'aria-pressed': st.period === k, onclick: () => { st.period = k; drawSeg(); load(); } }, l)));
  drawSeg();
  const mineBox = h('input', { type: 'checkbox', id: 'dmine', checked: st.mine }); mineBox.onchange = () => { st.mine = mineBox.checked; load(); };
  const bar = h('div', { class: 'toolbar dashbar' }, seg, h('span', { class: 'grow' }), sel('profile', 'All profiles', opts.profiles.map((p) => [p.id, p.name])),
    opts.users.length ? sel('user', 'Everyone', opts.users.map((u) => [u.id, u.name])) : null,
    me.role !== 'employee' ? h('label', { class: 'row small', for: 'dmine', style: 'gap:6px' }, mineBox, 'Only mine') : null);

  /** A link to the Jobs list with the dashboard's filters plus `extra`, so every number can be opened. */
  const jobsLink = (extra = {}) => {
    const r = periodRange(st.period); const q = new URLSearchParams();
    if (r.from) q.set('from', r.from); if (r.to) q.set('to', r.to);
    for (const k of ['profile', 'user']) if (st[k]) q.set(k, st[k]); if (st.mine) q.set('mine', '1');
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return '#/history?' + q;
  };
  const kpi = (label, value, sub, link, cls) => h(link ? 'a' : 'div', { class: 'stat kpi ' + (cls || ''), href: link || null }, h('span', { class: 'k' }, label), h('span', { class: 'v' }, value), sub ? h('span', { class: 'sub small muted' }, sub) : null);
  const panel = (title, sub, content, wide) => h('div', { class: 'card dpanel' + (wide ? ' wide' : '') }, h('div', { class: 'card-head' }, h('h2', {}, title), sub ? h('span', { class: 'sub' }, sub) : null), h('div', { class: 'card-pad' }, content));
  const hbar = (label, value, max, extra, link, shown) => h(link ? 'a' : 'div', { class: 'hbar', href: link || null }, h('span', { class: 'lbl', title: label }, label),
    h('span', { class: 'track' }, h('i', { style: `width:${max ? Math.max(value ? 2 : 0, (value / max) * 100) : 0}%` })), h('span', { class: 'num' }, shown ?? value.toLocaleString()), h('span', { class: 'ext small muted' }, extra || ''));

  function draw(d) {
    const c = d.counts, t = d.timings;
    const funnel = [['Screened', c.screened, {}], ['Continued', c.continued, {}], ['Proposal written', c.proposals, {}], ['Proposal sent', c.sent, {}],
      ['Client viewed', c.viewed, {}], ['Chat opened', c.replied, {}], ['Interview', c.interviewed, {}], ['Hired', c.hired, { outcome: 'Hired' }]];
    const needs = d.needs_action.reduce((a, k) => a + (d.stages[k] || 0), 0);
    const maxDay = Math.max(1, ...d.daily.map((x) => x.screened));
    const people = (rows, key) => rows.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['', 'Screened', 'Continued', 'Proposals', 'Sent', 'Hired', 'Avg to proposal'].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((r) => h('tr', { class: r.id ? 'click' : '', onclick: r.id ? () => (location.hash = jobsLink({ [key]: r.id })) : null },
        h('td', {}, r.name || h('span', { class: 'faint' }, 'No profile yet')), h('td', {}, r.screened), h('td', {}, r.continued), h('td', {}, r.proposals), h('td', {}, r.sent), h('td', {}, r.hired), h('td', {}, mins(r.avg_to_proposal))))))) : h('p', { class: 'muted' }, 'Nothing in this period.');
    body.replaceChildren(
      h('div', { class: 'stats six' },
        kpi('Screened', c.screened, `${c.PASS} pass · ${c.FLAG} flag · ${c.FAIL} fail`, jobsLink()),
        kpi('Continued', c.continued, `${pct(c.continued, c.screened)} of screened · ${c.overridden} past a flag/fail`, jobsLink()),
        kpi('Proposals', c.proposals, `${c.finalized} finished`, jobsLink()),
        kpi('Sent', c.sent, c.connects ? `${c.connects} Connects` : 'Connects not recorded', jobsLink()),
        kpi('Hired', c.hired, `${pct(c.hired, c.sent)} of sent`, jobsLink({ outcome: 'Hired' }), 'PASS'),
        kpi('Needs action', needs, 'waiting on someone', jobsLink({ stage: 'needs_action' }), 'NEED')),
      h('div', { class: 'dgrid' },
        panel('Funnel', 'From screening to hire', h('div', { class: 'hbars' }, funnel.map(([l, v, ex]) => hbar(l, v, c.screened, pct(v, c.screened), jobsLink(ex))))),
        panel('Speed', 'Paste to proposal ready', h('div', {},
          h('div', { class: 'bigtime' }, mins(t.avg_to_proposal) || '-', h('span', { class: 'small muted' }, ' average')),
          h('p', { class: 'small muted', style: 'margin:2px 0 14px' }, t.min_to_proposal != null ? `fastest ${mins(t.min_to_proposal)} · slowest ${mins(t.max_to_proposal)}` : 'No proposals in this period'),
          h('div', { class: 'hbars' }, [['Screening', t.avg_screening], ['Project matching', t.avg_matching], ['Writing (after the profile)', t.avg_writing]].map(([l, v]) =>
            hbar(l, v || 0, Math.max(t.avg_screening || 0, t.avg_matching || 0, t.avg_writing || 0, 1), null, null, v == null ? '-' : mins(v)))),
          h('p', { class: 'hint' }, 'Averages per step, model time only. Person time (reading, picking) is the rest.'))),
        panel('Needs attention', needs ? `${needs} job${needs === 1 ? '' : 's'} waiting` : 'Nothing waiting', d.waiting.length
          ? h('div', {}, h('div', { class: 'chips', style: 'margin-bottom:10px' }, d.needs_action.filter((k) => d.stages[k]).map((k) => h('a', { class: 'chip', href: jobsLink({ stage: k }) }, `${STAGE_INFO[k][1]}: ${d.stages[k]}`))),
            h('ul', { class: 'waitlist' }, d.waiting.map((r) => h('li', {}, h('a', { href: '#/s/' + r.id }, r.title || 'Job #' + r.id), h('span', { class: 'small muted' }, `${STAGE_INFO[r.stage][1]} · ${r.user_name} · ${ago(r.created_at)}`)))))
          : h('p', { class: 'muted' }, 'Every job in this period is complete or skipped.')),
        panel('Jobs per day', 'Screened, continued and proposals', d.daily.length ? h('div', { class: 'daybars' }, d.daily.map((x) => h('div', { class: 'day', title: `${x.day}: ${x.screened} screened, ${x.continued} continued, ${x.proposals} proposals` },
          h('div', { class: 'col' }, h('i', { class: 's', style: `height:${(x.screened / maxDay) * 100}%` }), h('i', { class: 'p', style: `height:${(x.proposals / maxDay) * 100}%` })),
          h('span', { class: 'small muted' }, x.day.slice(5))))) : h('p', { class: 'muted' }, 'No jobs in this period.')),
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
    draw(await api('GET', '/dashboard?' + q));
  }
  shell('dashboard', [pageHead('Dashboard', 'How the team is doing: what came in, what went out, how fast, and what is waiting.', h('a', { class: 'btn primary', href: '#/new' }, icon('screen'), 'Screen a job')), bar, body], 1480);
  body.append(h('div', { class: 'card-pad' }, h('div', { class: 'skel', style: 'width:60%' })));
  await load();
}

// ---------- status: what happened on Upwork after the proposal ----------
/** Now, as the value a datetime-local input takes (local time, to the minute). */
const nowLocal = () => { const d = new Date(); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const NEXT_STATUS = { '': 'Sent', Sent: 'Viewed', Viewed: 'Chat opened', 'Chat opened': 'Interview' };
const canTrack = (userId) => userId === me.id || me.role === 'admin' || me.role === 'manager';
/** One click to record a status and when it happened (now, unless changed). Every change is kept in the history. */
async function statusDialog(id, onDone) {
  const d = await api('GET', `/screenings/${id}/status`);
  let pick = NEXT_STATUS[d.current || ''] || d.choices[0];
  let draw;
  const when = h('input', { type: 'datetime-local', id: 'sat', value: nowLocal(), max: nowLocal() });
  const reason = h('select', { id: 'srs', style: 'width:100%' }, h('option', { value: '' }, 'Choose a reason'), d.loss_reasons.map((r) => h('option', { value: r }, r)));
  const note = h('textarea', { id: 'snt', style: 'min-height:64px', maxlength: 2000, placeholder: 'Anything the client said, or what we could do differently (optional)' });
  const lossBox = h('div', { class: 'field', style: 'margin-top:14px' }, h('label', { class: 'lbl', for: 'srs' }, 'Why didn\u2019t the client go ahead? (required)'), reason, h('div', { style: 'height:8px' }), note);
  const syncLoss = () => { lossBox.hidden = !d.loss_outcomes.includes(pick); };
  const grid = h('div', { class: 'statuspick', role: 'radiogroup', 'aria-label': 'Status' });
  draw = () => grid.replaceChildren(...d.choices.map((c) => h('button', { type: 'button', role: 'radio', 'aria-checked': pick === c, class: 'chip' + (pick === c ? ' brand' : '') + (c === d.current ? ' cur' : '') + (d.loss_outcomes.includes(c) ? ' loss' : ''), onclick: () => { pick = c; draw(); } }, c)));
  const draw0 = draw; draw = () => { draw0(); syncLoss(); };
  draw();
  modal({ title: 'Update status', confirm: 'Save status', body: h('div', {},
    d.current ? h('p', { class: 'small muted', style: 'margin-top:0' }, 'Now: ', h('strong', {}, d.current)) : null,
    grid,
    lossBox,
    h('div', { class: 'field', style: 'margin-top:14px' }, h('label', { class: 'lbl', for: 'sat' }, 'When it happened'), when, h('div', { class: 'hint' }, 'Set to now. Change it only if it happened earlier.')),
    d.events.length ? h('details', { class: 'desc', style: 'margin-top:12px' }, h('summary', {}, `History (${d.events.length})`),
      h('ul', { class: 'plain' }, d.events.map((e) => h('li', {}, h('strong', {}, e.status), h('span', { class: 'muted' }, ` · ${full(e.happened_at)}${e.user_name ? ' · ' + e.user_name : ''}${e.reason ? ' · ' + e.reason : ''}`))))) : null),
    onConfirm: async () => {
      const lost = d.loss_outcomes.includes(pick);
      await api('POST', `/screenings/${id}/status`, { status: pick, at: when.value, reason: lost ? reason.value || null : null, note: note.value.trim() || null });
      toast(`Status: ${pick}`); if (onDone) await onDone();
    } });
}

// ---------- jobs list ----------
/**
 * Our own work, counted only where the job waits on a person (steps 1 to 5); then Upwork.
 * "Screening" and "Writing" are the AI at work for a minute or two, so they get no step number.
 */
const STAGE_INFO = {
  decide: [1, 'Decision pending'], projects: [2, 'Projects pending'], profile: [3, 'Profile pending'], review: [4, 'Review pending'], ready: [5, 'Ready to send'],
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
const mins = (sec) => (sec == null ? '' : sec < 60 ? sec + ' s' : sec < 3600 ? Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') : Math.floor(sec / 3600) + ' h ' + Math.floor((sec % 3600) / 60) + ' min');
const yn = (v) => (v === 'yes' ? 'Yes' : v === 'no' ? 'No' : '');
/** Long model-written values (budget, client) stay on one line; the full text is on hover. */
const clip = (v, w) => (v ? h('span', { class: 'clip', title: v, style: `max-width:${w}px` }, v) : '');
/** Every column the Jobs list can show, and which ones each tab starts with. */
const JOB_COLS = [
  { key: 'progress', label: 'Where it stands', sort: 'stage', cell: (r) => progressStep(r.stage) },
  { key: 'status', label: 'Status', sort: 'quiet', cell: (r) => [r.current_status ? h('span', { class: 'chip brand' }, r.current_status) : h('span', { class: 'faint small' }, 'Not sent'), r.status_at ? h('div', { class: 'meta', title: full(r.status_at) }, ago(r.status_at)) : null] },
  { key: 'since', label: 'Last update', sort: 'quiet', cell: (r) => (r.days_since_update == null ? '' : h('span', { class: r.stage === 'submitted' && r.days_since_update >= cfg('tracking.quiet_days', 5) ? 'quiet' : 'muted' }, r.days_since_update === 0 ? 'today' : `${r.days_since_update} d ago`)) },
  { key: 'verdict', label: 'Result', sort: 'verdict', cell: (r) => [verdictPill(r.verdict, r.status), r.rule_codes ? h('div', { class: 'meta mono' }, r.rule_codes) : null] },
  { key: 'country', label: 'Client', sort: 'country', cell: (r) => clip(r.client_country, 170) },
  { key: 'budget', label: 'Budget', cell: (r) => [clip(r.budget, 190), r.job_type ? h('div', { class: 'meta' }, r.job_type) : null] },
  { key: 'hire_rate', label: 'Hire rate', sort: 'hire_rate', cell: (r) => clip(r.hire_rate, 120) },
  { key: 'profile', label: 'Profile', sort: 'profile', cell: (r) => clip(r.profile_name, 140) },
  { key: 'user', label: 'By', sort: 'user', cell: (r) => r.user_name },
  { key: 'template', label: 'Template', cell: (r) => clip(r.template_name, 180) },
  { key: 'sent', label: 'Sent', cell: (r) => (r.proposal_sent_at || r.proposal_sent_date ? h('span', { title: full(r.proposal_sent_at || r.proposal_sent_date) }, String(r.proposal_sent_at || r.proposal_sent_date).slice(0, 10)) : '') },
  { key: 'connects', label: 'Connects', cell: (r) => (r.connects_spent != null ? r.connects_spent + (r.boost_connects ? ' + ' + r.boost_connects : '') : '') },
  { key: 'response', label: 'Viewed / chat / interview', cell: (r) => [yn(r.client_viewed), yn(r.client_replied), yn(r.interviewed)].map((v) => v || '-').join(' / ') },
  { key: 'outcome', label: 'Outcome', sort: 'outcome', cell: (r) => (r.outcome ? h('span', { class: 'chip ' + (cfg('tracking.loss_outcomes', []).includes(r.outcome) ? '' : 'brand') }, r.outcome) : '') },
  { key: 'reason', label: 'Why lost', cell: (r) => clip(r.outcome_reason, 180) },
  { key: 'close', label: 'Sent to close', cell: (r) => (r.days_to_close == null ? '' : `${r.days_to_close} d`) },
  { key: 'time', label: 'To proposal', sort: 'time', cell: (r) => mins(r.secs_to_proposal) },
  { key: 'created', label: 'Screened', sort: 'created', cell: (r) => h('span', { class: 'muted', title: full(r.created_at) }, ago(r.created_at)) },
];
/** The tabs: each is a phase, with its own starting columns, stage filter and counter tile. */
const JOB_TABS = [
  { key: '', label: 'All', cols: ['progress', 'status', 'verdict', 'country', 'profile', 'user', 'created'] },
  { key: 'in_progress', label: 'In progress', cols: ['progress', 'verdict', 'country', 'budget', 'profile', 'user', 'created'], stages: ['decide', 'projects', 'profile', 'review', 'ready', 'screening', 'writing'], need: true },
  { key: 'submitted', label: 'Submitted', cols: ['status', 'since', 'sent', 'connects', 'response', 'profile', 'user', 'country'], quiet: true },
  { key: 'closed', label: 'Closed', cols: ['outcome', 'reason', 'close', 'sent', 'profile', 'user', 'country'] },
  { key: 'not_pursued', label: 'Not pursued', cols: ['progress', 'verdict', 'country', 'budget', 'user', 'created'], stages: ['skipped', 'failed'] },
];
function savedCols(tab) {
  try { const v = JSON.parse(localStorage.getItem('jobs.columns.' + (tab || 'all')) || 'null'); if (Array.isArray(v)) return new Set(v); } catch { /* storage blocked */ }
  return new Set((JOB_TABS.find((t) => t.key === tab) || JOB_TABS[0]).cols);
}
const NEEDS_ACTION_STAGES = ['decide', 'projects', 'profile', 'review', 'ready'];
/** What the person does next, as a button label, for each step that waits on them. */
const NEXT_ACTION = { decide: 'Decide', projects: 'Pick projects', profile: 'Pick profile', review: 'Review proposal', ready: 'Mark as sent' };
const FILTER_KEYS = ['v', 'q', 'mine', 'from', 'to', 'rule', 'profile', 'user', 'outcome', 'stage', 'tab'];
/** The list's filters as API query parameters (the export uses the same ones). */
function jobQuery(st) {
  const qs = new URLSearchParams();
  const map = { v: 'verdict', q: 'q', from: 'from', to: 'to', rule: 'rule', profile: 'profile', user: 'user', outcome: 'outcome', stage: 'stage', tab: 'phase' };
  for (const [k, api] of Object.entries(map)) if (st[k]) qs.set(api, st[k]);
  if (st.mine) qs.set('mine', '1');
  return qs;
}
/** The one action a row offers, by where the job stands. */
function rowAction(r, reload) {
  if (r.status !== 'done' || !canTrack(r.user_id)) return null;
  const stop = (e) => e.stopPropagation();
  const stepNo = { decide: 1, projects: 2, profile: 3, review: 4 }[r.stage]; // workflow step to open
  if (stepNo && r.user_id === me.id) return h('a', { class: 'btn sm', href: `#/s/${r.id}/work?step=${stepNo}`, onclick: stop }, NEXT_ACTION[r.stage]);
  if (r.stage === 'ready') return h('button', { class: 'btn sm primary', type: 'button', onclick: (e) => { stop(e); statusDialog(r.id, reload); } }, 'Mark as sent');
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
  const tabsEl = h('div', { class: 'jobtabs', role: 'tablist' }), statsEl = h('div', { class: 'stats' }), bodyEl = h('div', {}), filters = h('div', { class: 'toolbar filters' });

  const sel = (key, label, options) => {
    const el = h('select', { 'aria-label': label, class: 'fsel' }, h('option', { value: '' }, label), options.map(([v, l]) => h('option', { value: v, selected: String(st[key]) === String(v) }, l)));
    el.onchange = () => { st[key] = el.value; st.page = 1; load(); };
    return el;
  };
  const dateIn = (key, label) => { const el = h('input', { type: 'date', 'aria-label': label, title: label, value: st[key], class: 'fdate' }); el.onchange = () => { st[key] = el.value; st.page = 1; load(); }; return el; };
  const searchIn = h('input', { type: 'search', placeholder: 'Search by job, client country, person, profile or rule', 'aria-label': 'Search jobs', value: st.q });
  searchIn.oninput = debounce(() => { st.q = searchIn.value.trim(); st.page = 1; load().catch((x) => toast(x.message, true)); }, 300);
  const mineBox = h('input', { type: 'checkbox', id: 'mine', checked: st.mine }); mineBox.onchange = () => { st.mine = mineBox.checked; st.page = 1; load(); };
  const outcomes = [...new Set([...outcomeList(), ...opts.outcomes])];
  const colBtn = h('button', { class: 'btn', type: 'button' }, 'Columns');
  colBtn.onclick = () => modal({ title: `Columns to show in ${tab().label}`, noConfirm: true, body: h('div', { class: 'colpick' }, JOB_COLS.map((c) => {
    const cb = h('input', { type: 'checkbox', id: 'col-' + c.key, checked: cols.has(c.key) });
    cb.onchange = () => { if (cb.checked) cols.add(c.key); else cols.delete(c.key); try { localStorage.setItem('jobs.columns.' + (st.tab || 'all'), JSON.stringify([...cols])); } catch { /* storage blocked */ } load(); };
    return h('label', { for: 'col-' + c.key, class: 'row small' }, cb, c.label);
  })) });
  const clearBtn = h('button', { class: 'btn', type: 'button', onclick: () => { location.hash = '#/history' + (st.tab ? '?tab=' + st.tab : ''); route(); } }, 'Clear filters');
  // the export uses the filters on screen, so "last month's lost jobs" is two clicks
  const exportBtn = h('button', { class: 'btn', type: 'button' }, icon('doc'), 'Export');
  exportBtn.onclick = () => {
    const qs = jobQuery(st); qs.set('sort', st.sort); qs.set('dir', st.dir);
    const n = st.v ? stats[st.v] : stats.total; // the counters ignore the verdict, so pick its own count
    const link = (fmt, text) => h('a', { class: 'btn' + (fmt === 'xlsx' ? ' primary' : ''), href: `/api/screenings/export?format=${fmt}&${qs}`, download: '' }, text);
    modal({ title: 'Export jobs', noConfirm: true, body: h('div', {},
      h('p', { class: 'muted', style: 'margin-top:0' }, `Exports the ${n.toLocaleString()} job${n === 1 ? '' : 's'} on screen (${tab().label}${st.v ? ', ' + st.v + ' only' : ''}, with the filters): the job post, the gate result, the decision, projects, profile, the final proposal, every status with its date and reason, and the full change history.`),
      h('div', { class: 'row' }, link('xlsx', 'Excel (.xlsx)'), link('csv', 'CSV'))) });
  };
  function drawFilters() {
    const t = tab();
    const stageOpts = t.stages ? [...(t.need ? [['needs_action', 'Needs action']] : []), ...t.stages.map((x) => [x, STAGE_INFO[x][1]])] : t.quiet ? [['quiet', 'Gone quiet']] : null;
    filters.replaceChildren(...[h('div', { class: 'search' }, icon('search'), searchIn), dateIn('from', 'From date'), dateIn('to', 'To date'),
      stageOpts ? sel('stage', t.key === 'in_progress' ? 'Any step' : t.quiet ? 'Any submitted' : 'Skipped or failed', stageOpts) : null,
      sel('rule', 'Any rule', opts.rules.map((r) => [r.code, `${r.code}  ${r.rule}`])),
      sel('profile', 'Any profile', opts.profiles.map((p) => [p.id, p.name])),
      opts.users.length ? sel('user', 'Anyone', opts.users.map((u) => [u.id, u.name])) : null,
      t.key === 'closed' || t.key === 'submitted' || !t.key ? sel('outcome', 'Any outcome', [['none', 'No outcome yet'], ...outcomes.map((o) => [o, o])]) : null,
      me.role !== 'employee' ? h('label', { class: 'row small', for: 'mine', style: 'gap:6px' }, mineBox, 'Only mine') : null,
      h('span', { class: 'grow' }), clearBtn, colBtn, exportBtn].filter(Boolean)); // replaceChildren would print a null
  }
  function drawTabs() {
    const total = Object.values(stats.tabs || {}).reduce((a, b) => a + b, 0);
    tabsEl.replaceChildren(...JOB_TABS.map((t) => h('button', { type: 'button', role: 'tab', 'aria-selected': st.tab === t.key, class: st.tab === t.key ? 'on' : '',
      onclick: () => { if (st.tab === t.key) return; st.tab = t.key; st.stage = ''; st.outcome = t.key === 'in_progress' || t.key === 'not_pursued' ? '' : st.outcome; st.page = 1; cols = savedCols(st.tab); drawFilters(); load(); } },
      t.label, h('span', { class: 'n' }, String(t.key ? stats.tabs[t.key] || 0 : total)))));
  }
  const tile = (key, label, value, onClick, on) => h('button', { class: `stat ${key} ${on ? 'on' : ''}`, onclick: onClick }, h('span', { class: 'k' }, label), h('span', { class: 'v' }, value));
  const setV = (v) => () => { st.v = st.v === v ? '' : v; st.page = 1; load(); };
  function drawStats() {
    const t = tab();
    const extra = t.need ? tile('NEED', 'Needs action', stats.needs_action, () => { st.stage = st.stage === 'needs_action' ? '' : 'needs_action'; st.page = 1; drawFilters(); load(); }, st.stage === 'needs_action')
      : t.quiet ? tile('QUIET', `Gone quiet (${stats.quiet_days}+ days)`, stats.quiet, () => { st.stage = st.stage === 'quiet' ? '' : 'quiet'; st.page = 1; drawFilters(); load(); }, st.stage === 'quiet')
      : h('div', { class: 'stat', style: 'cursor:default' }, h('span', { class: 'k' }, 'Continued anyway'), h('span', { class: 'v' }, stats.overridden));
    statsEl.replaceChildren(tile('', 'All results', stats.total, () => { st.v = ''; st.page = 1; load(); }, !st.v),
      tile('PASS', 'Pass', stats.PASS, setV('PASS'), st.v === 'PASS'), tile('FLAG', 'Flag', stats.FLAG, setV('FLAG'), st.v === 'FLAG'), tile('FAIL', 'Fail', stats.FAIL, setV('FAIL'), st.v === 'FAIL'), extra);
  }
  function headCell(label, sortKey) {
    if (!sortKey) return h('th', {}, label);
    const on = st.sort === sortKey;
    const b = h('button', { type: 'button', class: 'sortbtn' + (on ? ' on' : '') }, label, on ? (st.dir === 'asc' ? ' ▲' : ' ▼') : '');
    b.onclick = () => { if (on) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.sort = sortKey; st.dir = sortKey === 'created' || sortKey === 'time' ? 'desc' : 'asc'; } load(); };
    return h('th', { 'aria-sort': on ? (st.dir === 'asc' ? 'ascending' : 'descending') : null }, b);
  }
  function drawRows(rows, total) {
    const order = tab().cols; // the tab's own order first, then any extra column the person added
    const shown = JOB_COLS.filter((c) => cols.has(c.key)).sort((a, b) => (order.includes(a.key) ? order.indexOf(a.key) : 99) - (order.includes(b.key) ? order.indexOf(b.key) : 99));
    const filtered = FILTER_KEYS.some((k) => k !== 'tab' && st[k]);
    const empty = { in_progress: 'Nothing in progress', submitted: 'Nothing submitted yet', closed: 'Nothing closed yet', not_pursued: 'Nothing skipped or failed' }[st.tab] || 'No jobs yet';
    const table = !rows.length
      ? emptyState('list', filtered ? 'No matches' : empty, filtered ? 'Try different filters.' : st.tab ? 'Jobs move here as they progress.' : 'Screen your first job to see it here.', filtered ? clearBtn.cloneNode(true) : st.tab ? null : h('a', { class: 'btn primary', href: '#/new' }, 'Screen a job'))
      : h('div', { class: 'tablewrap' }, h('table', { class: 'jobs' }, h('thead', {}, h('tr', {}, headCell('Job', 'title'), shown.map((c) => headCell(c.label, c.sort)), h('th', { class: 'pin' }, ''))),
        h('tbody', {}, rows.map((r) => h('tr', { class: 'click', tabindex: 0, onclick: () => (location.hash = '#/s/' + r.id), onkeydown: (e) => { if (e.key === 'Enter') location.hash = '#/s/' + r.id; } },
          h('td', { class: 'jobcell' }, h('span', { class: 'title' }, r.title || (r.input_type === 'link' ? 'Upwork link' : 'Pasted job text')), h('span', { class: 'meta' }, '#' + r.id)),
          shown.map((c) => h('td', {}, c.cell(r))),
          // the row's action stays pinned to the right edge, visible however far the table scrolls
          h('td', { class: 'pin' }, rowAction(r, load)))))));
    if (!rows.length && filtered) table.querySelector('button')?.addEventListener('click', () => { location.hash = '#/history' + (st.tab ? '?tab=' + st.tab : ''); route(); });
    bodyEl.replaceChildren(table, pager(total, st.page, (n) => { st.page = n; load(); }));
  }
  let seq = 0;
  async function load() {
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
    h('a', { class: 'btn primary', href: '#/new' }, icon('screen'), 'Screen a job')), tabsEl, statsEl, h('div', { class: 'card' }, filters, bodyEl)]);
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
      return h('div', {}, h('dt', {}, r.label), h('dd', { class: ns ? 'ns' : '' }, r.value));
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
      h('div', {}, h('div', { class: 'vt' }, j.verdict), h('h2', {}, multi ? j.title : t), h('div', { class: 'vs' }, multi ? t + '. ' + s : s))),
    j.fails.length ? h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, `Failed rules (${j.fails.length})`), issues(j.fails, 'fail'),
      j.override_note ? h('div', { class: 'callout', style: 'margin-top:12px' }, j.override_note) : null) : null,
    j.flags.length ? h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, `Flags (${j.flags.length})`), issues(j.flags, 'flag')) : null,
    h('div', { class: 'grid3' }, kvCard('Job', j.job), kvCard('Client', j.client), kvCard('Competition', j.competition)),
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'Fit with Stackup'), h('p', {}, j.fit)),
    j.proposal_notes.length ? h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'Notes for the proposal'),
      h('ul', { class: 'plain' }, j.proposal_notes.map((n) => h('li', {}, n)))) : null);
}

function progressCard(status) {
  const on = status === 'running' ? 1 : 0;
  const step = (i, label) => h('span', { class: 's ' + (i < on ? 'done' : i === on ? 'on' : '') }, h('i', {}, i < on ? '✓' : String(i + 1)), label);
  return h('div', { class: 'card progress', role: 'status', 'aria-live': 'polite' }, h('div', { class: 'ring' }),
    h('strong', { style: 'font-size:17px' }, status === 'running' ? 'Screening this job' : 'Waiting for a free slot'),
    h('p', { class: 'muted', style: 'margin-top:4px' }, 'This usually takes under a minute. You can leave this page; the result is saved.'),
    h('div', { class: 'stepper' }, step(0, 'Queued'), h('span', { class: 'bar' }), step(1, 'Checking SOP rules'), h('span', { class: 'bar' }), step(2, 'Report ready')));
}

function overrideCard(s) {
  const ta = h('textarea', { id: 'why', style: 'min-height:96px', placeholder: 'For example: client has a strong history with us, and the scope was clarified on a call.' });
  const minLen = cfg('override.min_reason', 15);
  const count = h('span', { class: 'counter' }, `0 / ${minLen} minimum`);
  const err = h('div', { class: 'err', hidden: true });
  const btn = h('button', { class: 'btn primary', type: 'button', disabled: true }, 'Continue with this job');
  ta.oninput = () => {
    const n = ta.value.trim().length; btn.disabled = n < minLen;
    count.textContent = n < minLen ? `${n} / ${minLen} minimum` : `${n} characters`; count.className = 'counter' + (n >= minLen ? ' ok' : '');
  };
  btn.onclick = () => modal({
    title: 'Continue despite the ' + s.verdict + '?', confirm: 'Yes, continue',
    body: h('p', { class: 'muted' }, 'Your reason is saved with this record and is visible to managers and admins.'),
    onConfirm: async () => { try { await api('POST', `/screenings/${s.id}/override`, { reason: ta.value }); toast('Saved. You can continue with this job.'); afterAction(1); } catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; throw x; } },
  });
  return h('div', { class: 'card override ' + s.verdict },
    h('div', { class: 'head' }, icon('warn'), h('div', {}, h('strong', {}, `This job is a ${s.verdict}. Do you still want to continue?`),
      h('div', { class: 'small muted' }, 'A reason is required and stays on record.'))),
    h('div', { class: 'card-pad' }, h('div', { class: 'row spread', style: 'margin-bottom:6px' }, h('label', { class: 'lbl', for: 'why', style: 'margin:0' }, 'Why continue?'), count), ta, err,
      h('div', { style: 'margin-top:14px' }, btn)));
}


// ---------- step 2: continue, tags, matching projects ----------
function continueCard(s) {
  const owner = s.user_id === me.id;
  const err = h('div', { class: 'err', hidden: true });
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, 'Continue');
  btn.onclick = async () => {
    err.hidden = true; btnBusy(btn, 'Starting');
    try { await api('POST', `/screenings/${s.id}/continue`, {}); afterAction(1); }
    catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; btn.disabled = false; btn.replaceChildren('Continue'); }
  };
  return h('div', { class: 'card override PASS' },
    h('div', { class: 'head' }, icon('check'), h('div', {}, h('strong', {}, 'This job passed the SOP gate.'),
      h('div', { class: 'small muted' }, 'Continue to tag the job and match it with Stackup projects.'))),
    h('div', { class: 'card-pad' }, owner ? [err, btn] : h('p', { class: 'hint' }, 'Only the person who submitted this job can continue with it.')));
}

function matchingSection(s, initial) {
  const owner = s.user_id === me.id;
  const box = h('div', { class: 'card matchcard' });
  let m = initial, timer = null, picked = null;
  const busy = () => m.status === 'queued' || m.status === 'running';
  const dateTxt = (d) => full(d);

  async function poll() {
    clearTimeout(timer);
    if (!box.isConnected) return; // the page was left: stop polling
    try { m = (await api('GET', `/screenings/${s.id}/matching`)).matching; draw(); } catch (e) { /* try again next time */ }
    if (m && busy()) timer = setTimeout(poll, 2500);
  }
  const start = async (btn) => {
    btnBusy(btn, 'Starting');
    try { await api('POST', `/screenings/${s.id}/matching/start`, {}); picked = null; m = { ...m, status: 'queued', error: null }; draw(); timer = setTimeout(poll, 2500); }
    catch (x) { toast(x.message, true); btn.disabled = false; btn.replaceChildren('Try again'); }
  };

  function tagsBlock() {
    const cats = [...new Set(m.tags.map((t) => t.category))];
    return h('details', { class: 'tagsbox', open: true },
      h('summary', {}, `Tags chosen for this job (${m.tags.length}) and why`),
      h('div', { class: 'tagsgrid' }, cats.map((c) => h('div', { class: 'tg' }, h('div', { class: 'tc-title' }, c),
        m.tags.filter((t) => t.category === c).map((t) => h('div', { class: 'trow' },
          h('div', { class: 'tname' }, h('strong', {}, t.name), h('span', { class: 'wt', title: 'Match weight' }, '×' + t.weight)), h('div', { class: 'treason' }, t.reason)))))));
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
    const confirmBtn = h('button', { class: 'btn primary', type: 'button', disabled: !okSize || !changed }, m.confirmed_at ? 'Save changed selection' : picked.size === 1 ? 'Confirm this project' : `Confirm these ${picked.size} projects`);
    const save = async (ids, btn, label) => {
      err.hidden = true; btnBusy(btn, 'Saving');
      try { await api('PUT', `/screenings/${s.id}/selection`, { project_ids: ids }); toast('Selection saved'); await poll(); if (stepCtx) stepCtx.refresh(); }
      catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; btn.disabled = false; btn.replaceChildren(label); }
    };
    confirmBtn.onclick = () => save([...picked], confirmBtn, confirmBtn.textContent);
    const recIds = rows.filter((r) => r.recommended).map((r) => r.project_id);
    const recLabel = recIds.length === 1 ? 'Use the recommended one' : `Use the ${recIds.length} recommended`;
    const recBtn = h('button', { class: 'btn', type: 'button', disabled: recIds.length < pmin || recIds.length > pmax }, recLabel);
    recBtn.onclick = () => { picked = new Set(recIds); save(recIds, recBtn, recLabel); };
    const rec = rows.filter((r) => r.recommended), rest = rows.filter((r) => !r.recommended);
    const card = (r) => {
      const on = picked.has(r.project_id), locked = !owner || !r.project_id || (picked.size >= pmax && !on);
      const cb = h('input', { type: 'checkbox', id: 'mp' + r.rank, checked: on, disabled: locked, 'aria-label': 'Select ' + r.project_name });
      cb.onchange = () => { if (cb.checked) picked.add(r.project_id); else picked.delete(r.project_id); draw(); };
      const toggle = (e) => { if (locked || e.target.closest('a, input')) return; cb.checked = !cb.checked; cb.onchange(); }; // the whole card picks the project
      return h('div', { class: 'mcard' + (on ? ' on' : '') + (r.recommended ? ' rec' : '') + (owner && !locked ? ' pickable' : ''), onclick: owner ? toggle : null },
        h('div', { class: 'mtop' }, owner ? cb : null, h('span', { class: 'rank' }, '#' + r.rank),
          h('div', { class: 'mname' }, r.project_id ? h('a', { href: '#/p/' + r.project_id }, r.project_name) : h('span', {}, r.project_name, h('span', { class: 'faint small' }, ' (removed from library)'))),
          r.recommended ? h('span', { class: 'chip brand' }, 'Recommended') : h('span', { class: 'chip' }, 'Match')),
        h('div', { class: 'mscore' }, h('div', { class: 'bar', role: 'img', 'aria-label': `Score ${r.score} of ${r.max_score}` }, h('i', { style: `width:${Math.max(3, r.percent)}%` })),
          h('span', { class: 'sc' }, h('strong', {}, r.score), ` of ${r.max_score} · ${r.percent}%`)),
        r.compliance_gap ? h('div', { class: 'cgap' }, icon('warn'), `Missing ${r.compliance_gap} compliance tag${r.compliance_gap > 1 ? 's' : ''} this job needs`) : null,
        h('div', { class: 'chips' }, r.shared.map((t) => h('span', { class: 'chip', title: `${t.category}, weight ${t.weight}` }, t.name, h('span', { class: 'faint' }, ' ×' + t.weight)))));
    };
    return h('div', {},
      h('div', { class: 'row spread', style: 'margin:4px 0 12px' }, h('h3', { class: 'section-title', style: 'margin:0' }, 'Matching projects'), owner ? count : null),
      h('p', { class: 'hint', style: 'margin:0 0 12px' }, 'Score is the sum of the weights of the tags a project shares with this job. ' + (owner ? `Keep the recommended ones or swap them for others below. Choose ${range}.` : '')),
      h('div', { class: 'mgrid' }, rec.map(card)), rest.length ? h('div', { class: 'mgrid', style: 'margin-top:12px' }, rest.map(card)) : null,
      owner && picked.size >= pmax ? h('p', { class: 'hint' }, 'Untick one project to choose a different one.') : null,
      err,
      m.confirmed_at ? h('div', { class: 'logged-line' }, icon('check'), `Confirmed${m.confirmed_by ? ' by ' + m.confirmed_by : ''} on ${dateTxt(m.confirmed_at)}`) : null,
      owner ? h('div', { class: 'row', style: 'margin-top:14px' }, confirmBtn, recBtn) : h('p', { class: 'hint' }, m.confirmed_at ? '' : 'Only the person who submitted this job can choose the projects.'));
  }


  function draw() {
    let body;
    if (busy()) {
      body = h('div', { class: 'progress', role: 'status', 'aria-live': 'polite' }, h('div', { class: 'ring' }),
        h('strong', { style: 'font-size:17px' }, m.status === 'running' ? 'Reading the job and choosing tags' : 'Waiting for a free slot'),
        h('p', { class: 'muted', style: 'margin-top:4px' }, 'Then the tags are matched with the project library. This usually takes a minute or two. You can leave this page.'));
    } else if (m.status === 'error') {
      const retry = h('button', { class: 'btn primary', type: 'button' }, 'Try again'); retry.onclick = () => start(retry);
      body = emptyState('x', 'Project matching did not finish', m.error || 'Something went wrong.', owner ? retry : null);
    } else if (m.status === 'done') {
      body = h('div', {}, tagsBlock(), h('div', { style: 'height:18px' }), matchesBlock());
    } else { // continued before this step existed
      const go = h('button', { class: 'btn primary', type: 'button' }, 'Find matching projects'); go.onclick = () => start(go);
      body = emptyState('folder', 'Next: match this job with projects', 'The job will be tagged and compared with the project library.', owner ? go : null);
    }
    box.replaceChildren(h('div', { class: 'card-head' }, h('h2', {}, 'Project matching'), m.tagged_at ? h('span', { class: 'sub' }, '') : null), h('div', { class: 'card-pad' }, body));
  }
  draw(); if (busy()) timer = setTimeout(poll, 2500);
  return box;
}

// ---------- tracking and record details ----------
const outcomeList = () => cfg('tracking.outcomes', ['Pending', 'Hired', 'Not hired', 'No response', 'Withdrawn', 'Job closed']);
const yesNo = (id, value) => h('select', { id, style: 'width:100%' }, [['', 'Not known'], ['yes', 'Yes'], ['no', 'No']].map(([v, l]) => h('option', { value: v, selected: (value || '') === v }, l)));
const numIn = (id, value, placeholder) => h('input', { type: 'number', id, min: 0, max: 1000, step: 1, value: value ?? '', placeholder });
/** After the proposal: what happened on Upwork. `onSaved` is called with the saved values. */
function trackingCard(s, onSaved) {
  const canEdit = s.user_id === me.id || me.role === 'admin' || me.role === 'manager';
  const proceeded = h('select', { id: 'tp', style: 'width:100%' }, [['', 'Not decided'], ['yes', 'Yes, proceeding'], ['no', 'No, skipped']].map(([v, l]) => h('option', { value: v, selected: (s.proceeded || '') === v }, l)));
  const date = h('input', { type: 'date', id: 'td', value: s.proposal_sent_date ? String(s.proposal_sent_date).slice(0, 10) : '' });
  const connects = numIn('tc', s.connects_spent, 'e.g. 16'), boost = numIn('tb', s.boost_connects, '0 if not boosted');
  const viewed = yesNo('tv', s.client_viewed), replied = yesNo('tr', s.client_replied), interview = yesNo('ti', s.interviewed);
  const OUTCOMES = outcomeList();
  const outs = OUTCOMES.includes(s.outcome) || !s.outcome ? OUTCOMES : [...OUTCOMES, s.outcome]; // keeps an older value selectable
  const outcome = h('select', { id: 'to', style: 'width:100%' }, h('option', { value: '' }, 'Not known yet'), outs.map((o) => h('option', { value: o, selected: s.outcome === o }, o)));
  const notes = h('textarea', { id: 'tn', style: 'min-height:80px', maxlength: 4000, placeholder: 'Anything worth remembering about this job or the proposal.' }); notes.value = s.notes || '';
  const lossOutcomes = cfg('tracking.loss_outcomes', []), lossReasons = cfg('tracking.loss_reasons', []);
  const reasons = lossReasons.includes(s.outcome_reason) || !s.outcome_reason ? lossReasons : [...lossReasons, s.outcome_reason];
  const reason = h('select', { id: 'tlr', style: 'width:100%' }, h('option', { value: '' }, 'Choose a reason'), reasons.map((r) => h('option', { value: r, selected: s.outcome_reason === r }, r)));
  const reasonNote = h('textarea', { id: 'tln', style: 'min-height:64px', maxlength: 2000, placeholder: 'What the client said, or what we could do differently (optional)' }); reasonNote.value = s.outcome_note || '';
  const lossBox = h('div', { class: 'grid2', style: 'margin-top:12px' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tlr' }, 'Why didn\u2019t the client go ahead? (required)'), reason),
    h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tln' }, 'Note on the reason'), reasonNote));
  const syncLoss = () => { lossBox.hidden = !lossOutcomes.includes(outcome.value); };
  const err = h('div', { class: 'err', hidden: true });
  const btn = h('button', { class: 'btn primary', type: 'button' }, 'Save tracking');
  const fields = [proceeded, date, connects, boost, viewed, replied, interview, outcome, notes, reason, reasonNote];
  outcome.addEventListener('change', syncLoss); syncLoss();
  fields.forEach((el) => { el.disabled = !canEdit; });
  const num = (el) => (el.value === '' ? null : Number(el.value));
  btn.onclick = async () => {
    err.hidden = true; btnBusy(btn, 'Saving');
    const body = { proceeded: proceeded.value || null, proposal_sent_date: date.value || null, connects_spent: num(connects), boost_connects: num(boost),
      client_viewed: viewed.value || null, client_replied: replied.value || null, interviewed: interview.value || null, outcome: outcome.value || null, notes: notes.value.trim() || null,
      outcome_reason: lossOutcomes.includes(outcome.value) ? reason.value || null : null, outcome_note: lossOutcomes.includes(outcome.value) ? reasonNote.value.trim() || null : null };
    try { await api('PATCH', `/screenings/${s.id}/tracking`, body); toast('Tracking saved'); if (onSaved) return onSaved(body); }
    catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; }
    btn.disabled = false; btn.replaceChildren('Save tracking');
  };
  const f = (id, label, el, hint) => h('div', { class: 'field' }, h('label', { class: 'lbl', for: id }, label), el, hint ? h('div', { class: 'hint' }, hint) : null);
  return h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'Tracking'),
    h('p', { class: 'hint', style: 'margin:0 0 12px' }, 'Fill this in after sending the proposal on Upwork, and update it as the client responds.'),
    h('div', { class: 'grid4' }, f('tp', 'Proceeded', proceeded), f('td', 'Proposal sent', date), f('tc', 'Connects spent', connects), f('tb', 'Boost (Connects)', boost)),
    h('div', { class: 'grid4', style: 'margin-top:12px' }, f('tv', 'Client viewed', viewed), f('tr', 'Chat opened', replied), f('ti', 'Interview', interview), f('to', 'Outcome', outcome)), lossBox,
    h('div', { class: 'field', style: 'margin-top:12px' }, h('label', { class: 'lbl', for: 'tn' }, 'Notes'), notes), err,
    canEdit ? h('div', { style: 'margin-top:14px' }, btn) : h('p', { class: 'hint' }, 'Only the submitter, managers and admins can edit this.'));
}

/** The end of the journey: what was sent and what happened, with the next things to do. */
function completePanel(s, matching, proposal, onEdit) {
  const yn = (v) => (v === 'yes' ? 'Yes' : v === 'no' ? 'No' : 'not known');
  const connects = s.connects_spent != null ? `${s.connects_spent}${s.boost_connects ? ` + ${s.boost_connects} boost` : ''}` : 'not recorded';
  const rows = [
    ['Verdict', `${s.verdict}${s.rule_codes ? ' (' + s.rule_codes + ')' : ''}`],
    ['Projects', matching && matching.confirmed_at ? matching.matches.filter((x) => x.selected).map((x) => x.project_name).join(', ') : 'not chosen'],
    ['Profile', matching && matching.proposal_profile ? matching.proposal_profile.name : 'not chosen'],
    ['Template', proposal && proposal.template ? proposal.template.name : 'none'],
    ['Proposal sent', s.proposal_sent_date ? String(s.proposal_sent_date).slice(0, 10) : 'not recorded'], ['Connects', connects],
    ['Client viewed', yn(s.client_viewed)], ['Chat opened', yn(s.client_replied)], ['Interview', yn(s.interviewed)], ['Outcome', s.outcome || 'not known yet'], ...(s.outcome_reason ? [['Why lost', s.outcome_reason + (s.outcome_note ? ': ' + s.outcome_note : '')]] : []),
  ];
  return h('div', { class: 'card complete' },
    h('div', { class: 'complete-head' }, h('div', { class: 'ico' }, icon('check')), h('div', {}, h('h2', {}, 'Job complete'),
      h('p', { class: 'muted' }, 'Tracking saved' + (s.tracking_updated_at ? ' ' + ago(s.tracking_updated_at) : '') + '. Update it again when the client responds.'))),
    h('div', { class: 'card-pad' }, h('dl', { class: 'kv cols2' }, rows.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', { class: /not |none/.test(v) ? 'ns' : '' }, v)))),
      s.notes ? h('blockquote', {}, s.notes) : null,
      h('div', { class: 'row', style: 'margin-top:16px' }, h('a', { class: 'btn primary', href: '#/new' }, icon('screen'), 'Screen another job'),
        h('a', { class: 'btn', href: lastList.history }, 'Back to jobs'), onEdit ? h('button', { class: 'btn', type: 'button', onclick: onEdit }, 'Edit tracking') : null)));
}

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
    ['Connects cost', s.connects_cost], ['Sample match', s.sample_match], ['Verdict', s.verdict], ['Fail reasons', s.fail_reasons],
    ['Flag reasons', s.flag_reasons], ['Rule codes', s.rule_codes], ['Proceeded', s.proceeded], ['Override reason', override ? override.reason : null],
    ['Selected projects', matching && matching.confirmed_at ? matching.matches.filter((x) => x.selected).map((x) => x.project_name).join('; ') : null],
    ['Written with template', proposal && proposal.template ? proposal.template.name : null],
    ['Proposal sent date', s.proposal_sent_date ? String(s.proposal_sent_date).slice(0, 10) : null], ['Outcome', s.outcome], ['Notes', s.notes],
  ];
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, 'Record details'), h('span', { class: 'sub' }, 'Every tracked field')),
    h('div', { class: 'card-pad' }, h('dl', { class: 'kv cols2' }, rows.map(([l, v]) => h('div', {}, h('dt', {}, l), h('dd', { class: v ? '' : 'ns' }, v || 'not recorded')))),
      s.job_description ? h('details', { class: 'desc' }, h('summary', {}, 'Job description (the pasted page text)'), h('pre', {}, s.job_description)) : null));
}

// ---------- the record page as a stepper ----------
let stepCtx = null; // the stepper that is on screen, so a section can refresh it or move it on
const afterAction = (stepNo) => { if (stepCtx) stepCtx.advanceTo(stepNo); else route(); };
const STEPS = [['screening', 'Screening'], ['projects', 'Projects'], ['profile', 'Profile'], ['proposal', 'Proposal'], ['tracking', 'Tracking']];

/** What is finished and what is open, from the server's state. */
function stepState(matching, proposal) {
  const done = [!!(matching && matching.continued), !!(matching && matching.confirmed_at), !!(matching && matching.proposal_profile), !!(proposal && proposal.finalized_at), false];
  const unlocked = [true, done[0], done[1], done[2], done[3]];
  let current = 0;
  for (let i = 0; i < STEPS.length; i++) if (unlocked[i]) { current = i; if (!done[i]) break; }
  return { done, unlocked, current };
}

/** Choose the one Upwork profile the proposal is sent from. Saving it starts the proposal. */
function profileSection(s, initial) {
  const owner = s.user_id === me.id;
  const box = h('div', { class: 'card matchcard' });
  let m = initial, chosen;
  async function reload() { m = (await api('GET', `/screenings/${s.id}/matching`)).matching; }
  function draw() {
    const profs = m.profiles || [], saved = m.proposal_profile;
    const current = chosen !== undefined ? chosen : (saved ? saved.id : null);
    const err = h('div', { class: 'err', hidden: true });
    const label = saved ? 'Change profile' : 'Confirm profile';
    const btn = h('button', { class: 'btn primary', type: 'button', disabled: !current || (saved && saved.id === current) }, saved ? 'Use this profile instead' : 'Confirm profile and write the proposal');
    btn.onclick = async () => {
      err.hidden = true; btnBusy(btn, 'Saving');
      try {
        const r = await api('PUT', `/screenings/${s.id}/proposal-profile`, { profile_id: current });
        toast(r.started ? 'Profile saved. Writing the proposal...' : 'Proposal profile saved'); chosen = undefined;
        if (stepCtx) { await stepCtx.refresh(); stepCtx.go(3); } else route();
      } catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; btn.disabled = false; btn.replaceChildren(saved ? 'Use this profile instead' : 'Confirm profile and write the proposal'); }
    };
    const opts = profs.map((p) => {
      const usable = Number(p.active) === 1;
      const radio = h('input', { type: 'radio', name: 'pp', id: 'pp' + p.id, checked: current === p.id, disabled: !owner || !usable });
      radio.onchange = () => { chosen = p.id; draw(); };
      return h('label', { class: 'pcard' + (current === p.id ? ' on' : '') + (usable ? '' : ' off'), for: 'pp' + p.id },
        radio, h('div', { class: 'pbody' }, h('strong', {}, p.name), p.tagline ? h('div', { class: 'small muted' }, p.tagline) : null,
          h('div', { class: 'small muted' }, [p.price !== null && p.price !== undefined ? money(p.price) + ' / hr' : null, p.gitlab_account ? 'GitLab: ' + (gitlabLink(p.gitlab_account) || {}).label : null].filter(Boolean).join('  ·  ')),
          p.notes ? h('div', { class: 'small muted' }, p.notes) : null,
          p.profile_url && /^https?:\/\//i.test(p.profile_url) ? h('div', { class: 'small' }, h('a', { href: p.profile_url, target: '_blank', rel: 'noopener noreferrer', onclick: (e) => e.stopPropagation() }, 'Open on Upwork')) : null),
        h('div', { class: 'chips' }, !usable ? h('span', { class: 'chip' }, 'Disabled') : null, saved && saved.id === p.id ? h('span', { class: 'chip brand' }, 'Chosen') : null));
    });
    box.replaceChildren(h('div', { class: 'card-head' }, h('h2', {}, 'Which profile will send the proposal?')), h('div', { class: 'card-pad' },
      h('p', { class: 'hint', style: 'margin:0 0 12px' }, owner ? 'Choose one profile. As soon as you confirm, the signals are detected, the best template is picked and the proposal is written.' : 'Chosen by the person who submitted this job.'),
      profs.length ? h('div', { class: 'pgrid' }, opts) : h('div', { class: 'notice' }, icon('info'), 'No Upwork profiles are set up yet. An admin can add them under Upwork profiles.'),
      err, saved ? h('div', { class: 'logged-line' }, icon('check'), `Proposal will be sent from ${saved.name}. Confirmed${saved.confirmed_by ? ' by ' + saved.confirmed_by : ''} on ${full(saved.confirmed_at)}`) : null,
      owner && profs.length ? h('div', { style: 'margin-top:14px' }, btn) : null));
  }
  box.replaceChildren(h('div', { class: 'card-pad' }, h('div', { class: 'skel', style: 'width:50%;margin-bottom:12px' }), h('div', { class: 'skel', style: 'width:70%' })));
  reload().then(draw).catch((e) => box.replaceChildren(h('div', { class: 'card-pad' }, emptyState('x', 'Could not load the profiles', e.message, null))));
  return box;
}

function stepperView(data) {
  const { s, id } = data; let { override, matching, proposal } = data;
  let st = stepState(matching, proposal);
  const hp = hashParams(); let cur = Number(hp.step) - 1;
  if (!(cur >= 0 && cur < STEPS.length && st.unlocked[cur])) cur = st.current;
  const owner = s.user_id === me.id;
  const bar = h('ol', { class: 'stepper-bar', 'aria-label': 'Progress' });
  const content = h('div', { class: 'stepcontent' });
  const nav = h('div', { class: 'stepnav' });
  let active = null;

  function leaveOk() { return !(active && active.__dirty && active.__dirty()) || confirm('You have unsaved changes in the proposal. Leave this step anyway?'); }
  function go(n) {
    if (n < 0 || n >= STEPS.length || !st.unlocked[n]) return;
    if (n !== cur && !leaveOk()) return;
    cur = n; setHashParams({ step: n + 1 }); drawBar(); drawContent(); drawNav();
    document.querySelector('.stepper-bar')?.scrollIntoView({ block: 'start' });
  }
  async function refresh() {
    const d = await api('GET', '/screenings/' + id); override = d.override; matching = d.matching; proposal = d.proposal; data.s = d.screening; st = stepState(matching, proposal); drawBar(); drawNav();
  }
  const ctx = { go, refresh, advanceTo: async (n) => { await refresh(); active = null; go(n); } };

  function drawBar() {
    bar.replaceChildren(...STEPS.map(([key, label], i) => {
      const state = i === cur ? 'current' : st.done[i] ? 'done' : st.unlocked[i] ? 'open' : 'locked';
      const b = h('button', { type: 'button', class: 'stp ' + state, disabled: !st.unlocked[i], 'aria-current': i === cur ? 'step' : null, title: st.unlocked[i] ? label : 'Finish the earlier steps first', onclick: () => go(i) },
        h('span', { class: 'dot' }, st.done[i] && i !== cur ? icon('check') : String(i + 1)), h('span', { class: 'lab' }, label));
      return h('li', {}, b);
    }));
  }

  function screeningStep() {
    const out = [postingCard(data.s, true), h('div', { style: 'height:16px' })];
    const blocks = s.report.jobs.map((j) => jobReportView(j, s.report.jobs.length > 1));
    blocks.forEach((b, i) => out.push(b, i < blocks.length - 1 ? h('hr', { style: 'border:0;border-top:1px solid var(--line);margin:28px 0' }) : null));
    out.push(h('div', { style: 'height:16px' }));
    if (override) out.push(h('div', { class: 'card logged' }, h('div', { class: 'ico' }, icon('check')), h('div', {}, h('strong', {}, 'Continued despite the ' + override.verdict_at_time), h('blockquote', {}, override.reason), h('div', { class: 'small muted' }, `${override.user_name} · ${full(override.created_at)}`))));
    else if (matching && matching.continued) out.push(h('div', { class: 'card logged' }, h('div', { class: 'ico' }, icon('check')), h('div', {}, h('strong', {}, 'Continued'), h('div', { class: 'small muted' }, 'This job passed the SOP gate and was taken forward.'))));
    else if ((s.verdict === 'FAIL' || s.verdict === 'FLAG') && owner) out.push(overrideCard(s));
    else if (s.verdict === 'FAIL' || s.verdict === 'FLAG') out.push(h('div', { class: 'notice' }, icon('info'), 'No decision recorded yet. Only the person who submitted this job can continue with it.'));
    else if (s.verdict === 'PASS') out.push(continueCard(s));
    return h('div', {}, out);
  }
  function trackingStep() {
    const holder = h('div', {});
    const canEdit = s.user_id === me.id || me.role === 'admin' || me.role === 'manager';
    // once tracking is saved the journey is over: show the summary, and the form only when asked
    const draw = (editing) => holder.replaceChildren(
      editing ? trackingCard(s, (saved) => { Object.assign(s, saved, { tracking_updated_at: new Date().toISOString() }); draw(false); window.scrollTo({ top: 0 }); })
        : completePanel(s, matching, proposal, canEdit ? () => draw(true) : null),
      h('div', { style: 'height:16px' }), recordDetails(s, override, matching, proposal));
    draw(!s.tracking_updated_at);
    return holder;
  }
  function drawContent() {
    active = null;
    const builders = [screeningStep, () => (matching && matching.continued ? matchingSection(s, matching) : h('div', {})), () => profileSection(s, matching), () => proposalSection(s, proposal, matching), trackingStep];
    const el = builders[cur]();
    content.replaceChildren(el); active = el;
  }
  function drawNav() {
    const prev = h('button', { class: 'btn', type: 'button', disabled: cur === 0, onclick: () => go(cur - 1) }, icon('back'), cur > 0 ? STEPS[cur - 1][1] : 'Previous');
    let next;
    if (cur === 3 && owner && !(proposal && proposal.finalized_at)) {
      next = h('button', { class: 'btn primary', type: 'button', disabled: !(proposal && proposal.status === 'done'), title: 'Finish the proposal and open the tracking step' }, 'Done: go to tracking');
      next.onclick = async () => {
        if (!active || !active.__finish) return;
        btnBusy(next, 'Finishing');
        try { const ok = await active.__finish(); if (ok) { await refresh(); go(4); } else { next.disabled = false; next.replaceChildren('Done: go to tracking'); } }
        catch (x) { toast(x.message, true); next.disabled = false; next.replaceChildren('Done: go to tracking'); }
      };
    } else if (cur < STEPS.length - 1) {
      next = h('button', { class: 'btn primary', type: 'button', disabled: !st.unlocked[cur + 1], title: st.unlocked[cur + 1] ? '' : 'Finish this step first', onclick: () => go(cur + 1) }, STEPS[cur + 1][1], icon('arrow'));
    } else next = h('a', { class: 'btn', href: lastList.history }, 'Back to jobs');
    nav.replaceChildren(prev, h('span', { class: 'grow' }), h('span', { class: 'faint small' }, `Step ${cur + 1} of ${STEPS.length}`), next);
  }
  stepCtx = ctx;
  drawBar(); drawContent(); drawNav();
  return h('div', { class: 'stepper' }, bar, content, nav);
}

/** The job post as copied from Upwork, in fields: terms, description, skills, questions, activity, the client and their history. */
function postingCard(s, open = true) {
  const p = s.posting;
  const body = h('div', { class: 'card-pad posting' });
  const box = h('details', { class: 'card', open: open || null, style: 'margin-top:16px' },
    h('summary', { class: 'card-head', style: 'cursor:pointer;list-style:none' }, h('h2', {}, 'Job posting'), h('span', { class: 'sub' }, 'Everything copied from Upwork')), body);
  const raw = s.job_description ? h('details', { class: 'desc' }, h('summary', {}, 'The full pasted text'), h('pre', {}, s.job_description)) : null;
  const grid = (rows) => (rows && rows.length ? h('dl', { class: 'terms' }, rows.filter((r) => r.value).map((r) => h('div', {}, h('dt', {}, r.label), h('dd', {}, r.value)))) : null);
  if (!p) {
    const busy = s.posting_status === 'queued' || s.posting_status === 'running';
    const go = h('button', { class: 'btn primary', type: 'button' }, s.posting_status === 'error' ? 'Try again' : 'Extract the posting');
    // refresh only this card, never the page: the workflow may hold unsaved text
    const refresh = async () => { if (!box.isConnected) return; try { const d = await api('GET', '/screenings/' + s.id); box.replaceWith(postingCard(d.screening, box.open)); } catch { /* try again on the next visit */ } };
    go.onclick = async () => { btnBusy(go, 'Starting'); try { await api('POST', `/screenings/${s.id}/posting`, {}); toast('Reading the job post...'); setTimeout(refresh, 2500); } catch (x) { toast(x.message, true); go.disabled = false; } };
    if (busy) setTimeout(refresh, 4000);
    body.replaceChildren(busy ? h('div', { class: 'row muted' }, h('span', { class: 'spin' }), 'Reading the job post into fields...')
      : h('div', {}, h('p', { class: 'muted', style: 'margin-top:0' }, s.posting_status === 'error' ? (s.posting_error || 'The job post could not be read into fields.') : 'This job was pasted before the posting was read into fields.'), canTrack(s.user_id) ? go : null), raw);
    return box;
  }
  body.replaceChildren(...[ // replaceChildren does not unpack nested lists, so flatten them first
    h('div', { style: 'margin-bottom:6px' }, h('strong', { style: 'font-size:17px' }, p.title || s.title || ''), h('div', { class: 'small muted' }, [p.posted, p.location].filter(Boolean).join(' · '))),
    grid(p.terms),
    p.skills.length ? [h('h3', {}, 'Skills'), h('div', { class: 'chips' }, p.skills.map((x) => h('span', { class: 'chip' }, x)))] : null,
    [h('h3', {}, 'Description'), h('div', { class: 'desc-text' }, p.description || 'not shown')],
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
  if (!proposal || proposal.status === 'queued' || proposal.status === 'running') return 'writing';
  if (!proposal.finalized_at) return 'review';
  return 'ready';
}

/** The job, read-only and all on one page. Edit opens the step-by-step workflow. */
async function jobView(id) {
  const { screening: s, override, matching, proposal } = await api('GET', '/screenings/' + id);
  if (s.status !== 'done' || !s.report) return detailView(id); // still screening, or failed: the workflow page shows progress and retry
  stepCtx = null;
  const stage = stageOf(s, matching, proposal);
  const canEdit = s.user_id === me.id || me.role === 'admin' || me.role === 'manager';
  const waiting = NEEDS_ACTION_STAGES.includes(stage) && s.user_id === me.id;
  const stepNo = { decide: 1, projects: 2, profile: 3, review: 4 }[stage];
  // the next thing to do is the main button; ready to send opens the status dialog with Sent, everything else the workflow step
  const editBtn = !canEdit ? null : waiting && stage === 'ready' ? h('button', { class: 'btn primary', type: 'button', onclick: () => statusDialog(id, () => route()) }, 'Mark as sent')
    : h('a', { class: waiting ? 'btn primary' : 'btn', href: `#/s/${id}/work${stepNo ? '?step=' + stepNo : ''}` }, waiting ? NEXT_ACTION[stage] : 'Edit');
  const canStatus = canEdit && ['submitted', 'closed'].includes(stage);
  const title = s.title || 'Pasted job text';
  const chosen = matching && matching.confirmed_at ? matching.matches.filter((x) => x.selected) : [];
  const toProposal = proposal && proposal.finished_at ? Math.round((toDate(proposal.finished_at) - toDate(s.created_at)) / 1000) : null;
  const yn2 = (v) => (v === 'yes' ? 'Yes' : v === 'no' ? 'No' : null);
  const facts = [
    ['Result', h('span', {}, verdictPill(s.verdict, s.status), s.rule_codes ? h('span', { class: 'mono small muted' }, '  ' + s.rule_codes) : null)],
    ['Where it stands', progressDots(stage)],
    ['Decision', override ? `Continued past the ${override.verdict_at_time} by ${override.user_name}` : matching && matching.continued ? 'Continued' : s.proceeded === 'no' ? 'Skipped' : null],
    ['Projects', chosen.length ? chosen.map((x) => x.project_name).join(', ') : null],
    ['Profile', matching && matching.proposal_profile ? matching.proposal_profile.name : null],
    ['Template', proposal && proposal.template ? proposal.template.name : null],
    ['Proposal', proposal ? (proposal.finalized_at ? 'Finished ' + ago(proposal.finalized_at) : proposal.status === 'done' ? 'Written, not finished' : proposal.status) : null],
    ['Paste to proposal', toProposal != null ? mins(toProposal) : null],
    ['Client', s.client_country], ['Budget', s.budget], ['Hire rate', s.hire_rate], ['Avg hourly paid', s.avg_hourly_paid],
    ['Proposal sent', s.proposal_sent_date ? String(s.proposal_sent_date).slice(0, 10) : null],
    ['Connects', s.connects_spent != null ? `${s.connects_spent}${s.boost_connects ? ' + ' + s.boost_connects + ' boost' : ''}` : null],
    ['Viewed / chat / interview', [yn2(s.client_viewed), yn2(s.client_replied), yn2(s.interviewed)].some(Boolean) ? [yn2(s.client_viewed), yn2(s.client_replied), yn2(s.interviewed)].map((v) => v || '-').join(' / ') : null],
    ['Outcome', s.outcome],
    ['Why lost', s.outcome_reason ? s.outcome_reason + (s.outcome_note ? ': ' + s.outcome_note : '') : null],
    ['Status', s.client_viewed_at || s.proposal_sent_at || s.outcome_at ? h('span', {}, h('span', { class: 'chip brand' }, s.outcome || (s.interviewed === 'yes' ? 'Interview' : s.client_replied === 'yes' ? 'Chat opened' : s.client_viewed === 'yes' ? 'Viewed' : 'Sent'))) : null],
  ];
  const section = (titleTxt, sub, content, extra) => h('div', { class: 'card', style: 'margin-top:16px' }, h('div', { class: 'card-head' }, h('h2', {}, titleTxt), extra || (sub ? h('span', { class: 'sub' }, sub) : null)), content);

  const text = proposal && proposal.current ? htmlToPlainText(proposal.current.html) : null;
  const copyBtn = text ? h('button', { class: 'btn sm', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(text); toast('Proposal copied'); } catch { toast('Could not copy', true); } } }, 'Copy') : null;
  const projectList = matching && matching.matches && matching.matches.length ? h('div', { class: 'card-pad' }, h('ul', { class: 'plist' }, matching.matches.map((m) => h('li', { class: m.selected ? 'on' : '' },
    h('div', { class: 'row', style: 'gap:8px' }, m.selected ? h('span', { class: 'chip brand' }, 'Chosen') : m.recommended ? h('span', { class: 'chip' }, 'Recommended') : null,
      m.project_id ? h('a', { href: '#/p/' + m.project_id }, h('strong', {}, m.project_name)) : h('strong', {}, m.project_name), h('span', { class: 'small muted' }, `${m.score} of ${m.max_score}`)),
    h('div', { class: 'chips' }, m.shared.map((t) => h('span', { class: 'chip' }, t.name)))))),
    matching.tags && matching.tags.length ? h('details', { class: 'desc' }, h('summary', {}, `Job tags (${matching.tags.length}) and why`), h('ul', { class: 'plain' }, matching.tags.map((t) => h('li', {}, h('strong', {}, t.name), h('span', { class: 'muted' }, ' · ' + t.category + ': ' + (t.reason || '')))))) : null) : null;

  const parts = [
    h('div', { style: 'margin-bottom:14px' }, h('a', { href: lastList.history, class: 'row small', style: 'gap:6px;display:inline-flex' }, icon('back'), 'Back to jobs')),
    pageHead(title, null, h('div', { class: 'row', style: 'gap:8px' }, canStatus ? h('button', { class: 'btn primary', type: 'button', onclick: () => statusDialog(id, () => route()) }, 'Update status') : null,
    waiting && stage === 'ready' ? h('a', { class: 'btn', href: `#/s/${id}/work` }, 'Edit') : null, editBtn)),
    h('div', { class: 'row', style: 'gap:8px;margin:-6px 0 16px' }, h('span', { class: 'chip' }, s.user_name), h('span', { class: 'chip', title: full(s.created_at) }, full(s.created_at)),
      s.skill_version ? h('span', { class: 'chip' }, 'Gate v' + s.skill_version) : null, s.source_url ? h('a', { class: 'chip', href: s.source_url, target: '_blank', rel: 'noopener noreferrer' }, icon('link'), 'Upwork post') : null),
    h('div', { class: 'card card-pad' }, h('dl', { class: 'kv cols4' }, facts.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', { class: v ? '' : 'ns' }, v || 'not yet'))))),
    postingCard(s, true),
    override ? section('Why it was continued', null, h('div', { class: 'card-pad' }, h('blockquote', { style: 'margin:0' }, override.reason), h('div', { class: 'small muted', style: 'margin-top:6px' }, `${override.user_name} · ${full(override.created_at)}`))) : null,
    text ? section('Proposal', null, h('div', { class: 'card-pad' }, h('pre', { class: 'proposal-text' }, text),
      proposal.warnings && proposal.warnings.length ? h('details', { class: 'desc' }, h('summary', {}, `Warnings to check (${proposal.warnings.length})`), h('ul', { class: 'plain' }, proposal.warnings.map((w) => h('li', {}, w.text)))) : null),
      h('div', { class: 'row', style: 'gap:8px;margin-left:auto' }, proposal.current ? h('span', { class: 'sub' }, `Version ${proposal.current.version_no}`) : null, copyBtn)) : null,
    projectList ? section('Projects', 'Shown to the person, with the ones chosen', projectList) : null,
    section('Screening report', `Gate v${s.skill_version || '-'}`, h('div', { class: 'card-pad' }, s.report.jobs.map((j) => jobReportView(j, s.report.jobs.length > 1)))),
    h('div', { style: 'height:16px' }), recordDetails(s, override, matching, proposal),
  ];
  const tl = timelineCard(id); parts.push(tl);
  shell('history', parts, 1180);
  tl.open = true; tl.dispatchEvent(new Event('toggle'));
}

async function detailView(id) {
  const { screening: s, override, matching, proposal } = await api('GET', '/screenings/' + id);
  stepCtx = null;
  const title = s.title || (s.input_type === 'link' ? 'Upwork link' : 'Pasted job text');
  const meta = h('div', { class: 'row', style: 'gap:8px;margin-top:10px' },
    h('span', { class: 'chip' }, s.user_name), h('span', { class: 'chip', title: full(s.created_at) }, ago(s.created_at)),
    s.profile_name ? h('span', { class: 'chip' }, icon('badge'), s.profile_name) : null,
    s.skill_version ? h('span', { class: 'chip' }, 'Gate v' + s.skill_version) : null,
    s.rule_codes ? h('span', { class: 'chip mono', title: 'Rule codes' }, s.rule_codes) : null,
    s.provider === 'mock' ? h('span', { class: 'chip' }, 'Mock model') : null);
  const parts = [h('div', { class: 'row small', style: 'margin-bottom:14px;gap:16px' }, h('a', { href: lastList.history, class: 'row', style: 'gap:6px;display:inline-flex' }, icon('back'), 'Back to jobs'),
    s.status === 'done' ? h('a', { href: '#/s/' + id }, 'View details') : null)];
  const head = (v) => pageHead(title, null, v);

  if (s.status === 'queued' || s.status === 'running') {
    parts.push(head(), meta, h('div', { style: 'height:18px' }), progressCard(s.status), postingCard(s, true));
    setTimeout(() => { if (location.hash.startsWith('#/s/' + id)) route(); }, 2500);
  } else if (s.status === 'error') {
    const retry = h('button', { class: 'btn primary', onclick: async (e) => { btnBusy(e.currentTarget, 'Retrying'); try { await api('POST', `/screenings/${id}/retry`, {}); route(); } catch (x) { toast(x.message, true); } } }, 'Try again');
    parts.push(head(), meta, h('div', { style: 'height:18px' }), h('div', { class: 'card' }, emptyState('x', 'Screening did not finish', s.error_message || 'Something went wrong.',
      s.user_id === me.id ? h('div', { class: 'row', style: 'justify-content:center' }, retry, h('a', { class: 'btn', href: '#/new' }, 'Paste the text instead')) : null)));
  } else if (s.report) {
    parts.push(head(), meta, h('div', { style: 'height:18px' }), stepperView({ s, id, override, matching, proposal }), timelineCard(id));
  }
  shell('history', parts);
}

// ---------- industries ----------
function industryEditor(ind, projects, after) {
  const picked = new Set(ind ? ind.projects.map((p) => p.id) : []);
  const f = { name: h('input', { type: 'text', id: 'in', maxlength: 120, value: ind ? ind.name : '' }), desc: h('input', { type: 'text', id: 'id', maxlength: 500, value: ind && ind.description ? ind.description : '' }),
    active: h('input', { type: 'checkbox', id: 'ia', checked: ind ? !!Number(ind.active) : true }) };
  modal({ title: ind ? 'Edit industry' : 'Add an industry', confirm: ind ? 'Save industry' : 'Add industry', wide: true,
    body: h('div', {}, h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'in' }, 'Industry name'), f.name),
      h('div', { class: 'field row', style: 'align-self:end;padding-bottom:8px' }, f.active, h('label', { for: 'ia', style: 'font-weight:600' }, 'Active'))),
      h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'id' }, 'Description (optional)'), f.desc),
      h('div', { style: 'margin-top:16px' }, multiPick('Projects in this industry', projects, picked, 'Find a project'))),
    extra: ind ? () => h('button', { class: 'btn danger', type: 'button', onclick: () => modal({ title: 'Delete ' + ind.name + '?', confirm: 'Delete industry', danger: true,
      body: h('p', { class: 'muted' }, 'This removes the industry and unlinks it from its projects. The projects stay. It cannot be undone.'),
      onConfirm: async () => { await api('DELETE', '/industries/' + ind.id); document.querySelectorAll('dialog').forEach((d) => d.close()); toast('Industry deleted'); after(null); } }) }, 'Delete') : null,
    onConfirm: async () => {
      const r = await api(ind ? 'PATCH' : 'POST', ind ? '/industries/' + ind.id : '/industries', { name: f.name.value, description: f.desc.value.trim() || null, active: f.active.checked, project_ids: [...picked] });
      toast(ind ? 'Industry saved' : 'Industry added'); after(r.id);
    } });
}

async function industriesView() {
  const [{ industries }, { projects }] = await Promise.all([api('GET', '/industries'), api('GET', '/projects')]);
  const canEdit = canEditProjects();
  const hp = hashParams(); const st = { q: hp.q || '', page: Math.max(1, Number(hp.page) || 1) };
  const bodyEl = h('div', {});
  const searchIn = h('input', { type: 'search', placeholder: 'Search industries or projects', 'aria-label': 'Search industries', value: st.q });
  const sync = () => { setHashParams({ page: st.page, q: st.q }); lastList.industries = location.hash; };
  searchIn.oninput = debounce(() => { st.q = searchIn.value.trim(); st.page = 1; draw(); }, 200);
  const open = (i) => () => { sync(); location.hash = '#/i/' + i.id; };
  function draw() {
    const q = st.q.toLowerCase();
    const shown = industries.filter((i) => !q || (i.name + ' ' + (i.description || '') + ' ' + i.projects.map((p) => p.name).join(' ')).toLowerCase().includes(q));
    st.page = Math.min(st.page, Math.max(1, Math.ceil(shown.length / PAGE_SIZE))); sync();
    const slice = shown.slice((st.page - 1) * PAGE_SIZE, st.page * PAGE_SIZE);
    const table = !shown.length ? emptyState('building', industries.length ? 'No matches' : 'No industries yet', industries.length ? 'Try a different search.' : 'Add the industries Stackup has worked in.')
      : h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Industry', 'Projects', 'Status', canEdit ? '' : null].map((t) => (t === null ? null : h('th', {}, t))))),
        h('tbody', {}, slice.map((i) => h('tr', { class: 'click', tabindex: 0, onclick: open(i), onkeydown: (e) => { if (e.key === 'Enter') open(i)(); } },
          h('td', {}, h('strong', {}, i.name), i.description ? h('div', { class: 'meta' }, i.description.slice(0, 90)) : null),
          h('td', {}, i.projects.length ? h('div', { class: 'chips' }, i.projects.slice(0, 3).map((p) => h('span', { class: 'chip' }, p.name)),
            i.projects.length > 3 ? h('a', { class: 'chip brand', href: '#/i/' + i.id, title: 'Show all ' + i.projects.length + ' projects', onclick: (e) => { e.stopPropagation(); sync(); } }, '+' + (i.projects.length - 3)) : null) : h('span', { class: 'faint small' }, 'No projects yet')),
          h('td', {}, Number(i.active) ? h('span', { class: 'pill PASS' }, 'Active') : h('span', { class: 'pill wait' }, 'Inactive')),
          canEdit ? h('td', {}, h('button', { class: 'btn sm', onclick: (e) => { e.stopPropagation(); industryEditor(i, projects, () => route()); } }, 'Edit')) : null)))));
    bodyEl.replaceChildren(table, pager(shown.length, st.page, (n) => { st.page = n; draw(); }));
  }
  shell('industries', [pageHead('Industries', 'The industries Stackup has worked in. A project can belong to several industries, and an industry can have several projects.',
    canEdit ? h('button', { class: 'btn primary', onclick: () => industryEditor(null, projects, () => route()) }, icon('screen'), 'Add industry') : null),
    h('div', { class: 'card' }, h('div', { class: 'toolbar' }, h('div', { class: 'search' }, icon('search'), searchIn)), bodyEl)]);
  draw();
}

async function industryDetailView(id) {
  const [{ industry: i }, { projects }] = await Promise.all([api('GET', '/industries/' + id), api('GET', '/projects')]);
  const canEdit = canEditProjects();
  shell('industries', [
    h('div', { style: 'margin-bottom:14px' }, h('a', { href: lastList.industries, class: 'row small', style: 'gap:6px;display:inline-flex' }, icon('back'), 'Back to industries')),
    pageHead(i.name, `${i.projects.length} project${i.projects.length === 1 ? '' : 's'}`,
      [Number(i.active) ? h('span', { class: 'pill PASS' }, 'Active') : h('span', { class: 'pill wait' }, 'Inactive'),
        canEdit ? h('button', { class: 'btn primary', onclick: () => industryEditor(i, projects, (nid) => (nid ? route() : (location.hash = lastList.industries))) }, 'Edit industry') : null]),
    i.description ? h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'About'), h('p', {}, i.description)) : null,
    i.description ? h('div', { style: 'height:16px' }) : null,
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, `Projects (${i.projects.length})`),
      i.projects.length ? h('div', { class: 'chips' }, i.projects.map((p) => h('a', { class: 'chip brand', href: '#/p/' + p.id }, p.name))) : emptyState('folder', 'No projects yet', canEdit ? 'Edit the industry to add projects.' : 'No projects are linked to this industry yet.')),
  ]);
}

// ---------- tag dictionary (admin) ----------
async function dictionaryView() {
  const { categories } = await api('GET', '/tags');
  const hp = hashParams();
  const st = { tab: hp.tab === 'categories' ? 'categories' : 'tags', q: hp.q || '', cat: hp.cat || '', status: hp.st || '', page: Math.max(1, Number(hp.page) || 1) };
  const all = categories.flatMap((c) => c.tags.map((t) => ({ ...t, category: c.name })));
  const bodyEl = h('div', {});
  const tabsEl = h('div', { class: 'tabs', role: 'tablist' });
  const actionsEl = h('div', {});
  const sync = () => setHashParams({ tab: st.tab === 'tags' ? '' : st.tab, page: st.page, q: st.q, cat: st.cat, st: st.status });

  function tagDialog(t) {
    const f = { name: h('input', { type: 'text', id: 'tn1', maxlength: 120, value: t ? t.name : '' }),
      cat: h('select', { id: 'tc1', style: 'width:100%' }, categories.map((c) => h('option', { value: c.id, selected: t ? c.id === t.category_id : c.id === (Number(st.cat) || categories[0].id) }, c.name))),
      score: h('input', { type: 'number', id: 'ts1', min: 0, max: 10, step: 1, value: t ? t.weight : 1 }), desc: h('input', { type: 'text', id: 'td1', maxlength: 500, value: t && t.description ? t.description : '' }),
      active: h('input', { type: 'checkbox', id: 'ta1', checked: t ? !!Number(t.active) : true }) };
    modal({ title: t ? 'Edit tag' : 'Add a tag', confirm: t ? 'Save tag' : 'Add tag', wide: true,
      body: h('div', {}, h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tn1' }, 'Tag name'), f.name), h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tc1' }, 'Category'), f.cat)),
        h('div', { class: 'grid2', style: 'margin-top:16px' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'ts1' }, 'Score (match weight, 0 to 10)'), f.score,
          h('div', { class: 'hint' }, 'What a shared tag is worth when jobs are matched to projects. 0 means the tag is ignored.')),
          h('div', { class: 'field row', style: 'align-self:start;padding-top:28px' }, f.active, h('label', { for: 'ta1', style: 'font-weight:600' }, 'Active (used for tagging jobs)'))),
        h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'td1' }, 'What it means (shown to the model when it tags jobs)'), f.desc)),
      extra: t ? () => h('button', { class: 'btn danger', type: 'button', onclick: () => modal({ title: 'Delete ' + t.name + '?', confirm: 'Delete tag', danger: true,
        body: h('p', { class: 'muted' }, t.project_count ? `${t.project_count} project${t.project_count === 1 ? ' uses' : 's use'} this tag, so it cannot be deleted. Remove it from them, or disable it instead.` : 'This removes the tag. Past job results keep its name. It cannot be undone.'),
        onConfirm: async () => { await api('DELETE', '/admin/tags/' + t.id); document.querySelectorAll('dialog').forEach((d) => d.close()); toast('Tag deleted'); route(); } }) }, 'Delete') : null,
      onConfirm: async () => {
        const body = { category_id: Number(f.cat.value), name: f.name.value, weight: Number(f.score.value), description: f.desc.value.trim() || null, active: f.active.checked };
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

  function drawTags() {
    const q = st.q.toLowerCase();
    const shown = all.filter((t) => (!q || (t.name + ' ' + (t.description || '')).toLowerCase().includes(q)) && (!st.cat || String(t.category_id) === st.cat) && (st.status === '' || String(Number(t.active)) === st.status));
    st.page = Math.min(st.page, Math.max(1, Math.ceil(shown.length / PAGE_SIZE))); sync();
    const slice = shown.slice((st.page - 1) * PAGE_SIZE, st.page * PAGE_SIZE);
    const searchIn = h('input', { type: 'search', placeholder: 'Search tags', 'aria-label': 'Search tags', value: st.q });
    const catSel = h('select', { 'aria-label': 'Filter by category' }, h('option', { value: '' }, 'Any category'), categories.map((c) => h('option', { value: c.id, selected: String(c.id) === st.cat }, c.name)));
    const stSel = h('select', { 'aria-label': 'Filter by status' }, [['', 'Any status'], ['1', 'Active'], ['0', 'Disabled']].map(([v, l]) => h('option', { value: v, selected: v === st.status }, l)));
    searchIn.oninput = debounce(() => { st.q = searchIn.value.trim(); st.page = 1; drawTags(); searchIn.focus(); }, 250);
    catSel.onchange = () => { st.cat = catSel.value; st.page = 1; drawTags(); }; stSel.onchange = () => { st.status = stSel.value; st.page = 1; drawTags(); };
    const table = !shown.length ? emptyState('tag', 'No tags match', 'Try a different search or filter.')
      : h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Tag', 'Category', 'Score', 'Projects', 'Status', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, slice.map((t) => {
          const inp = h('input', { type: 'number', class: 'scoreinp', min: 0, max: 10, step: 1, value: t.weight, 'aria-label': 'Score for ' + t.name });
          inp.onchange = () => saveScore(t, inp);
          return h('tr', {}, h('td', {}, h('strong', {}, t.name), t.description ? h('div', { class: 'meta' }, t.description.slice(0, 100)) : null), h('td', { class: 'muted' }, t.category), h('td', {}, inp),
            h('td', { class: 'muted' }, t.project_count), h('td', {}, Number(t.active) ? h('span', { class: 'pill PASS' }, 'Active') : h('span', { class: 'pill wait' }, 'Disabled')),
            h('td', {}, h('div', { class: 'row', style: 'justify-content:flex-end;flex-wrap:nowrap' }, h('button', { class: 'btn sm', onclick: () => tagDialog(t) }, 'Edit'),
              h('button', { class: 'btn sm', onclick: async () => { try { await api('PATCH', '/admin/tags/' + t.id, { active: !Number(t.active) }); toast(Number(t.active) ? 'Tag disabled' : 'Tag enabled'); } catch (x) { toast(x.message, true); } route(); } }, Number(t.active) ? 'Disable' : 'Enable'))));
        }))));
    bodyEl.replaceChildren(h('div', { class: 'toolbar' }, h('div', { class: 'search' }, icon('search'), searchIn), catSel, stSel), table, pager(shown.length, st.page, (n) => { st.page = n; drawTags(); }));
  }
  function drawCategories() {
    sync();
    const row = (c) => h('tr', {},
      h('td', { class: 'muted' }, c.sort_order),
      h('td', {}, h('strong', {}, c.name), c.is_compliance ? h('span', { class: 'chip', style: 'margin-left:8px' }, 'Compliance') : null),
      h('td', { class: 'muted' }, `${c.tags.length} (${c.tags.filter((t) => Number(t.active)).length} active)`),
      h('td', {}, h('div', { class: 'row', style: 'justify-content:flex-end' }, h('button', { class: 'btn sm', onclick: () => categoryDialog(c) }, 'Edit'))));
    const table = clientPaged(categories, (slice) => h('div', { class: 'tablewrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Order', 'Category', 'Tags', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, slice.map(row)))));
    bodyEl.replaceChildren(table);
  }
  function drawTabs() {
    tabsEl.replaceChildren(...[['tags', `Tags (${all.length})`], ['categories', `Categories (${categories.length})`]].map(([k, l]) =>
      h('button', { class: 'tab' + (st.tab === k ? ' on' : ''), role: 'tab', 'aria-selected': st.tab === k ? 'true' : 'false', onclick: () => { st.tab = k; st.page = 1; drawAll(); } }, l)));
    actionsEl.replaceChildren(st.tab === 'tags' ? h('button', { class: 'btn primary', onclick: () => tagDialog(null) }, icon('screen'), 'Add tag') : h('button', { class: 'btn primary', onclick: () => categoryDialog(null) }, icon('screen'), 'Add category'));
  }
  function drawAll() { drawTabs(); if (st.tab === 'tags') drawTags(); else drawCategories(); }
  shell('dictionary', [pageHead('Tag dictionary', 'The tags jobs and projects are described with. The score is what a shared tag is worth when a job is matched to projects.', actionsEl), tabsEl, h('div', { class: 'card' }, bodyEl)], true);
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
  function form(p) {
    const f = { name: h('input', { type: 'text', id: 'pn', value: p ? p.name : '', maxlength: 120 }),
      tagline: h('input', { type: 'text', id: 'ptl', value: p && p.tagline ? p.tagline : '', maxlength: 200, placeholder: 'For example: AI automation and voice agents for service businesses' }),
      price: h('input', { type: 'number', id: 'ppr', min: 0, max: 100000, step: '0.01', value: p && p.price !== null && p.price !== undefined ? Number(p.price) : '', placeholder: 'For example: 45' }),
      gitlab: h('input', { type: 'text', id: 'pgl', value: p && p.gitlab_account ? p.gitlab_account : '', maxlength: 255, placeholder: 'username or https://gitlab.com/username' }),
      url: h('input', { type: 'text', id: 'pu', value: p && p.profile_url ? p.profile_url : '', placeholder: 'https://www.upwork.com/freelancers/...' }),
      notes: h('input', { type: 'text', id: 'pt', value: p && p.notes ? p.notes : '', maxlength: 500, placeholder: 'For example: main freelancer profile' }) };
    return { f, body: h('div', {},
      h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'pn' }, 'Profile name'), f.name),
      h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'ptl' }, 'Tagline (optional)'), f.tagline, h('div', { class: 'hint' }, 'The headline shown on the Upwork profile.')),
      h('div', { class: 'grid2', style: 'margin-top:16px' },
        h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'ppr' }, 'Price (optional)'), f.price, h('div', { class: 'hint' }, 'The hourly rate this profile quotes.')),
        h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'pgl' }, 'GitLab account (optional)'), f.gitlab, h('div', { class: 'hint' }, 'A username or the full link.'))),
      h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'pu' }, 'Upwork profile link (optional)'), f.url),
      h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'pt' }, 'Notes (optional)'), f.notes)) };
  }
  const values = (f) => ({ name: f.name.value, tagline: f.tagline.value.trim() || null, price: f.price.value === '' ? null : Number(f.price.value), gitlab_account: f.gitlab.value.trim() || null, profile_url: f.url.value.trim() || null, notes: f.notes.value.trim() || null });
  function add() { const { f, body } = form(null); modal({ title: 'Add an Upwork profile', confirm: 'Add profile', body, wide: true, onConfirm: async () => { await api('POST', '/profiles', values(f)); toast('Profile added'); route(); } }); }
  function edit(p) { const { f, body } = form(p); modal({ title: 'Edit ' + p.name, confirm: 'Save changes', body, wide: true, onConfirm: async () => { await api('PATCH', '/profiles/' + p.id, values(f)); toast('Profile updated'); route(); } }); }
  const toggle = async (p) => { try { await api('PATCH', '/profiles/' + p.id, { active: !Number(p.active) }); toast(Number(p.active) ? 'Profile disabled' : 'Profile enabled'); } catch (x) { toast(x.message, true); } route(); };
  const remove = (p) => modal({ title: 'Delete ' + p.name + '?', confirm: 'Delete profile', danger: true,
    body: h('p', { class: 'muted' }, 'A profile that already has screenings cannot be deleted. Disable it instead and it disappears from the screening form.'),
    onConfirm: async () => { await api('DELETE', '/profiles/' + p.id); toast('Profile deleted'); route(); } });
  const row = (p) => h('tr', {},
    h('td', {}, h('strong', {}, p.name), p.notes ? h('div', { class: 'meta' }, p.notes.slice(0, 80)) : null, p.profile_url ? h('div', { class: 'small' }, h('a', { href: p.profile_url, target: '_blank', rel: 'noopener noreferrer' }, 'Open on Upwork')) : null),
    h('td', {}, p.tagline ? h('span', {}, p.tagline) : h('span', { class: 'faint' }, '-')),
    h('td', {}, p.price !== null && p.price !== undefined ? h('strong', {}, money(p.price)) : h('span', { class: 'faint' }, '-')),
    h('td', {}, (() => { const g = gitlabLink(p.gitlab_account); return g ? h('a', { href: g.href, target: '_blank', rel: 'noopener noreferrer' }, g.label) : h('span', { class: 'faint' }, '-'); })()),
    h('td', {}, Number(p.active) ? h('span', { class: 'pill PASS' }, 'Active') : h('span', { class: 'pill wait' }, 'Disabled')),
    h('td', {}, h('div', { class: 'row', style: 'justify-content:flex-end;flex-wrap:nowrap' },
      h('button', { class: 'btn sm', onclick: () => edit(p) }, 'Edit'),
      h('button', { class: 'btn sm', onclick: () => toggle(p) }, Number(p.active) ? 'Disable' : 'Enable'),
      h('button', { class: 'btn sm danger', onclick: () => remove(p) }, 'Delete'))));
  const table = clientPaged(profiles, (slice) => h('div', { class: 'tablewrap' }, h('table', {},
    h('thead', {}, h('tr', {}, ['Profile', 'Tagline', 'Price', 'GitLab', 'Status', ''].map((t) => h('th', {}, t)))),
    h('tbody', {}, slice.map(row)))));
  shell('profiles', [
    pageHead('Upwork profiles', 'The profiles your team applies from. Every screening is recorded against one.', h('button', { class: 'btn primary', onclick: add }, icon('screen'), 'Add profile')),
    h('div', { class: 'card' }, profiles.length ? table : emptyState('badge', 'No profiles yet', 'Add the Upwork profiles your team applies from.', h('button', { class: 'btn primary', onclick: add }, 'Add profile'))),
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
    }));
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
  modal({ title: p ? 'Edit project' : 'Add a project', confirm: p ? 'Save project' : 'Add project', wide: true,
    body: h('div', {}, h('datalist', { id: 'showlist' }, SHOWABLE.map((o) => h('option', { value: o }))),
      h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'jn' }, 'Project name'), f.name), h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'jl' }, 'Live link (optional)'), f.link)),
      h('div', { class: 'grid2', style: 'margin-top:16px' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'js' }, 'Showable publicly'), f.show),
        h('div', { class: 'field row', style: 'align-self:end;padding-bottom:8px' }, f.active, h('label', { for: 'ja', style: 'font-weight:600' }, 'Active (used for matching)'))),
      h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'jt' }, 'Notes (optional)'), f.notes),
      h('div', { style: 'margin-top:16px' }, multiPick('Industries', industries.filter((i) => Number(i.active) || pickedInd.has(i.id)), pickedInd, 'Find an industry')),
      h('div', { style: 'margin-top:16px' }, tagPicker(categories, selected))),
    extra: p ? () => h('button', { class: 'btn danger', type: 'button', onclick: () => modal({ title: 'Delete ' + p.name + '?', confirm: 'Delete project', danger: true,
      body: h('p', { class: 'muted' }, 'This removes the project and its tags. It cannot be undone. To keep it but stop using it, untick Active instead.'),
      onConfirm: async () => { await api('DELETE', '/projects/' + p.id); document.querySelectorAll('dialog').forEach((d) => d.close()); toast('Project deleted'); after(null); } }) }, 'Delete') : null,
    onConfirm: async () => {
      const body = { name: f.name.value, live_link: f.link.value.trim() || null, showable_publicly: f.show.value.trim() || null, notes: f.notes.value.trim() || null, active: f.active.checked, tag_ids: [...selected], industry_ids: [...pickedInd] };
      const r = await api(p ? 'PATCH' : 'POST', p ? '/projects/' + p.id : '/projects', body); toast(p ? 'Project saved' : 'Project added'); after(r.id);
    } });
}

async function projectsView() {
  const [{ projects }, { categories }, { industries }] = await Promise.all([api('GET', '/projects'), api('GET', '/tags'), api('GET', '/industries')]);
  const canEdit = canEditProjects();
  const hp = hashParams();
  const st = { q: hp.q || '', tag: hp.tag || '', status: hp.st || '', page: Math.max(1, Number(hp.page) || 1) };
  const bodyEl = h('div', {});
  const searchIn = h('input', { type: 'search', placeholder: 'Search projects or tags', 'aria-label': 'Search projects', value: st.q });
  const tagSel = h('select', { 'aria-label': 'Filter by tag' }, h('option', { value: '' }, 'Any tag'),
    categories.map((c) => h('optgroup', { label: c.name }, c.tags.filter((t) => Number(t.active)).map((t) => h('option', { value: t.id, selected: String(t.id) === st.tag }, t.name)))));
  const statSel = h('select', { 'aria-label': 'Filter by status' }, [['', 'Any status'], ['1', 'Active'], ['0', 'Inactive']].map(([v, l]) => h('option', { value: v, selected: v === st.status }, l)));
  const toolbar = h('div', { class: 'toolbar' }, h('div', { class: 'search' }, icon('search'), searchIn), tagSel, statSel);
  const sync = () => { setHashParams({ page: st.page, q: st.q, tag: st.tag, st: st.status }); lastList.projects = location.hash; };
  const reset = () => { st.page = 1; draw(); };
  searchIn.oninput = debounce(() => { st.q = searchIn.value.trim(); reset(); }, 200);
  tagSel.onchange = () => { st.tag = tagSel.value; reset(); };
  statSel.onchange = () => { st.status = statSel.value; reset(); };
  const afterEdit = () => route();
  const detail = (p) => () => { sync(); location.hash = '#/p/' + p.id; };

  function draw() {
    const q = st.q.toLowerCase();
    const shown = projects.filter((p) => (!q || (p.name + ' ' + p.tags.map((t) => t.name).join(' ') + ' ' + p.industries.map((i) => i.name).join(' ')).toLowerCase().includes(q)) &&
      (!st.tag || p.tags.some((t) => String(t.id) === st.tag)) && (st.status === '' || String(Number(p.active)) === st.status));
    st.page = Math.min(st.page, Math.max(1, Math.ceil(shown.length / PAGE_SIZE)));
    const slice = shown.slice((st.page - 1) * PAGE_SIZE, st.page * PAGE_SIZE);
    sync();
    const table = !shown.length ? emptyState('folder', projects.length ? 'No matches' : 'No projects yet', projects.length ? 'Try a different search or filter.' : 'Add the projects Stackup has delivered.')
      : h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Project', 'Industries', 'Tags', 'Status', canEdit ? '' : null].map((t) => (t === null ? null : h('th', {}, t))))),
        h('tbody', {}, slice.map((p) => h('tr', { class: 'click', tabindex: 0, onclick: detail(p), onkeydown: (e) => { if (e.key === 'Enter') detail(p)(); } },
          h('td', {}, h('strong', {}, p.name), p.live_link ? h('div', { class: 'meta' }, p.live_link.replace(/^https?:\/\//, '').slice(0, 50)) : null),
          h('td', {}, p.industries.length ? h('div', { class: 'chips' }, p.industries.slice(0, 2).map((i) => h('span', { class: 'chip' }, i.name)), p.industries.length > 2 ? h('span', { class: 'chip brand' }, '+' + (p.industries.length - 2)) : null) : h('span', { class: 'faint small' }, '-')),
          h('td', {}, p.tags.length ? h('div', { class: 'chips' }, p.tags.slice(0, 4).map((t) => h('span', { class: 'chip' }, t.name)),
            p.tags.length > 4 ? h('a', { class: 'chip brand', href: '#/p/' + p.id, title: 'Show all ' + p.tags.length + ' tags', onclick: (e) => { e.stopPropagation(); sync(); } }, '+' + (p.tags.length - 4)) : null) : h('span', { class: 'faint small' }, 'Not tagged yet')),
          h('td', {}, Number(p.active) ? h('span', { class: 'pill PASS' }, 'Active') : h('span', { class: 'pill wait' }, 'Inactive')),
          canEdit ? h('td', {}, h('button', { class: 'btn sm', onclick: (e) => { e.stopPropagation(); projectEditor(p, categories, afterEdit, industries); } }, 'Edit')) : null)))));
    bodyEl.replaceChildren(table, pager(shown.length, st.page, (n) => { st.page = n; draw(); }));
  }
  shell('projects', [pageHead('Projects', "Stackup's delivered work. Tags are how a new job is matched to the projects that prove the same kind of work.",
    canEdit ? h('button', { class: 'btn primary', onclick: () => projectEditor(null, categories, afterEdit, industries) }, icon('screen'), 'Add project') : null), h('div', { class: 'card' }, toolbar, bodyEl)], true);
  draw();
}

async function projectDetailView(id) {
  const [{ project: p }, { categories }, { industries }] = await Promise.all([api('GET', '/projects/' + id), api('GET', '/tags'), api('GET', '/industries')]);
  const canEdit = canEditProjects();
  const own = new Set(p.tags.map((t) => t.id));
  const groups = categories.map((c) => ({ name: c.name, tags: c.tags.filter((t) => own.has(t.id)) })).filter((g) => g.tags.length);
  const link = /^https?:\/\//i.test(p.live_link || '') ? h('a', { href: p.live_link, target: '_blank', rel: 'noopener noreferrer' }, p.live_link) : null;
  shell('projects', [
    h('div', { style: 'margin-bottom:14px' }, h('a', { href: lastList.projects, class: 'row small', style: 'gap:6px;display:inline-flex' }, icon('back'), 'Back to projects')),
    pageHead(p.name, `${p.tags.length} tag${p.tags.length === 1 ? '' : 's'} across ${groups.length} categor${groups.length === 1 ? 'y' : 'ies'}`,
      [Number(p.active) ? h('span', { class: 'pill PASS' }, 'Active') : h('span', { class: 'pill wait' }, 'Inactive'),
        canEdit ? h('button', { class: 'btn primary', onclick: () => projectEditor(p, categories, (nid) => (nid ? route() : (location.hash = lastList.projects)), industries) }, 'Edit project') : null]),
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'Details'), h('dl', { class: 'kv cols2' },
      h('div', {}, h('dt', {}, 'Live link'), h('dd', { class: link ? '' : 'ns' }, link || 'not recorded')),
      h('div', {}, h('dt', {}, 'Showable publicly'), h('dd', { class: p.showable_publicly ? '' : 'ns' }, p.showable_publicly || 'not recorded')),
      h('div', {}, h('dt', {}, 'Added'), h('dd', {}, full(p.created_at))), h('div', {}, h('dt', {}, 'Last updated'), h('dd', {}, full(p.updated_at))),
      p.notes ? h('div', { style: 'grid-column:1/-1' }, h('dt', {}, 'Notes'), h('dd', {}, p.notes)) : null)),
    h('div', { style: 'height:16px' }),
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, `Industries (${p.industries.length})`),
      p.industries.length ? h('div', { class: 'chips' }, p.industries.map((i) => h('a', { class: 'chip brand', href: '#/i/' + i.id }, i.name))) : h('p', { class: 'faint small' }, 'No industries yet.')),
    h('div', { style: 'height:16px' }),
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, `Tags (${p.tags.length})`),
      groups.length ? h('div', { style: 'display:grid;gap:18px' }, groups.map((g) => h('div', {}, h('div', { class: 'tc-title' }, g.name, h('span', { class: 'faint' }, ` (${g.tags.length})`)),
        h('div', { class: 'chips' }, g.tags.map((t) => h('span', { class: 'chip', title: t.description || '' }, t.name))))))
        : emptyState('tag', 'No tags yet', canEdit ? 'Edit the project to add tags.' : 'This project has not been tagged yet.')),
  ], true);
}

// ---------- users (admin) ----------
async function usersView() {
  const { users } = await api('GET', '/admin/users');
  const patch = async (id, body, msg) => { try { await api('PATCH', '/admin/users/' + id, body); toast(msg); route(); } catch (x) { toast(x.message, true); route(); } };
  const roleSel = (cur, onchange) => h('select', { onchange }, ['employee', 'manager', 'admin'].map((r) => h('option', { value: r, selected: r === cur }, r[0].toUpperCase() + r.slice(1))));
  function addUser() {
    const f = { name: h('input', { type: 'text', id: 'un' }), email: h('input', { type: 'email', id: 'ue' }), pw: h('input', { type: 'password', id: 'up', autocomplete: 'new-password' }), role: roleSel('employee') };
    f.role.style.width = '100%';
    modal({ title: 'Add a user', confirm: 'Create user',
      body: h('div', {}, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'un' }, 'Full name'), f.name), h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'ue' }, 'Email'), f.email),
        h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'up' }, 'Temporary password'), f.pw, h('div', { class: 'hint' }, 'At least 10 characters. Share it securely.')),
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Role'), f.role,
          h('div', { class: 'hint' }, 'Employee: own records. Manager: sees all records. Admin: also manages users, the library and the job gate.'))),
      onConfirm: async () => { await api('POST', '/admin/users', { name: f.name.value, email: f.email.value, password: f.pw.value, role: f.role.value }); toast('User created'); route(); } });
  }
  function resetPw(u) {
    const pw = h('input', { type: 'password', id: 'rp', autocomplete: 'new-password' });
    modal({ title: 'Reset password for ' + u.name, confirm: 'Reset password', body: h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'rp' }, 'New password'), pw, h('div', { class: 'hint' }, 'At least 10 characters. They will be signed out everywhere.')),
      onConfirm: async () => { await api('PATCH', '/admin/users/' + u.id, { password: pw.value }); toast('Password reset'); } });
  }
  const row = (u) => h('tr', {},
    h('td', {}, h('div', { class: 'row', style: 'gap:10px;flex-wrap:nowrap' }, h('div', { class: 'avatar', style: 'width:32px;height:32px;font-size:12px' }, initials(u.name)),
      h('div', {}, h('strong', {}, u.name, u.id === me.id ? h('span', { class: 'faint' }, ' (you)') : null), h('div', { class: 'small muted' }, u.email)))),
    h('td', {}, u.id === me.id ? h('span', { class: 'chip' }, 'Admin') : roleSel(u.role, (e) => patch(u.id, { role: e.target.value }, 'Role updated'))),
    h('td', {}, Number(u.active) ? h('span', { class: 'pill PASS' }, 'Active') : h('span', { class: 'pill wait' }, 'Disabled')),
    h('td', { class: 'muted' }, ago(u.created_at)),
    h('td', {}, u.id === me.id ? null : h('div', { class: 'row', style: 'justify-content:flex-end;flex-wrap:nowrap' },
      h('button', { class: 'btn sm', onclick: () => resetPw(u) }, 'Reset password'),
      h('button', { class: 'btn sm ' + (Number(u.active) ? 'danger' : ''), onclick: () => patch(u.id, { active: !Number(u.active) }, Number(u.active) ? 'User disabled' : 'User enabled') }, Number(u.active) ? 'Disable' : 'Enable'))));
  const table = clientPaged(users, (slice) => h('div', { class: 'tablewrap' }, h('table', {},
    h('thead', {}, h('tr', {}, ['User', 'Role', 'Status', 'Created', ''].map((t) => h('th', {}, t)))),
    h('tbody', {}, slice.map(row)))));
  shell('users', [pageHead('Users', 'Control who can use the gate and what they can see.', h('button', { class: 'btn primary', onclick: addUser }, icon('screen'), 'Add user')), h('div', { class: 'card' }, table)]);
}

// ---------- Upwork JobGate: the gate prompt (admin) ----------
async function skillView() {
  const { versions } = await api('GET', '/admin/skill');
  const active = versions.find((v) => Number(v.is_active)) || versions[0];
  const cur = active ? (await api('GET', '/admin/skill/' + active.id)).skill : { content: '' };
  const ta = h('textarea', { class: 'editor', id: 'sk', spellcheck: 'false', 'aria-label': 'Gate prompt' }); ta.value = cur.content;
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
      Number(v.is_active) ? null : h('button', { class: 'btn sm', onclick: () => modal({ title: 'Activate version ' + v.version + '?', confirm: 'Activate', body: h('p', { class: 'muted' }, 'New screenings will use this version straight away. Past records keep the version they used.'),
        onConfirm: async () => { await api('POST', `/admin/skill/${v.id}/activate`, {}); toast('Version ' + v.version + ' is now active'); route(); } }) }, 'Activate')));
  shell('skill', [pageHead('Upwork JobGate', 'The gate prompt every job is screened against. Saving never overwrites: it creates a new version.'),
    h('div', { class: 'notice', style: 'margin:0 0 16px' }, icon('info'), 'The report layout is fixed by the app, so editing the rules cannot break reports. Test a draft before you activate it.'),
    h('div', { class: 'two' }, h('div', {},
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Rules'), h('span', { class: 'sub' }, dirty, ' Editing from version ' + (active ? active.version : '-'))), ta,
        h('div', { class: 'card-pad', style: 'border-top:1px solid var(--line)' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'cn' }, 'Change note'), note), h('div', { class: 'row', style: 'margin-top:14px' }, saveBtn))),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Try the draft')), h('div', { class: 'card-pad' }, sample, h('div', { style: 'margin-top:12px' }, testBtn), out))),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Versions')), clientPaged(versions, (slice) => h('div', { class: 'vlist' }, slice.map(vitem)))))], true);
}

// ---------- logs (admin): activity and AI calls ----------
async function auditView() {
  const hp = hashParams();
  const st = { tab: hp.tab === 'calls' ? 'calls' : 'activity', page: Math.max(1, Number(hp.page) || 1), action: hp.action || '', user: hp.user || '', from: hp.from || '', to: hp.to || '', kind: hp.kind || '', ok: hp.ok || '', model: hp.model || '', job: hp.job || '' };
  const opts = await api('GET', '/screenings/filter-options');
  const holder = h('div', { class: 'card' });
  const tabs = h('div', { class: 'seg', role: 'tablist' });
  const drawTabs = () => tabs.replaceChildren(...[['activity', 'Activity'], ['calls', 'AI calls']].map(([k, l]) =>
    h('button', { type: 'button', role: 'tab', 'aria-selected': st.tab === k, class: st.tab === k ? 'on' : '', onclick: () => { st.tab = k; st.page = 1; drawTabs(); load(); } }, l)));
  drawTabs();
  const sel = (key, label, options) => { const el = h('select', { class: 'fsel', 'aria-label': label }, h('option', { value: '' }, label), options.map(([v, l]) => h('option', { value: v, selected: String(st[key]) === String(v) }, l))); el.onchange = () => { st[key] = el.value; st.page = 1; load(); }; return el; };
  const dateIn = (key, label) => { const el = h('input', { type: 'date', class: 'fdate', 'aria-label': label, title: label, value: st[key] }); el.onchange = () => { st[key] = el.value; st.page = 1; load(); }; return el; };
  const secs = (ms) => (ms / 1000).toFixed(1) + ' s';
  async function load() {
    const keys = st.tab === 'calls' ? ['kind', 'ok', 'model', 'from', 'to', 'job'] : ['action', 'user', 'from', 'to'];
    const q = new URLSearchParams({ page: st.page }); for (const k of keys) if (st[k]) q.set(k, st[k]);
    setHashParams({ tab: st.tab === 'activity' ? '' : st.tab, page: st.page, ...Object.fromEntries(['action', 'user', 'from', 'to', 'kind', 'ok', 'model', 'job'].map((k) => [k, keys.includes(k) ? st[k] : ''])) });
    if (st.tab === 'activity') {
      const d = await api('GET', '/admin/audit?' + q);
      holder.replaceChildren(h('div', { class: 'toolbar filters' }, sel('action', 'Any action', d.actions.map((a) => [a, a.replace(/_/g, ' ')])), sel('user', 'Anyone', opts.users.map((u) => [u.id, u.name])), dateIn('from', 'From date'), dateIn('to', 'To date')),
        d.log.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['When', 'Who', 'Action', 'Detail'].map((t) => h('th', {}, t)))),
          h('tbody', {}, d.log.map((l) => h('tr', {}, h('td', { class: 'muted', title: full(l.created_at) }, ago(l.created_at)), h('td', {}, l.user_name || 'System'),
            h('td', {}, h('span', { class: 'chip' }, l.action.replace(/_/g, ' '))), h('td', { class: 'mono muted' }, l.detail || '')))))) : emptyState('audit', 'Nothing here', 'No activity matches these filters.'),
        pager(d.total, d.page, (n) => { st.page = n; load(); }));
    } else {
      const d = await api('GET', '/admin/calls?' + q);
      const errs = d.summary.reduce((a, r) => a + r.errors, 0), all = d.summary.reduce((a, r) => a + r.calls, 0);
      holder.replaceChildren(h('div', { class: 'toolbar filters' }, sel('kind', 'Any job type', d.kinds.map((k) => [k, k.replace(/_/g, ' ')])), sel('ok', 'Any result', [['1', 'Succeeded'], ['0', 'Failed']]),
          sel('model', 'Any model', d.models.map((m) => [m, m])), dateIn('from', 'From date'), dateIn('to', 'To date')),
        h('div', { class: 'card-pad' }, h('div', { class: 'row small muted', style: 'margin-bottom:8px' }, `${all.toLocaleString()} call${all === 1 ? '' : 's'} · ${errs} failed · by step:`),
          d.summary.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Job type', 'Step', 'Model', 'Calls', 'Failed', 'Average', 'Slowest'].map((t) => h('th', {}, t)))),
            h('tbody', {}, d.summary.map((r) => h('tr', {}, h('td', {}, r.kind.replace(/_/g, ' ')), h('td', {}, r.step || '-'), h('td', { class: 'mono small' }, r.model || '-'), h('td', {}, r.calls),
              h('td', {}, r.errors ? h('span', { class: 'pill bad' }, r.errors) : '0'), h('td', {}, secs(r.avg_ms)), h('td', {}, secs(r.max_ms))))))) : null),
        d.calls.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['When', 'Job', 'Type / step', 'Model', 'Time', 'Result'].map((t) => h('th', {}, t)))),
          h('tbody', {}, d.calls.map((c) => h('tr', {}, h('td', { class: 'muted', title: full(c.created_at) }, ago(c.created_at)),
            h('td', {}, c.screening_id ? h('a', { href: '#/s/' + c.screening_id }, '#' + c.screening_id + ' ' + (c.title || '').slice(0, 40)) : h('span', { class: 'faint' }, '-')),
            h('td', {}, `${c.kind.replace(/_/g, ' ')}${c.step ? ' / ' + c.step : ''}`), h('td', { class: 'mono small' }, c.model || ''), h('td', {}, secs(c.ms)),
            h('td', {}, Number(c.ok) ? h('span', { class: 'pill PASS' }, 'OK') : h('span', { class: 'pill bad', title: c.error || '' }, c.error || 'Failed'))))))) : emptyState('audit', 'No AI calls yet', 'Calls are logged from now on: every screening, tagging, signal reading and proposal.'),
        pager(d.total, d.page, (n) => { st.page = n; load(); }));
    }
  }
  shell('audit', [pageHead('Logs', 'Activity: who did what. AI calls: every model call, how long it took and whether it failed.'), h('div', { style: 'margin-bottom:12px' }, tabs), holder], 1480);
  await load();
}

// ---------- rules (admin) ----------
async function rulesView() {
  const { rules } = await api('GET', '/admin/rules');
  const add = (type) => {
    const ta = h('textarea', { id: 'nr', style: 'min-height:80px', maxlength: 300, placeholder: type === 'fail' ? 'e.g. Client asks for work outside Upwork' : 'e.g. Job needs a language we do not use' });
    modal({ title: type === 'fail' ? 'Add a FAIL rule' : 'Add a FLAG rule', confirm: 'Add rule', body: h('div', {},
      h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'nr' }, 'Rule'), ta, h('div', { class: 'hint' }, 'It gets the next free code. Codes are never reused, so old jobs keep their meaning.')),
      h('div', { class: 'notice', style: 'margin-top:12px' }, icon('info'), 'Also add the rule, with its code, to the gate prompt in Upwork JobGate. The model only applies rules written in the prompt.')),
      onConfirm: async () => { const r = await api('POST', '/admin/rules', { type, rule: ta.value }); toast('Added ' + r.code); route(); } });
  };
  const edit = (r) => {
    const ta = h('textarea', { id: 'er', style: 'min-height:80px', maxlength: 300 }); ta.value = r.rule;
    modal({ title: 'Reword ' + r.code, confirm: 'Save', body: h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'er' }, 'Rule'), ta,
      h('div', { class: 'hint' }, 'Keep the meaning: jobs already flagged with ' + r.code + ' were judged by the old wording. For a new meaning, add a new rule.')),
      onConfirm: async () => { await api('PATCH', '/admin/rules/' + r.code, { rule: ta.value }); toast(r.code + ' saved'); route(); } });
  };
  const toggle = async (r) => { await api('PATCH', '/admin/rules/' + r.code, { active: !r.active }); toast(r.code + (r.active ? ' retired' : ' restored')); route(); };
  const table = (type) => h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Code', 'Rule', 'Fired on', 'Status', ''].map((x) => h('th', {}, x)))),
    h('tbody', {}, rules.filter((r) => r.type === type).map((r) => h('tr', { class: r.active ? '' : 'retired' },
      h('td', { class: 'mono' }, h('strong', {}, r.code)), h('td', { style: 'white-space:normal' }, r.rule),
      h('td', {}, r.fired ? h('a', { href: `#/history?rule=${r.code}` }, `${r.fired} job${r.fired === 1 ? '' : 's'}`) : h('span', { class: 'faint' }, 'none')),
      h('td', {}, r.active ? h('span', { class: 'pill PASS' }, 'Active') : h('span', { class: 'pill wait' }, 'Retired')),
      h('td', {}, h('div', { class: 'row', style: 'justify-content:flex-end;flex-wrap:nowrap' }, h('button', { class: 'btn sm', onclick: () => edit(r) }, 'Reword'),
        h('button', { class: 'btn sm', onclick: () => toggle(r) }, r.active ? 'Retire' : 'Restore'))))))));
  shell('rules', [pageHead('Rules', 'The FAIL and FLAG codes the gate reports. Codes are never renumbered or reused: a rule is reworded or retired, and a new meaning gets a new code.'),
    h('div', { class: 'notice', style: 'margin:0 0 16px' }, icon('info'), 'This list is what the app knows each code means. The gate prompt in Upwork JobGate is what the model applies, so keep the two in step.'),
    h('div', { class: 'card', style: 'margin-bottom:16px' }, h('div', { class: 'card-head' }, h('h2', {}, 'FAIL rules'), h('button', { class: 'btn sm primary', onclick: () => add('fail') }, 'Add FAIL rule')), table('fail')),
    h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'FLAG rules'), h('button', { class: 'btn sm primary', onclick: () => add('flag') }, 'Add FLAG rule')), table('flag'))], true);
}

// ---------- settings (admin) ----------
async function settingsView() {
  const { settings, meta } = await api('GET', '/settings');
  const save = async (key, value, btn) => {
    btnBusy(btn, 'Saving');
    try { await api('PUT', '/admin/settings/' + key, { value }); CFG = null; toast('Saved'); route(); }
    catch (x) { toast(x.message, true); btn.disabled = false; btn.replaceChildren('Save'); }
  };
  const row = (key, input, read) => {
    const btn = h('button', { class: 'btn sm primary', type: 'button' }, 'Save');
    btn.onclick = () => { let v; try { v = read(); } catch (x) { return toast(x.message, true); } save(key, v, btn); };
    return h('div', { class: 'setrow' }, h('div', {}, h('strong', {}, meta[key].label), meta[key].help ? h('div', { class: 'small muted' }, meta[key].help) : null), h('div', { class: 'setin' }, input, btn));
  };
  const num = (key) => { const el = h('input', { type: 'number', min: 0, step: 1, value: settings[key], style: 'width:110px' }); return row(key, el, () => Number(el.value)); };
  const list = (key, ph) => { const el = h('input', { type: 'text', value: settings[key].join(', '), placeholder: ph, style: 'min-width:320px' }); return row(key, el, () => el.value.split(',').map((x) => x.trim()).filter(Boolean)); };
  const sig = settings['writer.structured_signal'];
  const sigNum = h('input', { type: 'number', min: 1, value: sig.signal, style: 'width:90px', 'aria-label': 'Signal number' });
  const sigVal = h('input', { type: 'text', value: sig.value, style: 'width:140px', 'aria-label': 'Value' });
  const group = (title, rows) => h('div', { class: 'card', style: 'margin-bottom:16px' }, h('div', { class: 'card-head' }, h('h2', {}, title)), h('div', { class: 'card-pad setlist' }, rows));
  shell('settings', [pageHead('Settings', 'Numbers and lists the app used to have fixed in code. Changes apply to the next job, no restart needed.'),
    group('Project matching', [num('matching.shown'), num('matching.recommended'), num('matching.min_score'), num('selection.min'), num('selection.max')]),
    group('Screening and tracking', [num('override.min_reason'), list('tracking.outcomes', 'Pending, Hired, ...')]),
    group('Proposal writer', [list('writer.requirement_rules', 'G11, G12, G13'),
      row('writer.structured_signal', h('span', { class: 'row', style: 'gap:6px' }, 'Signal', sigNum, 'is', sigVal), () => ({ signal: Number(sigNum.value), value: sigVal.value.trim() }))])], true);
}

// ---------- router ----------
async function route() {
  try {
    if (!me) me = (await api('GET', '/me')).user;
    if (!me) return loginView();
    if (!CFG) CFG = (await api('GET', '/settings')).settings;
    const [, a, b, c] = location.hash.split('?')[0].split('/');
    if (a === 's' && b) return c === 'work' ? await detailView(Number(b)) : await jobView(Number(b));
    if (a === 'history') return await historyView();
    if (a === 'dashboard' || !a) return await dashboardView();
    if (a === 'templates' && me.role !== 'employee') return await templatesView();
    if (a === 't' && b && me.role !== 'employee') return await templateView(b);
    if (a === 'signals' && me.role !== 'employee') return await signalsView();
    if (a === 'sig' && b && me.role !== 'employee') return await signalView(Number(b));
    if (a === 'i' && b) return await industryDetailView(Number(b));
    if (a === 'industries') return await industriesView();
    if (a === 'dictionary' && me.role === 'admin') return await dictionaryView();
    if (a === 'p' && b) return await projectDetailView(Number(b));
    if (a === 'projects') return await projectsView();
    if (a === 'profiles' && me.role === 'admin') return await profilesView();
    if (a === 'users' && me.role === 'admin') return await usersView();
    if (a === 'skill' && me.role === 'admin') return await skillView();
    if (a === 'rules' && me.role === 'admin') return await rulesView();
    if (a === 'settings' && me.role === 'admin') return await settingsView();
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
