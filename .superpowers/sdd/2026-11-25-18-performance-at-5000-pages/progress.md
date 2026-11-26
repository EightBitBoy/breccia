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
- Task 2: review (opus): spec ✅; Important I1 typing p95 noise at bar, I2 during-build flags only noted, I3 journal usable before window shows; sent as fix round 1 with cheap minors (scroll end asserts, power state, commit name). Minor (deferred): caret frame taken before CodeMirror's measure; search line mostly measures build time left.
- Task 2: fix round 1/5 (3 addressed per implementer — I1 Enters paced, I2 INVALID when not during build, I3 journal usable after first paint; commits 346d265..f229374). Re-review pending.
- Ruling: the misplaced-letters bug found by perf-scale becomes backlog #102 now (not fixed in this plan's Tasks 3-5) — it's a correctness bug, not a speed point; Task 6 lists it for the owner — cost if wrong: the owner may want it fixed inside plan 18. F9's "backlog #102 for the early search" takes the next free number instead.
- Task 2: re-review: I1, I2, I3 ADDRESSED, no new breakage. Minor (deferred): baseline prose still says "within the noise" for the typing wait (now OVER: p95 18.2/30.6/20.1).
- Task 2: complete (commits c0018fa..f229374, review clean). Baseline (window, ms, bar): window shows 1794 (500) OVER, journal usable 1794, git history open 336 (200) OVER, show more 508 (200) OVER, typing wait p95 20.1 (16) OVER, caret 18.5 (16) OVER; runs vary 10-30 %.
- Task 3: dispatched (opus), BASE 067b582.
- Task 3: implemented b38a7f7 (opus; resumed once after an API usage limit). perf-scale after: window shows 439 (500) ok, journal usable 1228 (2000) ok; one cold launch 746. Concerns: api.ts path differs from brief; only F1/theme/zoom work while opening; new panic message text.
- Task 3: review (opus): spec ✅, quality ✅, 0 Critical/Important, 7 Minor. Minor (deferred): status bar Git items clickable while opening (spec §6 says only help/theme/zoom); step 166 may flake if a cold WebView2 needs > 3 s; panic notice says "ran into" (others "hit"), untested, not in review item 151; no behavioural test for F11 (folder remembered, Git thread after open); + 3 more in task-3-review.md.
- Task 3: complete (commits 067b582..b38a7f7, review clean)
- Task 4: dispatched (sonnet), BASE 82fef09.
- Task 4: implemented 08b0611 (sonnet). Lock ms before→after: save during fetch 855→~500, no save 703→~470 (bar 100, not met), worst case 1514→~1290 (bar 500). Inside the lock: locked commit_changes git status ~104, apply_prepared ~390 (read-tree ~170, clean check ~85, process starts). Proposal for Task 6: skip the locked commit when nothing was saved since the unlocked one.
- Task 4: review (opus): spec ❌ — I1 fast path skips pre-rebase, post-checkout, prepare-commit-msg (owner accepted only post-rewrite). Ruling: fall back to the locked rebase when any of these hooks exists — keeps today's behaviour for hook users, no owner question needed — cost if wrong: hook users keep the pause. 100 ms bar: routed to Task 6 per plan (apply_prepared alone ~390 ms, so skipping the locked commit can't reach 100). Fix round 1 sent with M1 (diff-tree before the lock) and guard tests. Minor (deferred): a read-tree stopping part-way or a crash between its two Git steps leaves the repo changed until the next pull heals it; commit subject 08b0611 overclaims ("no longer makes typing wait").
- Task 4: fix round 1 implemented 9c453b7 (hooks fallback, diff-tree before the lock, guard tests). Lock now: save during fetch 461, no save 392 (bar 100), worst 1248 (bar 500): all OVER → Task 6. Re-review dispatched (sonnet).
- Task 4: fix round 1/5 (all addressed — I1 hooks fallback, M1, guard tests; commits 08b0611..9c453b7). Nit (deferred): the hook check tests only that the file exists (conservative).
- Task 4: complete (commits 82fef09..9c453b7, review clean; lock bars routed to Task 6)
- Task 5: dispatched (opus), BASE b32e8d4.
- Task 5: resumed after the session ended (uncommitted: e2e steps 167/168, spec line).
- Task 5: implemented 6a393a1, 6d6a79b (opus). After (ms, bar): git history open 224.5 (200) OVER (was 336), show more x10 270.1 (200) OVER (was 508), archive open 38.1 (was 92.5), scrolls 7.1. Rest is core git.log → Task 6. e2e 290 PASS.
- Task 5: review (opus): spec ✅; Important I1 rows move down a row when a commit arrives while scrolled down, I2 step 168 top-check can't fail. Ruling: rows stay in place (scrollTop raised per new commit above) — matches pre-virtualiser behaviour and review item 153 — cost if wrong: owner may prefer the jump. Fix round 1 sent with a cheap Back scroll check. Minor (deferred): All pages filter has the same jump-to-top latent problem (follow-up); a focused row scrolled away by the wheel loses focus (as All pages); scrollToIndex unused; fixedRows returns margin (not in the brief's interface).
- Task 5: fix round 1 implemented caf2fdd (rows stay in place, step 168 uses 'task 14' 134 matches, Back check; REDs captured; e2e 290). Re-review dispatched (sonnet).
- Task 5: fix round 1/5 (3 addressed — I1 rows stay in place, I2 168 RED-able, Back scroll check; commits 6d6a79b..caf2fdd). Nit (deferred): scrollTop between 0 and the header margin is not corrected.
- Task 5: complete (commits b32e8d4..caf2fdd, review clean). Minor (deferred, for follow-ups): All pages filter doesn't jump to the top; a focused row or text selection is lost once its rows scroll out.
- Task 6: decision part dispatched (opus), BASE 74b00b4; no fixes until the owner sees the list.
- Task 6: decision list done (opus), task-6-decision.md (local). Fix-now candidates: 1a, 1b, 2a, 3, 2b (owner question); #85: 1c, 2c, 2d. Owner items: #102 timing, #103 early search, #104 counter/early journal. Waiting for the owner.
- Task 6: owner decided (recorded in the plan): build fixes 1-5; #85 gets 1c, 2c, 2d; #102 later; new #103, #104.
- Ruling: fixes run as three sub-tasks in order — 6a = fixes 1+2 (same pull path, one implementer, opus review), 6b = fixes 3+5 (same git.log file), 6c = fix 4 (index step) plus the #85/#103/#104 backlog edits — fewer review seats on shared code — cost if wrong: a larger diff per review.
- Task 6a (fixes 1+2): dispatched (sonnet), BASE 0517f51.
- Task 6a: implementer done, dba6c8b (pushed); lock ms save-during-fetch 362, no-save 358, worst 353. Review dispatched (opus).
- Task 6a review (opus): APPROVE; I1 (tests pinning the new-untracked-page case) + M1-M4 docs/label; no text loss (read-tree refuses, conflict keeps both). Fix round sent to implementer.
- Task 6a fix round: 5a8b8aa (pushed), 3 untracked-page tests + docs; git_engine 38 passed. Re-review dispatched (sonnet).
- Task 6a re-review (sonnet): APPROVE, 38 passed; M4 partly (label only, cosmetic, accepted). Task 6a done.
- Task 6b (fixes 3+5 = 2a+2b, Git history filter): dispatched (sonnet), BASE faf47c9.
- Task 6b: implementer done, d7755bf (pushed); git.log 200/3000 ~same (noisy, 164-193), never-pushed 247-287 -> 186-224; still OVER (2c in #85). Review dispatched (sonnet).
- Task 6b review (sonnet): APPROVE, git_commit 19 passed. M1 (last-commit time ignores empty commits) noted in review 155 by controller; M2 (unpushed() unfiltered in a big nested repo returns all hashes) deferred to final review; M3 cosmetic. Subject d7755bf mentions the empty-commit case; ruling: leave it (pushed; trim at release changelog edit) — cost if wrong: one odd changelog line. Task 6b done.
