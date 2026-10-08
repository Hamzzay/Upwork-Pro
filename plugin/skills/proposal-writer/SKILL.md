---
name: proposal-writer
description: Writes Stackup Upwork cover letters and screening answers using the house writing rules and one of eight proposal types (standard build, structured submission, invite, rescue, architecture or consulting, small fix, problem first, approach first with questions), chosen from the job's signals, then runs the verification checklist. Use when the proposal workflow reaches its type or draft step, or when someone asks to write or rewrite an Upwork proposal.
---

# Proposal writer

Every proposal follows the same writing rules, but its shape comes from one of eight types chosen by the job's signals. Two separate wins matter: a preview strong enough to get opened, and a body specific enough to get a reply.

## Inputs

Job data, the signals and job tags from `job-signals`, the profile record from `profiles`, the chosen projects and their stored facts from `project-matcher`, the chosen type, and the rate. If any input is missing, name it and ask. Never guess a signature, link or number.

## Where the guide lives

Upwork Pro holds the writing guide every Claude shares; the team edits it there (Writing guide page). Call `get_writing_guide` once:
it returns the proposal types (each with when it is chosen and its length), the type selection rules (`type_selection`), the writing
rules, banned phrases, modules, screening answer rules and the verification checklist. Then call it again with `type` for the chosen
type's full text. If Upwork Pro is not reachable, use the bundled files in `references/` (same content) and say so in one line.
Below, each `references/...` file means that part of the guide.

## Choosing the type

Score every type with the type selection rules (`references/type-selection.md`) and show the top two or three with the signals that matched. The person picks.

| Type | File | Cover letter length |
| --- | --- | --- |
| 1 Standard build | `references/types/1-standard-build.md` | 170 to 240 words |
| 2 Structured submission | `references/types/2-structured-submission.md` | As the answers need, about 350 max |
| 3 Invite | `references/types/3-invite.md` | 100 to 160 words |
| 4 Rescue or takeover | `references/types/4-rescue-takeover.md` | 170 to 240 words |
| 5 Architecture or consulting | `references/types/5-architecture-consulting.md` | 180 to 260 words |
| 6 Small fix | `references/types/6-small-fix.md` | 70 to 120 words |
| 7 Problem first | `references/types/7-problem-first.md` | About 230 to 280 words |
| 8 Approach first with questions | `references/types/8-approach-first.md` | About 230 to 280 words |

## Writing

1. Read `references/writing-rules.md` and `references/banned-phrases.md`.
2. Read only the chosen type file. **The type file overrides the general writing rules wherever they differ** (opening words, questions, project count, length).
3. Add every module the signals call for, from `references/modules.md`.
4. Apply the profile record: voice, signature, allowed stats, and profile rules. Profile rules override general rules.
5. Use the client's required words or format exactly, if any.
6. If the job has screening questions, write the answers per `references/screening-answers.md`, separately from the cover letter.

## Verify

Run `references/verification-checklist.md` on the draft. Rewrite any failing item once. If it still fails, list it under "Needs your eye" with the reason. Never hide a failure.

## Output

1. Cover letter in a code block.
2. Screening answers in a code block, numbered in the client's order, if any.
3. "Needs your eye": any certification mentioned (only when the client requires one, and only from the profile) or "No matching certification on this profile." (listed first), failing checks, unanswerable asks, pricing asks, and any case study or staging link used.
4. One line: type used, word count, modules added.
