# Configuration

## Upwork Pro (the system of record)

Every job and proposal is saved in **Upwork Pro** through its MCP server (`upwork-pro`). Load its tools with ToolSearch
("upwork-pro" or the tool names below) at the start of a run.

| Step | Tool | What it saves or reads |
| --- | --- | --- |
| Start | `plugin_options` | Active profiles (with their details), project names, rule codes, statuses, outcomes, loss reasons |
| 2 | `find_jobs` (url) | Earlier saves of this job: profile, verdict, stage, status |
| 4 | `save_job` | The job, the gate verdict with every fail and flag, the facts, the decision |
| 10 | `add_profile`, `add_project` | Only when the profile or a project is missing from Upwork Pro (fills empty fields, never overwrites) |
| 10 | `save_proposal` | The final proposal, profile, projects, type |
| After | `update_status` (job-status skill) | Sent, Viewed, Chat opened, Interview, outcome |

* Upwork Pro stores what you send **as is**. It does not screen the job again or rewrite the proposal.
* If the `upwork-pro` tools are not available (not connected, or the server is down), fall back to the Google Sheet Job Log below
  and say so in one line. Never write to both for the same job.
* Connecting: in Upwork Pro open **Connect Claude** and follow it: add the connector link in Claude and sign in with your own Upwork Pro
  account. Everything Claude saves is recorded as you.

## Job log (fallback when Upwork Pro is not connected)

* Spreadsheet: Upwork Jobs History
* Spreadsheet ID: `1jxtzVbbYgAXpc0LAUI-vn2r-xar98s5YBV-v-zaHAYI`
* Tab: `Job Log`
* Header row: row 1. Always match columns by header name, never by position.
* Key: `Job URL`. Normalize to `https://www.upwork.com/jobs/~<id>` before comparing.

## Project library and tag dictionary

* Source: Upwork Pro, `get_library` (every active project with links, overview, case study, industries and tags; every tag with its
  match weight). Every Claude reads the same library; the team edits it in Upwork Pro (Projects, Tag dictionary).
* Backup only: `skills/project-matcher/references/project-library.md` (42 projects, snapshot 2026-10-08) and
  `skills/project-matcher/references/tag-weights.md`. Use them only if Upwork Pro is not reachable, and say so in one line.
* The Google Sheet "Stackup Project Tag Library" and the old Excel file are no longer read by the plugin.

## Profiles

* Source: Upwork Pro, `plugin_options`. Fallback: `skills/profiles/references/profiles.md`.

## Writing guide

* Source: Upwork Pro, `get_writing_guide` (proposal types, writing rules, banned phrases, modules, screening answers, checklist).
  The team edits it on Upwork Pro's Writing guide page; an edit reaches every Claude on its next proposal.
* Backup only: the files in `skills/proposal-writer/references/`.

## Interim settings

* Every project in the library is publicly showable. The "Showable publicly" field is ignored.
* Project stage tags count 0 until the tagging cleanup is finished, whatever weight the library shows. Remove this line when done.
