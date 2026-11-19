# SDD ledger — plan: docs/plans/2026-11-19-14-open-followups.md

Spec: docs/spec.md (binding). Owner approved the plan 2026-11-19 (Q1–Q5 all as recommended; recorded in the plan, commit 1a8f447).
Plan committed: a9ba65e. Push after each commit (CLAUDE.md default).

## Pre-flight
Scan table: local preflight.md (15 findings, F1–F15); section 4 copied into the plan's "Pre-flight rulings".
Ruling: adopt F1–F15 as proposed (each with its why and cost in the plan) — the scan checked them against the code; F7 and F8 turn two planned `fix` commits into `chore` (no effect a user sees) and drop review item 130 — cost if wrong: two missing changelog lines for cases a user cannot see.

Task 1: dispatched (sonnet), BASE 17934d2
Task 1: implementer DONE_WITH_CONCERNS, commits e5c3796 (fix subject, RED test only, red at that commit), aae140b (chore, the code), 765024d (chore, file:/// rule); review dispatched
Ruling: keep the pushed split (never force-push) — the changelog still gets the one fix line, its code lands one commit later — cost if wrong: one commit on main where a shell test is red (CI on e5c3796).
Task 1: review — spec ✅, quality approved; 3 minor. file:/// C: case is a real RED (traced); apostrophe RED at e5c3796.
Ruling: carry minor 1 (logfile.rs:223 typo/wrap) and minor 2 (pin a credential-free quoted URL unchanged) into Task 2's dispatch — cheap, same kind of tidy-up — cost if wrong: none.
Task 1: minor (deferred to final check): svelte-check not run (Rust-only change).
Task 1: complete (commits 17934d2..765024d, review clean)
Task 2: dispatched (sonnet), BASE 60a5456
