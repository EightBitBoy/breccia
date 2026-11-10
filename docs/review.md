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
43. [ ] **Slash menu: no "Current time", new "Date…":** `/` no longer offers "Current time". "Today's date" stays. A
   new "Date…" (also found by typing `/date`) opens the date picker; picking a day inserts `[[2026-11-09]]`-style link
   at the caret and puts the focus back in the block. `Esc` closes the picker and returns to the block with nothing
   inserted. The picker still appears by the sidebar's Journal row (the sidebar is shown first if hidden); say if you
   want it at the caret.
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
   100 %, and in one light theme. The colors look as before.

77. [ ] **Today and Yesterday:** in a block type `/`: after "Link to page" come "Today", "Yesterday" and "Date…", each
   with the small calendar of the date picker (the entry once called "Today's date" is now "Today"). `/date` lists all
   three. "Today" inserts a link to today's day (`[[YYYY-MM-DD]]`), "Yesterday" a link to yesterday's day, and "Date…"
   opens the date picker. Check "Yesterday" shortly after midnight once if you can.

78. [ ] **Delete a block:** in a block with sub-blocks press `Ctrl Shift K`: it goes with its sub-blocks, the caret is
   at the end of the block above, `Ctrl Z` brings all back. On a page's only block the block is emptied. With blocks
   selected (`Shift ↓`) the key deletes them. F1 and Settings > Keyboard list it.
