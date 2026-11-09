# Plan 1 (page colors): follow-ups

Work the plan deferred. Open items are taken by later plans or moved to `docs/backlog.md`. Found by the per-task
reviews and the final whole-plan review (2026-11-07).

## Behaviour

1. ~~**Focus after a pick from a link:** after a pick in the journal's right-click menu, focus drops to the page body
   instead of returning to the link (`app/src/components/LinkColorMenu.svelte`, its `onCloseAutoFocus`).~~ Done in plan 4 (the focus returns to the link).
2. ~~**Stale picker position:** if the journal day is re-sent while the link menu's picker is open, its anchor element is
   replaced and the popover stays at its old position (`LinkColorMenu.svelte`, the `anchor` element).~~ Done in plan 4 (the picker follows its link).
3. ~~**Loose selection check:** a right-click between blocks while any text is selected gives the browser menu instead of
   no menu (`LinkColorMenu.svelte`, `sel.containsNode(el, true)`).~~ Done in plan 4 (the selection check uses the selected text's boxes).
4. ~~**Keys inside the picker:** since the Escape fix, every key stops at the color grid, so bubble-phase shortcuts do
   not fire while the picker has focus (capture-phase keys such as F1 still do).~~ Dropped in plan 4: every app-wide shortcut is capture-phase.
5. ~~**Flash on a washed row:** the jump highlight animates a washed row's background to transparent, then the wash
   snaps back, with 4 px corners while it plays (`app/src/styles/app.css`, `.block.flash`); end the animation on
   `var(--wash, transparent)`.~~ Done in plan 4 (the highlight fades back to the band's color).
6. ~~**Selection corners:** `.block.selected` sets a 4 px radius, so a selected row at a blob's top or bottom loses the
   blob's 8 px corner (`app.css`).~~ Done in plan 4 (a selected row keeps the band's rounded ends).
7. ~~**Accessible name:** the picker popover has no accessible name of its own (the grid has "Page colors").~~ Done in plan 2 (the pickers are dialogs named "Page color" / "Color of <name>").

## Tests

8. ~~No e2e step for a pick from a link on a journal day opened as a page (only the feed is covered).~~ Done in plan 4 (e2e step 122).
9. No scale measurement of a pick on a widely linked page that re-sends many journal days.
10. `crates/core/tests/it/rename.rs` (`rename_reports_links_it_cannot_write`): the relaxed assertion passes when
    nothing is re-sent; assert the re-sent keys equal `["2026-10-29"]`.
11. `crates/core/tests/it/page_color.rs`: the null pick on `other` in the tag-only test would pass if a null pick did
    nothing at all.
12. ~~e2e step 114/116 selection check only asserts that the selected row's background differs from the wash; compare it
    with a probe of the selection token.~~ Done in plan 4 (e2e step 116 compares with a probe).
13. `app/e2e/screenshots.mjs`: the `.catch` on the `tray:exit` emit hides the cause when the app does not close.

## Code tidy-ups

14. ~~The journal → none / page → `page_color` match is written twice (`session/view.rs` and `workspace/pages.rs`);
    share one helper.~~ Done in plan 2 (`own_color`).
15. Per keystroke on a journal, `PageView::of` parses the links of every top-level block again, and `index_page`
    allocates a key for every colored page on every re-index. Measured cost is within noise today (scale
    `block.setText` median 11.95 ms against 12.37 ms before).
16. ~~The Mac detection line is copied three times (`PageColorPicker.svelte`, `App.svelte`, `blockEditor.ts`); export
    one `isMac` from `app/src/lib/`.~~ Done in plan 4 (`app/src/lib/platform.ts`).
17. ~~`crates/core/src/color.rs`: the doc comment of `is_color_property` says "Whether" though it returns the value;
    `recolor` relies on `title_line` indexes matching `split_inclusive` indexes, worth a comment.~~ Done in plan 2 (doc comment and `title_line` comment).
18. Lines over the docs' ~120-column wrap in `docs/format.md`, `docs/spec.md` (§7.4, §7.10) and `docs/review.md`
    (item 31); `app/src/lib/pageColors.ts` has one ~120-character line. Partly done in plan 4 (`pageColors.ts`, `docs/spec.md` §7.3 and §7.4, `docs/review.md`); `docs/format.md` is left.

## Docs

19. The README feature list names page colors in one line; a short README section with the journal screenshot's
    colors explained could follow if wanted.
