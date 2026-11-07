# Custom page colors: design

Status: agreed with the owner on 2026-11-07. Builds on plan 1 (page colors,
`docs/superpowers/specs/2026-11-07-page-colors-design.md`, `docs/plans/2026-11-07-01-page-colors.md`), which is done.
Next step: plan 2 in `docs/plans/`.

## Intent

The 25 fixed colors are not always enough. The owner wants a page color of their own choosing, with the same promise
the fixed set keeps: in every theme the wash stays soft ("pastelly") and the text on it readable. A preview in the
picker shows at once how text, links and tags look on the chosen color in the current theme.

## Goals

- A page can get a custom color: a hue the user picks with a slider, besides the 25 fixed colors and "No color".
- Whatever hue is picked, every theme shows a soft wash on which text, links and tags stay readable.
- The picker shows a live preview of the wash with sample text, for the 25 fixed colors and for the custom hue.

## Non-goals

- Free choice of lightness or vividness. Only the hue is the user's (owner decision). A strength slider is backlog #72,
  for if the hue slider proves too limited.
- A free RGB/hex color picker.
- A warning when a custom hue looks almost like another page's color (could come later).
- Changing the 25 fixed colors, their names, their shades or how they are written.

## Anti-goals

- Any hue that makes text, a link or a tag hard to read on its wash in any theme.
- A custom color that looks out of place in a theme (bright saturated washes in Dark).
- Changing anything in a notes file beyond the one `color::` line (spec §2).

## Decided by the owner

- **Controls:** a hue slider only (around the color wheel). Lightness and vividness come from the theme, as for the
  25 fixed colors.
- **Preview:** a preview line in the picker (sample text with a link and a tag on the wash, in the current theme). It
  updates when the user points at or arrows onto any of the 25 cells, and while the hue slider moves.
- **In the file:** `color:: hue <h>`, with `h` a whole number from 0 to 359, for example `color:: hue 212`. The 25 fixed
  colors stay names (`color:: red`).

## How a custom hue becomes a shade (the guarantee)

- The shade per theme is made with the same rule that produced the 25 fixed shades (plan 1, "The 25 colors", "Shades
  per theme"): each theme has a base lightness `L`, a chroma factor `cs` and an offset factor `ds`; a custom hue uses a
  fixed chroma and lightness offset chosen by the builder so that it sits among the fixed colors, then is mapped into
  sRGB by lowering chroma.
- The wash is that shade at the theme's wash strength over the theme's background (28 % Light and Taupe, 30 % Teal,
  34 % Dark, Violet, Graphite and System dark).
- Readability is checked on the blended wash with the thresholds plan 1's tests use: text at least 4.5:1, links and
  tags at least 3:1. If a hue fails in a theme, the wash strength (and if needed the chroma) is lowered step by step
  until it passes. The text colors never change.
- A test sweeps all 360 hues in all six themes and the System dark block and asserts the thresholds, so the guarantee
  is checked, not assumed.

## Calls made in the conversation (Claude's, accepted by the owner)

- Moving the slider only previews; the color is saved when the slider is released, or with Enter on it. One drag is one
  undo step.
- The swatch shows a custom color like a fixed one (filled), and the picker marks the custom part as current when the
  page has a custom hue.
- `color:: hue 999`, `color:: hue x` and other invalid values count as no color, like an unknown name today, and stay
  visible as text until a color is picked.
- Everything else behaves as for the fixed colors: the journal washes and merging (by page), the right-click "Color…"
  menu (it opens the same picker, so it gets the custom part and the preview too), undo/redo, tag-only pages.

## Calls made after the builder check (Claude's; the owner can overrule)

- A custom color is always colorful (fixed chroma); greys stay with the fixed `grey` and `slate`.
- While the picker is open, the saved value stays marked (the cell, or the custom part with the slider at the saved
  hue); pointing at or arrowing onto other cells moves only the preview.
- The readability stepping runs in the shipped function at runtime (no precomputed table), and the 360-hue sweep test
  asserts on that function's output in every theme.
- No bar beyond the contrast thresholds for how pale a custom wash may get; the sweep test reports the lowest strength
  it needed per theme so a re-tune can see it.
- Two pages with almost the same hue are two different colors; washes merge by page anyway, so nothing else changes.
- Picking a fixed color after a custom one replaces the line with the name, and the other way round (one `color::`
  line, as in plan 1).
- Older Breccia versions read `color:: hue 212` as an unknown value: no color, the line kept as text. No migration.

## Constraints

- Colors still come from `app/src/styles/tokens.css` wherever they are fixed. Custom shades are computed at runtime by
  one tested function in `app/src/lib/` and applied as a CSS variable; the "no colour literals outside tokens.css" test
  gets a stated, narrow exception for that function's output, and the theme parameters it uses are read from tokens,
  not duplicated as literals.
- The core reads and writes `color:: hue <h>` (format version 7 in `docs/format.md`, with checked examples), and
  `canonical_color`-style normalization writes `hue <h>` in lower case with no leading zeros.
- `docs/spec.md`, `docs/compatibility.md` and `docs/review.md` items follow, as in plan 1.
- e2e: pick a custom hue, check the bytes on disk, the wash in the journal, undo; the preview updates.

## Left to the builder

- The custom chroma and lightness offset, and whether a small color library (culori, Color.js) or a few lines of OKLCH
  math is used; no new dependency if the math stays small.
- The slider's look and keys (arrows step the hue, Page Up/Down larger steps, Home/End), its accessible name, and the
  preview's sample text.
- How the frontend gets the theme parameters (tokens) and recomputes on a theme switch.
- How the core passes a custom color to the frontend (e.g. `BlockView.color` = `"hue 212"`).
