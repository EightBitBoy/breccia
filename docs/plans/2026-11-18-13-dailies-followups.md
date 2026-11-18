# Plan 13 (Dailies): follow-ups

Work the plan deferred. Open items are taken by later plans or moved to `docs/backlog.md`. Found by the per-task
reviews and the final whole-plan review (2026-11-18). The final review found nothing that had to be fixed before
shipping; its fix wave (four commits, `eb3d868` to `24305e4`) is done. Features the owner left out of the plan are
backlog #92 (weekday-only dailies), #93 (a history or streaks of dailies) and #94 (groups of dailies).

## Owner checks

1. **Review items 115 to 123** ask the owner to look at the changes by hand: the config comment that stays (115), the
   Dailies view (116), ticking (117), reordering (118), the status bar item (119), the reset time (120), outside edits
   and Git (121), dailies as plain text (122) and the answered question about deleting (123, no undo).

## Code

2. **Pressing a row cut off at the page tree's edge can start a drag on the wrong row** (pre-existing, found in Task 7).
   It is more likely in short windows now that the sidebar has the Dailies entry.
3. **Number fields in Settings cannot put back the default by typing it** (`[git]` minutes, `[board]
   archive_after_days`). When the file holds a refused value, the field shows the default, so typing it hits the "tidy
   only" path and sends nothing; the file keeps the bad value and the notice repeats. `ConfigView.replaced` now names
   these keys too, but their fields do not use it yet. The Dailies reset field does (`resetCommit`).
4. **Delete does not carry `nested`.** If lines are added under a daily from outside while the delete question is open,
   the daily is deleted with them and the question did not mention them. The `shown` text check refuses a changed first
   line, not new lines under it. Narrow.
5. **An outside write between the re-read and the atomic write is possible** (no locking; the same as pages).
6. **The unreadable notice comes only when the file turns from readable to unreadable**, not on every later change. By
   design.
7. **Right-click during an inline edit blocks the field's native text menu** (copy and paste) in the Dailies view.
8. **Enter then blur can send the same value twice** in the Dailies reset field (the same as the Git and archive
   fields).
9. **A failed reload inside `send` can give a second notice** (`app/src/lib/dailiesState.ts`).
10. **The Dailies view is imported statically**, not loaded lazily like Archive. Reduced motion is read once when the
    view opens. `confirmSetting` in `App.svelte` is also used for the Dailies delete, so its name no longer fits.
11. **Small and harmless:** `EmptyDaily` and `MultiLineDaily` share one message; `one_line` strips every `\r`, also a
    lone one mid-line; `add_daily` clones the document for rollback; `resetParts` trusts the core's `HH:MM`; `before` of
    `dailies.move` gets no text check (only the order changes); a blank continuation line also sets `nested` (errs
    safe).

## Tests

12. **Missing tests:** check on a daily with two `checked::` lines (the first place is kept); the I/O-error branch of
    `load_dailies`; `moveTarget` with out-of-range input; the failure notice of `load()`; the "tidy only" path of the
    reset field (4:00 shown as 04:00, nothing sent).
13. **The unreadable-warning test matches the Debug output** of the warning, not a field.
14. **Redundant test code:** a redundant variable in a DST test, a redundant `now` initialiser, a dead `setClock` call and
    an unneeded `tick()` in the Dailies state tests.
15. **e2e:** `frames()` after Cancel or Esc is a weaker "no write happened" guard than waiting over the save pause. Older
    sleeps in `app/e2e/smoke.mjs` (about lines 127 and 152) predate this plan and break the "never sleeps" rule.

## Docs

16. A few lines in `docs/review.md` and `docs/spec.md` run past the usual wrap width.
