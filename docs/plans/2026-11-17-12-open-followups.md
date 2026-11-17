# Plan 12: Open follow-ups of plans 1 to 11 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the open items of every `docs/plans/*-followups.md` (plans 1 to 11): fix the real defects, close the
test gaps worth closing, do the tidy-ups with clear value, move the large items to the backlog, and strike through the
rest with a reason, so that no follow-ups file has an unexplained open item afterwards.

**Architecture:** Thirteen small tasks, each in one area: core code, core tests, frontend tidy-ups and unit tests, the
shell's log file, the shell's watcher bookkeeping, the contract test, the changelog parser, e2e hardening, CI and doc
wording, three tasks that depend on the owner's answers (the slider grab, the caret and join after a task's
`created::` line, the website), and the bookkeeping. No notes-file format change.

**Tech Stack:** Rust 1.90 (`crates/core`, `app/src-tauri`), Svelte 5 + TypeScript, Vitest (node, no DOM), Playwright
e2e over WebView2 (`app/e2e/smoke.mjs`), plain HTML/CSS/JS for `site/`, GitHub Actions.

**Spec:** the eleven follow-ups files (`docs/plans/2026-11-07-01-…-followups.md` to
`docs/plans/2026-11-11-11-…-followups.md`), the triage `.superpowers/sdd/2026-11-17-12-followups/triage.md` (local
scratch; this plan's "Follow-up items: where each one goes" table is its binding summary), `docs/spec.md`,
`docs/format.md`, and this plan's "Product questions" once the owner answers them.

## State

Written 2026-11-17 at commit `6a2dbf8` (after 1.7.0). Approved by the owner on 2026-11-17 with the answers under
"Owner decisions" below. Tasks 10, 11 and 12 are in scope as recommended.

Counts: 145 open items found; 17 already done or settled since (struck through in Task 13 with the evidence);
55 to do here (11 of them depend on Q1 to Q4); 11 moved to the backlog (new items #87 to #91 and three notes on #85);
62 closed without work.

## Owner decisions (2026-11-17)

- **Q1:** recommended. A press on a slider's thumb keeps the value; a press on the track still jumps. Task 10 runs;
  e2e expects 208 PASS lines (new step 137).
- **Q2:** recommended. `Backspace` keeps moving the sub-blocks up; the spec is corrected to say so.
- **Q3:** recommended. The joined text and the caret go to the end of the task's own text, before its property lines.
- **Q4:** recommended. Fix the board image's scroll hint and the lone tablet cards; leave the opening animation (close
  that item).
- **Q5:** recommended. A changelog link without text shows its web address.
- **Q6:** approved. The close and backlog lists stand as written.
- **Pushing:** commit only during this plan; the owner pushes (to limit GitHub Actions runs). This overrides the
  push rule in "Global Constraints".

## Product questions (answered, see "Owner decisions")

Recommendation first. "Cost if wrong" is what changes later.

- **Q1. Pressing on a color slider's thumb.** Today a press anywhere on the hue or vividness thumb that is not its
  exact middle moves the value a little (up to about 11 hue steps or 5 vividness steps) before you drag. *Recommended:*
  a press on the thumb keeps the value and the drag moves it from there, as in a normal slider; a press on the track
  beside the thumb still jumps there. *Alternatives:* (a) leave it as it is and close the item. Cost if wrong: one
  helper and two lines in the picker.
- **Q2. `Backspace` in an empty block that has sub-blocks.** Today it removes the empty block and its sub-blocks move
  up one level; nothing is deleted. `Ctrl Shift K` deletes a block with its sub-blocks. The spec says only that
  `Backspace` "deletes it". *Recommended:* keep `Backspace` as it is (it never throws away text) and make the spec say
  that the sub-blocks move up. *Alternatives:* (a) `Backspace` deletes the sub-blocks too, like `Ctrl Shift K`;
  (b) `Backspace` does nothing in an empty block that has sub-blocks. Cost if wrong: one spec sentence (recommended), or
  a core change and its tests.
- **Q3. A task's `created::` and `done::` lines when the block below joins it.** When the block above is a task, its
  text ends with the `created::` (and `done::`) line. `Backspace` at the start of the next block joins that block's
  text onto the end of the `created::` line (for example `created:: 2026-11-10 09:12:00more words`), and after
  `Ctrl Shift K` the caret lands at the end of that line. *Recommended:* the joined text and the caret go to the end of
  the task's own text, before its property lines, so `created::` and `done::` stay intact. *Alternatives:* (a) only
  the caret after a delete moves there, `Backspace` stays as today; (b) leave both as they are. Cost if wrong: one
  function in the core's editing code and its tests. (The pre-flight scan confirms the join with a failing test first.)
- **Q4. Three small things on the website.** At phone width the board image scrolls sideways with no hint that it
  does; at tablet width two feature cards ("Page colors", "Graph") each sit alone in a full row; at phone width the
  tiles of the opening animation cross the "What it is" text for about half a second. *Recommended:* fix the first two
  (a fade at the image's right edge as a scroll hint; the lone cards take the two-column grid), leave the animation.
  *Alternatives:* (a) fix all three; (b) leave all three and close them. Cost if wrong: a few CSS rules in
  `site/site.css`.
- **Q5. A link without text in the changelog overlay.** A changelog line with `[](https://…)` shows nothing today (an
  empty link nobody can see or click). *Recommended:* show the web address itself as the link text. *Alternatives:*
  (a) show nothing, as now (close the item). Cost if wrong: one branch in the parser. Unlikely with git-cliff output.
- **Q6. The items closed without work and moved to the backlog.** The table below closes 62 items and moves 11 to the
  backlog. Those most worth a second look: no close button in the changelog overlay (closed: `Esc` and a click outside
  close it, as with the `F1` overlay); "Open log folder" stays clickable when there is no log folder (closed: it shows
  a notice that says so); grouping light and dark themes in the theme menu (closed until a twelfth theme); undo on the
  page with nothing selected (backlog #91); logging Git failures (backlog #90); e2e in CI (backlog #87); a custom
  domain for the website (backlog #88). *Recommended:* approve the lists as they are. *Alternatives:* name any item
  to keep open or to take into this plan. Cost if wrong: an item reopened later.

## Pre-flight rulings

(To be filled by the pre-flight scan, binding over the task text where they differ.)

- R1 (written with the plan). **CI:** a pull request from a branch of this repository already gets a run from its
  push, so the `pull_request` run is kept only for pull requests from forks; `cancel-in-progress` stays on for every
  ref except `main` (so a `main` run always saves its cache). Review item 70 ("each push to any branch and each pull
  request") still holds. This is developer-only; no product question.
- R2 (written with the plan). **The log file** (Task 4) never holds credentials (owner decision, plan 6 Q5/Q6), so a
  password that leaks today is a `fix`, with a changelog line.

Pre-flight scan 2026-11-17 at `fa74e01` (details: `.superpowers/sdd/2026-11-17-12-open-followups/preflight.md`):

- R3. The workspace is `.superpowers/sdd/2026-11-17-12-open-followups/` (`triage.md`, `progress.md`) wherever this
  plan says `2026-11-17-12-followups`.
- R4. Task 1 Step 3: `Changes` already derives `Default`; drop `Debug` (P9.6).
- R5. Task 1 Step 5: `bounded()` is already the one table; build each label from section and key at compile time
  (`concat!` in a small `macro_rules!`), keeping `Replaced.key: &'static str`.
- R6. Task 2 Step 1: rename/tree tests use `support::folder_at` where `dirs` is empty; `scale.rs` has no `2026-10-29`
  text, its `from_ymd_opt(2026, 10, 29)` uses `DAY`. Step 5's "mtime-independent content" means "the same bytes".
- R7. Task 4: a failed rename at rotation neither deletes nor truncates `breccia.log`; writing goes on, the rename is
  retried once the file has grown by another cap, and only if that fails too is the file truncated (never above 2×
  the cap). Subject: `fix(app): Log: the log is kept when it cannot be moved aside at its size limit`.
- R8. Task 4: in `panic_line` a `'` opens a masked span only when it does not follow a letter or digit; an unclosed
  `'` keeps the rest (apostrophes are not quotes).
- R9. Task 5 Step 2: `Recovery::NoFolder` has no generation today. The core's variant becomes
  `NoFolder { generation }` (the session's generation after its reset); `after_recovery` clears watcher and root only
  when `may_clear`. Task 5 also changes `crates/core/src/session/folder.rs`, its tests and every match site, and the
  readers of `notes_root`.
- R10. Task 5 Step 3: the Git states are Off, NoGit, NotRepo, Ready, Working, Problem; test with those names.
- R11. Behaviour changes no user sees are `chore(…)`, not `refactor`: Task 5 Step 2 (`chore(app): the watcher and the
  notes root keep their folder generation`) and Task 7 D1/D2.
- R12. Task 6 Step 2: read `STALE_TEXT` from `recovery.ts` as text; export nothing for tests only.
- R13. Task 7 Step 3 (D3) runs (Q5).
- R14. e2e step 137 goes right after step 135's block (`smoke.mjs` ~3923, before the Git steps from 45); step 136's
  block is at ~875, among the board steps.
- R15. Task 11: the caret after `Ctrl Shift K` is the window's (`host.svelte.ts` `deleteFocusOf`), not the core's.
  The core's `merge_into_previous` uses `own_text_end` (built on `inline::property`/`properties`). The window gets
  `ownTextEnd(text)` in `app/src/lib/deleteBlock.ts`, same rule, a comment naming the core function, a Vitest test and
  a `host.test.ts` case. The core test `delete_block_puts_the_caret_before_property_lines` is dropped. Second commit:
  `fix(app): Editor: after Ctrl Shift K the caret stops before the created line of a task above`.
- R16. Task 11: `own_text_end` is the start of the property lines only when they run to the end of the text, else
  `text.len()`. The refusal of a multi-line join onto a block with property lines stays (an open point for the owner).
- R17. Task 12 Step 1: a pure `afterDecode(img, go)` in `site/shards.js` (calls `go` once after `img.decode()` settles
  either way, at once without `decode`), tested in `site-hero.test.mjs` with a fake image; `hero.js` uses it and
  checks the fallback's time inside `go`. No new site file.
- R18. Task 13 writes every review item (107 on), Task 10's included; the log item covers both Task 4 fixes, the join
  item both Task 11 fixes. Spec §7.2 also gets Q3: after `Backspace` in an empty block and after `Ctrl Shift K` the
  caret goes to the end of the block above's own text, before its property lines.

## Global Constraints

- No notes-file format change. Files Breccia does not change stay byte-identical; notes files are saved with LF
  (spec §2, §4). `breccia/config.toml` keeps its comments and unknown keys.
- Every test must be able to fail: capture the RED run before the change. A test that pins behaviour that already
  holds must be shown to fail by a temporary mutation of the code, noted in the task report.
- Logic that needs tests goes into `app/src/lib/` (Vitest runs in node, without a DOM; `App.svelte` and components
  have no unit-test harness).
- No colour literals or `color-mix` outside `app/src/styles/tokens.css` (a test checks it). The website has its own
  stylesheet (`site/site.css`) and its own tests (`app/scripts/site*.test.mjs`).
- e2e: assert the bytes on disk where a file changes; wait for states, never sleep; never raise a tolerance to make a
  step pass. Baseline 207 PASS lines (last step number 136). Expected after the plan: 208 (Q1 answered
  yes, new step 137). The counted number is the rule; record it in `docs/STATUS.md`.
- Run `just e2e` after Tasks 4, 5, 8, 10 and 11 (and at the end). `BRECCIA_TRACE=1 just e2e` after Task 5 must report
  no unparsed trace lines.
- Commits: conventional subjects, one change per commit. `fix`/`feat` subjects are changelog lines in plain user words
  (no code names, paths, item or task numbers, at most about 90 characters, no trailing period). Tests, docs and
  tidy-ups use `test`, `docs`, `refactor`, `chore` or `ci`. Website commits are never `fix`/`feat`. No attribution
  lines. Commit on `main`; do not push (owner decision for this plan, see "Owner decisions").
- `docs/review.md` items for this plan start at 107, under a new heading `## Open follow-ups (plan 12)`.
- New backlog numbers start at 87 (86 is the highest in `docs/backlog.md` and `docs/backlogged.md`).

## Review Focus

- **A password with `/`, `?`, `#` or `@` in a Git remote URL** must not appear in the log file in any part. Pinned in
  Task 4 (`redact` cases with each character, and `user:p@ss@host`).
- **Log rotation on a file that cannot be renamed** (another program holds `breccia.1.log`): no log line is lost for
  the rest of the run, and the current log is not deleted. Pinned in Task 4.
- **A folder opened while a recovery from a background thread is finishing:** the newer folder's watcher and root win.
  Pinned in Task 5 (the pure decision function, both orders).
- **A hand-edited `CHANGELOG.md` at the release pause** (`## [x](url)` headings, tab after a bullet): the release-time
  tests and the parser agree. Pinned in Task 7 (one shared helper, tests on both forms).
- **Backspace joining onto a task with `created::` and `done::`** (if Q3 is yes): both property lines stay
  byte-identical, and undo restores the file. Pinned in Task 11.

---

## Follow-up items: where each one goes

"P6.14" means plan 6's follow-ups file, item 14. P11.F1 to F3 are plan 11's three unnumbered bullets ("file order"
comment; spec and format wording; the e2e flake). Reasons and evidence for every line are in the triage file.

| Verdict | Items |
|---|---|
| Already done or settled (strike through in Task 13) | P1.10, P1.11, P2.8, P2.12, P3.5, P3.7, P6.18, P7.16 (plan 9); P9.1 (plan 11); P9.2 (plan 9, review 87); P7.2 (owner, review 79); P1.18, P2.15 (owner ruling on backlog #62); P2.1 (review item 36 ticked); P7.12, P7.14 (owner ruling on backlog #68); P7.18 (existing test in `boards.test.ts`) |
| Task 1 | P9.4, P9.5, P9.6, P9.7, P9.8, P11.9, P11.F1 |
| Task 2 | P9.11, P9.12, P9.13, P7.15, P7.17 |
| Task 3 | P2.11, P2.13, P3.1, P3.2, P3.3, P3.4, P3.6, P4.3, P8.4, P7.4, P7.7, P7.10, P7.13 |
| Task 4 | P6.14 |
| Task 5 | P6.3, P6.24 (= P9.18), P9.10 |
| Task 6 | P6.11, P6.19, P9.17 |
| Task 7 | P10.4, P10.5, P10.6 (Q5), P10.9 |
| Task 8 | P9.16, P11.F3, P6.13, P7.21, P4.8, P7.5, P6.22 (step 51 text), P1.13 |
| Task 9 | P6.20, P6.22 (docs and CLAUDE.md parts), P6.25, P11.F2 |
| Task 10 | P4.9 (Q1) |
| Task 11 | P7.24 (Q3) |
| Task 12 | P5.6; P5.2, P5.3, P5.4 (Q4) |
| Task 13 | P7.22 (Q2: spec wording), the bookkeeping |
| Backlog | #87 e2e in CI (P6.21); #88 custom domain (P5.10); #89 recovery edges (P6.4, P6.5, P6.9, P6.10); #90 log Git failures and window errors (P6.15); #91 page-wide undo (P7.23); notes on #85: P1.9, P1.15, P7.19 |
| Close without work | P1.19; P2.14; P3.9, P3.11; P4.2, P4.4, P4.5, P4.7; P5.1, P5.5, P5.7, P5.8, P5.9; P6.1, P6.2, P6.6, P6.7, P6.8, P6.12, P6.16, P6.17, P6.23; P7.1, P7.3, P7.6, P7.8, P7.9, P7.11, P7.20, P7.25; P8.1, P8.2, P8.3, P8.5 to P8.11; P9.3, P9.9, P9.14, P9.15; P10.1, P10.2, P10.3, P10.7, P10.8, P10.10 to P10.14; P11.1 to P11.8 |

---

### Task 1: Core code tidy-ups (model: sonnet)

**Files:** Modify `crates/core/src/watch.rs`, `crates/core/src/naming.rs` (and its callers), `crates/core/src/workspace/changes.rs`,
`crates/core/src/color.rs`, `crates/core/src/config/file.rs`, `crates/core/src/inline.rs`,
`crates/core/src/search/query.rs`, `crates/core/tests/it/config.rs` (doc line on `HAND_LF`),
`crates/core/src/config/range.rs`, `crates/core/tests/it/` (range tests, if a name changes).

**Interfaces:** Produces nothing other tasks use. `journal_display` stays the public name (it is the more used one;
check with grep), `day_long` goes; if `day_long` has callers outside `naming.rs`, they switch to `journal_display`.

- [ ] **Step 1:** `watch::relevant`: replace `Err(_) => false` with one arm per `LoadWarning` variant (today only
  `NonUnicodeName` reaches it), so a new variant fails to compile. Doc comment says why.
- [ ] **Step 2:** `naming.rs`: keep `journal_display`, remove `day_long`, move its doc comment's content over. Run
  `cargo test -p breccia-core naming` (existing tests must pass unchanged; if a test names `day_long`, rename it).
- [ ] **Step 3:** `Changes`: derive `Default` only. `color.rs` lines 95 and 103: replace `try_from(..).ok()?` with
  `expect("bounded to 359 above")` / `expect("bounded to 200 above")`.
- [ ] **Step 4:** Comments (P9.8): `edit_file`'s `.replace("\r\n", "\n")` ("toml_edit writes LF already; kept as a
  safeguard for spec §4"); `with_property`'s `i == end` and the append after the loop; `QueryLink.kind`; wrap the
  long doc line on `HAND_LF`.
- [ ] **Step 5:** `range.rs` (P11.9, P11.F1): one table of `(section, key, label, range, default)` instead of the
  duplicated key and label strings; fix the doc comment; replace "file order of the keys" with the real order (the
  table's order). Run `cargo test -p breccia-core config::` before and after: same results, same notice texts (the
  existing tests pin the texts).
- [ ] **Step 6:** `cargo test --workspace` and `just lint` → green. Commits: `refactor(core): …` one per step
  (Steps 3 and 4 may share one `refactor(core): small tidy-ups and comments from the plan 9 review`).

### Task 2: Core test tidy-ups and pins (model: sonnet)

**Files:** `crates/core/tests/it/{board,rename,tree,scale,page_color,place,support/mod,task,color,disk,config,workspace,edit,session}.rs`
(whichever the items name; `support` may be `support.rs`).

- [ ] **Step 1 (P9.11):** `board.rs` `ok_on` uses the shared support helper's panic; rename and tree tests use
  `open_at` where `folder(files, dirs)` builds only files; `2026-10-29` literals in scale, page_color and place tests
  become `DAY`; doc comments on `support::run` and on `support::ids` (it fixes `DAY` and ms 0); the ~380-column
  literal in `page_color.rs` uses `concat!`; that file's comment on `color == None` says only what it guards;
  `task.rs` builds its expected string as a literal; `color.rs` uses one naming style; `disk.rs` sends `page.open
  "Other"` once and checks that answer. Pure moves: `cargo test -p breccia-core` count and results unchanged.
- [ ] **Step 2 (P9.12):** `parse_and_check_states_agree_on_keywords` compares with `matches!`/`assert_eq!` on the
  error values, `open_table` matches the `LoadWarning` variant. Mutation-check each (swap a variant; see red).
- [ ] **Step 3 (P9.13):** In `it/task.rs`, tests `an_empty_valued_property_line_is_kept` (`- TODO a\n  priority::\n`
  survives a state change byte for byte apart from the state word and the added `created::`) and
  `crlf_properties_are_read` (a CRLF file's `created::` is read). Pin-tests: show each can fail by mutation.
- [ ] **Step 4 (P7.15):** In `it/edit.rs`, `delete_block_empties_an_only_block_with_a_state_properties_or_a_fence`:
  `- TODO a\n  created:: 2026-10-29 14:05:09\n`, `- a\n  k:: v\n`, and a block holding a fenced code block, each
  becomes `-\n`. In `it/session.rs`, after deleting an only TODO block, a pending state settle for it changes nothing
  on disk (`read` equals `-\n`).
- [ ] **Step 5 (P7.17):** In `it/session.rs`, `block_delete_of_an_already_empty_only_block_writes_nothing`: the file
  `-\n` keeps its bytes and mtime-independent content, and `history.undo` afterwards answers that nothing was undone
  (no new undo step). If the core does add an undo step today, stop and report it (a ruling is needed); do not change
  code in this task.
- [ ] **Step 6:** `cargo test -p breccia-core` → green; commit `test(core): …` per step.

### Task 3: Frontend tidy-ups and unit-test gaps (model: sonnet)

**Files:** `app/src/lib/customColor.ts`, `app/src/lib/theme.test.ts`, `app/src/lib/themeSurfaces.test.ts`,
`app/src/lib/pageColors.test.ts`, `app/src/lib/slash.test.ts`, `app/src/styles/app.css`, `app/e2e/png.mjs`,
`app/e2e/png.test.mjs`, `app/scripts/page-colors.test.mjs`, a new test for `editor/slash.ts`
(`app/src/editor/slash.test.ts`).

- [ ] **Step 1 (P3.4) RED:** In `app/scripts/page-colors.test.mjs`, a test that reads `MIN_VIVID`, `MAX_VIVID`,
  `DEFAULT_VIVID` from `crates/core/src/color.rs` and `app/src/lib/pageColors.ts` as text and expects the same three
  numbers (and `VIVID_STEP` against the core's step if it has one). Show it fails by changing one side temporarily.
- [ ] **Step 2 (P3.1):** The sweep's gamut oracle uses `t.l + CUSTOM_DL * t.ds` (import `CUSTOM_DL`). Show it can
  fail by temporarily setting `CUSTOM_DL` to `0.05` in the module (the oracle then disagrees without the fix). Lower the
  timeout to `20_000` (P3.6) and drop the `console.info` (P2.11; keep the lowest-strength numbers as an `expect` on
  their minimum if one exists, else remove the line).
- [ ] **Step 3 (P2.13, P3.2, P3.3):** In `customColor.ts`: the chroma loop counts integer steps
  (`for (let n = 1; base.chroma - n * CHROMA_READ_STEP > 0; n++)`); `cache.set` without an assignment inside; a local
  `const TRACK_STEP = 25` for `vividTrack`; the `limited` doc comment reads "True when the readability guard gave less
  strength or chroma than the vividness asked for; the sRGB gamut alone never counts." Existing tests must stay green
  unchanged (no behaviour change).
- [ ] **Step 4 (P4.3):** Remove the overridden `z-index`, `padding` and `min-width` from `.page-color-picker` in
  `app.css` (`.menu` wins today), keeping `user-select: none`. No visual change.
- [ ] **Step 5 (P8.4):** Add `['--accent', '--select', 3]` to `PAIRS` in `themeSurfaces.test.ts`; mutation-check by
  lowering one theme's `--select` contrast temporarily.
- [ ] **Step 6 (P7.7):** `pageColors.test.ts` compares the CSS rules with whitespace collapsed
  (`s.replace(/\s+/g, ' ')`) on both sides; show it still fails when a selector is removed.
- [ ] **Step 7 (P7.10, P7.13):** `slash.test.ts`: `slashItems(s, 'toda')` → `['Today']`, `slashItems(s, 'd')` → the
  current list (write what it returns after checking it matches the spec's words). New `app/src/editor/slash.test.ts`:
  `slashSource(hooks).icon` gives `'calendar'` for the date items and `null` for a state; mutation-check.
- [ ] **Step 8 (P7.4):** `png.test.mjs`: colour types 0, 3 and 4 throw `unsupported PNG`; a PNG with no `IDAT` throws
  `PNG has no image data` (RED: today a zlib error). `png.mjs` checks for no `IDAT` before inflating.
- [ ] **Step 9:** `just test`, `just lint` → green. Commits: `test(app): …`, `refactor(app): …`, `chore(e2e): …`.

### Task 4: The log file: redaction and rotation (model: sonnet)

**Files:** `app/src-tauri/src/logfile.rs` (and its tests in the same file).

**Interfaces:** `pub fn redact(line: &str) -> String` and `pub fn panic_line(...)` keep their signatures.

- [ ] **Step 1 RED tests** in `logfile.rs`:
  - `redact_masks_passwords_with_url_characters`: `https://u:pa/ss@host/x`, `https://u:pa?ss@host`,
    `https://u:pa#ss@host`, `https://u:p@ss@host/x` → the user-info is `***` and no part of `pa`/`ss`/`p@ss` remains
    (`assert!(!out.contains("ss@"))` etc.); `https://host/a@b` (an `@` in the path, no user-info) stays unchanged;
    `ssh://git@host/x` and `git@host:x` stay unchanged (existing cases).
  - `panic_line_masks_single_quoted_spans`: `called with 'secret'` → `'…'`.
  - `stderr_gets_the_redacted_message`: make the stderr text come from one function `stderr_text(message) -> String`
    that redacts; test it. Trace lines (`trace cmd x wait=1.0ms run=2.0ms`) pass through unchanged.
  - `rotation_keeps_the_log_when_rename_fails`: with `breccia.1.log` made a folder (rename onto it fails), writing past
    the cap keeps writing lines (the newest lines are in `breccia.log`), and the file is truncated rather than deleted
    only if it is over the cap. Choose: on a failed rename, truncate `breccia.log` and go on (state it in the doc).
  - `a_failed_reopen_is_retried`: after the file handle is lost (`file = None` with `dir` set), the next `write` tries
    to open again and the line lands in the file.
  - `two_threads_write_whole_lines`: two threads × 500 lines; every line in the file is whole.
- [ ] **Step 2:** Run `cargo test -p breccia logfile` → the new tests fail (the thread test may pass: mutation-check
  it by dropping the lock).
- [ ] **Step 3: Implement.** The authority for user-info is everything up to the last `@` before the first whitespace,
  quote or angle bracket, provided an `@` comes before the first `/` *or* the part before it has a `:`; keep it a pure
  function. `panic_line` also masks `'…'` spans. `Inner::write` reopens when `file` is `None` and `dir` is `Some`.
  `set_logger` failure (P6.14) and a panic while another thread writes: leave as they are, with a doc line each.
- [ ] **Step 4:** `cargo test -p breccia`, `just lint`, `just e2e` (stderr still feeds the trace summary) → green.
- [ ] **Step 5: Commits:** `fix(app): Log: a Git password with a slash or a question mark no longer shows in the log`;
  `fix(app): Log: lines are no longer lost after the log file could not be renamed`; `test(app): …` for the rest.

### Task 5: Shell: watcher generations, trace lines, one test clock (model: sonnet)

**Files:** `app/src-tauri/src/watching.rs`, `app/src-tauri/src/recovery.rs`, `app/src-tauri/src/lib.rs` (the `App`
state), `app/src-tauri/src/git.rs` (line 126), `app/src-tauri/src/events.rs`, `app/src-tauri/src/guard.rs`,
`app/e2e/trace.mjs`, `app/e2e/trace.test.mjs`.

**Interfaces:** Produces in `watching.rs`:
`pub(crate) fn may_replace(current: Option<u64>, incoming: u64) -> bool` — true when there is no current generation or
`incoming >= current`. `notes_root` and `watcher` are stored with their generation (`Option<(PathBuf, u64)>`, the
watcher as `Option<(FolderWatcher, u64)>`).

- [ ] **Step 1 RED:** unit tests for `may_replace` (`None,3` true; `Some(3),3` true; `Some(4),3` false; `Some(3),4`
  true) and for a `may_clear(current: Option<u64>, by: u64) -> bool` (clears only its own or an older generation).
- [ ] **Step 2:** `start_watcher` replaces root and watcher only when `may_replace`; `after_recovery`'s
  `stop_watching` clears only when `may_clear` with the recovered generation (it is in `Recovery`/`follow`; pass it).
- [ ] **Step 3 (P6.24, P9.18) RED:** `trace.test.mjs`: a log with `trace git state=Idle` lines reports no unparsed
  lines and a `git state` row with its count. Then `trace.mjs` recognises `^trace git state=(\S+)$` and counts states
  in a separate line (`git states: Idle 10, Syncing 2`).
- [ ] **Step 4 (P9.10):** one `#[cfg(test)] pub(crate) fn test_clock() -> Clock` in `lib.rs`; `events.rs`, `guard.rs`
  and `lib.rs` tests use it.
- [ ] **Step 5:** `cargo test -p breccia`, `just lint`, `just e2e` (207), and `BRECCIA_TRACE=1 just e2e` shows no
  "unparsed trace lines". Commits: `fix(app): …` is not warranted (no user ever saw the race) — use
  `refactor(app): the watcher and the notes root keep their folder generation`; `chore(e2e): …`; `refactor(app): …`.

### Task 6: Contract and command-kind tests (model: sonnet)

**Files:** `app/src/lib/contract.test.ts`, `app/src/lib/theme.test.ts` (its glob), `app/src/lib/recovery.ts`,
`app/src-tauri/src/recovery.rs`, `crates/core/src/session/mod.rs` (the stale text), `crates/core/src/session/command.rs`
(its tests and the background kind's doc).

- [ ] **Step 1 (P9.17):** `contract.test.ts` and `theme.test.ts` list their files with `node:fs` (`readdirSync` +
  `readFileSync`) instead of `import.meta.glob`. Same assertions; show one still fails by renaming an event name in a
  scratch copy.
- [ ] **Step 2 (P6.11) RED:** contract cases: the `"recovered"` code in `recovery.rs` and `recovery.ts` match; the
  stale-generation text's fixed start (`request is for generation`) in `session/mod.rs` equals `STALE_TEXT`; the
  recovered event's field names match the TypeScript type; the English starts the window matches on exist on the Rust
  side. Each must fail when one side is edited.
- [ ] **Step 3 (P6.19):** the command-kind test collects every failing query and reports them all; the two queries
  that only reach their error path get an input that reaches their success path; a test that the archive run keeps
  the typing run; the background kind's doc says the archive run writes.
- [ ] **Step 4:** `just test`, `just lint` → green. Commits `test(app): …`, `test(core): …`.

### Task 7: The changelog parser (model: sonnet)

**Files:** `app/src/lib/changelog.ts`, `app/src/lib/changelog.test.ts`, `app/src/lib/changelogText.test.ts`,
`app/e2e/smoke.mjs` (step 134, lines ~2228-2229).

**Interfaces:** Produces in `changelog.ts`: `export function versionsOf(md: string): string[]` and
`export function bulletCount(md: string): number`, built on the parser itself, used by `changelogText.test.ts` and
(as a copy of the same rules, since e2e cannot import TS) by step 134; a comment in both places names the other.

- [ ] **Step 1 RED (D1):** tests: `versionsOf('## [1.2.0](https://x) - 2026\n')` and the parser agree (decide in the
  test: a linked heading *is* a version heading, as git-cliff could write it); a bullet with a tab after `-` counts in
  both.
- [ ] **Step 2 RED (D2):** `parseChangelog('<!-- c -->\n# Changelog\n\n## [1.0.0] - 2026-11-06\n')` has no title block.
- [ ] **Step 3 RED (D3, if Q5 yes):** `parseInline('[](https://a.b/c)')` → `[{ kind: 'link', text: 'https://a.b/c',
  href: 'https://a.b/c' }]`.
- [ ] **Step 4 (D4):** the hostile-sample test compares whole rendered texts (`toEqual` on the text list), not
  `toContain` per word; `+ x`, `* x` and an empty `- ` marker are tested.
- [ ] **Step 5:** implement; `just test`; `just e2e` not needed unless step 134 changed — it does, so run the e2e
  step 134 range via the full `just e2e` at Task 8's run. Commits: `fix(app): Changelog: a link without text shows its
  web address` (Q5), `test(app): …`, `refactor(app): …`.

### Task 8: e2e hardening (model: sonnet)

**Files:** `app/e2e/smoke.mjs`, `app/e2e/screenshots.mjs`.

- [ ] **Step 1 (P9.16, P11.F3):** `showDay` (line ~2545) and the other two `scrollIntoViewIfNeeded` calls retry inside
  their wait: re-locate and retry while the error is "not attached to the DOM", until the step's timeout. No sleep.
- [ ] **Step 2 (P6.13):** step 127 waits for the journal element that appears *after* the reload (capture an identity
  before: e.g. a `data-` generation or the element handle, and wait until it differs); add the case "text typed but not
  yet sent when the error hits" if it can be reached by typing then triggering the panic within the same tick, else
  write why not in the step comment; make the failure message say only what it checks.
- [ ] **Step 3 (P7.21):** step 130's caret check asserts the caret is in the emptied block's own row (by its block id),
  not just any empty line.
- [ ] **Step 4 (P4.8):** step 123: the highlight's end colour differs from white; the same check on a custom (opaque)
  wash row; pick the animation by name, not `getAnimations()[0]`.
- [ ] **Step 5 (P7.5):** step 128 moves the pointer off the rows after each theme and zoom change.
- [ ] **Step 6 (P6.22):** step 51's PASS text says "ten sections" (better: derive the count from the list).
- [ ] **Step 7 (P1.13):** `screenshots.mjs` logs the emit error (`console.warn`) instead of swallowing it.
- [ ] **Step 8:** `just e2e` twice → 207 PASS both times (record the counts). Commit `test(e2e): …` per step group.

### Task 9: CI and doc wording (model: sonnet)

**Files:** `.github/workflows/ci.yml`, `app/scripts/ci-workflow.test.mjs`, `app/scripts/workflow.test.mjs` (the
step-equality test), `app/scripts/docs.test.mjs` (line 10), `CLAUDE.md`, `docs/spec.md` (§6, line ~185),
`docs/format.md` (§11, line ~998).

- [ ] **Step 1 (P6.20) RED:** `ci-workflow.test.mjs` expects: the job runs on `push` for every branch, and on
  `pull_request` only when the head repository is a fork (`if: github.event_name == 'push' ||
  github.event.pull_request.head.repo.fork`); `cancel-in-progress` is `${{ github.ref != 'refs/heads/main' }}`. Then
  change `ci.yml` (ruling R1). The step-equality test's failure message names the step it could not find.
- [ ] **Step 2 (P6.22, P6.25):** wrap `docs.test.mjs` line 10 under 120 characters; in `CLAUDE.md` move the log-file
  and single-instance lines out of "Environment variables" into their own bullets under "Commands", and wrap the
  `BRECCIA_TEST_PANIC` line at ~120.
- [ ] **Step 3 (P11.F2):** spec §6: "…and leaves the file as it is when it is read (a later Settings save of that
  section writes the default)". `format.md` §11 the same meaning. `cargo test -p breccia-core format_doc::` → green.
- [ ] **Step 4:** `just test`, `just lint`. Commits: `ci: one CI run per change, and main keeps its cache`;
  `docs: …`; `chore: …`.

### Task 10: Pressing on a slider thumb keeps its value (model: opus; UI integration)

**Files:** `app/src/lib/pageColors.ts`, `app/src/lib/pageColors.test.ts`, `app/src/components/PageColorGrid.svelte`
(`sliderDrag`, ~line 233), `app/e2e/smoke.mjs` (new step 137 after step 136's block, before the shared tail).

**Interfaces:** Produces in `pageColors.ts`:
`export function pressOffset(x: number, width: number, f: number): number | null` — when `x` lies on the thumb at
fraction `f` (within `THUMB_W / 2` of its centre, using the same inset as `thumbLeft`), the offset `x - centre`;
otherwise `null`. `sliderDrag` subtracts that offset from each later `x` until the pointer is released; with `null`
it jumps as today.

- [ ] **Step 1 RED:** `pressOffset(70, 136, 0.5)` = 2 (centre 68); `pressOffset(80, 136, 0.5)` = null;
  `pressOffset(4, 136, 0)` = 0; `pressOffset(1, 136, 0)` = −3.
- [ ] **Step 2:** implement and wire it in `sliderDrag` for both sliders.
- [ ] **Step 3 RED e2e step 137:** on a page with `color:: hue 200`, press 3 px right of the hue thumb's centre and
  release without moving: the file still says `hue 200` (assert bytes; today it changes); press on the track 30 px
  away: the hue changes and the file says so; the same for vividness.
- [ ] **Step 4:** `just test`, `just lint`, `just e2e` → 208 PASS. Commit:
  `fix(app): Page colors: pressing on a slider's knob no longer nudges the color`. Review item in Task 13 (R18).

### Task 11: The caret and joined text after a task's property lines (model: sonnet; see R15, R16)

**Files:** `crates/core/src/edit.rs` (`merge_into_previous`, `delete_block`'s focus), `crates/core/tests/it/edit.rs`,
`crates/core/tests/it/session.rs`, `app/e2e/smoke.mjs` (step 130's caret check, if it moves).

**Interfaces:** Produces in `edit.rs`: `fn own_text_end(text: &str) -> usize` — the byte index where the block's
property lines (`key:: value` lines directly after the first line, spec §5 "Properties") begin, or `text.len()`.

- [ ] **Step 1 RED:** `it/edit.rs` `merge_keeps_the_task_property_lines`: `- TODO a\n  created:: 2026-10-29 14:05:09\n- b\n`
  merged → `- TODO ab\n  created:: 2026-10-29 14:05:09\n`, caret at 6 (after `a`); with a `done::` line too; a
  plain block (no properties) behaves as before. The delete caret is tested in the window instead (R15).
- [ ] **Step 2:** implement with `own_text_end`; joined text is inserted there; a following multi-line text keeps its
  lines after the first line (if that would put text lines after property lines, refuse with
  `WouldChangeStructure`, as the fence case does, and test it).
- [ ] **Step 3:** session test: undo restores the file byte for byte. `cargo test --workspace`, `just lint`,
  `just e2e` (207). Commit: `fix(core): Editor: joining a block onto a task keeps its created and done lines intact`.

### Task 12: Website: the hero waits for its image, and the small look points (model: sonnet)

**Files:** `site/hero.js`, `site/site.css`, `app/scripts/site-hero.test.mjs`, `app/scripts/site.test.mjs`.

- [ ] **Step 1 (P5.6) RED:** `site-hero.test.mjs`: the assembly starts only after the screenshot's `decode()` promise
  settles (resolved or rejected). Implement in `hero.js`.
- [ ] **Step 2 (Q4, as answered):** board image scroll hint (a fade mask on the right edge while it can scroll; CSS
  only), lone cards at 768 px take the grid; the hero tiles stay as they are (Q4; P5.4 is closed in Task 13).
  Check with `just site-shots` and `just site-check`.
- [ ] **Step 3:** `just test`. Commits `chore(site): …` (never `fix`/`feat`).

### Task 13: Bookkeeping (model: sonnet)

**Files:** the eleven follow-ups files, `docs/backlog.md`, `docs/review.md`, `docs/spec.md` (§7.2, Q2),
`docs/STATUS.md`, `.superpowers/sdd/2026-11-17-12-followups/progress.md`.

- [ ] **Step 1:** In each follow-ups file, strike through every item of the table above: `~~…~~ Done in plan 12
  (<what>).`, `~~…~~ Closed in plan 12: <reason from the triage>.`, `~~…~~ Moved to backlog #N.`, or for the 17
  already-settled ones `~~…~~ Done in plan 9 / settled (<evidence>).` Plan 9's header names those it closed; plan 7
  item 2 is struck as done (review 79).
- [ ] **Step 2:** `docs/backlog.md`: new items #87 to #91 (heading, area, the follow-up text it came from, "from plan
  12 triage"), and a dated note on #85 listing P1.9, P1.15 and P7.19.
- [ ] **Step 3 (Q2, Q3):** spec §7.2: `Backspace` in an empty block removes it and its sub-blocks move up one level;
  `Ctrl Shift K` deletes them; the caret goes before the block above's property lines (R18).
- [ ] **Step 4:** `docs/review.md` heading `## Open follow-ups (plan 12)`, items from 107: the log password masking
  (Task 4), the slider press (Task 10), the join onto a task (Task 11), the empty changelog link (Task 7), the website
  points (Task 12), CI running once per change (Task 9).
- [ ] **Step 5:** `docs/STATUS.md`: plan 12 in the table and "Next", test baseline counts, e2e PASS count.
- [ ] **Step 6:** commit `docs: plan 12 bookkeeping …`.

## Finishing (controller)

`just test`, `just lint`, `just e2e` (and `BRECCIA_TRACE=1 just e2e` for zero unparsed lines); write
`docs/plans/2026-11-17-12-open-followups-followups.md`; update `docs/STATUS.md`; delete the workspace's scratch files
except `progress.md` and `plan-path`; report to the owner (what was built, verification, rulings with their cost if
wrong, open items).
