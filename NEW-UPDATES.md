# New updates (branch `hamza`)

Hamza's changes, made on top of `main` (GLM through Z.ai). Usman: continue from this branch.
Goal of this round: cut the time from pasting a job to having a proposal. It went from **6:05 to 3:23**
on GLM 5.3 (same job, same steps). Screens are unchanged; all changes are in the backend.

## Before you run it

```
cd backend
npm install            # exceljs is now a runtime dependency (export)
npm run migrate        # applies 008 to 021: early drafts, tracking, settings, AI calls, status dates, posting and history, imports, plugin source, gate split, library fields, sheet sync (and its removal), writing guide, sign-in from Claude
npm run seed:writing   # the shared writing rules (rules, banned phrases, modules, screening answers, checklist), insert-if-missing
npm run seed:proposals # the 3 new signals and the 6 proposal types (R21)
npm run merge:writing  # once: retires the 3 SOP templates, moves their samples to Type 1, drops the duplicate type documents (R21)
npm run seed:library   # fills each rule's "How to apply" note and makes the instructions-only gate version active (see R15)
npm run sync:library   # dry run: what the project sheet snapshot would change; then add -- --apply (see R17)
npm run seed:settings  # admin settings, defaults from src/settings.ts (the migrations add them too; this keeps code and database in step)
# optional, spends AI quota: npm run backfill:postings   (reads older jobs' posts into fields; add -- --dry-run to count)
# dev/demo only: npm run seed:examples   (12 example jobs across every Jobs tab; -- --remove takes them out)
```
Then sign in: you land on the new **Dashboard**. Admin pages: Gate instructions, Rules, Settings, Users, Logs.

Recommended model in `.env`: `LLM_MODEL=glm-5.3[1m]` (the full model). On the same job it screened in
0:57 against 2:50 for `glm-5.3-flash[1m]`, and wrote the proposal in 3:10 against 5:33. It uses the
Z.ai quota faster.

## What changed

### 1. Tagging and signals run in parallel, and start earlier
- **The gate is still the decision point.** On FLAG or FAIL nothing else runs until the person continues
  with a reason.
- **On PASS, tagging and matching start the moment screening finishes**, before anyone clicks Continue.
  Continue no longer re-runs tagging when it is already done (`routes.ts`, `/continue`).
- **Signals are read at the same time as tagging**, from the job text alone, instead of after the profile
  is confirmed. The project list does not wait for them.
- The proposal reuses the stored signals. If they are still being read, it waits for that call instead
  of starting a second one (in-process map in `pipeline.ts`).
- Queue order: jobs a person has continued come before PASS jobs being prepared early.

### 2. Signals are read in 3 parallel calls, one per layer
- One model call per signal layer (structural, domain, hidden), all at once. Each writes a third of the
  answer, **reasons and evidence included**, so the step dropped from about 75 s to about 35 s.
- Layer rules only compare signals inside the same layer, so nothing is lost by splitting.
- If one layer's answer is malformed the step fails with `invalid_output`; it never quietly falls back
  to defaults for that layer.
- The prompt line about signals without a fallback now names only the signals in that call
  (`signals.ts`).

### 3. Early drafts
- When matching finishes, a draft is written with the **2 recommended projects** and the **likely
  profile**: the only active profile, otherwise the one this person used last. No clear guess, no draft.
- When the person confirms the profile:
  - same projects and profile, draft finished: used instantly;
  - same, still being written: the proposal waits for it;
  - different choices, or the draft had not started: it is skipped and the proposal is written as before.
- Only the first automatic write uses an early draft. A rewrite or a manually chosen template always
  writes fresh.
- Early drafts run at the lowest priority, behind anything a person is waiting on.
- New table `early_drafts` (migration 008): status, the projects and profile it was written for, the
  result, and when it was used.
- `runProposal` was split: `compose()` does signals, template, writing and checks without storing
  anything, so the early draft and the confirmed proposal share it.

### Files
- `backend/src/worker.ts`: PASS auto-start, signals alongside tagging, early-draft job, queue order
- `backend/src/proposal/pipeline.ts`: `detectSignals` (3-way split), `compose`, early drafts, `runProposal`
- `backend/src/proposal/signals.ts`: prompt line for signals without a fallback
- `backend/src/routes.ts`: `/continue` keeps finished tagging
- `backend/sql/migrations/008_early_drafts.sql`: new table

## Timings (same FLAG job, GLM 5.3, 30 s reading + 25 s picking)

| | Original code | This branch |
|---|---|---|
| Screening | 0:57 to 1:37 (varies) | 1:23 |
| Signal reading | inside the proposal step | 0:35, in parallel |
| Wait after confirming the profile | 3:10 | 0:40 |
| **Paste to proposal ready** | **6:05** | **3:23** |

Screening is now the biggest step. Getting under 3 minutes on GLM needs a shorter screening report
(the gate prompt).

## Things to know
- A tagging job now makes 2 model calls at once and signals make 3, so more calls can be in flight than
  `LLM_CONCURRENCY`. If Z.ai answers "busy", lower it.
- Regenerating a proposal reuses the signals already read (the job text does not change).
- Early drafts spend quota on jobs the person then drops after continuing.
- Tested: type check and `npm test` pass; full journeys run on GLM with the early draft used; the PASS
  path checked with the mock provider.

## Refinement round (7 October)

Hamza and Claude did the cleanup that was planned for Usman: naming, tracking, the Jobs list, export, the
dashboard, settings and rules, and logs. Each item below (R1 to R7) is its own commit on this branch, so each can be
reviewed on its own. Checked from a fresh clone: `npm run build`, `npm test`, all migrations and seeders on an
empty database, and each screen in the browser with real GLM jobs.

### R1. Naming, logo and navigation (done)
- The app is **Upwork Pro** everywhere: sidebar, sign-in page, browser tab (new favicon), README, package name.
- New logo: a U with an upward arrow (`ICONS.logo` in `app.js`, same shape as the favicon in `index.html`).
- **Skill editor is now "Upwork JobGate"** (sidebar and page title). "Skill v1" chips now read "Gate v1".
- **"All records" is now "Jobs"** ("My jobs" for employees).
- The sidebar is one list, `NAV` in `app.js`, grouped **Work** (Screen a job, Jobs), **Library** (Projects,
  Industries, Tag dictionary, Upwork profiles), **Proposal setup** (Templates, Signals), **Admin** (Upwork
  JobGate, Users, Audit log). Each link carries the roles that see it, so adding a page is one line.
- Kept on purpose: database `upwork_gate`, table `skill_versions` and the URL `#/skill` (internal names).

### R2. After the proposal: tracking and the end of the journey (done)
- **New tracking fields** (migration `009_tracking_fields.sql`, run `npm run migrate`): Connects spent, boost
  (Connects), client viewed, client replied, interview, and `tracking_updated_at`. The tracking API
  (`PATCH /screenings/:id/tracking`) accepts them.
- **Outcome is a dropdown** (`OUTCOMES` in `app.js`: Pending, Hired, Not hired, No response, Withdrawn, Job
  closed). An older free-text value stays selectable. (Making this list editable in the app is part of
  "fully dynamic", still to do.)
- **Save tracking now ends the journey**: the Tracking step switches to a **"Job complete"** panel with the
  verdict, projects, profile, template, sent date, Connects, viewed/replied/interview and outcome, plus
  **Screen another job**, **Back to jobs** and **Edit tracking**. Reopening a job whose tracking was saved
  shows this panel first.
- **The whole project card is clickable** on the Projects step, not only the tick box (links on the card
  still open the project).
- Static files are served with `Cache-Control: no-cache`, so after a deploy people get the new screens
  without a hard reload (`server.ts`).

### R3. Jobs list (done)
- **Stage per job**, computed in SQL (`stageSql` in `routes.ts`): screening, decide, projects, profile,
  proposal, tracking, complete, skipped, failed. **Needs action** = decide, projects, profile, proposal or
  tracking (`NEEDS_ACTION`).
- **Filters** (all in the URL, so Back returns to the same view): search (title, client country, person,
  profile, rule, link), date from / to, stage (incl. Needs action), rule code (whole codes only, G1 never
  matches G14), profile, person (managers and admins), outcome (incl. "No outcome yet"), only mine.
  `GET /screenings/filter-options` feeds the menus from the database.
- **Sortable columns** (`SORTS` whitelist in `routes.ts`; empty values sort last). Default: newest first.
- **More columns**, chosen per person with **Columns** (saved in the browser): progress dots + stage, result
  and rule codes, client, budget and job type, hire rate, profile, by, template, sent date, Connects,
  viewed/replied/interview, outcome, time to proposal, when. Long model-written values are clipped with
  the full text on hover.
- **Counter tiles** now include **Needs action** (click to filter) and respect every filter except verdict.
- `listFilters` / `listWhere` / `orderBy` are exported so the export (R4) uses exactly the same filters.

### R4. Export with filters (done)
- **Export** button on the Jobs list: **Excel (.xlsx)** or **CSV**, for exactly the jobs matching the filters on
  screen (including verdict, stage, dates, rule, profile, person, outcome, search) in the same order.
- `GET /screenings/export?format=xlsx|csv&<same filters as the list>` (`routes.ts`), built by `src/export.ts`.
  Up to 5,000 jobs per file. Related data is fetched in a few batch queries, not one per job.
- **One row per job, 64 columns**: ID, date, submitted by, stage, title, link, every report field (posted,
  budget, client country, hire rate, total spent, ...), verdict, rule codes, fail and flag reasons, gate
  version, model, proceeded, override reason, job tags, projects shown with scores, projects chosen, profile,
  signals (primary value and confidence), template, proposal status, versions, warning count, **the final
  proposal text**, sent date, Connects, boost, viewed, replied, interview, outcome, notes, every step's time,
  seconds to proposal, and the job description. Built to hand to Claude for "analyse last month".
- Excel: header row frozen with filters on. CSV: UTF-8 with BOM for Excel, and any cell that starts like a
  formula (`=`, `+`, `-`, `@`) is prefixed with `'` so a spreadsheet never runs text from a job post.
- Every export is written to the audit log with the format, row count and filters.
- `exceljs` moved from devDependencies to dependencies (the server now needs it). Run `npm install`.

### R5. Dashboard (done)
- **New home page**, first in the sidebar (`#/dashboard`; sign-in lands here). Everyone sees it; employees
  see only their own jobs, as in the Jobs list.
- **Period**: Today, Last 7 days, Last 30 days (default), This month, All time. **Filters**: profile, person
  (managers and admins), only mine. All kept in the URL.
- **KPIs**: screened (pass/flag/fail), continued, proposals (finished), sent (Connects), hired, needs action.
- **Funnel**: screened → continued → proposal written → sent → viewed → replied → interview → hired, with %.
- **Speed**: average, fastest and slowest paste-to-proposal, and the average per step (screening, project
  matching, writing after the profile).
- **Needs attention**: count per stage and the oldest 8 waiting jobs.
- **Jobs per day**, **rules that fire most** (and the % continued anyway: a rule continued past most of the
  time is a candidate to soften in the gate prompt), **by person** and **by profile**.
- **Every number opens the Jobs list** with the same period and filters (e.g. a rule bar opens the jobs
  where that rule fired).
- `GET /dashboard` in `routes.ts`, built on the same `listWhere` as the list and the export, so the numbers
  always match.

### R6. Fully dynamic: settings and rules (done)
- **Settings page** (Admin → Settings, `#/settings`), stored in the new `app_settings` table (migration
  `010_settings_and_rule_history.sql`), defined with defaults and validation in `src/settings.ts`. Changes apply to
  the next job, no restart. Every change is in the audit log.
  - Projects shown per job (5), projects recommended (2), minimum match score (1; the plugin used 6).
  - **Fewest / most projects a person can pick: 1 to 2** (was hardcoded to exactly 2). The Projects step,
    the API and the early draft all follow it. The range is checked so min never exceeds max.
  - Shortest override reason (15).
  - **Outcome choices** (the Tracking dropdown and the Jobs filter).
  - **Rules passed to the proposal writer** (was hardcoded G11, G12, G13) and **the signal value that means
    "structured submission"** (was hardcoded signal 5 = Yes) in `pipeline.ts`.
- **Rules page** (Admin → Rules, `#/rules`): every FAIL and FLAG code with how many jobs it fired on (a link to
  those jobs). **Add** gives the next free code (`G18` next), counting retired codes, so a code never gets a new
  meaning. **Reword** keeps the code; **Retire / Restore** never deletes. `GET/POST /admin/rules`,
  `PATCH /admin/rules/:code`.
  - The page reminds the admin that the model only applies rules written in the gate prompt (Upwork JobGate),
    so a new rule must also go into the prompt with its code.
- `rankProjects` and `validSelection` take the settings as arguments; their defaults keep the old behaviour, and
  tests cover the 1-to-2 range and the shown / recommended / minimum-score options.
- The screens load the settings once after sign-in (`CFG` in `app.js`).

### R7. Logs and the job timeline (done)
- **Every model call is now logged** in the new `llm_calls` table (migration `011_llm_calls.sql`): job, job type
  (screening, tagging, proposal, early draft, chat, gate test), step (screening, tagging, `signals: structural` /
  `domain` / `hidden`, writing, chat), model, provider, milliseconds, ok, and a short safe error (a status or a
  known runner message, never model text).
  - One wrapper does it: `run()` in `src/llm/index.ts`. The job comes from an `AsyncLocalStorage` context set
    around each worker job (`src/llm/context.ts`, `withCallContext` in `worker.ts`); each call site only adds a
    `label`. Calls made outside a job (tests, scripts) are not logged, so `npm test` still needs no database.
- **Logs page** (Admin → Logs, was "Audit log"), two tabs:
  - **Activity**: the audit log with filters (action, person, date range).
  - **AI calls**: a summary per job type / step / model (calls, failed, average and slowest time) and every call
    with a link to its job. Filters: job type, succeeded / failed, model, date range.
  - `GET /admin/audit` (now filterable) and `GET /admin/calls`.
- **Timeline on every job page** (collapsed card under the steps): every step in time order with how long after
  the paste it happened and who did it (pasted, screened, continued, matched, projects confirmed, profile chosen,
  each proposal version, finished, tracking saved) and every AI call with its model and time. Failed calls are
  marked red. `GET /screenings/:id/timeline`.
- Jobs screened before this change have steps in their timeline but no AI calls (they were not logged then).

### R8. Dropdowns and the job detail page (done)
- **Every dropdown has the same inset chevron** instead of the browser's arrow jammed against the border
  (`select` in `style.css`). The chevron and the favicon are now files (`public/chevron.svg`,
  `public/favicon.svg`): the Content-Security-Policy only allows images from the app, so the earlier inline
  `data:` favicon was being blocked too.
- **Opening a job now shows a read-only detail page** (`#/s/<id>`, `jobView` in `app.js`) with everything in one
  place: result and rule codes, where it stands, decision, projects, profile, template, proposal status, time to
  proposal, client facts, tracking, the reason for continuing, **the proposal text with a Copy button** and its
  warnings, the projects shown and chosen (with the job's tags), the screening report, every record field, and the
  timeline (open by default).
- **Edit** (top right) opens the step-by-step workflow at `#/s/<id>/work`. When the job is waiting on its owner
  the button says what is next, e.g. **"Continue: Pick projects"**, and opens that step. The workflow has a
  **View details** link back.
- Screening a new job still goes straight into the workflow, and a job that is still screening or failed opens
  the workflow page (progress and retry live there).

### R9. One-click status updates (done)
- **Status column on the Jobs list** (next to Progress) shows the latest thing that happened on Upwork (outcome,
  else Interview, Replied, Viewed, Sent) and when, with an **Update** button on every row. The same **Update
  status** button is on the job detail page.
- **The dialog**: pick Sent, Viewed, Replied, Interview or an outcome (from Settings); the next logical one is
  pre-selected. **"When it happened" is pre-filled with now** and only needs changing if it happened earlier.
- **Saving records the status and its date-time**: Sent sets proceeded = yes, the sent date and `proposal_sent_at`;
  Viewed sets client viewed = yes and `client_viewed_at`; likewise `client_replied_at`, `interviewed_at`,
  `outcome_at`. Every change is also kept in the new `status_events` table (history in the dialog and in the job
  timeline). Migration `012_status_dates.sql`.
- Saving the Tracking form now also fills these date-times (now) the first time a milestone is set there.
- The export gains Sent at, Viewed at, Replied at, Interview at, Outcome at and the full status history.
- API: `GET /screenings/:id/status` (current, history, choices) and `POST /screenings/:id/status { status, at }`.

### R10. The job posting, Chat opened, loss reasons, full change history, page widths (done)
- **The job post in fields.** A second AI call reads every pasted job into fields **at the same moment as the
  screening** (so it adds no wait; about 60 s with GLM 5.3): title, posted, location, terms, skills, **the full
  description word for word**, screening questions, activity, client details, the client's recent history (title,
  dates, amount, rating, feedback) and other open jobs. `src/screening/posting.ts`, stored in
  `screenings.posting_json` (migration `013_posting_reasons_history.sql`), logged as `posting` in AI calls.
  - Shown as a **"Job posting"** section at the top of the job detail page, at the top of the Screening step, and
    while a job is still being screened. The full pasted text stays one click away under it.
  - Jobs pasted before this have an **"Extract the posting"** button (`POST /screenings/:id/posting`).
- **"Replied" is now "Chat opened"** everywhere (status choices, tracking form, Jobs list, dashboard funnel,
  export). Old history entries were renamed too. The column underneath is still `client_replied`.
- **A reason is required for every lost outcome** (Settings: "Outcomes that count as lost" = Not hired, No
  response, Withdrawn, Job closed; "Reasons a client did not go ahead" = Budget too low, Hired someone else, Went
  quiet after chat, Scope or timeline did not fit, Job cancelled by client, We withdrew, Other). Asked in the
  status dialog and in the Tracking form, checked by the server, with an optional note. Stored as
  `outcome_reason` / `outcome_note` and on the status history entry; shown as "Why lost".
- **Every change is kept as old value -> new value** in the new `field_changes` table (field, old, new, source
  "status" or "tracking form", who, when) for all tracking fields and milestone times. Shown in the job timeline
  and exported as "Change history". A milestone first set through the Tracking form also goes into the status
  history, so both ways of updating leave the same trail.
- **Export** gains: Lost reason, Lost note, Chat opened at, Change history, Posting description, Posting skills,
  Screening questions, Client history.
- **Jobs list**: the Update status button is back at the end of the row, in a column pinned to the right edge,
  so it is always visible while the table scrolls.
- **Every page now uses the Dashboard's full width** (`.page` max-width 1480px), so the pages look the same.

### R11. Searchable dropdowns, seeders (done)
- **Every dropdown is searchable**: `searchableSelect` in `app.js` turns each `<select>` into a button with a
  search box (type to filter, arrow keys, Enter to pick, Escape to close). It is applied automatically to every
  select added to the page (a MutationObserver), so new pages get it for free. The real `<select>` stays in the
  page, hidden, and keeps the value, so `el.value`, `change` listeners and `<label for>` all work unchanged.
  Add `data-plain` to a select to opt out.
- **A chosen value shows a clear button (×) where the chevron was**, and the dropdown's border is highlighted, so
  active filters stand out. One click clears just that dropdown and applies at once. Shown only when "nothing
  chosen" is a valid state (the select has an option with value ""), so required choices cannot be emptied.
- Filters everywhere already apply immediately (dropdowns and dates on change, search boxes ~0.2 to 0.3 s after
  typing stops); there is no Apply step on any page.
- **`npm run seed:settings`** (`scripts/seed-settings.ts`): inserts any missing admin setting with its default from
  `src/settings.ts`. Never overwrites a value an admin changed.
- **`npm run backfill:postings`** (`scripts/backfill-postings.ts`): queues posting extraction for jobs pasted before
  R10. Spends one AI call per job, so it is not part of setup; `-- --dry-run` only counts (9 jobs locally).
- Both have `:prod` variants for the built app, and the README's run steps list them.

### R12. Jobs in phases: In progress, Submitted, Closed, Not pursued (done)
The **job** is the main record. Its proposal is prepared while the job is **In progress**; after that the job
itself moves on Upwork. This replaces the single stage list from R3.
- **Tabs on the Jobs page**, each with its count: **All**, **In progress** (we are preparing the proposal),
  **Submitted** (marked Sent, waiting on the client), **Closed** (a final outcome: hired or lost; "Pending" is the one
  outcome that keeps a job Submitted), **Not pursued** (skipped or failed). Each tab has its own starting columns
  (Columns is saved per tab) and its own filters; the URL keeps the tab (`?tab=in_progress`).
- **Steps count only where the job waits on a person**: 1 Decision pending, 2 Projects pending, 3 Profile pending,
  4 Review pending (the draft is written, someone must check and finish it), 5 Ready to send. Shown as
  "Step 2 of 5 · Projects pending" with a thin bar. Screening and writing are the AI at work for a minute or two,
  so they show as "Screening…" / "Writing…" with no step number.
- **One action per row, by phase**: In progress shows the next thing to do (Decide, Pick projects, Pick profile,
  Review proposal) opening that workflow step, and **Mark as sent** when ready; Submitted and Closed show
  **Update status**. The job page's main button follows the same rule.
- **The server enforces the order**: Sent only once the proposal is finished; Viewed, Chat opened, Interview and
  outcomes only once it is Sent. The status dialog offers only "Sent" for a job that is ready to send.
- **Needs action** (In progress tab) counts the jobs waiting on a person. **Gone quiet** (Submitted tab) counts
  submitted jobs with no update for N days; N is the new setting "tracking.quiet_days" (5), added by
  `npm run seed:settings`.
- Server: `stageSql` now returns screening, decide, projects, profile, writing, review, ready, submitted, closed,
  skipped, failed; `phaseSql` groups them; `GET /screenings?phase=` and `stage=quiet`; the counters return per-tab
  totals. The list also returns days since the last update and days from sent to close.

### R13. Jobs list polish, click-for-detail, example jobs, capital letters (done)
- **"Where it stands" looks the same in every tab**: a coloured dot, the label, a detail line and a thin bar.
  In progress: "Projects pending / In progress · Step 2 of 5" with a partial bar. Submitted: the latest status
  ("Chat opened / Submitted · 1 d ago"), full blue bar. Closed: the outcome ("Hired" green, lost outcomes red,
  "Closed · 6 d after sending"). Not pursued: "Skipped" / "Screening failed", grey. AI at work: "Screening…" /
  "Writing…" with a spinner. `standing()` and `standsCell()` in `app.js`.
- **Result column redesigned**: a quiet Pass / Flag / Fail badge and the rule codes as small chips (fail codes red,
  flag codes amber), three at most then "+N".
- **Click for detail** (`popover()` in `app.js`): clicking the Result cell lists every fail and flag with its rule
  and the value behind it (new `GET /screenings/:id/flags`); clicking "Where it stands" shows the job's journey,
  every step with its date and who did it (from the timeline). Both link to the job. Escape or a click elsewhere
  closes them.
- **Tab layouts**: All (where it stands, result, client, profile, by, screened); In progress (adds budget, and the
  next-action button); Submitted (a **Sent → Viewed → Chat → Interview** strip instead of "Yes / - / -", last update
  in amber once it has gone quiet, sent date, Connects); Closed (outcome badge with the loss reason under it, days
  from sent to close, sent date, result); Not pursued (why: the skip note or the screening error). Saved column
  choices start fresh for the new layouts.
- **`npm run seed:examples`** (`scripts/seed-examples.ts`, dev/demo only): 12 example jobs, three in each of In
  progress, Submitted, Closed and Not pursued, with a report, a job posting, projects, a finished proposal, overrides
  and status history where their phase has them. Marked `raw_input = "[example]"` and titled "Example · ...";
  `npm run seed:examples -- --remove` removes them and everything attached. Loaded on Hamza's machine.
- **Capital first letters everywhere**: "Just now", "Today", "Waiting on someone", "Not recorded", "Not known",
  "Not yet", "None", "Default", "Primary", "Starter", "Yours", "Multi-select", "Any stated value", "Score", and the
  server's "Paste a job link or the job page text". Values the model writes in lower case ("not shown") are shown
  with a capital first letter on screen (`cap()` in `app.js`); the stored data is unchanged.

### R14. The Claude plugin saves its jobs, proposals and statuses through the MCP (done)
Built on top of Usman's MCP and tokens (his commit "Choose the AI in Settings ... import sheets through Claude (MCP)").
- **Decision (Hamza): the app stores what the plugin sends as is.** It never screens the job again or rewrites the proposal: the plugin
  is Claude itself. Every such job is marked `screenings.source = 'claude_plugin'` (migration `015_plugin_source.sql`), shown as
  "Claude plugin" in the Jobs list and "From the Claude plugin" on the job page.
- **New MCP tools** (`mcp/src/tools.ts`): `plugin_options`, `find_jobs`, `get_job`, `save_job`, `record_decision`, `save_proposal`,
  `update_status`, with instructions telling Claude the order (options first, find before save, never invent a reason). Documented in
  `mcp/README.md`.
- **New API** (`src/routes_plugin.ts`, plus lookups in `routes.ts`): `GET /plugin/options`, `GET /plugin/jobs` (by link, job id, text,
  phase), `GET /plugin/jobs/:id`, `POST /plugin/jobs`, `POST /plugin/jobs/:id/decision`, `POST /plugin/jobs/:id/proposal`, and
  `GET/POST /plugin/jobs/:id/status`, which is **the same handler as the website's** status endpoint, so the rules and the history are
  identical.
- **Rules kept**: one job per Upwork job id (a second save is refused with the existing job's number, unless `force_new`); continuing past a
  FLAG or FAIL needs a reason of the minimum length; Sent only once the proposal is finished; other statuses only after Sent; a lost outcome
  needs a loss reason; profiles must be active ones; project names not in the library are kept and reported back.
- **Tokens** (`auth.ts`): may now reach `/plugin/...` as well as imports and lookups. Still refused on the website's own pages, users,
  settings and admin (checked: 401 on /screenings, /admin/*, /settings, /dashboard).
- Plugin jobs are left out of every speed figure (time to proposal, dashboard averages): they arrive already written.
- Checked end to end through the MCP SDK client against the running app: options, find, save, duplicate refused, FLAG without reason
  refused, Sent before the proposal refused, proposal saved (unknown project reported), Sent, Viewed, lost without reason refused, get_job.
  The test job is #47 (marked as an example); the test token was revoked.
- Usman's own MCP test suite (`mcp/test/e2e.ts`) needs a scratch database on port 3055 and was not run here.

### R15. Gate instructions and Rules are separate, and combined for every job (done)
Before, the gate prompt (Upwork JobGate) held its own numbered FAIL and FLAG lists, and the Rules page held the same rules again as codes,
kept in step by hand. Now each thing lives in one place:
- **Gate instructions** (renamed from Upwork JobGate; URL still `#/skill`, table still `skill_versions`): only the method. How to read the
  job page, the derived values, accepted regions, services, tech stack, sample match and the report parts. Versions work as before.
- **Rules**: every FAIL and FLAG rule, once, with a new optional **How to apply** note (`rules.details`, migration
  `016_gate_instructions_and_rules.sql`). The exceptions that were in the old prompt moved there, e.g. F2 "A paid test is fine",
  G4 "A new client with no history is not flagged", G5 "No reviews yet is not a flag", F4/F5 pointing to their G6/G7 rescues.
- **For every job the model gets**: the active gate instructions, then RULES (active rules grouped as FAIL and FLAG, each line
  `F1. Rule. How to apply: ...`), then the fixed output contract and the project library (`gatePrompt` and `rulesSection` in
  `src/screening/contract.ts`). Retired rules are left out. A rule added or edited applies from the next job, no new gate version needed.
- **Each job keeps the rules it was screened against** (`screenings.gate_rules`, the rules as worded at the time). The job page chip
  reads "Instructions v3 · 22 rules" and opens the list; older jobs still show "Gate v1". The export has "Gate instructions version" and a
  new "Rules applied" column. `plugin_options` (MCP) now returns each rule's details too.
- **Gate instructions page**: a **See full prompt** button shows exactly what the model gets for one job (instructions in the editor + rules
  + contract). The Rules page edits the rule and its How to apply note together; the "Not in the prompt" warning is gone (nothing to keep
  in step any more).
- **Moving an existing install over**: `npm run seed:library` fills empty How to apply notes from `seed/library.json` and, if the active
  gate version still has its own FAIL/FLAG lists, saves `seed/gate-instructions.md` as a new version and activates it (once; logged).
  Here that made **version 3** active; versions 1 and 2 stay in the history. A fresh install imports `seed/gate-instructions.md` as v1
  (`seed/SKILL.md` is gone).
- Removed: `npm run gate:codes`, `scripts/gate-add-codes.ts`, `src/screening/gatecodes.ts` (they wrote codes into the old prompt).
- Checked: tests (the instructions hold no rule list, every rule and its note is in the prompt, the order is instructions, rules, contract,
  retired rules left out). A real GLM screening with version 3 returned FLAG with correct codes (G1, G2, G3, G8, G9, G15) and saved its 22
  rules; the job page chip, the rules list, the full prompt preview and the export were checked in the browser. The test job is #49 (marked
  as an example).
- Not changed: the Claude plugin's job-gate skill keeps its own copy of the rules. It could later read them through `plugin_options`.

### R16. One workflow view, wherever a job is opened from (done; visual check in the browser still to do)
- **Layout bug fixed**: the workflow's wrapper had the class `stepper`, which the small screening tracker also styled as a centred,
  wrapping flex row. The step bar, the step and the Previous/Next bar were laid out side by side at content width. The wrapper is now
  `.workflow`, and the old tracker style is gone.
- **Same frame for every entry point**: a new job (Screen a job), a job from the Dashboard, from the Jobs list, a job still screening and a
  job whose screening failed all show the same header and the 5-step bar. Screening progress and "Try again" now live inside step 1
  instead of separate layouts without the bar.
- **One header for a job** (`jobHeader` in `app.js`), shared by the job page and the workflow: back link, title with its buttons, one row
  of chips (plugin, who, when, profile, gate rules, Upwork post).
- **Dashboard "Needs attention"** opens a job waiting on you at its step, like the Jobs list's action button (`jobHref`, one rule for
  both; the dashboard query now returns `user_id`).
- **Previous / Next stay in view** (sticky at the bottom). On phones the two buttons share the width and "Step 2 of 5" is hidden (the bar
  shows it). Long titles wrap instead of pushing the buttons off.

### R17. Profiles and projects from the Claude plugin, added on demand, and a plugin comparison (done)
- **Comparison**: `PLUGIN-VS-SYSTEM.md` lists what this round closed and the 12 places the plugin is still more dynamic (industry-first
  matching, six proposal types, modules, screening answers, verification, signals, profile choice, rate, duplicates, link choice, quick
  picks, live sheet). Each needs a decision before building.
- **Profiles** (migration `017_library_from_plugin.sql`): `upwork_profiles` gets `lowest_price`, `github_url`, `services`, `industries`,
  `voice`, `signature`, `stats_allowed`, `submitted_by`, `rules`, `added_via`. The plugin's seven profiles are in `seed/library.json`
  (`profiles` are now records; a plain name still works) and in the local database. The Upwork profiles page edits every field.
- **Projects**: `projects` gets `landing_link`, `system_link`, `mobile_link`, `staging_link`, `case_study_link`, `overview`,
  `case_study_summary`, `added_via`. `seed/library.json` is now the live sheet "Stackup Project Tag Library" as of 2026-10-08: 43 projects
  (12 new), 105 tags (Industry: Sports, Event management, Social), every link, overview and case study. The proposal link (`live_link`)
  is the landing page, else the first store link, else the live system. The project editor and page show all of it.
- **`npm run sync:library`** (dry run, then `-- --apply`) now also sets each project's links, overview and case study from the file, makes
  its industries follow its Industry tags (creating missing industries), creates missing profiles and fills empty profile fields. Applied
  here: 12 projects created, 13 projects' tags updated, 3 industries and 6 profiles added.
- **The writer uses them** (`proposal/writer.ts`, `pipeline.ts`): SENDER now carries voice, signature, allowed Upwork stats and the profile
  rules (before the template); the code link is the GitLab account, else GitHub. PROJECTS carry the overview and case study summary.
  Figures from those, and from the allowed stats, no longer raise the "figure not in the facts" warning.
- **Added right away when missing**: new MCP tools `add_profile` (admins) and `add_project` (managers and admins), over
  `POST /plugin/profiles` and `POST /plugin/projects`. A new record is marked `added_via = 'claude_plugin'` (shown on its page); an existing
  one only gets its empty fields filled and missing tags added, never overwritten or removed. Unknown tags are left out and named.
  `plugin_options` now returns each profile's fields; `save_proposal` points to these tools when a profile or project is missing.
  Checked with a local harness against the database (create, fill, manager refused for profiles, bad link refused, unknown tag reported,
  industry linked); the test rows were removed.
- **Plugin v0.1.8** (`~/Downloads/stackup-proposals-0.1.8.plugin`, not in this repo): profiles are read from Upwork Pro; before saving a
  proposal it adds a missing profile or project to Upwork Pro and says so in one line.
- Tests updated (43 projects, 105 tags, the code link message). The MCP server is rebuilt (`mcp/dist`).

### R18. Two-way sync with the Google Sheet for projects, tags and profiles (built; needs the Google key to go live)
Decision (Hamza): the sheet "Stackup Project Tag Library" and Upwork Pro are **both** sources of truth. Something added in either is
added to the other, never discarded; edits in Upwork Pro write back to the sheet.
- **How it decides** (`src/sheets/merge.ts`, pure and tested): a three-way merge against the last synced copy of every record
  (`sheet_sync_base`). New on one side: created on the other. Changed on one side: copied over. Tags merge one by one (added on either
  side: added to both; removed on one side: removed from both). First sync: an empty field takes the filled one. The same field changed
  differently on both sides: the sheet's value is kept and the app's value goes to **Conflicts** with "Use app" (nothing lost).
  Removed on one side: removed on the other, but in the app it is only **put aside** (`sheet_removed_at`; jobs may point at it), and a
  **brake** holds back any run that would remove more than 20% (and more than 3) of one side's records.
- **The sheet** (`src/sheets/model.ts`): columns found by header text. Project Tagging (fields, tag columns with "x"), Tag Dictionary
  (category, weight, description; counts and notes untouched), and a new **Profiles** tab the first sync creates (Name, Active, rates,
  links, services, industries, voice, signature, stats, who submits, rules, notes). A new tag gets a dictionary row and a column at the end
  of its category group; only owned cells are written (formulas and other columns are left alone).
- **Google access** (`src/sheets/google.ts`): a service account, signed with node:crypto (no new package). `.env`:
  `GOOGLE_SERVICE_ACCOUNT_FILE=/path/outside/the/repo/key.json`; share the sheet with the key's client_email as an Editor. Key files are
  git-ignored. Without a key the sync stays off and the app works as before.
- **When it runs**: the worker every `sheet.sync_minutes` (Settings, default 10, 0 = off); a few seconds after any edit to projects,
  tags, categories, industries or profiles in the app or through the plugin's add tools; and **Sync now**. One run at a time (MySQL lock).
- **Sheet sync page** (Admin): connection (or setup steps), Sync now, conflicts with Keep sheet / Use app, the last 20 runs with what
  changed. Migration `018_sheet_sync.sql` (base, runs, conflicts, `sheet_removed_at` on projects, profiles and tags).
- **Checked**: unit tests for the merge and for reading/writing a sheet (fake sheet); a preview against the real sheet and database (the
  first real sync will only create the Profiles tab with the 7 profiles: projects and tags already match); and a full scenario on a throwaway
  copy of the database (edits both ways, new rows both ways, a conflict, a repeat run that changes nothing, removals both ways). The copy was dropped.
- **Plugin v0.1.9** (`~/Downloads/stackup-proposals-0.1.9.plugin`): tag weights from the sheet's Tag Dictionary; profiles from Upwork Pro
  or the sheet's Profiles tab.
- `npm run sync:library` (file based, R17) still works for setups without Google access.

### R19. One library and one writing guide for every Claude (done)
Several Claudes (one per Upwork profile) will run the plugin against the same Upwork Pro. Their data must match, and a local edit to one
copy of the plugin must not change what it uses. So the plugin no longer carries its own data; it reads it from Upwork Pro.
(Hamza: the Google key could not be created, so the R18 sheet sync stays off; it turns on by itself once a key is set.)
- **Project library and tag dictionary**: new MCP tool `get_library` (`GET /plugin/library`): every active project with its proposal link,
  landing, system, mobile, staging and case study links, overview, case study summary, industries and tags, plus every tag with its category,
  match weight and description, and which categories are compliance. The plugin matches and tags from this instead of the Google Sheet.
- **Writing guide**: new tables `writing_docs` and `writing_doc_versions` (migration `019_writing_guide.sql`), seeded from the plugin's files
  (`seed/writing/*.md`, `npm run seed:writing`): the six proposal types, writing rules, banned phrases, modules, screening answers and the
  verification checklist. New MCP tool `get_writing_guide` (`GET /plugin/writing-guide`): the types with when each is chosen and its length
  (read from the text), all rules, and a type's full text on request.
- **Writing guide page** (Proposal setup, everyone reads, managers and admins edit): one card per document; each opens an editor with every
  version kept (load an old version and save to restore) and a switch to turn a document off.
- **Plugin v0.2.0** (`~/Downloads/stackup-proposals-0.2.0.plugin`, not published): project-matcher and job-signals read `get_library`;
  proposal-writer reads `get_writing_guide`; profiles come from `plugin_options`. The bundled files stay only as a fallback when Upwork Pro is
  not reachable. "Project stage counts 0 for now" stays as a plugin note, since the library weights say 2.
- The app's own writer does not use the writing guide yet (it still uses its templates); that is difference 2 in `PLUGIN-VS-SYSTEM.md`.
- Still to do for several Claudes: host Upwork Pro where every Claude can reach it (it runs on localhost now), and a plugin version check.

### R20. Sheet sync removed; Claude connects by signing in (OAuth) (done)
- **Sheet sync is gone** (Hamza: the Google key could not be made, and Upwork Pro is the one library every Claude reads since R19):
  the Sheet sync page and its Settings, the worker timer, the sync after edits, `src/sheets`, `routes_sheets.ts` and their tests.
  Migration `020_drop_sheet_sync.sql` drops its tables and the `sheet_removed_at` columns (never used). `sync:library` (file based) stays.
- **Sign in from Claude instead of copying a token**: each person adds the connector link in their own Claude, signs in with their own
  Upwork Pro email and password, and allows it; everything that Claude saves is recorded as them. Built to the MCP authorization spec
  (OAuth 2.1): discovery documents, dynamic client registration, authorization code with PKCE (S256), access tokens of 1 hour that are
  ordinary `api_tokens` of that person (same limited reach as a personal token), refresh tokens of 60 days used once and replaced
  (a reused one disconnects the whole connection). `src/oauth.ts`, the sign-in page `public/oauth.html` + `oauth.js` (sign in, see
  which app asks and as whom, Allow or Deny), migration `021_oauth.sql`.
- **The HTTP MCP** (`mcp --http`) now answers an unsigned or expired request with 401 and the sign-in pointer, serves its protected
  resource metadata, and checks each token with the new `GET /api/plugin/whoami`.
- **Connect Claude**: a "Connect with sign-in" card with the connector link and steps, and the person's connections with Disconnect.
  Personal tokens stay below it for a local setup; the hourly sign-in tokens are not listed there.
- **Settings** (`.env.example`): `PUBLIC_URL` and `MCP_URL` (backend), `UPWORK_PRO_PUBLIC_URL` and `MCP_URL` (MCP). See `mcp/README.md`.
- Checked locally end to end with the MCP SDK's own OAuth client (every step above, plus Deny, a foreign return address and no PKCE
  refused); the test rows were removed. Not tried from claude.ai yet: that needs Upwork Pro online with https.

### R21. Templates and the Writing guide are one: the six proposal types, used by the app and the plugin (done)
Before: the app's writer used three long SOP templates, and the plugin used its own six proposal types and rules, so the same job
could be written two different ways. Now there is one Writing guide.
- **The six types are the templates** (`seed/templates.json`): Type 1 Standard build, 2 Structured submission, 3 Invite, 4 Rescue or
  takeover, 5 Architecture or consulting, 6 Small fix. Each keeps its text (with "Chosen when" and "Length"), a starter signal mapping
  and its samples; they are edited where templates were (format, prompt, signals, samples), reached from the Writing guide.
- **Three new signals** (`seed/signals.json`, detected like the others): 17 Invite, 18 Role seniority, 19 Scope size, so the app can
  pick Invite, Architecture and Small fix. Starter weights follow the plugin's order: structured submission (6) wins, then invite (5),
  then the rest; nothing matching gives Type 1.
- **The shared rules feed the app's writer too** (`src/proposal/guide.ts`): writing rules, banned phrases, modules, screening answers
  (written after the cover letter under "Screening answers") and the checklist go into the writer's and the chat's prompt, below the
  non-negotiable rules. **New checks**: banned phrases (with "[project]" placeholders), dashes, and the cover letter's length against
  the type's range (screening answers not counted).
- A type without samples borrows the shared ones (tone only). The 15 samples now sit on Type 1; assign others per type as you like.
- **The three SOP templates are retired** (inactive, shown under Retired, kept for the proposals already written with them). Their
  content was not merged automatically: review them and move anything worth keeping into a type or a rule.
- **Writing guide page**: Proposal types (cards with when chosen, length, signals, samples; Add a type), Rules for every proposal,
  Retired. The Templates menu item is gone (`#/templates` opens the Writing guide); the app says "proposal type" throughout.
- The plugin's `get_writing_guide` now lists the types from the templates, so both read the same text.
- Checked: tests (the six types and their lengths, every starter mapping resolves, the ranking order, banned phrases, dashes, length);
  a real GLM draft for job #35 (Type 1, 193 words, no check warnings, nothing saved); the page in the browser.

### R22. One job page in tabs, one press per step (done; phone widths not checked yet)
- The read-only job page and the step-by-step page are one page (`jobPage` in `app.js`): the job header, then tabs that stay at the top:
  Overview, Job post, 1 Screening, 2 Projects, 3 Profile, 4 Proposal, 5 Tracking, History. Steps not reachable yet are greyed out.
  It opens on the step waiting on you (a new job on Screening), else on Overview. Links: `#/s/12/<tab>`; old `#/s/12/work?step=N` still work.
- Overview: one "next action" card with its button, the key facts, the reason it was continued, the proposal text with Copy.
- Screening: the decision first (Continue or Skip), then the report; the job post has its own tab. Job #50: 2.5 screens (was 4.6).
- One press: continuing past a FLAG or FAIL (the reason is the confirmation, no pop-up); new "Skip this job"; Projects "Confirm and
  continue" saves and opens Profile; Profile writes the proposal and opens it; "Finish the proposal" opens Tracking.
- Proposal: the editor left, chat and "how it was written" beside it on wide screens.
- Checked in the browser on jobs #50 and #35: every tab 1.2 to 2.6 screens, no console errors.

## Feedback from Hamza's testing
Both items are done in R2: the whole project card is clickable, and Save tracking ends on a "Job complete"
screen.

## Next for Usman
1. Review R1 to R7 on this branch (one commit each) and sign in to try each page.
2. Update the README for the new pages (Dashboard, Jobs filters and export, Rules, Settings, Logs) and the
   migrations.
3. Rules: done in R15 (the rules now come only from the Rules page; gate version 2 is superseded by version 3).
4. UI polish still open: the Proposal step itself, and phone widths for the new tables and dashboard.
5. Profiles: all seven exist now (R17), but most fields are empty. Fill them under Upwork profiles.
