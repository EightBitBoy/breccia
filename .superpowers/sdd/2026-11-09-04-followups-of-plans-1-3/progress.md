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
Owner request: after plan 4 finishes, implement backlog #73 directly (small change, no plan). Recorded in docs/STATUS.md.
Owner request: after #73, implement backlog #74 (theme picker button in the status bar next to "?") directly, then release a new version.
- Ruling: the release is 1.3.0 (owner gave no number; plan 4 and #73/#74 are user-visible changes, a minor bump) — cost if wrong: the owner re-cuts with another number before the tag is pushed, or gets a skipped version number
Owner request: after the 1.3.0 release, plan backlog #75 (faint lines between wash rows at zoom 110%/125%, display scale 100%) as a normal plan with owner review.
Task 3: review (opus): spec ✅, quality needs fixes — Important: no test could fail on follow()/findSpot; gap: Q6 pick-after-link-gone untested
Task 3: fix round 1/5 (2 addressed, 0 open — step 122 edits block text on disk while picker open and after a pick; removes the link and checks the pick's bytes; commits 0011855..4fbb18b)
Task 3: minor (deferred): refocus only ends on a pointerdown or focusin elsewhere; tabindex written into {@html} content
Task 3: complete (commits 45c4e62..4fbb18b, review clean after round 1; e2e 183 PASS x2; expected total after Task 4: 184)
