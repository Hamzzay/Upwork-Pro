# Upwork Pro MCP

Lets Claude save data from your sheets into Upwork Pro. Claude reads the sheet, this MCP checks the rows against the app's own rules,
Claude shows you what would be created or changed, and **nothing is saved until you say yes**. A saved import can be undone as a whole.

The MCP never touches the database. It calls the Upwork Pro API with **your own token**, so it can do only what your role can do on the website.

## What it can import

| Type | Who | Reads | Never does |
|---|---|---|---|
| `rules` | admin | the "Rule Codes" sheet | reword an existing code, reuse a code |
| `tag_dictionary` | admin | the "Tag Dictionary" sheet | change an existing tag, unless the import allows changes |
| `projects` | manager, admin | the "Project Tagging" sheet (the X-mark grid becomes a tag list) | create tags (they must be in the dictionary first) |
| `profiles` | admin | name, tagline, price, GitLab account | change an existing profile, unless the import allows changes |

Order for a full set: rules, tag dictionary, projects, profiles.

**Not yet imported** (no place for them in the app yet, or waiting on a decision): the Job Log (past jobs), the per-person Proposals sheets (tracking),
Daily Update, Connects, Active Chats, Potential Clients, Marketing Qualified Leads, Keywords and the rest of "Upwork Details". The chat and lead sheets hold client names, emails and contact details.

## Saving work from the Claude plugin

Besides sheet imports, the same MCP lets the **Claude plugin** (stackup-proposals) save its own work into Upwork Pro. The app stores what the
plugin sends **as is**: it never screens the job again or rewrites the proposal, and every such job is marked "From the Claude plugin".

| Tool | What it does |
|---|---|
| `plugin_options` | The profiles, project names, rule codes, statuses, outcomes and loss reasons the app accepts. Call it first. |
| `find_jobs` | Look up saved jobs by Upwork link, job id, text or phase, so the same job is never saved twice. |
| `get_job` | One job: where it stands, its status history and its latest proposal text. |
| `save_job` | The job the plugin screened: page text, link, title, verdict, each fail and flag (code, rule, value), job and client facts, the posting fields, and the person's decision. Refused if that Upwork job is already saved (unless `force_new`). |
| `record_decision` | Continue (a FLAG or FAIL needs the person's reason) or skip. |
| `save_proposal` | The proposal text exactly as written, the profile and project names used, the template. A second save adds a version. `finished` (default true) means ready to send. |
| `get_library` | The project library and tag dictionary (projects with links, overview, case study, industries, tags; tags with weights). Read-only. |
| `get_writing_guide` | The writing guide: proposal types (when chosen, length), writing rules, banned phrases, modules, screening answers, checklist. Read-only. |
| `add_profile` | Adds an Upwork profile Upwork Pro is missing, or fills the empty fields of an existing one (never overwrites). Admins. |
| `add_project` | Adds a project to the library (links, overview, case study, tags), or fills empty fields and adds missing tags (never removes). Managers and admins. |
| `update_status` | What happened on Upwork, with its date and time (default now): Sent, Viewed, Chat opened, Interview, then an outcome (a lost outcome needs a loss reason). |

The same rules as the website apply, because the plugin calls the same API: Sent only once the proposal is finished, the other statuses
only once it is Sent, a reason for every lost outcome, every change kept in the status and change history. A token reaches only the
person's own jobs (managers and admins: all), and never users, settings or the website's own pages.

## Run it on your machine (test)

```
# 1. the Upwork Pro server must be running (backend: npm run dev), migrated to 014
cd mcp && npm install && npm run build

# 2. sign in to Upwork Pro, open "Connect Claude", make a token, copy it

# 3. Claude Code:
claude mcp add upwork-pro \
  -e UPWORK_PRO_URL=http://localhost:3000 \
  -e UPWORK_PRO_TOKEN=upw_... \
  -e IMPORT_DIR="/Applications/XAMPP/xamppfiles/htdocs/stackup_solutions_2/Upwork-Pro" \
  -- node "/Applications/XAMPP/xamppfiles/htdocs/stackup_solutions_2/Upwork-Pro/mcp/dist/src/index.js"
```

Claude Desktop: Settings, Developer, Edit config, and add what the Connect Claude page shows ("Copy Claude Desktop settings"), with the real paths.

`IMPORT_DIR` is optional. When it is set, Claude can read `.xlsx` files from that folder (nothing outside it) with `import_xlsx_file`, which also turns the Project Tagging grid into tag lists.
Without it, Claude sends rows it read itself (for example from Google Sheets) with `add_rows`, 50 at a time.

Then ask Claude, for example: *"Import the Rule Codes sheet from Upwork Jobs History.xlsx into Upwork Pro and show me what would change."*

## Tools

`list_import_types`, `start_import`, `add_rows`, `get_preview`, `commit_import`, `undo_import`, `discard_import`, `list_imports`,
`list_projects`, `list_tags`, `list_profiles`, and with `IMPORT_DIR`: `list_workbook_sheets`, `import_xlsx_file`.

## Safety, in short

- A token reaches only the import endpoints, the Claude plugin endpoints (`/plugin/...`: the person's own jobs, proposals and statuses) and read-only lookups: never users, settings or the website's own pages. It expires (default 90 days), can be revoked, and is stored only as a hash.
- `commit_import` needs the `preview_checksum` of the preview the person saw. Rows added after, or a changed preview, mean it must be looked at again.
- All rows are saved together or not at all. If someone else changed the data after the preview, the save stops and says which row.
- Rows are never fixed silently: invalid rows are listed with the reason and left out only if the person agrees (`skip_invalid`).
- Undo restores exactly what the import changed, and refuses (changing nothing) if something now depends on it.
- Everything is in the Logs (`import_commit`, `import_undo`, `token_create`, `token_revoke`).
- Previews not saved within 24 hours are deleted. At most 100 rows per API call, 5,000 per import, 10 open imports per person.

## Running it on a server: each person signs in (OAuth)

`npm run build && npm run start:http` serves the same tools at `http://127.0.0.1:3100/mcp`. It never reads files. Put it behind
HTTPS on the same domain as Upwork Pro (a reverse proxy: `/mcp` and `/.well-known/oauth-protected-resource` to port 3100, the rest to
the backend) and set:

| Where | Setting | Example |
| --- | --- | --- |
| MCP | `UPWORK_PRO_URL` (how the MCP reaches the backend) | `http://127.0.0.1:3000` |
| MCP | `UPWORK_PRO_PUBLIC_URL` (where people sign in) and `MCP_URL` (the connector link) | `https://pro.example.com`, `https://pro.example.com/mcp` |
| backend `.env` | `PUBLIC_URL` and `MCP_URL` (the same two) | as above |

**How a person connects** (Claude website, Desktop or Claude Code): add a custom connector with the link (Connect Claude shows it),
press Connect, sign in on the Upwork Pro page with their own email and password, and Allow. Claude gets a token for that person
(1 hour, renewed by a refresh token that lasts 60 days and is replaced at every use). Everything that Claude saves is recorded as
them, with their role's permissions. They see and disconnect their connections on Connect Claude.

How it works (MCP authorization spec): an unsigned request gets `401` with `WWW-Authenticate: Bearer resource_metadata=...`; Claude
reads the protected resource metadata (served here and by the backend), the authorization server metadata
(`/.well-known/oauth-authorization-server`), registers itself (`/oauth/register`), and runs the code flow with PKCE (`/oauth/authorize`,
`/oauth/token`). The backend's `src/oauth.ts` holds it all. The MCP checks every token with `GET /api/plugin/whoami` (cached a minute).
A personal token from Connect Claude still works as a Bearer token, for a local setup.

Checked locally with the MCP SDK's own OAuth client: discovery, registration, sign-in and Allow, tokens, tool calls as that person,
a code used twice refused, refresh, a reused refresh token cutting the connection off, Deny, a foreign return address and a missing
PKCE check refused. Not yet tried from claude.ai itself: that needs the server on a public https address.

## Tests

`npm test` runs 24 end-to-end checks through the MCP SDK's own client against a **scratch database** (never the real one): permissions per role,
token limits, the real workbooks, previews, blocks, bad rows, stale commits, undo order, file safety, and the remote mode.
It needs the backend running on a fresh migrated database (`API_URL`, default `http://localhost:3055`) and `IMPORT_DIR` pointing at the folder with the workbooks.
