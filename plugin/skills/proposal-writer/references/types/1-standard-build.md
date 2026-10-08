# Type 1. Standard Build

**Chosen when:** new build, MVP or extend; builder role; no explicit asks. Signals in `../type-selection.md`.
**Length:** 170 to 240 words.

## Structure

1. **Hook, two lines.** Natural, pain focused, and specific to this client.
2. **Proof, two projects.** Each in the project format below.
3. **Plan.** Their stack, committed. The first thing we would build and why. Name the concrete tools, APIs, webhooks and workflow pieces involved, in about 45 to 55 words.
4. **Close.** A general call to action in one line. No question.
5. **Signature** from the profile record.

## Hook rules

1. Start from the pain, not the project. Ask what is costing the client money, time or customers right now.
2. Use a detail only this client wrote, so it is clear the post was read.
3. Line one names the pain. Line two shows what causes it or how to avoid it. The second line earns the click.
4. Sound like a person talking. If it sounds like a lecture, a slogan or a sales line, rewrite it.
5. No talk about us in the first two lines. No project names, no stats, no "I can build".

## Project format

Every proposal includes two projects. The second covers a different part of the job and is never a padded weak match. If no genuine second project exists, use one and list it under "Needs your eye".

```
Project Name – Project Title
[project link]

Project description.
```

**Project title rules**
1. Seven to nine words, one line.
2. Targets the main feature this client needs, their industry, and the tech stack they named.
3. Written fresh for each job. The same project gets a different title for a different job.
4. Only true details. The stack in the title must be what the project actually used, from the library.
5. The dash between project name and title is allowed.

**Project description rules.** Two or three plain sentences, written as a direct match to the job:
1. What I built and with what. The features from this project that match the client's required features, and the stack used.
2. Why it matters to them. Tie it directly to their feature, stack or industry.
3. Result, if verified. Only from the library, never estimated.

When the industry differs, say why the work carries over. At most three features per sentence.

## Close rules

1. One line, 9 to 11 words.
2. Invites a clear next step, such as a short call to walk through their build.
3. Confident and forward looking. No question mark, no easy out, no banned phrases.

Example: "Let's set up a short call to walk through your build."

## Estimates

If the client asks for timeline or budget, apply the estimate answer rule in `../modules.md`.

## Do not

| Weak hook | Why it fails |
| --- | --- |
| "I can build your CRM with an AI voice agent." | About us, not their pain |
| "You need a CRM that integrates Retell and Laravel." | Restates the post, no insight |
| "Speed to lead is the most important metric in sales." | Lecture tone, generic |
| "Stop losing leads forever with AI!" | Salesy, not believable |

## Sample

Structure illustration only. Project facts in samples are not verified; never copy a sample's claims about a project. Take every project fact from the library.

Job: home services company wants a CRM on Laravel and React with a Retell voice agent that calls new leads within minutes.

```
Leads that wait an hour for a callback have usually booked someone else by then. A voice agent fixes the speed, but if it can't see the last conversation it asks the same questions twice, and the lead walks anyway.

Apex Windows – AI CRM With Voice Agent for Home Services
[project link]

I built the lead pipeline and the AI voice agent for Apex Windows, where every call writes its outcome back to the lead record. That's the same call history your agent needs so it never repeats questions to a returning lead.

DentAI Call – Retell Voice Agent for Appointment Booking and Follow Ups
[project link]

I built DentAI Call on Retell with appointment booking and follow up calls for dental practices. The follow up logic there is exactly what your leads who miss the first call will need.

Since you're on Laravel, React and Retell, I'd start with the lead record and the Retell webhook that writes call outcomes back to it. The dashboard, follow up rules and reporting all read from that record, so building it first keeps everything else simple.

Let's set up a short call to walk through your build.

[Signature from profile record]
```
