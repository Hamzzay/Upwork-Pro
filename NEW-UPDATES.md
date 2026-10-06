# New updates (branch `hamza`)

Hamza's changes, made on top of `main` (GLM through Z.ai). Usman: continue from this branch.
Goal of this round: cut the time from pasting a job to having a proposal. It went from **6:05 to 3:23**
on GLM 5.3 (same job, same steps). Screens are unchanged; all changes are in the backend.

## Before you run it

```
cd backend
npm install
npm run migrate        # applies 008_early_drafts.sql (new table)
```

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

Hamza and Claude started the cleanup that was planned for Usman. Each item below is its own commit on this
branch. Items still listed under "Still to do" are for Usman.

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

## Feedback from Hamza's testing
Both items are done in R2: the whole project card is clickable, and Save tracking ends on a "Job complete"
screen.
