# Owner review list

What the owner should look at in the running app. Claude adds a numbered item for every change a user can see, and
every open question, when it lands. The owner ticks an item off (`[x]`) or writes a note under it. Numbers are never
reused. Ticked items move to `docs/reviewed.md` with their notes.

## Carried over from the prototype

1. [ ] **Column menu:** hovering a board column shows only the hide icon. The DONE column's ... menu offers only "Archive
   finished more than N days ago"; other columns have no ... menu.
2. [ ] **Scrollbars hide at rest:** the main view's scrollbars (also the board's sideways one) and the sidebar's page
   and tag list show only while the mouse moves over them or they scroll (wheel, keys, thumb), and fade about 1 s after
   the mouse rests or leaves. Text never shifts. Check both themes, and that the scrollbar can still be grabbed.
3. [ ] **Showing a hidden column is animated:** a click on a hidden column's marker widens it from the line in about
   150 ms (none with Windows' reduce-animations setting). A column that opens while a dragged card rests on its marker
   appears at once.
4. [ ] **Hide a column, then drag:** start a card drag within 150 ms of hiding a column; the old column should not stay
   half-narrowed.
5. [ ] **`just e2e` from your own terminal:** run it once and confirm no window flashes and keyboard focus stays where it
   was.
6. [ ] **Manual pass: sidebar, tree, watcher:** with `just dev`, try the sidebar layout, the page tree, folding, opening
   ancestors, and edits made outside Breccia (rename or delete files and folders in Explorer).
7. [ ] **Manual pass: journal, boards, first automatic archive:** on a real notes folder, check the journal, boards and
   the first automatic archive run (does it change what you expect?).
8. [ ] **Search, typed dates, date picker, status bar:** try search (including Enter on a name that does not exist, which
   is open question backlog #28), typed dates, the date picker and the status bar items.
9. [ ] **Git with a real remote:** sync click, closing the app during a sync, and a conflict created from another
   machine.
10. [ ] **Git over SSH without an agent:** a remote whose key needs a passphrase and no agent running; the sync should
   fail with a clear message, not hang.
11. [ ] **Settings:** themes, renaming and removing a used task state, hand edits of `config.toml` while Settings is
   open, switching folders and the recent folders list.
12. [ ] **Typing in Settings boxes:** type in one box while another change is saved or refused; the typed text must stay.
13. [ ] **Resize and theme switching:** resize the window and switch themes with the journal and All pages open.
14. [ ] **System theme follows Windows:** set the theme to System, change Windows between light and dark, and watch
   Breccia follow (no automated test covers this).
15. [ ] **Graph:** filters, hover, Find, keyboard keys, Re-arrange.
16. [ ] **Faded dots in Dark, Violet and Graphite:** faded dots must stay visible but quiet in each theme.
17. [ ] **Graph at scale:** run `just graph-scale --onscreen` and judge pan and zoom by eye (wheel zoom at 5,000 pages is
   known to be slow, backlog #56).
18. [ ] **`just release` at a real console:** at the pause, try Ctrl+C and a wrong answer (it should ask again); with an
   SSH key that needs a passphrase, check the push prompt after the pause.
19. [ ] **Open the demo in Obsidian:** open a copy of `docs/demo/` in Obsidian and compare what you see with
   `docs/compatibility.md`.
20. [ ] **Alias links in Obsidian:** check that a typed `[[Q&A: hiring]]` link resolves through the alias Breccia writes
   (`docs/compatibility.md` still says "not verified").
21. [ ] **Very narrow window:** the sidebar button and the back and forward buttons at the top of the main area should
   still fit and work.
22. [ ] **Install on a clean machine:** on a second PC or in Windows Sandbox with internet, check the SmartScreen
   warning, no admin prompt, the version in Settings, that a notes folder opens, and that uninstalling keeps the notes
   (never recorded as done; you install releases on your own PC).
