# SDD ledger — plan: docs/plans/2026-11-24-17-due-date-follow-ups.md

Start: 55e0623 (2026-11-24). Spec: docs/spec.md (binding). Settled: Q1 b, Q2 a, Q3 a, item 5 → backlog #100 (55e0623).

Pre-flight (opus): 13 findings, table in preflight.md (local). Rulings:
Ruling F1/F2: under Q1 b Task 2 writes no core code: a spec/format sentence (a pick replaces the line, words go, Ctrl Z restores), a review-137 bullet, and e2e step 153 (expects the dimmed line to disappear after the pick); commit is test(e2e)/docs, not fix(core) — owner's Q1 answer — cost: none.
Ruling F3/F5: hide only the line that gives the date and only when its value is the day link alone; build `only_day_link` on `inline::links`, no second parser — owner decision 1 — cost: none.
Ruling F4/F8: name the RED mutations (the "stays hidden" pin; Task 4's repeat-pick test may need a forced `changed` mutation and drops "no changed page") — every test must fail — cost: none.
Ruling F6/F12/F13: the `row()` cast fix moves to Task 6; Task 6 owns the LinkColorMenu header comment; Task 6 is split into one refactor and three fix commits — file ownership and changelog-clean commits — cost: none.
Ruling F7: e2e step 153 clicks "previous month" at month ends. F9: Task 3 expects and lists core tests broken by R5's wider resend. F11: spec:305, vocabulary:30, compatibility:120 assigned to Task 7.
Ruling F10: not asked — 13b (which refusal comes first) and the month-end/year-end/midnight e2e paths stay not taken and remain in the follow-ups — the owner sees no difference from either, and asked for fewer questions on technical matters — cost: an e2e path breaks unnoticed until the day it runs.
