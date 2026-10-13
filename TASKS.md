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
| 20 | Active and inactive straight from every list (rules, projects, profiles, tags, industries, Loom videos, types): click the status, confirm in a popup, done | to do |
| 21 | Projects get two mobile links, Android and iOS. Existing links are split by store, nothing lost | to do |
| 22 | Project step: "Show 10 more projects" (R41) | done |
| 23 | Change the proposal type after a proposal is written, from the proposal screen, and rewrite | to do |
| 24 | No Tracking tab: the proposal screen has Copy, Save, and "Save and mark sent", which asks for Connects, boost, Loom video, status, when, notes. Tracking details show on the Overview tab | to do |
| 25 | A loader while a proposal is rewritten from the chat box | to do |
| 26 | Logs show what changed (old value and new value), not only "updated" | to do |
| 27 | Tag editor: pick the projects that have the tag, with a search (like industries and projects) | to do |
| 28 | Explain the tag scores in the app, next to the tags | to do |

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

## Later


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
