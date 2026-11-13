# Backlog

Ideas and open work not yet in a plan. Items are numbered; a number is never reused, so plans and commits can cite
"backlog #N". When a plan picks an item up, note the plan next to its heading.

This file holds open work only. When an item is closed (done, decided, not a bug, or won't fix), move it with its notes
and its heading to `docs/backlogged.md`, keeping its number, and say in the heading how and when it closed. An item
that is only partly closed stays here, with a note on what is left.

Items marked "accepted" are rare edge cases earlier reviews chose to live with because no text is lost. They are listed
so they are not forgotten, and the owner can close any of them as "won't fix". "(to check: ...)" marks a claim that was
not verified when the list was written.

## 1. Rare duplicate or misplaced text while typing fast (Editor)

Pressing keys inside the short save round-trip can, rarely, duplicate a block or a pasted piece, or put text in the
wrong place: a reshape then Enter within 0.3 s, keys queued while a split runs, Ctrl+Backspace or Ctrl+Delete during a
split, a cancel that cannot reach a queued save, a paste put back after leaving a block. Nothing is lost. One cheap fix:
reset the editor to the saved text after an "invalid offset" answer (`app/src/editor/`; no such handling exists today).
Accepted so far; decide whether to harden.

## 3. Unfinished IME input is lost when clicking away (Editor)

Text being composed with an input method (Japanese, Chinese, some keyboards) and not yet committed disappears when the
user clicks elsewhere. Matters once non-Latin input is a goal. Accepted so far.

## 4. Menu keyboard edge cases (Editor)

Enter does nothing while the slash menu is open and the editor is busy; the slash menu opens when the cursor is merely
placed after `/x`; other keys do not clear an old selection; in two cases the link menu leaves the slash menu closed.
Small polish; accepted so far (to check: which of these still happen).

## 6. "Keep mine" can resend old typed text (Editor)

The record of typed text that "Keep mine" uses grows per block and may be resent after a change that was not typing
(undo, cycling a state). It is cleared when the page is switched. (to check: whether growth and the stale resend still
happen, in `app/src/editor/host.svelte.ts`.)

## 8. Small rendering flaws (Editor)

A finished task whose link spans two lines is crossed out unevenly; the done chip and properties are placed by
searching for the first paragraph end, which is fragile (`crates/core/src/render.rs`); a plain-text paste keeps an
invisible byte-order mark at its start (to check: the last one).

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

## 42. Decide: show links that exist only through journal days? (Graph)

With journal pages hidden (the default), two pages mentioned on the same day show no line. If the graph looks too
sparse, "lines between pages mentioned on the same day" is the candidate.

## 43. Graph ideas for later (Graph)

A small "neighbours of this page" graph in the page view, dragging and pinning dots, several saved arrangements,
remembering filters, arrows and line weights, a global shortcut. The owner plans a graph rework later. Also for the
rework (from #41): where a new page with no saved neighbour starts, so it does not land on a cluster (today a hash of its
name inside the known area, `placeNodes` in `app/src/lib/graphLayout.ts`; "Re-arrange" fixes it).

## 44. Checkbox tasks (Compatibility)

Obsidian writes `- [ ]` and `- [x]`; Breccia reads only state keywords, so checkbox tasks stay plain text. Open: which
states they map to; whether Breccia ever writes checkboxes (for example when such a task is dragged on a board) or
rewrites them as keywords (never without the user's consent).

## 45. Notes outside `pages/` and `journals/` (Compatibility)

An Obsidian vault keeps notes anywhere. Open: the page tree's root; where new pages go; how journals are found
elsewhere; whether this is a per-folder setting.

## 46. Attachments and local images (Compatibility)

Only web images show; a local image shows its alt text. Recommended place: `assets/`. Open: which paths resolve
(relative to the file, to the folder, Obsidian's `![[file.png]]`); whether pasted or dropped files are copied into
`assets/`; what a rename or delete does to them.

## 47. Headings and same-page heading links (Compatibility)

`[[Page#Heading]]` links to the page already. Open: showing or jumping to the heading, and `[[#Heading]]` (today a page
named `#Heading`).

## 48. Block links and embeds (Compatibility)

Obsidian's `[[x#^id]]` and `![[x]]`, Logseq's `((uuid))` and `{{embed [[x]]}}` are not read. Open: which syntax Breccia
would write; whether it adds block ids (`id::` or `^id`) to text the user wrote.

## 49. Front-matter values (Compatibility)

Only `aliases` is read from front matter. Open: whether `tags:` counts as tags; whether `title:` (or a `title::` inside
front matter) names the page; whether Breccia ever writes front matter, keeping YAML comments and formatting.

## 50. Release script rough edges (Release and build)

The hand-restore hint `git checkout -- CHANGELOG.md` depends on the current folder (print `git -C <repo>` or the full
path); `just version` does not put back the one file whose own write failed (a partial write on a full disk); the
release workflow can leave `release-notes.tmp` on the runner (harmless).

## 51. An MSI installer, only if someone asks (Release and build)

Only the per-user NSIS `.exe` installer ships. An MSI suits managed or company installs, but needs a second bundle
target and a second file per release (and numeric pre-release versions).

## 52. Automatic updates (Release and build)

The installed app checks a small `latest.json` on start and from a "Check for updates" button, asks "Version X.Y.Z is
available: Install / Later", downloads, checks the signature against a key built into the app, installs and restarts. A
setting turns the check off (no network call the user did not want), and no update starts with unsaved text. Needs an
update-signing key (a repository secret), the release workflow attaching signed files and `latest.json`, and public
downloads: an installed app cannot download from a private repository, so this is blocked until the repository is
public. The first version with the updater is installed by hand.

## 53. Linux is not verified (Release and build)

The webview speed test passed only conditionally under WSLg (typing was marginal). Unix file permissions, fsync and
symlink saving never ran; folder names are matched ignoring case (so `projects` next to `Projects` is impossible on
Linux) and recent folders are compared ignoring case; the graph and the end-to-end test are Windows-only. Re-run on
native Linux before Linux is promised; that is real work, not just a check.

## 54. Large folders (Performance)

At 5,000 pages typing takes about 13 ms of a 16 ms frame in the core; building the page tree, comparing a reloaded file
and merging watcher events grow faster than the folder size; the journal feed keeps every loaded day and searches them
one by one. Fine at today's sizes; measure with thousands of pages and days.

## 55. Faster first start and first indexing on large folders (Performance)

At 5,000 pages: a search during the first index build waits about 3 s (answer from what is indexed so far, marked
incomplete); the folder opens before the window shows, so a slow first open is a blank window (open after the window
appears, with an "Opening..." state; Windows Defender adds about 8 ms per fresh file); the first background indexing
step takes 100 to 120 ms against a 16 ms budget (one typing pause); typing during the first build was never measured
with both threads running (`BRECCIA_TRACE=1`).

## 56. The graph at 5,000 pages (Performance)

Dragging meets the 50-frames-per-second bar, wheel zoom does not (about 10 FPS, frames up to 670 ms; the one
performance line not met). Profile the graph library's wheel-zoom animation first (its per-frame picking pass, a full
re-process per step). The whole graph (about 2 MB) is resent on every outside change; the layout never settles and
stops at 10 s; the graph code is larger than estimated and carries an unused helper. A few hundred pages are far below
this.

## 57. Git work that can make typing wait (Performance)

At 5,000 pages the notes lock is held about 577 ms (bar 500) when a pull brings changes and a save landed during the
fetch; the cost is Git's rebase, and a fix would rebase outside the lock (for example in a scratch worktree). Git hooks
(and Git LFS) also run while the notes are locked, and queued change messages to the Git thread are not merged.

## 58. Long lists are not virtualised (Performance)

The Git history (after many "Show more") and the Archive view (thousands of tasks) may get slow; the All pages
virtualiser could be reused. The Git history also re-reads every shown row after each commit, and reads every
not-pushed hash on each load for a remote never pushed to.

## 59. The first automatic archive run on a large old folder (Performance)

It changes many files in one command and is one slow answer, once.

## 60. Document two small behaviours (Docs)

Enter (split) trims spaces at the join, and "Keep mine" overwriting onto a non-UTF-8 file or a folder is not described
(`crates/core/src/edit.rs`, `crates/core/src/workspace/`). Code comments, not the format document.

## 61. Show the created time in the demo and screenshots (Docs) (demo done 2026-11-12; screenshots left)

`docs/demo/` has no `created::` lines, so the README screenshots never show "after N days" on a done chip. Add some and
retake the screenshots (`just screenshots`).

Update 2026-11-12 (#61): the three finished tasks in `docs/demo/` now have `created::` lines and done times, so the
chip reads "after 7 days" and so on in the app. The README screenshots still do not show it: the journal image ends
above the one finished task (27 Oct), and board cards show only the done date. Retaking them would change nothing;
to show the chip, change what `app/e2e/screenshots.mjs` frames (scroll the journal to 27 Oct).

## 62. Long lines in the format reference (Docs)

`docs/format.md` has a few lines over 120 characters in code examples and tables (to check: not re-counted).

## 63. A fixed vocabulary (Docs)

One glossary (for example `docs/vocabulary.md`): each term, a one-line meaning, where it shows up (page, journal day,
block, task, state, card, board, column, folder, linked-only page, linked references, archive, sidebar, status bar,
view). Open: which word wins where several are used ("linked-only" vs "virtual"); whether UI text and docs are brought
in line; whether a test checks UI strings; whether CLAUDE.md points to it.

## 65. Core test gaps (Tests)

Missing tests: an unknown keyword in the state cycle; setting the same state keeps the bytes; trailing blank lines in a
block; a whitespace-only new page name; reload errors (no file, not UTF-8, I/O); "Keep mine" onto a taken path or a
deleted file; a block id round-trip; paste edge cases (deeper last block, `\r` caret, a preamble then a blank line, a
wider random offset range); undo coalescing after a failed request; creating `a` while `A.MD` exists; `..` in folder
paths; reloads that reorder blocks; aliases (a real backslash in `[[x\|y]]`, the alias winner after a move, a case-only
rename re-indexing, a keystroke leaving the clash check idle, a CRLF hand-written list).

## 66. App test gaps (Tests)

Split followed by leaving the page sends the text at the cursor; page create, rename and delete flows beyond delete;
the sidebar opening ancestors and folding; Escape in the menus and the held page reload; typing into one Settings box
while another's change is refused (no component test harness); the rollback when one page of a multi-page board drop
refuses its edit (no case could be built).

## 67. Git and release test gaps (Tests)

No test for the message when Git's own rebase abort fails (needs a fake `git`); no test for a push that hangs (to check:
only the separate push URL has one); the "close gave up" tests never had a recorded failing run (to check); the release
undo's per-file restore failure and unreadable-changelog branches are untested (to check); the changelog's "Breaking
changes" group has never been produced.

## 68. End-to-end test limits (Tests)

The end-to-end test runs only on Windows; the slash menu's date items use the real clock instead of the test clock, so
a run across midnight can still fail; the Ctrl + mouse wheel zoom step failed once in five runs (stayed at 110 %): wait
for the wheel to be handled before reading the status item; one step reuses another step's locator.

## 69. Missing end-to-end steps (Tests)

A full app restart (hidden columns read back at start); the Git history's "No commits yet", "not pushed" mark and "Show
more"; a folder switch clearing Back/Forward; a board renamed in its dialog being followed. All have unit tests or
by-hand checks only.

## 70. Test and code tidy-ups (Tests)

An unused field in the link test helper (`app/src/lib/links.test.ts`); "go to day" repeats "open page" in
`app/src/App.svelte`; `format_doc.rs` checks only two-word fence info strings for typos; the case check in
`app/scripts/docs.test.mjs` walks from the drive root; `PKG` and `PKG_LOCK` in `app/scripts/fixtures.mjs` sit under the
`CHANGELOG` comment; smaller review notes from the pages build were only kept in an old run log and not carried (to
check: whether any are wanted).

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
