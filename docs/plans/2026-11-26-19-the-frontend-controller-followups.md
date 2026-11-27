# Plan 19 (the frontend controller): follow-ups

Work the plan deferred. Open items are taken by later plans or moved to `docs/backlog.md`. They come from the per-task
reviews and from the final whole-plan review (2026-11-26); the final review's "fix now" points were fixed in its fix
wave. Backlog #89 keeps only its two Git edges. The owner checks review items 158 to 163.

## Release pause (next `just release`)

1. Changelog lines to edit:
   - 3f13f9a belongs to the line of 3249c61 (the greyed window while the notes reload). Fold it in.
   - 521e21b is 93 characters, and "reloads" is wrong: the window stops waiting after 10 s and shows the text to
     copy, while the reload itself still waits behind the stuck save. Reword and shorten it.
   - a894613 ("Breccia needs a restart") is only true once a restart was asked for. Say so, or fold it into the
     restart line.
   - ef2f8ca needs two internal errors in a row to show. Drop it or fold it into the restart line.

   Done at the 1.9.2 release pause (2026-11-27): 3f13f9a and ef2f8ca dropped, 521e21b and a894613 reworded.

## Code

2. Split `app.svelte.ts` (about 1,650 lines) by area: navigation, boards, folders and closing, outputs (the Task 8
   ruling: after this plan, not in it).
3. The rename question after `page.renameReach` opens without a guard and replaces F1 or the search box (Task 5 M3).
   A replaced search box keeps `waitingEnter` and `pending` (M4; final review M6, M7).
4. The due calendar does not close when a dialog opens (pre-flight F14, unchanged from 1.9.1).
5. The recovery's refreshes (R4) run only once the route is known: a throw in `config.apply`, `applyBoard` or
   `applyFeed` still skips them (Task 7 M2).
6. The board's refused-move reload (`boardChanged`, then `boards.refresh`) and the column-width and layout saves live
   in `Board.svelte` and `Sidebar.svelte`, untested. Move them to tested controller methods, for example
   `app.boardCommand` (Task 10).
7. Components get values next to `app` that `app` also carries (`SettingsView` `recent`, `theme` and `journalsAt`,
   Board `folded` and `columnWidth`). Trim them when a component is next touched (Task 10).
8. A stuck `block.setText` that later answers with a refusal shows its text in a second copy notice (final review M5).
9. Owner note, not code: Q2 as built. The window stops waiting after 10 s and shows the text to copy, but the reload
   itself still waits behind the stuck save, because the core runs one command at a time. A core that is truly stuck
   ends in "Breccia is not answering. Please restart Breccia."

## Tests

10. The R4 test does not check that `journalChanged` and `others` are skipped (Task 7 M3).
11. No test that `journal.close()` drops a pending feed answer (Task 3; fold into follow-up 5's test work).
12. Vitest config (Task 6): resolve the Svelte client entry with `createRequire` instead of a hard-coded
    `node_modules` path, and build the unit exclude from `configDefaults.exclude`.
13. e2e step 127 simulates the bits-ui body lock instead of a real dialog. Its observer's style restore has no
    try/finally (Task 9 re-review).

## Docs

14. The README screenshots (`just screenshots`) differ with the date, so a rerun on another day changes the images
    without a change in the app (Task 10; same from the base). Keep them out of unrelated commits, or make the demo
    date fixed.
