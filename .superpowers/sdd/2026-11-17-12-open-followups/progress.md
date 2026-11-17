# SDD ledger — plan: docs/plans/2026-11-17-12-open-followups.md

Started 2026-11-17 at c2a05c4 on `main` (project rule: plans run on `main`). Commit only, no push (owner).
Spec: `docs/spec.md`. Owner answers Q1–Q6 in the plan's "Owner decisions".

## Pre-flight (opus, 2026-11-17)
Scan: 15 shared-file rows, 13 task rows, 6 conditional-wording spots; full table in local `preflight.md`. Rulings R3–R18
are in the plan's "Pre-flight rulings" (binding over task text). Notable:
- Ruling: R9 — the core's no-folder recovery gets a generation so the shell can compare (Task 5 was unexecutable as written) — cost if wrong: one enum field in the core.
- Ruling: R15 — the caret after Ctrl Shift K is set in the frontend, so Task 11 splits into a core fix and a frontend fix (`ownTextEnd` in `app/src/lib/deleteBlock.ts`) — cost if wrong: a second small helper.
- Ruling: R16 — Backspace that would join a multi-line task onto a task above keeps being refused; only property lines at the end of a block count — cost if wrong: owner may want such joins; flagged for review.
- Ruling: R7 — a failed log rotation keeps the current log; it is truncated only above twice the cap — cost if wrong: a log up to 2 MB.
- Ruling: R11 — invisible behaviour changes commit as `chore` — cost if wrong: commit-type wording only.
Task 1: dispatched (sonnet), BASE 08362eb
Task 1: minor (deferred): range.rs doc line on replace_out_of_range ~120 columns
Task 1: minor (deferred): watch.rs comment about which LoadWarning classify returns can go stale
Task 1: complete (commits 08362eb..0dd348a, review clean)
Task 2: dispatched (sonnet), BASE c42b649
Task 2: Ruling: the empty-valued-property pin checks TODO→DOING (state word only) and plain→TODO (created:: added after the property line), since a later state change adds no created:: — the brief's expectation was wrong about when created:: is added — cost if wrong: none, the test pins real behaviour
Task 2: minor (deferred): session.rs:1264 first undo half is vacuous (second case covers it)
Task 2: minor (deferred): task.rs:1418 CRLF pin only fails when all three trims go
Task 2: minor (deferred): report names no mutations for the step 4 pins (edit.rs:223, session.rs:1279)
Task 2: minor (deferred): page_color.rs:285 comment carries an extra parenthetical
Task 2: minor (deferred): task.rs:1389-1415 raw multi-line literals vs \n escapes nearby
Task 2: minor (deferred): board.rs:74 `ok` still hard-codes (2026, 10, 29) instead of DAY
Task 2: complete (commits c42b649..bf62822, review clean)
