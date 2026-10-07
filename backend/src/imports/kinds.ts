import { same, splitList, type Db, type Kind, type Planned } from './core';

const bad = (key: string, ...messages: string[]): Planned => ({ action: 'invalid', key, messages });
const urlOk = (s: string) => /^https?:\/\/\S+$/i.test(s);

// ---------- tag dictionary: categories and tags with their match weight ----------
const tagDictionary: Kind = {
  id: 'tag_dictionary', label: 'Tag dictionary', roles: ['admin'],
  description: 'Tag categories and tags (the "Tag Dictionary" sheet). A tag that already exists is never changed unless the batch allows changes.',
  columns: [
    { name: 'category', aliases: ['category'], required: true, note: 'Tag category, created if new' },
    { name: 'tag', aliases: ['tag', 'tag name'], required: true, note: 'Tag name' },
    { name: 'weight', aliases: ['match weight', 'weight'], required: true, note: 'Whole number 0 to 20' },
    { name: 'description', aliases: ['what it means', 'description', 'meaning'], note: 'Shown to the person and the model, up to 500 characters' },
  ],
  async plan(r, db, { allowChanges }) {
    const key = `${r.category ?? ''} / ${r.tag ?? ''}`;
    const errs: string[] = [];
    if (!r.category) errs.push('Category is missing'); else if (r.category.length > 120) errs.push('Category is over 120 characters');
    if (!r.tag) errs.push('Tag is missing'); else if (r.tag.length > 120) errs.push('Tag is over 120 characters');
    const w = Number(r.weight);
    if (!r.weight || !Number.isInteger(w) || w < 0 || w > 20) errs.push('Match weight must be a whole number from 0 to 20');
    if (r.description && r.description.length > 500) errs.push('Description is over 500 characters');
    if (errs.length) return bad(key, ...errs);
    const value = { category: r.category, tag: r.tag, weight: w, description: r.description || null };
    const other = await db.q('SELECT c.name AS category FROM tags t JOIN tag_categories c ON c.id=t.category_id WHERE LOWER(t.name)=LOWER(?) AND LOWER(c.name)<>LOWER(?) LIMIT 1', [r.tag, r.category]);
    if (other.length) return bad(key, `A tag called "${r.tag}" already exists in category "${other[0].category}". Tag names must be unique across categories`);
    const ex = (await db.q('SELECT t.id, t.weight, t.description FROM tags t JOIN tag_categories c ON c.id=t.category_id WHERE LOWER(c.name)=LOWER(?) AND LOWER(t.name)=LOWER(?)', [r.category, r.tag]))[0];
    if (!ex) return { action: 'create', key, messages: [], value };
    const diffs: string[] = [];
    if (ex.weight !== w) diffs.push(`weight ${ex.weight} to ${w}`);
    if (!same(ex.description, value.description)) diffs.push('description');
    if (!diffs.length) return { action: 'unchanged', key, messages: [], value };
    if (!allowChanges) return { action: 'blocked', key, messages: [`Already exists and differs (${diffs.join(', ')}). Not changed`], value };
    return { action: 'update', key, messages: [`Changes ${diffs.join(', ')}`], value, before: { id: ex.id, weight: ex.weight, description: ex.description } };
  },
  async apply(p, db) {
    const v = p.value;
    let cat = (await db.q('SELECT id FROM tag_categories WHERE LOWER(name)=LOWER(?)', [v.category]))[0];
    let createdCategory: number | null = null;
    if (!cat) {
      const next = (await db.q('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM tag_categories'))[0].n;
      const r = await db.run('INSERT INTO tag_categories (name, sort_order) VALUES (?,?)', [v.category, next]);
      cat = { id: r.insertId }; createdCategory = r.insertId;
    }
    if (p.action === 'update') {
      await db.run('UPDATE tags SET weight=?, description=? WHERE id=?', [v.weight, v.description, p.before.id]);
      return { updated: p.before };
    }
    const next = (await db.q('SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM tags WHERE category_id=?', [cat.id]))[0].n;
    const r = await db.run('INSERT INTO tags (category_id, name, weight, description, sort_order) VALUES (?,?,?,?,?)', [cat.id, v.tag, v.weight, v.description, next]);
    return { createdTag: r.insertId, createdCategory };
  },
  async undo(s, db) {
    if (s.updated) { await db.run('UPDATE tags SET weight=?, description=? WHERE id=?', [s.updated.weight, s.updated.description, s.updated.id]); return; }
    if (s.createdTag) {
      if ((await db.q('SELECT 1 FROM project_tags WHERE tag_id=? LIMIT 1', [s.createdTag])).length) throw new Error('A project now uses a tag this import added. Remove it from the project first');
      await db.run('DELETE FROM tags WHERE id=?', [s.createdTag]);
    }
    if (s.createdCategory && !(await db.q('SELECT 1 FROM tags WHERE category_id=? LIMIT 1', [s.createdCategory])).length) await db.run('DELETE FROM tag_categories WHERE id=?', [s.createdCategory]);
  },
};

// ---------- projects: name, link, tags ----------
const projects: Kind = {
  id: 'projects', label: 'Projects', roles: ['manager', 'admin'],
  description: 'Stackup projects with their tags (the "Project Tagging" sheet). Tags must already be in the dictionary. An existing project is never changed unless the batch allows changes; then the sheet\'s tag list replaces its tags.',
  columns: [
    { name: 'name', aliases: ['project name', 'project', 'name'], required: true, note: 'Project name' },
    { name: 'live_link', aliases: ['live link', 'link', 'url'], note: 'https link, optional' },
    { name: 'showable', aliases: ['showable publicly', 'showable'], note: 'e.g. Yes / No / Partly' },
    { name: 'tags', aliases: ['tag list', 'tags'], required: true, note: 'Tag NAMES separated by ; or | or new lines. Not the count in the sheet\'s "Tags" column. For the X-mark matrix, list the tags whose column is marked X' },
  ],
  async plan(r, db, { allowChanges }) {
    const key = r.name ?? '';
    const errs: string[] = [];
    if (!r.name) errs.push('Project name is missing'); else if (r.name.length > 190) errs.push('Project name is over 190 characters');
    if (r.live_link && (!urlOk(r.live_link) || r.live_link.length > 500)) errs.push('Live link must be a full https link');
    if (r.showable && r.showable.length > 60) errs.push('Showable is over 60 characters');
    if (!r.tags) errs.push('Tags are missing');
    else if (/^\d+$/.test(r.tags)) errs.push(`"Tags" is ${r.tags}, which looks like the count from the sheet. Give the tag names`);
    const names = r.tags && !/^\d+$/.test(r.tags) ? [...new Set(splitList(r.tags))] : [];
    const ids: number[] = []; const unknown: string[] = [];
    for (const n of names) {
      const t = await db.q('SELECT id FROM tags WHERE LOWER(name)=LOWER(?)', [n]);
      if (t.length === 1) ids.push(t[0].id); else if (!t.length) unknown.push(n); else errs.push(`Tag "${n}" is ambiguous (in several categories)`);
    }
    if (unknown.length) errs.push(`Not in the tag dictionary: ${unknown.join(', ')}`);
    if (errs.length) return bad(key, ...errs);
    const value = { name: r.name, live_link: r.live_link || null, showable: r.showable || null, tag_ids: ids.sort((a, b) => a - b) };
    const ex = (await db.q('SELECT id, live_link, showable_publicly FROM projects WHERE LOWER(name)=LOWER(?)', [r.name]))[0];
    if (!ex) return { action: 'create', key, messages: [], value };
    const cur = (await db.q('SELECT tag_id FROM project_tags WHERE project_id=? ORDER BY tag_id', [ex.id])).map((x) => x.tag_id as number);
    const diffs: string[] = [];
    if (!same(ex.live_link, value.live_link)) diffs.push('link');
    if (!same(ex.showable_publicly, value.showable)) diffs.push('showable');
    const add = value.tag_ids.filter((x) => !cur.includes(x)).length, drop = cur.filter((x) => !value.tag_ids.includes(x)).length;
    if (add || drop) diffs.push(`tags (+${add}, -${drop})`);
    if (!diffs.length) return { action: 'unchanged', key, messages: [], value };
    if (!allowChanges) return { action: 'blocked', key, messages: [`Already exists and differs (${diffs.join(', ')}). Not changed`], value };
    return { action: 'update', key, messages: [`Changes ${diffs.join(', ')}`], value, before: { id: ex.id, live_link: ex.live_link, showable: ex.showable_publicly, tag_ids: cur } };
  },
  async apply(p, db) {
    const v = p.value;
    let id: number;
    if (p.action === 'create') id = (await db.run('INSERT INTO projects (name, live_link, showable_publicly) VALUES (?,?,?)', [v.name, v.live_link, v.showable])).insertId;
    else { id = p.before.id; await db.run('UPDATE projects SET live_link=?, showable_publicly=? WHERE id=?', [v.live_link, v.showable, id]); await db.run('DELETE FROM project_tags WHERE project_id=?', [id]); }
    for (const t of v.tag_ids) await db.run('INSERT INTO project_tags (project_id, tag_id) VALUES (?,?)', [id, t]);
    return p.action === 'create' ? { createdProject: id } : { updated: p.before };
  },
  async undo(s, db) {
    if (s.createdProject) { await db.run('DELETE FROM projects WHERE id=?', [s.createdProject]); return; } // its tag links go with it
    const b = s.updated;
    await db.run('UPDATE projects SET live_link=?, showable_publicly=? WHERE id=?', [b.live_link, b.showable, b.id]);
    await db.run('DELETE FROM project_tags WHERE project_id=?', [b.id]);
    for (const t of b.tag_ids) await db.run('INSERT INTO project_tags (project_id, tag_id) VALUES (?,?)', [b.id, t]);
  },
};

// ---------- rules: FAIL and FLAG codes ----------
const rules: Kind = {
  id: 'rules', label: 'Rule codes', roles: ['admin'],
  description: 'FAIL and FLAG rule codes (the "Rule Codes" sheet). Only adds new codes. A code that exists with other wording is never changed here (reword it on the Rules page), and codes are never reused.',
  columns: [
    { name: 'code', aliases: ['code', 'rule code'], required: true, note: 'F1 to F99 for FAIL, G1 to G99 for FLAG' },
    { name: 'type', aliases: ['type'], required: true, note: 'fail or flag, matching the letter of the code' },
    { name: 'rule', aliases: ['rule', 'wording', 'description'], required: true, note: '5 to 300 characters' },
  ],
  async plan(r, db) {
    const key = (r.code ?? '').toUpperCase();
    const errs: string[] = [];
    if (!/^[FG]\d{1,3}$/.test(key)) errs.push('Code must be F or G and a number, like F6 or G18');
    const type = (r.type ?? '').toLowerCase();
    if (type !== 'fail' && type !== 'flag') errs.push('Type must be fail or flag');
    else if (/^[FG]/.test(key) && (key[0] === 'F') !== (type === 'fail')) errs.push('F codes are fail rules and G codes are flag rules');
    if (!r.rule || r.rule.length < 5 || r.rule.length > 300) errs.push('Rule must be 5 to 300 characters');
    if (errs.length) return bad(key || '?', ...errs);
    const value = { code: key, type, rule: r.rule };
    const ex = (await db.q('SELECT type, rule, active FROM rules WHERE code=?', [key]))[0];
    if (!ex) return { action: 'create', key, messages: ['Also add this code to the gate prompt, or the model will not apply it'], value };
    if (ex.type === type && ex.rule === r.rule) return { action: 'unchanged', key, messages: [], value };
    return { action: 'blocked', key, messages: ['This code already exists with other wording. Reword it on the Rules page; a new meaning needs a new code'], value };
  },
  async apply(p, db) { await db.run('INSERT INTO rules (code, type, rule, active) VALUES (?,?,?,1)', [p.value.code, p.value.type, p.value.rule]); return { createdRule: p.value.code }; },
  async undo(s, db) { await db.run('DELETE FROM rules WHERE code=?', [s.createdRule]); },
};

// ---------- Upwork profiles ----------
const profiles: Kind = {
  id: 'profiles', label: 'Upwork profiles', roles: ['admin'],
  description: 'The Upwork profiles proposals are sent from (name, tagline, price, GitLab account). An existing profile is never changed unless the batch allows changes.',
  columns: [
    { name: 'name', aliases: ['profile', 'profile name', 'name'], required: true, note: 'Profile name' },
    { name: 'tagline', aliases: ['tagline', 'title'], note: 'Up to 200 characters' },
    { name: 'price', aliases: ['price', 'rate', 'hourly rate'], note: 'Number, e.g. 35 or 35.50' },
    { name: 'gitlab_account', aliases: ['gitlab', 'gitlab account', 'gitlab link'], note: 'Signed under every proposal' },
    { name: 'profile_url', aliases: ['profile url', 'url', 'link'], note: 'https link' },
    { name: 'notes', aliases: ['notes', 'remarks'], note: 'Up to 500 characters' },
  ],
  async plan(r, db, { allowChanges }) {
    const key = r.name ?? '';
    const errs: string[] = [];
    if (!r.name) errs.push('Profile name is missing'); else if (r.name.length > 120) errs.push('Name is over 120 characters');
    if (r.tagline && r.tagline.length > 200) errs.push('Tagline is over 200 characters');
    const price = r.price ? Number(r.price.replace(/^\$/, '')) : null;
    if (r.price && (!Number.isFinite(price) || price! < 0 || price! > 100000)) errs.push('Price must be a number');
    if (r.gitlab_account && r.gitlab_account.length > 255) errs.push('GitLab account is over 255 characters');
    if (r.profile_url && (!urlOk(r.profile_url) || r.profile_url.length > 300)) errs.push('Profile URL must be a full https link');
    if (r.notes && r.notes.length > 500) errs.push('Notes are over 500 characters');
    if (errs.length) return bad(key, ...errs);
    const value = { name: r.name, tagline: r.tagline || null, price, gitlab_account: r.gitlab_account || null, profile_url: r.profile_url || null, notes: r.notes || null };
    const ex = (await db.q('SELECT id, tagline, price, gitlab_account, profile_url, notes FROM upwork_profiles WHERE LOWER(name)=LOWER(?)', [r.name]))[0];
    if (!ex) return { action: 'create', key, messages: [], value };
    const diffs = (['tagline', 'gitlab_account', 'profile_url', 'notes'] as const).filter((k) => !same(ex[k], value[k]));
    if ((ex.price === null ? null : Number(ex.price)) !== value.price) diffs.push('price' as any);
    if (!diffs.length) return { action: 'unchanged', key, messages: [], value };
    if (!allowChanges) return { action: 'blocked', key, messages: [`Already exists and differs (${diffs.join(', ')}). Not changed`], value };
    return { action: 'update', key, messages: [`Changes ${diffs.join(', ')}`], value, before: { id: ex.id, tagline: ex.tagline, price: ex.price, gitlab_account: ex.gitlab_account, profile_url: ex.profile_url, notes: ex.notes } };
  },
  async apply(p, db) {
    const v = p.value;
    if (p.action === 'create') return { createdProfile: (await db.run('INSERT INTO upwork_profiles (name, tagline, price, gitlab_account, profile_url, notes) VALUES (?,?,?,?,?,?)', [v.name, v.tagline, v.price, v.gitlab_account, v.profile_url, v.notes])).insertId };
    await db.run('UPDATE upwork_profiles SET tagline=?, price=?, gitlab_account=?, profile_url=?, notes=? WHERE id=?', [v.tagline, v.price, v.gitlab_account, v.profile_url, v.notes, p.before.id]);
    return { updated: p.before };
  },
  async undo(s, db) {
    if (s.createdProfile) {
      if ((await db.q('SELECT 1 FROM screenings WHERE upwork_profile_id=? OR proposal_profile_id=? LIMIT 1', [s.createdProfile, s.createdProfile])).length) throw new Error('A job now uses a profile this import added');
      await db.run('DELETE FROM upwork_profiles WHERE id=?', [s.createdProfile]); return;
    }
    const b = s.updated;
    await db.run('UPDATE upwork_profiles SET tagline=?, price=?, gitlab_account=?, profile_url=?, notes=? WHERE id=?', [b.tagline, b.price, b.gitlab_account, b.profile_url, b.notes, b.id]);
  },
};

export const KINDS: Record<string, Kind> = { tag_dictionary: tagDictionary, projects, rules, profiles };
/** The order a full set of sheets should go in: later kinds need the earlier ones. */
export const KIND_ORDER = ['rules', 'tag_dictionary', 'projects', 'profiles'];
