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

### R143. A later step fills in the steps before it (done, 3 November)
Why (Hamza): Sent, Viewed, Chat opened and Interview come in order, but people skipped the middle ones (straight to Chat or to
Interview), so jobs that got a chat showed as never viewed.
- **A chat means the proposal was viewed; an interview means both.** Marking Chat opened fills in Viewed, and marking Interview
  fills in Viewed and Chat opened. Sent was already required first.
- A step filled in takes the time of the step that implied it (it happened by then); one already recorded keeps its own time.
- Each filled-in step goes into the status history, noted "Filled in: Interview comes after it", and the message says so ("Status:
  Interview (Viewed and Chat opened filled in: Interview comes after them)").
- Works the same from the status button, Edit details and Claude (`update_status`).
- **Jobs already saved with a skipped step are filled in once** (data step 075), each in the job's history as "filled in from a later
  step". The Reports and Dashboard view and chat numbers rise to match.
- Checked locally:
  - one old job (a chat with no view) filled in;
  - Sent straight to Interview filled in Viewed and Chat opened at the interview's time, with their history rows;
  - Edit details with "interviewed" did the same;
  - Chat opened alone filled in Viewed.


## R144. Project order, the Match button, and client matching (Hamza, Danyal)

**The order of the chosen projects**
- The Projects step has an "Order in the proposal" box with up and down arrows, and each ticked card shows its place (1, 2).
- The proposal page has a "Project order" box with Swap order (arrows when there are more than two).
- A proposal made from parts is rebuilt in the new order straight away, with no AI call, as a new version.
- A proposal the AI wrote whole has its project blocks moved in code. The words around them stay.
- A proposal edited by hand is never changed by itself: "Project order" is offered beside it, with Put in this order.
- Claude's picks keep the order given. Older jobs keep the order of the list (`job_matches.pick_no` is empty; migration 076).
- A passing mention of a project in the opening sentence does not move, only its block.

**Match the chosen projects (reported by Danyal)**
- When no answer named a project that is not chosen, nothing changed and the button stayed on "Updating…" until the page was reloaded.
- A failed request also left it stuck, with no message. With unsaved answers, the press itself failed.
- Now the button always comes back and says what happened: updated, already matching, or what went wrong.

**Client profiles (C-26: 21 proposals in one client)**
- Not confirmed on the live data: Claude's tools could not look a client up by id, so C-26 itself was not read. Nine live jobs were
  sampled and none was in it. Every post read shows a member-since date, and the one real match seen (C-35: same link, same date) still holds.
- Rule changes in `sameClient`: two different member-since dates are never one client (only the same job link overrides that). A job
  title seen on another post joins two jobs only beside the same join date, or when it is 30+ characters and both show the same country.
- Data step 076 works every client out again with these rules. Jobs a person placed or merged by hand stay where they are.
- New Claude tool `get_client` (managers and admins): the biggest clients, or one client with what each job showed and why it was joined.

- Checked locally: swap on a parts proposal, Put in this order on a hand-edited one, the Projects box, and Match with a stale answer (on a
  draft) and with none (on a draft, and on a sent, hand-edited proposal). `npm test` passes and both apps build.

## R145. Client profiles show their own details (Hamza)

Why: after R144 split C-26 from 21 proposals to 2 jobs, its header still said company "Held" and member since May 31, 2026, while both
its jobs say May 7, 2026 and show no company. The regroup moved jobs but never refreshed the profile.

- **After R144's result on live:** C-26 has 2 jobs (one job saved twice), and the biggest client has 4. C-103, C-349 and C-77 were
  read with `get_client` and each is one client.
- A profile's country, member-since date, company and contact now come from its own jobs. A value one of its jobs shows stays; a company
  or contact none of them shows goes.
- A company or contact a person typed stays, found from the audit log. Name and notes are never touched.
- Data step 077 does this once on deploy, and every regroup does it from now on. Each change is in the audit log with the old values.
- Checked locally: `npm test`, both builds, and the data step on the local database.

## R146. Match the chosen projects touches only the answers (Hamza)

Why: checking R144 on live, pressing it on job 106 (a sent proposal) added v3 "Updated the project links": the letter's lines were
rearranged and the review ran again, because the button started the whole proposal refresh. The answers had nothing to change.

- The button now looks at the answers and nothing else. The letter, its parts and the offers stay as they are.
- With nothing to change there is no new version. An answer that does change gets a version with the letter word for word.
- A change of projects, profile or video still runs the full refresh, and that one wins if both are queued.
- Job 106 was restored to v2's text as a new version. The version sent stays v2.

## R147. What the full live test found: project matching, Project order in the bar (Hamza, Danyal)

Why: a copy of job 589 (job 590, discarded after) went through every step on live. Reported during it: LexGuard should have led the
eviction job, and the order control belongs beside Sent from.

- **Project matching.** LexGuard was on the list at #3 with tag scores nearly equal to everything else, because projects hold hundreds
  of tags (Apex has 392). The AI ordered by the "core work" list, where SMS outranked the eviction and landlord domain. The order rule
  now asks first what the job is about: a product for a kind of business, or a skill. Run on the real job text, three times each:
  before, Seller Genius > Apex > LexGuard every time; after, LexGuard first every time. A voice agent job still leads with voice projects.
- **Project order** moved up beside Sent from and Loom video, with a Swap projects button.
- **Put in this order and Swap it in** left the description behind in the layout title, link, description, so a title could sit above
  another project's text (found on job 590). A block now includes the description under its link.
- **Member-since dates a day apart are one client:** Upwork shows the viewer's time (jobs 588 and 589: one post, Nov 4 and Nov 5). Data
  step 079 regroups clients with this.
- The Job link box in the status dialog is full width.
- Not changed: the tag lists themselves. Tag scores still say little while projects hold this many.
- Note on Experience: a Yes teaches the real library even on a test job. The test's tag ("Eviction and NC court process", id 1205) was
  taken off Apex; it is switched off and on no project.
- Passed on live on job 590: the whole flow, Swap, Match, answer edits, chat, review, Apply this, experience, openings, compare, restore,
  Loom, profile, change type, feedback, Mark as sent, Interview filling in the steps before it, undo to Viewed, Not sent, Not hired with
  its reason, Edit details, discard. The Dashboard returned to its exact numbers. The rest were checked on job 591 after this deployed (R148).
- Known and left as it is: restoring an older version keeps that version's project order, so Project order can differ from the letter
  until Swap projects is pressed. Setting the main Loom to none also clears the extra videos.

## R148. The recheck on live, and Update status opens once (Hamza)

Why: job 591, a second copy of job 589, rechecked R147 on live and tried the steps the first test left out.

- **Passed on live:** LexGuard first and pre-ticked on the eviction job; Swap projects in the bar; Put in this order on a hand-edited
  title, link, description letter, with each description following its title; the full width Job link box; Copy cover letter's message;
  Pending, Hired, back to Sent, No response, Withdrawn and Job closed (each lost outcome asks for its reason). Discarded after; the
  Dashboard returned to its exact numbers. Experience Yes was not pressed, so the library was not touched.
- **Update status** opens once: a second press while it was loading stacked a second dialog.
- Checked locally: the dialog opens once on a double press. Not yet checked on live.

## R149. The Chats page (Hamza)

Why: the chats are where the work is won, and they come to the whole team. Jobs track a chat only as one step, show no client name,
and can be changed only by the person who submitted them. Hamza's process after a chat opens: questions and answers, a call, the
proposal or quote, then the client says let's start.

- **Chats** in the menu: every job that reached a chat (the client replied) and every invite that was sent, with the client's name and
  company, the job, profile and person, the stage, the last note and when it last moved. Tiles for open chats, gone quiet and each stage;
  filters for stage, proposals or invites, person and profile; search.
- **Stages:** Chat opened (questions and answers), Call scheduled, Proposal sent, Client agreed, Lost (with the outcome and reason).
  Chat opened, Call scheduled (Interview), Client agreed (Hired) and Lost are the job's own status and outcome, recorded by the same rules
  as Update status, so Reports and the Dashboard stay right; Proposal sent is kept on the chat only. An earlier stage takes the later
  ones back, as Update status does. A job's status changed elsewhere moves its chat with it. Existing chats appear at their stage at once.
- **Everyone** who can open Jobs sees every chat and can update any of them; each move keeps who made it and a note (the chat's history,
  and the job's History as "chat stage"). Update status on a job stays the owner's.
- **Client's name** given on a chat (or by Claude) is kept on the client's profile, so every job of theirs shows it; it counts as a
  person's edit, so R145's refresh keeps it.
- **Gone quiet:** an open chat that has not moved for 3 days (Settings, Chats) is flagged on the page and on the Dashboard, which has a
  Chats row (every chat, whatever the period). A note alone counts as a follow up. The stage names can be renamed in Settings.
- **Claude:** `list_chats`, `update_chat`, and `client_name` on `update_status`; the job-status skill says how to use them in a sync.
- Checked locally: every move through the API (the job's status after each, wrong or missing reasons refused, back to Chat opened
  taking the interview and outcome away, history rows), the page, the dialog, the Dashboard row, a phone width, and that a team member
  with no jobs of their own sees all chats and can move one on someone else's job while Update status still refuses them. The Settings fields
  save, and stage names that are not five are refused. Not checked: the Claude tools through the connector (their routes were called
  directly); on live, after the deploy.

## R150. The client's name and company from any job (Hamza, Danyal)

Why: on job 481 (Jennifer's, now at Call scheduled on Chats) Upwork shows the person's name and their agency, but Upwork Pro had
neither: a job post never shows the client's name, so the team has to add it, and the only place was the Chats dialog.

- **Job page:** the Client card on Overview is always there now, with the person and the company on their own lines and an
  Add name / Edit name button for anyone on the team. Before the decision it still shows only a client we already know.
- **Chats:** a row with no name has an Add name button.
- **Person and company** are separate (they can differ: a person at an agency) and either can be given alone; a field not given stays.
  Both are kept on the client's profile, so every job of theirs shows them, and count as a person's edit (R145 keeps them).
- **Claude:** `update_job_details` takes `client_name` and `company` for any job, chat or not; the job-status skill says to give both as
  Upwork shows them and never to guess.
- Checked locally: company alone, person alone keeping the company, Claude's details route, an empty or one letter name refused, the
  job page card and dialog. Not checked on live yet.

## R151. Client research: the company first, then the person, in rounds, proved from what Upwork shows (Hamza)

Why: in Chats and Clients the team wants to look a client up (web, LinkedIn) before a chat or a call. Upwork clients are mostly small
and little known, and often all we have is a first name and maybe a company, so one search is not enough and a namesake must never be
taken for the client.

- **How to reach them:** a client profile now keeps an email, phone, website and LinkedIn beside the person and company (migration
  081). Anyone on the team adds them (Contact details), from the client's page, a chat or a job. They count as a person's edit (R145),
  and a merge carries them and the research to the profile kept.
- **Research** (a button on Clients, on every Chats row, and on the job's Client card) runs on the worker in the background with the
  same AI as the proposals (Settings, AI: on the server, the Claude program signed in there), with its web search and page reading
  switched on for this step only. No new key or setting. The panel shows the round it is on and updates itself.
- **Rounds, the company first:** (1) the company; (2) the person at that company, or, when the company was not proven, the company
  again a different way (other spellings, quoted phrases from the posts, registers, directories, Google Maps, the product they
  describe); (3) the person, or the person again (other spellings, the names in their freelancers' feedback). Then a short last step,
  without searching, writes the summary, what it means for us, the points for the chat or call, what does not add up and what to ask.
  A round with no answer is asked once more; a later round that still fails is kept as not done and the earlier rounds stand.
- **The identity method** (`src/research.ts`): the anchors first, from everything Upwork Pro has on the client (city, country, local
  time, member since, industry, size, what they hired for, past freelancers' feedback that names them, our jobs and chat notes, the
  saved contacts); every candidate checked against them, with the evidence kept. Confirmed: the email domain or saved site, or three
  anchors with no conflict; likely: two. Only those are shown as the answer. **A lead that is not proven is shown as "Could be (not
  sure yet)"** with why and what is missing to be sure; with nothing credible it says nothing was found. A name alone is never a match,
  two people are never mixed, business facts only, each with its source, and what a web page says is never taken as an instruction.
- **The result:** the company and the person, each with how sure (Confirmed, Likely, Not sure, Not found), the leads it could be, how
  each fact was checked, people ruled out, the rounds, sources and searches. A found website and LinkedIn can be kept on the client
  with one click (only when confirmed or likely). Every run is kept; the newest is shown. Quick Google and LinkedIn searches too.
- **Claude:** `get_client_research` (contacts, what we know, the latest research, the method), `research_client` (`start` on the
  server, or `result` to save research Claude did itself by the same rounds), `save_client_contacts`. The job-status skill says how.
- **Found on the way:** with a person result shaped as name, role, location and background, the model often ended the person round
  with no answer at all; shaped as a business contact (name, job title, works at, based in, LinkedIn, work background) it answers
  every time.
- Checked locally with the Claude setup the proposals use: a small real company given only its job text, Estonia and "Uku" in a
  freelancer's feedback came back company Likely, then person Likely, in two rounds; a made-up Australian company went three rounds
  (the Australian company register included) and said not found; a very common name in Denver with only a physical therapy clinic
  job went three rounds, 21 sources, ruled 13 people out and picked no one. The "could be" block, the panel and dialog, contact
  details saved and refused when wrong, one run at a time per client, Claude's routes, a phone width. Not checked on live yet.

## R152. The Chats table tidied (Hamza)

Why: on live the Research and Update buttons sat one above the other, the client's ID chip sat beside "Add name" on one row and on
its own line on another, and a client whose company was saved as "." showed a lone dot.
- **Research and Update** sit side by side at every width; the job title wraps to two lines instead of pushing the buttons out.
- **The client cell** is the same on every row: the name (or Add name), the company, then the client ID on its own line. Invite too.
- **A name or company with no letter or digit** (".") is not shown, and is refused when saved from the app or from Claude.
- Checked locally at 1200, 1400 and 2000 pixels wide; "." and ".." refused.

## R153. A chat's call has a time, and the chat says what to do once it passes (Hamza)

Why: Jennifer's call was booked for last Thursday, she did not join, and she has not answered for almost a week; Miriam's call was
yesterday, so the proposal is due today. Knowing when a call is tells the team when to ask how it went and what comes next.
- **Call scheduled asks when** (date and time, in your own time zone; stored as Pakistan time like every time). Moving a chat to it
  without a time is refused. A new time later reschedules it. Migration 082.
- **On each chat row, under the stage:** "Call Fri 20 Nov, 18:30" while it is to come; once its time passes, "Call was ...: did it
  happen?"; after "It happened", "Call held ...: next step due"; after "They did not join", "Did not join the call, N days ago:
  follow up". A chat at the call stage booked before this shows "When is the call? Add its time".
- **The Update dialog** asks it: did it happen, did they not join, or was it moved (a new time). A chat with no time yet takes the
  time and how it went in one save. Moving from the call to Proposal sent or Client agreed after its time marks the call held.
- **Follow up:** the Call scheduled tile (Chats and Dashboard) shows how many calls to follow up and how many are coming up, and is
  marked when any need it; Chats has "Calls to follow up" and "Calls coming up" filters. A call still to come never counts as gone
  quiet; a missed call's days count from the call.
- **History:** "Call set for ...", "Call held", "Did not join the call" in the chat's history, and "chat call" in the job's History.
- **Claude:** `update_chat` takes `call_at` (the team's zone) and `call_status` (held, missed); `list_chats` gives `call_time` and
  `call_flag` and `calls: todo`; the job-status skill says to ask the person when the call is and how it went.
- Checked locally: a move to the call without a time refused, a past call (due), not joined (missed, quiet after the quiet days),
  rescheduled (coming up, not quiet), a call status on another stage refused, the move to Proposal sent marking it held, Claude's
  call time in US Eastern, the dialog (the same time refused when moving it), and a call-stage chat with no time given its time and
  "They did not join" in one save. Not checked on live yet.

## R154. Chats can be sorted five ways (Hamza)

Why: the Chats list had one fixed order (gone quiet first, then the last update), which did not match Upwork's, and the team wants to
try a few orders to see which works best.
- **A Sort menu** beside the filters: **Newest chat** (when the chat opened, newest first, as Upwork lists its messages; the default),
  **Last update** (the last move, note or call on the chat), **Needs attention** (calls to follow up, then gone quiet chats, the
  longest waiting first, then the open ones, then agreed and lost), **Next call** (calls coming up, soonest first) and **Proposal
  sent** (newest first). Each falls back to the newest chat.
- The choice is kept in the address (Back returns to it) and in this browser, so the page opens the way you left it.
- `listCard` takes `sorts` for any list (only Chats uses it now).
- **Claude:** `list_chats` takes the same `sort`.
- Checked locally: each order on the page and through Claude's route, the choice kept after leaving the page. Upwork orders its
  messages by the latest message, which Upwork Pro does not see; Last update is the nearest, when notes are kept up.

## R155. Research: its own page, a green dot when done, and how to reach them, with emails checked by TrueList (Hamza)

Why: the research had grown past what a dialog can show, nobody could see at a glance which clients were researched, and the team
wants the person's LinkedIn and email (several options when there is no single answer) with the emails checked by TrueList.
- **A page of its own:** `#/clients/<id>/research`. Research on Chats and on the job's Client card opens it (a job with no client
  profile gets one first). The client's page keeps a short card: how sure for the company and the person, the summary, how many
  contact options and verified emails, and "Open the full research".
- **Green dot:** beside a researched client on Chats, on Clients and on the Research button, and a "Researched" chip on the client's
  page (the dot's tooltip says how sure).
- **How to reach them** (a contacts round after the person, when there is a company or person found or a lead to check): the
  person's LinkedIn (several "could be" profiles when not sure) and the company's page; emails the person or company publishes
  (Team, Contact or press pages, directories, registers) and likely work emails built from the company's visible pattern, each
  marked; phones the company publishes. Each with whose it is, where it was seen and a note. Personal emails and phones they did not
  publish are never looked for, and a guessed address on a free mail service is dropped.
- **TrueList** (the same account as LeadWorks, `TRUELIST_API_KEY` in `.env`; it is a flat subscription): after the contacts round
  every email found goes in one batch; the batch id is saved before the wait; each email shows Verified by TrueList, Accepts all
  mail, Risky, Unknown or Invalid. "Check with TrueList" checks them again, with one more address the team adds, and reads a batch
  again whose wait was cut short. A failed check is kept on the run and never fails the research. Migration 083.
- **This is correct** on an email, phone or LinkedIn keeps it on the client's contact details; the one kept shows "Saved on the client".
- **Claude:** the research's `contacts` (with TrueList's state) in `get_client_research`; `research_client` `result` takes contacts.
- Checked locally: a real run (company confirmed, person likely, then the contacts round: four published emails, two possible
  LinkedIn profiles and the company page); the page, the card, the dots, This is correct, a phone width; the TrueList client against
  a stand-in for TrueList's API with LeadWorks' sample result file (batch id saved first, a wait, 748 states read). Not checked: a
  real TrueList call (the key is only on the servers).

## R156. Gone quiet counted again (Hamza)

Why: on live after R153, Gone quiet showed 0 (it was 12). The check that a call still to come is not quiet read
`NOT (call_status='set' AND ...)`, which is NULL, not true, for a chat with no call, so no such chat could ever be quiet.
- The check uses `<=>` (NULL-safe), so a chat with no call is quiet again after the quiet days; a call still to come is still not.
- Checked locally: a chat with no call left six days counts as quiet; one with a call coming up does not.

## R157. TrueList: the emails go as a file with a header, and a refusal says why (Hamza)

Why: on live the first research with contacts (Jennifer's, C-288: company and person confirmed, one company email, one phone, two
LinkedIn profiles) sent its one email to TrueList as a JSON list and TrueList refused it with 422, and the message did not say why.
- **The batch is a named CSV file** (`upwork-pro-research-<run>.csv`) with an `email` header line, sent as multipart with the
  `accurate` strategy, whatever the number of addresses. TrueList finds the address column by the header (LeadWorks saw it refuse a
  one-line file without one); on the flat subscription the header line costs nothing.
- **A refusal says why:** TrueList's own reason, every address masked as [email], one short line, on the page and on the run.
- "Check with TrueList" on the research page sends a new batch for a run whose check was refused.
- Checked locally against a stand-in for TrueList: the file, its name, the header and the strategy sent, no Content-Type of ours, and a
  422 reason shown with the address masked. Not checked: the real TrueList (after the deploy, on C-288).

## R158. The research page rebuilt (design option A), Back goes where you came from, and a tidier Chats bar (Hamza)

Why: the research page was squeezed to one side with the right empty, Back from it always went to Clients, and on Chats the
filters, Clear filters and Sort wrapped badly. Hamza chose option A from the designs on the canvas.
- **The research page** (`#/clients/<id>/research`): a breadcrumb (where you came from / the client / Research); the client with
  their initials, job title and company, the client ID, country, member since and the chat's stage; Open the job and Research again.
  Then the verdict: how sure for the company and for the person, each with a three-step meter, beside the summary and when, by whom,
  how many rounds and sources. The main column: the company and the person side by side (with "Could be (not sure yet)" leads
  when not proven), for the chat or call, what it means for us next to does not add up, to be surer, and how it was checked (the
  table, then people ruled out, sources, searches and rounds, each opening in place). The rail on the right: how to reach them
  (saved, the options found with TrueList's check and Correct, check another email), the chat (job, stage, call time and flag,
  profile, last note, Update the chat in place), search yourself, earlier runs. Not researched yet: what it does and one button.
  While it runs: the round it is on, updating by itself. At phone width everything stacks in one column.
- **Back** goes to the page you came from: Chats with its filters and sort, the job, the client's page or Clients (kept for the
  tab, so a reload keeps it); the side menu lights that page too. `/clients/:id/chat` gives the page the client's newest chat.
- **The Chats bar** in two lines: the search with Sort at the right end (its own label, never counted as a filter), then the filters
  at a readable width with Clear filters as a link; a line under it counts the chats, the calls to follow up and the quiet ones.
  `listCard` takes `summary` for that line. The other lists keep their bar.
- **Every dropdown's arrow** sits 14 px in from the edge (was 11 px, against the border), with room for it in the padding.
- Checked locally at 1280 and 1440 wide and at phone width (no side scroll): the page with a sample research (company likely,
  person not proven with a lead, two emails with TrueList states, a LinkedIn, a phone, the evidence and the rounds), Back to Chats
  with its filters, the Chats bar on two clean lines, the Jobs list unchanged but for the arrow.
