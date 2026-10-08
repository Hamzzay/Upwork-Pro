# Stackup Proposals

Takes an Upwork job from link to a ready to submit proposal, saved in Upwork Pro. Built from the Stackup Upwork Proposal System specification.

## How to use

Type `/proposal` and paste the job link. If the link cannot be read, paste the full job page text instead.

The flow stops for five decisions:

1. Continue or stop after the gate verdict (with a reason if you continue past a Flag or Fail)
2. Pick the Upwork profile and confirm the rate
3. Pick one or two projects from the shortlist
4. Pick the proposal type
5. Approve the draft or ask for edits

The plugin never submits to Upwork. Copy the final proposal and submit it yourself.

## Skills

| Skill | What it does |
| --- | --- |
| proposal | The full workflow. Start here with `/proposal`. |
| job-gate | Pass, Flag or Fail screening. Also works alone on a pasted job. |
| job-signals | Reads the job: instructions, structure, content and tone signals, plus job tags. |
| profiles | The seven Upwork profiles: voice, signature, rate and rules. |
| project-matcher | Scores projects against the job tags and builds the shortlist. |
| proposal-writer | Writing rules, the eight proposal types and how one is chosen, modules, screening answers and the verification checklist. |
| job-status | After submitting: records Sent, Viewed, Chat opened, Interview, Hired or lost (with the reason) in Upwork Pro. |

## Connectors needed

* **Upwork Pro** (the `upwork-pro` MCP: saves every job, proposal and status). Connect it from Upwork Pro, Connect Claude.
* **Upwork** (reads the job by link). Optional: pasted text always works.
* **Google Sheets** (only for the old Job Log, when Upwork Pro is not connected).

## Data

| Data | Where |
| --- | --- |
| Jobs, proposals and statuses | Upwork Pro, through its MCP (the Google Sheet Job Log is only a fallback) |
| Project library and tag dictionary | Upwork Pro (`get_library`); backup snapshot bundled |
| Profiles | Upwork Pro (`plugin_options`) |
| Writing guide (types, rules, banned phrases, modules, screening answers, checklist) | Upwork Pro (`get_writing_guide`); backup bundled |

Sources are listed in `skills/proposal/references/config.md`. Every Claude with this plugin shares the same data through Upwork Pro.

## Status (v0.3.0)

v0.3.0: the team's v0.2.7 work merged with the Upwork Pro connection. Eight proposal types (7 Problem first, 8 Approach first with
questions) chosen by required, supporting and excluding signals; three new signals (Platform, Job focus, Decisions left open); the
matcher reads the job first ("Job needs"), filters by platform, then industry, then tags, with a core workflow check; certifications
per profile, used only when a client requires one; gate rule F6 Generic mass invite, G17 breaks platform rules, G18 any other risk.
Everything is still read from and saved to Upwork Pro. Case studies are fetched only for the chosen projects. The team's daily
proposals tab is not used: Upwork Pro keeps every proposal (Jobs page, by date).

## Status (v0.2.0)

v0.2.0: the project library, tag dictionary and writing guide come from Upwork Pro, so every Claude uses the same ones. The bundled copies are only a fallback.

## Status (v0.1.9)

v0.1.9: tag weights come from the sheet's Tag Dictionary; profiles from Upwork Pro or the sheet's Profiles tab (the two are synced both ways).

## Status (v0.1.8)

v0.1.8: profiles come from Upwork Pro; a missing profile or project is added to Upwork Pro right away (add_profile, add_project) before the proposal is saved.

v0.1.7: saves to Upwork Pro through its MCP (steps 2, 4 and 10), new job-status skill. The Google Sheet Job Log is now a fallback.

Skeleton complete. Waiting on: the remaining profile fields (most are still empty in Upwork Pro). Matching is industry first, then tags. Project stage tags carry zero weight until the tagging cleanup is done.

## Note

Remove the standalone `upwork-job-gate` skill after installing this plugin, so the two gate skills do not compete.
