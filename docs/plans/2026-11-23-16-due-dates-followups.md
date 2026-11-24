# Plan 16 (task due dates): follow-ups

Work the plan deferred. Open items are taken by later plans or moved to `docs/backlog.md`. Found by the per-task
reviews and the final whole-plan review (2026-11-23); the final review's seven "fix now" points were fixed in its fix
wave. Sorting by due date is backlog #98 and the card menu's missing keyboard path is backlog #99. The owner's checks
are review item 136.

## Owner questions (also in review item 136)

**Owner answers, 2026-11-24:** 1: a due line with text after the date stays visible (dimmed, like other properties)
as well as the chip; without extra text it stays hidden. 2: overwrite, as now (a words-only `due::` line is replaced by
a picked date, and "Remove due date" deletes it). 3: keep the pages' right-click zone and add "Color…" on page links on
ordinary pages too (core change); the changelog gets a line for it. 4: the release notes use "Tasks and cards show a
due date chip, amber when near and red when overdue". Items 1, 3 and 5 to 17 go into plan 17 (owner, 2026-11-24).

1. **Text after the day link is hidden.** In `due:: [[2026-12-01]] urgent` the word "urgent" is hidden with the line
   in a rendered task (the chip stands for the line, as the done chip does for `done::`). The owner may want such a line
   kept visible.
2. **Picking a date overwrites a words-only due line** such as `due:: ask Ben`. If the owner prefers, set and remove
   could touch only `due::` lines whose value is a day link.
3. **Ordinary pages' new right-click zone** has no changelog line of its own ("Copy link" on web and mail links; the
   browser's own menu no longer opens there). Add a line at the release pause if the owner keeps it.
4. **Changelog wording:** the subject of `ceea0cc` is 95 characters; shorten its `CHANGELOG.md` line at the release
   pause (for example "Tasks and cards show a due date chip, amber when near and red when overdue").

## Code

5. `set_due` and `set_priority` re-indent a sibling line that an unclosed code fence swallowed, when they replace a line
   (a quirk the two share; it was there before).
6. `render.rs` `block_html`: the task state is computed three times, and `let finished = is_finished` is a redundant
   alias.
7. `Today.start()` has no guard against being called twice; the due chip's month names are the fifth local copy
   (`allPages`, `archive`, `git`, `gitLog`); a shared one would do. The `--due-*` token lines sit in the middle of the
   `--c-*` run in each theme block.
8. `cardDue` (`board.ts`) restates `dueChip`'s return type instead of reusing it.
9. The due date calendar: an outside click gives the focus back to where it was and may fight the click's own focus;
   "Remove due date" uses the class `dp-today`; the today ring is hidden under the chosen day's fill when the due date
   is today.
10. After a pick from the task right-click menu with nothing focused before, the focus lands on the hidden
    `div.link-zone` (bits-ui puts it there). The task logic (`taskOf`, `TaskSpot`) lives in `linkColor.ts`, a file
    named for link colors; its header comment says more about the saved focus than the code does, and does not cover
    Esc on the task menu.
11. `Ctrl D` with no block found (`App.svelte`, `if (!b) return`) does nothing without a word; `pickDue` skips the
    `dialogOpen()` / `search.shown` check that `pickDate` has (harmless while the editor has the focus).

## Tests

12. The fence test in `task.rs` (`set_due_never_changes_the_outline_around_the_block`) is a regression pin only; its
    source strings are multi-line literals, unlike the neighbouring tests.
13. No session-level test that setting the same date twice changes nothing (a document-level one exists); a bad date
    on an unknown block answers `badDate` before the block lookup (harmless).
14. `dueChip` has no case for a finished task due in another year, and none for a leap day.
15. No test for `menuClosed`'s focus fallback; no test for the `coordsAtPos` null fallback in `host.svelte.ts`;
    `Ctrl D` inside an open card's task is untested (it should work, since the card keys pass it through);
    `linkColor.test.ts`'s `row()` casts with `as BlockView`; `Board.svelte`'s `duePick` import is out of order.
16. e2e step 152: the card chip's text and tone are read once without waiting (low risk, the date is in the file before
    the board opens); the finished chip's `title` is never checked to be absent; the month-end and year-end paths of
    the step only run on the days they apply to; `today` is fixed when the script starts (a run across midnight fails,
    as for every journal step).

## Docs

17. `docs/compatibility.md` says a `due::` line is text in Obsidian; with the Dataview plugin `due::` is an inline field.
    Add "(not verified)" or check it.
