# Plan 2 (custom page colors): follow-ups

Work the plan deferred. Open items are taken by later plans or moved to `docs/backlog.md`. Found by the per-task
reviews and the final whole-plan review (2026-11-07). The strength slider is backlog #72.

## Behaviour

1. **Yellow-ish custom hues** come out olive-like, darker than the fixed `yellow`, because one lightness serves every
   hue (owner decision: judge at review item 36). If wanted, let the lightness offset follow the hue, interpolated
   from the fixed colors; it is one function in `app/src/lib/customColor.ts`.
2. **Stale link-menu picker position** (plan 1 follow-up 2) matters more now: a drag keeps the picker open, so a day
   re-sent meanwhile leaves the popover at its old place (`LinkColorMenu.svelte`, the `anchor` element).
3. **Preview keeps the last hovered cell** when the pointer moves into the gaps or onto the preview box
   (`PageColorGrid.svelte`, the `hover` state).
4. **Focus on open depends on frame order** against bits-ui's own auto-focus (one-frame refocus in
   `PageColorGrid.svelte`); sturdier: `onOpenAutoFocus` preventDefault in both hosts, keeping the frame retry.
5. **The slider does not tell a screen reader it holds the saved color** (cells use `aria-selected`).
6. **A custom wash is opaque**, while the named washes are see-through; they look the same today because every journal
   row sits on the page background.
7. **The slider thumb** hangs 4 px past the track at hue 0 and 359; the track is 140 px against the grid's 136 px.

## Tests

8. Test strings in `crates/core/tests/it/{color,page_color,render}.rs` use raw newline and tab characters instead of
   `\n` and `\t`.
9. No read test for a lone invalid `color:: hue 999` line returning no color.
10. `parseHue` rejection cases to add: `hue 1000`, `hue -1`, a trailing or double space.
11. The 360-hue sweep prints one `console.info` line into the test output.

## Code tidy-ups

12. `crates/core/src/session/view.rs` spells `crate::color::PageColor` four times; one `use`.
13. `customColor.ts`: the chroma loop decrements a float; an assignment inside an argument (`cache.set(t, (… = …))`).
14. The preview's `font-size: 15px; line-height: 1.5` copies the body's font instead of inheriting it (`app.css`).
15. Lines over the docs' ~120-column wrap in `docs/spec.md` (§7.3 slider line, §7.4), `docs/format.md` and
    `docs/review.md`.
