"""The setup guide (guide/setup.html): taking a fresh, empty copy of Upwork Pro to the point where it writes proposals the way a
company already does with GPT or Claude. Built by build.py. Every statement here was checked against the code (14 October 2026);
when the code changes what a field does, change it here too."""


def table(head, rows):
    th = ''.join(f'<th>{h}</th>' for h in head)
    tr = ''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>' for r in rows)
    return f'<table><tr>{th}</tr>{tr}</table>'


HIGH, MID, LOW = '<b>High</b>', 'Medium', 'Low'


def sections(note):
    return [
('what', 'How the pieces fit together', [
  '<p>Upwork Pro takes an Upwork job from the moment someone pastes it to the day the client answers. Every step is done by an AI, but every step reads something <b>you</b> set up. A fresh copy knows nothing about your company: what you deliver, what you refuse, how you write, which of your past projects prove what. This guide walks you through putting that in, in the order the pieces depend on each other, and says for each one how much it matters and where it shows.</p>',
  '<p>If you already write proposals with GPT or Claude, you already have most of this: an SOP that says which jobs to take, a list of your projects, profiles with their voice and rates, and proposal formats that work. Upwork Pro needs the same things, split into the places below. The section <a href="#migrate">Coming from GPT or Claude</a> maps what you have to where it goes.</p>',
  '<h3>What happens to one job, and what each step reads</h3>',
  table(['Step', 'What the AI does', 'What it reads from your setup'], [
    ['1. The gate', 'Says Pass, Flag or Fail, and why.', 'Gate instructions, the Rules, the project names'],
    ['2. Tagging', 'Gives the job tags from your dictionary, names its core work (one to three tags) and its one industry.', 'The tag dictionary: each tag\'s <b>description</b>'],
    ['3. Matching', 'Scores your projects against the job\'s tags, filters by platform, orders by core work and industry, then the AI puts the shortlist in order with a reason each.', 'Projects (tags, industries, links, overview, case study), Industries, tag scores, matching settings'],
    ['4. Signals', 'Reads 22 things about the post: who they want, whether they demand a structure, an invite, the platform, hidden asks and more.', 'Signals and their values (how to detect each, what to do)'],
    ['5. Proposal type', 'Picks the best fitting type for those signals.', 'Proposal types and their selection rules'],
    ['6. Writing', 'Writes the letter and one block per project; the app adds the video line and the sign off.', 'The type, the samples, the writing guide, the profile, the chosen projects, the Loom video'],
    ['7. Checks', 'Flags invented figures, wrong links, banned phrases, length, the first two lines.', 'Banned phrases, the type\'s length and opening rules, your facts'],
    ['8. Review', 'A second reader scores the proposal out of 10 and suggests changes.', 'The Reviewer page'],
  ]),
  '<h3>What matters most</h3><p>Everything below can be improved later, but some things make or break the first proposal. Spend your time in this order.</p>',
  table(['Matters', 'What', 'Why'], [
    [HIGH, 'Projects with good overviews and case studies, and the right tags', 'They are the proof in every proposal. The writer may only say what they say: a thin project gives a thin proposal, and a missing tag means the project is never found.'],
    [HIGH, 'Tag descriptions', 'They are the only thing the tagger reads to decide what a job is. A vague description means wrong tags, and wrong tags mean the wrong projects.'],
    [HIGH, 'Upwork profiles: voice, rules, allowed stats, the code link', 'They decide how the proposal sounds and what it may claim.'],
    [HIGH, 'Gate instructions and rules', 'They decide which jobs you even look at. Too strict and you miss work; too loose and you waste Connects.'],
    [MID, 'Proposal types and their samples', 'The starter kit gives you eight good types. Adapting them, and adding two or three of your real sent proposals to each, is what makes them sound like you.'],
    [MID, 'Writing guide: rules and banned phrases', 'House style and the phrases that give AI writing away.'],
    [MID, 'Industries and related industries', 'They order the projects that already prove the work. They never make a weak project strong.'],
    [LOW, 'Tag scores', 'They only break ties after core work and industry. The starter pattern is fine for months.'],
    [LOW, 'Signals', 'The starter set is company neutral. Change the "what to do" of a value when your writing differs.'],
    [LOW, 'Loom videos, the reviewer, most settings', 'Good defaults. Tune them once proposals are flowing.'],
  ]),
]),
('install', '1. Install it and sign in', [
  '<p>The full server steps are in <code>SERVER-SETUP.md</code> and the short version in <code>README.md</code>, "Run it". In outline:</p>',
  '<ol class="habits">'
  '<li><b>A database.</b> MySQL or MariaDB. Edit <code>backend/sql/setup.sql</code> (put one password in both places) and run it as the database root: it makes the database and its user.</li>'
  '<li><b>The settings file.</b> In <code>backend</code>: copy <code>.env.example</code> to <code>.env</code> and fill in the database password, <code>SEED_ADMIN_EMAIL</code> and <code>SEED_ADMIN_PASSWORD</code> (10 characters or more: the first admin), <code>LLM_PROVIDER=claude-cli</code> for real AI (the default <code>mock</code> gives canned answers), and the key of the AI you will use: <code>ANTHROPIC_API_KEY</code> (or <code>LLM_OAUTH_TOKEN</code>) for Claude, <code>OPENAI_API_KEY</code> for GPT, <code>LLM_API_KEY</code> and <code>LLM_BASE_URL</code> for GLM. Keep <code>LLM_TIMEOUT_MS</code> at 300000 or more. Keys stay in this file only.</li>'
  '<li><b>The tables and the first admin.</b> <code>npm install</code>, <code>npm run migrate</code> (it ends "schema up to date"), <code>npm run seed</code> (the first admin, and a first version of the gate instructions to rewrite later).</li>'
  '<li><b>The starter kit.</b> <code>npm run seed:starter</code>. See the next section.</li>'
  '<li><b>Start it.</b> <code>npm run dev</code> for the website and, in a second window, <code>npm run worker</code>: the worker does all the AI work, and exactly one copy of it must run. On a server: <code>npm run build</code>, then PM2 (the worker with one instance, fork mode).</li>'
  '<li><b>Sign in</b> with the admin email and password. This first admin is the <b>main admin</b>: the only one who can change that account, and the one who reviews and can put back every setup change other admins make.</li>'
  '</ol>',
  '<h3>Then, before anything else, in Settings</h3>',
  table(['Setting', 'Set it to', 'Why first'], [
    ['<b>AI</b> (the card at the top)', 'Pick the AI, press <b>Test connection</b>, then <b>Use this AI</b>.', 'A fresh copy starts on GLM. Claude Sonnet was 3 to 5 times faster in our measurements.'],
    ['<b>Company name</b>', 'Your company\'s name.', 'Every AI step says who it works for: the gate, the tagger, the signals, the project order, the writer and the reviewer.'],
  ]),
  note('Do not run <code>npm run seed:library</code>, <code>seed:proposals</code> (without the starter flag) or <code>setup:import</code> on a fresh copy for another company: they load Stackup\'s own projects, profiles, rules and sample proposals.', 'warn'),
]),
('starter', '2. What the starter kit gives you', [
  '<p><code>npm run seed:starter</code> loads everything that is the same for any company, and nothing that belongs to one. It only adds what is missing, so it is safe to run twice.</p>',
  table(['Loaded', 'What it is', 'What you do with it'], [
    ['10 tag categories', 'Project stage, Product type, AI capability, Automation, Workflow type, Industry, Compliance / sensitive data, CRM and business tools, AI models and platforms, Tech stack.', 'Keep the names exactly (see Tags). Add your tags to them.'],
    ['11 tags', 'The ten Product type tags (Web app, SaaS platform, Mobile app, Website / landing page, Admin dashboard, Chrome extension, Desktop app, Marketplace, Internal tool, API / backend service) and "AI powered" at score 0.', 'Keep their names: they decide what a job and a project run on.'],
    ['22 signals, 75 values, in 3 layers', 'What the AI reads from every post: structure, domain, hidden asks.', 'Use them as they are at first. See Signals.'],
    ['8 proposal types and their selection rules', 'Standard build (the default), Structured submission, Invite, Rescue or takeover, Architecture or consulting, Small fix, Problem first, Approach first with questions.', 'Read each, adapt the wording to yours, add your samples.'],
    ['The writing guide (6 documents)', 'Writing rules, banned phrases, modules, screening answers, type selection, the checklist.', 'Read and adapt.'],
    ['Every setting at its default', '', 'Change the few in Settings below.'],
    ['<i>Not loaded</i>', 'Projects, industries, profiles, Loom videos, rules, sample proposals, users.', 'These are yours: the rest of this guide.'],
  ]),
]),
('order', '3. The order to fill it in', [
  '<p>Each step needs the ones before it. A rough idea of the time for a small agency is given; most of it is gathering what you already have.</p>',
  table(['#', 'Step', 'Needs', 'Time'], [
    ['1', '<a href="#tags">Tags</a>: your work types, AI capabilities, automations, tools, stacks, compliance, and one Industry tag per industry', 'The starter categories', '1 to 2 hours'],
    ['2', '<a href="#industries">Industries</a>, with related industries', 'The Industry tags', '15 minutes'],
    ['3', '<a href="#projects">Projects</a>: the proof', 'Tags and industries', '15 to 30 minutes each'],
    ['4', '<a href="#profiles">Upwork profiles</a>', 'Nothing', '15 minutes each'],
    ['5', '<a href="#looms">Loom videos</a> (optional)', 'Profiles and tags', '5 minutes each'],
    ['6', '<a href="#gate">Gate instructions and rules</a>', 'Your SOP', '1 to 2 hours'],
    ['7', '<a href="#types">Proposal types, samples and the writing guide</a>', 'The starter kit', '1 to 3 hours'],
    ['8', '<a href="#settings">Settings</a> that point at your rules and signals', 'Rules and signals', '10 minutes'],
    ['9', '<a href="#people">People</a>: users, Claude, the plugin', 'Everything above', '15 minutes'],
    ['10', '<a href="#test">Test it on real jobs</a>', 'Everything above', '1 hour'],
  ]),
  '<h3>The smallest setup that works</h3><p>Checked on an empty copy: with only the starter kit, about a dozen tags with good descriptions (two work types, two AI capabilities, an automation, two Industry tags, a compliance tag, a tool, a stack), two industries, two projects with an overview, a case study and a live link, one profile and two rules, a pasted job was screened, tagged with the right core work and industry, matched to the right project with a reason, and its proposal was written in the company\'s name and signed by the profile, all within a minute of each click. Start there, see it work, then fill in the rest.</p>',
  note('Faster: an admin can do steps 1 to 8 by talking to Claude (see <a href="#bulk">Faster ways in</a>), and tags, projects, rules and profiles can be imported from a sheet. The rules for what makes each item good are the same either way.'),
]),
('tags', '4. Tags: what the AI reads to understand a job', [
  '<p>A job is understood through its tags, and projects are found through the tags they share with it. Open <b>Tag dictionary</b> (admin).</p>',
  '<h3>Category names the app depends on</h3><p>The matching reads these category names exactly as written. Rename one and that part of the matching quietly stops working.</p>',
  table(['Category', 'What the app does with it'], [
    ['<b>Industry</b>', 'The tagger picks exactly one industry per job from these tags (the client\'s own business, never the industry of data they want collected). Industry tags never count in the score; they decide the order (same industry, then related, then the rest).'],
    ['<b>Workflow type</b>, <b>AI capability</b>, <b>Automation</b>, <b>Product type</b>', 'The job\'s <b>core work</b> (one to three tags, the main one first) can only come from these. A project is recommended only when it shares the core work. This is the strongest rule in the matching.'],
    ['<b>Product type</b> tag names', 'Web app, SaaS platform, Website / landing page, Admin dashboard, Marketplace, Chrome extension, Internal tool mean web; Mobile app means mobile; Desktop app, desktop; API / backend service, backend only. A mobile job is never shown a web only project.'],
    ['<b>Tech stack</b>', 'What the per job "Skip tech stack tags" switch leaves out.'],
    ['Any category with <b>Compliance</b> ticked', 'Its tags are only given when the post states the requirement, and a project without the job\'s compliance tag ranks lower. The starter ticks Compliance / sensitive data; tick it on any compliance category you add.'],
  ]),
  '<h3>Each tag</h3>',
  table(['Field', 'Matters', 'Where it has an effect'], [
    ['Name', MID, 'Short, as a client would say it. Shown in reasons and on project cards.'],
    ['<b>Description</b>', HIGH, 'The only thing the tagger reads about the tag. Say when it applies <b>and when it does not</b>: "AI voice agent: the job wants an AI that talks to callers on the phone. Not a chatbot in a website (that is Chatbot)." The tagger is not shown the score.'],
    ['Score, 0 to 10', LOW, 'A project scores the sum of the scores of the tags it shares with the job. It only breaks ties after core work and industry, and sets the minimum score. 0 means the tag is ignored in matching. Usual pattern: Workflow type 3, AI capability up to 3, Product type, Automation, Project stage, Compliance and Industry 2, tools, AI models and tech stack 1.'],
    ['Projects', HIGH, 'Which projects have the tag. A tag no project has does nothing for matching.'],
    ['Active', LOW, 'Switched off tags are not offered to the tagger and do not count.'],
  ]),
  note('How many? Most agencies need 60 to 120 tags in all. Fewer than about 40 and different jobs look the same; hundreds of near duplicates and the tagger hesitates. Every Workflow type, AI capability and Automation tag you add should be something at least one of your projects proves.'),
  note('Avoid broad core work tags. "Workflow automation", "AI automation" and "AI powered" are treated as too broad to be core work. Name the actual work: "Lead qualification", "Appointment booking / scheduling", "Web scraping / data pipelines".', 'warn'),
]),
('industries', '5. Industries', [
  '<p>Open <b>Industries</b>. Make one industry for each Industry tag, with <b>the same name</b>: the tagger chooses from the tags, and the projects are grouped by the industries.</p>',
  table(['Field', 'Matters', 'Where it has an effect'], [
    ['Name', HIGH, 'Must match an Industry tag exactly.'],
    ['Related', MID, 'Other industries, by their exact names, separated by commas. A job in Dental then shows Healthcare projects second. It is read in one direction only: set it on both sides.'],
    ['Description', LOW, 'For people.'],
    ['Projects', HIGH, 'The projects in this industry. Setting them here or on the project is the same.'],
  ]),
  '<p>Industry only orders projects that already prove the work. A same industry project that does not share the core work is never recommended. One exception helps: a project from another industry that scores at least one and a half times the best same industry project is offered as "Alternative from another industry".</p>',
]),
('projects', '6. Projects: the proof', [
  '<p>Open <b>Projects</b>, <b>Add project</b>. This is where the quality of your proposals is decided: the writer may only say what a project\'s own fields say about it, and it names nothing that is not here.</p>',
  table(['Field', 'Matters', 'Where it has an effect'], [
    ['Name', HIGH, 'As the client or product is called. The writer must use it exactly; a check warns when another project\'s name appears.'],
    ['<b>Live link</b> (the one to show in a proposal)', HIGH, 'The only project link the writer shows, under the project\'s block, and the only one the checks allow. Without it the link line is left out and you get a warning.'],
    ['Landing, system, Android, iOS, other mobile, staging and case study links', MID, 'Never shown in a proposal. They tell the matching what the project runs on: landing or system link means web, Android, iOS or mobile link means mobile. No link and no Product type tag: the project is shown for every platform.'],
    ['<b>Overview</b>', HIGH, 'Two or three sentences: who it is for, what it does. The writer reads it all; the AI that orders the shortlist reads the first 700 characters.'],
    ['<b>Case study</b>', HIGH, 'In this shape: <b>Project</b>, <b>Problem</b>, <b>Solution</b>, <b>Key features</b>, <b>Technology</b>, <b>Results</b>. Results only when they are true and you can show them. The writer reads it all; the shortlist AI reads the first 900 characters.'],
    ['Tags', HIGH, 'What the matching scores. At least one Workflow type, AI capability or Automation tag for the work it proves, or it is never recommended. Its Product type tags. Its Industry tag. Its stack.'],
    ['Industries', MID, 'The project\'s industries, for the order.'],
    ['Notes', MID, 'For the writer, not the client: what to stress, what to avoid. A figure ("40% fewer missed calls") may only be used if it is here, in the overview, the case study or the profile\'s allowed stats; anything else is flagged as invented.'],
    ['Active', MID, 'Switched off projects are not matched and not offered to Claude. Jobs that used them keep them.'],
  ]),
  note('Start with your 15 to 30 best projects, not all of them. A good overview and case study for 20 projects beats a name and a link for 80.'),
  note('Numbers are a promise. Never type a result you cannot show: the writer will use it, and the reviewer will not know it is false.', 'warn'),
]),
('profiles', '7. Upwork profiles: who sends it, and how it sounds', [
  '<p>Open <b>Upwork profiles</b> (admin), one per Upwork profile you send from.</p>',
  table(['Field', 'Matters', 'Where it has an effect'], [
    ['Name', HIGH, 'Used in the sign off and checked to be there.'],
    ['<b>Voice</b>', HIGH, 'How it should sound, for example "first person, a named senior lead with a team behind them". The writer always writes "I", never "we".'],
    ['<b>Rules</b>', HIGH, 'This profile\'s own rules, which come before the proposal type: "No pricing and no timeline unless the client asks."'],
    ['<b>Upwork stats allowed in proposals</b>', HIGH, 'The Upwork numbers the writer may quote, word for word ("Top Rated Plus, 100% Job Success"). Anything else is never claimed.'],
    ['GitLab account or GitHub link', MID, 'The code link under the sign off. A check warns when it is missing.'],
    ['Signature', MID, 'The sign off exactly as it should appear, starting with the closing: "Best regards," on one line, the name on the next. The code link is added under it. If it does not start with a closing word, it is taken as a note and the standard "Best regards," and the name are used.'],
    ['Certifications', MID, 'One may be mentioned only when the client requires a certification, and only from this list.'],
    ['Headline, rate, lowest rate, profile link, services, industries, who submits', LOW, 'Shown when choosing the profile; the Claude plugin uses services and industries to suggest one.'],
    ['Active', MID, 'Only active profiles can be chosen. With exactly one active profile, every job gets its early draft at once.'],
  ]),
]),
('looms', '8. Loom videos (optional)', [
  '<p>Open <b>Loom videos</b> (admin). Each video belongs to one profile.</p>',
  table(['Field', 'Matters', 'Where it has an effect'], [
    ['Profile, title, link', HIGH, 'The title is what people pick; the link goes into the proposal.'],
    ['What it shows', MID, 'For people choosing it, and for the writer.'],
    ['Tags', HIGH, 'The video whose tags share the most score with the job is suggested. A video with no tags is never suggested.'],
  ]),
  '<p>The sentence before the link is the setting <b>The Loom video line</b>.</p>',
]),
('gate', '9. The gate: which jobs are worth it', [
  '<p>Every job is screened against two things, both on admin pages: the <b>gate instructions</b> (how to read and judge a job) and the <b>rules</b> (what makes it a Fail or a Flag).</p>',
  '<h3>Gate instructions</h3><p>A fresh copy starts with Stackup\'s version: <b>rewrite it</b> on the Gate instructions page. Keep its shape (read the paste, apply the rules, report) and replace the company parts:</p>',
  table(['Put in', 'Example'], [
    ['Who you are and what you sell', 'Your core services, in a short list.'],
    ['Where you work', 'The client regions you accept, or "worldwide".'],
    ['Your stack', 'What you build with, so the fit is judged right.'],
    ['What a good fit looks like', 'The kind of past work that counts as proof.'],
  ]),
  '<p>Saving makes a new version that is not used until you <b>Activate</b> it. Paste a real job into the test box first. The report\'s layout is fixed by the app.</p>',
  '<h3>Rules</h3>',
  table(['Field', 'Matters', 'Where it has an effect'], [
    ['Fail or flag', HIGH, 'A Fail stops the job until someone continues with a reason. A Flag asks for a human look. Use Fail for what you never do (off platform payment, work outside your services); Flag for what is usually a bad sign (a low hire rate, 50+ proposals).'],
    ['The rule', HIGH, 'One sentence, with the threshold: "Average hourly rate paid of $20 or below, or not shown."'],
    ['How to apply', HIGH, 'The exceptions and how to measure it: "A paid test is fine." This is how the gate gets the edge cases right.'],
    ['The code', LOW, 'Given by the app (F1, F2 for fails; G1, G2 for flags) and never reused, so old jobs keep their meaning. To change a rule\'s meaning, add a new one and retire the old.'],
  ]),
  note('Start with your SOP\'s rules as they are, even if they feel strict. After a couple of hundred jobs the <b>Flag review</b> shows which ones people always continue past, and how those jobs did. That is when to relax a rule, with evidence.'),
]),
('types', '10. How proposals are written', [
  '<h3>Proposal types</h3><p>Open <b>Writing guide</b>. The starter kit\'s eight types are written to be company neutral. For each, read it and adapt it:</p>',
  table(['Field', 'Matters', 'Where it has an effect'], [
    ['<b>The type\'s text</b>', HIGH, 'The writer follows it as the format. Keep two lines in it: "Chosen when: ..." and "Length: 150 to 220 words." (the length check reads that line).'],
    ['First two lines rules', HIGH, 'What Upwork shows in the preview. Strict rules per type: no greeting, no "I am", the client\'s problem first, a required opening word if you use one.'],
    ['Writer instructions', MID, 'Extra instructions for this type only.'],
    ['When it is chosen (its signal rules)', MID, 'Required, supporting and ruling out signals. The starter rules work; change them on the type\'s page when the wrong type keeps being suggested.'],
    ['Priority and default', LOW, 'Ties and the fallback. Exactly one type should be the default.'],
  ]),
  '<h3>Samples</h3><p>On each type, add two or three of <b>your own sent proposals</b> that did well. They teach tone and structure only: names, links and claims in them are never copied, and a sample\'s author name or sign off appearing in a new proposal is flagged. A type without samples borrows other types\'. This is the single best way to make the writing sound like you.</p>',
  '<h3>The writing guide documents</h3>',
  table(['Document', 'Matters', 'Where it has an effect'], [
    ['Writing rules', HIGH, 'House style for every proposal.'],
    ['Banned phrases', HIGH, 'One per line, starting with "-", the phrase in quotes. Each is checked in every proposal.'],
    ['Modules', MID, 'Short paragraphs the signals can call for (a team line, a security line).'],
    ['Screening answers', MID, 'How to answer the questions Upwork asks apart from the letter.'],
    ['Checklist', MID, 'What the writer checks before it answers.'],
    ['Type selection', LOW, 'Read by the Claude plugin to choose the type.'],
  ]),
  '<h3>Signals</h3><p>Open <b>Signals</b>. Each value has <b>How to detect it</b> (what the AI looks for in the post) and <b>The proposal move</b> (what the writer does when the value applies). One value per signal is the fallback, used when the post says nothing: give it a real move too. The starter set is company neutral; change a value\'s move when your writing should react differently. Keep the signal numbers: a setting points at signal 5.</p>',
  '<h3>What the writer always does, whatever the setup</h3><p>Only facts from your projects, the profile and the job post; only the chosen projects, by name; samples for tone only; first person; the client\'s own rules first; plain text. The letter, each project\'s block, the video line and the sign off are kept as parts, so changing a project, the profile or the video later redoes only that part. When the client dictates the structure, the proposal is written whole.</p>',
  '<h3>The reviewer</h3><p>Open <b>Reviewer</b>. It works from the first proposal with a built in version. Make it yours later: your key concerns, dos and don\'ts, what each score means.</p>',
]),
('settings', '11. Settings that point at your setup', [
  '<p>Most settings are good as they are. These four point at your own rules and signals, so check them once those exist.</p>',
  table(['Setting', 'Default', 'Set it to'], [
    ['<b>Rules passed to the proposal writer</b>', 'G11, G12, G13 (Stackup\'s codes)', 'The codes of <b>your</b> flags the writer must treat as client requirements: unanswerable screening questions, hidden instructions in the post, location or timezone rules. With the wrong codes the writer ignores them.'],
    ['<b>Signal that means "structured submission"</b>', 'Signal 5 is Yes', 'Keep it if you kept the starter signals. Such a proposal follows the client\'s own structure and is written whole.'],
    ['Quick reasons to continue past a FLAG or FAIL, and to skip', 'Five each', 'Your common reasons. They are counted in the Flag review.'],
    ['Outcome choices, lost outcomes, loss reasons', 'Pending, Hired and so on', 'Keep "Hired": the dashboard counts it as a hire.'],
  ]),
  '<p>The others: how many projects are shown and recommended, the minimum match score, the fewest and most a person picks, the shortest reason to continue, the days before a proposal "goes quiet", whether matching starts by itself for a Pass or a Flag with few flags, whether every proposal is reviewed, and the Loom line. Each says what it does on the page.</p>',
]),
('people', '12. People, Claude and the plugin', [
  table(['Role', 'Can'], [
    ['Employee', 'Screen jobs, work on their own jobs, continue past a flag with a reason, connect their own Claude.'],
    ['Manager', 'Also see everyone\'s jobs, and add or edit projects, industries, proposal types, samples and the writing guide. Read the Flag review.'],
    ['Admin', 'Everything: also tags, profiles, Loom videos, rules, the gate, signals, the reviewer, settings, users, logs and changes.'],
  ]),
  '<p>Add people on <b>Users</b> with a temporary password of 10 characters or more, given privately. Each person connects their own Claude on <b>Connect Claude</b> (the connector link, then sign in), so everything Claude saves is recorded as them, and downloads the plugin there.</p>',
  note('The Claude plugin was written for Stackup. It reads your library, rules and writing guide from your Upwork Pro, so its proposals use your setup; but the backup copies inside it (used only when Upwork Pro cannot be reached), its job gate text and its list of profiles are Stackup\'s. A company using it day to day should have those replaced with its own.', 'warn'),
]),
('migrate', 'Coming from GPT or Claude', [
  '<p>Most companies arrive with a prompt or a set of prompts that already works. Here is where each part goes.</p>',
  table(['You have', 'It goes', 'Notes'], [
    ['An SOP: which jobs to take, red flags', 'Gate instructions (the method) and Rules (each check)', 'One rule per check, with its threshold and exceptions. The gate never sees the proposal rules.'],
    ['"Our services, our stack, our regions"', 'Gate instructions', 'And the services in each profile.'],
    ['A list of projects, case studies, portfolio links', 'Projects, with tags and industries', 'Rewrite into overview and case study. The live link is the one you would paste.'],
    ['A prompt per Upwork profile (tone, sign off, stats)', 'Upwork profiles: voice, signature, stats, rules', 'One profile per Upwork profile.'],
    ['Proposal templates or formats', 'Proposal types', 'Start from the closest starter type and change its text.'],
    ['Example proposals that worked', 'Samples on each type', 'Two or three per type.'],
    ['"Never say ..." lists, style rules', 'Writing rules, banned phrases', 'One banned phrase per line, in quotes.'],
    ['How you answer screening questions', 'Writing guide, screening answers', ''],
    ['A checklist you run before sending', 'Writing guide, checklist', 'And the Reviewer\'s key concerns.'],
    ['How you judge a draft', 'Reviewer', 'Key concerns, dos and don\'ts, the score guide.'],
  ]),
  '<p>What you no longer do by hand: pasting the client data into the prompt, choosing the projects, remembering which proposal went from which profile, and recording what happened. Upwork Pro does the first two and keeps the rest, which is what makes the reports possible.</p>',
]),
('bulk', 'Faster ways in', [
  '<h3>Tell Claude</h3><p>With the plugin, an admin can say "add a project", "add a tag for Lawmatics", "add a flag rule for jobs that ask for free samples", "change the writer rules so ...". Claude shows real examples first, asks for what is missing, never fills a gap with a guess, rewrites it in the standard format, shows the change as before and after, and saves only after a yes. Every change is kept and can be put back. Managers can do the same for projects, industries, types, samples and the writing guide.</p>',
  '<h3>Import a sheet</h3><p>Through Claude, with a preview before anything is saved and an undo after. The columns:</p>',
  table(['Sheet', 'Columns'], [
    ['Rules', 'code (F1, G1 ...), type (fail or flag), rule'],
    ['Tag dictionary', 'category, tag, weight (0 to 20), description'],
    ['Projects', 'name, tags (names separated by ; or |), live link, showable'],
    ['Profiles', 'name, title, rate, gitlab, url, notes'],
  ]),
  '<p>An import adds; it never changes what exists unless you allow it. Overviews, case studies and industries are not in the project sheet: add them after, in the app or through Claude.</p>',
  '<h3>Copy a whole setup</h3><p><code>npm run setup:export</code> writes the whole setup (no jobs, no users) to one file; <code>npm run setup:import -- --apply</code> loads it into another copy, adding what is missing and updating what differs, deleting nothing. Use it to move from a test copy to the real one.</p>',
]),
('test', 'Test it before the team uses it', [
  '<p>Take five real jobs: two you would take, two you would skip, one invite. For each:</p>',
  table(['Check', 'Where', 'If it is wrong'], [
    ['The gate says what you would say', 'Screening tab', 'Reword the rule, or its How to apply. Test the gate instructions with the job.'],
    ['The tags and the core work fit the job', 'Projects tab, "Why these projects"', 'Sharpen the descriptions of the wrong and the missing tags.'],
    ['The recommended projects are the ones you would pick', 'Projects tab', 'Add the missing work tag to the project, or the missing industry. Check the project\'s links for the platform.'],
    ['The suggested type is the one you would write', 'Proposal tab, before writing', 'Change the type\'s signal rules, or the signal\'s detect text.'],
    ['The proposal says nothing untrue and sounds like you', 'Proposal tab', 'Fix the project or profile fields (not the proposal), add samples, add banned phrases.'],
    ['The review agrees with you', 'Independent review', 'Change the reviewer\'s key concerns.'],
  ]),
  note('Fix the setup, not the proposal. A correction made in a project, a profile or a type helps every proposal after it; a correction made in one proposal helps only that one.'),
  '<h3>After two weeks</h3><p>Look at <b>Reports</b> (which profiles, types and projects get replies), the <b>Flag review</b> (which rules to relax), and Logs, AI calls (how long each step takes, and failures).</p>',
]),
    ]
