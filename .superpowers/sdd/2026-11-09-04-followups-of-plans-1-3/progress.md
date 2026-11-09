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
Task 4: minor (deferred): step 123 also assert the animation end differs from white; step 123 covers only the named blue wash, not a custom (opaque) one; getAnimations()[0] should filter by animation name
Task 4: complete (commits 0c9122a..f0d9e61, review clean; e2e 184 PASS x2)
Task 5: minor (deferred): review.md:72 is 122 columns; review item 52 says "a click under the thumb does not change the value" but no code or test backs it (fix in final wave: remove or make true); long struck lines in plan 1 follow-ups
Task 5: complete (commits fa5b54b..8207b9d, review clean)
Final review (opus): ready with fixes. Fix: (1) step 121 hover of the hue slider enables Vividness (no test covers pointer path, PageColorGrid.svelte:224); (2) step 95 race (smoke.mjs 1884/1897/1905) wait for the page title to change; (3) review item 52 text wrong (only a press on the thumb's exact middle keeps the value) + follow-up for grabbing the thumb without a jump; free: review.md:72 length, two double blank lines.
Release pause (1.3.0): delete the changelog line from 1a3bc80 ("a picker opened on a link that just went…") — it fixes a bug from this same plan that no release had, wording unclear.
- Ruling: one opus fix wave for 1, 2, 3 and the two free items; everything else stays a follow-up — nothing builds on it — cost if wrong: small cleanups wait
Final fix wave: dispatched (opus), FIX_BASE 13ec07c
Final fix wave: 45768f2, e19d1d1, 6c5a639; re-review: all addressed, no new breakage
Finish checks (controller): just test green (Vitest 926), just lint green, just e2e 184 PASS.
Plan 4: complete (e6f19ee..6c5a639)
