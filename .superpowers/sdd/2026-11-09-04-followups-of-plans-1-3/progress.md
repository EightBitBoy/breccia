# SDD ledger — plan: docs/plans/2026-11-09-04-followups-of-plans-1-3.md

Start: e6f19ee (2026-11-09). Spec: docs/spec.md (binding). Work on main per CLAUDE.md.
Owner approved Q1-Q8 as recommended.

Pre-flight scan (opus): 10 findings (F1-F10), table in preflight.md (local). All accepted and written into the plan's "Pre-flight rulings" (R1-R10).
- Ruling: R1-R10 as in the plan — each is the smallest correction that makes a test able to fail or keeps the plan consistent with the code — cost if wrong: rework of the affected test or wording in one task.
Task 1: minor (deferred): double blank line left in App.svelte and PageColorPicker.svelte after removing the mac line
Task 1: complete (commits e6977d0..cbe7833, review clean)
Task 2: minor (deferred): opening has no focus fallback if the content can't take focus within one frame (later: focus from onOpenAutoFocus); .page-color-picker padding/min-width/z-index lines are dead (overridden by .menu); step 121's focus-on-open check is pinning-only; STATUS e2e count must read the final total (Task 5 only)
Task 2: concern: e2e step 95 (journal date picker) failed once in the implementer's runs — reviewer judges a pre-existing race (waits for start-writing, which the previous empty day also shows, smoke.mjs:1897); not caused by this change. Final review to decide whether to fix.
Task 2: complete (commits 86e3ed6..29e294a, review clean; e2e 179 PASS x2)
