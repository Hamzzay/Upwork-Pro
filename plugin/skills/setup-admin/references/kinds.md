# What to ask, and the standard format, per kind

Field names in `code` are the names `setup_prepare` takes. Ask in plain words, not with the field names.

## Project (`project`)

Ask for:

1. The name, as the client or product is called.
2. What it is, in two or three sentences: who it is for, what it does (`overview`).
3. The case study (`case_study_summary`), in the team's format with exactly these headings:
   **Project**, **Problem**, **Solution**, **Key features**, **Technology**, **Results**.
   Results only when the person gives them. Never a number that was not given. If there are no results, leave the heading out and say so.
4. Links: the one to show in a proposal (`live_link`), and any of landing page (`landing_link`), the system or app (`system_link`), Android (`android_link`), iOS (`ios_link`), staging (`staging_link`), the case study page (`case_study_link`).
5. The industry or industries (`industries`): the client's business, from the industries list.
6. Tags (`tags`), from the tag dictionary only. Suggest them category by category with a one line reason each, and let the person confirm each category:
   * **the work it proves** first (Workflow type, AI capability): without at least one of these the project is never recommended for a job;
   * product type; stack and tools; integrations; compliance; the Industry tag that matches its industry.
7. Anything a writer must know that is not for the client (`notes`).

Before preparing, check: the name is free; every tag and industry exists; the overview is two or three sentences; the case study has the headings; nothing in it was added by you.

## Industry (`industry`)

The name; what it covers in one or two sentences (`description`); related industries, comma separated, by their exact names (`related`: related industries are shown second on the Projects step); the projects in it (`projects`).

## Tag (`tag`) and tag category (`tag_category`)

* The category (`category`), from the existing ones. A new category is rare: ask twice.
* The name, short, as a client would say it.
* What it means (`description`): one or two sentences the AI reads to decide whether a job gets this tag. Say when it applies and when it does not.
* The score (`weight`, 0 to 10): how much it counts in matching when a job has it too. Show two existing tags of the same category with their scores for comparison, and say what a higher or lower score would change.
* Which projects have it (`projects`), by name. A tag no project has does nothing for matching.

## Upwork profile (`profile`)

Name; `tagline`; hourly rate (`price`) and the lowest acceptable (`lowest_price`); `profile_url`; `github_url` or `gitlab_account`; services offered (`services`); `industries`; the voice to write in (`voice`); the sign-off exactly as it should appear (`signature`); the numbers and claims the writer may use (`stats_allowed`); `certifications` (used only when a client requires one); who submits with this profile (`submitted_by`); profile rules (`rules`); `notes`.
Never invent a rate, a signature or a stat. Mark each missing one and leave it empty.

## Loom video (`loom_video`)

The profile it belongs to (`profile`); the `title`; the link (`url`); what it shows in two or three sentences (`topic`); tags from the dictionary for the kind of job it suits (`tags`).

## Rule (`rule`)

Fail or flag (`type`: `fail` stops the job, `flag` asks for a reason to continue); the rule in one sentence (`rule`); how to apply it, with the edge cases (`details`). The code is given by Upwork Pro and never reused. Look at the existing rules first: a new rule must not repeat or contradict one.
To retire a rule use `switch_off`; past results keep the code.

## Signal (`signal`) and signal value (`signal_value`)

Signal: its `number`, the `layer` (by code), the `name`, what it decides (`decides`), whether several values can hold at once (`multi_select`).
Value (needs `parent`, the signal): the `name`, how to detect it in a job (`detect`), what the proposal does when it holds (`move`), whether it is the fallback (`is_fallback`).
Signals decide which proposal type is suggested, so show the proposal types that use the signal before changing it.

## Proposal type (`template`) and sample proposal (`template_sample`)

Type: `name`, when it is chosen (`description`), the structure (`body_html`), instructions for the writer (`prompt`), the rules for the first two lines (`opening_rules`), `priority`.
Sample (needs `parent`, the type): `title`, `author`, the job link (`job_url`), job keywords (`job_keywords`), the proposal text (`content`). A sample must be a real proposal that was sent; remove the client's name and anything private before showing it.

## Writing guide document (`writing_doc`)

Only changed, never added. `setup_get` it, show the part to change, and send the full new text (`content`) with a short `note` saying what changed. The earlier text is kept as a version.

## Setting (`setting`)

`setup_list` shows every setting with its value and what it does. Change one with `fields: { value }`. Say what the new value will change from the next job on.

## Reviewer instructions (`reviewer_instructions`)

How the independent reviewer scores every proposal. `setup_get` it first and show the parts the person wants to change as they are now.
Ask what they want it to care about, in their words, then write each part in the same plain style:

* `method`: who the reviewer is, who it reads for, how it should think. Two to five sentences.
* `concerns`: what matters most, a list, most important first. Each one a short question or statement the reviewer judges.
* `dos` and `donts`: short lists, one rule each, written as instructions ("Quote the words you mean", "Do not round up to be kind").
* `score_guide`: one line per band of scores, from 9 or 10 down to 1 or 2.
* `score_limits`: rules that always hold ("A proposal with an invented fact cannot score above 6").
* `writing`: how the verdict, problems and suggestions are written.
* `limits`: `{ strengths, problems, suggestions }`, the most of each (strengths 0 to 5, problems 1 to 6, suggestions 0 to 5).
* `context`: `{ signals, writing_rules, banned_phrases, checklist, automatic_checks }`, true or false, which optional facts it reads.

Send only the parts that change; a list replaces the whole list. Then `activate` as its own change once they have tried it.

## Gate instructions (`gate_instructions`)

See the skill: `new_version` (the full text in `content`, and a `change_note`), test in the app, then `activate` (`version`).
