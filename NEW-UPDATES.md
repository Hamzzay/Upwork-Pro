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

### R140. Claude reaches every job, a page at a time; finding the jobs still missing a link (done, 27 October)
Why (Hamza): after R139 filled the links, Claude checked 72 of about 160 jobs (68 had a link) but could go no further. `find_jobs`
gave at most 50 with no next page, and `analyze_jobs` had no link column, so the older jobs could not be checked.
- **Jobs list: a "Job link" filter** under More filters (With a job link / No job link), so every job still missing one is a click
  away. Edit details sets it.
- **Claude**:
  - `find_jobs` takes `link` ("no": only jobs without a link) and `page`, and answers with `total`, `more` and `next_page`, so it
    can go through all of them;
  - `analyze_jobs` takes the same `link` filter and every row has `job_url`.
  With R139's `get_job` (the job page) and `update_job_details` (`job_link`), it can find, read and fill every one.
- **Every list Claude reads now reaches everything** (Hamza: for research and trends it must be able to fetch all the jobs, 160 or
  5,000, in chunks):
  - `analyze_jobs` already did: each page fits the answer, and it calls again with `after` until `more` is false. Checked: every
    page pulled gave all 37 jobs (one page, or two with the heavy extras), the same as the database;
  - `find_jobs`: `page`, with `total`, `more` and `next_page` (it stopped at 50);
  - `list_feedback`: `page` (it stopped at 500 notes), with `total`, `more` and `next_page`;
  - `setup_history`: `page` (it stopped at 50 changes). Checked: 5 pages of 10 gave all 41 changes.
- Note: the new tools show in Claude once Upwork Pro is reconnected there (or in a new chat); a chat open before the deploy still
  has the old list.
- Checked locally: "no link" gave 16 jobs over two pages of 10 (more, next_page, then the last 6), the 21 with a link all had
  `job_url`, `analyze_jobs` gave the column, and the Jobs list filter agreed (16).

### R141. Why Claude showed the 10-4 Global logo for the connector, and the connector's own icon (done, 27 October)
Why (Hamza): the Upwork Pro connector in Claude showed the 10-4 Global logo.
- **Not from this project**: every icon in it is the Upwork Pro "U". 10-4 Global appears only as a project in the library data.
  `upworkpro.stackupsolutions.co` serves the right icon (its favicon is byte for byte the project's), and its page names the Upwork
  Pro icons.
- **The cause is the main domain.** `stackupsolutions.co` runs another site on the server (Apache), and its page names its icon
  `/web/images/receipt-logo.png`, which is the 10-4 Global Logistics logo. Google's favicon service has that logo for
  `stackupsolutions.co` and has nothing for the `upworkpro.` subdomain, so an icon lookup for the connector falls back to the main
  domain and gets 10-4's. (Also: `www.stackupsolutions.co` redirects to itself in a loop.)
- **The connector now names itself and its icon** (`serverInfo`: title "Upwork Pro", the website, and the 512, 192 and SVG icons from
  the app's own address), the way the MCP spec lets a server say which icon to show, instead of leaving it to the domain.
- **To fix at the source, on the server:** give `stackupsolutions.co` its own Stackup icon (the 10-4 app's `receipt-logo.png` should not
  be the domain's icon), or move that 10-4 app off the main domain. Google refreshes its cached icon on its next visit; Claude may
  keep its own copy until the connector is removed and added again.
- Checked: the connector's handshake returns the title, website and three icons; the live site's favicon matches the project's.
- **Fixed on the server (26 October):** Apache answered any name without a site of its own with the first site in alphabetical
  order, `104-global-api.stackupsolutions.co`, so the bare `stackupsolutions.co` showed the 10-4 Global app. Now:
  - a `000-catchall` site answers unknown names with "not found";
  - `stackupsolutions.co` has its own site and certificate and redirects to `https://stackupsolutions.com`;
  - checked from outside: the 10-4 sites and Upwork Pro still answer.
  Google's favicon service still has the old logo for the domain until it reads the site again. Search Console, Request indexing
  for `https://stackupsolutions.co/` and `https://upworkpro.stackupsolutions.co/`, speeds that up. Removing and re-adding the
  connector does not, because the copy is Google's.

### R142. More than one Loom video on a proposal, and Loom videos linked to projects (done, 29 October)
Why (Hamza): one video is the standard (and the one added by itself), but a person should be able to add another. And some videos
are about a project, so a video should be linkable to projects (generic ones to none), to use it on proposals for that project.
- **Several videos on a proposal.** The first video is the standard one, picked by itself as before (`screenings.loom_video_id`, so
  reports and statuses are unchanged). Up to five more can be added, each one of the sending profile's own.
  - In the proposal they sit in the one video place: the first in the admin's wording, then each added one as "Title: link".
    Changing the videos swaps that block in place, in a proposal made from parts and in one edited by hand (offered beside it when
    the old lines cannot be found).
  - Where to add them:
    - the step before writing: the video cards, then "Add another video";
    - the proposal page: the Loom video dropdown, then "More videos" beside it;
    - Claude: `save_step` loom takes `more` (titles).
  - The checks allow every chosen video's link.
- **Videos linked to projects.** Library, Loom videos: each video has a Projects field (empty for a generic video). The list shows
  "Projects: ..." or "Generic (no project)", has an "Any project" filter, and searches project names. Changes are kept in Changes.
  - Picking by itself: a video about one of the proposal's chosen projects comes first; otherwise the best tag match, as before.
    The pickers say "About Chairboss", "For ..." or "Generic".
  - Claude's `plugin_options` lists each video's projects.
- Migration 074: `loom_video_projects` and `screening_looms`.
- Checked:
  - unit tests: one video as before, three in one place, the first never twice, none, assembled in the video place;
  - live on a test job showing Chairboss: a video linked to Chairboss was suggested first; three videos went in, then one, none
    and three again, each swapped in place; a video of another profile refused;
  - screenshots of the proposal page (the two pickers side by side) and the video editor's Projects field.
