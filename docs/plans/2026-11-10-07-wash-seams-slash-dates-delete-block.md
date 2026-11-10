# Wash seams, slash dates, delete a block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No faint lines between the rows of a page color wash at zoom 110 % and 125 % (backlog #75); "Today" and
"Yesterday" in the slash menu (#77); a keyboard shortcut that deletes the whole block (#78).

**Architecture:** #75 is measured first: the e2e run takes device-pixel screenshots across row boundaries inside a
band and decodes them with a small PNG reader (no new dependency); the fix then lives in `tokens.css` and `app.css`
only. #77 is a pure change in `lib/slash.ts` plus an icon passed through the caret menu. #78 adds one core command,
`block.delete` (one undo step; it never leaves a page without a block), a key in `lib/keys.ts`, and a pure
`deleteFocus` that says where the caret goes; `EditorHost` carries it out.

**Tech Stack:** Rust 1.90 (core), Svelte 5 + TypeScript, CodeMirror 6, Vitest, Playwright over WebView2 (e2e),
`node:zlib` for the PNG reader.

**Spec:** `docs/backlog.md` #75, #77, #78; `docs/spec.md` §7.2 (keys, slash menu) and §7.3 (page color);
`docs/audit/2026-11-10/notes.md` (its rules are invariants here); this plan's "Product questions".

## Code against the backlog (checked 2026-11-10 at `5fc2d1b`)

- **#75, how a wash is drawn:** confirmed. Every row draws its own background (`.block.wash`, `app/src/styles/app.css:136`);
  the band is only rows without gaps between them (`washRows`, `app/src/lib/pageColors.ts:278`). Named washes are
  see-through (`color-mix(… var(--pc-wash), transparent)`, `tokens.css:444`–`468`); custom washes are opaque hex
  colors already blended over the theme's background (`customShade`, `app/src/lib/customColor.ts:129`). This is
  follow-up 6 of plan 2.
- **#75, zoom:** Breccia's zoom is the WebView's own zoom (`getCurrentWebview().setZoom`, `App.svelte:262`), with
  steps 110 and 125 (`app/src/lib/zoom.ts:5`). It changes `devicePixelRatio`, so row edges fall between device
  pixels; that is where the seam must be looked for. The existing screenshot tool takes `scale: 'css'`
  (`app/e2e/screenshots.mjs`), which would hide a one-device-pixel seam, and `app/e2e/png.mjs` reads only a PNG's
  size. Nothing in the repo reads pixels yet.
- **#77, "typing date still finds both":** the menu matches the start of any word of the label (`matches`,
  `app/src/lib/slash.ts:14`). "Today's date" is found by "date" only through its second word; renamed to "Today" it
  would not be. The items need search words besides their label.
- **#77, "the same icon as next to the Journal button":** there are two. The Journal row starts with an emoji
  `📅` (`app/src/components/Sidebar.svelte:189`); the date picker's button at the right end of that row is a drawn
  calendar in `currentColor` (`app/src/components/DatePicker.svelte:76`–`80`). Q5 asks which.
- **#77, today:** the slash date comes from the window's clock (`new Date()`, `app/src/editor/slash.ts:25`), not the
  core's `Clock.today`. Both read the same local clock (`App::clock`, `app/src-tauri/src/lib.rs:391`) except under
  `BRECCIA_TODAY` (the e2e hook), which only the core sees. Ruling: keep the window's clock (as "Today's date" does
  now); compute yesterday by calendar day with the UTC helpers of `lib/calendar.ts` (`dayKey`, `addDays`), so a
  daylight saving change or a month or year end never gives a wrong day. Step 129 reads the expected days from the
  same local clock, not from the run's fixed `today`. Cost if wrong: one hook to read the core's today instead.
- **#78, today's delete paths:** `Backspace` in an empty block is a merge (`block.merge`): the block goes and its
  children move under the previous block (`Document::merge_into_previous`, `crates/core/src/edit.rs:225`), the caret
  goes to the end of the previous block in file order. Deleting selected blocks (`blocks.delete`,
  `app/src/editor/multiSelect.svelte.ts:89`) removes each block with all its children (`Document::delete`,
  `edit.rs:330`) and answers without a caret position.
- **#78, undo:** `Ctrl Z` works only while a block is edited (`lib/keys.ts`) or blocks are selected
  (`lib/selection.ts`); with nothing edited or selected it does nothing. So if editing ended after the delete, `Ctrl Z`
  could not bring the block back from the keyboard. Q3 and Q5 are decided with that in mind.
- **#78, key collisions** (every handler: `lib/keys.ts` `decide`, `isSearchKey`, `isSettingsKey`, `isNewPageKey`,
  `isHelpKey`, `isDatePickerKey`, `navKey`; `lib/zoom.ts` `zoomKey`; `lib/selection.ts`; `lib/calendar.ts`
  `pickerKey`; `lib/pageColors.ts` `swatchKey`; `lib/graph.ts`; `editor/menu.ts`; CodeMirror's `defaultKeymap`
  6.11.1, which `blockEditor.ts:150` installs; the shell has no accelerators):
  - `Ctrl Shift K`: no Breccia handler (`isSearchKey` requires no Shift). CodeMirror's default keymap binds it to
    "delete the current line of the block" (`Shift-Mod-k: deleteLine`), which Breccia does not list anywhere; the new
    key would replace it (the editor's key handler runs before the keymap, `Prec.highest`).
  - `Ctrl Shift Backspace`: free in Breccia and in CodeMirror (only `Ctrl Backspace`, delete a word, is bound).
  - `Ctrl Shift Delete`: free in Breccia, but Chromium browsers use it for "Clear browsing data"; whether WebView2
    passes it to the page was not checked. Not offered.

## Product questions (open: owner decides)

Each question lists the options with the recommendation first. The tasks below are written for the
recommendations; where an answer changes a task, the question says which.

- **Q1. The key that deletes the whole block** (#78). *Open: owner decides.*
  (a, recommended) `Ctrl Shift K` (`Cmd Shift K` on a Mac): the key VS Code uses to delete a line; it replaces an
  unlisted CodeMirror key that deletes one line inside the block. (b) `Ctrl Shift Backspace`: free everywhere, but
  close to `Ctrl Backspace` (delete a word), so a slip deletes a block instead of a word. (c) Both keys. Cost if
  wrong: one line in `decide`, one in `selectionAction`, the list entry, step 130.
- **Q2. The block's children** (#78). *Open: owner decides.*
  (a, recommended) They go with it, as when you select a block and press `Delete`; one `Ctrl Z` brings all back.
  (b) They stay and move up one level into the deleted block's place. (c) They go with it, but only after a question
  (see Q4). Cost if wrong: (b) needs a new core edit (`Document::delete_lifting`) and other e2e bytes.
- **Q3. Where the caret goes after the delete** (#78). *Open: owner decides.*
  (a, recommended) To the end of the block shown just above it on the same page (as `Backspace` in an empty block
  does); for the first block of a page, to the start of the block that takes its place. (b) To the start of the block
  that takes its place (as VS Code); for the last block, to the end of the one above. (c) Editing ends and nothing is
  selected (then `Ctrl Z` needs a click into the page first). Cost if wrong: one function, `deleteFocus`.
- **Q4. A confirmation** (#78). *Open: owner decides.*
  (a, recommended) Never; `Ctrl Z` brings the block back. (b) Only when the block has children: "Delete this block
  and its N sub-blocks?". (c) Never, but a short notice "Block deleted. Ctrl Z brings it back." Cost if wrong: (b) is a
  dialog and a pure function for its text; (c) one notice.
- **Q5. The only block of a page or of a journal day** (#78). *Open: owner decides.*
  (a, recommended) The block stays but is emptied (its text and its children go), with the caret in it, so `Ctrl Z`
  still works from the keyboard. (b) The block goes and the page shows "Start writing" (the day's file keeps no
  block); `Ctrl Z` then needs a click into the page first. Cost if wrong: one branch in the core and in
  `deleteFocus`.
- **Q6. The key on selected blocks** (#78). *Open: owner decides.*
  (a, recommended) It also deletes the selected blocks, as `Backspace` and `Delete` do there. (b) Only while editing.
  Cost if wrong: one line in `selectionAction`.
- **Q7. An icon next to "Today" and "Yesterday"** (#77). *Open: owner decides.*
  (a, recommended) Yes, the small drawn calendar of the date picker button at the right of the Journal row (it takes
  the theme's text color). (b) Yes, the `📅` emoji at the start of the Journal row. (c) No icon. Cost if wrong: one
  component reference.
- **Q8. "Date…" gets the icon too** (#77). *Open: owner decides.*
  (a, recommended) Yes: the three date entries look alike. (b) No, only "Today" and "Yesterday". Cost if wrong: one
  flag on one item.
- **Q9. The order of the entries** (#77). *Open: owner decides.*
  (a, recommended) The states, "Link to page", "Today", "Yesterday", "Date…" (where "Today's date" is now). (b) The
  states, "Link to page", "Yesterday", "Today", "Date…" (in calendar order). (c) The date entries before "Link to
  page". Cost if wrong: the order of one array, and steps 129 and 6a.

#75 asks the owner nothing: the fix below (Task 2) does not change how a wash looks, because every journal row sits
on the page background. If Task 1 cannot reproduce the seam, the controller asks the owner how to go on (see Task 1).

## Global Constraints

- The rules in `docs/audit/2026-11-10/notes.md` are invariants. Above all: the editor never loses typed text (every
  command flushes typing first; a delete during a split waits for it); every edit goes through `Document::store` or
  the edits built on it ("write, re-read, compare, else refuse"); decisions are pure functions in `app/src/lib/`
  with tests, `App.svelte` and `EditorHost` only carry them out; nothing is emitted while the session lock is held.
- Spec §2: no text the user wrote is dropped, reordered or reformatted except what the user asked to delete.
- Every test fails first (RED) and the RED run is in the task report. A test that pins behaviour that already holds
  is shown to fail by a temporary mutation, noted and reverted.
- No colour literal or `color-mix` outside `app/src/styles/tokens.css` (a test checks it).
- `Command::kind` stays exhaustive (plan 6): `block.delete` is `Edit`. The contract test
  (`app/src/lib/contract.test.ts`) must stay green: a new command has its TypeScript twin in the same commit.
- e2e: new steps 128 (Task 1, extended in Task 2), 129 (Task 4) and 130 (Task 6), after step 127 and before step 45.
  Steps assert the visible result and, where a file changes, the bytes on disk; they wait for states, never sleep.
  Expected count after the plan: 197 PASS lines (189 + three step lines + one `expectFile` line in step 129 + four in
  step 130). The counted number is the rule.
- `docs/review.md`: new heading `## Wash seams, slash dates, delete a block (plan 7)`, items 76 to 78.
- Commits: conventional subjects, `feat`/`fix` only for what a user sees, in plain words, no code names, at most
  about 90 characters, no trailing period, no attribution lines. Commit on `main` and push after each commit.
- No new dependency, frontend or Rust.

## Review Focus

- **Typing just before the delete key.** The text typed in the 300 ms pause must reach the file before the block
  goes, so one `Ctrl Z` brings the block back with that text. Pinned in Task 5
  (`block_delete_after_typing_undoes_to_the_typed_text`) and Task 6 (host test: the queue sends `block.setText` before
  `block.delete`).
- **The delete key right after `Enter`, while the split is in flight.** It must delete the new block (where the
  caret is), not the old one. Pinned in Task 6 (`a delete key during a split waits for the new block`).
- **The block above is folded.** The caret must land on a block that is shown (the folded one, at its end), never
  inside a hidden child. Pinned in Task 6 (`deleteFocus` over the visible rows).
- **The first block of a journal day in the feed.** The caret must stay on that day (the next block of the day), not
  jump to the day above. Pinned in Task 6 (`in the feed the caret stays on the block's own day`).
- **A washed row next to a selected row or a jump highlight.** The fix must not tint a selection or break the band's
  rounded ends (steps 116 and 123). Pinned by those steps and by `the wash rules come before the selection rule`
  (`pageColors.test.ts`).

---

### Task 1: Measure the seams between washed rows (model: opus)

#75, the reproduction. No fix in this task.

**Files:**
- Modify: `app/e2e/png.mjs` (`decodePng`), `app/e2e/png.test.mjs`
- Modify: `app/e2e/smoke.mjs` (step 128)

**Interfaces:**
- Produces: `export function decodePng(buf: Buffer): { width: number; height: number; rgba: Uint8Array }` in
  `png.mjs`: 8-bit RGB or RGBA, not interlaced (what Chromium writes), the five row filters, `IDAT` chunks joined and
  inflated with `node:zlib`; anything else throws `unsupported PNG`.
- Produces, in `smoke.mjs`: `const SEAM_ZOOMS = [100]` and a helper
  `seamAt(band: Locator, i: number): Promise<number>`, the largest per-channel difference, over a strip 4 CSS px wide
  at 3 CSS px from the band's left edge, between the pixel at the middle of row `i` and every pixel down to the middle
  of row `i + 1` (`page.screenshot({ clip, scale: 'device' })`, decoded with `decodePng`). Task 2 sets
  `SEAM_ZOOMS = [100, 110, 125]`.

- [ ] **Step 1: Write the failing unit tests** in `png.test.mjs`, building PNGs in the test with `zlib.deflateSync`:
  `decodePng reads an RGBA image with each row filter` (a 5 × 2 image, one row per filter 0 to 4, exact `rgba`);
  `decodePng reads RGB as opaque`; `decodePng refuses an interlaced or 16-bit image`.
- [ ] **Step 2: Run them and see them fail.** `cd app && npx vitest run e2e/png.test.mjs` → FAIL (`decodePng` is not
  exported).
- [ ] **Step 3: Implement `decodePng`**; the tests pass.
- [ ] **Step 4: Write step 128** (after 127). Fixture, as outside edits: `pages/Seam blue 128.md` with
  `color:: blue\n- b\n`, `pages/Seam hue 128.md` with `color:: hue 212\n- h\n`, and a journal day no other step
  writes (`grep -n "dayKey(" smoke.mjs` first; `dayKey(12)` if free) holding a blue band of four rows (one of depth 1,
  as in the owner's screenshot) and, after a plain row, a custom band of four rows. Move the pointer off the rows (a
  hovered row shows its fold arrow). For each theme in `THEMES` order (chosen through the status bar theme menu, as
  step 125), for each zoom in `[100, 110, 125]` (`Control+=` from 100, waiting for the zoom item's text, then
  `frames()`), for both bands and the three inner boundaries: record `seamAt`. Then `Control+0` and the theme the run
  had before. Print one line per theme and zoom with the worst value, named and custom apart.
- [ ] **Step 5: Run it and record the RED evidence.** `just e2e`. Write in the report the worst value per theme, zoom
  and band. A seam is a value above 2 (the tolerance; the background is one flat color, so a row's own pixels differ
  by 0). Expected: values above 2 at 110 or 125 %, none at 100 %; and whether the seam is lighter (a gap) or darker
  (two see-through rows overlapping) than the wash.
  - **Gate:** if no value is above 2 at any zoom in any theme, stop here and report to the controller: the headless
    run does not show what the owner sees. The controller then asks the owner whether to (a) check by hand at 110 and
    125 % on the owner's PC with a build of Task 2, keeping step 128 as a guard, or (b) leave #75 open. Do not go on
    to Task 2 without that answer.
- [ ] **Step 6: Make the step assert** every value ≤ 2 for the zooms in `SEAM_ZOOMS` (`[100]` for now; 110 and 125
  are measured and printed but not asserted, so `main` stays green). `console.log('PASS 128 no seam between the rows
  of a wash band at ' + SEAM_ZOOMS.join(', ') + ' %, named and custom, in every theme')`. Run `just e2e` → 190 PASS.
- [ ] **Step 7: Commit and push** — `test(app): measure the lines between the rows of a color wash at each zoom`.

---

### Task 2: One band without seams (model: sonnet)

#75, the fix. Consumes Task 1's measurement.

The fix, ruled here (the backlog's three options weighed):
- *One element behind each band* would remove the seam at its root, but it changes the outline's DOM (rows inside
  band wrappers) that the selection, the jump highlight, drag and drop, the editor slot lookup and many e2e steps rely
  on (`.outline > .block`). Too wide for this defect.
- *Snapping row heights to whole device pixels* cannot be done in CSS: text sets the heights, and the zoom factor is
  the WebView's.
- **Chosen: overlap without doubling.** (1) Named washes become opaque, mixed over the page background instead of
  over transparency: `--pc-<name>-wash: color-mix(in srgb, var(--pc-<name>) var(--pc-wash), var(--bg))`. Journal rows
  sit on `--bg`, so each wash keeps exactly the color it shows today (the readability tests already compute named
  washes over `--bg`), and named and custom washes now behave alike (plan 2 follow-up 6). (2) Every washed row that is
  not the bottom of its band paints one pixel more downwards, under the next row:
  `.block.wash:not(.wash-bottom) { box-shadow: 0 1px 0 var(--wash); }`. A pixel row that both rows only half cover
  then shows the wash, not the page background, and with opaque washes an overlap cannot look darker.
- If Task 1 found only darker seams, (1) alone is enough and (2) stays as a guard against gaps; say so in the report.

**Files:**
- Modify: `app/src/styles/tokens.css:442`–`468`, `app/src/styles/app.css:134`–`140`
- Test: `app/src/lib/theme.test.ts` (around line 190), `app/src/lib/pageColors.test.ts`, `app/e2e/smoke.mjs`
  (`SEAM_ZOOMS`)
- Modify: `docs/plans/2026-11-07-02-custom-page-colors-followups.md` (item 6 struck: done in plan 7),
  `docs/review.md` (heading and item 76)

- [ ] **Step 1: Write the failing tests.**
  - `theme.test.ts`: the token check expects
    `--pc-${n}-wash: color-mix(in srgb, var(--pc-${n}) var(--pc-wash), var(--bg));` for every named color.
  - `pageColors.test.ts`: `a washed row reaches one pixel into the next row of its band`: `app.css` has the rule
    `.block.wash:not(.wash-bottom)` with `box-shadow: 0 1px 0 var(--wash)`, and it comes before the selection rule
    (extend the existing order test's list).
  - `smoke.mjs`: `SEAM_ZOOMS = [100, 110, 125]`.
- [ ] **Step 2: Run them and see them fail.** `cd app && npx vitest run src/lib/theme.test.ts src/lib/pageColors.test.ts`
  → FAIL; `just e2e` → FAIL 128 at 110 or 125 % (the values Task 1 printed).
- [ ] **Step 3: Implement** the two changes.
- [ ] **Step 4: Run** `just test`, `just lint`, `just e2e` → 190 PASS. Steps 113, 116, 117, 118, 120 and 123 (washes,
  selection, preview, custom wash, highlight) must pass unchanged. Put the worst values per zoom, before and after,
  in the report.
- [ ] **Step 5: Review item 76** under the new heading: "**No lines inside a color wash:** in the dark theme, on a
  journal day with a colored page's blocks (one with sub-blocks), zoom to 110 % and 125 % (`Ctrl +`): the wash is one
  band with no faint lines between the rows. Also at 100 %, and in one light theme. The colors look as before."
- [ ] **Step 6: Commit and push** — `fix(app): Page colors: no faint lines between the rows of a wash when zoomed in`.

---

### Task 3: "Today" and "Yesterday" in the slash menu's items (model: sonnet)

#77, the pure part. Uses Q9.

**Files:**
- Modify: `app/src/lib/slash.ts`
- Test: `app/src/lib/slash.test.ts`

**Interfaces:**
- Produces (in `slash.ts`):
  - `SlashItem` gains `{ kind: 'date'; label: string; days: 0 | -1; words: string; icon: 'calendar' }` (replacing the
    old `date` member) and `pickdate` gains `words: string; icon: 'calendar' | null`; other kinds have no `words` or
    `icon`.
  - The list (Q9 a): states, `Link to page`, `{ kind: 'date', label: 'Today', days: 0, words: 'date', icon: 'calendar' }`,
    `{ kind: 'date', label: 'Yesterday', days: -1, words: 'date', icon: 'calendar' }`,
    `{ kind: 'pickdate', label: 'Date…', words: '', icon: 'calendar' }` (Q8 a; `null` under Q8 b).
  - `matches(item, query)`: a word of `label` or of `words` starts with the query, case ignored.
  - `slashInsert` for `date`: `[[${addDays(dayKey(now), item.days)}]]`, caret at its end (`dayKey`, `addDays` from
    `lib/calendar.ts`).

- [ ] **Step 1: Write the failing tests** (replace the two that name "Today's date"):
  - `slash items filter`: `'t'` → `['TODO', 'Link to page', 'Today']`; `'date'` → `['Today', 'Yesterday', 'Date…']`;
    `'yes'` → `['Yesterday']`; `'tod'` → `['TODO', 'Today']`; `'da'` → `['Today', 'Yesterday', 'Date…']`; `''` → 7
    items; `'do'` → `['DOING']` (step 6 depends on it).
  - `what each item inserts`: Today at `new Date(2026, 0, 5, 7, 3)` → `[[2026-01-05]]`, caret 14; Yesterday then →
    `[[2026-01-04]]`.
  - `yesterday crosses month, year and leap day`: `new Date(2026, 0, 1, 0, 0, 1)` → `[[2025-12-31]]`;
    `new Date(2028, 2, 1, 12)` → `[[2028-02-29]]`; `new Date(2026, 2, 1, 12)` → `[[2026-02-28]]`.
  - `yesterday is the calendar day before, around midnight and a clock change`: `new Date(2026, 10, 10, 23, 59, 59)`
    → `[[2026-11-09]]`; `new Date(2026, 10, 10, 0, 0, 0)` → `[[2026-11-09]]`; `new Date(2026, 2, 30, 0, 30)` (the
    day after Europe's spring change) → `[[2026-03-29]]`.
  - `date items carry the calendar icon`: Today, Yesterday and Date… have `icon: 'calendar'`; states and the link
    have none.
- [ ] **Step 2: Run them and see them fail.** `cd app && npx vitest run src/lib/slash.test.ts` → FAIL (labels,
  missing Yesterday).
- [ ] **Step 3: Implement** as in Interfaces. `editor/slash.ts` needs no change yet (it passes `new Date()`).
- [ ] **Step 4: Run** `just test`, `just lint` → green.
- [ ] **Step 5: Commit and push** — `feat(app): Slash menu: "Yesterday" links yesterday's journal day; "Today's date" is now "Today"`.

---

### Task 4: The calendar icon in the slash menu, with e2e (model: opus)

#77, the visible part. Uses Q7, Q8.

**Files:**
- Create: `app/src/components/CalendarIcon.svelte` (the SVG now inline in `DatePicker.svelte:76`–`80`, `size` prop,
  `aria-hidden`)
- Modify: `app/src/components/DatePicker.svelte` (uses it), `app/src/editor/menu.ts` (`MenuSource.icon?`,
  `MenuView` items get `icon: 'calendar' | null`), `app/src/editor/slash.ts` (`icon: (item) => item.icon ?? null`),
  `app/src/components/CaretMenu.svelte` (renders `<CalendarIcon />` before the label when `item.icon === 'calendar'`),
  `app/src/styles/app.css` (`.slash-item .icon`: aligned with the text, `color: var(--muted)`)
- Test: `app/src/editor/menu.test.ts`
- Modify: `app/e2e/smoke.mjs` (step 129), `docs/spec.md` §7.2, `docs/review.md` (item 77)

**Interfaces:**
- Consumes: `SlashItem.icon` (Task 3).
- Produces: `MenuSource<I>.icon?: (item: I) => 'calendar' | null`; each `MenuView` item is
  `{ label, note, color, icon }`. The link completion sets no icon.
- Under Q7 b, `CalendarIcon.svelte` renders the `📅` character instead; under Q7 c this task drops the icon and keeps
  only step 129's names, order and inserts.

- [ ] **Step 1: Write the failing tests.**
  - `menu.test.ts`: `a source's icon reaches the menu view` (a source whose `icon` returns `'calendar'` for one item:
    that item's view has `icon: 'calendar'`, the others `null`); `a source without icons gives null`.
  - Step 129 (after 128): click today's first block, `End`, type ` /date`; the slash menu's items read
    `Today`, `Yesterday`, `Date…` in that order and each has one `svg` (Q8 a); `Backspace` ×6 removes ` /date`
    and closes the menu; type ` /yes`, `Enter`, type ` /tod`, `Enter`. Expected keys from the e2e
    process's local clock read just before the first key press (`localKey(0)`, `localKey(-1)`); one
    `expectFile('129 Yesterday and Today insert their days', …, journal)` with the block's text plus
    ` [[<yesterday>]] [[<today>]]`. If the local date changed between the press and the check (a midnight), build the
    expectation from the new date and check again. `console.log('PASS 129 the slash menu offers Today, Yesterday and
    Date… with a calendar, and inserts the days')`.
- [ ] **Step 2: Run them and see them fail.** `cd app && npx vitest run src/editor/menu.test.ts` → FAIL; `just e2e` →
  FAIL 129 (no `svg` in the items).
- [ ] **Step 3: Implement** the component, the pass-through and the CSS.
- [ ] **Step 4: Run** `just test`, `just lint`, `just e2e` → 192 PASS. Step 6 (`/do` picks DOING) still passes.
- [ ] **Step 5: Spec and review.** §7.2 "Slash menu": "… 'link to page', 'Today' and 'Yesterday' (a link to that
  journal day; 'date' finds both) and 'Date…', which opens the date picker …; the three date entries show a small
  calendar." Review item 77: "**Today and Yesterday:** in a block type `/`: after 'Link to page' come 'Today',
  'Yesterday' and 'Date…', each with the small calendar of the date picker. `/date` lists all three. 'Yesterday'
  inserts a link to yesterday's day; check it shortly after midnight once if you can."
- [ ] **Step 6: Commit and push** — `feat(app): Slash menu: the date entries show a small calendar`.

---

### Task 5: The core deletes one block in one undo step (model: sonnet)

#78, the core. Uses Q2 a and Q5 a.

**Files:**
- Modify: `crates/core/src/session/command.rs` (`BlockDelete`, its `kind`), `crates/core/src/session/mod.rs`
  (dispatch), `crates/core/src/edit.rs` (`Document::delete_block`)
- Modify: `app/src/lib/types.ts` (`| { type: 'block.delete'; id: BlockId }`), `app/src/lib/sync.ts` (`kindOf`:
  `'block.delete'` → `'text'`)
- Test: `crates/core/tests/it/session.rs`, `crates/core/tests/it/edit.rs`, `app/src/lib/sync.test.ts`

**Interfaces:**
- Produces:
  - `#[serde(rename = "block.delete")] BlockDelete { id: BlockId }`, `kind()` = `CommandKind::Edit`.
  - `pub fn Document::delete_block(&mut self, id: BlockId) -> Result<Option<BlockId>, EditError>`: removes the block
    with its subtree (`Document::delete`) and returns `None`; when that would leave the document without a block, it
    instead removes the children and empties the block's text (through `store`, so the re-read check holds) and
    returns `Some(id)`.
  - Dispatch through `mutate` (one undo step); the output's `focus` is `Some(Focus { id, at: 0 })` only for the kept
    block, else `None` (the window places the caret, Task 6).
- Under Q2 b, `delete_block` lifts the children one level instead; under Q5 b it never keeps the block.

- [ ] **Step 1: Write the failing tests.**
  - `edit.rs`: `delete_block_takes_the_subtree` (`- a\n- b\n\t- c\n- d\n`, delete b → `- a\n- d\n`, `None`);
    `delete_block_keeps_an_emptied_only_block` (`- a\n\t- c\n`, delete a → the bytes of one empty block, `Some(a)`;
    pin the exact bytes the render gives for an empty block, e.g. `- \n`).
  - `session.rs` (JSON commands as the file's other tests): `block_delete_is_one_undo_step` (delete b of the page
    above, one `history.undo` gives the file back byte for byte); `block_delete_after_typing_undoes_to_the_typed_text`
    (`block.setText` b → "bee" at ms 0, `block.delete` b at ms 100, one undo → the file has `- bee` with its child);
    `block_delete_of_the_only_block_keeps_it_empty` (focus `{ id, at: 0 }`); `block_delete_of_an_unknown_block_is_refused`
    (code `unknownBlock`, file unchanged, no undo step); `block_delete_in_a_journal_day` (a day file with two blocks).
  - `command.rs` unit test: `BlockDelete.kind() == CommandKind::Edit`.
  - `sync.test.ts`: `kindOf('block.delete')` is `'text'`.
- [ ] **Step 2: Run them and see them fail.** `cargo test -p breccia-core edit::` and `cargo test -p breccia-core
  session::block_delete` → FAIL (unknown command); `cd app && npx vitest run src/lib/sync.test.ts` → FAIL.
- [ ] **Step 3: Implement.** The contract test sees `block.delete` on both sides.
- [ ] **Step 4: Run** `just test`, `just lint` → green.
- [ ] **Step 5: Commit and push** — `refactor(core): a command that deletes one block with its children in one undo step`
  (the user-visible line comes with Task 6).

---

### Task 6: The delete key in the editor, the lists and e2e (model: opus)

#78, the visible part. Uses Q1 a, Q3 a, Q4 a, Q6 a.

**Files:**
- Create: `app/src/lib/deleteBlock.ts`, `app/src/lib/deleteBlock.test.ts`
- Modify: `app/src/lib/keys.ts` (`Action` gains `'deleteBlock'`), `app/src/lib/keys.test.ts`,
  `app/src/lib/selection.ts` (the key maps to `'delete'`), `app/src/lib/selection.test.ts`,
  `app/src/lib/shortcuts.ts`, `app/src/lib/shortcuts.test.ts`
- Modify: `app/src/editor/host.svelte.ts` (`act`, `apply`), `app/src/editor/host.test.ts`
- Modify: `app/e2e/smoke.mjs` (step 130), `docs/spec.md` §7.2, `docs/review.md` (item 78)

**Interfaces:**
- Consumes: `block.delete` and its `focus` (Task 5).
- Produces:
  - `decide`: `Ctrl Shift K` (`Cmd Shift K` on a Mac; key compared lower-case, no Alt) → `'deleteBlock'`, whatever
    the caret and selection inside the block.
  - `selectionAction`: the same key → `'delete'`.
  - `export function deleteFocus(rows: readonly { id: BlockId; depth: number }[], id: BlockId): { id: BlockId; at: 'end' | 'start' }`:
    `rows` are the shown rows of the block's own page, in order. The row before `id` → `{ that, 'end' }`; else the
    first row after `id`'s subtree (the following rows deeper than `id`) → `{ that, 'start' }`; else `{ id, 'start' }`
    (the core keeps the block, Task 5).
  - `EditorHost.act(id, 'deleteBlock')`: computes `deleteFocus` over
    `visible(this.env.order?.(id) ?? this.env.blocks(), this.folded)` filtered to `this.env.pageOf(b.id) === this.env.pageOf(id)`,
    remembers it for the command (a `WeakMap<Command, …>`, like `issuedFrom`), and runs
    `this.exec({ type: 'block.delete', id })`. During a split the key is queued and replayed on the new block like
    the other outline keys (no change to `split.ts`).
  - `EditorHost.apply`: for a `block.delete` whose output has no `focus`, the remembered target becomes the focus
    given to `afterOutput` (`cursor16` = the block's text length for `'end'`, 0 for `'start'`). `afterOutput` is not
    changed: when the user left during the command, it still returns `none`.
  - `SHORTCUTS`, group `Editing`, after the `Backspace` line:
    `{ keys: 'Ctrl Shift K', mac: 'Cmd Shift K', what: 'Delete the block with its sub-blocks' }`. The F1 overlay and
    Settings > Keyboard both read this list.

- [ ] **Step 1: Write the failing tests.**
  - `keys.test.ts`: `Ctrl Shift K deletes the block` (also with a selection inside and mid-line); `Cmd Shift K` on a
    Mac; `Ctrl K` is not it; `Ctrl Alt Shift K` and `Cmd Shift K` on Windows are not it.
  - `selection.test.ts`: `Ctrl Shift K deletes the selected blocks`.
  - `deleteBlock.test.ts`: `goes to the end of the row above`; `the first row goes to the start of the row after its
    subtree` (rows `a(0) b(1) c(0)`, delete a → c); `a folded row above is the target, not its hidden children` (the
    rows passed are the shown ones); `the only row of the page keeps the caret in it`; `a row with children and nothing
    after them, first on the page → itself`.
  - `shortcuts.test.ts`: `lists the delete-block key on both platforms` (`Ctrl Shift K`, `Cmd Shift K`, group
    `Editing`).
  - `host.test.ts`: `the delete key sends the typed text first, then block.delete` (the client's queue order);
    `after the delete the caret is at the end of the block above`; `a delete key during a split waits for the new block`
    (Enter, then the key before the split answers: `block.delete` names the new block's id); `after deleting the only
    block the caret stays in it`; `in the feed the caret stays on the block's own day` (two days' rows in `order`;
    deleting the first block of the lower day puts the caret on that day's next block, not on the day above).
  - Step 130 (after 129): fixture `pages/Delete 130.md` = `- one\n- two\n\t- child\n- three\n`, opened from the
    sidebar. Click "two", press `Control+Shift+K` → `expectFile('130 the block goes with its child', '- one\n- three\n', …)`;
    the editor shows `one`, with the caret at its end (`getSelection()` in the page: the focus offset is at the end
    of the `.cm-line`).
    `Control+z` → `expectFile('130 undo brings it back', '- one\n- two\n\t- child\n- three\n', …)`. Fixture
    `pages/Solo 130.md` = `- solo\n\t- kid\n`: click "solo", `Control+Shift+K` → `expectFile('130 the only block is
    emptied', <the bytes Task 5 pinned>, …)` and the editor is still open on that block; `Control+z` →
    `expectFile('130 undo brings the only block back', '- solo\n\t- kid\n', …)`. `Escape`; `F1`, filter `delete`: a row
    with `Ctrl Shift K` in the Editing group; close; Settings > Keyboard lists `Ctrl Shift K`; back to the journal.
    `console.log('PASS 130 Ctrl Shift K deletes the block with its children, the caret moves up, and Ctrl Z brings it back')`.
- [ ] **Step 2: Run them and see them fail.** `cd app && npx vitest run src/lib/keys.test.ts src/lib/selection.test.ts
  src/lib/deleteBlock.test.ts src/lib/shortcuts.test.ts src/editor/host.test.ts` → FAIL; `just e2e` → FAIL 130 (the
  key deletes one line of text, CodeMirror's binding).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `just test`, `just lint`, `just e2e` → 197 PASS.
- [ ] **Step 5: Spec and review.** §7.2 keys: "… `Ctrl Shift K` deletes the block with its children, also on a
  selection; the caret moves to the end of the block above (the start of the next one for a page's first block); the
  only block of a page is emptied instead; one `Ctrl Z` brings it back; …". Review item 78: "**Delete a block:** in a
  block with sub-blocks press `Ctrl Shift K`: it goes with its sub-blocks, the caret is at the end of the block above,
  `Ctrl Z` brings all back. On a page's only block the block is emptied. With blocks selected (`Shift ↓`) the key
  deletes them. F1 and Settings > Keyboard list it."
- [ ] **Step 6: Commit and push** — `feat(app): Ctrl Shift K deletes the whole block with its sub-blocks`.

---

## Finish (the controller, not a task)

- `just test`, `just lint`, `just e2e` (197 PASS expected) on the final `main`; CI green on the last commit.
- Follow-ups doc `docs/plans/2026-11-10-07-wash-seams-slash-dates-delete-block-followups.md`, at least: whether
  `Backspace` in an empty block with children should match the new key's rule (today it moves the children up, spec
  §7.2 says only "deletes it"); `Ctrl Z` with nothing edited or selected does nothing (a page-level undo); the slash
  dates read the window's clock, not `BRECCIA_TODAY`; the seam check covers zoom only, not Windows display scales
  other than 100 % (review item 76 asks the owner).
- `docs/STATUS.md`: plan 7 done, the test baseline (Vitest count, 197 e2e PASS), review items 76 to 78, the owner's
  answers to Q1 to Q9 under "Owner decisions in force" where they set lasting rules (Q1, Q2, Q5).
