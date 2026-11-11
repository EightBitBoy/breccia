# SDD ledger — plan: docs/plans/2026-11-11-09-core-housekeeping.md

Setup 2026-11-11: workspace, briefs 1-15, constraints.md. BASE d6fae9d. Owner approved plan with Q1 = backlog, Q2 = fix in Task 9 Step 7.

Pre-flight (opus): preflight.md, 1 critical, 9 important, 18 minor. Ruling: apply every proposed correction in preflight.md (C-1, I-1..I-9, M1..M18) as written, appended per task to each brief — the scan checked each against HEAD code and none changes visible behaviour beyond the owner's Q2 — cost if wrong: rework in the affected task. I-4 note: the silent drop of `.MD` is in the watcher's `relevant` filter, so the Q2 fix is the relevant_table flip plus a RED through batch_paths/rescan. Baseline 781 tests (42 lib + 739 it), e2e 201.

Task 1: complete (commits d6fae9d..cf5ec4d, review clean). 781 = 42 lib + 737 it passed + 2 ignored. Minors (deferred): board.rs ok_on keeps own panic body (cmd_on version logic; no comment); rename/tree `folder(files, dirs)` could use open_at; scale/page_color/place use literal 2026-10-29 instead of DAY; support::run lacks doc comment; support::ids fixes DAY/ms 0 undocumented.
