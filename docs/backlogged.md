# Backlogged items

Items from `docs/backlog.md` that are closed: done, decided, not a bug or won't fix. They keep their number, heading
and notes, so the decisions stay findable. Plans, commits and review items may cite "backlog #N". Open and partly closed
items stay in `docs/backlog.md`.

## 2. Keys typed while a task command runs are lost (Editor) (done 2026-11-12, no plan)

After `Ctrl Enter`, `Ctrl Shift Enter` or a state picked from the slash menu, the block is read-only until the core
answers, and anything typed in that moment disappears. Queue those keys, as a block split already does
(`app/src/editor/split.ts`), or keep the editor editable (`app/src/editor/host.svelte.ts`).

## 5. A paste can be dropped without a message (Editor) (done 2026-11-12, no plan)

An outline paste that arrives at a bad moment (stale editor state) is ignored silently; the text stays on the
clipboard. Show a notice, as the other dropped-paste case does.

## 7. Email links in angle brackets do not link (Editor) (done 2026-11-12, no plan)

`<name@example.com>` shows as plain text instead of a mail link. The renderer accepts only http, https and mailto
targets and adds no `mailto:` prefix (`crates/core/src/render.rs`).

## 22. Move a card with the keyboard (Boards) (won't fix, 2026-11-12)

Owner, 2026-11-12: closed. Boards stay mouse-first for ordering; moving between columns already works from the card menu. Original note: moving a card up or down in its column (its priority) is mouse-only. Also, a focused card opens on `Ctrl Enter` and
`Ctrl Shift Enter` as on plain Enter (`BoardCard.svelte` ignores modifiers); harmless, but those keys could do nothing
there.

## 23. Dragging a card does not scroll the board sideways (Boards) (done 2026-11-12, no plan; own scroller, no new dependency)

With wide columns, a column off screen cannot be reached while dragging. The drag-and-drop library's auto-scroll
add-on would fix it.

## 24. Explain the order of finished columns (Boards) (won't fix, 2026-11-13)

Owner, 2026-11-13: closed. The cards show their done date and the spec states the order. Original note: a finished column shows no drop line because cards sort by done time. A short hint could say so.

## 25. Created time on board cards (Boards) (done 2026-11-13, no plan)

Owner, 2026-11-13: open cards show `created 26 Oct` after the source (a finished card keeps its done day; a task without a `created::` line shows nothing extra). Original note: the Archive view shows when a task was created and how long it took; open cards show nothing. Decide whether cards
should (the text is available to the card renderer).

## 26. Boards need a stable identity (Boards) (won't fix, 2026-11-13)

Owner, 2026-11-13: closed. A rename by hand or by a pull is rare and only costs hidden columns and a skipped Back step; an id would change the config format for a small gain. Original note: boards have no id in `config.toml`, so hidden columns and Back steps follow a rename only when it is made in the board
dialog. A rename by hand or by a pull loses them, and a deleted board's hidden columns apply to a new board of the same
name. Also prune the entries in `settings.json` of folders that no longer exist.

## 27. Old finished tasks from outside wait up to an hour (Boards) (won't fix, 2026-11-13)

Owner, 2026-11-13: closed. They archive by themselves within the hour, and archiving right after a pull would touch the "file changed on disk" safeguard and cause extra Git commits. Original note: a finished task older than the archive limit that arrives by a hand edit or a pull is archived on the next hourly run,
not at once.

## 28. Decide: should Enter in search create the page? (Search) (decided 2026-11-13: keep as it is)

Owner, 2026-11-13: kept as it is; "Create page" is picked with the arrow keys. Original note: today Enter opens the first matching page, not "Create page", when the typed name does not exist exactly. The owner was
to judge this while trying the app.

## 29. The indexing status item can go missing (Search) (won't fix, 2026-11-13)

Owner, 2026-11-13: closed. Rare, only the progress label is affected, search works, and the timing cannot be reproduced to test a fix. Original note: in rare timings (a folder just opened, the first index message of a new folder, or an index loop ending just as a
request arrives) the status bar does not show indexing progress until the next step. Search still works.

## 31. Link filters in search are paired by position (Search) (done 2026-11-11, plan 9)

Typed links and the query's link filters are matched by order. Add a `debug_assert` and tests for a mixed query and for
the fallback of an unknown page.

## 32. During the Git set-up question only the search box is blocked (Git sync) (decided 2026-11-13: keep as it is)

Owner, 2026-11-13: kept as it is. Original note: other actions stay usable while the "set up Git?" question is open. Decide whether that is fine.

## 33. A stale "could not be saved" notice can flash after a Git step (Git sync) (won't fix, 2026-11-13)

Owner, 2026-11-13: closed. A few milliseconds, cosmetic, cleared by the next save; a fix would number messages across core, shell and frontend. Original note: a window of a few milliseconds remains between the saved-key filter and the frontend; the next save removes the notice.
Accepted so far.

## 34. A small list of renames is never cleared (Git sync) (closed 2026-11-13: no such list found)

Checked 2026-11-13: the Git engine keeps no rename list (Git finds renames itself at commit, `git diff -M`); the only rename memory is `JustRenamed` (`app/src/lib/followRename.ts`), which expires entries after 5 seconds and is cleared on a folder switch. Closed; reopen if a growing list is found. Original note: Breccia remembers each page it renamed for the Git step and never forgets them (a few bytes per rename, until restart).

## 35. Stricter SSH address check (Git sync) (won't fix, 2026-11-12)

Owner, 2026-11-12: bracketed addresses are never used, so this stays as it is. `is_ssh_url` (`crates/core/src/git/sync.rs`) treats `]:` anywhere as the bracketed `[host]:path` form; anchor it on the
first `]`.

## 36. Git history after a failed folder open (Git sync) (not a bug, verified 2026-11-12)

Verified 2026-11-12: a failed open returns its error before the session replaces anything, so the old folder stays open and the shell's remembered path still matches it; the history showing its commits is right (pinned by `folder_open_refuses_a_folder_that_does_not_exist_or_is_a_file` in `crates/core/tests/it/session.rs`). Only a session left with no folder clears it, in the recovery. Original note: the shell keeps the previous folder's path when an open fails (`notes_root`, set in `app/src-tauri/src/watching.rs`
and cleared only by a recovery in `app/src-tauri/src/recovery.rs`), so the history could show the old folder's commits
until the next good open. Clear it on a failed open and check what the session and the Git
item show then.

## 37. Git history dates in the user's language (Git sync) (closed 2026-11-13: part of #82)

The time formats are written out in English, as in All pages; no locale is used.

Owner, 2026-11-13: checked in the code, month and weekday names are written out in English everywhere dates are shown (Git history
and its tooltip, journal day headings, All pages, Archive, the date picker, board cards), and the whole interface is
English. Closed as part of the bigger question, #82.


## 38. Comments in `config.toml` can move (Settings and themes) (closed as accepted, 2026-11-13)

After some Settings changes, a comment can move to another place in the file: blank lines between comment lines are
dropped, a removed item's comments move, a reordered list's first comment moves, a file may start with a blank line. No
comment is lost. Fixing it risks the writer that keeps the user's text; decide whether it is worth it.

Owner, 2026-11-13: closed as accepted. Editing and commenting the settings file by hand is done extremely rarely, so
keeping comments in place in every case is overengineered; no comment is ever lost. Shown with a scratch run on a file
with a title comment and a comment above each state: removing the first state collapses the blank lines between the
top comments and leaves "# the first state" above the next state; reordering the states moves the title comment down
between them and starts the file with a blank line. Reopen only if someone reports a comment in a wrong place.


## 39. Rare config and startup races (Settings and themes) (closed 2026-11-13: one fixed, two accepted)

Another program adding tasks of a state at the moment it is renamed misses the rename; a hand edit of `config.toml`
saved in place (not atomically) can give one false "cannot be read" notice. Accepted. Also (to check) a poisoned
startup lock in the shell is silent (`app/src-tauri/src/git.rs` handles a poisoned lock only at close).

Owner, 2026-11-13, decided one by one: (1) a task another program adds at the moment a state is renamed misses the
rename: accepted, it needs a write in a window of milliseconds. (2) A hand edit saved in place can give one false
"cannot be read" notice: fixed, a config file that cannot be read is read once more after a 150 ms pause
(`reload_config_after_a_pause` in `crates/core/src/session/settings.rs`; the test seam `before_config_retry` lets a test
finish the write during the pause). A really broken file costs one pause per change. (3) A poisoned startup lock is
silent: not true, the start-up open runs inside `with_session`, which recovers and tells the user (plan 6).


## 40. Task-state boxes can show typed text in the wrong row (Settings and themes) (won't fix, 2026-11-12)

Owner, 2026-11-12: closed. A file change already keeps each state's typing by keyword (`keepDrafts`); only `settleRows` (after Cancel or a rename answer) reads typing by row, and that differs only in the one render step before the boxes follow a reorder; nothing is lost or written. Original note: if a hand edit of `config.toml` reorders the states while a rename or Cancel is waiting, typed drafts are matched to
rows by position (never lost). Match them by keyword instead (`app/src/lib/settingsForm.ts`).

## 41. New dots can land on a cluster (Graph) (closed 2026-11-13: folded into #43, then #83)

A page with no saved neighbour can be placed on top of an existing group after reopening or a live change; "Re-arrange"
fixes it. Waits for profiling.

Owner, 2026-11-13: checked in `placeNodes` (`app/src/lib/graphLayout.ts`): a new page whose neighbours have no saved
position is placed from a hash of its key inside the area the known dots occupy, so it can sit on a cluster; "Re-arrange"
fixes it. Closed and folded into #43, then #83: the planned graph rework may replace the placement, so no change now.


## 42. Decide: show links that exist only through journal days? (Graph) (closed 2026-11-13: folded into #43, then #83)

With journal pages hidden (the default), two pages mentioned on the same day show no line. If the graph looks too
sparse, "lines between pages mentioned on the same day" is the candidate.

Owner, 2026-11-13: folded into #43, then #83 (the graph rework). Explained and checked against spec §7.11: with "Hide journal pages"
on (the default), pages mentioned on one journal day are loose dots; unticking the filter shows the days and connects
them. Lines between pages of the same day would add n(n-1)/2 weak lines per day (10 pages: 45), so it would need its own
switch and paler lines.


## 43. Graph ideas for later (Graph) (closed 2026-11-13: moved to #83)

A small "neighbours of this page" graph in the page view, dragging and pinning dots, several saved arrangements,
remembering filters, arrows and line weights, a global shortcut. The owner plans a graph rework later. Also for the
rework (from #41): where a new page with no saved neighbour starts, so it does not land on a cluster (today a hash of its
name inside the known area, `placeNodes` in `app/src/lib/graphLayout.ts`; "Re-arrange" fixes it). And from #42: lines
between pages mentioned on the same journal day while journal pages are hidden (as an off-by-default filter, paler lines;
a day with n pages adds n(n-1)/2 lines).

Owner, 2026-11-13: moved to #83 (re-implement the graph feature); the owner does not use the graph at the moment.


## 44. Checkbox tasks (Compatibility) (won't fix, 2026-11-13)

Obsidian writes `- [ ]` and `- [x]`; Breccia reads only state keywords, so checkbox tasks stay plain text. Open: which
states they map to; whether Breccia ever writes checkboxes (for example when such a task is dragged on a board) or
rewrites them as keywords (never without the user's consent).

Owner, 2026-11-13: closed as won't fix. Breccia stays keyword-only: Obsidian's `- [ ]` and `- [x]` stay plain text, are not
read as states and are never written.


## 45. Notes outside `pages/` and `journals/` (Compatibility) (won't fix, 2026-11-13)

An Obsidian vault keeps notes anywhere. Open: the page tree's root; where new pages go; how journals are found
elsewhere; whether this is a per-folder setting.

Owner, 2026-11-13: closed as won't fix. Breccia keeps its own layout (`journals/` and `pages/`): a top-level `.md` file or another folder is ignored, as the format reference says. An Obsidian vault can be copied into `pages/` by hand. Supporting any layout would change where every file operation puts things.


## 46. Attachments and local images (Compatibility) (won't fix, 2026-11-13: continued in #84)

Only web images show; a local image shows its alt text. Recommended place: `assets/`. Open: which paths resolve
(relative to the file, to the folder, Obsidian's `![[file.png]]`); whether pasted or dropped files are copied into
`assets/`; what a rename or delete does to them.

Owner, 2026-11-13: closed as won't fix for now; the topic continues in #84 (Assets), which the owner has not thought through yet. Checked in the code: the renderer shows an image only for an `http` or `https` address (`crates/core/src/render.rs`), and the window's security rule allows images only from the web, the app or `data:` (`app/src-tauri/tauri.conf.json`, `img-src`); a local image shows its description as plain text.


## 50. Release script rough edges (Release and build) (closed 2026-11-13: two fixed, one harmless)

The hand-restore hint `git checkout -- CHANGELOG.md` depends on the current folder (print `git -C <repo>` or the full
path); `just version` does not put back the one file whose own write failed (a partial write on a full disk); the
release workflow can leave `release-notes.tmp` on the runner (harmless).

Owner, 2026-11-13: decided one by one. (1) The undo's hand-restore hint now names the repository (`git -C "<folder>" checkout -- CHANGELOG.md`), so it works from any folder (`restoreFiles` in `app/scripts/release.mjs`). (2) `just version` now puts back the file whose own write failed as well, which a full disk can leave half written (`bumpVersion` in `app/scripts/version.mjs`, with a `write` parameter for the test). (3) A leftover `release-notes.tmp` on the CI runner: harmless, the runner is thrown away.


## 51. An MSI installer, only if someone asks (Release and build) (won't fix for now, 2026-11-13)

Only the per-user NSIS `.exe` installer ships. An MSI suits managed or company installs, but needs a second bundle
target and a second file per release (and numeric pre-release versions).

Owner, 2026-11-13: closed. Nobody has asked; an MSI would add a second bundle target and a second file to every release, and numeric-only versions. Re-open if an organisation wants managed installs (the per-user NSIS `.exe` stays the only installer).


## 52. Automatic updates (Release and build) (won't fix, 2026-11-13)

The installed app checks a small `latest.json` on start and from a "Check for updates" button, asks "Version X.Y.Z is
available: Install / Later", downloads, checks the signature against a key built into the app, installs and restarts. A
setting turns the check off (no network call the user did not want), and no update starts with unsaved text. Needs an
update-signing key (a repository secret), the release workflow attaching signed files and `latest.json`, and public
downloads: an installed app cannot download from a private repository, so this is blocked until the repository is
public. The first version with the updater is installed by hand.

Owner, 2026-11-13: closed. Updates stay manual: download the installer from the GitHub release page. The old blocker (a private repository) is gone, since the repository has been public since 1.0.0, so this can be re-opened as a plan: a signing key as a repository secret, signed update files and `latest.json` from the release workflow, the Tauri updater plugin, a setting to turn the check off, and no update with unsaved text.


## 53. Linux is not verified (Release and build) (won't fix for now, 2026-11-13)

The webview speed test passed only conditionally under WSLg (typing was marginal). Unix file permissions, fsync and
symlink saving never ran; folder names are matched ignoring case (so `projects` next to `Projects` is impossible on
Linux) and recent folders are compared ignoring case; the graph and the end-to-end test are Windows-only. Re-run on
native Linux before Linux is promised; that is real work, not just a check.

Owner, 2026-11-13: closed. Linux is neither shipped nor promised (the release builds only the Windows installer). Re-open as a plan if Linux is wanted: a pass on native Linux (build, tests, the webview speed check, Unix permissions, fsync, symlink saving, case-sensitive folder names), then the fixes it finds.


## 56. The graph at 5,000 pages (Performance) (closed 2026-11-13: moved to #83)

Dragging meets the 50-frames-per-second bar, wheel zoom does not (about 10 FPS, frames up to 670 ms; the one
performance line not met). Profile the graph library's wheel-zoom animation first (its per-frame picking pass, a full
re-process per step). The whole graph (about 2 MB) is resent on every outside change; the layout never settles and
stops at 10 s; the graph code is larger than estimated and carries an unused helper. A few hundred pages are far below
this.

Owner, 2026-11-13: moved to #83 (re-implement the graph feature); the owner does not use the graph at the moment.


## 64. A GitHub Pages site (Docs) (done 2026-11-09, plan 5)

After the repository is public (Pages needs a paid plan before that). A `site/` folder published by a workflow, plain
HTML and CSS on one page: one sentence on what Breccia is, the README screenshots, about five feature blocks, a
"Download for Windows" button (a version-less installer copy on each release makes a stable "latest" link), a note that
SmartScreen warns because the installer is unsigned, links to GitHub, the changelog and the format docs. Not the `docs/`
folder. Answered in plan 5 (`docs/plans/2026-11-09-05-github-pages-site.md`, rulings R1 and R2): the button opens the
newest release and shows no version number, and the screenshots are copied into `site/` when the site is built.
Open: a custom domain.

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

Update 2026-11-12 (#71): the "Breccia (test)" title is done. `BRECCIA_WINDOW_TITLE` renames the windows
(`app/src-tauri/src/window.rs`); e2e, screenshots and graph-scale set it.

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

## 75. Faint lines between rows of a page color wash (Page colors) (done 2026-11-10, plan 7)

Owner, 2026-11-09, with a screenshot (dark theme, a journal day, a blue wash behind a DOING row and behind a DONE
row with sub-blocks): the washes are drawn as one band, but faint horizontal lines show between the rows inside it,
at the border of each block. The screenshot is the owner's own notes, so it is not in the repository; it was
`Pictures\Screenshots\Artifact.png` on the owner's PC.

Owner, 2026-11-09 (follow-up): the Windows display scale is 100 %. The lines show at a Breccia zoom of 125 % and of
110 %, and not at 100 %. That fits the fractional-pixel guess below, because the app's own zoom gives fractional row
heights. The owner wants it planned right after the 1.3.0 release.

Plan 7 measured it: at zoom 110 % and 125 % the gap shows the page background (not a darkened overlap), and opaque
named washes plus a 1 px reach under the next row fixed it. The first guess was: every block draws its own see-through wash background
(`.block.wash` in `app/src/styles/app.css`), so at a fractional pixel height (zoom, or a zoom such as 110 % or 125 %)
two neighbouring rows are anti-aliased at their shared edge and a thin seam of the page background shows. A custom
wash is opaque and a named wash is see-through, so check whether named and custom colors both show it, and at which
zoom levels and display scales.

Ways to fix, for the plan to weigh: draw the wash once per run of blocks (one element behind the group); or overlap
neighbouring rows by a pixel without doubling the see-through color; or snap the row heights to whole pixels. Needs an
e2e or screenshot check at a few zoom levels, in all themes.

## 76. Wheel over the theme button, and more themes (Themes) (done 2026-11-11, plan 8)

Owner, 2026-11-09: if possible, when the pointer is over the theme button in the status bar (backlog #74), the scroll
wheel cycles through the themes (System and the themes, in the menu's order; decide whether the list wraps, and keep
the choice on this computer only, like the menu does). At the same time add a few more themes, at least one dark,
reddish one. Take inspiration from other popular IDEs and editors (for example Monokai, Dracula, Nord, Solarized,
Gruvbox, One Dark, Tokyo Night, Ayu; check each theme's licence and use only the idea and the general palette, not
copied files). Each new theme needs all tokens in `app/src/styles/tokens.css`, the readability checks of the
existing themes (page colour washes, text and link contrast), a place in Settings > Appearance and the status bar
menu, and a look at the card buttons (#73) in it. Plan it as one plan; ask the owner which themes to add.

## 77. Slash menu: "Yesterday", and "Today" with a calendar icon (Editor) (done 2026-11-10, plan 7)

Owner, 2026-11-10: the slash menu gets an entry "Yesterday" that inserts yesterday's date, the same way "Today's
date" inserts today's (a link to that journal day). "Today's date" is renamed to "Today". Maybe a small calendar icon
next to both entries, the same one that is shown next to the "Journal" button. Planned with plan 7 (after the
safety net, with #75). To settle in the plan: whether the icon stays ("maybe"), whether "Date…" gets it too, the
order of the entries, and that typing "date" in the menu still finds both (`app/src/lib/slash.ts`).

## 78. A shortcut that deletes the whole block (Editor) (done 2026-11-10, plan 7)

Owner, 2026-11-10: there needs to be a keyboard shortcut that deletes a whole block. Today a block goes away with
`Backspace` only when it is empty, or after selecting it (`Shift ↑/↓`) and pressing delete (spec §7, editor keys). To
settle in the plan: the key (for example `Ctrl Shift K`, as in VS Code, or `Ctrl Shift Backspace`; it must not
collide with an existing shortcut), what happens to the block's children (deleted with it, or moved up one level),
where the caret goes afterwards, that `Ctrl Z` brings the block back, and a line in the F1 overlay and in Settings >
Keyboard. Planned with plan 7 (with #75 and #77).

## 79. The changelog inside the app (Settings) (done 2026-11-11, plan 10)

Owner, 2026-11-11: the About section of Settings should have a button that shows the changelog directly inside the
application. To settle in the plan: where the text comes from (the `CHANGELOG.md` that `just release` writes, built
into the app, so it works offline and needs no network request), how it is shown (a view or an overlay, rendered as
Markdown), whether it opens at the running version, how it is closed (`Esc`), and what it shows in a dev build before
the first release.

## 80. Out-of-range values in a hand-edited `config.toml` (Settings) (done 2026-11-11, plan 11)

Owner, 2026-11-11 (plan 9, Q1): Settings refuses a Git interval over 1,440 minutes and "archive after" outside 1 to
3,650 days, but a `breccia/config.toml` edited by hand with, say, `pull_interval_minutes = 100000` or
`archive_after_days = 0` loads without a word and is used as written. Plan 9 kept that behaviour; the rule now lives in
one place (`GitSettings::check` and `BoardSettings::check` in `crates/core/src/config/`), so it could apply to the file
too. To settle in the plan, with the wording: (a) the file loads, each out-of-range value is replaced by its default
for this run, and one notice names the key (the file is not rewritten); or (b) the file is refused like a file with a
bad state keyword: Breccia keeps the settings it had and shows "cannot be read". Cost: one call in `Config::validate`
and a notice text.
