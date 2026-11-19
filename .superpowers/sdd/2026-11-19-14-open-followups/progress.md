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
Task 2: implementer DONE, commits b332d21, 10eaf72, c1b5bc6; review dispatched
Task 2: review — spec ✅, quality approved; 2 minor (ragged doc wrap in edit.rs, under limit — left; 846e2b6 was the controller's ledger line, not a report).
Task 2: complete (commits 60a5456..c1b5bc6, review clean)
Task 3: dispatched (sonnet), BASE ef64a1d
Task 3: implementer DONE, commits bf85ca8, 7fa8ade, d2afb65 (e2e 216 PASS); review dispatched
Task 3: review — spec ✅, quality approved; 3 minor. Step 145's cancel-and-re-ask loop judged a legitimate waitFor poll (nested shows only through the question text).
Ruling: carry minor "uneven §7.14 wrap" into Task 8 (docs wrap) — cost if wrong: none.
Task 3: minor (deferred): new Rust tests use raw multi-line string literals rather than \n escapes (style only).
Task 3: minor (deferred): e2e 145 covers the menu delete path only; the emptied-text path sends the same row (vitest covers remove's nested).
Task 3: complete (commits ef64a1d..d2afb65, review clean)
Task 4: dispatched (opus), BASE 533e275
Task 4: implementer DONE_WITH_CONCERNS (upper clamp of moveTarget is redundant, untestable; step 146 synthetic contextmenu), commits 29fa394..d3004d1 (6), e2e 217 PASS; review dispatched (opus)
Task 4: review (opus) — spec ✅, quality approved; 3 minor.
Task 4: minor (deferred → plan 14 follow-ups): moveTarget's upper clamp is redundant/defensive only; past-the-end tests do not mutation-check it.
Task 4: minor (deferred): 'all' comment at dailiesState.test.ts:329 could say every other command is refused too.
Task 4: minor (deferred → plan 14 follow-ups): pre-existing — a touch long press opens the Dailies menu without `pick` (over the edit field, stale row, or empty).
Ruling: Task 9 (bookkeeping) owns F7's review-item-130 drop and Review Focus fix, and F13's "closed: needed for the field's type" strike — carried in its dispatch — cost if wrong: none.
Task 4: complete (commits 533e275..d3004d1, review clean)
Task 5: dispatched (opus), BASE 8eb01ce
Task 5: implementer DONE_WITH_CONCERNS (also fixed a step-146 race in its own test(e2e) commit; focus+leave a Git field while a value is refused writes both), commits 5efe41a..7525b30 (5), e2e 218 PASS; review dispatched (opus)
Task 5: review (opus) — spec ✅ (⚠️ review item for P13.3 lands in Task 9 Step 3 — carried), quality approved; 4 minor.
Task 5: minor (deferred → follow-ups): chore subject c81d3fe is 117 chars (pushed; cannot amend).
Task 5: minor (deferred → follow-ups): oneAtATime skips a pending extra run if `f` rejects (cannot happen today).
Task 5: minor (deferred → follow-ups): GitSection sends Number(delay) rather than numberCommit's value (same result today).
Task 5: minor (deferred): step 147's "no notice came back" check is weak; the byte equality carries the step.
Task 5: complete (commits 8eb01ce..7525b30, review clean)
Task 6: dispatched (sonnet), BASE 8236d58
Task 6: implementer DONE, commit 672cc0f, e2e 218 PASS; review dispatched
Task 6: review — spec ✅, quality approved; 1 minor (none to act on). All 14 CHANGELOG headings parse with both regexes.
Task 6: complete (commits 8236d58..672cc0f, review clean)
Task 7: dispatched (sonnet), BASE e4c75e0
Task 7: implementer DONE, commit 016ff40, e2e 218 PASS x2; review dispatched
Task 7: review — spec ✅, quality approved; 2 minor. Barrier sound: all commands chain on one queue (api.ts enqueue).
Task 7: minor (deferred → follow-ups): e2e dAdd hard-codes "138" in its wait label; give it a step argument.
Task 7: complete (commits e4c75e0..016ff40, review clean)
