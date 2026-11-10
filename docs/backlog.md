# Backlog

Ideas and open work not yet in a plan. Items are numbered; a number is never reused, so plans and commits can cite
"backlog #N". When a plan picks an item up, note the plan next to its heading.

Items marked "accepted" are rare edge cases earlier reviews chose to live with because no text is lost. They are listed
so they are not forgotten, and the owner can close any of them as "won't fix". "(to check: ...)" marks a claim that was
not verified when the list was written.

## 1. Rare duplicate or misplaced text while typing fast (Editor)

Pressing keys inside the short save round-trip can, rarely, duplicate a block or a pasted piece, or put text in the
wrong place: a reshape then Enter within 0.3 s, keys queued while a split runs, Ctrl+Backspace or Ctrl+Delete during a
split, a cancel that cannot reach a queued save, a paste put back after leaving a block. Nothing is lost. One cheap fix:
reset the editor to the saved text after an "invalid offset" answer (`app/src/editor/`; no such handling exists today).
Accepted so far; decide whether to harden.

## 2. Keys typed while a task command runs are lost (Editor)

After `Ctrl Enter`, `Ctrl Shift Enter` or a state picked from the slash menu, the block is read-only until the core
answers, and anything typed in that moment disappears. Queue those keys, as a block split already does
(`app/src/editor/split.ts`), or keep the editor editable (`app/src/editor/host.svelte.ts`).

## 3. Unfinished IME input is lost when clicking away (Editor)

Text being composed with an input method (Japanese, Chinese, some keyboards) and not yet committed disappears when the
user clicks elsewhere. Matters once non-Latin input is a goal. Accepted so far.

## 4. Menu keyboard edge cases (Editor)

Enter does nothing while the slash menu is open and the editor is busy; the slash menu opens when the cursor is merely
placed after `/x`; other keys do not clear an old selection; in two cases the link menu leaves the slash menu closed.
Small polish; accepted so far (to check: which of these still happen).

## 5. A paste can be dropped without a message (Editor)

An outline paste that arrives at a bad moment (stale editor state) is ignored silently; the text stays on the
clipboard. Show a notice, as the other dropped-paste case does.

## 6. "Keep mine" can resend old typed text (Editor)

The record of typed text that "Keep mine" uses grows per block and may be resent after a change that was not typing
(undo, cycling a state). It is cleared when the page is switched. (to check: whether growth and the stale resend still
happen, in `app/src/editor/host.svelte.ts`.)

## 7. Email links in angle brackets do not link (Editor)

`<name@example.com>` shows as plain text instead of a mail link. The renderer accepts only http, https and mailto
targets and adds no `mailto:` prefix (`crates/core/src/render.rs`).

## 8. Small rendering flaws (Editor)

A finished task whose link spans two lines is crossed out unevenly; the done chip and properties are placed by
searching for the first paragraph end, which is fragile (`crates/core/src/render.rs`); a plain-text paste keeps an
invisible byte-order mark at its start (to check: the last one).

## 9. A folder renamed outside Breccia while a page in it is unsaved gives a duplicate file (Pages and links)

Choosing "Keep mine" writes a second copy at the old place. Nothing is lost, but the user has to delete one copy.
Accepted so far.

## 10. The sidebar can briefly show an older page tree (Pages and links)

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

## 22. Move a card with the keyboard (Boards)

Moving a card up or down in its column (its priority) is mouse-only. Also, a focused card opens on `Ctrl Enter` and
`Ctrl Shift Enter` as on plain Enter (`BoardCard.svelte` ignores modifiers); harmless, but those keys could do nothing
there.

## 23. Dragging a card does not scroll the board sideways (Boards)

With wide columns, a column off screen cannot be reached while dragging. The drag-and-drop library's auto-scroll
add-on would fix it.

## 24. Explain the order of finished columns (Boards)

A finished column shows no drop line because cards sort by done time. A short hint could say so.

## 25. Created time on board cards (Boards)

The Archive view shows when a task was created and how long it took; open cards show nothing. Decide whether cards
should (the text is available to the card renderer).

## 26. Boards need a stable identity (Boards)

Boards have no id in `config.toml`, so hidden columns and Back steps follow a rename only when it is made in the board
dialog. A rename by hand or by a pull loses them, and a deleted board's hidden columns apply to a new board of the same
name. Also prune the entries in `settings.json` of folders that no longer exist.

## 27. Old finished tasks from outside wait up to an hour (Boards)

A finished task older than the archive limit that arrives by a hand edit or a pull is archived on the next hourly run,
not at once.

## 28. Decide: should Enter in search create the page? (Search)

Today Enter opens the first matching page, not "Create page", when the typed name does not exist exactly. The owner was
to judge this while trying the app.

## 29. The indexing status item can go missing (Search)

In rare timings (a folder just opened, the first index message of a new folder, or an index loop ending just as a
request arrives) the status bar does not show indexing progress until the next step. Search still works.

## 30. Search index repair messages (Search)

When a damaged index cannot be deleted or reopened, the warning still names the original error; a second damage leaves
the file until the next start. Wording, code comments and progress counts only.

## 31. Link filters in search are paired by position (Search)

Typed links and the query's link filters are matched by order. Add a `debug_assert` and tests for a mixed query and for
the fallback of an unknown page.

## 32. During the Git set-up question only the search box is blocked (Git sync)

Other actions stay usable while the "set up Git?" question is open. Decide whether that is fine.

## 33. A stale "could not be saved" notice can flash after a Git step (Git sync)

A window of a few milliseconds remains between the saved-key filter and the frontend; the next save removes the notice.
Accepted so far.

## 34. A small list of renames is never cleared (Git sync)

Breccia remembers each page it renamed for the Git step and never forgets them (a few bytes per rename, until restart).

## 35. Stricter SSH address check (Git sync)

`is_ssh_url` (`crates/core/src/git/sync.rs`) treats `]:` anywhere as the bracketed `[host]:path` form; anchor it on the
first `]`.

## 36. Git history after a failed folder open (Git sync)

The shell keeps the previous folder's path when an open fails (`app/src-tauri/src/lib.rs`), so the history could show
the old folder's commits until the next good open. Clear it on a failed open and check what the session and the Git
item show then.

## 37. Git history dates in the user's language (Git sync)

The time formats are written out in English, as in All pages; no locale is used.

## 38. Comments in `config.toml` can move (Settings and themes)

After some Settings changes, a comment can move to another place in the file: blank lines between comment lines are
dropped, a removed item's comments move, a reordered list's first comment moves, a file may start with a blank line. No
comment is lost. Fixing it risks the writer that keeps the user's text; decide whether it is worth it.

## 39. Rare config and startup races (Settings and themes)

Another program adding tasks of a state at the moment it is renamed misses the rename; a hand edit of `config.toml`
saved in place (not atomically) can give one false "cannot be read" notice. Accepted. Also (to check) a poisoned
startup lock in the shell is silent (`app/src-tauri/src/git.rs` handles a poisoned lock only at close).

## 40. Task-state boxes can show typed text in the wrong row (Settings and themes)

If a hand edit of `config.toml` reorders the states while a rename or Cancel is waiting, typed drafts are matched to
rows by position (never lost). Match them by keyword instead (`app/src/lib/settingsForm.ts`).

## 41. New dots can land on a cluster (Graph)

A page with no saved neighbour can be placed on top of an existing group after reopening or a live change; "Re-arrange"
fixes it. Waits for profiling.

## 42. Decide: show links that exist only through journal days? (Graph)

With journal pages hidden (the default), two pages mentioned on the same day show no line. If the graph looks too
sparse, "lines between pages mentioned on the same day" is the candidate.

## 43. Graph ideas for later (Graph)

A small "neighbours of this page" graph in the page view, dragging and pinning dots, several saved arrangements,
remembering filters, arrows and line weights, a global shortcut. The owner plans a graph rework later.

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

## 61. Show the created time in the demo and screenshots (Docs)

`docs/demo/` has no `created::` lines, so the README screenshots never show "after N days" on a done chip. Add some and
retake the screenshots (`just screenshots`).

## 62. Long lines in the format reference (Docs)

`docs/format.md` has a few lines over 120 characters in code examples and tables (to check: not re-counted).

## 63. A fixed vocabulary (Docs)

One glossary (for example `docs/vocabulary.md`): each term, a one-line meaning, where it shows up (page, journal day,
block, task, state, card, board, column, folder, linked-only page, linked references, archive, sidebar, status bar,
view). Open: which word wins where several are used ("linked-only" vs "virtual"); whether UI text and docs are brought
in line; whether a test checks UI strings; whether CLAUDE.md points to it.

## 64. A GitHub Pages site (Docs) (done 2026-11-09, plan 5)

After the repository is public (Pages needs a paid plan before that). A `site/` folder published by a workflow, plain
HTML and CSS on one page: one sentence on what Breccia is, the README screenshots, about five feature blocks, a
"Download for Windows" button (a version-less installer copy on each release makes a stable "latest" link), a note that
SmartScreen warns because the installer is unsigned, links to GitHub, the changelog and the format docs. Not the `docs/`
folder. Answered in plan 5 (`docs/plans/2026-11-09-05-github-pages-site.md`, rulings R1 and R2): the button opens the
newest release and shows no version number, and the screenshots are copied into `site/` when the site is built.
Open: a custom domain.

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

## 71. Dev runs share the installed app's settings and notes folder (Tests) (done 2026-11-06, no plan: `just dev` part)

Asked by the owner on 2026-11-06: can a test run clash with the installed Breccia used for real notes? Findings:

- `just e2e`, `just screenshots` and `just graph-scale` are already kept apart. Each run sets `BRECCIA_CONFIG_DIR`
  to a temp dir (settings, window state and the search index cache go there), its own WebView2 profile
  (`WEBVIEW2_USER_DATA_FOLDER`), a temp notes folder (`BRECCIA_FOLDER`) and its own Git identity, starts the window
  off-screen and unfocused, and ends the app by its process id only, never by name. While a run lasts, a second
  Breccia tray icon shows (e2e needs the tray: it tests the close-to-tray path); the window title is "Breccia" too.
- `just dev` and `just dev-debug` are not kept apart. They use the same identifier (`dev.breccia.app`), so they read
  and write the installed app's config dir (`settings.json`: the notes folder, recent folders, theme, hidden columns,
  window state), its search index cache and its WebView2 profile. A dev run therefore opens the real notes folder, can
  edit it and run Git sync on it, and can change the installed app's settings. With the installed app open,
  `just dev-debug` passes other WebView2 arguments for the same profile, which WebView2 can refuse.

Proposal: the dev recipes run with their own identity, for example `tauri dev --config` with the identifier
`dev.breccia.app.dev` and the title "Breccia (dev)", so their config dir, cache and WebView2 profile are their own,
and point them at a sample notes folder (a copy of `docs/demo/`) unless one is given. Optionally give test runs the
title "Breccia (test)" so a stray window is easy to tell apart. The installed app and its data stay as they are.

Owner decisions (2026-11-06): each dev run opens a fresh copy of `docs/demo/` in a temp folder, and starts with fresh
settings in a temp config dir, like e2e; nothing a dev run does is kept.

Done for `just dev` and `just dev-debug` (`app/scripts/dev.mjs`, identifier `dev.breccia.app.dev`, title
"Breccia (dev)"). Still open: the "Breccia (test)" title for e2e, screenshot and graph-scale runs.

## 72. Custom page colors: a strength slider too (Page colors) (done 2026-11-09, plan 3)

Done as the Vividness slider: see `docs/plans/2026-11-09-03-custom-color-vividness.md`.

Owner, 2026-11-07: custom page colors start with a hue slider only (lightness and vividness come from the theme). If
that proves too limited, add a second slider for vividness. The app would still lower it per theme wherever text
readability needs that, so the slider can seem to stop at some point; the picker's preview line shows why.

## 73. Board card buttons need a visible background (Boards) (done 2026-11-09)

Owner, 2026-11-09: on the board, hovering a card shows two small buttons, the arrow (↗, opens the page or journal day
at the block) and the "…" card menu. Their background matches the card's background, so they hardly stand out. Give
them a different background color rather than a border (the owner prefers color because the buttons are small). It
has to work in all six themes and the System dark block, and in the hover and open states (`app/src/styles/app.css`,
`.card .jump`, `.card .card-menu`, `.card .tools button`; colors only in `app/src/styles/tokens.css`). Check the
contrast of the arrow and the dots against the new background.

## 74. A theme picker in the status bar (Themes) (done 2026-11-09)

Owner, 2026-11-09: in the status bar, next to the help ("?") button, add a button that opens a theme picker, so the
theme can be changed without opening Settings. It offers the same choices as Settings > Appearance (System and the six
themes) and behaves the same: the choice applies at once and is kept on this computer only. Implement it directly, as
a small change without a plan, right after backlog #73; then release a new version.

## 75. Faint lines between rows of a page color wash (Page colors)

Owner, 2026-11-09, with a screenshot (dark theme, a journal day, a blue wash behind a DOING row and behind a DONE
row with sub-blocks): the washes are drawn as one band, but faint horizontal lines show between the rows inside it,
at the border of each block. The screenshot is the owner's own notes, so it is not in the repository; it was
`Pictures\Screenshots\Artifact.png` on the owner's PC.

Owner, 2026-11-09 (follow-up): the Windows display scale is 100 %. The lines show at a Breccia zoom of 125 % and of
110 %, and not at 100 %. That fits the fractional-pixel guess below, because the app's own zoom gives fractional row
heights. The owner wants it planned right after the 1.3.0 release.

Not yet reproduced. Likely cause (a guess to test first): every block draws its own see-through wash background
(`.block.wash` in `app/src/styles/app.css`), so at a fractional pixel height (zoom, or a zoom such as 110 % or 125 %)
two neighbouring rows are anti-aliased at their shared edge and a thin seam of the page background shows. A custom
wash is opaque and a named wash is see-through, so check whether named and custom colors both show it, and at which
zoom levels and display scales.

Ways to fix, for the plan to weigh: draw the wash once per run of blocks (one element behind the group); or overlap
neighbouring rows by a pixel without doubling the see-through color; or snap the row heights to whole pixels. Needs an
e2e or screenshot check at a few zoom levels, in all themes.

## 76. Wheel over the theme button, and more themes (Themes)

Owner, 2026-11-09: if possible, when the pointer is over the theme button in the status bar (backlog #74), the scroll
wheel cycles through the themes (System and the themes, in the menu's order; decide whether the list wraps, and keep
the choice on this computer only, like the menu does). At the same time add a few more themes, at least one dark,
reddish one. Take inspiration from other popular IDEs and editors (for example Monokai, Dracula, Nord, Solarized,
Gruvbox, One Dark, Tokyo Night, Ayu; check each theme's licence and use only the idea and the general palette, not
copied files). Each new theme needs all tokens in `app/src/styles/tokens.css`, the readability checks of the
existing themes (page colour washes, text and link contrast), a place in Settings > Appearance and the status bar
menu, and a look at the card buttons (#73) in it. Plan it as one plan; ask the owner which themes to add.

## 77. Slash menu: "Yesterday", and "Today" with a calendar icon (Editor)

Owner, 2026-11-10: the slash menu gets an entry "Yesterday" that inserts yesterday's date, the same way "Today's
date" inserts today's (a link to that journal day). "Today's date" is renamed to "Today". Maybe a small calendar icon
next to both entries, the same one that is shown next to the "Journal" button. Planned with plan 7 (after the
safety net, with #75). To settle in the plan: whether the icon stays ("maybe"), whether "Date…" gets it too, the
order of the entries, and that typing "date" in the menu still finds both (`app/src/lib/slash.ts`).

## 78. A shortcut that deletes the whole block (Editor)

Owner, 2026-11-10: there needs to be a keyboard shortcut that deletes a whole block. Today a block goes away with
`Backspace` only when it is empty, or after selecting it (`Shift ↑/↓`) and pressing delete (spec §7, editor keys). To
settle in the plan: the key (for example `Ctrl Shift K`, as in VS Code, or `Ctrl Shift Backspace`; it must not
collide with an existing shortcut), what happens to the block's children (deleted with it, or moved up one level),
where the caret goes afterwards, that `Ctrl Z` brings the block back, and a line in the F1 overlay and in Settings >
Keyboard. Planned with plan 7 (with #75 and #77).
