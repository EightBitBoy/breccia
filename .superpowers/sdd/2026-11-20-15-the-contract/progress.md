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
Task 3: dispatched (opus), BASE a1b3f18
Task 3: implementer DONE_WITH_CONCERNS, commits 0556bb5, 12376ef, cb919b4, b8c4076 (e2e 218; IndexProgress not generated — index:changed payload is the shell's IndexEvent; no-serde-warnings on; Cargo.lock moved windows-sys/syn versions); review dispatched (opus)
Task 3: review (opus) — spec ✅, quality approved; 5 minor. types.ts: no exported name lost (tsc old-vs-new: only stricter answer types matching Rust); ts-rs absent from the shell's normal dependency tree.
Ruling: keep the IndexProgress, with_large_int and no-serde-warnings choices (reviewer agreed with IndexProgress) — cost if wrong: one hand-written type kept by a contract case; a hidden ts-rs note later.
Ruling: keep the Cargo.lock churn (windows-sys 0.61, syn 3 for cssparser-macros) — both versions were already in the lock, the release build passed e2e, Dependabot moves them monthly anyway — cost if wrong: a dependency bump in 1.8.2's build without its own commit.
Ruling: carry minors 3 (Cargo.toml comment on why no-serde-warnings is on) and 5 (emptyOutput.ts is test-only; name or place it so) into Task 4 — cost if wrong: none.
Task 3: minor (deferred): ts(optional = nullable) on bool/Vec fields reads as "null accepted" though serde rejects null (output correct).
Task 3: minor (deferred): report's generated.ts counts off by a little (630 lines, 56 types).
Task 3: complete (commits a1b3f18..b8c4076, review clean)
Task 4: dispatched (sonnet), BASE d7c6e08
Task 4: implementer DONE, commits 6ee608b, b790a11 (controller pushed them; e2e 218; Vitest 1235); review dispatched (sonnet)
Task 4: review — spec ✅ (all 72 rows checked against old kindOf/countsInFlight by script), quality approved; 3 minor.
Ruling: carry minor "commands.ts / commands.test.ts end with a stray `},]` / `},} as const`, git rows out of order" into Task 5 — cheap formatting — cost if wrong: none.
Task 4: minor (deferred): commands.test.ts "row for every command" test compares lengths only, redundant with test 1.
Task 4: minor (deferred): holdsEvents comment lost the list of commands that do not hold events (the false rows are the record).
Task 4: complete (commits d7c6e08..b790a11, review clean)
Task 5: dispatched (opus), BASE 39ffe03
Task 5: implementer DONE, commits 0f8db3e, e16f460 (e2e 218; added Output::answering helper; a local rename in App.svelte during the e2e build — final e2e at finish covers it); review dispatched (opus)
Task 5: review (opus) — spec ✅ (F4, F5), quality approved; 2 minor. No old-field readers left (typed + grep); App.svelte rename is one local constant, e2e result stands.
Ruling: carry both minors (answer.ts `answer === null` check misses undefined; host.test.ts:532 ~140 chars) into Task 6, which edits the same files — cost if wrong: none.
Task 5: complete (commits 39ffe03..e16f460, review clean)
Task 6: dispatched (opus), BASE 618c06c
Task 6: implementer DONE, commits 301b0cd, 26c23c0 (e2e 218; route never read the feed — App.svelte reads the feed answer, route only refs; two core assertions rewritten); review dispatched (opus)
Task 6: review (opus) — spec ✅ (feed deviation correct: route takes feedShown, App.svelte reads the feed answer), quality approved; 3 minor. No reader of a removed field left (grep); rewritten core assertions still pin the same.
Ruling: carry minors (route.test.ts repeats the feed literal 10×, lines to 150 chars — a shared const; allPagesState.test.ts:338 148 chars) into Task 7 — cost if wrong: none.
Task 6: minor (deferred): no unit test catches a broken feed-answer read (App.svelte has no harness; e2e covers it).
Task 6: complete (commits 618c06c..26c23c0, review clean)
Task 7: dispatched (opus), BASE 01868b9
Task 7: implementer DONE, commits a200d8a, 4034853 (e2e 218; others by object identity; page:renamed row needs nothing; concern: e2e cannot tell others-handling from the echo until Task 8); review dispatched (opus)
Task 7: review (opus) — spec ✅ (apply path in App.svelte not checkable from the diff; Task 8's e2e is its first real test), quality approved; 3 minor. No own-change gap after Task 8; others-by-identity sound (core keeps page's key out of changed, view.rs:35); doubled work during Task 7 harmless.
Ruling: carry minor "Route.others doc should say why identity is sound, so Task 8 keeps that set" into Task 8 — cost if wrong: none.
Task 7: minor (deferred): search.refresh and refreshNames run twice while the echo still arrives (gone after Task 8).
Task 7: minor (deferred): refreshGraph negatives untested (network.refresh does nothing while the graph is hidden).
Task 7: complete (commits 01868b9..4034853, review clean)
