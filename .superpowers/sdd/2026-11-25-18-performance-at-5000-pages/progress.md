# SDD ledger — plan: docs/plans/2026-11-25-18-performance-at-5000-pages.md

Spec: docs/spec.md (binding). Owner answers: the plan's "Settled 2026-11-25" block. Work on main (owner's standing rule, CLAUDE.md).
Shared subagent rules: common.md (local).

- Pre-flight scan: dispatched (opus), table to preflight.md.
- Pre-flight scan done (opus): 25 rows, 16 findings, table in preflight.md (local). Ruling: all 16 proposed rulings
  (F1 to F16) accepted as written in preflight.md; each task's dispatch points its implementer to the findings that
  name its task — they extend the plan text — cost if wrong: rework of a task's edge handling, visible in review.
  Key ones: F3 the fast Git path falls back when cherry-pick counts differ, a replayed commit is empty, or
  commit.gpgsign is on (keeps "same result as git pull --rebase"); F5 only two of three Git lines get bar 100 ms;
  F6 the new scale measures are a separate test fn on an existing hub page; F8 no bar for search during the first
  build (owner Q2); F9 Task 6/7 writes backlog #102 (early search) and Q1's later work; F12 e2e 166 at the end (own
  exe), 167 and 168 before step 50.
