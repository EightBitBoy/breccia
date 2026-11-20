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
