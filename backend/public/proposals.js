'use strict';
// Proposal workspace, templates and signals pages. Loaded before app.js; it uses the helpers defined there (h, api, icon, modal, toast, pager, ...).
// The only place HTML from the server is rendered is the rich-text editor, and everything it receives has been sanitized by the server.

// ---------- rich text editor ----------
const RT_BUTTONS = [
  ['bold', 'B', 'Bold', 'font-weight:800'], ['italic', 'I', 'Italic', 'font-style:italic'], ['underline', 'U', 'Underline', 'text-decoration:underline'],
  ['h', 'H', 'Heading'], ['ul', '• List', 'Bulleted list'], ['ol', '1. List', 'Numbered list'], ['link', 'Link', 'Add a link'], ['unlink', 'Unlink', 'Remove the link'],
  ['clear', 'Clear', 'Remove formatting'], ['undo', 'Undo', 'Undo'], ['redo', 'Redo', 'Redo'],
];

/** Plain text of an HTML string, with line breaks and visible URLs: what Upwork needs when the proposal is pasted into it. */
function htmlToPlainText(html) {
  const root = document.createElement('div'); root.innerHTML = html;
  let out = '';
  const walk = (n) => {
    if (n.nodeType === 3) { out += n.nodeValue; return; }
    if (n.nodeType !== 1) return;
    const t = n.tagName.toLowerCase();
    if (t === 'br') { out += '\n'; return; }
    if (t === 'hr') { out += '\n---\n'; return; }
    if (t === 'a') {
      const label = n.textContent.trim(), href = n.getAttribute('href') || '';
      out += !label || label === href || label === href.replace(/^https?:\/\//, '') ? href : `${label} (${href})`; return;
    }
    if (t === 'li') out += '- ';
    n.childNodes.forEach(walk);
    if (['p', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'pre'].includes(t)) out += '\n\n'; else if (t === 'li') out += '\n'; else if (t === 'ul' || t === 'ol') out += '\n';
  };
  root.childNodes.forEach(walk);
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = text; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (x) { /* ignore */ } ta.remove(); return ok;
  }
}

/** A small contenteditable editor. Returns { el, getHtml, setHtml, isDirty, markClean, focus }. */
function richEditor(html, opts = {}) {
  const area = h('div', { class: 'rt-area', contenteditable: opts.readOnly ? 'false' : 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': opts.label || 'Editor', spellcheck: 'true' });
  area.innerHTML = html || '';
  let clean = area.innerHTML, saved = null;
  const dirty = () => area.innerHTML !== clean;
  const notify = () => { if (opts.onChange) opts.onChange(dirty()); };
  const exec = (cmd, val) => { area.focus(); document.execCommand(cmd, false, val); notify(); };
  const keepSel = () => { const s = window.getSelection(); saved = s && s.rangeCount ? s.getRangeAt(0).cloneRange() : null; };
  const restoreSel = () => { if (saved) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(saved); } };
  const actions = {
    bold: () => exec('bold'), italic: () => exec('italic'), underline: () => exec('underline'), ul: () => exec('insertUnorderedList'), ol: () => exec('insertOrderedList'),
    h: () => exec('formatBlock', document.queryCommandValue && /h2/i.test(document.queryCommandValue('formatBlock')) ? 'p' : 'h2'),
    unlink: () => exec('unlink'), clear: () => exec('removeFormat'), undo: () => exec('undo'), redo: () => exec('redo'),
    link: () => {
      keepSel(); const url = h('input', { type: 'text', id: 'rtl', placeholder: 'https://...' });
      modal({ title: 'Add a link', confirm: 'Add link', body: h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'rtl' }, 'Address'), url, h('div', { class: 'hint' }, 'Select the text first. Only http, https and mailto links are kept.')),
        onConfirm: async () => { const v = url.value.trim(); if (!/^(https?:\/\/|mailto:)\S+$/i.test(v)) throw new Error('Enter a full link starting with https://'); restoreSel(); exec('createLink', v); } });
    },
  };
  area.addEventListener('input', notify);
  area.addEventListener('paste', (e) => { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t); }); // never paste foreign markup
  const bar = h('div', { class: 'rt-bar', role: 'toolbar', 'aria-label': 'Formatting' }, RT_BUTTONS.map(([k, label, title, style]) =>
    h('button', { type: 'button', class: 'rt-btn', title, 'aria-label': title, style: style || null, onmousedown: (e) => e.preventDefault(), onclick: () => actions[k]() }, label)));
  const el = h('div', { class: 'rt' + (opts.readOnly ? ' ro' : '') }, opts.readOnly ? null : bar, area);
  return {
    el, getHtml: () => area.innerHTML, setHtml: (x) => { area.innerHTML = x; clean = area.innerHTML; notify(); }, isDirty: dirty, markClean: () => { clean = area.innerHTML; notify(); },
    focus: () => area.focus(), area,
  };
}

// ---------- step 4: the proposal ----------
const STAGE_TEXT = { signals: 'Reading the job and detecting its signals', template: 'Choosing the best proposal type', writing: 'Writing the proposal' };
const SOURCE_TEXT = { ai: 'Written by AI', manual: 'Edited by hand', chat: 'Revised by chat', restore: 'Restored' };

function proposalSection(s, initial, matching) {
  const owner = s.user_id === me.id;
  const setActions = typeof actionsFor === 'function' ? actionsFor() : () => {};
  const box = h('div', { class: 'card card-pad propcard' });
  let data = initial; let timer = null; let editor = null; let loaded = null; let newer = null; let dismissedFor = null;
  const busy = () => data && (data.status === 'queued' || data.status === 'running');
  const chatBusy = () => data && data.messages.some((m) => m.role === 'user' && (m.status === 'queued' || m.status === 'running'));
  let templates = [];
  // the stepper asks these before it leaves the step or finishes it
  box.__dirty = () => !!(editor && editor.isDirty());
  box.__finish = async () => {
    if (!data || data.status !== 'done' || !data.current) throw new Error('The proposal is not ready yet');
    if (editor && editor.isDirty()) {
      if (!(await ask('Save and finish?', 'Your unsaved changes are saved as a new version, then the proposal is finished.', 'Save and finish'))) return false;
      await api('POST', `/proposals/${data.id}/versions`, { html: editor.getHtml(), based_on: loaded }); editor.markClean();
    }
    await api('POST', `/screenings/${s.id}/proposal/done`, {});
    return true;
  };

  async function reload() { const r = await api('GET', `/screenings/${s.id}/proposal`); data = r.proposal; templates = r.templates; }
  async function poll() {
    clearTimeout(timer);
    if (!box.isConnected) return;
    try {
      const st = (await api('GET', `/screenings/${s.id}/proposal/state`)).state;
      if (!st) return;
      const was = data.status;
      if (st.status !== was || st.status === 'running') {
        if (st.status !== was) { await reload(); drawAll(); if (typeof stepCtx !== 'undefined' && stepCtx) stepCtx.refresh(); } // the stepper's Done button depends on it
        else { data.stage = st.stage; drawProgress(); }
      }
      // chat: replace only the chat panel
      const before = JSON.stringify(data.messages.map((m) => [m.id, m.status]));
      data.messages = st.messages;
      if (JSON.stringify(st.messages.map((m) => [m.id, m.status])) !== before) drawChat();
      // a newer version appeared (a chat revision): never replace text the person is typing
      if (data.current && st.latest_version && st.latest_version > loaded) {
        if (editor && !editor.isDirty()) { await reload(); drawAll(); }
        else if (dismissedFor !== st.latest_version) { newer = st.latest_version; drawBanner(); }
      }
    } catch (e) { /* try again next time */ }
    if (busy() || chatBusy()) timer = setTimeout(poll, 2500);
  }
  const startPolling = () => { clearTimeout(timer); timer = setTimeout(poll, 2500); };

  // ----- pieces
  const bannerEl = h('div', { class: 'newer', hidden: true });
  function drawBanner() {
    if (!newer) { bannerEl.hidden = true; return; }
    bannerEl.hidden = false;
    bannerEl.replaceChildren(icon('info'), h('span', {}, `Version ${newer} is ready. Loading it replaces the text in the editor.`),
      h('button', { class: 'btn sm', type: 'button', onclick: async () => { await reload(); newer = null; drawAll(); } }, 'Load it'),
      h('button', { class: 'btn sm', type: 'button', onclick: () => { dismissedFor = newer; newer = null; drawBanner(); } }, 'Keep my text'));
  }

  const startBtn = (label, templateId, primary = true) => {
    const b = h('button', { class: 'btn sm' + (primary ? ' primary' : ''), type: 'button' }, label);
    b.onclick = async () => {
      if (editor && editor.isDirty() && !(await ask('Write it again?', 'You have unsaved changes. Writing again adds a new version and loads it in their place.', 'Write again'))) return;
      btnBusy(b, 'Starting');
      try { await api('POST', `/screenings/${s.id}/proposal/start`, templateId ? { template_id: templateId } : {}); await reload(); drawAll(); startPolling(); }
      catch (x) { toast(x.message, true); b.disabled = false; b.replaceChildren(label); }
    };
    return b;
  };
  // the tab row: Copy, Save version (only with unsaved edits), Write again (when the profile changed), Finish
  function drawActions() {
    if (!data || !data.current || busy()) { setActions(owner && !busy() ? startBtn(data && data.status === 'error' ? 'Try again' : 'Write the proposal') : null); return; }
    const dirty = editor && editor.isDirty();
    const stale = matching && matching.proposal_profile && data.profile_id && data.profile_id !== matching.proposal_profile.id;
    const copy = actBtn('Copy', async () => { const ok = await copyText(htmlToPlainText(editor.getHtml())); toast(ok ? 'Copied. Paste it into Upwork.' : 'Could not copy. Select the text and copy it.', !ok); });
    const save = owner && dirty ? actBtn('Save version', async (e) => {
      btnBusy(e.currentTarget, 'Saving');
      try { const r = await api('POST', `/proposals/${data.id}/versions`, { html: editor.getHtml(), based_on: loaded }); toast(r.unchanged ? 'Nothing changed' : `Saved as version ${r.version_no}`); await reload(); newer = null; drawAll(); }
      catch (x) { toast(x.message, true); drawActions(); }
    }) : null;
    const finish = owner && !data.finalized_at ? actBtn('Finish proposal', async (e) => {
      const b = e.currentTarget; btnBusy(b, 'Finishing');
      try { if (await box.__finish()) { if (typeof stepCtx !== 'undefined' && stepCtx) await stepCtx.advanceTo(4); } else drawActions(); }
      catch (x) { toast(x.message, true); drawActions(); }
    }, true) : null;
    setActions(stale && owner ? startBtn('Write it again', null, false) : null, copy, save, finish);
  }

  function drawProgress() {
    const el = box.querySelector('.propprogress');
    if (el) el.querySelector('strong').textContent = data.status === 'queued' ? 'Waiting for a free slot' : (STAGE_TEXT[data.stage] || 'Working');
  }

  function explain() {
    const t = data.template, rk = data.ranking;
    const sel = h('select', { id: 'pt-sel', 'aria-label': 'Proposal type to write with' }, templates.map((x) => h('option', { value: x.id, selected: t && x.id === t.id }, x.name)));
    const again = h('button', { class: 'btn', type: 'button' }, 'Write again with this type');
    again.onclick = async () => {
      if (editor && editor.isDirty() && !(await ask('Write it again?', 'You have unsaved changes. Writing again adds a new version and loads it in their place.', 'Write again'))) return;
      btnBusy(again, 'Starting');
      try { await api('POST', `/screenings/${s.id}/proposal/start`, { template_id: Number(sel.value) }); await reload(); drawAll(); startPolling(); } catch (x) { toast(x.message, true); again.disabled = false; again.replaceChildren('Write again with this type'); }
    };
    const rankRow = (r) => h('tr', {}, h('td', { class: 'muted' }, r.rank), h('td', {}, r.name), h('td', {}, h('strong', {}, r.score)),
      h('td', { class: 'small muted' }, [r.qualified === false ? 'Does not qualify' : null,
        r.matched.length ? r.matched.map((m) => `${m.label} (${m.role === 'required' ? 'required' : m.role === 'supporting' ? '+1' : '+' + m.weight})`).join('; ') : 'None',
        r.excluded_by && r.excluded_by.length ? 'ruled out by ' + r.excluded_by.join(', ') : null].filter(Boolean).join(' · ')));
    const rankTable = rk ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['#', 'Proposal type', 'Score', 'Matched signals'].map((x) => h('th', {}, x)))), h('tbody', {}, rk.items.map(rankRow)))) : null;
    const sigRow = (x) => h('tr', {},
      h('td', { class: 'muted' }, x.signal_number), h('td', {}, x.signal_name),
      h('td', {}, h('strong', {}, x.value_name), ' ', x.is_fallback ? h('span', { class: 'chip' }, 'Default') : h('span', { class: 'chip brand' }, x.confidence), x.signal_number === 7 && x.is_primary ? h('span', { class: 'chip', style: 'margin-left:4px' }, 'Primary') : null),
      h('td', { class: 'small muted' }, x.evidence ? h('span', {}, h('em', {}, `"${x.evidence}"`), ' ' + (x.reason || '')) : (x.reason || '-')));
    const sigTable = h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['#', 'Signal', 'Value', 'Why'].map((x) => h('th', {}, x)))), h('tbody', {}, data.signals.map(sigRow))));
    const how = t ? 'Chosen by you' : '';
    return h('details', { class: 'explain' }, h('summary', {}, 'How this proposal was written: signals, proposal type and samples'),
      h('div', { class: 'explain-body' },
        t ? h('div', {}, h('h3', { class: 'section-title' }, 'Proposal type'),
          h('p', {}, h('strong', {}, t.name), ' ', h('span', { class: 'chip' }, t.choice === 'manual' ? how : rk && rk.defaulted ? 'Default: no signal matched' : 'Best fit for the signals'), ' ', h('span', { class: 'faint' }, `Score ${t.score ?? 0}`)),
          rankTable, owner ? h('div', { class: 'row', style: 'margin-top:12px' }, sel, again) : null) : null,
        h('div', { style: 'margin-top:18px' }, h('h3', { class: 'section-title' }, `Signals detected (${new Set(data.signals.map((x) => x.signal_number)).size})`), sigTable)));
  }

  function drawChat() {
    const el = box.querySelector('.chatpanel'); if (!el) return;
    const list = h('div', { class: 'chatlist', 'aria-live': 'polite' }, data.messages.length ? data.messages.map((m) => {
      const mine = m.role === 'user';
      return h('div', { class: 'msg ' + (mine ? 'me' : 'ai') },
        h('div', { class: 'bubble' }, m.content, mine && m.status === 'error' ? h('div', { class: 'err' }, icon('x'), m.error_message || 'Failed', owner ? h('button', { class: 'btn sm', type: 'button', onclick: async () => { try { await api('POST', `/proposal-messages/${m.id}/retry`, {}); const st = (await api('GET', `/screenings/${s.id}/proposal/state`)).state; data.messages = st.messages; drawChat(); startPolling(); } catch (x) { toast(x.message, true); } } }, 'Send again') : null) : null,
          mine && (m.status === 'queued' || m.status === 'running') ? h('div', { class: 'small faint' }, 'The AI is working on this...') : null,
          !mine && m.result_version ? h('div', { class: 'small' }, h('a', { onclick: async () => { await reload(); newer = null; drawAll(); } }, `Revised the proposal: version ${m.result_version}`)) : null),
        h('div', { class: 'small faint' }, `${mine ? (m.user_name || 'You') : 'AI'} · ${full(m.created_at)}${m.based_on_version ? ' · based on v' + m.based_on_version : ''}`));
    }) : h('p', { class: 'faint small' }, 'Ask the AI to improve the proposal: shorter, more technical, a different opening, an extra question. It answers here and saves each change as a new version.'));
    const input = h('textarea', { id: 'chat-in', rows: 2, maxlength: 2000, placeholder: 'For example: make the approach paragraph shorter', disabled: !owner || chatBusy() });
    const send = h('button', { class: 'btn primary', type: 'button', disabled: !owner || chatBusy() }, chatBusy() ? 'Waiting for the AI...' : 'Send');
    const go = async () => {
      const text = input.value.trim(); if (!text) return;
      btnBusy(send, 'Sending');
      try { await api('POST', `/proposals/${data.id}/messages`, { content: text }); const st = (await api('GET', `/screenings/${s.id}/proposal/state`)).state; data.messages = st.messages; drawChat(); startPolling(); }
      catch (x) { toast(x.message, true); send.disabled = false; send.replaceChildren('Send'); }
    };
    send.onclick = go; input.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') go(); });
    const quick = ['Make it shorter', 'More technical', 'Warmer tone', 'Add a closing question'].map((q) => h('button', { type: 'button', class: 'chip qchip', disabled: !owner || chatBusy(), onclick: () => { input.value = q; input.focus(); } }, q));
    el.replaceChildren(h('h3', { class: 'section-title' }, 'Chat with the AI'), list, owner ? h('div', {}, h('div', { class: 'chips', style: 'margin:8px 0' }, quick), input, h('div', { class: 'row', style: 'margin-top:8px;justify-content:space-between' }, h('span', { class: 'faint small' }, (navigator.platform || '').startsWith('Mac') ? 'Cmd + Enter to send' : 'Ctrl + Enter to send'), send)) : h('p', { class: 'hint' }, 'Only the person who submitted this job can chat with the AI.'));
    list.scrollTop = list.scrollHeight;
  }

  function workspace() {
    const cur = data.current; loaded = cur.version_no;
    const counter = h('div', { class: 'counter-line faint small' });
    const count = () => { const t = htmlToPlainText(editor.getHtml()); const words = t.trim() ? t.trim().split(/\s+/).length : 0; counter.textContent = `${words} words · ${t.length.toLocaleString()} characters` + (t.length > 5000 ? ' · over 5,000: Upwork may cut it off' : ''); counter.classList.toggle('over', t.length > 5000); };
    editor = richEditor(cur.html, { label: 'Proposal text', readOnly: !owner, onChange: (d) => { if (d !== wasDirty) { wasDirty = d; drawActions(); } dirtyChip.hidden = !d; count(); } });
    let wasDirty = false;
    const dirtyChip = h('span', { class: 'chip', hidden: true }, 'Unsaved changes');
    const vsel = h('select', { id: 'ver-sel', 'aria-label': 'Version' }, data.versions.map((v) => h('option', { value: v.version_no, selected: v.version_no === cur.version_no }, `v${v.version_no} · ${SOURCE_TEXT[v.source] || v.source} · ${ago(v.created_at)}`)));
    const viewing = h('div', { class: 'small muted' });
    vsel.onchange = async () => {
      const no = Number(vsel.value);
      if (no === cur.version_no) { editor.setHtml(cur.html); viewing.textContent = ''; return; }
      if (editor.isDirty() && !(await ask('Show the other version?', 'You have unsaved changes. They are lost when the other version is shown.', 'Show it', true))) { vsel.value = cur.version_no; return; }
      const v = (await api('GET', `/proposals/${data.id}/versions/${no}`)).version; editor.setHtml(v.content_html);
      viewing.replaceChildren(...[`Showing version ${no}. `, owner ? h('a', { onclick: async () => { try { await api('POST', `/proposals/${data.id}/restore`, { version_no: no }); toast(`Restored as a new version`); await reload(); newer = null; drawAll(); } catch (x) { toast(x.message, true); } } }, 'Restore it as the newest version') : null].filter(Boolean));
    };
    const stale = matching && matching.proposal_profile && data.profile_id && data.profile_id !== matching.proposal_profile.id;
    const staleBox = stale ? h('div', { class: 'newer', style: 'margin-bottom:12px' }, icon('info'), h('span', {}, `The sending profile was changed to ${matching.proposal_profile.name} after this proposal was written, so the sign-off is out of date. Write it again at the top right.`)) : null;
    const warns = data.warnings.length ? h('details', { class: 'warnline' }, h('summary', {}, icon('warn'), `${data.warnings.length} thing${data.warnings.length === 1 ? '' : 's'} to check before sending`), h('ul', {}, data.warnings.map((w) => h('li', {}, w.text)))) : null;
    count();
    // the editor on the left; the chat and "how it was written" beside it on a wide screen, below it on a narrow one
    return h('div', { class: 'propgrid' },
      h('div', { class: 'propmain' },
        staleBox,
        warns,
        h('div', { class: 'row', style: 'margin:12px 0 8px;gap:8px' }, vsel, dirtyChip),
        viewing, bannerEl, editor.el, counter,
        h('div', { class: 'faint small', style: 'margin-top:6px' }, `Written ${data.finished_at ? ago(data.finished_at) : ''}${data.template ? ' with ' + data.template.name : ''}. Every save, chat revision and restore is kept as a version.`)),
      h('div', { class: 'propside' }, h('div', { class: 'chatpanel' }), explain()));
  }

  function drawAll() {
    let body;
    if (!data) {
      body = h('div', {}, h('div', { class: 'jp-sec' }, 'Write the proposal'), h('p', { class: 'jp-body', style: 'margin:6px 0 0' }, 'The AI reads the job\'s signals, picks the proposal type that suits them, and writes it with your projects and profile.'));
    } else if (busy()) {
      body = h('div', { class: 'progress propprogress', role: 'status', 'aria-live': 'polite' }, h('div', { class: 'ring' }), h('strong', { style: 'font-size:17px' }, data.status === 'queued' ? 'Waiting for a free slot' : (STAGE_TEXT[data.stage] || 'Working')),
        h('p', { class: 'muted', style: 'margin-top:4px' }, 'Detecting the signals, choosing a proposal type and writing takes a few minutes with the real model (two AI calls). You can leave this page; the result is saved.'));
    } else if (data.status === 'error' && !data.current) {
      body = h('div', {}, h('div', { class: 'jp-sec' }, 'The proposal could not be written'), h('p', { class: 'jp-body', style: 'margin:6px 0 0' }, data.error || 'Something went wrong.'));
    } else if (data.current) {
      body = workspace();
    } else {
      body = h('div', {}, h('div', { class: 'jp-sec' }, 'Write the proposal'), h('p', { class: 'jp-body', style: 'margin:6px 0 0' }, 'Ready when you are.'));
    }
    box.replaceChildren(...[data && data.status === 'error' && data.current ? h('div', { class: 'err', style: 'margin:0 0 10px' }, icon('x'), 'The last attempt failed: ' + (data.error || '')) : null, body].filter(Boolean)); // replaceChildren prints a null as the word
    drawActions();
    if (data && data.current && !busy()) { drawChat(); drawBanner(); }
  }
  box.replaceChildren(h('div', { class: 'skel', style: 'width:60%;margin-bottom:12px' }), h('div', { class: 'skel', style: 'width:80%' }));
  reload().then(() => { drawAll(); if (busy() || chatBusy()) startPolling(); }).catch((e) => { box.replaceChildren(h('div', { class: 'card-pad' }, emptyState('x', 'Could not load the proposal', e.message, null))); });
  return box;
}

// ---------- templates (admin and manager) ----------
const canEditTemplates = () => me.role === 'admin' || me.role === 'manager';

async function templateView(idStr) {
  const isNew = idStr === 'new';
  const [{ template: t }, sigData] = await Promise.all([isNew ? Promise.resolve({ template: null }) : api('GET', '/templates/' + idStr), api('GET', '/signals')]);
  const signals = sigData.signals;
  const f = { name: h('input', { type: 'text', id: 'tn', maxlength: 160, value: t ? t.name : '' }), desc: h('textarea', { id: 'td', maxlength: 1000, style: 'min-height:70px' }),
    priority: h('input', { type: 'number', id: 'tp', min: 0, step: 1, value: t ? t.priority : 100 }), active: h('input', { type: 'checkbox', id: 'ta', checked: t ? !!Number(t.active) : true }),
    isDefault: h('input', { type: 'checkbox', id: 'tdf', checked: t ? !!Number(t.is_default) : false }),
    prompt: h('textarea', { id: 'tpr', style: 'min-height:140px', maxlength: 20000, placeholder: 'Extra instructions for the AI when it writes with this type. Optional.' }) };
  f.desc.value = t && t.description ? t.description : ''; f.prompt.value = t && t.prompt ? t.prompt : '';
  const fmt = richEditor(t ? t.body_html : '<p></p>', { label: 'Proposal type format' });
  const err = h('div', { class: 'err', hidden: true });
  const saveBtn = h('button', { class: 'btn primary', type: 'button' }, isNew ? 'Create type' : 'Save type');
  saveBtn.onclick = async () => {
    err.hidden = true; btnBusy(saveBtn, 'Saving');
    const body = { name: f.name.value, description: f.desc.value.trim() || null, body_html: fmt.getHtml(), prompt: f.prompt.value.trim() || null, priority: Number(f.priority.value), active: f.active.checked, is_default: f.isDefault.checked };
    try { const r = await api(isNew ? 'POST' : 'PATCH', isNew ? '/templates' : '/templates/' + t.id, body); toast(isNew ? 'Proposal type created' : 'Proposal type saved'); if (isNew) location.hash = '#/t/' + r.id; else route(); }
    catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; saveBtn.disabled = false; saveBtn.replaceChildren(isNew ? 'Create type' : 'Save type'); }
  };
  const del = !isNew ? h('button', { class: 'btn danger', type: 'button', onclick: () => modal({ title: 'Delete ' + t.name + '?', confirm: 'Delete proposal type', danger: true,
    body: h('p', { class: 'muted' }, 'This removes the proposal type, its signal mapping and its samples. Proposals already written keep its name. To stop using it but keep it, untick Active instead. It cannot be undone.'),
    onConfirm: async () => { await api('DELETE', '/templates/' + t.id); toast('Proposal type deleted'); location.hash = '#/writing'; } }) }, 'Delete') : null;

  const parts = [
    pageHead(isNew ? 'New proposal type' : t.name, isNew ? 'Describe the format (with Chosen when and Length lines), then add its signals and samples.' : 'A proposal type: used by the app\'s writer and the Claude plugin.', [del, saveBtn],
      { back: ['#/writing', 'Writing guide'], badges: isNew ? null : onOff(t.active, 'Active', 'Retired') }),
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'Details'),
      h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tn' }, 'Name'), f.name),
        h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tp' }, 'Priority'), f.priority, h('div', { class: 'hint' }, 'Tens set the priority group (10 first, then 20, 30, 40); within a group, more supporting signals win, then the lower number.'))),
      h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'td' }, 'Description'), f.desc),
      h('div', { class: 'field row', style: 'margin-top:12px' }, f.active, h('label', { for: 'ta', style: 'font-weight:600' }, 'Active (can be chosen for proposals)')),
      h('div', { class: 'field row', style: 'margin-top:8px' }, f.isDefault, h('label', { for: 'tdf', style: 'font-weight:600' }, 'Default type (used when no type qualifies)'))),
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'Format'), h('p', { class: 'hint', style: 'margin:0 0 10px' }, 'The structure and rules the proposal must follow. The AI reads this as written.'), fmt.el),
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'Prompt'), h('p', { class: 'hint', style: 'margin:0 0 10px' }, 'Extra instructions used with this type. Safety rules (no invented facts, links or numbers) always apply on top.'), f.prompt),
    err,
  ];
  if (!isNew) { parts.push(mappingCard(t, signals), samplesCard(t)); }
  shell('writing', parts, true);
}

function mappingCard(t, signals) {
  const rows = t.mappings.map((m) => ({ signal_id: m.signal_id, value_id: m.value_id, weight: m.weight, role: m.role || 'weight', req_group: m.req_group ?? null, source: m.source }));
  const ROLES = [['required', 'Required'], ['supporting', 'Supporting (+1)'], ['exclude', 'Rules it out'], ['weight', 'Weight']];
  const holder = h('div', {}); const err = h('div', { class: 'err', hidden: true });
  const valuesCache = new Map();
  async function valuesOf(sid) { if (!valuesCache.has(sid)) valuesCache.set(sid, (await api('GET', '/signals/' + sid)).signal.values); return valuesCache.get(sid); }
  async function draw() {
    const trs = [];
    for (const [i, r] of rows.entries()) {
      const vals = await valuesOf(r.signal_id);
      const sSel = h('select', { 'aria-label': 'Signal', style: 'width:100%' }, signals.map((s) => h('option', { value: s.id, selected: s.id === r.signal_id }, `${s.number}. ${s.name}`)));
      const vSel = h('select', { 'aria-label': 'Value', style: 'width:100%' }, h('option', { value: '' }, 'Any stated value'), vals.map((v) => h('option', { value: v.id, selected: v.id === r.value_id }, v.name + (v.is_fallback ? ' (fallback)' : ''))));
      const roleSel = h('select', { 'aria-label': 'Role', style: 'width:100%' }, ROLES.map(([v, l]) => h('option', { value: v, selected: r.role === v }, l)));
      roleSel.onchange = () => { r.role = roleSel.value; if (r.role === 'required' && !r.req_group) r.req_group = 1; if (r.role === 'weight' && !r.weight) r.weight = 1; r.source = 'manual'; draw(); };
      const w = r.role === 'weight' ? h('input', { type: 'number', min: 1, max: 10, step: 1, value: r.weight, class: 'scoreinp', 'aria-label': 'Weight' })
        : r.role === 'required' ? h('input', { type: 'number', min: 1, max: 20, step: 1, value: r.req_group || 1, class: 'scoreinp', 'aria-label': 'Group', title: 'Rows in the same group are alternatives: one of them is enough. Every group must be met.' })
        : h('span', { class: 'faint small' }, '-');
      sSel.onchange = () => { r.signal_id = Number(sSel.value); r.value_id = null; r.source = 'manual'; draw(); };
      vSel.onchange = () => { r.value_id = vSel.value ? Number(vSel.value) : null; r.source = 'manual'; };
      w.onchange = () => { if (r.role === 'weight') r.weight = Number(w.value); else r.req_group = Number(w.value); r.source = 'manual'; };
      trs.push(h('tr', {}, h('td', {}, sSel), h('td', {}, vSel), h('td', {}, roleSel), h('td', {}, w), h('td', {}, r.source === 'starter' ? h('span', { class: 'chip', title: 'Suggested from the template text. Review it.' }, 'Starter') : h('span', { class: 'faint small' }, 'Yours')),
        acts(h('button', { class: 'btn sm', type: 'button', onclick: () => { rows.splice(i, 1); draw(); } }, 'Remove'))));
    }
    holder.replaceChildren(rows.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Signal', 'Value', 'Role', 'Weight or group', '', ''].map((x) => h('th', {}, x)))), h('tbody', {}, trs))) : h('p', { class: 'faint small' }, 'No signals yet. Without any, this template can only be the default or be chosen by hand.'));
  }
  const add = h('button', { class: 'btn sm', type: 'button' }, 'Add signal');
  add.onclick = () => { rows.push({ signal_id: signals[0].id, value_id: null, weight: 0, role: 'supporting', req_group: null, source: 'manual' }); draw(); };
  const save = h('button', { class: 'btn sm primary', type: 'button' }, 'Save signals');
  save.onclick = async () => {
    err.hidden = true; btnBusy(save, 'Saving');
    try { await api('PUT', `/templates/${t.id}/signals`, { mappings: rows.map((r) => ({ signal_id: r.signal_id, value_id: r.value_id, weight: r.role === 'weight' ? r.weight : 0, role: r.role, req_group: r.role === 'required' ? r.req_group || 1 : null })) }); toast('Signals saved'); route(); }
    catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; save.disabled = false; save.replaceChildren('Save signals'); }
  };
  draw();
  const hasStarter = rows.some((r) => r.source === 'starter');
  return h('div', { class: 'card card-pad' }, h('div', { class: 'row spread' }, h('h3', { class: 'section-title', style: 'margin:0' }, `Signals this type suits (${rows.length})`), h('div', { class: 'row' }, add, save)),
    h('p', { class: 'hint', style: 'margin:8px 0 12px' }, 'Required: the type is only chosen when these match (rows with the same group number are alternatives). Rules it out: any match excludes the type. Supporting: each match adds one point. Qualifying types are compared by priority group (the priority number divided by 10), then points. When none qualifies, the default type is used. "Any stated value" matches whenever the post states a value.'),
    hasStarter ? h('div', { class: 'notice' }, icon('info'), 'Rows marked "starter" were suggested from what the type says. Review them: they are a starting point, not a rule.') : null, holder, err);
}

function samplesCard(t) {
  const holder = h('div', {}); let pg = 1;
  function dialog(smp) {
    const f = { title: h('input', { type: 'text', id: 'st', maxlength: 250, value: smp ? smp.title : '' }), author: h('input', { type: 'text', id: 'sa', maxlength: 120, value: smp && smp.author ? smp.author : '' }),
      url: h('input', { type: 'text', id: 'su', value: smp && smp.job_url ? smp.job_url : '', placeholder: 'https://www.upwork.com/jobs/...' }), kw: h('input', { type: 'text', id: 'sk', maxlength: 500, value: smp && smp.job_keywords ? smp.job_keywords : '' }),
      content: h('textarea', { id: 'sc', style: 'min-height:260px', maxlength: 20000 }), active: h('input', { type: 'checkbox', id: 'sx', checked: smp ? !!Number(smp.active) : true }) };
    f.content.value = smp ? smp.content : '';
    modal({ title: smp ? 'Edit sample' : 'Add a sample proposal', confirm: smp ? 'Save sample' : 'Add sample', wide: true,
      body: h('div', {}, h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'st' }, 'Title'), f.title), h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'sa' }, 'Written by (optional)'), f.author)),
        h('div', { class: 'grid2', style: 'margin-top:16px' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'su' }, 'Job link (optional)'), f.url), h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'sk' }, 'Job keywords (optional)'), f.kw)),
        h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'sc' }, 'The sample proposal'), f.content, h('div', { class: 'hint' }, 'Used as a reference for tone and structure only. Names, links and numbers in it are never copied into a new proposal.')),
        h('div', { class: 'field row', style: 'margin-top:12px' }, f.active, h('label', { for: 'sx', style: 'font-weight:600' }, 'Active (used when writing)'))),
      extra: smp ? () => h('button', { class: 'btn danger', type: 'button', onclick: () => modal({ title: 'Delete this sample?', confirm: 'Delete sample', danger: true, body: h('p', { class: 'muted' }, 'It cannot be undone.'),
        onConfirm: async () => { await api('DELETE', '/template-samples/' + smp.id); document.querySelectorAll('dialog').forEach((d) => d.close()); toast('Sample deleted'); load(); } }) }, 'Delete') : null,
      onConfirm: async () => { const body = { title: f.title.value, author: f.author.value.trim() || null, job_url: f.url.value.trim() || null, job_keywords: f.kw.value.trim() || null, content: f.content.value, active: f.active.checked };
        await api(smp ? 'PATCH' : 'POST', smp ? '/template-samples/' + smp.id : `/templates/${t.id}/samples`, body); toast(smp ? 'Sample saved' : 'Sample added'); load(); } });
  }
  async function load() {
    const d = await api('GET', `/templates/${t.id}/samples?page=${pg}`); pg = d.page;
    holder.replaceChildren(...[d.samples.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Sample', 'By', 'Job', 'Status', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, d.samples.map((s) => h('tr', {}, h('td', {}, h('strong', {}, s.title), h('div', { class: 'meta' }, s.content.slice(0, 110).replace(/\n/g, ' ') + '...')), h('td', { class: 'muted' }, s.author || '-'),
        h('td', {}, s.job_url ? h('a', { href: s.job_url, target: '_blank', rel: 'noopener noreferrer' }, 'Job') : h('span', { class: 'faint' }, '-')),
        h('td', {}, onOff(s.active, 'Active', 'Off')), acts(h('button', { class: 'btn sm', type: 'button', onclick: () => dialog(s) }, 'Edit'))))))) : h('p', { class: 'faint small' }, 'No samples yet. Add proposals that worked: the AI uses up to 3 of them as a reference for tone and structure.'),
      pager(d.total, d.page, (n) => { pg = n; load(); })].filter(Boolean)); // replaceChildren prints a null as the word
  }
  load();
  return h('div', { class: 'card card-pad' }, h('div', { class: 'row spread' }, h('h3', { class: 'section-title', style: 'margin:0' }, 'Sample proposals'), h('button', { class: 'btn sm', type: 'button', onclick: () => dialog(null) }, 'Add sample')), h('div', { style: 'height:10px' }), holder);
}

// ---------- signals ----------
async function signalsView() {
  const [{ signals }, { layers }] = await Promise.all([api('GET', '/signals'), api('GET', '/signal-layers')]);
  const isAdmin = me.role === 'admin';
  function dialog() {
    const f = { number: h('input', { type: 'number', id: 'sgn', min: 1, step: 1, value: Math.max(...signals.map((x) => x.number)) + 1 }), name: h('input', { type: 'text', id: 'sgm', maxlength: 160 }),
      layer: h('select', { id: 'sgl', style: 'width:100%' }, layers.map((l) => h('option', { value: l.id }, l.name))), decides: h('textarea', { id: 'sgd', style: 'min-height:70px' }), multi: h('input', { type: 'checkbox', id: 'sgx' }) };
    modal({ title: 'Add a signal', confirm: 'Add signal', wide: true,
      body: h('div', {}, h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'sgm' }, 'Name'), f.name), h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'sgn' }, 'Number'), f.number)),
        h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'sgl' }, 'Layer'), f.layer), h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'sgd' }, 'What it decides'), f.decides),
        h('div', { class: 'field row', style: 'margin-top:12px' }, f.multi, h('label', { for: 'sgx', style: 'font-weight:600' }, 'Multi-select (a job can have several values)')), h('p', { class: 'hint' }, 'Add its values on the next page.')),
      onConfirm: async () => { const r = await api('POST', '/signals', { number: Number(f.number.value), layer_id: Number(f.layer.value), name: f.name.value, decides: f.decides.value.trim() || null, multi_select: f.multi.checked }); toast('Signal added'); location.hash = '#/sig/' + r.id; } });
  }
  const open = (s) => () => { location.hash = '#/sig/' + s.id; };
  shell('signals', [pageHead('Signals', 'What the AI looks for in a job post. Each signal has values, a proposal move for each, and a default (fallback) for when the post says nothing.',
    isAdmin ? h('button', { class: 'btn primary', onclick: dialog }, icon('screen'), 'Add signal') : null),
    listCard({ items: signals, icon: 'audit', emptyTitle: 'No signals yet', emptyText: 'Run the proposal seed, or add a signal.',
      search: { placeholder: 'Search signals', text: (s) => s.number + ' ' + s.name + ' ' + (s.decides || '') },
      filters: [{ key: 'layer', label: 'Any layer', options: layers.map((l) => [l.id, l.name]), test: (s, v) => String(s.layer_id) === v },
        { key: 'kind', label: 'Any kind', options: [['multi', 'Multi-select'], ['single', 'One value'], ['unused', 'Used by no proposal type']], test: (s, v) => (v === 'multi' ? !!s.multi_select : v === 'single' ? !s.multi_select : !Number(s.template_count)) },
        statusFilter((s) => s.active, 'Off')],
      render: (slice) => dataTable(['#', 'Signal', 'Layer', 'Values', 'Proposal types', 'Status'], slice.map((s) => h('tr', { class: 'click', tabindex: 0, onclick: open(s), onkeydown: (e) => { if (e.key === 'Enter') open(s)(); } },
        h('td', { class: 'muted' }, s.number), h('td', {}, h('strong', {}, s.name), s.multi_select ? h('span', { class: 'pill wait', style: 'margin-left:8px' }, 'Multi-select') : null, s.decides ? h('div', { class: 'meta' }, cap(s.decides.slice(0, 110))) : null),
        h('td', { class: 'muted' }, s.layer_name), h('td', { class: 'muted' }, s.value_count), h('td', { class: 'muted' }, s.template_count),
        h('td', {}, onOff(s.active, 'Active', 'Off'))))) })]);
}

async function signalView(id) {
  const { signal: s } = await api('GET', '/signals/' + id);
  const { layers } = await api('GET', '/signal-layers');
  const isAdmin = me.role === 'admin';
  function editSignal() {
    const f = { number: h('input', { type: 'number', id: 'esn', min: 1, step: 1, value: s.number }), name: h('input', { type: 'text', id: 'esm', maxlength: 160, value: s.name }),
      layer: h('select', { id: 'esl', style: 'width:100%' }, layers.map((l) => h('option', { value: l.id, selected: l.id === s.layer_id }, l.name))), decides: h('textarea', { id: 'esd', style: 'min-height:70px' }),
      notes: h('textarea', { id: 'eso', style: 'min-height:50px' }), multi: h('input', { type: 'checkbox', id: 'esx', checked: s.multi_select }), active: h('input', { type: 'checkbox', id: 'esa', checked: !!Number(s.active) }) };
    f.decides.value = s.decides || ''; f.notes.value = s.notes || '';
    modal({ title: 'Edit signal', confirm: 'Save signal', wide: true,
      body: h('div', {}, h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'esm' }, 'Name'), f.name), h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'esn' }, 'Number'), f.number)),
        h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'esl' }, 'Layer'), f.layer), h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'esd' }, 'What it decides'), f.decides),
        h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'eso' }, 'Notes'), f.notes),
        h('div', { class: 'field row', style: 'margin-top:12px' }, f.multi, h('label', { for: 'esx', style: 'font-weight:600' }, 'Multi-select')), h('div', { class: 'field row' }, f.active, h('label', { for: 'esa', style: 'font-weight:600' }, 'Active (used when detecting signals)'))),
      extra: () => h('button', { class: 'btn danger', type: 'button', onclick: () => modal({ title: 'Delete ' + s.name + '?', confirm: 'Delete signal', danger: true,
        body: h('p', { class: 'muted' }, `This removes the signal, its ${s.values.length} values and its place in ${s.used_by.length} proposal type mapping row(s). Proposals already written keep their copy. It cannot be undone.`),
        onConfirm: async () => { await api('DELETE', '/signals/' + s.id); document.querySelectorAll('dialog').forEach((d) => d.close()); toast('Signal deleted'); location.hash = '#/signals'; } }) }, 'Delete'),
      onConfirm: async () => { await api('PATCH', '/signals/' + s.id, { number: Number(f.number.value), name: f.name.value, layer_id: Number(f.layer.value), decides: f.decides.value.trim() || null, notes: f.notes.value.trim() || null, multi_select: f.multi.checked, active: f.active.checked }); toast('Signal saved'); route(); } });
  }
  function valueDialog(v) {
    const f = { name: h('input', { type: 'text', id: 'vn', maxlength: 200, value: v ? v.name : '' }), detect: h('textarea', { id: 'vd', style: 'min-height:90px' }), move: h('textarea', { id: 'vm', style: 'min-height:90px' }),
      fb: h('input', { type: 'checkbox', id: 'vf', checked: v ? v.is_fallback : false }), active: h('input', { type: 'checkbox', id: 'va', checked: v ? !!Number(v.active) : true }) };
    f.detect.value = v && v.detect ? v.detect : ''; f.move.value = v && v.move ? v.move : '';
    modal({ title: v ? 'Edit value' : 'Add a value', confirm: v ? 'Save value' : 'Add value', wide: true,
      body: h('div', {}, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'vn' }, 'Value'), f.name),
        h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'vd' }, 'How to detect it'), f.detect, h('div', { class: 'hint' }, 'The words and situations that show it. Leave empty for a fallback.')),
        h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'vm' }, 'The proposal move'), f.move, h('div', { class: 'hint' }, 'What the proposal should do when this value applies.')),
        h('div', { class: 'field row', style: 'margin-top:12px' }, f.fb, h('label', { for: 'vf', style: 'font-weight:600' }, 'This is the fallback (used when the post says nothing)')), h('div', { class: 'field row' }, f.active, h('label', { for: 'va', style: 'font-weight:600' }, 'Active'))),
      extra: v ? () => h('button', { class: 'btn danger', type: 'button', onclick: () => modal({ title: 'Delete ' + v.name + '?', confirm: 'Delete value', danger: true, body: h('p', { class: 'muted' }, 'Template rows that name this value are removed too. It cannot be undone.'),
        onConfirm: async () => { await api('DELETE', '/signal-values/' + v.id); document.querySelectorAll('dialog').forEach((d) => d.close()); toast('Value deleted'); route(); } }) }, 'Delete') : null,
      onConfirm: async () => { const body = { name: f.name.value, detect: f.detect.value.trim() || null, move: f.move.value.trim() || null, is_fallback: f.fb.checked, active: f.active.checked };
        await api(v ? 'PATCH' : 'POST', v ? '/signal-values/' + v.id : `/signals/${s.id}/values`, body); toast(v ? 'Value saved' : 'Value added'); route(); } });
  }
  const vcard = (v) => h('div', { class: 'card card-pad vcard' + (Number(v.active) ? '' : ' off') },
    h('div', { class: 'row spread' }, h('div', { class: 'row', style: 'gap:8px' }, h('strong', {}, v.name), v.is_fallback ? h('span', { class: 'pill wait' }, 'Fallback') : null, Number(v.active) ? null : h('span', { class: 'pill wait' }, 'Off')), isAdmin ? h('button', { class: 'btn sm', type: 'button', onclick: () => valueDialog(v) }, 'Edit') : null),
    v.detect || v.move ? h('dl', { class: 'facts', style: 'margin-top:10px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))' },
      v.detect ? h('div', {}, h('dt', {}, v.is_fallback ? 'When' : 'How to detect it'), h('dd', {}, cap(v.detect))) : null,
      v.move ? h('div', {}, h('dt', {}, 'The proposal move'), h('dd', {}, cap(v.move))) : null) : null);
  shell('signals', [
    pageHead(`${s.number}. ${s.name}`, s.layer_name, isAdmin ? h('button', { class: 'btn primary', onclick: editSignal }, 'Edit signal') : null,
      { back: ['#/signals', 'Signals'], badges: [onOff(s.active, 'Active', 'Off'), s.multi_select ? h('span', { class: 'pill wait' }, 'Multi-select') : null] }),
    s.decides || s.notes ? h('div', { class: 'card card-pad' }, s.decides ? [h('h3', { class: 'section-title' }, 'What it decides'), h('p', {}, cap(s.decides))] : null, s.notes ? [h('h3', { class: 'section-title', style: 'margin-top:12px' }, 'Notes'), h('p', {}, s.notes)] : null) : null,
    h('div', { class: 'sechead', style: 'margin-top:8px' }, h('h2', {}, `Values (${s.values.length})`), isAdmin ? h('button', { class: 'btn', type: 'button', onclick: () => valueDialog(null) }, icon('screen'), 'Add value') : null),
    s.values.length ? clientPaged(s.values, (slice) => h('div', { style: 'display:grid;gap:12px' }, slice.map(vcard))) : h('div', { class: 'card' }, emptyState('tag', 'No values yet', isAdmin ? 'Add the values this signal can take.' : 'This signal has no values.')),
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, `Proposal types that use it (${s.used_by.length})`),
      s.used_by.length ? h('ul', { class: 'plain' }, s.used_by.map((u) => h('li', {}, h('a', { href: '#/t/' + u.id }, u.name), h('span', { class: 'muted' }, ` · ${u.value_name || 'Any stated value'} · weight ${u.weight}`)))) : h('p', { class: 'jp-label' }, 'No proposal type is mapped to this signal yet.')),
  ], true);
}
