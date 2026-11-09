# Follow-ups of plans 1 to 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix what a user can see or do wrong in the page color features of plans 1 to 3 (the picker's preview, its
sliders, the right-click menu on journal links, the jump highlight and the selection on a colored row), with the tests
that guard each fix.

**Architecture:** No core change. Picker logic goes into `app/src/lib/pageColors.ts` (unit-tested), the link menu's
logic into `app/src/lib/linkColor.ts`; the components (`PageColorGrid`, `PageColorPicker`, `LinkColorMenu`) wire it.
The row looks are CSS rules in `app/src/styles/app.css`. Each fix gets an e2e assertion that fails before it.

**Tech Stack:** Svelte 5 + TypeScript, bits-ui (Popover, ContextMenu), Vitest (node environment, no DOM), Playwright
e2e over WebView2. No new dependency.

**Spec:** the three follow-up lists (`docs/plans/2026-11-07-01-page-colors-followups.md`,
`docs/plans/2026-11-07-02-custom-page-colors-followups.md`, `docs/plans/2026-11-09-03-custom-color-vividness-followups.md`),
this plan's "Owner decisions" and "Product questions", `docs/spec.md` §7.3, §7.4 and §7.10, and the designs and plans
of plans 1 to 3, which stay binding for everything this plan does not change.

## Owner decisions (2026-11-09)

1. **Scope:** take everything the user can see, plus the tests that guard those fixes: plan 1 items 1 to 6; plan 2
   items 2, 3, 4, 5 and 7; plan 3 item 10 and any other item that changes what a user sees or does; the guarding tests
   (plan 1 items 8 and 12, plan 3 item 8).
2. **Tidy-ups only where a task already touches the file:** plan 1 items 15, 16 and 18, plan 2 items 8 to 15, plan 3
   items 1 to 7, and docs line-wrapping.
3. **Not in this plan** (they need a product decision and stay in their lists): plan 2 item 1 (yellow-ish custom hues
   look olive) and plan 2 item 6 (a custom wash is opaque, the named washes are see-through). Plan 1 items 9 (scale
   measurement) and 19 (README section) are skipped.

4. **Plan review (2026-11-09):** the owner approved Q1 to Q8 as recommended, with no changes. They are binding.

## Product questions (recommendation first; all eight approved as recommended on 2026-11-09)

Each is binding as recommended unless the owner changes it. "Cost if wrong" is what changes later.

- **Q1. Where the focus goes after a pick from a journal link.** Today it drops to the page (nothing focused), so a
  keyboard user loses their place. *Recommended:* it returns to the link that was right-clicked (also when the menu
  or the picker is closed with Esc or a click outside). The link gets a keyboard-only focus ring; nothing else
  changes, and undo for the pick stays on the linked page (review item 31). *Alternatives:* (a) the same, and `Ctrl Z`
  on the focused link takes the pick back, like the page's swatch (more work: a key handler and an undo target for
  another page); (b) leave it as it is and drop the item. Cost if wrong: one function in `LinkColorMenu.svelte`.
- **Q2. The jump highlight on a colored row** (after a jump from a board card or a search result to a journal day).
  Today it fades to no color with small corners, then the color band snaps back. *Recommended:* it starts in the
  selection color and fades back to the band's own color, keeping the band's rounded ends. *Alternatives:* (a) a ring
  that pulses around the row over the band, which keeps the band's color the whole time; (b) no change. Cost if
  wrong: two CSS rules.
- **Q3. A selected row at a band's top or bottom.** Today the selection draws 4 px corners, so the band's 8 px end is
  lost on that row. *Recommended:* the selected row keeps the band's 8 px corners on the band's outer end (top of the
  first row, bottom of the last), and 4 px on its other corners, as every selection has today. *Alternatives:* (a) the
  selection takes the band's shape exactly (square corners inside a band); (b) 8 px corners on every corner of a
  selected colored row. Cost if wrong: two CSS rules.
- **Q4. What the preview shows while the pointer is inside the picker but not on a color** (the gaps between cells,
  the preview box, the labels, the greyed Vividness slider). Today it keeps the last color the pointer touched.
  *Recommended:* in the 4 px gaps between grid cells it keeps the last cell (so the preview does not flicker when the
  pointer crosses from cell to cell); everywhere else it shows the focused choice, exactly as when the pointer leaves
  the picker. During a slider drag it keeps following the slider. *Alternatives:* (a) any spot that is not a choice
  shows the focused choice, gaps included (simpler, but the preview blinks between cells); (b) no change. Cost if
  wrong: one function and its tests.
- **Q5. What the preview returns to when the pointer leaves.** Today: the focused choice, which is the saved color
  until a key moves the focus. *Recommended:* keep it (the spec says the preview follows the pointer, else the
  keyboard). *Alternative:* always the saved color, so the keyboard choice is only shown while no pointer has been in
  the picker. Cost if wrong: `previewColor` and its tests.
- **Q6. The link disappears while its picker is open** (the day is edited elsewhere, or the link's block is deleted).
  *Recommended:* the picker stays open where it is, and a pick still colors the page; when it closes, the focus goes to
  the page as today. *Alternative:* the picker closes. Cost if wrong: one branch.
- **Q7. What a screen reader hears on a slider that holds the page's saved color.** Today nothing tells it (the grid
  cells say "selected"). *Recommended:* the slider's value text ends with ", page color" while the slider stands at
  the saved custom color, for example "Hue 212, page color" and "Vividness 150, page color"; it drops the suffix as
  soon as the slider moves. With the readability note: "Vividness 200, page color, softened for readability".
  *Alternative:* ", selected", the word the grid cells use. Cost if wrong: two strings.
- **Q8. The slider thumbs at the ends.** Today the thumb hangs 4 px past the track at hue 0 and 359 (and at vividness
  50 and 200), and the track is 140 px against the grid's 136 px. *Recommended:* the thumb's middle travels from 4 px
  to 4 px before the track's end, so the thumb stays inside, and both tracks are exactly as wide as the grid. Pointer
  positions map the same way, so a click under the thumb leaves the value. *Alternative:* keep the thumb centred on
  the ends and give the track 4 px of room on both sides. Cost if wrong: one helper, two CSS lines.

**Ruled here, not a question:** plan 1 item 4 (keys inside the picker) is dropped. Checked 2026-11-09: every app-wide
shortcut (F1, `Ctrl K`, `Ctrl N`, `Ctrl ,`, `Ctrl Shift D`, `Alt ←/→`, zoom) is a capture-phase listener
(`App.svelte`, `keyCapture`) and still works with the picker open. The only bubble-phase document listener is the block
selection's (`multiSelect.svelte.ts`), which the picker shuts out on purpose (spec §7.3: a selection behind the picker
stays). Task 3 adds one comment in `app/src/lib/dom.ts` so a future app-wide shortcut goes into the capture phase.

## Pre-flight rulings (2026-11-09, binding; they override the task text where they differ)

Full table: `.superpowers/sdd/2026-11-09-04-followups-of-plans-1-3/preflight.md` (local).

- **R1 (Task 1):** the `isSavedCustom('HUE 212 VIVID 0150', 212, 150)` test cannot pass (`parseCustom` rejects capitals
  and leading zeros, and the core always sends the canonical string). Test canonical strings only (`hue 212 vivid
  150`, `hue 212`), and drop the "hand-written counts" sentence.
- **R2 (Task 2):** step 121's width check must be able to fail: `.pc-grid` stretches to the 140 px content width like
  `.pc-hue`. Measure the grid from the crimson cell's left edge to the amber cell's right edge, and compare the
  slider tracks with that.
- **R3 (Task 3):** step 122's "selection" check: on `native` the guard stops propagation, so a bubble listener on
  `window` records nothing, and a real right-click opens the WebView2 menu. Send a synthetic `contextmenu` event from
  `page.evaluate` at the point and read what `dispatchEvent` returns (false = no menu at the padding point, true =
  the browser menu is kept on the word).
- **R4 (Task 3):** `smoke.mjs` has no `pageerror` listener, and the Q6 focus after Esc is never checked. Step 122 adds
  and removes its own `page.on('pageerror')` and asserts the focus is not on an `a.link` after Esc.
- **R5 (Task 2):** dropping the sliders' `onpointerenter` also drops `reach(…, 'pointer')`, so hovering the hue slider
  would no longer enable Vividness. The root `pointerover` handler calls `reach` for the CUSTOM and VIVID indexes.
- **R6 (Task 1):** `App.svelte` uses `mac` 13 times. Use `import { isMac as mac }` in all three files, so only the
  declaration line changes.
- **R7 (Task 4):** changing step 116 leaves `const blueWash` unused. Delete it with the old assertion.
- **R8 (Task 2):** step 121's focus-on-open check already passes today (it guards a refactor). Keep it, and say in
  the report that it was green before the change.
- **R9 (Tasks 3, 4):** days 9 and 11 are not empty (setup writes `- day k` for days 4 to 63). Overwriting them is
  fine, as steps 113 to 120 do with days 5 to 8. Open the day with `showDay` first.
- **R10 (Task 1):** `thumbLeft` must build its 4 px and 8 px from `THUMB_W`, not hard-code them. Also: Task 1
  adjusts the old `hueAt`/`vividAt` tests; step 121 waits for the "page color" value text; Task 3 commits the `dom.ts`
  comment on its own; Task 5 alone writes the STATUS test count.

## Global Constraints

- No core change and no notes-file format change. Files Breccia does not change stay byte-identical; a pick changes
  only the linked page's `color::` line (spec §2, §4).
- No colour literals or `color-mix` outside `app/src/styles/tokens.css` (a test checks it).
- Logic that needs tests goes into `app/src/lib/` (Vitest runs in node, without a DOM; `App.svelte` and components
  have no unit-test harness).
- Every test must be able to fail: capture the RED run before the fix. A test that pins behaviour which already holds
  (plan 3 item 8) must be shown to fail by a temporary mutation of the code, noted in the task report.
- e2e: new steps 121 to 123, after step 120 and before step 45, reusing the helpers of steps 112 to 120 (`swatch`,
  `picker`, `option`, `slider`, `vslider`, `previewBox`, `previewWash`, `bgProbe`, `bgOf`, `washesOf`, `rowsWith`,
  `showDay`, `clickRow`, `focusedTestId`, `frames`, `readAt`, `expectFile`). Assert the bytes on disk where a file
  changes; wait for states, never sleep. Before using a journal day, grep `smoke.mjs` for `dayKey(n)`; take free days
  (9 and 11 look free; `dayKey(10)` is used as a link in step 83).
- Expected e2e count after the plan: 183 PASS lines (176 + 3 step lines + 4 `expectFile` lines). The counted number
  is the rule; record it in `docs/STATUS.md`.
- Commits: conventional subjects, one change per commit. `fix`/`feat` subjects are changelog lines in plain user words
  (no code names, paths, item or task numbers, at most about 90 characters, no trailing period). Tests, docs and
  tidy-ups use `test`, `docs`, `refactor` or `chore`. No attribution lines. Commit on `main` and push after each
  commit.
- `docs/review.md` items for this plan are 51 to 58, under a new heading `## Follow-ups of plans 1 to 3`.

## Review Focus

- **The same page linked twice in one block.** The picker opened on the second link must stay at the second link
  after the day is re-sent, and the focus must return to it. Pinned in Task 3 (step 122's journal has a block with two
  links to the same page; the picker is opened on the second).
- **The link vanishes while its picker is open** (Q6). No error, the picker stays, a pick still writes the page, and
  Esc leaves the focus on the page. Pinned in Task 3 (step 122, last part).
- **A slider drag that crosses the gaps or the preview box.** The preview must keep following the dragged slider, not
  fall back to the focused choice. Pinned in Task 1 (`pointerHover` keeps the slider while `dragging`) and Task 2
  (step 121 drags the hue slider down over the preview box).
- **The link is replaced when its block's text is changed from outside.** A pick re-sends the day but keeps the link
  element; another program editing the block's text (the block keeps its ID) draws its links anew. An open picker
  must move to the new link, and a focus returned to the link must pass to the new one. Pinned in Task 3 (step 122
  edits the block's text on disk once while the picker is open and once after a pick).
- **Right-click on selected text that is a colorable link.** The color menu still wins (spec §7.4); on selected plain
  text the browser menu stays. Pinned in Task 3 (`linkMenuAction` tests kept; step 122 right-clicks the selected text).

---

## Follow-up items: where each one goes

| List | Item | Here |
|---|---|---|
| Plan 1 | 1 focus after a pick from a link | Task 3 (Q1) |
| Plan 1 | 2 stale picker position | Task 3 |
| Plan 1 | 3 loose selection check | Task 3 |
| Plan 1 | 4 keys inside the picker | dropped (ruled above); one comment in Task 3 |
| Plan 1 | 5 flash on a washed row | Task 4 (Q2) |
| Plan 1 | 6 selection corners | Task 4 (Q3) |
| Plan 1 | 8 no e2e pick from a link on a day page | Task 3 (step 122) |
| Plan 1 | 12 selection check compares with a probe | Task 4 (step 116) |
| Plan 1 | 16 `isMac` copied three times | Task 1 (the picker file is touched) |
| Plan 1 | 18 long lines | Task 1 (`pageColors.ts`), Task 5 (`docs/spec.md` §7.4, `docs/review.md` item 31); `docs/format.md` left |
| Plan 1 | 9, 10, 11, 13, 15, 19 | left in the list |
| Plan 2 | 2 stale link-menu picker position | Task 3 (same fix as plan 1 item 2) |
| Plan 2 | 3 preview keeps the last hovered cell | Task 1, Task 2 (Q4) |
| Plan 2 | 4 focus on open depends on frame order | Task 2 (swatch), Task 3 (link) |
| Plan 2 | 5 the slider does not say it holds the saved color | Task 1, Task 2 (Q7) |
| Plan 2 | 7 the slider thumb hangs past the track | Task 1, Task 2 (Q8) |
| Plan 2 | 9, 10 | already done in plan 3 (Task 1 and Task 3 there); struck through in Task 5 |
| Plan 2 | 15 long lines | Task 5 (`docs/spec.md` §7.3, `docs/review.md`); `docs/format.md` left |
| Plan 2 | 1, 6 | left (owner decision) |
| Plan 2 | 8, 11, 12, 13 | left (files not touched) |
| Plan 2 | 14 preview font copied | left: the picker's `.menu` font is 13.5 px, so inheriting would shrink the sample; a body-font token is a separate change |
| Plan 3 | 8 extra `pickerTab` case | Task 1 |
| Plan 3 | 10 greyed slider's preview | Task 1, Task 2 (Q4) |
| Plan 3 | 1 to 7, 9 | left (files not touched or tidy-up only) |
| Plan 3 | 11 `recolor` replaces an invalid first `color::` line | left: documented behaviour (`docs/format.md` §8); changing it is a product decision |

---

### Task 1: Picker logic (model: sonnet)

**Files:**
- Modify: `app/src/lib/pageColors.ts`, `app/src/lib/pageColors.test.ts`
- Create: `app/src/lib/platform.ts` (one export)
- Modify: `app/src/components/PageColorPicker.svelte`, `app/src/App.svelte`, `app/src/editor/blockEditor.ts` (the
  three `const mac = …` lines become imports of `isMac`; nothing else in those files)

**Interfaces:**
- Produces (in `pageColors.ts`, used by Task 2):
  - `export const THUMB_W = 8` — the slider thumb's width in px (matches `.pc-hue-thumb`).
  - `export function thumbLeft(f: number): string` — CSS `left` for a thumb at fraction `f` (0 to 1) of the track:
    `calc(4px + (100% - 8px) * <f>)`, `f` clamped to 0..1 and written with at most 4 decimals.
  - `hueAt(x, width)` and `vividAt(x, width)` keep their signatures but map the inset travel: `x` is measured from
    `THUMB_W / 2`, over `width - THUMB_W` (a width at or below `THUMB_W` gives 0 / `MIN_VIVID`).
  - `export function pointerHover(on: number | null, inGrid: boolean, prev: number | null, dragging: number | null): number | null`
    — the picker's new `hover` after the pointer moves over something: `dragging` wins when not null; else `on` (the
    `data-index` of an enabled choice under the pointer) when not null; else `prev` when `inGrid` and `prev` is a grid
    cell (`prev < NO_COLOR`); else null.
  - `export function isSavedCustom(color: string | null, hue: number, vivid: number): boolean` — `parseCustom(color)`
    is not null and has this hue and vividness (so a hand-written `HUE 212 VIVID 0150` counts).
  - `export function hueValueText(hue: number, saved: boolean): string` — `Hue 212`, or `Hue 212, page color`.
  - `export function vividValueText(vivid: number, saved: boolean, limited: boolean): string` — `Vividness 150`,
    then `, page color` when saved, then `, softened for readability` when limited.
- Produces (in `platform.ts`): `export const isMac: boolean` (the existing navigator test, unchanged).

- [ ] **Step 1: Write the failing tests** in `pageColors.test.ts`:
  - `thumbLeft`: `thumbLeft(0)` = `calc(4px + (100% - 8px) * 0)`, `thumbLeft(1)` ends `* 1)`, `thumbLeft(2)` equals
    `thumbLeft(1)`, `thumbLeft(-1)` equals `thumbLeft(0)`, `thumbLeft(212 / 359)` ends `* 0.5905)`.
  - `hueAt` with the inset, on a 136 px track: `hueAt(4, 136)` = 0, `hueAt(0, 136)` = 0, `hueAt(132, 136)` = 359,
    `hueAt(136, 136)` = 359, `hueAt(68, 136)` = 180, `hueAt(5, 8)` = 0. `vividAt(4, 136)` = 50,
    `vividAt(132, 136)` = 200, `vividAt(68, 136)` = 125. (Today `hueAt(132, 136)` gives 348: RED.)
  - `pointerHover`: `(3, false, null, null)` → 3; `(null, true, 3, null)` → 3 (a gap keeps the cell);
    `(null, true, NO_COLOR, null)` → null; `(null, false, 3, null)` → null (preview box, labels, greyed slider);
    `(null, false, 3, CUSTOM)` → `CUSTOM`; `(3, true, null, VIVID)` → `VIVID`.
  - `isSavedCustom`: `('hue 212', 212, 100)` true; `('HUE 212 VIVID 0150', 212, 150)` true; `('hue 212', 213, 100)`
    false; `('hue 212 vivid 150', 212, 100)` false; `('red', 200, 100)` false; `(null, 200, 100)` false.
  - `hueValueText(212, false)` = `Hue 212`, `hueValueText(212, true)` = `Hue 212, page color`;
    `vividValueText(200, true, true)` = `Vividness 200, page color, softened for readability`,
    `vividValueText(150, false, false)` = `Vividness 150`.
  - Plan 3 item 8, in `describe('pickerTab')`: `pickerTab(VIVID, false, NO_COLOR, true)` = `NO_COLOR` and
    `pickerTab(VIVID, true, NO_COLOR, true)` = `CUSTOM`.
- [ ] **Step 2: Run them and see them fail**
  Run: `cd app && npx vitest run src/lib/pageColors.test.ts`
  Expected: FAIL (missing exports; `hueAt(132, 136)` is 348). The two `pickerTab` cases pass on today's code: show
  they can fail by temporarily making `pickerTab(VIVID, false, …)` return `CUSTOM`, note it in the report, revert.
- [ ] **Step 3: Implement** the exports above in `pageColors.ts`; wrap its ~120-character line (plan 1 item 18).
  Create `platform.ts` with `isMac`, and replace the three copies with imports (plan 1 item 16).
- [ ] **Step 4: Run the tests**
  Run: `cd app && npx vitest run src/lib/pageColors.test.ts` → PASS; then `just lint` → clean.
- [ ] **Step 5: Commit** — `refactor(app): picker helpers for hover, slider value text and thumb travel` (the
  `isMac` move as its own commit: `refactor(app): one Mac check for the whole frontend`).

---

### Task 2: The picker: preview, sliders and focus on open (model: opus)

**Files:**
- Modify: `app/src/components/PageColorGrid.svelte` (and its top comment), `app/src/components/PageColorPicker.svelte`,
  `app/src/styles/app.css` (the `.pc-*` rules only)
- Modify: `app/e2e/smoke.mjs` (new step 121; the "steps 112 to 120" comment becomes "112 to 123")

**Interfaces:**
- Consumes: `THUMB_W`, `thumbLeft`, `hueAt`, `vividAt`, `pointerHover`, `isSavedCustom`, `hueValueText`,
  `vividValueText` (Task 1).
- Produces: no new test ids. The sliders' `aria-valuetext` follows Q7.

Behaviour to build:
- **Preview (plan 2 item 3, plan 3 item 10, Q4):** on the picker root, a `pointerover` handler sets
  `hover = pointerHover(on, inGrid, hover, dragging)`, where `on` is the `data-index` of
  `e.target.closest('[data-index]')` when that choice is enabled (the greyed vividness slider has
  `pointer-events: none`, so its wrapper is the target and `on` is null) and `inGrid` is
  `!!e.target.closest('.pc-grid')`. The cells' and sliders' own `onpointerenter` handlers may then go; the root's
  `onpointerleave` (hover null) and the keys clearing `hover` stay. A slider's `reach(…, 'pointer')` still sets
  `customSeen`.
- **Value text (plan 2 item 5, Q7):** hue slider `aria-valuetext={hueValueText(hue, saved)}`, vividness slider
  `vividValueText(vivid, saved, limited)`, with `saved = isSavedCustom(color, hue, vivid)`.
- **Thumbs and track width (plan 2 item 7, Q8):** both thumbs use `style:left={thumbLeft(f)}` (hue `hue / 359`,
  vividness `(vivid - 50) / 150`). Find why the tracks are 140 px while the grid is 136 px (measure in `just dev`) and
  make both tracks exactly the grid's width with no colour literal; the picker's width must not change otherwise.
- **Focus on open (plan 2 item 4):** `PageColorPicker`'s `Popover.Content` gets
  `onOpenAutoFocus={(e) => e.preventDefault()}`, so bits-ui never moves the focus; the grid's mount focus and its
  one-frame retry stay as they are.

- [ ] **Step 1: Write the failing e2e step 121** (after 120, before 45). `Hue 121` page with `"- hue\n"`, opened from
  the sidebar; Light theme set at the start, deleted at the end.
  - Click the swatch. Hover `option('red')`: `data-preview` = `red`. Move the pointer to the middle of the gap between
    `red` and the next cell in its row (midpoint of the two boxes): still `red`. Move to the middle of the preview box:
    `data-preview` = `''` (the focus is on "No color"). RED today: stays `red`.
  - Hover `red` again, move in one step (so the pointer never crosses the hue slider, which would enable the
    vividness slider) to the centre of the greyed `page-color-vivid` (`aria-disabled="true"`): `''`. RED today.
  - Thumbs: the `.pc-hue` track's width equals the `.pc-grid` width (both from `boundingBox`). `ArrowDown` to the hue
    slider, `Home`: the thumb's left ≥ the track's left; `End`: the thumb's right ≤ the track's right (±0.5 px). RED
    today (4 px out, 140 vs 136).
  - Drag across the preview: press on the hue slider's centre, move down to the preview box's centre in 6 steps:
    `data-preview` stays a `hue …` value; move back up and release on the track at its 4 px point: `data-preview` =
    `hue 0`. `expectFile('121 a drag saves hue 0', 'color:: hue 0\n- hue\n', …)`.
  - Value text: the hue slider's `aria-valuetext` = `Hue 0, page color`; press `ArrowRight`: `Hue 1`. `Tab` to the
    vividness slider: `Vividness 100` (the hue moved, so it is not the saved color). `Escape`.
  - Focus on open: click the swatch, wait for the picker, then `frames()` twice: `focusedTestId()` is still
    `page-color-hue` (the saved hue). `Escape`, then `expectFile('121 Esc writes nothing', 'color:: hue 0\n- hue\n', …)`.
  - Back to the journal; print `PASS 121 the preview follows only the colors under the pointer, the thumbs stay in their tracks, and the sliders say when they hold the page color`.
- [ ] **Step 2: Run it and see it fail**
  Run: `just e2e`
  Expected: FAIL at "121 … preview box" (`red` instead of `''`).
- [ ] **Step 3: Build it** as described; update `PageColorGrid.svelte`'s top comment (the preview between cells, the
  value text).
- [ ] **Step 4: Run** `just test`, `just lint`, `just e2e` → all pass.
- [ ] **Step 5: Commit**, one change each:
  - `fix(app): Page colors: the preview no longer keeps a color the pointer has left`
  - `fix(app): Page colors: the slider thumbs stay inside their tracks`
  - `fix(app): Page colors: screen readers hear when a slider stands on the page's color`
  - `refactor(app): the swatch's picker starts its own focus` (the `onOpenAutoFocus` change)
  - `test(e2e): picker preview, thumbs, slider value text and focus on open`

---

### Task 3: The link menu: focus, position and selection (model: opus)

**Files:**
- Modify: `app/src/components/LinkColorMenu.svelte` (and its top comment), `app/src/lib/linkColor.ts`,
  `app/src/lib/linkColor.test.ts`, `app/src/lib/dom.ts` (one comment)
- Modify: `app/e2e/smoke.mjs` (new step 122)

**Interfaces:**
- Produces (in `linkColor.ts`):
  - `export interface Box { left: number; top: number; right: number; bottom: number }`
  - `export function pointInBoxes(x: number, y: number, boxes: readonly Box[]): boolean` — edges included.
  - `export interface LinkSpot { block: string; page: string; nth: number }` — a link's place: its row's
    `data-block-id`, its `data-page`, and its index among that row's `a.link, a.tag` with the same `data-page`.
  - `export function spotOf(a: Element): LinkSpot | null` and
    `export function findSpot(zone: Element, spot: LinkSpot): HTMLElement | null` — DOM helpers (no unit test: Vitest
    has no DOM; step 122 covers them).

Behaviour to build:
- **Selection check (plan 1 item 3):** the guard's `onSelection` is true only when the right-click point
  (`e.clientX`, `e.clientY`) lies in one of the selection's range rectangles (`getClientRects()` of each range):
  `pointInBoxes`. `linkMenuAction` is unchanged.
- **Position (plan 1 item 2, plan 2 item 2):** on "Color…", remember `spotOf(anchor)`. While the picker is open, a
  `MutationObserver` on the zone (`childList`, `subtree`) re-finds the link with `findSpot` when `anchor` is no longer
  connected and sets `anchor` to it, so the popover moves (`customAnchor`). Not found: keep the old anchor (Q6).
  Disconnect the observer when nothing needs it (see the next point).
- **Focus (plan 1 item 1, Q1):** both `onCloseAutoFocus` handlers (the menu's, when it closes without "Color…", and
  the picker's) prevent the default and focus the link (`tabindex="-1"` set on it first, `preventScroll`). A pick
  re-sends the day after the picker closed and replaces the link: keep the observer running while the focus that was
  given back is pending, and when the focused link is replaced (`document.activeElement` is `body`), focus the
  re-found one the same way. Stop on the next `pointerdown` or `focusin` elsewhere. A link `a.link:focus-visible,
  a.tag:focus-visible` gets the accent outline (in `app.css`, next to the link rules) if it has none.
- **Focus on open (plan 2 item 4):** the picker's `Popover.Content` gets `onOpenAutoFocus={(e) => e.preventDefault()}`.
- **Keys (plan 1 item 4, dropped):** in `dom.ts`, the `keyCapture` doc line says that app-wide shortcuts belong there,
  because the page color picker stops every key at the bubble phase.

- [ ] **Step 1: Write the failing unit tests** in `linkColor.test.ts`: `pointInBoxes(5, 5, [{left: 0, top: 0, right:
  10, bottom: 10}])` true; `(10, 10, same)` true (edges); `(11, 5, same)` false; `(5, 5, [])` false; two boxes, a point
  in the second only: true.
- [ ] **Step 2: Write the failing e2e step 122.** Pages `Tone 122.md` = `"color:: blue\n- t\n"`; journal
  `journals/${dayKey(9)}.md` = `"- first [[Tone 122]]\n- twice [[Tone 122]] and [[Tone 122]]\n- plain words\n"`.
  - **Pick from a day page (plan 1 item 8):** open the day from the feed (its title). Right-click the second
    `Tone 122` link of row 1, choose "Color…", pick `green`. `expectFile('122 a pick on a day page writes the page',
    'color:: green\n- t\n', …)`. Wait for `washesOf(rows)` = `green green -`. The focused element is an `a.link` in
    row 1, and it is the second of the two (`[…row.querySelectorAll('a.link')].indexOf(document.activeElement) === 1`).
    RED today: focus is on `body`.
  - **Menu closed with Esc:** right-click the same link, `Escape`: the focus is on that link.
  - **Position after a re-send:** right-click the same link, choose "Color…". Write the journal file with two new
    blocks above: `"- new one\n- new two\n" + <the old text>`. Wait for 5 rows. The picker's top is within 2 px of
    the link's bottom + 4 (`sideOffset`), and `align="start"`: its left within 2 px of the link's left. RED today (the
    picker stays at the old place). Pick `teal`: `expectFile('122 a pick after a re-send writes the page',
    'color:: teal\n- t\n', …)`; the focused element is again the second link of the row `twice …`.
  - **Selection (plan 1 item 3):** install a test listener on `window` (bubble phase) that records
    `e.defaultPrevented` and then calls `preventDefault()` (so no native menu opens). Select the text of the row
    `first …` (its `.content`) with a `Range` (`page.evaluate`). Right-click that row itself 2 px below its top edge
    (the band's top padding, outside the text, so the target is the `.block` that contains the selection): recorded
    `true` (no menu). RED today: `false` (`containsNode(el, true)` holds for an ancestor of the selection).
    Right-click on the selected word `first`: recorded `false` (browser menu kept). Remove the listener and clear the
    selection.
  - **Link gone while open (Q6):** right-click the link of the row `first …`, "Color…", then write the journal without
    that block.
    Wait for the row count to drop. The picker is still open; `Escape`; nothing throws (no `pageerror` since the step
    began); the page `Tone 122.md` is unchanged (`readAt`).
  - Back to the journal; print `PASS 122 a pick from a link on a day page, the focus back on the link, the picker following its link, and no menu beside a selection`.
- [ ] **Step 3: Run both and see them fail**
  Run: `cd app && npx vitest run src/lib/linkColor.test.ts` → FAIL (no `pointInBoxes`); `just e2e` → FAIL at the
  first focus check of 122.
- [ ] **Step 4: Build it** as described; update `LinkColorMenu.svelte`'s top comment.
- [ ] **Step 5: Run** `just test`, `just lint`, `just e2e` → all pass.
- [ ] **Step 6: Commit**, one change each:
  - `fix(app): Page colors: after a color pick from a journal link, the focus returns to the link`
  - `fix(app): Page colors: the picker stays at its link when the journal day changes`
  - `fix(app): Journal: a right-click beside selected text no longer opens the browser menu`
  - `refactor(app): the link's picker starts its own focus` (with the `dom.ts` comment)
  - `test(e2e): link menu on a day page, focus return, picker position and selection check`

---

### Task 4: Highlight and selection on a colored row (model: sonnet)

**Files:**
- Modify: `app/src/styles/app.css` (`.block.flash`, `@keyframes flash`, `.block.selected` and the wash rules)
- Modify: `app/e2e/smoke.mjs` (new step 123; step 116's selection check)

**Interfaces:** none (CSS only).

Rules to build (Q2, Q3):
- `@keyframes flash` ends on `var(--wash, transparent)`, so a colored row fades back to its band.
- The flash's 4 px radius applies only to rows without a wash (`.block.flash:not(.wash)`); a washed row keeps its band
  corners while it flashes.
- After `.block.selected`, `.block.selected.wash-top` keeps 8 px top corners and `.block.selected.wash-bottom` 8 px
  bottom corners; other corners stay 4 px.
- No colour literal; the existing comment above the wash rules gets one line about the flash and the selection.

- [ ] **Step 1: Write the failing e2e step 123** and change step 116.
  - Step 116 (plan 1 item 12): replace `bgOf(rows116.nth(5)) !== blueWash` with an equality against
    `await bgProbe('var(--hover)')`. This passes today (it pins the selection colour); show it can fail by probing
    `var(--card)` once, note it in the report, revert.
  - Step 123: `Tone 123.md` = `"color:: blue\n- t\n"`; `journals/${dayKey(11)}.md` =
    `"- [[Tone 123]] flashword123\n- [[Tone 123]] second\n- plain\n"` (grep first; take a free day).
  - Search (`openSearch`, fill `flashword123`, Enter): the day page opens, and `.flash` holds `flashword123`.
  - While it flashes, in one `evaluate` right after `.flash` appears (the app removes the class after 1.5 s): that
    row's `borderTopLeftRadius` = `8px` (RED: `4px`); pause its animation (`el.getAnimations()[0]`), set
    `currentTime` to 1499 and read the background: within 3 per channel of the row's wash (a probe of the row's
    computed `--wash`, as `bgProbe` does). RED: near transparent. Then `finish()` the animation.
  - Selection: `clickRow` row 0, Shift `clickRow` row 1: two `.block.selected`. Row 0's `borderTopLeftRadius` and
    `borderTopRightRadius` = `8px`, its `borderBottomLeftRadius` = `4px`; row 1's `borderBottomLeftRadius` = `8px`
    (RED: `4px`). Both backgrounds equal `bgProbe('var(--hover)')`. `Escape`: the selection is gone.
  - No file changes in this step: assert the journal bytes are unchanged (`readAt`).
  - Back to the journal; print `PASS 123 the jump highlight and a selection keep a colored row's band corners, and the highlight fades back to the band`.
- [ ] **Step 2: Run** `just e2e` → FAIL at the 123 radius check.
- [ ] **Step 3: Write the rules.**
- [ ] **Step 4: Run** `just test`, `just lint`, `just e2e` → all pass. Count the PASS lines.
- [ ] **Step 5: Commit**, one change each:
  - `fix(app): Journal: a jump highlight on a colored row fades back to its color`
  - `fix(app): Journal: a selected row keeps the rounded ends of its color band`
  - `test(e2e): jump highlight and selection on a colored row`

---

### Task 5: Spec, review items, follow-up lists (model: sonnet)

**Files:**
- Modify: `docs/spec.md` (§7.3, §7.4), `docs/review.md`, the three follow-up lists, `docs/STATUS.md` (Test baseline
  count from Task 4)

- [ ] **Step 1: Spec.** §7.3: the preview follows the color under the pointer (between two grid colors, the last
  one), else the focused one; a slider at the page's saved color says so to a screen reader. §7.4, "Color from a
  link": when the menu or the picker closes, the focus is on the link again; the picker stays at its link when the day
  changes while it is open. §7.4, "Page color washes": the jump highlight and a selection keep a band's rounded ends,
  and the highlight fades back to the band's color. Rewrap the lines of §7.3 and §7.4 that pass ~120 columns (plan 1
  item 18, plan 2 item 15) without changing their words.
- [ ] **Step 2: Review items** under `## Follow-ups of plans 1 to 3`, each `N. [ ] **Title:** …` with what to try and
  "say if" for the open choice:
  - 51 **Preview inside the picker** (Q4, Q5): the gaps keep the last cell; the preview box, labels and greyed slider
    show the focused choice; leaving the picker too.
  - 52 **Slider thumbs** (Q8): at 0 and 359, 50 and 200 the thumb stays inside; both tracks as wide as the grid.
  - 53 **Screen reader on the sliders** (Q7): "Hue 212, page color" with Narrator; say if "selected" reads better.
  - 54 **Focus after a pick from a link** (Q1): right-click, Color…, pick or Esc; the focus is on the link (Tab moves
    on from there); say if `Ctrl Z` there should undo.
  - 55 **The picker follows its link** when the day changes (edit the day file in another editor while the picker is
    open), and stays put if the link is deleted (Q6).
  - 56 **Right-click beside a selection**: with text selected, a right-click on empty space in the journal opens no
    menu; on the selected text the browser menu stays.
  - 57 **Jump highlight on a colored row** (Q2): jump from a card or a search result to a colored journal block.
  - 58 **Selected row at a band's end** (Q3): select the first or last row of a band.
  Rewrap item 31 (plan 1 item 18) and any other line over ~120 columns in the file, without changing words.
- [ ] **Step 3: Follow-up lists.** Strike through each item this plan finished, as the earlier lists do
  (`~~…~~ Done in plan 4 (…).`), using the table above: plan 1 items 1, 2, 3, 5, 6, 8, 12, 16; item 4 struck as
  `Dropped in plan 4: every app-wide shortcut is capture-phase.`; item 18 noted as partly done (format.md left).
  Plan 2 items 2, 3, 4, 5, 7 (plan 4) and 9, 10 (`Done in plan 3`); item 15 partly done. Plan 3 items 8 and 10.
  Leave every other item as it is.
- [ ] **Step 4: Check the docs**
  Run: `cd app && npx vitest run scripts/docs.test.mjs` and `cargo test -p breccia-core format_doc::` → PASS.
- [ ] **Step 5: Commit** — `docs: plan 4 follow-ups in the spec, the review list and the follow-up lists`.

---

## Finishing (controller)

`just test`, `just lint` and `just e2e` (expected 183 PASS lines; the counted number is the rule). Then this plan's
follow-ups doc `docs/plans/2026-11-09-04-followups-of-plans-1-3-followups.md`, `docs/STATUS.md` (plan 4 row, Next,
Test baseline), and the report to the owner as `CLAUDE.md` describes, with every ruling and what it costs if wrong.
