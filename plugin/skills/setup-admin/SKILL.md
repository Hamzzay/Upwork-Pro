---
name: setup-admin
description: Adds and changes the setup of Upwork Pro from Claude, for admins and managers: projects, industries, the tag dictionary, Upwork profiles, Loom videos, rules, signals, proposal types and samples, the writing guide, the gate instructions, the independent reviewer and settings. Use when the person says "add a project", "update this project", "add a tag", "change the tag score", "add a Loom video", "add a rule", "change the writing guide", "change a setting", "change how the reviewer scores", "add a don't for the reviewer", "switch this off", "what did Daniel change", "show the changes" or "undo that change".
---

# Setup admin

Changes the setup of Upwork Pro through the `upwork-pro` MCP tools (load them with ToolSearch): `setup_start`, `setup_list`, `setup_get`, `setup_examples`, `setup_prepare`, `setup_apply`, `setup_history`, `setup_revert`, `setup_review`.

The setup is shared by the whole team and read by the AI on every job, so one careless item hurts every proposal after it. **Nothing raw goes in.** Whatever the person gives you, you check it, rewrite it in the standard format, show the final version, and save only after a clear yes.

## Start

Call `setup_start` once. It says who is signed in, which kinds they may change and what happens after a change. If the kind they ask for is not in their list, say who can do it (an admin) and stop there.

## The seven steps, for every item, in this order

Never skip a step, and never merge two steps to save time.

1. **Look at what exists.** `setup_list` with a search for the name and for words like it. If it is already there, say so and offer to update that one (`setup_get` shows it in full). Never add a second copy under a slightly different name.
2. **Show how a good one looks.** Call `setup_examples` for the kind and show two or three of them in full, briefly introduced: "This is the shape we keep them in." For a project: its overview, its case study, its links and its tags by category.
3. **Ask for all the information.** One topic at a time, in plain words. The questions per kind are in `references/kinds.md`: read it before you ask. Take whatever form the person gives it in (notes, a pasted document, a link, a voice dump).
4. **Check what is complete and what is missing, and say so.** Show a short list: what you have, what is missing, what is unclear. Ask again for what is missing. **Never fill a gap with a guess**: no invented results, numbers, clients, rates, links or technology. If the person does not know, the field stays empty and you say it will stay empty.
5. **Verify what can be verified.**
   * Every tag, industry, category, profile and signal you plan to use exists, under that exact name (`setup_list`). If a needed tag does not exist, ask whether to add it first (its own run of these steps) or leave it off.
   * The name is not already taken.
   * Links start with `https://` and are the ones the person gave, letter for letter. If you can open a link, open it and say what you found; if you cannot, say it was not checked.
   * Numbers and claims appear in what the person gave you. Anything you cannot find there is taken out or asked about.
6. **Rewrite it in the standard format yourself.** The same headings, length and style as the examples: plain sentences, no sales words, no emojis. Never paste the person's raw text into a field. Then **show the final version exactly as it will be saved**, field by field, and under it a short list "What I changed from what you gave me" (reworded, shortened, left out and why).
7. **Prepare, show, and get a clear yes.**
   * Call `setup_prepare` with the final fields and a one or two sentence `reason` taken from the conversation.
   * Show what it returns as it is: the changes (before and after), what it affects, and every warning. Do not soften or drop a warning.
   * Ask: "Save this?" Only on a clear yes call `setup_apply` with the `change_id`. "Looks fine", silence, or a yes to something else is not a yes to this.
   * After applying, say one line: what was saved, the change number, and what happens next (from `after_apply`: for a second admin, the main admin sees it under Changes and can put it back).

If the person changes anything after seeing the final version, go back to step 6: rewrite, show, prepare again. A prepared change that was not applied is simply left; it saves nothing.

## Updating something that exists

The same steps, shorter: `setup_get` it, show the current values of what they want to change, ask for the new ones, rewrite in the standard format, prepare, show before and after, get a yes, apply. Send only the fields that change. **A list replaces the whole list**: to add one tag to a project, send all its current tags plus the new one.

## Switching off, never deleting

Nothing is deleted from Claude. To retire an item use the action `switch_off` (and `switch_on` to bring it back). Say what switching it off does (from `affects`) before asking for the yes.

## The gate instructions

They decide every screening, so they go in two separate changes:

1. `new_version`: the full new text and a change note. It is saved **not active**. Tell the person to test it on a past job in the app (Gate instructions, Test) before going further.
2. `activate`: only when they say it is tested and they want it live. A separate prepare, a separate yes.

## The reviewer

The independent reviewer scores every proposal, in the app and from Claude, so it goes in two separate changes like the gate:

1. `new_version` with only the parts that change (`setup_get` `reviewer_instructions` shows them all first: how to review, key concerns, dos, don'ts, the score guide, the score limits, how to write the review, how many of each, and which facts it reads). It is saved **not active**. Tell the person to try it on a past proposal in the app (Reviewer, Try the draft) before going further.
2. `activate`: only when they say it is tried and they want it live. A separate prepare, a separate yes.

The facts it reads and the shape of its answer (score, verdict, problems, strengths, suggestions) are fixed by the app and cannot be changed here. Say so if asked.

## The history, and putting a change back

* "What changed", "who changed X", "what is waiting for review": `setup_history` (admins). Show it as a short table: change number, when, who, from the app or from Claude, what, the reason, the status.
* "Undo that": `setup_revert` with the change number, **main admin only**, after a yes. If it is refused because the item was changed again later, show what else would be undone and ask again; only with that second yes call it with `even_if_changed_since`.
* The main admin marks changes as seen with `setup_review`. It changes nothing in the setup.

## Never

* Never save without the two steps and the yes. Never call `setup_apply` for a change the person did not see in this chat.
* Never paste raw input into a field, and never invent a fact to fill one.
* Never touch users, passwords, the AI provider or its keys: they are not available here. Send the person to the app.
* Never put a key, token or password into any field, even if the person pastes one. Tell them to remove it from the chat.
* Never work around a refusal. If Upwork Pro refuses a change, show its message as it is and ask the person what to do.
