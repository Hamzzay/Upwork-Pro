---
name: job-status
description: Records what happened to a submitted Upwork proposal in Upwork Pro (Sent, Viewed, Chat opened, Interview, Hired or lost with the reason). Use when the person says a proposal was sent, viewed, the client replied or opened a chat, an interview was booked, they were hired, or the client went another way, or asks which proposals are waiting on the client.
---

# Job status

Keeps each job's status in Upwork Pro up to date after the proposal is written. Uses the `upwork-pro` MCP tools (load them with ToolSearch).

## Find the job

* If the person gives a job number, use it. Otherwise call `find_jobs` with the Upwork link, or with words from the title (`q`).
* More than one match: show them (number, title, profile, status) and ask which one. Never guess.
* `get_job` shows where it stands and its status history.

## Record the status

Call `update_status` with the job number and one status:

| The person says | Status |
| --- | --- |
| Submitted, sent, applied | `Sent` |
| The client viewed it | `Viewed` |
| The client replied, messaged, opened a chat | `Chat opened` |
| An interview or call is booked | `Interview` |
| Hired, not hired, no response, withdrawn, job closed | the matching outcome from `plugin_options` (exact name) |

* **When**: now, unless the person says when ("yesterday at 3pm"). Then send `at` as YYYY-MM-DD HH:MM.
* **Order**: Sent only once the proposal is finished; the other statuses only after Sent. If Upwork Pro refuses, show its message.
* **Lost outcomes** (the `loss_outcomes` in `plugin_options`) need a `reason` from the loss reasons in `plugin_options`
  (for example "Budget too low", "Hired someone else", "Went quiet after chat"). Ask the person which one if it is not clear.
  Put their own words in `note`. Never invent a reason.
* Connects spent and boost: send them as `connects` and `boost` (numbers) with the status when the person mentions them ("16 Connects, boosted 4"). With Sent, ask for the Connects once if they did not say. If the person says the client invited them, send `invited: true` with Sent (an invite opens the chat itself, so reports keep it apart). The job's own notes go in `notes`; `note` is for what happened at this status (what the client said).
* A job that is not finished yet (`get_job` shows `continue_from`): do not record a status. Offer to continue it with the proposal skill.

Confirm in one line: "Job #N: Viewed, today 14:05."

## What is waiting on the client

When asked what is still open, call `find_jobs` with `phase: "submitted"` and list number, title, profile, status and how long since the last update.

## Times

`update_status` takes now when no time is given. A time the person gives ("sent at 10 am") is read on the team's working day clock (US
Eastern) unless you pass `time_zone`: pass "mine" when they give it on their own clock (for example Pakistan time), and say which you used.

## Corrections after checking Upwork (R121)

When the person asks to compare Upwork with Upwork Pro, treat Upwork as the truth and show every change first; write only after they say go.
* A status or an outcome that is missing or wrong: `update_status` (with the reason and the date and time it happened on Upwork).
* Connects, boost, the Loom video or the invite are different on Upwork: `update_job_details`. It records no status, so nothing is
  logged twice. Upwork shows base plus boost as one total: split it from the Connects history when you can; else record the total as
  the base and say so.
* Something to remember with no new status (a client's questions, a reply not answered): `update_job_details` with `add_note`. It is
  added under the job's notes, dated; it never replaces them.
* A job that should not be there (a test, a duplicate, a stale draft never sent): `discard_job` with the reason, admins only, after
  the person agrees. It can be restored in the app.

