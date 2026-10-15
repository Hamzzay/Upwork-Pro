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
  '<table><tr><th>You are</th><th>You can</th></tr><tr><td>Employee</td><td>Screen jobs, write and send proposals, update their status, see your own jobs and reports, read the library and the writing guide, connect your own Claude.</td></tr><tr><td>Manager</td><td>All of that for everyone\'s jobs, plus add and edit projects, industries, proposal types, the writing guide and signals, and read the Flag review.</td></tr><tr><td>Admin</td><td>Everything: also the tag dictionary, Upwork profiles, Loom videos, rules, gate instructions, the reviewer, settings, users and logs. Only an admin can discard a job (and restore it); the main admin can also select many on the Jobs list and discard them at once.</td></tr></table>',
  shot('layout.jpg', 'How every page is laid out', 'Every page works the same way, so once you know one you know them all.', [
    '<b>The sidebar.</b> The daily work first: Dashboard, Screen a job, Jobs, Reports, Proposal feedback and Flag review. Then <b>Library</b>, <b>Writing</b>, <b>Screening</b> and <b>Admin</b>: click one to open its pages (the others close). Guide and Connect Claude are in the small row above your name. On a small screen, the button next to <b>Upwork Pro</b> shrinks the sidebar to icons (hover one for its name).',
    '<b>The title</b> of the page, with one line under it saying what the page is for.',
    '<b>The page\'s main button</b> is always at the top right.',
    '<b>You</b>, your role, and Sign out.']),
  shot('signin-show.jpg', 'Signing in', 'Every password box has a <b>Show</b> button, so you can check what you typed.', ['<b>Show</b> and <b>Hide</b>.']),
  shot('password-change.jpg', 'Change your own password', 'Press the key button next to your name, at the bottom of the sidebar. Everyone can do this.', [
    'Your current password.', 'The new one, at least 10 characters, typed twice.', 'Show what you typed.', '<b>Change password</b>. You stay signed in here; any other place you are signed in is signed out.']),
  shot('phone.jpg', 'On a phone', 'Everything works on a phone. The sidebar becomes a Menu button.', ['Press <b>Menu</b> to open the links.']),
  note('Three things are the same on every list: a <b>search box</b> and <b>filters</b> on top (they apply as you type, and <b>Clear filters</b> appears once something is filtered), a row opens when you click it, and a row\'s buttons are at its right end. Deleting is always inside the Edit window, never in the row.'),
]),
('daily', 'The daily job, without Claude', [
  '<p>One job, four steps: decide, projects, profile and proposal (choose its type, then review it). After it is sent, you keep its status up to date on the Overview tab. The job page shows the step you are on and the button for it is always at the top right of the tab row.</p>',
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
  shot('screen-4-flag.jpg', 'When the gate says Flag or Fail', 'You can still continue, but you must say why. The reason stays on the record, where managers can read it, and the reasons are counted in the Flag review.', [
    'The question: continue despite the flag or fail?',
    '<b>Quick reasons</b>. First the ones written for this job from its <b>Fit with Stackup Solutions</b> summary (what makes it worth it despite the flags), then the usual ones an admin sets in Settings. One click writes a reason into the box; click it again to take it out. Pick as many as fit.',
    'The reason. Add your own words around the quick reasons ("They asked for us by name.").',
    'Each rule that fired, with the value behind it (for example the client\'s real hire rate).'],
    'A PASS, or a FLAG with no more than two flags, is matched with projects by itself straight after the screening. More flags, or a FAIL, wait until someone continues, so nothing is spent on jobs we are likely to skip. The number is a setting.'),
  shot('job-skip.jpg', 'Skipping a job: say why', 'Press <b>Skip</b> and a small window asks for the reason. It takes two seconds and it is what lets us report on the jobs we pass on.', [
    'Pick the quick reason that fits.', 'Add a note if there is more to say.', '<b>Skip job</b>. The job moves to Not pursued, with your reason on it.']),
  shot('job-projects.jpg', '3. Pick the projects', 'The job is read for the work it needs, and the projects that prove that work are listed. A project is only recommended when it shows the same kind of work; among those, the same industry comes first.', [
    '<b>Skip tech stack tags</b>. Turn it on to match the projects again without the job\'s languages, frameworks and databases; everything else counts as usual. Use it when the stack does not matter to this client. It cannot change once a proposal is written.',
    'A recommended project, already ticked. Under its name: why it fits, whether it is the same industry, and the tags it shares with the job.',
    'The other matches. Click a card to tick or untick it. To swap, untick one first.',
    'What the job needs. Press <b>Confirm and continue</b> at the top right; the count there says how many you have picked out of how many you may.'],
    'The list is the same one the Screening tab shows under "Projects that fit", so the two never disagree.'),
  note('<b>Missing tags.</b> Each card names the job\'s tags the project does not have, with a compliance tag the job needs in amber. If the project really did that work, press <b>Add tags</b>, tick the tags and add them: they are saved to the project in the library (Admin, Changes can put it back) and the projects are matched again, keeping a choice you already confirmed. Once a proposal is written its projects stay; only the card is brought up to date. The box at the top lists any tag no project shown has.'),
  shot('job-projects-more.jpg', 'Not there? Show more', 'Scroll to the end of the list.', [
    '<b>Show 10 more projects</b> lists the next best matches.', 'Open this to see the tags the job was given, and so why these projects came up.']),
  shot('job-profile.jpg', '4. Pick the profile', 'Which Upwork profile sends this proposal. The proposal is written in that profile\'s voice, with its rate, links and rules.', [
    'Click the profile.', 'Press <b>Confirm and continue</b>.']),
  shot('job-type.jpg', 'Choose the type of proposal', 'Nothing is written until you choose. The types that suit this job come first, each with the reason it fits.', [
    'The suggested type: the best fit for what the job post says. It is already selected.',
    'The other types offered, with why each fits or does not. Click one to choose it instead. "Ruled out" means something in the post speaks against it; you can still pick it.',
    '<b>Show all types</b> lists every proposal type.',
    'Press <b>Write the proposal</b>. Only the type you chose is written.']),
  shot('job-loom.jpg', 'Send a Loom video with it?', 'On the same screen, under the types. When the job post asks for a video, the one that fits best is already selected.', [
    'Pick a video of the sending profile, or <b>No Loom video</b>. The link of the one you pick is written into the proposal, and it is recorded on the job for the reports.',
    'Then press <b>Write the proposal</b>.'],
    'If the client asks for a video and the profile has none, the screen says so: an admin adds videos under Loom videos.'),
  shot('job-writing.jpg', 'The proposal is written for you', 'Usually it is there within seconds: a first draft is written in the background as soon as the projects are matched, and only the parts you chose differently are redone. You can leave and come back.', ['It writes the type you chose, with your projects, profile and video.']),
  shot('job-proposal.jpg', '5. Review the proposal', 'Read it. It is your proposal: change anything.', [
    'The proposal: the cover letter only. Edit it like any document.',
    'Every save, chat change, update and restore is kept as a version. Pick an older one here to see it or bring it back.',
    '<b>Loom video</b>: pick another video, or none, at any time. Only the video line changes, at once; nothing is written again.',
    'Beside the proposal, one card with a tab for each tool. <b>Chat</b> with the AI to change it: "make it shorter", "add a question about their calendar". Each answer is saved as a new version. <b>Feedback</b> records what is wrong in it, to fix the setup later.',
    '<b>Review</b>: a second reader scores the proposal out of 10, and the score shows on the tab. See below. <b>Experience</b> appears when the client asks for something we have no record of: answer Yes or No there.',
    '<b>Copy cover letter</b> puts the letter on your clipboard. <b>Change type</b> writes it again as another proposal type. <b>Save and mark sent</b> when it is submitted on Upwork.'],
    'Above the text, a yellow line lists things to check before sending (for example a figure the writer could not find in our facts), and a blue button says how many questions about our experience are waiting. Under the text, <b>How this was written</b> opens the signals and the proposal type ranking.'),
  note('<b>Your account.</b> Click your name at the bottom of the sidebar to upload a picture, change your name or change your password.'),
  note('<b>Your own columns.</b> On the Jobs list, <b>Columns</b> shows the columns of that tab in order: drag one (or use the arrows) to move it, Hide it, or add a hidden one back. You can also drag a column header in the table onto another. They are kept for you alone.'),
  note('<b>Rows per page.</b> At the bottom of every list, pick 20, 50, 100 or 200. It is kept with your account, for every list.'),
  note('<b>Auto mode.</b> On Screen a job, <b>Auto: screen and write</b> does every step for you: the screening, the recommended projects, a profile, the proposal type and the writing. The Overview shows each step, then the proposal opens. A FAIL stops for you to decide, and so does a FLAG with more flags than the limit in Settings, or one of the rules that always stop auto mode. On the proposal you can still change the type, the opening, the Loom video and the profile.'),
  note('<b>Attached documents.</b> When the client attached files to the job on Upwork (a brief, a spec, a screenshot), download them and add them: on Screen a job with <b>Attach files</b>, or later on the Job post tab. The AI reads them with the job post in every step. <b>What the AI reads</b> shows what it got from each file; if it could not read a picture, <b>Describe it</b> yourself. Click a file to open it in the app; the arrows go to the next one.'),
  note('<b>Openings.</b> On top of the cover letter, a card holds the opening the proposal was written with (the default opening template of its type) and three other openings, from the templates sent most often. <b>Load 3 more</b> writes the next three, up to one per opening template that is on. Swipe through them (or use the arrows): the proposal below shows each one in place. When a template has examples, each opening shows how close it is to them, out of 10. <b>Use this opening</b> saves it as a new version; only the first paragraph changes. When the proposal is finished, the opening it goes out with scores a point for its template, and the best ranked are written first next time.'),
  note('<b>Compare versions.</b> With two or more versions, the button next to the version picker shows any two side by side as they read, and beside them the AI says which is stronger, what is better and weaker in each, and what is worth bringing over: <b>Copy</b> it, or <b>Send to the chat</b> to add it to the newest version.'),
  note('<b>Experience.</b> When the client asks for something we have no record of, the Experience tab asks <b>Have you done this?</b> With Yes, tick every project where it was done (none means your own experience) and say how it was used. Then <b>Update the proposal</b>.'),
  shot('job-answers.jpg', 'The screening answers, apart from the proposal', 'When the client asks questions in Upwork\'s own questions section, each is answered apart from the cover letter, on its own <b>Screening answers</b> tab next to the <b>Cover letter</b> tab. A dot on a tab means unsaved changes. Editing or removing text in the proposal never touches them.', [
    'The questions and how many.', 'The answer, in its own box. Edit it here; <b>Save version</b> saves the letter and the answers together.', '<b>Copy</b> each answer into its own box on Upwork.']),
  shot('job-parts.jpg', 'Changing the projects, the profile or the video after writing', 'A proposal is made of parts: the letter, one block per project, the video line and the sign off. Change the projects or the profile on their tabs, or the video here, and only that part is redone, as a new version: a new project takes a few seconds, a video or a profile no time at all. The letter stays as it was. To write the letter again in another profile\'s voice, use <b>Change type</b> or write it again.', [
    'Once you have edited the text yourself, your text is never overwritten.',
    'Instead, the new parts are offered here.',
    '<b>Put it in</b> adds it at the end of your text: move it where it belongs, then save.',
    '<b>Copy</b> it to paste it yourself.',
    '<b>Dismiss</b> when you do not want them.']),
  shot('job-review.jpg', 'The independent review', 'As soon as a proposal is written, a separate reader checks it against the job, the profile, the projects and our writing rules. It did not write the proposal, so it does not go easy on it. It is advice and never forces a change: you can always copy the proposal as it is. How it reviews is set by an admin on the Reviewer page.', [
    'The score out of 10, and which version it is for.',
    'The verdict in a few lines: send it or not, and why.',
    'A suggestion: what to change, in words the AI can act on. There are up to three.',
    '<b>Apply this</b> sends that suggestion to the chat. The AI revises the proposal and saves it as a new version.',
    '<b>Review again</b> scores the newest version. After a change, the panel tells you the review is of an older version.'],
    'Further down, <b>What hurts it</b> and <b>What works</b> open to show each point. A low score most often means the proposal claims something our project facts do not say: fix that first.'),
  shot('job-sent.jpg', 'Send it on Upwork, then mark it as sent', 'Copy the proposal, paste it into Upwork and submit it there. Then press <b>Save and mark sent</b>. One window records everything.', [
    'The status: Sent.', 'The Connects it cost, and any boost.', 'The Loom video you sent with it, if any. This is how we learn whether videos help.', '<b>Save</b>.'],
    'There is no Tracking tab any more. After this, the job\'s status lives on its Overview tab.'),
  shot('job-status-sent.jpg', 'Updating the status takes one click', 'Do this every time something happens on Upwork. It is what the reports are built from.', [
    'Pick what happened: Sent, Viewed, Chat opened, Interview, or how it ended. The next likely one is already chosen.',
    'It is set to now. Change it only if it happened earlier.', 'Save.']),
  shot('job-status-lost.jpg', 'When a proposal is lost, say why', 'Not hired, No response, Withdrawn and Job closed all need a reason, so we can learn from them.', [
    'The outcome.', 'The reason, from the list.', 'Anything the client said, in your own words.']),
  shot('job-details.jpg', 'Change what it cost', 'On the Overview tab, press <b>Edit details</b>.', [
    'The Connects the proposal cost.', 'Extra Connects if you boosted it.', 'The Loom video you sent with it, if any. This is how we learn whether videos help.', 'Notes.']),
  shot('job-overview.jpg', 'Overview: where the job stands', 'The first tab of every job. After a proposal is sent, this is where you follow it.', [
    'The title, the gate result and where the job stands.', 'Overview, the job post as fields, the four steps, and History.', 'What is next.',
    '<b>Update status</b> each time something happens on Upwork (viewed, chat, interview, the outcome). <b>Edit details</b> for Connects, boost, the Loom video and notes. Admins also see <b>Discard job</b>.',
    'Tracking: the status now, everything that happened with its date, and what it cost.']),
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
  shot('job-discard.jpg', 'Discard a job (admin only)', 'For test jobs and mistakes. On the job\'s Overview tab, press <b>Discard job</b>.', [
    'Say why, if you like.', '<b>Discard job</b>. It disappears from the Jobs list, the Dashboard, Reports, exports and Claude, for everyone.'],
    'Nothing is deleted. Employees and managers cannot discard or see discarded jobs.'),
  shot('jobs-discarded.jpg', 'Bring a discarded job back (admin only)', 'In the Jobs list, change the <b>Live jobs</b> filter to <b>Discarded jobs</b>.', [
    'The filter. Only admins have it.', '<b>Restore</b> puts the job back exactly as it was.']),
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
  shot('connect-plugin.jpg', 'Get the plugin', 'On the same page, under the connection. Everyone can download it.', [
    '<b>Download the plugin</b>. You get one file, named with its version.',
    'Add it in Claude: open Plugins, add a plugin from a file, choose the file, then restart Claude.'],
    'When this card shows a newer version than the one you installed, download it again and add it the same way.'),
  '<h3>What to say to Claude</h3><table><tr><th>You want to</th><th>Say</th><th>What happens</th></tr>'
  '<tr><td>Write a proposal</td><td><code>/proposal</code> and paste the job page text and link</td><td>Claude screens the job (on a flag or fail it offers reasons from its fit summary, then the same quick reasons as the app), then asks for the profile (no rate: you set that on Upwork), shows the projects Upwork Pro matched, asks for the proposal type and the Loom video in one question, writes the cover letter and the screening answers apart, and shows the independent review. Every step is saved in Upwork Pro as it happens, alongside the next step, so saving costs no time. Stop halfway and say "continue the dental clinic job" in a new chat: it carries on from where you stopped.</td></tr>'
  '<tr><td>Match without the stack</td><td>"Match again without the tech stack tags"</td><td>Upwork Pro matches the projects again without the job\'s languages, frameworks and databases, and Claude shows the new list.</td></tr>'
  '<tr><td>Improve a draft</td><td>"Apply suggestion 1", "Review it again"</td><td>After the review Claude just waits; it never pushes you to change anything. Name a suggestion and Claude revises the draft that way, saves it as a new version and gets a fresh score. You can approve the proposal as it is at any score.</td></tr>'
  '<tr><td>Check a job only</td><td>"Is this job worth applying to?" and paste it</td><td>Pass, Flag or Fail with the rules and reasons.</td></tr>'
  '<tr><td>Record what happened</td><td>"Mark the dental clinic job as sent", "The client viewed it", "We lost it, they hired someone else"</td><td>The status is saved in Upwork Pro with its time. A loss needs a reason; Claude asks if you did not give one.</td></tr>'
  '<tr><td>See what is waiting</td><td>"Which of my proposals are waiting on the client?"</td><td>The list from Upwork Pro.</td></tr>'
  '<tr><td>Review the flags</td><td>"Which flags could I relax?"</td><td>The Flag review as a table: for each rule, how often people continued past it, why, and how those jobs did against clean passes. Changing a rule is still an admin\'s call.</td></tr>'
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
    'The Android link (Google Play).', 'The iOS link (App Store). Mobile apps have one box per store, so the writer can show the right one.',
    'What we built. The writer describes the project from this, so write it plainly and truthfully.'],
    'The case study summary is where results and figures go. Only figures written there may appear in a proposal. The head and the buttons stay in view while you scroll.'),
  shot('project-add-tags.jpg', 'Industries and tags decide when a project is suggested', 'Scroll down in the same window.', [
    'The industries the project belongs to. Projects from the job\'s own industry are suggested first.', 'The tags. A job is matched to the projects that share its tags, so tag honestly: only what the project really did.', 'Save.'],
    'To stop using a project without losing it, untick <b>Active</b>. Delete is in this window too, for mistakes only.'),
  shot('project-detail.jpg', 'A project\'s page', '', ['Back to the list, with your filters as you left them.', 'The name and whether it is active.', '<b>Edit project</b>.']),
  shot('industries.jpg', 'Industries', '', ['Search and status.', '<b>Edit</b>.', '<b>Add industry</b>.']),
  shot('industry-edit.jpg', 'Edit an industry', '', ['The name.', 'Related industries, separated by commas. For a job in this industry, projects from these come right after projects from the same one.', 'The projects in it.']),
  shot('tags.jpg', 'Tag dictionary (admin)', 'The words jobs and projects are described with.', [
    '<b>How the scores work</b>: open it to read what a score does in matching, with an example.',
    'Tags and their categories.', 'The score: what a shared tag is worth when matching. Type a new number and it is saved. 0 means ignored.',
    'How many projects have the tag. A tag no project has does nothing for matching.',
    'Click <b>Active</b> to switch a tag off (or back on) straight from the list. It asks you to confirm first. Every list works this way.', '<b>Add tag</b>.']),
  shot('tag-edit.jpg', 'Edit a tag', '', ['The name.', 'The score, 0 to 10.', 'What it means. The AI reads this when it tags a job, so one clear sentence matters.',
    'The projects that have this tag. Search, and tick or untick them here, without opening each project.']),
  shot('profiles.jpg', 'Upwork profiles (admin)', 'The profiles we apply from.', ['Search, status, and "Needs filling in" to find profiles without a rate or headline.', '<b>Edit</b> and <b>Disable</b>.', '<b>Add profile</b>.']),
  shot('profile-edit.jpg', 'Edit a profile', 'Every field here is used by the writer. An empty field means the writer has nothing to say about it.', [
    'The name, exactly as on Upwork.', 'The default hourly rate, and the lowest rate.', 'What this profile sells. Used to suggest a profile for a job.', 'Delete is here, for mistakes only. Disable a profile instead if it has ever been used.'],
    'Further down: voice, signature, the Upwork stats allowed in proposals, profile rules, and certifications (used only when a client requires one).'),
  shot('looms.jpg', 'Loom videos (admin)', 'Short videos per profile. On a job\'s Profile step, each profile shows the video that fits the job best.', ['Search, profile, status and "Not tagged".', '<b>Add video</b> for that profile.', '<b>Add video</b>.']),
  shot('loom-add.jpg', 'Add a Loom video', '', ['A title that says what the video shows.', 'The Loom link.', 'The job tags it suits. A video with no tags is never suggested.'],
    'When you send a video with a proposal, record it on the job (the mark as sent window, or Overview, Edit details). That is what lets Reports compare proposals with a video against those without.'),
]),
('setup', 'How proposals are written (setup)', [
  shot('signals.jpg', 'Signals', 'What the AI looks for in a job post: who the client wants, how technical they are, whether they asked for a structure, and so on.', ['Search, layer, kind and status.', 'Click a signal to see its values.']),
  shot('signal.jpg', 'A signal', '', ['<b>Edit signal</b> (admin).', 'Each value: how to spot it in a post, and what the proposal should do when it applies.', '<b>Add value</b>.']),
  shot('writing.jpg', 'Writing guide', 'How every proposal is written, by Upwork Pro and by Claude alike. One copy, kept here.', [
    'Five tabs: <b>Openings</b> (the rules for every opening and up to 20 opening templates, each with up to five examples, a <b>Match the examples</b> box, and its rank: the finished proposals sent with it plus points added with <b>Change ranking</b>), <b>Proposal types</b> (search, and show only those without samples, signals or a default opening), <b>Shortcuts</b> (a main word and the short word every proposal uses instead, like WhatsApp and WA), <b>Rules for every proposal</b> and <b>Retired</b>.', 'A proposal type. Click it to edit (managers and admins).', 'The button follows the tab: <b>Add opening</b> and <b>Change ranking</b>, <b>Add proposal type</b>, or <b>Add shortcut</b>.']),
  shot('type.jpg', 'A proposal type', 'Four tabs: Details and format, Opening, Signals and Samples.', ['The name.', 'Priority. Tens set the group: 10 is tried first, then 20, 30, 40.', 'The format: the structure and rules the proposal must follow. Keep the "Chosen when" and "Length" lines. On the <b>Opening</b> tab, click the opening template this type is written with; the box under the cards shows what it tells the AI.', '<b>Save type</b> saves the details, the format and the opening.']),
  shot('type-signals.jpg', 'When a type is chosen, and its samples', 'The Signals and Samples tabs of the same page, each with its own save.', [
    'The signals this type suits. <b>Required</b>: it is only chosen when these match. <b>Rules it out</b>: a match excludes it. <b>Supporting</b>: each match adds a point.',
    'Sample proposals that worked. The writer uses up to three as a reference for tone and structure, never for facts.']),
  shot('writing-doc.jpg', 'The shared rules', 'Writing rules, banned phrases, modules, screening answers and the checklist apply to every type.', [
    'The text. Edit it here.', 'Every save is kept. Search the versions, and <b>Load</b> one to bring it back.', 'Turn a document off without deleting it.', '<b>Save</b>. It applies from the next proposal, everywhere.']),
  shot('rules.jpg', 'Rules (admin)', 'The fail and flag rules of the gate.', ['Search, fail or flag, status, and "Never fired".', '<b>Edit</b> rewords a rule. <b>Retire</b> stops it without deleting it.', 'Add a rule. It gets the next free code.'],
    'A code is never reused. If the meaning changes, retire the rule and add a new one, so old jobs keep their meaning.'),
  shot('rule-edit.jpg', 'Edit a rule', '', ['The rule.', 'How to apply it: the exceptions and how to measure it. The AI reads this with the rule.']),
  shot('reviewer.jpg', 'Reviewer: how proposals are reviewed', 'Open <b>Reviewer</b> under Proposal setup. Everyone can read it; an admin changes it. It controls the independent review of every proposal, in the app and in Claude.', [
    '<b>How to review</b>: who the reviewer is and who it reads for (the busy client).',
    '<b>Key concerns</b>: what matters most, one per line, most important first. Below them: Dos, Don\'ts and the score guide.',
    '<b>Load the built-in reviewer</b> puts the original back in the editor.',
    'The versions. Saving never overwrites: activate the version every review should use.']),
  shot('reviewer-try.jpg', 'Reviewer: limits, try it, save it', 'Further down the same page.', [
    '<b>How many</b> strengths, problems and suggestions it may give. Suggestions 0 turns them off.',
    '<b>What it reads</b> besides the job, the proposal and our facts: the signals, the writing rules, the banned phrases, the checklist, the automatic checks.',
    'Write what you changed and why, then <b>Save as new version</b>. It is not used until you activate it.',
    '<b>Try the draft</b> on a past proposal: its review with your changes, beside the review it has now. Nothing is saved. <b>See full prompt</b> shows exactly what the reviewer reads.'],
    'Score limits (for example "an invented fact cannot score above 6") and how to write the review are above these. The facts it reads and the shape of the review are fixed by the app, so the app and Claude can always show it.'),
  shot('gate.jpg', 'Gate instructions (admin)', 'How the gate reads and judges a job. The rules themselves come from the Rules page.', [
    'The instructions.', 'Say what you changed and why.', '<b>Save as new version</b>. Saving never overwrites.', 'The versions. <b>Activate</b> the one new screenings should use.'],
    'Further down you can paste a sample job and test your draft before you activate it.'),
  shot('settings.jpg', 'Settings (admin)', '', ['Which AI does the work. <b>Test connection</b> before <b>Use this AI</b>.', 'A number or list the app runs on.', 'Each has its own <b>Save</b>. A change applies to the next job.']),
  shot('settings-matching.jpg', 'Settings: the review and project matching', 'Further down the same page.', [
    '<b>Review every proposal by itself</b>: when off, the independent review runs only when someone asks for it.',
    '<b>Start matching by itself when a FLAG has at most this many flags</b>: a PASS, or a FLAG with no more flags than this, is matched and drafted straight after the screening. Use the Flag review to tune it.',
    '<b>AI orders the matched projects</b>: when on, the AI reads the best matches and puts them in order with a reason each. It saves when you flip it. Below: how many projects are shown, recommended and may be picked.']),
  shot('settings-writer.jpg', 'Settings: quick reasons and the video line', 'Still further down.', [
    '<b>Quick reasons to continue past a FLAG or FAIL</b>: the one click reasons on the decide step, in the app and in Claude.',
    '<b>Quick reasons to skip a job</b>.',
    '<b>The Loom video line</b>: the words put in a proposal with a chosen video. {url} is its link, {title} its title.']),
  shot('users.jpg', 'Users (admin)', '', ['Search, role and status.', 'The <b>main admin</b>: the first admin account. Only that person can change it; other admins cannot change its role, disable it or reset its password.', 'Change a role here.', 'Your own row: <b>Change password</b>. Other rows: <b>Reset password</b>, and <b>Disable</b> when someone leaves (their jobs stay).', '<b>Add user</b>.']),
  shot('user-add.jpg', 'Add a user', '', ['Their name and email.', 'A temporary password of at least 10 characters. Give it to them privately.', 'Their role.']),
]),
('claude-setup', 'Changing the setup from Claude (admins and managers)', [
  '<p>Admins can add and change the setup by talking to Claude instead of filling in the windows above: projects, industries, tags, Upwork profiles, Loom videos, rules, signals, proposal types and their samples, the writing guide, the gate instructions, the reviewer and settings. Managers can do from Claude what they can do in the app: projects, industries, proposal types, samples and the writing guide. Employees cannot change the setup.</p>',
  '<p>You need the plugin, version 0.11.0 or newer for the reviewer (Connect Claude, Download the plugin), and your Claude connected with your own sign-in.</p>',
  '<h3>Nothing raw goes in</h3><p>The setup is read by the AI on every job, so one careless project or tag hurts every proposal after it. Claude therefore always works in the same seven steps, and you should expect each of them:</p>'
  '<ol class="habits"><li><b>It looks at what exists</b>, so nothing is added twice. If the thing is already there, it offers to update it.</li>'
  '<li><b>It shows you two or three good examples</b> of the same kind from our own library, so you see the shape we keep them in.</li>'
  '<li><b>It asks for the information</b>, one topic at a time. Give it in any form: notes, a pasted document, a link.</li>'
  '<li><b>It tells you what is complete and what is missing.</b> It never fills a gap with a guess: no invented results, numbers, clients, rates or links. What you do not know stays empty.</li>'
  '<li><b>It verifies</b> what it can: that the tags, industries and names exist, that the name is free, that the links are the ones you gave.</li>'
  '<li><b>It rewrites everything in our standard format</b> and shows you the final version exactly as it will be saved, with a short list of what it changed from what you gave.</li>'
  '<li><b>It shows the change as before and after, says what it affects, and asks "Save this?"</b> Only your clear yes saves it.</li></ol>',
  '<h3>What to say to Claude</h3><table><tr><th>You want to</th><th>Say</th><th>What happens</th></tr>'
  '<tr><td>Add a project</td><td>"Add a project: Kruzee" and give what you have (what it is, the case study, links)</td><td>The seven steps. Claude writes the overview and the case study in the team format (Project, Problem, Solution, Key features, Technology, Results), suggests tags from the dictionary with a reason each, and saves after your yes.</td></tr>'
  '<tr><td>Change a project</td><td>"Update Breesy: the live link is now ..." or "Add the tag Twilio to Apex"</td><td>Claude shows the current value and the new one, then asks. Only what you changed is touched.</td></tr>'
  '<tr><td>Add or change a tag</td><td>"Add a tag for Lawmatics under CRM tools", "Raise the score of AI voice agent to 5"</td><td>Claude explains what the score does and how many projects have the tag before it asks.</td></tr>'
  '<tr><td>Add a profile, a Loom video, a rule</td><td>"Add a Loom video for Hamza\'s profile", "Add a flag rule for jobs that ask for free samples"</td><td>The same steps. A new rule gets the next free code; a code is never reused.</td></tr>'
  '<tr><td>Change the writing guide or a setting</td><td>"Add this phrase to the banned phrases", "Show 7 projects per job instead of 5"</td><td>Long texts are shown as the lines removed and added. The earlier text is kept as a version.</td></tr>'
  '<tr><td>Change the reviewer</td><td>"Add a don\'t for the reviewer: never praise the price", "Make the first two lines the reviewer\'s top concern"</td><td>Admins only. Claude shows the reviewer\'s current parts, changes only the ones you name, and saves a new version that is <b>not active</b>: try it on a past proposal on the Reviewer page, then say "activate reviewer version 2" and confirm again.</td></tr>'
  '<tr><td>Change the gate instructions</td><td>"Change the gate instructions so that ..."</td><td>Two separate steps, on purpose. First the new text is saved as a version that is <b>not active</b>: test it on a past job in the app (Gate instructions). Then say "activate version 5" and confirm again.</td></tr>'
  '<tr><td>Stop using something</td><td>"Switch off the project Tolba"</td><td>Nothing is ever deleted from Claude. The item is switched off and can be switched on again.</td></tr>'
  '<tr><td>See what changed</td><td>"What changed in the setup this week?", "What did Daniel change?", "What is waiting for review?"</td><td>The list of changes: who, when, from the app or from Claude, what, and the reason.</td></tr>'
  '<tr><td>Undo a change (main admin)</td><td>"Put back change 75"</td><td>The item returns to exactly how it was before that change. If it was changed again later, Claude says what else would be undone and asks a second time.</td></tr></table>',
  note('<b>Claude cannot</b> add or change users, reset passwords, change the AI provider or its keys, or delete anything. Do those in the app. Never paste a password or a key into the chat.', 'warn'),
  shot('changes.jpg', 'Changes: every change is kept, and can be put back', 'Open <b>Changes</b> in the sidebar (admins). Every change to the setup is here, whether it was made in the app or from Claude.', [
    'How many changes by other admins the main admin has not looked at yet. They are already applied.',
    'Search and filters: status, what was changed, who, the app or Claude, and dates.',
    'One change: when, who, what, and each field as before and after. A change from Claude also shows the reason given in the chat.',
    '<b>To review</b>: made by an admin other than the main admin. The main admin sees <b>Seen</b> and <b>Put back</b> on each row.'],
    'The main admin is the first admin account. A change by any other admin applies at once and waits here, marked To review, until the main admin marks it seen or puts it back. <b>Put back</b> returns the item to exactly how it was; that is itself kept as a change.'),
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
  shot('flag-review.jpg', 'Flag review: which rules to relax', 'Open <b>Flag review</b> (managers and admins). For every gate rule: what people did when it fired, and how those jobs went. After a couple of hundred jobs it shows which flags are too strict, without losing the ones that protect us.', [
    'How many jobs are screened, against the 200 the hints are built for, and the clean passes everything is compared with.',
    'Search, and filter by hint, by fail or flag, and by active or retired.',
    'How often people continued past the rule, and how many were skipped. Open <b>Reasons and details</b> for the quick reasons picked each way, and for jobs where it was the only rule that fired.',
    'How the continued proposals did once sent, against clean passes.',
    'The hint: <b>Candidate to relax</b> (usually continued, and those jobs do as well as passes), <b>Keep it</b> (continued, but those jobs rarely get a reply), <b>Doing its job</b> (mostly skipped), <b>Mixed</b>, or <b>Too few jobs yet</b>.'],
    'A hint is a starting point. Read the reasons and open the jobs before an admin rewords or retires a rule on the Rules page.'),
  shot('logs.jpg', 'Logs (admin)', '', ['<b>Activity</b>: who did what. <b>AI calls</b>: every call to the AI, how long it took and whether it failed.', 'Filters.']),
]),
('habits', 'Five habits that keep it working', [
  '<ol class="habits"><li><b>Paste the whole job page</b>, with the client section. The gate can only judge what it sees.</li><li><b>Update the status the same day</b>: Sent, Viewed, Chat opened, Interview, and the outcome with its reason.</li><li><b>Record Connects, boost and the Loom video</b> on every sent proposal.</li><li><b>Pick a quick reason, and add your own words</b>, when you continue past a flag or a fail. The Flag review counts them, so they decide which rules we relax.</li><li><b>Fix the library, not the proposal.</b> If the writer says something wrong about a project or a profile, correct it in the library so the next proposal is right too.</li></ol>',
  '<h3>When something goes wrong</h3><table><tr><th>You see</th><th>Do this</th></tr><tr><td>The screening did not finish</td><td>Open the job, Screening tab, press <b>Try again</b>.</td></tr><tr><td>A step is grey</td><td>Finish the step before it. The Overview tab says which.</td></tr><tr><td>You cannot continue or pick projects</td><td>Only the person who screened the job can. Ask them, or a manager.</td></tr><tr><td>The proposal signs off as the wrong profile</td><td>Pick the right profile on the Profile tab: the sign off is updated by itself. If you edited the text, the new sign off is offered above the editor.</td></tr><tr><td>"Mark as sent" is refused</td><td>Finish the proposal first (Proposal tab, <b>Finish proposal</b>).</td></tr><tr><td>Claude says the token was rejected</td><td>Connect Claude again, or make a new token.</td></tr></table>',
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
def render(sections, title, lead, foot, other):
    nav = ''.join(f'<a href="#{k}">{e(t)}</a>' for k, t, _ in sections)
    body = ''.join(f'<h2 id="{k}">{e(t)}</h2>' + ''.join(parts) for k, t, parts in sections)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title><style>{CSS}</style></head>
<body><div class="wrap"><nav><strong>Upwork Pro guide</strong>{nav}{other}<a id="toapp" href="/" hidden>Back to Upwork Pro</a></nav><main>
<h1>{e(title)}</h1>
<p class="lead">{lead}</p>
{body}
<p class="after" style="margin-top:48px">{foot}</p>
</main></div><script src="guide.js"></script></body></html>
"""

page = render(SECTIONS, 'Upwork Pro: the team guide',
  'How to do the daily work, with Claude and without it, how to add and manage everything proposals are built from, and how to read the numbers. Each picture has numbers on it; the list under the picture says what each one is. Click a picture to see it full size. Setting up a fresh copy? Read <a href="setup.html">Setting up from zero</a>.',
  'Pictures show Upwork Pro as of 9 to 14 October 2026. To update this guide, edit <code>guide/build.py</code> and run it.',
  '<a href="setup.html" style="margin-top:14px"><b>Setting up from zero</b></a>')
open(os.path.join(HERE, 'index.html'), 'w').write(page)

# the setup guide: a fresh, empty copy to working proposals (guide/setup_content.py)
import importlib.util
_spec = importlib.util.spec_from_file_location('setup_content', os.path.join(HERE, 'setup_content.py')); _sc = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_sc)
setup_page = render(_sc.sections(note), 'Upwork Pro: setting up from zero',
  'For a fresh, empty copy of Upwork Pro: what to put in, in which order, how much each thing matters and where it shows, until it writes proposals the way your company already does with GPT or Claude. The screens themselves are shown in <a href="index.html">the team guide</a>.',
  'Checked against the code on 14 October 2026. To update this guide, edit <code>guide/setup_content.py</code> and run <code>python3 guide/build.py</code>.',
  '<a href="index.html" style="margin-top:14px"><b>The team guide</b></a>')
open(os.path.join(HERE, 'setup.html'), 'w').write(setup_page)
print('built setup.html:', len(_sc.sections(note)), 'sections')
used = {p.split('"')[0] for p in page.split('src="img/')[1:]}
have = set(os.listdir(os.path.join(HERE, 'img')))
print('built index.html:', len(used), 'pictures;', 'missing:', sorted(used - have) or 'none', '; not used:', sorted(have - used) or 'none')
