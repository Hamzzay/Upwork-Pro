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
* Connects spent and boost: put them in `note` when the person mentions them ("16 Connects, boosted 4").

Confirm in one line: "Job #N: Viewed, today 14:05."

## What is waiting on the client

When asked what is still open, call `find_jobs` with `phase: "submitted"` and list number, title, profile, status and how long since the last update.
