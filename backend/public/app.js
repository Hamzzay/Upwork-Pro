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
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
  chart: '<path d="M3 20h18M7 20v-8M12 20V5M17 20v-11"/>',
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
  // anything but GET goes as JSON, even with nothing to send (a delete): the server refuses other requests (cross-site form posts)
  const json = method !== 'GET';
  const r = await fetch('/api' + path, { method, headers: json ? { 'Content-Type': 'application/json' } : {}, body: json ? JSON.stringify(body || {}) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || 'Something went wrong. Try again.'); e.status = r.status; throw e; }
  return data;
}
/** First letter up: model-written values often start lower case ("not shown"). */
const cap = (v) => (typeof v === 'string' && v ? v[0].toUpperCase() + v.slice(1) : v);
const toDate = (s) => (s ? new Date(String(s).replace(' ', 'T')) : null);
function ago(s) {
  const d = toDate(s); if (!d) return '';
  const sec = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'Just now';
  if (sec < 3600) return Math.floor(sec / 60) + ' min ago';
  if (sec < 86400) return Math.floor(sec / 3600) + ' h ago';
  if (sec < 604800) return Math.floor(sec / 86400) + ' d ago';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
/** ago() inside a sentence: "Finished just now", not "Finished Just now". */
const agoIn = (s) => { const t = ago(s); return t === 'Just now' ? 'just now' : t; };
/** A day in a table: 7 Oct 2026. */
const dayText = (s) => { if (!s) return ''; const t = String(s); const d = t.length <= 10 ? new Date(t + 'T00:00:00') : toDate(t); return isNaN(d) ? t : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };
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
function fSelect(label, options, value, onChange) {
  const el = h('select', { 'aria-label': label, class: 'fsel' }, h('option', { value: '' }, label), options.map(([v, l]) => h('option', { value: v, selected: String(value) === String(v) }, l)));
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
  const size = o.paged === false ? Infinity : PAGE_SIZE;
  const body = h('div', {});
  const reset = () => { st.page = 1; draw(); };
  const searchEl = o.search ? fSearch(o.search.placeholder, st.q, (v) => { st.q = v; reset(); }) : null;
  const sels = filters.map((f) => fSelect(f.label, f.options, st[f.key], (v) => { st[f.key] = v; reset(); }));
  const bar = filterBar([searchEl, ...sels], { actions: o.actions, onClear: () => { st.q = ''; if (searchEl) searchEl.input.value = ''; filters.forEach((f, i) => { st[f.key] = ''; sels[i].value = ''; }); reset(); } });
  function draw() {
    const q = st.q.toLowerCase();
    const shown = o.items.filter((it) => (!q || o.search.text(it).toLowerCase().includes(q)) && filters.every((f) => !st[f.key] || f.test(it, st[f.key])));
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
const dataTable = (heads, rows, cls) => h('div', { class: 'tablewrap' }, h('table', { class: cls || null }, h('thead', {}, h('tr', {}, heads.filter((x) => x !== null).map((t) => h('th', { class: t ? null : 'acts' }, t)))), h('tbody', {}, rows)));

// ---------- layout ----------
const APP_NAME = 'Upwork Pro';
const STAFF = ['manager', 'admin'], ADMIN = ['admin'];
/** The sidebar, in order. A link without roles is for everyone. */
const NAV = [
  { label: 'Work', links: [
    { key: 'dashboard', icon: 'home', label: 'Dashboard' },
    { key: 'new', icon: 'screen', label: 'Screen a job' },
    { key: 'history', icon: 'list', label: () => (me.role === 'employee' ? 'My jobs' : 'Jobs') },
    { key: 'reports', icon: 'chart', label: 'Reports' },
    { key: 'connect', icon: 'link', label: 'Connect Claude' },
    { href: '/guide/', icon: 'info', label: 'Guide' }] }, // the team guide, served beside the app; it opens in its own tab
  { label: 'Library', links: [
    { key: 'projects', icon: 'folder', label: 'Projects' },
    { key: 'industries', icon: 'building', label: 'Industries' },
    { key: 'dictionary', icon: 'tag', label: 'Tag dictionary', roles: ADMIN },
    { key: 'profiles', icon: 'badge', label: 'Upwork profiles', roles: ADMIN },
    { key: 'looms', icon: 'video', label: 'Loom videos', roles: ADMIN }] },
  { label: 'Proposal setup', links: [
    { key: 'signals', icon: 'audit', label: 'Signals', roles: STAFF },
    { key: 'writing', icon: 'doc', label: 'Writing guide' }] },
  { label: 'Admin', links: [
    { key: 'skill', icon: 'skill', label: 'Gate instructions', roles: ADMIN },
    { key: 'rules', icon: 'warn', label: 'Rules', roles: ADMIN },
    { key: 'settings', icon: 'gear', label: 'Settings', roles: ADMIN },
    { key: 'users', icon: 'users', label: 'Users', roles: ADMIN },
    { key: 'audit', icon: 'audit', label: 'Logs', roles: ADMIN }] },
];
function shell(active, content, wide) {
  const a = ([key, ic, label]) => (key.startsWith('/') ? h('a', { href: key, target: '_blank', rel: 'noopener' }, icon(ic), h('span', {}, label))
    : h('a', { href: '#/' + key, class: active === key ? 'active' : '', 'aria-current': active === key ? 'page' : null }, icon(ic), h('span', {}, label)));
  const groups = NAV.map((g) => [g.label, g.links.filter((l) => !l.roles || l.roles.includes(me.role)).map((l) => [l.href || l.key, l.icon, typeof l.label === 'function' ? l.label() : l.label])])
    .filter(([, links]) => links.length);
  const menu = h('button', { class: 'btn sm navtoggle', type: 'button', 'aria-expanded': 'false', onclick: () => { const open = menu.closest('.shell').classList.toggle('navopen'); menu.setAttribute('aria-expanded', String(open)); } }, icon('list'), 'Menu');
  $app.replaceChildren(h('div', { class: 'shell' },
    h('aside', { class: 'side' },
      h('a', { class: 'brand', href: '#/dashboard', style: 'color:inherit;text-decoration:none' }, h('div', { class: 'logo' }, icon('logo')), APP_NAME),
      menu,
      h('nav', { class: 'nav', 'aria-label': 'Main' }, groups.map(([label, links]) => [h('div', { class: 'nav-label' }, label), links.map(a)])),
      h('div', { class: 'me' }, h('div', { class: 'avatar' }, initials(me.name)),
        h('div', { class: 'who' }, h('strong', {}, me.name), h('span', {}, me.role)),
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
  const btn = h('button', { class: 'btn primary', type: 'button' }, 'Screen this job');
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
      location.hash = '#/s/' + r.id + '/screening'; // a new job opens on its Screening tab
    } catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; btn.disabled = false; btn.replaceChildren('Screen this job'); }
  };
  btn.onclick = submit;
  box.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(); });
  shell('new', [
    pageHead('Screen a job', 'Check an Upwork job against the SOP before anyone spends Connects on it.'),
    h('div', { class: 'card composer' }, box,
      h('div', { class: 'composer-bar' }, chip, h('span', { class: 'grow' }), h('span', { class: 'faint small' }, (navigator.platform || '').startsWith('Mac') ? 'Cmd + Enter to send' : 'Ctrl + Enter to send'), btn)),
    h('div', { class: 'field', style: 'max-width:520px' }, h('label', { class: 'lbl', for: 'joburl' }, 'Job link (optional)'), urlIn, h('div', { class: 'hint' }, 'Saved with the record when you paste text instead of a link.')),
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
  const sel = (key, label, options) => {
    const el = h('select', { 'aria-label': label, class: 'fsel' }, h('option', { value: '' }, label), options.map(([v, l]) => h('option', { value: v, selected: String(st[key]) === String(v) }, l)));
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
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return '#/history?' + q;
  };
  const kpi = (label, value, sub, link, cls) => h(link ? 'a' : 'div', { class: 'stat kpi ' + (cls || ''), href: link || null }, h('span', { class: 'k' }, label), h('span', { class: 'v' }, value), sub ? h('span', { class: 'sub small muted' }, sub) : null);
  const panel = (title, sub, content, wide, after) => h('div', { class: 'card dpanel' + (wide ? ' wide' : '') }, h('div', { class: 'card-head' }, h('h2', {}, title), sub ? h('span', { class: 'sub' }, sub) : null), h('div', { class: 'card-pad' }, content, after || null));
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
        kpi('Needs action', needs, 'Waiting on someone', jobsLink({ stage: 'needs_action' }), 'NEED')),
      h('div', { class: 'dgrid' },
        panel('Funnel', 'From screening to hire', h('div', { class: 'hbars' }, funnel.map(([l, v, ex]) => hbar(l, v, c.screened, pct(v, c.screened), jobsLink(ex))))),
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
          h('span', { class: 'small muted nowrap' }, toDate(x.day + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))))) : h('p', { class: 'muted' }, 'No jobs in this period.'), false,
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
  }
  shell('dashboard', [pageHead('Dashboard', 'How the team is doing: what came in, what went out, how fast, and what is waiting.', h('a', { class: 'btn primary', href: '#/new' }, icon('screen'), 'Screen a job')), bar, body], 1480);
  body.append(h('div', { class: 'card card-pad' }, h('div', { class: 'skel', style: 'width:60%' })));
  await load();
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
    dim: hp.dim || 'profile', min: Number(hp.min) || 1, sort: hp.sort || 'sent', dir: hp.dir === 'asc' ? 'asc' : 'desc' };
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
    for (const [k, v] of Object.entries(extra || {})) q.set(k, v);
    return '#/history?' + q;
  };
  const fromIn = dateField('From', st.from, (v) => { st.from = v; load(); }), toIn = dateField('To', st.to, (v) => { st.to = v; load(); });
  const syncDates = () => { fromIn.hidden = toIn.hidden = st.period !== 'custom'; };
  const sel = (key, label, options, keep) => { const el = fSelect(label, options, st[key], (v) => { st[key] = v || (keep ?? ''); if (key === 'period') syncDates(); load(); }); return el; };
  const periodSel = h('select', { 'aria-label': 'Period', class: 'fsel', 'data-plain': true }, REPORT_PERIODS.map(([k, l]) => h('option', { value: k, selected: st.period === k }, l)));
  periodSel.onchange = () => { st.period = periodSel.value; syncDates(); load(); };
  const basisSel = h('select', { 'aria-label': 'Dates by', class: 'fsel', 'data-plain': true }, [['screened', 'By date screened'], ['sent', 'By date sent']].map(([k, l]) => h('option', { value: k, selected: st.basis === k }, l)));
  basisSel.onchange = () => { st.basis = basisSel.value; load(); };
  const profSel = sel('profile', 'Any profile', opts.profiles.map((p) => [p.id, p.name])), userSel = opts.users.length ? sel('user', 'Anyone', opts.users.map((u) => [u.id, u.name])) : null;
  const srcSel = sel('source', 'Written anywhere', [['app', 'Written in Upwork Pro'], ['claude_plugin', 'Written with the Claude plugin']]), vSel = sel('v', 'Any gate result', [['PASS', 'Pass'], ['FLAG', 'Flag'], ['FAIL', 'Fail']]);
  const exportBtn = h('button', { class: 'btn', type: 'button', onclick: () => { if (!data) return;
    downloadCsv(`upwork-pro-report-${ymd(new Date())}.csv`, ['Report', 'Group', 'Jobs', 'Continued', 'Proposals written', 'Sent', 'Viewed', 'Chat opened', 'Interview', 'Hired', 'Lost', 'Connects', 'View rate', 'Chat rate', 'Interview rate', 'Hire rate'],
      [{ label: 'Everything', rows: [data.totals] }, ...data.dims].flatMap((d) => d.rows.map((r) => [d.label, r.name, r.jobs, r.continued, r.written, r.sent, r.viewed, r.chat, r.interview, r.hired, r.lost, r.connects, ...RATES.map(([, , f]) => pctText(share(...f(r))))]))); toast('Report saved as a CSV file'); } }, icon('doc'), 'Export');
  const fbar = filterBar([periodSel, fromIn, toIn, basisSel, profSel, userSel, srcSel, vSel], { actions: exportBtn,
    onClear: () => { Object.assign(st, { profile: '', user: '', source: '', v: '' }); for (const x of [profSel, userSel, srcSel, vSel]) if (x) x.value = ''; load(); } });
  syncDates();

  const rateCell = (r, f) => { const [a, b] = f(r), v = share(a, b); return h('td', { class: 'num', title: b ? `${a} of ${b} sent` : 'Nothing sent yet' }, v == null ? h('span', { class: 'faint' }, 'No data') : [h('span', { class: 'ratebar', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.round(v * 100)}%` })), pctText(v)]); };
  const sortVal = { name: (r) => r.name.toLowerCase(), jobs: (r) => r.jobs, sent: (r) => r.sent, view: (r) => share(r.viewed, r.sent) ?? -1, chat: (r) => share(r.chat, r.sent) ?? -1, interview: (r) => share(r.interview, r.sent) ?? -1, hire: (r) => share(r.hired, r.sent) ?? -1, cost: (r) => (r.sent ? r.connects / r.sent : -1) };
  function breakdown(d) {
    const rows = d.rows.filter((r) => (d.basis === 'sent' ? r.sent : Math.max(r.sent, st.min === 1 ? r.jobs : 0)) >= st.min && (st.min === 1 || r.sent >= st.min));
    const keep = d.key === 'week' && st.sort === 'sent' && st.dir === 'desc'; // weeks read in time order unless another column is chosen
    if (!keep) rows.sort((a, b) => { const x = sortVal[st.sort](a), y = sortVal[st.sort](b); return (x < y ? -1 : x > y ? 1 : 0) * (st.dir === 'asc' ? 1 : -1); });
    const th = (label, key, num) => { const on = st.sort === key; const b = h('button', { type: 'button', class: 'sortbtn' + (on ? ' on' : '') }, label, on ? (st.dir === 'asc' ? ' ▲' : ' ▼') : '');
      b.onclick = () => { if (on) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.sort = key; st.dir = key === 'name' ? 'asc' : 'desc'; } draw(); }; return h('th', { class: num ? 'num' : null, 'aria-sort': on ? (st.dir === 'asc' ? 'ascending' : 'descending') : null }, b); };
    return rows.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'report' }, h('thead', {}, h('tr', {}, th(d.label, 'name'), th('Jobs', 'jobs', true), th('Sent', 'sent', true), th('View rate', 'view', true), th('Chat rate', 'chat', true), th('Interview rate', 'interview', true), th('Hire rate', 'hire', true), th('Connects per proposal', 'cost', true))),
      h('tbody', {}, rows.map((r) => h('tr', { class: r.link ? 'click' : '', tabindex: r.link ? 0 : null, title: r.link ? 'Open these jobs' : null, onclick: r.link ? () => (location.hash = jobsLink(r.link)) : null, onkeydown: r.link ? (e) => { if (e.key === 'Enter') location.hash = jobsLink(r.link); } : null },
        h('td', {}, h('strong', {}, r.name)), h('td', { class: 'num' }, r.jobs), h('td', { class: 'num' }, r.sent), RATES.map(([, , f]) => rateCell(r, f)),
        h('td', { class: 'num' }, r.sent && r.connects ? (r.connects / r.sent).toFixed(1) : h('span', { class: 'faint' }, 'No data')))))))
      : emptyState('chart', 'Nothing to compare yet', st.min > 1 ? `No group has ${st.min} sent proposals in this period. Lower "At least" or widen the dates.` : d.basis === 'sent' ? 'This report counts sent proposals, and none is recorded for these filters.' : 'No jobs match these filters.');
  }
  /** What is working: for the dimensions that matter most, the group with the best rate, among groups with enough sent proposals to mean something. */
  function highlights() {
    const need = Math.max(3, st.min), out = [];
    for (const [key, rateKey] of [['profile', 'view'], ['profile', 'chat'], ['type', 'chat'], ['project', 'chat'], ['industry', 'chat'], ['person', 'chat'], ['loom', 'chat'], ['source', 'chat'], ['sent_weekday', 'view'], ['boost', 'view']]) {
      const d = data.dims.find((x) => x.key === key), [, label, f] = RATES.find((x) => x[0] === rateKey);
      const ok = d.rows.filter((r) => r.sent >= need); if (ok.length < 2) continue;
      const best = [...ok].sort((a, b) => share(...f(b)) - share(...f(a)))[0], [a, b] = f(best), rest = ok.filter((r) => r !== best), ra = rest.reduce((n, r) => n + f(r)[0], 0), rb = rest.reduce((n, r) => n + f(r)[1], 0);
      if (!a || share(a, b) <= share(ra, rb)) continue;
      out.push(h('li', {}, h('button', { type: 'button', class: 'linkbtn', onclick: () => { st.dim = key; dimSel.value = key; draw(); document.getElementById('breakdown').scrollIntoView({ behavior: 'smooth' }); } }, d.label),
        h('span', {}, ': ', h('strong', {}, best.name), ` has the best ${label.toLowerCase()}, ${pctText(share(a, b))} (${a} of ${b} sent). The others together: ${pctText(share(ra, rb))}.`)));
    }
    return out.length ? h('ul', { class: 'jp-list', style: 'margin:0' }, out) : h('p', { class: 'jp-label', style: 'margin:0' }, `Not enough sent proposals to compare yet. A group needs at least ${need} sent proposals, and there must be two such groups. Keep recording Sent, Viewed, Chat opened, Interview and the outcome on each job.`);
  }
  const dimSel = h('select', { 'aria-label': 'Break down by', class: 'fsel' });
  dimSel.onchange = () => { st.dim = dimSel.value; draw(); };
  const minSel = h('select', { 'aria-label': 'At least', class: 'fsel', 'data-plain': true }, [[1, 'Every group'], [3, 'At least 3 sent'], [5, 'At least 5 sent'], [10, 'At least 10 sent'], [25, 'At least 25 sent']].map(([v, l]) => h('option', { value: v, selected: st.min === v }, l)));
  minSel.onchange = () => { st.min = Number(minSel.value); draw(); };

  function draw() {
    const t = data.totals, tm = data.timing;
    setHashParams({ period: st.period === '90' ? '' : st.period || 'all', from: st.period === 'custom' ? st.from : '', to: st.period === 'custom' ? st.to : '', basis: st.basis === 'sent' ? 'sent' : '', profile: st.profile, user: st.user, source: st.source, v: st.v,
      dim: st.dim === 'profile' ? '' : st.dim, min: st.min === 1 ? '' : st.min, sort: st.sort === 'sent' ? '' : st.sort, dir: st.dir === 'desc' ? '' : st.dir });
    fbar.setActive(!!(st.profile || st.user || st.source || st.v));
    if (!dimSel.options.length) dimSel.replaceChildren(...data.dims.map((d) => h('option', { value: d.key }, `By ${d.label[0].toLowerCase()}${d.label.slice(1)}`)));
    if (!data.dims.some((d) => d.key === st.dim)) st.dim = 'profile';
    dimSel.value = st.dim;
    const d = data.dims.find((x) => x.key === st.dim);
    const kpi = (label, value, sub, link) => h(link ? 'a' : 'div', { class: 'stat kpi', href: link || null, style: link ? null : 'cursor:default' }, h('span', { class: 'k' }, label), h('span', { class: 'v' }, value), h('span', { class: 'sub muted' }, sub));
    const rate = (a, b) => (b ? pctText(a / b) : 'No data');
    const funnel = [['Screened', t.jobs, {}], ['Continued', t.continued, {}], ['Proposal written', t.written, {}], ['Sent', t.sent, {}], ['Viewed', t.viewed, {}], ['Chat opened', t.chat, {}], ['Interview', t.interview, {}], ['Hired', t.hired, { outcome: 'Hired' }]];
    const hours = (v) => (v == null ? 'No data' : v < 1 ? Math.round(v * 60) + ' min' : v < 48 ? v + ' h' : Math.round(v / 24) + ' days');
    const weeks = data.dims.find((x) => x.key === 'week').rows, maxW = Math.max(1, ...weeks.map((w) => w.jobs));
    // a small card per report, so every trend is on the page at once; its top groups by sent, with the chat rate
    const mini = (x) => { const top = x.rows.filter((r) => r.sent || x.basis === 'jobs').slice(0, 4);
      return h('button', { type: 'button', class: 'card card-pad cardlink minirep' + (x.key === st.dim ? ' on' : ''), onclick: () => { st.dim = x.key; draw(); document.getElementById('breakdown').scrollIntoView({ behavior: 'smooth' }); } },
        h('strong', {}, x.label), top.length ? h('div', { class: 'minirows' }, top.map((r) => h('div', {}, h('span', { class: 'clip' }, r.name), h('span', { class: 'muted' }, r.sent ? `${r.sent} sent · ${rate(r.viewed, r.sent)} viewed` : `${r.jobs} job${r.jobs === 1 ? '' : 's'}`))))
          : h('div', { class: 'jp-label' }, 'Nothing recorded yet')); };
    body.replaceChildren(...[
      data.capped ? h('div', { class: 'notice' }, icon('info'), `Showing the newest ${data.limit.toLocaleString()} jobs these filters match. Narrow the dates to count them all.`) : null,
      h('div', { class: 'stats six' },
        kpi('Sent', t.sent, `of ${t.jobs} screened · ${t.connects} Connects`, jobsLink({ tab: 'submitted' })),
        kpi('View rate', rate(t.viewed, t.sent), `${t.viewed} viewed`),
        kpi('Chat rate', rate(t.chat, t.sent), `${t.chat} chats opened`),
        kpi('Interview rate', rate(t.interview, t.sent), `${t.interview} interviews`),
        kpi('Hire rate', rate(t.hired, t.sent), `${t.hired} hired · ${t.lost} lost`, jobsLink({ outcome: 'Hired' })),
        kpi('Connects per hire', t.hired && t.connects ? Math.round(t.connects / t.hired) : 'No data', t.sent && t.connects ? `${(t.connects / t.sent).toFixed(1)} per proposal` : 'Record Connects on each job')),
      h('div', { class: 'dgrid' },
        h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Funnel'), h('span', { class: 'sub' }, 'Each step as a share of the one before')),
          h('div', { class: 'card-pad hbars' }, funnel.map(([l, v, ex], i) => h('a', { class: 'hbar', href: jobsLink(ex) }, h('span', { class: 'lbl' }, l), h('span', { class: 'track' }, h('i', { style: `width:${t.jobs ? Math.max(v ? 2 : 0, (v / t.jobs) * 100) : 0}%` })),
            h('span', { class: 'num' }, v), h('span', { class: 'ext muted' }, i ? rate(v, funnel[i - 1][1]) : ''))))),
        h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'What is working'), h('span', { class: 'sub' }, 'The best group in each report')), h('div', { class: 'card-pad' }, highlights())),
        h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Over time'), h('span', { class: 'sub' }, 'Jobs screened and proposals sent, by week')),
          h('div', { class: 'card-pad' }, weeks.length ? [h('div', { class: 'daybars' }, weeks.map((w) => h('a', { class: 'day', href: jobsLink(w.link), title: `${w.name}: ${w.jobs} screened, ${w.sent} sent, ${w.viewed} viewed, ${w.chat} chats, ${w.hired} hired` },
            h('div', { class: 'col' }, h('i', { class: 's', style: `height:${(w.jobs / maxW) * 100}%` }), h('i', { class: 'p', style: `height:${(w.sent / maxW) * 100}%` })),
            h('span', { class: 'small muted nowrap' }, toDate(w.key + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))))),
            h('div', { class: 'legend' }, h('span', {}, h('i', { class: 's' }), 'Screened'), h('span', {}, h('i', {}), 'Sent'))] : h('p', { class: 'muted' }, 'No jobs in this period.'))),
        h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'How long things take'), h('span', { class: 'sub' }, 'Averages')),
          h('div', { class: 'card-pad' }, h('dl', { class: 'facts' }, [['Paste to proposal ready', tm.secs_to_proposal == null ? 'No data' : mins(tm.secs_to_proposal)], ['Sent to first view', hours(tm.hours_to_view)], ['Sent to chat opened', hours(tm.hours_to_chat)], ['Sent to closed', tm.days_to_close == null ? 'No data' : tm.days_to_close + ' days']]
            .map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', { class: v === 'No data' ? 'ns' : '' }, v))))))),
      h('div', { class: 'card', id: 'breakdown' }, h('div', { class: 'card-head' }, h('h2', {}, 'Break it down'), h('span', { class: 'sub' }, d.help)),
        h('div', { class: 'filterbar' }, dimSel, minSel, h('div', { class: 'fb-actions wide' }, h('span', { class: 'jp-label' }, 'A row opens its jobs. A column title sorts.'))),
        breakdown(d)),
      h('div', {}, h('h2', {}, 'Every report'), h('p', { class: 'jp-label' }, 'Each card is one way to cut the same jobs. Open one to see it in full above.')),
      h('div', { class: 'grid4 minigrid' }, data.dims.map(mini)),
      h('div', { class: 'notice' }, icon('info'), h('span', {}, 'A rate is only as good as what is recorded: mark each proposal Sent, then Viewed, Chat opened, Interview and its outcome (the Update status button), and record Connects, boost and the Loom video under Tracking, Edit details. Small groups swing a lot: use "At least" to hide them.')),
    ].filter(Boolean));
  }
  async function load() {
    const r = range(), q = new URLSearchParams(), pre = st.basis === 'sent' ? 'sent_' : '';
    if (r.from) q.set(pre + 'from', r.from); if (r.to) q.set(pre + 'to', r.to);
    for (const [k, api] of [['profile', 'profile'], ['user', 'user'], ['source', 'source'], ['v', 'verdict']]) if (st[k]) q.set(api, st[k]);
    data = await api('GET', '/reports?' + q); draw();
  }
  shell('reports', [pageHead('Reports', 'What is working and what is not: the same jobs counted by profile, person, proposal type, project, industry, tag, signal, rule, Loom video and more. Every row opens the jobs behind it.'),
    h('div', { class: 'card' }, fbar), body]);
  body.append(h('div', { class: 'card card-pad' }, h('div', { class: 'skel', style: 'width:60%' })));
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
const shortDate = (s) => { const d = toDate(s); return d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : ''; };

/** The gate result: a quiet badge, the rule codes as chips (three, then "+N"), and the details on click. */
function resultCell(r) {
  if (!r.verdict) return verdictPill(r.verdict, r.status);
  const codes = (r.rule_codes || '').split(/\s*,\s*/).filter(Boolean);
  const content = h('div', { class: 'result' }, verdictBadge(r.verdict),
    codes.length ? h('span', { class: 'codes' }, codes.slice(0, 3).map((c) => h('span', { class: 'code ' + (c[0] === 'F' ? 'F' : 'G') }, c)), codes.length > 3 ? h('span', { class: 'code more' }, '+' + (codes.length - 3)) : null) : null);
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
const whyNot = (r) => (r.stage === 'failed' ? cap(r.error_message || 'The screening did not finish') : r.stage === 'skipped' ? cap(r.notes || 'Skipped after screening') : '');

/** Every column the Jobs list can show, and which ones each tab starts with. */
const JOB_COLS = [
  { key: 'progress', label: 'Where it stands', sort: 'stage', cell: (r) => standsCell(r) },
  { key: 'journey', label: 'On Upwork', cell: (r) => journeyStrip(r) },
  { key: 'why', label: 'Why not pursued', cell: (r) => clip(whyNot(r), 260) },
  { key: 'status', label: 'Status', sort: 'quiet', cell: (r) => [r.current_status ? h('span', { class: 'chip brand' }, r.current_status) : h('span', { class: 'faint small' }, 'Not sent'), r.status_at ? h('div', { class: 'meta', title: full(r.status_at) }, ago(r.status_at)) : null] },
  { key: 'since', label: 'Last update', sort: 'quiet', cell: (r) => (r.days_since_update == null ? '' : h('span', { class: r.stage === 'submitted' && r.days_since_update >= cfg('tracking.quiet_days', 5) ? 'quiet' : 'muted' }, r.days_since_update === 0 ? 'Today' : `${r.days_since_update} d ago`)) },
  { key: 'verdict', label: 'Result', sort: 'verdict', cell: (r) => resultCell(r) },
  { key: 'country', label: 'Client', sort: 'country', cell: (r) => clip(r.client_country, 170) },
  { key: 'budget', label: 'Budget', cell: (r) => [clip(r.budget, 190), r.job_type ? h('div', { class: 'meta' }, r.job_type) : null] },
  { key: 'hire_rate', label: 'Hire rate', sort: 'hire_rate', cell: (r) => clip(r.hire_rate, 120) },
  { key: 'profile', label: 'Profile', sort: 'profile', cell: (r) => clip(r.profile_name, 140) },
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
  { key: 'in_progress', label: 'In progress', cols: ['progress', 'verdict', 'country', 'budget', 'profile', 'user', 'created'], stages: ['decide', 'projects', 'profile', 'review', 'ready', 'screening', 'writing'], need: true },
  { key: 'submitted', label: 'Submitted', cols: ['progress', 'journey', 'since', 'sent', 'connects', 'profile', 'user'], quiet: true },
  { key: 'closed', label: 'Closed', cols: ['outcome', 'close', 'sent', 'verdict', 'profile', 'user', 'country'] },
  { key: 'not_pursued', label: 'Not pursued', cols: ['progress', 'why', 'verdict', 'country', 'budget', 'user', 'created'], stages: ['skipped', 'failed'] },
];
function savedCols(tab) {
  try { const v = JSON.parse(localStorage.getItem('jobs.cols2.' + (tab || 'all')) || 'null'); if (Array.isArray(v)) return new Set(v); } catch { /* storage blocked */ }
  return new Set((JOB_TABS.find((t) => t.key === tab) || JOB_TABS[0]).cols);
}
const NEEDS_ACTION_STAGES = ['decide', 'projects', 'profile', 'review', 'ready'];
/** What the person does next, as a button label, for each step that waits on them. */
const NEXT_ACTION = { decide: 'Decide', projects: 'Pick projects', profile: 'Pick profile', review: 'Review proposal', ready: 'Mark as sent' };
/** The workflow step a stage opens at. */
const STEP_OF_STAGE = { decide: 1, projects: 2, profile: 3, review: 4 };
/** Where a job link goes: a job waiting on you opens the workflow at its step, anything else the job page. Same rule everywhere. */
const jobHref = (r) => (r.user_id === me.id && TAB_OF_STAGE[r.stage] ? `#/s/${r.id}/${TAB_OF_STAGE[r.stage]}` : '#/s/' + r.id);
const FILTER_KEYS = ['v', 'q', 'mine', 'from', 'to', 'rule', 'profile', 'user', 'outcome', 'stage', 'tab', 'ptype', 'source', 'tag', 'project', 'loom', 'sent_from', 'sent_to'];
/** The list's filters as API query parameters (the export uses the same ones). */
function jobQuery(st) {
  const qs = new URLSearchParams();
  const map = { v: 'verdict', q: 'q', from: 'from', to: 'to', rule: 'rule', profile: 'profile', user: 'user', outcome: 'outcome', stage: 'stage', tab: 'phase', ptype: 'ptype', source: 'source', tag: 'tag', project: 'project', loom: 'loom', sent_from: 'sent_from', sent_to: 'sent_to' };
  for (const [k, api] of Object.entries(map)) if (st[k]) qs.set(api, st[k]);
  if (st.mine) qs.set('mine', '1');
  return qs;
}
/** The one action a row offers, by where the job stands. */
function rowAction(r, reload) {
  if (r.status !== 'done' || !canTrack(r.user_id)) return null;
  const stop = (e) => e.stopPropagation();
  if (STEP_OF_STAGE[r.stage] && r.user_id === me.id) return h('a', { class: 'btn sm', href: jobHref(r), onclick: stop }, NEXT_ACTION[r.stage]);
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
  const tabsEl = h('div', { class: 'jobtabs', role: 'tablist' }), statsEl = h('div', { class: 'stats' }), bodyEl = h('div', {}), filters = h('div', {});
  let fbar = null;

  const sel = (key, label, options) => {
    const el = h('select', { 'aria-label': label, class: 'fsel' }, h('option', { value: '' }, label), options.map(([v, l]) => h('option', { value: v, selected: String(st[key]) === String(v) }, l)));
    el.onchange = () => { st[key] = el.value; st.page = 1; load(); };
    return el;
  };
  const dateIn = (key, label) => dateField(label, st[key], (v) => { st[key] = v; st.page = 1; load(); });
  const searchIn = h('input', { type: 'search', placeholder: 'Search jobs', 'aria-label': 'Search jobs', title: 'Search by job, client country, person, profile, rule or link', value: st.q });
  searchIn.oninput = debounce(() => { st.q = searchIn.value.trim(); st.page = 1; load().catch((x) => toast(x.message, true)); }, 300);
  const mineBox = h('input', { type: 'checkbox', id: 'mine', checked: st.mine }); mineBox.onchange = () => { st.mine = mineBox.checked; st.page = 1; load(); };
  const outcomes = [...new Set([...outcomeList(), ...opts.outcomes])];
  const colBtn = h('button', { class: 'btn', type: 'button' }, 'Columns');
  colBtn.onclick = () => modal({ title: `Columns to show in ${tab().label}`, noConfirm: true, body: h('div', { class: 'colpick' }, JOB_COLS.map((c) => {
    const cb = h('input', { type: 'checkbox', id: 'col-' + c.key, checked: cols.has(c.key) });
    cb.onchange = () => { if (cb.checked) cols.add(c.key); else cols.delete(c.key); try { localStorage.setItem('jobs.cols2.' + (st.tab || 'all'), JSON.stringify([...cols])); } catch { /* storage blocked */ } load(); };
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
    fbar = filterBar([h('div', { class: 'search' }, icon('search'), searchIn), dateIn('from', 'From'), dateIn('to', 'To'),
      stageOpts ? sel('stage', t.key === 'in_progress' ? 'Any step' : t.quiet ? 'Any submitted' : 'Skipped or failed', stageOpts) : null,
      sel('rule', 'Any rule', opts.rules.map((r) => [r.code, `${r.code}  ${r.rule}`])),
      sel('profile', 'Any profile', opts.profiles.map((p) => [p.id, p.name])),
      opts.users.length ? sel('user', 'Anyone', opts.users.map((u) => [u.id, u.name])) : null,
      t.key === 'closed' || t.key === 'submitted' || !t.key ? sel('outcome', 'Any outcome', [['none', 'No outcome yet'], ...outcomes.map((o) => [o, o])]) : null,
      (opts.types || []).length ? sel('ptype', 'Any proposal type', opts.types.map((x) => [x, x])) : null,
      sel('source', 'Written anywhere', [['app', 'Written in Upwork Pro'], ['claude_plugin', 'Written with the Claude plugin']]),
      me.role !== 'employee' ? h('label', { class: 'check', for: 'mine' }, mineBox, 'Only mine') : null],
      { actions: [colBtn, exportBtn], onClear: () => { location.hash = '#/history' + (st.tab ? '?tab=' + st.tab : ''); route(); } });
    filters.replaceChildren(fbar);
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
    if (fbar) fbar.setActive(filtered);
    const empty = { in_progress: 'Nothing in progress', submitted: 'Nothing submitted yet', closed: 'Nothing closed yet', not_pursued: 'Nothing skipped or failed' }[st.tab] || 'No jobs yet';
    const table = !rows.length
      ? emptyState('list', filtered ? 'No matches' : empty, filtered ? 'Try different filters.' : st.tab ? 'Jobs move here as they progress.' : 'Screen your first job to see it here.', filtered ? clearBtn.cloneNode(true) : st.tab ? null : h('a', { class: 'btn primary', href: '#/new' }, 'Screen a job'))
      : h('div', { class: 'tablewrap' }, h('table', { class: 'jobs' }, h('thead', {}, h('tr', {}, headCell('Job', 'title'), shown.map((c) => headCell(c.label, c.sort)), h('th', { class: 'pin' }, ''))),
        h('tbody', {}, rows.map((r) => h('tr', { class: 'click', tabindex: 0, onclick: () => (location.hash = '#/s/' + r.id), onkeydown: (e) => { if (e.key === 'Enter') location.hash = '#/s/' + r.id; } },
          h('td', { class: 'jobcell' }, h('span', { class: 'title' }, r.title || (r.input_type === 'link' ? 'Upwork link' : 'Pasted job text')), h('span', { class: 'meta' }, '#' + r.id, r.source === 'claude_plugin' ? h('span', { class: 'srcchip' }, 'Claude plugin') : null)),
          shown.map((c) => h('td', {}, c.cell(r))),
          // the row's action stays pinned to the right edge, visible however far the table scrolls
          h('td', { class: 'pin' }, rowAction(r, load)))))));
    if (!rows.length && filtered) table.querySelector('button')?.addEventListener('click', () => { location.hash = '#/history' + (st.tab ? '?tab=' + st.tab : ''); route(); });
    const EXTRA = { tag: 'Tag', project: 'Project shown', loom: 'Loom video', sent_from: 'Sent from', sent_to: 'Sent to' };
    const extras = Object.keys(EXTRA).filter((k) => st[k]);
    const note = extras.length ? h('div', { class: 'toolbar', style: 'gap:6px' }, h('span', { class: 'jp-label' }, 'Also filtered by'), extras.map((k) => h('button', { type: 'button', class: 'chip', title: 'Remove this filter', onclick: () => { st[k] = ''; st.page = 1; load(); } },
      `${EXTRA[k]}: ${k === 'loom' ? (st[k] === 'yes' ? 'with a video' : 'without a video') : k.startsWith('sent_') ? dayText(st[k]) : st[k]}`, h('span', { 'aria-hidden': 'true' }, ' ×')))) : null;
    bodyEl.replaceChildren(...[note, table, pager(total, st.page, (n) => { st.page = n; load(); })].filter(Boolean));
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
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'Fit with Stackup'), h('p', {}, j.fit)),
    j.proposal_notes.length ? h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'Notes for the proposal'),
      h('ul', { class: 'plain' }, j.proposal_notes.map((n) => h('li', {}, n)))) : null);
}

/** Step 1 while the gate runs: one spinner and plain words, inside the same workflow as every other step. */
function progressCard(status) {
  return h('div', { class: 'card progress', role: 'status', 'aria-live': 'polite' }, h('div', { class: 'ring' }),
    h('strong', { style: 'font-size:17px' }, status === 'running' ? 'Screening this job' : 'Waiting for a free slot'),
    h('p', { class: 'muted', style: 'margin:4px 0 0' }, status === 'running' ? 'Checking the job against the gate rules. ' : 'It starts as soon as a slot is free. ',
      'This usually takes under a minute. You can leave this page; the result is saved.'));
}


function matchingSection(s, initial) {
  const owner = s.user_id === me.id;
  const setActions = actionsFor();
  const box = h('div', {});
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
    return h('details', { class: 'card fold' },
      h('summary', {}, `Why these projects: the job's ${m.tags.length} tags`),
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
    const rec = rows.filter((r) => r.recommended), rest = rows.filter((r) => !r.recommended && !r.alternative), alt = rows.filter((r) => r.alternative);
    const POOL = { same: 'Same industry', related: 'Related industry', other: 'Other industry' };
    const card = (r) => {
      const on = picked.has(r.project_id), locked = !owner || !r.project_id || (picked.size >= pmax && !on);
      const cb = h('input', { type: 'checkbox', id: 'mp' + r.rank, checked: on, disabled: locked, 'aria-label': 'Select ' + r.project_name });
      cb.onchange = () => { if (cb.checked) picked.add(r.project_id); else picked.delete(r.project_id); draw(); };
      const toggle = (e) => { if (locked || e.target.closest('a, input')) return; cb.checked = !cb.checked; cb.onchange(); }; // the whole card picks the project
      return h('div', { class: 'mcard' + (on ? ' on' : '') + (r.recommended ? ' rec' : '') + (owner && !locked ? ' pickable' : ''), onclick: owner ? toggle : null },
        h('div', { class: 'mtop' }, owner ? cb : null, h('span', { class: 'rank' }, '#' + r.rank),
          h('div', { class: 'mname' }, r.project_id ? h('a', { href: '#/p/' + r.project_id }, r.project_name) : h('span', {}, r.project_name, h('span', { class: 'faint small' }, ' (removed from library)'))),
          r.recommended ? h('span', { class: 'chip brand' }, 'Recommended') : h('span', { class: 'chip' }, r.alternative ? 'Alternative' : 'Match')),
        POOL[r.pool] || r.platform ? h('div', { class: 'jp-label' }, [POOL[r.pool], r.platform && r.platform !== 'not known' ? 'Runs on ' + r.platform : null].filter(Boolean).join(' · ')) : null,
        h('div', { class: 'mscore' }, h('div', { class: 'bar', role: 'img', 'aria-label': `Score ${r.score} of ${r.max_score}` }, h('i', { style: `width:${Math.max(3, r.percent)}%` })),
          h('span', { class: 'sc' }, h('strong', {}, r.score), ` of ${r.max_score} · ${r.percent}%`)),
        r.compliance_gap ? h('div', { class: 'cgap' }, icon('warn'), `Missing ${r.compliance_gap} compliance tag${r.compliance_gap > 1 ? 's' : ''} this job needs`) : null,
        h('div', { class: 'chips' }, r.shared.map((t) => h('span', { class: 'chip', title: `${t.category}, weight ${t.weight}` }, t.name, h('span', { class: 'faint' }, ' ×' + t.weight)))));
    };
    return h('div', { class: 'stack' },
      h('div', { class: 'card card-pad' },
        h('div', { class: 'row spread' }, h('div', { class: 'jp-sec' }, owner && !m.confirmed_at ? `Choose ${range} project${pmax === 1 ? '' : 's'} for the proposal` : 'Projects for the proposal'), owner ? count : null),
        m.job_needs ? h('p', { class: 'jp-body', style: 'margin:2px 0 4px' }, h('strong', {}, 'Job needs: '), m.job_needs) : null,
        h('div', { class: 'jp-label', style: 'margin:2px 0 12px' }, m.confirmed_at ? `Confirmed${m.confirmed_by ? ' by ' + m.confirmed_by : ''} ${dateTxt(m.confirmed_at)}.${owner ? ' Pick others to change it.' : ''}`
          : owner ? 'The recommended ones are ticked. Swap them if you like, then confirm at the top right.' : 'Only the person who submitted this job can choose the projects.'),
        err,
        h('div', { class: 'mgrid' }, rec.map(card)), rest.length ? h('div', { class: 'mgrid', style: 'margin-top:12px' }, rest.map(card)) : null,
        alt.length ? h('div', { style: 'margin-top:16px' }, h('div', { class: 'jp-sec' }, 'Alternative from another industry'),
          h('p', { class: 'jp-label', style: 'margin:2px 0 10px' }, 'It shares much more with this job than the best project from the same industry. Use it when the work matters more than the industry.'),
          h('div', { class: 'mgrid' }, alt.map(card))) : null,
        owner && picked.size >= pmax ? h('p', { class: 'jp-label', style: 'margin:10px 0 0' }, 'Untick one to choose a different project.') : null,
        h('p', { class: 'jp-label', style: 'margin:10px 0 0' }, 'Score: the weights of the tags a project shares with this job (industry not counted). Projects from the job\'s industry come first, then related industries. Projects that do not run on what the job builds are left out.')));
  }


  function draw() {
    let body;
    if (busy()) {
      body = h('div', { class: 'progress', role: 'status', 'aria-live': 'polite' }, h('div', { class: 'ring' }),
        h('strong', { style: 'font-size:17px' }, m.status === 'running' ? 'Reading the job and choosing tags' : 'Waiting for a free slot'),
        h('p', { class: 'muted', style: 'margin-top:4px' }, 'Then the tags are matched with the project library. This usually takes a minute or two. You can leave this page.'));
    } else if (m.status === 'error') {
      if (owner) setActions(actBtn('Try again', (e) => start(e.currentTarget), true));
      body = h('div', { class: 'card card-pad' }, h('div', { class: 'jp-sec' }, 'Project matching did not finish'), h('p', { class: 'jp-body', style: 'margin:6px 0 0' }, m.error || 'Something went wrong.'));
    } else if (m.status === 'done') {
      body = h('div', { class: 'stack' }, matchesBlock(), m.tags && m.tags.length ? tagsBlock() : null);
    } else { // continued before this step existed
      if (owner) setActions(actBtn('Find matching projects', (e) => start(e.currentTarget), true));
      body = h('div', { class: 'card card-pad' }, h('div', { class: 'jp-sec' }, 'Match this job with projects'), h('p', { class: 'jp-body', style: 'margin:6px 0 0' }, 'The job is tagged and compared with the project library.'));
    }
    if (busy()) setActions();
    box.replaceChildren(busy() ? h('div', { class: 'card' }, body) : body);
  }
  draw(); if (busy()) timer = setTimeout(poll, 2500);
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
    ['Connects cost', s.connects_cost], ['Sample match', s.sample_match], ['Verdict', s.verdict], ['Fail reasons', s.fail_reasons],
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

/** Choose the one Upwork profile the proposal is sent from, as cards in a grid. Confirming it writes the proposal and opens it. */
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
        toast(r.started ? 'Writing the proposal…' : 'Profile saved'); chosen = undefined;
        if (stepCtx) await stepCtx.advanceTo(3); else route();
      } catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; b.disabled = false; b.replaceChildren(saved ? 'Use this profile instead' : 'Confirm and write proposal'); }
    };
    if (owner) setActions(!saved ? actBtn('Confirm and write proposal', confirmIt, true) : current && current !== saved.id ? actBtn('Use this profile instead', confirmIt, true) : null);
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
        : owner ? 'Pick one, then confirm at the top right: the proposal is written straight after.' : 'Chosen by the person who submitted this job.'),
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
    if (busy) setTimeout(refresh, 4000);
    body.replaceChildren(busy ? h('div', { class: 'row muted' }, h('span', { class: 'spin' }), 'Reading the job post into fields...')
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
  if (!proposal || proposal.status === 'queued' || proposal.status === 'running') return 'writing';
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
  return [
    h('a', { href: lastList.history, class: 'jp-back' }, icon('back'), 'Jobs'),
    h('div', { class: 'jp-title' }, h('h1', {}, title), s.verdict ? verdictBadge(s.verdict) : null,
      label ? h('span', { class: 'jp-stage' }, n ? `Step ${n} of 5 · ${label}` : label) : null),
    h('div', { class: 'jp-meta' }, bits.flatMap((b, i) => (i ? [sep(), b] : [b]))),
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
  ['proposal', 'Proposal', 3], ['tracking', 'Tracking', 4], ['history', 'History']];
const STEP_TAB = ['screening', 'projects', 'profile', 'proposal', 'tracking'];
/** The tab a job opens on when it is waiting on you. */
const TAB_OF_STAGE = { screening: 'screening', failed: 'screening', decide: 'screening', projects: 'projects', profile: 'profile', writing: 'proposal', review: 'proposal' };
/** The tab row's button slot, set while a job page is on screen. */
let tabActions = null, tabGen = 0;
const setActions = (...btns) => { if (tabActions) tabActions(btns.flat().filter(Boolean)); };
/** A section's own setter: it only works while the tab that built the section is still on screen, so a section that finishes
 *  loading after you switched tabs can never put its buttons on another tab. */
const actionsFor = () => { const g = tabGen; return (...btns) => { if (g === tabGen) setActions(...btns); }; };
const actBtn = (label, onclick, primary = false) => h('button', { class: 'btn sm' + (primary ? ' primary' : ''), type: 'button', onclick }, label);

async function jobPage(id, want) {
  let { screening: s, override, matching, proposal } = await api('GET', '/screenings/' + id);
  if (!new RegExp(`^#/s/${id}(/|$|[?])`).test(location.hash)) return; // you moved on while this job loaded: never draw it over the next page
  const owner = s.user_id === me.id, canEdit = owner || me.role === 'admin' || me.role === 'manager';
  let st = stepState(matching, proposal), stage = stageOf(s, matching, proposal);
  const stepOf = (k) => STEP_TAB.indexOf(k);
  const defaultTab = () => (s.status !== 'done' ? 'screening' : (owner && TAB_OF_STAGE[stage]) || 'overview');
  let tab = JOBPAGE_TABS.some(([k]) => k === want) ? want : defaultTab();
  if (stepOf(tab) > 0 && !st.unlocked[stepOf(tab)]) tab = defaultTab();
  const tabsEl = h('div', { class: 'jobtabs', role: 'tablist', 'aria-label': 'Job sections' });
  const actionsEl = h('div', { class: 'jobacts' });
  const bar = h('div', { class: 'jobbar' }, tabsEl, actionsEl);
  const content = h('div', { class: 'jobtab' });
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
    s = d.screening; override = d.override; matching = d.matching; proposal = d.proposal;
    st = stepState(matching, proposal); stage = stageOf(s, matching, proposal); drawTabs();
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

  // ---- Overview: where it stands, what is next (its button is in the tab row), and the facts that have a value
  function overviewTab() {
    const who = owner ? '' : ` Waiting for ${s.user_name}.`;
    const next = {
      screening: ['Screening this job', 'This takes about a minute.'],
      failed: ['The screening did not finish', s.error_message || ''],
      decide: ['Decide: continue or skip', `The gate says ${vword(s.verdict)}${s.rule_codes ? ' (' + s.rule_codes + ')' : ''}.${who}`],
      projects: ['Pick the projects', 'Choose the projects the proposal will show.' + who],
      profile: ['Pick the profile', 'Choose the Upwork profile that sends it; the proposal is written straight after.' + who],
      writing: ['The proposal is being written', 'A few minutes. You can leave this page.'],
      review: ['Review and finish the proposal', 'Read it, edit it or ask the AI, then finish it.' + who],
      ready: ['Ready to send', 'Send it on Upwork, then mark it as sent.'],
      submitted: ['Waiting on the client', 'Record what happens: viewed, chat, interview, outcome.'],
      closed: [`Closed: ${s.outcome || 'done'}`, s.outcome_reason ? s.outcome_reason + (s.outcome_note ? ': ' + s.outcome_note : '') : ''],
      skipped: ['Skipped', s.notes || 'Not pursued.'],
    }[stage] || ['', ''];
    const go = (k, label) => actBtn(label, () => setTab(k), true);
    setActions({
      failed: owner && go('screening', 'Open screening'), decide: owner && go('screening', 'Decide'), projects: owner && go('projects', 'Pick projects'),
      profile: owner && go('profile', 'Pick profile'), writing: go('proposal', 'Open the proposal'), review: owner && go('proposal', 'Review proposal'),
      ready: canEdit && actBtn('Mark as sent', statusUpdate, true), submitted: canEdit && actBtn('Update status', statusUpdate, true), closed: canEdit && actBtn('Update status', statusUpdate),
    }[stage] || null);
    const chosen = matching && matching.confirmed_at ? matching.matches.filter((x) => x.selected) : [];
    const toProposal = proposal && proposal.finished_at && s.source !== 'claude_plugin' ? Math.round((toDate(proposal.finished_at) - toDate(s.created_at)) / 1000) : null;
    const status = s.outcome && s.outcome !== 'Pending' ? s.outcome : s.interviewed === 'yes' ? 'Interview' : s.client_replied === 'yes' ? 'Chat opened' : s.client_viewed === 'yes' ? 'Viewed' : s.proposal_sent_at || s.proposal_sent_date ? 'Sent' : null;
    const facts = [
      ['Verdict', s.verdict ? `${VERDICT_WORD[s.verdict]}${s.rule_codes ? ' · ' + s.rule_codes : ''}` : null],
      ['Decision', override ? `Continued past the ${vword(override.verdict_at_time)}` : matching && matching.continued ? 'Continued' : s.proceeded === 'no' ? 'Skipped' : null],
      ['Projects', chosen.length ? chosen.map((x) => x.project_name).join(', ') : null],
      ['Profile', matching && matching.proposal_profile ? matching.proposal_profile.name : null],
      ['Proposal type', proposal && proposal.template ? proposal.template.name : null],
      ['Proposal', proposal ? (proposal.finalized_at ? 'Finished ' + agoIn(proposal.finalized_at) : proposal.status === 'done' ? 'Written, not finished' : null) : null],
      ['Status', status], ['Sent', s.proposal_sent_date ? dayText(s.proposal_sent_date) : null],
      ['Connects', s.connects_spent != null ? `${s.connects_spent}${s.boost_connects ? ' + ' + s.boost_connects + ' boost' : ''}` : null],
      ['Paste to proposal', toProposal != null ? mins(toProposal) : null],
      ['Client', s.client_country], ['Budget', s.budget], ['Hire rate', s.hire_rate], ['Avg hourly paid', s.avg_hourly_paid],
    ].filter(([, v]) => v);
    return h('div', { class: 'stack' },
      next[0] ? h('div', { class: 'card card-pad nextline' }, h('div', { class: 'jp-sec' }, next[0]), next[1] ? h('div', { class: 'jp-label' }, next[1]) : null) : null,
      facts.length ? h('div', { class: 'card card-pad' }, h('dl', { class: 'facts' }, facts.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, cap(v)))))) : null);
  }

  // ---- Screening: the verdict, the flags and the decision first; the job, client and competition facts after, collapsed
  function screeningTab() {
    if (s.status === 'queued' || s.status === 'running') return h('div', { class: 'stack' }, progressCard(s.status));
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
    // the decision
    if (decided) {
      parts.push(h('div', { class: 'card card-pad' }, h('div', { class: 'jp-sec' }, override ? `Continued despite the ${vword(override.verdict_at_time)}` : 'Continued'),
        override ? h('p', { class: 'jp-body', style: 'margin:6px 0 0' }, override.reason) : null,
        h('div', { class: 'jp-label' }, override ? `${override.user_name} · ${full(override.created_at)}` : 'Taken forward to the projects.')));
    } else if (!owner) {
      parts.push(h('div', { class: 'card card-pad' }, h('p', { class: 'jp-body', style: 'margin:0' }, s.proceeded === 'no' ? 'Skipped.' : `No decision yet. Only ${s.user_name} can continue with this job.`)));
    } else {
      const needReason = j.verdict !== 'PASS', minLen = cfg('override.min_reason', 15);
      const ta = needReason ? h('textarea', { id: 'why', style: 'min-height:84px', placeholder: 'For example: the client has a strong history with us, and the scope was clarified on a call.' }) : null;
      const err = h('div', { class: 'err', hidden: true });
      const fail = (msg) => { err.replaceChildren(icon('x'), msg); err.hidden = false; if (ta) ta.focus(); };
      if (ta) ta.oninput = () => { err.hidden = true; };
      const cont = actBtn('Continue', async (e) => {
        const reason = ta ? ta.value.trim() : '';
        if (needReason && reason.length < minLen) return fail(`Write why you continue (at least ${minLen} characters). It stays on record.`);
        const b = e.currentTarget; btnBusy(b, 'Continuing');
        try { await api('POST', `/screenings/${s.id}/${needReason ? 'override' : 'continue'}`, needReason ? { reason } : {}); await stepCtx.advanceTo(1); }
        catch (x) { fail(x.message); b.disabled = false; b.replaceChildren('Continue'); }
      }, true);
      const skip = actBtn('Skip', async (e) => {
        const b = e.currentTarget; btnBusy(b, 'Skipping');
        try { await api('PATCH', `/screenings/${s.id}/tracking`, { proceeded: 'no', ...(ta && ta.value.trim() ? { notes: ta.value.trim() } : {}) }); toast('Skipped. It is under Not pursued.'); await refresh(); drawContent(); }
        catch (x) { fail(x.message); b.disabled = false; b.replaceChildren('Skip'); }
      });
      setActions(s.proceeded === 'no' ? null : skip, cont);
      parts.push(h('div', { class: 'card card-pad' },
        h('div', { class: 'jp-sec' }, s.proceeded === 'no' ? 'You skipped this job. Continue anyway?' : needReason ? `Continue despite the ${vword(j.verdict)}?` : 'Continue with this job?'),
        h('div', { class: 'jp-label', style: 'margin-bottom:10px' }, needReason ? 'Write why. The reason stays on record, visible to managers and admins. Continue and Skip are at the top right.' : 'Continue to match it with projects, or skip it. The buttons are at the top right.'),
        ta, err));
    }
    if (j.fails.length) parts.push(h('div', { class: 'card card-pad' }, h('div', { class: 'jp-sec' }, `Failed rules (${j.fails.length})`), issues(j.fails, 'fail'),
      j.override_note ? h('p', { class: 'jp-label', style: 'margin-top:10px' }, j.override_note) : null));
    if (j.flags.length) parts.push(h('div', { class: 'card card-pad' }, h('div', { class: 'jp-sec' }, `Flags (${j.flags.length})`), issues(j.flags, 'flag')));
    parts.push(h('div', { class: 'card card-pad' }, h('div', { class: 'jp-sec' }, 'Fit with Stackup'), h('p', { class: 'jp-body', style: 'margin:6px 0 0' }, j.fit),
      j.proposal_notes.length ? [h('div', { class: 'jp-sec', style: 'margin-top:14px' }, 'Notes for the proposal'), h('ul', { class: 'jp-list' }, j.proposal_notes.map((n) => h('li', {}, n)))] : null));
    const facts = (t, rows) => h('div', {}, h('div', { class: 'jp-label', style: 'margin-bottom:6px' }, t),
      h('dl', { class: 'facts one' }, rows.map((r) => h('div', {}, h('dt', {}, r.label), h('dd', { class: /^not shown$/i.test(r.value.trim()) ? 'ns' : '' }, cap(r.value))))));
    parts.push(h('details', { class: 'card fold' }, h('summary', {}, 'Job, client and competition'),
      h('div', { class: 'card-pad threecol' }, facts('Job', j.job), facts('Client', j.client), facts('Competition', j.competition))));
    return h('div', { class: 'stack' }, parts);
  }

  // ---- Tracking: the status history; Update status and Edit details in the tab row
  function trackingTab() {
    const setActions = actionsFor();
    const box = h('div', { class: 'stack' }, h('div', { class: 'card card-pad' }, h('div', { class: 'skel', style: 'width:50%' })));
    const details = async () => {
      const { videos } = await api('GET', '/looms');
      // the sending profile's videos first; a video that was sent before stays in the list even if it was disabled since
      const mine = videos.filter((v) => (Number(v.active) || v.id === s.loom_video_id) && (!s.upwork_profile_id || v.profile_id === s.upwork_profile_id));
      const loom = h('select', { id: 'tl', style: 'width:100%' }, h('option', { value: '' }, 'No Loom video'), mine.map((v) => h('option', { value: v.id, selected: v.id === s.loom_video_id }, v.title + (s.upwork_profile_id ? '' : ' (' + v.profile_name + ')'))));
      const c = h('input', { type: 'number', id: 'tc', min: 0, max: 1000, value: s.connects_spent ?? '' });
      const bo = h('input', { type: 'number', id: 'tb', min: 0, max: 1000, value: s.boost_connects ?? '' });
      const no = h('textarea', { id: 'tn', style: 'min-height:80px', maxlength: 4000 }); no.value = s.notes || '';
      modal({ title: 'Edit details', confirm: 'Save', body: h('div', { class: 'stack' },
        h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tc' }, 'Connects spent'), c), h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tb' }, 'Boost (Connects)'), bo)),
        h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tl' }, 'Loom video sent with the proposal'), loom,
          h('div', { class: 'hint' }, mine.length ? 'Recorded so the reports can compare proposals with a video against those without.' : 'This profile has no Loom videos yet. An admin adds them under Loom videos.')),
        h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tn' }, 'Notes'), no)),
        onConfirm: async () => {
          const num = (el) => (el.value === '' ? null : Number(el.value));
          await api('PATCH', `/screenings/${id}/tracking`, { connects_spent: num(c), boost_connects: num(bo), notes: no.value.trim() || null, loom_video_id: num(loom) });
          toast('Saved'); await refresh(); drawContent();
        } });
    };
    api('GET', `/screenings/${id}/status`).then((d) => {
      if (!box.isConnected) return;
      if (canEdit) setActions(actBtn('Edit details', details), actBtn(d.current ? 'Update status' : 'Mark as sent', statusUpdate, true));
      const ev = d.events;
      box.replaceChildren(
        h('div', { class: 'card card-pad' }, h('div', { class: 'jp-label' }, 'Status now'), h('div', { class: 'jp-sec' }, d.current || 'Not sent yet'),
          !d.current ? h('div', { class: 'jp-label' }, 'Mark it as sent once it is submitted on Upwork.') : null),
        h('div', { class: 'card card-pad' }, h('div', { class: 'jp-sec' }, 'History'),
          ev.length ? h('ol', { class: 'statuslist' }, ev.map((e) => h('li', {}, h('span', { class: 'jp-sec' }, e.status),
            h('span', { class: 'jp-label' }, ` ${full(e.happened_at)}${e.user_name ? ' · ' + e.user_name : ''}`), e.reason ? h('div', { class: 'jp-label' }, e.reason) : null))) : h('p', { class: 'jp-label' }, 'Nothing recorded yet.')),
        h('div', { class: 'card card-pad' }, h('dl', { class: 'facts' }, [['Connects spent', s.connects_spent], ['Boost', s.boost_connects], ['Loom video', s.loom_video_title], ['Notes', s.notes]].map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', { class: v == null || v === '' ? 'ns' : '' }, v == null || v === '' ? 'Not recorded' : String(v)))))));
    }).catch((x) => box.replaceChildren(h('div', { class: 'card card-pad' }, h('p', { class: 'err' }, x.message))));
    return box;
  }

  function historyTab() {
    const tl = timelineCard(id); setTimeout(() => { tl.open = true; tl.dispatchEvent(new Event('toggle')); });
    return h('div', { class: 'stack' }, tl, h('details', { class: 'card fold' }, h('summary', {}, 'Record details'), recordDetails(s, override, matching, proposal)));
  }

  function drawContent() {
    active = null; tabGen++; setActions();
    const build = {
      overview: overviewTab, post: () => postingCard(s, true, actionsFor()), screening: screeningTab,
      projects: () => (matching && matching.continued ? matchingSection(s, matching) : h('div', { class: 'card card-pad' }, h('p', { class: 'jp-body', style: 'margin:0' }, 'Decide on the Screening tab first.'))),
      profile: () => profileSection(s, matching), proposal: () => proposalSection(s, proposal, matching), tracking: trackingTab, history: historyTab,
    }[tab];
    const el = build(); content.replaceChildren(el); active = el;
  }

  if (s.status === 'queued' || s.status === 'running') setTimeout(() => { if (new RegExp(`^#/s/${id}(/|$|[?])`).test(location.hash)) route(); }, 2500);
  history.replaceState(null, '', `#/s/${id}/${tab}`);
  drawTabs(); drawContent();
  shell('history', h('div', { class: 'jobpage' }, ...jobHeader(s, stage), bar, content));
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
  shell('industries', [pageHead('Industries', 'The industries Stackup has worked in. A project can belong to several industries, and an industry can have several projects.', add),
    listCard({ items: industries, icon: 'building', emptyTitle: 'No industries yet', emptyText: 'Add the industries Stackup has worked in.',
      search: { placeholder: 'Search industries', text: (i) => i.name + ' ' + (i.description || '') + ' ' + i.projects.map((p) => p.name).join(' ') },
      filters: [statusFilter((i) => i.active)],
      onSync: () => { lastList.industries = location.hash; },
      render: (slice) => dataTable(['Industry', 'Projects', 'Status', canEdit ? '' : null], slice.map((i) => h('tr', { class: 'click', tabindex: 0, onclick: open(i), onkeydown: (e) => { if (e.key === 'Enter') open(i)(); } },
        h('td', {}, h('strong', {}, i.name), i.description ? h('div', { class: 'meta' }, i.description.slice(0, 90)) : null),
        h('td', {}, i.projects.length ? h('div', { class: 'chips' }, i.projects.slice(0, 3).map((p) => h('span', { class: 'chip' }, p.name)),
          i.projects.length > 3 ? h('span', { class: 'chip', title: 'Show all ' + i.projects.length + ' projects' }, '+' + (i.projects.length - 3)) : null) : h('span', { class: 'faint' }, 'No projects yet')),
        h('td', {}, onOff(i.active)),
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

  function tagDialog(t) {
    const f = { name: h('input', { type: 'text', id: 'tn1', maxlength: 120, value: t ? t.name : '' }),
      cat: h('select', { id: 'tc1', style: 'width:100%' }, categories.map((c) => h('option', { value: c.id, selected: t ? c.id === t.category_id : c.id === (Number(hashParams().cat) || categories[0].id) }, c.name))),
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
  const tagsList = () => listCard({ items: all, icon: 'tag', emptyTitle: 'No tags yet', emptyText: 'Add the tags jobs and projects are described with.',
    search: { placeholder: 'Search tags', text: (t) => t.name + ' ' + (t.description || '') },
    filters: [{ key: 'cat', label: 'Any category', options: categories.map((c) => [c.id, c.name]), test: (t, v) => String(t.category_id) === v }, statusFilter((t) => t.active, 'Disabled')],
    render: (slice) => dataTable(['Tag', 'Category', 'Score', 'Projects', 'Status', ''], slice.map((t) => {
      const inp = h('input', { type: 'number', class: 'scoreinp', min: 0, max: 10, step: 1, value: t.weight, 'aria-label': 'Score for ' + t.name });
      inp.onchange = () => saveScore(t, inp);
      return h('tr', {}, h('td', {}, h('strong', {}, t.name), t.description ? h('div', { class: 'meta' }, t.description.slice(0, 100)) : null), h('td', { class: 'muted' }, t.category), h('td', {}, inp),
        h('td', { class: 'muted' }, t.project_count), h('td', {}, onOff(t.active, 'Active', 'Disabled')),
        acts(h('button', { class: 'btn sm', onclick: () => tagDialog(t) }, 'Edit'),
          h('button', { class: 'btn sm', onclick: async () => { try { await api('PATCH', '/admin/tags/' + t.id, { active: !Number(t.active) }); toast(Number(t.active) ? 'Tag disabled' : 'Tag enabled'); } catch (x) { toast(x.message, true); } route(); } }, Number(t.active) ? 'Disable' : 'Enable')));
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
  shell('dictionary', [pageHead('Tag dictionary', 'The tags jobs and projects are described with. The score is what a shared tag is worth when a job is matched to projects.', actionsEl), tabsEl, bodyEl], true);
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
  const toggle = async (p) => { try { await api('PATCH', '/profiles/' + p.id, { active: !Number(p.active) }); toast(Number(p.active) ? 'Profile disabled' : 'Profile enabled'); } catch (x) { toast(x.message, true); } route(); };
  const remove = (p) => modal({ title: 'Delete ' + p.name + '?', confirm: 'Delete profile', danger: true,
    body: h('p', { class: 'muted' }, 'A profile that already has screenings cannot be deleted. Disable it instead and it disappears from the screening form.'),
    onConfirm: async () => { await api('DELETE', '/profiles/' + p.id); document.querySelectorAll('dialog').forEach((d) => d.close()); toast('Profile deleted'); route(); } });
  const row = (p) => h('tr', {},
    h('td', {}, h('strong', {}, p.name), p.added_via === 'claude_plugin' ? h('span', { class: 'srcchip' }, 'Added by the Claude plugin') : null,
      p.services ? h('div', { class: 'meta' }, p.services.slice(0, 90)) : p.notes ? h('div', { class: 'meta' }, p.notes.slice(0, 80)) : null,
      p.profile_url ? h('div', { class: 'meta' }, h('a', { href: p.profile_url, target: '_blank', rel: 'noopener noreferrer' }, 'Open on Upwork')) : null),
    h('td', {}, p.tagline ? h('span', {}, p.tagline) : h('span', { class: 'faint' }, 'Not set')),
    h('td', { class: 'nowrap' }, p.price !== null && p.price !== undefined ? money(p.price) + ' / hr' : h('span', { class: 'faint' }, 'Not set')),
    h('td', {}, (() => { const g = gitlabLink(p.gitlab_account) || (p.github_url ? { href: p.github_url, label: p.github_url.replace(/^https?:\/\//, '') } : null); return g ? h('a', { href: g.href, target: '_blank', rel: 'noopener noreferrer' }, g.label) : h('span', { class: 'faint' }, 'Not set'); })()),
    h('td', {}, onOff(p.active, 'Active', 'Disabled')),
    acts(h('button', { class: 'btn sm', onclick: () => edit(p) }, 'Edit'),
      h('button', { class: 'btn sm', onclick: () => toggle(p) }, Number(p.active) ? 'Disable' : 'Enable')));
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
    mine.length ? dataTable(['Video', 'Tags', 'Status', ''], mine.map((v) => h('tr', {},
      h('td', {}, h('a', { href: v.url, target: '_blank', rel: 'noopener noreferrer' }, h('strong', {}, v.title)), v.topic ? h('div', { class: 'meta' }, v.topic) : null),
      h('td', {}, v.tags.length ? h('div', { class: 'chips' }, v.tags.map((t) => h('span', { class: 'chip' }, t.name))) : h('span', { class: 'faint' }, 'No tags: never suggested')),
      h('td', {}, onOff(v.active, 'Active', 'Disabled')),
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
  const LINKS = [['landing_link', 'Landing page link'], ['system_link', 'System link'], ['mobile_link', 'Mobile link (store links, space separated)'], ['staging_link', 'Staging link'], ['case_study_link', 'Case study link']];
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
  shell('projects', [pageHead('Projects', "Stackup's delivered work. Tags are how a new job is matched to the projects that prove the same kind of work.", add),
    listCard({ items: projects, icon: 'folder', emptyTitle: 'No projects yet', emptyText: 'Add the projects Stackup has delivered.',
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
        h('td', {}, onOff(p.active)),
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
      kv('Proposal link', link), kv('Landing page', ext(p.landing_link)), kv('System', ext(p.system_link)), kv('Mobile', urlList(p.mobile_link)),
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
    h('td', {}, h('div', { class: 'row', style: 'gap:10px;flex-wrap:nowrap' }, h('div', { class: 'avatar' }, initials(u.name)),
      h('div', {}, h('strong', {}, u.name, u.id === me.id ? h('span', { class: 'faint', style: 'font-weight:400' }, ' (you)') : null), h('div', { class: 'meta' }, u.email)))),
    h('td', {}, u.id === me.id ? 'Admin' : roleSel(u.role, (e) => patch(u.id, { role: e.target.value }, 'Role updated'))),
    h('td', {}, onOff(u.active, 'Active', 'Disabled')),
    h('td', { class: 'muted nowrap', title: full(u.created_at) }, ago(u.created_at)),
    u.id === me.id ? acts() : acts(h('button', { class: 'btn sm', onclick: () => resetPw(u) }, 'Reset password'),
      h('button', { class: 'btn sm', onclick: () => patch(u.id, { active: !Number(u.active) }, Number(u.active) ? 'User disabled' : 'User enabled') }, Number(u.active) ? 'Disable' : 'Enable')));
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

// ---------- logs (admin): activity and AI calls ----------
async function auditView() {
  const hp = hashParams();
  const st = { tab: hp.tab === 'calls' ? 'calls' : 'activity', page: Math.max(1, Number(hp.page) || 1), action: hp.action || '', user: hp.user || '', from: hp.from || '', to: hp.to || '', kind: hp.kind || '', ok: hp.ok || '', model: hp.model || '', job: hp.job || '' };
  const opts = await api('GET', '/screenings/filter-options');
  const holder = h('div', { class: 'card' });
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const drawTabs = () => tabs.replaceChildren(...[['activity', 'Activity'], ['calls', 'AI calls']].map(([k, l]) =>
    h('button', { type: 'button', role: 'tab', 'aria-selected': st.tab === k, class: 'tab' + (st.tab === k ? ' on' : ''), onclick: () => { st.tab = k; st.page = 1; drawTabs(); load(); } }, l)));
  drawTabs();
  const sel = (key, label, options) => { const el = h('select', { class: 'fsel', 'aria-label': label }, h('option', { value: '' }, label), options.map(([v, l]) => h('option', { value: v, selected: String(st[key]) === String(v) }, l))); el.onchange = () => { st[key] = el.value; st.page = 1; load(); }; return el; };
  const dateIn = (key, label) => dateField(label, st[key], (v) => { st[key] = v; st.page = 1; load(); });
  const secs = (ms) => (ms / 1000).toFixed(1) + ' s';
  /** The shared filter bar; Clear empties the keys this tab filters by. */
  const bar = (controls, keys) => { const b = filterBar(controls, { onClear: () => { for (const k of keys) st[k] = ''; st.page = 1; load(); } }); b.setActive(keys.some((k) => st[k])); return b; };
  async function load() {
    const keys = st.tab === 'calls' ? ['kind', 'ok', 'model', 'from', 'to', 'job'] : ['action', 'user', 'from', 'to'];
    const q = new URLSearchParams({ page: st.page }); for (const k of keys) if (st[k]) q.set(k, st[k]);
    setHashParams({ tab: st.tab === 'activity' ? '' : st.tab, page: st.page, ...Object.fromEntries(['action', 'user', 'from', 'to', 'kind', 'ok', 'model', 'job'].map((k) => [k, keys.includes(k) ? st[k] : ''])) });
    if (st.tab === 'activity') {
      const d = await api('GET', '/admin/audit?' + q);
      holder.replaceChildren(bar([sel('action', 'Any action', d.actions.map((a) => [a, cap(a.replace(/_/g, ' '))])), sel('user', 'Anyone', opts.users.map((u) => [u.id, u.name])), dateIn('from', 'From'), dateIn('to', 'To')], ['action', 'user', 'from', 'to']),
        d.log.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['When', 'Who', 'Action', 'Detail'].map((t) => h('th', {}, t)))),
          h('tbody', {}, d.log.map((l) => h('tr', {}, h('td', { class: 'muted nowrap', title: full(l.created_at) }, ago(l.created_at)), h('td', { class: 'nowrap' }, l.user_name || 'System'),
            h('td', { class: 'nowrap' }, cap(l.action.replace(/_/g, ' '))), h('td', { class: 'mono muted', style: 'overflow-wrap:anywhere' }, l.detail || '')))))) : emptyState('audit', 'Nothing here', 'No activity matches these filters.'),
        pager(d.total, d.page, (n) => { st.page = n; load(); }));
    } else {
      const d = await api('GET', '/admin/calls?' + q);
      const errs = d.summary.reduce((a, r) => a + r.errors, 0), all = d.summary.reduce((a, r) => a + r.calls, 0);
      holder.replaceChildren(bar([sel('kind', 'Any job type', d.kinds.map((k) => [k, cap(k.replace(/_/g, ' '))])), sel('ok', 'Any result', [['1', 'Succeeded'], ['0', 'Failed']]),
          sel('model', 'Any model', d.models.map((m) => [m, m])), dateIn('from', 'From'), dateIn('to', 'To')], ['kind', 'ok', 'model', 'from', 'to', 'job']),
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
  const toggle = async (r) => { await api('PATCH', '/admin/rules/' + r.code, { active: !r.active }); toast(r.code + (r.active ? ' retired' : ' restored')); route(); };
  const row = (r) => h('tr', { class: r.active ? '' : 'retired' },
    h('td', {}, h('span', { class: 'code ' + (r.type === 'fail' ? 'F' : 'G') }, r.code)),
    h('td', {}, h('span', { class: 'vbadge ' + (r.type === 'fail' ? 'FAIL' : 'FLAG') }, r.type === 'fail' ? 'Fail' : 'Flag')),
    h('td', { style: 'white-space:normal' }, r.rule, r.details ? h('div', { class: 'meta', style: 'margin-top:2px' }, 'How to apply: ' + r.details) : null),
    h('td', { class: 'nowrap' }, r.fired ? h('a', { href: `#/history?rule=${r.code}` }, `${r.fired} job${r.fired === 1 ? '' : 's'}`) : h('span', { class: 'faint' }, 'None')),
    h('td', {}, onOff(r.active, 'Active', 'Retired')),
    acts(h('button', { class: 'btn sm', onclick: () => edit(r) }, 'Edit'), h('button', { class: 'btn sm', onclick: () => toggle(r) }, r.active ? 'Retire' : 'Restore')));
  shell('rules', [pageHead('Rules', 'The fail and flag rules the gate applies. Codes are never renumbered or reused: a rule is reworded or retired, and a new meaning gets a new code.',
      [h('button', { class: 'btn', onclick: () => add('flag') }, icon('screen'), 'Add flag rule'), h('button', { class: 'btn primary', onclick: () => add('fail') }, icon('screen'), 'Add fail rule')]),
    h('div', { class: 'notice' }, icon('info'), h('span', {}, 'Every active rule, with its "How to apply" note, is added after the ', h('a', { href: '#/skill' }, 'Gate instructions'), ' for every job. A change here applies from the next job on, and each job keeps the rules it was screened against.')),
    listCard({ items: rules, paged: false, icon: 'warn', emptyTitle: 'No rules yet', emptyText: 'Add the first fail or flag rule.',
      search: { placeholder: 'Search rules', text: (r) => r.code + ' ' + r.rule + ' ' + (r.details || '') },
      filters: [{ key: 'type', label: 'Fail and flag', options: [['fail', 'Fail rules'], ['flag', 'Flag rules']], test: (r, v) => r.type === v },
        { key: 'status', label: 'Any status', options: [['1', 'Active'], ['0', 'Retired']], test: (r, v) => String(Number(!!r.active)) === v },
        { key: 'fired', label: 'Fired or not', options: [['1', 'Fired on a job'], ['0', 'Never fired']], test: (r, v) => String(Number(r.fired > 0)) === v }],
      render: (slice) => dataTable(['Code', 'Type', 'Rule', 'Fired on', 'Status', ''], slice.map(row), 'rulestable') })], true);
}

// ---------- writing guide: what the Claude plugin writes by (proposal types, rules, banned phrases, modules, screening answers, checklist) ----------
const WG_KIND = { type: 'Proposal type', rules: 'Writing rules', banned: 'Banned phrases', modules: 'Modules', screening: 'Screening answers', checklist: 'Verification checklist', selection: 'Type selection' };
async function writingView() {
  const { types, docs } = await api('GET', '/writing-docs');
  const staff = me.role === 'admin' || me.role === 'manager';
  const docCard = (d) => h('a', { class: 'card card-pad cardlink', href: '#/wg/' + d.id },
    h('div', { class: 'row spread' }, h('strong', {}, d.title), Number(d.active) ? null : h('span', { class: 'pill wait' }, 'Off')),
    h('div', { class: 'jp-label' }, `${WG_KIND[d.kind]} · ${d.versions} version${Number(d.versions) === 1 ? '' : 's'} · edited ${ago(d.updated_at)}${d.updated_by_name ? ' by ' + d.updated_by_name : ''}`));
  const typeCard = (t) => h(staff ? 'a' : 'div', { class: 'card card-pad cardlink', href: staff ? '#/t/' + t.id : null },
    h('div', { class: 'row spread' }, h('strong', {}, t.name), Number(t.active) ? null : h('span', { class: 'pill wait' }, 'Retired')),
    t.chosen_when ? h('div', { class: 'jp-label clamp2', title: t.chosen_when }, 'Chosen when ' + t.chosen_when) : t.description ? h('div', { class: 'jp-label clamp2' }, t.description.slice(0, 140)) : null,
    h('div', { class: 'small faint' }, [t.length, `${t.signal_count} signal${Number(t.signal_count) === 1 ? '' : 's'}`, `${t.sample_count} sample${Number(t.sample_count) === 1 ? '' : 's'}`].filter(Boolean).join(' · ')));
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });
  // every card is one item, so the shared list can search and filter them
  const items = [...types.filter((t) => Number(t.active)).sort(byName).map((t) => ({ group: 'types', t })), ...docs.map((d) => ({ group: 'rules', d })), ...types.filter((t) => !Number(t.active)).map((t) => ({ group: 'retired', t }))];
  const text = (x) => (x.t ? [x.t.name, x.t.chosen_when, x.t.description, x.t.length].filter(Boolean).join(' ') : x.d.title + ' ' + WG_KIND[x.d.kind]);
  const GROUPS = [['types', 'Proposal types', 'One is picked for each job from its signals. Each has its format, length, signals and sample proposals.'],
    ['rules', 'Rules for every proposal', 'Applied with every type: by the app\'s writer, its checks and the plugin.'],
    ['retired', 'Retired', 'No longer chosen. Kept for reference and for the proposals already written with them.']];
  shell('writing', [pageHead('Writing guide', 'How every proposal is written, by the app and by the Claude plugin alike. One copy, kept here: an edit applies to the next proposal everywhere.',
      staff ? h('a', { class: 'btn primary', href: '#/t/new' }, icon('screen'), 'Add proposal type') : null),
    listCard({ items, bare: true, paged: false, icon: 'doc', emptyTitle: 'Nothing in the writing guide yet', emptyText: 'Run the writing guide seed, or add a proposal type.',
      search: { placeholder: 'Search the writing guide', text },
      filters: [{ key: 'kind', label: 'Everything', options: GROUPS.map(([k, l]) => [k, l]), test: (x, v) => x.group === v },
        { key: 'ready', label: 'Any setup', options: [['nosamples', 'Types without samples'], ['nosignals', 'Types without signals'], ['off', 'Turned off or retired']],
          test: (x, v) => (v === 'nosamples' ? !!x.t && !Number(x.t.sample_count) : v === 'nosignals' ? !!x.t && !Number(x.t.signal_count) : x.t ? !Number(x.t.active) : !Number(x.d.active)) }],
      render: (slice) => h('div', { class: 'stack' }, GROUPS.map(([k, title, sub]) => { const list = slice.filter((x) => x.group === k);
        return list.length ? h('section', { class: 'stack', style: 'gap:12px' }, h('div', {}, h('h2', {}, title), h('p', { class: 'jp-label' }, sub)), h('div', { class: 'grid3' }, list.map((x) => (x.t ? typeCard(x.t) : docCard(x.d))))) : null; })) })], true);
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
    pageHead(doc.title, `${WG_KIND[doc.kind]}. Written in Markdown.`, canEdit ? toggle : null, { back: ['#/writing', 'Writing guide'], badges: onOff(doc.active, 'On', 'Off') }),
    h('div', { class: 'two' }, h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Text'), h('span', { class: 'sub' }, dirty)), ta,
      canEdit ? h('div', { class: 'card-pad', style: 'border-top:1px solid var(--line);display:grid;gap:12px' }, note, h('div', {}, save)) : null),
      versionsCard(versions, vrow, (v) => `${full(v.created_at)} ${v.note || ''} ${v.created_by_name || ''}`))], true);
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
    const btn = h('button', { class: 'btn sm', type: 'button' }, 'Save');
    btn.onclick = () => { let v; try { v = read(); } catch (x) { return toast(x.message, true); } save(key, v, btn); };
    return h('div', { class: 'setrow' }, h('div', {}, h('strong', {}, meta[key].label), meta[key].help ? h('div', { class: 'jp-label' }, meta[key].help) : null), h('div', { class: 'setin' }, input, btn));
  };
  const num = (key) => { const el = h('input', { type: 'number', min: 0, step: 1, value: settings[key], style: 'width:110px' }); return row(key, el, () => Number(el.value)); };
  const list = (key, ph) => { const el = h('input', { type: 'text', value: settings[key].join(', '), placeholder: ph, style: 'min-width:320px' }); return row(key, el, () => el.value.split(',').map((x) => x.trim()).filter(Boolean)); };
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
  shell('settings', [pageHead('Settings', 'The AI that does the work, and the numbers and lists the app runs on. A change applies to the next job, with no restart.'), aiCard,
    group('Project matching', [num('matching.shown'), num('matching.recommended'), num('matching.min_score'), num('selection.min'), num('selection.max')]),
    group('Screening and tracking', [num('override.min_reason'), list('tracking.outcomes', 'Pending, Hired, ...'), list('tracking.loss_outcomes', 'Not hired, No response, ...'), list('tracking.loss_reasons', 'Budget too low, ...'), num('tracking.quiet_days')]),
    group('Proposal writer', [list('writer.requirement_rules', 'G11, G12, G13'),
      row('writer.structured_signal', h('span', { class: 'row', style: 'gap:6px' }, 'Signal', sigNum, 'is', sigVal), () => ({ signal: Number(sigNum.value), value: sigVal.value.trim() }))])], true);
}

// ---------- connect Claude: personal tokens for the import MCP ----------
async function connectView() {
  const [{ tokens }, { types }, conn] = await Promise.all([api('GET', '/tokens'), api('GET', '/import/types'), api('GET', '/oauth/connections')]);
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
  const status = (t) => (t.revoked_at ? h('span', { class: 'pill wait' }, 'Revoked') : new Date(t.expires_at) < new Date() ? h('span', { class: 'pill wait' }, 'Expired') : h('span', { class: 'pill PASS' }, 'Active'));
  const rows = tokens.map((t) => h('tr', {}, h('td', {}, t.name), h('td', {}, status(t)), h('td', {}, ago(t.created_at)), h('td', {}, t.last_used_at ? ago(t.last_used_at) : h('span', { class: 'faint' }, 'Never')), h('td', {}, dayText(t.expires_at)),
    acts(!t.revoked_at && new Date(t.expires_at) > new Date() ? h('button', { class: 'btn sm', type: 'button', onclick: () => revoke(t) }, 'Revoke') : null)));
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
  shell('connect', [pageHead('Connect Claude', 'Let Claude save into Upwork Pro: the jobs, proposals and statuses from your Claude plugin, and data from your sheets (previewed first, saved only when you say yes).'),
    signInCard,
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
    if (!me) me = (await api('GET', '/me')).user;
    if (!me) return loginView();
    if (!CFG) CFG = (await api('GET', '/settings')).settings;
    const [, a, b, c] = location.hash.split('?')[0].split('/');
    if (a === 's' && b) { // #/s/12, #/s/12/proposal, and the older #/s/12/work?step=4
      const step = Number(hashParams().step);
      return await jobPage(Number(b), c === 'work' ? (step >= 1 && step <= 5 ? STEP_TAB[step - 1] : undefined) : c);
    }
    if (a === 'history') return await historyView();
    if (a === 'dashboard' || !a) return await dashboardView();
    if (a === 'reports') return await reportsView();
    if (a === 'templates') { location.hash = '#/writing'; return; } // the proposal types live on the Writing guide now
    if (a === 't' && b && me.role !== 'employee') return await templateView(b);
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
    if (a === 'rules' && me.role === 'admin') return await rulesView();
    if (a === 'settings' && me.role === 'admin') return await settingsView();
    if (a === 'connect') return await connectView();
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
