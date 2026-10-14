-- R68. Opening lines (all types): the default rules for the first two lines, as a Writing guide document. Each proposal type's own
-- first two lines rules are added after it, and win where they differ. Created here with its default text, once, so an existing
-- copy gets it too; a fresh copy also gets it from seed/writing/opening-lines.md (npm run seed:writing).
ALTER TABLE writing_docs MODIFY kind ENUM('type','rules','banned','modules','screening','checklist','selection','opening') NOT NULL;
INSERT INTO writing_docs (doc_key, kind, title, sort_order, content)
  SELECT 'opening-lines', 'opening', 'Opening lines (all types)', 15, '# Opening lines (all types)

The first two lines are what Upwork shows in the preview, before the client opens the proposal. Most clients decide there whether to read on. These rules apply to every proposal type; each type then adds its own rules for what line one and line two do, and where a type''s rule differs from one below, the type''s rule wins.

## Always

- Write the two lines for this client only: use a detail only this client wrote (their product, their numbers, their words), so the lines could not open any other proposal.
- Start with the client: their problem, their goal or their situation. Never with us.
- Sound like a person talking. No slogans, no sales lines, no lectures, no questions that only ask for attention.
- If the client set a required opening word or phrase, start with it exactly, then go on.

## Never in the first two lines

- A greeting, the client''s name or a thank you. (The Invite type may greet by name; its own rule says when.)
- Talk about us: "I", "we", "our", "my", "I can build", "I am a". (Some types may say how we would start; their own rule says so.)
- A project name, a link, stats, ratings, years of experience or numbers of projects.
- Filler such as "I read your post", "I am excited to apply" or "I hope you are well".
'
  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM writing_docs WHERE doc_key='opening-lines');
INSERT INTO writing_doc_versions (doc_id, content, note)
  SELECT d.id, d.content, 'The default opening lines rules' FROM writing_docs d
  WHERE d.doc_key='opening-lines' AND NOT EXISTS (SELECT 1 FROM writing_doc_versions v WHERE v.doc_id=d.id);
