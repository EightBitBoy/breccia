# Plan 17 (due date follow-ups): follow-ups

Work the plan deferred. Open items are taken by later plans or moved to `docs/backlog.md`. Found by the per-task
reviews and the final whole-plan review (2026-11-24); the final review's "fix now" points were fixed in its fix wave.
Plan 16's follow-ups 4, 12, 13 and 16 stay open in their own file. The owner checks review items 137 to 139.

## Release pause (next `just release`)

1. ~~Changelog lines: use "Tasks and cards show a due date chip, amber when near and red when overdue" for the long line
   (plan 16 follow-up 4). Fold or drop the three `fix(app)` lines of plan 17 (64805dd, 632e56c, 2dd7bb4): they fix
   plan 16 features that were never released. Merge the pages' right-click line (b744d84) with plan 16's task-menu
   line (32393cb) if they read as duplicates.~~ Done at the 1.9.0 release pause (2026-11-24): the long line shortened,
   the three fix lines dropped, the two menu lines kept.

## Code

2. Changing a link's topic now re-sends every page that links to it (before: only journal days): a color change on a
   page with many backlinks sends many page views in one answer. Measure at graph scale (`just graph-scale`); consider
   sending only the shown page.
3. Focus edge cases in the right-click menu: the focus saved at a right press can go stale (harmless); a click outside
   the task menu while editing may give the focus back to an editor that is closing (it ends on the page body;
   untested).

## Tests

4. e2e steps 154 (no menu on a day link) and 155 (focus after Esc) check that something is absent right away; wait on
   a state instead (the menu's open or closed attribute), so a late menu still fails the step.
5. `due_line_with_words_before_the_date_stays_visible` does not check that the link renders; no test that picking the
   same day on a line with words drops the words; no e2e for `Ctrl Z` bringing the words back; `today.test` checks
   only that the listener is removed, not that the midnight timer is cleared; `try_set_due`'s error branch is never
   taken; `rename.rs` could pin `],"hasFile":true,"targets":[`.
6. Style: the fence tests in `crates/core/tests/it/task.rs` use multi-line string literals where their neighbours use
   `\n`.
7. e2e step 110 (board column peek) failed once in three runs during Task 6; plan 17 did not cause it. If it fails
   again, make it wait on the board page's removal rather than a fixed 10 s.

## Docs

8. Some lines run past the 120-column wrap: `docs/spec.md` around lines 258 and 337, `docs/format.md` around 854 to 856,
   `docs/backlog.md` around 313 and 320. Rewrap them with the next edit of each file.
