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
Task 3: implementer DONE 32e5b47 (F9 done here; Task 8 skips it); review dispatched (sonnet)
Task 3: review clean (spec ✅, approved). minor (deferred): no session test that setting the same date twice is a no-op; notATask test checks only the code; bad date on an unknown id answers badDate first (harmless).
Task 3: complete (commits dffce9d..32e5b47, review clean)
Task 4: dispatched (sonnet, base 95f0349)
Task 4: implementer DONE 31ebc33 (RED captured after writing code, by moving files away); review dispatched (sonnet)
Task 4: review clean (spec ✅, approved). Cannot-verify item (fillDueChips regex vs the core span) checked by controller: due.ts:48 matches render.rs:456 exactly.
Task 4: minor (deferred): NOT_A_TASK "matches the core" test compares the constant with its own literal; real focus/visibility wiring untested and start() has no double-call guard; no finished-other-year or leap-day case; --due-* token lines sit mid --c-* run.
Task 4: complete (commits 95f0349..31ebc33, review clean)
Task 5: dispatched (opus, base 7e08d4f)
Task 5: implementer DONE_WITH_CONCERNS ceea0cc (no by-eye check in just dev; e2e 226 green); review dispatched (opus). Ruling: the by-eye check moves to Task 10's e2e step 152 and review item 136 — the implementer cannot see the window — cost: a visual flaw found later by the owner.
Task 5: review clean (opus; spec ✅, approved). minor (deferred): commit subject 95 chars (brief's wording); cardDue restates dueChip's return type; card chip lacks data-due (Task 10 may want it).
Task 5: complete (commits 7e08d4f..ceea0cc, review clean)
Task 6: dispatched (opus, base 386e683)
Task 6: implementer DONE_WITH_CONCERNS 0b2c0a6 (checked by hand over DevTools; card chip gets data-due; pressing inside the due calendar keeps the block editing). Implementer rulings: calendar remembers prior focus until next open (bits-ui calls close-focus on open); focus returns to the card, not its hover-only menu button. Concern (pre-existing): card's hidden buttons are not Tab-reachable, so the card menu has no keyboard path → follow-ups/backlog. Review dispatched (opus).
Task 6: review clean (opus; spec ✅, approved). minor (deferred): outside click returns focus, may fight the click's own focus (R7, check in e2e); "Remove due date" uses class dp-today; today outline hidden under chosen fill; no test for menuClosed focus fallback; Board.svelte import order. Card menu has no keyboard path (pre-existing) → follow-ups.
Task 6: complete (commits 386e683..0b2c0a6, review clean)
Task 7: dispatched (opus, base 9a9eec7)
Task 7: implementer DONE_WITH_CONCERNS 32393cb (hand-checked 13 cases on release exe). Concerns: ordinary pages get no link "Color…" (core fills targets only for journal pages; out of scope) → review item 136 must say so; with no prior focus, focus lands on hidden div.link-zone after a pick (bits-ui). Review dispatched (opus).
Task 7: review (opus; spec ✅, approved) with 1 Important: on ordinary pages, outside the editor and off selected text, the browser's own right-click menu no longer opens (matches the journal rule, spec §7.4) — unrecorded visible change.
Task 7: Ruling: the Important is a docs gap, not a code defect — F10 gives every spec change to Task 9 — so Task 9 widens spec §7.4 to pages and review item 136 records it (and that pages get "Copy link" and the task menu but no link "Color…", since the core lists colorable targets only for journal days) — cost if wrong: the owner wants the browser menu back on pages (small change in PageView).
Task 7: minor (deferred): saved pre-right-click focus is always the menu zone itself (header comment overstates); Esc on the task menu not covered by the focus comment; linkColor.test.ts row() casts as BlockView; task logic (taskOf, TaskSpot) lives in linkColor.ts.
Task 7: complete (commits 9a9eec7..32393cb, 1 Important routed to Task 9 by ruling)
Task 8: dispatched (opus, base 2d9d05b)
Task 8: implementer DONE_WITH_CONCERNS 26dd796 (hand-checked; due calendar now closes after an internal-error reload). Concern: core EditError::NotATask text "Only a task has a due date" differs from window NOT_A_TASK "Only a task can have a due date." (F7 says one sentence) → final fix wave (Task 1 defect). Review dispatched (opus).
Task 8: review clean (opus; spec ✅, approved). Cannot-verify (item 136 names Ctrl D) → carried into Task 9's dispatch. minor (deferred): App.svelte:59 `if (!b) return` drops the key silently; no test for coordsAtPos null fallback (host.svelte.ts:173); pickDue skips the dialogOpen/search.shown check pickDate has (harmless).
Task 8: complete (commits 2d9d05b..26dd796, review clean)
Task 9: dispatched (sonnet, base 523eea9) with the facts for item 136 (Ctrl D replaces select-next-occurrence; pages' new right-click zone; no Color… on pages; chips in linked refs/open card; card menu no keyboard path)
Task 9: implementer DONE d0185c0 (backlog #98 sort, #99 card menu keyboard path); review dispatched (sonnet)
Task 9: review: 1 Important (spec §7.2 claims a task menu in linked refs/open card — false, R9); minors: long lines §7.4/§5, chip/picker not in vocabulary (deferred), item 136 lacks one-undo-step (R8), spec lacks 'further due:: lines dimmed'. Fix round 1 sent (Important + 3 minors).
