# Custom color vividness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A page with a custom hue gets a second slider, Vividness, that makes its color softer or stronger. The value
is saved in the page file (`color:: hue 212 vivid 150`), and the app still lowers it per theme where text would become
hard to read. When that happens, the picker's preview line says so.

**Architecture:** The core's `PageColor::Hue` gets a `vivid` field (50 to 200, 100 = today's look). It reads and
writes `hue <h> vivid <v>` and leaves out `vivid 100`. The frontend's `customShade` takes the vividness and scales
the shade's chroma and the wash strength by `v/100`. The existing readability stepping then runs from that target, and
a new `limited` flag reports when the stepping had to change anything. The picker (`PageColorGrid`) gets a second
slider under the hue slider, always shown and greyed out until a custom hue applies (P5), and a note in the preview when `limited` is set.
Backlog #72.

**Tech Stack:** Rust (breccia-core), Svelte 5 + TypeScript, Vitest, Playwright e2e over WebView2. No new dependency.

**Spec:** this plan's "Owner decisions" and "Proposals" sections. They extend plan 2's design
`docs/superpowers/specs/2026-11-07-custom-page-colors-design.md` and plan 2 itself
(`docs/plans/2026-11-07-02-custom-page-colors.md`, "The custom shade" and "Picker state model"), which stay binding
for everything this plan does not change. Also `docs/spec.md` §7.3, §7.4 and §7.10, `docs/format.md` §8, and
`CLAUDE.md`.

## Owner decisions (2026-11-09)

1. **Per page, in the file.** Vividness is saved with the page's color in its `color::` line, not as a global
   setting.
2. **Custom hues only.** The 25 named colors stay unchanged. The vividness slider is always shown, but it is greyed
   out (disabled) unless a custom hue is in use or being picked (see P5).
3. **Plan review (2026-11-09):** the owner approved P1 to P4 and P6 to P9 as proposed, and changed P5: the vividness
   slider is always shown, and greyed out when it does not apply, instead of appearing only for a custom hue.

## Proposals (approved by the owner on 2026-11-09, with P5 changed; each says what it costs if wrong)

- **P1. What vividness changes:** both the shade's chroma and the wash strength, by the same factor `v/100`. Strength
  alone makes the wash darker (lighter in dark themes) more than more colorful, and chroma alone is capped by the sRGB
  gamut (cyan at hue 212 is already at its gamut edge, so it would not move at all). Measured on the shipped tokens:
  with both, hue 212 in Light goes from wash `#e5eded` (50) to `#b7e2e7` (100) to `#92d6de` (150). From about 155 up
  the readability guard holds it there (`#95d6de` at 200): this is where the slider "seems to stop". It stops at about
  165 in Dark, Violet and Graphite, 135 in Taupe and 125 in Teal for that hue. If this is wrong, only `customShade`
  and its tests change.
- **P2. Range and default:** 50 to 200. 100 is today's look and the default, so a page with only `color:: hue 212`
  looks exactly as before (checked: at 100 every hue in every theme gives the same shade, wash and strength as
  today). The keys and a drag move in steps of 5, and a hand-written value can be any whole number in the range. Below
  50 a wash is barely visible (7 % strength at 25 in Light). Cost if wrong: the constants and the tests that pin them.
- **P3. File syntax:** `color:: hue 212 vivid 150`. The word `vivid` and the number come after the hue. Case is
  ignored and leading zeros are allowed when reading. Breccia writes lower case with single spaces, no leading zeros,
  and leaves out `vivid 100`. Format version 8. Older Breccia versions read the line as no color and keep it.
- **P4. Invalid vividness:** `hue 212 vivid 300`, `hue 212 vivid x`, `hue 212 vivid` and extra words make the whole
  value no color. The line stays visible as text, exactly like `hue 999` today. The alternative is to keep the hue and
  ignore a bad vividness. That is more forgiving but adds a second invalid-value rule to the format.
- **P5. When the slider is active (owner's choice, 2026-11-09):** the vividness slider is always shown, so the
  picker's layout never moves. It is greyed out and disabled (`aria-disabled="true"`, not a tab stop, ignores the
  pointer and keys) until the saved color is a custom hue, or the hue slider has been focused, pointed at or dragged.
  After that it stays enabled until the picker closes, so it does not grey out again when the focus goes back to the
  grid. While disabled it shows its value at 100 on a greyed track.
- **P6. Named color and back:** the file has one `color::` line, so picking a named color drops the vividness, and
  undo brings it back. While the picker stays open the sliders keep their values. When it is opened again on a page
  with a named color, the sliders start at hue 200 and vividness 100. The alternative is to remember the last
  vividness until the app closes, which is state that lives nowhere a user can see.
- **P7. Why it stops:** when the readability guard changed the wash, a muted note under the preview's sample line
  says "Softened here so text stays readable". The vividness slider's screen-reader text ends with ", softened for
  readability", and its track (the washes at 50, 75 … 200) flattens visibly where the guard holds. The alternatives
  are a mark on the track at the point where it stops, or no note at all.
- **P8. Hue track:** the hue slider's track shows the shades at the current vividness, so it fades or strengthens
  with it.
- **P9. Keyboard:** three tab stops. Tab goes grid → hue → vividness → grid, and Shift Tab goes the other way. On
  the vividness slider: arrows ±5, Page Up/Down ±25, Home 50, End 200. Enter saves the custom color as shown (hue and
  vividness, one undo step) and closes. A drag saves on release and keeps the picker open, as on the hue slider.

## Pre-flight rulings (2026-11-09, binding; they override the task text where they differ)

Full table: `.superpowers/sdd/2026-11-09-03-custom-color-vividness/preflight.md` (local).

- **R1 (Tasks 5, 7):** P5 everywhere: the vividness slider is always shown and greyed out until a custom hue applies.
  Any text saying it "shows only", "appears" or "reopening shows no slider" means "is greyed out / disabled" instead.
  The spec §7.3 text and review item 46 say so.
- **R2 (Task 5):** a greyed slider does nothing: no pointer, focus or key handling. Only the hue slider, or an
  enabled vividness slider, sets `customSeen`.
- **R3 (Tasks 5, 6):** render `aria-disabled={enabled ? undefined : 'true'}`; e2e asserts
  `getAttribute('aria-disabled') !== 'true'` for "enabled".
- **R4 (Task 4):** "vividness 100 is today's look" must be able to fail: before changing `customShade`, compute a
  digest (or full table) of today's `customShade(h, t)` for every hue in every theme block, pin it in the test, and
  check the vivid-100 result against that pinned digest (bypassing the memo).
- **R5 (Task 2):** add a valid `after-hue-212-vivid-150` sample that must not be flagged, so the fence test fails
  first.
- **R6 (Tasks 1, 3):** tests that already pass on today's code stay as pinning tests; the RED evidence comes from the
  other new tests in the task.
- **R7 (Task 1):** run `cargo test -p breccia-core -- color:: render:: page_color::`; add
  `crates/core/tests/it/format_doc.rs` to Task 1's files if it has to change.
- **R8 (Task 4):** the readability sweep checks every vividness step of 5 from 50 to 200, not only 50, 75 … 200.
- **R9 (Task 5):** the slider is enabled when `customSeen || current === CUSTOM`, so a color that becomes a custom
  hue while the picker is open (an outside edit) enables it.
- **R10 (Tasks 1, 3):** Task 3 defines `VIVID_STEP` and `VIVID_PAGE` in `pageColors.ts`; the core mirrors only
  `DEFAULT_VIVID`, `MIN_VIVID` and `MAX_VIVID`.
- **R11 (Task 6):** in step 119, before the "119 Esc writes nothing" check, add: Tab twice (to the vividness slider),
  ArrowRight, Esc, then assert the bytes unchanged. Expected e2e count after the plan: 176 PASS lines.
- **R12 (Task 6):** update the stale "steps 112 to 116" comment in `smoke.mjs` to name the new range.
- **R13 (Task 5, from Task 5's review):** the "softened" note uses `var(--text)` in italics, not `var(--muted)` as P7
  and Task 5 say: `var(--muted)` measured only 1.58-3.28:1 on limited washes, below 4.5:1.

## Global Constraints

- Only the one `color::` line changes in a notes file (spec §2 anti-goal). Files Breccia did not change stay
  byte-identical. A hand-written `color:: HUE 212 VIVID 0150` stays as written until the user picks a different color.
- In the file: `color:: hue <h>` or `color:: hue <h> vivid <v>`, with `h` a whole number from 0 to 359 and `v` from 50
  to 200. Breccia writes lower case, one space, no leading zeros, and no `vivid 100`. Invalid values are no color and
  stay visible as text. Format version 8.
- The 25 named colors, their tokens and their washes do not change. `color:: red vivid 150` is invalid (no color).
- At vividness 100, `customShade` returns exactly what it returns today for every hue in every theme.
- Readability on the blended wash, at every vividness, in every theme and the System dark block: text ≥ 4.5:1, links
  and tags ≥ 3:1. The text colours never change.
- No colour literals or `color-mix` outside `app/src/styles/tokens.css`. `app/src/lib/customColor.ts` keeps plan 2's
  narrow exception and no others.
- Moving a slider only previews. Release, or Enter on a slider, saves. One drag or one Enter is one undo step.
- Wire value: a custom color is the canonical string everywhere (`"hue 212"`, `"hue 212 vivid 150"`), as in plan 2.
- Commits: conventional subjects. `feat`/`fix` subjects are user-facing changelog lines (no code names, paths or task
  numbers), at most about 90 characters, with no trailing period. Internal work uses `test`, `refactor`, `docs` or
  `chore`. No attribution lines. Commit on `main` and push after each commit.
- Every test must fail first. Capture the RED run before implementing.
- e2e steps assert the bytes on disk where a file changes, and wait for states instead of sleeping.

## Review Focus

- **A hand-written vividness the app did not write.** `color:: Hue 212 Vivid 0150` must read as hue 212 at 150, and
  `hue 212 vivid 100` as plain hue 212. `vivid 49`, `vivid 201`, `vivid`, `vivid 1.5`, `vivid +60`, `vivid 80 x` and
  `vivid 80 hue 212` are no color and stay visible. Opening the picker on a hand-written value and pressing Esc keeps
  the bytes. Pinned in Task 1 (`parse_color_reads_a_vividness`, `preamble_html_shows_an_invalid_vividness`) and Task 6
  (step 120 asserts the hand-written bytes after Esc).
- **A hue change on a page with a vividness keeps the vividness.** A drag or Enter on the hue slider saves
  `hue <new> vivid <v>`, not `hue <new>`. Pinned in Task 3 (`hueColor(359, 50)`) and Task 6 (step 119's hue drag
  writes `color:: hue 359 vivid 50`).
- **A theme switch while a strong vividness is shown.** In Teal the same value gets limited, the note appears, and
  the wash still passes the thresholds. Pinned in Task 4 (pinned Teal value with `limited: true`, the sweep over all
  vividness steps) and Task 6 (step 120 switches to Teal with the picker open and waits for the note).
- **Picking the saved color again, or only moving and leaving.** Arrowing the vividness slider and leaving it with Tab
  or Esc writes nothing. Saving the vividness the page already has records no undo step. Pinned in Task 1
  (`a_pick_of_the_saved_vividness_records_no_step`) and Task 6 (step 119 checks the bytes before Enter and after Esc).
- **The slider's state on a page with a named color.** It must be shown but disabled at first (greyed, not a tab
  stop), must become enabled once the hue slider is reached, and must not then be disabled again when the focus goes
  back to the grid. Pinned in Task 3 (`pickerTab` cases) and
  Task 6 (step 119's named-color part counts the slider before and after Tab, and after Shift Tab).

---

## The vivid shade (decided here, binding for Tasks 4 to 6)

**Constants** (`pageColors.ts`, mirrored in `color.rs`): `DEFAULT_VIVID = 100`, `MIN_VIVID = 50`, `MAX_VIVID = 200`,
`VIVID_STEP = 5`, `VIVID_PAGE = 25`.

**Algorithm** of `customShade(hue, t, vivid = DEFAULT_VIVID)`: plan 2's algorithm with these changes only.

1. Target: `L = t.l + CUSTOM_DL·t.ds` (unchanged), `C = CUSTOM_CHROMA·t.cs·vivid/100`.
2. Gamut: unchanged (`ruleShade`). Lowering chroma to fit the gamut never counts as limited.
3. `P = round(t.wash·100)`, the target strength `T = round(P·vivid/100)`, the floor `F = ceil(min(T, P)/2)`.
4. Step the strength from `T` down to `F` until it passes. If it still fails at `F`, lower the chroma in steps of 0.01
   at `F`, then try grey, then fall back to the bare background with strength 0. All of this is unchanged from plan 2
   except that it starts at `T` and stops at `F`.
5. Return `{ shade, wash, strength, chroma, limited }`, where `limited` is true when step 4 returned anything other
   than strength `T` at the gamut chroma.

**Memo:** the cache key per `ThemeTokens` becomes `hue * 1000 + vivid`.

**Expected values** (Task 4 pins them; measured while writing this plan). Each line gives the theme, hue and
vividness, then the shade, wash, strength and `limited`:

| Theme | Hue | Vividness | Shade | Wash | Strength | Limited |
|---|---|---|---|---|---|---|
| Light | 212 | 50 | `#619da9` | `#e5eded` | 0.14 | false |
| Light | 212 | 100 | `#08a4bb` | `#b7e2e7` | 0.28 | false |
| Light | 212 | 150 | `#00a4bb` | `#92d6de` | 0.42 | false |
| Light | 212 | 200 | `#08a4bb` | `#95d6de` | 0.42 | true |
| Dark | 100 | 200 | `#a69306` | `#695e10` | 0.56 | true |
| Teal | 212 | 150 | `#055a67` | `#023c48` | 0.37 | true |

If a value differs by one in a channel, check the code against steps 1 to 4 before changing the number. Over all
hues, the shipped themes and the vividness values 50, 55 … 200: every wash passes the thresholds, and nothing at or
below 100 is limited.

**Picker state model** (extends plan 2's): index `VIVID = 27` is the vividness slider. `vivid` is the slider's value:
the saved vividness, else `DEFAULT_VIVID`. Within one opening it follows a new saved custom color and otherwise keeps
its value (P6). The preview shows `previewColor(hover, at, hue, vivid)`. `CUSTOM` and `VIVID` both preview
`hueColor(hue, vivid)`. A component flag `customSeen` starts as `current === CUSTOM` and becomes true when `at` or
`hover` is `CUSTOM` or `VIVID`, and it never goes back to false while the picker is open (P5). The vividness slider
always renders; it is enabled only when `customSeen` is true, and disabled (greyed) otherwise.

---

### Task 1: Vividness in the core (model: sonnet)

**Files:**
- Modify: `crates/core/src/color.rs`
- Test: `crates/core/tests/it/color.rs`, `crates/core/tests/it/render.rs`, `crates/core/tests/it/page_color.rs`

**Interfaces:**
- Produces (in `breccia_core::color`):
  - `pub const DEFAULT_VIVID: u8 = 100;`, `pub const MIN_VIVID: u8 = 50;`, `pub const MAX_VIVID: u8 = 200;`
  - `PageColor::Hue { hue: u16, vivid: u8 }` (replaces `Hue(u16)`; keep the derives). `pub const fn hue(hue: u16) ->
    PageColor` gives vividness 100.
  - `Display`: `hue 212` when `vivid == DEFAULT_VIVID`, else `hue 212 vivid 150`. `Serialize` is unchanged, because
    it goes through `Display`.
  - `parse_color(value)` accepts a name, two words (`hue N`), or four words (`hue N vivid M`), split on ASCII
    whitespace. `vivid` ignores ASCII case. `M` is ASCII digits only, leading zeros are allowed, its value must be
    from 50 to 200, and the check must not overflow on long digit strings. Anything else is `None`.
  - `recolor`, `color_line`, `page_color`, `own_color`, `Workspace::color_change` and the view structs keep their
    signatures. Nothing outside `color.rs` matches on `Hue(` (checked), apart from the tests.
- Also takes plan 2 follow-up 9: a read test for a lone invalid `color:: hue 999` line.

- [ ] **Step 1: Write the failing tests**
  - `color.rs`: change `Hue(n)` to `PageColor::hue(n)` in the existing tests, and add a local `fn vivid(h, v)`
    helper.
  - `color.rs`, `parse_color_reads_a_vividness`:
    - Valid: `hue 212 vivid 150` → `vivid(212,150)`; `Hue 212 Vivid 0150` → `vivid(212,150)`;
      `hue 7\tvivid  50` → `vivid(7,50)`; `hue 0 vivid 200` → `vivid(0,200)`; `hue 212 vivid 100` → `hue(212)`.
    - `None`: `hue 212 vivid`, `hue 212 vivid 49`, `hue 212 vivid 201`, `hue 212 vivid 0`, `hue 212 vivid -60`,
      `hue 212 vivid +60`, `hue 212 vivid 1.5`, `hue 212 vivid x`, `hue 212 vivid 80 x`, `hue 212 strong 80`,
      `vivid 80 hue 212`, `hue 360 vivid 80`, `hue 212 vivid 99999999999999999999`, `red vivid 150`.
    - Display: `vivid(212,150).to_string() == "hue 212 vivid 150"`, `vivid(212,100).to_string() == "hue 212"`,
      `serde_json::to_string(&vivid(9,55)) == "\"hue 9 vivid 55\""`.
  - `color.rs`, `page_color_reads_a_lone_invalid_hue` (follow-up 9): `page_color("color:: hue 999\n") == None`, and
    `page_color("color:: hue 212 vivid 300\n") == None`.
  - `color.rs`, `recolor_writes_a_vividness`:
    - `recolor("- a\n", Some("hue 212 vivid 150"), lf) == "color:: hue 212 vivid 150\n- a\n"`
    - `recolor("color:: hue 212 vivid 150\nx\n", Some("teal"), lf) == "color:: teal\nx\n"`
  - `render.rs`, `preamble_html_shows_an_invalid_vividness`: `preamble_html("color:: hue 212 vivid 150\nnote\n")`
    has no `color::`, and `preamble_html("color:: hue 212 vivid 300\n")` contains `vivid 300`.
  - `page_color.rs` (session), `set_color_with_a_vividness`: on `pages/Garden.md` = `"- a\n\t- b\n"`:
    - `page.setColor garden "hue 212 vivid 150"` writes `"color:: hue 212 vivid 150\n- a\n\t- b\n"`, and the page view
      JSON has `"color":"hue 212 vivid 150"`.
    - `"HUE 212 VIVID 0150"` writes the same canonical line.
    - `"hue 212 vivid 100"` writes `color:: hue 212\n`.
    - `"hue 212 vivid 300"` gives error code `unknownColor` and leaves the file unchanged.
  - `page_color.rs`, `a_pick_of_the_saved_vividness_records_no_step`: pick `hue 40 vivid 60`, pick it again, pick
    `hue 40 vivid 65`; one `history.undo` gives `color:: hue 40 vivid 60\n…`, and a second gives `"- a\n\t- b\n"`.
  - `page_color.rs`, `journal_blocks_carry_a_vividness`: with plan 1's Task-3 folder, `page.setColor hiring "hue 300
    vivid 120"` gives block JSON `"color":"hue 300 vivid 120"` on blocks 4, 7 and 10 of `2026-10-29`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cargo test -p breccia-core -- color:: render:: page_color::`
Expected: compile failure (`PageColor::hue` and the `Hue { .. }` shape do not exist yet).

- [ ] **Step 3: Implement** the interfaces above in `color.rs`. Fix `format_doc.rs`'s `hue_value` match only as far
  as it needs to compile (`Some(PageColor::Hue { hue, vivid: DEFAULT_VIVID }) if hue.to_string() == h`). Task 2
  extends it.

- [ ] **Step 4: Run all core tests**

Run: `cargo test -p breccia-core` and `cargo clippy --workspace -- -D warnings`
Expected: PASS, no warnings.

- [ ] **Step 5: Commit**

```bash
git add crates/core
git commit -m "refactor(core): read and write a vividness with a custom hue"
```

---

### Task 2: Format version 8 (model: sonnet)

**Files:**
- Modify: `docs/format.md` (title, §1 notation, §8 "Page color", §13, §14)
- Modify: `crates/core/tests/it/format_doc.rs`

**Interfaces:**
- Consumes: `parse_color`, `PageColor::Hue { hue, vivid }`, `DEFAULT_VIVID` (Task 1).

- [ ] **Step 1: Write the failing format-doc checks** in `format_doc.rs`:
  - `hue_value(name)` also accepts `hue-<h>-vivid-<v>` and maps it to `hue <h> vivid <v>`. It is valid only when both
    numbers are canonical (no leading zeros) and `v != 100`.
  - `format_doc_recolor_examples` asks for at least 2 pairs with `-vivid-`.
  - `format_doc_fence_info_strings_are_known`: the sample also flags `markdown after-hue-212-vivid-100`,
    `markdown after-hue-212-vivid-300` and `markdown after-hue-212-vivid-075`.
  - Update the module doc comment (`hue-<h>` or `hue-<h>-vivid-<v>`).

Run: `cargo test -p breccia-core format_doc::`
Expected: FAIL (`only 0 vivid recolor pairs`; the sample is not flagged).

- [ ] **Step 2: Write the `docs/format.md` text**
  - Title: `version 8`. §1 notation: `color "…"` is a name, `hue <h>`, or `hue <h> vivid <v>`.
  - §8 **Page color**: after the hue sentence, add: a custom hue may be followed by `vivid <v>`, the word `vivid` (case
    ignored), whitespace, and a whole number from 50 to 200 (leading zeros allowed). It is how vivid the color is, in
    percent of normal: 100 is the same as leaving it out. Other values (`vivid 300`, `vivid x`, a lone `vivid`) make
    the whole value no color, kept as written. Breccia writes `hue <h> vivid <v>` in lower case with single spaces and
    no leading zeros, and leaves out `vivid 100`. Keep the doc's ~120-column wrap.
  - Two reading examples, after the hue example:
    - `Color:: Hue 212 Vivid 0150` reads `color "hue 212 vivid 150"`;
    - `color:: hue 212 vivid 300` reads with no `color` line.
  - Two before/after pairs, after the existing ones:
    - `before "- a\n"` → `after-hue-212-vivid-150 "color:: hue 212 vivid 150\n- a\n"`;
    - `before "color:: hue 212 vivid 150\nnotes\n- a\n"` → `after-hue-40-vivid-60 "color:: hue 40 vivid 60\nnotes\n- a\n"`.
  - §13: "write one only with a name, `hue <h>` or `hue <h> vivid <v>` from section 8."
  - §14: **Version 8**: a custom hue may carry a vividness, `hue <h> vivid <v>` (section 8). Before, such a value was
    no color and kept as text; older Breccia versions still read it that way.

- [ ] **Step 3: Run the checks**

Run: `cargo test -p breccia-core format_doc::` and `cd app && npx vitest run scripts/docs.test.mjs scripts/page-colors.test.mjs`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/format.md crates/core/tests/it/format_doc.rs
git commit -m "docs: format version 8, a vividness for a custom hue"
```

---

### Task 3: Picker logic for vividness (model: sonnet)

**Files:**
- Modify: `app/src/lib/pageColors.ts`, `app/src/lib/pageColors.test.ts`, `app/src/lib/types.ts` (doc comments of the
  three `color` fields: a name, `hue <h>` or `hue <h> vivid <v>`)

**Interfaces:**
- Produces (in `pageColors.ts`):
  - `VIVID = CUSTOM + 1` (27), `DEFAULT_VIVID = 100`, `MIN_VIVID = 50`, `MAX_VIVID = 200`.
  - `parseCustom(color: string | null): { hue: number; vivid: number } | null` parses the wire form:
    `/^hue (0|[1-9]\d{0,2})(?: vivid ([1-9]\d{1,2}))?$/`, with hue ≤ 359 and vivid from 50 to 200. A missing vividness
    is 100.
  - `parseHue(color)`: now `parseCustom(color)?.hue ?? null` (signature unchanged).
  - `hueColor(h: number, vivid = DEFAULT_VIVID): string` gives `hue 212`, or `hue 212 vivid 150` when `vivid` is not
    100.
  - `colorLabel`: `hue 212` → `Custom (hue 212)` (unchanged); `hue 212 vivid 150` → `Custom (hue 212, vividness 150)`.
  - `followVivid(vivid: number, color: string | null): number` returns `parseCustom(color)?.vivid ?? vivid`.
  - `indexColor(i, hue, vivid = DEFAULT_VIVID)` and `previewColor(hover, focused, hue, vivid = DEFAULT_VIVID)`: both
    `CUSTOM` and `VIVID` give `hueColor(hue, vivid)`.
  - `vividSliderKey(e: KeyInput, v: number): number | 'save' | 'leave' | null` works like `hueSliderKey`, with these
    differences:
    - Arrow keys move to the next multiple of 5 in their direction: ArrowRight/ArrowUp give `min(200, floor(v/5)·5 +
      5)`, ArrowLeft/ArrowDown give `max(50, ceil(v/5)·5 − 5)`.
    - Page Up and Page Down do the same with multiples of 25.
    - Home gives 50, End gives 200, Enter gives `'save'`, and Tab with or without Shift gives `'leave'`.
    - Ctrl, Alt or Meta, or Shift on any key other than Tab, gives null.
  - `vividAt(x: number, width: number): number` returns `50 + round((x / width) · 150 / 5) · 5`, clamped to 50..200.
    A `width ≤ 0` gives 50.
  - `pickerTab(from: number, back: boolean, gridAt: number, vividOn: boolean): number` gives the next tab stop (`vividOn`: the vividness slider is enabled, P5):
    - from the grid (`from ≤ NO_COLOR`): forward goes to `CUSTOM`; back goes to `VIVID` if `vividOn`, else to
      `CUSTOM`;
    - from `CUSTOM`: forward goes to `VIVID` if `vividOn`, else to `gridAt`; back goes to `gridAt`;
    - from `VIVID`: forward goes to `gridAt`; back goes to `CUSTOM`.
- Also takes plan 2 follow-up 10: the `parseHue` rejection cases `hue 1000`, `hue -1`, `hue 7 ` and `hue  7`.

- [ ] **Step 1: Write the failing tests** in `pageColors.test.ts`:
  - `custom colors with a vividness`:
    - `parseCustom('hue 212') → {hue:212, vivid:100}`, `parseCustom('hue 212 vivid 150') → {hue:212, vivid:150}`, and
      `'hue 0 vivid 50'` and `'hue 359 vivid 200'` parse.
    - These give null: `'hue 212 vivid 49'`, `'hue 212 vivid 201'`, `'hue 212 vivid 075'`, `'hue 212 vivid'`,
      `'hue 212 VIVID 150'`, `'hue 212 vivid 150 '`, `'red'`, `null`.
    - `parseHue('hue 212 vivid 150') === 212`. `parseHue` gives null for `'hue 1000'`, `'hue -1'`, `'hue 7 '` and
      `'hue  7'`.
    - `hueColor(212) === 'hue 212'`, `hueColor(212, 100) === 'hue 212'`, `hueColor(359, 50) === 'hue 359 vivid 50'`.
    - `colorLabel('hue 212 vivid 150') === 'Custom (hue 212, vividness 150)'`.
    - `pickerStart('hue 5 vivid 60') === CUSTOM`.
    - `followVivid(130, 'hue 1 vivid 60') === 60`, `followVivid(130, 'red') === 130`, `followVivid(130, null) ===
      130`, `followVivid(130, 'hue 1') === 100`.
    - `indexColor(VIVID, 9, 60) === 'hue 9 vivid 60'`, `indexColor(CUSTOM, 9, 60) === 'hue 9 vivid 60'`,
      `previewColor(null, VIVID, 9, 100) === 'hue 9'`.
  - `vividness slider keys`:
    - From 100: ArrowRight and ArrowUp give 105; ArrowLeft and ArrowDown give 95; PageUp 125; PageDown 75; Home 50;
      End 200; Enter `'save'`; Tab and Shift+Tab `'leave'`.
    - From 133: ArrowRight gives 135, ArrowLeft 130, PageUp 150, PageDown 125.
    - At the ends: from 198 ArrowRight gives 200; from 50 ArrowLeft gives 50; from 190 PageUp gives 200; from 60
      PageDown gives 50.
    - ArrowRight with `ctrl`, ArrowRight with `shift`, and `'a'` give null.
  - `vividAt`: `(0,100)` gives 50, `(50,100)` 125, `(100,100)` 200, `(33,100)` 100, `(-20,100)` 50, `(140,100)` 200,
    `(10,0)` 50.
  - `pickerTab`:
    - From the grid (`from` 7, `gridAt` 7): forward gives `CUSTOM` with `vividOn` true or false; back gives `VIVID`
      when enabled, else `CUSTOM`.
    - From `CUSTOM`: forward gives `VIVID` when enabled, else 7; back gives 7.
    - From `VIVID`: forward gives 7, back gives `CUSTOM`.
    - From `NO_COLOR` with `gridAt` `NO_COLOR`: back with `vividOn` gives `VIVID`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd app && npx vitest run src/lib/pageColors.test.ts`
Expected: FAIL (`VIVID` and `parseCustom` not exported).

- [ ] **Step 3: Implement** the interfaces above. Leave `hueSliderKey`, `hueAt` and `colorPickerKey` unchanged.

- [ ] **Step 4: Run the frontend tests and the type check**

Run: `cd app && npx vitest run && npm run check`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib
git commit -m "refactor(app): picker keys, labels and tab order for a custom color's vividness"
```

---

### Task 4: Vividness in the shade function, with the sweep (model: sonnet)

**Files:**
- Modify: `app/src/lib/customColor.ts`, `app/src/lib/theme.test.ts`

**Interfaces:**
- Consumes: `parseCustom`, `DEFAULT_VIVID`, `MIN_VIVID`, `MAX_VIVID` (Task 3).
- Produces (in `customColor.ts`):
  - `interface CustomShade` gets `limited: boolean` as its last field.
  - `customShade(hue: number, t: ThemeTokens, vivid: number = DEFAULT_VIVID): CustomShade`, following "The vivid
    shade".
  - `washValue(color, t)` and `swatchValue(color, t)` go through `parseCustom` and pass the vividness. Their signatures
    are unchanged, so `BlockRow` and `PageColorPicker` need no change.
  - `hueTrack(t: ThemeTokens, vivid: number = DEFAULT_VIVID): string` uses the shades at that vividness (P8).
  - `vividTrack(hue: number, t: ThemeTokens): string` returns `linear-gradient(to right, …)` of the washes at
    vividness 50, 75, … 200 (7 stops).

- [ ] **Step 1: Write the failing tests** in `theme.test.ts` (reuse `tokensOf`, `over`, `contrast`, `near`,
  `THEME_SELECTORS`):
  - `vivid shades: pinned values`: the six rows of "The vivid shade" table, comparing `shade` and `wash` with `near`
    and `strength` and `limited` exactly. The existing `custom shades: pinned values` test stays unchanged; it is the
    proof that 100 matches today.
  - `vividness 100 is today's look`: for every selector and every hue, `customShade(h, t, 100)` deep-equals
    `customShade(h, t)`, and `limited` is false. With today's tokens, the earlier `every custom hue is readable` test
    already pins those values.
  - `every vividness is readable in every theme`: for each selector, each hue 0..359 and each `v` in 50, 75 … 200:
    - with `r = customShade(h, t, v)` and `T = round(round(t.wash·100)·v/100)/100`:
    - `r.wash === over(r.shade, t.bg, r.strength)` unless `r.strength === 0`;
    - the contrast thresholds hold;
    - `r.strength ≤ T`;
    - `r.limited === (r.strength < T || r.chroma < ruleShade(t.l, CUSTOM_CHROMA·t.cs·v/100, h).chroma)`;
    - when `v ≤ 100`, `r.limited` is false.
    - It logs nothing (plan 2 follow-up 11 asks for fewer info lines).
  - `the readability guard is reported as limited`: with Light's tokens but `bg: '#ffffff'` and `text: '#686868'`
    (plan 2's stepping case), `customShade(212, …, 100)` has `limited: true` and `strength 0.2`. The real Light tokens
    give `limited: false`.
  - `washValue and swatchValue with a vividness`:
    - `washValue('hue 212 vivid 150', light) === '#92d6de'` (±1 with `near`);
    - `swatchValue('hue 212 vivid 50', light)` equals `customShade(212, light, 50).shade`;
    - `washValue('hue 212 vivid 300', light)` is undefined.
  - `tracks`:
    - `vividTrack(212, light)` starts with `linear-gradient(to right, ` and has 7 `#` stops, the first equal to
      `customShade(212, light, 50).wash`;
    - `hueTrack(light, 50) !== hueTrack(light)`, and `hueTrack(light, 100) === hueTrack(light)`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd app && npx vitest run src/lib/theme.test.ts`
Expected: FAIL (`limited` undefined; `vividTrack` not exported).

- [ ] **Step 3: Implement** following "The vivid shade". Keep the plan-2 structure of `compute`, and pass `vivid`
  through the memo key.

- [ ] **Step 4: Run them to verify they pass**

Run: `cd app && npx vitest run && npm run check`
Expected: PASS, including `no colour literals outside tokens` and plan 2's pinned values and sweep.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/customColor.ts app/src/lib/theme.test.ts
git commit -m "chore(app): custom shades take a vividness, checked for readability at every step"
```

---

### Task 5: The vividness slider and the "softened" note in the picker (model: opus)

**Files:**
- Modify: `app/src/components/PageColorGrid.svelte` (and its top comment), `app/src/styles/app.css` (rules next to
  `.pc-hue`, `.pc-preview`)

**Interfaces:**
- Consumes: `VIVID`, `DEFAULT_VIVID`, `MIN_VIVID`, `MAX_VIVID`, `parseCustom`, `hueColor`, `followVivid`,
  `previewColor`, `vividSliderKey`, `vividAt`, `pickerTab` (Task 3); `customShade`, `hueTrack`, `vividTrack` (Task
  4).
- Produces (the DOM that the e2e steps rely on):
  - Below the hue slider, always rendered: a label `Vividness`, styled like `Custom`, and a slider. While
    `customSeen` is false the label and slider are greyed out (an opacity rule in `app.css`, no colour literal) and
    the slider has `aria-disabled="true"` and `tabindex="-1"`, and ignores pointer and key events. The slider has:
    - `role="slider"`, `data-testid="page-color-vivid"`, `data-index={VIVID}`, `tabindex="0"` when enabled;
    - `aria-label="Vividness"`, `aria-valuemin="50"`, `aria-valuemax="200"`, `aria-valuenow={vivid}`;
    - `aria-valuetext={`Vividness ${vivid}`}`, plus `, softened for readability` when the shown shade is limited;
    - the same width as the hue slider, with background `vividTrack(hue, tokens)`;
    - a thumb at `(vivid − 50) / 150` of the width, filled with `customShade(hue, tokens, vivid).wash` and given a
      ring in `var(--text)` so it shows on a pale track.
    - It gets no `data-current`. The hue slider alone marks a saved custom color, as today.
  - Hue slider track: `hueTrack(tokens, vivid)`. Its thumb is `customShade(hue, tokens, vivid).shade`.
  - Preview box:
    - `data-limited` is present when the preview is a custom color and `customShade(hue, tokens, vivid).limited`;
    - inside the box, under the sample line, a `<div class="pc-preview-note" data-testid="page-color-limited">` with
      the text `Softened here so text stays readable`, rendered only when limited. It is in `var(--muted)`, 11 px, and
      sits on the wash layer.

Behaviour:
- `vivid` starts at `parseCustom(color)?.vivid ?? DEFAULT_VIVID`. It follows a new saved color through `followVivid`,
  in the same `$effect.pre` as `followHue` and also not during a drag.
- `customSeen` follows "Picker state model". It is set in `onfocus` and `onpointerenter` of both sliders, and true
  at mount when `current === CUSTOM`.
- Tab and Shift Tab: every `'leave'` from either slider, and Tab on the grid, go to
  `pickerTab(at, e.shiftKey, gridAt, customSeen)`. Tab from the grid first sets `customSeen` (the hue slider gets the
  focus), so a later Tab reaches the vividness slider.
- Keys on the vividness slider go through `vividSliderKey`. A number sets `vivid`, and the preview follows. `'save'`
  calls `onpick(hueColor(hue, vivid))` when that differs from `color`, then `ondone`.
- The hue slider's save becomes `hueColor(hue, vivid)` as well, so a hue change keeps the vividness.
- Pointer on the vividness slider: the same capture, move, release and cancel handling as the hue slider, with
  `vividAt`. Release saves once and keeps the picker open. Factor the shared drag code into one helper rather than
  copying it.
- `hover` and `at` for the vividness slider are `VIVID`. The preview is `previewColor(hover, at, hue, vivid)`.

- [ ] **Step 1: Build it** as above, and update the component's top comment (tab stops, the second slider, the
  note).
- [ ] **Step 2: Check by running the app**

Run: `just test`, `just lint`, then `just dev`.
Expected:
- tests and lint pass;
- on a page with no color, the picker shows the vividness slider greyed out; ArrowDown to the hue slider enables it,
  and it stays enabled when Shift Tab goes back to the grid;
- Tab cycles grid → hue → vividness → grid;
- End on the vividness slider in Light makes the preview stronger and shows the note; Home makes it pale with no
  note;
- Enter writes `color:: hue <h> vivid 200` and closes;
- a drag on the vividness slider writes once on release and keeps the picker open;
- a hue drag keeps the vividness in the line;
- picking `violet` writes `color:: violet`, and reopening shows no vividness slider until the hue slider is reached,
  where it starts at 100;
- in Teal the note appears at a lower vividness than in Light;
- the swatch and the journal washes follow the saved vividness.

- [ ] **Step 3: Commit**

```bash
git add app/src
git commit -m "feat(app): Page colors: a vividness slider makes a custom color softer or stronger"
```

---

### Task 6: End-to-end steps (model: sonnet)

**Files:**
- Modify: `app/e2e/smoke.mjs`: steps 119 and 120, after step 118 and before step 45, in the same block (reuse
  `swatch`, `picker`, `option`, `slider`, `previewBox`, `previewWash`, `bgOf`, `washesOf`, `showDay`,
  `focusedTestId`, `frames`, `readAt`, `expectFile`).
- Modify: `docs/STATUS.md` (Test baseline).

**Interfaces:**
- Consumes: the test ids and attributes of Task 5 (`page-color-vivid`, `aria-valuenow`, `aria-valuetext`,
  `page-color-limited`, the preview's `data-limited`).

- [ ] **Step 1: Write the steps.** Both steps set `document.documentElement.dataset.theme = 'light'` first, because
  the pinned "limited" behaviour depends on the theme. Step 120 deletes it at its end.
  - **119, vividness from the swatch:**
    - Write `pages/Vivid 119.md` = `"- vivid\n"`, open it from the sidebar, and click the swatch.
    - `page-color-vivid` is shown with `aria-disabled="true"` and `aria-valuenow="100"`.
    - `ArrowDown` puts the focus on the hue slider, and the vividness slider loses `aria-disabled`.
    - `Home`, `PageUp` × 21, `ArrowRight` × 2 give hue 212. `Tab` moves the focus to `page-color-vivid`.
    - `End`: `aria-valuenow="200"`, `data-preview="hue 212 vivid 200"`, `page-color-limited` visible,
      `aria-valuetext` ends with `softened for readability`.
    - `Home`: value 50 and no note. `PageUp` × 2: value 100 and no note.
    - After `frames()`, the file is still `"- vivid\n"`.
    - `End`, then `Enter`: the picker closes. `expectFile('119 Enter on the vividness saves hue and vividness',
      'color:: hue 212 vivid 200\n- vivid\n', …)`. The swatch has `data-color="hue 212 vivid 200"`.
    - Drag: click the swatch. The vividness slider is enabled at once with `aria-valuenow="200"`. Press on its centre, move
      to 20 px left of its box (`data-preview="hue 212 vivid 50"`, file unchanged), and release.
      `expectFile('119 one vividness drag saves once', 'color:: hue 212 vivid 50\n- vivid\n', …)`. The picker is
      still open.
    - Drag the hue slider past its right end and release. `expectFile('119 a hue drag keeps the vividness',
      'color:: hue 359 vivid 50\n- vivid\n', …)`.
    - `Escape`, then `Control+z` three times, with `expectFile` after each: `hue 212 vivid 50`, then
      `hue 212 vivid 200`, then `"- vivid\n"`. `Control+Shift+z` gives `hue 212 vivid 200` again.
    - Named color and back: click the swatch and click `option('violet')`. `expectFile('119 a name replaces hue and
      vividness', 'color:: violet\n- vivid\n', …)`.
    - Click the swatch again: `page-color-vivid` has `aria-disabled="true"`. `Tab` focuses the hue slider and the
      vividness slider is enabled with `aria-valuenow="100"`. `Shift+Tab` goes back to the grid, and the vividness
      slider is still enabled (no `aria-disabled`).
    - `Escape`, then `expectFile('119 Esc writes nothing', 'color:: violet\n- vivid\n', …)`.
    - Print `PASS 119 vividness is picked by keyboard and by dragging, is greyed out unless a custom hue applies, keeps with a hue
      change, and undoes in one step`.
  - **120, a hand-written vividness in the journal:**
    - Write `pages/Vivid 119.md` = `"color:: HUE 212 VIVID 0150\n- vivid\n"`, and write `journals/${dayKey(8)}.md` =
      `"- [[Vivid 119]] strong\n- plain\n"`. First grep `smoke.mjs` to check that no other step uses `dayKey(8)`;
      if one does, take the next free day.
    - `showDay(dayKey(8), 'strong')`, then wait for `washesOf(rows)` = `'hue 212 vivid 150 -'`.
    - Right-click the `Vivid 119` link and choose `Color…`. The vividness slider has `aria-valuenow="150"` and the hue
      slider has `data-current`. The preview wash background equals row 0's background, so the picker shows what the
      journal shows. No note is shown in Light at 150.
    - With the picker open, set `dataset.theme = 'teal'`, then wait for `page-color-limited` to be visible and for
      row 0's background to change.
    - `Escape`, then `expectFile('120 a hand-written vividness is kept as written', 'color:: HUE 212 VIVID 0150\n-
      vivid\n', …)`.
    - `delete document.documentElement.dataset.theme`.
    - Print `PASS 120 a hand-written vividness washes the journal, matches the preview, and is limited in Teal`.

- [ ] **Step 2: Run e2e**

Run: `just e2e`
Expected: all steps pass. The PASS line count is 164 plus the new step and `expectFile` lines. Record the counted
number; it is the rule.

- [ ] **Step 3: Record the count** in `docs/STATUS.md` (Test baseline).

- [ ] **Step 4: Commit**

```bash
git add app/e2e/smoke.mjs docs/STATUS.md
git commit -m "test(e2e): vividness slider, save on release and Enter, undo, journal washes, theme limit"
```

---

### Task 7: Spec, compatibility, review items and backlog (model: sonnet)

**Files:**
- Modify: `docs/spec.md` (§7.3, §7.10), `docs/compatibility.md` (format version 8 in the intro; the page colors
  paragraph), `docs/review.md` (new heading `## Custom color vividness`, items 46 to 50), `docs/backlog.md` (#72)

- [ ] **Step 1: Write the text**
  - spec §7.3: after the hue slider paragraph, describe the vividness slider:
    - a "Vividness" slider (50 to 200, 100 normal) under the hue slider, shown once a custom hue is in use or being
      picked;
    - its keys: arrows ±5, Page Up/Down ±25, Home/End;
    - Tab moves grid → hue → vividness;
    - Enter saves hue and vividness together, and a drag saves on release;
    - it is saved as `color:: hue <h> vivid <v>`, with `vivid 100` left out;
    - picking a name drops it, and undo brings it back;
    - when the theme softens the color for readability, the preview says "Softened here so text stays readable".
  - spec §7.10: vividness scales a custom hue's chroma and wash strength by `v/100` before the readability stepping,
    which starts from that strength and goes down to half of it (or half of the theme's strength, whichever is
    lower). At 100 nothing changes. The named colors have no vividness.
  - compatibility: format version 8. `color:: hue 212 vivid 150` is plain text in Obsidian and a page property in
    Logseq (not verified). Breccia versions before format 8 read it as no color and keep the line.
  - review.md (one item each, `N. [ ] **Title:** …`):
    46. **Vividness slider:** its look under the hue slider; that it is always shown and greyed out until a custom
        hue applies (or the hue slider is reached); the keys (arrows ±5, Page Up/Down ±25, Home/End, Enter, Tab order); dragging; and that
        only release or Enter writes `color:: hue <h> vivid <v>`.
    47. **Vividness in every theme:** sweep 50 to 200 in Light, Dark, Violet, Graphite, Taupe, Teal and System (both
        Windows modes). Check where the slider stops getting stronger (about 155 in Light, 125 in Teal for a blue),
        and that the 50 end is still visibly colored. Say if the range or the "normal" point feels wrong.
    48. **The "softened" note:** the wording "Softened here so text stays readable" and where it sits under the
        preview. Say if you want other words, a mark on the track instead, or no note.
    49. **Named color and back:** picking a named color drops the vividness and `Ctrl Z` brings it back. Reopening
        the picker on a named color starts the vividness at 100.
    50. **In the file:** `color:: hue 212 vivid 150`; `vivid 100` is never written. `vivid 300` and `vivid x` make no
        color and stay visible as text. A hand-written `HUE 212 VIVID 0150` stays as written until another color is
        picked. Older Breccia versions read a vividness as no color and keep the line.
  - backlog.md #72: the heading gets `(done <date>, plan 3)`, and the body gets one line naming the plan file.

- [ ] **Step 2: Check the docs**

Run: `cd app && npx vitest run scripts/docs.test.mjs` and `cargo test -p breccia-core format_doc::`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/spec.md docs/compatibility.md docs/review.md docs/backlog.md
git commit -m "docs: custom color vividness in the spec, the compatibility notes and the review list"
```

---

## Plan 2 follow-ups taken here

- 9 (no read test for a lone invalid hue): Task 1.
- 10 (`parseHue` rejection cases): Task 3.
- 11 (the sweep's info line): Task 4's new sweep logs nothing. The old line stays until a tidy-up.

The others stay open in `docs/plans/2026-11-07-02-custom-page-colors-followups.md`. Follow-up 5 (the slider does not
tell a screen reader it holds the saved color) now applies to both sliders and stays open.

## Finishing (controller)

`just test`, `just lint` and `just e2e`; then the follow-ups doc
`docs/plans/2026-11-09-03-custom-color-vividness-followups.md`, `docs/STATUS.md` (plan 3 row, Next), and the report
to the owner as `CLAUDE.md` describes.
