# Backlog

Ideas and open work not yet in a plan. Items are numbered; a number is never reused, so plans and commits can cite
"backlog #N". When a plan picks an item up, note the plan next to its heading.

This file holds open work only. When an item is closed (done, decided, not a bug, or won't fix), move it with its notes
and its heading to `docs/backlogged.md`, keeping its number, and say in the heading how and when it closed. An item
that is only partly closed stays here, with a note on what is left.

Items marked "accepted" are rare edge cases earlier reviews chose to live with because no text is lost. They are listed
so they are not forgotten, and the owner can close any of them as "won't fix". "(to check: ...)" marks a claim that was
not verified when the list was written.

## 13. Heading-link edge cases (Pages and links)

A tag `#Page#x` counts as a link to `Page` in counts and the graph (clicks and renames are right). A heading link to a
blank page made by a click makes a second blank page `Page#H`. A page whose name contains `#` cannot be reached by a
heading link, and renaming a page to such a name breaks its heading links (Obsidian splits at the first `#` too).
Also confirm: with a page `Issue`, `[[Issue #42]]` counts as a link to `Issue` and a rename updates it; is that wanted?
(to check: whether the tag and link counting were ever split per form, `crates/core/src/index.rs`.)

Owner, 2026-11-24 (checked against the code first): fix A (a click on a heading link to a missing or empty page
makes `Page`, not `Page#H`), B (`#` is no longer allowed in a new page name or a rename, as in Obsidian; existing such
pages keep working for plain links) and C (a tag never counts as a link). Keep D: `[[Issue #42]]` counts as a link to
a page `Issue`, as in Obsidian. In progress.

## 14. Aliases: stale lists and reader edge cases (Pages and links)

After another program adds or removes an alias, the `Ctrl K` list and the completion name list stay old until asked
again. Decide whether a journal day's aliases belong in completion and open that day. Renaming a page with a clashing
alias warns about the clash again. The aliases reader drops `['a'', b']`, accepts `aliases:x` as the key and accepts
mapping-like values as names.

Owner, 2026-11-24 (checked against the code first): fix 1 (the `Ctrl K` list and the `[[` completion names refresh
when an alias changes outside Breccia), 3 (an alias clash is warned once, not again after a rename) and 4 (the reader
understands `''` inside single quotes, needs a space after `aliases:`, and ignores mapping-like values, as YAML and
Obsidian do). Keep 2: journal days' aliases work as the spec says. Queued after #13.

## 15. More ways to drag pages (Pages and links)

Drag a page from the All pages table onto a sidebar folder; drag a page from the sidebar into the outline to insert a
`[[link]]`; drag several selected rows at once (needs multi-select in the tree); a keyboard "pick up, move, drop" mode
(today the Move... menu item is the keyboard way).

## 16. Back and Forward follow renames made outside Breccia (Pages and links)

A page file renamed in Explorer, a renamed or moved folder, and a board renamed in `config.toml` or by a pull are
skipped on Back instead of followed. Detecting such renames (same text, new name) would fix the first; the board case
needs boards to have an identity (see "Boards need a stable identity").

## 17. Back and Forward restore more (Pages and links)

Not restored today: the selected or edited block, the highlight after a card jump, a board's sideways scroll, the
graph's camera, the Settings section, the All pages and Archive filters, and a deep scroll in the Git history (only the
first 200 rows load again).

## 18. Closing a card does not wait for a pending delete (Boards)

The late answer is applied to the journal day instead. Nothing is lost. Accepted so far.

## 19. A second way to add tasks would lose its new task (Boards)

The board's "+ Add" cleanup deletes an empty new task that arrives while the board is not shown. Any future feature that
also appends to the journal (for example quick capture) must be told apart first; the guard is a comment in
`app/src/lib/route.ts`.

## 20. Board settings could mix up two boards if several change at once (Boards)

When one save deletes a board and adds another at the same position, the new one would inherit the deleted one's
comments and keys in `config.toml`. Cannot happen with today's dialog (one change per save); revisit if that changes.

## 21. Undo on the board (Boards)

`Ctrl Z` while no block is edited should take back the last board change (a drop, a move). Today undo needs an editor
open on one of the changed pages; the undo request is sent only from the editor.

## 30. Search index repair messages (Search) (wording done 2026-11-13; the rest left open)

Owner, 2026-11-13: only the wording was fixed: a repair that cannot delete or reopen the file now names that failure. Left open: a second damage leaves the file until the next start, and the progress counts. Original note: when a damaged index cannot be deleted or reopened, the warning still names the original error; a second damage leaves
the file until the next start. Wording, code comments and progress counts only.

## 47. Headings and same-page heading links (Compatibility)

`[[Page#Heading]]` links to the page already. Open: showing or jumping to the heading, and `[[#Heading]]` (today a page
named `#Heading`).

## 48. Block links and embeds (Compatibility)

Obsidian's `[[x#^id]]` and `![[x]]`, Logseq's `((uuid))` and `{{embed [[x]]}}` are not read. Open: which syntax Breccia
would write; whether it adds block ids (`id::` or `^id`) to text the user wrote.

## 49. Front-matter values (Compatibility)

Only `aliases` is read from front matter. Open: whether `tags:` counts as tags; whether `title:` (or a `title::` inside
front matter) names the page; whether Breccia ever writes front matter, keeping YAML comments and formatting.

## 67. Git and release test gaps (Tests) (partly done 2026-11-13; two cases left)

Done 2026-11-13: the release undo's two error branches are tested ("Could not put back" and "could not be read",
`app/scripts/release.test.mjs`); the changelog's "Breaking changes" group is produced once with a temp repository and the
real git-cliff (`app/scripts/changelog.test.mjs`; it sits first, above Features); the "close gave up" tests were checked
by breaking the code (the `finish_close` tests go red; the first `gave_up` check in `begin_close` is redundant with the
second, so removing it changes nothing observable). All three were mutation-checked.

Left: no test for the message when Git's own rebase abort fails (needs a fake `git`: `Git::with_program` takes one, so a
`.cmd` file on Windows and a script elsewhere, and a real conflict first); no test for a push that hangs (to check: only
the separate push URL has one; the same fake `git`).

## 81. Explain basic syntax in the help dialog (Docs)

Owner, 2026-11-12: the help dialog (`F1`) lists shortcuts but does not explain the basic syntax a user writes: `[[links]]`,
`#tags`, task keywords, `key:: value` properties, `**bold**`, `<https://…>` and `<name@example.com>` links, and so on.
Add a short section. To settle: which syntax belongs in it (Breccia's own, or Markdown basics too), whether it is a second
tab or a block below the shortcuts, and whether a test keeps it in line with `docs/format.md`.

## 82. Translate the interface (Docs)

Owner, 2026-11-13 (from #37): the interface is English only. Month and weekday names are fixed English lists in several
places (`app/src/lib/gitLog.ts`, `allPages.ts`, `archive.ts`, `calendar.ts`, `git.ts`, and the journal headings in the
core), and all texts (menus, buttons, notices, Settings) are English. Open: whether Breccia gets other languages at all
(and which, German first?); a translation system for the texts; dates shown through the system locale; typed dates in
search (`12 Mar`, `yesterday`) understanding the same language as the shown ones; what the notes format keeps unchanged
(state keywords, `created::` and `done::` lines, `[[YYYY-MM-DD]]` journal names never change with the language).

## 83. Re-implement the graph feature (Graph)

Owner, 2026-11-13: the owner does not use the graph at all at the moment, and plans to re-implement the feature later.
Everything graph-related is collected here (it was #43 and #56, and the notes of #41 and #42); until a plan exists, the
graph stays as it is. Spec: §7.11 (network view). To settle in the plan: which of these are wanted, and whether the
existing view (sigma.js and graphology, ForceAtlas2 in a worker) is kept or replaced.

**Ideas** (from #43, "Graph ideas for later"):
- a small "neighbours of this page" graph in the page view (spec §7.11 says "later");
- dragging and pinning dots;
- several saved arrangements;
- remembering the filters;
- arrows and line weights;
- a global shortcut.

**From #41 (closed, folded in):** where a new page with no saved neighbour starts. Today `placeNodes`
(`app/src/lib/graphLayout.ts`) puts it at a hash of its name inside the area the known dots occupy, so it can land on a
cluster; "Re-arrange" fixes it.

**From #42 (closed, folded in):** with "Hide journal pages" on (the default), pages mentioned on the same journal day are
loose dots. Lines between them would be an off-by-default filter with paler lines; a day with n pages adds n(n-1)/2
lines (10 pages: 45).

**Performance** (from #56, "The graph at 5,000 pages"): dragging meets the 50-frames-per-second bar, wheel zoom does not
(about 10 FPS, frames up to 670 ms; the one performance line not met). Profile the graph library's wheel-zoom animation
first (its per-frame picking pass, a full re-process per step). The whole graph (about 2 MB) is resent on every outside
change; the layout never settles and stops at 10 s; the graph code is larger than estimated and carries an unused
helper. A few hundred pages are far below this. `just graph-scale` measures it.

## 84. Assets: images and attachments in notes (Compatibility)

Owner, 2026-11-13 (from #46): "something I never thought about yet". Not decided; this item holds the question and what
is known, to think about before any plan.

**Today:** only web images show (`![alt](https://…)`). A local file shows its description as plain text: the renderer
accepts only `http` and `https` addresses (`crates/core/src/render.rs`) and the window's security rule allows images only
from the web, the app itself and `data:` (`app/src-tauri/tauri.conf.json`, `img-src`).

**What the owner has to think about:**
- Whether notes should hold pictures and other files at all, and for what (screenshots, photos, PDFs).
- Where the files live: `assets/` in the notes folder is the recommended place.
- Which paths resolve: relative to the note's file, relative to the notes folder, Obsidian's `![[file.png]]`.
- Whether pasting or dropping a file copies it into `assets/` and writes the link, and how names are made unique.
- What a rename, move or delete of a note, an image, or the `assets/` folder does to the links and files.

**Costs to weigh:**
- Security: the window may then read files from the notes folder, which relaxes today's rule; paths must never leave the
  folder (no `..`, no links or junctions that escape it).
- Git: images are binary files that Git sync commits and pushes, so a screenshot habit makes the repository grow.
- Breccia's anti-goal §2: it must never delete or rewrite a file the user put there.
- Other files: PDFs and the like need a way to open them, not just show them.
- Work: core (paths, copying), security rule, editor (paste and drop), format reference, tests, an e2e step.

## 85. Performance with very large folders (Performance)

Owner, 2026-11-13: parked as one item (it was #54, #55, #57, #58 and #59), to be taken up when a folder grows past a few
thousand pages or someone reports slowness. Nothing here is wrong at today's sizes. The measurements are from a test
folder of 5,000 pages (`just graph-scale`, `crates/core/tests/it/scale.rs`); the graph's own numbers are in #83.

**Large folders** (was #54):
At 5,000 pages typing takes about 13 ms of a 16 ms frame in the core; building the page tree, comparing a reloaded file
and merging watcher events grow faster than the folder size; the journal feed keeps every loaded day and searches them
one by one. Fine at today's sizes; measure with thousands of pages and days.

**Faster first start and first indexing on large folders** (was #55):
At 5,000 pages: a search during the first index build waits about 3 s (answer from what is indexed so far, marked
incomplete); the folder opens before the window shows, so a slow first open is a blank window (open after the window
appears, with an "Opening..." state; Windows Defender adds about 8 ms per fresh file); the first background indexing
step takes 100 to 120 ms against a 16 ms budget (one typing pause); typing during the first build was never measured
with both threads running (`BRECCIA_TRACE=1`).

**Git work that can make typing wait** (was #57):
At 5,000 pages the notes lock is held about 577 ms (bar 500) when a pull brings changes and a save landed during the
fetch; the cost is Git's rebase, and a fix would rebase outside the lock (for example in a scratch worktree). Git hooks
(and Git LFS) also run while the notes are locked, and queued change messages to the Git thread are not merged.

**Long lists are not virtualised** (was #58):
The Git history (after many "Show more") and the Archive view (thousands of tasks) may get slow; the All pages
virtualiser could be reused. The Git history also re-reads every shown row after each commit, and reads every
not-pushed hash on each load for a remote never pushed to.

**The first automatic archive run on a large old folder** (was #59):
It changes many files in one command and is one slow answer, once.

**Notes from plan 12 triage (2026-11-17):** three more measure-first items belong here. Plan 1 follow-up 9: nobody has measured a color pick on a page that many journal days link to (it re-sends every one of those days). Plan 1 follow-up 15: per keystroke on a journal, `PageView::of` parses the links of every top-level block again and `index_page` allocates a key for every colored page (measured within noise: `block.setText` median 11.95 ms against 12.37 ms). Plan 7 follow-up 19: the caret lookup is quadratic in the shown rows (one frame at about 4,000 to 5,000 rows).

## 86. A refused command splits the typing undo step (Editor)

Found 2026-11-13 while writing the tests of #65 (`a_refused_command_between_two_edits_ends_the_typing_run` in
`crates/core/tests/it/session.rs`, which pins today's behaviour). Typing in a block is one undo step while the edits come
within a short time. If a command is refused in between (for example `Ctrl Enter` with no state in the cycle, or a state
that does not exist) the next edit starts a new step: edits before and after it need two Undos, not one. Nothing is lost
or wrong; the question is whether a refused command, which changed nothing, should leave the typing run alone. Plan 6
already made read-only commands leave it alone. To settle: refused commands too (the fix would be where the session ends
the run, `crates/core/src/session/history.rs`), or leave it as it is.

## 87. Run the end-to-end test in CI (Tests)

From plan 12 triage (plan 6 follow-up 21; audit M53). `just e2e` runs only on the owner's machine; CI runs `just test`
and `just lint`. Running it there needs a Windows runner with a display and about 5 minutes per run (WebView2 and the
release build), so it wants its own plan: when to run it (every push, or only on `main` and tags), and caching of the
release build.

## 88. A custom domain for the website (Website)

From plan 12 triage (plan 5 follow-up 10; left "Open" by the closed #64). The site is on the GitHub Pages address. A
custom domain needs a domain purchase and DNS settings, then the `CNAME` file, the HTTPS setting and the links in the
README and in the app. The owner's decision.

## 89. Recovery after an internal error: edges left (Safety net)

From plan 12 triage (plan 6 follow-ups 4, 5, 9, 10). Four edges of the recovery that plan 6 built:

- A Git step that fails mid-rebase leaves a rebase that the fresh Git engine treats as the user's, so sync stays stuck
  until the user resolves it.
- After a Git failure the fresh engine's pull is due at once; if it keeps failing, every save recovers and reloads the
  window (user-paced). Edits made before the failure are not scheduled for a commit until the next change or sync click
  (closing the app still commits them); no test records this.
- The 60-second rule can hide a more serious notice: a recovery that keeps the session within a minute of a reload, or a
  closed folder after a kept session, shows no new notice.
- The window's reload (`clear()` in `App.svelte`): a flush that never settles keeps the quiet window open; after the
  "again" notice other commands show the raw "request is for generation" text; an error during the flush ends with the
  sidebar's actions dropped; an empty "+ Add" card can be left. Best done with the audit's move M39 (the controller into
  `lib/`).

## 90. Log Git failures, and maybe window errors (Safety net)

From plan 12 triage (plan 6 follow-up 15). Only Git panics are logged (`git.rs`); a failing Git command and the window's
`console.error` are not. Window errors may hold note text, and the owner's rule is that the log never holds note text,
so this needs a decision on what may be logged (for example the error kind without its message).

## 91. Undo on the page with nothing selected (Editor)

From plan 12 triage (plan 7 follow-up 23). With nothing edited or selected, `Ctrl Z` does nothing; the undo history is
the page's, so a page-level `Ctrl Z` could take back the last change (a delete, a move, a state change) without first
clicking into a block. A new feature: decide the keys and what it should cover.

## 95. Pressing a cut-off page-tree row can drag the wrong row (Pages and links)

From plan 14 triage (plan 13 follow-up 2). Pressing a page-tree row that is cut off at the sidebar's edge can start a
drag on the wrong row. It was found while building Dailies and happens more in short windows, since the sidebar now has
the Dailies entry. The cause is not known (it may be WebView2's own drag handling). To do: find steps that show it,
then the cause.

## 96. A "nothing left to save" signal for the e2e test (Tests)

From plan 14 triage (plan 13 follow-up 15). `expectFile` and `expectFileLike` in `app/e2e/smoke.mjs` wait a fixed
second for the save pause. The window could expose when nothing is pending and the write queue is idle, so these waits
become waits for a state, not for time.

## 97. Multi-line quotes break at an empty line (Editor)

From the owner, 2026-11-23, after 1.8.3 styled quotes. A quote (`> …`) ends at an empty line, as in standard Markdown,
so a text with `>` only on its first line shows as a quote up to its first empty line and as plain text after it.
Writing `>` on every line, and a lone `>` on empty lines, keeps it one quote, but that is tedious to type. Options
discussed: (1) `Shift Enter` on a quote line and a multi-line paste into one add `> ` to each new line; (2) a text whose
first line starts with `>` shows wholly as a quote (no typing, but other apps show it differently); (3) a Quote command
that adds or removes `>` on every line of the selection. Recommended: 1 with 3, which keeps the file standard Markdown.
The owner is thinking about it; decide before building.

## 98. Sort board columns by due date (Boards)

From plan 16, owner 2026-11-23: not in the first version of due dates. Options: a column setting, or due dates first
after `priority::` (soonest first, cards without a due date after them). Decide before building.

## 99. A keyboard path to a card's menu (Boards)

From plan 16. The button of a card's menu shows only on hover, so the card menu (with Archive and "Set due date…") cannot
be reached by keyboard. This was so before due dates. A task in a journal day or on a page has the key `Ctrl D` while
editing; a card has none. Options: show the button when the card has the focus, or a key on the focused card.

## 100. A line swallowed by an unclosed code fence is re-indented when its block is written (Editor)

From plan 16, follow-up 5; the owner settled on 2026-11-24 that it goes to the backlog. When a block has an opening
code fence that is never closed, the lines after it belong to the fence. Setting or removing a due date or a priority
replaces a property line, and the replacement re-indents a neighbouring line that the fence swallowed. Typing in such a
block probably does the same (not checked). The words stay, but the spacing is not the user's. It was so before due dates. Decide whether
Breccia should leave the lines of an unclosed fence as they are.

## 101. A very fast click on a block's text leaves the due date calendar open (Editor)

From plan 17, task 6. A click on a block's text that lasts under 10 ms leaves the due date calendar open: the
calendar's library closes it 10 ms after the press, and by then the editor has replaced the element that was pressed.
Slower clicks close it as they should. After such a fast click, a later pick or Esc no longer gives the focus back. Find a way to close the calendar that does not depend on the pressed element.
