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

## Chats (R149)

Once a client opens a chat (and for every invite) the job is on the Chats page, and the whole team can move it. In a sync:

* Call `list_chats` (`stage: "open"`, or `"quiet"` for the ones that have not moved for 3 days) to see what to update.
* Call `update_chat` with the job number and what happened: `stage` is `chat` (questions and answers), `call` (a call is booked;
  marks the job Interview; give `call_at`, when the call is, "YYYY-MM-DD HH:MM" in the team's zone: ask the person if you do not know), `proposal` (the proposal or quote went to the client), `agreed` (they said let's start; marks it Hired)
  or `lost` (with `outcome` and `reason`). Add a one sentence `note`. A note alone records a follow up.
* Calls (R153): `list_chats` shows each call's `call_time` and `call_flag`. **due**: its time passed, so ask the person whether it
  happened and send `call_status: "held"` or `"missed"`; **held**: the next step is due (move to `proposal` when it goes out);
  **missed**: follow up, and when the client rebooks send the new `call_at`; **no_time**: a call booked before times were kept, so
  ask when it is or was. `calls: "todo"` lists the calls to follow up.
* Give `client_name` (the person) and `company` (their agency or company, which can differ) as Upwork shows them, on `update_chat`,
  on `update_job_details` for any job, or with `update_status` Chat opened. They are kept on the client's profile. Never guess a name.

## Client research (R151)

When the person wants to know who a client really is (before a chat or a call), or shares how to reach them:

* Save what the client shared with `save_client_contacts` (`job_id` or `client_id`): `email`, `phone`, `website`, `linkedin`,
  `contact_name`, `company`. Only what the person gave you or a source you confirmed; never guess an email or a phone.
* `get_client_research` shows the saved details, `what_we_know` (everything Upwork showed about the client: city, country, member
  since, industry, size, their past jobs and the freelancers' feedback, our jobs with them, chat notes) and the latest research.
* To research: `research_client` with `start: true` runs it on the server (up to three rounds, a few minutes each; read it again with
  `get_client_research`). Or research yourself with your own web search, following `how_to_research` exactly (the company first,
  then the person, a second round when one is not found), and save it with `research_client` `result`.
* The core rule: **a name alone is never a match.** Write the anchors from `what_we_know` first, search from the most specific clue
  (email domain, website, company and city), check every candidate against the anchors, and say honestly how sure you are
  (confirmed, likely, unsure, not_found). When unsure, do not pick: give the best leads under `possible` (shown as "could be, not
  sure yet") with what is missing, the ruled out ones under `rejected`, and say what to ask the client.
* The research also finds how to reach them (R155): published emails and phones, LinkedIn profiles, and likely work emails built
  from the company's visible email pattern, several options each, every email checked with TrueList (ok means verified). Tell the
  person which look right; save the one they confirm with `save_client_contacts`. Never look for a personal email or phone they
  did not publish.
* Business facts only (role, company, website, LinkedIn, news), every fact with its source. Tell the person what you found and how
  sure it is.

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

