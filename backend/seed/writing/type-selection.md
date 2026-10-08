# Choosing the proposal type

Every type is scored against the signals from `job-signals`. Signal names below are exactly the ones that skill produces.

## The eight types

| Type | Required (all must hold) | Supporting (each adds 1) | Exclude when (any rules it out) |
| --- | --- | --- | --- |
| 2 Structured submission | Explicit asks has 2 or more items | Pricing requested · Portfolio requested · Required words or format present | None |
| 3 Invite | Invite is "invite with name" or "invite without name", and the gate did not fail it as a generic mass invite (F6) | Urgency ready now · Decision maker owner | Explicit asks has 2 or more items |
| 4 Rescue or takeover | Project stage is rescue or takeover, or rebuild or migration | Pain frustrated · previous developer mentioned · Integration risk named | Scope size small task with a single defect |
| 5 Architecture or consulting | Role seniority architect or consultant, or Engagement model discovery first with an assessment, strategy or roadmap deliverable | Compliance present · AI acts on behalf yes · Data and scale stated · Clarity vague | Scope size small task |
| 6 Small fix | Scope size small task | Project stage small fix · Urgency ready now · Fixed budget under $500 | Multiple features requested · Project stage new build |
| 7 Problem first | Job focus operations, and the post describes a current problem (manual work, inefficiency, disconnected tools) | Integration risk named · Named tools or APIs · AI acts on behalf yes · Engagement hourly ongoing | Any exclusion for Type 1 except Job focus |
| 8 Approach first with questions | Job focus product, Project stage new build or extend, and Clarity vague or key decisions left open (scope, integrations, data or users not stated) | Urgency exploring · Product type SaaS or platform · Decision maker owner | Clarity precise · any exclusion for Type 1 except Clarity |
| 1 Standard build | Project stage new build, MVP or extend, and Role seniority builder | Scope size project or platform · Named stack present · Clarity precise | Explicit asks 2 or more · Invite · Project stage rescue · Role architect · Scope small task · Job focus operations with a described problem (Type 7) · Clarity vague (Type 8) |

## How to decide

1. Drop every type whose required signals do not all hold, or that has an exclusion that applies.
2. Among the rest, apply this priority: **2, then 3, then 4, 5 and 6, then 7, 8 and 1.**
3. Within the same priority group, the type with more supporting signals wins. On a tie, prefer 4 over 5 over 6, and 1 over 7 over 8.
4. If nothing qualifies, recommend Type 1 and say no type matched cleanly.

## What to show the person

Show the top two or three qualifying types as a visible table before asking:

| Type | Required signals met | Supporting signals | Why |
| --- | --- | --- | --- |

Mark one as recommended. The person picks; their pick always wins.

## Adding a new type

A new type needs a file in `types/` with its structure, rules, "Do not" and samples, plus one row in the table above using only signal names that `job-signals` produces. If a type needs a new signal, add the signal to `job-signals` first.
