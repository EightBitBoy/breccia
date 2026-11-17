# SDD ledger — plan: docs/plans/2026-11-17-12-open-followups.md

Started 2026-11-17 at c2a05c4 on `main` (project rule: plans run on `main`). Commit only, no push (owner).
Spec: `docs/spec.md`. Owner answers Q1–Q6 in the plan's "Owner decisions".

## Pre-flight (opus, 2026-11-17)
Scan: 15 shared-file rows, 13 task rows, 6 conditional-wording spots; full table in local `preflight.md`. Rulings R3–R18
are in the plan's "Pre-flight rulings" (binding over task text). Notable:
- Ruling: R9 — the core's no-folder recovery gets a generation so the shell can compare (Task 5 was unexecutable as written) — cost if wrong: one enum field in the core.
- Ruling: R15 — the caret after Ctrl Shift K is set in the frontend, so Task 11 splits into a core fix and a frontend fix (`ownTextEnd` in `app/src/lib/deleteBlock.ts`) — cost if wrong: a second small helper.
- Ruling: R16 — Backspace that would join a multi-line task onto a task above keeps being refused; only property lines at the end of a block count — cost if wrong: owner may want such joins; flagged for review.
- Ruling: R7 — a failed log rotation keeps the current log; it is truncated only above twice the cap — cost if wrong: a log up to 2 MB.
- Ruling: R11 — invisible behaviour changes commit as `chore` — cost if wrong: commit-type wording only.
Task 1: dispatched (sonnet), BASE 08362eb
Task 1: minor (deferred): range.rs doc line on replace_out_of_range ~120 columns
Task 1: minor (deferred): watch.rs comment about which LoadWarning classify returns can go stale
Task 1: complete (commits 08362eb..0dd348a, review clean)
Task 2: dispatched (sonnet), BASE c42b649
Task 2: Ruling: the empty-valued-property pin checks TODO→DOING (state word only) and plain→TODO (created:: added after the property line), since a later state change adds no created:: — the brief's expectation was wrong about when created:: is added — cost if wrong: none, the test pins real behaviour
Task 2: minor (deferred): session.rs:1264 first undo half is vacuous (second case covers it)
Task 2: minor (deferred): task.rs:1418 CRLF pin only fails when all three trims go
Task 2: minor (deferred): report names no mutations for the step 4 pins (edit.rs:223, session.rs:1279)
Task 2: minor (deferred): page_color.rs:285 comment carries an extra parenthetical
Task 2: minor (deferred): task.rs:1389-1415 raw multi-line literals vs \n escapes nearby
Task 2: minor (deferred): board.rs:74 `ok` still hard-codes (2026, 10, 29) instead of DAY
Task 2: complete (commits c42b649..bf62822, review clean)
Task 3: dispatched (sonnet), BASE bfb1def
Task 3: minor (deferred): TRACK_STEP is local to vividTrack (as briefed), a module constant would match CUSTOM_DL
Task 3: minor (deferred): page-colors.test.mjs:133 regexes tied to the const declaration forms
Task 3: complete (commits bfb1def..58f6088, review clean)
Task 4: dispatched (sonnet), BASE 239d50f
Task 4: commit split into 48e4111 (redaction) and b3a1561 (rotation) at the controller's request (one change per commit, two changelog lines)
Task 4: review (opus): 1 Important — redact leaks a token-only user-info when the path holds another @ (regression vs base)
Task 4: minor (deferred): over-masking of https://host:8080/a@b and file:///…/a@b.md (paths are allowed in the log)
Task 4: minor (deferred): a password with ' " or < still shows its first part (brief's cut; same as base)
Task 4: minor (deferred): two_threads_write_whole_lines never mutation-checked and likely cannot fail; no RED runs captured for the first commits (mutation-checked instead)
Task 4: minor (deferred): rotation test failure message "never truncated" says the opposite of its check
Task 4: fix round 1/5 dispatched (resume implementer, sonnet), FIX_BASE b3a1561
Task 4: fix round 1/5 (1 addressed, 0 open; commits b3a1561..026789f)
Task 4: complete (commits 239d50f..026789f, review clean after round 1)
Task 5: dispatched (sonnet), BASE 98d3ae4
Task 5: minor (deferred): watching.rs:77-84 notes_root set after the watcher starts — a git.log may see the previous root a little longer after a folder switch
Task 5: minor (deferred): watching.rs:20-84 an older-generation watcher starts fully before being dropped (check may_replace first)
Task 5: minor (deferred): no RED run for Step 1; may_clear not mutation-checked; no test that the shell calls may_replace/may_clear
Task 5: complete (commits 98d3ae4..1031fba, review clean)
Task 6: dispatched (sonnet), BASE 7d2ed03
Task 6: Ruling: no query in the command-kind list reaches only its error path today, so the test fails on any error answer and four queries were added — the brief's premise was stale — cost if wrong: none
Task 6: minor (deferred): it/session.rs ~2352-2420 string literals hold real line breaks instead of \n
Task 6: minor (deferred): contract.test.ts ~75 regex tied to the exact `code === '…') return true` line shape
Task 6: minor (deferred): `/// <reference types="node" />` in contract.test.ts and theme.test.ts; a tsconfig types entry would be tidier
Task 6: complete (commits 7d2ed03..d44becd, review clean)
Task 7: dispatched (sonnet), BASE 6261a97
Task 7: note: first e2e run failed at step 101 ("wrap!" → "wrapy!es"), rerun passed — flaky, carry to Task 8
Task 7: minor (deferred): changelog.ts VERSION counts a linked heading with whitespace in the URL that then renders literally
Task 7: minor (deferred): changelog.test.ts:93 linked-heading test does not check the heading's inlines
Task 7: minor (deferred): bulletCount does not strip a BOM; versionsOf does
Task 7: minor (deferred): the chore commit carries no tests (they come in the next commit)
Task 7: minor (deferred): the "keeps every word" test keeps its own copy of the comment regex
Task 7: complete (commits 6261a97..40670d9, review clean)
Task 8: dispatched (sonnet), BASE 99bce23
Task 8: step 101 flake not reproduced (3 passes); cause unclear — goes to the follow-ups
Task 8: minor (deferred): step 128's pointer moves cannot be shown to fail (stabilisation only)
Task 8: minor (deferred): step 127's "typed but not sent" case documented unreachable, not checked against app code
Task 8: minor (deferred): one commit for all step groups instead of one per group
Task 8: complete (commits 99bce23..811012b, review clean; e2e 207 twice)
Task 9: dispatched (sonnet), BASE 1198334
Task 9: minor (deferred): ci-workflow.test.mjs lines over 120 characters
Task 9: minor (deferred): the `if` assertion is not tied to the build job (fine while there is one job)
Task 9: complete (commits 1198334..d79e01f, review clean)
Task 10: dispatched (opus, UI integration), BASE be6a1b1
Task 10: minor (deferred): step 137 reads the file once right after a thumb press; a late write could slip past (aria-valuenow check catches the real regression)
Task 10: minor (deferred): sliderDrag's grabbed offset not cleared on release/cancel (each press resets it)
Task 10: review clean; implementer's e2e killed for low memory — controller e2e run pending
Task 10: controller `just e2e` (CARGO_BUILD_JOBS=2, low memory): 208 PASS, 0 FAIL, step 137 passes
Task 10: complete (commits be6a1b1..4b73064, review clean)
Task 11: dispatched (sonnet), BASE 980b625
Task 11: minor (deferred): it/edit.rs:148-181 no core test for a property line followed by a text line (window side has it)
Task 11: minor (deferred): edit.rs merge_into_previous doc comment has one ~120-column line among ~75
Task 11: minor (deferred): own_text_end is pub(crate) but used only in edit.rs
Task 11: complete (commits 980b625..d6d23eb, review clean; e2e 208)
Task 12: dispatched (sonnet), BASE addd806
Task 12: minor (deferred): site.css:179-181 the fade mask also clips the horizontal scrollbar
Task 12: minor (deferred): site.css:156-157 `order` tied to nth-child numbers; a reordered card list breaks the pairing silently
Task 12: minor (deferred): hero.js wiring of afterDecode has no unit test
Task 12: complete (commits addd806..de650a8, review clean; fade degrades to none without scroll-driven animation)
Task 13: dispatched (sonnet), BASE 48f8d9f
Task 13: minor (deferred, controller fixes at finish): STATUS test baseline counts and the "24 open / 62 closed" backlog line are stale
Task 13: minor (deferred): spec §7.2 Ctrl Shift K caret clause runs far past 120 columns
Task 13: minor (deferred): review item 113 says "does nothing" where the spec says "not joined"
Task 13: complete (commits 48f8d9f..60e5dec, review clean)
Final review: dispatched (opus) over 6a2dbf8..HEAD
