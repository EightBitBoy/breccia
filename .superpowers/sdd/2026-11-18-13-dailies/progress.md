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
