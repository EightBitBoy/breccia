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
