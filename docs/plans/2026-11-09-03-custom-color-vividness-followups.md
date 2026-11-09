# Plan 3 (custom color vividness): follow-ups

Work the plan deferred. Open items are taken by later plans or moved to `docs/backlog.md`. Found by the per-task
reviews and the final whole-plan review (2026-11-09). Backlog #72 is done by this plan.

## Code

1. **The readability sweep's gamut check uses the wrong lightness.** `app/src/lib/theme.test.ts` (the sweep's
   oracle) uses `t.l`, while `customShade` uses `t.l + CUSTOM_DL * t.ds`. They agree only because `CUSTOM_DL = 0`.
   Import `CUSTOM_DL` and use the same lightness.
2. **`vividTrack` steps by `5 * VIVID_STEP`.** The track's 7 stops (50, 75 … 200) are a design choice of their own,
   not a key step. Use a local `TRACK_STEP = 25` (or `VIVID_PAGE`) in `app/src/lib/customColor.ts`.
3. **The `limited` doc comment is unclear** (`customColor.ts`). Suggested: "True when the readability guard gave
   less strength or chroma than the vividness asked for; the sRGB gamut alone never counts."
4. **Nothing checks that the core and the frontend use the same vividness range.** `crates/core/src/color.rs`
   (`MIN_VIVID`, `MAX_VIVID`, `DEFAULT_VIVID`) and `app/src/lib/pageColors.ts` mirror them by hand. Add a script
   test like `app/scripts/page-colors.test.mjs` that compares them.
5. **`color.rs` casts with `v as u8`.** This is safe because the value is bounded to 200 just above, but
   `u8::try_from` would say so in the code.
6. **The sweep's timeout is 60 s** (`theme.test.ts`); the sweep takes about 2 s alone and longer in the full run.
   15 to 20 s would still catch a slowdown.
7. **Long module doc line** in `crates/core/tests/it/format_doc.rs` (cosmetic; `cargo fmt` does not wrap comments).

## Tests

8. **An extra `pickerTab` case** (back from the vividness slider when the grid's position is `NO_COLOR`). The cases
   that matter are covered by unit tests and e2e step 119.
9. **e2e step 120 resets the Light theme only at its end**, and steps 119 and 120 leave their page (`Vivid 119`)
   and day journal behind, as earlier steps do. A failing step ends the run anyway.

## Behaviour (seen, not changed)

10. **Pointing at the greyed vividness slider** leaves the preview on what it showed before (`pointer-events: none`
    hands the event to the wrapper). Harmless.
11. **`recolor` replaces the first `color::` line even when its value is invalid** (for example `color:: hue 999`
    above a valid line). This is plan 2 behaviour, documented in `docs/format.md` §8; this plan did not change it.

## History

- Task 2's first commit (`0c250bc`) left the format check red; the next commit (`0ba34d6`) fixed it. Nothing to do.
