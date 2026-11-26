# Backlog

Ideas and open work not yet in a plan. Items are numbered; a number is never reused, so plans and commits can cite
"backlog #N". When a plan picks an item up, note the plan next to its heading.

This file holds open work only. When an item is closed (done, decided, not a bug, or won't fix), move it with its notes
and its heading to `docs/backlogged.md`, keeping its number, and say in the heading how and when it closed. An item
that is only partly closed stays here, with a note on what is left.

Items marked "accepted" are rare edge cases earlier reviews chose to live with because no text is lost. They are listed
so they are not forgotten, and the owner can close any of them as "won't fix". "(to check: ...)" marks a claim that was
not verified when the list was written.

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

Owner, 2026-11-13: parked as one item (it was #54, #55, #57, #58 and #59). Owner, 2026-11-24: measured and fixed as plan
18 (`docs/plans/2026-11-25-18-performance-at-5000-pages.md`); numbers and decisions are in
`docs/perf/2026-11-25-baseline.md`. This item is partly closed: what is left is below. Measure with `just perf-scale`
and `cargo test --release -p breccia-core -- --ignored --nocapture scale::` (test folder of 5,000 pages).

**Closed by plan 18 (2026-11-26), within their bars at 5,000 pages:** the window shows (408 ms, bar 500; one launch of
three 715 on a cold WebView2), typing during the first index build (wait p95 12.6 ms, bar 16), the index step (about
7.5 ms for 10 pages, bar 16), caret down at 5,000 rows (12.9 ms, bar 16; the outline is not virtualised, which would
be the fix if it grows), `pages.table` (96 ms, bar 100: at the bar), `page.setColor` on a page linked from 1,000
(148 ms), the first `archive.auto` run (610 ms), `block.setText` (7 ms), the long Git history and archive lists (drawn
by rows on screen), the blank first window (the folder opens inside the window), queued change messages to the Git
thread (cost next to nothing: a step does Git work only when a commit or a pull is due). Plan 1 follow-ups 9 and 15 and
old #59 are answered by these numbers.

**Still open:**
- **1c. The notes lock during a pull, under 100 ms.** About 350 to 360 ms after plan 18 task 6a (before: 424 to 1,267)
  with a save during the fetch, none, or just before the lock. The rest is Git programs run under the notes lock
  (rebase, status, hooks and Git LFS also run there). Fix: no Git program under the lock; apply the pulled change in
  memory or in a scratch worktree. Big.
- **2c. Fewer Git starts per history load.** `git.log` of 200 of 3,000 commits is about 181 to 193 ms (bar 100), with a
  remote never pushed to 186 to 224 ms; the window opens the history in about 0.34 s (bar 200). Cause: five or six Git
  programs started in a row. Fix: keep the found repository and remote between loads (drop them when the folder, branch
  or remote changes), drop the separate HEAD check, run the "not pushed" check at the same time as the history read.
- **2d. After a commit, reload only the newest 200 history rows** and merge them with the kept ones (a full reload when
  they do not overlap, e.g. after a pull rewrote more than 200 commits). Today, after ten "Show more", each commit
  re-reads all 2,200 rows (about 0.3 s of Git work, off the notes lock, so typing never waits).
- **A search during the first build** waits for the whole index: see #103. **A counter or an early journal day while
  a folder opens:** see #104.
- **The longest index step** (about 130 to 155 ms, twice per build, at the same two steps each run): the cause is
  SQLite's full-text segment merge, not the step size, the first-step check or the disk (a WAL checkpoint was ruled
  out; with the merge turned off the worst step fell to about 80 ms, but ordinary steps got slower). The step is rare (2 of 500
  steps), so typing sees it as a single pause of about 0.15 s during the first build only. A fix would merge in small
  steps (`INSERT INTO blocks_fts(blocks_fts, rank) VALUES('merge', N)`) between index steps.
- **Large folders in general** (was #54): at 5,000 pages typing takes about 13 ms of a 16 ms frame in the core;
  building the page tree, comparing a reloaded file and merging watcher events grow faster than the folder size; the
  journal feed keeps every loaded day and searches them one by one. Fine at today's sizes.
- **`graph.get`** at 5,000 pages (about 120 ms, bar 100) belongs to #83.
- Per keystroke on a journal, `PageView::of` parses the links of every top-level block again and `index_page`
  allocates a key for every colored page (within noise: `block.setText` 7 ms).

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

## 102. Fast typing with Enter during the first indexing puts letters in the wrong row (Editor)

Found 2026-11-25 by plan 18's `just perf-scale` (Task 2), on the 5,005-page test folder during the first index build:
a letter, then `Enter`, then the next letter, each 40 ms apart, put several letters into the last row in reverse order
("mkige" instead of e, g, i, k and m in their own rows). Nothing was lost, but text landed in the wrong place (spec
anti-goal §2). It looks like a reproducible case of closed #1 (misplaced text while typing fast, accepted as rare),
which said to reopen if it shows up. Steps are in `docs/perf/2026-11-25-baseline.md` and the plan 18 Task 2 notes; the
measuring script now waits for each new row before typing on. To do: reproduce in an e2e step, find the cause (likely
keys queued while a split is in flight), fix.

## 103. Search answers from the partial index during the first build (Search)

Plan 18 Q2 (b), owner 2026-11-25: a search typed while the first index build runs waits for the complete index (534 ms
after the query in the window at 5,000 pages; 4,064 ms from the start of the build in the core; a few seconds on a
slower machine). Idea: answer at once from the pages indexed so far, marked "Still indexing: N of M pages searched",
and update the answer when the build ends. The window needs the marked state and a second answer; the core needs a
query that does not flush the pending pages first (`search.query` does today). Not needed at today's numbers.

## 104. A counter or an early journal day while a folder opens (Window)

Plan 18 Q1 (a), owner 2026-11-25: later work. Today the window shows at 408 ms and says "Opening..."; the journal is
usable at about 1.3 s (bar 2 s) at 5,000 pages, so neither is needed on this machine. For much bigger folders or slow
disks there are two options: a count in the status bar ("Opening: 1,200 of 5,000 files"), or today's journal day first,
typeable while the rest of the folder is read (this one needs the editor to accept edits before the folder is loaded,
which is the larger change).
