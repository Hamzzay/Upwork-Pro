# Claude plugin vs Upwork Pro: what differs

Compared on 2026-10-08: the plugin `stackup-proposals` v0.1.7 (its skills and references) against Upwork Pro on the `hamza` branch.
"Dynamic" here means the logic adapts to the job (industry, signals, profile, client asks) instead of following one fixed path.

## Done in this round (R17)

| Gap | Now |
| --- | --- |
| The system had 1 profile; the plugin has 7 | All 7 are in Upwork Pro, with the plugin's fields (Hamza: rate, GitHub, services, voice, signature, stats, rules; Ahmad and Hassan: rates; Hassan: his rule). Most fields are still TO FILL in the plugin too. |
| Profiles held name, headline, price, GitLab only | Profiles now also hold lowest rate, GitHub, services, industries to lead with, voice, signature, stats allowed, who submits, rules. Editable under Upwork profiles. |
| The writer only knew the profile name, headline and GitLab | The writer now gets voice, signature, allowed Upwork stats and the profile rules (rules come before the template). GitHub is used when there is no GitLab. |
| The live sheet has 43 projects; the system had 31 | The 12 missing projects are added (Breesy, ZD Law Firm Automation, 10-4 Global, Dealsmart, LumiTrip, ThreadLabStudio, Kruzee, Eye Clinic Management, LexGuard Pro, Lucid Vision, Malaab, Verkehrbox). |
| Tags had drifted | 13 projects got the sheet's current tags (for example Bitrix24 +4, Chloe +3). New industries Sports, Event management, Social; Paddlewar and Playpickleball are now Sports (they had 4 other industries from the old Excel file), Puppeteer is Event management, Tolba is Social. |
| Projects had one "live link" and empty notes | Every project now has the sheet's landing, system, mobile, staging and case study links, its overview (43 of 43) and case study summary (26). 27 projects have a proposal link. |
| The writer described projects from tags only | The writer now gets each project's overview and case study summary; figures in them are allowed in the proposal. |
| A profile or project missing in Upwork Pro stopped the plugin | The plugin adds it right away (`add_profile`, `add_project`), then saves. Existing records are never overwritten, only empty fields filled. |

## Still different: where the plugin is more dynamic

Ordered by how much they change the proposal. Each needs a decision before building.

| # | Area | Plugin | Upwork Pro today | To match it |
| --- | --- | --- | --- | --- |
| 1 | **Project matching** | Industry first: same industry, then related industries (a map, for example Dental to Healthcare), then the rest; tags rank inside each pool. Industry tags are not part of the tag score. Recommends two from the job's industry, shows an "Alternative from another industry" when its score is 1.5 times better, needs a compliance match, keeps the two picks distinct. Minimum score 6. | Tags only, Industry tags counted as weight 2, compliance gap first. Industries exist (page and links) but matching ignores them. Minimum score 1 (setting). | Read the job's industry (signals already have "Vertical / industry"), add a related-industries table, rank in pools, show the alternative. Keep the scores as settings. |
| 2 | **Proposal types** | Six types chosen by the signals: Standard build (120 to 200 words), Structured submission, Invite (100 to 160), Rescue or takeover (140 to 200), Architecture or consulting (160 to 240), Small fix (50 to 100). The person picks; recommended and next best shown. | Three templates (SOP documents) ranked by signal mappings. No word ranges, no invite or small fix shapes. | Load the six types as templates with their word ranges and signal mappings; show the recommended and next best before writing. |
| 3 | **Modules** | Paragraphs added when a signal calls for them: data handling (compliance), staged autonomy (AI acts on the client's behalf), integration first look (EHR, ERP, CRM named), quote rule (pricing asked). | None. | Add modules as small templates switched on by signal values. |
| 4 | **Screening answers** | Written separately from the cover letter, numbered in the client's order, with rules for answers that cannot be given honestly. | The writer treats questions as client requirements inside the cover letter. | A second output: the answers, numbered, each editable. |
| 5 | **Verification** | A checklist run on the draft, one rewrite of failing items, then "Needs your eye" (failing checks, pricing asks, case study or staging links). Banned phrases list. | Code checks show warnings (projects named, links, sign-off, figures, "we"). No rewrite, no banned phrases, no word count. | Add banned phrases and word range to the checks; one automatic rewrite of failures; a "Needs your eye" list. |
| 6 | **Signals** | About 22 signals in 4 groups with fallbacks and a precedence rule (client instructions over structure over content over tone). Has explicit asks (list), required words, invite, portfolio requested, pricing requested, AI acts on behalf, integration risk. | 16 signals in 4 layers (from the SOP sheet). Required words and screening questions come from the gate's notes. | Add the missing signals in Signals (admin page); no code change for most. |
| 7 | **Profile choice** | Suggests a profile by services, industries, seniority (architect jobs to a senior profile), invite (the invited profile only) and who submits; never a profile that already sent this job. | The person picks; the early draft guesses. | Score profiles on the new fields (services, industries) and the duplicate history; show the suggestion with a reason. |
| 8 | **Rate** | Prefills the profile rate, bids the posted budget on fixed price, allows down to the lowest rate, records the final rate. | No rate per job. | A rate field on the profile step, saved with the job (and in the export). |
| 9 | **Duplicate jobs** | Same Upwork job found by link: shown with profile and date, flagged D1, continue only from a different profile; projects used before are deprioritized. | The app screens the same job again without a warning (the plugin save does refuse duplicates). | Warn on Screen a job when the link was screened before, with who and which profile. |
| 10 | **Which project link** | Order: landing or mobile, then live system, then case study (flagged to confirm), then staging (flagged). | One proposal link per project (now filled from the sheet in that order); the other links are stored but the writer does not choose. | Let the writer pick per job (web or mobile) and flag case study or staging links. |
| 11 | **Override reason** | Quick picks (Invite, Strong client history, Strong project fit, Low workload, Other) plus a note. | Free text, 15 characters minimum. | Add the quick picks (a setting) above the text box. |
| 12 | **Library source** | Reads the live Google Sheet on every run. | The database; changes in the sheet need `npm run sync:library` with a fresh export, or the plugin's `add_project`. | Either the team edits projects in Upwork Pro only, or a "Sync from the sheet" button (needs Google access on the server). |

Same in both: the gate (now one set of rules, and the plugin saves its verdict as is), the five decision points, version history of
the proposal, status tracking after sending.

## Profile data still missing (in the plugin too)

Every profile except Hamza is mostly empty: Upwork link, headline, GitHub, services, industries, voice, signature and rules. Fill them under
Upwork profiles; the plugin now reads them from Upwork Pro, so they only need entering once.
