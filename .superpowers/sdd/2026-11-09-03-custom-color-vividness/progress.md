# SDD ledger — plan: docs/plans/2026-11-09-03-custom-color-vividness.md

Start: b551882 (2026-11-09). Spec: docs/spec.md (binding); designs docs/superpowers/specs/2026-11-07-*-design.md.
Workspace on main per CLAUDE.md (owner: commit directly on main).

Pre-flight scan (opus): 12 findings, table in preflight.md (local). All accepted and written into the plan's
"Pre-flight rulings" section (R1-R12).
- Ruling: R1-R12 as in the plan — each is the smallest correction that keeps the plan consistent with the owner's P5
  change and makes every test able to fail — cost if wrong: rework of the affected test or wording in one task.
Task 1: dispatched (sonnet), BASE e09d58a
Task 1: minor (deferred): format_doc.rs:338 long matches! line; render.rs:437 "no color::" assertion is pinning-only; color.rs:123 `v as u8` could be u8::try_from
Task 1: ⚠ "page.setColor canonicalizes via parse_color/Display" checked by controller: color_change path from plan 2, covered by session tests — resolved
Task 1: complete (commits e09d58a..4e40b19, review clean)
Task 2: minor (deferred): intermediate commit 0c250bc was red (fixed in 0ba34d6); long module doc comment line in format_doc.rs
Task 2: complete (commits f510c3a..0ba34d6, review clean)
Task 3: minor (deferred): an optional extra pickerTab test case (reviewer's suggestion)
Task 3: complete (commits 5648801..89418f3, review clean)
Task 4: minor (deferred): customColor.ts:78 chroma at 100 exact only for today's cs (prefer CUSTOM_CHROMA*t.cs*(vivid/100)); vividTrack uses 5*VIVID_STEP instead of VIVID_PAGE; sweep gamut uses t.l not t.l+CUSTOM_DL*t.ds; `limited` doc comment wording
Task 4: complete (commits da3e066..adc1ed8, review clean)
Task 5: review (opus): spec ✅, quality needs fixes — Important: "softened" note in var(--muted) 11px is 1.58–3.28:1 on limited washes; UI unverified until e2e
- Ruling: the note uses var(--text) instead of var(--muted) — global constraint "text ≥ 4.5:1 on the wash" outranks the plan's styling detail, and the guard guarantees --text on every wash — cost if wrong: the note looks less subdued; one CSS line
- Ruling: "UI unverified" is not a fix item; Task 6's e2e steps 119/120 are the verification, and the controller runs just e2e at the end — cost if wrong: a UI bug surfaces in Task 6 instead of here
Task 5: minor (deferred): sweep timeout 60 s could be 15–20 s
Task 5: fix round 1/5 (1 addressed, 0 open — note uses var(--text), italic; commits b7dde96..1c1718f)
Task 5: complete (commits 1295f9e..1c1718f, review clean after round 1)
Task 6: minor (deferred): light theme reset only at end of step 120; Vivid 119 page and day journal file not deleted (same as earlier steps)
Task 6: complete (commits 11b309c..cb5c849, review clean; e2e 176 PASS x2)
Task 7: minor (deferred): spec §7.10 vividness sentence overlaps old "down to half the theme's strength" (not exact below 100); spec §7.3 old "Tab moves between the grid and the slider" left beside the new 3-stop order
Task 7: complete (commits 8ce65be..5f167af, review clean)
Final review (opus): ready with fixes. Must fix I1 (spec Tab sentence), I2 (spec readability floor sentence); same wave M1-M4; M5-M8 to follow-ups; M9 = STATUS at finish.
- Ruling: one fix wave (opus) for I1, I2, M1-M4; M5-M8 go to the follow-ups doc — they are cosmetic or test hygiene and nothing builds on them — cost if wrong: small cleanups wait for a later plan
Final fix wave: dispatched (opus), FIX_BASE 6fc1dab
Final fix wave: 32c2ce7 (M1), 56643ab (I1, I2, M2-M4); re-review: all addressed, no new breakage
Finish checks: just test green (Vitest 913, cargo 718+50+41), just lint green; just e2e FAILED at step 120 (preview showed a hovered named color, not the page's custom wash)
- Ruling: step 120 is flaky because the picker opens under the pointer and the grid's hover drives the preview (plan 2 follow-up 3); fix the test (move the pointer away, wait for the state), not the component — cost if wrong: a real preview bug stays hidden behind the pointer move
e2e fix: dispatched (sonnet)
e2e fix: 4f4d3ff (move pointer off the grid, waitFor the preview); fixer 176 PASS x2; controller just e2e 176 PASS
Finish: just test green (Vitest 913, cargo ok), just lint green, just e2e 176 PASS. Follow-ups doc written; STATUS updated.
Plan 3: complete (b551882..HEAD)
