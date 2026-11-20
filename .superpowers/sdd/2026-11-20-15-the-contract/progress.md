# SDD ledger — plan: docs/plans/2026-11-20-15-the-contract.md

Spec: docs/spec.md (binding). Owner approved the plan 2026-11-20 (Q1 yes after asking for pros and cons, Q2 yes ts-rs; recorded in the plan, commit e5388f4).
Plan committed: df3c34f. Push after each commit (CLAUDE.md default). Work on main (CLAUDE.md).

## Pre-flight
Pre-flight scan: dispatched (opus)
Scan table: local preflight.md (9 findings, F1–F9); section 4 copied into the plan's "Pre-flight rulings" (commit 35534f0), task texts amended.
Ruling: adopt F1–F9 as proposed (each with its why and cost in the plan) — the scan checked them against the code; F6 (Route.others, so archive.auto and link-rewriting renames still refresh the window after the echo goes) and F7 (step 148 records every event) close real gaps — cost if wrong: one extra field in the route result and three extra tests.

Task 1: dispatched (sonnet), BASE 35534f0
Task 1: implementer DONE, commit 11373d2 (e2e 218 PASS; concerns: clippy allow on ShellCommand, opened_folder test without separate RED); review dispatched (sonnet)
Task 1: review — spec ✅, quality approved; 4 minor + 1 note (malformed generation on a shell request is ignored, brief allows).
Ruling: carry minors 1 (dead GitLog arm in shell_answer) and 3 (contract.test.ts:65 over 120 chars) into Task 2's dispatch — cheap tidy-ups next to Task 2's files — cost if wrong: none.
Task 1: minor (deferred): the four shell names are string literals beside the serde renames (a fifth variant could be missed).
Task 1: minor (deferred): opened_folder unit test has no separate RED run.
Task 1: complete (commits 35534f0..11373d2, review clean)
Task 2: dispatched (sonnet), BASE f40afe9
Task 2: implementer DONE_WITH_CONCERNS, commits 67e3267, 28932aa; controller found 67e3267 truncated tests/it/page_color.rs (28 tests lost) — fix round 1/5 dispatched before review (resumed implementer)
Task 2: fix round 1/5 (1 addressed: page_color.rs restored, 231d996; core 852+2 ignored); task review dispatched (sonnet) over f40afe9..231d996
Task 2: review — spec ✅, quality approved; 3 minor. Restored page_color.rs verified equal to f40afe9 except enum spellings; no other loss in 67e3267.
Ruling: the fix round (test-file restore only) needs no fresh just test / just e2e — 67e3267's code was e2e-checked (218) and 231d996 touches one core test file, re-run with cargo test -p breccia-core (852+2) — cost if wrong: none; the finish runs all three anyway.
Ruling: carry minor "shell_answer `_ => None` loses exhaustiveness; list GitLog explicitly" and minor "ErrorCode::ALL is hand-kept; add a guard" into Task 3 (generated types touch ErrorCode) — cost if wrong: none.
Task 2: minor (deferred): RED for error_codes_keep_their_wire_names not captured (mutation check instead).
Task 2: complete (commits f40afe9..231d996, 1 fix round, review clean)
