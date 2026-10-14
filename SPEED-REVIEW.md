# Speed review: where the time goes, in the app and in the Claude plugin

Written 14 October 2026, at Ahmad's request: a review of the whole system to find what adds delay to writing a proposal. Nothing was
changed by this review. It rests on three things: the timings of every AI call on Hamza's Mac (Logs, AI calls: 96 calls, 7 to 14
October), a read of the worker and pipeline code, and a read of the plugin's skills and MCP tools. The fixes at the end are ranked
by how much time they save for the person waiting.

## What a job costs today (Claude Sonnet, measured)

| Step | Time per call | Runs |
| --- | --- | --- |
| Screening (the gate) | 18 s | at paste |
| Reading the post into fields | 10 s | at paste, beside the gate |
| Tagging | 7 s | after the gate |
| Signals, three layers | 6 to 10 s | beside tagging |
| The AI orders the matched projects | 12.5 s | after tagging |
| Early draft | 31 s | after matching, in the background |
| Writing | 30 s | when the person asks, unless the early draft is used |
| Independent review | not measured yet | after writing |

Job #62, paste to projects ready: **43 seconds** of machine time (gate 22 s, then tagging and signals together 8 s, then the order
13 s), and the early draft was ready at 81 s. The parts that run side by side already work well.

GLM (Z.ai) took 3 to 5 times longer for the same steps: the gate 76 to 122 s, writing 97 to 173 s, tagging 31 to 131 s. **The single
biggest speed setting in the app is which AI is chosen in Settings.** Claude Sonnet is the faster one by a wide margin.

Two signal calls on 13 October are logged at 2,167 s (36 minutes) although the time limit is 180 s. The limit is a timer in the
process, so the likeliest cause is the Mac sleeping during the call. On a server this should not happen, but it is worth watching
in Logs, AI calls.

## The app: what adds delay

### 1. The early draft is thrown away about half the time (biggest)
The early draft is written in the background so the proposal is ready the moment the person asks. Of 11 early drafts, 6 were used
and 5 were not. When it is not used, the person waits a full write (30 s on Claude, up to 3 minutes on GLM). It is not used when:
- a Loom video is chosen (`pipeline.ts`: `!f.sender.loom`), even though the video only adds a line;
- the person picks a proposal type other than the suggested one;
- the projects or the profile differ from the guess;
- the person confirmed before the draft started (early drafts are the last queue the worker looks at, so under any load they start late and are then skipped);
- the person has no "likely profile" yet (first use, more than one active profile): no early draft at all.

Job #61 shows it: an early draft was written at 97 to 130 s, then thrown away, and the person waited 38 s more for a new write.

### 2. Every hand off waits for the next worker round
The worker looks for work, then sleeps 1.5 s (`worker.ts`). Each stage starts on a later round: gate to tagging, tagging to early
draft, proposal to review. The page then checks for the result every 2.5 to 4 s. Each step the person watches gains about 2 to 5 s
of nothing. Job #61: the person asked for the proposal at 196 s and the writing started at 208 s.

### 3. One queue for everyone, in a fixed order
Three slots are shared by every kind of work, in this order: screening, post reading, tagging, proposals, review, chat, early drafts.
A person who has confirmed and is waiting for their proposal sits behind other people's new pastes. Early drafts, the work meant to
save time, only run when nothing else is waiting. (The three signal calls run outside the three slots, so up to six AI processes
can run at once.)

### 4. A new Claude Code process for every AI call
GLM and Claude calls each start the Claude Code program, in a new empty folder with an empty settings folder, and remove it after.
That is typically 1 to 3 s per call before the model starts, on about 10 calls per job. Only GPT (OpenAI) uses a direct web call.

### 5. The first two lines rewrite is a second full write
When the draft's first two lines break the type's rules, the whole proposal is written again with the full instructions (another
30 s on Claude). It runs after the first write, so it doubles the wait.

### 6. Small repeated reads (each small, they add up)
Settings are read from the database again for nearly every step; the project library is loaded twice in a row during tagging; the
writing guide, samples and project names are reloaded for every write, review and chat; tags, matches and signals are saved row by
row. None of this is large on its own, but none of it changes between jobs.

### 7. The review waits for a round too
The review is queued when the proposal is written and starts on the next worker round, below proposals in the order.

## The Claude plugin: what adds delay

The plugin's time is Claude's time: how many turns, how many tool calls in a row, how much it reads, and above all how much it
writes. The server answers every save in milliseconds.

### 1. Claude matches the projects in its head (biggest)
At the projects step Claude scores 60 or more projects against the job's tags, by the weights in the library, and orders them. That
is long, slow thinking and output on every job, and it repeats work the app already does in code (`rankProjects`) the same way every
time.

### 2. Big reads, read in full every run
`get_library` returns every project (links, overview, tags), the whole tag dictionary with descriptions, and every profile's Loom
videos: an estimated 10 to 20 thousand tokens, and it is called twice per run (the second time for case studies). On top of that
the `proposal-writer` skill still tells Claude to read six local reference files (writing rules, banned phrases, modules, screening
answers, checklist, the type), all of which `get_writing_guide` already returns.

### 3. Waits that can overlap
Setup, the duplicate check, the library and the writing guide are fetched one after another before the gate, though none depends
on the others. `review_proposal` answers "still working" after 50 s, which costs Claude another turn to ask again.

### 4. Writing the same text twice
Each draft is written once as the save (`save_proposal` text) and once again to show it, and every revision does the same. The read
step writes every signal with a quote and every tag with a reason.

### 5. Six to seven decision turns
Decision 1 (and a second question for the reason on a FLAG), the profile and then the rate, the projects, the type and the video
(already one box), the approval. Each is a full turn.

### 6. Local copies that are not needed
`project-library.md` (85 KB), the eight type files, `tag-weights.md` and `profiles.md` are backups of what Upwork Pro serves. They are
not read on a normal run, but the writer skill's wording makes Claude likely to read the type file and the rule files anyway.

## The fixes, ranked by time saved for the person waiting

| # | Where | Fix | Saves | Size |
| --- | --- | --- | --- | --- |
| 1 | App | Use the early draft far more often: write it with the Loom video when the profile's best video is clear (or add the video line after, without a new write), start it at once instead of last in the queue, and when the person picks another type or other projects, start the new draft the moment they pick, not when they press Write | the full write wait (30 s on Claude, 1 to 3 min on GLM) on about half the proposals | medium |
| 2 | Plugin | Match projects on the server: a `match_projects` tool runs the app's own matching (and the AI order) and returns the top five with reasons, so Claude only shows them | the longest thinking step of every plugin run | medium |
| 3 | App | Wake the worker the moment work is queued (the web app and the worker share the database; a short listen or a 200 ms poll instead of 1.5 s), and let the person's own waiting work (their proposal, their review, their chat) go before other people's background work | 2 to 5 s per step, more under load | small |
| 4 | Plugin | Smaller reads: `get_library` with a compact mode (names, platform, industries, tag names) and the Loom videos of one profile only; the writer skill reads only `get_writing_guide(type)` and never the local files; fetch setup, library and guide in one message at the start | thousands of tokens read per run, 2 to 3 turns | small |
| 5 | App | The first two lines: put the rules into the first write more strongly, and when they still fail, rewrite only the first two lines (a short call), not the whole proposal | up to a full write when it fires | small |
| 6 | App | Start the review in the same worker job right after writing; and let `review_proposal` in the plugin wait up to 55 s on the server so Claude never asks twice | a worker round, and a plugin turn | small |
| 7 | App | Choose Claude Sonnet as the AI in Settings if GLM is still in use on the live server (check Logs, AI calls) | 3 to 5 times faster on every step | a setting |
| 8 | App | Keep settings, the writing guide, the tag dictionary and the library in memory for a minute (cleared on any admin change); load the library once per tagging; save tags, matches and signals in one statement each | small per job, adds up under load | small |
| 9 | Plugin | Fewer turns: ask the profile and the rate in one box; on a PASS put the Continue question in the gate message; show the draft from the save instead of writing it twice | 1 to 2 turns and one copy of the draft | small |
| 10 | App | Keep one Claude Code process warm, or call the model directly over the web for Claude (as GPT already is) | 1 to 3 s per AI call, about 10 calls a job | larger, needs care |
| 11 | App | Start tagging and signals beside the gate at paste (thrown away if the gate fails) | about 18 s off "projects ready" | small, costs AI on failed jobs |

Not recommended: running proposals for many jobs at once beyond the three slots without checking the provider's limits, and
dropping the AI order of projects (it is what makes the shortlist good; fix 3 makes it cost less wall time instead).

## What to measure after each fix

Logs, AI calls already records every call. Two numbers tell whether a fix worked: paste to projects ready, and "Write the
proposal" pressed to proposal shown. Both can be read from the job's own times (`screenings.created_at`, `tagged_at`,
`proposals.created_at`, `finished_at`) without new code. For the plugin, time one `/proposal` run from link to the approved draft
before and after.
