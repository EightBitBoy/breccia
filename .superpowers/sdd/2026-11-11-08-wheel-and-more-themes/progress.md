# SDD ledger — plan: docs/plans/2026-11-11-08-wheel-and-more-themes.md

Setup 2026-11-11: workspace, briefs 1-5, constraints.md. BASE b36f15f.

Pre-flight (opus): preflight.md, 0 critical, 4 important, 7 minor. Rulings: apply every proposed correction in preflight.md (F1-F11) as written, except F3: item 80 uses the plan's Q1 order with System FIRST ("System, Light, Taupe, Parchment, Dark, Graphite, Violet, Teal, Vampire, Fjord, Ember", wrapping) — the plan's owner-decision text wins — cost if wrong: one doc line. e2e baseline 200 (step 131 exists); Task 2 expects 200, Task 4 and Finish 201.

Task 1: complete — 7f56ce9, 470d03d; review ✅/approved (minor: stray blank line AppearanceSection.svelte:5-6, carried to Task 2). Vitest 1050.

Task 2: complete — 192b45e, 9665148, 095b3cf, b2cdb16, c7a1f60, 934ab79, 80d78fd; review ✅/approved. Minors: theme.ts:1 "six built-in themes" (carried to Task 3); e2e lists landed after the per-theme commits (accepted, history only). Gruvbox has no LICENSE file (README says MIT/X11); values are our own — follow-ups note. Vitest 1059, e2e 200.

Task 3: complete — d425c4e; review ✅/approved. Minors parked: a scaled delta rounding to 0 resets a partial count (same as zoom); no stepTheme unknown-id test (types prevent it). Vitest 1067, e2e 200.

Task 4: complete — 7ea414f; review (opus) ✅/approved. Minor 1 carried to final fix wave: step 132 sub-check 7 should assert the menu is still open before Esc (smoke.mjs:3765-3770). Minor 2 (no test that preventDefault stops page scroll) parked. Vitest 1068, core 737, e2e 201.

Task 5: complete — ba87f36; review ✅/approved. Minor to final review: spec 7.13 "at its right end" placement unchecked against other right-side items.
All tasks complete. Final review package review-b36f15f..ba87f36.diff.
