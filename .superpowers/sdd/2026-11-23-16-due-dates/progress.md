# SDD ledger — plan: docs/plans/2026-11-23-16-due-dates.md

Start: af46cc8 (2026-11-23). Spec: docs/spec.md (binding). Owner answers Q1–Q5 all a; chip words added (af46cc8).

Pre-flight (opus): 17 findings, table in preflight.md (local). All proposed rulings accepted:
Ruling F1: Task 1 adds the ErrorCode(s) and mapping and runs `just types` — Task 1 won't compile otherwise — cost: none.
Ruling F2: Task 7 wraps ordinary pages in LinkColorMenu too (only journal pages had the zone) — the owner's "task's right-click menu" means pages too — cost: a menu zone on pages; review item notes it.
Ruling F3: Today gets an injectable env like Dailies for its focus test — Vitest runs in node — cost: none.
Ruling F4: dueChip returns title; fillDueChips and the card chip set the tooltip — owner's words rule — cost: none.
Ruling F5: R6's first sentence is stale; follow the owner's words rule (<6 days in words) — owner addition 2026-11-23.
Ruling F6: drop CardView.due/finished, read card.blocks[0] — no duplicate data — cost: small refactor later if cards change.
Ruling F7: "Only a task can have a due date." lives in the core error plus one window constant — window has no per-code text.
Ruling F8: badDate uses parse_journal_name. F9: the host forgets typed text for block.setDue (as other commands).
Ruling F10: only Task 9 edits the spec. F11: MonthGrid keeps aria-selected as focus; chosen day uses data-chosen; test ids prefixed.
Ruling F12: e2e step 2 types at the end of the first line. F13: each pin test shown failing once by temporary mutation.
Ruling F14: shortcut listed in "Blocks and tasks". F15: a fifth local copy of month names accepted. F17: pending typing flushed before pickDue checks the task.
Ruling F16: chips also show in linked references and the open card (they render blocks) — harmless and consistent — cost: owner may want them off; noted in review item 136.
Task 1: dispatched (sonnet, base 02ee65a)
Task 1: implementer DONE_WITH_CONCERNS 60aa1ee (replaced an unfailable structure test with a fence test; set_due shares set_priority's unclosed-fence re-indent quirk, pre-existing); review dispatched (sonnet)
Task 1: review: spec ✅, 1 Important (no F13 mutation evidence for the pin tests) → fix round 1 sent to implementer.
Task 1: minor (deferred): replacement fence test is only a pin; test strings are multi-line literals unlike neighbours; set_due/set_priority re-indent a fence-swallowed sibling on replace (pre-existing) → follow-ups.
Task 1: fix round 1/5 (1 addressed, 0 open — F13 mutation evidence in report; no commits). Ruling: no scoped re-review — the round changed no code (empty diff); controller checked the report holds both mutations, the command and the outputs — cost: none.
Task 1: complete (commits 02ee65a..60aa1ee, review clean)
Task 2: dispatched (sonnet, base db7a057)
Task 2: implementer DONE 4844450; review dispatched (sonnet)
Task 2: review clean (spec ✅, approved). minor (deferred): render.rs task_state computed three times; redundant `finished` alias; no test for a task whose due:: line has no journal link.
Task 2: complete (commits db7a057..4844450, review clean)
Task 3: dispatched (sonnet, base dffce9d)
