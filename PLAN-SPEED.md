# Plan: a faster proposal, in the app and in the Claude plugin

Agreed with Ahmad on 14 October 2026, from `SPEED-REVIEW.md`. Each point says what is built and what changes for the person.
Branch `hamza`; each finished point gets its `NEW-UPDATES.md` entry and its row in `TASKS.md`.

## 1. The proposal in parts (Ahmad's design, with the early draft fix)

A proposal is built from parts. Only the part a change touches is redone, so most changes cost no new full write.

| Part | Made by | Redone when |
| --- | --- | --- |
| The letter (opening, the client's problem, the approach, the questions) | the AI, from the job, the signals and the proposal type | the type changes, or the person asks |
| The proof: one block per chosen project (name, one line on what it proves for this job, its link) | the AI, one short call per project, kept per job and project | that project is added; a removed project's block is just dropped |
| The Loom line | code, from the video's title and link | the video changes (no AI) |
| The sign off (name, GitLab, the profile's signature) | code, from the profile | the profile changes (no AI) |
| The screening answers | already apart (R59) | the person edits them |

- The letter never names projects, videos or the sender's signature: those come only from their own parts, so a part can be
  swapped without touching the letter. The writer is told where the parts go in the type's structure (each type keeps one
  place for the proof, one for the video line, the sign off last).
- **Changing the profile** swaps the sign off at once, no AI (decided). The letter is kept; a "Write it again in this profile's
  voice" button is there if they want it.
- **Changing the projects** writes only the new project's proof block (a few seconds) and drops the old one.
- **Choosing a video, or none** puts in or takes out the Loom line. No AI.
- **Changing the type** writes the letter again (the structure changes), and keeps the proof blocks.
- **A structured submission** (the client dictates the structure) cannot be split this way: it is written whole, as today.
- The early draft, written in the background after matching, is now always usable: it writes the letter and the proof blocks of
  the recommended projects. When the person picks other projects, a profile or a video, only those parts change. It starts as
  soon as matching is done, not last in the queue.
- The editor still shows one proposal. Once the person edits it by hand, their text is never overwritten (decided): a changed
  project block or Loom line is shown beside the editor with "Put it in" and "Copy".

## 2. Project matching for the plugin, on the server

A `match_projects` tool: Claude sends the job's tags (with core work) and industry, and gets back the app's own matching and the
AI's order, the top five with a reason each and the two recommended, honouring skip tech stack. Claude shows the table and asks.
The app and the plugin then always agree.

## 3. Start each step the moment it is ready; the person's own waiting work first

- The worker looks for work every 200 ms instead of sleeping 1.5 s; pages check every second while something is being made.
- Work a person is waiting on (their proposal, their chat answer, their review) goes before background work (new screenings
  of other people, early drafts).

## 4. The plugin's reads (kept as they are)

The writer skill stays detailed and the library keeps its overviews. One change: every setup read (`plugin_options`, the
duplicate check, `get_library`, `get_writing_guide`) is sent in one message at the start.

## 5. The first two lines

The first write is told the opening rules more strongly; when they still fail, only the first two lines are rewritten (a short
call), not the whole proposal.

## 6. The review

The review runs by itself on every proposal and starts right after writing, in the same worker job. It never forces changes:
the person decides (R59 already stops the plugin asking). In the plugin, `review_proposal` waits up to 55 s on the server so
Claude never has to ask twice.

## 7. The AI

Claude only from now on. GLM timings are not planned around.

## 8. Fewer repeated reads, and a library that is not read twice

- The app keeps settings, the writing guide, the tag dictionary and the library in memory, cleared on any admin change; the
  library is loaded once per tagging; tags, matches and signals are saved in one statement each.
- The plugin: `get_library` and `get_writing_guide` carry a version (when the library or the guide last changed). Within one
  Claude conversation, a second job asks with the version it has and gets "unchanged" instead of the whole library again.
  (A new conversation always starts with nothing in memory, so its first read stays; point 2 makes that read matter less.)

## 9. Fewer turns in the plugin

- The profile alone, in one question; the rate is not asked (it is put in the proposal by hand). The profile's rate is saved.
- On a PASS, the Continue question comes with the gate result.
- The draft is still shown in full in the chat (decided): Claude writes it to save it and to show it, so nobody has to leave Claude.

## 10. Not done

A new Claude Code process per AI call stays as it is.

## 11. Matching starts by itself only for jobs likely to be taken (Ahmad's rule)

Right after the gate:
- a PASS, or a FLAG with at most 2 flags: tagging, signals, matching and the early draft start at once, before anyone clicks;
- a FLAG with 3 or more flags, or a FAIL: nothing is spent until the person continues with a reason, then it runs as before.
The limit (2) is a setting, "Start matching by itself when a job has at most N flags", to tune later from the Flag review.
No calls are made before the gate: the gate's result is what decides.

## Order of work

3 and 6 (small, every job feels them), then 11, then 1 (the largest), then 2 and 9 (the plugin), then 5 and 8.
