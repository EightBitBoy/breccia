# SDD ledger — plan: docs/plans/2026-11-24-17-due-date-follow-ups.md

Start: 55e0623 (2026-11-24). Spec: docs/spec.md (binding). Settled: Q1 b, Q2 a, Q3 a, item 5 → backlog #100 (55e0623).

Pre-flight (opus): 13 findings, table in preflight.md (local). Rulings:
Ruling F1/F2: under Q1 b Task 2 writes no core code: a spec/format sentence (a pick replaces the line, words go, Ctrl Z restores), a review-137 bullet, and e2e step 153 (expects the dimmed line to disappear after the pick); commit is test(e2e)/docs, not fix(core) — owner's Q1 answer — cost: none.
Ruling F3/F5: hide only the line that gives the date and only when its value is the day link alone; build `only_day_link` on `inline::links`, no second parser — owner decision 1 — cost: none.
Ruling F4/F8: name the RED mutations (the "stays hidden" pin; Task 4's repeat-pick test may need a forced `changed` mutation and drops "no changed page") — every test must fail — cost: none.
Ruling F6/F12/F13: the `row()` cast fix moves to Task 6; Task 6 owns the LinkColorMenu header comment; Task 6 is split into one refactor and three fix commits — file ownership and changelog-clean commits — cost: none.
Ruling F7: e2e step 153 clicks "previous month" at month ends. F9: Task 3 expects and lists core tests broken by R5's wider resend. F11: spec:305, vocabulary:30, compatibility:120 assigned to Task 7.
Ruling F10: not asked — 13b (which refusal comes first) and the month-end/year-end/midnight e2e paths stay not taken and remain in the follow-ups — the owner sees no difference from either, and asked for fewer questions on technical matters — cost: an e2e path breaks unnoticed until the day it runs.
Task 1: dispatched (sonnet, base 7727513)
Task 1: implementer DONE e9b8bd9; review dispatched (sonnet)
Task 1: review clean (sonnet; spec ✅, approved). minor (deferred): spec.md:297 and format.md:246 unwrapped long lines (→ Task 7 rewraps); words_before test doesn't assert the link renders; compatibility.md ~120 still says "shown as a chip" (F11 → Task 7).
Task 1: complete (commits 7727513..e9b8bd9, review clean)
Task 2: dispatched (sonnet, base 6c6e5b9, Q1 b branch)
Task 2: implementer DONE c91daa6 (e2e 238 PASS, step 153 RED shown); review dispatched (sonnet)
Task 2: review clean (sonnet; spec ✅, approved; step 153 month-boundary path checked by reading). minor (deferred): Ctrl Z restoring the words has no e2e check; brief's separate "plain 153" row folded into the post-pick .prop count.
Task 2: complete (commits 6c6e5b9..c91daa6, review clean)
Task 3: dispatched (sonnet, base f912406)
Task 3: implementer DONE b744d84 (e2e 241 PASS, step 154; two rename tests updated on purpose per F9); review dispatched (sonnet)
Task 3: review clean (sonnet; spec ✅, approved; the two changed rename tests are correct, PageView field order unaffected, configChange compares only ConfigView). minor (deferred): rename.rs could pin `],"hasFile":true,"targets":[`; resend_linking re-sends every page linking a changed topic (a hub page with many backlinks sends many views) → follow-ups/backlog; e2e 154 absence check via frames() count is weak.
Task 3: complete (commits f912406..b744d84, review clean)
Task 4: dispatched (sonnet, base 115ead3)
