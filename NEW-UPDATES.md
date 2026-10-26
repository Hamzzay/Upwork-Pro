# New updates (branch `hamza`): latest copy

Hamza's changes on top of `main`. Usman: continue from this branch. **This file is the source of truth for what was built and
why.** Older entries are in the archived copies below.

## The copies of this log

| Copy | Entries | Dates | File |
|---|---|---|---|
| 1 | R1 to R137 | up to 27 October 2026 | [`updates/NEW-UPDATES-1.md`](updates/NEW-UPDATES-1.md) (archived) |
| **2, latest** | **R138 to R187** | 27 October 2026 on | this file |

**The rule:** a copy holds 50 entries at most. When the latest copy reaches 50 (this one at R187), it is moved to
`updates/NEW-UPDATES-<copy number>.md`, with the archived note at its top, and a new `NEW-UPDATES.md` starts at the next R number
with this header, the table above (one more row) and the setup section below. Entries keep their R numbers across copies, so
"R74" is found by its range in the table. New entries go at the end of this file.

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

Every migration and data step runs with `npm run migrate` (`npm run migrate:prod` on the server); the list above is from when the
round started and is kept for a fresh install.

## Updates

### R138. The update log is kept in copies of 50 (done, 27 October)
Why (Hamza): this file had grown to 137 entries (245 KB), so every reader went through all of it to find the latest work.
- R1 to R137 are frozen as copy 1, `updates/NEW-UPDATES-1.md`, with a note at its top that it is archived and where the latest is.
- This file is the latest copy (copy 2, from R138) and the source of truth. Its top lists every copy with its R range and dates,
  then the setup section (still how to install and run).
- **Every 50 entries a copy is archived** as `updates/NEW-UPDATES-<n>.md` and a fresh `NEW-UPDATES.md` starts. This copy is
  archived at R187.
- `TASKS.md` and `README.md` say the same, so whoever works next reads only the latest copy, then an older one only when they need
  it.

### R139. Every job keeps its Upwork link (done, 27 October)
Why (Hamza): most jobs had an empty job link although the link was in the pasted page, and Claude could neither read it there nor
set it. New jobs should save their link by themselves.
- **New jobs save their link by themselves.** When page text is pasted and the link box is left empty, the job's own link is
  taken from the text: the one after Upwork's "Job link" line, else the only Upwork job link on the page. With several (the
  client's other jobs) none is taken, never a guess. The same holds for jobs saved from Claude without a link. Links are kept in
  one form, `https://www.upwork.com/jobs/~02<id>`.
- **Jobs saved before now get theirs once** (data step 073 on deploy), each fill kept in the job's history as "job link from the
  post". A page with no link stays empty.
- **By hand: Edit details has a Job link field** (an Upwork link, or empty), every change kept in the job's history.
- **Claude**: `update_job_details` takes `job_link`, and `get_job` returns `job_page`, the page as it was pasted (up to 15,000
  characters), so it can read the link and the rest. (Its two blockers: it could not write the field or read the page.)
- Checked:
  - unit tests: the link after "Job link" over other jobs' links, the only one in a long form, two others give none, not Upwork,
    an apply link;
  - locally: 18 of 45 jobs filled (the other 27 have no link in their text); a pasted page with the box empty saved its link and
    job id; Edit details and Claude's job_link changed it, each in the history; a non-Upwork link refused.
