# Custom page colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Besides the 25 fixed colors, a page can get a custom color, a hue picked with a slider, and the page color
picker shows a live preview of text, a link and a tag on the color under the pointer or the keyboard.

**Architecture:** The core reads and writes `color:: hue <h>` next to the color names (a `PageColor` type in
`color.rs` that serializes as `"red"` or `"hue 212"`, so every wire field keeps its string form). The frontend turns a
hue into a shade per theme with one tested function (`app/src/lib/customColor.ts`) that applies plan 1's shade rule
with theme parameters read from `tokens.css`, blends it over the theme's background and steps the strength down until
text, links and tags stay readable. A small rune module re-reads the tokens on a theme switch; rows, the swatch, the
preview and the slider take their custom colors from it. The picker (`PageColorGrid`, shared by the swatch and the
journal's link menu) gets a preview box and a hue slider.

**Tech Stack:** Rust (breccia-core), Svelte 5 + TypeScript, bits-ui Popover, Vitest, Playwright e2e over WebView2. No
new dependency (the OKLCH math is about 30 lines).

**Spec:** `docs/superpowers/specs/2026-11-07-custom-page-colors-design.md` (binding). Context and conventions: plan 1,
`docs/plans/2026-11-07-01-page-colors.md` (its "The 25 colors" section is the shade rule this plan reuses),
`docs/superpowers/specs/2026-11-07-page-colors-design.md`, `docs/spec.md`, `docs/format.md`, `CLAUDE.md`.

## Global Constraints

- Only the one `color::` line changes in a notes file (spec §2 anti-goal); files Breccia did not change stay
  byte-identical; a save writes LF as every save does (format §3).
- In the file: `color:: hue <h>`, `h` a whole number 0 to 359. Breccia writes `hue <h>` in lower case, one space, no
  leading zeros. Names stay names (`color:: red`). Invalid values (`hue 999`, `hue x`) are no color and stay visible
  as text. Format version 7.
- Only the hue is the user's: chroma and lightness come from the theme (design "Non-goals"; backlog #72 is the
  strength slider, not in this plan).
- Readability on the blended wash, in every theme and the System dark block: text ≥ 4.5:1, links and tags ≥ 3:1. The
  text colours never change.
- No colour literals or `color-mix` outside `app/src/styles/tokens.css`. The one stated exception is
  `app/src/lib/customColor.ts` (see Task 4); theme values are never duplicated there, they are read from tokens.
- Moving the slider only previews; release, or Enter on the slider, saves. One drag is one undo step.
- Tauri event names stay `noun:verb`; new struct fields go at the end of their struct (serde `preserve_order`).
- Commits: conventional subjects; `feat`/`fix` subjects are user-facing changelog lines (no code names, paths, task
  numbers), at most about 90 characters, no trailing period. Internal work is `test`, `refactor`, `docs`, `chore`. No
  attribution lines. Commit on `main` and push after each commit.
- Every test must fail first: capture the RED run before implementing.
- `App.svelte` has no unit tests: logic with tests goes in `app/src/lib/`.
- e2e steps assert the bytes on disk where a file changes, and wait for states instead of sleeping.

## Review Focus

- A hand-written value such as `color:: HUE 007`, `color:: hue 360`, `color:: hue 12.5` or `color:: hue` must read as
  hue 7, no color, no color, no color; the invalid ones stay visible in the page view; pinned in Task 1
  (`parse_color_reads_names_and_hues`, `preamble_html_shows_an_invalid_hue`).
- A theme switch (or the Windows mode changing under System) while the journal shows custom washes or the picker is
  open: washes, swatch, preview and slider follow without a reload; pinned in Task 4 (`readThemeTokens` per theme
  block) and Task 7 (step 118 switches the theme and waits for the row's background to change and come back).
- A drag released outside the slider, or moved past either end: one save at the clamped hue (0 or 359), one undo
  step; pinned in Task 3 (`hueAt` clamps) and Task 7 (step 117 drags past both ends, then one `Ctrl Z`).
- Arrowing the slider and then leaving it with Tab or Esc writes nothing; pinned in Task 7 (step 117 checks the bytes
  before Enter) and Task 6 (only release and Enter call `onpick`).
- Picking the hue the page already has records no undo step and writes nothing; switching between a name and a hue
  replaces the one line; pinned in Task 1 (`set_color_with_a_hue`, `a_pick_of_the_saved_hue_records_no_step`) and
  Task 7 (step 118 replaces a hue with `violet`).

---

## The custom shade (decided here, binding for all tasks)

**Constants:** custom chroma `CUSTOM_CHROMA = 0.13`, lightness offset `CUSTOM_DL = 0`. The fixed colorful names have
chroma 0.10 to 0.17 and offsets −0.06 to +0.10 (measured from the Light tokens), so a custom hue sits in their middle.

**Theme parameters** (plan 1, "Shades per theme"), new tokens in every theme block of `tokens.css`, numbers without
unit, `--pc-l`, `--pc-cs`, `--pc-ds`:

| Theme | `--pc-l` | `--pc-cs` | `--pc-ds` |
|---|---|---|---|
| Light | `0.66` | `1` | `1` |
| Taupe | `0.71` | `0.8` | `0.8` |
| Dark, System dark | `0.66` | `0.9` | `0.6` |
| Violet | `0.68` | `0.9` | `0.6` |
| Graphite | `0.62` | `0.75` | `0.6` |
| Teal | `0.43` | `0.9` | `0.4` |

Checked while writing this plan: with these parameters the rule reproduces all 25 fixed shades of every theme from
the Light shades within one step (1/255) per channel, and the 360-hue sweep below passes in every theme without any
stepping (lowest margins: Teal text 4.65:1, Taupe tag 3.22:1). The stepping is the safety net the design asks for.

**Algorithm** of `customShade(hue, t)` (Task 4):

1. Target: `L = t.l + CUSTOM_DL·t.ds`, `C = CUSTOM_CHROMA·t.cs`, `h = hue`.
2. Gamut: OKLCH → OKLab (`a = C·cos h`, `b = C·sin h`) → linear sRGB (Björn Ottosson's matrices, the inverse of the
   `oklab` helper in `theme.test.ts`). While any channel is outside `[−0.0001, 1.0001]`, lower `C` by `0.002` (not
   below 0). `shade` = the result clamped to `[0, 1]`, gamma-encoded, rounded to `#rrggbb`.
3. Wash: `over(shade, t.bg, p/100)`, a straight sRGB blend per channel rounded to `#rrggbb` (the same blend
   `theme.test.ts` uses). Start with `p = round(t.wash·100)`.
4. Passes when `contrast(t.text, wash) ≥ 4.5`, `contrast(t.link, wash) ≥ 3`, `contrast(t.tag, wash) ≥ 3` (WCAG
   relative luminance).
5. Stepping: while it fails and `p > ceil(P/2)` (`P` the theme's strength), `p -= 1`. If it still fails at
   `ceil(P/2)`, lower the shade's chroma in steps of `0.01` (re-run step 2's conversion at each, keep `p`) until it
   passes or reaches 0. If nothing passes, return the background itself as the wash with strength 0.
6. Return `{ shade, wash, strength: p / 100, chroma }`, `chroma` being the one used.

Expected values (Task 4 pins them): hue 212 in Light → shade `#08a4bb` (chroma 0.114 after gamut), wash `#b7e2e7`;
hue 0 in Light → `#d16e8f`, wash `#efd3db`; hue 212 in Teal → `#005a68`, wash `#003945`; hue 100 in Dark → `#a39332`,
wash `#494424`. If one differs by one in a channel, check the code against steps 1 to 3 before changing the number.

**Wire value:** a custom color is the string `"hue <h>"` everywhere a color travels: `PageView.color`,
`BlockView.color`, `TargetView.color`, the `page.setColor` command's `color`, and `data-color` / `data-wash` in the
DOM. TypeScript keeps `color?: string`.

**Picker state model** (Tasks 3, 5, 6): picker indexes `0..24` are the cells, `NO_COLOR = 25`, `CUSTOM = 26` the hue
slider. `current = pickerStart(savedColor)` is what is marked (cell ring, "No color" pressed, or the slider's
`data-current`), and it changes only when the saved color changes. The preview shows `indexColor(hover ?? focused,
hue)`: `hover` is the index under the pointer (cleared on pointer leave of the picker and on any key), `focused` the
index that has the focus (`CUSTOM` while the slider has it), `hue` the slider's value (the saved hue, else
`DEFAULT_HUE = 200`).

---

### Task 1: `PageColor` in the core: read, write and send a hue (model: sonnet)

**Files:**
- Modify: `crates/core/src/color.rs`
- Modify: `crates/core/src/workspace/pages.rs` (`page_color`, `color_change`), `crates/core/src/workspace/names.rs`
  (the `colors` map update, line ~371), `crates/core/src/workspace/mod.rs` (`colors` field type),
  `crates/core/src/session/view.rs` (`PageView.color`, `TargetView.color`, `BlockView.color`, `PageView::of`)
- Test: `crates/core/tests/it/color.rs`, `crates/core/tests/it/render.rs`, `crates/core/tests/it/page_color.rs`

**Interfaces:**
- Produces (in `breccia_core::color`):
  - `#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)] pub enum PageColor { Named(&'static str), Hue(u16) }` with
    `Display` (`red`, `hue 212`) and a hand-written `Serialize` as that string.
  - `pub fn parse_color(value: &str) -> Option<PageColor>`: a name via `canonical_color`; else exactly two ASCII
    whitespace-separated words, the first `hue` ignoring ASCII case, the second only ASCII digits whose value
    (leading zeros allowed) is at most 359. `+5`, `-1`, `12.5`, `hue`, `hue212`, `hue 1 2`, `hue 360` are `None`.
  - `color_line(preamble) -> Option<(usize, PageColor)>` and `page_color(preamble) -> Option<PageColor>` (were
    `&'static str`), now via `parse_color`.
  - `recolor` keeps its signature (`Option<&str>`, written as given); callers pass `PageColor::to_string()`.
  - `pub fn own_color(page: &Page) -> Option<PageColor>`: `None` for a journal, else `page_color` of its preamble.
    Used by `Workspace::page_color` and `PageView::of` (plan 1 follow-up 14: the match was written twice).
  - `Workspace::page_color(&self, key) -> Option<PageColor>`; `Workspace::color_change(&self, key, color:
    Option<&str>)` parses with `parse_color` (`PageError::UnknownColor` otherwise) and passes the canonical text to
    `recolor`; the `colors` map holds `PageColor`.
  - `PageView.color`, `BlockView.color`, `TargetView.color`: `Option<PageColor>`, same places and serde attributes.
- Also: plan 1 follow-up 17, the `is_color_property` doc comment says what it returns, and `recolor` gets a one-line
  comment that `title_line` indexes match `split_inclusive` indexes.

- [ ] **Step 1: Write the failing tests**
  - `color.rs`: `parse_color_reads_names_and_hues`: `Red` → `Named("red")`; `hue 212`, `HUE 0212`, `Hue  7`
    (two spaces), `hue\t7` → `Hue(212)`, `Hue(212)`, `Hue(7)`, `Hue(7)`; `hue 0` → `Hue(0)`, `hue 359` →
    `Hue(359)`; `hue 360`, `hue 999`, `hue -1`, `hue +5`, `hue 12.5`, `hue`, `hue212`, `hue 1 2`, `hue x`,
    `hue 99999999999999999999` → `None`. `PageColor::Hue(7).to_string() == "hue 7"`,
    `serde_json::to_string(&PageColor::Hue(212)) == "\"hue 212\""`, `Named("red")` → `"\"red\""`.
  - `color.rs`: `page_color_reads_a_hue_line`: `page_color("color:: HUE 012\n") == Some(Hue(12))`;
    `page_color("color:: hue 999\ncolor:: hue 5\n") == Some(Hue(5))`; `color_line("title:: x\ncolor:: hue 40\n") ==
    Some((1, Hue(40)))`. Update plan 1's assertions to `Some(PageColor::Named("…"))`.
  - `color.rs`: `recolor_writes_and_replaces_a_hue`: `recolor("- a\n", Some("hue 212"), lf) == "color:: hue
    212\n- a\n"`; `recolor("color:: red\nx\n", Some("hue 9"), lf) == "color:: hue 9\nx\n"`; `recolor("color:: hue
    9\n", Some("teal"), lf) == "color:: teal\n"`; `recolor("color:: hue 999\n", None, lf) == ""`.
  - `render.rs`: `preamble_html_shows_an_invalid_hue`: `preamble_html("color:: hue 212\nnote\n")` has no `color::`;
    `preamble_html("color:: hue 360\n")` contains `hue 360`.
  - `page_color.rs` (session):
    - `set_color_with_a_hue`: `pages/Garden.md` = `"- a\n\t- b\n"`; `page.setColor garden "hue 212"` → file
      `"color:: hue 212\n- a\n\t- b\n"`, page view JSON has `"color":"hue 212"`; `"HUE 012"` → file starts with
      `color:: hue 12\n`; `"red"` → `color:: red\n`; `"hue 360"` and `"hue x"` → error code `unknownColor`, file
      unchanged.
    - `a_pick_of_the_saved_hue_records_no_step`: pick `hue 40`, pick `hue 40` again, one `history.undo` → file
      `"- a\n\t- b\n"`.
    - `journal_blocks_carry_a_hue`: with the Task-3 folder of plan 1's tests, `page.setColor hiring "hue 300"` →
      `out.changed` holds `2026-10-29` with `hiring/hue 300` on blocks 4, 7 and 10 (block JSON `"color":"hue 300"`);
      `page.setColor hiring "hue 301"` re-sends the day again with `hue 301`; the day's `targets` entry for `hiring`
      has `color` `hue 301`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cargo test -p breccia-core color:: render:: page_color::`
Expected: compile failure (`PageColor`, `parse_color` do not exist).

- [ ] **Step 3: Implement** the interfaces above. The session dispatch of `page.setColor` needs no change.

- [ ] **Step 4: Run all core tests**

Run: `cargo test -p breccia-core` and `cargo clippy --workspace -- -D warnings`
Expected: PASS (`format_doc::` still passes: the doc has no hue yet), no warnings.

- [ ] **Step 5: Commit**

```bash
git add crates/core
git commit -m "refactor(core): read and write a custom hue as a page color"
```

---

### Task 2: Format version 7 (model: sonnet)

**Files:**
- Modify: `docs/format.md` (title, §1 notation, §8 "Page color", §13, §14)
- Modify: `crates/core/tests/it/format_doc.rs`

**Interfaces:**
- Consumes: `parse_color`, `PageColor` (Task 1).

- [ ] **Step 1: Write the failing format-doc checks** in `format_doc.rs`:
  - `describe` prints `color "{c}"` with `c = page_color(pre)` formatted by `Display` (so `color "hue 212"`).
  - `markdown after-<x>` accepts `x` = `none`, a page color name, or `hue-<h>` with `parse_color(&format!("hue {h}"))`
    giving `Hue(h)` and `h` written canonically (`after-hue-07` is unknown). `format_doc_recolor_examples` maps
    `hue-<h>` to `recolor(pre, Some("hue <h>"), …)`.
  - `format_doc_recolor_examples` wants at least 6 pairs and at least 2 with `after-hue-…`.
  - `format_doc_fence_info_strings_are_known`'s sample also flags `markdown after-hue-360` and `markdown
    after-hue-07`.
  - Update the module doc comment (the `after-<name>` line names `hue-<h>`).

Run: `cargo test -p breccia-core format_doc::`
Expected: FAIL (`only 4 recolor pairs`; the sample is not flagged).

- [ ] **Step 2: Write the `docs/format.md` text**
  - Title `version 7`; §1 notation: `color "…"`: the page color the `color::` line gives, a name or `hue <h>`.
  - §8 **Page color**: the value is one of the names below or a custom hue `hue <h>`: the word `hue` (case ignored),
    whitespace, and a whole number from 0 to 359 (leading zeros allowed), an angle on the color wheel. Breccia writes
    `hue <h>` in lower case with one space and no leading zeros. Other values (`hue 360`, `hue 12.5`, `hue x`) are no
    color and are kept as written. How a hue becomes a color in each theme is the app's business (spec §7.3, §7.10).
    Rewrap the paragraph to the doc's ~120 columns (plan 1 follow-up 18 for these lines).
  - One more reading example and two before/after pairs, after the existing ones:

````text
```markdown example
Color:: HUE 0212
- a
```
```text reads
preamble "Color:: HUE 0212\n"
color "hue 212"
0 - "a"
```
before "- a\n"                         → after-hue-212 "color:: hue 212\n- a\n"
before "color:: red\nnotes\n- a\n"     → after-hue-7   "color:: hue 7\nnotes\n- a\n"
before "title:: x\ncolor:: hue 360\n- a\n" → after-teal "title:: x\ncolor:: teal\n- a\n"
````

  (The last three lines are shorthand for `markdown before` / `markdown after-…` fence pairs.)
  - §13: "Keep a page's `color::` line; write one only with a name or a `hue <h>` from section 8."
  - §14: **Version 7**: a `color::` line may hold a custom hue, `hue <h>` (section 8). Before, such a value was no
    color and kept as text; older Breccia versions still read it that way.

- [ ] **Step 3: Run the checks**

Run: `cargo test -p breccia-core format_doc::` and `cd app && npx vitest run scripts/docs.test.mjs scripts/page-colors.test.mjs`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/format.md crates/core/tests/it/format_doc.rs
git commit -m "docs: format version 7, a custom hue as a page color"
```

---

### Task 3: Picker logic for the custom part (model: sonnet)

**Files:**
- Modify: `app/src/lib/pageColors.ts`, `app/src/lib/pageColors.test.ts`, `app/src/lib/types.ts` (doc comments on the
  three `color` fields: a name or `hue <h>`)

**Interfaces:**
- Produces (in `pageColors.ts`):
  - `CUSTOM = 26`, `DEFAULT_HUE = 200`.
  - `parseHue(color: string | null): number | null`: `hue <h>` exactly as the core writes it (`/^hue
    (0|[1-9]\d{0,2})$/`, `h ≤ 359`), else null.
  - `hueColor(h: number): string` → `` `hue ${h}` ``.
  - `colorLabel`: a hue gives `Custom (hue 212)`.
  - `pickerStart`: a hue gives `CUSTOM`.
  - `colorPickerKey`: from `NO_COLOR`, `ArrowDown` → `CUSTOM` (was `NO_COLOR`); all else unchanged. It is not called
    on the slider.
  - `hueSliderKey(e: KeyInput, hue: number): number | 'save' | 'leave' | null`: `ArrowLeft`/`ArrowDown` −1,
    `ArrowRight`/`ArrowUp` +1, `PageDown` −10, `PageUp` +10 (all clamped to 0..359), `Home` 0, `End` 359, `Enter`
    `'save'`, `Tab` with or without Shift `'leave'`; any Ctrl, Alt or Meta, or Shift on another key, → null; other
    keys null.
  - `hueAt(x: number, width: number): number`: `round(x / width · 359)` clamped to 0..359; `width ≤ 0` → 0.
  - `indexColor(i: number, hue: number): string | null`: cells → name, `NO_COLOR` → null, `CUSTOM` →
    `hueColor(hue)`.
- Also plan 1 follow-up 18 for this file: wrap the ~120-character `washed` line in `washRows`.

- [ ] **Step 1: Write the failing tests** in `pageColors.test.ts`:
  - `hues`: `parseHue('hue 212') === 212`, `parseHue('hue 0') === 0`, `parseHue('hue 359') === 359`; `'hue 360'`,
    `'hue 07'`, `'HUE 7'`, `'red'`, `null` → null; `hueColor(7) === 'hue 7'`; `colorLabel('hue 212') === 'Custom
    (hue 212)'`; `pickerStart('hue 5') === CUSTOM`; `indexColor(1, 9) === 'red'`, `indexColor(NO_COLOR, 9) ===
    null`, `indexColor(CUSTOM, 9) === 'hue 9'`.
  - `picker keys`: change the plan-1 case "from 25 `ArrowDown` → 25" to `→ CUSTOM`; the rest stays.
  - `hue slider keys`: from 100: `ArrowRight`/`ArrowUp` → 101, `ArrowLeft`/`ArrowDown` → 99, `PageUp` → 110,
    `PageDown` → 90, `Home` → 0, `End` → 359, `Enter` → `'save'`, `Tab` and Shift+`Tab` → `'leave'`; from 355
    `PageUp` → 359, from 3 `PageDown` → 0, from 0 `ArrowLeft` → 0, from 359 `ArrowRight` → 359; `ArrowRight` with
    `ctrl` → null, with `shift` → null; `'a'` → null; `' '` → null.
  - `hueAt`: `(0, 100) === 0`, `(50, 100) === 180`, `(100, 100) === 359`, `(-20, 100) === 0`, `(140, 100) === 359`,
    `(10, 0) === 0`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd app && npx vitest run src/lib/pageColors.test.ts`
Expected: FAIL (`CUSTOM` not exported).

- [ ] **Step 3: Implement** the interfaces above.

- [ ] **Step 4: Run the frontend tests and the type check**

Run: `cd app && npx vitest run && npm run check`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib
git commit -m "refactor(app): picker keys and labels for a custom hue"
```

---

### Task 4: The custom shade function, its theme parameters and the 360-hue sweep (model: sonnet)

**Files:**
- Create: `app/src/lib/customColor.ts`
- Modify: `app/src/styles/tokens.css` (three tokens per theme block, the table above)
- Modify: `app/src/lib/theme.test.ts`

**Interfaces:**
- Consumes: `PAGE_COLORS`, `parseHue` (Task 3).
- Produces (in `customColor.ts`):
  - `interface ThemeTokens { bg: string; text: string; link: string; tag: string; wash: number; l: number; cs:
    number; ds: number }` (colours `#rrggbb`; `wash` 0..1 from `--pc-wash`).
  - `CUSTOM_CHROMA = 0.13`, `CUSTOM_DL = 0`.
  - `readThemeTokens(get: (name: string) => string): ThemeTokens`: reads `--bg`, `--text`, `--link`, `--tag`,
    `--pc-wash` (`'28%'` → 0.28), `--pc-l`, `--pc-cs`, `--pc-ds`, values trimmed; throws an `Error` naming the token
    when one is missing or malformed.
  - `customShade(hue: number, t: ThemeTokens): { shade: string; wash: string; strength: number; chroma: number }`:
    the algorithm in "The custom shade". Memoized per `ThemeTokens` object (a `WeakMap<ThemeTokens, Map<number,
    …>>`), since rows ask for it on every render.
  - `ruleShade(l: number, c: number, h: number): { hex: string; chroma: number }`: steps 1 to 2 for given OKLCH
    values (used by `customShade` and by the test that checks the parameters).
  - `washValue(color: string, t: ThemeTokens | null): string | undefined`: a name → `var(--pc-<name>-wash)`; a hue →
    `customShade(h, t).wash` (undefined while `t` is null); anything else undefined.
  - `swatchValue(color: string, t: ThemeTokens | null): string | undefined`: a name → `var(--pc-<name>)`; a hue →
    `customShade(h, t).shade`.
  - `hueTrack(t: ThemeTokens): string`: `linear-gradient(to right, …)` of the shades at hues 0, 30, …, 330, 359 (13
    stops), for the slider's track.
- The exception: `theme.test.ts`'s `no colour literals outside tokens` skips the function-notation pattern (`funcs`)
  for exactly `/src/lib/customColor.ts` (its comments name `oklch(` and it builds `linear-gradient(`); the hex and
  named-colour patterns still apply to it, so no theme colour can be copied there. A comment above the exception
  says why: the file computes custom shades at runtime from tokens and its output is a colour by design.

- [ ] **Step 1: Write the failing tests** in `theme.test.ts` (reuse its `block`, `contrast`, `over`, `oklab`,
  `THEME_SELECTORS`; `tokensOf(s) = readThemeTokens((n) => block(s)[n] ?? '')`):
  - `theme blocks carry the shade parameters`: every selector has `--pc-l`, `--pc-cs`, `--pc-ds` as numbers equal
    to the table above (Light, Taupe, Dark, Violet, Graphite, Teal, System dark = Dark).
  - `the shade rule reproduces the 25 fixed shades`: for each name, `[L, c, h]` = OKLCH of its Light token (add an
    `oklch(hex)` helper from `oklab`), `dL = L − 0.66`; in every theme `ruleShade(t.l + dL·t.ds, c·t.cs, h).hex`
    differs from the theme's `--pc-<name>` by at most 1 in each channel. (This proves the tokens hold the parameters
    that made plan 1's table.)
  - `custom shades: pinned values`: the four expected values in "The custom shade" (shade and wash).
  - `every custom hue is readable in every theme`: for each selector and each hue 0..359, `r = customShade(h, t)`:
    `r.wash === over(r.shade, t.bg, r.strength)` unless `r.strength === 0` (then `r.wash === t.bg`);
    `contrast(t.text, r.wash) ≥ 4.5`, `contrast(t.link, r.wash) ≥ 3`, `contrast(t.tag, r.wash) ≥ 3`; `r.strength ≤
    t.wash`; `r.shade` is `#rrggbb`. Afterwards `console.info` one line per theme with the lowest strength it needed
    (the design's report for re-tuning; there is no bar on it).
  - `custom shades step down only when needed`: with Light's tokens but `bg: '#ffffff'` and `text: '#686868'`
    (5.57:1 on white, too dark on the 28 % wash), `customShade(212, …)` gives `strength 0.2` (computed: the first
    strength from 28 % down at which `#686868` reaches 4.5:1 over that shade) and the same `chroma` as without
    stepping; with `text: '#767676'` (4.54:1 on white, failing on any wash) it gives `strength 0` and `wash
    '#ffffff'`; with `text: '#787878'` (4.47:1, failing even on the bare background) also `strength 0`; with the real
    Light tokens `strength === 0.28` and `chroma` equals `ruleShade(0.66, 0.13, 212).chroma`.
  - `readThemeTokens`: reads Light (`bg '#fbfaf8'`, `wash 0.28`, `l 0.66`); throws when `--pc-l` is `''`.
  - `washValue and swatchValue`: `washValue('red', null) === 'var(--pc-red-wash)'`, `swatchValue('red', null) ===
    'var(--pc-red)'`, `washValue('hue 212', null) === undefined`, `washValue('hue 212', light) === '#b7e2e7'`,
    `washValue('banana', light) === undefined`; `hueTrack(light)` starts with `linear-gradient(to right, ` and has 13
    `#` stops.
  - The literal scan: add the exception, and a check that it is narrow: the scan's file list includes
    `/src/lib/customColor.ts` (it is still scanned for hex and named colours).

- [ ] **Step 2: Run them to verify they fail**

Run: `cd app && npx vitest run src/lib/theme.test.ts`
Expected: FAIL (module `./customColor` not found).

- [ ] **Step 3: Implement** `customColor.ts` and add the tokens (each theme block, after `--pc-wash`; the System
  dark block equal to Dark, as `every theme defines every token` demands).

- [ ] **Step 4: Run them to verify they pass**

Run: `cd app && npx vitest run && npm run check`
Expected: PASS, including `every theme defines every token` and `no colour literals outside tokens`; the sweep's
info lines show 28/34/34/34/28/30/34 % (no stepping today).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/customColor.ts app/src/lib/theme.test.ts app/src/styles/tokens.css
git commit -m "chore(app): custom page color shades computed per theme, checked for every hue"
```

---

### Task 5: Theme tokens at runtime, custom washes and the preview (model: opus)

**Files:**
- Create: `app/src/lib/themeTokens.svelte.ts`
- Modify: `app/src/App.svelte` (start the watcher in the existing `onMount`, line ~1362)
- Modify: `app/src/components/BlockRow.svelte` (`style:--wash`), `app/src/components/PageColorPicker.svelte`
  (swatch fill, popover name), `app/src/components/PageColorGrid.svelte` (preview), `app/src/components/LinkColorMenu.svelte`
  (popover name, fresh color)
- Modify: `app/src/styles/app.css` (preview rules next to `.pc-none`)

**Interfaces:**
- Consumes: `readThemeTokens`, `washValue`, `swatchValue` (Task 4); `indexColor`, `pickerStart`, `NO_COLOR`,
  `colorLabel` (Task 3).
- Produces:
  - `themeTokens.svelte.ts`: `export const themeTokens: { current: ThemeTokens | null }` (`$state`) and
    `watchThemeTokens(root: HTMLElement): () => void`: reads `readThemeTokens((n) =>
    getComputedStyle(root).getPropertyValue(n))` now, again on a `data-theme` attribute change (`MutationObserver`,
    as `NetworkView.svelte` does) and on a `prefers-color-scheme` change; a new object each time (the memo key);
    returns the disconnect.
  - `BlockRow`: `style:--wash={wash ? washValue(wash.color, themeTokens.current) : undefined}`; `data-wash` stays the
    wire value (`hue 212`).
  - `PageColorPicker`: trigger `style` background from `swatchValue`; `data-color` the wire value; `aria-label`
    `Page color: Custom (hue 212)` through `colorLabel`. Popover content `aria-label="Page color"` (plan 1 follow-up
    7).
  - `LinkColorMenu`: popover `aria-label={`Color of ${picking.name}`}` (follow-up 7); the grid's `color` is the
    current entry of `targets` with `picking.key` (falls back to `picking.color`), so the marking follows a save
    while the picker stays open (needed by Task 6).
  - `PageColorGrid`: a preview box below "No color": `data-testid="page-color-preview"`, `data-preview` = the
    previewed wire value (`''` for no color), background `var(--bg)`; inside it a layer with background
    `washValue(preview, themeTokens.current)` (none for no color) holding the sample line: `Notes with ` + a span
    `a link` in `var(--link)` + ` and ` + a span `#tag` in `var(--tag)`, in the editor's font size. `hover` and the
    focused index as in "Picker state model": `pointerenter` on a cell or "No color" sets `hover`, `pointerleave` of
    the picker and any keydown clear it.

- [ ] **Step 1: Wire it** as above. `themeTokens.current` is null only before mount; every consumer handles null
  (fixed colors do not need it).

- [ ] **Step 2: Check by running the app**

Run: `just test`, `just lint`, then `just dev`. In the demo folder write `color:: hue 212` into a page by hand and
link it first in a journal block.
Expected: tests and lint pass; the block shows a soft cyan-blue wash like the fixed ones, the page's swatch is filled;
switching themes in Settings changes the wash and the swatch at once (also System with the Windows mode switched);
in the picker the preview follows the pointer over the cells and the arrow keys, shows the saved color when the
pointer leaves, and shows plain background for "No color"; the screen reader name of the popover is "Page color".

- [ ] **Step 3: Commit**

```bash
git add app/src
git commit -m "feat(app): Page colors: the color picker previews text, links and tags on each color"
```

---

### Task 6: The hue slider in the picker (model: opus)

**Files:**
- Modify: `app/src/components/PageColorGrid.svelte`, `app/src/styles/app.css`

**Interfaces:**
- Consumes: `CUSTOM`, `DEFAULT_HUE`, `parseHue`, `hueColor`, `hueSliderKey`, `hueAt`, `colorPickerKey` (Task 3);
  `customShade`, `hueTrack` (Task 4); `themeTokens` and the preview (Task 5).
- Produces: below "No color", above the preview, a row `Custom` (label) plus the slider:
  `role="slider"`, `data-testid="page-color-hue"`, `aria-label="Custom hue"`, `aria-valuemin="0"`,
  `aria-valuemax="359"`, `aria-valuenow={hue}`, `aria-valuetext={`Hue ${hue}`}`, `tabindex="0"`, `data-current` when
  `current === CUSTOM`, `data-index={CUSTOM}`; track as wide as the grid, background `hueTrack(tokens)`; a thumb at
  `hue / 359` of the width filled with `customShade(hue, tokens).shade`. The marked look matches a marked cell (ring in
  `var(--text)`).

Behaviour (the e2e steps rely on it):
- Focus: two tab stops, the grid's roving stop and the slider. `Tab`/`Shift Tab` (`'leave'`) and `ArrowDown` from "No
  color" move between them; the focus starts on the slider when the saved color is a hue.
- Keys on the slider through `hueSliderKey`: a number sets `hue` (preview follows, nothing saved); `'save'` calls
  `onpick(hueColor(hue))` when that differs from `color`, then `ondone` (closes, like Enter on a cell); Esc closes
  without saving, as today.
- Pointer: `pointerdown` on the track captures the pointer, focuses the slider and sets `hue = hueAt(x, width)`;
  `pointermove` while captured updates it; `pointerup` saves once (`onpick` when it differs from `color`) and keeps
  the picker open, so a second drag can follow; each release is its own undo step; `pointercancel` saves nothing.
- `hue` starts at `parseHue(color) ?? DEFAULT_HUE` and follows a new saved hue.
- Keys stay inside the picker as today (`stopPropagation`); `Tab` is no longer swallowed but moves as above.

- [ ] **Step 1: Build the slider** as above.
- [ ] **Step 2: Check by running the app**

Run: `just test`, `just lint`, then `just dev`.
Expected: on a page with no color, ArrowDown from "No color" reaches the slider; arrows, Page Up/Down, Home and End
move the thumb and the preview with no file write; Enter writes `color:: hue <h>` and closes; a drag previews while
moving and writes once on release, the picker stays open and the slider is marked; `Ctrl Z` on the swatch after
closing takes back one whole drag; picking a cell after a hue replaces the line with the name; the right-click
"Color…" picker in the journal has the same slider; in Teal and Dark the track and washes stay muted.

- [ ] **Step 3: Commit**

```bash
git add app/src
git commit -m "feat(app): Page colors: pick any hue with a slider, besides the 25 fixed colors"
```

---

### Task 7: End-to-end steps (model: sonnet)

**Files:**
- Modify: `app/e2e/smoke.mjs` (steps 117 and 118, after step 116 and before step 45, in the same block that defines
  `swatch`, `picker`, `option`, `bgProbe`, `bgOf`, `washesOf`, `rowsWith`, `showDay`)
- Modify: `docs/STATUS.md` (Test baseline)

**Interfaces:**
- Consumes: the test ids and attributes of Tasks 5 and 6 (`page-color-preview` / `data-preview`,
  `page-color-hue` / `aria-valuenow` / `data-current`), plan 1's helpers.

- [ ] **Step 1: Write the steps**
  - **117** custom hue: write `pages/Hue 117.md` = `"- custom\n"`, open it from the sidebar, click the swatch.
    Preview: `data-preview` is `''`; hover `option('red')` → `data-preview="red"` and the preview's wash layer
    background equals `bgProbe('var(--pc-red-wash)')`; move the mouse off the picker → `data-preview` is `''` again.
    Keyboard: focus is on "No color"; `ArrowDown` → the focused test id is `page-color-hue` and `data-preview="hue
    200"`; `Home`, `PageUp` × 21, `ArrowRight` × 2 → `aria-valuenow="212"`, `data-preview="hue 212"`, and the file is
    still `"- custom\n"` (read it directly after two animation frames: nothing is saved yet); `Enter` → picker closes;
    `expectFile('117 Enter on the slider saves the hue', 'color:: hue 212\n- custom\n', …)`; swatch `data-color="hue
    212"`. Drag: click the swatch; the slider has `data-current` and `aria-valuenow="212"`, no cell has
    `data-current`; keep `preview212` = the preview layer's background now. `mouse.move` to the slider's centre,
    `down`, move to 20 px left of its box (`data-preview="hue 0"`), then to 20 px right of it, `up`;
    `expectFile('117 one drag saves once', 'color:: hue 359\n- custom\n', …)`; the picker is still open and the slider
    has `data-current`. `Escape`, focus back on the swatch, `Control+z`; `expectFile('117 undo takes back the whole
    drag', 'color:: hue 212\n- custom\n', …)`. `PASS 117 a custom hue is picked by keyboard and by dragging, previewed,
    saved on release, and undone in one step`.
  - **118** custom wash in the journal: write `journals/${dayKey(7)}.md` = `"- [[Hue 117]] custom wash\n\t- child\n-
    plain\n"`; `showDay(dayKey(7), 'custom wash')`; wait for `washesOf(rows)` = `'hue 212 hue 212 -'`, `wash-top` on
    `0`, `wash-bottom` on `1`; row 0's background equals `preview212` (the picker showed what the journal shows). Theme
    switch: keep `before = bgOf(row 0)`, `page.evaluate(() => (document.documentElement.dataset.theme = 'teal'))`, wait
    until row 0's background differs from `before` and is not `rgba(0, 0, 0, 0)`; `delete
    document.documentElement.dataset.theme`, wait until it equals `before` again. From the link: right-click the
    `Hue 117` link in row 0, choose `Color…`; the slider has `data-current` and `aria-valuenow="212"`; click
    `option('violet')`; `expectFile('118 a name replaces the hue', 'color:: violet\n- custom\n', …)`; wait for
    `washesOf(rows)` = `'violet violet -'`. `PASS 118 a custom hue washes journal blocks, follows the theme, and a
    named color replaces it`.

- [ ] **Step 2: Run e2e**

Run: `just e2e`
Expected: all steps pass; 160 PASS lines (154 + step lines for 117 and 118, plus three `expectFile` lines in 117 and
one in 118). If the steps as built print a different number, the counted number is the rule: record it.

- [ ] **Step 3: Record the count** in `docs/STATUS.md` (Test baseline).

- [ ] **Step 4: Commit**

```bash
git add app/e2e/smoke.mjs docs/STATUS.md
git commit -m "test(e2e): custom page colors: slider, preview, save on release, undo, journal washes, theme switch"
```

---

### Task 8: Spec, compatibility and review items (model: sonnet)

**Files:**
- Modify: `docs/spec.md` (§7.3, §7.4, §7.10), `docs/compatibility.md` (format version 7 in the intro; the page
  colors paragraph), `docs/review.md` (new heading `## Custom page colors`, items 34 to 39), `docs/backlog.md` (#72
  unchanged; add nothing unless a task deferred work)

- [ ] **Step 1: Write the text**
  - spec §7.3: the picker also has a custom part: a hue slider around the color wheel (arrows ±1, Page Up/Down ±10,
    Home/End, Enter saves and closes; a drag saves on release and keeps the picker open; Tab moves between the grid
    and the slider) and a preview line (sample text with a link and a tag on the color the pointer or the keyboard is
    on, in the current theme; the saved color stays marked). A custom color is saved as `color:: hue <h>`; picking a
    name after a hue, or a hue after a name, replaces the line. One save is one undo step.
  - spec §7.4: a custom color washes and merges exactly like a named one.
  - spec §7.10: the tokens include each theme's shade parameters (base lightness, chroma and offset factors); a
    custom hue's shade is computed from them at runtime with the same rule as the 25 colors, and its wash strength is
    lowered step by step in a theme where text (4.5:1), links or tags (3:1) would otherwise be hard to read.
  - compatibility: format version 7; `color:: hue 212` is plain text in Obsidian and a page property in Logseq (not
    verified), and Breccia versions before format 7 read it as no color and keep the line.
  - review.md (one item each, `N. [ ] **Title:** …`):
    34. **Hue slider:** look, keys (arrows, Page Up/Down, Home/End, Enter, Tab), dragging, and that only release or
        Enter writes the `color:: hue <h>` line; the picker stays open after a drag.
    35. **Preview:** the sample line follows the pointer and the arrow keys over the 25 colors, "No color" and the
        slider, and shows what the journal shows; the sample text "Notes with a link and #tag" (say if you want other
        words).
    36. **Custom hues in every theme:** sweep the slider in Light, Dark, Violet, Graphite, Taupe, Teal and System
        (both Windows modes): washes soft, text, links and tags readable. Yellow-green hues come out darker than the
        fixed `yellow` (the lightness is the same for every hue); say if that looks wrong.
    37. **Saved color stays marked:** while the picker is open, the saved cell or the slider stays marked while the
        preview moves.
    38. **Undo:** one `Ctrl Z` takes back one whole drag or one Enter on the slider.
    39. **In the file:** `color:: hue 212`; `hue 360`, `hue x` stay visible as text and give no color; older
        Breccia versions read a hue as no color and keep the line.

- [ ] **Step 2: Check the docs**

Run: `cd app && npx vitest run scripts/docs.test.mjs` and `cargo test -p breccia-core format_doc::`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/spec.md docs/compatibility.md docs/review.md
git commit -m "docs: custom page colors in the spec, the compatibility notes and the review list"
```

---

## Plan 1 follow-ups taken here

- 7 (the picker popover's accessible name): Task 5.
- 14 (the journal/page color match written twice): Task 1 (`own_color`).
- 17 (`color.rs` doc comment and `recolor` index comment): Task 1.
- 18, in part (long lines in `pageColors.ts` and in the `docs/format.md` paragraph this plan rewrites): Tasks 2 and 3.

The others stay open in `docs/plans/2026-11-07-01-page-colors-followups.md`.

## Owner decisions (2026-11-07)

1. **Lightness of custom hues:** build one lightness offset for every hue, as designed; the owner judges yellow-ish
   custom hues at review item 36, and a hue-dependent offset is a follow-up if wanted.
2. **After a drag the picker stays open**, so a second drag or arrow-key fine-tuning can follow; each release is one
   undo step; Enter, Escape or a cell click closes it.
