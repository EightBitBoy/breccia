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
