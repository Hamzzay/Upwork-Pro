#!/usr/bin/env python3
"""Builds guide/index.html from the sections below. Edit the text here, run `python3 guide/build.py`, commit both.
A step is (image file, title, intro, [what each number on the picture is])."""
import html, os
HERE = os.path.dirname(os.path.abspath(__file__))
e = html.escape

def shot(img, title, intro, points, after=None):
    lis = ''.join(f'<li><span class="n">{i}</span><span>{p}</span></li>' for i, p in enumerate(points, 1))
    return (f'<div class="step"><h3>{e(title)}</h3>' + (f'<p>{intro}</p>' if intro else '') +
            f'<figure><a href="img/{img}" target="_blank"><img loading="lazy" src="img/{img}" alt="{e(title)}"></a></figure>' +
            (f'<ol class="marks">{lis}</ol>' if points else '') + (f'<p class="after">{after}</p>' if after else '') + '</div>')

def note(text, kind='tip'): return f'<div class="note {kind}">{text}</div>'

SECTIONS = [
('start', 'Start here', [
  '<p>Upwork Pro takes an Upwork job from the moment you find it to the day the client answers: it screens the job against our rules, picks the past projects that prove we can do it, writes the proposal in the right profile\'s voice, and then keeps track of what the client did. Everything it learns ends up in Reports, so we can see what works.</p>',
  '<table><tr><th>You are</th><th>You can</th></tr><tr><td>Employee</td><td>Screen jobs, write and send proposals, update their status, see your own jobs and reports, read the library and the writing guide, connect your own Claude.</td></tr><tr><td>Manager</td><td>All of that for everyone\'s jobs, plus add and edit projects, industries, proposal types, the writing guide and signals.</td></tr><tr><td>Admin</td><td>Everything: also the tag dictionary, Upwork profiles, Loom videos, rules, gate instructions, settings, users and logs.</td></tr></table>',
  shot('layout.jpg', 'How every page is laid out', 'Every page works the same way, so once you know one you know them all.', [
    '<b>The sidebar.</b> Work is what you do every day. Library is what proposals are built from. Proposal setup is how they are written. Admin is for admins.',
    '<b>The title</b> of the page, with one line under it saying what the page is for.',
    '<b>The page\'s main button</b> is always at the top right.',
    '<b>You</b>, your role, and Sign out.']),
  shot('phone.jpg', 'On a phone', 'Everything works on a phone. The sidebar becomes a Menu button.', ['Press <b>Menu</b> to open the links.']),
  note('Three things are the same on every list: a <b>search box</b> and <b>filters</b> on top (they apply as you type, and <b>Clear filters</b> appears once something is filtered), a row opens when you click it, and a row\'s buttons are at its right end. Deleting is always inside the Edit window, never in the row.'),
]),
('daily', 'The daily job, without Claude', [
  '<p>One job, five steps: decide, projects, profile, proposal (choose its type, then review it), and tracking. The job page shows the step you are on and the button for it is always at the top right of the tab row.</p>',
  shot('screen-1-paste.jpg', '1. Screen a job', 'Open <b>Screen a job</b> in the sidebar.', [
    'On Upwork, select the whole job page (Cmd + A, Cmd + C) and paste it here. Include the "About the client" part: the screening depends on it.',
    'Paste the job\'s link too. It is saved with the job and stops the same job being screened twice.',
    'Press <b>Screen this job</b> (or Cmd + Enter).']),
  shot('screen-2-waiting.jpg', 'It screens in about a minute', 'You can leave the page; the result is saved and the job is in your Jobs list.', ['The page updates by itself when the screening is done.']),
  shot('screen-3-decide.jpg', '2. Decide: continue or skip', 'The gate answers <b>Pass</b>, <b>Flag</b> (needs a human look) or <b>Fail</b> (breaks a rule). It advises; you decide.', [
    'The tabs of the job. A tick means the step is done. Steps you cannot reach yet are grey.',
    '<b>Skip</b> or <b>Continue</b>. Every button of the job page is here, at the right end of the tab row.',
    'The decision. On a Pass, just continue.',
    'The result and why.'],
    'Under it you find how well the job fits us and notes for the proposal.'),
  shot('screen-4-flag.jpg', 'When the gate says Flag or Fail', 'You can still continue, but you must write why. The reason stays on the record, where managers can read it.', [
    'The result.', 'The reason someone gave for continuing.', 'Each rule that fired, with the value behind it (for example the client\'s real hire rate).']),
  shot('job-projects.jpg', '3. Pick the projects', 'The job is tagged, and the projects that share the most with it are listed: same industry first.', [
    'The two recommended projects are already ticked.', 'Click a card to tick or untick it. To swap, untick one first.',
    'Press <b>Confirm and continue</b>.', 'How many you have picked, out of how many you may.']),
  shot('job-profile.jpg', '4. Pick the profile', 'Which Upwork profile sends this proposal. The proposal is written in that profile\'s voice, with its rate, links and rules.', [
    'Click the profile.', 'Press <b>Confirm and continue</b>.']),
  shot('job-type.jpg', 'Choose the type of proposal', 'Nothing is written until you choose. The types that suit this job come first, each with the reason it fits.', [
    'The suggested type: the best fit for what the job post says. It is already selected.',
    'The other types offered, with why each fits or does not. Click one to choose it instead. "Ruled out" means something in the post speaks against it; you can still pick it.',
    '<b>Show all types</b> lists every proposal type.',
    'Press <b>Write the proposal</b>. Only the type you chose is written.']),
  shot('job-writing.jpg', 'The proposal is written for you', 'This takes a few minutes. You can leave and come back.', ['It writes the type you chose, with your projects and profile.']),
  shot('job-proposal.jpg', '5. Review the proposal', 'Read it. It is your proposal: change anything.', [
    'The proposal. Edit it like any document.',
    'Every save, chat change and restore is kept as a version. Pick an older one here to see it or bring it back.',
    '<b>Chat with the AI</b> to change it: "make it shorter", "add a question about their calendar". Each answer is saved as a new version.',
    '<b>Copy</b> puts the text on your clipboard, ready to paste into Upwork. <b>Finish proposal</b> when you are happy with it.',
    'Open this to see the signals it read and how every type ranked. You can write it again with another type.'],
    'Above the text, a yellow line lists things to check before sending (for example a figure the writer could not find in our facts).'),
  shot('job-tracking.jpg', 'Send it on Upwork, then mark it as sent', 'Paste the proposal into Upwork and submit it there. Then come back to the <b>Tracking</b> tab.', [
    '<b>Mark as sent</b> (later this button says <b>Update status</b>). <b>Edit details</b> is for Connects, boost, the Loom video and notes.',
    'Where the proposal stands now.', 'Everything that happened, with its date.', 'Connects, boost, the Loom video and your notes.']),
  shot('job-status-sent.jpg', 'Updating the status takes one click', 'Do this every time something happens on Upwork. It is what the reports are built from.', [
    'Pick what happened: Sent, Viewed, Chat opened, Interview, or how it ended. The next likely one is already chosen.',
    'It is set to now. Change it only if it happened earlier.', 'Save.']),
  shot('job-status-lost.jpg', 'When a proposal is lost, say why', 'Not hired, No response, Withdrawn and Job closed all need a reason, so we can learn from them.', [
    'The outcome.', 'The reason, from the list.', 'Anything the client said, in your own words.']),
  shot('job-details.jpg', 'Record what it cost', 'On the Tracking tab, press <b>Edit details</b>.', [
    'The Connects the proposal cost.', 'Extra Connects if you boosted it.', 'The Loom video you sent with it, if any. This is how we learn whether videos help.', 'Notes.']),
  shot('job-overview.jpg', 'The rest of the job page', '', [
    'The title, the gate result and the step.', 'Overview, the job post as fields, the five steps, and History.', 'What is next.', 'The button for it.']),
  shot('job-post.jpg', 'Job post: the posting as fields', 'The whole post, read into fields at the same time as the screening: terms, skills, description, screening questions, the client and their history.', ['The full pasted text is one click away at the bottom.']),
  shot('job-history.jpg', 'History: every step and who did it', 'When something looks wrong, look here first.', ['Each step with how long after the paste it happened, who did it, and each AI call.']),
]),
('jobs', 'Finding and following your jobs', [
  shot('jobs-list.jpg', 'The Jobs list', 'Every job, from screening to outcome.', [
    '<b>In progress</b>: we are preparing the proposal. <b>Submitted</b>: sent, waiting on the client. <b>Closed</b>: hired or lost. <b>Not pursued</b>: skipped or failed.',
    'Click a tile to see only Pass, Flag or Fail.', 'Search and filters. They apply at once.',
    'Click a row to open the job. Click "Where it stands" or the result for a quick look without leaving the list.',
    'The one thing to do next for that job.', 'Screen a new job.']),
  shot('jobs-filter.jpg', 'Filters', 'A filter you have set is outlined, with its own × to remove it.', ['A chosen filter.', '<b>Clear filters</b> removes them all. It only shows while something is filtered.'],
    'Your filters are kept in the link. Press Back from a job and you return to the same view. You can also bookmark or share a filtered list.'),
  shot('jobs-submitted.jpg', 'Following up: the Submitted tab', 'Open this tab every day.', [
    'Submitted.', 'How far each proposal got: Sent, Viewed, Chat, Interview.', '<b>Gone quiet</b>: sent and nothing recorded for 5 days. Click it to see them.', 'Update the status in one click.']),
  shot('jobs-journey.jpg', 'A quick look at a job', 'Click "Where it stands" on any row.', ['The job\'s journey so far, without opening it.']),
  shot('jobs-columns.jpg', 'Choose your columns', 'Press <b>Columns</b>. Your choice is remembered for each tab, on this computer.', ['Tick what you want to see.']),
  shot('jobs-export.jpg', 'Export', 'Press <b>Export</b> to get exactly the jobs on screen (with your filters) as Excel or CSV, with every detail: the post, the result, the proposal text, every status and date.', ['Excel or CSV. Up to 5,000 jobs.']),
]),
('claude', 'Working with Claude', [
  '<p>You can do the same work inside Claude with the <b>Stackup proposals plugin</b>: Claude screens the job, matches projects and writes the proposal, and saves everything into Upwork Pro under your name. The library, rules and writing guide it uses are the ones in Upwork Pro, so both ways give the same result.</p>',
  shot('connect.jpg', 'Connect your Claude (once)', 'Open <b>Connect Claude</b>.', [
    'The connector link and the steps. In Claude: Settings, Connectors, Add custom connector, name it Upwork Pro, paste the link, press Connect, then sign in with your own Upwork Pro email and password and press Allow.',
    'Copy the link.'],
    'Everything your Claude saves is recorded as you. Never share your sign-in or a token.'),
  shot('connect-token.jpg', 'Or use a token (when Upwork Pro runs on your own computer)', '', [
    'Name the token and press <b>Make a token</b>. Copy it at once: it is shown one time only.', 'Paste the settings it gives you into Claude Desktop.', 'Your tokens. Revoke one the moment you think someone else has it.']),
  '<h3>Install the plugin</h3><ol><li>Get the file <code>stackup-proposals-0.4.0.plugin</code> from your admin.</li><li>In Claude, open Plugins and add the file.</li><li>Restart Claude.</li></ol>',
  '<h3>What to say to Claude</h3><table><tr><th>You want to</th><th>Say</th><th>What happens</th></tr>'
  '<tr><td>Write a proposal</td><td><code>/proposal</code> and paste the job page text and link</td><td>Claude screens the job, asks you to decide on a flag or fail, shows the projects and the profile it suggests, writes the proposal, and saves the job and the proposal in Upwork Pro.</td></tr>'
  '<tr><td>Check a job only</td><td>"Is this job worth applying to?" and paste it</td><td>Pass, Flag or Fail with the rules and reasons.</td></tr>'
  '<tr><td>Record what happened</td><td>"Mark the dental clinic job as sent", "The client viewed it", "We lost it, they hired someone else"</td><td>The status is saved in Upwork Pro with its time. A loss needs a reason; Claude asks if you did not give one.</td></tr>'
  '<tr><td>See what is waiting</td><td>"Which of my proposals are waiting on the client?"</td><td>The list from Upwork Pro.</td></tr>'
  '<tr><td>Find trends</td><td>"Which profile had the best view rate last month?", "Pull every job sent in September and compare the proposals that got a chat with those that did not"</td><td>Claude reads the numbers, or the jobs themselves, from Upwork Pro and tells you what it found, with the sample size.</td></tr>'
  '<tr><td>Bring in a sheet</td><td>"Import the Project Tagging sheet"</td><td>Claude shows what would be added or changed. Nothing is saved until you say yes, and an import can be undone as a whole.</td></tr></table>',
  note('Jobs written in Claude show a <b>Claude plugin</b> label in the Jobs list. After that they are ordinary jobs: update their status in Claude or on the website, whichever is nearer.'),
  note('Claude never invents a reason, a project or a profile. If it asks you for one, give it in your own words.', 'warn'),
]),
('library', 'Adding and managing the library', [
  '<p>The library is what proposals are built from. Keep it true: the writer only says what the library says.</p>',
  shot('projects.jpg', 'Projects', 'Our delivered work. Managers and admins can add and edit.', [
    'Search, and filter by industry, tag, content (for example "No case study") or status.', 'Click a row to see the whole project.', '<b>Edit</b>.', '<b>Add project</b>.']),
  shot('project-add.jpg', 'Add or edit a project', '', [
    'The name, as we call it.', 'The link a proposal shows: usually the landing page, or the store or live system link.',
    'What we built. The writer describes the project from this, so write it plainly and truthfully.', '<b>Add project</b>. The head and the buttons stay in view while you scroll.'],
    'The case study summary is where results and figures go. Only figures written there may appear in a proposal.'),
  shot('project-add-tags.jpg', 'Industries and tags decide when a project is suggested', 'Scroll down in the same window.', [
    'The industries the project belongs to. Projects from the job\'s own industry are suggested first.', 'The tags. A job is matched to the projects that share its tags, so tag honestly: only what the project really did.', 'Save.'],
    'To stop using a project without losing it, untick <b>Active</b>. Delete is in this window too, for mistakes only.'),
  shot('project-detail.jpg', 'A project\'s page', '', ['Back to the list, with your filters as you left them.', 'The name and whether it is active.', '<b>Edit project</b>.']),
  shot('industries.jpg', 'Industries', '', ['Search and status.', '<b>Edit</b>.', '<b>Add industry</b>.']),
  shot('industry-edit.jpg', 'Edit an industry', '', ['The name.', 'Related industries, separated by commas. For a job in this industry, projects from these come right after projects from the same one.', 'The projects in it.']),
  shot('tags.jpg', 'Tag dictionary (admin)', 'The words jobs and projects are described with.', [
    'Tags and their categories.', 'Search, category and status.', 'The score: what a shared tag is worth when matching. Type a new number and it is saved. 0 means ignored.', '<b>Edit</b>, and <b>Disable</b> to stop using a tag without deleting it.', '<b>Add tag</b>.']),
  shot('tag-edit.jpg', 'Edit a tag', '', ['The name.', 'The score, 0 to 10.', 'What it means. The AI reads this when it tags a job, so one clear sentence matters.']),
  shot('profiles.jpg', 'Upwork profiles (admin)', 'The profiles we apply from.', ['Search, status, and "Needs filling in" to find profiles without a rate or headline.', '<b>Edit</b> and <b>Disable</b>.', '<b>Add profile</b>.']),
  shot('profile-edit.jpg', 'Edit a profile', 'Every field here is used by the writer. An empty field means the writer has nothing to say about it.', [
    'The name, exactly as on Upwork.', 'The default hourly rate, and the lowest rate.', 'What this profile sells. Used to suggest a profile for a job.', 'Delete is here, for mistakes only. Disable a profile instead if it has ever been used.'],
    'Further down: voice, signature, the Upwork stats allowed in proposals, profile rules, and certifications (used only when a client requires one).'),
  shot('looms.jpg', 'Loom videos (admin)', 'Short videos per profile. On a job\'s Profile step, each profile shows the video that fits the job best.', ['Search, profile, status and "Not tagged".', '<b>Add video</b> for that profile.', '<b>Add video</b>.']),
  shot('loom-add.jpg', 'Add a Loom video', '', ['A title that says what the video shows.', 'The Loom link.', 'The job tags it suits. A video with no tags is never suggested.'],
    'When you send a video with a proposal, record it on the job (Tracking, Edit details). That is what lets Reports compare proposals with a video against those without.'),
]),
('setup', 'How proposals are written (setup)', [
  shot('signals.jpg', 'Signals', 'What the AI looks for in a job post: who the client wants, how technical they are, whether they asked for a structure, and so on.', ['Search, layer, kind and status.', 'Click a signal to see its values.']),
  shot('signal.jpg', 'A signal', '', ['<b>Edit signal</b> (admin).', 'Each value: how to spot it in a post, and what the proposal should do when it applies.', '<b>Add value</b>.']),
  shot('writing.jpg', 'Writing guide', 'How every proposal is written, by Upwork Pro and by Claude alike. One copy, kept here.', [
    'Search, and show only proposal types, the shared rules, or what needs setting up (types without samples).', 'A proposal type. Click it to edit (managers and admins).', '<b>Add proposal type</b>.']),
  shot('type.jpg', 'A proposal type', '', ['The name.', 'Priority. Tens set the group: 10 is tried first, then 20, 30, 40.', 'The format: the structure and rules the proposal must follow. Keep the "Chosen when" and "Length" lines.', '<b>Save type</b>.']),
  shot('type-signals.jpg', 'When a type is chosen, and its samples', 'Further down the same page.', [
    'The signals this type suits. <b>Required</b>: it is only chosen when these match. <b>Rules it out</b>: a match excludes it. <b>Supporting</b>: each match adds a point.',
    'Sample proposals that worked. The writer uses up to three as a reference for tone and structure, never for facts.']),
  shot('writing-doc.jpg', 'The shared rules', 'Writing rules, banned phrases, modules, screening answers and the checklist apply to every type.', [
    'The text. Edit it here.', 'Every save is kept. Search the versions, and <b>Load</b> one to bring it back.', 'Turn a document off without deleting it.', '<b>Save</b>. It applies from the next proposal, everywhere.']),
  shot('rules.jpg', 'Rules (admin)', 'The fail and flag rules of the gate.', ['Search, fail or flag, status, and "Never fired".', '<b>Edit</b> rewords a rule. <b>Retire</b> stops it without deleting it.', 'Add a rule. It gets the next free code.'],
    'A code is never reused. If the meaning changes, retire the rule and add a new one, so old jobs keep their meaning.'),
  shot('rule-edit.jpg', 'Edit a rule', '', ['The rule.', 'How to apply it: the exceptions and how to measure it. The AI reads this with the rule.']),
  shot('gate.jpg', 'Gate instructions (admin)', 'How the gate reads and judges a job. The rules themselves come from the Rules page.', [
    'The instructions.', 'Say what you changed and why.', '<b>Save as new version</b>. Saving never overwrites.', 'The versions. <b>Activate</b> the one new screenings should use.'],
    'Further down you can paste a sample job and test your draft before you activate it.'),
  shot('settings.jpg', 'Settings (admin)', '', ['Which AI does the work. <b>Test connection</b> before <b>Use this AI</b>.', 'A number or list the app runs on.', 'Each has its own <b>Save</b>. A change applies to the next job.']),
  shot('users.jpg', 'Users (admin)', '', ['Search, role and status.', 'Change a role here.', '<b>Reset password</b>, and <b>Disable</b> when someone leaves (their jobs stay).', '<b>Add user</b>.']),
  shot('user-add.jpg', 'Add a user', '', ['Their name and email.', 'A temporary password of at least 10 characters. Give it to them privately.', 'Their role.']),
]),
('numbers', 'Reading the numbers', [
  shot('dashboard.jpg', 'Dashboard', 'How the team is doing right now.', [
    'The period, and filters for a profile or a person.', 'The headline numbers. Click any of them to open those jobs.', 'The funnel, from screened to hired.', 'How fast we get from paste to proposal.', 'Screen a job.']),
  shot('reports-top.jpg', 'Reports', 'What is working and what is not.', [
    'The period, whether dates mean screened or sent, and filters.', 'The rates, of sent proposals: viewed, chat opened, interview, hired, and what a hire costs in Connects.',
    'The funnel. Each step shows its share of the step before.', '<b>What is working</b>: the best group in each report, against the others. It only speaks when there are enough sent proposals to mean something.', '<b>Export</b> every report as one file.']),
  shot('reports-breakdown.jpg', 'Break it down', 'The same jobs, cut 27 ways: by profile, person, proposal type, project, industry, tag, signal, rule, Loom video, day sent, client country and more.', [
    'Choose the report, and "At least 5 sent" to hide groups too small to trust.', 'Click a column title to sort by it.', 'Click a row to open the jobs behind it.', 'Every report as a small card. Click one to open it in full.'],
    'A rate is only as good as what was recorded. If statuses are not updated, the reports are wrong. A group with three sent proposals proves nothing: look for groups with ten or more.'),
  shot('logs.jpg', 'Logs (admin)', '', ['<b>Activity</b>: who did what. <b>AI calls</b>: every call to the AI, how long it took and whether it failed.', 'Filters.']),
]),
('habits', 'Five habits that keep it working', [
  '<ol class="habits"><li><b>Paste the whole job page</b>, with the client section. The gate can only judge what it sees.</li><li><b>Update the status the same day</b>: Sent, Viewed, Chat opened, Interview, and the outcome with its reason.</li><li><b>Record Connects, boost and the Loom video</b> on every sent proposal.</li><li><b>Write a real reason</b> when you continue past a flag or a fail. Someone will read it.</li><li><b>Fix the library, not the proposal.</b> If the writer says something wrong about a project or a profile, correct it in the library so the next proposal is right too.</li></ol>',
  '<h3>When something goes wrong</h3><table><tr><th>You see</th><th>Do this</th></tr><tr><td>The screening did not finish</td><td>Open the job, Screening tab, press <b>Try again</b>.</td></tr><tr><td>A step is grey</td><td>Finish the step before it. The Overview tab says which.</td></tr><tr><td>You cannot continue or pick projects</td><td>Only the person who screened the job can. Ask them, or a manager.</td></tr><tr><td>The proposal names the wrong profile at the end</td><td>The profile was changed after it was written. Press <b>Write it again</b>.</td></tr><tr><td>"Mark as sent" is refused</td><td>Finish the proposal first (Proposal tab, <b>Finish proposal</b>).</td></tr><tr><td>Claude says the token was rejected</td><td>Connect Claude again, or make a new token.</td></tr></table>',
]),
]

CSS = """
:root{--bg:#f5f6f8;--surface:#fff;--text:#141821;--muted:#5d6676;--line:#e6e8ee;--brand:#3b4fd8;--soft:#eceffd;--mark:#e11d48;--warn:#fff4de;--warnline:#f2d79c}
@media (prefers-color-scheme:dark){:root{--bg:#0f1218;--surface:#171b23;--text:#e9ecf2;--muted:#a0a8b6;--line:#272d39;--brand:#7c8cff;--soft:#1f2540;--warn:#2d2310;--warnline:#54411a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif}
.wrap{display:grid;grid-template-columns:250px minmax(0,1fr);max-width:1280px;margin:0 auto}
nav{position:sticky;top:0;height:100vh;overflow:auto;padding:24px 16px;border-right:1px solid var(--line)}
nav strong{display:block;font-size:16px;margin-bottom:12px}nav a{display:block;padding:6px 10px;border-radius:8px;color:var(--muted);text-decoration:none;font-size:14px}nav a:hover{background:var(--soft);color:var(--brand)}
main{padding:32px clamp(16px,4vw,48px) 80px;min-width:0}
h1{font-size:28px;font-weight:600;margin:0 0 6px}h2{font-size:22px;font-weight:600;margin:56px 0 8px;padding-top:16px;border-top:1px solid var(--line)}h3{font-size:16px;font-weight:600;margin:0 0 6px}
p{margin:0 0 12px}.lead{color:var(--muted);max-width:70ch}
.step{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:20px;margin:16px 0}
.step>h3+ol,.step>h3+table{margin-top:8px}
figure{margin:12px 0}figure img{display:block;width:100%;height:auto;border:1px solid var(--line);border-radius:10px}
ol.marks{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:8px}ol.marks li{display:grid;grid-template-columns:26px 1fr;gap:10px;align-items:start}
.n{width:24px;height:24px;border-radius:50%;background:var(--mark);color:#fff;font-weight:700;font-size:13px;display:grid;place-items:center;margin-top:1px}
.after{color:var(--muted);margin:12px 0 0;font-size:14px}
.note{border:1px solid var(--line);background:var(--soft);border-radius:10px;padding:12px 16px;margin:16px 0;font-size:14px}.note.warn{background:var(--warn);border-color:var(--warnline)}
table{width:100%;border-collapse:collapse;margin:12px 0;background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden;font-size:14px}
th,td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;color:var(--muted)}tr:last-child td{border-bottom:0}
code{font:13px ui-monospace,Menlo,monospace;background:var(--soft);padding:1px 6px;border-radius:5px}
ol.habits{padding-left:20px;display:grid;gap:8px}
@media (max-width:860px){.wrap{grid-template-columns:1fr}nav{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}}
@media print{nav{display:none}.wrap{display:block}.step{break-inside:avoid}}
"""
nav = ''.join(f'<a href="#{k}">{e(t)}</a>' for k, t, _ in SECTIONS)
body = ''.join(f'<h2 id="{k}">{e(t)}</h2>' + ''.join(parts) for k, t, parts in SECTIONS)
page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Upwork Pro: the team guide</title><style>{CSS}</style></head>
<body><div class="wrap"><nav><strong>Upwork Pro guide</strong>{nav}<a id="toapp" href="/" hidden>Back to Upwork Pro</a></nav><main>
<h1>Upwork Pro: the team guide</h1>
<p class="lead">How to do the daily work, with Claude and without it, how to add and manage everything proposals are built from, and how to read the numbers. Each picture has numbers on it; the list under the picture says what each one is. Click a picture to see it full size.</p>
{body}
<p class="after" style="margin-top:48px">Pictures show Upwork Pro as of 9 October 2026. To update this guide, edit <code>guide/build.py</code> and run it.</p>
</main></div><script src="guide.js"></script></body></html>
"""
open(os.path.join(HERE, 'index.html'), 'w').write(page)
used = {p.split('"')[0] for p in page.split('src="img/')[1:]}
have = set(os.listdir(os.path.join(HERE, 'img')))
print('built index.html:', len(used), 'pictures;', 'missing:', sorted(used - have) or 'none', '; not used:', sorted(have - used) or 'none')
