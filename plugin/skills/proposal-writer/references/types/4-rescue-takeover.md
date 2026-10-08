# Type 4. Rescue or Takeover

**Chosen when:** the existing system is broken, unfinished or being rebuilt. Signals in `../type-selection.md`.
**Length:** 170 to 240 words.

## Structure

1. **Opening paragraph.** Two hook sentences on the likely cause or biggest risk, then one experience sentence naming the takeover or rescue projects.
2. **Detailed projects,** directly after the opening, in the order they were named. No separate link lines.
3. **First look.** What we check in the first days before changing anything.
4. **Close.** One line showing immediate availability.
5. **Signature** from the profile record.

## Opening paragraph

**Hook, two sentences**
1. Name the likely cause or biggest risk in their current system, using a detail only this client wrote.
2. State it calmly. Never blame the previous developer.
3. Sentence one names the problem. Sentence two explains what is probably causing it.
4. Sound like a person talking.
5. No talk about us in the hook. No project names, no stats, no "I can fix".

**Experience sentence**
1. One sentence, 20 to 30 words, in the same paragraph directly after the hook.
2. Names the type of takeover or rescue work, then names the projects detailed below.
3. Only true claims.

## Detailed projects

1. The same projects named in the opening, in the same order. Usually two.
2. Only genuine takeovers, fixes or rebuilds, judged from the project overview and case study summary, not from the "Rescue / takeover" tag alone (that tag is over applied in the library). Never stretch a new build into a rescue. If only one genuine project exists, use one and flag it under "Needs your eye".
3. Project format and title rules as Type 1; the title targets the main fix or rebuild this client needs.

**Project description rules**
1. What I inherited and what I did. The state the project was in, the stack, and what we fixed or rebuilt.
2. Why it matters to them. Tie it directly to their problem, stack or industry.
3. Result, if verified. Only from the library.

## First look

1. Two or three sentences, after the projects.
2. What we check before changing anything: access, repo state, deploy path, data.
3. End by showing how this separates what is broken from what is simply unfinished.

## Close rules

1. One line, 9 to 11 words.
2. Shows immediate availability, since rescue clients are usually under pressure.
3. No question mark, no easy out, no banned phrases.

Examples: "I'm available today and can start the audit right away." · "I can start today, beginning with a full code audit."

## Estimates

Apply the estimate answer rule in `../modules.md`. A rescue estimate is almost always unknown until the audit, so say that plainly.

## Do not

1. Do not blame or criticize the previous developer.
2. Do not promise a fix before the audit.
3. Do not present a from scratch build as a rescue.

## Sample

Structure illustration only. Project facts in samples are not verified; take every project fact from the library.

Job: half built Laravel and React store, previous developer left, payments fail intermittently.

```
Payments that fail only sometimes usually point to webhooks, not the checkout itself. When Stripe events arrive twice or out of order and the app isn't built for that, orders get stuck between paid and pending. I've taken over unfinished and AI built apps, including [rescue project 1] and [rescue project 2], where the first job was finding out what actually worked.

[Rescue project 1] – [Project title]
[project link]

I took over [what was inherited] on [stack] and fixed [main issue]. [Why it matters for their store.]

[Rescue project 2] – [Project title]
[project link]

[Two or three sentences from the library.]

Before changing anything, I'd confirm access to the repo, server and Stripe account, check that what's deployed matches the latest code, and compare webhook logs against your order records. That separates what's broken from what's simply unfinished.

I'm available today and can start the audit right away.

[Signature from profile record]
```
