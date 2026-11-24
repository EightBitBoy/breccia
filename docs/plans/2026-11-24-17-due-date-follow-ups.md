# Plan 17: Due date follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close plan 16's follow-ups: a due line with words after the date stays visible, ordinary pages get "Color…"
on their links, and the small code, test and doc points the reviews left.

**Architecture:** The core decides which `due::` line is hidden (`render.rs`) and which links can take a color
(`TargetView::list`, now for every page view, not only journal days); the window only shows what it is given. The
focus fixes stay in the components; logic that needs a test moves to `app/src/lib/`.

**Tech Stack:** Rust 1.90 (`crates/core`), Svelte 5 + TypeScript, bits-ui, Vitest (node, no DOM), Playwright e2e over
WebView2 (`app/e2e/smoke.mjs`). No new dependency.

**Spec:** `docs/spec.md` (binding; §7.2 due date of a task, §7.4 "Color from a link", §7.6 cards), `docs/format.md` §8
(`due::`), the follow-ups file `docs/plans/2026-11-23-16-due-dates-followups.md` (owner answers of 2026-11-24 at its top)
and this plan's "Product decisions".

## State

Written 2026-11-24 at commit `fbe8998`; waits for the owner's review. Ledger:
`.superpowers/sdd/2026-11-24-17-due-date-follow-ups/progress.md`.
Numbers: review items start at **137** (`docs/review.md` ends at 136); e2e steps start at **153** (the last is 152);
backlog's highest number is 99, so a new item is **#100**.

## Product decisions (owner, 2026-11-24, binding)

1. A due line with text after the date (`due:: [[2026-12-01]] client waits`) stays visible, dimmed like other
   properties, and the chip shows as well. A due line that holds only the date stays hidden, as now. (Follow-up 1.)
2. Picking a date overwrites a words-only due line (`due:: ask Ben` becomes `due:: [[…]]`), and "Remove due date"
   deletes it, as now. No change. (Follow-up 2.)
3. Ordinary pages keep the journal's right-click zone ("Copy link" on web and mail links, the task menu on task rows),
   and their page links and tags get "Color…" too, as in journal days. The changelog gets a `feat` line for the pages'
   right-click. (Follow-up 3.)
4. The release notes of the next release use "Tasks and cards show a due date chip, amber when near and red when
   overdue" for plan 16's chip line. This is done by hand at the release pause; it stays in the follow-ups, no task.
   (Follow-up 4.)
5. The technical points 5 to 17 go into this plan (owner, 2026-11-24); those the planner advises against are under
   "Items not taken", for the owner to decide.

## Open questions for the owner

Ask one at a time, with the options. The plan is written with the recommended answers; another answer changes the task
named.

- **Q1. Picking a new date on a due line that has words after the date.** *What it is about:* with decision 1, a line
  like `due:: [[2026-12-01]] client waits` is now something you see and mean to keep. Today, picking a new date from the
  calendar rewrites the whole line to `due:: [[2026-12-05]]`, so "client waits" is lost without a word. (Task 2)
  - a. Keep the words: only the date in the line changes (`due:: [[2026-12-05]] client waits`). "Remove due date"
    still deletes the whole line, words and all. **Recommended:** Breccia never silently drops text you wrote (spec §2).
  - b. As now: the line becomes `due:: [[2026-12-05]]`; the words go (`Ctrl Z` brings them back).
- **Q2. Where the words show on a board card.** *What it is about:* a card shows the task's first line, its
  description and the chip, but never property lines; so "client waits" from decision 1 does not show on the closed
  card. (none)
  - a. Not on the closed card; the open card (click it) shows the line as the page does. **Recommended:** cards stay
    compact and show no property today.
  - b. As the chip's tooltip on the card ("client waits"). Adds a small task.
- **Q3. A link on a page to the page itself.** *What it is about:* with decision 3, a page that links to itself
  (`[[Garden]]` on the page Garden) would offer "Color…" on that link, which opens the same colors as the swatch beside
  the title. (Task 3)
  - a. Offer it, like any other link. **Recommended:** one rule for all links; it does no harm.
  - b. Leave it out on the page itself (the swatch is right there).

## Pre-flight rulings (the planner's calls; the owner may overrule)

- R1. A due line is hidden only when its value is exactly one link to the due day, spaces around it ignored
  (`due:: [[2026-12-01]]`). Any other text in the value, before or after the link (`due:: by [[2026-12-01]]`,
  `due:: [[2026-12-01]] 09:00`), keeps the line visible. Which line gives the date does not change (format §8).
- R2. A visible due line is drawn exactly as any other property (`div.prop`, key `due`, value with its link rendered).
  The chip shows as well, in the same place as now.
- R3. With Q1 a: setting a date keeps the line that gives the date now (the first `due::` line with a day link), puts
  the new day link in place of its old day link and keeps the rest of the line byte for byte; every other `due::`
  property line goes (as now). With no such line, the rule is as now (the first `due::` line is replaced whole, or a
  line is added after the last property line).
- R4. "Color…" on pages lists the same links as in journal days: page links and tags to existing pages that are not
  journal days, and tags whose page has no file yet. Washes (`topic`, `color` on blocks) stay journal-only.
- R5. When a page's color, existence or alias changes, every page whose blocks link to it travels back with the
  command, ordinary pages as well as journal days (today only journal days do), so a page's "Color…" marks the right
  color. Cost if wrong: a color change of a page linked from many pages sends more page views in one answer; the
  journals already do this.
- R6. After "Set due date…" from a task's right-click menu, and after Esc on that menu, the focus goes back where it was
  before the right-click; when nothing held it, nothing holds it afterwards (never the hidden `div.link-zone`).
- R7. A click outside the due date calendar closes it and leaves the focus to that click; Esc gives it back where it was
  (as now).
- R8. When the due date is today, the chosen day's fill shows today's ring inside it (in `--on-accent`).
- R9. `Ctrl D` while the search or a dialog is open does nothing (as `Ctrl Shift D`). `Ctrl D` on a block the window no
  longer has (it was removed by another program while editing) does nothing and says nothing: the editor is closing
  anyway. (Follow-up 11's first point: kept as is, now written down and tested.)

## Items not taken

Each needs the owner's yes; with a no, the planner adds the task.

- **Follow-up 5 (a swallowed line is re-indented):** in a file whose last block opens a code fence it never closes, a
  bullet line after it belongs to that block; setting a due date or a priority on it writes that line indented. Typing
  in the block does the same, and it was so before plan 16. A fix is in the general block writer, not in due dates.
  **Advice:** move it to the backlog as **#100** (Editor), with this note.
- **Follow-up 13, second point (a bad date on an unknown block answers "bad date" first):** both are refusals the
  window never sends; the order changes nothing a person sees. **Advice:** leave as is.
- **Follow-up 16, last two points (e2e month-end and year-end paths run only on their days; a run across midnight
  fails):** the unit tests of the chip (Task 5) cover month and year ends with fixed dates; faking the clock in the
  WebView needs a test hook for little gain, and the midnight point holds for every journal step. **Advice:** leave as
  is.

## Global Constraints

- Spec §2 anti-goal: never silently drop, reorder or reformat text the user wrote. Setting or removing a due date
  changes only `due::` property lines of that one block.
- Spec §5 "One interpretation": only the core decides what is a due date, which line is hidden and which link can take
  a color.
- Files are saved with LF.
- No colour literal and no `color-mix` outside `app/src/styles/tokens.css` (a test checks it).
- After a wire type change (even a doc comment), run `just types`; `cargo test` fails while `app/src/lib/generated.ts`
  is out of date.
- Logic with unit tests lives in `app/src/lib/`; components and `App.svelte` have no unit-test harness.
- Every test must be able to fail: capture a RED run before implementing. A test that pins behaviour already right
  (Tasks 4 and 5) shows RED by a temporary mutation of the code it covers, named in the step, then reverted.
- e2e steps assert the bytes on disk where a file changes, and wait for states, never sleep.
- Commits: conventional subjects, `feat`/`fix` in user words, at most about 90 characters, no file or function names;
  no attribution lines; on `main`.
- Words from `docs/vocabulary.md`: task, card, page, journal day, property, due date, due date calendar.

## Review Focus

1. **A due line whose words hold a link or tag** (`due:: [[2026-12-01]] ask [[Ben]] #client`): shown with its link and
   tag rendered and clickable, and the right-click on them gives their own menu. Pinned by Task 1's render test.
2. **Two due lines where the second gives the date** (`due:: ask Ben` then `due:: [[2026-12-05]] client`): Task 2 keeps
   "client" and drops `due:: ask Ben` (R3). Pinned by Task 2's test.
3. **A page color changed from a page view while that page view shows the link** (pick, then open "Color…" again on
   the same link): the new color is marked. Pinned by Task 3's core test and e2e step 154.
4. **A tag on an ordinary page whose page has no file yet** gets "Color…" and the pick creates the tag's page with
   only the color line. Pinned by Task 3's core test (tag listed) and e2e step 154 (file bytes).
5. **Focus after the task menu when the editor held it** (right-click a task row while another block is being edited,
   pick a date): the focus goes back to the editor, the caret where it was. Pinned by e2e step 155.

---

## Tasks

### Task 1: A due line with words stays visible (model: sonnet)

Follow-ups 1 and 6.

**Files:**
- Modify: `crates/core/src/render.rs` (`block_html`, lines 370-469)
- Modify: `crates/core/src/task.rs` (a helper next to `journal_date_in`)
- Test: the render tests that cover the due chip (find them with `grep -rn "chip due" crates/core`)
- Modify: `docs/spec.md` §7.2 ("Due date of a task"), `docs/format.md` §8 (`due::` paragraph: how it is shown),
  `docs/review.md` (item 137, new heading "Due date follow-ups (plan 17)")

**Interfaces:**
- Produces: `pub(crate) fn only_day_link(value: &str) -> Option<NaiveDate>` in `task.rs`: the day when `value`,
  trimmed, is exactly one `[[YYYY-MM-DD]]` journal link, else `None`.

- [ ] **Step 1: Write the failing tests** (render tests, beside the existing due chip tests):
  - `due_line_with_words_after_the_date_stays_visible`: `block_html("TODO a\ndue:: [[2026-12-01]] client waits", &cfg)`
    contains `data-due="2026-12-01"` and a `<div class="prop"><span class="prop-key">due</span>` whose value holds
    `client waits` and an `a.link` with `data-page="2026-12-01"`.
  - `due_line_with_words_before_the_date_stays_visible`: same for `due:: by [[2026-12-01]]` (R1).
  - `due_line_with_only_the_date_stays_hidden`: `due::  [[2026-12-01]] ` (extra spaces) gives the chip and no
    `prop-key">due` (pins that trimming still hides).
  - `due_line_words_render_their_links_and_tags`: `due:: [[2026-12-01]] ask [[Ben]] #client` renders `a.link`
    `data-page="ben"` (or the key form the other tests use) and `a.tag` (Review Focus 1).
- [ ] **Step 2: Run** `cargo test -p breccia-core render` (or the module holding them). Expected: the three "visible"
  tests FAIL (the line is hidden), the "hidden" test passes.
- [ ] **Step 3: Implement.** Add `only_day_link`; in `block_html` hide the due line only when
  `only_day_link(value) == due` (the first such line). Fold follow-up 6: compute `task_state(&body, cfg)` once and use
  it for `is_task`, `is_finished` and the badge; drop the `let finished = is_finished` alias.
- [ ] **Step 4: Run** `cargo test -p breccia-core`. Expected: all PASS.
- [ ] **Step 5: Docs.** Spec §7.2: "in place of the `due::` line" becomes "in place of the `due::` line when the line
  holds only the date; a due line with other text (`due:: [[2026-12-01]] client waits`) stays visible, dimmed like
  other properties, next to the chip". Format §8: one sentence that the line is hidden only when its value is the day
  link alone (a display rule; no format version change). Review item 137: by hand, type both lines on a task, leave the
  block, see one hidden and one dimmed line with the chip; links in the words open their pages.
- [ ] **Step 6: Commit** `feat(core): A due line with words after the date stays visible next to the chip`.

### Task 2: Picking a date keeps the words on the due line (model: sonnet)

Q1 a. With Q1 b, skip Steps 1 to 5, keep the e2e step with the expected line `  due:: [[<three days ahead>]]\n`, and
drop review item 137's second bullet.

**Files:**
- Modify: `crates/core/src/task.rs` (`with_due`, lines 83-88)
- Test: `crates/core/tests/it/task.rs`
- Modify: `docs/format.md` §8 (`due::` paragraph, the writing rule), `docs/review.md` (137, a second bullet)

**Interfaces:**
- Consumes: `journal_date_in` (`task.rs`), `inline::properties`, `inline::with_property`.
- Produces: `with_due(text, Some(day))` per R3; `with_due(text, None)` unchanged.

- [ ] **Step 1: Write the failing tests** in `tests/it/task.rs` (single-line `\n` literals, using the file's
  `set_due(src, day)` helper):
  - `set_due_keeps_the_words_after_the_old_date`: `"- TODO a\n  due:: [[2026-12-01]] client waits\n  owner:: Ben\n"`
    with day 5 gives `"- TODO a\n  due:: [[2026-12-05]] client waits\n  owner:: Ben\n"`.
  - `set_due_keeps_the_line_that_gives_the_date`: `"- TODO a\n  due:: ask Ben\n  due:: [[2026-12-01]] client\n"` with
    day 5 gives `"- TODO a\n  due:: [[2026-12-05]] client\n"` (Review Focus 2).
  - `set_due_on_a_words_only_line_still_overwrites_it`: `"- TODO a\n  due:: ask Ben\n"` with day 5 gives
    `"- TODO a\n  due:: [[2026-12-05]]\n"` (decision 2).
  - `remove_due_deletes_a_line_with_words`: `"- TODO a\n  due:: [[2026-12-01]] client waits\n"` with `None` gives
    `"- TODO a\n"`.
- [ ] **Step 2: Run** `cargo test -p breccia-core task::`. Expected: the first two FAIL, the last two pass.
- [ ] **Step 3: Implement** in `with_due`: when a `due::` property line has a journal day link, rebuild the value of the
  first such line by replacing that link's `[[…]]` span (the first journal link, as `journal_date_in` finds it) with
  `[[YYYY-MM-DD]]`, keep everything else of the value, and drop every other `due::` property line; otherwise as now.
  The line keeps its position among the property lines.
- [ ] **Step 4: Run** `cargo test -p breccia-core`. Expected: all PASS, including `format_doc`.
- [ ] **Step 5: Docs.** Format §8: "it replaces the first `due::` line where it stands" becomes R3 in plain words, with
  an example in the `markdown example`/`text reads` style only if `format_doc.rs` needs one to stay in step (it checks
  reads, not writes). Review 137, second bullet: pick a new date on the line with words; the words stay.
- [ ] **Step 6: e2e step 153** (after 152, covers Tasks 1 and 2): append `- TODO words 153\n  due:: [[<a week
  ahead>]] client waits\n` to today's journal file; wait for the row's chip (`data-due` of that day) and for a
  `.prop` in the row holding "client waits"; then right-click the row, "Set due date…", pick a day three days ahead:
  `expectFile` with `  due:: [[<three days ahead>]] client waits\n`; the `.prop` still shows "client waits". Then a row
  `- TODO plain 153\n  due:: [[<a week ahead>]]\n` shows the chip and no `.prop`.
- [ ] **Step 7: Run** `just e2e`. Expected: every step PASS.
- [ ] **Step 8: Commit** `fix(core): Picking a new due date keeps the words written after the old date`.

### Task 3: "Color…" on page links on ordinary pages (model: sonnet)

Follow-up 3 and decision 3.

**Files:**
- Modify: `crates/core/src/session/view.rs` (`PageView::targets` doc comment, `PageView::of`, `TargetView` doc)
- Modify: `crates/core/src/workspace/names.rs` (`journals_linking` becomes `pages_linking`, every page kind)
- Modify: `crates/core/src/session/folder.rs` (`resend_journals` becomes `resend_linking`; its caller in
  `session/mod.rs:242`)
- Regenerate: `app/src/lib/generated.ts` (`just types`)
- Modify: `app/src/components/PageView.svelte` (the comment at lines 99-100), `app/src/components/LinkColorMenu.svelte`
  (header comment and the `targets` prop doc: "the outline's colorable links", not "the day's")
- Test: `crates/core/tests/it/page_color.rs`
- Modify: `app/e2e/smoke.mjs` (step 154), `docs/spec.md` §7.4, `docs/review.md` (138), `docs/STATUS.md` (e2e count
  at the finish only)

**Interfaces:**
- Produces: `PageView.targets` filled for pages and journal days alike (wire shape unchanged, still omitted when
  empty). `Workspace::pages_linking(&self, keys: &BTreeSet<String>) -> BTreeSet<String>`.

- [ ] **Step 1: Write the failing tests** in `page_color.rs`:
  - Change `journal_views_list_their_colorable_targets`' end (line 436): `page.get` of `plain` now has
    `targets == [entry("project", "link", "project", Some("red"))]`; rename it
    `page_views_list_their_colorable_targets`.
  - `an_ordinary_page_lists_tags_without_a_page_and_itself`: page `Notes` with `- see [[Notes]], #fresh, [[Missing]],
    [[2026-11-01]]` gives `[entry("notes", "link", "notes", None), entry("fresh", "tag", "fresh", None)]` (Q3 a,
    Review Focus 4); its blocks carry no `topic` or `color` (washes stay journal-only, R4).
  - `coloring_a_page_resends_the_ordinary_pages_linking_to_it`: with `Plain` linking `Project`, `pick(&mut s,
    "project", json!("green"))` answers a changed view of `plain` whose target `project` has `Some("green")` (R5).
- [ ] **Step 2: Run** `cargo test -p breccia-core page_color::`. Expected: all three FAIL.
- [ ] **Step 3: Implement** R4 and R5: `TargetView::list` for every page kind in `PageView::of` (the wash loop stays
  under `if kind == Journal`); `pages_linking` keeps `journals_linking`'s spelling rules without the journal filter;
  update the doc comments ("Journals only" goes). Run `just types`.
- [ ] **Step 4: Run** `cargo test --workspace` and `npm test` in `app/`. Expected: all PASS.
- [ ] **Step 5: e2e step 154** (after 153): on an ordinary page with `- see [[<colored page>]] and #fresh154` (written
  to its file), right-click the link: the menu has exactly "Color…"; pick a named color; `expectFile` on the target
  page's file (`color:: <name>` line added, rest unchanged). Right-click it again, open "Color…": the grid marks the
  picked color (the marker step 116 uses). Right-click `#fresh154`, pick a color: `expectFile` on
  `pages/fresh154.md` with only the color line. Right-click a link to a journal day on the page: no "Color…".
- [ ] **Step 6: Run** `just e2e`. Expected: every step PASS.
- [ ] **Step 7: Docs.** Spec §7.4 "Color from a link": "in a journal day" becomes "in a journal day or on a page"; the
  sentence "On a page the links get "Copy link" … but no "Color…", which only journal days list." becomes "On a page
  the links get "Copy link" (web and mail links), "Color…" (as in journal days) and the task menu." Review 138: on a
  page, right-click a link and a tag, color them, check the journal's washes follow; a link to a journal day gets no
  menu entry.
- [ ] **Step 8: Commit** `feat: Pages get the journal's right-click menu: Copy link, Color… and Set due date…`
  (this is the changelog line decision 3 asks for; it covers plan 16's new zone too).

### Task 4: Core test tidy (model: sonnet)

Follow-ups 12 and 13 (first point).

**Files:**
- Test: `crates/core/tests/it/task.rs` (`set_due_never_changes_the_outline_around_the_block`, line 837), the session
  test file that holds `block.setDue` tests (find with `grep -rln "block.setDue" crates/core/tests`)

- [ ] **Step 1: Rewrite the fence test** as single-line `\n` literals and split it into one test per source, each
  asserting its exact outcome instead of "refused or same length": for each of the three sources, record what
  `set_due` does today (`Ok` with the exact new text, or `Err(WouldChangeStructure)` with the text unchanged) and assert
  exactly that. Show RED by flipping one expected text, then restore.
- [ ] **Step 2: Add** `set_due_twice_with_the_same_day_changes_nothing` at session level: the second `block.setDue`
  with the same day answers no changed page, writes no file (the file's bytes and mtime stay) and adds no undo step
  (one `history.undo` brings back the state before the first set). Show RED by a temporary mutation: make `set_due`
  skip its `text == block.text` check; the test must fail; revert.
- [ ] **Step 3: Run** `cargo test -p breccia-core`. Expected: all PASS.
- [ ] **Step 4: Commit** `test(core): exact outcomes for due dates in fences, and a repeated pick`.

### Task 5: Window tidy: Today, month names, chip type, tests (model: sonnet)

Follow-ups 7, 8, 14, and 15's `coordsAtPos`, `row()` cast and import-order points.

**Files:**
- Create: `app/src/lib/months.ts`, `app/src/lib/months.test.ts`
- Modify: `app/src/lib/allPages.ts`, `archive.ts`, `due.ts`, `git.ts`, `gitLog.ts`, `calendar.ts` (use `months.ts`)
- Modify: `app/src/lib/today.svelte.ts`, `app/src/lib/today.test.ts`
- Modify: `app/src/lib/due.ts`, `app/src/lib/due.test.ts`, `app/src/lib/board.ts` (`cardDue`)
- Modify: `app/src/styles/tokens.css` (the `--due-*` lines move after the `--c-*` run in each theme block, values
  unchanged)
- Modify: `app/src/editor/host.test.ts`, `app/src/lib/linkColor.test.ts`, `app/src/components/Board.svelte` (import
  order)

**Interfaces:**
- Produces: `months.ts` exports `SHORT_MONTHS: readonly string[]` (`'Jan'`…`'Dec'`) and `LONG_MONTHS` (`'January'`…).
  `due.ts` exports `interface DueChip { label: string; tone: DueTone; title: string | null }`; `dueChip` returns it,
  `cardDue` returns `DueChip | null`.

- [ ] **Step 1: Write the failing tests:**
  - `months.test.ts`: twelve entries each, `SHORT_MONTHS[10] === 'Nov'`, `LONG_MONTHS[1] === 'February'` (RED: the
    file does not exist).
  - `today.test.ts`: `start()` called twice registers one listener and one midnight timer (count the fake env's
    `listen` and `timers.set` calls); the second call's stop function stops the one run; after stop, `start()` works
    again.
  - `due.test.ts`: a finished task due in another year (`dueChip('2025-11-20', '2026-11-24', true)` →
    `{ label: 'due 20 Nov 2025', tone: 'finished', title: null }`); a leap day (`dueChip('2028-02-29', '2028-02-27',
    false)` → `due in 2 days`, `soon`, title `'29 Feb 2028'`; and `('2028-03-01', '2028-02-28', false)` → `due in 2
    days`). These pass at once: show RED by a temporary mutation (drop `withYear` in the finished branch; compute
    `daysBetween` with 28-day February), then revert.
  - `host.test.ts`: `Ctrl D` with `coordsAtPos` answering `null` opens `pickDue` at the content DOM's rectangle (the
    fake view's `contentDOM.getBoundingClientRect()`); RED by a temporary mutation of the `??` fallback.
- [ ] **Step 2: Run** `npx vitest run src/lib/months.test.ts src/lib/today.test.ts src/lib/due.test.ts
  src/editor/host.test.ts` in `app/`. Expected: months and today FAIL.
- [ ] **Step 3: Implement:** `months.ts`; the six files use it (no other change in them); `Today.start()` returns the
  running stop function when already started and clears it on stop; `DueChip` type. In `linkColor.test.ts` build full
  `BlockView` values (every field) instead of `as BlockView`; sort `Board.svelte`'s imports as its neighbours are;
  move the `--due-*` lines.
- [ ] **Step 4: Run** `just test` and `just lint`. Expected: all PASS; the colour-literal test still passes.
- [ ] **Step 5: Commit** `refactor(app): one list of month names, a single Today run, the due chip's type`.

### Task 6: Due date calendar and task menu focus (model: opus)

Follow-ups 9, 10, 11 (second point), 15 (`menuClosed`, `Ctrl D` in a card) and 16 (first two points).

**Files:**
- Create: `app/src/lib/taskMenu.ts`, `app/src/lib/taskMenu.test.ts` (`TaskSpot`, `taskOf` move here from
  `linkColor.ts`, with their tests from `linkColor.test.ts`)
- Create: `app/src/lib/dueKey.ts`, `app/src/lib/dueKey.test.ts`
- Modify: `app/src/lib/linkColor.ts`, `app/src/components/LinkColorMenu.svelte`, `app/src/components/DuePicker.svelte`,
  `app/src/components/MonthGrid.svelte` or `app/src/styles/app.css` (the today ring), `app/src/App.svelte` (`pickDue`)
- Modify: `app/e2e/smoke.mjs` (step 152 hardening, step 155), `docs/review.md` (139)

**Interfaces:**
- Consumes: `duePick` (`duePick.svelte.ts`), `NOT_A_TASK` (`due.ts`).
- Produces: `dueKeyAction(b: { state: string | null; due?: string | null } | undefined, blocked: boolean):
  { kind: 'none' } | { kind: 'refuse' } | { kind: 'open'; due: string | null }` in `dueKey.ts`. `App.svelte`'s
  `pickDue` calls it with `blocked = dialogOpen() || search.shown` (R9).

- [ ] **Step 1: Write the failing tests:** `dueKey.test.ts`: blocked → `none` even on a task; no block → `none`;
  `state: null` → `refuse`; a task with `due: '2026-12-01'` → `open` with that due. `taskMenu.test.ts`: the moved
  `taskOf` tests (RED: the module does not exist).
- [ ] **Step 2: Run** `npx vitest run src/lib/dueKey.test.ts src/lib/taskMenu.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - `dueKey.ts` and `pickDue` using it (R9).
  - Move `TaskSpot`/`taskOf` to `taskMenu.ts`; `linkColor.ts`'s header says what it holds; `LinkColorMenu.svelte`'s
    header comment says what the code does, covering Esc on the task menu (R6), no more.
  - R6: in `LinkColorMenu`, when the task menu closes without "Set due date…" (Esc, a click outside), the focus goes
    to `taskFocus` if it is still connected; when `taskFocus` is null, and in `openDue` too, an active `div.link-zone`
    is blurred, so the calendar's `before` is not the zone.
  - R7: `DuePicker` remembers a close by an outside pointer (`onInteractOutside`) and then does not refocus `before`.
  - "Remove due date" gets its own class `dp-remove` (same look as `dp-today` via a shared rule in `app.css`).
  - R8: `.dp-day.today.chosen` shows an inset ring in `var(--on-accent)` (no colour literal).
- [ ] **Step 4: Run** `just test` and `just lint`. Expected: all PASS.
- [ ] **Step 5: e2e.** Step 152: wait for the card chip's text and tone (`waitFor` on a locator with the expected text
  and `data-tone`) instead of reading once; assert the finished chip has no `title`. Step 155:
  1. Nothing focused (click the page background, then `document.activeElement` is `body`); right-click a task row, "Set
     due date…", pick a day: `expectFile` with the due line; then `document.activeElement` is `body`, not
     `.link-zone`.
  2. Right-click the row again and press Esc: the menu closes, nothing is written (`expectFile` unchanged) and the
     focus is not on `.link-zone`.
  3. While another block is being edited, right-click the task row and pick a day: `expectFile`; the focus is back in
     `.cm-content` (Review Focus 5).
  4. Open the due date calendar and click outside it on another block's text: that block's editor opens and holds the
     focus (R7).
  5. On a board, hover a card, open its menu with the mouse, "Set due date…", Esc: the card holds the focus
     (`menuClosed`'s fallback).
  6. Open a card, put the caret in its task line, `Ctrl D`, pick a day: `expectFile` with the due line under the task.
- [ ] **Step 6: Run** `just e2e`. Expected: every step PASS.
- [ ] **Step 7: Docs.** Review 139: the today ring inside a chosen today; Esc and a pick from the task menu leave no
  focus on a hidden element; a click outside the calendar lands where clicked; `Ctrl D` in an open card.
- [ ] **Step 8: Commit** `fix(app): Due date calendar: a click outside lands where you clicked, today shows when chosen`
  (and `refactor(app): …` for the moves, as a separate commit before it).

### Task 7: Docs: due lines in other apps, backlog (model: haiku)

Follow-up 17, and follow-up 5 if the owner agrees.

**Files:**
- Modify: `docs/compatibility.md` (line 120, last column; line 152)
- Modify: `docs/backlog.md` (#100), only with the owner's yes on "Items not taken"

- [ ] **Step 1:** In the due row's last column: "In Obsidian a `due::` line is text, and with the Dataview plugin an
  inline field `due` whose value links to the day's note (not verified)". At line 152, note the same for `due::` with
  Dataview.
- [ ] **Step 2:** Backlog #100 "A line swallowed by an unclosed code fence is re-indented when its block is written
  (Editor)", with follow-up 5's text and the note that typing does the same.
- [ ] **Step 3: Run** `cargo test -p breccia-core format_doc::` (unchanged files, sanity). Expected: PASS.
- [ ] **Step 4: Commit** `docs: due lines in Obsidian with Dataview; backlog #100`.

## Finish

- `just test`, `just lint`, `just e2e` (expected: the last step is 155; record the PASS count in `docs/STATUS.md`).
- Follow-ups doc `docs/plans/2026-11-24-17-due-date-follow-ups-followups.md`, carrying plan 16's follow-up 4 (release
  wording) and any item the owner moved.
- Mark plan 16's follow-ups 1, 3 and 5 to 17 as taken by plan 17 (or "not taken, owner decided") in its follow-ups
  file; update `docs/STATUS.md` (plan table row 17, "Next", test baseline, owner decisions with Q1 to Q3).
