# Plan 7 (Wash seams, slash dates, delete a block): follow-ups

Work the plan deferred. Open items are taken by later plans or moved to `docs/backlog.md`. Found by the pre-flight
scan, the per-task reviews and the final whole-plan review (2026-11-10). The plan closed backlog #75, #77 and #78.

## Owner checks

1. ~~**Review items 76 to 78** (`docs/review.md`). Not tried by anyone yet: the wash at a Windows display scale of
   125 % or 150 % and a selected washed row in the middle of a band (76); whether the labels of the date entries
   (with the calendar) sitting about 22 px right of "Link to page" look right (77); `Ctrl Shift K` by hand (78).~~ Closed in plan 12: review items 76 to 78 stay open in `docs/review.md`.
2. ~~**Question: should deleting every selected block keep one empty block?** Today `Ctrl Shift K` on a selection runs
   the same command as `Backspace` and `Delete`, which can leave a page without a block; only the block being edited
   is emptied when it is the page's only one. Decide whether all three keys should keep one empty block.
   **Answered (owner, 2026-11-11): yes, all three keys keep one empty block. Done** (review item 79).~~ Settled (answered by the owner on 2026-11-11, review item 79; done).

## Wash check (e2e step 128)

3. ~~**The scale is derived, not read.** `capture128` takes the scale from `png.width / innerWidth` (asserted within
   0.01) instead of the window's `devicePixelRatio`; the difference is under half a device pixel.~~ Closed in plan 12: under half a device pixel; asserted within 0.01.
4. ~~**The PNG reader** refuses colour types 0, 3 and 4 without a test, and a PNG without an `IDAT` chunk throws a zlib
   error instead of a clear message.~~ Done in plan 12 (the PNG reader is tested for the other color types and a file without data).
5. ~~**The pointer** is moved off the rows once, not after each theme and zoom change.~~ Done in plan 12 (step 128 moves the pointer off the rows after the zoom and the scroll too).
6. ~~**The margin is one step.** Worst measured 1 against a tolerance of 2, on one machine. If the step turns flaky,
   measure again; never raise the tolerance.~~ Closed in plan 12: an instruction, not work.
7. ~~**`pageColors.test.ts` matches the exact CSS text,** spaces included; a harmless reformatting breaks it.~~ Done in plan 12 (the page color tests ignore how the rules are wrapped).
8. ~~**Display scales other than 100 %** are not covered by any automated step (Breccia's zoom is). Review item 76 asks
   the owner for one check by eye.~~ Closed in plan 12: review item 76 asks for one check by eye.

## Slash menu

9. ~~**The daylight-saving assertion** in `slash.test.ts` can fail only in a European time zone; CI runs in UTC, so it
   never bites there.~~ Closed in plan 12: the test runs in a European zone, where `just test` runs before each push.
10. ~~**`/toda` and `/d` are not tested directly** in the unit tests (`/toda` is covered by e2e step 129).~~ Done in plan 12 (the slash menu matches a word start).
11. ~~**One commit holds two changes** (the new "Yesterday" entry and the rename "Today's date" to "Today"), so
    changelog line 2 has both. History is not rewritten; the owner may split the line at the `just release` pause.~~ Closed in plan 12: history is not rewritten; 1.4.0 is out.
12. ~~**Step 129 across midnight** accepts the impossible pairing of today's and yesterday's links, and its wait for
    "the query is gone" can pass at once; the final bytes still cover the outcome.~~ Settled (owner ruling on backlog #68, 2026-11-13).
13. ~~**The icon pass-through** in `editor/slash.ts` has no unit test (step 129 covers the drawn calendar).~~ Done in plan 12 (the calendar icon is tested on date items only).
14. ~~**The dates read the window's clock,** not `BRECCIA_TODAY`, so a test cannot fix the day for the slash entries.~~ Settled (same owner ruling, backlog #68).

## Deleting a block

15. ~~**Emptying an only block** that holds a task state, `key:: value` lines or a fence is not tested (core
    `edit.rs`, `session.rs`). The later settle for a state the block no longer has changes nothing, but no test says so.~~ Done in plan 12 (tests: an emptied only block with a state, properties or a fence stays one empty block).
16. ~~**A redundant second `self.find(id)?`** in `Document::delete_block` (`edit.rs`).~~ Done in plan 9 (the second lookup is gone).
17. ~~**Deleting an already-empty only block** returns a focus although nothing changed (`session/mod.rs`).~~ Done in plan 12 (a test pins that deleting an already empty only block writes nothing and adds no undo step).
18. ~~**Board cards are untested:** `Boards.patchCard` when the card's root block is deleted. The key in another view
    with a single shown row of its page is unit-tested only for the linked-reference case; the caret ends editing.~~ Settled (the `boards.test.ts` test "the open card follows its page and closes when its block is gone" covers it).
19. ~~**The caret lookup is quadratic** in the shown rows: one frame at about 4,000 to 5,000 rows.~~ Moved to backlog #85 (a note).
20. ~~**No test of `Ctrl Shift K` followed by `Escape`** before the core answers.~~ Closed in plan 12: it needs a DOM harness (backlog #66 ruling).
21. ~~**Step 130's caret check** for the emptied block passes for any empty line.~~ Done in plan 12 (step 130 compares the block id of the caret).
22. ~~**`Backspace` in an empty block with children** moves the children up (spec §7.2 only says "deletes it"), while
    the new key removes them. Decide whether `Backspace` should follow the new rule.~~ Done in plan 12 (owner decision Q2: `Backspace` keeps moving the sub-blocks up; spec §7.2 now says so).
23. ~~**A page-level `Ctrl Z`:** with nothing edited or selected it does nothing. Decide whether it should undo on the
    page as a whole.~~ Moved to backlog #91.
24. ~~**The caret after a delete** goes to the end of the block above's whole text, which for a task is after its
    `created::` line; `Backspace` (merge) does the same.~~ Done in plan 12 (owner decision Q3: a join and the caret after a delete stop before a task's created and done lines; review item 109).
25. ~~**Mac:** `Cmd Shift K` is tested in unit tests only.~~ Closed in plan 12: there is no Mac build yet (audit, "Before the first macOS build").

## History

- The pre-flight scan found no critical gap; its findings were adopted as written, and the measurement in Task 1
  confirmed the gap toward the page background at zoom 110 % and 125 %.
- The final review found no critical issue; its three important findings (review items 76, 42/43 and the spec's
  "(while editing)") and the backlog marks were fixed in a docs-only wave.
