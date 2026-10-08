# Tasks and handoff

The running task list for Upwork Pro, kept so any Claude (or person) can pick up where the last one stopped.
**Update this file whenever a task starts, finishes or changes.** What was built and why is in `NEW-UPDATES.md` (R1 to R23 and on).

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
| 3 | Team plugin content in Upwork Pro: eight types, writing guide, strict certification rule (R25). New project sheet `19ZEAEguo0ZPyhM0diq2WAs6kf5sA9YfsiBmrknKpxss` (42 projects) still to sync | partly done |
| 4 | Type selection with required / supporting / excluded signals and priority groups; signals 20 to 22 (R25) | done |
| 5 | Matching: the "job needs" line, platform filter, core workflow check | to do |
| 6 | Rules F6 generic mass invite and G18 any other risk (R25) | done |
| 7 | Certifications per profile, used only when a client requires one (R25) | done |
| 8 | Loom videos: a section with several videos per profile, tagged so the right one fits a job; proposal types that use them later, once Hamza picks the topics | to do |
| 9 | Merged plugin v0.3.0: the team's content plus the Upwork Pro connection | to do |
| 10 | Step-by-step guide for the team, with screenshots and arrows, every tab and screen | to do (after 3 to 8, so the screens are final) |

## Later

- Host Upwork Pro on a public https address (needed for sign-in from claude.ai and for several Claudes to share it).
- Plugin version check.
- Phone width check of the job page.
- Job #35's proposal was marked finished at 02:56 PKT on 2026-10-09 by the Admin account; Hamza to confirm it was him, else undo.

## How to test the job page

In Chrome (signed in), for jobs at every stage (#49 decide, #50 projects, #51 review, #36 proposal failed, #35 and #48 ready, #1 and #7
submitted, #10 and #47 closed, #44 and #45 skipped, #46 screening failed), open each tab and check: every button is in the tab row,
nothing greyed out, at most five text styles, no "null", "undefined" or "NaN", no console errors.
