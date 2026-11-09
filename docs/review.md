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
12. [ ] **Typing in Settings boxes:** type in one box while another change is saved or refused; the typed text must stay.
15. [ ] **Graph:** filters, hover, Find, keyboard keys, Re-arrange.
17. [ ] **Graph at scale:** run `just graph-scale --onscreen` and judge pan and zoom by eye (wheel zoom at 5,000 pages is
   known to be slow, backlog #56).
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
31. [ ] **Color from a link in the journal:** right-click a link or tag in the feed and on a day page, choose
   "Color…" and pick; the linked page gets the color and the washes follow. An alias link colors the aliased page,
   a tag without a page gets its file, and links to days or to missing pages show no "Color…" entry. Inside an open
   block editor, and on selected text that is not a link to a colorable page (including a link to a day or a missing
   page), the normal browser menu stays, so copy and paste keep working; say if you want the color menu there too. Undo for such a pick is on the linked page (its swatch or its blocks), not in the journal.
32. [ ] **Demo and README:** the demo pages Q&A: hiring, Release 2, on call and Project X have colors, the
   2026-10-29 journal has one new block, and the README journal screenshot shows the washes.

## Custom page colors

38. [ ] **Undo:** one `Ctrl Z` takes back one whole drag or one Enter on the slider.

## Slash menu

42. [ ] **States as chips:** type `/` in a block. Each state in the menu is drawn as the same colored chip it has on a page (TODO grey, DOING amber, and so on), still with the "state" note at the right; Link, date and time stay plain text. Change a state color in Settings and the menu follows.
43. [ ] **Slash menu: no "Current time", new "Date…":** `/` no longer offers "Current time". "Today's date" stays. A new
   "Date…" (also found by typing `/date`) opens the date picker; picking a day inserts `[[2026-11-09]]`-style link at the caret and
   puts the focus back in the block. `Esc` closes the picker and returns to the block with nothing inserted. The picker
   still appears by the sidebar's Journal row (the sidebar is shown first if hidden); say if you want it at the caret.
44. [ ] **Journals position in the sidebar:** Settings > Journal has three choices: "At the top", "At the bottom"
   (the default, as before) and "Among the folders, by name". The sidebar's Pages list follows at once and the choice
   survives a restart. "Among the folders" puts Journals between the top-level folders in alphabetical order (ignoring
   case), before the single pages, because the list shows folders first; say if you want it mixed in with the pages
   too. The setting is for this computer only and is not stored in the notes folder. Journals' own fold, years, months
   and days work the same in each place.
