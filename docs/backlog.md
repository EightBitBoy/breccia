# Backlog

Ideas and open work not yet in a plan. Items are numbered; a number is never reused, so plans and commits can cite
"backlog #N". When a plan picks an item up, note the plan next to its heading.

This file holds open work only. When an item is closed (done, decided, not a bug, or won't fix), move it with its notes
and its heading to `docs/backlogged.md`, keeping its number, and say in the heading how and when it closed. An item
that is only partly closed stays here, with a note on what is left.

Items marked "accepted" are rare edge cases earlier reviews chose to live with because no text is lost. They are listed
so they are not forgotten, and the owner can close any of them as "won't fix". "(to check: ...)" marks a claim that was
not verified when the list was written.

## 9. A folder renamed outside Breccia while a page in it is unsaved gives a duplicate file (Pages and links)

Choosing "Keep mine" writes a second copy at the old place. Nothing is lost, but the user has to delete one copy.
Accepted so far.

## 10. The sidebar can briefly show an older page tree (Pages and links) (done 2026-11-12, no plan; the watcher-order part is left)

Updates can arrive out of order, so an older tree can replace a newer one until the next change
(`app/src/App.svelte`, where the tree is assigned without a version check). Two quick folder opens can also start their
file watchers in the wrong order, and a refused sidebar drop does not fetch the tree again, so a stale tree stays.
Fix by ignoring older trees by version and refetching after a refused drop.

## 11. Two rare races when renaming a page (Pages and links)

A rename from the sidebar can skip the "both versions" notice for a block that is being edited and also changed on
disk; and the check that the new file name is free can race with another program. Accepted so far.

## 12. Saving to USB sticks and network drives is untested (Pages and links)

Saving was never tried on FAT/exFAT drives or network shares (SMB), where file attributes and atomic renames behave
differently. SMB applies on Windows too.

## 13. Heading-link edge cases (Pages and links)

A tag `#Page#x` counts as a link to `Page` in counts and the graph (clicks and renames are right). A heading link to a
blank page made by a click makes a second blank page `Page#H`. A page whose name contains `#` cannot be reached by a
heading link, and renaming a page to such a name breaks its heading links (Obsidian splits at the first `#` too).
Also confirm: with a page `Issue`, `[[Issue #42]]` counts as a link to `Issue` and a rename updates it; is that wanted?
(to check: whether the tag and link counting were ever split per form, `crates/core/src/index.rs`.)

## 14. Aliases: stale lists and reader edge cases (Pages and links)

After another program adds or removes an alias, the `Ctrl K` list and the completion name list stay old until asked
again. Decide whether a journal day's aliases belong in completion and open that day. Renaming a page with a clashing
alias warns about the clash again. The aliases reader drops `['a'', b']`, accepts `aliases:x` as the key and accepts
mapping-like values as names.

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

## 86. A refused command splits the typing undo step (Editor)

Found 2026-11-13 while writing the tests of #65 (`a_refused_command_between_two_edits_ends_the_typing_run` in
`crates/core/tests/it/session.rs`, which pins today's behaviour). Typing in a block is one undo step while the edits come
within a short time. If a command is refused in between (for example `Ctrl Enter` with no state in the cycle, or a state
that does not exist) the next edit starts a new step: edits before and after it need two Undos, not one. Nothing is lost
or wrong; the question is whether a refused command, which changed nothing, should leave the typing run alone. Plan 6
already made read-only commands leave it alone. To settle: refused commands too (the fix would be where the session ends
the run, `crates/core/src/session/history.rs`), or leave it as it is.
