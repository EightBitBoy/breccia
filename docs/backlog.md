# Backlog

Ideas and open work not yet in a plan. Items are numbered; a number is never reused, so plans and commits can cite
"backlog #N". When a plan picks an item up, note the plan next to its heading.

This file holds open work only. When an item is closed (done, decided, not a bug, or won't fix), move it with its notes
and its heading to `docs/backlogged.md`, keeping its number, and say in the heading how and when it closed. An item
that is only partly closed stays here, with a note on what is left.

Items marked "accepted" are rare edge cases earlier reviews chose to live with because no text is lost. They are listed
so they are not forgotten, and the owner can close any of them as "won't fix". "(to check: ...)" marks a claim that was
not verified when the list was written.

## 81. Explain basic syntax in the help dialog (Docs)

Owner, 2026-11-12: the help dialog (`F1`) lists shortcuts but does not explain the basic syntax a user writes: `[[links]]`,
`#tags`, task keywords, `key:: value` properties, `**bold**`, `<https://…>` and `<name@example.com>` links, and so on.
Add a short section. To settle: which syntax belongs in it (Breccia's own, or Markdown basics too), whether it is a second
tab or a block below the shortcuts, and whether a test keeps it in line with `docs/format.md`.

Owner, 2026-11-24: a second tab "Writing" next to "Shortcuts", with one small example per syntax: Breccia's own
first (links, tags, tasks, properties, due dates), then the Markdown basics; a test keeps it in line with
`docs/format.md`. Queued.

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

Owner, 2026-11-24: stays open for a later rebuild; the graph stays as it is until then.

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

Owner, 2026-11-24: still thinking; stays open.

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

Owner, 2026-11-24: measure and fix now, as a plan (measure at 5,000 pages, then fix the worst points: the blank first
window, the Git pause, long lists). Written after the backlog round.

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

Owner, 2026-11-25: keep open; do it together with the controller move (M39).

## 90. Log Git failures, and maybe window errors (Safety net)

From plan 12 triage (plan 6 follow-up 15). Only Git panics are logged (`git.rs`); a failing Git command and the window's
`console.error` are not. Window errors may hold note text, and the owner's rule is that the log never holds note text,
so this needs a decision on what may be logged (for example the error kind without its message).

Owner, 2026-11-25: keep open, decide later (recommended then: Git failures as command and error kind only, no
window errors).

## 95. Pressing a cut-off page-tree row can drag the wrong row (Pages and links)

From plan 14 triage (plan 13 follow-up 2). Pressing a page-tree row that is cut off at the sidebar's edge can start a
drag on the wrong row. It was found while building Dailies and happens more in short windows, since the sidebar now has
the Dailies entry. The cause is not known (it may be WebView2's own drag handling). To do: find steps that show it,
then the cause.

Owner, 2026-11-25: keep open until it shows up again with steps.

## 101. A very fast click on a block's text leaves the due date calendar open (Editor)

From plan 17, task 6. A click on a block's text that lasts under 10 ms leaves the due date calendar open: the
calendar's library closes it 10 ms after the press, and by then the editor has replaced the element that was pressed.
Slower clicks close it as they should. After such a fast click, a later pick or Esc no longer gives the focus back. Find a way to close the calendar that does not depend on the pressed element.
