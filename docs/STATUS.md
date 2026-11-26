# Breccia status

Last updated: 2026-11-26. Keep this file current: update it when a plan starts, after each task while a plan is in
progress, and when a plan finishes.

## Where the project stands

The app is complete in its first form, as the spec describes it (`docs/spec.md` §7): the journal feed with a date
picker; pages with `[[links]]`, `#tags`, aliases and linked references; a page tree with folders and drag and drop;
configurable task states, cycling with `Ctrl Enter`, `created::` and `done::` times; Kanban boards over every task
block, with priority by dragging, hidden columns and automatic archiving; the Archive and All pages views; search
(`Ctrl K`) with filters and typed dates; Git sync and a Git history view; ten themes plus System; zoom; back and
forward between views; the `F1` shortcut overlay; the graph; a tray icon; a Windows installer built by the release
workflow. Since 1.1.0 (released 2026-11-07, plans 1 and 2): page colors, 25 named colors or a custom hue per page, shown as soft
washes behind journal blocks, set from a swatch on the page title or by right-clicking a link in the journal, with a
live preview in the picker. Since 1.2.0 (released 2026-11-09, plan 3): a Vividness slider makes a custom color softer or
stronger per page (`color:: hue 212 vivid 150`, format version 8), held back where text would be hard to read.

This repository starts from a prototype, without its history. Breccia 1.0.0, the first public release, was published
on 2026-11-06 (https://github.com/EightBitBoy/breccia/releases/tag/v1.0.0), and the repository is public since then.

## Plans

| # | Plan | State | Plan file | Follow-ups |
|---|---|---|---|---|
| 1 | Page colors | done 2026-11-07 | `docs/plans/2026-11-07-01-page-colors.md` | `docs/plans/2026-11-07-01-page-colors-followups.md` |
| 2 | Custom page colors | done 2026-11-07 | `docs/plans/2026-11-07-02-custom-page-colors.md` | `docs/plans/2026-11-07-02-custom-page-colors-followups.md` |
| 3 | Custom color vividness | done 2026-11-09 | `docs/plans/2026-11-09-03-custom-color-vividness.md` | `docs/plans/2026-11-09-03-custom-color-vividness-followups.md` |
| 4 | Follow-ups of plans 1 to 3 | done 2026-11-09 | `docs/plans/2026-11-09-04-followups-of-plans-1-3.md` | `docs/plans/2026-11-09-04-followups-of-plans-1-3-followups.md` |
| 5 | GitHub Pages site | done 2026-11-09 | `docs/plans/2026-11-09-05-github-pages-site.md` | `docs/plans/2026-11-09-05-github-pages-site-followups.md` |
| 6 | Safety net (from the audit) | done 2026-11-10 | `docs/plans/2026-11-10-06-safety-net.md` | `docs/plans/2026-11-10-06-safety-net-followups.md` |
| 7 | Wash seams, Today and Yesterday, delete a block | done 2026-11-10 | `docs/plans/2026-11-10-07-wash-seams-slash-dates-delete-block.md` | `docs/plans/2026-11-10-07-wash-seams-slash-dates-delete-block-followups.md` |
| 8 | Theme wheel and four more themes | done 2026-11-11 | `docs/plans/2026-11-11-08-wheel-and-more-themes.md` | `docs/plans/2026-11-11-08-wheel-and-more-themes-followups.md` |
| 9 | Core housekeeping (from the audit) | done 2026-11-11 | `docs/plans/2026-11-11-09-core-housekeeping.md` | `docs/plans/2026-11-11-09-core-housekeeping-followups.md` |
| 10 | The changelog inside the app | done 2026-11-11 | `docs/plans/2026-11-11-10-changelog-in-app.md` | `docs/plans/2026-11-11-10-changelog-in-app-followups.md` |
| 11 | Out-of-range values in config.toml | done 2026-11-11 | `docs/plans/2026-11-11-11-config-out-of-range-values.md` | `docs/plans/2026-11-11-11-config-out-of-range-values-followups.md` |
| 12 | Open follow-ups of plans 1 to 11 | done 2026-11-17 | `docs/plans/2026-11-17-12-open-followups.md` | `docs/plans/2026-11-17-12-open-followups-followups.md` |
| 13 | Dailies | done 2026-11-18 | `docs/plans/2026-11-18-13-dailies.md` | `docs/plans/2026-11-18-13-dailies-followups.md` |
| 14 | Open follow-ups of plans 12 and 13 | done 2026-11-19 | `docs/plans/2026-11-19-14-open-followups.md` | `docs/plans/2026-11-19-14-open-followups-followups.md` |
| 15 | The contract (from the audit) | done 2026-11-20 | `docs/plans/2026-11-20-15-the-contract.md` | `docs/plans/2026-11-20-15-the-contract-followups.md` |
| 16 | Task due dates | done 2026-11-23 | `docs/plans/2026-11-23-16-due-dates.md` | `docs/plans/2026-11-23-16-due-dates-followups.md` |
| 17 | Due date follow-ups | done 2026-11-24 | `docs/plans/2026-11-24-17-due-date-follow-ups.md` | `docs/plans/2026-11-24-17-due-date-follow-ups-followups.md` |
| 18 | Performance at 5,000 pages | done 2026-11-26 | `docs/plans/2026-11-25-18-performance-at-5000-pages.md` | `docs/plans/2026-11-25-18-performance-at-5000-pages-followups.md` |
| 19 | The frontend controller | done 2026-11-26 | `docs/plans/2026-11-26-19-the-frontend-controller.md` | `docs/plans/2026-11-26-19-the-frontend-controller-followups.md` |

Plan 2's design is `docs/superpowers/specs/2026-11-07-custom-page-colors-design.md` (ledger
`.superpowers/sdd/2026-11-07-02-custom-page-colors/progress.md`). Plan 1's design is `docs/superpowers/specs/2026-11-07-page-colors-design.md`; the owner's decisions are in the design
and in the plan's "Owner decisions" section. Progress ledger: `.superpowers/sdd/2026-11-07-01-page-colors/progress.md`.

## Next

Plan 3 (custom color vividness, backlog #72) is done (2026-11-09; owner decisions and pre-flight rulings in the plan,
ledger `.superpowers/sdd/2026-11-09-03-custom-color-vividness/progress.md`). It is released as 1.2.0 (2026-11-09,
https://github.com/EightBitBoy/breccia/releases/tag/v1.2.0); the owner still checks review items 46 to 50.

Released since 1.1.0: 1.1.1, 1.2.0 and 1.3.0 (2026-11-09; 1.1.1: state chips and "Date…" in the slash menu, Journals position setting, no
"Now:" line in Git settings).

Plan 4 (follow-ups of plans 1 to 3) is done (2026-11-09; owner decisions Q1 to Q8 and pre-flight rulings in the plan,
ledger `.superpowers/sdd/2026-11-09-04-followups-of-plans-1-3/progress.md`): the color picker's preview, slider thumbs
and screen reader text, the focus and picker position for the link menu, and the jump highlight and selection on a
colored row. The owner checks review items 51 to 58.

Backlog #73 (board card button background) is done; the owner checks review item 59.
Backlog #74 (a theme button in the status bar, left of "?") is done; the owner checks review item 60.
Plan 4 and backlog #73 and #74 are released as 1.3.0 (2026-11-09,
https://github.com/EightBitBoy/breccia/releases/tag/v1.3.0). The changelog line for a bug of plan 4 itself (commit
1a3bc80) was left out of the 1.3.0 notes by hand at the release pause.
Plan 5 (GitHub Pages site, backlog #64) is done (2026-11-09; plan file `docs/plans/2026-11-09-05-github-pages-site.md`,
ledger `.superpowers/sdd/2026-11-09-05-github-pages-site/progress.md`). The site is published at
https://eightbitboy.github.io/breccia/ (GitHub Pages on, with GitHub Actions as its source, turned on on 2026-11-09 with
the owner's approval). The site lives in `site/` (plain HTML, CSS and JS, no build
step) and is deployed by `.github/workflows/pages.yml` on each push to `main` that touches `site/`, `docs/images/` or the
app icons. It is not part of the app's release, and its commits are `chore`, `test`, `ci` or `docs`. Recipes:
`just site` (a local preview at http://127.0.0.1:4173/breccia/), `just site-check` (links, alt texts, sizes, no external
requests) and `just site-shots` (the views at three widths, dark and light, into `target/site-shots/`). The owner checks
review items 61 to 63.

Plan 6, the audit's "Safety net", is done (2026-11-10; owner decisions in the plan's "Product questions", rulings in
the ledger `.superpowers/sdd/2026-11-10-06-safety-net/progress.md`). Only one Breccia runs per user (a second start
shows the open window); after an internal error Breccia reloads the notes from disk (or keeps them, and says so, when
something is unsaved) instead of staying unusable until restart; a log file with "Open log folder" in Settings >
Troubleshooting; CI on every push and pull request; monthly Dependabot, `SECURITY.md`, `CONTRIBUTING.md`; a contract
test between the core's and the frontend's names; read-only commands no longer split undo while typing. It closed
audit findings B5, B6, B7, M9, M17, M41, M52 and M54. The owner checks review items 70 to 75; nobody has yet clicked
"Open log folder" or started Breccia twice for real.

Plan 7 is done (2026-11-10; owner decisions in the plan, ledger
`.superpowers/sdd/2026-11-10-07-wash-seams-slash-dates-delete-block/progress.md`): no faint lines between the rows of a
page color wash at zoom 110 % and 125 % (backlog #75, measured by e2e step 128); "Today" and "Yesterday" with a small
calendar in the slash menu (#77); `Ctrl Shift K` deletes the whole block with its sub-blocks (#78). Plans 6 and 7 are released as 1.4.0 (2026-11-10,
https://github.com/EightBitBoy/breccia/releases/tag/v1.4.0). The owner checks review items 70 to 78.

Plan 8 is done (2026-11-11, backlog #76): the mouse wheel over the theme button switches the theme; four new themes
(Vampire, Fjord, Ember, Parchment), ten plus System in all (Oxblood, an eleventh, came after), with the light ones first; Teal's text, selection and
highlights read better. The owner checks review items 80 to 86.

Plan 9, the audit's core housekeeping, is done (2026-11-11; owner decisions Q1 and Q2 in the plan's "Product
questions", rulings in the ledger `.superpowers/sdd/2026-11-11-09-core-housekeeping/progress.md`). It is a refactor of
the core and the shell with one visible fix: a page file saved as `.MD` while Breccia runs now gives the "only `.md`
is loaded" notice at once (Q2, review item 87). The session's command dispatch is split by area
(`crates/core/src/session/`, `mod.rs` 1,494 to 522 lines), the settings code by job (`crates/core/src/config/`), the
shell's main file by job (`app/src-tauri/src/lib.rs` 1,841 to 437 lines); one path classifier serves folder open and
the watcher; workspace bookkeeping goes through one `Changes` record; link filters in search are no longer paired by
position (backlog #31). Out-of-range values in a hand-edited `config.toml` were left to plan 11 (Q1, backlog #80). It
closed audit moves M1 to M8, M10 to M14, M16, M18, M22 to M31 and M33. The owner checks review item 87.

Plan 10 is done (2026-11-11, backlog #79; ledger `.superpowers/sdd/2026-11-11-10-changelog-in-app/progress.md`):
Settings > About has a "Show changelog" button that opens the bundled `CHANGELOG.md` offline as an overlay, newest release
first, rendered as a small Markdown subset (tables, emphasis and numbered lists show as plain text); a development build
adds a note. The running version is not marked (owner decisions Q1 and Q2). The owner checks review item 88; open
follow-ups are in the plan's follow-ups file (D1: a hand-edited changelog heading can fail the release-time tests).

Plan 11 is done (2026-11-11, backlog #80; ledger `.superpowers/sdd/2026-11-11-11-config-out-of-range-values/progress.md`):
a whole number in a hand-edited `breccia/config.toml` outside its range (Git minutes 0 to 1440, archive days 1 to 3650,
negative ones too) no longer loads silently. The key is read as its default and one notice per key names it; the file
is not changed (a later Settings save of that section writes the default over it). Owner decisions Q1 to Q5: the
planned wording, the notice list only (no line in Settings), one notice per key, only that key replaced, a Settings
save may write the default. A wrong type (`"5"`) still refuses the file. The owner checks review item 89; open
follow-ups are in the plan's follow-ups file.

Released 1.5.2 on 2026-11-13 (https://github.com/EightBitBoy/breccia/releases/tag/v1.5.2): a backlog round without a plan. New:
a card dragged to the window edge scrolls the board sideways, and open cards show the day the task was created. Fixed:
an email in angle brackets links, keys typed right after Ctrl Enter are kept, an older sidebar page list no longer wins,
"Keep mine" no longer brings back undone text, a half-written config is read again, a hidden byte-order mark in pasted
text is dropped, a refused paste says so, and the index repair names the real problem. Also in that round: the backlog
was cut from 81 to 24 open items (closed ones are in `docs/backlogged.md`), `docs/vocabulary.md` was added, and 29 tests
were added (review items 91 to 102). The owner ticks those review items.

Released 1.6.0 on 2026-11-13 (https://github.com/EightBitBoy/breccia/releases/tag/v1.6.0): web addresses typed into the text
can be shown without `https://` and cut to 8 characters after the domain. Both are checkboxes in Settings, off by default,
kept on this computer. Display only, in rendered blocks, cards and preambles; the block being edited shows the raw text.
Settings got a "Themes" section (the theme picker) and "Appearance" now holds the link choices. Owner rulings: rendered
view only, new section layout, both off, length fixed. Review item 103 asks whether the length should be adjustable and
whether the editor should shorten too.

Released 1.7.0 on 2026-11-17 (https://github.com/EightBitBoy/breccia/releases/tag/v1.7.0): the `#` menu lists only existing tags, shown as `#tag` (review 104); the Appearance
checkboxes are stacked without the note (105); a third one, "Trim the trailing slash", shows a web address without a
`/` at the end, trimmed before shortening (106).

Released 1.7.1 on 2026-11-17 (https://github.com/EightBitBoy/breccia/releases/tag/v1.7.1): plan 12's fixes (the log
masks a Git password with `/`, `?` or `#` and is kept when it cannot be moved aside; a press on a slider's knob keeps
the color; joining a block onto a task keeps its `created::` and `done::` lines, and a refused join says why; the
caret after `Ctrl Shift K` stops before a task's property lines; a changelog link without text shows its address).

A whole-application audit was made on 2026-11-10 at commit `4b91b0c` (`docs/audit/2026-11-10/`, start with its
`README.md`; the ledger `progress.md` says what was read). It changed no code: 7 defects, 21 structural themes with
55 refactor moves, and a proposed order of plans. Review items 65, 67 and 69 are still open. The audit's plans 4 and 5
still wait for the owner (its "Priorities"; plan 3 is done by plan 15).

Plan 12 (open follow-ups of plans 1 to 11) is done (2026-11-17), committed but not yet pushed (owner pushes). It
worked through the 145 open items of the follow-ups files of plans 1 to 11: 55 done, 17 already settled, 11 moved to
the backlog (new items #87 to #91, notes on #85), 62 closed with a reason; every item is struck through in its file. What
a user sees: a Git password with a `/`, `?` or `#` no longer shows in the log, and a log that cannot be moved aside at its
size limit is kept; a press on a page color slider's knob no longer nudges the value; joining a block onto a task keeps
the task's `created::` and `done::` lines, and after `Backspace` in an empty block or `Ctrl Shift K` the caret stops
before them; a changelog link without text shows its web address; the website has a scroll fade on the board image at
phone width, pairs the one-line cards at tablet width and waits for the hero image. The rest is tests, tidy-ups, CI
(one run per change) and docs. The owner checks review items 107 to 114 (113 answered 2026-11-17: `Backspace` at the start of a task right below
another task stays refused, and the notice now says why in plain words, item 114). Ledger `.superpowers/sdd/2026-11-17-12-open-followups/progress.md`.

Plan 13 (Dailies) is done (2026-11-18; owner decisions and pre-flight rulings in the plan, ledger
`.superpowers/sdd/2026-11-18-13-dailies/progress.md`), committed but not yet pushed (owner pushes). It adds a Dailies view
under Journal in the sidebar: a flat list of things to do again each day. Ticking a daily greys it and sinks it below the
open ones; it opens again at the reset time, set in Settings > Dailies (default midnight, `[dailies] reset = "00:00"` in
`breccia/config.toml`). The status bar shows "Dailies N open", or "Dailies ✓" when all are done. The dailies live in
the file `breccia/dailies.md` (plain text, followed when it changes outside or by Git), which is format version 9. Deleting
a daily asks first, and there is no undo. A comment above a changed setting in `config.toml` is no longer dropped (a fix
found on the way). The owner checks review items 115 to 126 (115 is the config comment; 124 and 125 are owner tweaks after the plan: ticked dailies hide in a closed "Done (N)" section, and a "+" beside the title opens the add field). It is released as 1.8.0 (2026-11-18, https://github.com/EightBitBoy/breccia/releases/tag/v1.8.0); the two tweaks are in 1.8.1 (2026-11-19, https://github.com/EightBitBoy/breccia/releases/tag/v1.8.1).
Weekday-only dailies, a history and groups (backlog #92 to #94) are not needed (owner, 2026-11-19); open follow-ups are in the plan's follow-ups file.

Plan 14 (open follow-ups of plans 12 and 13) is done (2026-11-19; owner decisions Q1 to Q5 and pre-flight rulings F1 to F15 in
the plan, ledger `.superpowers/sdd/2026-11-19-14-open-followups/progress.md`). Every item of both follow-ups files is
struck through with its disposition. User-visible: the log hides a Git password with an apostrophe and no longer masks
part of a `file:///` address; a daily is not deleted when lines were added under it while the question was open; the
text menu (Cut, Copy, Paste) works while editing a daily; typing a valid number into a Settings number field fixes a wrong
value in `config.toml`. Two items went to the backlog (#95 a cut-off page-tree row can drag the wrong row; #96 a "nothing
left to save" signal for the e2e test). The owner checks review items 127 to 131.

Plan 15 (the contract, the audit's plan 3) is done (2026-11-20; owner answers Q1 and Q2 and pre-flight rulings in the
plan, ledger `.superpowers/sdd/2026-11-20-15-the-contract/progress.md`). It is a refactor of the contract between the
Rust core, the Tauri shell and the Svelte window; nothing a user sees changed, so there are no new review items. The
audit moves M19, M20, M35, M42, M44 and M43 are closed; M34 is still open, and the audit's plans 4 and 5 still wait.
A command's own changes now come back in its answer, not as events (spec §6 and §9; e2e checks that own edits send no
page events and outside edits do), and the window's wire types are generated by `just types` into
`app/src/lib/generated.ts`. Follow-ups are in the plan's follow-ups file.
Released 1.8.2 on 2026-11-20 (https://github.com/EightBitBoy/breccia/releases/tag/v1.8.2): emptying a daily's text deletes
it after asking, a drag handle on dailies, a web link's full address on hover and "Copy link" on right-click (review
132 and 133), and plan 14's fixes. Plan 15 (no visible change) is in it too.
Released 1.8.3 on 2026-11-23 (https://github.com/EightBitBoy/breccia/releases/tag/v1.8.3): quotes with a bar and
muted text (review 134), and an open board card keeping its new lines and pasted lines under the task (review 135).
Released 1.9.0 on 2026-11-24 (https://github.com/EightBitBoy/breccia/releases/tag/v1.9.0): task due dates (plan 16) and
their follow-ups (plan 17); the three plan 17 fix lines were dropped from the notes at the release pause, since they fix
unreleased features.

Plan 16 (task due dates) is done (2026-11-23; owner decisions, answers Q1 to Q5 and rulings in the plan, pre-flight
rulings in the ledger `.superpowers/sdd/2026-11-23-16-due-dates/progress.md`). A task gets a `due:: [[YYYY-MM-DD]]`
line (format version 10) from "Set due date…" in its right-click menu (journal days and pages) or its card menu, or
from `Ctrl D` while editing it; a due chip on rows and cards says the date in words when it is less than 6 days away
and turns amber near it and red when overdue. Ordinary pages now have the journal's right-click zone ("Copy link",
the task menu; the browser's own menu no longer opens there). The owner checks review item 136; sorting by due date is
backlog #98, the card menu's keyboard path #99. Not released yet. Follow-ups are in the plan's follow-ups file.

Plan 17 (plan 16's follow-ups) is done (2026-11-24; owner answers in the plan 16 follow-ups file and the plan's
"Settled" block, pre-flight rulings in the ledger `.superpowers/sdd/2026-11-24-17-due-date-follow-ups/progress.md`).
A due line with other text besides the date stays visible, dimmed, next to the chip; picking a new date writes one
fresh `due::` line, as Breccia does for `done::`. Ordinary pages get "Color…" on page links and tags (also a page's
link to itself). The due date calendar and the task menu keep the focus where it belongs, and today keeps its ring
when it is the chosen day. The rest is tidying and tests; the old unclosed-fence quirk is backlog #100, a very fast
click that leaves the calendar open #101. The owner checks review items 137 to 139. Both are released
as 1.9.0.

Backlog round 2026-11-24 (interactive, owner decides item by item; stopped by the owner before #87). Built and
pushed, released in 1.9.1: #13 heading links, #14 aliases, #15 drag a page into the text, #17 Back restores the edited block,
#21 and #91 undo with no block edited, #47 jump to a heading, #67 Git tests, #86 one undo step across a refused
command (review items 140 to 146). Closed: #9, #10, #11, #12, #16, #18, #19, #20, #30, #48, #49, #82. Kept open:
#83, #84. Decided, not built yet: #81 (a "Writing" tab in Help) and #85 (a plan to measure and fix speed at 5,000
pages).

Backlog round continued 2026-11-25, from #87 to the end (#101). Built and pushed, released in 1.9.1: #96 e2e waits for
"nothing left to save", #98 cards with a due date first within a priority, #99 keyboard path to a card's menu,
#101 a quick click outside the calendar closes it (review items 147 to 149). Closed: #87 (e2e stays local, before each
release; no GitHub Actions run for it, owner's call), #88, #97 (for now), #100. Kept open: #89, #90, #95. The round
is through; #81 was built after it (review item 150); #85 became plan 18.

Plan 18 (performance at 5,000 pages, backlog #85) is done (2026-11-26; owner decisions Q1 to Q4, the "Settled
2026-11-25" and "Owner, 2026-11-26" blocks and the pre-flight rulings in the plan, ledger
`.superpowers/sdd/2026-11-25-18-performance-at-5000-pages/progress.md`). Built and pushed, released in 1.9.1:
- `just perf-scale` measures the window at 5,000 pages; the baseline and the after numbers are in `docs/perf/`, and
  the bars are in spec §8.
- The window shows at once, with "Opening ‹folder›…" while the folder opens.
- A Git pull prepares its rebase without the notes lock and holds the lock for about 0.4 s instead of 0.7 to 1.5 s.
  It is safe with Git 2.53's changed `git replay`.
- The Git history and the Archive draw only the shown rows, and the history keeps its place when a commit arrives.
- The history drops two needless folder checks.
- The first index build works in smaller steps, so typing pauses less.

Still over their bars, in #85: the lock (bar 100 ms), the Git history's loads (fewer Git starts), and the full-text
merge spike. Unsettled on a busy machine: caret down, `pages.table` and the window showing. New backlog items: #103
(an early search answer) and #104 (a counter or an early journal while opening); #102 stays open. The owner checks
review items 151 to 157.

Released as 1.9.1 (2026-11-26, https://github.com/EightBitBoy/breccia/releases/tag/v1.9.1): the two backlog rounds,
#81 and plan 18. A patch number by the owner's choice, though it holds new features.

Plan 19 (the frontend controller, audit moves M36 to M40 and M49, backlog #89's window edges) is done (2026-11-26;
owner decisions Q1 to Q5 and the "Settled" block in the plan, ledger
`.superpowers/sdd/2026-11-26-19-the-frontend-controller/progress.md`). Not released yet. The window's logic moved out
of `App.svelte` into a tested `AppController` (`app/src/lib/app.svelte.ts`) and state classes, so `App.svelte` only
binds Tauri and the DOM; one value says what the main area shows, one value says which dialog is open, and the folder's
settings have their own store. Components take the state object instead of long prop lists. What a user can notice is
the recovery after an internal error:
- Q1 b: the reload's points and the "one notice a minute" rule; a second notice with other words is shown.
- Q2: the window stops waiting for a stuck save after 10 s and keeps the text in a notice to copy.
- Q3: refusals after "internal error again" say that Breccia needs a restart.
- Q4: the window is greyed out and takes no input while the notes reload.
- Q5 a: the empty "+ Add" card left by a reload is accepted and documented.
Every open dialog now closes on a reload or a folder switch. The owner checks review items 158 to 163 (163: click
through every view and dialog). Backlog #89 keeps only its two Git edges. The audit's plan 4 is done with this plan;
its plan 5 still waits. Follow-ups: `docs/plans/2026-11-26-19-the-frontend-controller-followups.md`.

Candidates for the plan after it, to settle with the owner:

- the by-hand checks in `docs/review.md` (items 1 to 63; 25 to 41 are page colors, 46 to 50 vividness, 51 to 58 plan 4,
  61 to 63 the website);
- the follow-ups of plans 1 to 3 (`docs/plans/*-followups.md`);
- backlog items the owner picks (`docs/backlog.md` holds the 30 open ones; the 66 closed ones are in
  `docs/backlogged.md`);
- automatic updates (backlog #52);
- the plans the audit proposes (`docs/audit/2026-11-10/README.md`, "Priorities").

## Test baseline

- `just test`: Vitest (1391 tests) and cargo tests (core: lib 53, integration 936 with 3 ignored; shell 102) pass
  (git-cliff 2.14.2 must be on PATH). `just lint` is clean.
- `just e2e`: 290 PASS lines, the highest step is 168 (`expectFile` prints its own PASS lines besides a step's). e2e uses its own WebView2
  folder, so an open Breccia does not disturb it. The app window starts off-screen and unfocused
  (`BRECCIA_OFFSCREEN=1`, set by `smoke.mjs`). `BRECCIA_TRACE=1 just e2e` prints the timing summary; it reports
  12 unparsed lines, the `trace git state=…` lines, which predate plan 6.
  With little memory, `CARGO_BUILD_JOBS=2 just e2e`.
- CI (`.github/workflows/ci.yml`) runs `just test` and `just lint` on every push; e2e runs only locally, before each
  release (owner, 2026-11-25: no e2e on GitHub Actions).

## Owner decisions in force

- Notes files are always saved with LF line endings; files Breccia did not change stay byte-identical (spec §2, §4).
- Commits carry no attribution lines; `.claude/settings.json` turns Claude Code's attribution off.
- The installer is not code signed (SmartScreen warns on the first run of each version).
- An open card keeps its text inside the task (owner, 2026-11-23): `Enter` on the task's own line makes a new block one
  level deeper, first under the task (text after the cursor moves into it); `Shift Tab` on a line directly under the
  task does nothing; `Alt ↑` on the first and `Alt ↓` on the last line under the task do nothing, and `Backspace` at the
  start of the task line does not merge it into the block above. Inside the task, every key works as in the journal.
  Added the same day: `Enter` at the very start of the task line, or inside its state keyword (up to and including
  the space after it), keeps the task line whole and opens an empty block first under the task; several bullet lines
  pasted into the task's line go one level deeper, first under the task, keeping their nesting, and the task line keeps
  its text (a paste without bullet lines stays in the line).
- Deleting every selected block (`Delete`, `Backspace` or `Ctrl Shift K`) keeps one empty block with the caret in it
  (owner, 2026-11-11; review 79).
- Only the NSIS installer is built; an MSI only if someone asks (backlog #51).
- The Git history view stays read-only: clicking a commit does nothing.
- One Breccia per user; a second start brings the open window to the front, with no notice (plan 6, Q3).
- After an internal error with nothing unsaved, Breccia reloads the notes and shows the journal; with unsaved edits it
  does not reload and asks for a restart (plan 6, Q1 and Q2).
- The log keeps two files of 1 MB; it may hold paths, never note text, search text or credentials (plan 6, Q5, Q6).
- Security reports go through GitHub's private vulnerability reporting; pull requests are welcome after an agreed
  issue; Dependabot runs monthly (plan 6, Q7 to Q9).
- Deleting a page removes its file for good; it does not go to the recycle bin (review item 64, 2026-11-10).
- The app no longer sends a command's own result back to the window as events; the window takes it from the command's
  answer (plan 15, Q1, owner 2026-11-20 after asking for the pros and cons; review item 66).
- The window's wire types are generated (`just types`, ts-rs, developer build only) (plan 15, Q2, owner 2026-11-20).
- Tasks get due dates (owner, 2026-11-23; built by plan 16). The property is `due:: [[YYYY-MM-DD]]`: named "due",
  a date with no time, a journal link so the task shows in that day's linked references. Finishing a task keeps its
  `due::` line; Breccia never removes it on its own. It is set by typing the line, or by "Set due date…" (a small
  calendar, with "Remove due date") in a task's right-click menu, in the card menu and on a key in the editor. A chip
  ("due 1 Dec") shows on board cards and next to tasks in pages and journal days: muted while the date is more than 2
  days away, amber from 2 days before through the day itself, red ("overdue") after it; on finished tasks it is muted.
  A date less than 6 days away is said in words ("due today", "due tomorrow", "due in 3 days"), with the date as a
  tooltip; overdue and finished chips show the date.
  Sorting board columns by due date is not in the first version.
  Added 2026-11-24 (plan 16 follow-ups): a due line with text after the date stays visible next to the chip; picking
  a date overwrites a words-only `due::` line; ordinary pages keep the journal's right-click zone and get "Color…" on
  page links too (built by plan 17). Plan 17's settled questions: picking a new date writes one fresh `due::` line, so
  words after the old date go (Ctrl Z brings them back), as for `done::` (Q1 b, owner: "do it just like" `created::` and
  `done::`); a closed card shows no words from the due line (Q2 a); a page's link to itself also gets "Color…" (Q3 a).

## Setting up a new machine or account

1. Clone `git@github.com:EightBitBoy/breccia.git`.
2. Set the repo-local git identity (see `CLAUDE.md`).
3. Install Rust, Node, `just` and the Tauri 2 prerequisites (WebView2 on Windows). Run `npm install` in `app/`.
   Install git-cliff 2.14.2 too (`winget install git-cliff`, or `cargo install git-cliff --version 2.14.2 --locked`):
   `just test` runs the real git-cliff in the release script tests, and `just release` needs it.
4. Install the `superpowers` Claude Code plugin from the `claude-plugins-official` marketplace. The workflow uses its
   writing-plans and subagent-driven-development skills.
5. Start Claude Code in the repo and say: "Read CLAUDE.md and docs/STATUS.md, then continue."
