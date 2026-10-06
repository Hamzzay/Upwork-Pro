# Upwork Job Gate

Screens an Upwork job against the Stackup SOP (the `SKILL.md` rules) and returns PASS, FLAG or FAIL.
Input is a job link or pasted job page text. Every screening is saved. On FAIL or FLAG the user must
give a reason to continue, and the reason is kept.

Stack: Node (Express 5, TypeScript), MySQL/MariaDB, GLM through Z.ai via the pinned Claude Code CLI
(follows `claude-code-in-backend-glm-guide.pdf`).

## How it works

1. `POST /api/screenings` detects link vs text and stores a `queued` row. It answers at once.
2. `src/worker.ts` (separate process) claims queued rows, loads the active skill version from the database,
   calls the model with `--tools ''` and a JSON schema, validates the answer with zod and saves it.
3. The page polls the record until it is `done` or `error`.
4. FAIL or FLAG: `POST /api/screenings/:id/override` with a reason (15+ characters). One per screening.

The skill text is an editable database row (`skill_versions`). The output format is a fixed contract in
`src/screening/contract.ts` appended after the skill text, so an admin edit cannot break report parsing.
Saving a skill creates a new version; it only takes effect when activated. Each screening stores the version it used.

## Project library and sheet columns

- `tag_categories`, `tags`, `projects`, `project_tags` hold the Stackup tag dictionary and the delivered projects. `seed/library.json`
  was generated from `Stackup Project Tag old.xlsx` and `Upwork Jobs History.xlsx` (`scripts/xlsx-to-seed.ts`, dev only).
  Seeding never overwrites edits made in the app.
- `rules` holds the F1 to F5 and G1 to G17 codes. Each screening records its rule codes.
- Every column of the Upwork Jobs History sheet is a column of `screenings`. The app fills date, profile, URL and description;
  the model fills the extracted fields (as text, since the sheet mixes numbers and notes); the app derives fail reasons, flag reasons
  and rule codes; people fill Proceeded, Proposal sent date, Outcome and Notes on the record page.
- Sample Match names real library projects. The model is shown the project list and names outside it are dropped.
- Database changes are numbered files in `sql/migrations/`, applied by `npm run migrate` (tracked in `schema_migrations`).

## After the screening: continue, tags, matching projects

1. PASS: a **Continue** button. FLAG or FAIL: **Continue anyway** with a reason (kept on record). Either one starts step 2.
2. The worker asks the model to pick tags from the tag dictionary for the pasted job text, with a reason for each (`job_tags`).
3. The app (not the model) scores every active library project: the sum of the weights of the tags it shares with the job
   (`tags.weight`; "AI powered" is 0). If the job needs a compliance tag, projects missing it rank below those that have it.
   The top 5 are stored with their scores and shared tags (`job_matches`); the best 2 are marked recommended.
4. The submitter confirms exactly 2 of those 5 (default: the 2 recommended). Managers and admins can read everything.
   Names of projects and tags are copied into the history rows, so deleting a project later does not change old results.

- After the 2 projects are confirmed, the submitter picks the one Upwork profile the proposal will be sent from (`screenings.proposal_profile_id`).
  This is separate from the profile chosen when the job was submitted (the sheet's "Upwork Profile" column).
- The model may choose as many dictionary tags as apply: there is no limit.
- **Tag dictionary** (admin): tags and categories can be added, edited, disabled and deleted, and a tag's score (0 to 10) edited inline.
  A category flagged as *compliance* gets the stricter tagging rule and the push-down in matching.
- **Industries** (admin and manager edit, everyone reads): many-to-many with projects, edited from either side. They were created once from the
  "Industry" tag category and the projects' industry tags, and are independent of those tags from then on (matching still scores the Industry tags).

## The record page is a stepper

Five steps with Previous and Next: **Screening** (report, Continue or Continue anyway), **Projects** (tags and the 2 projects), **Profile**, **Proposal**, **Tracking**.
A step opens once the one before it is done. The profile is no longer asked when a job is submitted: choosing it in step 3 starts the proposal by itself,
and **Done** in step 4 opens Tracking. Changing the profile later does not rewrite the proposal; it shows a notice and a "Write it again" button.

## Step 4: the proposal

After the 2 projects and the sending profile are confirmed, **Write the proposal** runs a pipeline in the worker:

1. **Signals.** The model reads the job and, for each of the 16 signals (`signals`, `signal_values`, seeded from the three detection guides), picks the value
   that fits or the signal's fallback. Missing signals are filled with their fallback (signal 5 with "No"). Stored in `job_signals` with the evidence.
2. **Template.** Each template lists the signals it suits (`template_signals`: a signal, optionally one value, and a weight). The score is the sum of the weights
   of the rows that match; ties go to the lower priority number, and when nothing matches the lowest priority number is the default. The ranking is stored and shown.
3. **Writing.** The writer gets the template format and prompt, the "move" of every detected signal, up to 3 sample proposals of that template, the sender profile,
   the 2 projects, and the client's own requirements from the screening. Fixed rules (not editable) apply on top: no invented facts, links or numbers; samples are
   tone and structure only; sign-off with the profile name and its GitLab account; the client's required structure or opening word wins.
4. **Checks** run in code and show as warnings above the editor: a selected project missing, a library project or a sample author named, a link or percentage that was
   not provided, the sign-off missing, "we" used.

The proposal is rich text. Every save, chat revision and restore is a new version (`proposal_versions`); the chat is stored in `proposal_messages` with the version each
message was based on and the version it produced. A chat revision never replaces text you are still editing: a banner offers it instead.

## Roles

| | employee | manager | admin |
|---|---|---|---|
| Screen jobs, see own records, continue with a reason | yes | yes | yes |
| See all records and all override reasons (read only) | no | yes | yes |
| Add, edit and delete projects; edit tracking on any record | no | yes | yes |
| Upwork profiles, users, tag dictionary, skill editor and test box, audit log | no | no | yes |

## Run it

```
cd backend
cp .env.example .env            # fill in DB password, SEED_ADMIN_*, and later the Z.ai key
# 1. start MySQL from the XAMPP control panel
# 2. as MySQL root, run sql/setup.sql (edit the password first) - creates DB `upwork_gate` and a user
npm install
npm run migrate                 # creates tables
npm run seed                    # first admin + skill v1 from seed/SKILL.md
npm run seed:library            # tags, projects, rule codes, profiles from seed/library.json (insert-if-missing)
npm run seed:proposals          # detection signals, proposal templates (with a starter signal mapping) and sample proposals (insert-if-missing)
npm run sync:library            # dry run: how the database differs from seed/library.json (add --apply via `-- --apply`)
npm run dev                     # web app + API on PORT
npm run worker                  # in a second terminal
npm test                        # no DB, no model
```

Default `LLM_PROVIDER=mock` spends nothing: it returns a canned FLAG (add `[mock-pass]` or `[mock-fail]`
to the pasted text for the other verdicts). For the real model set `LLM_PROVIDER=claude-cli`,
`LLM_API_KEY` (in `.env` only, never in git) and run `npm run probe` once to check key and model name.
To use Anthropic directly (Claude Sonnet 5.5 on a Claude subscription) instead of Z.ai, set `LLM_OAUTH_TOKEN` to a long-lived
token from `claude setup-token`; `LLM_BASE_URL` and `LLM_API_KEY` are then ignored and `LLM_MODEL` defaults to `claude-sonnet-5-5`.

## Not done yet

- **Link input needs the Upwork API.** `src/upwork/client.ts` is a stub. Link input stores the job id
  (parsed from `~02<id>` in the URL) and then fails with "paste the text instead". It needs an approved
  Upwork API app (OAuth2). Write `fetchJob()` from Upwork's developer docs; the rest is already wired.
  The API data may lack payment verified, proposal count and member since; those show as "not shown" (an SOP flag).
- **Real-model output not verified.** With a bad key the CLI path returns the expected 401. A full
  structured answer from GLM has not been run because no key was available. Run `npm run probe`, then screen
  3 to 5 known jobs and compare with the SOP before trusting verdicts.
- `/api/admin/skill/test` runs the model inside the HTTP request and outside `LLM_CONCURRENCY`. Fine for one admin; the Z.ai limit is per account, so keep it rare.
- The browser UI has not been opened in a browser yet (files are served and the API behind it is tested).
- Production: build with `npm run build`, then `npm start` and `npm run start:worker`; run the worker under PM2 with `instances: 1`, `exec_mode: 'fork'`, `kill_timeout: 10000`.
  Use HTTPS (cookie is `secure` when `NODE_ENV=production`). Login throttling is in memory only.
