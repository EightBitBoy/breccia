# SDD ledger — plan: docs/plans/2026-11-18-13-dailies.md

Spec: docs/spec.md (binding). Owner approved the plan 2026-11-18 (Q1 confirm before delete, no undo; Q2 hidden; Q3 nothing; Q4 commit per task, push once at the end).
Plan committed: a83f2d0.

## Pre-flight
Scan table: local preflight.md (27 findings, P1–P27); section 5 copied into the plan's "Pre-flight rulings".
Ruling: adopt P1–P27 as proposed by the scan (each with its own why and cost in the plan) — the scan checked them against the code; P23 (delete confirm names hidden lines under a daily) keeps spec anti-goal §2 — cost if wrong: per-row costs in the plan, largest is one extra dialog text (P23).
Ruling: P26 — commit the ledger per task, push nothing until Finishing (owner Q4) — cost if wrong: none.

Task 1: dispatched (sonnet), BASE ce6f25a
Task 1: implementer DONE, commit 01be7c3; review dispatched
Task 1: minor (deferred): no test for check on a daily with two existing checked:: lines (brief: keep first place)
Task 1: minor (deferred): EmptyDaily and MultiLineDaily share one message (fine under P1)
Task 1: minor (deferred): one_line strips every \r, also a lone mid-line one
Task 1: minor (deferred): add_daily clones the document for rollback
Task 1: complete (commits ce6f25a..01be7c3, review clean)
