# Plan 14 (Open follow-ups of plans 12 and 13): follow-ups

Work the plan deferred. Open items are taken by later plans or moved to `docs/backlog.md`. Found by the per-task
reviews and the final whole-plan review (2026-11-19). The plan closed every open item of the follow-ups files of plans
12 and 13 and added backlog #95 (a cut-off page-tree row can drag the wrong row) and #96 (a "nothing left to save"
signal for e2e). The final review found nothing that had to be fixed before shipping; its three doc points were fixed
in the fix wave.

## Owner checks

1. **Review items 127 to 131** ask the owner to look at the changes: the log and a Git password with an apostrophe
   (127) and `file:///` addresses (128), both covered by unit tests; a daily is not deleted when lines were added under
   it while asking (129); the text menu while editing a daily (130); typing a number into a Settings field fixes a
   wrong value in `config.toml` (131).
2. **Ruling to confirm:** while a Settings number in `config.toml` is refused, clicking into its field and leaving it
   without typing also writes the shown value (as the Dailies reset field does). The plan kept this because it ends
   the repeating notice; review item 131 mentions it.

## Code

3. **A touch long press opens the Dailies menu without the row check** (before this plan): it can open over the edit
   field, for a row right-clicked earlier, or with no item.
4. **`oneAtATime` skips its pending extra run if the save rejects.** It cannot happen today (Settings writes never
   reject into it), but a later caller could lose a typed value.
5. **The Git section sends `Number(delay)`** rather than the value `numberCommit` worked out; the result is the same
   today.
6. **`moveTarget`'s upper clamp is defensive only:** no test can fail by removing it alone (the lower clamp is
   mutation-checked).

## Tests

7. **e2e `dAdd` names every wait "138 …"**; give it a step argument so a failure in a later step names that step.
8. **e2e step 145 covers the menu delete only;** the emptied-text delete sends the same row and is covered by Vitest.
9. **e2e step 147's "no notice came back" check is weak;** the byte check carries the step.
10. **Style:** some new Rust tests (Task 3) use multi-line string literals instead of `\n` escapes; the `'all'` comment
    in `dailiesState.test.ts` could say every other command is refused too.

## Process

11. **Two commit subjects are off:** `e5c3796` (the log fix) holds only its test, with the code in `aae140b`; the
    `chore` subject of `c81d3fe` is 117 characters. Both were pushed, so they stay.
