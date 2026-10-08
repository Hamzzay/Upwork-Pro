---
name: profiles
description: Holds the seven Stackup Upwork profiles (Hamza, Ahmad, Hassan, Anam, Logan, Wasif, Shabkhaiz) with their voice, signature, rates, services and rules, and suggests which profile fits a job. Use when the proposal workflow picks a profile, or when someone asks which profile should bid on a job or what a profile's rules are.
---

# Profiles

## Where the records live

1. Upwork Pro is the live source: `plugin_options` (upwork-pro MCP) returns every active profile with its fields (headline, rates, GitHub, services,
   industries, voice, signature, stats allowed, certifications, who submits, rules).
2. If Upwork Pro is not connected, use `references/profiles.md`.
3. If a field the proposal needs (signature, rate, voice) is missing in both, stop and ask the person for it. Never guess a signature, rate or link.

## Keeping Upwork Pro complete

* If the chosen profile is not in `plugin_options`, add it straight away with `add_profile`, using only what `references/profiles.md`
  or the person gives (leave out anything marked TO FILL). Then continue.
* If the person gives a missing field during the run (a signature, a rate), save it with `add_profile` too: it only fills empty fields,
  it never overwrites what the team set in Upwork Pro.
* Adding a profile needs an admin token. If Upwork Pro refuses, say so in one line and continue; the proposal save will name what is missing.

## Suggesting a profile

Score each profile against the job:

1. **Services.** The job's core service is in the profile's services list. This matters most.
2. **Industries.** The job's industry is one the profile leads with.
3. **Role seniority.** Architect or consulting jobs go to a senior profile (Hamza or Anam) unless the person says otherwise.
4. **Invite.** If the job is an invite, the invited profile is the only suggestion.
5. **Submitter.** If the person running the workflow submits for only some profiles, suggest only those.

Suggest the top profile with a one line reason, and list the rest as options. The person always decides.

## Rate

* Prefill the profile's default hourly rate.
* Fixed price jobs: bid the client's posted budget.
* The submitter can lower the rate down to the profile's lowest rate when work is slow. Log the final rate.
* Never put a rate, estimate or timeline in the cover letter unless the profile rules and the job both allow it.

## What the writer takes from the profile

Voice (I or we), signature exactly as written, Upwork stats allowed in proposals, GitHub link, and every profile specific rule. Profile rules override general writing rules.

## Certifications

A profile's certifications are used only when the client strictly requires a certification, and only ones listed on that profile.
Never claim, invent or imply one. If the client requires one and none on the profile matches, say what the profile does have and add
"No matching certification on this profile." to "Needs your eye".
