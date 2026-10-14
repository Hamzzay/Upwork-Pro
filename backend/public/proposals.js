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
    isDirty: dirty, markClean: () => { clean = area.innerHTML; notify(); },
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
  let templates = [];
  // the stepper asks these before it leaves the step or finishes it
  box.__dirty = () => !!(editor && (editor.isDirty() || answersDirty()));
  box.__finish = async () => {
    if (!data || data.status !== 'done' || !data.current) throw new Error('The proposal is not ready yet');
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
      // the independent review arrived (or started): fetch it and redraw only its panel
      if ((st.review_status || null) !== ((data.review && data.review.status) || null) || (st.review_version || null) !== ((data.review && data.review.version) || null)) {
        data.review = (await api('GET', `/screenings/${s.id}/proposal`)).proposal.review; drawReview();
      }
    } catch (e) { /* try again next time */ }
    if (busy() || chatBusy() || reviewBusy() || partsBusy() || gapsBusy()) timer = setTimeout(poll, 1000);
  }
  const startPolling = () => { clearTimeout(timer); timer = setTimeout(poll, 1000); };

  // ----- pieces
  // ----- experience gaps (R67): what the client asks for that our facts do not show. Yes (with the project and how it was used)
  // or No; a Yes updates only those lines of the proposal, and teaches the library (a new tag is made switched off)
  const gapsEl = h('div', {});
  const LIB = { added: 'added to the project in the library, switched off until an admin switches it on', waiting: 'the note is on the project; the tag waits for an admin', note: 'the note is on the project', to_add: 'waits for an admin to add it to the library', none: 'said as your own experience' };
  function drawGaps() {
    drawChecks(); drawSideTabs();
    const g = data && data.gaps; if (!g || !g.items || !g.items.length) { gapsEl.replaceChildren(); return; }
    if (g.status === 'queued' || g.status === 'running') {
      gapsEl.replaceChildren(h('div', { class: 'row muted small' }, h('span', { class: 'spin' }), 'Updating the proposal with your experience. Only those lines change.')); return; }
    const open = g.items.filter((x) => x.status === 'open'), done = g.items.filter((x) => x.status !== 'open');
    const state = new Map(); // id -> { has, project_id, note, tag_name, category }
    const row = (x) => {
      const st = { has: null, project_id: null, note: '', tag_name: x.skill, category: x.category || '' }; state.set(x.id, st);
      const more = h('div', { class: 'stack', style: 'gap:8px;margin-top:8px', hidden: true });
      const projSel = h('select', { 'aria-label': 'Project where it was done' }, h('option', { value: '' }, 'No project: my own experience'), ...g.projects.map((p) => h('option', { value: p.id }, p.name + (Number(p.in_proposal) ? ' (in this proposal)' : ''))));
      const noteLbl = h('label', { class: 'lbl' }, 'A few words on your experience');
      const note = h('textarea', { rows: 2, maxlength: 600, placeholder: 'For example: built the support bot on Grok, with function calls into the booking system.' });
      const tagIn = h('input', { type: 'text', value: x.skill, maxlength: 120, 'aria-label': 'Tag name' });
      const catSel = h('select', { 'aria-label': 'Tag category' }, ...g.categories.map((c) => h('option', { value: c, selected: c === x.category }, c)));
      const tagRow = h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap', hidden: true }, h('span', { class: 'jp-label' }, 'Tag'), tagIn, h('span', { class: 'jp-label' }, 'in'), catSel,
        h('span', { class: 'faint small' }, 'Made switched off: it does not count in matching until an admin switches it on.'));
      projSel.onchange = () => { st.project_id = projSel.value ? Number(projSel.value) : null; tagRow.hidden = !st.project_id; noteLbl.textContent = st.project_id ? 'How it was used in this project' : 'A few words on your experience'; };
      note.oninput = () => { st.note = note.value; }; tagIn.oninput = () => { st.tag_name = tagIn.value; }; catSel.onchange = () => { st.category = catSel.value; };
      more.append(h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Where'), projSel), h('div', { class: 'field' }, noteLbl, note), tagRow);
      const yes = h('button', { type: 'button', class: 'tagbtn', 'aria-pressed': 'false' }, 'Yes'), no = h('button', { type: 'button', class: 'tagbtn', 'aria-pressed': 'false' }, 'No');
      const pick = (v) => { st.has = st.has === v ? null : v; yes.classList.toggle('on', st.has === true); no.classList.toggle('on', st.has === false); yes.setAttribute('aria-pressed', String(st.has === true)); no.setAttribute('aria-pressed', String(st.has === false)); more.hidden = st.has !== true; };
      yes.onclick = () => pick(true); no.onclick = () => pick(false);
      return h('div', { class: 'qa' }, h('div', { class: 'row spread', style: 'flex-wrap:nowrap;align-items:flex-start;gap:10px' },
        h('div', {}, h('strong', {}, x.skill), h('div', { class: 'jp-label' }, x.ask), x.quote ? h('div', { class: 'faint small' }, 'The client: “' + x.quote + '”') : null),
        owner ? h('div', { class: 'row', style: 'gap:6px;flex-wrap:nowrap' }, yes, no) : null), more);
    };
    const err = h('div', { class: 'err', hidden: true });
    const send = h('button', { class: 'btn primary', type: 'button' }, 'Update the proposal');
    send.onclick = async () => {
      const answers = [...state.entries()].filter(([, v]) => v.has !== null).map(([id, v]) => ({ id, has: v.has, project_id: v.has ? v.project_id : null, note: v.has ? v.note.trim() || undefined : undefined, tag_name: v.has ? v.tag_name.trim() || undefined : undefined, category: v.has ? v.category || undefined : undefined }));
      if (!answers.length) { err.replaceChildren(icon('x'), 'Answer Yes or No first.'); err.hidden = false; return; }
      if (editor && (editor.isDirty() || answersDirty()) && !(await ask('Update the proposal?', 'You have unsaved changes. The update starts from the last saved version, so save yours first to keep them.', 'Update anyway'))) return;
      btnBusy(send, 'Saving');
      try { const r = await api('POST', `/proposals/${data.id}/gaps`, { answers }); if (r.updated) { data.gaps.status = 'queued'; drawGaps(); startPolling(); } else { const fresh = (await api('GET', `/screenings/${s.id}/proposal`)).proposal; data.gaps = fresh.gaps; drawGaps(); toast('Saved. Nothing to add to the proposal.'); } }
      catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; send.disabled = false; send.replaceChildren('Update the proposal'); }
    };
    gapsEl.replaceChildren(h('div', {},
      open.length ? [h('p', { class: 'jp-label', style: 'margin:0 0 10px' }, 'The client asks for these and we have no record of them, so they were left out. Have you done them? A Yes puts them in, explained, and teaches the library.'),
        h('div', { class: 'stack', style: 'gap:10px' }, open.map(row)), err, owner ? h('div', { class: 'row', style: 'margin-top:12px' }, send) : null] : null,
      done.length ? h('details', { class: 'reviewfold', style: open.length ? 'margin-top:12px' : '' }, h('summary', {}, `Answered (${done.length})`),
        h('ul', { class: 'jp-list', style: 'margin:6px 0 0' }, done.map((x) => h('li', {}, h('strong', {}, x.skill), x.status === 'no' ? ': No, left out.' : `: Yes${x.project_name ? ', ' + x.project_name : ''}${x.applied_version ? ', in version ' + x.applied_version : ''}. ${LIB[x.library] || ''}`)))) : null,
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
  const SIDE = [['chat', 'Chat'], ['review', 'Review'], ['gaps', 'Experience'], ['feedback', 'Feedback']];
  let sideTab = 'chat', gapsShown = false;
  try { sideTab = localStorage.getItem('prop.side') || 'chat'; } catch { /* storage blocked */ }
  const hasGaps = () => !!(data && data.gaps && data.gaps.items && data.gaps.items.length);
  const openGaps = () => (hasGaps() ? data.gaps.items.filter((x) => x.status === 'open').length : 0);
  function showSide(k) { sideTab = k; try { localStorage.setItem('prop.side', k); } catch { /* storage blocked */ } drawSideTabs(); }
  function drawSideTabs() {
    const bar = box.querySelector('.sidetabs'); if (!bar) return;
    if (!SIDE.some(([k]) => k === sideTab) || (sideTab === 'gaps' && !hasGaps())) sideTab = 'chat';
    const rv = data.review, n = openGaps();
    const badge = {
      chat: chatBusy() ? h('span', { class: 'spin' }) : null,
      review: reviewBusy() ? h('span', { class: 'spin' }) : rv && rv.score ? h('span', { class: 'n ' + (rv.score >= 8 ? 'PASS' : rv.score >= 5 ? 'FLAG' : 'FAIL') }, String(rv.score)) : null,
      gaps: gapsBusy() ? h('span', { class: 'spin' }) : n ? h('span', { class: 'n FLAG' }, String(n)) : null,
    };
    bar.replaceChildren(...SIDE.filter(([k]) => k !== 'gaps' || hasGaps()).map(([k, label]) => h('button', { type: 'button', role: 'tab', class: 'tab' + (k === sideTab ? ' on' : ''), 'aria-selected': k === sideTab, onclick: () => showSide(k) }, label, badge[k] || null)));
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

  const bannerEl = h('div', { class: 'newer', hidden: true });
  // the parts: "updating" while they are redone, and the parts offered when the person's own text was not changed for them
  const partsEl = h('div', {});
  function drawParts() {
    const pt = data && data.parts; if (!pt) { partsEl.replaceChildren(); return; }
    if (pt.status === 'queued' || pt.status === 'running') {
      partsEl.replaceChildren(h('div', { class: 'row muted small', style: 'margin:8px 0' }, h('span', { class: 'spin' }), 'Updating the projects, the video and the sign off. Only those parts change.')); return; }
    const offer = pt.offer || [];
    if (!offer.length) { partsEl.replaceChildren(pt.status === 'error' ? h('p', { class: 'err' }, icon('x'), 'The parts could not be updated' + (pt.error ? ': ' + pt.error : '.')) : ''); return; }
    const put = (o) => { const para = o.text.split(/\n{2,}/).map((x) => '<p>' + x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>') + '</p>').join('');
      editor.appendHtml(para); toast('Put in at the end. Move it where it belongs, then save.'); };
    partsEl.replaceChildren(h('div', { class: 'card card-pad', style: 'margin:12px 0' },
      h('div', { class: 'row spread' }, h('div', { class: 'jp-sec' }, 'New parts for your edited text'),
        owner ? h('button', { class: 'btn sm', type: 'button', onclick: async () => { try { await api('POST', `/proposals/${data.id}/parts-offer/dismiss`, {}); data.parts.offer = []; drawParts(); } catch (x) { toast(x.message, true); } } }, 'Dismiss') : null),
      h('p', { class: 'jp-label', style: 'margin:2px 0 10px' }, 'You edited this proposal, so these were not put in for you. Put one in, or copy it.'),
      h('div', { class: 'stack', style: 'gap:10px' }, offer.map((o) => h('div', { class: 'qa' },
        h('div', { class: 'row spread', style: 'flex-wrap:nowrap;gap:10px' }, h('div', { class: 'jp-label' }, o.label),
          h('div', { class: 'row', style: 'gap:6px' }, owner ? h('button', { class: 'btn sm', type: 'button', onclick: () => put(o) }, 'Put it in') : null,
            h('button', { class: 'btn sm', type: 'button', onclick: async () => { const ok = await copyText(o.text); toast(ok ? 'Copied' : 'Could not copy. Select the text and copy it.', !ok); } }, 'Copy'))),
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
    setActions(stale && owner ? startBtn('Write it again', null, false) : null, copy, save, change, markSent);
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
        !choices.ready ? h('div', { class: 'row muted small' }, h('span', { class: 'spin' }), 'Reading the signals...') : null,
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

  function drawProgress() {
    const el = box.querySelector('.propprogress');
    if (el) el.querySelector('strong').textContent = data.status === 'queued' ? 'Waiting for a free slot' : (STAGE_TEXT[data.stage] || 'Working');
  }

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
      el.replaceChildren(h('div', { class: 'row muted small' }, h('span', { class: 'spin' }), 'An independent reviewer is reading the proposal. This takes about a minute.')); return; }
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
      rv.status === 'error' ? h('p', { class: 'err' }, icon('x'), 'The newest review could not be made' + (rv.error ? ': ' + rv.error : '.')) : null,
    ].filter(Boolean));
  }
  const ask2 = (title, text, confirm) => (typeof ask === 'function' ? ask(title, text, confirm) : Promise.resolve(true));

  function drawChat() {
    if (chatLoader) chatLoader.hidden = !chatBusy();
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
    chatLoader = h('div', { class: 'busycover', hidden: !chatBusy(), role: 'status', 'aria-live': 'polite' }, h('div', { class: 'ring' }), h('strong', {}, 'The AI is working on your request'),
      h('div', { class: 'jp-label' }, 'If it rewrites the proposal, the new version loads here by itself.'));
    // the screening answers, apart from the letter: each its own box, Copy and edit; saved with Save version, never through the letter
    const drawAnswers = (answers, editable) => {
      shownAnswers = answers || []; answerBoxes = [];
      answersBox.replaceChildren(...(shownAnswers.length ? [h('div', { class: 'card card-pad', style: 'margin-top:14px' },
        h('div', { class: 'jp-sec' }, `Screening answers (${shownAnswers.length})`),
        h('div', { class: 'jp-label', style: 'margin-bottom:8px' }, editable ? 'Paste each into its own box on Upwork. They are kept apart from the proposal: edit them here and save with Save version.' : 'Paste each into its own box on Upwork. They are kept apart from the proposal.'),
        h('div', { class: 'stack', style: 'gap:10px' }, shownAnswers.map((x, i) => {
          const box = h('textarea', { class: 'qa-answer', rows: Math.min(12, Math.max(3, Math.ceil(x.answer.length / 90) + 1)), readOnly: !editable, 'aria-label': `Answer ${i + 1}` });
          box.value = x.answer; answerBoxes.push(box);
          box.addEventListener('input', () => { answersChip.hidden = !answersDirty(); drawActions(); });
          return h('div', { class: 'qa' },
            h('div', { class: 'row spread', style: 'flex-wrap:nowrap;align-items:flex-start;gap:10px' }, h('label', { class: 'jp-label' }, `${i + 1}. ${x.question}`),
              h('button', { class: 'btn sm', type: 'button', onclick: async () => { const ok = await copyText(box.value.trim()); toast(ok ? `Answer ${i + 1} copied` : 'Could not copy. Select the text and copy it.', !ok); } }, 'Copy')),
            box);
        })), answersChip)] : []));
      answersChip.hidden = true;
    };
    editor = richEditor(cur.html, { label: 'Proposal text', readOnly: !owner, onChange: (d) => { if (d !== wasDirty) { wasDirty = d; drawActions(); } dirtyChip.hidden = !d; count(); } });
    let wasDirty = false;
    const dirtyChip = h('span', { class: 'chip', hidden: true }, 'Unsaved changes');
    const vsel = h('select', { id: 'ver-sel', 'aria-label': 'Version' }, data.versions.map((v) => h('option', { value: v.version_no, selected: v.version_no === cur.version_no }, `v${v.version_no} · ${SOURCE_TEXT[v.source] || v.source} · ${ago(v.created_at)}`)));
    const viewing = h('div', { class: 'small muted' });
    vsel.onchange = async () => {
      const no = Number(vsel.value);
      if (no === cur.version_no) { editor.setHtml(cur.html); viewing.textContent = ''; drawAnswers(cur.answers, owner); drawActions(); return; }
      if ((editor.isDirty() || answersDirty()) && !(await ask('Show the other version?', 'You have unsaved changes. They are lost when the other version is shown.', 'Show it', true))) { vsel.value = cur.version_no; return; }
      const v = (await api('GET', `/proposals/${data.id}/versions/${no}`)).version; editor.setHtml(v.content_html); drawAnswers(v.answers, false); drawActions();
      viewing.replaceChildren(...[`Showing version ${no}. `, owner ? h('a', { onclick: async () => { try { await api('POST', `/proposals/${data.id}/restore`, { version_no: no }); toast(`Restored as a new version`); await reload(); newer = null; drawAll(); } catch (x) { toast(x.message, true); } } }, 'Restore it as the newest version') : null].filter(Boolean));
    };
    const stale = matching && matching.proposal_profile && data.profile_id && data.profile_id !== matching.proposal_profile.id && !partsBusy();
    const staleBox = stale ? h('div', { class: 'newer', style: 'margin-bottom:12px' }, icon('info'), h('span', {}, `The sending profile was changed to ${matching.proposal_profile.name}. ${cur.in_parts ? 'The sign off is being updated; the letter stays.' : 'Your edited text was kept: the new sign off is offered below.'} To write the letter again in this profile's voice, use Write again at the top right.`)) : null;
    // the Loom video can be changed after writing: only its line changes, no new write
    const loomSel = owner ? h('select', { 'aria-label': 'Loom video', style: 'max-width:280px' }, h('option', { value: '' }, 'Loading videos')) : null;
    if (loomSel) api('GET', `/screenings/${s.id}/proposal/types`).then((r) => {
      const vids = (r.loom && r.loom.videos) || [];
      if (!vids.length) { loomSel.replaceWith(h('span', { class: 'faint small' }, 'No Loom videos on this profile')); return; }
      loomSel.replaceChildren(h('option', { value: '' }, 'No Loom video'), ...vids.map((v) => h('option', { value: v.id, selected: r.loom.chosen === v.id }, v.title + (v.best ? ' (best fit)' : ''))));
      loomSel.onchange = async () => { try { await api('PUT', `/screenings/${s.id}/loom`, { loom_video_id: loomSel.value ? Number(loomSel.value) : null }); s.loom_video_id = loomSel.value ? Number(loomSel.value) : null; data.parts = { ...(data.parts || {}), status: 'queued', offer: [] }; drawParts(); startPolling(); } catch (x) { toast(x.message, true); } };
    }).catch(() => loomSel.replaceWith(h('span', { class: 'faint small' }, '')));
    // open questions about our experience: their tab is shown first, once
    if (!gapsShown && owner && openGaps()) { sideTab = 'gaps'; gapsShown = true; }
    count(); drawAnswers(cur.answers, owner); drawParts();
    // the editor on the left; the chat and "how it was written" beside it on a wide screen, below it on a narrow one
    // the proposal on the left; beside it (below it on a narrow screen) one card with a tab per tool
    const grid = h('div', { class: 'propgrid' },
      h('div', { class: 'propmain' },
        staleBox,
        checksEl,
        h('div', { class: 'row', style: 'margin:0 0 8px;gap:8px;flex-wrap:wrap' }, vsel, dirtyChip, loomSel ? h('label', { class: 'row small', style: 'gap:6px;margin-left:auto' }, h('span', { class: 'muted' }, 'Loom video'), loomSel) : null),
        partsEl,
        viewing, bannerEl, h('div', { class: 'busywrap' }, editor.el, chatLoader),
        h('div', { class: 'row spread', style: 'margin-top:6px' }, counter, h('button', { type: 'button', class: 'linkbtn small', onclick: explain }, 'How this was written')),
        answersBox),
      h('div', { class: 'propside' }, h('div', { class: 'card sidecard' }, h('div', { class: 'tabs sidetabs', role: 'tablist', 'aria-label': 'Proposal tools' }),
        h('div', { class: 'sidebody' }, h('div', { class: 'chatpanel side-chat' }), h('div', { class: 'reviewpanel side-review' }), h('div', { class: 'side-gaps' }, gapsEl), h('div', { class: 'feedbackpanel side-feedback' })))));
    return grid;
  }

  function drawAll() {
    let body;
    if (!data) {
      body = typeChooser();
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
    if (data && data.current && !busy()) { drawReview(); drawChat(); drawBanner(); drawFeedback(); drawGaps(); }
  }
  box.replaceChildren(h('div', { class: 'skel', style: 'width:60%;margin-bottom:12px' }), h('div', { class: 'skel', style: 'width:80%' }));
  reload().then(() => { drawAll(); if (busy() || chatBusy() || reviewBusy() || partsBusy() || gapsBusy()) startPolling(); }).catch((e) => { box.replaceChildren(h('div', { class: 'card-pad' }, emptyState('x', 'Could not load the proposal', e.message, null))); });
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
    prompt: h('textarea', { id: 'tpr', style: 'min-height:140px', maxlength: 20000, placeholder: 'Extra instructions for the AI when it writes with this type. Optional.' }),
    opening: h('textarea', { id: 'top', style: 'min-height:140px', maxlength: 4000, placeholder: '1. Line one names the pain...\n2. Line two shows what causes it...' }),
    starts: h('input', { type: 'text', id: 'tos', maxlength: 200, value: t && t.opening_starts ? t.opening_starts : '', placeholder: 'For example: Understood.' }),
    noUs: h('input', { type: 'checkbox', id: 'tnu', checked: t ? !!Number(t.opening_no_us ?? 1) : true }) };
  f.desc.value = t && t.description ? t.description : ''; f.prompt.value = t && t.prompt ? t.prompt : ''; f.opening.value = t && t.opening_rules ? t.opening_rules : '';
  const fmt = richEditor(t ? t.body_html : '<p></p>', { label: 'Proposal type format' });
  const err = h('div', { class: 'err', hidden: true });
  const saveBtn = h('button', { class: 'btn primary', type: 'button' }, isNew ? 'Create type' : 'Save type');
  saveBtn.onclick = async () => {
    err.hidden = true; btnBusy(saveBtn, 'Saving');
    const body = { name: f.name.value, description: f.desc.value.trim() || null, body_html: fmt.getHtml(), prompt: f.prompt.value.trim() || null, priority: Number(f.priority.value), active: f.active.checked, is_default: f.isDefault.checked,
      opening_rules: f.opening.value.trim() || null, opening_starts: f.starts.value.trim() || null, opening_no_us: f.noUs.checked };
    try { const r = await api(isNew ? 'POST' : 'PATCH', isNew ? '/templates' : '/templates/' + t.id, body); toast(isNew ? 'Proposal type created' : 'Proposal type saved'); if (isNew) location.hash = '#/t/' + r.id; else route(); }
    catch (x) { err.replaceChildren(icon('x'), x.message); err.hidden = false; saveBtn.disabled = false; saveBtn.replaceChildren(isNew ? 'Create type' : 'Save type'); }
  };
  const del = !isNew ? h('button', { class: 'btn danger', type: 'button', onclick: () => modal({ title: 'Delete ' + t.name + '?', confirm: 'Delete proposal type', danger: true,
    body: h('p', { class: 'muted' }, 'This removes the proposal type, its signal mapping and its samples. Proposals already written keep its name. To stop using it but keep it, untick Active instead. It cannot be undone.'),
    onConfirm: async () => { await api('DELETE', '/templates/' + t.id); toast('Proposal type deleted'); location.hash = '#/writing'; } }) }, 'Delete') : null;

  const parts = [
    pageHead(isNew ? 'New proposal type' : t.name, isNew ? 'Describe the format (with Chosen when and Length lines), then add its signals and samples.' : 'A proposal type: used by the app\'s writer and the Claude plugin.', [del, saveBtn],
      { back: ['#/writing', 'Writing guide'], badges: isNew ? null : activeSwitch(t.active, { name: t.name, url: '/templates/' + t.id, no: 'Retired', offText: 'It is no longer suggested or offered. Proposals already written with it keep it.' }) }),
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'Details'),
      h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tn' }, 'Name'), f.name),
        h('div', { class: 'field' }, h('label', { class: 'lbl', for: 'tp' }, 'Priority'), f.priority, h('div', { class: 'hint' }, 'Tens set the priority group (10 first, then 20, 30, 40); within a group, more supporting signals win, then the lower number.'))),
      h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'td' }, 'Description'), f.desc),
      h('div', { class: 'field row', style: 'margin-top:12px' }, f.active, h('label', { for: 'ta', style: 'font-weight:600' }, 'Active (can be chosen for proposals)')),
      h('div', { class: 'field row', style: 'margin-top:8px' }, f.isDefault, h('label', { for: 'tdf', style: 'font-weight:600' }, 'Default type (used when no type qualifies)'))),
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'Format'), h('p', { class: 'hint', style: 'margin:0 0 10px' }, 'The structure and rules the proposal must follow. The AI reads this as written.'), fmt.el),
    h('div', { class: 'card card-pad' }, h('h3', { class: 'section-title' }, 'First two lines'),
      h('p', { class: 'hint', style: 'margin:0 0 10px' }, 'Upwork shows these two lines before the client opens the proposal, so the AI follows these rules strictly.'),
      f.opening,
      h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'lbl', for: 'tos' }, 'First word or words (optional)'), f.starts,
        h('div', { class: 'hint' }, 'The proposal must begin with this, for example Understood. For a choice, put | between them: For your platform,|For you,. If the client asks for their own opening, theirs is used.')),
      h('div', { class: 'field', style: 'margin-top:16px' }, h('div', { class: 'row', style: 'gap:8px' }, f.noUs, h('label', { for: 'tnu', style: 'font-weight:600' }, 'Check that the first two lines do not talk about us')),
        h('div', { class: 'hint' }, 'After writing, the app looks for I, we, our and my in the first two lines. If it finds them, the AI rewrites those lines once; if they still talk about us, you see a warning. Untick it for types that open with our approach, such as Invite and Approach first.'))),
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
