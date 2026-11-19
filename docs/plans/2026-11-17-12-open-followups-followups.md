# Plan 12 (Open follow-ups of plans 1 to 11): follow-ups

Work the plan deferred. Open items are taken by later plans or moved to `docs/backlog.md`. Found by the per-task
reviews and the final whole-plan review (2026-11-17). The plan closed the open items of the follow-ups files of plans 1
to 11 and added backlog #87 to #91. The final review's docs fixes (review items 108, 112 and 113, the STATUS counts)
were made in the fix wave.

## Owner checks

1. **Review items 107 to 112** ask the owner to look at the changes by hand: the log without a Git password (107), the
   slider knob (108), joining a block onto a task (109), the changelog link without text (110), the website at phone
   and tablet width (111) and one CI run per change (112). Item 107 is hard to try by hand and is covered by unit tests.
2. ~~**Review item 113 is an open question:** `Backspace` at the start of a task right below another task is now
   refused with a notice.~~ Answered (owner, 2026-11-17): the refusal stays, and the notice now says why in plain
   words (review item 114).

## Code

3. ~~**Redaction of a token-only user name with a raw `/`** (`https://to/ken@host`) is kept in the log
   (`app/src-tauri/src/logfile.rs`, `redact`). A raw `/` there is invalid URL syntax and Git needs it percent-encoded,
   so this is unlikely.~~ Closed in plan 14: won't fix (`https://to/ken@host` cannot be told apart from a path with an
   `@`; Git needs the raw `/` encoded).
4. ~~**A Git password with `'`, `"` or `<`** still shows its first part in the log (the same as before plan 12).
   Unlikely in a remote URL.~~ Done in plan 14 (an apostrophe no longer ends the address, review item 127). `"` and
   `<` closed: a working address must encode them.
5. ~~**Over-masking in the log:** `https://host:8080/a@b` and `file:///…/a@b.md` have part of the path masked
   (`app/src-tauri/src/logfile.rs`). It errs on the safe side.~~ Done in plan 14 (`file:///` addresses are no longer
   masked, review item 128). `host:8080/a@b` closed: errs safe.
6. ~~**`notes_root` is set after the watcher starts** (`app/src-tauri/src/watching.rs:77-84`), so `git.log` may see
   the previous folder a little longer after a folder switch.~~ Closed in plan 14: won't fix (only a Git history
   request already on its way can see the old folder).
7. ~~**An older watcher starts fully before it is dropped** (`app/src-tauri/src/watching.rs:20-84`): wasted work only.
   Checking `may_replace` first would save it.~~ Closed in plan 14: won't fix (wasted work only, during a folder
   switch that races a recovery).
8. ~~**A property line followed by text has no core test** (`crates/core/tests/it/edit.rs:148-181`); the window side
   has one. Add it with the next touch of `merge_into_previous`.~~ Done in plan 14 (core test of a property line
   followed by text, then a join).
9. ~~**`own_text_end` is `pub(crate)` but used only in `crates/core/src/edit.rs`.** Harmless.~~ Done in plan 14
   (`own_text_end` is private).
10. ~~**The `classify` comment in `crates/core/src/watch.rs`** about which warning it returns can go stale; the
    exhaustive match is the real guard.~~ Done in plan 14 (the stale-prone clause of the comment is gone).
11. ~~**Style:** one ~120-column doc line in `crates/core/src/config/range.rs` (on `replace_out_of_range`) and one in
    `merge_into_previous` in `crates/core/src/edit.rs`; an extra parenthetical at `crates/core/src/page_color.rs:285`;
    raw multi-line literals in `crates/core/src/task.rs:1389-1415` and `crates/core/tests/it/session.rs:2352-2420`
    instead of `\n`; the date `(2026, 10, 29)` hard-coded in `crates/core/src/board.rs:74` instead of `DAY`.~~ Done in
    plan 14 (style points tidied).
12. ~~**Changelog reader** (`app/src/lib/changelog.ts`): `VERSION` counts a linked heading whose URL has whitespace,
    which then renders literally, and `bulletCount` does not strip a BOM (`versionsOf` does). git-cliff writes
    neither.~~ Done in plan 14 (a linked heading whose URL has whitespace is no version heading). The BOM half:
    closed, not a defect (`\s` matches the BOM).
13. ~~**The slider's grabbed offset is not cleared on release** (`sliderDrag`). Every press resets it, so nothing goes
    wrong.~~ Closed in plan 14: won't fix (every press resets the grab; nothing goes wrong).

## Tests

14. ~~**`session.rs:1264`:** the first half of the undo test is vacuous; the second case covers it.
    **`task.rs:1418`:** the CRLF pin fails only when all three trims go, and the parser strips `\r\n` already.~~ Done
    in plan 14 (the vacuous first half is gone). The CRLF pin: closed, one more layer of guard.
15. ~~**Mutation checks not done:** the report of Task 2 names no mutations for the step 4 pins (`edit.rs:223`,
    `session.rs:1279`). `may_clear` was not mutation-checked, step 1 of Task 5 has no RED run, and no test shows that
    the shell calls `may_replace` and `may_clear`.~~ Done in plan 14 (mutation checks of the plan 12 pins and
    `may_clear`). A test that the shell calls `may_replace`/`may_clear`: closed, no harness for an app handle.
16. ~~**`two_threads_write_whole_lines`** (log tests) was never mutation-checked and likely cannot fail. Keep it as a
    smoke test.~~ Closed in plan 14: kept as a smoke test.
17. ~~**Tests tied to the shape of the source:** the regexes in `app/src/lib/contract.test.ts` (~75) and
    `page-colors.test.mjs:133` break loudly if the code is reshaped, and `ci-workflow.test.mjs` does not tie its `if`
    assertion to the build job (fine while there is one job) and has lines over 120 characters.~~ Closed in plan 14:
    failing loudly when the code is reshaped is the point; the `if` check is right while CI has one job.
18. ~~**Changelog tests:** `changelog.test.ts:93` does not check the heading's inlines, and the "keeps every word"
    test keeps its own copy of the comment regex.~~ Done in plan 14 (heading inlines checked; the comment regex is
    shared).
19. ~~**e2e steps that cannot fail as written:** step 128's pointer moves are stabilisation only; step 127's "typed
    but not sent" case is documented as unreachable and not checked against the app code; step 137 reads the file once
    right after a thumb press, so a late write could slip past (the `aria-valuenow` check catches the real
    regression).~~ Closed in plan 14: step 128's moves are stabilisation, step 127's case is documented as
    unreachable, and step 137's `aria-valuenow` check catches the real regression.
20. ~~**`/// <reference types="node" />`** sits in `contract.test.ts` and `theme.test.ts`; a `types` entry in the
    tsconfig would be tidier. A `TRACK_STEP` constant in `vividTrack` could be a module constant like `CUSTOM_DL`.~~
    Closed in plan 14: the per-file reference is narrower than a `types` entry; `TRACK_STEP` is used in one function.

## Website

21. ~~**Browsers without scroll-driven animations** get `--fade: 0` from `animation-fill-mode: both`, so they show no
    fade hint at all (`site/site.css`). An acceptable degradation.~~ Closed in plan 14: an acceptable degradation in
    older browsers.
22. ~~**The fade mask also clips the horizontal scrollbar** (`site/site.css:179-181`); phone scrollbars overlay, so it
    does not show.~~ Closed in plan 14: phone scrollbars overlay; nothing shows.
23. ~~**`order` is tied to the `nth-child` numbers** (`site/site.css:156-157`); a reordered card list would break the
    pairing silently. The site tests would show it.~~ Closed in plan 14: the site tests show a broken pairing.
24. ~~**The `afterDecode` wiring in `site/hero.js` has no unit test.** The helper is tested; the wiring is three
    lines.~~ Closed in plan 14: the helper is tested; the wiring is three lines.

## Docs

25. ~~**Spec §2 wording** (`docs/spec.md:222-225`): "a block of several lines is not joined onto a block with property
    lines" should read "onto a block whose text ends with property lines". Fix it when the spec is touched next.~~
    Done in plan 14 (spec wording).
26. ~~**Spec §7.2:** the `Ctrl Shift K` caret clause runs far past 120 columns. Rewrap it with the same edit.~~ Done
    in plan 14 (the `Keys` bullet rewrapped).
27. ~~**The changelog line for the join fix** does not mention the caret after `Backspace` in an empty block (same
    root cause as the fix). Acceptable.~~ Closed in plan 14: the 1.7.x changelog is published; the line is acceptable.

## Flaky runs

28. ~~**e2e step 101 ("wrap!" came out as "wrapy!es") once** while Task 8 was being built. Not reproduced in three
    runs; the cause is unclear. If it comes back, look at how the step types and when it checks the text.~~ Closed in
    plan 14: not seen again in many runs; reopen if it comes back.
29. ~~**Low memory:** one e2e build was killed for lack of memory (Task 10). `CARGO_BUILD_JOBS=2 just e2e` ran and
    passed.~~ Done in plan 14 (`docs/STATUS.md` names `CARGO_BUILD_JOBS=2 just e2e`).

## History

- Plan 12 ran as 13 tasks on `main`, with one implementer and one reviewer per task.
- The final review (opus) said "ready to merge with fixes": no critical findings; one important finding (review item
  113 described the refusal as old behaviour) and two minor docs fixes (items 108 and 112).
- One doc fix wave made those fixes and brought the STATUS counts up to date.
- `just e2e` ended at 208 PASS.
