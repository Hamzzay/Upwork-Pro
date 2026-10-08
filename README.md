# Upwork Pro

A tool for the Stackup team that takes an Upwork job from paste to proposal to outcome:

1. **Screen** the job against the Stackup SOP (the gate prompt) and get PASS, FLAG or FAIL with the rule codes behind it.
2. **Decide**: continue (a FLAG or FAIL needs a reason that is kept on record).
3. **Projects**: the job is tagged from the tag dictionary and matched to the Stackup project library; the person picks 1 or 2 of the top projects.
4. **Profile**: the Upwork profile the proposal is sent from.
5. **Proposal**: signals are detected, the best template is chosen, and the proposal is written, then edited by hand or by chat.
6. **Track** what happens on Upwork: sent, viewed, chat opened, interview, outcome (a lost job needs a reason).

Stack: Node (Express 5, TypeScript), MySQL/MariaDB, and an AI of your choice (GLM through Z.ai, Claude, or GPT; see **Choosing the AI** below).
GLM and Claude run through the pinned Claude Code CLI (see `claude-code-in-backend-glm-guide.pdf`); GPT calls the OpenAI API. The browser app is plain JavaScript in `backend/public`.
`NEW-UPDATES.md` is the change log of the speed and refinement rounds (branch `hamza`).

## Pages

| Page | Who | What it does |
|---|---|---|
| **Dashboard** | everyone (own jobs for employees) | KPIs, funnel from screened to hired, speed per step, jobs needing action, rules that fire most, by person and profile. Period and filters; every number opens the Jobs list with the same filters. |
| **Screen a job** | everyone | Paste a job link or the page text. |
| **Jobs** | everyone (own jobs for employees) | Tabs **All, In progress, Submitted, Closed, Not pursued** with counts; search and filters (dates, rule code, profile, person, outcome); sortable columns and a column picker; **Export** of exactly the filtered list to Excel or CSV; one-click **Update status**. |
| **A job** | owner, managers, admins | A read-only detail page with everything about the job. **Edit** opens the five-step workflow (Screening, Projects, Profile, Proposal, Tracking) with Previous and Next. |
| Projects, Industries | everyone read; managers and admins edit | The project library, with tags and industries (many to many). |
| Tag dictionary, Upwork profiles | admin | Tags and categories (with scores), and the profiles proposals are sent from. |
| Signals | managers and admins (admin edits) | The 19 detection signals the proposal type is picked by. |
| **Gate instructions** | admin | How the gate reads and judges a job (not the rules), in versions. Saving never overwrites: it makes a new version that only counts once activated. Has a test box and a full prompt preview. |
| **Rules** | admin | The FAIL and FLAG rules with their codes and a How to apply note, how many jobs each fired on, add / edit / retire. Applied from the next job. |
| **Writing guide** | everyone reads; managers and admins edit | How every proposal is written, by the app and the plugin: the six proposal types (format, signals, samples) and the shared rules (writing rules, banned phrases, modules, screening answers, checklist), with versions. |
| **Settings** | admin | **The AI** (GLM, Claude or GPT, with a model and a connection test), projects shown, recommended, the fewest and most a person can pick (1 to 2), the minimum match score, the shortest override reason, outcome choices and lost reasons, quiet days, rules passed to the writer. Applied to the next job, no restart. |
| **Connect Claude** | everyone | Connect your own Claude by signing in (the connector link, your connections, Disconnect), or make a personal token for a local setup (see `mcp/README.md`). |
| Users | admin | Accounts and roles. |
| **Logs** | admin | **Activity** (audit log with filters) and **AI calls** (every model call: job, step, model, time, failures). |

## How a job moves

- The worker (`npm run worker`) does all model work: screening, reading the posting into fields, tagging, signals, early drafts, the proposal and the chat.
  The web server only stores jobs and shows them; a page polls until the worker is done.
- **On PASS**, tagging and matching start at once, before anyone clicks Continue; on FLAG or FAIL nothing else runs until the person continues with a reason.
- **Signals** are read in three parallel calls (one per layer) alongside tagging. When matching finishes, an **early draft** is written for the 2 recommended
  projects and the likely profile; it is used only if the person then confirms the same projects and profile.
- Matching is done by the app, not the model: a project scores the sum of the weights of the tags it shares with the job; a missing compliance tag ranks a
  project lower. The top projects are stored with their scores and shared tags; names are copied, so deleting a project later changes no old result.
- The **template** is the best fit for the detected signals (sum of the weights of the matching rows; ties by priority; default when nothing matches).
  The writer follows fixed rules that no template or sample can override: no invented facts, links or numbers; samples are tone and structure only;
  sign-off with the profile's name and GitLab account; the client's own required structure wins. Checks run in code and show as warnings above the editor.
- The proposal is rich text. Every save, chat revision and restore is a version; the chat is stored with the version each message was based on and produced.
- A job is **Submitted** when marked Sent and **Closed** at a final outcome (Pending keeps it Submitted). The server enforces the order:
  Sent only after the proposal is finished; Viewed, Chat opened, Interview and outcomes only after Sent. Every change is kept as old value to new value.

## Gate instructions and rules

The model gets, for every job: the active **Gate instructions** (the method), then the active **Rules** (each with its code and How to apply
note), then the fixed output format and the project library (`gatePrompt` in `src/screening/contract.ts`). Each lives in one place:

- Add, reword or retire a rule on the Rules page; it applies from the next job, no new gate version needed. The instructions never list rules.
- Rules are never renumbered or reused: reword or retire one, and give a new meaning a new code.
- Each job keeps the rules it was screened against (`screenings.gate_rules`), shown on the job page and in the export.
- "See full prompt" on the Gate instructions page shows exactly what the model gets.

## Roles

| | employee | manager | admin |
|---|---|---|---|
| Screen jobs, see and work on their own jobs, continue with a reason | yes | yes | yes |
| See every job and every override reason; edit tracking on any job | no | yes | yes |
| Add, edit and delete projects, industries, templates and samples | no | yes | yes |
| Upwork profiles, users, tag dictionary, signals, Gate instructions, Rules, Settings, Logs | no | no | yes |

## Run it

```
cd backend
cp .env.example .env            # DB password, SEED_ADMIN_*, and the Z.ai key (LLM_API_KEY) yourself
# 1. start MySQL from the XAMPP control panel
# 2. as MySQL root, run sql/setup.sql (edit the password first): creates the database `upwork_gate` and a user
npm install
npm run migrate                 # creates and upgrades the tables (sql/migrations 002 to 016, tracked in schema_migrations)
npm run seed                    # first admin + gate instructions version 1 from seed/gate-instructions.md
npm run seed:library            # tags, projects, rules (with How to apply notes), profiles from seed/library.json (insert-if-missing)
npm run seed:proposals          # signals, templates (with a starter signal mapping) and sample proposals (insert-if-missing)
npm run seed:settings           # admin settings with their defaults from src/settings.ts (insert-if-missing)
npm run backfill:postings       # optional, spends AI quota: read older jobs' posts into fields (add -- --dry-run to count)
npm run seed:examples           # dev/demo only: 12 example jobs across every Jobs tab (-- --remove takes them out)
npm run sync:library            # dry run: how the database differs from seed/library.json (add -- --apply to apply)
npm run dev                     # web app and API on PORT
npm run worker                  # in a second terminal: all the model work
npm test                        # no database, no model
```

Database changes are numbered files in `sql/migrations/`, applied once and in order by `npm run migrate`. Back the database up before you migrate.

### Settings in `.env`

- `LLM_PROVIDER=mock` (default) spends nothing and returns canned answers (add `[mock-pass]` or `[mock-fail]` to pasted text for the other verdicts).
  `claude-cli` means real AI: which one is then chosen in **Settings, AI** (below). Mock ignores that choice.
- Keys, one per provider, in `.env` only (never in git, never in the database, never shown in the app):
  `LLM_API_KEY` and `LLM_BASE_URL` for GLM, `ANTHROPIC_API_KEY` for Claude (or `LLM_OAUTH_TOKEN`, a subscription token from `claude setup-token`; the API key wins if both are set), `OPENAI_API_KEY` for GPT (`OPENAI_BASE_URL` only for a proxy).
- `LLM_MODEL`: the starting GLM model. After that, models are chosen in Settings.
- `LLM_TIMEOUT_MS`: one model call. Real calls can take 2 to 3 minutes, so keep this at 600000.
- `LLM_CONCURRENCY`: jobs in flight. One job can make several calls at once (tagging 2, signals 3); lower it if the provider answers "busy".

### Choosing the AI

Settings, **AI** card: pick GLM (Z.ai), Claude (Anthropic) or GPT (OpenAI), pick or type a model, **Test connection**, then **Use this AI**.

- It applies to the next call: no restart. Jobs already running finish on the AI they started with.
- A provider whose key is not in `.env` cannot be chosen; Test connection says what is missing.
- Every result stores the provider and model that produced it, and Logs, AI calls shows both.
- Prompts were tuned on GLM. Before relying on another AI, run the same two or three real jobs through it and compare.
- GPT uses strict JSON Schema output; the app's own schemas are translated automatically and every answer is still checked by the app.
- `npm run probe` tests the GLM key from `.env` directly.

## Importing sheets through Claude (MCP)

`mcp/` is a small server that lets Claude save sheet data (rule codes, tag dictionary, projects, Upwork profiles) into Upwork Pro. Claude previews every import and you confirm before anything
is saved; an import can be undone. It uses a personal token from the **Connect Claude** page and the import API (`/api/import/*`, migration 014), so it can do only what your role can do.
See `mcp/README.md` for setup, safety rules, what is not imported yet, and the server notes.

## Link input

Pasted text works. Pasting a link needs the Upwork API: `src/upwork/client.ts` is a stub that stores the job id (from `~02<id>`) and then asks the person to paste
the text. It needs an approved Upwork API app (OAuth2); write `fetchJob()` from Upwork's developer docs and the rest is wired.

## Production

Build with `npm run build`, then `npm start` and `npm run start:worker` (and `:prod` variants of the scripts above). Run the worker under PM2 with
`instances: 1`, `exec_mode: 'fork'`, `kill_timeout: 10000`. Use HTTPS (the cookie is `secure` when `NODE_ENV=production`). Login throttling is in memory only.
