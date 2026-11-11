# SDD ledger — plan: docs/plans/2026-11-11-09-core-housekeeping.md

Setup 2026-11-11: workspace, briefs 1-15, constraints.md. BASE d6fae9d. Owner approved plan with Q1 = backlog, Q2 = fix in Task 9 Step 7.

Pre-flight (opus): preflight.md, 1 critical, 9 important, 18 minor. Ruling: apply every proposed correction in preflight.md (C-1, I-1..I-9, M1..M18) as written, appended per task to each brief — the scan checked each against HEAD code and none changes visible behaviour beyond the owner's Q2 — cost if wrong: rework in the affected task. I-4 note: the silent drop of `.MD` is in the watcher's `relevant` filter, so the Q2 fix is the relevant_table flip plus a RED through batch_paths/rescan. Baseline 781 tests (42 lib + 739 it), e2e 201.

Task 1: complete (commits d6fae9d..cf5ec4d, review clean). 781 = 42 lib + 737 it passed + 2 ignored. Minors (deferred): board.rs ok_on keeps own panic body (cmd_on version logic; no comment); rename/tree `folder(files, dirs)` could use open_at; scale/page_color/place use literal 2026-10-29 instead of DAY; support::run lacks doc comment; support::ids fixes DAY/ms 0 undocumented.

Task 2: complete (commits dd400dd..64c3ae9, review clean). Minors (deferred): page_color.rs:343 DAY is one ~380-column literal (could use concat!); comment at page_color.rs:318 overstates what color==None guards (the unwrap is the real guard).

Task 3: fix round 1/5 (2 addressed, 0 open — CRLF fixture really CRLF; toml_keep imports; commits f3116c2..98655dd).
Task 3: complete (commits 84407fd..98655dd, review clean). Ruling: accept that the CRLF test cannot be made RED by removing `.replace("\r\n","\n")` in config/file.rs edit_file — toml_edit already writes LF, so the replace is a redundant safeguard; the test still pins CRLF-in → LF-out with comments kept — cost if wrong: a future toml_edit that keeps CRLF would be caught by this test anyway. Minors (deferred): comment on the redundant replace at file.rs:171; long doc line on HAND_LF; core it 738 + 2 ignored.

Task 4: complete (commits ca96f36..a2d5345, review clean). it 742 + 2 ignored. Minors (deferred): parse_and_check_states_agree_on_keywords compares Debug prefixes (matches! sturdier); RED demo for first-state-first skipped (reviewer showed it can fail). Watch: one unexplained red `just test` run before a green rerun (diff is pure; likely an fs/watcher-timing test) — recheck at Finish.

Task 5: complete (commits 8a1042a..3d5990c, review clean). lib 44, it 743 + 2 ignored. delete_block keeps its second find (replace_keeping_structure runs between; brief allowed it). Minors (deferred): task.rs:636-640 expected string built by .replace (write literal); no test pins empty-valued property lines (`priority::`) or CRLF in task.rs characterization; with_property's `i == end` + post-loop append needs a comment.
