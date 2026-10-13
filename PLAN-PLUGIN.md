# Plan: the Claude plugin saves every step, and admins run the setup from Claude

Written 14 October 2026 for the next Claude (or person) who builds it. Read `TASKS.md` first (house rules, how to pick up, how to
test), then this file. Hamza asked for both parts on 14 October. Build Part A first; it is smaller and the team feels it every day.

Branch `hamza`. Each finished phase: tests, a check in the browser and in Claude, an entry in `NEW-UPDATES.md`, the row in `TASKS.md`,
commit, push. Plain English everywhere in the app and the skills: sentence case, no dashes, no emojis.

---

## What exists today (so you do not rebuild it)

- **MCP tools** (`mcp/src/tools.ts`, server side in `backend/src/routes_plugin.ts`): `plugin_options`, `find_jobs`, `get_job`,
  `save_job`, `record_decision`, `save_proposal`, `update_status`, `get_library` (with `case_studies`), `get_writing_guide`,
  `add_profile` and `add_project` (both only fill empty fields, never overwrite), the import tools, `analyze_jobs`, `get_trends`.
- **The plugin's flow** (`plugin/skills/proposal/SKILL.md`): ten steps. It saves only twice: `save_job` at step 4 (after the gate and
  the decision) and `save_proposal` at step 10. Everything between (signals, profile, projects, type, Loom video, drafts) lives only in
  the Claude chat. If the person stops at step 7, Upwork Pro shows the job as decided with nothing after it.
- **Stages** come from the job's fields (`stageSql` in `backend/src/routes.ts`): decision, `selection_confirmed_at` (projects),
  `proposal_profile_id` and `proposal_profile_confirmed_at` (profile), proposal row and versions, `finalized_at`, `proposal_sent_at`.
  If the plugin fills the same fields, the app shows the right step with no extra work.
- **Change log** (R49): `backend/src/changes.ts` takes a snapshot of a row and its linked lists (`snapshot(table, id)`) and turns two
  snapshots into a list of changes (`diff`). `audit(user, action, detail, changes)` stores it in `audit_log.changes`; the Logs page
  shows it. Snapshots cover projects (tags, industries), industries (projects), tags (projects), Loom videos (tags) and any plain row.
- **Versions already kept**: writing guide documents (`writing_doc_versions`), gate instructions (`skill_versions`, one active),
  proposals (`proposal_versions`). Rules are never deleted, only retired; rule codes are never reused.
- **Roles**: `employee`, `manager`, `admin`. The **main admin** is the first admin account (`mainAdminId()` in `routes.ts`, the lowest
  user id with role admin); only that person can change the main admin account (R40). Today there are 2 admins.
- **Sign in from Claude** (R20, `backend/src/oauth.ts`): each person connects their own Claude and every call is made as that person,
  with that person's role. So the server always knows who did what, and whether they are the main admin.

---

## Part A. The plugin saves every step

### Goal

Upwork Pro shows exactly where a plugin job stands at every moment, the same way it does for a job done in the app. If someone stops
halfway, the job sits at the step they reached, with everything they chose saved. Anyone (that person, or a teammate in the app) can
pick it up from there. Nothing is saved twice: one job, updated step by step.

### The steps and what is saved at each

| Plugin step | When it is saved | What is saved | App field (so the stage follows) |
| --- | --- | --- | --- |
| 3 Gate | right after the gate, before the decision | the job, the post in fields, the gate verdict, every fail and flag | `save_job` without `decision` (already allowed): stage "Decision pending" |
| 3b Decision | when the person answers | continue (with the reason past a FLAG or FAIL) or skip (with the skip reason, R42) | `record_decision` (exists) |
| 5 Read the job | after the signals and tags are read | the job tags with reasons and core work, the signals with evidence | new: `job_tags` (with `core_rank`), `job_signals` |
| 6 Profile | when the person picks the profile and rate | the profile and the rate | `proposal_profile_id`, `proposal_profile_confirmed_at`, rate |
| 7 Projects | when the person picks the projects | the shortlist shown (with reasons), and the projects picked | `job_matches` rows (with `ai_reason`), `selected`, `selection_confirmed_at` |
| 8 Type | when the person picks the type | the type (and the ranking shown, if any) | proposal row: `template_id`, `template_name`, `template_choice` |
| 8b Loom | when the person picks a video or none | the video | `loom_video_id`, `loom_video_title` |
| 9 Draft | every draft and every edit the person asks for | the text as a new version, not finished | `save_proposal` with `finished: false` (each call adds a version) |
| 10 Final | when the person approves | the final text | `save_proposal` with `finished: true` |
| After | sent, viewed, chat, interview, outcome | status, when, Connects, boost, notes | `update_status` (exists); add Connects, boost and notes to it |

Rule: **the plugin calls Upwork Pro at every row above, as soon as the person answers**, not at the end.

### New MCP tool: `save_step`

One tool for steps 5 to 8b, so the skill stays simple. Server: `POST /plugin/jobs/:id/step`.

```
save_step({ id, step: 'read' | 'profile' | 'projects' | 'type' | 'loom', data })
  read:     { tags: [{ name, reason, core_rank? }], industry: { name, reason } | null, signals: [{ signal, value, evidence }] }
  profile:  { profile: "Hamza Yaseen", rate: 35 }
  projects: { shortlist: [{ name, reason, recommended }], picked: ["Breesy", "Apex"] }
  type:     { type: "Type 7. Problem first", ranking?: [{ type, why }] }
  loom:     { video: "title" | null }
```

Server rules (mirror the app's own routes, reuse their code, do not copy it):
- Only the person who owns the job, or a manager or admin, may save to it (the same check as `ownJob` in `routes_plugin.ts`).
- Names are matched to the library like `save_proposal` does: an unknown project or profile is refused with a message that says to
  add it first (`add_project`, `add_profile`), as today.
- Each step replaces what that step saved before (picking other projects replaces the selection), and is written with the same old
  and new values the app keeps (`field_changes`, `recordChanges` in `routes.ts`), source "Claude plugin".
- A step can be saved again later (the person changes their mind). A later step does not erase an earlier one.
- The answer always includes the job's stage after the save, so the skill can say "Saved: step 7 of 10".

### Resume a job

- `find_jobs` and `get_job` already return the stage. Extend `get_job` to return everything saved: tags, signals, profile, rate,
  shortlist, picked projects, type, video, the latest draft. Then the skill can continue from the last step.
- `/proposal` with a job link that is already saved and not finished: say where it stopped ("Saved up to step 7: projects Breesy and
  Apex") and offer to continue from there or start again (a new job with `force_new`).
- In the app, a job saved by the plugin up to step 7 shows on the Projects step done, Profile done, waiting on the type, as any job.

### Changes to `plugin/skills/proposal/SKILL.md`

- After every decision point: call the tool for that step, then say in one line "Saved in Upwork Pro: <what>". If the save fails,
  show the message as is, fix only what the person confirms, retry; never go on as if it was saved.
- Step 4 moves to right after the gate (save without a decision), then `record_decision` when the person answers.
- Step 9: every draft and every revised draft goes in with `save_proposal` and `finished: false`.
- A short "Resume" section at the top: check `find_jobs` first; if a saved job is unfinished, offer to continue from its step.
- Bump the plugin version (v0.5.0) and its README.

### Acceptance (check each)

1. Run `/proposal` on a real job and stop after picking projects. In the app the job shows "Profile done, projects picked", with the
   same shortlist and reasons, and the right stage on the Jobs list.
2. Ask Claude to continue that job in a new chat: it finds it, says where it stopped, and finishes it. One job in Upwork Pro, not two.
3. Ask for two revisions at step 9: the app shows three versions, not finished. Approve: finished, ready to send.
4. A save for a project that is not in the library is refused with "add it first", and nothing half saved remains.
5. Someone else's job: the save is refused for an employee, allowed for a manager or admin.
6. Every step shows in the job's History with old and new values, source Claude plugin.

---

## Part B. Admins run the setup from Claude, safely

### Goal

An admin can add or change almost everything in the setup by talking to Claude: projects, industries, the tag dictionary, tagging
projects, Upwork profiles, Loom videos, rules, signals, proposal types, the writing guide, the gate instructions, settings. Claude asks
the questions needed to get it right and explains what each change will do. **Everything is logged, versioned and can be put back.**
The **main admin's** changes apply at once. A **second admin's** changes apply at once too, but every one of them is kept as a change
set the main admin can review and put back in one click, at any time. A setting can make second admins' changes wait for the main
admin's approval instead (off by default).

### Decisions (recommended defaults; confirm with Hamza before building, see "Questions for Hamza")

- **Who**: the main admin (first admin account) and second admins (any other admin). Managers keep what they have today in the app
  (projects, industries, tags) and get the same from Claude. Employees: none.
- **Never from Claude**: users and passwords, the AI provider and keys, deleting a job, the main admin account. Hard deletes of setup
  items are not offered either: Claude switches an item off instead (every list has active and inactive since R46).
- **Apply now, put back any time** (default): a second admin's change applies at once, is marked "To review" for the main admin, and
  can be reverted. **Approval first** (setting "Second admins' changes wait for approval", off): the change is stored as "Waiting",
  applies only when the main admin approves it, and is dropped if rejected.

### Change sets (the new core)

One table, built on the R49 snapshots. Every setup change from Claude, and also from the app, goes through it, so there is one place
to review and revert.

```sql
CREATE TABLE IF NOT EXISTS change_sets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,              -- who made it
  source ENUM('app','claude_plugin') NOT NULL,
  entity VARCHAR(40) NOT NULL,                -- project, industry, tag, tag_category, profile, loom_video, rule, signal,
                                              -- signal_value, template, template_mapping, template_sample, writing_doc,
                                              -- gate_instructions, setting
  entity_id VARCHAR(80) NULL,                 -- the row id, a rule code, a setting key
  entity_name VARCHAR(200) NULL,
  action ENUM('create','update','switch_off','switch_on') NOT NULL,
  before_json MEDIUMTEXT NULL,                -- the full snapshot before (row and linked lists), null for create
  after_json MEDIUMTEXT NULL,                 -- the full snapshot after (or what will be applied, while waiting)
  changes_json MEDIUMTEXT NULL,               -- diff(before, after), what the Logs and review pages show
  reason TEXT NULL,                           -- why, in the person's words (Claude writes it from the conversation)
  status ENUM('applied','waiting','rejected','reverted') NOT NULL DEFAULT 'applied',
  needs_review TINYINT(1) NOT NULL DEFAULT 0, -- a second admin's applied change the main admin has not looked at yet
  reviewed_by INT UNSIGNED NULL, reviewed_at DATETIME NULL,
  reverted_by INT UNSIGNED NULL, reverted_at DATETIME NULL, reverted_by_set INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cs_status (status, needs_review), KEY idx_cs_entity (entity, entity_id)
) ENGINE=InnoDB;
```

Server module `backend/src/changesets.ts`:
- `record(user, source, entity, id, action, before, after, reason)` writes the row and the audit entry (one place).
- `apply(changeSet)` writes `after_json` to the tables, including the linked lists (project tags, industries, an industry's projects,
  a tag's projects, a video's tags, a type's mapping rows). One writer per entity, reusing the existing save code (move the body of
  `saveProject`, `saveIndustry`, `saveLoom`, the tag and profile routes into functions both the HTTP routes and `apply` call).
- `revert(changeSet)` applies `before_json` as a new change set (action noted "revert of #N"), so a revert can itself be reverted.
  If the item changed again since (current snapshot is not `after_json`), refuse and show what changed since; the main admin can
  then revert the later change first, or confirm "put back anyway".
- Versioned kinds keep their own versions: a writing guide document or the gate instructions get a new version (revert = a new
  version with the old text, and for the gate the active version switches back). A proposal type's text and opening rules use
  `before_json` like any row.

### MCP tools for admins

Two steps, like the imports: Claude prepares, the person sees the change, then Claude applies it only after a clear yes in the chat.

| Tool | What it does |
| --- | --- |
| `setup_list({ kind, q? })` | Lists projects, industries, tags, categories, profiles, videos, rules, signals, types, writing docs, settings (search by name) |
| `setup_get({ kind, id or name })` | One item in full: every field, linked lists, its last changes and who made them |
| `setup_prepare({ kind, action, id?, fields, reason })` | Checks it (the same validation as the app), returns the change as before and after, plain words, and what it affects ("this tag is on 12 projects; matching uses its score"), plus a `change_id`. Saves nothing |
| `setup_apply({ change_id })` | Applies it (or stores it as waiting, for a second admin with approval on). Returns the change set number |
| `setup_history({ kind?, id?, user?, status? })` | The change sets, newest first |
| `setup_revert({ change_set })` | Main admin only: puts it back (with the conflict check above) |
| `setup_review({ change_set, decision: 'approve' or 'reject' or 'seen', note? })` | Main admin only |

Permissions on the server, never only in the skill: the role from the signed in person; `setup_revert` and `setup_review` only for the
main admin; managers only projects, industries, tags; the "never from Claude" list refused for everyone. Keep `add_profile` and
`add_project` working (the proposal flow uses them), but route them through change sets too.

### A new skill: `setup-admin` (in `plugin/skills/setup-admin/SKILL.md`)

Triggers: "add a project", "update the tag dictionary", "change the writing guide", "add a Loom video", "add a rule", "which changes
did Daniel make", "undo that change". It holds the conversation:

1. **Find what exists first** (`setup_list`, `setup_get`, `get_library`): never add a duplicate; offer to update the one that exists.
2. **Ask, do not guess.** One topic at a time, in plain words. Per kind, the questions to ask (put these lists in the skill's
   `references/` files, one per kind):
   - **Project**: name; what it is (overview, two or three sentences); the case study in the team's format (Project, Problem, Solution,
     Key features, Technology, Results); links (landing page, system, Android, iOS, staging, case study); industries; the core work it
     proves (workflow and AI capability tags); product type; stack and tools; compliance; which profiles may show it. Suggest tags from
     the dictionary with a reason each and let the person confirm each category. Never invent results, numbers or clients.
   - **Tag**: the category; what it means (the description the tagger reads); the score, with what the score does (Tag dictionary, How
     the scores work) and what a higher or lower score would change; which projects have it (search and tick, as in the app).
   - **Industry**: name, what it covers, related industries (and that related industries change the order on the Projects step),
     its projects.
   - **Upwork profile**: every field the writer uses (headline, rates, voice, signature, allowed stats, services, industries,
     certifications with the strict rule, profile rules, who submits). Mark missing ones; never invent a rate or signature.
   - **Loom video**: profile, title, link, what it shows, tags.
   - **Rule**: fail or flag, the rule, how to apply it, a new code (never reuse one); show which past jobs it would have fired on if
     that is cheap to check.
   - **Signal and values**, **proposal type** (text, first two lines rules, the signal mapping, samples), **writing guide document**,
     **gate instructions** (a new version; offer the app's test run on a past job before it goes live), **setting** (the meaning and
     the effect, from the Settings page help).
3. **Show the change before applying**: the before and after from `setup_prepare` in a short table, what it affects, and ask "Apply
   this?" Apply only on a clear yes. Say what happens next for a second admin ("applied; the main admin can review it" or "waiting
   for the main admin").
4. **Write the reason** with the change from the conversation, in one or two sentences.
5. **Never**: touch users, passwords, keys or the AI provider; delete anything (switch it off instead); apply without a yes; paste
   secrets into a field.

### The app: a "Changes" page (admins)

- Sidebar under Admin: **Changes**, with a count for the main admin of changes to review (second admins' applied changes not yet
  seen, plus waiting ones).
- One row per change set: when, who, from Claude or the app, what (kind and name), the reason, status. Filters: person, kind, status,
  source, dates. The details show the change list (reuse `changesList` from the Logs page).
- Main admin buttons: **Seen** (clears "to review"), **Put back** (revert), and for waiting ones **Approve** / **Reject** (with a note).
- On each item's own page (a project, a tag, a type, a document), a small "Changes" link to its history.
- Settings: "Second admins' changes wait for approval" (on / off switch like R51's), main admin only.

### Built so far

- **A1 and A2 are done (R52, 14 October).** One thing differs from the table above: the type picked at the type step is kept on the
  job (`screenings.chosen_template_id`, `chosen_template_name`, with the rate in `proposal_rate`, migration 033), not on a proposal
  row, because a proposal row without text would be picked up by the worker and written by the AI. The app's stage therefore reads
  "Proposal type pending" until the first draft is saved, and its type chooser shows the type as "Picked in Claude", already selected.

### Phases (build and ship in this order)

1. **A1** `save_step` and the server side for steps 5 to 8b, `get_job` with everything saved, early `save_job`. Tests.
2. **A2** the proposal skill saves at every step and resumes; plugin v0.5.0. Check on two real jobs in Claude.
3. **B1** `change_sets`, `changesets.ts` (record, apply, revert with the conflict check), the app's own setup routes go through it,
   and the Changes page with Seen and Put back. No Claude yet: test reverts from the app for every kind.
4. **B2** the setup MCP tools and permissions; `add_project` and `add_profile` through change sets.
5. **B3** the `setup-admin` skill and its question lists; plugin v0.6.0. Check with a second admin account: add a project, change a
   tag score, edit a writing guide document, add a rule; the main admin reviews and puts one back.
6. **B4** approval mode (waiting, approve, reject) and its setting.

### Tests to write

- Per kind: create, update, switch off and on, then revert each: the item and its linked lists end exactly as before (compare
  snapshots). A revert of a revert. A revert refused when the item changed since, and allowed with "put back anyway".
- Permissions: an employee is refused everything; a manager only projects, industries, tags; a second admin cannot revert or review;
  nobody can reach users, keys or the AI provider through the setup tools.
- Approval mode on: a second admin's change is waiting and changes nothing until approved; rejected leaves no trace but the record.
- Part A: each step saved, saved again, and a later step leaves earlier ones in place; the stage after each step; a resume.
- Keep `npm test`, `npx tsc --noEmit -p .`, `node --check` on `public/*.js`, and `npm run test:read` passing.

### Risks to watch

- **Two writers for one item**: the app and Claude edit the same project at once. The conflict check on revert covers undo; for
  saves, compare the snapshot Claude prepared against the current one in `setup_apply` and refuse if it changed in between.
- **Big texts** (case studies, writing guide): snapshots are large; keep them in `before_json` as they are (MEDIUMTEXT), and show line
  differences only (R49 already does).
- **Linked lists**: the Industry tag and the project's industry must stay in step (R50 does this in `setTagProjects`); every writer
  must keep it.
- **The setup backup** (`npm run setup:export`): add `change_sets` to nothing (it is history, not setup), but re-export after big
  changes as before.

---

## Added by Hamza on 14 October, while Part B was being built

### C. Nothing raw goes into the setup from Claude (a rule for B3, the `setup-admin` skill)

Different people will add projects and other setup through Claude, and the library is being standardized. So for every item, and
for a project above all, the skill must work in this order and never skip a step:

1. **Show how a good one looks first**: two or three real items of the same kind from the library (for a project: its overview, its
   case study in the team's format, its links and tags), so the person sees what is wanted and in what shape.
2. **Ask for all the information**, one topic at a time.
3. **Check what is complete and what is missing**, and say so. Ask again for what is missing; never fill a gap with a guess.
4. **Verify** what can be verified (a link opens, a tag exists in the dictionary, the industry exists, the name is not already there).
5. **Rewrite it in the standard format yourself**: the team's case study headings, plain sentences, the same style as the examples.
   Never paste the person's raw text into a field.
6. **Show the final version** exactly as it will be saved, and what changed from what they gave.
7. **Get a clear yes**, then add it. Without a yes nothing is saved.

### D. An independent reviewer for every proposal (built after B1, in the app first)

Once a proposal is written, a separate agent reviews it before anyone copies it. It reads the job, the profile, the projects, the
proposal type's rules and the writing guide, and returns: a score out of 10, a short verdict, the key points, and two or three
concrete suggestions. The person can apply a suggestion (it goes to the chat, which revises the proposal), ask for a new review
after a change, or copy the proposal as it is. The reviewer never changes the proposal itself. It must be independent: its own
prompt, not the writer's, so it does not grade its own work kindly.

## Hamza's answers (14 October)

1. Second admins' changes **apply at once**; the main admin reviews them later and can put any back. So phase B4 (approval first) is
   not built unless he asks for it.
2. The main admin is **only the first admin account** (Hamza).
3. Managers may change projects, industries and tags from Claude, as in the app (the default; not asked again).
4. **Any admin** may change the gate instructions and settings, marked for the main admin's review like every other change.
5. Part A saves **the result of each step only**, not the chat.

## Questions for Hamza (answered above)

1. Second admins: apply at once and the main admin reviews later (default), or wait for approval first?
2. Is "main admin" only the first admin account (Hamza), or should the main admin be able to name more than one?
3. May managers change projects, industries and tags from Claude (as in the app), or admins only?
4. May second admins change the gate instructions and settings, or only the main admin?
5. Should Part A also save the plugin's chat itself (the person's requests and Claude's answers), or only the results of each step?
