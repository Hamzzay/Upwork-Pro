# New updates (branch `hamza`)

Hamza's changes, made on top of `main` (GLM through Z.ai). Usman: continue from this branch.
Goal of this round: cut the time from pasting a job to having a proposal. It went from **6:05 to 3:23**
on GLM 5.3 (same job, same steps). Screens are unchanged; all changes are in the backend.

## Before you run it

```
cd backend
npm install            # exceljs is now a runtime dependency (export)
npm run migrate        # applies 008 to 034: early drafts, tracking, settings, AI calls, status dates, posting and history, imports, plugin source, gate split, library fields, sheet sync (and its removal), writing guide, sign-in from Claude
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

### R23. The job page, cleaned up after a full review (done; phone width not checked yet)
Hamza's review: buttons all over the place, Tracking doing the same job twice, decisions below supporting detail, mixed text sizes,
clumsy active tabs, profiles one per row. Measured first (12 jobs, every tab), then rebuilt to these rules (comments in `jobPage`):
- **One place for buttons**: the right end of the tab row, which stays on screen. Sections hand their buttons to it (`actionsFor()`, tied
  to the tab that made them, so a section that loads late never puts buttons on another tab). No header buttons, no bottom bar.
- **No greyed-out buttons**: a button appears only when it does something; a missing input is explained inline (Continue without a
  reason, Confirm with no project, no profile picked).
- **Decision first** on every tab: Screening opens with the verdict and the Continue/Skip decision (reason box right there), then flags,
  fit and notes; job, client and competition facts are folded. Projects shows the cards first; "why these projects" is folded.
- **Tracking** is one thing now: status now, the status history with dates and reasons, Connects, boost and notes. **Update status** and
  **Edit details** in the tab row. The old Tracking form (a second, looser way to set the same statuses) is gone.
- **Profile**: cards in a grid (name, rate, headline, services), the chosen one marked; Confirm and write proposal, or Use this profile
  instead when you pick another.
- **Proposal**: Copy, Save version (only after an edit), Finish proposal in the tab row; the warnings are one line that opens.
- **Overview**: one line on what is next, and only the facts that have a value. **Header**: title, verdict badge and step on one line,
  then one quiet line (who, when, profile, gate rules, Upwork post).
- **Typography**: five text styles on the whole job page (title 22, heading 16 semibold, body 15, label 13, small 12), no uppercase.
  **Tabs**: plain text, a thin underline on the active one, a small check on finished steps.
- **Fixes found by the audit**: "null" printed at the top of the proposal card, and in the version note for non-owners; a job that
  loads after you moved to another one no longer draws over it; buttons of a late-loading tab no longer land on another tab.
- Removed: the old decision cards, the tracking form and its summary panel, the stepper and bottom bar styles.
- **Checked** in the browser, every tab of 13 jobs at every stage (decide, projects, review, proposal failed, ready, plugin, submitted,
  closed, skipped, screening failed): every button in the tab row, nothing greyed out, at most 5 text styles, no "null"/"undefined"/"NaN",
  no console errors, each tab 1 to 1.8 screens. Interaction checks without changing data: Continue with no reason, picking another
  profile, leaving a tab. Not checked: phone width (Chrome would not shrink below 1200 pixels).

### R24. A backup of the setup data, to go live with (done)
Everything Upwork Pro needs, without any job, user or token, is in `backend/seed/setup/setup.json`: the gate instructions (all versions),
rules, signals and their values, the proposal types with their signal mapping and samples, the writing guide, tag categories and tags,
industries, projects (with their tags and industries), Upwork profiles and settings. Rows are matched by name or code, never by id.
- `npm run setup:export` writes it (run it after changing setup in the app, then commit the file).
- `npm run setup:import` shows what a restore would add or change; `npm run setup:import -- --apply` restores (adds what is missing,
  makes what exists match the backup, deletes nothing). Going live: migrate, `npm run seed` for the admin, then the restore.
- New setup tables (Loom videos, certifications) go into `SPEC` in `scripts/setup-data.ts` so they are backed up too.
- Checked: restored into a new empty database, exported it again, and the two files are identical; the test database was dropped.

### R25. The team plugin's proposal work in Upwork Pro: eight types, type selection, writing guide, certifications (done)
The team improved proposal writing in their copy of the plugin (v0.2.7, before the Upwork Pro connection). That work is now in Upwork
Pro, so the app's writer and every Claude use it.
- **Eight proposal types** (`seed/templates.json`): types 1 to 6 updated (longer: Type 1 and 4 now 170 to 240 words, 5 is 180 to 260, 6 is
  70 to 120), and **Type 7 Problem first** and **Type 8 Approach first with questions** added (built from the old SOP templates).
- **Type selection as the team wrote it** (`type-selection.md`, now in the Writing guide): per type, required signals (alternatives in a
  group), supporting signals (one point each) and signals that rule it out; priority groups 2, then 3, then 4/5/6, then 1/7/8; Type 1 when
  none qualifies. `rank.ts` does this (older weight rows still work); migration `022_type_selection.sql` adds `role`, `req_group` and
  `is_default`. The type editor sets each row's role and group and the default type; the Proposal tab shows what each type met and what
  ruled it out.
- **Signals**: "Rescue / extend" is now "Rescue / takeover", with new values "Extend existing product" and "Rebuild / migration"; new
  signals 20 Platform, 21 Job focus, 22 Decisions left open.
- **Writing guide** (new versions; the old text stays): writing rules, banned phrases, modules (with the estimate answer rule), screening
  answers and the checklist from the team. The certification rule is **strict** (Hamza): only when the client requires a certification,
  only one listed on the sending profile, never invented; no match means real experience plus a "Needs your eye" note.
- **Certifications** per profile (Upwork profiles, one per line); the writer sees them with that rule. The dash in a "Project name –
  Project title" line (the team's project format) no longer raises a warning.
- **Rules**: F6 Generic mass invite (fails boilerplate invites) and G18 Any other risk. Our G17 keeps its meaning.
- **Upgrading a database**: `npm run migrate`, then `npm run upgrade:guide` (safe to run again). Fresh installs get it from the seeds.
- Checked: tests (the eight types and lengths, every selection row resolves, the selection order on nine cases, the default, dashes);
  GLM read the 22 signals on three example jobs and the type was right each time (WordPress tweaks: Small fix; SaaS MVP: Standard build;
  a small automation: Small fix); the Writing guide page in the browser. The setup backup is re-exported.

### R26. The project library from the team's new sheet (done)
`seed/library.json` is now the team's sheet "Stackup Project Tag Library" (`19ZEAEguo0ZPyhM0diq2WAs6kf5sA9YfsiBmrknKpxss`), 42 projects:
every case study rewritten as Project / Problem / ... (42 of 42), overviews and links corrected (Navience's link is its live system now),
Doctoria added (MiDocRD renamed); MiDocRD and Verkehrbox are switched off, not deleted (old jobs point at them). "Showable publicly" is
stored but still ignored (Hamza). Applied here with `npx ts-node scripts/sync-library.ts --apply` (dry run first without `--apply`);
the setup backup is re-exported.

### R27. Project matching like the team's matcher: platform, industry pools, an alternative, the job needs line (done)
- **Platform first**: a project that does not run on what the job builds is left out (a web job never gets a mobile-only project, a
  mobile job never a web-only one; a desktop job takes web). What a project runs on comes from its links and tags; a project with
  nothing known is kept. Backend jobs and jobs that state no platform are not filtered.
- **Industry pools**: projects from the job's industry come first, then related industries, then the rest, whatever their score.
  Industry tags no longer count in the score. Each industry has a "Related industries" list (Industries page, Edit), filled from the
  team's industry map (`seed/industries-related.json`, by `npm run upgrade:guide` only where empty).
- **Alternative from another industry**: when a project outside the list shown scores at least 1.5 times the best same-industry
  project, it is shown under the list with that label. Never recommended, but it can be chosen. Only when the list has same-industry projects.
- **Job needs**: one line above the projects ("Web · SaaS platform · Appointment booking · Real estate"), saved with the matching.
- Each project card says its pool and what it runs on ("Same industry · Runs on web").
- Migration `023_matching_pools.sql` (`industries.related`; `job_matches.pool`, `alternative`, `platform`; `screenings.job_needs`).
  Upgrading: `npm run migrate`, then `npm run upgrade:guide`. Old matches show as before until the job is matched again.
- Checked: tests (platform filter, pools, the alternative and when it is not added, the job needs line; the older tests updated now
  that industry is not scored); job #50 matched again on GLM (four Real estate projects, then Apex from a related industry); the job
  page and the industry editor in the browser (five text styles, no console errors). The setup backup is re-exported.

### R28. Loom videos per profile, the plugin's library fits again, and delete buttons work (done)
- **Loom videos** (Library, Loom videos; admins): several short videos per Upwork profile, each with a title, the Loom link, what it
  shows, an order and the job tags it suits (industries included). On a job's Profile step each profile card names its video that
  fits the job best: the one sharing the most tag weight with the job (ties: more shared tags, then the order). A video with no tags
  is never suggested. Proposal types that link a video come later, once Hamza picks the 5 to 7 topics per profile.
- The Claude plugin gets the videos in `get_library` (`loom_videos`, per profile with tags). They are in the setup backup too.
- Migration `024_loom_videos.sql` (`loom_videos`, `loom_video_tags`).
- **The plugin's library had stopped fitting**: since the 42 project sheet (R26) `get_library` was 99,000 characters and the MCP cut it
  to a note. Now case studies are left out by default (`has_case_study` says one exists) and the plugin asks for them by name once the
  projects are chosen (`case_studies: ["Breesy", "Apex"]`); answers are compact JSON and the limit is 90,000 characters (about 22k tokens).
  Default answer now about 53,000 characters. Rebuild the MCP (`cd mcp && npm run build`) and restart Claude to pick it up.
- **Every delete button failed with "JSON only"** (projects, industries, tags, categories, profiles, tokens, connections, proposal
  types, samples, signals, values), since the first commit: the server only takes JSON on changes, and a delete sent no body. The app
  now always sends JSON on changes.
- The tag search printed "null" for each category with no match (project and video editors). Fixed.
- The setup restore now finds a row by its whole key when it re-links tags (needed for videos: profile plus title).
- Checked: tests (the video choice: weight, ties, order, nothing shared); in the browser: add a video with tags, the suggestion on job
  #51's Profile step, delete it; delete calls on industries, projects and tags reach the server; a backup restore of a deleted video
  brings it back with its tags and a re-export after it is identical; the plugin library with and without case studies.

### R29. The Claude plugin v0.3.0: the team's v0.2.7 work with the Upwork Pro connection (done)
The plugin's source is now in this repo (`plugin/`); the installable file is `~/Downloads/stackup-proposals-0.3.0.plugin` (zip of
`plugin/`: `cd plugin && zip -qr ../stackup-proposals-x.y.z.plugin .claude-plugin README.md skills`). Not published.
- From the team (v0.2.7): eight proposal types and their files, type selection by required, supporting and excluding signals, three new
  signals (Platform, Job focus, Decisions left open), the matcher's "Job needs" line, platform filter, core workflow check and link
  choice by platform, the writing rules, banned phrases, modules and checklist, gate rule F6 Generic mass invite, certifications per profile.
- Kept from ours: everything is read from Upwork Pro (`get_library`, `get_writing_guide` with `type_selection`, `plugin_options`) and saved
  to it (`save_job`, `save_proposal`, `update_status`, the job-status skill); missing profiles and projects are added right away. The
  bundled files are only a fallback. Connecting is by signing in (R20), no token to copy.
- Settled differences: G17 keeps our meaning (work that breaks platform rules) and "any other risk" is G18, as on the Rules page.
  Certifications are strict (only when the client requires one, only from the profile; otherwise "No matching certification on this
  profile." under "Needs your eye"), not "pick the relevant ones" as in the team's copy. The team's daily proposals sheet tab is not
  used: Upwork Pro keeps every proposal. Case studies are fetched only for the chosen projects (R28).
- Still different from Upwork Pro's own matching: the team's matcher drops projects under a tag score of 6 and counts Project stage
  tags as 0 until their tagging cleanup; Upwork Pro uses its Settings (minimum score) and the Tag dictionary weights.
- Checked: `claude plugin validate` passes; every file a skill names exists; the reference files match Upwork Pro's writing guide.
  Not yet run end to end in Claude with a real job: install it, sign in to the connector, and try `/proposal` on one job.

### R30. One design for every screen (done)
Hamza: the job page looks right, the rest of the platform does not match it. Every screen was read and opened (26 screens, the
dialogs, phone width, dark mode), then rebuilt on one system. The rules are in `DESIGN.md` (the 20 user experience rules the
platform follows, the text styles, colours, layout and the shared parts); the request list with what was checked is `CHECKLIST.md`.
- **One stylesheet** (`style.css`, rewritten): seven text styles and two weights everywhere (no capitals, no uppercase table headers
  or section titles), flat cards (a shadow only on dialogs, menus and messages), one button height, one badge, one tab style, one way
  to show facts (`dl.facts` / `dl.kv`), one notice, one folded section. The page spaces its own parts, so the spacer elements and
  inline margins are gone.
- **One page header** (`pageHead(title, sub, actions, { back, badges })`): the back link above the title, the status badge beside
  it, one quiet line, buttons on the right. The five detail pages (project, industry, signal, proposal type, writing guide document)
  had their own "Back to" link and put the badge among the buttons.
- **One badge**: Pass, Flag and Fail are words everywhere (`verdictBadge`); on or off is `onOff(active)`. "Inactive" badges used to
  pulse like a loading state.
- **One table**: quiet headers, the row's buttons right aligned in one cell (`acts`), and Delete inside the edit dialog (Upwork
  profiles had it in the row). `dataTable(heads, rows)` builds it.
- **Dialogs**: the title and the buttons stay in view while the form scrolls; a destructive confirm is a red button. The browser's
  own `confirm` pop-ups (four in the proposal editor, one on leaving a tab) are the app's dialog now (`ask`).
- **Tabs**: Jobs, a job, the tag dictionary and Logs use the same tabs (Logs had a segmented control, the dictionary a third style).
- **Sidebar**: the links scroll on their own so the person's name and Sign out never fall off a short screen; on a phone it is a top
  bar with a Menu button (it was a row of icons without labels).
- **Dates** read "7 Oct 2026" in lists (they were ISO in some, relative in others). Logs show readable action names on one line.
- **Rules** is one list with a Type column (it was two tables). **Loom videos** uses card heads like every other card.
- **Fixed on the way**: saving a tag failed (the dialog read a field that does not exist); a proposal type with no samples printed
  "null"; Settings did not show three settings (outcomes that count as lost, loss reasons, days before "gone quiet").
- Checked: `node --check`; a script opens 128 routes (every page, and every tab of 12 jobs at every stage) and finds no console
  error, no "null" / "undefined" / "NaN" and no sideways scroll; 16 pages at phone width (390); dark mode; the employee's view
  (admin pages stay closed, another person's job stays closed).

### R31. The same filter bar on every list, and every list has one (done)
Hamza: the filters were half a row here, a row and a half there. Now one bar (`filterBar`, `fSearch`, `fSelect`, `dateField`, and
`listCard` for any list held in memory): a search box two columns wide, every filter one column of the same grid, the list's own
buttons at the right end, and "Clear filters" only while something is filtered. Search, filters and the page are kept in the link.
| List | Filters |
| --- | --- |
| Jobs | search, from, to, step, rule, profile, person, outcome, proposal type, where it was written, only mine |
| Projects | search, industry, tag, content (case study, link, tags), status |
| Industries | search, status |
| Tag dictionary | tags: search, category, status. Categories: search, kind |
| Upwork profiles | search, status, setup (rate and headline set or not) |
| Loom videos | search, profile, status, tagged or not |
| Signals | search, layer, kind, status |
| Writing guide | search, kind, setup (types without samples or signals, turned off) |
| Rules | search, fail or flag, status, fired or never |
| Users | search, role, status |
| Logs | action, person, from, to; AI calls: job type, result, model, from, to |
| Gate instructions and writing guide versions | search |
| Dashboard, Reports | period, profile, person (and for Reports: dates by screened or sent, where written, gate result) |
Date filters say "From" and "To" inside the control (they were two unlabelled date boxes). Checked by the same script: on every
list a search that matches nothing shows the empty state and Clear, Clear brings the rows back, and every dropdown filters.

### R32. Reports: every trend, and the Loom video that went with a proposal (done)
- **Reports page** (sidebar, under Jobs; everyone, an employee sees their own jobs). `GET /reports` with the Jobs list's filters;
  the counting is pure code in `src/reports.ts` (tested without a database).
- **The top**: sent, view rate, chat rate, interview rate, hire rate, Connects per hire; the funnel with each step as a share of the
  one before; jobs and proposals by week; how long things take (paste to proposal, sent to first view, to chat, to close).
- **What is working**: for profile, proposal type, project, industry, person, Loom video, where it was written, day sent and boost,
  the group with the best rate, against the others together. Only groups with at least 3 sent proposals, and it says so when there
  are too few.
- **27 reports of the same jobs**, each with the funnel and the rates per group: profile, person, proposal type, how the type was
  chosen, project attached, number of projects, industry, job tag, signal, rule fired, gate result, decision, where it was written,
  Loom video or none, which Loom video, boost, Connects spent, proposal length, speed to proposal, day sent, time sent, client
  country, job type, experience level, outcome, why lost, week. One opens in full ("Break it down": sortable columns, "At least N
  sent" to hide small groups); all 27 are on the page as small cards.
- **Every row opens its jobs.** The Jobs list (and the export, which uses the same filters) can now filter by proposal type, where
  it was written, a tag, a project shown, with or without a Loom video, and the date sent (`ptype`, `source`, `tag`, `project`,
  `loom`, `sent_from`, `sent_to` in `listFilters`). **Export** saves all 27 as one CSV.
- **Loom video per proposal** (migration `025_loom_on_proposals.sql`: `screenings.loom_video_id`, `loom_video_title`): on a job's
  Tracking tab, Edit details has "Loom video sent with the proposal" (the sending profile's videos). Without this, "video against no
  video" could not be counted. Run `npm run migrate`.
- Not reportable yet, because it is not recorded: which screening answers were used, and the client's reply text.

### R33. The MCP reads jobs in bulk for analysis (done)
Hamza: later I want to pull 500 jobs, or the jobs between two dates, with everything, into my Claude to see which got viewed, which
got a chat, which proposal worked.
- **`analyze_jobs`** (`GET /plugin/analysis/jobs`): one row per job as a list of cells with the column names once, newest first, with
  the Jobs list's filters plus `profile_name` and `person`. Standard columns cover who, profile, where written, gate result, rules,
  decision, type, projects, industry, length, Loom video, Connects, sent / viewed / chat / interview with times, outcome, loss
  reason, country, budget. `include` adds client facts, tags, signals, flags with their values, status history, the job post and
  the proposal text. **An answer is never cut off**: a page stops at about 80,000 characters and returns `more` and `next_after`.
  500 jobs take about 3 calls with the standard columns, about 17 with everything.
- **`get_trends`** (`GET /plugin/analysis/report`): the Reports page as numbers, so Claude does not count by hand.
- **Plugin v0.4.0**: new skill `job-trends` (which tool to use, read every page before analysing, give the sample size with every
  rate). Zip it as before; rebuild the MCP (`cd mcp && npm run build`) and restart Claude.
- **Checked**: `npm run test:read` in `mcp/` (new, read only, safe on the real database): all 14 checks pass against the running app
  (every read tool answers whole; `analyze_jobs` returns every job once across its pages; `get_trends` agrees with the rows). Paging
  forced with small pages (3, 6 and 12 pages, no job lost or repeated). The write tools run end to end on a throwaway job (save,
  duplicate refused, decision without a reason refused, Sent before the proposal refused, proposal, Sent, Viewed, a loss without a
  reason refused, lost, read back), then the job was removed and the test token revoked. The scratch database suite
  (`mcp/test/e2e.ts`) was not run: the app's database user may not create a database.
- A real 500 job run could not be made (the database holds 28 jobs); the paging is unit tested with 500 rows instead.

### R34. The team guide, with pictures (done)
`guide/index.html` (open it in a browser; it prints well too): 53 pictures of the finished design, each with numbered markers and
a list under it saying what each number is. Sections: start here (roles, the layout, phones), the daily job without Claude (screen,
decide, projects, profile, proposal, send, status, Connects and Loom), finding and following jobs (tabs, filters, columns, export),
working with Claude (connect, the plugin, what to say), adding and managing the library (projects, industries, tags, profiles, Loom
videos), how proposals are written (signals, writing guide, types, rules, gate instructions, settings, users), reading the numbers
(Dashboard, Reports, Logs), and five habits with a "when something goes wrong" table.
- The text is in `guide/build.py`; run `python3 guide/build.py` after editing it. Pictures are in `guide/img/`.
- The job in the pictures was an invented posting run through the real flow with the real AI (which also proved the redesigned job
  page end to end: screen, continue, projects, profile, proposal, finish, sent, viewed, details). It was removed afterwards, with the
  two sign-ins made for the checks.
- Two pictures were taken before the marker style was tidied (the "waiting" and "decide" ones); they are readable but denser.

### R35. The guide is served with the app (done)
The team guide is at `/guide/` on the same address as Upwork Pro, with a **Guide** link in the sidebar (it opens in its own tab).
Signed-in people only (`server.ts`: `/guide` goes through `attachUser`; anyone else is sent to the sign-in page), because its
pictures show our jobs and profiles. It is served from the `guide` folder at the top of the repository, so a `git pull` updates
it and the server needs nothing extra. Checked: signed out, the page and a picture redirect to sign-in; signed in, both load.
The sidebar link itself was not looked at in a browser. `SERVER-SETUP.md` (new) is the step by step for putting it all on a server.

### R36. You choose the proposal type before anything is written; the connector's icon (done)
Hamza: after the projects I was never asked which type of proposal to write. It should ask first, suggest, and write only that type.
- **Confirming the profile no longer starts the writing.** The Proposal tab now opens on "Which type of proposal?": the type the
  job's signals suggest (already selected), then the other types that fit, then the near fits, then the ones the signals rule out,
  each with when it is used, why it fits or not, its length and sample count. Five are shown, "Show all types" lists the rest.
  **Write the proposal** (tab row) writes only the chosen type. While the signals are still being read the types are listed
  unranked and can still be chosen; the suggestion appears by itself.
- New stage **Proposal type pending** (step 4 of 5, between Profile and Review): in the Jobs list, its filter, Needs action, the
  dashboard and the Overview tab. Jobs that had a profile but no proposal used to read "Writing…" forever; they now read this.
- Server: `GET /screenings/:id/proposal/types` (`typeChoices` in `pipeline.ts`, one ranking shared with the writer);
  `PUT /proposal-profile` no longer queues a proposal; `POST /proposal/start` records a choice equal to the suggestion as "from the
  signals" (so the early draft can still be used) and anything else as "by hand", which is what Reports, "How the type was chosen"
  now compares.
- **The Claude connector showed a different icon from the browser**: the site only had `favicon.svg`, and `/favicon.ico` answered
  404, which is what Claude asks for. Added `favicon.ico`, `icon-192.png`, `icon-512.png` and `apple-touch-icon.png`, made from the
  same logo, and linked them from both pages. Claude may keep its old icon for a while; removing and adding the connector refreshes it.
- Checked with a real job and the real AI: after the profile no proposal existed and the stage read "Proposal type pending"; five
  types were offered with the suggestion selected; a different type was picked and exactly that type was written, recorded as chosen
  by hand. The guide has the new step and picture. The server and the worker were restarted.

### R37. The Loom video is chosen before writing and its link is in the proposal (done)
Hamza: the client asked for a Loom; the Profile step named the video that fits, but I was never asked to choose it, and the
proposal had no Loom in it. (Until now the video was only a suggestion on the profile card: the writer never received it.)
- **Chosen on the same screen as the proposal type** ("Send a Loom video with it?"): the sending profile's videos and "No Loom
  video". When the job post asks for a video (`asksForVideo`: Loom by name, or a recorded or intro video), the one that fits the
  job's tags best is already selected; otherwise none is. If the post asks and the profile has no videos, a warning says so.
- **The writer gets it** (`SenderFact.loom`): the title, what it shows and the link, to include once on its own line after one
  sentence. With none chosen the writer is told not to mention or promise a video. The chat revision gets the same facts.
- **Checked after writing**: the Loom link is an allowed link, and a proposal that leaves it out gets a warning.
- **Recorded on the job** (`loom_video_id`, `loom_video_title`, from R32), so Reports, Loom video, fills in by itself. It can still
  be changed under Tracking, Edit details; write the proposal again to put the new link in.
- A proposal with a video is never taken from the early draft (that draft was written without one).
- `POST /proposal/start` takes `loom_video_id` (a video of the sending profile, or null); `GET /proposal/types` returns `loom`.
- Checked with a real job whose post asks for a Loom, and the real AI: the video was offered and selected, the link was in the
  proposal after a sentence about it, the job recorded it, and the writer warned that its sentence said more than the video's
  description. Tests cover the wording that counts as asking for a video, the writer's facts and the link check.

### R38. The plugin asks for the Loom video too; an admin can discard a job (done)
- **Plugin v0.4.1** (`~/Downloads/stackup-proposals-0.4.1.plugin`): the plugin already asked for the proposal type (step 8). New step
  8b asks which of the sending profile's Loom videos to send, or none, recommending the best fit when the post asks for a video; the
  writer puts the link in; `save_proposal` takes `loom_video` (the video's title, or null for none) and Upwork Pro records it on the
  job. Checked against the running app: an unknown title is refused with the profile's titles, a chosen one is saved, leaving it out
  keeps what was there, null clears it. Not run inside Claude itself.
- **Discard a job** (admins only; Hamza: test jobs should not show in any list or number). On a job's Overview tab, **Discard job**
  asks first, with an optional reason. The job then leaves the Jobs list and its counters, the Dashboard, Reports, exports, the rule
  counts, and everything Claude reads or writes (`listWhere` now always adds `discarded_at IS NULL`, so every list and number that
  uses it follows). Its owner and managers get "Not found". The worker skips its queued work. The same Upwork job can be screened
  again. Nothing is deleted: in the Jobs list an admin switches **Live jobs** to **Discarded jobs** and presses **Restore**.
  Migration `026_discard_jobs.sql` (run `npm run migrate`); `POST /admin/screenings/:id/discard` and `/restore`; both in the Logs.
- Checked with 19 calls against the running app (a manager refused, each place counted before and after, restore brings the numbers
  back), and the screens as an admin. The guide has both steps.

### R39. The plugin is downloaded from the app (done)
Connect Claude has a new card, **Get the Claude plugin**: the version, a **Download the plugin** button and the steps to add it to
Claude. Everyone who is signed in can download it (`GET /api/plugin/download`, with `GET /api/plugin/info` for the version and
skills). The file is zipped on the server from the `plugin` folder of the repository each time (`src/zip.ts`, a small ZIP writer,
no new package), so a `git pull` on the server is all a new version needs, and nobody passes plugin files around any more. Each
download is in the Logs. Checked: signed out it is refused; as an employee the file downloads with its version in the name, unzips
without errors, passes `claude plugin validate` and is identical to the `plugin` folder.

### R40. The main admin is protected, everyone can change their own password, password boxes have Show (done)
- **Main admin**: the first admin account (the lowest id with the admin role, the one `npm run seed` made). No other admin can change
  its role, disable it or reset its password (`PATCH /admin/users/:id` answers 403). On Users it carries a "Main admin" label and,
  for other admins, no controls. The main admin manages everyone as before.
- **Change your own password**: a key button next to your name in the sidebar, and "Change password" on your own row in Users. It
  asks for the current password and the new one twice (`POST /me/password`; 10 characters or more; wrong tries are limited). You stay
  signed in where you are; every other session of yours is signed out. For every role, not only admins. An admin can no longer set
  their own password through the reset (which skipped the current password).
- **Show / Hide** on every password box (`withShow`): sign in, add a user, reset a password, change your password, and the sign-in
  page Claude opens.
- Checked: 14 calls against the running app (each change to the main admin refused and the account untouched; wrong and short
  passwords refused; the change works; this session stays and another is signed out; the old password stops working), and in the
  browser as a second admin. The Claude sign-in page's Show button was not seen in a browser (it needs a live request from Claude).

### R41. Matching, one workflow for screening and the project step (done, 13 October)
What went wrong (live jobs #19 and #29): a recruitment company wanted contact data scraped for real estate, trades and medical
centres. The tagger gave the job four industries, so Healthcare counted as "same industry" and Doctoria, Navience and
DentalMasteryDynamics were shown above the projects that did scraping. And screening picked its own sample projects in a separate
reading, so the screening notes and the project step disagreed.
- **One job industry**: the tagger now gives exactly one (or "None stated"), the client's own business or the users of what is built,
  never the industries of data, leads or markets the job is about, with a reason. It can no longer return several.
- **The work first**: the tagger names the job's core work, one to three specific tags, the main work first (never broad ones like
  Workflow automation or AI powered). Only projects that did the core work are recommended; those that did the main work come first.
  Then the job's industry, then related industries, then the rest; then how much core work is shared; then the score.
- **One list**: the projects screening named are always on the project step, marked "Named in screening". Screening now picks them
  by the same rule.
- **Show 10 more projects** (task 22): ten more matches behind a button on the project step; any of them can be chosen.
- The project step marks the core work ("Main work", "Core work") in the tag list, shows it in the "Job needs" line, warns on a card
  that shares none of it, and explains the order and the tag weights.
- The Claude plugin follows the same rule (v0.4.2): `get_library` returns it with the minimum score under `matching`; the plugin's own
  minimum of 6 and its "Project stage counts 0" are gone, so the Tag dictionary weights and the Settings minimum apply to both.
- Migration `027_matching_one_workflow.sql`. Jobs keep their old matches until they are matched again ("Find matching projects").
- `npx ts-node scripts/try-matching.ts <job text file>` shows the industry, core work and ranking for a job without saving anything.
- Checked: tests (the 13 October job, one industry, core work order, screening's projects, the extra ten); the real model on the
  scraping job (industry Recruitment / HR, core work scraping then lead generation, Breesy and Bitrix24 recommended, no healthcare),
  job #50 (real estate lead response), a dental voice job and a legal RAG job; job #50 on the page with "Show 10 more projects".

### R52. The Claude plugin saves every step, and continues a job left halfway (done, 14 October; Part A of `PLAN-PLUGIN.md`)
Before, the plugin saved twice (the job after the decision, the final proposal). Everything between lived only in the chat, so a job
left at step 7 showed in Upwork Pro as decided with nothing after it.
- **New MCP tool `save_step`** (`POST /plugin/jobs/:id/step`, in `routes_plugin.ts`), called as soon as the person answers each step:
  `read` (job tags with reasons and core work, the one industry, the signals with their evidence), `profile` (profile and rate),
  `projects` (the shortlist shown with a reason each, and the projects picked), `type`, `loom` (a video or none). Each fills the
  fields the app's own steps fill, so the Jobs list, the job page and the dashboard show the right step with no extra work.
- **Rules**: the owner, or a manager or admin; the decision must be recorded first; a profile, project, type or video that Upwork
  Pro does not have is refused with what to do (a missing project: "add it with add_project first", and nothing is half saved);
  the number of projects follows the Settings; a tag or signal that is not in the dictionary is named and left out. Saving a step
  again replaces what that step saved; other steps stay. Each save is in the job's History with the old and the new value, source
  "Claude plugin", and the answer carries the job's stage after it.
- **The job is saved right after the gate**, before the decision (`save_job` without `decision`), so a job the person walks away
  from is there as "Decision pending". `record_decision` records the answer.
- **Drafts**: every draft and revision is a version (`save_proposal` with `finished: false`). `save_proposal` no longer needs the
  profile or the projects repeated, and leaving the projects out no longer clears the ones picked (it did before).
- **Resume**: `get_job` returns `saved` (everything each step saved), `steps_done` and `continue_from`. The proposal skill looks
  the job up first; for the person's own unfinished job it says what is saved and continues it as the same job.
- **`update_status`** takes `connects`, `boost` and `notes` with the status (they went into the note text before).
- **The app**: a type picked in Claude shows in the type chooser as "Picked in Claude", already selected. The type and the rate
  are kept on the job until the first draft exists (migration `033_plugin_steps.sql`; run `npm run migrate`).
- **Plugin v0.5.0**: the proposal skill saves at every step and says so in one line each time, stops when a save is refused, and
  has a "Continuing a job left halfway" section; the job-status skill sends Connects and boost as numbers.
- **Checked**: 27 calls through the MCP against the running app as an employee, a second employee and a manager, covering the six
  acceptance points of the plan (stop after the projects and see them in the app; continue as one job; three versions then
  finished; a missing project refused with nothing half saved; someone else's job refused for an employee and allowed for a
  manager; every step in the History). The temporary job and accounts were removed. `npm test`, type check and `node --check` pass.
- **Not checked**: a real `/proposal` run inside Claude with v0.5.0 (the plan's "two real jobs"). The skill text is new and only
  a run in Claude shows whether it saves at every step and resumes as written.
- **Live**: pull, `npm run migrate` (033), `cd mcp && npm run build`, restart; download the plugin again (v0.5.0), restart Claude.

### R53. Changes: every change to the setup is kept, reviewed and can be put back (done, 14 October; Part B, phase B1)
- **Change sets** (`backend/src/changesets.ts`, table `change_sets`, migration `034_change_sets.sql`; run `npm run migrate`): each
  change to a project, industry, tag, tag category, Upwork profile, Loom video, rule, signal, signal value, proposal type (with its
  signal mapping), sample proposal, writing guide document, setting, or the active gate instructions is kept with who made it, from
  the app or from Claude, the item in full before and after (the row, its linked lists such as a project's tags, its child rows),
  the list of what changed, and a reason when one was given.
- **How it is caught**: one middleware (`recordSetupChanges`) in front of the setup routes reads the item before the route runs and
  after it answered. No route was changed. A new setup route needs one line in `ROUTES` in that file. A save that changes nothing
  leaves no change set.
- **Review**: a change by anyone but the main admin is marked "To review". It is already applied (Hamza's choice); the main admin
  marks it seen or puts it back. Other admins see the list but cannot do either (the server refuses).
- **Put back**: the item returns to how it was before that change, linked lists included. It is recorded as a change of its own, so
  a put back can be put back too. If the item was changed again since, it refuses and shows what changed since, with "Put it back
  anyway". Putting back an "added" item switches it off; nothing is deleted. A writing guide text put back becomes a new version.
- **Changes page** (Admin, sidebar): when, who, from the app or from Claude, what, the change itself (the same display as Logs),
  status (To review, Applied, Seen, Put back), with the shared filter bar (search, status, kind, person, source, dates), "Mark all
  as seen", Seen and Put back.
- Checked: 34 calls against the running app as a second admin over eight kinds (tag, project, rule, writing guide document, setting,
  industry, profile, and a tag's linked projects): each change recorded with the right action and put back exactly, the refusal when
  changed since, a put back of a put back, the permissions, the filters. The page was opened as a second admin (rows, filters, no
  console errors). Not seen in a browser: the main admin's Seen and Put back buttons (they need the main admin's sign-in; the
  endpoints behind them are tested). Not exercised: signals, proposal types and their mapping, samples, Loom videos, gate
  activation (the same generic code path; a mistake there would show as a put back that does not match).

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

### R54. An independent reviewer scores every proposal (done, 14 October; `PLAN-PLUGIN.md` section D)

- **What it is.** Once a proposal is written, a second reader scores it out of 10. It gets the same facts the writer had (the job, the
  profile, the chosen projects, the proposal type's rules, the writing guide, what the automatic check found) but its own
  instructions (`src/proposal/reviewer.ts`), and it is told the proposal is somebody else's. It never rewrites anything.
- **What it returns:** the score, a one line verdict, up to three things that work, up to four that hurt it, and up to three
  suggestions, each with a short title and an instruction ready to send to the writer.
- **In the app** (job page, Proposal tab, beside the text): the "Independent review" panel. "Apply this" on a suggestion sends its
  instruction to the chat, so the AI revises the proposal as a new version. The panel then says the review is of an earlier version
  and offers "Review this version". "Review again" asks for a fresh one. The review is advice: Copy and Save and mark sent never wait for it.
- **In Claude** (plugin v0.6.0): after every saved draft the `/proposal` skill calls `review_proposal` and shows the review unchanged;
  the person approves as it is, applies a suggestion by number, edits, or asks for another review.
- **How it runs.** The worker picks it up (`review_status` on the proposal: queued, running, done, error), one AI call logged as
  kind `review`. A written proposal is queued for review by itself. Migration `035_proposal_review.sql`.
- Checked with the real model on a made up job (removed again): the first draft scored 5, and the review caught a tool claimed on a
  project that the project's facts do not name, security claims not in the facts, and the length; one suggestion applied made
  version 2; the second review was of version 2 and scored higher; Claude's route returned the same review; the panel seen in
  the browser at desktop and phone width. Unit tests for the instructions and the answer's shape.
- Not checked: a real `/proposal` run inside Claude with v0.6.0; `npm run test:read` in `mcp/` (it needs a personal token).

### R55. Live data brought back, the setup backup refreshed, and a stray "null" fixed (done, 14 October)

- Hamza's dump of the live database (13 October night) was loaded into a separate local database, `upwork_live`, never over the
  local one. **Migrations 027 to 035 ran on it without a fault**: a rehearsal of the next deploy on the real data.
- **What live had that the repo did not:** 12 projects changed (links, active or inactive, tags), 2 new tags (Lawmatics, Lawcus),
  the new rule F7, edits to G1 and G14, and two test Loom videos. These were restored into the local database with
  `setup:import -- --apply` (adds and updates, deletes nothing) and **`seed/setup/setup.json` is exported again**, so the backup we
  go live with now holds them. The proposal types' first two lines (R44) and the setting "AI orders the matched projects" are
  kept from local, because live does not have them until it is deployed. No key, token or password is in the file.
- **Matching run again on nine real live jobs** (today's rules, nothing saved): jobs #19 and #29 (the scraping job that went wrong)
  now get one industry, Recruitment / HR, and no healthcare project; no job had a project recommended that does not prove the work.
  To look at: the hotel voice agent jobs (#39, #40) no longer recommend Innspeed and Bitrix24, they recommend Chairboss and Apex,
  because the first two do not carry a tag for the job's core work. If Innspeed has that work, it needs the tag.
- **Every page of every live job opened in the new code** (304 pages: 17 lists and seven tabs of 41 jobs): no console error.
  It found the word "null" printed on 24 pages (Overview, Screening, Job post). Cause: the browser prints a missing piece as "null"
  when it is handed to `append` or `replaceChildren`. Fixed once, at the top of `app.js`: a missing piece is left out everywhere.
- On live after the deploy: nothing to import (live already has this content). Run `npm run upgrade:openings` as planned.

### R56. The setup, run from Claude: tools for admins and the `setup-admin` skill (done, 14 October; Part B, phases B2 and B3)

- **What it is.** An admin can add and change the setup by talking to Claude: projects, industries, tags and categories, Upwork
  profiles, Loom videos, rules, signals and their values, proposal types and samples, the writing guide, the gate instructions
  and settings. A manager can do what a manager can do in the app (projects, industries, proposal types, samples, the writing guide).
- **Two steps, always** (`src/routes_setup.ts`). `setup_prepare` checks the change with the app's own rules and returns it as before
  and after, what it affects and any warnings, and saves nothing. `setup_apply` saves it, only for the person who prepared it, only
  within two hours, and only if nobody changed the item in between. Linked things are given by name (a project's tags, a tag's
  category) and unknown names are refused by name.
- **Saved by the website's own routes**, so a change from Claude gets the same checks, the same log line and the same change set as
  one made in the app: on the Changes page it shows "Claude", the person, the reason, and "To review" for a second admin.
- **Sign-in (`src/auth.ts`), read this.** A Claude token still cannot reach the website's routes. The one exception: a request that
  names a prepared change and whose method, path and content are exactly what that same person prepared and has not applied yet.
  The route's own role check still runs. Checked: a token alone is refused; another content or another person is refused.
- **Never from Claude:** users, passwords, the AI provider and its keys, deleting anything (an item is switched off instead).
- **The history and undo:** `setup_history` (admins), `setup_revert` and `setup_review` (main admin only), over the change sets of R53.
- **Examples first:** `setup_examples` returns two or three complete real items of a kind.
- **The skill** (`plugin/skills/setup-admin`, plugin v0.7.0), Hamza's rule that nothing raw goes in, as seven steps: look at what
  exists, show examples, ask, say what is missing (never guess), verify names and links, rewrite in the standard format and show
  the final version, then prepare, show, and save only after a clear yes. The questions per kind are in its `references/kinds.md`.
  The proposal skill now adds a missing project through these steps too.
- Migration `036_setup_prepared.sql` (the prepared changes). The web app must run as one process, as it does (apply calls itself).
- Checked: 50 checks through the running app with real tokens and temporary accounts, all removed after: an employee refused;
  a manager limited to a manager's kinds; every kind added or changed once; unknown names and fields refused; a change that changes
  nothing refused; apply refused twice and after someone else's edit; the gate instructions saved as a version that is not active,
  then activated; the main admin put the gate instructions, a setting, a writing guide document and a proposal type back; a second
  admin could not.
- Not checked: the skill itself in a real Claude conversation (needs the plugin installed again and the MCP rebuilt), and the
  proposal type's signal mapping, which is still changed in the app only.

### R57. The team guide brought up to date, with a section on the setup from Claude (done, 14 October)

- **New section:** "Changing the setup from Claude (admins and managers)": who can do what, the seven steps Claude always follows
  (nothing raw goes in), a table of what to say (add or change a project, a tag, a profile, a video, a rule, the writing guide, a
  setting, the gate instructions in two steps, switch off, see what changed, put a change back), what Claude cannot do, and the
  Changes page with a picture.
- **Pictures retaken or added (16)** for what changed since 9 October: the decision step, the skip popup (new), the project step and
  "Show 10 more" (new), the proposal page (no Tracking tab, Change type, Save and mark sent), the independent review (new), the
  mark as sent window (new), the Overview with tracking on it, the layout, the tag list and tag window, the project window (Android
  and iOS links), Settings: project matching (new), the plugin card (v0.7.0), Changes (new). The old Tracking picture is removed.
  65 pictures in all; the text for each changed screen is rewritten. Built with `python3 guide/build.py`.
- **The review panel, two changes found while taking the pictures:** the chat now sits above the review (a long review pushed the
  chat far down the page), and "What hurts it" and "What works" are folded, so the score, the verdict and the suggestions come first.
- The pictures were taken with a temporary account and one made up job, both removed afterwards.
- Not retaken: the pictures of screens that did not change (they show the sidebar without Guide and Changes), and there are still
  no pictures of Claude itself.

### R81. Compare versions: a picker over each column, and notes that say plainly what they are (done, 15 October)

- **Pickers over their columns** (asked for by Ahmad): the left version's picker sits on top of the left column (marked LEFT), the
  right one's on the right (RIGHT), with a dashed line down the middle and the swap button on it.
- **Clearer notes:** above the columns, **Recommendation: Send v2** and why, with a line on what the screen shows. Each column says
  **Recommended** or **Not recommended** next to its picker, and its notes are titled "v2 compared with v3": a green **Where v2 is
  better**, an amber **Where v2 is weaker**, and a blue **Worth bringing into v2 from v3**, each suggestion a card with the exact
  instruction **For the chat** and Copy (and Send to the chat for the newest version). Then **The proposal, v2**, whole.
- Checked on a temporary copy of job #51 (removed afterwards): the notes, the swap (everything follows at once), phone width.

### R80. The sidebar: the daily work, then four sections that open one at a time (done, 15 October; replaces R77 and R79)

- **Ahmad's design:** the daily work first (**Dashboard, Screen a job, Jobs, Reports, Proposal feedback, Flag review**), then four
  sections, **Library, Writing, Screening, Admin**, each a row with its icon and an arrow. Clicking a section opens its pages under
  it, indented; opening one closes the others (only the open one takes space), and the open one can be closed too. The section you
  are in and the page you are on are both lit. Going to a page opens its section. The open section is kept in that browser.
  Guide and Connect Claude stay in the small row above your name. The Setup page of R79 is gone (its address opens the Dashboard).

### R79. The sidebar: the daily work, and one Setup page (done, 15 October; replaced the same day by R80)

- **Ahmad's pick**, after the folding groups did not work for him: the sidebar holds only the daily work, **Dashboard, Screen a
  job, Jobs, Reports, Proposal feedback, Flag review**, then one link, **Setup**. Guide and Connect Claude stay in the small row
  above your name.
- **The Setup page** has every page that sets the system up as a tile with a line on what it is for, in four groups: **Library**
  (Projects, Industries, Tag dictionary, Upwork profiles, Loom videos), **Writing** (Writing guide, Signals, Reviewer),
  **Screening** (Gate instructions, Rules) and **Admin** (Settings, Users, Changes, Logs). Each person sees only what their role
  opens. On any of those pages Setup stays lit in the sidebar, and a **Setup** link above the title goes back.
- Checked at desktop and phone width (the Menu button shows the same short list).

### R78. The proposal screen standardized; profile and video change in place; compare on a full screen (done, 15 October)

- **The proposal is one card** (asked for by Ahmad, the screen had grown scattered): on top, the **Cover letter** and **Screening
  answers** tabs, and on the right the version and **Compare**; under them, **Sent from** (the profile) and **Loom video**; then the
  openings and the text; at the bottom the word count, unsaved changes and **How this was written**. Every control in it is the
  same small size. The checks and the experience questions stay above the card, the tools beside it. When an older version is shown,
  a note says so, with **Restore it** and **Back to the newest**.
- **Fixed:** the Loom video showed "Loading videos" and "No Loom videos on this profile" at once (the dropdown's box was left behind);
  the bar above the text spilled onto two lines.
- **Profile and Loom video change in place:** no new version and no AI call. The sign off and the video line are made in code, so
  they are changed in the version you are on, at once. Text you edited yourself gets its old sign off and old video line swapped
  where they are found word for word; only when they cannot be found are the new lines offered beside the editor, as before. A new
  type, an opening or a chat request still make a new version.
- **Compare on a full screen:** both versions whole, each in its own column you can read to the end, and the AI's **notes attached
  to each one** on top of it (better than the other, weaker than the other, worth bringing into it, with Copy and Send to the chat),
  with which one to send and why above them. **Close** (or Esc) goes back to the proposal. Quotes from the AI show plainly.
- Checked on a temporary copy of job #51 (removed afterwards; #51 itself was not touched): profile to Hamza, video on, video off,
  profile back, with no new version at any step and the sign off and the video line right each time; the card at desktop and phone
  width; the compare screen with its notes (the AI found the double sign off in the hand edited version and said to send v2).

### R77. The sidebar, cleaned up (done, 15 October)

- **Why** (asked for by Ahmad): 22 links in four long lists.
- **Now:** **Dashboard, Screen a job and Jobs** are always shown. The rest are in folding groups: **Insights** (Reports, Proposal
  feedback, Flag review), **Library**, **Writing** (Writing guide, Signals, Reviewer) and **Admin**. A group opens with one click and
  stays open in that browser; the group of the page you are on is always open. **Connect Claude** and **Guide** moved to a small
  row above your name. On a phone the Menu button shows the same.

### R76. Compare versions: the two as they read, and the AI's view beside them (done, 15 October)

- **Changed** (asked for by Ahmad): no more struck out and green words. The two versions sit side by side as they read, and
  beside them the AI says which one is stronger and why, and what is **better** and **weaker** in each one against the other.
  **Worth bringing over** lists what to take from one into the other, each with **Copy**, and **Send to the chat** when it is for the
  newest version (the chat revises the newest version, as a new version).
- **Fixed:** changing a version picker made both pickers vanish (the pickers were moved into the columns on every change and lost
  their dropdown). They now sit in a fixed bar above, with a swap button.
- A worker job, kept per pair of versions: opening the same two again, or swapping the sides, costs nothing. The AI names the
  versions by number. Migration `047_auto_mode.sql` (also R75); `src/proposal/compare.ts`.
- Checked with the real model on job #51 (v1 against v2: v2 stronger, three points worth bringing over into v2); the swap shows the
  same result mirrored at once; the pickers stay after every change.

### R75. Auto mode: screen a job and write its proposal with no questions in between (done, 15 October)

- **What it is** (asked for by Ahmad): **Screen a job** now has two buttons: **Screen this job** (as before) and **Auto: screen
  and write**. In auto mode the job is screened; a PASS or a FLAG goes straight on (a FLAG is recorded as continued by auto mode,
  with its flags, like any override); the recommended projects are confirmed; a profile is chosen (the one whose services fit the
  job's tags best, else the one you used last, else the only one); a Loom video only when the post asks for one; and the proposal
  is written with the type the signals suggest. The Overview shows each step as it is done, then the proposal opens by itself.
- **A FAIL stops** and says so: continue it with a reason on the Screening tab and auto mode goes on, or skip it. It also stops,
  with the reason, when no project fits or there is no active profile.
- **At the end, everything can still change on the proposal page:** the type (Change type), the opening (the openings card), the
  Loom video, and now also **the profile** (a new Profile picker next to the Loom video: the sign off follows, a video of the old
  profile is taken off, and the page stays on the proposal).
- Checked with the real model and a made up job: PASS, two projects, a profile, Type 1, written in about a minute and a half
  with no question asked; the openings and the review followed. The job was removed afterwards.

### R74. Documents attached to a job, read by the AI (done, 15 October)

- **What it is** (asked for by Ahmad): the client's files (briefs, specs, screenshots, mockups) can be attached to a job: on
  **Screen a job** (Attach files, or drop them on the box) and later on the **Job post** tab (the new Attached documents card).
  PDF, Word (.docx), text, CSV, Markdown and images (PNG, JPG, WebP, GIF), up to 10 MB each and 8 per job.
- **The AI reads them with the job post, everywhere:** the screening, the tagging and matching, the signals, the proposal, the
  chat, the review, the experience update and the openings. A PDF, Word or text file is read in code (no AI call); an image, or a
  PDF with no text in it (a scan), is read once by the AI, which writes down what it shows. A new job's screening waits for that.
  Every file is given to the AI as the client's data, never as instructions.
- **On the card:** each file with its kind, size and how many characters the AI reads; **What the AI reads** shows that text;
  open the file; **Remove** it. If the AI could not read an image, **Describe it** lets a person type what it shows instead (also
  Change description for an image), and **Read again**. A file added after the screening says so: the matching, the proposal,
  the chat and the review read it from then on.
- Safety: the file's content must match its name (a text file renamed to .pdf is refused); files are kept in
  `backend/storage/attachments` (ignored by git) and served only to the person who submitted the job and admins and managers; the
  AI that reads an image may read only the copy in its own folder. The new job and its files are saved together, so a job is never
  screened without its files.
- New: migration `046_job_attachments.sql`; `src/screening/attachments.ts`; `src/routes_attachments.ts`; two pinned libraries,
  `pdf-parse` 2.4.5 and `mammoth` 1.12.0 (`npm ci` installs them). Not in the Claude plugin: there, Claude reads the files itself.
- Checked locally with a made up job and five files: the text, PDF and Word files read in code, the image read by the AI (it
  described the mockup screen and its button), the renamed file refused, the screening started only after the image was read, and
  its report used details found only in the files (from the PDF, the image and the notes). Opening, access without signing in
  (refused), Remove (the file left the disk). The job, its files and its records were removed afterwards.

### R73. Three openings to choose from, swiped through on top of the proposal (done, 15 October)

- **Opening styles in Settings** (asked for by Ahmad, the same day): each opening is written from a style, a base instruction
  for what it leads with, its tone and its line of thought. Defaults: **The pain**, **The risk**, **The outcome**. An admin edits
  them under Settings, Opening styles: rename, rewrite, switch off, add (up to four), remove (at least two stay on). One opening
  is written per style that is on; the Opening lines rules and the proposal type's own first two lines rules apply on top and win
  where they differ. Each opening on the proposal page is labelled with its style. Changed from Claude like any setting.
  Checked: the three styles gave three openings that each followed their style; a save with one style on is refused.


- **What it is** (asked for by Ahmad): for every proposal, three replacements for its first paragraph (the part Upwork shows in
  the preview), each with a different direction (what it leads with), tone and line of thought, not three wordings of one idea.
- **On the proposal:** a card on top of the cover letter shows the opening as written, then the three. **Swipe** (or use the
  arrows or dots) and the proposal below shows that opening in place, so the whole proposal can be read with each one. Each shows
  what it leads with, its tone, and one line on why it may land with this client. **Use this opening** saves it as a new version
  (only the first paragraph changes; a proposal made of parts keeps its parts). Trying one is a preview, never saved by itself;
  pressing Save and mark sent while trying one asks to use it first. **Write new ones** asks for three more.
- Written by the worker after every proposal (one short AI call, in parallel with the review), with the writing guide's Opening
  lines rules, the type's own rules, its first words and the banned phrases. Older proposals show a **Write 3 openings** button.
  When the first paragraph changes later (a chat revision, an edit), the card says so and offers new ones.
- Migration `045_openings.sql`; `src/proposal/openings.ts`; routes `POST /proposals/:id/openings` and `/openings/:i/use`.
- Checked locally on job #51 with the real model: three distinct openings (all keep the client's required opening words), swipe
  and arrows, the preview in the proposal, Use this opening (v3: only the first paragraph different, the other 12 word for word).
  The test version was removed afterwards.

### R72. Compare two versions side by side (done, 15 October)

- **What it is** (asked for by Ahmad): with two or more versions, **Compare versions** next to the version picker opens a window
  with any two versions side by side (the one shown and the one before it, to start). What was taken out is struck through in red
  on the left, what was added is green on the right, with the count of words added and taken out, each version's note, and the
  screening answers compared the same way. On a phone the two sit one above the other.
- Front end only (a word by word comparison in the browser).

### R71. Experience: one answer, several projects; the Experience tab redone (done, 15 October)

- **Several projects** (asked for by Ahmad): a Yes can name any number of projects where it was done, not one. Each project gets
  the note and the tag (made switched off), and the proposal explains it in the block of each of its projects that is in the
  proposal; projects not in the proposal are never named. The Proposal feedback page lists what waits for the library per project.
- **The tab, refined:** a card per question (what the client asks, their words, its category), **Have you done this? Yes / No**,
  then with Yes: the projects as tick boxes (this proposal's first, a search box when there are many), how it was used, and the
  tag the library gets on one line (Change to edit it). The button shows how many are answered.
- Migration `044_gap_projects.sql` (one row per project, the earlier answers copied in). The Claude plugin's answer with one
  `project_id` still works.
- Checked: tests; a script on the local database (an employee's Yes on two projects waits on both, an admin adds one, an admin's
  Yes puts a switched off tag and the note on both, a project given twice counts once, a No clears them; everything it made was
  removed); the tab on screen, and what it sends.

### R70. The cover letter and the screening answers in two tabs (done, 15 October)

- **Why** (asked for by Ahmad): they are two separate things, each pasted into its own place on Upwork, but the answers sat under
  the letter, so you scrolled past the whole letter to reach them.
- **Now:** when the client used Upwork's questions section, the proposal has two tabs above the text: **Cover letter** and
  **Screening answers** (with their count). Each tab gets the full height. A dot on a tab means it has unsaved changes. **Save
  version** still saves both together, and the version picker and the checks line apply to both. A proposal without screening
  answers shows no tabs, as before.
- Front end only (`public/proposals.js`, `public/style.css`).
- Checked locally on job #51 with two temporary answers (removed afterwards): both tabs, the count, the dot after an edit, Save
  version appearing.
- Note: job #51 itself was written on 9 October, before R59, so its letter still has the answers written inside the text. Newer
  proposals keep them apart.

### R69. The Proposal tab cleaned up: one tool at a time beside the proposal (done, 15 October)

- **Why** (asked for by Ahmad): the tab had grown a card per feature. The chat, the independent review, the feedback form, the
  experience questions and "how it was written" were all on screen at once, so the proposal itself was hard to find and the page
  ran three screens long.
- **Now:** the proposal on the left; beside it **one card with a tab per tool: Chat, Review, Experience and Feedback**. Only the
  open tab is shown. The tab you used last is kept the next time. The card stays in view while you scroll the proposal (wide
  screens); on a phone it sits under the proposal.
  - **Review** shows the score on its tab (green, amber or red) and a spinner while it runs. **Apply this** opens the Chat tab, so
    you see the AI working on it.
  - **Experience** (the questions about things the client asks for that we have no record of) appears only when there are some,
    with their count on the tab. It opens first when questions are waiting.
  - **Feedback**: the form first; the feedback already saved for this job is folded under it.
- **Above the proposal, one line:** the yellow "things to check before sending" (folded, as before) and, when there are open
  questions, "2 questions about your experience", which opens the Experience tab.
- **How this was written** (signals, the type ranking) is now a link under the proposal that opens a window, wide enough for its
  tables. Its own "Write again with this type" button is gone: Change type at the top right does the same.
- The word count sits under the proposal with that link; the "Written ... ago with ..." line moved into the window.
- Front end only (`public/proposals.js`, `public/style.css`); nothing changed on the server.
- Checked locally on job #51 at desktop and phone width, with two temporary questions: the tab badge, the line above the
  proposal, answering No through the panel (both cleared), and the window. The temporary rows and session were removed.
- The team guide's text for this screen is updated; its pictures still show the old layout (task 49, with the gaps and feedback
  pictures).

### R68. Opening lines: the first two lines rules for every type, in the Writing guide (done, 15 October)

- **What it is** (asked for by Ahmad): a Writing guide document, **Opening lines (all types)**, with the default rules for the first
  two lines, the part Upwork shows in the preview: write them for this client only, with a detail only they wrote; start with the
  client, never with us; sound like a person; use the client's required opening word exactly; and never a greeting, talk about us,
  a project name, a link, stats or filler. Each proposal type keeps its own first two lines rules (what line one and line two do,
  and its exceptions: the Invite type may greet, types 3 and 8 may say how we would start); they are added after the defaults and
  win where the two differ.
- **Where it is used:** the writer's FIRST TWO LINES section (the defaults, then the type's rules), the chat, the automatic check of
  the first two lines (now also for a type with no opening rules of its own), the reviewer (with the writing rules), and the Claude
  plugin (`get_writing_guide` returns `opening_lines`; the proposal-writer skill applies it, plugin v0.14.0). Edited on the Writing
  guide page like any document, with versions.
- Migration `043_opening_lines.sql` adds the kind and creates the document with its default text (`seed/writing/opening-lines.md`,
  also loaded by `npm run seed:writing` on a fresh copy).
- The types' own rules were not changed, so some of them still repeat a default (for example "no project names"). That is harmless;
  they can be trimmed to what is special about each type when convenient.
- Checked: tests (the defaults first, the type after and winning; a type without rules still gets the defaults); `tsc` for the backend
  and the MCP; migration 043 locally, twice (the second run changes nothing); the document in place with its first version; the
  writer's instructions for Type 1 with both parts in order.

### R67. Experience gaps answered on the proposal, and feedback on proposals (done, 14 October)

Asked for by Ahmad (the Grok example: a client asked for Grok experience we have, the library did not show it, and the proposal
said "Grok would be new for me").
- **The writer reports its gaps.** Every write also returns what the client asks for that the facts do not show (a tool, platform,
  AI model, integration, certification, industry, kind of work): a short skill name, the ask, the client's words and the closest
  tag category. It leaves each gap out of the proposal, never claiming it and never saying it is lacking (`gapsRule` in
  `src/proposal/writer.ts`; kept in `proposal_gaps`, migration 042; open gaps are replaced by a new write, answered ones stay).
- **The person answers on the proposal page**, in a card above the editor: Yes or No per gap; a Yes can name the project where it
  was done (this proposal's projects first) and say how it was used. **Update the proposal** writes only those lines again, as a
  new version (one short call, about 15 s): a skill done in one of this proposal's projects is explained in that project's block;
  otherwise it is a sentence in the letter; a question the client asks about it is answered with it; anything saying it is
  lacking goes. What was confirmed is then a fact for the reviewer, the chat and any rewrite, and wins over the gate's note that
  it could not be claimed.
- **The library learns it, without changing the matching** (Ahmad): the note (how it was used) goes into the project's notes, where
  the writer reads it. A new tag is made **switched off** and put on the project: it counts in tagging and matching only once an
  admin switches it on in the Tag dictionary. An existing tag that is on is not linked (the link alone would change the matching):
  it waits for an admin on the Proposal feedback page, with **Add to library**. A manager's Yes adds the note (only an admin makes
  tags); an employee's waits for an admin. Each change is a change set on the Changes page, so it can be put back.
- **Feedback on proposals:** a Feedback card beside the review: the part of the text (paste it, or select it and press Use
  selected text), a category (Wrong fact, Wrong project, Tone, Too long, Opening, Banned phrase, Other) and what is wrong. Kept with
  the job, the version, the profile, the type and the projects (`proposal_feedback`). The **Proposal feedback** page (Work) lists
  it all with counts per category, search and filters, and the experience waiting for the library. Claude reads it with
  `list_feedback`, to review the patterns and propose fixes.
- **Tested on the local app with a made up Grok job** (a temporary account; everything, library changes included, removed after):
  the gate flagged G9 and G11; the writer found the gap (Grok, AI models and platforms) but the G11 requirement still made it write
  "Grok would be new for me"; answering Yes on Innspeed made a switched off "Grok" tag on Innspeed, the note in its notes, and
  change sets 77 and 78; the update (15 s) answered "What you built with Grok" with the Innspeed fact and explained it in
  Innspeed's block, with no denial left. The review first scored it 4 ("cannot honestly claim that"); with the confirmed fact
  passed to the reviewer it scored 7, "the Grok ask is answered honestly with the confirmed Innspeed fact". A feedback entry was
  saved and shown on the job and on the Proposal feedback page.
- Not yet: the Claude plugin (it asks the same questions next), and the team guide's pictures of the new cards.

### R66. Setting up from zero: a guide, a starter kit, and the company name as a setting (done, 14 October)

- **The guide** (`guide/setup.html`, from `guide/setup_content.py`, built by `python3 guide/build.py`, linked both ways with the team
  guide): for someone given a fresh, empty copy. How the pieces fit together (what each AI step reads from the setup), what
  matters most, install and the first sign in, what the starter kit gives, the order to fill it in with time estimates, then each
  piece field by field with how much it matters and where it has an effect: tags (the category names the matching depends on,
  descriptions, scores, compliance), industries, projects, profiles, Loom videos, the gate instructions and rules, proposal types,
  samples, the writing guide, signals, the reviewer, the settings that point at the company's own rules and signals, people,
  Claude and the plugin. Then: coming from GPT or Claude (what you have and where it goes), faster ways in (Claude, sheet imports
  with their columns, copying a whole setup), testing on real jobs, and what to look at after two weeks. Asked for by Ahmad.
  Researched from the code by three readers, then checked against it.
- **The company name is a setting** (Settings, Company, "Company name", default Stackup Solutions). It was written into the
  AI's instructions in the code (the writer, the tagger, the signals, the project judge, the gate's output rules) and into a few
  screen labels, so a fresh copy would have written as Stackup. Now every prompt and label uses the setting (`src/company.ts`,
  set whenever the settings are read; the worker reads them before every job). The reviewer's built in text says `{company}`.
- **The starter kit:** `npm run seed:starter` (`scripts/seed-starter.ts`, and `seed-proposals.ts --no-samples`) loads what any
  company needs and nothing of one company's: the 10 tag categories with their exact names (compliance ticked), the 10 platform
  tags with descriptions and "AI powered" at 0, the 22 signals, the 8 proposal types with their selection rules but without
  Stackup's sample proposals, the writing guide, the settings. `seed:starter:prod` for a server.
- **Checked on an empty database** (a throwaway copy, removed after): migrate, seed, seed:starter gave the admin, gate v1, 10
  categories, 11 tags, 22 signals, 75 values, 8 types, 56 selection rules, 0 samples, 6 writing documents, every setting, and
  no projects, profiles, rules or industries. Then the guide's smallest setup (a dozen tags with descriptions, two industries, two
  projects, one profile, two rules, the company "Acme Studio", Claude as the AI) and one made up job: screened PASS, tagged with
  the right core work, industry and compliance, the right project recommended with a reason in 21 s; the proposal written from
  the early draft, in parts, and reviewed 31 s after Write; no "Stackup" anywhere in it, signed by the profile with its code link.
  Tests for the company name; `tsc`; `node --check`.
- Still Stackup's, said in the guide: the Claude plugin's backup copies, its job gate text and its profiles list (live data comes
  from the company's own Upwork Pro), the plugin's name, and the first gate instructions (rewritten by the company).

### R65. The team guide brought up to date for R58 to R64, and four fixes found while taking its pictures (done, 14 October)

- **Pictures retaken (6):** the decide step with the quick reasons (`screen-4-flag`), the Projects step with Skip tech stack tags
  (`job-projects`), the proposal page with the Loom video selector and Copy cover letter (`job-proposal`), Settings with the
  review and the matching rule (`settings-matching`), the plugin card at v0.13.0 (`connect-plugin`).
- **New pictures (6):** the screening answers apart from the proposal (`job-answers`), the parts offered for edited text
  (`job-parts`), the Reviewer page in two parts (`reviewer`, `reviewer-try`), the Flag review (`flag-review`), Settings with the
  quick reasons and the Loom line (`settings-writer`). 71 pictures in all.
- **Text:** the flag and fail step (quick reasons, which jobs are matched by themselves), the Projects step (skip tech stack), the
  proposal written in parts and updated part by part after a change, the screening answers, the review that never forces a
  change, the Reviewer page, the new settings, the Flag review, the plugin's faster run (server matching, no rate question, type
  and video in one question, saves alongside the next step), the reviewer from Claude, the roles table, a habit and a
  troubleshooting row. Built with `python3 guide/build.py`.
- The pictures were taken with headless Chrome at 1440 by 900 in the existing style, with a temporary account and two made up jobs
  (a dental clinic booking assistant and a cheap scraping job) run through the real app; all removed afterwards.
- **Fixed on the way:**
  - The default Loom line read badly with real video titles ("I recorded a short walkthrough of Test video: AI voice agents:"; the
    reviewer flagged it). Now "Here is a short video walkthrough of a similar build:" and the link. The setting can change it.
  - The Loom line setting was missing from the Settings page: it is in Proposal writer now.
  - For edited text, a project already in it was offered again when the writer had shortened its name ("Open Dental AI Calling"
    for "Open Dental AI Calling (Chloe)"). A project now counts as in the text by its name, its name without the part in
    brackets, or its link.
  - The Flag review table was wider than the page at 1440 pixels (the Hint column was cut off): its columns wrap now.

### R64. A faster proposal: the plan in PLAN-SPEED.md, points 1 to 11 (done in code, 14 October)

From the speed review (`SPEED-REVIEW.md`) and the plan agreed with Ahmad (`PLAN-SPEED.md`). Measured on Hamza's Mac with Claude Sonnet.

- **1. The proposal in parts (Ahmad's design).** The writer returns the letter (with a line `[[PROOF]]` where the projects go and
  `[[VIDEO]]` where a Loom line goes, never a project name, a link or the sign off) and one proof block per project. The Loom line
  (setting "The Loom video line") and the sign off are made in code (`src/proposal/parts.ts`). Each version keeps its parts
  (`proposal_versions.parts_json`, migration 041). After writing, changing the projects, the video (a new selector on the proposal
  screen) or the profile redoes only that part as a new version: measured, a video or a profile 1 to 2 ms with no AI, a new
  project 9 s (one short call) against 36 s for a full write. A version edited by hand (or by the chat) is never overwritten: the
  new parts are offered beside the editor with Put it in, Copy and Dismiss. A structured submission is written whole, as before.
  The early draft is now usable whatever the projects, profile or video (only the type has to match), it starts right after the
  matching in the same worker job, and it is no longer skipped when a Loom video is chosen. A first time user gets one as soon as
  the profile is picked.
- **2. Matching for the plugin on the server.** `match_projects` (plugin) queues a re-match of the tags Claude saved, with the app's
  own rules and the AI's order, waits for it (up to 55 s) and returns the shortlist with reasons. The app shows the same list.
  Plugin jobs skip the app's signal reading and early draft (Claude does both).
- **3. No gaps between steps; people first.** The worker looks again every 250 ms when idle (was 1.5 s) and at once when a job ends.
  The order: a proposal someone asked for, a chat answer, the parts update, a new screening, the matching of a job someone just
  continued, the post reading, the review, then background work (matching started by itself, early drafts). Background work never
  takes the last free slot. Pages check every second while something is being made (was 2.5 to 4 s).
- **4. The plugin's reads** stay as they are; they go in one message at the start.
- **5. The first two lines.** When they break the type's rules, only the opening paragraph is written again (a short call), not the
  whole proposal.
- **6. The review** starts in the same worker job right after writing; it never forces changes; `review_proposal` waits up to 55 s.
- **7. Claude only**: nothing to build; check Settings, AI on the live server.
- **8. Fewer repeated reads.** The worker keeps settings, the writing guide, the tag dictionary, the library and the signal
  definitions in memory and reads them again when the setup changes (the newest change set, checked at most once a second; a
  minute at most) (`src/cache.ts`). The library is loaded once per tagging. Tags, matches and signals are saved in one statement
  each. `get_library` and `get_writing_guide` carry a `version` and answer "unchanged" to `known_version`.
- **9. Fewer plugin turns.** The profile is one question, no rate (the profile's own rate is saved); on a PASS the Continue question
  comes with the gate; `record_decision` is sent with the read step's save. The draft is still shown in full in the chat.
- **10.** Not done (Ahmad).
- **11. Matching starts by itself only for jobs likely to be taken (Ahmad's rule).** A PASS, or a FLAG with at most 2 flags (setting
  "Start matching by itself when a FLAG has at most this many flags"); more flags or a FAIL wait for the person, as before.
- Checked: tests (the parts put together, markers, sign off, Loom line, kept and new blocks); `tsc` for the backend and the MCP;
  `node --check`; migration 041 locally; three real proposals written by the new writer (one structured, written whole; one with
  no projects; one in parts with two projects: letter without names or links, both blocks with links, sign off last, no marker
  left, 36 s); the parts redone for a video, a profile and a new project with the timings above; the worker and the web app start.
- **Tested on the local app** (14 October, a temporary test account and test copies of jobs, all removed after):
  - Writing: the proposal was shown 32 s after Write was pressed (the AI call itself took 32 s: no gap), saved in parts; the review
    started in the same job and was done at 51 s.
  - Profile changed after writing: a new version "Updated the sign off" in under a second, the rest word for word the same.
  - Loom video chosen from the new selector: "Updated the video, the sign off" in under a second, the link where the letter had
    its marker. Projects changed: "Updated the projects" in 8 s (one short call), the letter and the kept project unchanged.
  - Edited by hand, then a project changed: no new version; the new project's block was offered beside the editor. Put it in
    puts it in as an unsaved change.
  - Ahmad's rule: three real screenings came back FLAG with 6, 3 and 4 flags, and none started matching by itself. Matching started
    as background work: tagging and the three signal layers together at 6 to 7 s, the AI order at 16 s, and the early draft
    started at once and was done in parts at 40 s.
  - The early draft reused: other projects, another profile and a Loom video than it guessed, and the proposal was shown 8 s after
    Write (one 7 s call for the new project's block), where before it would have been written again from scratch (about 35 s).
  - The plugin's routes with a test token: `match_projects` 13 s with the AI order and a reason per project (11 s again with skip
    tech stack, no Tech stack tag in any match); `save_proposal` with review=true started the review, one `review_proposal` call
    returned it in 15 s, a second call 1 s with no new review; `get_library` with `known_version` answered "unchanged".
- **Fixed while testing:** a profile's signature that is a note about how to sign off (Hamza's: "Hamza Yaseen, then the GitHub
  link on the next line") was pasted in as text. Now only a ready sign off (one that opens with "Best regards", "Thanks" and the
  like) is used as written; otherwise the standard sign off is made, which is what the note asks for. Hamza may want to change
  that field to the sign off itself. And Put it in did not count as an unsaved change, so Save version did not appear.
- Not checked: the plugin in a real Claude conversation with v0.13.0 (zip it, rebuild the MCP, restart Claude).

### R63. Flag review: which rules to relax, with evidence (done in code, 14 October)

- **Why.** After a couple of hundred jobs, the reasons people give for continuing past a FLAG or FAIL should say which rules are too
  strict, without relaxing one that protects us. That needs the reasons counted, not only read (asked for by Ahmad).
- **The picks are data now.** The quick reasons picked when continuing are saved as a list with the reason (`overrides.reason_picks`,
  migration 040), from the app and from Claude (`record_decision` `picks`). Reasons given before this are read for the quick
  reasons their text contains. Skipping from Claude now keeps its quick reason too, as the app's Skip does.
- **The page:** Admin, **Flag review** (managers and admins; a button on the Rules page). At the top, how many jobs are screened
  against the target of 200, and the clean passes to compare with (sent, viewed, chat, interview, hired). Per rule: the jobs it fired
  on (a link to them), how many were continued and skipped, the quick reasons picked each way, how the continued jobs did once sent
  against clean passes, the same counts for jobs where it was the only rule that fired, and a hint:
  - Too few jobs yet: fired on fewer than 20 jobs (or for "relax" and "keep", fewer than 10 of the continued proposals sent).
  - Candidate to relax: continued 70% of the time or more, and those proposals got a chat at least 80% as often as clean passes.
  - Keep it: continued half the time or more, but those proposals got a chat less than half as often as clean passes.
  - Doing its job: skipped 80% of the time or more. Mixed: anything else. A fail rule is never "relax" without "with care".
  The hint is a starting point: read the reasons and open the jobs before changing a rule.
- **From Claude:** `review_flags` (read only) gives the same review; the `job-trends` skill uses it for "which flags can I relax".
  Changing a rule is still the `setup-admin` skill, admins only.
- New `src/flagreview.ts` (pure, tested); the route is `GET /reports/flag-review`.
- Checked: tests (counting, picks stored and found in old text, a rule alone, each hint); `tsc`; `node --check`; migration 040
  locally; the review run on the 30 local jobs (every rule "too few jobs yet", 6 of 20 older reasons matched a quick reason).
  Not checked: the page on screen (needs a sign in).

### R62. Quick reasons to continue past a FLAG or FAIL (done in code, 14 October)

- **What it is.** Continuing with a flagged or failed job asks for a reason. Above the reason box there are now quick reasons, one
  click each: a click writes it into the box as a sentence, a second click takes it out, several can be picked, and words can be
  added around them. The shortest reason setting still applies. Asked for by Ahmad.
- **Setting:** Settings, Screening and tracking, "Quick reasons to continue past a FLAG or FAIL" (admin). Defaults: Invited by the
  client; Strong client history; Strong fit with our past projects; The flag does not apply to this job; Low workload, worth the Connects.
- **The plugin (v0.12.0)** reads the same list from `plugin_options` (`continue_reasons`, and `skip_reasons` for skipping) instead
  of its own fixed picks, so the app and Claude offer the same ones.
- Checked: `tsc` for the backend and the MCP, `node --check`, the tests. Not checked: the chips on screen (needs a sign in).

### R61. The Reviewer page: full control of the independent reviewer, in the app and from Claude (done in code, 14 October)

- **What it is.** A page, Proposal setup, **Reviewer**, for how the independent reviewer scores every proposal (asked for by Ahmad).
  Everyone can read it; an admin changes it. Its parts: how to review; key concerns, most important first; dos; don'ts; the score
  guide; score limits that always hold; how to write the review; how many strengths, problems and suggestions; and which optional
  facts it reads (the signals, the writing rules, the banned phrases, the checklist, the automatic checks).
- **Fixed by the app:** the facts it always reads (the job, the proposal and its screening answers, the profile, the projects, the
  proposal type, the client requirements) and the shape of its answer, so the app and the plugin can always read a review.
- **Like the Gate instructions:** saving makes a new version that is not used until it is activated. "Try the draft" reviews a past
  proposal with the sections in the editor, beside the review it has now, and saves nothing. "See full prompt" shows exactly what the
  reviewer gets for that job. Each version can be loaded back; "Load the built-in reviewer" puts the original back in the editor.
- **Version 1** is the reviewer as it was written in code (R54), split into the sections, so reviews read the same until someone
  changes it. It is created by the app itself the first time it is needed (`ensureReviewer` in `src/proposal/reviewer_store.ts`).
- **Every review** in the app and from Claude uses the active version, and keeps which version made it (`proposals.review_reviewer_version`).
  Activating a version is a change set (Changes page), so the main admin can put it back.
- **From Claude (plugin v0.11.0):** setup kind `reviewer_instructions` for admins: `setup_get` shows every part, `new_version` sends
  only the parts that change (the rest is kept), `activate` is its own change with its own yes. The `setup-admin` skill says how.
- **New setting:** Settings, Independent reviewer, "Review every proposal by itself" (on). Off: a review is made only when asked.
- Migration `039_reviewer_versions.sql`. New: `src/routes_reviewer.ts`, `src/proposal/reviewer_store.ts`; the prompt in `src/proposal/reviewer.ts`.
- Checked: tests (the built-in version still says what the old reviewer said; each part changes the prompt; how many changes the
  answer's limits; a broken stored version falls back); `tsc` for the backend and the MCP; `node --check`; the migration locally;
  version 1 created and a real job's full reviewer prompt built from it; the routes refuse anyone not signed in.
- Not checked: the page in the browser (it needs a sign in), "Try the draft" with the real model, and the setup kind in a real
  Claude conversation.

### R60. The Claude plugin runs faster: saves in parallel, the review starts with the draft (done in code, 14 October)

- **Why it was slow.** The saves were never slow on the server (each is a few database writes). The time was Claude's: about ten
  saves per job, each its own turn followed by a "Saved in Upwork Pro" line; long payloads that repeat what was already shown (the
  post in fields, long reasons and evidence); and `review_proposal` holding Claude for up to 50 seconds on every draft.
- **What changed (plugin v0.10.0).**
  1. Every save goes in the same message as the next step's first call, never as a step of its own, and a save that works gets no
     line. A refused save still stops the run.
  2. `save_proposal` takes `review: true`: the review starts on the server as the draft is saved, Claude shows the draft while it is
     written, and `review_proposal` only collects it. It never starts a second review of the same version unless `again: true`
     (the person asks for a fresh one), so no review is paid for twice.
  3. `save_job` no longer needs `posting`: a plugin job saved without it is queued for the worker, which reads the post into fields
     in the background (one small call on the server's AI, the same reader the app uses). Reasons are a few words, evidence the
     shortest quote.
  4. The proposal type and the Loom video are asked in one question box and saved together.
- Checked: `tsc` for the backend and the MCP, the backend tests, the MCP build.
- Not checked: a real `/proposal` run in Claude with v0.10.0 (zip it, rebuild the MCP, restart Claude), so the time saved is not
  measured yet. Worth timing one job before and after.

### R59. Screening answers apart from the proposal; the plugin stops asking after the review (done in code, 14 October)

- **What was wrong.** The answers to the client's screening questions were stored inside the proposal text, after a "Screening
  answers" line, and the card under the editor was only a view of that text. Deleting them from the proposal deleted the card too.
- **Now.** Each proposal version keeps the cover letter in `content_html` and the answers apart in `answers_json`
  (`src/proposal/answers.ts`, migration `038_screening_answers_apart.sql`). The editor, its word count, Copy cover letter and the
  chat work on the letter only. The card under the editor shows each question with its own box, Copy, and edit; Save version saves
  whichever changed. Editing the letter, a chat revision or writing it again never touches the answers; restoring a version brings
  back its letter and its answers. The writer returns the answers apart and the app no longer joins them to the letter.
- **Old proposals.** Versions saved before this keep the answers inside their text: they are split when read, so nothing is lost
  (checked on the 2 local versions that have them: both split, 7 answers, no letter keeps the section; one older plugin save had
  numbered answers with no question line, now labelled "Question 1" and so on).
- **Readers.** The reviewer gets the letter and the answers apart; `get_job` returns `proposal.text` (the letter) and
  `proposal.screening_answers`; the export has a "Screening answers" column; word counts are the letter's.
- **The plugin (v0.9.0).** `save_proposal` takes `screening_answers` apart from `text` (an older plugin that sends them inside the
  text is split by the server). After the independent review, Claude shows it and ends with one plain line: no AskUserQuestion,
  no list of options. The person names a suggestion if they want it applied (asked for by Ahmad, 14 October).
- Checked: unit tests (the split, old versions, one line answers, nothing stored when there are none); `tsc` for the backend and
  the MCP; `node --check` on `proposals.js`; the migration applied locally.
- Not checked: the proposal screen in the browser (it needs a sign in), a proposal written by the app with the real model since
  the change, and the plugin in a real Claude conversation.

### R58. Skip tech stack tags: match a job's projects without its Tech stack tags (done in code, 14 October)

- **What it is.** On the Projects step a switch, **Skip tech stack tags**. On: the projects are matched again without the job's
  Tech stack tags (Node.js, Python, React / Next.js, PHP / Laravel, Supabase / Firebase, PostgreSQL, MongoDB, No code / low code,
  AI coding tools). Everything else stays the same: the platform filter, the core work, industry, compliance, the other tags and
  the AI's order. It is per job and off by default (Hamza's choice: Tech stack only, matching only, the app and the plugin).
- **How.** `rankProjects` takes `skip` (categories to leave out of the score, the shared tags and the most a project can score;
  `TECH_STACK` in `matching.ts`). `PUT /screenings/:id/skip-tech-stack` saves the switch on the job and queues the matching again
  with `rematch_only`, so the worker scores the tags the job already has instead of reading the job again (no tagging call; the
  AI order still runs). The projects are confirmed again after. Refused while matching runs and once a proposal exists. Every flip
  is in the job's history (field "skip tech stack") and the activity log. The tags panel marks the Tech stack group as skipped.
- **The plugin (v0.8.0).** `project-matcher` leaves the Tech stack category out when the person asks; Decision 3 in `/proposal`
  offers "Match again without the tech stack tags"; `save_step` projects takes `skip_tech_stack`, and `get_job` returns it under
  `saved`, so a job continued in Claude or the app keeps the choice. `get_library`'s matching rule says the same.
- Migration `037_skip_tech_stack.sql` (`screenings.skip_tech_stack`, `screenings.rematch_only`).
- Checked: a unit test (a project sharing only a stack tag drops out, no stack tag listed as shared, the most a project can score
  is without them); `tsc` for the backend and the MCP; `node --check` on `app.js`; the migration applied locally; the route answers.
- Not checked yet: flipping the switch in the browser on a real job (#60 and #62 have a Tech stack tag and no proposal), and the
  plugin in a real Claude conversation (zip v0.8.0, rebuild the MCP, restart Claude).

### R42. Skipping a job asks why (done, 13 October)
- Skip (on the Screening tab) opens "Why skip this job?": five quick reasons (Budget or rate too low, Client history or hire rate,
  Outside our services, Scope unclear, Too much competition) and a note. A reason, a note, or both; the server refuses a skip without
  one, or with a reason not on the list. The quick reasons are editable in Settings ("Quick reasons to skip a job").
- Saved on the job (`skip_reason`, `skip_note`, migration `028_skip_reason.sql`), with the old and new values in the job's change
  record. Shown on the Screening tab ("Skipped because: ..."), the Overview, and the "Why" column of Jobs, Not pursued.
- The Claude plugin asks the reason when the person stops after the gate and saves it with the skip (`record_decision`, `save_job`).
- Checked in the browser on job #49: no reason is refused; a quick reason alone and a note alone both save; the reason shows on the
  page; the server refuses a skip without a reason and a reason not on the list. Job #49 is back at its decide step.

### R43. Screening questions in Upwork's own section: the job decides the type, the answers stand apart (done, 13 October)
- When the client used Upwork's questions section ("You will be asked to answer the following questions when submitting a proposal"),
  the questions are taken from that section (`src/screening/questions.ts`). The signals, and so the proposal type, are read from the
  job without them. Questions written inside the description are part of the job, as before.
- The writer writes the cover letter for the job alone and answers each question separately; the app adds them after the letter
  under "Screening answers", each with its question. Chat revisions keep that section.
- The proposal screen shows a "Screening answers" card under the editor: each question, its answer and its own Copy button. The tab
  row's Copy becomes "Copy cover letter" (the letter only). The word count is the letter's.
- The posting reader lists only that section's questions as screening questions. The Claude plugin follows the same rule.
- Fixed on the way: the check "contains the name ... from a sample" fired on the sender's own first name (Hamza for Hamza Yaseen).
- Checked: tests (the section is found and taken out, questions inside a description are not, the split of letter and answers, the
  sender's own name); job #50 written with the real model: with the questions taken out the type changed from Structured
  submission to Problem first, the letter does not answer them, and the four answers came back each under its question; the page
  splits that text into the letter and four answers. Not checked: the answers card on screen (the browser was signed out by a
  server restart, and I do not sign in with a saved password).
- `npx ts-node scripts/try-writing.ts <job id>` writes a job's proposal with its chosen projects and profile without saving it.

### R44. The first two lines: their own strict rules per proposal type (done, 13 October)
- Each proposal type has a "First two lines" section (Writing guide, open a type): the rules for the two lines Upwork shows in the
  preview, written from each type's own guidance (pain first, a detail only this client wrote, no talk about us, no project names, no
  stats, no greeting; Type 7 starts "Understood.", Type 8 "For your platform," or "For you,"; an invite may greet by name). Plus two
  settings per type: "Must start with" and "No talk about us in the first two lines".
- The writer gets them as strict rules. After writing, the app checks the two lines (greeting, introducing us, a project name, stats,
  talk about us, the required start; a client's own required opening wins). A draft that fails is rewritten once, only those two
  lines; anything still failing is the first warning on the proposal ("First two lines: ...").
- The Claude plugin gets them too (`get_writing_guide`, `first_two_lines`) and checks the two lines before showing a draft.
- Migration `029_opening_lines.sql`. **On the live server run `npm run upgrade:openings` once**: it fills the rules only where a type
  has none, so nothing the team wrote is overwritten (do not run `upgrade:guide` on live: it rewrites the types' text).
- `scripts/try-writing.ts <job id> [type id]` now takes a type.
- Checked: tests (clean openings pass; greeting, introduction, project, stats and talk about us are caught; "Understood."; an invite's
  greeting; a client's own opening; "US" is not "us"); job #50 written by the real model as Type 7 and as Type 1, both openings
  following the rules with no warning. Setup backup re-exported.

### R45. Pakistan time everywhere (done, 13 October)
Why "5 hours ago": the live server runs in UTC, the database sent its times without a zone, and the browser read them as Pakistan
time. Now the app works in Pakistan time (UTC+5) whatever the server's zone:
- The server process and every database connection run in Pakistan time (`APP_TZ` in `src/config.ts`; `SET time_zone='+05:00'` on
  each connection), so NOW(), "today", date filters and the times sent to the page are Pakistan time on a UTC server too.
- The page reads every time as Pakistan time and shows it in Pakistan time, even on a device set to another zone. The status form's
  "now" is Pakistan time. Exports keep the times as they are (they were turned into UTC before).
- **Deploying this on the live server, in this order:** stop the app (pm2 stop), pull, `npm run migrate`, then `npm run fix:timezone`
  (a dry run: it shows what it will move) and `npm run fix:timezone -- --apply`, then start the app. It moves the times the database
  wrote in UTC by 5 hours, once; it does nothing on a database already in Pakistan time and refuses to run twice. Times people typed
  into the status form (sent, viewed, chat, interview, outcome, status history) were already Pakistan time and are left alone.
  Automatic timestamps (created and updated times) need no change: MySQL converts them by itself.
- `npx ts-node scripts/check-time.ts` prints the database session zone, the database's and the server's time and Pakistan time.
- Checked: the session zone is +05:00 here and when the server is started in UTC; a copy of the database with MySQL switched to UTC:
  the dry run, the shift (+300 minutes), and a second run refused; a time written now shows "1 second ago" and the Pakistan time for
  a viewer in New York; tests pass.

### R46. Active and inactive straight from every list (done, 13 October)
- The status in the lists is now a switch: click "Active" (or "Inactive", "Disabled", "Retired", "Off"), confirm in the popup, done.
  The popup says what switching it off means for that kind of item. On: industries, projects, tags, Upwork profiles, Loom videos,
  users, rules, signals, proposal type samples, and a proposal type's own page. Only people allowed to edit the item see a switch;
  others see the plain status. You cannot switch off yourself or the main admin.
- The separate Disable / Enable and Retire / Restore buttons on tags, profiles, users and rules are gone (the switch does it).
- Checked in the browser: an industry switched off and on again through the popup; the rules list; every list's switch call
  (project, tag, profile, signal, rule) off and back on, each ending as it started; no console errors.

### R47. Projects have an Android link and an iOS link (done, 13 October)
- Projects get two store links, Android (Google Play) and iOS (App Store), in the project editor and on the project page. The old
  "mobile link" field stays as "Other mobile link" for anything that is neither store (for example a TestFlight link).
- Nothing is lost: `npm run migrate` splits every existing mobile link by store (migration `030_android_ios_links.sql` and a data step
  after it, run once). Here: Chairboss into both, CaboAirportShuttle and Kruzee into Android, nothing left over. The project seed, the
  sheet sync and the plugin's `add_project` split a combined link the same way (`src/library/mobile.ts`).
- Matching counts an Android or iOS link as a mobile product. The plugin gets `android_link`, `ios_link` (and `other_mobile_link`) in
  `get_library` and picks the store that fits the job; `add_project` takes the two links (rebuild the MCP: `cd mcp && npm run build`).
- Checked: tests (the split, with the literal "\n" the sheet left in Chairboss's cell; a link that is neither store is kept; platforms
  from store links); the migration on this database; Chairboss's page shows both links; saving the links, and a broken link refused.
  Setup backup re-exported.

### R48. The proposal screen: change the type, save and mark sent, no Tracking tab, a loader for chat rewrites (done, 13 October)
- **Change type** (task 23): a button in the proposal's tab row opens every proposal type (the current one and the suggested one
  marked); pick one and the proposal is written again with it, as a new version. Earlier versions stay.
- **Save and mark sent** (task 24): the proposal's tab row is now Copy (or Copy cover letter), Save version (with unsaved edits),
  Change type and Save and mark sent. Save and mark sent saves the edits, finishes the proposal, then one popup asks the status
  (Sent unless more has happened), when it happened (now, Pakistan time), Connects spent, boost, the Loom video sent and notes. Saving
  goes to the Overview.
- **No Tracking tab**: the Overview shows a Tracking card (status now, the status history, Connects, boost, Loom video, notes) with
  Update status and Edit details in the tab row. "Mark as sent" on the Overview of a finished proposal opens the same popup. Old links
  to the Tracking tab open the Overview. The job header's step and status now update as soon as something is saved.
- **Loader** (task 25): while the AI works on a chat request, the proposal is covered by "The AI is working on your request"; Change
  type and Save and mark sent wait until it is done; a rewrite loads by itself.
- Checked in the browser on job #48 (lent to a local test account, then put back as it was): a chat request showed the loader, the
  rewrite loaded as version 2 and the buttons came back; Change type lists the eight types; Save and mark sent saved Sent with the time,
  16 Connects and a note and opened the Overview with the Tracking card; Edit details shows the saved values; no console errors.
- The team guide's pictures of the Tracking tab are now out of date.

### R49. Logs say what changed (done, 13 October)
- Every change to the setup is logged with what changed, not only that it changed: each field's old and new value; for long texts
  (overviews, case studies, a type's text, the writing guide, the gate instructions, profile rules) the lines removed and added; for
  lists (a project's tags and industries, an industry's projects, a video's tags, a type's signal mapping) the names removed and added.
  Entries name the item ("Lucid Vision (id 72)") instead of only its id.
- Covered: projects, industries, tags, tag categories, Upwork profiles, Loom videos, rules, signals and their values, proposal types,
  their signal mapping and samples, writing guide documents, gate instruction versions (and which version is active), settings,
  users (never passwords), and what the Claude plugin adds. Creating shows the values set; deleting shows what was there.
- The Logs page shows the changes under each entry (up to three inline, more folded under "What changed"). Job tracking changes were
  already kept with old and new values (the job's History).
- Migration `031_audit_changes.sql` (`audit_log.changes`). Older entries have no change list.
- Checked: tests (values, lists, lines, a new row, nothing changed); a project's overview and tags edited and put back, and a setting
  changed and put back, through the app: both directions show on the Logs page.

### R50. Tags: pick their projects; the scores explained (done, 13 October)
- **Tag editor** (task 27): "Projects with this tag" with a search, as on the Industries page: tick every project that did that kind
  of work, and the tag is added to or removed from them on Save. For an Industry tag the project's industry follows (Industries page),
  so the two never disagree. The log names the projects added and removed.
- **How the scores work** (task 28): a section at the top of the Tag dictionary: what a score is, how a project's match score adds up
  (industry not counted), what "27 of 42" means, the order on the Projects step (core work, then industry, then score), and the usual
  score per category. The Projects step's note says the same in short.
- Checked in the browser: a project ticked on a tag and saved (the project has the tag, the log says "projects: added Lucid
  Vision"); an Industry tag given a project and taken away again (the project's industry follows both ways); everything put back.
- Later on 14 October (Hamza): the "First two lines" section reads more simply. "Must start with" is now "First word or words",
  with a plain example. The checkbox is now "Check that the first two lines do not talk about us", on its own line, with what it does
  (looks for I, we, our and my after writing; rewrites once; then warns) and when to untick it (Invite, Approach first).

### R51. Matching, the last step: the AI orders the shortlist after reading the projects (done, 14 October)
Why (Hamza, job #60 "AI Agent Developer for Lead Qualification"): screening named Apex, Seller Genius AI and Rock County; the project
step put Seller Genius AI outside the top five. Five projects shared the same core tags, so the order came from adding up broad tag
points (a dental calling bot beat the lead qualification platform). Tags cannot tell such projects apart; reading them can.
- **Tags build the shortlist** (platform, the core work, the industry, the score), as in R41.
- **The AI orders it** (new step): it reads the job and each shortlisted project's overview and case study and puts them in order by
  how well each proves this exact job (the same core work done the same way first, then industry, platform, scale), with a one line
  reason per project, and marks weak fits. The first two that fit are recommended. If that call fails, the tag order is kept and the
  page says so. Settings: "AI orders the matched projects" (on).
- **One list**: the screening page shows "Projects that fit", the same list as the Projects step, with the reasons. Screening no longer
  names projects in "Fit with Stackup"; its own picks only join the shortlist. PASS and FLAG jobs start matching right after screening,
  so the list is usually ready when the job is opened; FAIL jobs when someone continues.
- **Core work** is only real work: workflow, AI capability, automation or product type tags, never a project stage (Prototype), a tool,
  model, stack or a broad tag.
- The Projects step shows each reason under the project name and explains how the list was made.
- The Claude plugin (v0.4.3) does the same last step: it reads the top twelve's case studies and orders them with a reason.
- Migration `032_matching_ai_order.sql`. One more AI call per matched job.
- Checked: tests (the AI order, fits first, weak fits last, recommended; a project stage is never core work); jobs #60 and #61 matched
  again with the real model: lead projects on top with reasons (Rock County, Apex, Dealsmart, Seller Genius AI, Breesy; and Dealsmart,
  Seller Genius AI, Apex, Rock County, Breesy), no healthcare or dental project; the order differs a little between two runs of the
  same job, as an AI judgement does; a fresh screening of #60 no longer names projects; both pages show the same list.
- Later on 14 October: "AI orders the matched projects" is on the Settings page, first under Project matching, as an on / off switch that saves when flipped.
