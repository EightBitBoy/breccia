# Owner review list

What the owner should look at in the running app. Claude adds a numbered item for every change a user can see, and
every open question, when it lands. The owner ticks an item off (`[x]`) or writes a note under it. Numbers are never
reused. Ticked items move to `docs/reviewed.md` with their notes.

## Carried over from the prototype

9. [ ] **Git with a real remote:** sync click, closing the app during a sync, and a conflict created from another
   machine.
10. [ ] **Git over SSH without an agent:** a remote whose key needs a passphrase and no agent running; the sync should
   fail with a clear message, not hang.
11. [ ] **Settings:** themes, renaming and removing a used task state, hand edits of `config.toml` while Settings is
   open, switching folders and the recent folders list.
12. [ ] **Typing in Settings boxes:** type in one box while another change is saved or refused; the typed text must
   stay.
15. [ ] **Graph:** filters, hover, Find, keyboard keys, Re-arrange.
17. [ ] **Graph at scale:** run `just graph-scale --onscreen` and judge pan and zoom by eye (wheel zoom at 5,000 pages
   is known to be slow, backlog #56).
18. [ ] **`just release` at a real console:** at the pause, try Ctrl+C and a wrong answer (it should ask again); with an
   SSH key that needs a passphrase, check the push prompt after the pause.
19. [ ] **Open the demo in Obsidian:** open a copy of `docs/demo/` in Obsidian and compare what you see with
   `docs/compatibility.md`.
20. [ ] **Alias links in Obsidian:** check that a typed `[[Q&A: hiring]]` link resolves through the alias Breccia writes
   (`docs/compatibility.md` still says "not verified").

## Page colors

29. [ ] **Undo after a pick:** `Ctrl Z` right after a pick brings the old color back (or removes the line), redo puts
   it back, and earlier typing on the page stays undoable. Undoing the first pick on a tag-only page leaves its
   new file empty.
30. [ ] **Tag-only page:** picking a color for a tag without a page writes `pages/<tag>.md` holding only the line.
31. [ ] **Color from a link in the journal:** right-click a link or tag in the feed and on a day page, choose "Color…"
   and pick; the linked page gets the color and the washes follow. An alias link colors the aliased page, a tag
   without a page gets its file, and links to days or to missing pages show no "Color…" entry. Inside an open block
   editor, and on selected text that is not a link to a colorable page (including a link to a day or a missing page),
   the normal browser menu stays, so copy and paste keep working; say if you want the color menu there too. Undo for
   such a pick is on the linked page (its swatch or its blocks), not in the journal.
32. [ ] **Demo and README:** the demo pages Q&A: hiring, Release 2, on call and Project X have colors, the
   2026-10-29 journal has one new block, and the README journal screenshot shows the washes.

## Custom page colors

38. [ ] **Undo:** one `Ctrl Z` takes back one whole drag or one Enter on the slider.

## Custom color vividness

46. [ ] **Vividness slider:** its look under the hue slider; that it is always shown and greyed out until a custom hue
   applies (or the hue slider is reached); the keys (arrows ±5, Page Up/Down ±25, Home/End, Enter, Tab order);
   dragging; and that only release or Enter writes `color:: hue <h> vivid <v>`.
47. [ ] **Vividness in every theme:** sweep 50 to 200 in Light, Dark, Violet, Graphite, Taupe, Teal and System (both
   Windows modes). Check where the slider stops getting stronger (about 155 in Light, 125 in Teal for hue 212), and that
   the 50 end is still visibly colored. Say if the range or the "normal" point feels wrong.
48. [ ] **The "softened" note:** the wording "Softened here so text stays readable" (normal text color, italics) and
   where it sits under the preview. Say if you want other words, a mark on the track instead, or no note.
49. [ ] **Named color and back:** picking a named color drops the vividness and `Ctrl Z` brings it back. Reopening the
   picker on a named color starts the vividness at 100.
50. [ ] **In the file:** `color:: hue 212 vivid 150`; `vivid 100` is never written. `vivid 300` and `vivid x` make no
   color and stay visible as text. A hand-written `HUE 212 VIVID 0150` stays as written until another color is picked.
   Older Breccia versions read a vividness as no color and keep the line.

## Follow-ups of plans 1 to 3

51. [ ] **Preview inside the picker:** open a page's picker and move the pointer from one color to the next across the
   gap between them: the preview keeps the last color and does not blink. On the preview box, the labels or the greyed
   Vividness slider, and when the pointer leaves the picker, it shows the focused choice (the saved color until a key
   moves the focus). Say if leaving the picker should always show the saved color instead.
52. [ ] **Slider thumbs:** drag each slider to its ends (hue 0 and 359, vividness 50 and 200): the thumb stays inside
   the track, and both tracks are as wide as the color grid. A press on the middle of a thumb keeps the value; a press
   elsewhere, even on the thumb's edge, moves the thumb there (by up to about 11 hue or 5 vividness on the thumb).
   Grabbing the thumb without a jump is a follow-up.
53. [ ] **Screen reader on the sliders:** with Narrator, a slider at the page's saved color reads "Hue 212, page color"
   (Vividness likewise); moving it drops "page color". Say if "selected" (the word the grid colors use) reads better.
54. [ ] **Focus after a pick from a link:** right-click a link in the journal, choose Color… and pick, or press Esc:
   the focus is on the link again (it shows a focus ring when you used the keyboard), and Tab moves on from there. If
   you click elsewhere, for example in the search box, the focus stays there. Undo for the pick is still on the linked
   page. Say if `Ctrl Z` on the link should undo the pick too.
55. [ ] **The picker follows its link:** open the picker from a link, then change the day's file in another editor: the
   picker moves with the link. If the link is deleted, the picker stays where it was and a pick still colors the page.
56. [ ] **Right-click beside a selection:** with text selected in the journal, a right-click on empty space opens no
   menu; on the selected text the browser menu stays.
57. [ ] **Jump highlight on a colored row:** jump from a board card or a search result to a colored journal block: the
   highlight starts in the selection color, fades back to the band's color, and keeps the band's rounded ends.
58. [ ] **Selected row at a band's end:** Shift-click the first or the last row of a color band: the selection keeps the
   band's rounded end. Say if you want other corners.
59. [ ] **Card buttons:** hover a board card in each theme: the arrow and the "…" menu button in its top right now
   have a background of their own, a little darker or lighter than the card, and their symbols are in the main text
   color. Under the pointer a button changes its background again, and the "…" button keeps that look while its menu
   is open. In Teal the hovered button turns darker rather than lighter, because the text there is too faint on a
   lighter one. Say if you want a stronger or weaker background.
60. [ ] **Theme button in the status bar:** at the bottom right, just left of the "?" button, a half-filled circle
   (◐, named "Theme") opens a small menu with System and the six themes (Light, Dark, Violet, Graphite, Taupe, Teal);
   the current one has a check mark. A choice applies at once, closes the menu, and is kept on this computer only,
   exactly like Settings > Appearance, and both always show the same choice. The arrow keys and Enter work in the
   menu, and Esc closes it. While you are editing a block, using the button keeps you in the block with the cursor
   where it was. Say if you want another symbol, or a preview of each theme's colors in the menu.

## Slash menu

42. [ ] **States as chips:** type `/` in a block. Each state in the menu is drawn as the same colored chip it has on a
   page (TODO grey, DOING amber, and so on), still with the "state" note at the right; Link, date and time stay plain
   text. Change a state color in Settings and the menu follows.
   Superseded in part by item 77 on 2026-11-10: the date entries are now Today, Yesterday and Date…, each with a
   small calendar; there is no time entry.
43. [ ] **Slash menu: no "Current time", new "Date…":** `/` no longer offers "Current time". "Today's date" stays. A
   new "Date…" (also found by typing `/date`) opens the date picker; picking a day inserts `[[2026-11-09]]`-style link
   at the caret and puts the focus back in the block. `Esc` closes the picker and returns to the block with nothing
   inserted. The picker still appears by the sidebar's Journal row (the sidebar is shown first if hidden); say if you
   want it at the caret.
   Superseded in part by item 77 on 2026-11-10: "Today's date" is now called "Today" (and "Yesterday" is new).
44. [ ] **Journals position in the sidebar:** Settings > Journal has three choices: "At the top", "At the bottom"
   (the default, as before) and "Among the folders, by name". The sidebar's Pages list follows at once and the choice
   survives a restart. "Among the folders" puts Journals between the top-level folders in alphabetical order (ignoring
   case), before the single pages, because the list shows folders first; say if you want it mixed in with the pages
   too. The setting is for this computer only and is not stored in the notes folder. Journals' own fold, years, months
   and days work the same in each place.
45. [ ] **Git settings: no "Now:" line:** Settings > Git no longer ends with a "Now: …" status line. The status bar
   item still shows the state.

## Website

61. [ ] **The website's look:** open https://eightbitboy.github.io/breccia/ in a real browser (the hero has so far been
   checked only in headless screenshots) at a phone width, a tablet width and a desktop width, in dark and light (the
   toggle at the top), and with "reduce motion" on in Windows. The shards drift in, snap together and give way to the
   journal; they follow the pointer slightly. Check that the animation runs smoothly on the phone and the desktop. Say
   if the motion is too much or too little, or the colours too loud. `just site-shots` writes the same views to
   `target/site-shots/`.
62. [ ] **Publishing:** GitHub Pages is on with GitHub Actions as its source, and https://eightbitboy.github.io/breccia/
   shows the page (turned on on 2026-11-09 with your approval). A change to `site/` or to the README screenshots
   republishes it.
63. [ ] **The text:** read the page once. Every sentence comes from the README; say what to cut, add or reword. The
   download button names no version (it opens the newest release); say if you want the number shown.

## Audit of 2026-11-10

The whole-application audit is in `docs/audit/2026-11-10/` (start with its `README.md`). It changed no code. These
are its questions for you; each answer decides what a later plan does.

65. [ ] **Remote images in notes:** `![](https://…)` in a note is fetched as soon as the page is shown. A note
   pulled from a shared repository can so make Breccia contact an outside address. Keep it, or show remote images
   only after a click? (Audit Q2.)
66. [ ] **Events for Breccia's own commands:** the audit proposes that the app no longer sends a command's own
   result back to the window as events (it already has the answer). Nothing changes on screen; it removes a fragile
   mechanism and changes how one sentence of the spec (§9) is met. Yes or no? (Audit Q3, move M43.)
67. [ ] **Testing components:** keep the rule that logic lives outside the components and apply it to the six
   large ones, or add a setup for component tests? (Audit Q4, move M46.)
69. [ ] **A second audit pass:** the release scripts, the website, and parts of the frontend and the tests were
   only sampled or not read (the audit's `README.md` lists them). Read them now, or after the first plan from the
   audit? (Audit Q6.)

## Safety net (plan 6)

70. [ ] **CI on every push:** each push to any branch and each pull request runs the tests and the lint on GitHub
   (Actions tab, workflow CI). Check that the first run after this commit is green. Optional: make CI a required
   check for pull requests (Settings > Branches).

71. [ ] **Dependabot, security policy, contribution guide:** read `SECURITY.md` and `CONTRIBUTING.md` once. Private
   vulnerability reporting is already on (Settings > Code security). From the start of next month Dependabot opens
   grouped pull requests; CI runs on each. Tauri's crate and npm updates are merged together.

72. [ ] **Undo after typing a link:** type in a block, type `[[` so the page list opens, pick a page, keep typing
   within a second, then `Ctrl Z`: the typed text goes back in one step, as for any other run of typing.

73. [ ] **Log folder:** Settings > Troubleshooting (the last section) > "Open log folder" opens Explorer on Breccia's
   log folder (`%LOCALAPPDATA%\dev.breccia.app\logs` for an installed Breccia; check the path). `breccia.log` starts
   with "Breccia <version> started" and holds no note text. The button's tooltip shows the folder. The click was not
   tried in the automated checks.

74. [ ] **After an internal error:** in PowerShell, in the repository: `$env:BRECCIA_TEST_PANIC='boom'; just dev`
   (the first search for exactly `boom` then fails inside Breccia, once per run). Type a few words into a block, then
   search for `boom`: one notice says "Breccia hit an internal error and reloaded your notes from disk. Everything
   saved is safe; undo starts afresh.", the journal shows, the words you typed are still there, and typing saves
   again. Check the wording (Q1). If the notes folder cannot be reopened after the error, the Welcome screen shows with the notice "Breccia hit an internal error and closed the notes folder. Open it again with Open folder… or from Recent folders."; judge that wording too. Close it and run `Remove-Item Env:BRECCIA_TEST_PANIC` before the next `just dev`.
   With an installed Breccia instead: quit it (tray > Exit), then
   `$env:BRECCIA_TEST_PANIC='boom'; & "$env:LOCALAPPDATA\Breccia\breccia.exe"` (adjust to where it is installed).

75. [ ] **One Breccia at a time:** with Breccia in the tray (window closed), start it again from the Start menu: the
   same window comes to the front, and there is still one tray icon. With Breccia open, start it again: the window
   comes to the front, no second window flashes. Also: `just e2e` passes while an installed Breccia runs. If the
   window only flashes in the taskbar instead of coming to the front, say so (a known Windows limit with a small
   fix).

## Wash seams, slash dates, delete a block (plan 7)

76. [ ] **No lines inside a color wash:** in the dark theme, on a journal day with a colored page's blocks (one with
   sub-blocks), zoom to 110 % and 125 % (`Ctrl +`): the wash is one band with no faint lines between the rows. Also at
   100 %, and in one light theme. The colors look as before. Once at a Windows display scale of 125 % or 150 %
   (Settings > System > Display), at Breccia zoom 100 %: the same band, no lines. Select a washed row in the middle
   of a band (`Shift ↓`): the selection shows over the wash, with no line above or below it.

77. [ ] **Today and Yesterday:** in a block type `/`: after "Link to page" come "Today", "Yesterday" and "Date…", each
   with the small calendar of the date picker (the entry once called "Today's date" is now "Today"). `/date` lists all
   three. "Today" inserts a link to today's day (`[[YYYY-MM-DD]]`), "Yesterday" a link to yesterday's day, and "Date…"
   opens the date picker. Check "Yesterday" shortly after midnight once if you can. The three date labels start about 22 px further
   right than "Link to page" and the states (room for the calendar): does that look right, or should the labels line
   up in one column?

78. [ ] **Delete a block:** in a block with sub-blocks press `Ctrl Shift K`: it goes with its sub-blocks, the caret is
   at the end of the block above, `Ctrl Z` brings all back. On a page's only block the block is emptied. With blocks
   selected (`Shift ↓`) the key deletes them. F1 and Settings > Keyboard list it.

79. [ ] **Deleting every selected block keeps one:** on a page select all its blocks (`Shift ↓` from the first block
   down to the last) and press `Delete`, `Backspace` or `Ctrl Shift K` (try each on a fresh selection): one empty
   block stays, the caret is in it and you can type at once. `Ctrl Z` brings all the blocks back in one step.
   Deleting some blocks, so that others stay, works as before. Same on a journal day.

## Wheel and more themes (plan 8)

80. [ ] **The wheel:** with the pointer on ◐ in the status bar, turn the wheel down: System, Light, Taupe, Parchment,
   Dark, Graphite, Violet, Teal, Vampire, Fjord, Ember, then System again; up from System goes to Ember. A block being
   edited stays edited. A trackpad swipe moves about one theme per notch-worth, not all at once. The tooltip names the
   theme. Restart Breccia: the last theme is kept. `Ctrl` and the wheel there still zoom.

81. [ ] **Vampire:** journal, a page, the board (hover a card: the ↗ and … buttons), search, the graph, Settings; a few
   page colors and a custom hue at vividness 50 and 200. Dark and reddish enough? Links pink, tags lilac.

82. [ ] **Fjord:** the same tour. Cool and calm, not too grey?

83. [ ] **Ember:** the same tour. Warm, orange accent, yellow links, green tags: too busy?

84. [ ] **Parchment:** the same tour; the window title bar is light. Cream not too yellow; text dark slate.

85. [ ] **The list:** Settings > Appearance and the status bar menu show eleven choices in the same order: System,
   Light, Taupe, Parchment, Dark, Graphite, Violet, Teal, Vampire, Fjord, Ember; F1 lists the wheel.

86. [ ] **Teal, easier to read:** in Teal, select a few rows (`Shift ↓`), edit a block and select a word in it (the
   selection shows), follow a link to a block (the jump highlight), open the theme menu (the pressed button): text,
   links and tags read well on each. Does Teal otherwise look as before? Are the selection and the highlight still seen
   well enough? A block being edited, and inline code, now have a slightly fainter tint than before: does that look
   right?

## Core housekeeping (plan 9)

87. [ ] **A page saved as `.MD` while Breccia runs:** with a notes folder open, save a file into its `pages` folder
   from another program (Notepad, Explorer) with an upper-case extension, e.g. `Plan.MD`. A notice appears at once:
   "extension must be lower-case .md, not loaded: pages\Plan.MD", the same as when the folder is opened; before, it
   came only on reopening. The page does not appear. Saving the file again gives no second notice. Rename it to
   `Plan.md`: the page appears. The same in `journals` with a day file such as `2026-11-11.MD`. Known edge (found in
   review, a follow-up): on Windows, renaming a loaded page from `Plan.md` to `Plan.MD` (case only) shows the notice,
   while the page may stay loaded until the folder is opened again.

## Changelog in the app (plan 10)

88. [ ] **The changelog:** Settings > About, "Show changelog": an overlay with the changelog, newest release first,
   starting at the top; headings, groups (Features, Fixes) and bullets read well in a light and a dark theme.
   `Esc` closes it and Settings stays where it was; open it again: it is at the top. Turn off the network: it still
   opens. With `just dev`, a note at the top says it is a development build (only unit-tested so far: please
   look once). Label and place are as you chose ("Show changelog" below the About list); the running version is not
   marked.

## Config values out of range (plan 11)

89. [ ] **A number out of range in `config.toml`:** with a folder open, edit `breccia/config.toml` in another
   editor: under `[git]` set `pull_interval_minutes = 100000`, save. A notice appears at once: "breccia/config.toml:
   [git] pull_interval_minutes = 100000 is outside 0 to 1440, so Breccia uses 5 instead. Change it in Settings or in
   the file." Settings > Git shows 5. The file is unchanged (your comments too). Set `archive_after_days = 0` under
   `[board]`: a second notice, the board settings show 14. Close Breccia and start it again: the notices come again.
   Fix both values: no notice, the new values are used. Then put `100000` back and change "Git enabled" in Settings:
   the file now says `pull_interval_minutes = 5` (R7). Is the wording right (Q1), the place (Q2), one notice per key
   (Q3), only that key replaced (Q4), and the Settings save writing the default (Q5)?

## Oxblood theme

90. [ ] **Oxblood:** a new dark red theme, last in the list (after Ember; up from System now goes to Oxblood). Take the
   usual tour: journal, a page, the board (hover a card), search, the graph, Settings; a few page colors and a custom
   hue at vividness 50 and 200. Wine-dark background, rose-red accent and links, gold tags. Red enough, or too brown or
   too pink? Too close to Vampire? Say what to change (background, accent, link or tag colour).

## Email links

91. [ ] **Email in angle brackets:** in a block, type `<name@example.com>` and leave the block: it shows as a link, and
   clicking it opens your mail program. A bare `name@example.com` stays plain text (as decided; backlog #7).

92. [ ] **Dropped paste notice:** backlog #5. The new notice "Paste skipped; the text is still on the clipboard." shows
   when an outline paste meets an editor that is no longer the one it was meant for. It is only unit-tested, because
   it is hard to trigger by hand: no need to look for it.

93. [ ] **Sidebar tree (backlog #10):** an older page list can no longer replace a newer one, and a refused drag in the
   sidebar (for example a folder onto a name that exists) refreshes the list afterwards. Drag a folder onto a place
   where a folder of that name exists: the notice appears and the sidebar stays right. Hard to see by eye; look for
   anything odd in the sidebar after quick renames and moves. Left open: two quick folder opens starting their file
   watchers in the wrong order (backlog #10).

94. [ ] **Test window title and demo dates:** while `just e2e` (or `just screenshots`) runs, its window and tray entry
   read "Breccia (test)", not "Breccia". In `just dev`, open the Journal at 27 Oct 2026: the finished task shows
   "✓ 27 Oct 16:40 after 7 days"; the Project X and Release 2 tasks show their durations too.

95. [ ] **Typing right after Ctrl Enter (backlog #2):** in a block, press `Ctrl Enter` and keep typing without a pause
   (also `Ctrl Shift Enter`, and a state picked from the `/` menu): every key you typed is in the block, after the
   state keyword and the text you had, and before the `created::` line. Before, keys typed in the few milliseconds the
   command ran were lost, and typed text landed on the `created::` line. Also check a block with several lines: the
   caret stays at the end of the last line.

96. [ ] **Drag a card to the edge (backlog #23):** on a board with columns wider than the window (make them wide with the
   slider by the board title), drag a card and hold it near the right edge of the window: the board scrolls sideways,
   faster the nearer the edge; the same at the left edge. Move away from the edge: it stops. Drop the card in a column
   that was off screen: it lands there. Is the speed right (not too fast, not too slow) and the edge zone (about 64 px)?

97. [ ] **Created day on open cards (backlog #25):** on a board, an open card's grey bottom line now reads for example
   `Release 2 · created 26 Oct` (a journal task: `29 Oct 2026 · created 26 Oct`). A finished card still shows only
   `· ✓ 28 Oct`; a task without a `created::` line (made before version 5, or by another program) shows nothing extra.
   Is the wording right ("created 26 Oct" or an age such as "3 days ago"), and is the line too long on narrow columns?

98. [ ] **Index repair warning (backlog #30):** when Breccia finds the search index damaged and cannot delete or reopen
   the file, the warning "the search index cannot be stored (...)" now names that failure (for example a file that is
   in use), not the damage that started the repair. It is only unit-tested: no need to try to provoke it.

99. [ ] **Half-written config (backlog #39):** edit `breccia/config.toml` in an editor that saves in place (it empties the
   file and then writes it) while Breccia runs. The change is picked up with no "cannot be read" notice. A really
   broken file (a typo) still gives the notice, now after about a fifth of a second. Only unit-tested: no need to
   provoke the half-written case by hand.

100. [ ] **Vocabulary (backlog #63):** read `docs/vocabulary.md`. It lists each term with one line and where it shows
   up, written from how the app and the spec use the words today. Please check two things: (a) is every meaning right,
   and does anything missing deserve a line? (b) the proposed words where the app uses several: **journal day** (not
   "journal page" or "day page"; the graph filter still says "Hide journal pages"), **card** on a board and **task**
   everywhere else, **linked-only** and **tag-only** as two different things, and **notes folder** (the open folder)
   versus **folder** (a folder of the page tree). Say which to change. Nothing in the app was changed; bringing texts
   in line would be a later step, only for the words you confirm.

101. [ ] **Keep mine after an undo (backlog #6):** edit a block, change the same note in another editor and save, so the
   "changed on disk" notice appears; type something into the block, press `Ctrl Z` to undo it, then press "Keep mine" on the
   notice. The undone text must not come back. The same with `Ctrl Enter` (a state change) instead of the undo. Rare to
   reproduce by hand; it is covered by unit tests.

102. [ ] **Pasted text with a hidden mark (backlog #8):** copy text out of a file saved "UTF-8 with BOM" (Notepad's "UTF-8
   with BOM" option) that starts with `TODO buy milk`, and paste it into an empty block: it is a task, not plain text.
   Before, a hidden character in front kept it from being one. Hard to try by hand; covered by unit tests.

## Shorter web addresses

103. [ ] **Hide `https://` and shorten long web addresses:** Settings now has a "Themes" section (the theme picker, as before) and an
   "Appearance" section with two checkboxes, both off at first. Type `https://x.com/some/very/long/link` in a block and leave it:
   with "Hide https://" it reads `x.com/some/very/long/link`; with "Shorten" it reads `https://x.com/some/ver…`; with both, `x.com/some/ver…`.
   Clicking still opens the whole address, the block you edit shows the whole text, and the file is unchanged. Only a bare address is
   changed, not `[text](url)` or a mail link. The length (8 characters after the domain) is fixed. Question: should the number be a setting, and should it also apply
   inside the block being edited?

## Tag autocomplete

104. [ ] **`#` lists only tags:** type `#` in a block: the menu lists only names already used as a tag (the sidebar's
   "Tags"), no longer every page. A page that has never been used as a tag is not offered; typing its name ends with
   "New tag “#…”", which writes the tag as before. `[[` still lists all pages. Each tag is shown as it is written:
   `#budget`, or `#[[two words]]` for a name with spaces. My call: the last item now reads "New tag" instead of "Create
   page", since choosing it only writes the tag. Journal days are never offered after `#`.

105. [ ] **Appearance section, tidied:** in Settings > Appearance the two checkboxes ("Hide https://…" and "Shorten long
   web addresses…") now sit one above the other, styled like the Git section's checkbox, and the "This computer only…"
   note above them is gone. The Themes and Journal sections keep their own short "This computer only" notes.

106. [ ] **Trim the trailing slash:** Settings > Appearance has a third checkbox, "Trim the trailing slash from web
   addresses", off at first. With it, `https://x.com/docs/` reads `https://x.com/docs` (with "Hide https://" too:
   `x.com/docs`). Only one slash at the end goes; the file and the link's target keep it, and the block you edit shows
   the whole address. My call: the slash is trimmed before shortening, so `https://x.com/12345678/` with "Shorten" on
   reads `x.com/12345678` instead of `x.com/12345678…`.

## Open follow-ups (plan 12)

107. [ ] **The log never shows a Git password:** in Settings > Git set a remote such as
   `https://me:pa/ss@example.com/repo.git` (a password with a `/`, a `?` or a `#`, or with another `@`), let a sync
   fail, and open the log (Settings > Troubleshooting > "Open log folder"): the user name and password are replaced by
   `***` in `breccia.log`, with no part of the password left. Also: when the log reaches its size limit and the old
   copy `breccia.1.log` cannot be replaced (for example because it is open in another program), `breccia.log` is kept
   and keeps growing; it is only cut when it is over twice the limit. Hard to try by hand; covered by unit tests.

108. [ ] **A press on a slider's knob keeps the value:** in a page's color picker, press the "Custom hue" knob a few
   pixels off its centre (near its edge) and release without moving: the hue stays as it was (before, it jumped by up to about 11). Dragging the
   knob still follows the pointer and saves once on release. A press on the track away from the knob still jumps there.
   The same on the "Vividness" slider.

109. [ ] **Joining a block onto a task keeps its created and done lines:** make a task (`Ctrl Enter` on a block gives
   it a state and a `created::` line; finishing it adds a `done::` line). Add a block with one line of text right below
   it and press `Backspace` at the start of that block: the text joins the task's own text, and the `created::` and
   `done::` lines stay on their own lines below it, unchanged. `Ctrl Z` puts everything back. After `Backspace` in an
   empty block, and after `Ctrl Shift K` on a block, the caret lands at the end of the block above's own text, before
   its `created::` and `done::` lines (before, it landed after them and typing went onto the property line).

110. [ ] **A changelog link without text:** a link written `[](https://example.com)` in `CHANGELOG.md` shows its web
   address in the changelog (Settings > About > "Show changelog"), as a link. Needs a hand-edited changelog to see;
   `just dev` builds the app with the committed one.

111. [ ] **The website at phone and tablet width:** open the site at 375 px wide: the board screenshot fades out at its
   right edge to say it scrolls sideways, and the fade goes when you scroll to its end. At 768 px the two one-line
   cards (Page colors and Graph) sit side by side instead of each alone in a row. On a slow connection the hero's
   screenshot appears only once it has loaded (throttle the network in the browser's tools to see it). The opening
   animation, where tiles cross the "What it is" text at 375 px for about half a second, is left as it is.

112. [ ] **One CI run per change:** push a branch of this repository and open a pull request from it: GitHub Actions
   lists the run from the push, and the pull request's own run is skipped (it still appears in the list, but its job does not
   start), so the work is done once, not twice. A pull request from a fork still gets its run. A newer push to a branch
   cancels the run of the older one, but a run on `main` is never cancelled, so it always saves its cache. Developer
   only; look at the Actions page after the next pull request.

113. [ ] **Question (answered): `Backspace` at the start of a task that sits right below another task:** this is new in plan 12.
   Before, `Backspace` at the start of a block with several lines, under a task, joined its text onto the task's
   `created::` line and so corrupted that line. Now the join is refused: nothing is joined and a notice appears ("the
   change would alter the outline around the block"). Every task has a `created::` line, so this is what you see when
   you press `Backspace` at the start of a task right below another task. A block with one line still joins as
   described in item 109. Should the refusal stay? Or should it join anyway, putting the joined text before the
   task's property lines and keeping the lower task's own property lines (a later change)? Or something else?
   **Answered (owner, 2026-11-17): keep the refusal, with a notice in plain words. Done** (item 114).
114. [ ] **The notice when a block can't be joined onto a task:** in a page with two tasks one below the other, put
   the caret at the start of the lower task and press `Backspace`. Nothing is joined, both files stay as they were, and
   the notice reads "This block can't be joined onto the one above: its own lines would end up after the created:: and
   other property lines there". The same happens for any block with several lines under a block with property lines.

## Config comments

115. [ ] **A comment above a changed setting stays:** in `breccia/config.toml`, put a comment line above a Git or board
   setting (for example `# how long to wait` above `commit_delay_minutes = 5`), then change that setting in Settings.
   Before, the comment line above it was dropped; now the file keeps it byte for byte and only the value changes.

## Dailies (plan 13)

116. [ ] **The Dailies view:** the sidebar has "Dailies" right under Journal. Open it with no file: it says "No dailies yet"
   and offers the field "Add a daily". Type a text and press Enter: the daily appears and the field stays focused.
   Click a text to edit it (Enter or leaving the field saves, Esc cancels; an emptied field changes nothing). Right-click
   a row and choose Delete: Breccia asks "Delete the daily '…'?" (Esc cancels). Check `breccia/dailies.md` in an editor
   after each step: one `- text` line per daily.

117. [ ] **Ticking:** tick a daily: it turns grey and struck through and sinks below the open ones; the file gets a
   `checked:: YYYY-MM-DD HH:MM` line under it, and the order of the file does not change. Untick it: the line goes and
   the row is back. Hover a ticked row for the time it was ticked. Tick them all: the view says "All done for today".
   With "reduce motion" on in the system, the row jumps instead of sliding.

118. [ ] **Reordering:** drag an open daily above another open one: the file order follows (the daily is written right
   before the one you dropped it on). A ticked daily moves only among ticked ones. `Alt ↑` / `Alt ↓` on a focused row
   do the same by one place.

119. [ ] **The status bar item:** the left of the status bar shows "Dailies 3 open"; with all ticked it shows "Dailies ✓";
   with no dailies at all it shows nothing. A click opens the view. Back and Forward step through the view like the
   Archive.

120. [ ] **Starting afresh:** in Settings > Dailies (after Journal) the field takes `4:00` and saves `"04:00"` in
   `breccia/config.toml` under `[dailies]` (its comments stay). With 04:00, a daily ticked at 01:30 counts for the day
   before: it is open again after the 04:00 reset, and a daily ticked at 05:00 stays ticked until 04:00 the next day.
   Leave the window open across the reset time: the ticks go on their own (within a minute). Close Breccia, or let the
   PC sleep, over the reset time: on return the daily is open. Writing `reset = "4am"` in the file gives a notice and
   is read as 00:00; the file is not changed. Then type `00:00` (or any time) in the Settings field and leave it: the
   file now says `reset = "00:00"`, and the notice does not come back.

121. [ ] **Outside edits and Git:** edit `breccia/dailies.md` in another editor (add, reorder, tick a daily by adding a
   `checked::` line): the view follows at once. In Breccia, right-click a daily and choose Delete, and leave the
   question open; change that daily's text in the editor and save; then press Delete in Breccia: it is refused with
   "This daily changed in another program; the list now shows the file as it is.", and the file keeps the changed
   daily. The same holds for an edit field left open (click a daily's text, change it in the editor, then press Enter
   in Breccia): the editor's text stays.
   Text you added by hand (an intro line, a note under a daily) stays; the other dailies keep their text (a file with CRLF line endings becomes LF on Breccia's first write). A Git sync
   commit that touched only this file says "dailies" in its message.

122. [ ] **Dailies are plain text:** a daily written `Call [[Mum]] #family` shows exactly that, with no link and no
   tag; the text is not found by search and `Mum` gets no linked reference from it.

123. [ ] **Question (answered): deleting a daily:** the plan recommended an undo for a deleted daily. **Answered (owner,
   2026-11-18): ask before deleting and have no undo.** Done: the question names the daily, and when the daily has lines
   under it that the view does not show (nested blocks, a `note::` line, any property but `checked::`), it says that
   those lines go too. Is that enough, or should a deleted daily also be recoverable (the file is in Git, if you use it)?

124. [ ] **Dailies: ticked dailies are hidden:** tick a daily: it leaves the list and the header "▸ Done (1)" appears
   below the open dailies. Click the header: it opens (the triangle turns down) and shows the ticked dailies greyed and
   struck through, in their file order; they can be unticked, edited, dragged and deleted there as before. Click it
   again to close it. The section is closed whenever Breccia starts and stays as you left it while Breccia runs (it is
   not saved). With nothing ticked the header is gone; with all ticked the view still says "All done for today" above
   it. Should the open or closed state be remembered across restarts?
