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

- A token reaches only the import endpoints and read-only lookups: never jobs, proposals, users or settings. It expires (default 90 days), can be revoked, and is stored only as a hash.
- `commit_import` needs the `preview_checksum` of the preview the person saw. Rows added after, or a changed preview, mean it must be looked at again.
- All rows are saved together or not at all. If someone else changed the data after the preview, the save stops and says which row.
- Rows are never fixed silently: invalid rows are listed with the reason and left out only if the person agrees (`skip_invalid`).
- Undo restores exactly what the import changed, and refuses (changing nothing) if something now depends on it.
- Everything is in the Logs (`import_commit`, `import_undo`, `token_create`, `token_revoke`).
- Previews not saved within 24 hours are deleted. At most 100 rows per API call, 5,000 per import, 10 open imports per person.

## Running it on a server (real testing)

`npm run build && npm run start:http` serves the same tools at `http://127.0.0.1:3100/mcp` (stateless; each request carries the person's own token as `Authorization: Bearer upw_...`;
it never reads files). Put it behind HTTPS (a reverse proxy) next to the Upwork Pro server, and set `UPWORK_PRO_URL` to the server's address.

**Claude website (claude.ai):** by default custom connectors sign in with OAuth, which this does not have. Claude's connector docs also describe an "Advanced settings, Request headers" option in the
Add custom connector dialog that sends a fixed header on every request (see https://claude.com/docs/connectors/custom/add-unlisted). If your plan shows it, add the header
`Authorization: Bearer upw_...` with your own token from Connect Claude, and the HTTP mode above should work as is. **This is not tested yet** (it needs the server on a public HTTPS address): it is the
first thing to try in real testing. If the dialog has no such option, the fallback is a small OAuth sign-in in the app (the same email and password page, then a token); that is not built.

## Tests

`npm test` runs 24 end-to-end checks through the MCP SDK's own client against a **scratch database** (never the real one): permissions per role,
token limits, the real workbooks, previews, blocks, bad rows, stale commits, undo order, file safety, and the remote mode.
It needs the backend running on a fresh migrated database (`API_URL`, default `http://localhost:3055`) and `IMPORT_DIR` pointing at the folder with the workbooks.
