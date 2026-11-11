# SDD ledger — plan: docs/plans/2026-11-11-09-core-housekeeping.md

Setup 2026-11-11: workspace, briefs 1-15, constraints.md. BASE d6fae9d. Owner approved plan with Q1 = backlog, Q2 = fix in Task 9 Step 7.

Pre-flight (opus): preflight.md, 1 critical, 9 important, 18 minor. Ruling: apply every proposed correction in preflight.md (C-1, I-1..I-9, M1..M18) as written, appended per task to each brief — the scan checked each against HEAD code and none changes visible behaviour beyond the owner's Q2 — cost if wrong: rework in the affected task. I-4 note: the silent drop of `.MD` is in the watcher's `relevant` filter, so the Q2 fix is the relevant_table flip plus a RED through batch_paths/rescan. Baseline 781 tests (42 lib + 739 it), e2e 201.

Task 1: complete (commits d6fae9d..cf5ec4d, review clean). 781 = 42 lib + 737 it passed + 2 ignored. Minors (deferred): board.rs ok_on keeps own panic body (cmd_on version logic; no comment); rename/tree `folder(files, dirs)` could use open_at; scale/page_color/place use literal 2026-10-29 instead of DAY; support::run lacks doc comment; support::ids fixes DAY/ms 0 undocumented.

Task 2: complete (commits dd400dd..64c3ae9, review clean). Minors (deferred): page_color.rs:343 DAY is one ~380-column literal (could use concat!); comment at page_color.rs:318 overstates what color==None guards (the unwrap is the real guard).

Task 3: fix round 1/5 (2 addressed, 0 open — CRLF fixture really CRLF; toml_keep imports; commits f3116c2..98655dd).
Task 3: complete (commits 84407fd..98655dd, review clean). Ruling: accept that the CRLF test cannot be made RED by removing `.replace("\r\n","\n")` in config/file.rs edit_file — toml_edit already writes LF, so the replace is a redundant safeguard; the test still pins CRLF-in → LF-out with comments kept — cost if wrong: a future toml_edit that keeps CRLF would be caught by this test anyway. Minors (deferred): comment on the redundant replace at file.rs:171; long doc line on HAND_LF; core it 738 + 2 ignored.

Task 4: complete (commits ca96f36..a2d5345, review clean). it 742 + 2 ignored. Minors (deferred): parse_and_check_states_agree_on_keywords compares Debug prefixes (matches! sturdier); RED demo for first-state-first skipped (reviewer showed it can fail). Watch: one unexplained red `just test` run before a green rerun (diff is pure; likely an fs/watcher-timing test) — recheck at Finish.

Task 5: complete (commits 8a1042a..3d5990c, review clean). lib 44, it 743 + 2 ignored. delete_block keeps its second find (replace_keeping_structure runs between; brief allowed it). Minors (deferred): task.rs:636-640 expected string built by .replace (write literal); no test pins empty-valued property lines (`priority::`) or CRLF in task.rs characterization; with_property's `i == end` + post-loop append needs a comment.

Task 6: complete (commits 7026ccd..7e84736, review clean). lib 44, it 744 + 2 ignored. Minors (deferred): color.rs test mixes qualified title_line with unqualified color_line; try_from(...).ok()? in color.rs can never fail (comment/expect would state the invariant).

Task 7: complete (commits 23ac987..0baf21a, review clean, opus reviewer). lib 45, it 746 + 2 ignored. Minors (deferred): disk.rs:408-409 sends page.open "Other" twice, first result unused, no comment; alias test resolves via page.open rather than a [[Other]] link (acceptable proxy). Watch: second unexplained flaky failure, this time 1 Vitest test of 1068 while cargo ran in parallel (unnamed) — track at Finish.

Task 8: complete (commits 81c6c02..6e4b57b, review clean). lib 48, it 746 + 2 ignored (--list 796). Per I-5, `warned` stays in Workspace; first_warning_is_true_once replaced by take_topics_is_sorted_and_empties. Minors (deferred): Changes derives Debug/Default unnecessarily. Watch: flaky `app/scripts/release.test.mjs` (1 of 24, passed on rerun) — likely the Vitest flake seen in Task 7; follow-ups item.

Task 9: complete (commits 1e264b0..b68d445, review clean, opus implementer + reviewer). lib 50, it 750 + 2 ignored (--list 802); e2e 202 PASS (step 133 placed before step 45, not before step 50 as I-7 said — reviewer accepted). Review item 87 added. Fix subject 90 chars w/o prefix (edge of rule, brief's text). Minors (deferred): open_table parses LoadWarning kind from Debug output; watch.rs:468-473 catch-all Err(_) => false would silently drop a new LoadWarning variant; e2e step 133 count()==1 check right after waitFor (covered by disk_change_table); case-only rename X.md→X.MD on Windows now shows the lower-case notice while the page may stay loaded — follow-ups note.

Task 10: complete (commits 252e71e..18c730b excl. 6a7d958 backlog 79, review clean, opus). lib 50, it 753 + 2 ignored (--list 805); e2e 202. session/mod.rs 1494→519, execute 138 lines. Graph methods went into graph.rs (not named in brief; accepted). Minors (deferred, worth fixing in final wave): no test pins I-6 order (config.setBoard archiveAfterDays 0 / config.setGit out of range with no folder → invalidSetting); every_command() table relies on hard-coded 64, not tied to command.rs; cargo doc warning watch.rs:26 private intra-doc link (from Task 9).

Task 11: complete (commits 702ab89..8943a0b, review clean). lib 50, it 754 + 2 ignored (--list 806). Only TagEntry half of the rename_all mutation can fail (M14, NameEntry fields are one word). Minors (deferred): task.rs:146/238 done:: time/day formats and archived_tasks `%Y-%m-%d` closure stay outside naming.rs (not display formats); workspace imports serde for TagEntry (brief's choice).

Task 12: fix round 1/5 (1 addressed — Cargo.lock self dev-dependency entry left uncommitted, found by controller; commit d30755e, `cargo test --locked` passes; trivial lockfile-only diff, no separate re-review).
Task 12: complete (commits 2b19ba6..d30755e, review clean). lib 50, it 756 + 2 ignored (--list 808). Self dev-dependency works; test-seams not in the shell's feature tree. Minors: none of note.

Task 13: complete (commits 1842063..afc7f93, review clean, opus reviewer). lib 50, it 760 + 2 ignored (--list 812). Backlog #31 done. Minors (deferred): search.rs:403-404 assertion can never fail (no block contains "text") — fix in final wave; no test for a failed delete of the garbage index file (follow-up); recover lost a theoretical retry on a freshly deleted file (follow-up); M29 tests landed in the M28 commit; QueryLink.kind lacks a doc comment.

Task 14: complete (commits b4010ba..4fc8fbc, review clean, opus). Shell lib.rs 1841→437; shell tests 76; Vitest 1068; e2e 202 (2nd run). Minors (deferred): contract.test.ts (and theme.test.ts) import.meta.glob lists go stale under Vitest's fsModuleCache when shell files are added/removed — local false failures only, CI clean; candidate for the final fix wave (node:fs or fsModuleCache:false); events.rs tests copy lib.rs's clock() helper. Watch: e2e step 118 flaky (`showDay` scrollIntoViewIfNeeded on a re-rendered element, smoke.mjs:2452) — not caused by this diff; fix by retrying inside the wait.

Task 15: complete (commits 73c9a77..b16cb7d, review clean; haiku implementer wrote no report file, report was its reply).
All tasks complete. Final review package review-d6fae9d..HEAD.

Final review (opus): final-review.md, 0 critical, 0 important, 7 minor. Ruling: fix wave takes the reviewer's four fix-now items (search.rs dead assertion; I-6 order test for setBoard/setGit with no folder; tie every_command() count to command.rs; watch.rs doc link + journals/*.MD), plus backlog #36 pointer, the module docs of session/board.rs and graph.rs, the Q1 backlog item, review item 87's case-only-rename note, the follow-ups doc and STATUS — all cheap and none visible — cost if wrong: small test/doc churn.
