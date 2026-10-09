# Upwork Pro design rules

One design for every screen. Read this before adding or changing a page. The styles are in `backend/public/style.css`,
the shared parts in `backend/public/app.js`. If a page needs something that is not here, add it here first, then use it
everywhere.

## The 20 rules, and how Upwork Pro follows each

The first ten are Jakob Nielsen's usability heuristics. The next seven are from the Laws of UX. The last three are common
practice for tables, forms and dashboards.

| # | Rule | In Upwork Pro |
| --- | --- | --- |
| 1 | Show what the system is doing | Screening and writing show a spinner with plain words and the page updates by itself. Every save ends in a short message. Buttons show "Saving" while they work. |
| 2 | Speak the user's language | Sentence case, plain English, no codes without their meaning. Pass, Flag and Fail are words, never capitals. Dates read "7 Oct 2026". |
| 3 | Let people leave and undo | Every dialog has Cancel and closes on Escape. Nothing is deleted without a second question. Proposal versions are kept, so any edit can be restored. Retire and Disable instead of delete where history depends on it. |
| 4 | Be consistent | One header, one filter bar, one table, one badge, one tab style, one dialog, one way to show facts, on every page. This file is the list. |
| 5 | Prevent errors | A button is shown only when pressing it does something. A missing input is explained next to it. The server checks every rule again. |
| 6 | Recognition, not recall | Filters name what they filter ("Any profile"). A chosen filter is outlined and has its own clear button. The job page shows the step you are on and what is next. |
| 7 | Fast for experienced people | Cmd or Ctrl + Enter sends. Every list keeps its search, filters and page in the link, so Back returns to the same view. One press moves a job to its next step. |
| 8 | Only what is needed | Five text styles and two weights. Supporting detail is folded. No decoration: no shadows on cards, no capitals, no icons without a label. |
| 9 | Help people recover from errors | Error messages say what happened and what to do, in red, next to the thing that failed. "Try again" is offered where it can work. |
| 10 | Help where it is needed | A quiet line under each page title says what the page is for. Hints sit under the field they explain. The team guide is in `guide/`. |
| 11 | Fitts: important targets are big and close | One primary button per page, top right. A row's buttons are at its right end. The job page keeps its buttons in the tab row, which stays on screen. |
| 12 | Hick: fewer choices decide faster | One primary action per view. The Jobs list offers one action per row, the next one. Long forms are in sections. |
| 13 | Jakob: work like the tools people know | Sidebar on the left, title top left, primary button top right, tables with a filter bar on top, dialogs with buttons bottom right. |
| 14 | Miller: group things | The sidebar is four groups. Facts are grouped under headings. A page shows 20 rows, then pages. |
| 15 | Doherty: answer within 400 ms | Filters apply as you type. Lists held in memory filter at once. Slow work (the AI) runs in the background and never blocks the page. |
| 16 | Aesthetic and usability: clean reads as easy | One accent colour. Colour means something every time: green good, amber needs a look, red bad, blue in progress. |
| 17 | Proximity and common region | Things that belong together share a card. One gap (16) between cards, one padding (20) inside them. |
| 18 | Tables people can scan | Quiet headers, names in the first column in semibold, numbers and buttons right, status as a badge, empty states that say what to do. |
| 19 | Forms people can finish | Label above the field, hint under it, one column on phones, the dialog's head and buttons stay in view while the form scrolls. |
| 20 | Every number leads somewhere | Dashboard and report numbers open the jobs behind them. Works on a phone and in dark mode, with visible keyboard focus. |

## Text

| Style | Size and weight | Used for |
| --- | --- | --- |
| Figure | 28 / 600 | Big numbers on tiles |
| Title | 22 / 600 | The page title, once per page |
| Heading | 16 / 600 | Card titles and section headings |
| Body | 15 / 400 | Text and field values |
| Control | 14 | Buttons, tabs, sidebar links, table cells |
| Label | 13 / 400, grey | Field labels, hints, the line under a title |
| Small | 12 / 400, grey | Table headers (600), badges (600), timestamps |

Two weights only: 400 and 600. No capitals, no letter spacing, no italics.

## Colour

Brand indigo for the primary button, links, the active tab and the active sidebar link. Green (`--pass`) good or on,
amber (`--flag`) needs a look, red (`--fail`) bad or destructive, blue (`--info`) submitted and information. Grey for
everything neutral. Every colour is a variable in `:root` with a dark mode value: never write a colour in a page.

## Layout

- Sidebar 244 wide; content up to 1480 wide; one gap of 16 between a page's parts (the page spaces its own children, so
  never add spacer elements or margins between cards).
- Cards: white, one grey border, radius 12, no shadow. Only things that float have a shadow (dialogs, menus, messages).
- Controls are 38 high. Small buttons (30) only inside table rows, card heads and the job page's tab row.

## The shared parts (use these, do not rebuild them)

| Part | In `app.js` | Notes |
| --- | --- | --- |
| Page header | `pageHead(title, sub, actions, { back, badges })` | Back link above, status badges beside the title, buttons right. |
| Filter bar | `filterBar(controls, { actions, onClear })`, `fSearch`, `fSelect`, `dateField` | Search two columns wide, every filter one column, buttons at the right end. "Clear filters" only while filtered. |
| A list | `listCard({ items, search, filters, render, ... })` | Search, filters, pages and the empty state for any list held in memory. State is kept in the link. |
| Table | `dataTable(heads, rows)`, `acts(...buttons)` | The last cell holds the row's buttons. Delete lives in the edit dialog, never in the row. |
| Badges | `verdictBadge(v)`, `onOff(active, yes, no)`, class `pill` / `vbadge` | One shape. Chips (class `chip`) are plain labels such as tags, not statuses. |
| Tabs | class `tabs` with `tab` buttons, a count in `span.n` | A segmented control (class `seg`) only for a few views of the same data. |
| Facts | `dl.facts` or `dl.kv` | Label above value, in columns. |
| Notice | class `notice` | One message box. `warnbox` for a warning. |
| Folded section | `details.fold` | For supporting detail. |
| Dialog | `modal({ title, body, confirm, danger, extra, wide })`, `ask(title, text)` | Never the browser's `confirm` or `alert`. |
| Message | `toast(text, bad)` | Short, after an action. |
| Empty state | `emptyState(icon, title, text, action)` | Says what to do next. |

## The job page

Its own rules are in the comment above `jobPage` in `app.js`: every button in the tab row, nothing greyed out, the
decision first.

## Before calling a design change done

`node --check` on the files in `backend/public/`, then open every screen (the list is in `TASKS.md`) at desktop width,
phone width (390) and in dark mode: no console errors, no "null" or "undefined", no sideways scroll, every filter filters
and clears.
