# Plan 8 (Theme wheel and four more themes): follow-ups

Work the plan deferred. Open items are taken by later plans or moved to `docs/backlog.md`. Found by the pre-flight
scan, the per-task reviews and the final whole-plan review (2026-11-11). The plan closed backlog #76.

## Owner checks

1. **Review items 80 to 86** (`docs/review.md`): the wheel (80), Vampire, Fjord, Ember and Parchment by eye (81 to 84),
   the list of eleven choices (85), and Teal (86). Teal's edited block and inline code now have a slightly fainter tint
   (1.07 against the background, as in Light; it was 1.19) so that selected text shows while editing. Ask the owner
   whether that looks right; the cost if not is one hex value (`--edit` in Teal, `#02303c`, was `#063845`).

## Teal

2. **`--hover` against `--edit`** is about 1.03 in Teal (the unfocused selection in the edited block); it was so
   before this plan.
3. **The jump highlight and the selected row** stand out less from the background in Teal (1.24 and 1.15). A lighter
   Teal text would give room, at the cost of its look and its custom-color pins.

## Tests

4. **No test pins `--accent` on `--select`** (search hits); the lowest value is 3.15. `['--accent', '--select', 3]`
   could go into `PAIRS` in `themeSurfaces.test.ts`.
5. **A scaled wheel delta that rounds to 0** resets a partial count (`themeWheel.ts`, the same as zoom).
6. **No `stepTheme` test with an unknown theme id** (types prevent it).
7. **No test that `preventDefault` stops the page from scrolling** (the status bar is not in a scroll container).
8. **A real wheel cannot reach the button while the menu is open,** so only a script event tests the guard (step 132).
9. **The wheel uses only `deltaY` in pixels** (WebView2 always sends pixels; line or page `deltaMode` is not handled).

## Open questions

10. **Gruvbox has no LICENSE file;** the README says MIT/X11, and the values are our own.
11. **The theme menu has eleven entries:** whether it should group light and dark later; whether the Settings >
    Appearance previews want a second row label.

## History

- Intermediate per-theme commits (Task 2) were e2e-red until the lists landed in a later commit; history is not
  rewritten.
- The final review found no critical issue; its one important finding (Teal selection in an edited block, 1.04) was
  fixed by a test-first change of Teal's `--edit`.
