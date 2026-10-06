# New updates (branch `hamza`)

Hamza's changes, made on top of `main` (GLM through Z.ai). Usman: continue from this branch.
Goal of this round: cut the time from pasting a job to having a proposal. It went from **6:05 to 3:23**
on GLM 5.3 (same job, same steps). Screens are unchanged; all changes are in the backend.

## Before you run it

```
cd backend
npm install            # exceljs is now a runtime dependency (export)
npm run migrate        # applies 008 to 011: early drafts, tracking fields, settings, AI call log
```
Then sign in: you land on the new **Dashboard**. Admin pages: Upwork JobGate, Rules, Settings, Users, Logs.

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

## Feedback from Hamza's testing
Both items are done in R2: the whole project card is clickable, and Save tracking ends on a "Job complete"
screen.

## Next for Usman
1. Review R1 to R7 on this branch (one commit each) and sign in to try each page.
2. Update the README for the new pages (Dashboard, Jobs filters and export, Rules, Settings, Logs) and the
   migrations.
3. Rules: bring the gate prompt in Upwork JobGate in step with the Rules page (codes in the prompt), and decide
   whether to activate gate version 2 (adds G17).
4. UI polish still open: the Proposal step itself, and phone widths for the new tables and dashboard.
5. Profiles: only Wasif is set up; the early draft guesses the profile, so it works best once all seven exist.
