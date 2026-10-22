---
name: job-trends
description: Analyses the jobs and proposals kept in Upwork Pro to find what works (which profiles, proposal types, projects, industries, tags, signals, Loom videos, opening styles, auto mode or review scores get viewed, get a chat, an interview or a hire), reviews the gate flags (which to relax, which to keep), the proposal feedback and the experience questions, and reads the Dashboard and the activity. Use when the person asks for trends, a comparison, a report, win rates, view rates, what is working, which proposal worked, which flags to relax, to pull many jobs or the jobs between two dates for analysis.
---

# Job trends

Answers "what is working?" from the jobs in Upwork Pro. Uses the `upwork-pro` MCP tools (load them with ToolSearch).

## Pick the tool

* **Counts and rates across groups** (by profile, person, proposal type, project, industry, tag, signal, rule, Loom video, week and more): call `get_trends`. It is already counted, so never count rows yourself for these.
* **Which gate rules to relax or keep** ("can I relax G3?", "which flags do we always override?", "review my flags after 200 jobs"): call `review_flags`. Show a short table (code, rule, fired, continued, top reasons, chat rate of the continued against clean passes, hint), most fired first. Say how many jobs it rests on, and that a hint is a starting point. If they then want to change a rule, that is the `setup-admin` skill (kind rule, admins only), never a change made here.
* **Reading the jobs themselves** (why something worked, comparing proposal texts, anything `get_trends` does not group by): call `analyze_jobs`.
* **The Dashboard** (how the team is doing in a period, what is waiting, speed, proposal quality): call `get_dashboard`.
* **What people said is wrong in proposals** ("what feedback are we getting?", "where do proposals go wrong?"): call `list_feedback` and group it by category, then read the excerpts for the biggest group. It also lists the experience people confirmed.
* **One job in full** (every version and how it was made, the review, the openings, the experience answers, the feedback, the comparisons, the client's documents): call `get_proposal_record`.
* **What the AI and the team did** (AI calls and failures by step and model, actions by person; managers and admins): call `get_activity`.

## Days: the team's working day

The team works on US Eastern time while Upwork Pro stores Pakistan time. **Count every day on the team's working day**: the update tools
do this by default (`time_zone` "team"), so "today", "yesterday", "last week" and any `from`/`to` mean the team's days, and one shift's
proposals are never split across two dates.
* Turn "today" and "yesterday" into dates on the team's clock: `get_dashboard` answers `period.today_there` (today in that zone); use it
  rather than your own clock. Then pass those dates as `from`/`to` (or `sent_from`/`sent_to` for what was sent).
* For a daily update use **what happened in the period**: `get_dashboard`'s `happened` (screened, continued, written, finished, sent,
  invites sent, viewed, chats, interviews, hired, Connects, each counted by when it happened). Its `counts` are the jobs screened in the
  period and what became of them, a different question.
* Always say the zone and the days counted, for example "Monday 21 October, US Eastern". Times in `analyze_jobs` rows are on that
  same clock (`times_note`).
* Only when the person asks for their own clock ("in Pakistan time"), pass `time_zone` "mine" (or a zone name), and say so.

Both take the same filters: `from` and `to` (date screened), `sent_from` and `sent_to` (date sent), `profile_name`, `person`, `phase`, `outcome`, `verdict`, `rule`, `source`, `ptype`, `tag`, `project`, `loom`, `q`. Dates are `YYYY-MM-DD`. When the person names a period ("last month"), turn it into dates and say which dates you used.

## Reading many jobs

1. Call `analyze_jobs` with the filters. Each row is one job as a list of cells; `columns` names them.
2. When `more` is true, call again with `after` set to `next_after` and the same filters. Repeat until `more` is false. **Never analyse a part of the jobs as if it were all of them**: say how many you read against `total`.
3. Ask for heavy fields only when the question needs them, with `include`: `client`, `tags`, `signals`, `flags`, `history`, `description`, `proposal`, `review`, `feedback`, `experience`, `documents`, `openings`. Each makes the pages smaller. 500 jobs take about 3 calls without them and about 17 with all of them.
4. For proposal texts, read `proposal` for the groups being compared (for example viewed against not viewed), not for everything, when the set is large.

## From a trend to a fix

When the person wants to act on what you found ("fix it", "update the system"), say what in the setup causes it and what to change: a
project or profile field for a wrong fact, tags for a wrong project, a gate rule for a flag that is always skipped, the proposal type,
the writing guide, the opening styles (a setting) or the banned phrases for tone, length and openings, the reviewer for what the review
missed. The change itself is the `setup-admin` skill: show it, get a yes, then apply it. Never change the setup from here.

## Saying what you found

* A rate is of **sent** proposals: view rate is viewed / sent, chat rate is chat opened / sent, hire rate is hired / sent.
* Always give the sample size next to a rate ("4 of 6 sent"). Under about 5 sent in a group, say it is too few to mean much.
* A job with several tags, projects, rules or signals counts under each, so those groups do not add up to the total. Say so when it matters.
* Separate what the numbers show from what you think explains them.
* Only what was recorded can be counted. If Viewed, Chat opened, the outcome, Connects or the Loom video were not recorded on many jobs, say that first.
* Plain English, sentence case, no dashes.

The same numbers are on the Reports page of Upwork Pro, where every row opens the jobs behind it.
