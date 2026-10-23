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
    el, getHtml: () => area.innerHTML, setHtml: (x) => { area.innerHTML = x; clean = area.innerHTML; notify(); },
    appendHtml: (x) => { area.insertAdjacentHTML('beforeend', x); notify(); }, // an unsaved change: the person saves it
    replaceHtml: (x) => { area.innerHTML = x; notify(); }, // R132: the whole text changed in one go, as an unsaved change (setHtml loads a saved one)
    isDirty: dirty, markClean: () => { clean = area.innerHTML; notify(); },
    focus: () => area.focus(), area,
  };
}

// ---------- comparing two versions (R72, R76, R78, R81) ----------
/**
 * Two versions side by side on a full screen. Each column has its version picker on top (left over left, right over right, a line
 * between them with the swap button on it), then the AI's notes on that version, then the whole text. The notes say plainly what
 * this version does better and worse than the other one, and what is worth bringing into it. Above the columns, the AI's
 * recommendation and why. Close (or Esc) goes back. `opts.latest`: the newest version; `opts.send`: sends a chat request.
 */
async function compareVersions(proposalId, versions, left, right, opts = {}) {
  const cache = new Map();
  const get = async (no) => { if (!cache.has(no)) cache.set(no, (await api('GET', `/proposals/${proposalId}/versions/${no}`)).version); return cache.get(no); };
  const label = (v) => `v${v.version_no} · ${SOURCE_TEXT[v.source] || v.source} · ${ago(v.created_at)}`;
  const pick = (val, name) => h('select', { class: 'sm', 'aria-label': name }, versions.map((v) => h('option', { value: v.version_no, selected: v.version_no === val }, label(v))));
  const sels = [pick(left, 'Left version'), pick(right, 'Right version')];
  const swap = h('button', { class: 'fvswap', type: 'button', title: 'Swap the two sides', 'aria-label': 'Swap the two sides', onclick: () => { const x = sels[0].value; sels[0].value = sels[1].value; sels[1].value = x; draw(); } }, '⇄');
  const verdict = h('div', { class: 'fvverdict' });
  // each column: a header that stays (its picker never moves), and a body drawn again for each pair
  const metas = [h('div', { class: 'fvmeta' }), h('div', { class: 'fvmeta' })];
  const bodies = [h('div', { class: 'fvscroll' }), h('div', { class: 'fvscroll' })];
  const cols = [0, 1].map((i) => h('section', { class: 'fvcol' }, h('header', { class: 'fvhead' }, h('div', { class: 'fvside' }, i ? 'Right' : 'Left'), sels[i], metas[i]), bodies[i]));
  let gen = 0, timer = null, shown = [null, null];
  const words = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);
  const column = (i, v, notes) => {
    const t = htmlToPlainText(v.content_html), other = shown[1 - i], vs = `v${v.version_no}`, ov = other ? `v${other.version_no}` : 'the other';
    metas[i].replaceChildren(...[notes && notes.stronger ? h('span', { class: 'pill PASS' }, 'Recommended') : notes && notes.weaker ? h('span', { class: 'pill wait' }, 'Not recommended') : null,
      h('span', { class: 'faint small' }, [v.note, `${words(t)} words`].filter(Boolean).join(' · '))].filter(Boolean));
    const list = (kind, title, items) => (items && items.length ? h('div', { class: 'fvblock ' + kind }, h('div', { class: 'fvblockhead' }, h('span', { class: 'fvmark' }, kind === 'good' ? '✓' : '!'), title),
      h('ul', {}, items.map((x) => h('li', {}, x)))) : null);
    const bring = (x) => {
      const copy = h('button', { class: 'btn sm', type: 'button', onclick: async () => { const ok = await copyText(x.instruction); toast(ok ? 'Copied. Paste it into the chat.' : 'Could not copy', !ok); } }, 'Copy');
      const send = opts.send && opts.latest === v.version_no ? h('button', { class: 'btn sm primary', type: 'button', onclick: async (e) => { const b = e.currentTarget; btnBusy(b, 'Sending'); try { await opts.send(x.instruction); dlg.close(); } catch (err) { toast(err.message, true); b.disabled = false; b.replaceChildren('Send to the chat'); } } }, 'Send to the chat') : null;
      return h('div', { class: 'fvbring' }, h('strong', {}, x.what), h('div', { class: 'fvinstr' }, h('span', { class: 'fvinstrlbl' }, 'For the chat'), x.instruction), h('div', { class: 'row', style: 'gap:6px' }, copy, send)); };
    const notesEl = notes === 'busy' ? h('div', { class: 'fvnotes' }, liveLine({ id: `cmp-${vs}-${ov}`, label: `Comparing ${vs} with ${ov}`, now: 'Looking at ', items: ['their openings', 'how specific each is to this client', 'the proof from the projects', 'clarity and length', 'the tone', 'the call to action', 'what is worth bringing over'], typical: 50 }))
      : notes ? h('div', { class: 'fvnotes' + (notes.stronger ? ' best' : '') },
        h('div', { class: 'fvnoteshead' }, h('strong', {}, `${vs} compared with ${ov}`)),
        list('good', `Where ${vs} is better`, notes.good), list('weak', `Where ${vs} is weaker`, notes.weak),
        notes.bring.length ? h('div', { class: 'fvblock bring' }, h('div', { class: 'fvblockhead' }, h('span', { class: 'fvmark' }, '+'), `Worth bringing into ${vs} from ${ov}`), notes.bring.map(bring),
          opts.send && opts.latest !== v.version_no ? h('div', { class: 'faint small' }, `The chat changes the newest version (v${opts.latest}). Copy these to use them there.`) : null) : null,
        !notes.good.length && !notes.weak.length && !notes.bring.length ? h('div', { class: 'faint small' }, 'Nothing to note.') : null) : null;
    bodies[i].replaceChildren(...[notesEl, h('div', { class: 'fvtextlbl' }, `The proposal, ${vs}`), h('div', { class: 'fvtext' }, t),
      (v.answers || []).length ? h('div', { class: 'fvqa' }, h('div', { class: 'jp-sec' }, `Screening answers (${v.answers.length})`), v.answers.map((x, k) => h('div', {}, h('div', { class: 'jp-label' }, `${k + 1}. ${x.question}`), h('div', { class: 'fvtext' }, x.answer)))) : null].filter(Boolean));
  };
  const intro = 'The AI read both versions for this job. Each column says what that version does better and worse than the other one, and what is worth bringing into it.';
  const drawNotes = (r) => {
    const [a, b] = shown; if (!a || !b) return;
    if (!r || r.status === 'queued' || r.status === 'running') { verdict.replaceChildren(liveLine({ id: `cmpv-${a.version_no}-${b.version_no}`, label: 'Comparing them', now: '', items: ['Reading both versions for this job', 'Weighing what each does better', 'Deciding which one to send', 'Writing what to bring over'], typical: 50 })); column(0, a, 'busy'); column(1, b, 'busy'); return; }
    if (r.status === 'error' || !r.result) { verdict.replaceChildren(h('span', { class: 'err' }, icon('x'), 'The comparison could not be made' + (r.error ? ': ' + r.error : '.')), h('button', { class: 'btn sm', type: 'button', onclick: () => ask_(a.version_no, b.version_no) }, 'Try again')); column(0, a, null); column(1, b, null); return; }
    const c = r.result, best = c.stronger === 'left' ? a : c.stronger === 'right' ? b : null;
    verdict.replaceChildren(h('div', { class: 'fvrec' }, h('span', { class: 'fvreclbl' }, 'Recommendation'), h('span', { class: 'pill ' + (best ? 'PASS' : 'wait') }, best ? `Send v${best.version_no}` : 'Either one')),
      h('div', { class: 'fvwhy' }, c.verdict, h('div', { class: 'faint small', style: 'margin-top:4px' }, intro)));
    column(0, a, { good: c.left.good, weak: c.left.weak, bring: c.bring_over.filter((x) => x.to === 'left'), stronger: c.stronger === 'left', weaker: c.stronger === 'right' });
    column(1, b, { good: c.right.good, weak: c.right.weak, bring: c.bring_over.filter((x) => x.to === 'right'), stronger: c.stronger === 'right', weaker: c.stronger === 'left' });
  };
  const ask_ = async (a, b) => { const my = gen; drawNotes(null);
    try { let r = await api('POST', `/proposals/${proposalId}/compare`, { a, b });
      const poll = async () => { if (my !== gen) return; drawNotes(r); if (r.status === 'queued' || r.status === 'running') timer = setTimeout(async () => { try { r = await api('GET', `/proposals/${proposalId}/compare?a=${a}&b=${b}`); } catch { /* next time */ } poll(); }, 2500); };
      poll(); } catch (x) { verdict.replaceChildren(h('span', { class: 'err' }, x.message)); } };
  const draw = async () => {
    const my = ++gen; clearTimeout(timer);
    const a = Number(sels[0].value), b = Number(sels[1].value);
    const [va, vb] = await Promise.all([get(a), get(b)]); if (my !== gen) return;
    shown = [va, vb];
    if (a === b) { verdict.replaceChildren(h('span', { class: 'jp-label' }, 'Pick two different versions to compare.')); column(0, va, null); column(1, vb, null); } else ask_(a, b);
  };
  sels[0].onchange = draw; sels[1].onchange = draw;
  const dlg = h('dialog', { class: 'fullview', 'aria-label': 'Compare versions' },
    h('div', { class: 'fvbar' }, h('div', { class: 'fvtitle' }, h('strong', {}, 'Compare versions'), opts.title ? h('span', { class: 'faint small' }, opts.title) : null),
      h('button', { class: 'btn sm', type: 'button', onclick: () => dlg.close() }, icon('x'), 'Close')),
    verdict, h('div', { class: 'fvgrid' }, cols[0], h('div', { class: 'fvmid' }, swap), cols[1]));
  dlg.addEventListener('close', () => { gen++; clearTimeout(timer); dlg.remove(); });
  document.body.append(dlg); dlg.showModal();
  try { await draw(); } catch (x) { verdict.replaceChildren(h('span', { class: 'err' }, x.message)); }
}

// ---------- step 4: the proposal ----------
const STAGE_TEXT = { signals: 'Reading the job and detecting its signals', template: 'Choosing the best proposal type', writing: 'Writing the proposal' };
const SOURCE_TEXT = { ai: 'Written by AI', manual: 'Edited by hand', chat: 'Revised by chat', restore: 'Restored' };

function proposalSection(s, initial, matching) {
  const owner = s.user_id === me.id;
  const setActions = typeof actionsFor === 'function' ? actionsFor() : () => {};
  const box = h('div', { class: 'card card-pad propcard' });
  let data = initial; let timer = null; let editor = null; let chatLoader = null; let loaded = null; let newer = null; let dismissedFor = null;
  // the screening answers shown under the editor, kept apart from the letter, and their edit boxes
  let shownAnswers = [], answerBoxes = [];
  const answersChip = h('span', { class: 'chip', hidden: true, style: 'margin-top:10px' }, 'Unsaved answers');
  const answersDirty = () => answerBoxes.some((b, i) => !b.readOnly && b.value.trim() !== String(shownAnswers[i]?.answer ?? '').trim());
  const editedAnswers = () => shownAnswers.map((x, i) => ({ question: x.question, answer: answerBoxes[i] ? answerBoxes[i].value.trim() : x.answer }));
  const busy = () => data && (data.status === 'queued' || data.status === 'running');
  const chatBusy = () => data && data.messages.some((m) => m.role === 'user' && (m.status === 'queued' || m.status === 'running'));
  const reviewBusy = () => !!(data && data.review && (data.review.status === 'queued' || data.review.status === 'running'));
  // the parts of a written proposal being brought up to date after a change of projects, profile or video (PLAN-SPEED point 1)
  const partsBusy = () => !!(data && data.parts && (data.parts.status === 'queued' || data.parts.status === 'running'));
  const gapsBusy = () => !!(data && data.gaps && (data.gaps.status === 'queued' || data.gaps.status === 'running'));
  const openingsBusy = () => !!(data && data.openings && (data.openings.status === 'queued' || data.openings.status === 'running'));
  let templates = [];
  // the stepper asks these before it leaves the step or finishes it
  box.__dirty = () => !!(editor && (editor.isDirty() || answersDirty()));
  box.__finish = async () => {
    if (!data || data.status !== 'done' || !data.current) throw new Error('The proposal is not ready yet');
    if (previewIdx > 0) {
      if (!(await ask('Use this opening?', 'You are trying one of the openings. It is saved as a new version, then the proposal is finished.', 'Use it and finish'))) return false;
      await useOpening(); await reload();
    }
    if (editor && (editor.isDirty() || answersDirty())) {
      if (!(await ask('Save and finish?', 'Your unsaved changes are saved as a new version, then the proposal is finished.', 'Save and finish'))) return false;
      await api('POST', `/proposals/${data.id}/versions`, { html: editor.getHtml(), ...(answersDirty() ? { answers: editedAnswers() } : {}), based_on: loaded }); editor.markClean();
      shownAnswers = editedAnswers(); // saved: the boxes are clean again
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
        if (editor && !(editor.isDirty() || answersDirty())) { await reload(); drawAll(); }
        else if (dismissedFor !== st.latest_version) { newer = st.latest_version; drawBanner(); }
      }
      // the parts finished updating: a new version is picked up above; an offer for edited text is shown beside the editor
      if ((st.parts_status || null) !== ((data.parts && data.parts.status) || null)) {
        const fresh = (await api('GET', `/screenings/${s.id}/proposal`)).proposal; data.parts = fresh.parts; drawParts();
      }
      // the experience update finished (or failed): its new version is picked up above; the gaps card shows the answers
      if ((st.gaps_status || null) !== ((data.gaps && data.gaps.status) || null)) {
        const fresh = (await api('GET', `/screenings/${s.id}/proposal`)).proposal; data.gaps = fresh.gaps; drawGaps();
      }
      // the three openings arrived (or started): redraw only them
      if ((st.openings_status || null) !== ((data.openings && data.openings.status) || null)) {
        data.openings = (await api('GET', `/screenings/${s.id}/proposal`)).proposal.openings; drawOpenings();
      }
      // the independent review arrived (or started): fetch it and redraw only its panel
      if ((st.review_status || null) !== ((data.review && data.review.status) || null) || (st.review_version || null) !== ((data.review && data.review.version) || null)) {
        data.review = (await api('GET', `/screenings/${s.id}/proposal`)).proposal.review; drawReview();
      }
    } catch (e) { /* try again next time */ }
    if (busy() || chatBusy() || reviewBusy() || partsBusy() || gapsBusy() || openingsBusy()) timer = setTimeout(poll, 1000);
  }
  const startPolling = () => { clearTimeout(timer); timer = setTimeout(poll, 1000); };

  // ----- pieces
  // ----- experience gaps (R67, R71): what the client asks for that our facts do not show. Yes (with the projects where it was done,
  // any number, and how it was used) or No; a Yes updates only those lines of the proposal, and teaches the library (a new tag is
  // made switched off)
  const gapsEl = h('div', {});
  const LIB = { added: 'in the library, switched off until an admin switches it on', waiting: 'the note is on the projects; the tag waits for an admin', note: 'the note is on the projects', to_add: 'waits for an admin to add it to the library', none: 'said as your own experience' };
  function drawGaps() {
    drawChecks(); drawSideTabs();
    const g = data && data.gaps; if (!g || !g.items || !g.items.length) { gapsEl.replaceChildren(); return; }
    const updating = g.status === 'queued' || g.status === 'running'; // R102: the answered list stays; one line says it is updating
    const open = g.items.filter((x) => x.status === 'open'), done = g.items.filter((x) => x.status !== 'open');
    const state = new Map(); // id -> { has, projects: Set, note, tag_name, category }
    const send = h('button', { class: 'btn primary', type: 'button', disabled: true }, 'Update the proposal');
    const tally = h('span', { class: 'faint small' });
    const recount = () => { const n = [...state.values()].filter((v) => v.has !== null).length; send.disabled = !n; tally.textContent = `${n} of ${open.length} answered`; };
    const inProp = g.projects.filter((p) => Number(p.in_proposal)), others = g.projects.filter((p) => !Number(p.in_proposal));
    const row = (x) => {
      const st = { has: null, projects: new Set(), note: '', tag_name: x.skill, category: x.category || '' }; state.set(x.id, st);
      const more = h('div', { class: 'gapmore', hidden: true });
      // R102: where it was done, in one of three plain choices; projects as chips, any other found by name (no long list to scroll)
      st.mode = inProp.length ? 'projects' : 'own';
      const modeSeg = h('div', { class: 'seg gapmode', role: 'radiogroup', 'aria-label': 'Where was it done?' });
      const projBox = h('div', { class: 'gapproj' }), chips = h('div', { class: 'chips' });
      const tagLine = h('div', { class: 'gaptag', hidden: true });
      const MODES = [['projects', 'In projects'], ['practice', 'All our work'], ['own', 'Just the profile']];
      const drawMode = () => {
        modeSeg.replaceChildren(...MODES.map(([k, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': st.mode === k ? 'true' : 'false', class: st.mode === k ? 'on' : '', onclick: () => { st.mode = k; drawMode(); } }, l)));
        projBox.hidden = st.mode !== 'projects'; tagLine.hidden = st.mode !== 'projects' || !st.projects.size;
        modeHint.textContent = st.mode === 'practice' ? 'Part of how the team works on every project (like documentation or QA). It is said that way, and the tag is left out of project matching.'
          : st.mode === 'own' ? 'Said as the profile’s own experience, without a project.' : st.projects.size ? '' : 'Tick the projects it was done in.';
      };
      const modeHint = h('div', { class: 'faint small' });
      const chip = (p) => { const on = st.projects.has(p.id);
        return h('button', { type: 'button', class: 'tgadd' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', onclick: () => { if (on) st.projects.delete(p.id); else st.projects.add(p.id); drawChips(); drawMode(); } },
          h('span', { class: 'pl', 'aria-hidden': 'true' }, on ? '✓' : '+'), p.name); };
      const drawChips = () => { const extra = others.filter((p) => st.projects.has(p.id)); chips.replaceChildren(...[...inProp, ...extra].map(chip)); };
      const find = h('input', { type: 'search', placeholder: 'Add another project', 'aria-label': 'Find another project' }), res = h('div', { class: 'findres', hidden: true });
      find.oninput = () => { const q = find.value.trim().toLowerCase(); if (!q) { res.hidden = true; return; }
        const hit = others.filter((p) => !st.projects.has(p.id) && p.name.toLowerCase().includes(q)).slice(0, 6); res.hidden = false;
        res.replaceChildren(...(hit.length ? hit.map((p) => h('button', { type: 'button', class: 'findrow', onclick: () => { st.projects.add(p.id); find.value = ''; res.hidden = true; drawChips(); drawMode(); } }, h('strong', {}, p.name)))
          : [h('div', { class: 'faint small', style: 'padding:6px 10px' }, 'No other project with that name.')])); };
      projBox.append(inProp.length ? h('div', { class: 'jp-label' }, 'This proposal’s projects, or add another') : null, chips, others.length ? h('div', { class: 'findwrap', style: 'min-width:0' }, find, res) : null);
      const note = h('textarea', { rows: 2, maxlength: 600, placeholder: 'How it was used (optional). For example: built the support bot on Grok, with function calls into the booking system.' });
      note.oninput = () => { st.note = note.value; };
      // the tag the library gets: one line, changed only when needed
      const tagIn = h('input', { type: 'text', value: x.skill, maxlength: 120, 'aria-label': 'Tag name' });
      const catSel = h('select', { 'aria-label': 'Tag category' }, ...g.categories.map((c) => h('option', { value: c, selected: c === x.category }, c)));
      tagIn.oninput = () => { st.tag_name = tagIn.value; tagText.textContent = tagIn.value || x.skill; }; catSel.onchange = () => { st.category = catSel.value; catText.textContent = catSel.value; };
      const tagText = h('strong', {}, x.skill), catText = h('span', {}, x.category || g.categories[0] || '');
      const tagEdit = h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;margin-top:6px', hidden: true }, tagIn, catSel);
      tagLine.append(h('div', {}, 'Tag for the library: ', tagText, ' in ', catText, ' ', h('button', { type: 'button', class: 'linkbtn', onclick: (e) => { tagEdit.hidden = !tagEdit.hidden; e.currentTarget.textContent = tagEdit.hidden ? 'Change' : 'Done'; } }, 'Change')), tagEdit);
      more.append(h('div', { class: 'lbl' }, 'Where was it done?'), modeSeg, modeHint, projBox, note, tagLine);
      drawChips(); drawMode();
      const yes = h('button', { type: 'button', 'aria-pressed': 'false' }, 'Yes'), no = h('button', { type: 'button', 'aria-pressed': 'false' }, 'No');
      const card = h('div', { class: 'gapcard' });
      const choose = (v) => { st.has = st.has === v ? null : v; yes.classList.toggle('on', st.has === true); no.classList.toggle('on', st.has === false); yes.setAttribute('aria-pressed', String(st.has === true)); no.setAttribute('aria-pressed', String(st.has === false));
        more.hidden = st.has !== true; card.classList.toggle('yes', st.has === true); card.classList.toggle('no', st.has === false); recount(); };
      yes.onclick = () => choose(true); no.onclick = () => choose(false);
      card.append(h('div', { class: 'row spread', style: 'flex-wrap:nowrap;align-items:flex-start;gap:8px' }, h('strong', { class: 'gapskill' }, x.skill), x.category ? h('span', { class: 'chip' }, x.category) : null),
        h('div', { class: 'jp-label' }, x.ask), x.quote ? h('div', { class: 'gapquote' }, '“' + x.quote + '”') : null,
        owner ? h('div', { class: 'gapq' }, h('span', { class: 'small muted' }, 'Have you done this?'), h('div', { class: 'seg' }, yes, no)) : null, more);
      return card;
    };
    const err = h('div', { class: 'err', hidden: true });
    send.onclick = async () => {
      const noProj = [...state.values()].find((v) => v.has === true && v.mode === 'projects' && !v.projects.size);
      if (noProj) { err.replaceChildren(icon('x'), 'Tick a project for each Yes "In projects", or choose All our work or Just the profile.'); err.hidden = false; return; }
      const answers = [...state.entries()].filter(([, v]) => v.has !== null).map(([id, v]) => ({ id, has: v.has, practice: v.has && v.mode === 'practice' ? true : undefined, project_ids: v.has && v.mode === 'projects' ? [...v.projects] : [], note: v.has ? v.note.trim() || undefined : undefined, tag_name: v.has ? v.tag_name.trim() || undefined : undefined, category: v.has ? v.category || undefined : undefined }));
      if (!answers.length) { err.replaceChildren(icon('x'), 'Answer Yes or No first.'); err.hidden = false; return; }
      if (editor && (editor.isDirty() || answersDirty()) && !(await ask('Update the proposal?', 'You have unsaved changes. The update starts from the last saved version, so save yours first to keep them.', 'Update anyway'))) return;
      btnBusy(send, 'Saving');
      try { const r = await api('POST', `/proposals/${data.id}/gaps`, { answers }); if (r.updated) { data.gaps.status = 'queued'; drawGaps(); startPolling(); } else { const fresh = (await api('GET', `/screenings/${s.id}/proposal`)).proposal; data.gaps = fresh.gaps; drawGaps(); toast('Saved. Nothing to add to the proposal.'); } }
      catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; send.disabled = false; send.replaceChildren('Update the proposal'); }
    };
    recount();
    gapsEl.replaceChildren(h('div', {},
      updating ? liveLine({ id: 'gaps-' + data.id, label: 'Updating the proposal with your experience', typical: 40 }) : null,
      !updating && open.length ? [h('p', { class: 'jp-label', style: 'margin:0 0 12px' }, 'The client asks for these and we have no record of them, so they were left out. Have you done them? A Yes puts them in, explained, and teaches the library.'),
        h('div', { class: 'stack', style: 'gap:10px' }, open.map(row)), err,
        owner ? h('div', { class: 'gapfoot' }, tally, send) : null] : null,
      done.length ? h('details', { class: 'reviewfold', style: open.length ? 'margin-top:14px' : '', open: !open.length || null }, h('summary', {}, `Answered (${done.length})`),
        h('div', { class: 'stack', style: 'gap:6px;margin-top:8px' }, done.map((x) => h('div', { class: 'gapdone' },
          h('div', { class: 'row', style: 'gap:6px;flex-wrap:nowrap' }, h('span', { class: 'pill ' + (x.status === 'no' ? 'wait' : 'PASS') }, x.status === 'no' ? 'No' : 'Yes'), h('strong', {}, x.skill)),
          x.status === 'no' ? h('div', { class: 'faint small' }, 'Left out of the proposal.')
            : h('div', { class: 'faint small' }, [Number(x.practice) ? 'Across all our work' : x.project_name ? 'Done in ' + x.project_name : null, x.applied_version ? 'in version ' + x.applied_version : null, LIB[x.library] || null].filter(Boolean).join('. ') + '.'))))) : null,
      g.status === 'error' ? h('p', { class: 'err' }, icon('x'), 'The update failed' + (g.error ? ': ' + g.error : '.') + ' Answer again to try again.') : null));
  }

  // ----- feedback on the proposal (R67): the part of the text, a category and what is wrong, kept for later review
  function drawFeedback() {
    const el = box.querySelector('.feedbackpanel'); if (!el) return;
    const excerpt = h('textarea', { rows: 3, maxlength: 8000, placeholder: 'Paste the part of the proposal, or select it in the text and press Use selected text.' });
    const useSel = h('button', { class: 'btn sm', type: 'button' }, 'Use selected text');
    useSel.onclick = () => { const t = String(window.getSelection() || '').trim(); if (!t) return toast('Select the part in the proposal text first.', true); excerpt.value = t; };
    let cat = '';
    const chips = h('div', { class: 'chips' });
    const what = h('textarea', { rows: 3, maxlength: 4000, placeholder: 'What is wrong with it, and what it should have been.' });
    const err = h('div', { class: 'err', hidden: true });
    const list = h('div', { class: 'stack', style: 'gap:8px;margin-top:6px' });
    const saved = h('details', { class: 'reviewfold', style: 'margin-top:14px', hidden: true }, h('summary', {}, 'Saved'), list);
    const save = h('button', { class: 'btn', type: 'button' }, 'Save feedback');
    const load = async () => {
      try { const r = await api('GET', `/screenings/${s.id}/feedback`);
        if (!chips.childNodes.length) chips.replaceChildren(...r.categories.map((c) => { const b = h('button', { type: 'button', class: 'tagbtn', 'aria-pressed': 'false' }, c); b.onclick = () => { cat = cat === c ? '' : c; chips.querySelectorAll('.tagbtn').forEach((x) => { const on = x.textContent === cat; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }); }; return b; }));
        list.replaceChildren(...r.items.map((f) => h('div', { class: 'suggestion' }, h('div', {}, h('strong', {}, f.category), h('div', { class: 'jp-label' }, f.feedback),
          h('div', { class: 'faint small', style: 'white-space:pre-wrap;margin-top:4px' }, '“' + (f.excerpt.length > 220 ? f.excerpt.slice(0, 220) + '...' : f.excerpt) + '”'),
          h('div', { class: 'faint small' }, `${f.user_name || ''}, version ${f.version_no || '-'}, ${ago(f.created_at)}`)))));
        saved.hidden = !r.items.length; saved.querySelector('summary').textContent = `Saved for this job (${r.items.length})`; }
      catch { /* shown next time */ }
    };
    save.onclick = async () => {
      if (!cat) { err.replaceChildren(icon('x'), 'Pick what kind of problem it is.'); err.hidden = false; return; }
      err.hidden = true; btnBusy(save, 'Saving');
      try { await api('POST', `/screenings/${s.id}/feedback`, { excerpt: excerpt.value, category: cat, feedback: what.value }); excerpt.value = ''; what.value = ''; cat = ''; chips.querySelectorAll('.tagbtn').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); }); toast('Feedback saved'); await load(); }
      catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; }
      save.disabled = false; save.replaceChildren('Save feedback');
    };
    el.replaceChildren(h('div', { class: 'row spread', style: 'flex-wrap:nowrap;align-items:flex-start;gap:10px' }, h('p', { class: 'jp-label', style: 'margin:0 0 8px' }, 'What is wrong in this proposal? It is kept with the proposal as it is now, to fix the setup later.'),
        h('a', { href: '#/feedback', class: 'small', style: 'white-space:nowrap' }, 'All feedback')),
      h('div', { class: 'field' }, h('div', { class: 'row spread' }, h('label', { class: 'lbl' }, 'The part'), useSel), excerpt),
      h('div', { class: 'field', style: 'margin-top:8px' }, h('label', { class: 'lbl' }, 'What kind'), chips),
      h('div', { class: 'field', style: 'margin-top:8px' }, h('label', { class: 'lbl' }, 'Your feedback'), what), err,
      h('div', { class: 'row', style: 'margin-top:10px' }, save), saved);
    load();
  }

  // ----- the side panel: one tool at a time, so the proposal stays the main thing on screen. The tab you used last is kept.
  // R112: 'opening' is the chat that edits the opening with the AI; it is there only while that edit is open
  const SIDE = [['opening', 'Opening'], ['answer', 'Answer'], ['chat', 'Chat'], ['review', 'Review'], ['gaps', 'Experience'], ['feedback', 'Feedback']];
  let sideTab = 'chat', gapsShown = false, mainTab = 'letter'; // mainTab: the cover letter or the screening answers
  try { sideTab = localStorage.getItem('prop.side') || 'chat'; } catch { /* storage blocked */ }
  const hasGaps = () => !!(data && data.gaps && data.gaps.items && data.gaps.items.length);
  const openGaps = () => (hasGaps() ? data.gaps.items.filter((x) => x.status === 'open').length : 0);
  const aiEditing = () => { try { return !!(editing && editing.ai); } catch { return false; } }; // editing is declared further down
  let ansEditing = null; // R128: the screening answer being edited { i, ai }
  const ansAi = () => !!(ansEditing && ansEditing.ai);
  function showSide(k) { sideTab = k; if (k !== 'opening' && k !== 'answer') try { localStorage.setItem('prop.side', k); } catch { /* storage blocked */ } drawSideTabs(); }
  function drawSideTabs() {
    const bar = box.querySelector('.sidetabs'); if (!bar) return;
    if ((sideTab === 'opening' && !aiEditing()) || (sideTab === 'answer' && !ansAi())) { try { sideTab = localStorage.getItem('prop.side') || 'chat'; } catch { sideTab = 'chat'; } }
    if (!SIDE.some(([k]) => k === sideTab) || (sideTab === 'gaps' && !hasGaps())) sideTab = 'chat';
    const rv = data.review, n = openGaps();
    const badge = {
      chat: chatBusy() ? h('span', { class: 'spin' }) : null,
      review: reviewBusy() ? h('span', { class: 'spin' }) : rv && rv.score ? h('span', { class: 'n ' + (rv.score >= 8 ? 'PASS' : rv.score >= 5 ? 'FLAG' : 'FAIL') }, String(rv.score)) : null,
      gaps: gapsBusy() ? h('span', { class: 'spin' }) : n ? h('span', { class: 'n FLAG' }, String(n)) : null,
    };
    bar.replaceChildren(...SIDE.filter(([k]) => (k !== 'gaps' || hasGaps()) && (k !== 'opening' || aiEditing()) && (k !== 'answer' || ansAi())).map(([k, label]) => h('button', { type: 'button', role: 'tab', class: 'tab' + (k === sideTab ? ' on' : ''), 'aria-selected': k === sideTab, onclick: () => showSide(k) }, label, badge[k] || null)));
    SIDE.forEach(([k]) => { const el = box.querySelector('.side-' + k); if (el) el.hidden = k !== sideTab; });
  }
  // ----- above the editor, one line: what to check before sending, and the questions about our experience
  const checksEl = h('div', { class: 'checks' });
  function drawChecks() {
    if (!data || !data.current) return;
    const w = data.warnings || [], n = openGaps();
    checksEl.replaceChildren(...[
      w.length ? h('details', { class: 'warnline' }, h('summary', {}, icon('warn'), `${w.length} thing${w.length === 1 ? '' : 's'} to check before sending`), h('ul', {}, w.map((x) => h('li', {}, x.text)))) : null,
      gapsBusy() ? h('div', { class: 'checkask' }, h('span', { class: 'spin' }), 'Updating the proposal with your experience')
        : n ? h('button', { type: 'button', class: 'checkask', onclick: () => { showSide('gaps'); box.querySelector('.sidecard')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }, icon('info'), `${n} question${n === 1 ? '' : 's'} about your experience`) : null,
    ].filter(Boolean));
    checksEl.hidden = !checksEl.childNodes.length;
  }

  // ----- three openings (R73): each a different direction, tone and line of thought. Swipe through them: the proposal below shows
  // each one in place (a preview, not saved); Use this opening saves it as a new version.
  const openEl = h('div', {});
  let previewIdx = 0, slides = [], viewingOther = false, editing = null; // editing (R98): the opening being edited in place
  const NOT_OPENING = new Set(['[[PROOF]]', '[[VIDEO]]']);
  const firstPara = (html) => htmlToPlainText(html).split(/\n{2,}/).map((x) => x.trim()).find((x) => x && !NOT_OPENING.has(x)) || '';
  const norm = (x) => String(x || '').replace(/\s+/g, ' ').trim();
  const withOpening = (html, text) => { const d = document.createElement('div'); d.innerHTML = html; const el = d.querySelector('p, h1, h2, h3, h4, div');
    const p = document.createElement('p'); text.trim().split('\n').forEach((line, i) => { if (i) p.append(document.createElement('br')); p.append(line); });
    if (el) el.replaceWith(p); else d.prepend(p); return d.innerHTML; };
  async function useOpening() {
    const sl = slides[previewIdx]; if (!sl || sl.index == null) return;
    await api('POST', `/proposals/${data.id}/openings/${sl.index}/use`, {});
    previewIdx = 0;
  }
  /**
   * R106 (Hamza): the chat that edits an opening. Each answer's version goes into the box (and the proposal below shows it); the
   * person keeps asking, edits by hand, or saves. A turn is about the words in the box when it is sent.
   */
  function openingChat(ed, ta, show) {
    const q = ed.index == null ? 'in_use' : ed.index, list = h('div', { class: 'chatlist openchat-list' });
    const input = h('textarea', { rows: 2, maxlength: 2000, placeholder: 'What should change? For example: shorter; lead with their deadline; less formal; use their word "dispatch"', 'aria-label': 'Ask the AI' });
    const send = h('button', { class: 'btn sm primary', type: 'button' }, 'Send');
    let msgs = [], seen = null, timer = null, gone = false;
    const pending = () => msgs.some((m, k) => m.role === 'user' && (m.status === 'queued' || m.status === 'running') && !msgs.slice(k + 1).some((x) => x.role === 'assistant')); // answered already: the worker marks it done a moment later
    const draw = () => {
      list.replaceChildren(...(msgs.length ? msgs.map((m) => h('div', { class: 'msg ' + (m.role === 'user' ? 'me' : 'ai') },
        h('div', { class: 'bubble' }, m.content, m.draft ? h('div', { class: 'faint small', style: 'margin-top:6px' }, '\u201c' + m.draft + '\u201d') : null),
        m.role === 'assistant' && m.draft && m.draft !== ta.value.trim() ? h('button', { class: 'btn sm', type: 'button', style: 'justify-self:start', onclick: () => { ta.value = m.draft; show(); draw(); } }, 'Put this one in the box') : null,
        m.status === 'error' ? h('span', { class: 'err small' }, icon('x'), 'The AI could not answer: ' + (m.error_message || 'try again')) : null))
        : [h('p', { class: 'jp-label', style: 'margin:0' }, 'Say what to change. The AI gives the whole opening back with only that changed, and it comes into the box on the left. Keep asking until it reads right, then Save and use.')]),
        pending() ? h('div', { class: 'msg ai' }, h('div', { class: 'bubble faint' }, 'Rewriting the opening\u2026')) : '');
      send.disabled = pending(); list.scrollTop = list.scrollHeight;
    };
    const load = async () => {
      if (gone || !openEl.isConnected || editing !== ed) { gone = true; return; }
      try { msgs = (await api('GET', `/proposals/${data.id}/openings/chat?index=${q}`)).messages; } catch { /* next time */ }
      const last = [...msgs].reverse().find((m) => m.role === 'assistant' && m.draft);
      if (seen === null) seen = last ? last.id : 0; // what was there when the chat opened stays out of the box
      else if (last && last.id !== seen) { seen = last.id; ta.value = last.draft; show(); } // a new answer goes into the box
      draw(); clearTimeout(timer); if (pending()) timer = setTimeout(load, 2000);
    };
    const go = async () => {
      const content = input.value.trim(); if (!content || pending()) return;
      if (ta.value.trim().length < 10) return toast('Put the opening in the box first', true);
      btnBusy(send, 'Sending');
      try { await api('POST', `/proposals/${data.id}/openings/chat`, { index: ed.index, content, current: ta.value.trim() }); input.value = ''; await load(); }
      catch (x) { toast(x.message, true); } finally { send.replaceChildren('Send'); draw(); }
    };
    send.onclick = go;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
    load();
    return { el: h('div', { class: 'openchat' }, h('div', { class: 'openchat-head' }, h('strong', {}, ed.label ? `Opening: ${ed.label}` : 'The opening'), h('span', { class: 'faint small' }, 'Each answer goes into the box on the left. Save and use there when it reads right.')),
      list, h('div', { class: 'openchat-send' }, input, h('div', { class: 'row spread', style: 'gap:8px' }, h('span', { class: 'faint small' }, 'Enter to send'), send))),
      focus: () => input.focus() };
  }
  /** R128: the chat that edits one screening answer, like the opening's (R106): each version the AI gives goes into the answer's box. */
  function answerChat(i, question, ta) {
    const list = h('div', { class: 'chatlist openchat-list' });
    const input = h('textarea', { rows: 2, maxlength: 2000, placeholder: 'What should change? For example: shorter; mention the Stripe work; answer yes first; less formal', 'aria-label': 'Ask the AI' });
    const send = h('button', { class: 'btn sm primary', type: 'button' }, 'Send');
    let msgs = [], seen = null, timer = null;
    const alive = () => list.isConnected && ansEditing && ansEditing.i === i && ansEditing.ai;
    const pending = () => msgs.some((m, k) => m.role === 'user' && (m.status === 'queued' || m.status === 'running') && !msgs.slice(k + 1).some((x) => x.role === 'assistant')); // answered already: the worker marks it done a moment later
    const put = (text) => { ta.value = text; ansEditing.text = text; answersChip.hidden = !answersDirty(); drawActions(); drawMainTabs(); };
    const draw = () => {
      list.replaceChildren(...(msgs.length ? msgs.map((m) => h('div', { class: 'msg ' + (m.role === 'user' ? 'me' : 'ai') },
        h('div', { class: 'bubble' }, m.content, m.draft ? h('div', { class: 'faint small', style: 'margin-top:6px;white-space:pre-wrap' }, '\u201c' + m.draft + '\u201d') : null),
        m.role === 'assistant' && m.draft && m.draft !== ta.value.trim() ? h('button', { class: 'btn sm', type: 'button', style: 'justify-self:start', onclick: () => { put(m.draft); draw(); } }, 'Put this one in the box') : null,
        m.status === 'error' ? h('span', { class: 'err small' }, icon('x'), 'The AI could not answer: ' + (m.error_message || 'try again')) : null))
        : [h('p', { class: 'jp-label', style: 'margin:0' }, 'Say what to change. The AI gives the whole answer back with only that changed, and it comes into the answer\u2019s box. Keep asking until it reads right, then Save.')]),
        pending() ? h('div', { class: 'msg ai' }, h('div', { class: 'bubble faint' }, 'Rewriting the answer\u2026')) : '');
      send.disabled = pending(); list.scrollTop = list.scrollHeight;
    };
    const load = async () => {
      if (!alive() && seen !== null) return;
      try { msgs = (await api('GET', `/proposals/${data.id}/answers/${i}/chat`)).messages; } catch { /* next time */ }
      const last = [...msgs].reverse().find((m) => m.role === 'assistant' && m.draft);
      if (seen === null) seen = last ? last.id : 0; // what was there when the chat opened stays out of the box
      else if (last && last.id !== seen) { seen = last.id; put(last.draft); } // a new answer goes into the box
      draw(); clearTimeout(timer); if (pending()) timer = setTimeout(load, 2000);
    };
    const go = async () => {
      const content = input.value.trim(); if (!content || pending()) return;
      if (!ta.value.trim()) return toast('Put the answer in the box first', true);
      btnBusy(send, 'Sending');
      try { await api('POST', `/proposals/${data.id}/answers/${i}/chat`, { content, current: ta.value.trim() }); input.value = ''; await load(); }
      catch (x) { toast(x.message, true); } finally { send.replaceChildren('Send'); draw(); }
    };
    send.onclick = go;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
    load();
    return { el: h('div', { class: 'openchat' }, h('div', { class: 'openchat-head' }, h('strong', {}, `Answer ${i + 1}`), h('span', { class: 'faint small' }, question)),
      list, h('div', { class: 'openchat-send' }, input, h('div', { class: 'row spread', style: 'gap:8px' }, h('span', { class: 'faint small' }, 'Enter to send'), send))),
      focus: () => input.focus() };
  }
  function drawOpenings() {
    if (!aiEditing()) { const pane = box.querySelector('.side-opening'); if (pane && pane.childNodes.length) { pane.replaceChildren(); drawSideTabs(); } }
    const o = data && data.openings;
    if (!o || !data.current || !editor || viewingOther) { openEl.replaceChildren(); return; }
    // R91: written three at a time, the most sent first; "more" adds the next three beside the ones there
    const writeBtn = (label, more = false, cls = 'btn sm') => (owner ? h('button', { class: cls, type: 'button', onclick: async (e) => { btnBusy(e.currentTarget, 'Starting');
      try { await api('POST', `/proposals/${data.id}/openings`, { more }); data.openings = { ...o, status: 'queued', more }; if (!more) previewTo(0); drawOpenings(); startPolling(); } catch (x) { toast(x.message, true); drawOpenings(); } } }, label) : null);
    const shell = (...kids) => openEl.replaceChildren(h('div', { class: 'opencard' }, ...kids));
    const addingMore = openingsBusy() && o.more && o.items && o.items.length;
    if (openingsBusy() && !addingMore) { if (!LOADER_FACTS) loaderFacts().then(() => openingsBusy() && drawOpenings()); // R99
      return shell(liveLine({ id: 'open-' + data.id, label: 'Writing three other openings', now: 'Opening template: ', items: (LOADER_FACTS ? LOADER_FACTS.openings : []).filter((n) => n !== o.default), hint: 'The best ranked templates first', typical: 35 })); }
    if (!o.items || !o.items.length) return o.status === 'error'
      ? shell(h('div', { class: 'row spread' }, h('span', { class: 'err' }, icon('x'), 'The openings could not be written' + (o.error ? ': ' + o.error : '.')), writeBtn('Try again')))
      : owner ? shell(h('div', { class: 'row spread' }, h('span', { class: 'jp-label' }, 'Openings to choose from: one per opening template that is on, each its own direction and tone.'), writeBtn('Write the openings'))) : openEl.replaceChildren();
    const curFirst = firstPara(data.current.html);
    // R98: an opening edited in place before it is used; the proposal below shows the edit as it is typed
    if (editing && norm(curFirst) === norm(o.first)) {
      const ed = editing, ta = h('textarea', { class: 'openedit', rows: 4, maxlength: 1500, 'aria-label': 'The opening' }); ta.value = ed.text;
      const show = () => { if (editor && !editor.isDirty()) editor.setHtml(withOpening(data.current.html, ta.value.trim() || ed.text)); };
      ta.oninput = show;
      const save = h('button', { class: 'btn sm primary', type: 'button' }, 'Save and use');
      save.onclick = async () => { btnBusy(save, 'Saving');
        try { await api('POST', `/proposals/${data.id}/openings/edit`, { index: ed.index, text: ta.value }); editing = null; toast(ed.label ? `Used, and kept as an example for ${ed.label}` : 'Used'); await reload(); newer = null; previewIdx = 0; drawAll(); }
        catch (x) { toast(x.message, true); save.disabled = false; save.replaceChildren('Save and use'); } };
      const cancel = h('button', { class: 'btn sm', type: 'button', onclick: () => { editing = null; if (editor && !editor.isDirty()) editor.setHtml(previewIdx > 0 && slides[previewIdx] ? withOpening(data.current.html, slides[previewIdx].text) : data.current.html); drawOpenings(); } }, 'Cancel');
      const chat = ed.ai ? openingChat(ed, ta, show) : null;
      const pane = box.querySelector('.side-opening');
      if (chat && pane) { pane.replaceChildren(chat.el); sideTab = 'opening'; drawSideTabs(); } // R112: the chat sits in the panel on the right
      if (!ed.ai) cancel.after(h('button', { class: 'btn sm', type: 'button', title: 'Tell the AI what to change; its version comes into the box above', onclick: () => { editing = { ...ed, ai: true, text: ta.value }; drawOpenings(); } }, icon('message'), 'Ask the AI'));
      shell(h('div', { class: 'row spread', style: 'gap:8px;flex-wrap:wrap' }, h('strong', {}, `${ed.ai ? 'Edit the opening with the AI' : 'Edit the opening'}${ed.label ? ': ' + ed.label : ''}`), h('span', { class: 'row', style: 'gap:6px' }, cancel, save)), ta,
        h('div', { class: 'faint small', style: 'margin-top:6px' }, ed.ai ? 'Tell the AI what to change in the Opening panel on the right; each answer comes into this box. ' : '', ed.label ? `Your version goes into the proposal and is kept as an example for ${ed.label}, so later openings learn from it.` : 'Your version goes into the proposal.'));
      requestAnimationFrame(() => { if (chat && window.innerWidth >= 1100) chat.focus(); else { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } show(); });
      return;
    }
    if (norm(curFirst) !== norm(o.first)) return shell(h('div', { class: 'row spread' }, h('span', { class: 'jp-label' }, 'The openings were written for an earlier first paragraph.'), writeBtn('Write new ones')));
    // As written first (the one in use, when one was used), then the others
    // the first slide is the opening in the proposal now: the type's default template (R88), or the one picked
    const usedIt = o.used != null && o.items[o.used] ? o.items[o.used] : null;
    slides = [{ label: usedIt ? `${usedIt.style || 'Opening'} (in use)` : o.default ? `${o.default} (default)` : 'Opening as written', angle: usedIt ? usedIt.angle : null, tone: usedIt ? usedIt.tone : null, text: curFirst, why: null, index: null,
      match: usedIt ? usedIt.match : o.first_match, match_note: usedIt ? usedIt.match_note : o.first_match_note },
      ...o.items.map((x, i) => ({ ...x, label: x.style || `Opening ${i + 1}`, index: i })).filter((x) => x.index !== o.used)]; // labelled by its style (Settings)
    if (previewIdx >= slides.length) previewIdx = 0;
    const track = h('div', { class: 'opentrack' }, slides.map((sl) => h('div', { class: 'openslide' }, h('p', { class: 'opentext' }, sl.text), sl.why ? h('div', { class: 'faint small' }, sl.why) : null)));
    const counter = h('span', { class: 'small muted' }), chips = h('div', { class: 'opchips' }), act = h('span', { class: 'row', style: 'gap:6px' }), titleEl = h('strong', { class: 'optitle' }); // R103: fixed places, whatever the length
    const dots = h('div', { class: 'opendots' }, slides.map((_, i) => h('button', { type: 'button', 'aria-label': `Show ${slides[i].label}`, onclick: () => go(i) })));
    const prev = h('button', { class: 'btn sm', type: 'button', 'aria-label': 'Previous opening', onclick: () => go(previewIdx - 1) }, '‹'), next = h('button', { class: 'btn sm', type: 'button', 'aria-label': 'Next opening', onclick: () => go(previewIdx + 1) }, '›');
    const head = () => {
      const sl = slides[previewIdx];
      counter.textContent = `${previewIdx + 1} of ${slides.length}`;
      titleEl.textContent = sl.label; titleEl.title = sl.label;
      chips.replaceChildren(...[sl.angle ? h('span', { class: 'chip brand' }, sl.angle) : null, sl.tone ? h('span', { class: 'chip' }, sl.tone) : null,
        sl.match != null ? h('span', { class: 'chip matchsc ' + (sl.match >= 8 ? 'hi' : sl.match >= 5 ? 'mid' : 'lo'), title: 'How close it is to the opening template\'s examples' + (sl.match_note ? ': ' + sl.match_note : '') }, `Like the examples ${sl.match}/10`) : null].filter(Boolean));
      dots.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === previewIdx));
      prev.disabled = previewIdx === 0; next.disabled = previewIdx === slides.length - 1;
      act.replaceChildren(...[owner ? h('button', { class: 'btn sm', type: 'button', title: 'Change the words, then use it. Your version is kept as an example, so later openings learn from it.', onclick: () => { editing = { index: sl.index, label: sl.style || (sl.index == null ? (usedIt ? usedIt.style : o.default) : sl.label), text: sl.text }; drawOpenings(); } }, 'Edit') : null,
        owner ? h('button', { class: 'btn sm', type: 'button', title: 'Tell the AI what to change, as often as you like, then save it. It is kept as an example, like your own edit.', onclick: () => { editing = { index: sl.index, label: sl.style || (sl.index == null ? (usedIt ? usedIt.style : o.default) : sl.label), text: sl.text, ai: true }; drawOpenings(); } }, icon('message'), 'Edit with AI') : null,
        sl.index != null && owner ? h('button', { class: 'btn sm primary', type: 'button', onclick: async (e) => { btnBusy(e.currentTarget, 'Saving');
        try { await useOpening(); toast('Saved as a new version'); await reload(); newer = null; drawAll(); } catch (x) { toast(x.message, true); head(); } } }, 'Use this opening') : null].filter(Boolean));
    };
    const go = (i) => { i = Math.max(0, Math.min(slides.length - 1, i)); previewTo(i); track.scrollTo({ left: previewIdx * track.clientWidth, behavior: 'smooth' }); head(); };
    // swiping: the slide that comes to rest is the one shown in the proposal
    let t = null; track.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => { const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); if (i !== previewIdx) { if (!previewTo(i)) track.scrollTo({ left: previewIdx * track.clientWidth, behavior: 'smooth' }); head(); } }, 90); }, { passive: true });
    // R103: the name and the arrows on one line, the chips under it, the text, then the actions: nothing wraps into anything else
    shell(h('div', { class: 'ophead' }, titleEl, h('div', { class: 'opnav' }, counter, prev, next)), chips, track,
      h('div', { class: 'opfoot' }, h('div', { class: 'row', style: 'gap:12px' }, dots, act),
        h('span', { class: 'row', style: 'gap:10px' },
          addingMore ? liveLine({ id: 'more-' + data.id, label: 'Writing three more', now: 'Opening template: ', items: (LOADER_FACTS ? LOADER_FACTS.openings : []).filter((n) => !o.items.some((x) => x.style === n) && n !== o.default), typical: 35 })
            : o.left > 0 ? writeBtn(`Load ${Math.min(3, o.left)} more (${o.left} left)`, true) : null,
          owner && !addingMore ? h('button', { type: 'button', class: 'linkbtn small', onclick: () => writeBtn('').click() }, 'Write new ones') : null)));
    head();
    requestAnimationFrame(() => { track.scrollLeft = previewIdx * track.clientWidth; });
  }
  /** Shows slide i in the proposal itself: a preview, not saved. Never over the person's own unsaved edits. */
  function previewTo(i) {
    if (!editor || !data.current) { previewIdx = 0; return false; }
    if (i === previewIdx) return true;
    if (editor.isDirty()) { toast('Save or undo your edits first: the opening is tried in the saved proposal.', true); return false; }
    previewIdx = i;
    editor.setHtml(previewIdx > 0 && slides[i] ? withOpening(data.current.html, slides[i].text) : data.current.html);
    return true;
  }

  const bannerEl = h('div', { class: 'newer', hidden: true });
  // the parts: "updating" while they are redone, and the parts offered when the person's own text was not changed for them
  const partsEl = h('div', {});
  function drawParts() {
    const pt = data && data.parts; if (!pt) { partsEl.replaceChildren(); return; }
    if (pt.status === 'queued' || pt.status === 'running') {
      partsEl.replaceChildren(h('div', { style: 'margin:8px 0' }, liveLine({ id: 'parts-' + data.id, label: 'Updating the parts that changed', now: '', typical: 30, items: ['The projects and their proof', 'The Loom video line', 'The sign off', 'Keeping your own words as they are'] }))); return; }
    const offer = pt.offer || [];
    if (!offer.length) { partsEl.replaceChildren(pt.status === 'error' ? h('p', { class: 'err' }, icon('x'), 'The parts could not be updated' + (pt.error ? ': ' + pt.error : '.')) : ''); return; }
    // R132: put in where it belongs (a new project in place of the one it replaces), by the server, on the text as it is now
    const put = async (o, i, btn) => {
      btnBusy(btn, 'Putting it in');
      try { const r = await api('POST', `/proposals/${data.id}/parts-offer/${i}/apply`, { html: editor.getHtml() });
        editor.replaceHtml(r.html); data.parts.offer = r.offer; drawParts(); toast(`${r.where}. Look it over, then save.`); }
      catch (x) { toast(x.message, true); drawParts(); } };
    partsEl.replaceChildren(h('div', { class: 'card card-pad', style: 'margin:12px 0' },
      h('div', { class: 'row spread' }, h('div', { class: 'jp-sec' }, 'New parts for your edited text'),
        owner ? h('button', { class: 'btn sm', type: 'button', onclick: async () => { try { await api('POST', `/proposals/${data.id}/parts-offer/dismiss`, {}); data.parts.offer = []; drawParts(); } catch (x) { toast(x.message, true); } } }, 'Dismiss') : null),
      h('p', { class: 'jp-label', style: 'margin:2px 0 10px' }, 'You edited this proposal, so these were not put in for you. Each goes where it belongs: a new project in place of the one it replaces. Look it over and save.'),
      h('div', { class: 'stack', style: 'gap:10px' }, offer.map((o, i) => h('div', { class: 'qa' },
        h('div', { class: 'row spread', style: 'flex-wrap:nowrap;gap:10px' }, h('div', { class: 'jp-label' }, o.label),
          h('div', { class: 'row', style: 'gap:6px' }, owner ? h('button', { class: 'btn sm' + (o.kind === 'remove' ? '' : ' primary'), type: 'button', onclick: (e) => put(o, i, e.currentTarget) }, o.kind === 'remove' ? 'Take it out' : o.replaces ? 'Swap it in' : 'Put it in') : null,
            o.kind === 'remove' ? null : h('button', { class: 'btn sm', type: 'button', onclick: async () => { const ok = await copyText(o.text); toast(ok ? 'Copied' : 'Could not copy. Select the text and copy it.', !ok); } }, 'Copy'))),
        h('p', { class: 'jp-body', style: 'margin:4px 0 0;white-space:pre-wrap' }, o.text))))));
  }
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
      if (editor && (editor.isDirty() || answersDirty()) && !(await ask('Write it again?', 'You have unsaved changes. Writing again adds a new version and loads it in their place.', 'Write again'))) return;
      btnBusy(b, 'Starting');
      try { await api('POST', `/screenings/${s.id}/proposal/start`, templateId ? { template_id: templateId } : {}); await reload(); drawAll(); startPolling(); }
      catch (x) { toast(x.message, true); b.disabled = false; b.replaceChildren(label); }
    };
    return b;
  };
  // the tab row: Copy, Save version (only with unsaved edits), Write again (when the profile changed), Finish
  function drawActions() {
    if (!data) return; // nothing written yet: the type chooser puts its own button in the tab row
    if (!data.current || busy()) { setActions(owner && !busy() ? startBtn(data.status === 'error' ? 'Try again' : 'Write the proposal', data.template ? data.template.id : null) : null); return; }
    const dirty = editor && (editor.isDirty() || answersDirty());
    const stale = matching && matching.proposal_profile && data.profile_id && data.profile_id !== matching.proposal_profile.id;
    // the editor holds the cover letter only; with screening answers each has its own Copy under the editor
    const hasAnswers = shownAnswers.length > 0;
    const copy = actBtn(hasAnswers ? 'Copy cover letter' : 'Copy', async () => { const ok = await copyText(htmlToPlainText(editor.getHtml())); toast(ok ? 'Copied. Paste it into Upwork.' : 'Could not copy. Select the text and copy it.', !ok); });
    const save = owner && dirty ? actBtn('Save version', async (e) => {
      btnBusy(e.currentTarget, 'Saving');
      try { const r = await api('POST', `/proposals/${data.id}/versions`, { html: editor.getHtml(), ...(answersDirty() ? { answers: editedAnswers() } : {}), based_on: loaded }); toast(r.unchanged ? 'Nothing changed' : `Saved as version ${r.version_no}`); await reload(); newer = null; drawAll(); }
      catch (x) { toast(x.message, true); drawActions(); }
    }) : null;
    // Save and mark sent: saves any edits, finishes the proposal, then one popup records the status, Connects, boost, the video and notes
    const sent = !!(s.proposal_sent_at || s.proposal_sent_date);
    const markSent = owner && !sent && !chatBusy() ? actBtn('Save and mark sent', async (e) => {
      const b = e.currentTarget; btnBusy(b, 'Saving');
      try {
        if (!(await box.__finish())) { drawActions(); return; }
        await reload(); drawAll();
        await sentDialog(s, async () => { if (typeof stepCtx !== 'undefined' && stepCtx) await stepCtx.advanceTo(4); });
      } catch (x) { toast(x.message, true); drawActions(); }
    }, true) : null;
    const change = owner && !chatBusy() ? actBtn('Change type', changeType) : null;
    setActions((stale || data.docs_newer) && owner ? startBtn('Write it again', null, false) : null, copy, save, change, markSent);
  }

  // ----- change the proposal type after it is written: pick another, and it is written again with it (a new version)
  async function changeType() {
    if (editor && (editor.isDirty() || answersDirty()) && !(await ask('Change the type?', 'You have unsaved changes. Writing again adds a new version and loads it in their place.', 'Continue'))) return;
    const ch = await api('GET', `/screenings/${s.id}/proposal/types`);
    let pick = data.template ? data.template.id : null;
    const grid = h('div', { class: 'pgrid2 typegrid', role: 'radiogroup', 'aria-label': 'Proposal type' });
    const draw = () => grid.replaceChildren(...ch.types.map((t) => h('button', { type: 'button', class: 'pcard2 typecard' + (pick === t.id ? ' on' : ''), role: 'radio', 'aria-checked': pick === t.id, onclick: () => { pick = t.id; draw(); } },
      h('div', { class: 'row spread', style: 'flex-wrap:nowrap;align-items:flex-start' }, h('span', { class: 'jp-sec', style: 'min-width:0' }, t.name),
        data.template && t.id === data.template.id ? h('span', { class: 'tagpill' }, 'Current') : t.suggested ? h('span', { class: 'tagpill' }, 'Suggested') : null),
      t.chosen_when ? h('div', { class: 'jp-label' }, 'For when ' + t.chosen_when) : null,
      h('div', { class: 'jp-label faint' }, t.length || ''))));
    draw();
    modal({ title: 'Change the proposal type', confirm: 'Write it with this type', wide: true,
      body: h('div', {}, h('p', { class: 'jp-label', style: 'margin-top:0' }, 'The proposal is written again with the type you pick, as a new version. The earlier versions stay.'), grid),
      onConfirm: async () => {
        if (!pick) throw new Error('Pick a type.');
        await api('POST', `/screenings/${s.id}/proposal/start`, { template_id: pick, loom_video_id: s.loom_video_id ?? null });
        await reload(); drawAll(); startPolling();
      } });
  }

  // ----- before anything is written: which type of proposal? The types that suit the job's signals come first.
  const SUGGEST = 5; // how many are shown before "Show all types"
  let picked = null, byHand = false, showAll = false, choices = null, typeTimer = null, loomPick; // loomPick: a video id, null for none, undefined until loaded
  function typeChooser() {
    const el = h('div', { class: 'stack' });
    const write = async (e) => {
      const b = e.currentTarget; btnBusy(b, 'Starting');
      try { await api('POST', `/screenings/${s.id}/proposal/start`, { template_id: picked, loom_video_id: loomPick ?? null }); await reload(); drawAll(); startPolling(); if (typeof stepCtx !== 'undefined' && stepCtx) stepCtx.refresh(); }
      catch (x) { toast(x.message, true); b.disabled = false; b.replaceChildren('Write the proposal'); }
    };
    const why = (t) => { const req = t.matched.filter((m) => m.role === 'required').map((m) => m.label), sup = t.matched.filter((m) => m.role !== 'required').map((m) => m.label);
      return [req.length ? 'Fits because of ' + req.join('; ') : null, sup.length ? (req.length ? 'Also ' : 'Supported by ') + sup.join('; ') : null, t.excluded_by.length ? 'Ruled out by ' + t.excluded_by.join('; ') : null].filter(Boolean).join('. '); };
    const draw = () => {
      if (!owner) { el.replaceChildren(h('div', { class: 'jp-sec' }, 'Waiting for the proposal type'), h('p', { class: 'jp-label' }, `${s.user_name || 'The person who submitted this job'} chooses how the proposal is written.`)); return; }
      if (!choices) { el.replaceChildren(h('div', { class: 'skel', style: 'width:50%' })); return; }
      if (picked === null) picked = (choices.types.find((t) => t.id === choices.chosen_type_id) || choices.types.find((t) => t.suggested) || choices.types[0] || {}).id ?? null; // the type picked in Claude, else the suggestion
      // the Loom video: the one already chosen; else, when the post asks for a video, the one that fits best; else none
      const lm = choices.loom || { asked: false, chosen: null, videos: [] };
      if (loomPick === undefined) loomPick = lm.chosen ?? (lm.asked && lm.videos.length ? (lm.videos.find((v) => v.best) || lm.videos[0]).id : null);
      const loomCard = (v) => h('button', { type: 'button', class: 'pcard2 typecard' + (loomPick === (v ? v.id : null) ? ' on' : ''), role: 'radio', 'aria-checked': loomPick === (v ? v.id : null), onclick: () => { loomPick = v ? v.id : null; draw(); } },
        h('div', { class: 'row spread', style: 'flex-wrap:nowrap;align-items:flex-start' }, h('span', { class: 'jp-sec', style: 'min-width:0' }, v ? v.title : 'No Loom video'), v && v.best ? h('span', { class: 'tagpill' }, 'Fits best') : null),
        h('div', { class: 'jp-label' }, v ? v.topic || 'No description yet' : 'The proposal does not mention a video.'),
        v && v.best && v.shared.length ? h('div', { class: 'jp-label faint' }, 'Shares ' + v.shared.join(', ') + ' with this job') : null);
      const loomBlock = h('div', { class: 'stack', style: 'gap:10px;margin-top:8px' },
        h('div', {}, h('div', { class: 'jp-sec' }, 'Send a Loom video with it?'),
          h('div', { class: 'jp-label' }, lm.asked ? 'This job post asks for a video. ' + (lm.videos.length ? 'The one that fits best is selected. Its link is written into the proposal.' : '') : lm.videos.length ? 'Pick one and its link is written into the proposal.' : '')),
        lm.asked && !lm.videos.length ? h('div', { class: 'warnbox' }, h('strong', {}, icon('warn'), 'The client asks for a video, and this profile has no Loom videos.'),
          h('div', { style: 'margin-top:4px' }, 'An admin can add one under Loom videos (then reload this page). Or record one now and paste its link into the proposal after it is written.')) : null,
        lm.videos.length ? h('div', { class: 'pgrid2 typegrid', role: 'radiogroup', 'aria-label': 'Loom video' }, loomCard(null), lm.videos.map(loomCard))
          : !lm.asked ? h('div', { class: 'jp-label' }, 'This profile has no Loom videos yet. An admin adds them under Loom videos.') : null);
      const shown = showAll ? choices.types : choices.types.filter((t, i) => i < SUGGEST || t.id === picked);
      setActions(picked ? actBtn('Write the proposal', write, true) : null);
      const card = (t) => h('button', { type: 'button', class: 'pcard2 typecard' + (picked === t.id ? ' on' : ''), role: 'radio', 'aria-checked': picked === t.id, onclick: () => { picked = t.id; byHand = true; draw(); } },
        h('div', { class: 'row spread', style: 'flex-wrap:nowrap;align-items:flex-start' }, h('span', { class: 'jp-sec', style: 'min-width:0' }, t.name),
          t.id === choices.chosen_type_id ? h('span', { class: 'tagpill' }, 'Picked in Claude') : t.suggested ? h('span', { class: 'tagpill' }, 'Suggested') : choices.ready && t.qualified ? h('span', { class: 'pill PASS' }, 'Also fits') : t.ruled_out ? h('span', { class: 'pill wait' }, 'Ruled out') : picked === t.id ? icon('check') : null),
        t.chosen_when ? h('div', { class: 'jp-label' }, 'For when ' + t.chosen_when) : null,
        choices.ready && why(t) ? h('div', { class: 'jp-label' }, why(t) + '.') : null,
        h('div', { class: 'jp-label faint' }, [t.length, `${t.samples} sample${t.samples === 1 ? '' : 's'}`].filter(Boolean).join(' · ')));
      el.replaceChildren(...[
        h('div', {}, h('div', { class: 'jp-sec' }, 'Which type of proposal?'),
          h('div', { class: 'jp-label' }, choices.ready
            ? (choices.defaulted ? 'No type matched this job\'s signals, so the default type is suggested. ' : 'The best fit for this job\'s signals is suggested and already selected. ') + 'Pick another if you prefer, then press Write the proposal at the top right. Only that type is written.'
            : 'The job\'s signals are still being read, so the types are not ranked yet. Wait a moment for the suggestion, or pick a type now.')),
        !choices.ready ? liveLine({ id: 'sig-' + s.id, label: 'Reading the signals', now: '', typical: 25, items: ['What the client asks for', 'How they write', 'What they will judge on', 'Which proposal type it points to'] }) : null,
        h('div', { class: 'pgrid2 typegrid', role: 'radiogroup', 'aria-label': 'Proposal type' }, shown.map(card)),
        choices.types.length > shown.length || showAll ? h('div', {}, h('button', { type: 'button', class: 'linkbtn', onclick: () => { showAll = !showAll; draw(); } }, showAll ? `Show the top ${SUGGEST} only` : `Show all ${choices.types.length} types`)) : null,
        loomBlock].filter(Boolean)); // replaceChildren prints a null as the word
    };
    const load = async () => {
      clearTimeout(typeTimer);
      try { const was = choices && choices.ready; choices = await api('GET', `/screenings/${s.id}/proposal/types`); if (choices.ready && !was && !byHand) picked = null; /* the suggestion arrived: select it, unless the person already chose */ } catch (x) { if (!choices) { el.replaceChildren(h('p', { class: 'err' }, x.message)); return; } }
      if (!box.isConnected || data) return;
      draw(); if (!choices.ready) typeTimer = setTimeout(load, 1500);
    };
    draw(); if (owner) load();
    return el;
  }

  /**
   * R97 (Ahmad): while the proposal is written, what is being done: each step with its state, a bar that keeps moving, the time
   * so far and about how long is left (from how long the last proposals took here). Redrawn in place; nothing else on the page.
   */
  const PSTEPS = [
    ['queued', 'Waiting for a free slot', 'Another job is being worked on. This one is next.'],
    ['signals', 'Reading the job', 'What the client asks for, how they write, and what they will judge the proposal on.'],
    ['template', 'Choosing the proposal type', 'The type the signals point to, with its format and length.'],
    ['writing', 'Writing the letter and the answers', 'The opening, your projects as proof, the approach, and any screening answers.'],
    ['checking', 'Checking it', 'The proof, the sign off and the writing rules, before it is saved.'],
  ];
  // where each step sits on the bar, and its share of the usual time
  const BAND = { queued: [0, 6, 0.05], signals: [6, 28, 0.2], template: [28, 40, 0.1], writing: [40, 88, 0.5], checking: [88, 97, 0.15] };
  const prog = { at: 0, stage: null, since: 0, pct: 0, tick: null };
  const stageNow = () => (data.status === 'queued' ? 'queued' : data.stage && BAND[data.stage] ? data.stage : 'signals');
  const fmtSecs = (n) => (n < 60 ? `${Math.max(5, Math.round(n / 5) * 5)} s` : `${Math.floor(n / 60)} min${n % 60 >= 30 ? ' 30 s' : ''}`);
  function progressView() { // R99: the shared loader, with what is really being used: the projects, the type, what is checked
    const projects = matching && matching.matches ? matching.matches.filter((x) => x.selected).map((x) => x.project_name) : [];
    const idOf = 'prop-' + data.id;
    if (!busy()) forgetLoader(idOf);
    return liveLoader({ id: idOf, title: 'Writing your proposal', sub: 'You can leave this page. It carries on, and the proposal is saved when it is done.',
      typical: data.typical_seconds, elapsed: data.elapsed_seconds, typicalLabel: 'Usually a couple of minutes', stage: stageNow,
      steps: [
        { key: 'queued', label: PSTEPS[0][1], hint: PSTEPS[0][2], share: 0.3 },
        { key: 'signals', label: PSTEPS[1][1], hint: PSTEPS[1][2], share: 2, now: 'Reading', items: ['What the client asks for', 'How they write', 'Their screening questions', 'Budget and timeline', 'Tools and stack they name', 'What they will judge on'] },
        { key: 'template', label: PSTEPS[2][1], hint: PSTEPS[2][2], share: 1, now: 'Weighing', items: (templates || []).map((t) => t.name) },
        { key: 'writing', label: PSTEPS[3][1], hint: PSTEPS[3][2], share: 5, now: 'Writing', items: ['The opening', ...projects.map((p) => `The proof from ${p}`), 'The approach', 'The call to action', 'The screening answers'] },
        { key: 'checking', label: PSTEPS[4][1], hint: PSTEPS[4][2], share: 1.5, now: 'Checking', items: ['The first two lines', 'Every project link', 'The sign off', 'Banned phrases', 'The length for the type', 'Facts against the job post'] },
      ] });
  }
  function drawProgress() { /* R99: the loader keeps itself up to date */ }


  function explain() {
    const t = data.template, rk = data.ranking;
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
    modal({ title: 'How this proposal was written', wide: true, noConfirm: true,
      body: h('div', {},
        h('p', { class: 'jp-label', style: 'margin:0 0 16px' }, `Written ${data.finished_at ? ago(data.finished_at) : ''}${t ? ' with ' + t.name : ''}. Every save, chat revision and restore is kept as a version. To write it with another type, use Change type at the top right.`),
        t ? h('div', {}, h('h3', { class: 'section-title' }, 'Proposal type'),
          h('p', {}, h('strong', {}, t.name), ' ', h('span', { class: 'chip' }, t.choice === 'manual' ? 'Chosen by you' : rk && rk.defaulted ? 'Default: no signal matched' : 'Best fit for the signals'), ' ', h('span', { class: 'faint' }, `Score ${t.score ?? 0}`)),
          rankTable) : null,
        h('div', { style: 'margin-top:18px' }, h('h3', { class: 'section-title' }, `Signals detected (${new Set(data.signals.map((x) => x.signal_number)).size})`), sigTable)) });
  }

  // ----- the independent review: a score, why, and two or three suggestions the person can apply through the chat
  function drawReview() {
    const el = box.querySelector('.reviewpanel'); if (!el) return;
    const rv = data.review, canAsk = !busy();
    const ask = (label, primary) => { const b = h('button', { class: 'btn sm' + (primary ? ' primary' : ''), type: 'button' }, label);
      b.onclick = async () => { btnBusy(b, 'Asking');
        try { await api('POST', `/screenings/${s.id}/proposal/review`, {}); data.review = { ...(data.review || {}), status: 'queued' }; drawReview(); startPolling(); }
        catch (x) { toast(x.message, true); b.disabled = false; b.replaceChildren(label); } };
      return b; };
    drawSideTabs();
    const head = (right) => (right ? h('div', { class: 'row', style: 'justify-content:flex-end' }, right) : null);
    if (!rv || (!rv.score && rv.status !== 'queued' && rv.status !== 'running' && rv.status !== 'error')) {
      el.replaceChildren(h('p', { class: 'jp-label', style: 'margin:0' }, 'A separate reader scores the proposal out of 10 and suggests two or three changes, before you copy it.'), ...(canAsk ? [h('div', {}, ask('Review this proposal', true))] : [])); return; }
    if (rv.status === 'queued' || rv.status === 'running') {
      el.replaceChildren(liveLine({ id: 'rev-' + data.id + '-' + (data.current ? data.current.version_no : 0), label: 'An independent reviewer is reading it', now: 'Judging ', typical: 60, items: ['the first two lines', 'whether it answers what the post asks', 'the proof against the facts', 'the format and length of the type', 'the writing rules', 'whether a client would reply'] })); return; }
    if (rv.status === 'error' && !rv.score) {
      el.replaceChildren(...[head(canAsk ? ask('Try again', true) : null), h('p', { class: 'err' }, icon('x'), 'The review could not be made' + (rv.error ? ': ' + rv.error : '.'))].filter(Boolean)); return; }
    const tone = rv.score >= 8 ? 'PASS' : rv.score >= 5 ? 'FLAG' : 'FAIL';
    const stale = loaded && rv.version && rv.version < loaded;
    const apply = (sg) => { const b = h('button', { class: 'btn sm', type: 'button', disabled: chatBusy() || null }, 'Apply this');
      b.onclick = async () => {
        if (editor && (editor.isDirty() || answersDirty()) && !(await ask2('Apply the suggestion?', 'You have unsaved changes. The AI revises the last saved version, so save yours first if you want to keep them.', 'Apply anyway'))) return;
        btnBusy(b, 'Sending');
        try { await api('POST', `/proposals/${data.id}/messages`, { content: sg.instruction }); const stt = (await api('GET', `/screenings/${s.id}/proposal/state`)).state; data.messages = stt.messages; drawChat(); drawReview(); startPolling(); showSide('chat'); toast('Sent to the AI. The revised proposal is saved as a new version.'); }
        catch (x) { toast(x.message, true); b.disabled = false; b.replaceChildren('Apply this'); } };
      return b; };
    // the points are folded: the score, the verdict and the suggestions are what a person acts on, and the chat must stay in reach below
    const listOf = (title, items) => (items && items.length ? h('details', { class: 'reviewfold' }, h('summary', {}, `${title} (${items.length})`), h('ul', { class: 'jp-list', style: 'margin:4px 0 0' }, items.map((x) => h('li', {}, x)))) : null);
    el.replaceChildren(...[
      h('div', { class: 'reviewscore ' + tone }, h('span', { class: 'num' }, String(rv.score)), h('span', { class: 'of' }, 'out of 10'), h('span', { class: 'ver' }, `Version ${rv.version || ''}${rv.at ? ' · ' + ago(rv.at) : ''}`),
        canAsk ? ask(stale ? 'Review this version' : 'Review again', !!stale) : null),
      stale ? h('div', { class: 'notice' }, icon('info'), `This review is of version ${rv.version}. You are on version ${loaded}: review it again to score the change.`) : null,
      h('p', { class: 'jp-body', style: 'margin:0' }, rv.verdict),
      rv.suggestions && rv.suggestions.length ? h('div', {}, h('div', { class: 'jp-label', style: 'margin-bottom:6px' }, owner ? 'Suggestions. Apply the ones you agree with; each is sent to the AI and saved as a new version.' : 'Suggestions'),
        h('div', { class: 'stack', style: 'gap:8px' }, rv.suggestions.map((sg) => h('div', { class: 'suggestion' }, h('div', {}, h('strong', {}, sg.title), h('div', { class: 'jp-label' }, sg.instruction)), owner ? apply(sg) : null)))) : null,
      listOf('What hurts it', rv.problems), listOf('What works', rv.strengths),
      // R115: each criterion, the opening, body and answers apart, and any cap, folded
      (() => { const d = typeof reviewDetail === 'function' ? reviewDetail(rv) : null; return d && d.length ? h('details', { class: 'reviewfold' }, h('summary', {}, 'How the score was made'), h('div', { class: 'stack', style: 'gap:8px;margin-top:6px' }, d)) : null; })(),
      me.role === 'admin' ? h('div', {}, h('button', { class: 'linkbtn', type: 'button', onclick: () => asExample(rv) }, 'Use as reviewer example')) : null,
      rv.status === 'error' ? h('p', { class: 'err' }, icon('x'), 'The newest review could not be made' + (rv.error ? ': ' + rv.error : '.')) : null,
    ].filter(Boolean));
  }
  // an admin keeps this proposal in the reviewer's examples library, with the score it deserves and why (R115)
  function asExample(rv) {
    const score = h('input', { type: 'number', min: 1, max: 10, step: 1, value: rv.score || 7, style: 'width:80px' });
    const why = h('textarea', { rows: 5, placeholder: 'Why it deserves that score: what works, what does not' }); why.value = rv.verdict || '';
    modal({ title: 'Use as reviewer example', confirm: 'Add to the examples', body: h('div', { class: 'stack' },
      h('p', { class: 'jp-label', style: 'margin:0' }, `Version ${rv.version || 'newest'} of this proposal goes into the reviewer's examples library, with the job post. A reviewer version that uses examples shows it to the reviewer when it reviews proposals of the same type.`),
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'The score it deserves (1 to 10)'), score, h('div', { class: 'hint' }, `The reviewer gave it ${rv.score}. Put the score Stackup says it deserves.`)),
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Why'), why)),
      onConfirm: async () => { await api('POST', '/admin/reviewer/examples/from-job', { screening_id: s.id, version_no: rv.version || undefined, score: Number(score.value), why: why.value }); toast('Added to the reviewer examples'); } });
  }
  const ask2 = (title, text, confirm) => (typeof ask === 'function' ? ask(title, text, confirm) : Promise.resolve(true));

  function drawChat() {
    if (chatLoader) { const was = chatLoader.hidden; chatLoader.hidden = !chatBusy();
      // R99: what the chat is doing, from when it started; the request itself is the first thing shown
      if (!chatLoader.hidden && was) { const last = [...(data.messages || [])].reverse().find((m) => m.role === 'user'); forgetLoader('chat-' + data.id);
        chatLoader.querySelector('.chatll')?.replaceChildren(liveLine({ id: 'chat-' + data.id, label: 'Working on your request', now: '', typical: 45,
          items: [last ? `"${String(last.content).slice(0, 80)}${String(last.content).length > 80 ? '...' : ''}"` : '', 'Reading the proposal and the job again', 'Changing only what the request touches', 'Keeping the facts and the links as they are', 'Checking it against the writing rules'].filter(Boolean) })); } }
    drawActions();
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
    drawSideTabs();
    el.replaceChildren(list, owner ? h('div', {}, h('div', { class: 'chips', style: 'margin:8px 0' }, quick), input, h('div', { class: 'row', style: 'margin-top:8px;justify-content:space-between' }, h('span', { class: 'faint small' }, (navigator.platform || '').startsWith('Mac') ? 'Cmd + Enter to send' : 'Ctrl + Enter to send'), send)) : h('p', { class: 'hint' }, 'Only the person who submitted this job can chat with the AI.'));
    list.scrollTop = list.scrollHeight;
  }

  function workspace() {
    const cur = data.current; loaded = cur.version_no;
    const counter = h('div', { class: 'counter-line faint small' });
    const count = () => { const t = htmlToPlainText(editor.getHtml()); const words = t.trim() ? t.trim().split(/\s+/).length : 0; counter.textContent = `${words} words · ${t.length.toLocaleString()} characters` + (t.length > 5000 ? ' · over 5,000: Upwork may cut it off' : ''); counter.classList.toggle('over', t.length > 5000); };
    const answersBox = h('div', {});
    // the cover letter and the screening answers are two tabs: each is pasted into its own place on Upwork
    const mainTabs = h('div', { class: 'tabs maintabs', role: 'tablist', 'aria-label': 'Proposal parts' });
    const letterPane = h('div', {}), answersPane = h('div', {}, answersBox);
    const drawMainTabs = () => {
      const n = shownAnswers.length; if (!n) mainTab = 'letter';
      const tab = (k, label, ...extra) => h('button', { type: 'button', role: 'tab', class: 'tab' + (mainTab === k ? ' on' : ''), 'aria-selected': mainTab === k, onclick: () => { mainTab = k; drawMainTabs(); } }, label, ...extra.filter(Boolean));
      mainTabs.replaceChildren(...[tab('letter', 'Cover letter', editor && editor.isDirty() ? h('span', { class: 'dot', title: 'Unsaved changes' }) : null),
        n ? tab('answers', 'Screening answers', h('span', { class: 'n' }, String(n)), answersDirty() ? h('span', { class: 'dot', title: 'Unsaved changes' }) : null) : null].filter(Boolean));
      letterPane.hidden = mainTab !== 'letter'; answersPane.hidden = mainTab !== 'answers';
    };
    chatLoader = h('div', { class: 'busycover', hidden: !chatBusy(), role: 'status', 'aria-live': 'polite' }, h('div', { class: 'chatll', style: 'width:min(460px,90%)' },
      chatBusy() ? liveLine({ id: 'chat-' + data.id, label: 'Working on your request', now: '', typical: 45, items: ['Reading the proposal and the job again', 'Changing only what the request touches', 'Keeping the facts and the links as they are', 'Checking it against the writing rules'] }) : null),
      h('div', { class: 'jp-label', style: 'margin-top:8px' }, 'If it rewrites the proposal, the new version loads here by itself.'));
    // the screening answers, apart from the letter: each its own box, Copy and edit; saved with Save version, never through the letter
    const drawAnswers = (answers, editable) => {
      shownAnswers = answers || []; answerBoxes = [];
      if (!editable) ansEditing = null;
      const pane = box.querySelector('.side-answer');
      if (pane && !ansAi() && pane.childNodes.length) { pane.replaceChildren(); drawSideTabs(); }
      answersBox.replaceChildren(...(shownAnswers.length ? [h('div', {},
        h('div', { class: 'row spread', style: 'align-items:flex-start;gap:10px;margin-bottom:10px' },
          h('div', { class: 'jp-label' }, editable ? 'Paste each into its own box on Upwork. Edit one yourself, or tell the AI what to change.' : 'Paste each into its own box on Upwork. They are kept apart from the proposal.'),
          // R125: they follow the chosen projects by themselves; this does it now (an answer that names no project stays as it is)
          editable ? h('button', { class: 'btn sm', type: 'button', title: 'Answers that name a project no longer chosen are written again with the chosen ones', disabled: data.parts && ['queued', 'running'].includes(data.parts.status), onclick: async (e) => {
            if (answersDirty() && !(await ask('Update the answers?', 'You have unsaved changes to the answers. The update starts from the last saved version, so save yours first to keep them.', 'Update anyway'))) return;
            e.currentTarget.disabled = true; e.currentTarget.textContent = 'Updating\u2026';
            await api('POST', `/proposals/${data.id}/answers/refit`); data.parts = { ...(data.parts || {}), status: 'queued' }; startPolling();
            toast('Updating the answers for the chosen projects. The new version loads here by itself.'); } }, 'Match the chosen projects') : null),
        h('div', { class: 'stack', style: 'gap:10px' }, shownAnswers.map((x, i) => {
          const on = editable && ansEditing && ansEditing.i === i;
          const ta = h('textarea', { class: 'qa-answer' + (on ? ' editing' : ''), rows: Math.min(14, Math.max(3, Math.ceil(x.answer.length / 90) + 1)), readOnly: !on, 'aria-label': `Answer ${i + 1}` });
          ta.value = on && ansEditing.text != null ? ansEditing.text : x.answer; answerBoxes.push(ta);
          ta.addEventListener('input', () => { if (on) ansEditing.text = ta.value; answersChip.hidden = !answersDirty(); drawActions(); drawMainTabs(); });
          const copy = h('button', { class: 'btn sm', type: 'button', onclick: async () => { const ok = await copyText(ta.value.trim()); toast(ok ? `Answer ${i + 1} copied` : 'Could not copy. Select the text and copy it.', !ok); } }, 'Copy');
          const start = (ai) => { if (ansEditing && ansEditing.i !== i && answersDirty()) return toast('Save or cancel the answer you are editing first', true); ansEditing = { i, ai, text: on ? ta.value : x.answer }; drawAnswers(shownAnswers, true); };
          let tools;
          if (on) {
            const save = h('button', { class: 'btn sm primary', type: 'button' }, 'Save');
            save.onclick = async () => { btnBusy(save, 'Saving');
              try { const r = await api('POST', `/proposals/${data.id}/answers/${i}`, { text: ta.value }); ansEditing = null; toast(r.version_no === loaded ? 'Nothing changed' : `Answer ${i + 1} saved as version ${r.version_no}`); await reload(); newer = null; drawAll(); }
              catch (e) { toast(e.message, true); save.disabled = false; save.replaceChildren('Save'); } };
            const cancel = h('button', { class: 'btn sm', type: 'button', onclick: () => { ansEditing = null; drawAnswers(shownAnswers, true); answersChip.hidden = !answersDirty(); drawActions(); drawMainTabs(); } }, 'Cancel');
            tools = [copy, ansEditing.ai ? null : h('button', { class: 'btn sm', type: 'button', title: 'Tell the AI what to change; its version comes into this box', onclick: () => start(true) }, icon('message'), 'Ask the AI'), cancel, save];
          } else tools = [copy, editable ? h('button', { class: 'btn sm', type: 'button', onclick: () => start(false) }, 'Edit') : null,
            editable ? h('button', { class: 'btn sm', type: 'button', title: 'Tell the AI what to change, as often as you like, then save it', onclick: () => start(true) }, icon('message'), 'Edit with AI') : null];
          if (on && ansEditing.ai && pane) { const chat = answerChat(i, x.question, ta); pane.replaceChildren(chat.el); sideTab = 'answer'; drawSideTabs(); requestAnimationFrame(() => { if (window.innerWidth >= 1100) chat.focus(); else ta.focus(); }); }
          else if (on) requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
          return h('div', { class: 'qa' + (on ? ' on' : '') },
            h('div', { class: 'row spread', style: 'flex-wrap:nowrap;align-items:flex-start;gap:10px' }, h('label', { class: 'jp-label' }, `${i + 1}. ${x.question}`),
              h('span', { class: 'row', style: 'gap:6px;flex-wrap:nowrap' }, ...tools.filter(Boolean))),
            ta, on && ansEditing.ai ? h('div', { class: 'faint small', style: 'margin-top:6px' }, 'Tell the AI what to change in the Answer panel on the right; each version comes into this box. Save when it reads right.') : null);
        })), answersChip)] : []));
      answersChip.hidden = !answersDirty(); drawMainTabs();
    };
    editor = richEditor(cur.html, { label: 'Proposal text', readOnly: !owner, onChange: (d) => { if (d !== wasDirty) { wasDirty = d; drawActions(); drawMainTabs(); } dirtyChip.hidden = !d; count(); } });
    let wasDirty = false;
    const dirtyChip = h('span', { class: 'chip', hidden: true }, 'Unsaved changes');
    const vsel = h('select', { id: 'ver-sel', class: 'sm', 'aria-label': 'Version' }, data.versions.map((v) => h('option', { value: v.version_no, selected: v.version_no === cur.version_no }, `v${v.version_no} · ${SOURCE_TEXT[v.source] || v.source} · ${ago(v.created_at)}${v.version_no === data.sent_version_no ? ' · Sent' : ''}`))); // R104: the one that went out
    // with two or more versions: any two side by side (the one shown and the one before it, to start)
    const cmpBtn = data.versions.length > 1 ? h('button', { class: 'btn sm', type: 'button', onclick: () => {
      const shown = Number(vsel.value), nos = data.versions.map((v) => v.version_no).sort((x, y) => x - y);
      const before = nos.filter((x) => x < shown).pop() ?? nos.find((x) => x !== shown);
      compareVersions(data.id, data.versions, Math.min(before, shown), Math.max(before, shown), { latest: Math.max(...nos), title: s.title,
        send: owner ? async (text) => { await api('POST', `/proposals/${data.id}/messages`, { content: text }); const st = (await api('GET', `/screenings/${s.id}/proposal/state`)).state; data.messages = st.messages; drawChat(); showSide('chat'); startPolling(); toast('Sent to the chat. The revised proposal is saved as a new version.'); } : null }); } }, icon('compare'), 'Compare') : null;
    const viewing = h('div', { class: 'docnote', hidden: true });
    vsel.onchange = async () => {
      const no = Number(vsel.value);
      if (no === cur.version_no) { editor.setHtml(cur.html); viewing.hidden = true; viewing.textContent = ''; drawAnswers(cur.answers, owner); drawActions(); previewIdx = 0; viewingOther = false; drawOpenings(); return; }
      if ((editor.isDirty() || answersDirty()) && !(await ask('Show the other version?', 'You have unsaved changes. They are lost when the other version is shown.', 'Show it', true))) { vsel.value = cur.version_no; return; }
      const v = (await api('GET', `/proposals/${data.id}/versions/${no}`)).version; editor.setHtml(v.content_html); drawAnswers(v.answers, false); drawActions();
      previewIdx = 0; viewingOther = true; drawOpenings(); // the openings are for the newest version only
      viewing.hidden = false;
      viewing.replaceChildren(...[icon('info'), `You are looking at version ${no}, not the newest. `, owner ? h('a', { onclick: async () => { try { await api('POST', `/proposals/${data.id}/restore`, { version_no: no }); toast(`Restored as a new version`); await reload(); newer = null; drawAll(); } catch (x) { toast(x.message, true); } } }, 'Restore it as the newest version') : null, h('a', { onclick: () => { vsel.value = cur.version_no; vsel.dispatchEvent(new Event('change')); } }, 'Back to the newest')].filter(Boolean));
    };
    const stale = matching && matching.proposal_profile && data.profile_id && data.profile_id !== matching.proposal_profile.id && !partsBusy();
    // R116: a file the client attached was added or changed after this version: it is not in the letter yet
    const docsBox = data.docs_newer && !stale ? h('div', { class: 'docnote' }, icon('info'), h('span', {}, 'The client\u2019s files changed after this version was written, so it does not use them yet. Use Write it again at the top to write it with them (your edits stay in the earlier versions).')) : null;
    const staleBox = stale ? h('div', { class: 'docnote' }, icon('info'), h('span', {}, `Sent from ${matching.proposal_profile.name} now: the sign off is theirs. The letter was written in another profile's voice; to write it again in theirs, use Write it again at the top.`)) : null;
    // the sending profile can be changed here too (R75): the sign off and the video follow, the letter stays (Write it again for
    // the new profile's voice); the page stays on the proposal
    const profs = matching && matching.profiles ? matching.profiles.filter((p) => Number(p.active) || (matching.proposal_profile && p.id === matching.proposal_profile.id)) : [];
    const profSel = owner && profs.length > 1 ? h('select', { class: 'sm', 'aria-label': 'Sent from' }, profs.map((p) => h('option', { value: p.id, selected: matching.proposal_profile && p.id === matching.proposal_profile.id }, p.name))) : null;
    if (profSel) profSel.onchange = async () => {
      if (editor && (editor.isDirty() || answersDirty()) && !(await ask('Change the profile?', 'You have unsaved changes. The sign off is updated from the last saved version, so save yours first to keep them.', 'Change it'))) { profSel.value = matching.proposal_profile.id; return; }
      profSel.disabled = true;
      try { const r = await api('PUT', `/screenings/${s.id}/proposal-profile`, { profile_id: Number(profSel.value) });
        toast(r.updated === 'in_place' ? 'Sent from ' + profSel.options[profSel.selectedIndex].textContent + ' now. The sign off changed.' : 'Profile changed. The new sign off is offered beside your edited text.');
        // R91 (Ahmad): only the proposal is drawn again, never the whole page; the other tabs read the same profile
        const np = profs.find((p) => p.id === Number(profSel.value)); if (np) matching.proposal_profile = { ...(matching.proposal_profile || {}), ...np };
        await reload(); newer = null; drawAll(); if (busy() || partsBusy()) startPolling(); }
      catch (x) { toast(x.message, true); profSel.disabled = false; profSel.value = matching.proposal_profile.id; }
    };
    // the Loom video can be changed after writing: only its line changes, no new write
    const loomSel = owner ? h('select', { class: 'sm', 'aria-label': 'Loom video' }, h('option', { value: '' }, 'Loading...')) : null;
    const loomBox = h('span', { class: 'docset' }, h('span', { class: 'docsetlbl' }, 'Loom video'), loomSel || h('span', { class: 'faint' }, s.loom_video_title || 'None'));
    const noLoom = (text) => loomBox.replaceChildren(h('span', { class: 'docsetlbl' }, 'Loom video'), h('span', { class: 'faint' }, text));
    if (loomSel) api('GET', `/screenings/${s.id}/proposal/types`).then((r) => {
      const vids = (r.loom && r.loom.videos) || [];
      if (!vids.length) return noLoom('None on this profile');
      loomSel.replaceChildren(h('option', { value: '' }, 'No Loom video'), ...vids.map((v) => h('option', { value: v.id, selected: r.loom.chosen === v.id }, v.title + (v.best ? ' (best fit)' : ''))));
      loomSel.onchange = async () => {
        if (editor && (editor.isDirty() || answersDirty()) && !(await ask('Change the video?', 'You have unsaved changes. The video line is changed in the last saved version, so save yours first to keep them.', 'Change it'))) { loomSel.value = r.loom.chosen ?? ''; return; }
        loomSel.disabled = true;
        try { const res = await api('PUT', `/screenings/${s.id}/loom`, { loom_video_id: loomSel.value ? Number(loomSel.value) : null }); s.loom_video_id = loomSel.value ? Number(loomSel.value) : null;
          if (res.updated === 'in_place') { await reload(); drawAll(); toast(loomSel.value ? 'The video line is in.' : 'The video line is out.'); }
          else { data.parts = { ...(data.parts || {}), status: 'queued', offer: [] }; drawParts(); startPolling(); } }
        catch (x) { toast(x.message, true); loomSel.disabled = false; } };
    }).catch(() => noLoom('Could not load the videos'));
    // open questions about our experience: their tab is shown first, once
    if (!gapsShown && owner && openGaps()) { sideTab = 'gaps'; gapsShown = true; }
    count(); drawAnswers(cur.answers, owner); drawParts();
    // the proposal on the left; beside it (below it on a narrow screen) one card with a tab per tool
    previewIdx = 0; viewingOther = false;
    letterPane.append(partsEl, openEl, h('div', { class: 'busywrap' }, editor.el, chatLoader));
    drawMainTabs();
    // one card holds the proposal: its parts and version on top, what it is sent with under that, the text, then its numbers
    const profName = matching && matching.proposal_profile ? matching.proposal_profile.name : '';
    const doc = h('div', { class: 'doccard' },
      h('div', { class: 'dochead' }, mainTabs, h('div', { class: 'docver' }, vsel, cmpBtn)),
      h('div', { class: 'docbar' },
        h('span', { class: 'docset' }, h('span', { class: 'docsetlbl' }, 'Sent from'), profSel || h('span', {}, profName)),
        loomBox),
      h('div', { class: 'docbody' }, ...[staleBox, docsBox, viewing, bannerEl, letterPane, answersPane].filter(Boolean)),
      h('div', { class: 'docfoot' }, h('div', { class: 'row', style: 'gap:8px' }, counter, dirtyChip), h('button', { type: 'button', class: 'linkbtn small', onclick: explain }, 'How this was written')));
    const grid = h('div', { class: 'propgrid' },
      h('div', { class: 'propmain' }, checksEl, doc),
      h('div', { class: 'propside' }, h('div', { class: 'card sidecard' }, h('div', { class: 'tabs sidetabs', role: 'tablist', 'aria-label': 'Proposal tools' }),
        h('div', { class: 'sidebody' }, h('div', { class: 'side-opening' }), h('div', { class: 'side-answer' }), h('div', { class: 'chatpanel side-chat' }), h('div', { class: 'reviewpanel side-review' }), h('div', { class: 'side-gaps' }, gapsEl), h('div', { class: 'feedbackpanel side-feedback' })))));
    return grid;
  }

  function drawAll() {
    let body;
    if (!data) {
      body = typeChooser();
    } else if (busy()) {
      body = progressView(); // R97: the steps, a moving bar and the time left
    } else if (data.status === 'error' && !data.current) {
      body = h('div', {}, h('div', { class: 'jp-sec' }, 'The proposal could not be written'), h('p', { class: 'jp-body', style: 'margin:6px 0 0' }, data.error || 'Something went wrong.'));
    } else if (data.current) {
      body = workspace();
    } else {
      body = h('div', {}, h('div', { class: 'jp-sec' }, 'Write the proposal'), h('p', { class: 'jp-body', style: 'margin:6px 0 0' }, 'Ready when you are.'));
    }
    box.replaceChildren(...[data && data.status === 'error' && data.current ? h('div', { class: 'err', style: 'margin:0 0 10px' }, icon('x'), 'The last attempt failed: ' + (data.error || '')) : null, body].filter(Boolean)); // replaceChildren prints a null as the word
    drawActions();
    if (data && data.current && !busy()) { drawReview(); drawChat(); drawBanner(); drawFeedback(); drawGaps(); drawOpenings(); }
  }
  box.replaceChildren(h('div', { class: 'skel', style: 'width:60%;margin-bottom:12px' }), h('div', { class: 'skel', style: 'width:80%' }));
  reload().then(() => { drawAll(); if (busy() || chatBusy() || reviewBusy() || partsBusy() || gapsBusy() || openingsBusy()) startPolling(); }).catch((e) => { box.replaceChildren(h('div', { class: 'card-pad' }, emptyState('x', 'Could not load the proposal', e.message, null))); });
  return box;
}

// ---------- templates (admin and manager) ----------
const canEditTemplates = () => me.role === 'admin' || me.role === 'manager';

async function templateView(idStr) {
  const isNew = idStr === 'new';
  const [{ template: t }, sigData, opData] = await Promise.all([isNew ? Promise.resolve({ template: null }) : api('GET', '/templates/' + idStr), api('GET', '/signals'), api('GET', '/opening-templates')]);
  const signals = sigData.signals;
  const f = { name: h('input', { type: 'text', id: 'tn', maxlength: 160, value: t ? t.name : '' }), desc: h('textarea', { id: 'td', maxlength: 1000, style: 'min-height:70px' }),
    priority: h('input', { type: 'number', id: 'tp', min: 0, step: 1, value: t ? t.priority : 100 }), active: h('input', { type: 'checkbox', id: 'ta', checked: t ? !!Number(t.active) : true }),
    isDefault: h('input', { type: 'checkbox', id: 'tdf', checked: t ? !!Number(t.is_default) : false }),
    prompt: h('textarea', { id: 'tpr', style: 'min-height:140px', maxlength: 20000, placeholder: 'Extra instructions for the AI when it writes with this type. Optional.' }),
  };
  f.desc.value = t && t.description ? t.description : ''; f.prompt.value = t && t.prompt ? t.prompt : '';
  const fmt = richEditor(t ? t.body_html : '<p></p>', { label: 'Proposal type format' });
  const err = h('div', { class: 'err', hidden: true });
  const saveBtn = h('button', { class: 'btn primary', type: 'button' }, isNew ? 'Create type' : 'Save type');
  saveBtn.onclick = async () => {
    err.hidden = true; btnBusy(saveBtn, 'Saving');
    const body = { name: f.name.value, description: f.desc.value.trim() || null, body_html: fmt.getHtml(), prompt: f.prompt.value.trim() || null, priority: Number(f.priority.value), active: f.active.checked, is_default: f.isDefault.checked,
      default_opening_id: openingId };
    try { const r = await api(isNew ? 'POST' : 'PATCH', isNew ? '/templates' : '/templates/' + t.id, body); toast(isNew ? 'Proposal type created' : 'Proposal type saved'); if (isNew) location.hash = '#/t/' + r.id; else route(); }
    catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; saveBtn.disabled = false; saveBtn.replaceChildren(isNew ? 'Create type' : 'Save type'); }
  };
  const del = !isNew ? h('button', { class: 'btn danger', type: 'button', onclick: () => modal({ title: 'Delete ' + t.name + '?', confirm: 'Delete proposal type', danger: true,
    body: h('p', { class: 'muted' }, 'This removes the proposal type, its signal mapping and its samples. Proposals already written keep its name. To stop using it but keep it, untick Active instead. It cannot be undone.'),
    onConfirm: async () => { await api('DELETE', '/templates/' + t.id); toast('Proposal type deleted'); location.hash = '#/writing?tab=types'; } }) }, 'Delete') : null;

  // R88/R90: the type does not hold its opening; it picks one of the opening templates as its default, from cards that show what each does
  let openingId = t && t.default_opening_id ? t.default_opening_id : null;
  const choices = opData.items.filter((o) => o.active || (t && o.id === t.default_opening_id));
  const pickGrid = h('div', { class: 'opick', role: 'radiogroup', 'aria-label': 'Default opening' });
  const preview = h('div', {});
  const others = (o) => (o.used_by || '').split(', ').filter((n) => n && (!t || n !== t.name)).map((n) => n.replace(/^(Type \d+)\..*$/, '$1'));
  const flagChips = (o) => [o.starts ? h('span', { class: 'chip' }, 'Starts: ' + o.starts.split('|').join(' or ')) : null, o.may_greet ? h('span', { class: 'chip' }, 'May greet') : null,
    o.may_talk_about_us ? h('span', { class: 'chip' }, 'May say how we start') : null, o.active ? null : h('span', { class: 'chip' }, 'Switched off')].filter(Boolean);
  const drawPick = () => {
    const pick = (id) => () => { openingId = id; drawPick(); };
    const card = (o, id, name, text, chips) => h('button', { type: 'button', role: 'radio', 'aria-checked': openingId === id ? 'true' : 'false', class: openingId === id ? 'on' : '', onclick: pick(id) },
      h('span', { class: 'nm' }, h('span', { class: 'dot', 'aria-hidden': 'true' }), name), h('span', { class: 'ex' }, text), chips.length ? h('span', { class: 'chips' }, ...chips) : null);
    pickGrid.replaceChildren(...choices.map((o) => card(o, o.id, o.name, o.instructions, [...flagChips(o), ...(others(o).length ? [h('span', { class: 'chip brand' }, 'Also used by ' + others(o).join(', '))] : [])])),
      card(null, null, 'No default', 'Written with the rules for every opening only, and no template of its own.', []));
    const o = choices.find((x) => x.id === openingId);
    const alt = opData.items.filter((x) => x.active && x.id !== openingId).length;
    preview.replaceChildren(h('div', { class: 'opreview' },
      h('div', { class: 'row spread', style: 'flex-wrap:nowrap;align-items:flex-start' }, h('div', {}, h('div', { class: 'jp-label' }, o ? 'What this opening tells the AI' : 'No opening template'), h('strong', {}, o ? o.name : 'The rules for every opening only')),
        o ? h('a', { class: 'btn sm', href: '#/o/' + o.id }, canEditTemplates() ? 'Edit opening' : 'Open') : null),
      o ? h('div', { class: 'txt' }, o.instructions) : null, o && flagChips(o).length ? h('div', { class: 'chips' }, ...flagChips(o)) : null,
      h('p', { class: 'hint', style: 'margin:0' }, alt ? `The other ${alt} active opening${alt === 1 ? ' is' : 's are'} written beside it, to pick from on the proposal page.` : 'No other opening is active, so there is nothing to pick from beside it.')));
  };
  drawPick();

  const TABS = [{ key: 'format', label: 'Details and format' }, { key: 'opening', label: 'Opening' }, ...(isNew ? [] : [{ key: 'signals', label: 'Signals', n: t.mappings.length }, { key: 'samples', label: 'Samples' }])];
  let tab = TABS.some((x) => x.key === hashParams().tab) ? hashParams().tab : 'format';
  const panes = {
    format: h('div', { class: 'stack', style: 'gap:16px' },
      h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'Details'),
        h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tn' }, 'Name'), f.name),
          h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tp' }, 'Priority'), f.priority, h('div', { class: 'hint' }, 'Tens set the priority group (10 first, then 20, 30, 40); within a group, more supporting signals win, then the lower number.'))),
        h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'td' }, 'Description'), f.desc),
        h('div', { class: 'field row', style: 'margin-top:12px' }, f.active, h('label', { for: 'ta', style: 'font-weight:600' }, 'Active (can be chosen for proposals)')),
        h('div', { class: 'field row', style: 'margin-top:8px' }, f.isDefault, h('label', { for: 'tdf', style: 'font-weight:600' }, 'Default type (used when no type qualifies)'))),
      h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'Format'), h('p', { class: 'hint', style: 'margin:0 0 10px' }, 'The structure and rules the proposal must follow. The AI reads this as written. Its opening comes from the Opening tab.'), fmt.el),
      h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'Prompt'), h('p', { class: 'hint', style: 'margin:0 0 10px' }, 'Extra instructions used with this type. Safety rules (no invented facts, links or numbers) always apply on top.'), f.prompt)),
    opening: h('div', { class: 'card card-pad' },
      h('div', { class: 'row spread', style: 'align-items:flex-start' }, h('div', {}, h('h3', { class: 'section-title', style: 'margin:0' }, 'Default opening'),
        h('p', { class: 'hint', style: 'margin:6px 0 0' }, 'The first two lines Upwork shows in the preview. Proposals of this type are written with the opening picked here.')),
        h('a', { href: '#/writing?tab=openings', class: 'btn sm' }, 'All opening templates')),
      h('div', { style: 'height:14px' }), pickGrid, preview),
    signals: isNew ? null : mappingCard(t, signals),
    samples: isNew ? null : samplesCard(t),
  };
  const tabsEl = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Proposal type' });
  const body = h('div', { class: 'stack', style: 'gap:16px' }, ...Object.values(panes).filter(Boolean), err);
  const head = h('div', {});
  const draw = () => {
    tabsEl.replaceChildren(...TABS.map((x) => h('button', { type: 'button', role: 'tab', class: 'tab' + (x.key === tab ? ' on' : ''), 'aria-selected': x.key === tab ? 'true' : 'false',
      onclick: () => { if (x.key === tab) return; tab = x.key; setHashParams({ tab: tab === 'format' ? '' : tab }); draw(); } }, x.label, x.n != null ? h('span', { class: 'n' }, String(x.n)) : null)));
    for (const [k, el] of Object.entries(panes)) if (el) el.hidden = k !== tab;
    // the type's own fields are saved with Save type; the signals and the samples have their own buttons
    const own = tab === 'format' || tab === 'opening';
    head.replaceChildren(pageHead(isNew ? 'New proposal type' : t.name, isNew ? 'Describe the format (with Chosen when and Length lines), pick its opening, then add its signals and samples.' : 'A proposal type: used by the app\'s writer and the Claude plugin.', own ? [del, saveBtn] : [del],
      { back: [t && !Number(t.active) ? '#/writing?tab=retired' : '#/writing?tab=types', 'Writing guide'], badges: isNew ? null : activeSwitch(t.active, { name: t.name, url: '/templates/' + t.id, no: 'Retired', offText: 'It is no longer suggested or offered. Proposals already written with it keep it.' }) }));
  };
  draw();
  shell('writing', [head, tabsEl, body], true);
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
        h('td', {}, activeSwitch(s.active, { name: s.title, url: '/template-samples/' + s.id, no: 'Off', can: canEditTemplates(), after: () => load(), offText: 'The writer no longer uses it as an example.' })), acts(h('button', { class: 'btn sm', type: 'button', onclick: () => dialog(s) }, 'Edit'))))))) : h('p', { class: 'faint small' }, 'No samples yet. Add proposals that worked: the AI uses up to 3 of them as a reference for tone and structure.'),
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
        h('td', {}, activeSwitch(s.active, { name: s.name, url: '/signals/' + s.id, no: 'Off', can: me.role === 'admin', offText: 'It is no longer read from jobs or used to choose a proposal type.' }))))) })]);
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
