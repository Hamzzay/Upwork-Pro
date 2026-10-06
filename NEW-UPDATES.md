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

## Feedback from Hamza's testing (not done yet)
1. **Projects step: the whole project card should be clickable**, not only the small tick box.
   Having to untick one project before picking another is fine. (`backend/public/app.js` around line 385.)
2. **Tracking step: Save tracking should finish the journey** and take the user to a separate success
   screen, instead of staying on the same page.
