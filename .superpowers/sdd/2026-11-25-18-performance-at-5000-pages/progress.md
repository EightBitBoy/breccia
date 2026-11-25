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
- Task 1: dispatched (sonnet), BASE 07488ff.
- Task 1: implemented 82ce2e0 (sonnet). Review: spec ✅, quality ✅; Important I1 (pre-existing: scale_5000_pages panics,
  5005 != 5000 rows) sent as fix round 1. Baseline core numbers (ms, bar): setText journal 8.1 (16), page.setColor 139
  (300), archive.auto 612 (2000), search during first build 5649 (none), git.log 200 of 3000 248 (100) OVER, git.log
  never-pushed 290 (100) OVER, git lock save-during-fetch 855 / no save 703 (100) OVER, worst case 1514 (500) OVER,
  git status clean 106.
- Task 1: minor (deferred): the generated folder is 5,005 pages, not 5,000 (naming in the baseline).
- Task 1: fix round 1/5 (1 addressed, 0 open — I1 scale_5000_pages asserts now pin the 5 tag rows; commits 82ce2e0..65066c4)
- Task 1: complete (commits 07488ff..65066c4, review clean)
- Task 2: dispatched (opus), BASE c0018fa.
- Task 2: implemented 346d265 (opus), DONE_WITH_CONCERNS: typing run deviates from brief (20 letters + Enter x2, saves wait 300 ms); window OVER: shows 1399 (500), git history open 309 (200), show more 371 (200), typing wait p95 16.4 (16); caret 14.1 (16).
