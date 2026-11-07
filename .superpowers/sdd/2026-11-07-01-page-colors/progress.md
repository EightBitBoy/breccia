# SDD ledger — plan: docs/plans/2026-11-07-01-page-colors.md

Spec: docs/superpowers/specs/2026-11-07-page-colors-design.md. Executed on main (CLAUDE.md, owner consent).
Start: 39d9f09

## Pre-flight scan (opus): full table in preflight.md (local). Interfaces, files and line numbers match the code; shade table passes T5 thresholds; e2e 152 = 142 + 4 + 6.
Rulings (carried into the task dispatches):
- Ruling: P1 (T1) format_doc_recolor_examples must not call pub(crate) Document::set_preamble; splice recolor(doc.preamble(), ..) + rest of the body and compare — keeps the API surface — cost if wrong: one test rewrite.
- Ruling: P2 (T1, T2) cargo takes one filter; run `cargo test -p breccia-core -- color:: render::` (and likewise) — cost: none.
- Ruling: P3 (T3 Step 4) compare journal.feed, folder.open + journal.feed, block.setText and both files.changed lines of the scale report (no pages.get line exists) — cost: a missed perf regression on pages.get, which this plan does not touch.
- Ruling: P4 (T4) drop the "folded subtree" washRows case (cannot fail); pin folding in e2e step 113 with one assertion (fold a colored block: blob covers only visible rows, keeps rounded ends); Review Focus wording follows — cost: e2e slightly longer.
- Ruling: P5 (T6/T8) add one e2e assertion that a selected row inside a blob shows the selection colour (computed background differs from the wash) — Review Focus says pinned, so it must be — cost: one assertion.
- Ruling: P6 (T5) RED step: temporarily break pageColors.ts (e.g. drop a name), run, then git checkout it — the scratch-copy approach cannot fail — cost: none.
- Ruling: P7 (T3) journals_linking also takes heading_keys(k) unfiltered, so blocks reaching a deleted coloured page only through [[Page#Heading]] lose their wash at once — design says washes stay current — cost: a few extra day re-sends.
- Ruling: P8 (T3) Session::run sends journal days only when before and after generations both exist and match; on first folder.open nothing extra is sent; leftovers after a dispatch error are re-sent next run — cost: none known.
- Ruling: P9 (T1–T3) commit type chore(core), not refactor (new behaviour, not yet visible as a feature; changelog skips both) — cost: none, changelog identical.
- Ruling: P10 (T10) the demo test copies docs/demo to a tempdir before opening a Session — never let a test write into the repo's demo — cost: none.
- Ruling: P11 (T9) new review.md items use the "N. [ ] **Title:** …" form with the box — cost: none.

Task 1: dispatched (sonnet), BASE 152f95c
Task 1: implementer DONE_WITH_CONCERNS (ab00813); note for Task 9: compatibility.md:6 still says format version 5
Task 1: review approved, 1 Important (no RED for color:: tests) -> fix round 1 (mutation check)
Task 1: minor (deferred): docs/format.md lines over ~120 cols (What Breccia writes; §8 two lines; §13 bullet)
Task 1: minor (deferred): color.rs:46 is_color_property doc says "Whether" but returns Option<String>
Task 1: minor (deferred): color.rs:78-110 relies on title_line indexes matching split_inclusive; add a comment
Task 1: fix round 1/5 (1 addressed, 0 open — mutation check: 4 mutations each caught; no code change, so no diff to re-review; evidence checked by controller in task-1-report.md)
- Ruling: Task 1 fix round 1 closed without a scoped re-review — the round changed no code (empty diff) and the evidence (4 mutations, failing tests named with output) is in the report — cost if wrong: none to the code; only the evidence's honesty, which the final review can spot-check.
Task 1: complete (commits 152f95c..ab00813, review clean after fix round 1)
Task 2: dispatched (sonnet), BASE 37a0fe0
- Owner decision (2026-11-07, mid-plan): right-click on a link or tag in journal days opens a menu with "Color…" -> the same picker; added to the plan as Task 11 (opus), run after Task 7 and before Task 8.
Task 2: implementer DONE (8561ff0)
Task 2: review approved (spec ✅); ⚠️ blank-fileless save/undo path resolved by controller: covered by set_color_on_a_tag_only_page_creates_its_file and undoing_a_pick_on_a_tag_only_page_empties_its_file (pass per report)
Task 2: minor (deferred): view.rs:152-155 and pages.rs:235-241 repeat the journal->None / page->page_color match; share a helper
Task 2: minor (deferred): page_color.rs:402-403 null pick on "other" would pass even if null did nothing
Task 2: complete (commits 37a0fe0..8561ff0, review clean)
- Plan amended (Task 11 added, Task 7 extracts PageColorGrid.svelte, Task 8 step 116, e2e count 154, review items renumbered; Task 10 demo item is 32). Plan writer's call: undo of a pick made from a link is on the linked page, not in the journal.
Task 3: dispatched (sonnet), BASE 556f8ec
Task 3: implementer DONE_WITH_CONCERNS (f6df5bc): relaxed rename_reports_links_it_cannot_write; 2 guard tests green before impl; block.setText scale noisy (5.2 -> 6.0-14.1 ms, budget 16)
Task 3: review Needs fixes (spec ✅): Important guard test opening_a_folder_sends_no_stale_journals cannot fail; ⚠️ block.setText scale confirmed as gap (brief: >20 % median must be fixed) -> fix round 1 (resume implementer)
Task 3: minor (deferred): rename.rs:830 relaxed assertion vacuous if changed is empty; tighten to keys == ["2026-10-29"]
Task 3: minor (deferred): no test for the recompute_aliases path (alias added/removed on a coloured page recolours #alias blocks), names.rs:595-600
Task 3: minor (deferred): PageView::of parses inline::links for every top-level block of a journal per keystroke (view.rs:331); index_page allocates colors.insert per coloured page (names.rs:542)
Task 3: fix round 1/5 (2 addressed, 0 open — guard test fixture now reaches the generation guard, RED with guard removed; scale re-measured: parent median 12.37 ms, HEAD 11.95 ms, no fix needed; commits f6df5bc..98f76d1)
Task 3: complete (commits 556f8ec..98f76d1, review clean after fix round 1)
Task 4: dispatched (sonnet), BASE 129db91
Task 4: implementer DONE (9168708)
Task 4: review approved (spec ✅, wire names/order match core)
Task 4: minor (deferred): 25-name table hand-copied in TS and test; no guard against drift from Rust PAGE_COLORS
Task 4: minor (deferred): pageColors.ts:229 line ~120 chars
Task 4: complete (commits 129db91..9168708, review clean)
Task 5: dispatched (sonnet), BASE 4cd34a6
Task 5: implementer DONE (fa5d43f); tokens regenerated by script after an accidental revert
Task 5: review approved (spec ✅; reviewer verified all 25×6 shades, System dark = Dark, wash % per theme against the plan table)
Task 5: minor (deferred): no test pins the System dark --pc-* map to the Dark block (global constraint says "checked"; check whether an existing test covers it)
Task 5: complete (commits 4cd34a6..fa5d43f, review clean)
Task 6: dispatched (opus), BASE 59010f7
Task 6: implementer DONE_WITH_CONCERNS (6a02de3): no hands-on look; jump-highlight sets 4px radius on a washed row (cosmetic)
Task 6: review approved (spec ✅; no leak to non-journal views; editor transparent over a wash)
- Ruling: Task 6 ⚠️ (look not verified by eye) resolved: Task 8 must assert .wash/data-wash/wash-top/-bottom/-gap and the selection colour; Task 10 retakes screenshots; the owner's review item covers the look — cost if wrong: a visual flaw reaches the owner's review instead of being caught here.
Task 6: minor (deferred): .block.flash on a washed row animates to transparent then the wash snaps back; 4px corners while it plays (app.css:410-411) — end frame var(--wash, transparent)
Task 6: minor (deferred): .block.selected 4px radius cuts a blob's 8px corner on its top/bottom row (app.css:140)
Task 6: complete (commits 59010f7..6a02de3, review clean)
Task 7: dispatched (opus), BASE f642938
Task 7: implementer DONE_WITH_CONCERNS (db4a6d0); for Task 11: PageColorGrid has ondone?(), called after every choice; do not prevent the popover onOpenAutoFocus
Task 7: review approved (spec ✅; no double undo; layout intact; invalid names unreachable)
- Ruling: Task 7 ⚠️ (pick = own undo step; undo from a block editor takes the pick back) resolved by Task 2 core tests a_pick_is_its_own_undo_step & co., and Task 8 step 112 asserts it in the app — cost if wrong: caught in Task 8.
Task 7: minor (deferred): third copy of the mac-detection line (PageColorPicker.svelte:22, App.svelte:224, blockEditor.ts:46); export one isMac
Task 7: minor (deferred): "No color" uses aria-pressed, cells aria-selected; Task 8 should assert data-current
Task 7: minor (deferred): Esc inside the popover bubbles to sel.onKey; check in Task 8 it does not clear a selection
Task 7: complete (commits f642938..db4a6d0, review clean)
