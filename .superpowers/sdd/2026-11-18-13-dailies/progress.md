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
Task 2: implementer DONE_WITH_CONCERNS (also changed set_keeping_decor in toml_keep.rs to keep comments above a changed key), commit 1c282ed; review dispatched
Task 2: review — spec compliant; Important 1: set_keeping_decor fix belongs in its own fix commit with a git/board test and a review item.
Ruling: split 1c282ed locally (unpushed, so no shared history changes) into the fix commit first and the chore commit after — the changelog must carry the comment-keeping fix — cost if wrong: none, both commits stay local until the end of the plan.
Task 2: ⚠️ format.md for [dailies] reset — owned by Task 10 (checked brief), not a gap.
Task 2: minor (deferred): parse_reporting doc comment badly wrapped (model.rs)
Ruling: Dailies review items start at 116 (115 taken by the config-comment fix) — the number was only reserved by the plan — cost if wrong: none; carry into Task 10.
Task 2: fix round 1/5 (1 addressed, 0 open; commits e1909a6..1f847e6 after the local split: e778236 fix, 1f847e6 chore)
Task 2: minor (deferred): parse_reporting doc comment line model.rs:261 still over 120 chars
Task 2: complete (commits e1909a6..1f847e6, review clean)
Task 3: implementer DONE_WITH_CONCERNS (no RED run captured; mutation evidence instead; extra field DailiesFile.unreadable), commit 8c654dd; review dispatched
Task 3: review — spec compliant; Important 1: mutation evidence missing for 5 tests.
Ruling: promote minor "nested flags only child blocks" into the fix round — P23's purpose is that delete never drops hidden user text without warning (anti-goal §2); a daily's own extra lines (note::, unknown property, continuation text) other than checked:: also set nested=true — cost if wrong: the confirm warns about lines that are only a property.
Task 3: minor (deferred): outside overwrite between re-read and write is possible (no locking) — note in follow-ups
Task 3: minor (deferred): unreadable-warning test matches Debug output
Task 3: minor (deferred): `before` of dailies.move gets no P7 text check (harmless)
Task 3: minor (deferred): I/O-error branch of load_dailies untested
Task 3: ⚠️ write_atomic creating breccia/ — covered by add_creates_the_folder_and_file per reviewer; accepted.
Task 3: fix round 1/5 (2 addressed, 0 open; commits 8c654dd..f21a9cb)
Task 3: minor (deferred): a blank continuation line also sets nested (errs safe)
Task 3: complete (commits 3f89e32..f21a9cb, review clean)
Task 4: implementer DONE, commit 6049c95 (no-op dailiesChanged handler in App.svelte for Task 6); review dispatched
Task 4: minor (deferred): misplaced doc line above reload_dailies (session/dailies.rs ~113) belongs on dailies_list
Task 4: minor (deferred): unreadable notice only on the readable→unreadable transition
Task 4: complete (commits 5188cf1..6049c95, review clean)
Task 5: implementer DONE_WITH_CONCERNS (prettier flags new files — not a project check, existing files fail it too: moot), commit ecc7b6c
Ruling: moveTarget returns undefined when the group's own order is unchanged (no write), and "last place" returns the next daily after the group's last one or null — dropping in place must not rewrite the file — cost if wrong: one test and a branch.
Task 5: minor (deferred): redundant variable in a DST test
Task 5: minor (deferred): resetParts does not validate its input (core guarantees HH:MM)
Task 5: minor (deferred): no test for out-of-range input to moveTarget
Task 5: complete (commits ce4a5cc..ecc7b6c, review clean)
Task 6: implementer DONE, commit 84bc618 (not wired into App; Task 7 does); review dispatched
Task 6: minor (deferred): a failed reload inside send can emit a second notice
Task 6: minor (deferred): redundant now initialiser; dead setClock call and unneeded tick() in tests
Task 6: minor (deferred): no test for the load() failure notice
Task 6: complete (commits 9a9e808..84bc618, review clean)
Task 7: implementer DONE_WITH_CONCERNS, commits d1bb283 (feat view), 67b7a50 (feat status bar), 0de9e4e (test e2e setup of steps 96–100); e2e 208 PASS
Ruling: accept the e2e change closing Projects before steps 96–100 — the taller sidebar left too little tree in the test window; nothing later uses those rows — cost if wrong: steps 96–100 test with one folder fewer open.
Task 7: follow-up: pressing a row cut off at the page tree's edge can start a drag on the wrong row (pre-existing; more likely in short windows with the Dailies entry) — to follow-ups/backlog.
Task 7: minor (deferred): Dailies view imported statically, not lazy-loaded like Archive
Task 7: review dispatched (opus)
Task 7: minor (deferred): reduced motion read once when the view opens
Task 7: minor (deferred): confirmSetting name no longer fits (also asks the Dailies delete)
Task 7: minor (deferred): right-click during an edit blocks the field's native text menu
Task 7: ⚠️ dragging a row is untested (drop monitor depends on listEl at onMount) — carried into Task 9: an e2e step must drag a row and assert bytes. Back to Dailies — Task 9 step 140.
Task 7: complete (commits 997d925..0de9e4e, review clean)
