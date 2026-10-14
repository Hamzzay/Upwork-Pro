---
name: job-trends
description: Analyses the jobs and proposals kept in Upwork Pro to find what works (which profiles, proposal types, projects, industries, tags, signals or Loom videos get viewed, get a chat, an interview or a hire), and reviews the gate flags (which to relax, which to keep). Use when the person asks for trends, a comparison, a report, win rates, view rates, what is working, which proposal worked, which flags to relax, to pull many jobs or the jobs between two dates for analysis.
---

# Job trends

Answers "what is working?" from the jobs in Upwork Pro. Uses the `upwork-pro` MCP tools (load them with ToolSearch).

## Pick the tool

* **Counts and rates across groups** (by profile, person, proposal type, project, industry, tag, signal, rule, Loom video, week and more): call `get_trends`. It is already counted, so never count rows yourself for these.
* **Which gate rules to relax or keep** ("can I relax G3?", "which flags do we always override?", "review my flags after 200 jobs"): call `review_flags`. Show a short table (code, rule, fired, continued, top reasons, chat rate of the continued against clean passes, hint), most fired first. Say how many jobs it rests on, and that a hint is a starting point. If they then want to change a rule, that is the `setup-admin` skill (kind rule, admins only), never a change made here.
* **Reading the jobs themselves** (why something worked, comparing proposal texts, anything `get_trends` does not group by): call `analyze_jobs`.

Both take the same filters: `from` and `to` (date screened), `sent_from` and `sent_to` (date sent), `profile_name`, `person`, `phase`, `outcome`, `verdict`, `rule`, `source`, `ptype`, `tag`, `project`, `loom`, `q`. Dates are `YYYY-MM-DD`. When the person names a period ("last month"), turn it into dates and say which dates you used.

## Reading many jobs

1. Call `analyze_jobs` with the filters. Each row is one job as a list of cells; `columns` names them.
2. When `more` is true, call again with `after` set to `next_after` and the same filters. Repeat until `more` is false. **Never analyse a part of the jobs as if it were all of them**: say how many you read against `total`.
3. Ask for heavy fields only when the question needs them, with `include`: `client`, `tags`, `signals`, `flags`, `history`, `description`, `proposal`. Each makes the pages smaller. 500 jobs take about 3 calls without them and about 17 with all of them.
4. For proposal texts, read `proposal` for the groups being compared (for example viewed against not viewed), not for everything, when the set is large.

## Saying what you found

* A rate is of **sent** proposals: view rate is viewed / sent, chat rate is chat opened / sent, hire rate is hired / sent.
* Always give the sample size next to a rate ("4 of 6 sent"). Under about 5 sent in a group, say it is too few to mean much.
* A job with several tags, projects, rules or signals counts under each, so those groups do not add up to the total. Say so when it matters.
* Separate what the numbers show from what you think explains them.
* Only what was recorded can be counted. If Viewed, Chat opened, the outcome, Connects or the Loom video were not recorded on many jobs, say that first.
* Plain English, sentence case, no dashes.

The same numbers are on the Reports page of Upwork Pro, where every row opens the jobs behind it.
