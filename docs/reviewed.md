# Reviewed items

Items from `docs/review.md` that the owner ticked off, with their notes, under the same headings and numbers.

## Carried over from the prototype

1. [x] **Column menu:** hovering a board column shows only the hide icon. The DONE column's ... menu offers only "Archive
   finished more than N days ago"; other columns have no ... menu.
2. [x] **Scrollbars hide at rest:** the main view's scrollbars (also the board's sideways one) and the sidebar's page
   and tag list show only while the mouse moves over them or they scroll (wheel, keys, thumb), and fade about 1 s after
   the mouse rests or leaves. Text never shifts. Check both themes, and that the scrollbar can still be grabbed.
3. [x] **Showing a hidden column is animated:** a click on a hidden column's marker widens it from the line in about
   150 ms (none with Windows' reduce-animations setting). A column that opens while a dragged card rests on its marker
   appears at once.
4. [x] **Hide a column, then drag:** start a card drag within 150 ms of hiding a column; the old column should not stay
   half-narrowed.
5. [x] **`just e2e` from your own terminal:** run it once and confirm no window flashes and keyboard focus stays where it
   was.
6. [x] **Manual pass: sidebar, tree, watcher:** with `just dev`, try the sidebar layout, the page tree, folding, opening
   ancestors, and edits made outside Breccia (rename or delete files and folders in Explorer).
7. [x] **Manual pass: journal, boards, first automatic archive:** on a real notes folder, check the journal, boards and
   the first automatic archive run (does it change what you expect?).
8. [x] **Search, typed dates, date picker, status bar:** try search (including Enter on a name that does not exist, which
   is open question backlog #28), typed dates, the date picker and the status bar items.
13. [x] **Resize and theme switching:** resize the window and switch themes with the journal and All pages open.
14. [x] **System theme follows Windows:** set the theme to System, change Windows between light and dark, and watch
   Breccia follow (no automated test covers this).
16. [x] **Faded dots in Dark, Violet and Graphite:** faded dots must stay visible but quiet in each theme.
21. [x] **Very narrow window:** the sidebar button and the back and forward buttons at the top of the main area should
   still fit and work.
22. [x] **Install on a clean machine:** on a second PC or in Windows Sandbox with internet, check the SmartScreen
   warning, no admin prompt, the version in Settings, that a notes folder opens, and that uninstalling keeps the notes
   (never recorded as done; you install releases on your own PC).

## Release 1.0.0

23. [x] **First release text:** with no `v*` tag yet, `just release 1.0.0` writes "First public release." as the
   `## [1.0.0]` section of `CHANGELOG.md` (instead of "No user-visible changes."). Check it at the pause; it becomes
   the GitHub release text.

## After 1.0.0

24. [x] **Source code link in Settings:** Settings, About has a "Source code" row with the link
   github.com/EightBitBoy/breccia. A click opens it in your browser; the app window stays where it was.

## Page colors

25. [x] **Swatch and picker:** the swatch's look with and without a color, the grid's order and marking of the current
   color, keys, and that a pick writes only the `color::` line.
26. [x] **Washes in the journal:** first-link rule, sub-blocks following their parent, merging of consecutive blocks,
   the gap between two pages of the same color, and that a day page looks the same as the feed.
27. [x] **Every theme:** the 25 colors and their washes in Light, Dark, Violet, Graphite, Taupe, Teal and System (both
   Windows modes); text, links and tags readable. Light and Taupe use a 28 % wash, Teal 30 %, the others 34 %.
28. [x] **The color names:** crimson, red, coral, orange, amber / yellow, olive, lime, green, emerald / teal, cyan,
   sky, blue, indigo / violet, purple, magenta, pink, rose / brown, tan, sand, slate, grey. They are written into
   files and cannot easily change later.
33. [x] **Escape in the color picker:** select a few blocks, open a page's color picker with the keyboard (focus the
   swatch, Enter) and press Escape: the picker closes and the blocks stay selected.

29. [x] **Undo after a pick:** `Ctrl Z` right after a pick brings the old color back (or removes the line), redo puts
   it back, and earlier typing on the page stays undoable. Undoing the first pick on a tag-only page leaves its
   new file empty.

30. [x] **Tag-only page:** picking a color for a tag without a page writes `pages/<tag>.md` holding only the line.

## Custom page colors

34. [x] **Hue slider:** look, keys (arrows, Page Up/Down, Home/End, Enter, Tab), dragging, and that only release or
   Enter writes the `color:: hue <h>` line; the picker stays open after a drag.
35. [x] **Preview:** the sample line follows the pointer and the arrow keys over the 25 colors, "No color" and the
   slider, and shows what the journal shows; the sample text is "Notes with a link and #tag" (say if you want other
   words).
36. [x] **Custom hues in every theme:** sweep the slider in Light, Dark, Violet, Graphite, Taupe, Teal and System (both
   Windows modes): washes soft, text, links and tags readable. Yellow-ish hues come out olive-like and darker than
   the fixed `yellow` (the lightness is the same for every hue); say if that looks wrong.
37. [x] **Saved color stays marked:** while the picker is open, the saved cell or the slider stays marked while the
   preview moves.
39. [x] **In the file:** `color:: hue 212`; `hue 360` and `hue x` stay visible as text and give no color; older
   Breccia versions read a hue as no color and keep the line.
40. [x] **Custom color outside the slider:** on a page with a custom hue the swatch is filled with that color and its
   screen-reader label says "Page color: Custom (hue 212)"; the journal's right-click "Color…" picker has the
   same slider and preview; after `Ctrl Z` the slider (opened again) sits at the hue that is saved now.
41. [x] **Screen readers name the picker:** with Narrator on, opening the page color picker announces "Page color", and
   the journal's right-click picker announces "Color of <page>".

38. [x] **Undo:** one `Ctrl Z` takes back one whole drag or one Enter on the slider.

## Custom color vividness

46. [x] **Vividness slider:** its look under the hue slider; that it is always shown and greyed out until a custom hue
   applies (or the hue slider is reached); the keys (arrows ±5, Page Up/Down ±25, Home/End, Enter, Tab order);
   dragging; and that only release or Enter writes `color:: hue <h> vivid <v>`.

47. [x] **Vividness in every theme:** sweep 50 to 200 in Light, Dark, Violet, Graphite, Taupe, Teal and System (both
   Windows modes). Check where the slider stops getting stronger (about 155 in Light, 125 in Teal for hue 212), and that
   the 50 end is still visibly colored. Say if the range or the "normal" point feels wrong.

48. [x] **The "softened" note:** the wording "Softened here so text stays readable" (normal text color, italics) and
   where it sits under the preview. Say if you want other words, a mark on the track instead, or no note.

49. [x] **Named color and back:** picking a named color drops the vividness and `Ctrl Z` brings it back. Reopening the
   picker on a named color starts the vividness at 100.

50. [x] **In the file:** `color:: hue 212 vivid 150`; `vivid 100` is never written. `vivid 300` and `vivid x` make no
   color and stay visible as text. A hand-written `HUE 212 VIVID 0150` stays as written until another color is picked.
   Older Breccia versions read a vividness as no color and keep the line.

## Follow-ups of plans 1 to 3

51. [x] **Preview inside the picker:** open a page's picker and move the pointer from one color to the next across the
   gap between them: the preview keeps the last color and does not blink. On the preview box, the labels or the greyed
   Vividness slider, and when the pointer leaves the picker, it shows the focused choice (the saved color until a key
   moves the focus). Say if leaving the picker should always show the saved color instead.

52. [x] **Slider thumbs:** drag each slider to its ends (hue 0 and 359, vividness 50 and 200): the thumb stays inside
   the track, and both tracks are as wide as the color grid. A press on the middle of a thumb keeps the value; a press
   elsewhere, even on the thumb's edge, moves the thumb there (by up to about 11 hue or 5 vividness on the thumb).
   Grabbing the thumb without a jump is a follow-up.

53. [x] **Screen reader on the sliders:** with Narrator, a slider at the page's saved color reads "Hue 212, page color"
   (Vividness likewise); moving it drops "page color". Say if "selected" (the word the grid colors use) reads better.

55. [x] **The picker follows its link:** open the picker from a link, then change the day's file in another editor: the
   picker moves with the link. If the link is deleted, the picker stays where it was and a pick still colors the page.

56. [x] **Right-click beside a selection:** with text selected in the journal, a right-click on empty space opens no
   menu; on the selected text the browser menu stays.

57. [x] **Jump highlight on a colored row:** jump from a board card or a search result to a colored journal block: the
   highlight starts in the selection color, fades back to the band's color, and keeps the band's rounded ends.

58. [x] **Selected row at a band's end:** Shift-click the first or the last row of a color band: the selection keeps the
   band's rounded end. Say if you want other corners.

59. [x] **Card buttons:** hover a board card in each theme: the arrow and the "…" menu button in its top right now
   have a background of their own, a little darker or lighter than the card, and their symbols are in the main text
   color. Under the pointer a button changes its background again, and the "…" button keeps that look while its menu
   is open. In Teal the hovered button turns darker rather than lighter, because the text there is too faint on a
   lighter one. Say if you want a stronger or weaker background.

60. [x] **Theme button in the status bar:** at the bottom right, just left of the "?" button, a half-filled circle
   (◐, named "Theme") opens a small menu with System and the six themes (Light, Dark, Violet, Graphite, Taupe, Teal);
   the current one has a check mark. A choice applies at once, closes the menu, and is kept on this computer only,
   exactly like Settings > Appearance, and both always show the same choice. The arrow keys and Enter work in the
   menu, and Esc closes it. While you are editing a block, using the button keeps you in the block with the cursor
   where it was. Say if you want another symbol, or a preview of each theme's colors in the menu.

## Slash menu

42. [x] **States as chips:** type `/` in a block. Each state in the menu is drawn as the same colored chip it has on a
   page (TODO grey, DOING amber, and so on), still with the "state" note at the right; Link, date and time stay plain
   text. Change a state color in Settings and the menu follows.
   Superseded in part by item 77 on 2026-11-10: the date entries are now Today, Yesterday and Date…, each with a
   small calendar; there is no time entry.

43. [x] **Slash menu: no "Current time", new "Date…":** `/` no longer offers "Current time". "Today's date" stays. A
   new "Date…" (also found by typing `/date`) opens the date picker; picking a day inserts `[[2026-11-09]]`-style link
   at the caret and puts the focus back in the block. `Esc` closes the picker and returns to the block with nothing
   inserted. The picker still appears by the sidebar's Journal row (the sidebar is shown first if hidden); say if you
   want it at the caret.
   Superseded in part by item 77 on 2026-11-10: "Today's date" is now called "Today" (and "Yesterday" is new).

44. [x] **Journals position in the sidebar:** Settings > Journal has three choices: "At the top", "At the bottom"
   (the default, as before) and "Among the folders, by name". The sidebar's Pages list follows at once and the choice
   survives a restart. "Among the folders" puts Journals between the top-level folders in alphabetical order (ignoring
   case), before the single pages, because the list shows folders first; say if you want it mixed in with the pages
   too. The setting is for this computer only and is not stored in the notes folder. Journals' own fold, years, months
   and days work the same in each place.

45. [x] **Git settings: no "Now:" line:** Settings > Git no longer ends with a "Now: …" status line. The status bar
   item still shows the state.

## Website

61. [x] **The website's look:** open https://eightbitboy.github.io/breccia/ in a real browser (the hero has so far been
   checked only in headless screenshots) at a phone width, a tablet width and a desktop width, in dark and light (the
   toggle at the top), and with "reduce motion" on in Windows. The shards drift in, snap together and give way to the
   journal; they follow the pointer slightly. Check that the animation runs smoothly on the phone and the desktop. Say
   if the motion is too much or too little, or the colours too loud. `just site-shots` writes the same views to
   `target/site-shots/`.

62. [x] **Publishing:** GitHub Pages is on with GitHub Actions as its source, and https://eightbitboy.github.io/breccia/
   shows the page (turned on on 2026-11-09 with your approval). A change to `site/` or to the README screenshots
   republishes it.

## Audit of 2026-11-10

64. [x] **Deleting a page:** today the file is removed for good; without Git there is no way back. Should a deleted
   page go to the Windows recycle bin instead? (Audit Q1.)
   - Owner, 2026-11-10: no recycle bin. Deleting a page keeps removing the file.
68. [x] **A log file:** Breccia would write its warnings to a small file in its own data folder, with an "Open log
   folder" entry in Settings, so that a problem on a user's machine can be looked into. Wanted? (Audit Q5, move M9.)
   - Owner, 2026-11-10: yes. It is part of plan 6.

66. [x] **Events for Breccia's own commands:** the audit proposes that the app no longer sends a command's own
   result back to the window as events (it already has the answer). Nothing changes on screen; it removes a fragile
   mechanism and changes how one sentence of the spec (§9) is met. Yes or no? (Audit Q3, move M43.)
   - Owner, 2026-11-20: yes (after asking for the pros and cons). It is part of plan 15.

67. [x] **Testing components:** keep the rule that logic lives outside the components and apply it to the six
   large ones, or add a setup for component tests? (Audit Q4, move M46.)

69. [x] **A second audit pass:** the release scripts, the website, and parts of the frontend and the tests were
   only sampled or not read (the audit's `README.md` lists them). Read them now, or after the first plan from the
   audit? (Audit Q6.)

## Safety net (plan 6)

70. [x] **CI on every push:** each push to any branch and each pull request runs the tests and the lint on GitHub
   (Actions tab, workflow CI). Check that the first run after this commit is green. Optional: make CI a required
   check for pull requests (Settings > Branches).

71. [x] **Dependabot, security policy, contribution guide:** read `SECURITY.md` and `CONTRIBUTING.md` once. Private
   vulnerability reporting is already on (Settings > Code security). From the start of next month Dependabot opens
   grouped pull requests; CI runs on each. Tauri's crate and npm updates are merged together.

72. [x] **Undo after typing a link:** type in a block, type `[[` so the page list opens, pick a page, keep typing
   within a second, then `Ctrl Z`: the typed text goes back in one step, as for any other run of typing.

73. [x] **Log folder:** Settings > Troubleshooting (the last section) > "Open log folder" opens Explorer on Breccia's
   log folder (`%LOCALAPPDATA%\dev.breccia.app\logs` for an installed Breccia; check the path). `breccia.log` starts
   with "Breccia <version> started" and holds no note text. The button's tooltip shows the folder. The click was not
   tried in the automated checks.

74. [x] **After an internal error:** in PowerShell, in the repository: `$env:BRECCIA_TEST_PANIC='boom'; just dev`
   (the first search for exactly `boom` then fails inside Breccia, once per run). Type a few words into a block, then
   search for `boom`: one notice says "Breccia hit an internal error and reloaded your notes from disk. Everything
   saved is safe; undo starts afresh.", the journal shows, the words you typed are still there, and typing saves
   again. Check the wording (Q1). If the notes folder cannot be reopened after the error, the Welcome screen shows with the notice "Breccia hit an internal error and closed the notes folder. Open it again with Open folder… or from Recent folders."; judge that wording too. Close it and run `Remove-Item Env:BRECCIA_TEST_PANIC` before the next `just dev`.
   With an installed Breccia instead: quit it (tray > Exit), then
   `$env:BRECCIA_TEST_PANIC='boom'; & "$env:LOCALAPPDATA\Breccia\breccia.exe"` (adjust to where it is installed).

75. [x] **One Breccia at a time:** with Breccia in the tray (window closed), start it again from the Start menu: the
   same window comes to the front, and there is still one tray icon. With Breccia open, start it again: the window
   comes to the front, no second window flashes. Also: `just e2e` passes while an installed Breccia runs. If the
   window only flashes in the taskbar instead of coming to the front, say so (a known Windows limit with a small
   fix).

## Wash seams, slash dates, delete a block (plan 7)

76. [x] **No lines inside a color wash:** in the dark theme, on a journal day with a colored page's blocks (one with
   sub-blocks), zoom to 110 % and 125 % (`Ctrl +`): the wash is one band with no faint lines between the rows. Also at
   100 %, and in one light theme. The colors look as before. Once at a Windows display scale of 125 % or 150 %
   (Settings > System > Display), at Breccia zoom 100 %: the same band, no lines. Select a washed row in the middle
   of a band (`Shift ↓`): the selection shows over the wash, with no line above or below it.

77. [x] **Today and Yesterday:** in a block type `/`: after "Link to page" come "Today", "Yesterday" and "Date…", each
   with the small calendar of the date picker (the entry once called "Today's date" is now "Today"). `/date` lists all
   three. "Today" inserts a link to today's day (`[[YYYY-MM-DD]]`), "Yesterday" a link to yesterday's day, and "Date…"
   opens the date picker. Check "Yesterday" shortly after midnight once if you can. The three date labels start about 22 px further
   right than "Link to page" and the states (room for the calendar): does that look right, or should the labels line
   up in one column?

78. [x] **Delete a block:** in a block with sub-blocks press `Ctrl Shift K`: it goes with its sub-blocks, the caret is
   at the end of the block above, `Ctrl Z` brings all back. On a page's only block the block is emptied. With blocks
   selected (`Shift ↓`) the key deletes them. F1 and Settings > Keyboard list it.

79. [x] **Deleting every selected block keeps one:** on a page select all its blocks (`Shift ↓` from the first block
   down to the last) and press `Delete`, `Backspace` or `Ctrl Shift K` (try each on a fresh selection): one empty
   block stays, the caret is in it and you can type at once. `Ctrl Z` brings all the blocks back in one step.
   Deleting some blocks, so that others stay, works as before. Same on a journal day.

## Wheel and more themes (plan 8)

80. [x] **The wheel:** with the pointer on ◐ in the status bar, turn the wheel down: System, Light, Taupe, Parchment,
   Dark, Graphite, Violet, Teal, Vampire, Fjord, Ember, then System again; up from System goes to Ember. A block being
   edited stays edited. A trackpad swipe moves about one theme per notch-worth, not all at once. The tooltip names the
   theme. Restart Breccia: the last theme is kept. `Ctrl` and the wheel there still zoom.

81. [x] **Vampire:** journal, a page, the board (hover a card: the ↗ and … buttons), search, the graph, Settings; a few
   page colors and a custom hue at vividness 50 and 200. Dark and reddish enough? Links pink, tags lilac.

82. [x] **Fjord:** the same tour. Cool and calm, not too grey?

83. [x] **Ember:** the same tour. Warm, orange accent, yellow links, green tags: too busy?

84. [x] **Parchment:** the same tour; the window title bar is light. Cream not too yellow; text dark slate.

85. [x] **The list:** Settings > Appearance and the status bar menu show eleven choices in the same order: System,
   Light, Taupe, Parchment, Dark, Graphite, Violet, Teal, Vampire, Fjord, Ember; F1 lists the wheel.

86. [x] **Teal, easier to read:** in Teal, select a few rows (`Shift ↓`), edit a block and select a word in it (the
   selection shows), follow a link to a block (the jump highlight), open the theme menu (the pressed button): text,
   links and tags read well on each. Does Teal otherwise look as before? Are the selection and the highlight still seen
   well enough? A block being edited, and inline code, now have a slightly fainter tint than before: does that look
   right?

## Core housekeeping (plan 9)

87. [x] **A page saved as `.MD` while Breccia runs:** with a notes folder open, save a file into its `pages` folder
   from another program (Notepad, Explorer) with an upper-case extension, e.g. `Plan.MD`. A notice appears at once:
   "extension must be lower-case .md, not loaded: pages\Plan.MD", the same as when the folder is opened; before, it
   came only on reopening. The page does not appear. Saving the file again gives no second notice. Rename it to
   `Plan.md`: the page appears. The same in `journals` with a day file such as `2026-11-11.MD`. Known edge (found in
   review, a follow-up): on Windows, renaming a loaded page from `Plan.md` to `Plan.MD` (case only) shows the notice,
   while the page may stay loaded until the folder is opened again.

## Changelog in the app (plan 10)

88. [x] **The changelog:** Settings > About, "Show changelog": an overlay with the changelog, newest release first,
   starting at the top; headings, groups (Features, Fixes) and bullets read well in a light and a dark theme.
   `Esc` closes it and Settings stays where it was; open it again: it is at the top. Turn off the network: it still
   opens. With `just dev`, a note at the top says it is a development build (only unit-tested so far: please
   look once). Label and place are as you chose ("Show changelog" below the About list); the running version is not
   marked.

## Config values out of range (plan 11)

89. [x] **A number out of range in `config.toml`:** with a folder open, edit `breccia/config.toml` in another
   editor: under `[git]` set `pull_interval_minutes = 100000`, save. A notice appears at once: "breccia/config.toml:
   [git] pull_interval_minutes = 100000 is outside 0 to 1440, so Breccia uses 5 instead. Change it in Settings or in
   the file." Settings > Git shows 5. The file is unchanged (your comments too). Set `archive_after_days = 0` under
   `[board]`: a second notice, the board settings show 14. Close Breccia and start it again: the notices come again.
   Fix both values: no notice, the new values are used. Then put `100000` back and change "Git enabled" in Settings:
   the file now says `pull_interval_minutes = 5` (R7). Is the wording right (Q1), the place (Q2), one notice per key
   (Q3), only that key replaced (Q4), and the Settings save writing the default (Q5)?

## Oxblood theme

90. [x] **Oxblood:** a new dark red theme, last in the list (after Ember; up from System now goes to Oxblood). Take the
   usual tour: journal, a page, the board (hover a card), search, the graph, Settings; a few page colors and a custom
   hue at vividness 50 and 200. Wine-dark background, rose-red accent and links, gold tags. Red enough, or too brown or
   too pink? Too close to Vampire? Say what to change (background, accent, link or tag colour).

## Email links

91. [x] **Email in angle brackets:** in a block, type `<name@example.com>` and leave the block: it shows as a link, and
   clicking it opens your mail program. A bare `name@example.com` stays plain text (as decided; backlog #7).

92. [x] **Dropped paste notice:** backlog #5. The new notice "Paste skipped; the text is still on the clipboard." shows
   when an outline paste meets an editor that is no longer the one it was meant for. It is only unit-tested, because
   it is hard to trigger by hand: no need to look for it.

93. [x] **Sidebar tree (backlog #10):** an older page list can no longer replace a newer one, and a refused drag in the
   sidebar (for example a folder onto a name that exists) refreshes the list afterwards. Drag a folder onto a place
   where a folder of that name exists: the notice appears and the sidebar stays right. Hard to see by eye; look for
   anything odd in the sidebar after quick renames and moves. Left open: two quick folder opens starting their file
   watchers in the wrong order (backlog #10).

94. [x] **Test window title and demo dates:** while `just e2e` (or `just screenshots`) runs, its window and tray entry
   read "Breccia (test)", not "Breccia". In `just dev`, open the Journal at 27 Oct 2026: the finished task shows
   "✓ 27 Oct 16:40 after 7 days"; the Project X and Release 2 tasks show their durations too.

95. [x] **Typing right after Ctrl Enter (backlog #2):** in a block, press `Ctrl Enter` and keep typing without a pause
   (also `Ctrl Shift Enter`, and a state picked from the `/` menu): every key you typed is in the block, after the
   state keyword and the text you had, and before the `created::` line. Before, keys typed in the few milliseconds the
   command ran were lost, and typed text landed on the `created::` line. Also check a block with several lines: the
   caret stays at the end of the last line.

96. [x] **Drag a card to the edge (backlog #23):** on a board with columns wider than the window (make them wide with the
   slider by the board title), drag a card and hold it near the right edge of the window: the board scrolls sideways,
   faster the nearer the edge; the same at the left edge. Move away from the edge: it stops. Drop the card in a column
   that was off screen: it lands there. Is the speed right (not too fast, not too slow) and the edge zone (about 64 px)?

97. [x] **Created day on open cards (backlog #25):** on a board, an open card's grey bottom line now reads for example
   `Release 2 · created 26 Oct` (a journal task: `29 Oct 2026 · created 26 Oct`). A finished card still shows only
   `· ✓ 28 Oct`; a task without a `created::` line (made before version 5, or by another program) shows nothing extra.
   Is the wording right ("created 26 Oct" or an age such as "3 days ago"), and is the line too long on narrow columns?

98. [x] **Index repair warning (backlog #30):** when Breccia finds the search index damaged and cannot delete or reopen
   the file, the warning "the search index cannot be stored (...)" now names that failure (for example a file that is
   in use), not the damage that started the repair. It is only unit-tested: no need to try to provoke it.

99. [x] **Half-written config (backlog #39):** edit `breccia/config.toml` in an editor that saves in place (it empties the
   file and then writes it) while Breccia runs. The change is picked up with no "cannot be read" notice. A really
   broken file (a typo) still gives the notice, now after about a fifth of a second. Only unit-tested: no need to
   provoke the half-written case by hand.

101. [x] **Keep mine after an undo (backlog #6):** edit a block, change the same note in another editor and save, so the
   "changed on disk" notice appears; type something into the block, press `Ctrl Z` to undo it, then press "Keep mine" on the
   notice. The undone text must not come back. The same with `Ctrl Enter` (a state change) instead of the undo. Rare to
   reproduce by hand; it is covered by unit tests.

## Shorter web addresses

103. [x] **Hide `https://` and shorten long web addresses:** Settings now has a "Themes" section (the theme picker, as before) and an
   "Appearance" section with two checkboxes, both off at first. Type `https://x.com/some/very/long/link` in a block and leave it:
   with "Hide https://" it reads `x.com/some/very/long/link`; with "Shorten" it reads `https://x.com/some/ver…`; with both, `x.com/some/ver…`.
   Clicking still opens the whole address, the block you edit shows the whole text, and the file is unchanged. Only a bare address is
   changed, not `[text](url)` or a mail link. The length (8 characters after the domain) is fixed. Question: should the number be a setting, and should it also apply
   inside the block being edited?

## Tag autocomplete

104. [x] **`#` lists only tags:** type `#` in a block: the menu lists only names already used as a tag (the sidebar's
   "Tags"), no longer every page. A page that has never been used as a tag is not offered; typing its name ends with
   "New tag “#…”", which writes the tag as before. `[[` still lists all pages. Each tag is shown as it is written:
   `#budget`, or `#[[two words]]` for a name with spaces. My call: the last item now reads "New tag" instead of "Create
   page", since choosing it only writes the tag. Journal days are never offered after `#`.

105. [x] **Appearance section, tidied:** in Settings > Appearance the two checkboxes ("Hide https://…" and "Shorten long
   web addresses…") now sit one above the other, styled like the Git section's checkbox, and the "This computer only…"
   note above them is gone. The Themes and Journal sections keep their own short "This computer only" notes.

106. [x] **Trim the trailing slash:** Settings > Appearance has a third checkbox, "Trim the trailing slash from web
   addresses", off at first. With it, `https://x.com/docs/` reads `https://x.com/docs` (with "Hide https://" too:
   `x.com/docs`). Only one slash at the end goes; the file and the link's target keep it, and the block you edit shows
   the whole address. My call: the slash is trimmed before shortening, so `https://x.com/12345678/` with "Shorten" on
   reads `x.com/12345678` instead of `x.com/12345678…`.

## Open follow-ups (plan 12)

107. [x] **The log never shows a Git password:** in Settings > Git set a remote such as
   `https://me:pa/ss@example.com/repo.git` (a password with a `/`, a `?` or a `#`, or with another `@`), let a sync
   fail, and open the log (Settings > Troubleshooting > "Open log folder"): the user name and password are replaced by
   `***` in `breccia.log`, with no part of the password left. Also: when the log reaches its size limit and the old
   copy `breccia.1.log` cannot be replaced (for example because it is open in another program), `breccia.log` is kept
   and keeps growing; it is only cut when it is over twice the limit. Hard to try by hand; covered by unit tests.

108. [x] **A press on a slider's knob keeps the value:** in a page's color picker, press the "Custom hue" knob a few
   pixels off its centre (near its edge) and release without moving: the hue stays as it was (before, it jumped by up to about 11). Dragging the
   knob still follows the pointer and saves once on release. A press on the track away from the knob still jumps there.
   The same on the "Vividness" slider.

109. [x] **Joining a block onto a task keeps its created and done lines:** make a task (`Ctrl Enter` on a block gives
   it a state and a `created::` line; finishing it adds a `done::` line). Add a block with one line of text right below
   it and press `Backspace` at the start of that block: the text joins the task's own text, and the `created::` and
   `done::` lines stay on their own lines below it, unchanged. `Ctrl Z` puts everything back. After `Backspace` in an
   empty block, and after `Ctrl Shift K` on a block, the caret lands at the end of the block above's own text, before
   its `created::` and `done::` lines (before, it landed after them and typing went onto the property line).

110. [x] **A changelog link without text:** a link written `[](https://example.com)` in `CHANGELOG.md` shows its web
   address in the changelog (Settings > About > "Show changelog"), as a link. Needs a hand-edited changelog to see;
   `just dev` builds the app with the committed one.

111. [x] **The website at phone and tablet width:** open the site at 375 px wide: the board screenshot fades out at its
   right edge to say it scrolls sideways, and the fade goes when you scroll to its end. At 768 px the two one-line
   cards (Page colors and Graph) sit side by side instead of each alone in a row. On a slow connection the hero's
   screenshot appears only once it has loaded (throttle the network in the browser's tools to see it). The opening
   animation, where tiles cross the "What it is" text at 375 px for about half a second, is left as it is.

112. [x] **One CI run per change:** push a branch of this repository and open a pull request from it: GitHub Actions
   lists the run from the push, and the pull request's own run is skipped (it still appears in the list, but its job does not
   start), so the work is done once, not twice. A pull request from a fork still gets its run. A newer push to a branch
   cancels the run of the older one, but a run on `main` is never cancelled, so it always saves its cache. Developer
   only; look at the Actions page after the next pull request.

113. [x] **Question (answered): `Backspace` at the start of a task that sits right below another task:** this is new in plan 12.
   Before, `Backspace` at the start of a block with several lines, under a task, joined its text onto the task's
   `created::` line and so corrupted that line. Now the join is refused: nothing is joined and a notice appears ("the
   change would alter the outline around the block"). Every task has a `created::` line, so this is what you see when
   you press `Backspace` at the start of a task right below another task. A block with one line still joins as
   described in item 109. Should the refusal stay? Or should it join anyway, putting the joined text before the
   task's property lines and keeping the lower task's own property lines (a later change)? Or something else?
   **Answered (owner, 2026-11-17): keep the refusal, with a notice in plain words. Done** (item 114).

114. [x] **The notice when a block can't be joined onto a task:** in a page with two tasks one below the other, put
   the caret at the start of the lower task and press `Backspace`. Nothing is joined, both files stay as they were, and
   the notice reads "This block can't be joined onto the one above: its own lines would end up after the created:: and
   other property lines there". The same happens for any block with several lines under a block with property lines.

## Config comments

115. [x] **A comment above a changed setting stays:** in `breccia/config.toml`, put a comment line above a Git or board
   setting (for example `# how long to wait` above `commit_delay_minutes = 5`), then change that setting in Settings.
   Before, the comment line above it was dropped; now the file keeps it byte for byte and only the value changes.

## Dailies (plan 13)

116. [x] **The Dailies view:** the sidebar has "Dailies" right under Journal. Open it with no file: it says "No dailies
   yet" and offers the field "Add a daily". Type a text and press Enter: the daily appears and the field stays focused.
   Click a text to edit it (Enter or leaving the field saves, Esc cancels; an emptied field changes nothing).
   Right-click a row and choose Delete: Breccia asks "Delete the daily '…'?" (Esc cancels). Check `breccia/dailies.md`
   in an editor after each step: one `- text` line per daily.

117. [x] **Ticking:** tick a daily: it turns grey and struck through and sinks below the open ones; the file gets a
   `checked:: YYYY-MM-DD HH:MM` line under it, and the order of the file does not change. Untick it: the line goes and
   the row is back. Hover a ticked row for the time it was ticked. Tick them all: the view says "All done for today".
   With "reduce motion" on in the system, the row jumps instead of sliding.

118. [x] **Reordering:** drag an open daily above another open one: the file order follows (the daily is written right
   before the one you dropped it on). A ticked daily moves only among ticked ones. `Alt ↑` / `Alt ↓` on a focused
   row do the same by one place.
