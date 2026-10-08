# Type 2. Structured Submission

**Chosen when:** the client lists what proposals must include. Wins over every other type. Signals in `../type-selection.md`.
**Length:** as long as the answers need, no padding. Soft ceiling about 350 words.

## Structure

1. **Opening paragraph.** Two hook sentences on the client's pain, then one experience sentence naming two or three similar projects.
2. **Link lines.** One per project named in the opening.
3. **Answers,** numbered in the client's order, using their wording as short headings.
4. **Two detailed projects** in the project format.
5. **Gaps.** Anything that cannot be answered honestly goes to "Needs your eye", never padded.
6. **Close.** One line call to action.
7. **Signature** from the profile record.

## Opening paragraph

**Hook, two sentences**
1. Start from the pain behind their most important requirement, not the project.
2. Use a detail only this client wrote.
3. Sentence one names the pain. Sentence two shows what causes it or how to avoid it.
4. Sound like a person talking.
5. No talk about us in the hook. No project names, no stats, no "I can build", no "I'd build".
6. If the client set a required opening, use it exactly, then continue with the experience sentence.

**Experience sentence**
1. One sentence, 20 to 30 words, in the same paragraph directly after the hook.
2. Names the type of system and context that match this job, then names two or three similar projects.
3. Only true claims. Numbers only from the library or the profile's allowed stats.
4. Plain and confident, not a brag.

## Link lines

Directly below the opening paragraph, one line per named project:

```
Project Name – [link]
```

## Answers

1. Numbered in the client's order, using their wording as short headings.
2. Answer every item in full. Commit to their stack.
3. Proof belongs inside the answers where it fits naturally.
4. Timeline, budget or estimate asks: apply the estimate answer rule in `../modules.md`.

## Detailed projects

1. Two projects, different from the ones named in the opening. Reuse an opening project only when the library has no other strong match.
2. If the client asks for past work, both go inside that answer. If not, add a "Relevant work" section after the answers.
3. Project format, title rules and description rules are the same as Type 1.

## Close rules

1. One line, 9 to 11 words. No question mark, no easy out, no banned phrases.
2. If no answer already invites a call, the close invites one. Example: "Let's set up a short call to review your contract set."
3. If an answer already invites a call, such as the estimate answer, the close is forward looking instead. Example: "Looking forward to building a contract assistant your team trusts."

## Do not

| Weak experience line | Why it fails |
| --- | --- |
| "I have 6+ years of experience in AI development." | Generic |
| "I'm an expert in RAG, LLMs, LangChain, Pinecone and OpenAI." | Skills list |
| "I've built dozens of similar projects." | Unverified, vague |

## Sample

Structure illustration only. Project facts in samples are not verified; never copy a sample's claims about a project. Take every project fact from the library.

Job: RAG assistant over company contracts. Client asks for a similar project, a vector database choice, how you prevent wrong answers, and an estimate.

```
Contract answers are only useful if your team can trust them without opening the PDF. That trust comes from citing the exact clause, which means retrieval and citations matter more than the chat interface. I've built AI systems over legal and compliance documents, including ZD Law Firm Automation and LexGuard Pro, where accuracy on legal language comes first.

ZD Law Firm Automation – [link]
LexGuard Pro – [link]

1. Similar project you've built

Navience – Multi Agent RAG for Policy Based Authorization Decisions
[project link]

[Two or three sentences from the library on what was built and why it matches.]

[Second project] – [Project title]
[project link]

[Two or three sentences from the library.]

2. Which vector database and why

Since you already run PostgreSQL, I'd use pgvector. Contracts, metadata and embeddings stay in one database, so filtering by client or contract date stays simple.

3. How you prevent wrong answers

Every answer cites the contract and clause it came from. When retrieval confidence is low, the assistant says it can't find the answer instead of guessing.

4. Estimate

An accurate timeline and budget depend on details the post doesn't cover yet, like contract volume, file formats and who will use the assistant. Let's schedule a short call to define the complete scope, and I'll align the plan with your preferred timeline and budget.

Looking forward to building a contract assistant your team trusts.

[Signature from profile record]
```
