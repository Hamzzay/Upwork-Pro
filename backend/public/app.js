'use strict';
// All text goes in through textContent, never innerHTML, so job text and model output cannot inject markup.
// The only innerHTML below is for the fixed icon strings in ICONS.
const $app = document.getElementById('app');
let me = null;

// ---------- helpers ----------
const ICONS = {
  logo: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
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
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
  badge: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="11" r="2.5"/><path d="M5.5 17c.8-2 2.2-3 3.5-3s2.7 1 3.5 3M15 9h3M15 13h3"/>',
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

// ---------- pagination ----------
const PAGE_SIZE = 20;
function hashParams() { return Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || '')); }
function setHashParams(patch) { // keeps page and filters in the URL so Back from a record returns to the same list, without re-running the route
  const next = { ...hashParams(), ...patch }; const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v !== '' && v != null && v !== false && !(k === 'page' && Number(v) === 1)) sp.set(k, v);
  history.replaceState(null, '', location.hash.split('?')[0] + (sp.toString() ? '?' + sp : ''));
}
const lastList = { history: '#/history', projects: '#/projects' };
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
function shell(active, content, wide) {
  const links = [['new', 'screen', 'Screen a job'], ['history', 'list', me.role === 'employee' ? 'My records' : 'All records'], ['projects', 'folder', 'Projects']];
  const adminLinks = [['profiles', 'badge', 'Upwork profiles'], ['users', 'users', 'Users'], ['skill', 'skill', 'Skill editor'], ['audit', 'audit', 'Audit log']];
  const a = ([key, ic, label]) => h('a', { href: '#/' + key, class: active === key ? 'active' : '', 'aria-current': active === key ? 'page' : null }, icon(ic), h('span', {}, label));
  $app.replaceChildren(h('div', { class: 'shell' },
    h('aside', { class: 'side' },
      h('div', { class: 'brand' }, h('div', { class: 'logo' }, icon('logo')), 'Job Gate'),
      h('nav', { class: 'nav', 'aria-label': 'Main' }, h('div', { class: 'nav-label' }, 'Screening'), links.map(a),
        me.role === 'admin' ? [h('div', { class: 'nav-label' }, 'Admin'), adminLinks.map(a)] : null),
      h('div', { class: 'me' }, h('div', { class: 'avatar' }, initials(me.name)),
        h('div', { class: 'who' }, h('strong', {}, me.name), h('span', {}, me.role)),
        h('button', { class: 'iconbtn', title: 'Sign out', 'aria-label': 'Sign out', onclick: async () => { await api('POST', '/logout', {}); me = null; route(); } }, icon('out')))),
    h('main', { class: 'content' }, h('div', { class: 'page', style: wide ? 'max-width:1180px' : null }, content))));
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
    h('div', { class: 'brand' }, h('div', { class: 'logo' }, icon('logo')), 'Job Gate'),
    h('h1', {}, 'Welcome back'), h('p', { class: 'muted', style: 'margin-bottom:22px' }, 'Sign in to screen Upwork jobs against the Stackup SOP.'),
    h('form', { onsubmit: async (e) => {
      e.preventDefault(); err.hidden = true; btnBusy(btn, 'Signing in');
      try { me = (await api('POST', '/login', { email: email.value, password: pw.value })).user; location.hash = '#/new'; route(); }
      catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; btn.disabled = false; btn.replaceChildren('Sign in'); }
    } }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'em' }, 'Email'), email),
      h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'pw' }, 'Password'), pw), err, btn))));
  email.focus();
}

// ---------- screen a job ----------
async function newView() {
  const { profiles } = await api('GET', '/profiles');
  const box = h('textarea', { id: 'jobin', 'aria-label': 'Job link or page text', placeholder: 'Paste an Upwork job link, or copy the whole job page and paste it here.\n\nInclude the "About the client" section: the screening depends on it.' });
  const chip = h('span', { class: 'chip' }, 'Waiting for input');
  const err = h('div', { class: 'err', hidden: true });
  const btn = h('button', { class: 'btn primary lg', type: 'button' }, 'Screen this job');
  let last = ''; try { last = localStorage.getItem('ug_profile') || ''; } catch (e) { /* storage blocked: fine */ }
  const sel = h('select', { id: 'prof', style: 'width:100%' }, profiles.length > 1 || !last ? h('option', { value: '' }, 'Select a profile') : null,
    profiles.map((p) => h('option', { value: p.id, selected: String(p.id) === last || profiles.length === 1 }, p.name)));
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
      const pid = Number(sel.value) || null;
      const r = await api('POST', '/screenings', { input: box.value, profile_id: pid, job_url: urlIn.value.trim() || null });
      try { if (pid) localStorage.setItem('ug_profile', String(pid)); } catch (e) { /* ignore */ }
      location.hash = '#/s/' + r.id;
    } catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; btn.disabled = false; btn.replaceChildren('Screen this job'); }
  };
  btn.onclick = submit;
  box.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(); });
  shell('new', [
    pageHead('Screen a job', 'Check an Upwork job against the SOP before anyone spends Connects on it.'),
    h('div', { class: 'card composer' }, box,
      h('div', { class: 'composer-bar' }, chip, h('span', { class: 'grow' }), h('span', { class: 'faint small' }, 'Ctrl + Enter to send'), btn)),
    h('div', { class: 'grid2', style: 'margin-top:16px' },
      h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'prof' }, 'Upwork profile', profiles.length ? ' (required)' : ''), sel,
        !profiles.length ? h('div', { class: 'hint' }, 'No profiles are set up yet. An admin can add them under Upwork profiles.') : h('div', { class: 'hint' }, 'The profile this job would be applied from.')),
      h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'joburl' }, 'Job link (optional)'), urlIn, h('div', { class: 'hint' }, 'Saved with the record when you paste text instead of a link.'))),
    err,
    h('div', { class: 'steps' },
      h('div', { class: 'step' }, h('div', { class: 'n' }, '1'), h('strong', {}, 'Paste the job'), h('p', {}, 'A job link, or the full page text copied from Upwork.')),
      h('div', { class: 'step' }, h('div', { class: 'n' }, '2'), h('strong', {}, 'We screen it'), h('p', {}, 'The SOP rules run in about a minute and return PASS, FLAG or FAIL.')),
      h('div', { class: 'step' }, h('div', { class: 'n' }, '3'), h('strong', {}, 'Decide'), h('p', {}, 'On a FLAG or FAIL you can still continue, with a reason that is kept on record.'))),
    h('div', { class: 'notice' }, icon('info'), h('div', {}, 'Links are read through the Upwork API, which is not connected yet. For now, paste the page text.')),
  ]);
  box.focus();
}

// ---------- records ----------
async function historyView() {
  const hp = hashParams();
  const st = { verdict: ['PASS', 'FLAG', 'FAIL'].includes(hp.v) ? hp.v : '', q: hp.q || '', mine: hp.mine === '1', page: Math.max(1, Number(hp.page) || 1) };
  let stats = { total: 0, PASS: 0, FLAG: 0, FAIL: 0, overridden: 0 };
  const statsEl = h('div', { class: 'stats' });
  const bodyEl = h('div', {});
  const searchIn = h('input', { type: 'search', placeholder: 'Search by job, person, profile or rule code', 'aria-label': 'Search records', value: st.q });
  const mineBox = h('input', { type: 'checkbox', id: 'mine', checked: st.mine });
  const toolbar = h('div', { class: 'toolbar' }, h('div', { class: 'search' }, icon('search'), searchIn),
    me.role !== 'employee' ? h('label', { class: 'row small', for: 'mine', style: 'gap:6px' }, mineBox, 'Only mine') : null);
  const listEl = h('div', { class: 'card' }, toolbar, bodyEl);

  const tile = (key, label, value) => h('button', { class: `stat ${key} ${st.verdict === key ? 'on' : ''}`, onclick: () => { st.verdict = st.verdict === key ? '' : key; st.page = 1; load(); } },
    h('span', { class: 'k' }, label), h('span', { class: 'v' }, value));
  function drawStats() {
    statsEl.replaceChildren(h('button', { class: 'stat ' + (st.verdict ? '' : 'on'), onclick: () => { st.verdict = ''; st.page = 1; load(); } }, h('span', { class: 'k' }, 'All records'), h('span', { class: 'v' }, stats.total)),
      tile('PASS', 'Pass', stats.PASS), tile('FLAG', 'Flag', stats.FLAG), tile('FAIL', 'Fail', stats.FAIL),
      h('div', { class: 'stat', style: 'cursor:default' }, h('span', { class: 'k' }, 'Continued anyway'), h('span', { class: 'v' }, stats.overridden)));
  }
  function drawRows(rows, total) {
    const table = !rows.length
      ? emptyState('list', stats.total ? 'No matches' : 'No screenings yet', stats.total ? 'Try a different search or filter.' : 'Screen your first job to see it here.', stats.total ? null : h('a', { class: 'btn primary', href: '#/new' }, 'Screen a job'))
      : h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Job', 'Profile', 'Result', 'Submitted by', 'When', 'Decision'].map((t) => h('th', {}, t)))),
        h('tbody', {}, rows.map((r) => h('tr', { class: 'click', tabindex: 0, onclick: () => (location.hash = '#/s/' + r.id), onkeydown: (e) => { if (e.key === 'Enter') location.hash = '#/s/' + r.id; } },
          h('td', {}, h('span', { class: 'title' }, r.title || (r.input_type === 'link' ? 'Upwork link' : 'Pasted job text')), h('span', { class: 'meta' }, r.input_type === 'link' ? 'Link' : 'Pasted text')),
          h('td', {}, r.profile_name || h('span', { class: 'faint' }, '-')),
          h('td', {}, verdictPill(r.verdict, r.status), r.rule_codes ? h('div', { class: 'meta mono' }, r.rule_codes) : null), h('td', {}, r.user_name),
          h('td', { class: 'muted', title: full(r.created_at) }, ago(r.created_at)),
          h('td', {}, r.selection_confirmed_at ? h('span', { class: 'chip brand' }, 'Projects chosen') : Number(r.continued) ? h('span', { class: 'chip' }, r.tagging_status === 'error' ? 'Matching failed' : r.tagging_status === 'done' ? 'Pick projects' : 'Matching') : r.verdict === 'FAIL' || r.verdict === 'FLAG' || r.verdict === 'PASS' ? h('span', { class: 'faint small' }, 'Open') : ''))))));
    bodyEl.replaceChildren(table, pager(total, st.page, (n) => { st.page = n; load(); }));
  }
  let seq = 0;
  async function load() {
    const my = ++seq;
    const qs = new URLSearchParams({ page: st.page }); if (st.verdict) qs.set('verdict', st.verdict); if (st.q) qs.set('q', st.q); if (st.mine) qs.set('mine', '1');
    const [list, s2] = await Promise.all([api('GET', '/screenings?' + qs), api('GET', '/screenings/stats' + (st.mine ? '?mine=1' : ''))]);
    if (my !== seq) return; // a newer request was started while this one was loading
    st.page = list.page; stats = s2;
    setHashParams({ page: st.page, v: st.verdict, q: st.q, mine: st.mine ? '1' : '' }); lastList.history = location.hash;
    drawStats(); drawRows(list.screenings, list.total);
  }
  searchIn.oninput = debounce(() => { st.q = searchIn.value.trim(); st.page = 1; load().catch((x) => toast(x.message, true)); }, 300);
  mineBox.onchange = () => { st.mine = mineBox.checked; st.page = 1; load(); };
  shell('history', [pageHead(me.role === 'employee' ? 'My records' : 'All records', 'Every screening is saved with the result and the decision.',
    h('a', { class: 'btn primary', href: '#/new' }, icon('screen'), 'Screen a job')), statsEl, listEl]);
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
  const count = h('span', { class: 'counter' }, '0 / 15 minimum');
  const err = h('div', { class: 'err', hidden: true });
  const btn = h('button', { class: 'btn primary', type: 'button', disabled: true }, 'Continue with this job');
  ta.oninput = () => {
    const n = ta.value.trim().length; btn.disabled = n < 15;
    count.textContent = n < 15 ? `${n} / 15 minimum` : `${n} characters`; count.className = 'counter' + (n >= 15 ? ' ok' : '');
  };
  btn.onclick = () => modal({
    title: 'Continue despite the ' + s.verdict + '?', confirm: 'Yes, continue',
    body: h('p', { class: 'muted' }, 'Your reason is saved with this record and is visible to managers and admins.'),
    onConfirm: async () => { try { await api('POST', `/screenings/${s.id}/override`, { reason: ta.value }); toast('Saved. You can continue with this job.'); route(); } catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; throw x; } },
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
    try { await api('POST', `/screenings/${s.id}/continue`, {}); route(); }
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
    const count = h('span', { class: 'counter' + (picked.size === 2 ? ' ok' : '') }, `${picked.size} of 2 selected`);
    const err = h('div', { class: 'err', hidden: true });
    const confirmBtn = h('button', { class: 'btn primary', type: 'button', disabled: picked.size !== 2 || !changed }, m.confirmed_at ? 'Save changed selection' : 'Confirm these 2 projects');
    const save = async (ids, btn, label) => {
      err.hidden = true; btnBusy(btn, 'Saving');
      try { await api('PUT', `/screenings/${s.id}/selection`, { project_ids: ids }); toast('Selection saved'); await poll(); }
      catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; btn.disabled = false; btn.replaceChildren(label); }
    };
    confirmBtn.onclick = () => save([...picked], confirmBtn, confirmBtn.textContent);
    const recIds = rows.filter((r) => r.recommended).map((r) => r.project_id);
    const recBtn = h('button', { class: 'btn', type: 'button' }, 'Use the 2 recommended');
    recBtn.onclick = () => { picked = new Set(recIds); save(recIds, recBtn, 'Use the 2 recommended'); };
    const rec = rows.filter((r) => r.recommended), rest = rows.filter((r) => !r.recommended);
    const card = (r) => {
      const on = picked.has(r.project_id), locked = !owner || !r.project_id || (picked.size >= 2 && !on);
      const cb = h('input', { type: 'checkbox', id: 'mp' + r.rank, checked: on, disabled: locked, 'aria-label': 'Select ' + r.project_name });
      cb.onchange = () => { if (cb.checked) picked.add(r.project_id); else picked.delete(r.project_id); draw(); };
      return h('div', { class: 'mcard' + (on ? ' on' : '') + (r.recommended ? ' rec' : '') },
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
      h('p', { class: 'hint', style: 'margin:0 0 12px' }, 'Score is the sum of the weights of the tags a project shares with this job. ' + (owner ? 'Keep the 2 recommended or swap them for others below. Choose exactly 2.' : '')),
      h('div', { class: 'mgrid' }, rec.map(card)), rest.length ? h('div', { class: 'mgrid', style: 'margin-top:12px' }, rest.map(card)) : null,
      owner && picked.size >= 2 ? h('p', { class: 'hint' }, 'Untick one project to choose a different one.') : null,
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
const OUTCOMES = ['Applied', 'Interview', 'Hired', 'Rejected', 'No response', 'Withdrawn'];
function trackingCard(s) {
  const canEdit = s.user_id === me.id || me.role === 'admin' || me.role === 'manager';
  const proceeded = h('select', { id: 'tp', style: 'width:100%' }, [['', 'Not decided'], ['yes', 'Yes, proceeding'], ['no', 'No, skipped']].map(([v, l]) => h('option', { value: v, selected: (s.proceeded || '') === v }, l)));
  const date = h('input', { type: 'date', id: 'td', value: s.proposal_sent_date ? String(s.proposal_sent_date).slice(0, 10) : '' });
  const list = h('datalist', { id: 'outcomes' }, OUTCOMES.map((o) => h('option', { value: o })));
  const outcome = h('input', { type: 'text', id: 'to', list: 'outcomes', maxlength: 60, value: s.outcome || '', placeholder: 'For example: Interview' });
  const notes = h('textarea', { id: 'tn', style: 'min-height:80px', maxlength: 4000, placeholder: 'Anything worth remembering about this job or the proposal.' }); notes.value = s.notes || '';
  const err = h('div', { class: 'err', hidden: true });
  const btn = h('button', { class: 'btn primary', type: 'button' }, 'Save tracking');
  [proceeded, date, outcome, notes].forEach((el) => { el.disabled = !canEdit; });
  btn.onclick = async () => {
    err.hidden = true; btnBusy(btn, 'Saving');
    try { await api('PATCH', `/screenings/${s.id}/tracking`, { proceeded: proceeded.value || null, proposal_sent_date: date.value || null, outcome: outcome.value.trim() || null, notes: notes.value.trim() || null }); toast('Tracking saved'); }
    catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; }
    btn.disabled = false; btn.replaceChildren('Save tracking');
  };
  return h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'Tracking'),
    h('div', { class: 'grid3' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tp' }, 'Proceeded'), proceeded),
      h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'td' }, 'Proposal sent'), date),
      h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'to' }, 'Outcome'), outcome, list)),
    h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'tn' }, 'Notes'), notes), err,
    canEdit ? h('div', { style: 'margin-top:14px' }, btn) : h('p', { class: 'hint' }, 'Only the submitter, managers and admins can edit this.'));
}

function recordDetails(s, override) {
  const link = (u) => (/^https?:\/\//i.test(u || '') ? h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, u) : u);
  const rows = [
    ['Date screened', full(s.created_at)], ['Upwork profile', s.profile_name], ['Job title', s.title], ['Job URL', link(s.source_url)],
    ['Posted', s.posted], ['Job type', s.job_type], ['Budget', s.budget], ['Length and hours per week', s.length_hours], ['Experience level', s.experience_level],
    ['Service category', s.service_category], ['Required skills and tools', s.required_skills], ['Client country', s.client_country],
    ['Payment verified', s.payment_verified], ['Client rating (reviews)', s.client_rating], ['Jobs posted', s.jobs_posted], ['Hire rate', s.hire_rate],
    ['Total spent', s.total_spent], ['Hires', s.hires], ['Avg spend per hire', s.avg_spend_per_hire], ['Avg hourly paid', s.avg_hourly_paid],
    ['Member since', s.member_since], ['Proposals', s.proposals], ['Interviewing', s.interviewing], ['Invites sent', s.invites_sent],
    ['Connects cost', s.connects_cost], ['Sample match', s.sample_match], ['Verdict', s.verdict], ['Fail reasons', s.fail_reasons],
    ['Flag reasons', s.flag_reasons], ['Rule codes', s.rule_codes], ['Proceeded', s.proceeded], ['Override reason', override ? override.reason : null],
    ['Proposal sent date', s.proposal_sent_date ? String(s.proposal_sent_date).slice(0, 10) : null], ['Outcome', s.outcome], ['Notes', s.notes],
  ];
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, 'Record details'), h('span', { class: 'sub' }, 'Every tracked field')),
    h('div', { class: 'card-pad' }, h('dl', { class: 'kv cols2' }, rows.map(([l, v]) => h('div', {}, h('dt', {}, l), h('dd', { class: v ? '' : 'ns' }, v || 'not recorded')))),
      s.job_description ? h('details', { class: 'desc' }, h('summary', {}, 'Job description (the pasted page text)'), h('pre', {}, s.job_description)) : null));
}

async function detailView(id) {
  const { screening: s, override, matching } = await api('GET', '/screenings/' + id);
  const title = s.title || (s.input_type === 'link' ? 'Upwork link' : 'Pasted job text');
  const meta = h('div', { class: 'row', style: 'gap:8px;margin-top:10px' },
    h('span', { class: 'chip' }, s.user_name), h('span', { class: 'chip', title: full(s.created_at) }, ago(s.created_at)),
    s.profile_name ? h('span', { class: 'chip' }, icon('badge'), s.profile_name) : null,
    s.skill_version ? h('span', { class: 'chip' }, 'Skill v' + s.skill_version) : null,
    s.rule_codes ? h('span', { class: 'chip mono', title: 'Rule codes' }, s.rule_codes) : null,
    s.provider === 'mock' ? h('span', { class: 'chip' }, 'Mock model') : null);
  const parts = [h('div', { style: 'margin-bottom:14px' }, h('a', { href: lastList.history, class: 'row small', style: 'gap:6px;display:inline-flex' }, icon('back'), 'Back to records'))];
  const head = (v) => pageHead(title, null, v);

  if (s.status === 'queued' || s.status === 'running') {
    parts.push(head(), meta, h('div', { style: 'height:18px' }), progressCard(s.status));
    setTimeout(() => { if (location.hash === '#/s/' + id) route(); }, 2500);
  } else if (s.status === 'error') {
    const retry = h('button', { class: 'btn primary', onclick: async (e) => { btnBusy(e.currentTarget, 'Retrying'); try { await api('POST', `/screenings/${id}/retry`, {}); route(); } catch (x) { toast(x.message, true); } } }, 'Try again');
    parts.push(head(), meta, h('div', { style: 'height:18px' }), h('div', { class: 'card' }, emptyState('x', 'Screening did not finish', s.error_message || 'Something went wrong.',
      s.user_id === me.id ? h('div', { class: 'row', style: 'justify-content:center' }, retry, h('a', { class: 'btn', href: '#/new' }, 'Paste the text instead')) : null)));
  } else if (s.report) {
    const multi = s.report.jobs.length > 1;
    parts.push(head(), meta, h('div', { style: 'height:18px' }));
    const blocks = s.report.jobs.map((j) => jobReportView(j, multi));
    blocks.forEach((b, i) => parts.push(b, i < blocks.length - 1 ? h('hr', { style: 'border:0;border-top:1px solid var(--line);margin:28px 0' }) : null));
    if (override) {
      parts.push(h('div', { style: 'height:16px' }), h('div', { class: 'card logged' }, h('div', { class: 'ico' }, icon('check')),
        h('div', {}, h('strong', {}, 'Continued despite the ' + override.verdict_at_time), h('blockquote', {}, override.reason),
          h('div', { class: 'small muted' }, `${override.user_name} · ${full(override.created_at)}`))));
    } else if ((s.verdict === 'FAIL' || s.verdict === 'FLAG') && s.user_id === me.id) parts.push(h('div', { style: 'height:16px' }), overrideCard(s));
    else if (s.verdict === 'FAIL' || s.verdict === 'FLAG') parts.push(h('div', { style: 'height:16px' }), h('div', { class: 'notice' }, icon('info'), 'No decision recorded yet. Only the person who submitted this job can continue with it.'));
    else if (s.verdict === 'PASS' && !(matching && matching.continued)) parts.push(h('div', { style: 'height:16px' }), continueCard(s));
    if (matching && matching.continued) parts.push(h('div', { style: 'height:16px' }), matchingSection(s, matching));
    parts.push(h('div', { style: 'height:16px' }), trackingCard(s), h('div', { style: 'height:16px' }), recordDetails(s, override));
  }
  shell('history', parts);
}

// ---------- Upwork profiles (admin) ----------
async function profilesView() {
  const { profiles } = await api('GET', '/profiles?all=1');
  function form(p) {
    const f = { name: h('input', { type: 'text', id: 'pn', value: p ? p.name : '', maxlength: 120 }), url: h('input', { type: 'text', id: 'pu', value: p && p.profile_url ? p.profile_url : '', placeholder: 'https://www.upwork.com/freelancers/...' }),
      notes: h('input', { type: 'text', id: 'pt', value: p && p.notes ? p.notes : '', maxlength: 500, placeholder: 'For example: main freelancer profile' }) };
    return { f, body: h('div', {}, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'pn' }, 'Profile name'), f.name),
      h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'pu' }, 'Profile link (optional)'), f.url), h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'pt' }, 'Notes (optional)'), f.notes)) };
  }
  const values = (f) => ({ name: f.name.value, profile_url: f.url.value.trim() || null, notes: f.notes.value.trim() || null });
  function add() { const { f, body } = form(null); modal({ title: 'Add an Upwork profile', confirm: 'Add profile', body, onConfirm: async () => { await api('POST', '/profiles', values(f)); toast('Profile added'); route(); } }); }
  function edit(p) { const { f, body } = form(p); modal({ title: 'Edit ' + p.name, confirm: 'Save changes', body, onConfirm: async () => { await api('PATCH', '/profiles/' + p.id, values(f)); toast('Profile updated'); route(); } }); }
  const toggle = async (p) => { try { await api('PATCH', '/profiles/' + p.id, { active: !Number(p.active) }); toast(Number(p.active) ? 'Profile disabled' : 'Profile enabled'); } catch (x) { toast(x.message, true); } route(); };
  const remove = (p) => modal({ title: 'Delete ' + p.name + '?', confirm: 'Delete profile', danger: true,
    body: h('p', { class: 'muted' }, 'A profile that already has screenings cannot be deleted. Disable it instead and it disappears from the screening form.'),
    onConfirm: async () => { await api('DELETE', '/profiles/' + p.id); toast('Profile deleted'); route(); } });
  const row = (p) => h('tr', {},
    h('td', {}, h('strong', {}, p.name), p.profile_url ? h('div', { class: 'small' }, h('a', { href: p.profile_url, target: '_blank', rel: 'noopener noreferrer' }, 'Open on Upwork')) : null),
    h('td', { class: 'muted' }, p.notes || ''),
    h('td', {}, Number(p.active) ? h('span', { class: 'pill PASS' }, 'Active') : h('span', { class: 'pill wait' }, 'Disabled')),
    h('td', {}, h('div', { class: 'row', style: 'justify-content:flex-end;flex-wrap:nowrap' },
      h('button', { class: 'btn sm', onclick: () => edit(p) }, 'Edit'),
      h('button', { class: 'btn sm', onclick: () => toggle(p) }, Number(p.active) ? 'Disable' : 'Enable'),
      h('button', { class: 'btn sm danger', onclick: () => remove(p) }, 'Delete'))));
  const table = clientPaged(profiles, (slice) => h('div', { class: 'tablewrap' }, h('table', {},
    h('thead', {}, h('tr', {}, ['Profile', 'Notes', 'Status', ''].map((t) => h('th', {}, t)))),
    h('tbody', {}, slice.map(row)))));
  shell('profiles', [
    pageHead('Upwork profiles', 'The profiles your team applies from. Every screening is recorded against one.', h('button', { class: 'btn primary', onclick: add }, icon('screen'), 'Add profile')),
    h('div', { class: 'card' }, profiles.length ? table : emptyState('badge', 'No profiles yet', 'Add the Upwork profiles your team applies from.', h('button', { class: 'btn primary', onclick: add }, 'Add profile'))),
  ]);
}

// ---------- projects ----------
const SHOWABLE = ['Yes with client name', 'Yes without client name', 'No'];
const canEditProjects = () => me.role === 'admin' || me.role === 'manager';

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
function projectEditor(p, categories, after) {
  const selected = new Set(p ? p.tags.map((t) => t.id) : []);
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
      h('div', { style: 'margin-top:16px' }, tagPicker(categories, selected))),
    extra: p ? () => h('button', { class: 'btn danger', type: 'button', onclick: () => modal({ title: 'Delete ' + p.name + '?', confirm: 'Delete project', danger: true,
      body: h('p', { class: 'muted' }, 'This removes the project and its tags. It cannot be undone. To keep it but stop using it, untick Active instead.'),
      onConfirm: async () => { await api('DELETE', '/projects/' + p.id); document.querySelectorAll('dialog').forEach((d) => d.close()); toast('Project deleted'); after(null); } }) }, 'Delete') : null,
    onConfirm: async () => {
      const body = { name: f.name.value, live_link: f.link.value.trim() || null, showable_publicly: f.show.value.trim() || null, notes: f.notes.value.trim() || null, active: f.active.checked, tag_ids: [...selected] };
      const r = await api(p ? 'PATCH' : 'POST', p ? '/projects/' + p.id : '/projects', body); toast(p ? 'Project saved' : 'Project added'); after(r.id);
    } });
}

async function projectsView() {
  const [{ projects }, { categories }] = await Promise.all([api('GET', '/projects'), api('GET', '/tags')]);
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
    const shown = projects.filter((p) => (!q || (p.name + ' ' + p.tags.map((t) => t.name).join(' ')).toLowerCase().includes(q)) &&
      (!st.tag || p.tags.some((t) => String(t.id) === st.tag)) && (st.status === '' || String(Number(p.active)) === st.status));
    st.page = Math.min(st.page, Math.max(1, Math.ceil(shown.length / PAGE_SIZE)));
    const slice = shown.slice((st.page - 1) * PAGE_SIZE, st.page * PAGE_SIZE);
    sync();
    const table = !shown.length ? emptyState('folder', projects.length ? 'No matches' : 'No projects yet', projects.length ? 'Try a different search or filter.' : 'Add the projects Stackup has delivered.')
      : h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Project', 'Tags', 'Public', 'Status', canEdit ? '' : null].map((t) => (t === null ? null : h('th', {}, t))))),
        h('tbody', {}, slice.map((p) => h('tr', { class: 'click', tabindex: 0, onclick: detail(p), onkeydown: (e) => { if (e.key === 'Enter') detail(p)(); } },
          h('td', {}, h('strong', {}, p.name), p.live_link ? h('div', { class: 'meta' }, p.live_link.replace(/^https?:\/\//, '').slice(0, 50)) : null),
          h('td', {}, p.tags.length ? h('div', { class: 'chips' }, p.tags.slice(0, 4).map((t) => h('span', { class: 'chip' }, t.name)),
            p.tags.length > 4 ? h('a', { class: 'chip brand', href: '#/p/' + p.id, title: 'Show all ' + p.tags.length + ' tags', onclick: (e) => { e.stopPropagation(); sync(); } }, '+' + (p.tags.length - 4)) : null) : h('span', { class: 'faint small' }, 'Not tagged yet')),
          h('td', { class: 'muted' }, p.showable_publicly || '-'), h('td', {}, Number(p.active) ? h('span', { class: 'pill PASS' }, 'Active') : h('span', { class: 'pill wait' }, 'Inactive')),
          canEdit ? h('td', {}, h('button', { class: 'btn sm', onclick: (e) => { e.stopPropagation(); projectEditor(p, categories, afterEdit); } }, 'Edit')) : null)))));
    bodyEl.replaceChildren(table, pager(shown.length, st.page, (n) => { st.page = n; draw(); }));
  }
  shell('projects', [pageHead('Projects', "Stackup's delivered work. Tags are how a new job is matched to the projects that prove the same kind of work.",
    canEdit ? h('button', { class: 'btn primary', onclick: () => projectEditor(null, categories, afterEdit) }, icon('screen'), 'Add project') : null), h('div', { class: 'card' }, toolbar, bodyEl)], true);
  draw();
}

async function projectDetailView(id) {
  const [{ project: p }, { categories }] = await Promise.all([api('GET', '/projects/' + id), api('GET', '/tags')]);
  const canEdit = canEditProjects();
  const own = new Set(p.tags.map((t) => t.id));
  const groups = categories.map((c) => ({ name: c.name, tags: c.tags.filter((t) => own.has(t.id)) })).filter((g) => g.tags.length);
  const link = /^https?:\/\//i.test(p.live_link || '') ? h('a', { href: p.live_link, target: '_blank', rel: 'noopener noreferrer' }, p.live_link) : null;
  shell('projects', [
    h('div', { style: 'margin-bottom:14px' }, h('a', { href: lastList.projects, class: 'row small', style: 'gap:6px;display:inline-flex' }, icon('back'), 'Back to projects')),
    pageHead(p.name, `${p.tags.length} tag${p.tags.length === 1 ? '' : 's'} across ${groups.length} categor${groups.length === 1 ? 'y' : 'ies'}`,
      [Number(p.active) ? h('span', { class: 'pill PASS' }, 'Active') : h('span', { class: 'pill wait' }, 'Inactive'),
        canEdit ? h('button', { class: 'btn primary', onclick: () => projectEditor(p, categories, (nid) => (nid ? route() : (location.hash = lastList.projects))) }, 'Edit project') : null]),
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'Details'), h('dl', { class: 'kv cols2' },
      h('div', {}, h('dt', {}, 'Live link'), h('dd', { class: link ? '' : 'ns' }, link || 'not recorded')),
      h('div', {}, h('dt', {}, 'Showable publicly'), h('dd', { class: p.showable_publicly ? '' : 'ns' }, p.showable_publicly || 'not recorded')),
      h('div', {}, h('dt', {}, 'Added'), h('dd', {}, full(p.created_at))), h('div', {}, h('dt', {}, 'Last updated'), h('dd', {}, full(p.updated_at))),
      p.notes ? h('div', { style: 'grid-column:1/-1' }, h('dt', {}, 'Notes'), h('dd', {}, p.notes)) : null)),
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
          h('div', { class: 'hint' }, 'Employee: own records. Manager: sees all records. Admin: also manages users and the skill.'))),
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

// ---------- skill (admin) ----------
async function skillView() {
  const { versions } = await api('GET', '/admin/skill');
  const active = versions.find((v) => Number(v.is_active)) || versions[0];
  const cur = active ? (await api('GET', '/admin/skill/' + active.id)).skill : { content: '' };
  const ta = h('textarea', { class: 'editor', id: 'sk', spellcheck: 'false', 'aria-label': 'Skill text' }); ta.value = cur.content;
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
  shell('skill', [pageHead('Skill editor', 'The screening rules the model follows. Saving never overwrites: it creates a new version.'),
    h('div', { class: 'notice', style: 'margin:0 0 16px' }, icon('info'), 'The report layout is fixed by the app, so editing the rules cannot break reports. Test a draft before you activate it.'),
    h('div', { class: 'two' }, h('div', {},
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Rules'), h('span', { class: 'sub' }, dirty, ' Editing from version ' + (active ? active.version : '-'))), ta,
        h('div', { class: 'card-pad', style: 'border-top:1px solid var(--line)' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'cn' }, 'Change note'), note), h('div', { class: 'row', style: 'margin-top:14px' }, saveBtn))),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Try the draft')), h('div', { class: 'card-pad' }, sample, h('div', { style: 'margin-top:12px' }, testBtn), out))),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Versions')), clientPaged(versions, (slice) => h('div', { class: 'vlist' }, slice.map(vitem)))))], true);
}

// ---------- audit (admin) ----------
async function auditView() {
  let page = Math.max(1, Number(hashParams().page) || 1);
  const holder = h('div', { class: 'card' });
  async function load() {
    const d = await api('GET', '/admin/audit?page=' + page); page = d.page; setHashParams({ page });
    holder.replaceChildren(d.log.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['When', 'Who', 'Action', 'Detail'].map((t) => h('th', {}, t)))),
      h('tbody', {}, d.log.map((l) => h('tr', {}, h('td', { class: 'muted', title: full(l.created_at) }, ago(l.created_at)), h('td', {}, l.user_name || 'System'),
        h('td', {}, h('span', { class: 'chip' }, l.action.replace(/_/g, ' '))), h('td', { class: 'mono muted' }, l.detail || '')))))) : emptyState('audit', 'No events yet', 'Activity will appear here.'),
      pager(d.total, page, (n) => { page = n; load(); }));
  }
  shell('audit', [pageHead('Audit log', 'Sign-ins, overrides, skill changes, user and library changes. Newest first.'), holder]);
  await load();
}

// ---------- router ----------
async function route() {
  try {
    if (!me) me = (await api('GET', '/me')).user;
    if (!me) return loginView();
    const [, a, b] = location.hash.split('?')[0].split('/');
    if (a === 's' && b) return await detailView(Number(b));
    if (a === 'history') return await historyView();
    if (a === 'p' && b) return await projectDetailView(Number(b));
    if (a === 'projects') return await projectsView();
    if (a === 'profiles' && me.role === 'admin') return await profilesView();
    if (a === 'users' && me.role === 'admin') return await usersView();
    if (a === 'skill' && me.role === 'admin') return await skillView();
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
