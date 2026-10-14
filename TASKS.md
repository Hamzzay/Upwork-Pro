# Tasks and handoff

The running task list for Upwork Pro, kept so any Claude (or person) can pick up where the last one stopped.
**Update this file whenever a task starts, finishes or changes.** What was built and why is in `NEW-UPDATES.md` (R1 to R34 and on).
The design rules every page follows are in `DESIGN.md`. Hamza's requests of 9 October, line by line, are in `CHECKLIST.md`.

## How to pick up

1. Read this file, then the last few entries of `NEW-UPDATES.md`, then `README.md`.
2. Work on branch `hamza`. Never merge to `main`. Commit each finished task with its `NEW-UPDATES.md` entry and push.
3. Local setup (Hamza's Mac): MySQL from XAMPP on port 3306 (database `upwork_gate`); backend in `backend/`
   (`npm run dev` for the website on http://localhost:3000, `npm run worker` for the AI jobs); MCP in `mcp/` (`npm run build`).
   After pulling: `npm run migrate`, then the seed scripts named in the top of `NEW-UPDATES.md`.
4. Checks before calling anything done: `npx tsc --noEmit -p .` and `npm test` in `backend/`; `node --check` on the files in
   `backend/public/`; then look at it in the browser on real jobs (see "How to test the job page" below).

## House rules (from Hamza)

- Never print, paste or commit keys, tokens or passwords. `backend/.env` is never committed. Stage files by name, never `git add -A`.
- Never send Slack or any message without Hamza's yes.
- Plain English everywhere in the app and the docs: sentence case, no dashes, no emojis.
- Every change goes in `NEW-UPDATES.md` (for Usman). `hamzanotes.md` is Hamza's own and is never committed.
- Review and test before saying something is done; report what was not checked.

## Decisions that stand

- Upwork Pro is the one source for projects, tags, profiles, rules, the gate instructions and the writing guide. The Claude plugin
  reads them through the MCP (`get_library`, `get_writing_guide`, `plugin_options`) and saves jobs, proposals and statuses through it.
  The Google Sheet sync was removed (R20). The plugin's own files are only a fallback.
- Each person connects their own Claude by signing in (OAuth, R20); everything is recorded as that person.
- "Showable publicly" on projects is ignored for now (Hamza, 2026-10-09).
- Rule codes are never reused: our G17 means "breaks platform rules"; the team plugin's "any other risk" becomes G18.
- Certifications: per profile; used in a proposal only when the client explicitly requires a certification.
- The job page: every button in the tab row, nothing greyed out, decision first, five text styles (R23 rules, comments in `jobPage`).

## Now

| # | Task | Status |
| --- | --- | --- |
| 1 | This handoff file | done |
| 2 | Back up the setup data into the repo (`npm run setup:export`, restore with `npm run setup:import -- --apply`), R24. Re-export after setup changes. | done |
| 3 | Team plugin content in Upwork Pro: eight types, writing guide, strict certification rule (R25); the new 42-project sheet synced (R26) | done |
| 4 | Type selection with required / supporting / excluded signals and priority groups; signals 20 to 22 (R25) | done |
| 5 | Matching: platform filter, industry pools with related industries, the alternative, the job needs line (R27) | done |
| 6 | Rules F6 generic mass invite and G18 any other risk (R25) | done |
| 7 | Certifications per profile, used only when a client requires one (R25) | done |
| 8 | Loom videos per profile, tagged; the best one suggested on the Profile step and given to the plugin (R28). Next, once Hamza picks the topics: proposal types that link a video | done (types later) |
| 9 | Merged plugin v0.3.0: the team's content plus the Upwork Pro connection, source in `plugin/` (R29). Hamza to install it and run `/proposal` on one job | done (end to end run pending) |
| 10 | Step-by-step guide for the team, with pictures and numbered markers, every tab and screen: `guide/index.html` (R34) | done |
| 11 | One design for every screen, the rules in `DESIGN.md` (R30) | done |
| 12 | The same filter bar on every list, and a search and filters on every list (R31) | done |
| 13 | Reports page with 27 trends; the Loom video recorded per proposal (R32) | done |
| 14 | MCP: `analyze_jobs` (bulk, paged) and `get_trends`; plugin v0.4.0 with the `job-trends` skill; `npm run test:read` (R33) | done (zip the plugin, rebuild the MCP, restart Claude) |

## Hamza's notes of 13 October (to do, in this order unless Hamza says otherwise)

| # | Task | Status |
| --- | --- | --- |
| 15 | Matching, the heart of the app: one workflow for screening and the project step (R41) | done |
| 16 | Skipping a job asks for a reason: five quick picks plus a note, saved and logged (R42) | done |
| 17 | Screening questions in Upwork's own section: signals and type from the job alone, answers apart with a Copy each (R43). The answers card still to be seen on screen | done |
| 18 | The first two lines: strict rules per proposal type, checked and rewritten once (R44). Live: `npm run upgrade:openings` | done |
| 19 | Pakistan time everywhere (R45). Live: stop, pull, migrate, `npm run fix:timezone -- --apply` once, start | done |
| 20 | Active and inactive straight from every list, with a confirm popup (R46) | done |
| 21 | Android and iOS links per project; existing links split by store, nothing lost (R47) | done |
| 22 | Project step: "Show 10 more projects" (R41) | done |
| 23 | Change the proposal type after writing, from the tab row (R48) | done |
| 24 | No Tracking tab: Save and mark sent with one popup; tracking on the Overview (R48) | done |
| 25 | A loader while the AI works on a chat request (R48) | done |
| 26 | Logs show what changed: old and new values, lines, names added and removed (R49) | done |
| 27 | Tag editor: pick the projects that have the tag, with a search (R50) | done |
| 28 | Tag scores explained on the Tag dictionary page (R50) | done |
| 29 | Matching, last step: the AI orders the shortlist with a reason; screening shows the same list (R51) | done |

## Next (planned 14 October, see `PLAN-PLUGIN.md` for the full plan)

| # | Task | Status |
| --- | --- | --- |
| 30 | Part A: the Claude plugin saves every step in Upwork Pro (gate, decision, read, profile, projects, type, video, drafts, final) and can resume a job left halfway (R52, plugin v0.5.0, migration 033) | done on the server and the skill; a real `/proposal` run in Claude with v0.5.0 still to do (stop after the projects, continue in a new chat) |
| 31 | Part B: admins run the setup from Claude (projects, industries, tags, profiles, videos, rules, signals, types, writing guide, gate instructions, settings), every change a change set that can be reviewed and put back; second admins' changes reviewed by the main admin, optional approval first. Phases B1 to B3 (B4, approval first, is not wanted: Hamza chose apply at once). His answers are in the plan | done: B1 (R53), B2 and B3 (R56, plugin v0.7.0, migration 036). To do: try the skill in a real Claude conversation |
| 32 | An independent proposal reviewer: after a proposal is written, a separate agent scores it out of 10, gives key points and two or three suggestions; the person applies one, reviews again, or copies as is (plan, section D) | done (R54, plugin v0.6.0, migration 035). A real `/proposal` run in Claude still to do |
| 33 | Setup through Claude never saves raw input: examples first, ask, check, verify, rewrite in the standard format, show, approve, then add (plan, section C; part of B3) | done (R56: the seven steps in the `setup-admin` skill) |
| 34 | Live data of 13 October brought back: setup backup refreshed with live's project, tag and rule updates; matching and every job page checked on the live copy (R55) | done |
| 35 | Team guide: new screenshots (no Tracking tab, skip popup, project step, review panel, Changes), and a section on running the setup from Claude (R57) | done |
| 36 | Skip tech stack tags: a per job switch on the Projects step (and in the plugin, v0.8.0) that matches the projects without the Tech stack tags, the rest unchanged (R58, migration 037) | done in code; to check in the browser on job #60 or #62, and in Claude |
| 37 | Screening answers kept apart from the proposal: own field per version, own boxes on the proposal screen, the plugin saves them apart (R59, plugin v0.9.0, migration 038) | done in code; to check on screen with a job that has screening questions |
| 38 | Plugin: after the independent review, show it and wait, no forced options (R59) | done in the skill; to try in Claude |
| 39 | Plugin speed: saves in parallel with the next step, the review started with the draft, no post in fields, type and video in one question (R60, plugin v0.10.0) | done in code; time one real run in Claude before and after |
| 40 | The Reviewer page: full control of the independent reviewer (sections, versions, try, full prompt, activate), and from Claude as setup kind reviewer_instructions (R61, plugin v0.11.0, migration 039) | done in code; to check on screen, try a draft with the real model, and try it from Claude |
| 41 | Quick reasons to continue past a FLAG or FAIL: one click fillers above the reason box, an admin setting, shared with the plugin (R62, plugin v0.12.0) | done in code; to check on screen |
| 42 | Flag review: per rule, continued or skipped, the reasons picked, how the continued jobs did against clean passes, and a hint; quick reasons stored as data; review_flags for Claude (R63, migration 040) | done in code; review at 200 jobs |
| 43 | A faster proposal: PLAN-SPEED points 1 to 11 (parts, server matching for the plugin, no gaps between steps, the review in the same job, the opening only, memory for the setup, fewer plugin turns, Ahmad's auto matching rule) (R64, plugin v0.13.0, migration 041) | done in code; to check on screen and in Claude |
| 44 | Team guide up to date for R58 to R64: 6 pictures retaken, 6 new, the text for every changed screen and for Claude (R65) | done |
| 45 | Setting up from zero: the guide (guide/setup.html), the starter kit (npm run seed:starter), the company name as a setting; checked on an empty database to a first proposal (R66) | done |
| 46 | The Claude plugin for another company: replace its backup files, job gate text and profiles list with that company's (or generate them from its Upwork Pro) | open, only when another company uses the plugin |
| 47 | Experience gaps answered on the proposal (the library learns them, switched off), and proposal feedback with its page and list_feedback for Claude (R67, migration 042) | done in the app |
| 48 | The same in the Claude plugin: ask the gaps after the draft, save the answers, update; save feedback from the chat | next |
| 49 | Team guide: pictures and text for the gaps card, the feedback card and the Proposal feedback page, and the Proposal tab pictures again after R69 (job-proposal, job-review, job-parts) | open |
| 50 | Opening lines (all types) in the Writing guide: the defaults for the first two lines, each type's own rules added after and winning (R68, migration 043, plugin v0.14.0) | done |
| 51 | The Proposal tab cleaned up: one card of tools beside the proposal (Chat, Review, Experience, Feedback), one line of checks above it, How this was written in a window (R69) | done |
| 52 | The cover letter and the screening answers in two tabs on the Proposal tab (R70) | done |
| 53 | Experience: a Yes names any number of projects; the Experience tab redone (R71, migration 044) | done |
| 54 | Compare two versions side by side (R72) | done |
| 55 | Three openings, each a different direction and tone, swiped through on top of the proposal; Use this opening (R73, migration 045) | done |
| 56 | Documents attached to a job, read by the AI with the post in every step; images and scans read by the AI once (R74, migration 046) | done |
| 57 | Opening styles in Settings: two to four base instructions, one opening per style (R73) | done |
| 58 | The Claude plugin: show and use the openings, attach a job's documents when saving it | open |

### Matching: what went wrong (found 13 October, live jobs #19 and #29)

The job: a recruitment company wants contact data scraped for real estate, trades and medical centres. The tagger gave it four
industries (Construction, Healthcare, Real estate, Recruitment / HR), because the post names the industries of the data. Healthcare
then counted as "same industry", so Doctoria, Navience and DentalMasteryDynamics were shown, and industry first put them above the
projects that prove scraping. Separately, screening picks its own "sample projects" in a different AI reading, so the screening notes
and the project step disagree (job #50: screening named Seller Genius AI, Rock County Sealcoat, Apex; the project step recommended
Seller Genius AI and Breesy).

### Matching: the proposal (approved 13 October, built in R41 with core work named by the tagger)

1. One job industry: the client's business, or the users of what is built. Never the industries of data to be collected, leads to be
   found or markets to be reached. None when unclear.
2. The work comes first: a project can be recommended only if it shares the job's core work (a Workflow type or AI capability tag).
   A same industry project that proves none of the work is never recommended.
3. Then industry: among projects that prove the work, the same industry first, then related, then the rest.
4. One list: the projects screening named are always in the project step, marked "Named in screening", so the two never disagree.
5. One minimum score for the app and the plugin.

## Deploying R41 to R56 on the live server (in this order)

1. `pm2 stop all` (nobody should be saving while the times move).
2. `git pull` on branch `hamza`, then in `backend/`: `npm install` (no new packages, but cheap) and `npm run migrate`
   (migrations 027 to 036, and the one-time split of mobile links into Android and iOS).
3. `npm run fix:timezone` (dry run: read what it will move), then `npm run fix:timezone -- --apply` (once; R45).
4. `npm run upgrade:openings` (fills each proposal type's first two lines where empty; R44). Do not run `upgrade:guide` on live.
5. In `mcp/`: `npm run build` (the add_project and record_decision tools changed).
6. `pm2 start all`. Check: `npx ts-node scripts/check-time.ts` shows session_zone +05:00 and Pakistan time.
7. In Claude: download the plugin again from Connect Claude (v0.7.0) and restart Claude.
8. Jobs matched before R41 keep their old project lists until matched again (Projects step, "Find matching projects" or a new job).

## Later

- A local test admin `claude.test@localhost.test` exists on Hamza's Mac for checking screens (not on live).


- Loom: Hamza to choose 5 to 7 video topics per profile and which one to three proposal types link a video; then add a "uses Loom" switch on types and the writer line.

- Zip plugin v0.4.0 (`cd plugin && zip -qr ../stackup-proposals-0.4.0.plugin .claude-plugin README.md skills`), install it, and try "which profile had the best view rate?" in Claude.
- Reports get useful with volume: keep statuses, Connects and the Loom video recorded on every job.
- A real 500 job read through the MCP (only 28 jobs exist; paging is tested with small pages and with 500 rows in a unit test).
- The guide's "waiting" and "decide" pictures could be retaken with the tidier markers (needs a job at the decide step that you own).
- Host Upwork Pro on a public https address (needed for sign-in from claude.ai and for several Claudes to share it).
- Plugin version check.
- Job #35's proposal was marked finished at 02:56 PKT on 2026-10-09 by the Admin account; Hamza to confirm it was him, else undo.

## How to test the job page

Every design check is listed at the end of `DESIGN.md`. In Chrome (signed in), for jobs at every stage (#49 decide, #50 projects, #51 review, #36 proposal failed, #35 and #48 ready, #1 and #7
submitted, #10 and #47 closed, #44 and #45 skipped, #46 screening failed), open each tab and check: every button is in the tab row,
nothing greyed out, at most five text styles, no "null", "undefined" or "NaN", no console errors.
