# Plan 9 (Core housekeeping): follow-ups

Work the plan deferred. Open items are taken by later plans or moved to `docs/backlog.md`. Found by the pre-flight
scan, the per-task reviews and the final whole-plan review (2026-11-11). The plan closed audit moves M1 to M8, M10 to
M14, M16, M18, M22 to M31 and M33, backlog #31, and these follow-ups of earlier plans: plan 1 follow-ups 10 and 11,
plan 2 follow-ups 8 and 12, plan 3 follow-ups 5 and 7, plan 6 follow-up 18 and plan 7 follow-up 16.

## Owner decisions and checks

1. **Q1, out-of-range values in a hand-edited `config.toml`:** kept as before (they load silently and are used as
   written); now backlog #80, with the two alternatives.
2. **Q2, a `.MD` page file saved while Breccia runs:** fixed in Task 9 (the watcher passes it on, and the "only `.md`
   is loaded" notice appears at once). The owner checks review item 87.
3. **A case-only rename on Windows** from `X.md` to `X.MD` shows that notice while the page may stay loaded until the
   folder is opened again (an edge of Q2; noted on review item 87). `crates/core/src/watch.rs`, `workspace/disk.rs`.

## Code

4. **`watch::relevant` has a catch-all `Err(_) => false`** (`crates/core/src/watch.rs`). Only `NonUnicodeName` reaches
   it today; a new `LoadWarning` would be dropped silently. Make the match exhaustive with the next `LoadWarning`
   change.
5. **`journal_display` and `day_long` are one function under two names** (`crates/core/src/naming.rs`); keep one, or
   make one a documented alias.
6. **`Changes` derives `Debug` without need** (`crates/core/src/workspace/changes.rs`); `Default` is used.
7. **`try_from(...).ok()?` in `crates/core/src/color.rs` can never fail;** a comment or `expect` would state why.
8. **Comments to add:** the redundant `.replace("\r\n", "\n")` in `crates/core/src/config/file.rs` `edit_file`
   (toml_edit already writes LF; kept as a safeguard); `with_property`'s `i == end` and the append after the loop
   (`crates/core/src/inline.rs`); `QueryLink.kind` (`crates/core/src/search/query.rs`); the long doc line on `HAND_LF`
   (`crates/core/tests/it/config.rs`).
9. **The search index:** no test for a failed delete of a garbage index file (needs a locked-file seam); `recover`
   lost a theoretical internal retry on a freshly deleted file, which cannot happen in practice
   (`crates/core/src/search/`).
10. **`events.rs` tests copy the `clock()` helper** that `lib.rs` and `guard.rs` tests also have
    (`app/src-tauri/src/`); one `#[cfg(test)] pub(crate) fn test_clock()` in `lib.rs` would do.

## Tests

11. **Test tidy-ups in `crates/core/tests/it/`:** `board.rs` `ok_on` keeps its own panic body; rename and tree tests
    build `folder(files, dirs)` where `open_at` would do; scale, page_color and place tests write `2026-10-29` instead
    of `DAY`; `support::run` has no doc comment and `support::ids` fixes `DAY` and ms 0 without saying so;
    `page_color.rs` has a `DAY` literal of about 380 columns (could use `concat!`) and a comment that overstates what
    `color == None` guards; `task.rs` builds an expected string with `.replace` instead of a literal; the `color.rs`
    test mixes qualified and unqualified names; `disk.rs` sends `page.open "Other"` twice and ignores the first answer.
12. **Debug-text comparisons:** `parse_and_check_states_agree_on_keywords` (`it/config.rs`) compares `Debug` prefixes
    and `open_table` (`it/workspace.rs`) parses the `LoadWarning` kind from `Debug`; `matches!` would be sturdier.
13. **No test pins empty-valued property lines** (`priority::`) or CRLF in the `it/task.rs` characterization. Behaviour
    did not change (`with_property` uses the same `property()`), but a test would hold it.

## Flaky runs

14. **One unexplained red `just test`** in Task 4, green on rerun (the diff was a pure move; likely a file-system or
    watcher-timing test). Not named; name it if it comes back.
15. **`app/scripts/release.test.mjs`:** 1 of 24 failed once (Task 8), passed on rerun; probably the same as an
    unnamed single Vitest failure in Task 7 while cargo ran in parallel.
16. **e2e step 118** (`showDay`, `app/e2e/smoke.mjs`) failed once: `scrollIntoViewIfNeeded` on an element that was
    re-rendered. Not caused by this plan; retry inside the wait.
17. **Vitest's fsModuleCache keeps `import.meta.glob` lists stale** in `app/src/lib/contract.test.ts` and
    `theme.test.ts` when shell files are added or removed, which gives false failures locally (CI is clean). The next
    shell split should expect this: read the folder with `node:fs`, or turn `fsModuleCache` off.

## Open from earlier plans

18. **Plan 6 follow-up 24** is still open: the `trace git state=…` lines (`app/src-tauri/src/git.rs`) are not in the
    form `app/e2e/trace.mjs` parses, so `BRECCIA_TRACE=1 just e2e` reports 12 unparsed lines.

## History

- Task 9's characterization tables (watcher, disk change, folder open, Git message names) passed on the old code; the
  deciders differed only in the `.MD` case that Q2 changed.
- Task 12's self dev-dependency (`breccia-core` with `test-seams` as its own dev-dependency) worked: the test hooks are
  behind the feature, and the shell's feature tree does not turn it on.
- Sizes reached: `crates/core/src/session/mod.rs` 1,494 to 522 lines (`execute` 138 lines); `app/src-tauri/src/lib.rs`
  1,841 to 437 lines.
- The final review found no critical or important issue. Its fix wave added a test that out-of-range Git and board
  settings answer `invalidSetting` with no folder open, tied the command table in `it/session.rs` to the commands in
  `command.rs`, replaced a search check that could never fail, and fixed the docs of `watch.rs`, `session/board.rs` and
  `session/graph.rs`.
- The M29 tests landed in the M28 commit (Task 13); the haiku implementer of Task 15 wrote no report file.
