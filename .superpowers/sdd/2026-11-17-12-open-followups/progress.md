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
