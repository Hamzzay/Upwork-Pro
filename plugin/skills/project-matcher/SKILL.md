---
name: project-matcher
description: Matches Stackup's past projects to a job by first understanding what the job needs, filtering on platform (web, mobile, both, backend), then industry, then weighted tags, and returns a top five shortlist with two recommended. Use when the proposal workflow reaches its project step, or when someone asks which past projects fit a job.
---

# Project matcher

Matching runs in four steps: **understand the job, filter by platform, then industry, then tags.** A project that does not fit what the client is building is never recommended, however high its tag score. Recommending a mobile app for a web build, or a web dashboard for a mobile app, tells the client the post was not read.

**Upwork Pro does the matching.** In the proposal workflow, call `match_projects` for the saved job: it runs these same rules on the server, with the AI's order and a reason per project, in seconds. Show its answer; never score projects yourself. The rules below explain what it does, and are what to follow by hand only when `match_projects` is not available.

## Load the library

1. **Call `get_library` (Upwork Pro) once per run.** It returns every active project (proposal link, landing, system, mobile, staging and case study links, overview, industries, tags) and the tag dictionary with each tag's match weight. Upwork Pro is the one library every Claude shares; the team edits it there (Projects, Industries, Tag dictionary).
2. Case studies are long, so `get_library` leaves them out (`has_case_study` says one exists). Once the person has chosen the projects, call `get_library` again with `case_studies` set to their names, and pass those summaries to the writer.
3. If Upwork Pro is not reachable, use the backup in `references/project-library.md` and tell the person in one line that the shortlist is from the Oct 8 backup. Never ask the person to upload or attach the library.
4. Every project in the library is publicly showable. Ignore "Showable publicly" entirely; never filter on it or warn about it.
5. Pass every descriptive field to the writer: the overview, the case study summary and anything else the library returns.

## Step 0. Understand the job

Before scoring anything, write one visible line from the full post:

**Job needs:** [platform] [product type] for [core workflow] in [industry], using [named stack].

Example: "Job needs: a web SaaS platform for appointment booking and payments in Beauty / salon, using Next.js and Stripe."

* **Platform** comes from the `job-signals` Platform signal: Web, Mobile, Web and mobile, Backend or API only, Desktop, or Not stated.
* **Core workflow** is the one thing the client most needs the product to do, in their words.
* Every recommended project is checked against this line. State any part it does not match.

## Step 1. Platform filter

A project's platform comes from its links and tags: a Landing Page or System link, or Web app, SaaS platform, Website / landing page or Admin dashboard tags, means **web**; an Android or iOS link or the Mobile app tag means **mobile**; Desktop app means **desktop**.

| Job platform | Project qualifies when | Excluded |
| --- | --- | --- |
| Web | It is a web product and has a web link (Landing Page or System link) | Mobile only projects, and projects whose only link is a mobile store link |
| Mobile | It is a mobile product (an Android or iOS link, or the Mobile app tag) | Web only projects |
| Web and mobile | Prefer projects that are both. Otherwise the two recommended must cover both: one web, one mobile | Neither |
| Backend or API only | It has API / backend service, integrations or automation work matching the job | None by platform; judge on workflow |
| Desktop | Desktop app tag, otherwise the closest web product, flagged under "Needs your eye" | Mobile only projects |
| Not stated | Infer from the post (a "dashboard", "portal" or "website" is web; "app store", "iOS", "Android" is mobile). If still unclear, do not filter, and say so | None |

Excluded projects are never recommended and never appear in the top five. If the filter leaves fewer than two qualifying projects, say so plainly, recommend what qualifies, and flag the gap under "Needs your eye". Never fill the gap with a wrong platform project.

## Step 2. The work first

The same rule as Upwork Pro (`get_library` returns it under `matching`; follow that text if it differs from this file).

Name the job's **core work**: one to three specific workflow, AI capability, automation or product type tags from the job's tags (never a project stage such as Prototype, a tool, a model or a stack), the main work first (for a scraping job "Web scraping /
data pipelines"; for a voice receptionist "AI voice agent"). Never broad tags such as Workflow automation, AI automation, AI powered or
Ongoing maintenance / support. Show it in the "Job needs" line.

A project **proves the job** only if it shares a core work tag. Projects that prove the work always rank above those that do not,
whatever their industry, and only they are recommended. Among them, projects that did the main work come first. A same industry
project that did none of the work is never recommended.

## Step 3. Industry, within the projects that prove the work

1. Take the job industry from the `job-signals` reading (the Job industry signal). It is **one** industry: the client's own business, or the users of what is built. Never the industries of data to be collected, leads or contacts to be found, or markets to be reached (a recruitment company scraping real estate contacts is Recruitment / HR, not Real estate).
2. **If the job names or clearly implies an industry,** sort every project into three pools. A project's industries come from `get_library`; related industries from `references/industry-map.md` (the same list is on Upwork Pro's Industries page):
    * **Same industry:** the project carries the job's industry tag, or its overview clearly places it in that industry.
    * **Related industry:** the project's industry is listed as related in the industry map (for example a Healthcare project for a Dental job).
    * **Other:** everything else.
3. **If the job does not name or imply an industry** (for example "automate our email inbox" with no business described), skip this step: all platform qualified projects form one pool and Step 4 decides alone. Say "No industry stated, matched on tags only."

## Step 4. Tags within the pool

1. Score each project on the job's tags using each tag's `weight` from `get_library` (fallback: `references/tag-weights.md`). Industry tags are excluded from this score; industry was already handled in Step 3.
2. A project scores the weight of every tag it shares with the job's tags. "AI powered" scores 0.
   **Skip tech stack tags.** When the person asks to skip the tech stack (or the job saved in Upwork Pro has `skip_tech_stack` true), leave every tag of the **Tech stack** category out: out of the score, out of the matched tags and out of the most a project can score. Everything else (platform, core work, industry, compliance, the other tags, the order) stays exactly the same. Say it in one line above the shortlist: "Matched without the tech stack tags."
3. Minimum tag score: `matching.min_score` from `get_library` (the app's setting). Below it, a project is not shown.
4. **Core workflow check.** A project only counts as a strong match if it delivered the job's core workflow from Step 0, not just shared generic tags (Admin dashboard, Role based access, Reporting). When two projects have similar scores, the one that did the core workflow ranks higher.

## Build the shortlist

1. Projects that did the main work first, then those that did other core work (Step 2). Within each, Same industry first, then Related, then Other; then the number of core work tags shared; then the tag score. Projects that do not prove the work come after all of them.
2. Take the top `matching.shown` (usually five) from that order. Offer to show the next ten if the person wants more.
3. **Recommend the first two that prove the work** in that order. If no project in the job's industry proves the work, say so plainly.
4. **Better fit from another industry.** If a project outside the job's industry has a tag score at least 1.5 times the best Same industry score, and matches the job's core workflow or AI capability, show it below the five as **"Alternative from another industry"** with two or three lines explaining why it may be the stronger proof. Never let it replace a Same industry recommendation on its own; the person decides.
5. If the job has a compliance tag, at least one recommended project must share it. If none in the industry pool does, say so and name the best project outside the pool that does.
6. Keep the two recommended projects distinct: they should prove different parts of the job, not repeat the same match.

## Put the shortlist in order (the last step, the same as the app)

Tags only build the shortlist. Take the top twelve or so from the steps above, read each one's overview and case study (`get_library`
with `case_studies` set to their names), and order them by how well each proves this exact job: the same core work done the same way
(the same kind of input, output and users) first; then the same industry or kind of client, platform and scale. Give each a one line
reason. A project that only shares broad features (an AI agent, a dashboard, automation) is weaker than one that did this exact job;
drop any that do not really prove it. Recommend the first two that fit.

## Show the shortlist

Show a table before asking the person to choose:

| Column | Content |
| --- | --- |
| Project | Name |
| Platform | Web, Mobile or both, and the link that will be used |
| Industry match | Same, Related or Other, with the project's industry |
| Tag score | Score, excluding industry |
| Matched tags | The tags that scored |
| Why it fits | One line drawn from the project overview, naming which part of the "Job needs" line it proves |

Show the "Job needs" line above the table. Mark the two recommended. Put the industry alternative, if any, under the table with its explanation.

## Filter

Remove before ranking:
* Projects not allowed for the chosen profile, when that column exists.
* All white label work, such as MD Driven.

Projects with no link of any kind stay in, but are marked "no link". The library's `proposal_link` is the team's default; still pick per job with the order below.

## Which link goes in a proposal

Use the first link that exists, in this order:

1. **Landing page link or a store link (Android or iOS), matched to the job's platform.** For a web job use the Landing Page link, never a mobile store link. For a mobile job use the store link: `android_link` for an Android job, `ios_link` for an iPhone job, both on separate lines when the job wants both. For a web and mobile job, use the link that matches the part of the job this project proves, or both on separate lines. A Mobile cell may hold several links (Android and iOS); use the store that fits the job, or both on separate lines.
2. **System link.** The live system. For a web job, a System link comes before any mobile link.
3. **Case study link.** It is on the Stackup Solutions website. Upwork's rules allow portfolio and website links before a contract, but the Stackup site carries contact details and a contact form, so use a case study link only when no link above exists, and list it under "Needs your eye" so the person confirms before submitting.
4. **Staging link.** Last resort only, since it is served from Stackup's own server. Always list it under "Needs your eye".

If a project has no link at all, it can still be described in the proposal without a link; mark it "no link" in the shortlist.

Case study summaries are always used as source material for the writing, whatever link is chosen.

## Hand off to the writer

For each chosen project pass: name, industry, the proposal link chosen by the rule above, matched tags, the project overview, the case study summary, and any other stored facts. The writer may frame a project differently per job, but every claim must come from stored facts. When a chosen project is from another industry, the writer leads with the shared workflow, not the industry.
