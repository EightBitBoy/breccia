# Plan 18 (performance at 5,000 pages): follow-ups

Work the plan deferred. Open items are taken by later plans or moved to `docs/backlog.md`. They come from the per-task
reviews and from the final whole-plan review (2026-11-26); the final review's "fix now" points were fixed in its fix
wave. The speed points still over their bars are in backlog #85 (the notes lock under 100 ms, fewer Git starts per
history load, reloading only the newest history rows, the full-text merge spike) and #83 (the graph). The new items are
#103 (an early search answer during the first build) and #104 (a counter or an early journal while a folder opens);
#102 (letters in the wrong row while typing fast during the first build) stays open for later. The owner checks review
items 147 to 157.

## Release pause (next `just release`)

1. Changelog lines to edit:
   - 08b0611 says a pull "no longer makes typing wait", but the lock is still about 0.4 s. Merge it with dba6c8b and
     a2a27e9 into one Git sync line, or soften it.
   - d7755bf: drop the "shows a commit that changed no file" half (review item 155 covers it).
   - a2a27e9 (97 characters) and 782ee54 (93) run over the ~90-character rule.
   - 25d061a and a2a27e9 guard a change that was never released (the fast pull). Fold them into the pull's line or
     drop them.

## Code

2. `unpushed()` runs without the folder filter. In a big repository with a nested notes folder and a remote never
   pushed to, it returns every HEAD hash (a few MB at 100,000 commits). The marks are right. Keep `-- .` there if a
   big monorepo is ever reported.
3. The first index build sends about 500 `index:changed` events at 5,000 pages (was about 200). Runs started by an
   outside change also use 10-page steps now. If it ever shows, send at most one event every N ms or every 25 pages.
4. `read-tree -m -u` failing part-way on a pull (a locked file, say) leaves the files partly at the pulled commit
   while HEAD stays at the base. The next commit and rebase heal it without losing text. Add a test or document the
   self-heal.
5. After `git replay`, a branch put back by Breccia could undo the user's own `git reset --soft` or `git branch -f`
   made in the same milliseconds. The reflog keeps the old position. Accepted.
6. A `rev-parse` failing right after replay stops the pull before any commit, but no test covers that branch.
7. The Git history (Task 5): the All pages filter does not jump to the top, unlike the Archive's (an owner call). A
   focused row or a text selection is lost once its rows scroll out (as in All pages). `scrollToIndex` is unused
   until keyboard row navigation exists. "Show more" could hang if a load adds zero rows (measure only).

## Tests

8. e2e step 166 relies on a 3 s test delay. A cold WebView2 needing longer could flake it. Make the hook wait until
   the window has asked whether a folder is opening.
9. `the_first_build_works_in_smaller_steps_than_the_chunk_size` is two const asserts, so a revert of the loop's
   constant would not fail it. The real guard is the ignored local `scale::` line.
10. Step 166's new `last_folder` check was never seen failing (that needs a release build without it).
11. The Task 3 source-order test is brittle, and one rejection is unhandled (cosmetic, accepted).

## Measuring

12. The machine was busy during Task 7. Caret down at 5,000 rows (12.9 to 27 ms over all runs, bar 16), `pages.table`
    (122 to 203 ms, bar 100) and the window showing (about 0.5 s, bar 0.5) are unsettled. Repeat `just perf-scale` and
    the `scale::` run on a quiet machine. #85 lists them as still open.
13. `locked_for` keeps only the longest single lock hold of a pull. The printed label does not say so.
14. The scale folder has 5,005 pages (5,000 plus 5 tag pages). The names say 5,000.

## Taken from earlier plans

15. Plan 17 follow-up 2 (a color change re-sends every linking page): measured by plan 18. `page.setColor` on a page
    linked from 1,000 days takes 131 to 142 ms, within its 300 ms bar. Closed.
