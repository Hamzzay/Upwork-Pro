# Type 5. Architecture or Consulting

**Chosen when:** architect, lead, consultant or auditor role, or the job asks for strategy, assessment or a roadmap. Signals in `../type-selection.md`.
**Length:** 180 to 260 words.

## Structure

1. **Opening paragraph.** Two hook sentences giving a point of view on the key decision they face, then one experience sentence naming projects where we owned the architecture.
2. **Detailed projects,** directly after the opening, in the order they were named. No separate link lines.
3. **Deliverables.** What they will hold at the end.
4. **Close.** One line offering a short discovery session.
5. **Signature** from the profile record.

Voice shifts from "I built" to "I owned" and "I decided", only where true.

## Opening paragraph

**Hook, two sentences**
1. Give a clear point of view on the key decision the client faces, using a detail only this client wrote.
2. Sentence one challenges or reframes a common assumption. Sentence two names the decision that actually matters.
3. Sound like an experienced person talking, not a lecture, slogan or sales line.
4. No talk about us in the hook. No project names, no stats.

**Experience sentence**
1. One sentence, 20 to 30 words, in the same paragraph directly after the hook.
2. Names the type of architecture work, then names the projects detailed below.
3. Only true claims.

## Detailed projects

1. The same projects named in the opening, in the same order. Usually two.
2. Only projects where we genuinely owned architecture or key technical decisions.
3. Project format as Type 1; the title targets the architecture focus this client needs.

**Project description rules.** Two or three plain sentences focused on decisions, not features:
1. What I decided and why. The key architecture decision, the stack, and the reason behind it.
2. Why it matters to them. Tie the decision to the choice or tradeoff they face now.
3. Result, if verified. Only from the library.

If the library holds no stored decision for a project, describe what was built and flag the missing decision under "Needs your eye". Never invent a decision.

## Deliverables

1. One or two sentences on what they will hold at the end: architecture, assessment, roadmap, standards.
2. Written as a sentence, not a list.

## Close rules

1. One line, 9 to 11 words.
2. Offers a short discovery session tied to their problem.
3. No question mark, no easy out, no banned phrases.

Example: "Let's start with a short discovery session on your claims flow."

## Estimates

Apply the estimate answer rule in `../modules.md`.

## Do not

1. Do not list features; consultants are hired for judgment.
2. Do not claim ownership of decisions the library does not show we made.
3. Do not recommend a specific framework in the hook; the hook is about the decision, not the tool.

## Sample

Structure illustration only. Project facts in samples are not verified; take every project fact from the library.

Job: fractional AI architect for an insurtech deciding how to automate claims review.

```
Most claims workflows don't need many agents on day one. The real decision is where a human must approve, because that boundary shapes the architecture more than any framework choice. I've owned architecture decisions for multi agent AI systems, including Navience and Breesy, where traceability and cost at scale drove every choice.

Navience – Multi Agent Claude Architecture for Authorization Decisions
[project link]

[Decision, stack and reason, from the library.] [Tie to their claims flow.]

Breesy – Multi Agent Platform Architecture With 50 Plus SaaS Agents
[project link]

[Decision and reason, from the library.] That's the same question you face on how many agents claims review really needs.

At the end you'll have a target architecture with the reasoning behind each choice, a build roadmap your team can follow, and clear rules for where AI decides and where people do.

Let's start with a short discovery session on your claims flow.

[Signature from profile record]
```
