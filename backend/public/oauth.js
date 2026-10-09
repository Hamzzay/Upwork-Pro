// The sign-in page an MCP client (Claude) sends a person to: sign in with your own Upwork Pro account, then allow or deny.
(() => {
  const box = document.getElementById('box');
  const id = new URLSearchParams(location.search).get('r') || '';
  const el = (tag, attrs, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) { if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v); } for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k))); return e; };
  const brand = () => el('div', { class: 'brand' }, el('div', { class: 'logo' }, el('img', { src: '/favicon.svg', alt: '', width: 20, height: 20 })), 'Upwork Pro');
  const call = async (method, path, body) => {
    const r = await fetch('/api' + path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong'), { status: r.status });
    return j;
  };
  const show = (...kids) => box.replaceChildren(brand(), ...kids);
  const fail = (msg) => show(el('h1', {}, 'Cannot connect'), el('p', { class: 'muted' }, msg));

  // a password box with a Show / Hide button, as in the app
  const withShow = (input) => {
    const b = el('button', { type: 'button', class: 'pwshow', 'aria-label': 'Show the password' }, 'Show');
    b.onclick = () => { const on = input.type === 'password'; input.type = on ? 'text' : 'password'; b.textContent = on ? 'Hide' : 'Show'; b.setAttribute('aria-label', on ? 'Hide the password' : 'Show the password'); input.focus(); };
    return el('div', { class: 'pwwrap' }, input, b);
  };
  function signIn() {
    const err = el('div', { class: 'err', hidden: true });
    const email = el('input', { type: 'email', id: 'em', autocomplete: 'username', required: true, placeholder: 'you@company.com' });
    const pw = el('input', { type: 'password', id: 'pw', autocomplete: 'current-password', required: true, placeholder: 'Your password' });
    const btn = el('button', { class: 'btn primary lg', type: 'submit', style: 'width:100%;margin-top:20px' }, 'Sign in');
    show(el('h1', {}, 'Sign in to connect'), el('p', { class: 'muted', style: 'margin-bottom:22px' }, 'Use your own Upwork Pro account. Everything Claude saves will be recorded as you.'),
      el('form', { onsubmit: async (e) => {
        e.preventDefault(); err.hidden = true; btn.disabled = true; btn.textContent = 'Signing in…';
        try { await call('POST', '/login', { email: email.value, password: pw.value }); consent(); }
        catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; btn.textContent = 'Sign in'; }
      } }, el('div', { class: 'field' }, el('label', { class: 'lbl', for: 'em' }, 'Email'), email),
        el('div', { class: 'field' }, el('label', { class: 'lbl', for: 'pw' }, 'Password'), withShow(pw)), err, btn));
    email.focus();
  }

  async function consent() {
    let r;
    try { r = await call('GET', '/oauth/request/' + encodeURIComponent(id)); }
    catch (x) { return x.status === 401 ? signIn() : fail(x.message); }
    const err = el('div', { class: 'err', hidden: true });
    const answer = async (allow, btn) => {
      btn.disabled = true;
      try { const out = await call('POST', '/oauth/request/' + encodeURIComponent(id), { allow }); show(el('p', { class: 'muted' }, allow ? 'Connected. Returning to ' + r.client_name + '…' : 'Cancelled.')); location.href = out.redirect; }
      catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
    };
    const allow = el('button', { class: 'btn primary lg', type: 'button', style: 'flex:1' }, 'Allow');
    const deny = el('button', { class: 'btn lg', type: 'button', style: 'flex:1' }, 'Deny');
    allow.onclick = () => answer(true, allow); deny.onclick = () => answer(false, deny);
    show(el('h1', {}, 'Connect ' + r.client_name + '?'),
      el('p', { class: 'muted' }, el('strong', {}, r.client_name), ' wants to use Upwork Pro as ', el('strong', {}, r.user.name), ' (', r.user.email, ').'),
      el('ul', { class: 'muted small', style: 'margin:14px 0;padding-left:18px;display:grid;gap:4px' },
        el('li', {}, 'Save jobs, proposals and statuses as you'), el('li', {}, 'Read the project library, profiles, rules and writing guide'), el('li', {}, 'Import sheets you choose (after a preview)'),
        el('li', {}, 'It cannot see or change users, settings or other admin pages')),
      el('p', { class: 'faint small' }, 'Returns to ' + r.returns_to + '. You can disconnect it any time under Connect Claude.'),
      err, el('div', { class: 'row', style: 'gap:10px;margin-top:18px' }, deny, allow));
  }
  if (!/^[0-9a-f]{32}$/.test(id)) fail('This link is not complete. Start again from Claude.'); else consent();
})();
