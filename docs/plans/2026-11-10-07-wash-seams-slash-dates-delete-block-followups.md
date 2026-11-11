# Plan 7 (Wash seams, slash dates, delete a block): follow-ups

Work the plan deferred. Open items are taken by later plans or moved to `docs/backlog.md`. Found by the pre-flight
scan, the per-task reviews and the final whole-plan review (2026-11-10). The plan closed backlog #75, #77 and #78.

## Owner checks

1. **Review items 76 to 78** (`docs/review.md`). Not tried by anyone yet: the wash at a Windows display scale of
   125 % or 150 % and a selected washed row in the middle of a band (76); whether the labels of the date entries
   (with the calendar) sitting about 22 px right of "Link to page" look right (77); `Ctrl Shift K` by hand (78).
2. **Question: should deleting every selected block keep one empty block?** Today `Ctrl Shift K` on a selection runs
   the same command as `Backspace` and `Delete`, which can leave a page without a block; only the block being edited
   is emptied when it is the page's only one. Decide whether all three keys should keep one empty block.
   **Answered (owner, 2026-11-11): yes, all three keys keep one empty block. Done** (review item 79).

## Wash check (e2e step 128)

3. **The scale is derived, not read.** `capture128` takes the scale from `png.width / innerWidth` (asserted within
   0.01) instead of the window's `devicePixelRatio`; the difference is under half a device pixel.
4. **The PNG reader** refuses colour types 0, 3 and 4 without a test, and a PNG without an `IDAT` chunk throws a zlib
   error instead of a clear message.
5. **The pointer** is moved off the rows once, not after each theme and zoom change.
6. **The margin is one step.** Worst measured 1 against a tolerance of 2, on one machine. If the step turns flaky,
   measure again; never raise the tolerance.
7. **`pageColors.test.ts` matches the exact CSS text,** spaces included; a harmless reformatting breaks it.
8. **Display scales other than 100 %** are not covered by any automated step (Breccia's zoom is). Review item 76 asks
   the owner for one check by eye.

## Slash menu

9. **The daylight-saving assertion** in `slash.test.ts` can fail only in a European time zone; CI runs in UTC, so it
   never bites there.
10. **`/toda` and `/d` are not tested directly** in the unit tests (`/toda` is covered by e2e step 129).
11. **One commit holds two changes** (the new "Yesterday" entry and the rename "Today's date" to "Today"), so
    changelog line 2 has both. History is not rewritten; the owner may split the line at the `just release` pause.
12. **Step 129 across midnight** accepts the impossible pairing of today's and yesterday's links, and its wait for
    "the query is gone" can pass at once; the final bytes still cover the outcome.
13. **The icon pass-through** in `editor/slash.ts` has no unit test (step 129 covers the drawn calendar).
14. **The dates read the window's clock,** not `BRECCIA_TODAY`, so a test cannot fix the day for the slash entries.

## Deleting a block

15. **Emptying an only block** that holds a task state, `key:: value` lines or a fence is not tested (core
    `edit.rs`, `session.rs`). The later settle for a state the block no longer has changes nothing, but no test says so.
16. **A redundant second `self.find(id)?`** in `Document::delete_block` (`edit.rs`).
17. **Deleting an already-empty only block** returns a focus although nothing changed (`session/mod.rs`).
18. **Board cards are untested:** `Boards.patchCard` when the card's root block is deleted. The key in another view
    with a single shown row of its page is unit-tested only for the linked-reference case; the caret ends editing.
19. **The caret lookup is quadratic** in the shown rows: one frame at about 4,000 to 5,000 rows.
20. **No test of `Ctrl Shift K` followed by `Escape`** before the core answers.
21. **Step 130's caret check** for the emptied block passes for any empty line.
22. **`Backspace` in an empty block with children** moves the children up (spec §7.2 only says "deletes it"), while
    the new key removes them. Decide whether `Backspace` should follow the new rule.
23. **A page-level `Ctrl Z`:** with nothing edited or selected it does nothing. Decide whether it should undo on the
    page as a whole.
24. **The caret after a delete** goes to the end of the block above's whole text, which for a task is after its
    `created::` line; `Backspace` (merge) does the same.
25. **Mac:** `Cmd Shift K` is tested in unit tests only.

## History

- The pre-flight scan found no critical gap; its findings were adopted as written, and the measurement in Task 1
  confirmed the gap toward the page background at zoom 110 % and 125 %.
- The final review found no critical issue; its three important findings (review items 76, 42/43 and the spec's
  "(while editing)") and the backlog marks were fixed in a docs-only wave.
