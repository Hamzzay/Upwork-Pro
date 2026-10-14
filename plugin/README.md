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

## Status (v0.10.0)

v0.10.0: faster runs. Every save goes in the same message as the next step's work (no turn and no line of its own), the review
starts as the draft is saved and is only collected after the draft is shown, `save_job` no longer sends the post in fields
(Upwork Pro reads it itself), reasons and evidence are short, and the proposal type and the Loom video are one question box.

v0.9.0: the screening answers are saved apart from the cover letter (`save_proposal` `screening_answers`), and after the
independent review Claude shows it and waits: no question or list of options. The person says if they want a suggestion applied.

v0.8.0: "Skip tech stack tags" at the projects step. The person can match the projects again without the job's Tech stack tags;
everything else in the matching stays the same, and the choice is saved on the job (`save_step` projects, `skip_tech_stack`).

v0.7.0: the setup from Claude, for admins and managers (skill `setup-admin`). Projects, industries, tags, profiles, Loom videos,
rules, signals, proposal types and samples, the writing guide, the gate instructions and settings can be added and changed by
talking to Claude. Nothing raw is saved: Claude shows real examples first, asks, checks what is missing, verifies names and links,
rewrites in the standard format, shows the final version and saves only after a yes (`setup_prepare`, then `setup_apply`). Every
change is kept under Changes in the app; the main admin can put any of them back (`setup_history`, `setup_revert`). Users,
passwords and the AI provider cannot be changed from Claude, and nothing is deleted. Needs the MCP from the same commit and
migration 036.

## Status (v0.6.0)

v0.6.0: the independent review. After every saved draft, `/proposal` asks Upwork Pro's reviewer (`review_proposal`) to score that
version out of 10 and shows the review unchanged: the verdict, what works, what hurts it, and up to three suggestions. The person
approves the proposal as it is, applies a suggestion by number, edits, or asks for another review. The same review shows on the job
page in the app. Needs the MCP from the same commit (`cd mcp && npm run build`) and migration 035.

## Status (v0.5.0)

v0.5.0: every step is saved in Upwork Pro as it happens. `/proposal` saves the job right after the gate, then the decision, the tags
and signals, the profile and rate, the shortlist and the projects picked, the type, the Loom video, every draft and revision, and the
final text (`save_step`, and `save_proposal` with `finished: false` for drafts). The app shows the job at the step the person reached.
A job left halfway is continued from where it stopped, as the same job: Claude finds it, says what is saved, and carries on.
Connects, boost and notes are sent with the status. Needs the MCP from the same commit (`cd mcp && npm run build`) and migration 033.

## Status (v0.4.3)

v0.4.3: the shortlist is put in order by reading each project's overview and case study, with a reason per project, as the app does
now. Core work is only real work tags (never a project stage, tool, model or stack).

## Status (v0.4.2)

v0.4.2: one matching rule with the app (13 October). The work first: the job's core work is named (one to three tags, the main
work first) and only projects that did it are recommended. Then ONE job industry, the client's own business (never the industries of data or leads the job is about). The
minimum score and tag weights come from Upwork Pro (`get_library`, `matching`); the plugin's own "6" and "Project stage 0" are gone.

## Status (v0.4.1)

v0.4.1: the Loom video. After the proposal type (step 8), `/proposal` now asks which of the sending profile's Loom videos to send, or
none, recommending the best fit when the post asks for a video. The link is written into the proposal and the choice is saved with it
(`save_proposal`, `loom_video`), so Upwork Pro's reports can compare proposals with a video against those without. The same as the app.

v0.4.0: new skill `job-trends`. Ask what is working (which profile, proposal type, project, industry, tag or Loom video gets viewed,
gets a chat, an interview or a hire) and Claude reads the numbers with `get_trends`, or the jobs themselves with `analyze_jobs`, in
pages so nothing is cut off. Needs the MCP from the same commit (`cd mcp && npm run build`).

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
