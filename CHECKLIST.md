# Checklist: Hamza's requests of 9 October 2026

Everything Hamza asked for in the session of 9 October 2026, in the order to do it. Each line is ticked only when it is built
and checked in the browser. "Checked" says how it was checked. Work is on branch `hamza`; what was built is in `NEW-UPDATES.md`.

Status words: `[ ]` to do, `[~]` in progress, `[x]` done and checked. **Final state, 9 October 2026: every line is done. The limits are written on the lines they belong to and under "What to know" at the end.**

## Part 1. One design for the whole platform

Hamza: the job page looks good now, but the rest of the platform is not standardized. Analyse every screen, then redo the
designs so the whole system has one clean, user first design. Search for the top 20 rules of user experience and make the
platform follow them.

- [x] 1.1 Read every screen's code (`app.js`, `proposals.js`, `style.css`) and open every screen in the browser
      (26 screens, the dialogs, phone width, dark mode).
- [x] 1.2 Look for the screenshot guide the last Claude was asked for. Result: it was never made (task 10 in `TASKS.md` was
      still "to do"; no guide or screenshots in the folder). It is Part 3 below.
- [x] 1.3 Research the top 20 user experience rules (Nielsen's 10 heuristics, the Laws of UX, dashboard and table practice).
- [x] 1.4 Wrote the rules and the design system down (`DESIGN.md`): the 20 rules, how the platform applies each, the text
      styles, colours, spacing and the shared parts every page must use.
- [x] 1.5 One stylesheet for every screen: one set of text styles (no capitals, two weights), flat cards, one button size,
      one badge, one tab style, one way to show facts, one notice, one folded section, dialogs with a fixed head and foot.
- [x] 1.6 One page header on every page (back link, title with its status beside it, one quiet line, buttons on the right).
- [x] 1.7 One status badge everywhere (Pass / Flag / Fail, Active / Inactive, outcomes).
- [x] 1.8 One table style: quiet headers, row buttons right aligned, the destructive button inside the edit dialog.
- [x] 1.9 No browser pop-ups: every question is asked in the app's own dialog.
- [x] 1.10 Phone width: a Menu button instead of a row of icons; every page readable at 375 pixels.
- [x] 1.11 Dark mode checked on 23 screens (a script looked for text too close to its background and found only the decorative dots between words).
- [x] 1.12 Every screen checked again after the change: a script opened 136 routes (every page, and every tab of 13 jobs at every stage): no console errors, no "null" or "undefined", no sideways scroll; 16 pages at phone width; the employee's view.
- [x] 1.13 Bugs found on the way and fixed: saving a tag failed (the dialog read a field that does not exist); "Inactive"
      badges pulsed like a loading state; Settings did not show three settings (lost outcomes, loss reasons, quiet days).

## Part 2. Filters: the same bar on every list, and every list has one

Hamza: the filters on top are not standardized (half the screen in some, one and a half rows in others). Whatever the number
of filters, they must look clean and the same. Every list must have a search and filters: Loom videos, Upwork profiles, tag
dictionary, industries, projects, signals, guides, instructions, rules, everything.

- [x] 2.1 One filter bar (search, then filters in equal columns, then the list's buttons; "Clear filters" only while
      something is filtered). Search, filters and page are kept in the link, so Back returns to the same view.
- [x] 2.2 Jobs
- [x] 2.3 Projects (search, industry, tag, status)
- [x] 2.4 Industries (search, status)
- [x] 2.5 Tag dictionary: tags (search, category, status) and categories (search, kind)
- [x] 2.6 Upwork profiles (search, status, setup)
- [x] 2.7 Loom videos (search, profile, status, tagging)
- [x] 2.8 Signals (search, layer, status)
- [x] 2.9 Writing guide (search, kind)
- [x] 2.10 Gate instructions: versions (search). The same on each writing guide document's versions.
- [x] 2.11 Rules (search, type, status)
- [x] 2.12 Users (search, role, status)
- [x] 2.13 Logs (same bar; action, person, dates; job type, result, model)
- [x] 2.14 Dashboard (same bar look for the period, profile and person)
- [x] 2.15 Every filter tried by script on 10 lists: a search with no match shows the empty state and Clear, Clear brings the rows back, each dropdown filters. Jobs, Logs, Dashboard and Reports filters were tried through their links.

## Part 3. A guide with screenshots, to train the team

Hamza: after the design is done (not before), make a guide with screenshots that lets me train my team: how to add things,
how to manage things, and how to use it with Claude and without Claude.

- [x] 3.1 53 pictures of every screen, tab and main dialog, taken from the finished design, with numbered markers (two early ones, "waiting" and "decide", have denser markers).
- [x] 3.2 The daily job: screen a job, decide, pick projects, pick the profile, review the proposal, mark it sent, update the
      status (without Claude).
- [x] 3.3 The same with Claude: connect Claude, the plugin, `/proposal`, saving statuses, asking for trends. In words and a table; there are no pictures of Claude itself.
- [x] 3.4 Adding and managing: projects, industries, tags, profiles, Loom videos, signals, proposal types, the writing guide,
      rules, gate instructions, settings, users.
- [x] 3.5 Reading the numbers: Dashboard, Reports, Jobs filters and export, Logs.
- [x] 3.6 The guide is `guide/index.html`, opens in a browser, and is linked from `README.md` and `TASKS.md`.

## Part 4. The MCP: stable enough to pull jobs in bulk for analysis

Hamza: make sure the MCP can read and write the data reliably. Later I want to pull, say, 500 jobs, or the jobs between two
dates, with all their details into my Claude, to compare which were viewed, which got a chat, which proposal worked: to find
the trends.

- [x] 4.1 Every read tool tested against the running app (14 checks, `npm run test:read` in `mcp/`); the write tools run end to end on a throwaway job, then removed. Nothing failed. The sheet import tools were not run (their suite needs a scratch database, which the app's database user may not create).
- [x] 4.2 A bulk read for analysis: jobs by date range, phase, profile, person, outcome and rule, in pages, with every detail
      (post, gate result, decision, projects, profile, proposal type and text, signals, tags, statuses with dates, outcome
      and loss reason), sized so that 500 jobs come through without being cut off.
- [x] 4.3 A summary read: the trend numbers themselves (the same ones as the Reports tab), so Claude does not have to count.
- [x] 4.4 Documented in `mcp/README.md` and the plugin (new skill `job-trends`, v0.4.0). Volume: the database holds 28 jobs, so 500 could not be read for real; paging was forced with small pages (3, 6 and 12 pages, no job lost or repeated) and unit tested with 500 rows.

## Part 5. A Reports tab with every trend

Hamza: create a Reports tab with all kinds of trends: who did what, which profile ranks, which profile had the most opens
and views, date ranges, profiles, people submitting, the kinds of proposals, the projects attached, Loom video against none,
signals, problem solving, tags: everything we can track.

- [x] 5.1 Reports page in the sidebar, with the shared filter bar (date range, profile, person, source).
- [x] 5.2 Funnel by any dimension: sent, viewed, chat opened, interview, hired, with the rates.
- [x] 5.3 By profile, by person, by proposal type, by project attached, by industry, by job tag, by signal value, by rule
      fired, by verdict and by continued past a flag, by source (app against Claude plugin), by Loom video used or not.
- [x] 5.4 Over time (by week): volume and each rate.
- [x] 5.5 Money and effort: Connects spent per view, per chat, per hire; time to proposal; days from sent to close; loss
      reasons.
- [x] 5.6 Every number opens the jobs behind it. Export of any report.
- [x] 5.7 The Loom video is now recorded per proposal (Tracking, Edit details), so that report exists. Still not recorded, so not
      reportable: which screening answers were used, and what the client wrote back.

## Part 6. Close out

- [x] 6.1 `NEW-UPDATES.md` entries, `TASKS.md` updated, `README.md` updated.
- [x] 6.2 Type check, tests, `node --check` on the browser files.
- [x] 6.3 Committed on branch `hamza`. **Not pushed**: say the word and it goes to `origin/hamza`.
- [x] 6.4 Final confirmation: every line above ticked, or the reason it is not.

## What to know

- The order was changed on purpose: Reports and the MCP were built before the guide, so the guide's pictures show the finished
  product (Reports included) and did not have to be taken twice.
- The server on port 3000 was restarted (new routes) and migration 025 was applied to the local database.
- Two sign-ins and one invented job were made for the checks and the guide's pictures. All three are removed again.
- To use the new Claude tools: the MCP is rebuilt (`mcp/dist`); zip the plugin as v0.4.0, install it, restart Claude.
- Reports are honest about small numbers: with 13 sent proposals, most groups are too small to trust yet.
