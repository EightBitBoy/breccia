# SDD ledger — plan: docs/plans/2026-11-07-02-custom-page-colors.md

Spec: docs/superpowers/specs/2026-11-07-custom-page-colors-design.md. Executed on main (CLAUDE.md, owner consent). Owner asked for efficient model use.
Start: 165f670

## Pre-flight scan (opus): full table in preflight.md (local). Shades re-computed: 25 fixed within 1/255, pinned values match, all 360 hues pass without stepping (Teal text 4.647, Taupe tag 3.215). e2e 154 -> 160 correct.
Rulings (carried into the task dispatches):
- Ruling: Q1 (T1) Task 1 owns everything its type change breaks: add tests/it/demo.rs and tests/it/format_doc.rs to Task 1, move the format_doc print change (`color "{color}"`, Display not Debug) from Task 2 into Task 1, fix page_color.rs Some("red") checks; the core suite must be green at Task 1's commit — cost: none.
- Ruling: Q2 (T1) cargo one filter: `cargo test -p breccia-core -- color:: render:: page_color::` — cost: none.
- Ruling: Q3 (T5/T6) pointing at or pressing on the slider sets the preview to the custom part, so the preview follows the slider after hovering a cell (spec: updates while the slider moves); Task 6 adds a Vitest/logic test if the state lives in lib, and Task 7 asserts it — cost: none.
- Ruling: Q4 (T7) step 117: after the arrow keys press Tab, assert the bytes unchanged with expectFile's settle (adds one PASS line: expected total 161), then Shift+Tab back and Enter — cost: one more PASS line; STATUS records 161.
- Ruling: Q5 (T4) drop the colour-literal exception: the scan pattern does not match the code that is written; name helpers like toOklab and keep `oklch(`/hex literals out of comments and source in customColor.ts — the narrowest option keeps the rule unbroken — cost: if the scan does trip, the implementer reports instead of widening the rule.
- Ruling: Q6 (T6) the grid keeps its own tab stop when the saved colour is a hue (start it at "No color") — cost: none.
- Ruling: Q7 (T5) the preview's wash layer gets data-testid="page-color-preview-wash"; Task 7 uses it — cost: none.
- Ruling: Q8 (T5, T6) the "check in just dev" steps are replaced by the e2e steps of Task 7 and the owner's review items; an implementer may drive `just dev-debug` with a scratch script if it helps, never `just dev` by hand — cost: a visual flaw found later by the owner.
- Ruling: Q9 minors: commit types chore (not refactor) in Tasks 1 and 3; Task 4's #787878 note is 4.42:1; use $state.raw for the theme-tokens object; Task 8 also rewords docs/compatibility.md:98 (color stored as a name or a hue); plan 1 follow-up 2 (stale link-picker anchor) stays a follow-up, noted for the final report since the picker now stays open after a drag — cost: none.
Task 1: dispatched (sonnet), BASE 4c5f9e3
Task 1: implementer DONE (b0f2210)
Task 1: review approved (spec ✅; names.rs needs no edit; shell untouched; suite green per report: 711 + 41)
Task 1: minor (deferred): test strings use literal newline/tab characters instead of \n/\t (color.rs, page_color.rs, render.rs tests)
Task 1: minor (deferred): view.rs spells crate::color::PageColor four times
Task 1: minor (deferred): no read test for a lone invalid `color:: hue 999` line returning None
Task 1: complete (commits 4c5f9e3..b0f2210, review clean)
Task 2: dispatched (sonnet), BASE 9fd3487
Task 2: implementer DONE (e0b9f67)
Task 2: review approved (spec ✅; every §8 claim matches parse_color/recolor); ⚠️ spec §7.3/§7.10 references resolved: both sections exist (plan 1 Task 9)
Task 2: minor (deferred): format.md §8 slightly repetitive "lower case" sentences; §13 bullet over 120 cols (old)
Task 2: complete (commits 9fd3487..e0b9f67, review clean)
Task 3: dispatched (sonnet), BASE 67caa1d
Task 3: implementer DONE (11a3e9f); picker state rules (slider sets preview, saved value marked, grid tab stop at No color, drag saves on release) are component work -> carry into Tasks 5/6
Task 3: review approved (spec ✅); TS parseHue is stricter than the core (core accepts HUE/leading zeros) — fine, the wire value is the core's canonical Display
Task 3: minor (deferred): parseHue rejection list lacks 'hue 1000', 'hue -1', trailing/double spaces
Task 3: complete (commits 67caa1d..11a3e9f, review clean)
Task 4: dispatched (sonnet), BASE 3466955
Task 4: implementer DONE (de6f53c); sweep: no stepping needed in any theme (28/28 34/34 34/34 34/34 28/28 30/30 34/34)
Task 4: review approved (spec ✅; math cross-checked by independent test helpers; params in all 7 blocks); ⚠️ literal scan resolved: controller ran theme.test.ts, 18/18 pass
Task 4: minor (deferred): the sweep's single console.info line in test output (borderline vs pristine output); float chroma loop and assignment-in-argument style nits in customColor.ts
Task 4: complete (commits 3466955..de6f53c, review clean)
Task 5: dispatched (opus), BASE e852776
Task 5: implementer DONE_WITH_CONCERNS (42bd452): e2e 154, release-exe script confirms pinned values; picker opens with nothing focused for a saved hue until Task 6 adds the slider -> Task 6
- Ruling (implementer): a theme missing a colour token logs an error and keeps the last values, so startup cannot break — cost if wrong: a broken theme shows stale washes instead of failing loudly.
Task 5: review approved (spec ✅; theme + OS scheme recompute correct; shades cached per theme; implementer ruling accepted by reviewer); ⚠️ look on screen -> Task 7 e2e + owner review items
Task 5: minor (deferred): preview font-size 15px/1.5 copied from body (app.css:741)
Task 5: minor (deferred): preview keeps the last hovered cell when the pointer moves into gaps or onto the preview box (PageColorGrid.svelte:281)
Task 5: carried to Task 6: `hue` is seeded once (untrack); decide whether it follows `color` after a save with the picker open; picker opens with nothing focused for a saved hue until the slider exists
Task 5: complete (commits e852776..42bd452, review clean)
Task 6: dispatched (opus), BASE c841284
Task 6: implementer DONE (b09ac49): e2e 154; slider hooks page-color-hue (role=slider, data-index=26, aria-valuenow/valuetext, data-current)
- Ruling (implementer): the slider's hue follows a new saved hue except during a drag; a saved name/none leaves it — cost: none known.
Task 6: concern: slider takes focus via a one-frame refocus after mount, guarded once any key/press reached the picker (bits-ui auto-focus otherwise lands on No color)
Task 6: review approved (spec ✅; drag saves once incl. release outside / cancel; arrows only preview until Enter; focus workaround guarded); ⚠️ look in Teal/Dark and the link-menu picker -> Task 7 e2e + owner review
Task 6: minor (deferred): focus relies on frame ordering vs bits-ui open auto-focus; sturdier: onOpenAutoFocus preventDefault in both hosts (PageColorGrid.svelte:125-132)
Task 6: minor (deferred): thumb hangs 4 px outside the track at 0/359 (app.css:414-417); track 140 px vs grid 136 px
Task 6: carried to Task 7: assert bytes for Enter (one write), a drag (exactly one write), Esc after arrows (no write)
Task 6: complete (commits c841284..b09ac49, review clean)
Task 7: dispatched (sonnet), BASE 33c5d44
Task 7: implementer DONE_WITH_CONCERNS (a09c85c): 162 PASS twice (161 + the Esc-after-arrows expectFile the controller asked for)
- Ruling: e2e expected count is 162 (the extra expectFile is the controller's own Esc-no-write check) — cost: none.
Task 7: review Needs fixes: Important "exactly one write" mtime check cannot fail (snapshot after the 1 s settle) and adds a sleep
- Ruling: Task 7 — drop the mtime/sleep check; prove "one drag = one undo step" by undo: one Ctrl Z restores the pre-drag bytes exactly, a second goes to the state before the Enter save (redo after if needed). An identical duplicate save writes the same bytes and records no step (plan 1 Task 2 test), so it is invisible to the user — cost if wrong: a harmless duplicate write goes unnoticed.
Task 7: fix round 1 dispatched (resume implementer)
Task 7: fix round 1/5 (1 addressed, 0 open — undo-count proof replaces mtime+sleep; 164 PASS twice; commits a09c85c..438505a)
Task 7: complete (commits 33c5d44..438505a, review clean after fix round 1)
Task 8: dispatched (sonnet), BASE 57abda7
Task 8: implementer DONE (887e9c7)
Task 8: review approved (spec ✅; claims match code); ⚠️ old-version claim rests on the name-only parser of plan 1 (unknown value = no color, line kept) — resolved: plan 1's design and parse rules say so
Task 8: minor (for final fix wave): spec §7.10 omits the chroma -> grey -> no-wash fallbacks of compute(); §7.4 line over 120 cols; §7.3 "arrow keys only preview" should say "on the slider"
Task 8: complete (commits 57abda7..887e9c7, review clean)
All tasks complete. Final review next (opus), range 4c5f9e3..HEAD.
