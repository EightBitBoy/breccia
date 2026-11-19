# Plan 14: Open follow-ups of plans 12 and 13 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every open item of `docs/plans/2026-11-17-12-open-followups-followups.md` (29 items) and
`docs/plans/2026-11-18-13-dailies-followups.md` (16 items): fix the real defects, close the test gaps worth closing,
do the tidy-ups with clear value, move two items to the backlog, and strike through the rest with a reason.

**Architecture:** Nine small tasks, each in one area: the log's redaction, core tidy-ups and test pins, the Dailies
delete in the core, the Dailies view in the window, the Settings number fields, the changelog parser, e2e "nothing was
written" guards, doc wording, and the bookkeeping. No notes-file format change. One command changes shape
(`dailies.delete` gains `nested`), window and core together.

**Tech Stack:** Rust 1.90 (`crates/core`, `app/src-tauri`), Svelte 5 + TypeScript, Vitest (node, no DOM), Playwright
e2e over WebView2 (`app/e2e/smoke.mjs`).

**Spec:** the two follow-ups files above, `docs/spec.md` (binding), `docs/format.md`, and this plan's "Owner
decisions" once the owner answers them. The table "Follow-up items: where each one goes" is the binding summary of the
triage; each line was checked against `main` at `12ed08c`.

## State

Written 2026-11-19 at commit `12ed08c` (after 1.8.1 and the three Dailies changes `589a89d`, `a0b0f07`, `6123efa`;
backlog #92 to #94 closed by the owner). Approved by the owner on 2026-11-19, with every decision below answered.

Counts: 45 items. Three are not work (P12.1 and P13.1 are owner checks, carried as a note; P12.2 was answered in plan
12). Of the other 42: 16 fixed (code or docs change), 8 tested (test-only), 2 moved to the backlog (#95, #96; #96 is
the second half of P13.15, whose first half is tested), 17 closed without work.

## Owner decisions (answered 2026-11-19)

The owner chose the recommendation for all five: Q1 refuse the delete with the notice; Q2 the normal text menu;
Q3 typing any valid number (also the one shown) writes it; Q4 backlog #95; Q5 the lists as they are.

Plain words, recommendation first. "Cost if wrong" is what changes later. A "leave it" answer drops that part of the
task and the item is struck through as closed.

- **Q1. Deleting a daily while lines were added under it from outside.** You right-click a daily and choose Delete;
  while the question "Delete the daily '…'?" is open, another program (or a Git pull) adds lines under that daily.
  Today Delete removes the daily *and* the new lines, and the question never mentioned them. *Recommended:* refuse the
  delete with the usual notice ("This daily changed in another program; the list now shows the file as it is."); the
  list shows the file as it is, and a second Delete asks again, now saying that the lines under it go too.
  *Alternatives:* (a) leave it as it is (it is rare); (b) ask again at once, with the new wording. Cost if wrong: one
  check in the core and one field the window sends.
- **Q2. Right-click while editing a daily's text.** Today a right-click in the field shows no menu at all, so Copy and
  Paste are only on the keyboard. *Recommended:* the field shows the normal text menu (Cut, Copy, Paste), as the
  editor does; the Dailies menu (Delete) stays for right-clicks on rows that are not being edited. *Alternative:*
  (a) leave it (no menu while editing). Cost if wrong: a few lines in the view.
- **Q3. Settings number fields when the file holds a wrong value.** When `config.toml` has, say,
  `archive_after_days = 0`, Breccia uses the default (14) with a notice, and the Settings field shows 14. Typing 14
  there and leaving the field does nothing today, so the wrong value stays in the file and the notice comes back.
  This holds for "Archive finished tasks after … days" and the two Git minute fields. *Recommended:* typing a valid
  number (also the one shown) and leaving the field writes it, and the notice stops, as the Dailies reset field already
  does. *Alternatives:* (a) the field shows the wrong value from the file, with the problem text under it, until it is
  corrected; (b) leave it (editing the file by hand fixes it). Cost if wrong: one helper and three fields.
- **Q4. Pressing a page-tree row that is cut off at the sidebar's edge can drag the wrong row.** Found while
  building Dailies; it happens more in short windows, since the sidebar now has the Dailies entry. The cause is not
  known (it may be WebView2's own drag handling). *Recommended:* move it to the backlog (#95) until it can be shown
  step by step. *Alternative:* (a) look for the cause in this plan (one extra task on opus, size unknown). Cost if
  wrong: the bug stays until a later plan.
- **Q5. The items closed without work and moved to the backlog.** The table below closes 17 items and moves 2 to the
  backlog. Those most worth a second look: a log address such as `https://host:8080/a@b` keeps part of its path
  masked (it errs on the side of hiding); a Git password containing `"` or `<` (which a working Git address cannot
  hold unencoded) is not fixed, only `'` is; the website points (no fade hint in older browsers, the card order tied
  to positions); reduced motion is read when the Dailies view opens, not while it is open (as on boards); the e2e
  test's older fixed waits go to backlog #96. *Recommended:* approve the lists as they are. *Alternative:* name any
  item to keep open or take into this plan. Cost if wrong: an item reopened later.

## Pre-flight rulings

(To be filled by the pre-flight scan; binding over the task text where they differ.)

- R1 (written with the plan). The workspace is `.superpowers/sdd/2026-11-19-14-open-followups/`.
- R2 (written with the plan). The log never holds credentials (owner decision in force, plan 6 Q5/Q6), so a password
  that leaks today is a `fix`, with a changelog line.

## Global Constraints

- No notes-file format change. Files Breccia does not change stay byte-identical; notes files are saved with LF
  (spec §2, §4). `breccia/config.toml` keeps its comments and unknown keys.
- Every test must be able to fail: capture the RED run before the change. A test that pins behaviour that already
  holds must be shown to fail by a temporary mutation of the code, noted in the task report.
- Logic that needs tests goes into `app/src/lib/` (Vitest runs in node, without a DOM; `App.svelte` and components
  have no unit-test harness).
- No colour literals or `color-mix` outside `app/src/styles/tokens.css`.
- e2e: assert the bytes on disk where a file changes; wait for states, never add a sleep; never raise a tolerance to
  make a step pass. Baseline 215 PASS lines (last step 144). Expected after the plan, with Q1 to Q3 as recommended:
  218 (new steps 145, 146, 147, one PASS line each). The counted number is the rule; record it in `docs/STATUS.md`.
- Run `just e2e` after Tasks 3, 4, 5 and 7 (and at the end).
- Commits: conventional subjects, one change per commit. `fix`/`feat` subjects are changelog lines in plain user
  words (no code names, paths, item or task numbers, at most about 90 characters, no trailing period). Tests, docs and
  tidy-ups use `test`, `docs`, `refactor`, `chore` or `ci`. No attribution lines. Commit on `main` and push after each
  commit (CLAUDE.md), unless the owner says "commit only" when approving, as in plan 12.
- `docs/review.md` items start at 127, under a new heading `## Open follow-ups (plans 12 and 13)`.
- New backlog numbers start at 95 (94 is the highest in `docs/backlog.md` and `docs/backlogged.md`).
- Words from `docs/vocabulary.md`: daily, Dailies, notes folder, page tree, sidebar, notice.

## Review Focus

- **A daily deleted while a Git pull adds lines under it** (Q1): nothing the user did not see named in the question is
  deleted; the file keeps its bytes. Pinned in Task 3 (core test and e2e step 145).
- **A wrong number in `config.toml` typed back to its default** (Q3): the file gets the number, keeps its comments and
  other keys byte for byte, and the notice does not come back on the next reload. Pinned in Task 5 (e2e step 147
  asserts the whole file).
- **Enter, then a click elsewhere, on a Settings field while the first save is still on its way:** one write, not two.
  Pinned in Task 5 (`oneAtATime` unit test).
- **A Git password with an apostrophe** (`https://u:pa'ss@host/x`): no part of it in the log. Pinned in Task 1.
- **A refused Dailies change while `dailies.md` cannot be read:** one notice, not two. Pinned in Task 4.

---

## Follow-up items: where each one goes

"P12.4" means plan 12's follow-ups file, item 4; "P13.4" plan 13's. Every open item has exactly one line.

| Item | Disposition | Reason or task |
|---|---|---|
| P12.1 | Note (owner check) | Review items 107 to 112 stay for the owner to tick; not code work. |
| P12.2 | Already answered | Struck through in plan 12 (review 114). |
| P12.3 | Won't fix | `https://to/ken@host` cannot be told apart from a path with an `@` (`https://host/a@b`); a raw `/` there is invalid and Git needs it encoded. |
| P12.4 | Task 1 (fix) | `'` is allowed unencoded in a URL's user part (RFC 3986), so it no longer ends the address. `"` and `<` must be encoded in a working address: closed. |
| P12.5 | Task 1 (fix) | `file:///…/a@b.md`: an address whose authority is empty has no user part, so nothing is masked. The `host:8080/a@b` case stays (errs safe; telling a port from a password with `/` risks a leak). |
| P12.6 | Won't fix | Only a Git history request already on its way during a folder switch can see the old folder; the history view loads again when it is opened. |
| P12.7 | Won't fix | Wasted work only, during a folder switch that races a recovery; a pre-check would still need the later check. |
| P12.8 | Task 2 (test) | Core test: a property line followed by text, then a join. |
| P12.9 | Task 2 (fix) | `own_text_end` becomes private. |
| P12.10 | Task 2 (fix) | The stale-prone clause of the comment goes; the exhaustive match stays the guard. |
| P12.11 | Task 2 (fix) | Style points, at their current places (line numbers have moved). |
| P12.12 | Task 6 (fix) | Linked heading URL without whitespace; `bulletCount` strips a BOM. |
| P12.13 | Won't fix | Every press resets the grab; nothing goes wrong. |
| P12.14 | Task 2 (test) | The vacuous first half of `block_delete_of_an_already_empty_only_block_writes_nothing` goes. The CRLF pin stays as it is (closed: one more layer of guard). |
| P12.15 | Task 2 (test) | Mutation checks of the plan 12 pins and `may_clear`. A test that the shell calls `may_replace`/`may_clear` is not written: the shell has no harness for an app handle, and the calls are two lines. |
| P12.16 | Won't fix | Kept as a smoke test, as the file says. |
| P12.17 | Won't fix | Failing loudly when the code is reshaped is the point; the `if` check is right while CI has one job; long lines in a test are style only. |
| P12.18 | Task 6 (test) | Heading inlines checked; the comment regex shared, not copied. |
| P12.19 | Won't fix | Step 128's moves are stabilisation; step 127's case is documented as unreachable; step 137's `aria-valuenow` check catches the real regression, and a later write would overwrite the bytes it would check. |
| P12.20 | Won't fix | A `types` entry would let window code see Node's types; the per-file reference is narrower. `TRACK_STEP` is used in one function. |
| P12.21 | Won't fix | An acceptable degradation in older browsers. |
| P12.22 | Won't fix | Phone scrollbars overlay; nothing shows. |
| P12.23 | Won't fix | The site tests show a broken pairing. |
| P12.24 | Won't fix | The helper is tested; the wiring is three lines. |
| P12.25 | Task 8 (fix) | Spec §7.2 wording: "onto a block whose text ends with property lines". |
| P12.26 | Task 8 (fix) | Spec §7.2 `Keys` bullet rewrapped at 120 columns. |
| P12.27 | Won't fix | The 1.7.x changelog is published; the line is acceptable. |
| P12.28 | Won't fix | Not seen again in many runs since; reopen if it comes back. |
| P12.29 | Task 8 (fix) | `docs/STATUS.md` "Test baseline" names `CARGO_BUILD_JOBS=2 just e2e` for low memory. |
| P13.1 | Note (owner check) | Review items 115 to 126 stay for the owner to tick; not code work. |
| P13.2 | Backlog #95 (Q4) | Cause unknown; needs steps that show it. |
| P13.3 | Task 5 (fix, Q3) | Git minutes and archive days write a typed default over a refused value. |
| P13.4 | Task 3 (fix, Q1) | `dailies.delete` carries `nested`; refused when it no longer matches. |
| P13.5 | Won't fix | The same as pages: no file locking; the window shows the file as it is afterwards. |
| P13.6 | Won't fix | By design: a notice on the change to unreadable, not on every later change. |
| P13.7 | Task 4 (fix, Q2) | The edit field keeps its native text menu. |
| P13.8 | Task 5 (fix) | One save per field at a time (Dailies reset, Git, archive days). |
| P13.9 | Task 4 (fix) | A refused change reloads quietly: one notice. |
| P13.10 | Task 4 (fix) | `confirmSetting` renamed `confirmAsk`. The static import (the view is small) and reduced motion read on open (as on boards) are closed. |
| P13.11 | Won't fix | All six are harmless as described (errs safe or no effect). |
| P13.12 | Task 3 and Task 4 (test) | Core: two `checked::` lines, the I/O-error branch of `load_dailies`. Window: `moveTarget` out of range, the failure notice of `load()`. The "tidy only" reset case is already pinned (`dailies.test.ts`, `resetCommit('4:00', '04:00', false)`). |
| P13.13 | Task 3 (test) | Match the notice's variant and path, not its Debug text. |
| P13.14 | Task 4 (test) | Redundant test code removed. |
| P13.15 | Task 7 (test) + backlog #96 | The `frames()` guards in step 142 become write barriers (Task 7). The older fixed waits in `expectFile`/`expectFileLike` need a "nothing left to save" signal from the window: backlog #96. |
| P13.16 | Task 8 (fix) | Long dailies lines in `docs/spec.md` and `docs/review.md` rewrapped. |

---

### Task 1: The log: an apostrophe in a Git password, `file:///` addresses (model: sonnet)

**Files:** `app/src-tauri/src/logfile.rs` (`redact` and its tests in the same file).

**Interfaces:** `pub fn redact(line: &str) -> String` keeps its signature.

- [ ] **Step 1: RED tests** in `logfile.rs`, `redact_handles_apostrophes_and_empty_authorities`:
  - `redact("push https://u:pa'ss@host/x failed")` → `"push https://***@host/x failed"`;
  - `redact("fatal: unable to access 'https://u:p@h/x.git/': 403")` → `"fatal: unable to access 'https://***@h/x.git/': 403"`;
  - `redact("open file:///C:/notes/a@b.md")` and `redact("file:///home/a@b.md")` unchanged;
  - existing cases stay green.
- [ ] **Step 2:** `cargo test -p breccia logfile` → the new test fails (first and third cases).
- [ ] **Step 3:** In `redact`, the token ends at whitespace, `"`, `<` or `>` (not `'`); a token that starts with `/`
  (empty authority) has no user part. Update the doc comment.
- [ ] **Step 4:** `cargo test -p breccia`, `just lint` → green.
- [ ] **Step 5: Commits:** `fix(app): Log: a Git password with an apostrophe no longer shows in the log`;
  `chore(app): the log no longer masks part of a file address that holds an @`.

### Task 2: Core tidy-ups and test pins (model: sonnet)

**Files:** `crates/core/src/edit.rs`, `crates/core/src/watch.rs`, `crates/core/src/config/range.rs`,
`crates/core/tests/it/{edit,session,task,board,page_color}.rs`, `app/src-tauri/src/watching.rs` (mutation only).

- [ ] **Step 1 (P12.8):** `it/edit.rs` `merge_onto_a_block_whose_properties_are_followed_by_text`:
  `- a\n  k:: v\n  more\n- b\n` merged → `- a\n  k:: v\n  moreb\n` (the property line is not the end, so the text
  goes to the end); show it can fail by making `own_text_end` ignore whether the properties run to the end.
- [ ] **Step 2 (P12.9, P12.10):** `own_text_end` loses `pub(crate)`. In `watch::relevant`, drop "`classify` only
  returns `NonUnicodeName` of the others today" from the comment.
- [ ] **Step 3 (P12.11):** wrap the two doc lines over 120 columns in `config/range.rs` (lines 1 and 76) and the long
  doc line above `merge_into_previous` in `edit.rs`; in `it/board.rs` use `DAY` for each `(2026, 10, 29)`; find the
  extra parenthetical in `it/page_color.rs` (around the `color == None` comment) and drop it; turn raw multi-line string
  literals in `it/task.rs` (around the CRLF/property tests) and `it/session.rs` (the settle tests) into `\n` strings
  where the follow-up named them. Pure moves: test count and results unchanged.
- [ ] **Step 4 (P12.14):** in `it/session.rs` `block_delete_of_an_already_empty_only_block_writes_nothing`, remove the
  first half (the `pages/P.md` case before the comment); the second case stays.
- [ ] **Step 5 (P12.15):** mutation-check `merge_keeps_the_task_property_lines`,
  `undo_of_a_merge_onto_a_task_restores_the_file_byte_for_byte` and the `may_clear` test in
  `app/src-tauri/src/watching.rs`: break the code temporarily, see red, restore. If a test stays green, strengthen it
  until it fails. Record each mutation in the task report.
- [ ] **Step 6:** `cargo test --workspace`, `just lint` → green. Commits: `refactor(core): …` (Steps 2, 3),
  `test(core): …` (Steps 1, 4, 5).

### Task 3: Dailies: a delete is refused when lines were added under the daily (model: sonnet; Q1)

**Files:** `crates/core/src/session/command.rs`, `crates/core/src/session/mod.rs` (the `DailiesDelete` arm),
`crates/core/src/session/dailies.rs`, `crates/core/tests/it/dailies_session.rs`, `crates/core/tests/it/dailies.rs`,
`app/src/lib/types.ts`, `app/src/lib/dailies.svelte.ts`, `app/src/lib/dailiesState.test.ts`, `docs/spec.md` (§7.14
"Outside changes"), `app/e2e/smoke.mjs` (new step 145 after step 144).

**Interfaces:** Produces `Command::DailiesDelete { id: BlockId, shown: String, nested: bool }` (wire:
`{ type: 'dailies.delete', id, shown, nested }`, required). In `session/dailies.rs`:
`fn has_nested(doc: &Document, id: BlockId) -> bool`, the rule `DailyView::list` uses today (a child block, or lines
after the first other than `checked::`); `list` uses it.

- [ ] **Step 1: RED core tests** in `it/dailies_session.rs`:
  `delete_is_refused_when_lines_were_added_under_the_daily`: file `- a\n- b\n`; outside write to `- a\n  more\n- b\n`;
  `dailies.delete` with `shown: "a"`, `nested: false` → error code of the changed-elsewhere refusal, file bytes
  unchanged; the same command with `nested: true` deletes (`- b\n`). And `delete_with_nested_as_shown_deletes`:
  `- a\n\t- c\n- b\n`, `nested: true` → `- b\n`.
- [ ] **Step 2:** `cargo test -p breccia-core dailies_session::` → fails (unknown field / no refusal).
- [ ] **Step 3:** implement: the delete's op refuses (mapped to the changed-elsewhere error, like `NotADaily`) when
  `has_nested(doc, id) && !nested`. A `nested: true` sent for a daily that now has none still deletes (nothing hidden
  is lost).
- [ ] **Step 4 (P13.12 core, P13.13):** in `it/dailies.rs`, `check_writes_in_place_of_the_first_checked_line`:
  `- a\n  checked:: 2026-11-17 01:00\n  note:: x\n  checked:: 2026-11-16 01:00\n` checked at 2026-11-18 08:00 →
  the first `checked::` line takes the new time, the second stays (write what the code gives after checking it matches
  the doc comment "in the place of the first old one"); mutation-check. In `it/dailies_session.rs`,
  `an_unreadable_dailies_file_warns_on_open` matches `Notice::LoadWarning`/the warning's path field instead of
  `format!("{n:?}")`; add `load_dailies_reports_an_io_error` (make `breccia/dailies.md` a folder: the open warns
  `Unreadable` with that path and `dailies.add` answers `dailiesUnreadable`).
- [ ] **Step 5: window.** `types.ts` adds `nested: boolean` to `dailies.delete`; `Dailies.remove` sends `d.nested`
  (the row the question was asked for). `dailiesState.test.ts`: `remove` sends `nested` from the row (RED first).
- [ ] **Step 6: spec §7.14 "Outside changes":** add "A delete is also refused when lines were written under the daily
  after the question was asked; asking again names them."
- [ ] **Step 7: RED e2e step 145** (after step 144's block): add a daily `Solo`; right-click it, Delete, and while the
  confirm dialog is open write `dailies.md` from outside with `  more` under `Solo`; wait until the view has followed;
  press Delete in the dialog: the refusal notice shows and the file holds exactly the outside bytes (wait for the
  notice, then assert the bytes; then delete again, the question says lines go too, confirm, assert the bytes without
  `Solo`).
- [ ] **Step 8:** `just test`, `just lint`, `just e2e` (216). Commits:
  `fix(core): Dailies: a daily is not deleted when lines were added under it while asking`;
  `test(core): …`; `test(e2e): …`; `docs: …` (spec).

### Task 4: Dailies view: the edit field's menu, one notice, test tidy-ups (model: opus; UI integration; Q2)

**Files:** `app/src/components/DailiesView.svelte`, `app/src/lib/dailies.svelte.ts`, `app/src/lib/dailies.test.ts`,
`app/src/lib/dailiesState.test.ts`, `app/src/lib/dailiesDst.test.ts`, `app/src/App.svelte` (`confirmSetting` and its
two uses), `app/e2e/smoke.mjs` (new step 146).

**Interfaces:** `Dailies.load(opts?: { quiet?: boolean }): Promise<void>` — with `quiet` a failure is not a notice.

- [ ] **Step 1 RED (P13.9):** `dailiesState.test.ts` `a_refused_change_gives_one_notice_even_when_the_reload_fails`:
  `run` rejects both the command and the following `dailies.list` → `notify` called once, with the command's message.
- [ ] **Step 2:** `send` reloads with `{ quiet: true }`. Green.
- [ ] **Step 3 (P13.12 window):** tests `moveTarget` with an id not in the group and a place past the group's end
  (write what it returns after checking `moveTarget`'s doc; both must give "no move"), and `load()` failing → one
  `refused` notice with the error text. Mutation-check each.
- [ ] **Step 4 (P13.14):** remove the redundant variable in the DST test, the redundant `now` initialiser, the dead
  `setClock` call and the unneeded `tick()` in the Dailies state tests (the follow-up names them; find each by reading
  the files). Test count unchanged, all green.
- [ ] **Step 5 (P13.7, Q2):** the edit field (`data-testid="daily-edit"`) gets an `oncontextmenu` that stops the
  event's propagation, so the row menu's trigger never sees it and the browser's own text menu shows; `pick` keeps
  refusing a menu while editing for any other target.
- [ ] **Step 6 RED e2e step 146:** open a daily's edit field; dispatch a `contextmenu` event on it from the page
  (`new MouseEvent('contextmenu', { bubbles: true, cancelable: true })`) and read `defaultPrevented` → `false`, and no
  Dailies menu item (`[data-op="delete"]`) is shown; Esc closes the field; the file is unchanged (compare the whole file after the
  step's next real write, the barrier rule of Task 7). Red before Step 5.
- [ ] **Step 7 (P13.10):** rename `confirmSetting` to `confirmAsk` in `App.svelte` (one function, two uses).
- [ ] **Step 8:** `just test`, `just lint`, `just e2e` (217). Commits:
  `fix(app): Dailies: a refused change shows one notice, not two`;
  `fix(app): Dailies: right-clicking while editing a daily shows the text menu with Copy and Paste`;
  `test(app): …`; `test(e2e): …`; `refactor(app): …`.

### Task 5: Settings number fields take the default back, and save once (model: opus; UI integration; Q3)

**Files:** `app/src/lib/settingsForm.ts`, `app/src/lib/settingsForm.test.ts`,
`app/src/components/settings/GitSection.svelte`,
`app/src/components/settings/BoardsSection.svelte`, `app/src/components/settings/DailiesSection.svelte`,
`app/src/components/SettingsView.svelte`, `app/src/App.svelte` (where `dailiesResetInvalid` is set, ~line 602),
`docs/spec.md` (§6, the sentence on refused values), `app/e2e/smoke.mjs` (new step 147).

**Interfaces:** Produces in `settingsForm.ts`:
- `export const REPLACED = { commitDelay: '[git] commit_delay_minutes', pullInterval: '[git] pull_interval_minutes',
  archiveDays: '[board] archive_after_days' } as const` (the core's labels, `crates/core/src/config/range.rs`).
- `export function numberCommit(typed: string, stored: number, invalid: boolean, problem: string | null): number | null`
  — `null`: nothing to send (a problem, or the same number while the file's value is not refused).
- `export function oneAtATime(f: () => Promise<void>): () => Promise<void>` — a call while the previous one has not
  settled does nothing.
Section props gain `invalid` flags: `GitSection` `delayInvalid`, `intervalInvalid`; `BoardsSection` `archiveInvalid`;
`App.svelte` computes them from `ConfigView.replaced` like `dailiesResetInvalid`.

- [ ] **Step 1 RED:** `numberCommit('14', 14, false, null)` → `null`; `('14', 14, true, null)` → `14`;
  `('15', 14, false, null)` → `15`; `('0', 14, true, 'Enter a number from 1 to 3650.')` → `null`. `oneAtATime`: with
  a promise that has not settled, two calls run `f` once; after it settles a third call runs it again.
- [ ] **Step 2:** implement; green.
- [ ] **Step 3:** wire: each Git field and the archive field use `numberCommit` with its flag (the Git commit sends both
  values when either field has something to send); the three sections' `commit` (Dailies reset too, P13.8) go through
  `oneAtATime`. The `ConfigView.replaced` doc comment in `types.ts` lists all four keys.
- [ ] **Step 4:** spec §6: add "typing a valid value in its Settings field, also the default shown there, writes it".
- [ ] **Step 5 RED e2e step 147:** write `config.toml` from outside with `archive_after_days = 0` in `[board]` (keep a
  comment line above it); wait for the notice; open Settings > Boards; the field shows `14`; fill `14`, press Enter,
  then click elsewhere; wait until `config.toml` equals the earlier bytes with `archive_after_days = 14` (comment kept);
  the same for `[git] commit_delay_minutes` if the Git section is shown in e2e (else unit tests only; note it). Red
  before Step 3.
- [ ] **Step 6:** `just test`, `just lint`, `just e2e` (218). Commits:
  `fix(app): Settings: typing the default into a number field fixes a wrong value in the settings file`;
  `fix(app): Settings: Enter and then a click elsewhere saves a field once`;
  `test(e2e): …`; `docs: …`.

### Task 6: The changelog parser (model: sonnet)

**Files:** `app/src/lib/changelog.ts`, `app/src/lib/changelog.test.ts`, `app/src/lib/changelogText.test.ts`,
`app/e2e/smoke.mjs` (step 134's copy of the rules).

**Interfaces:** `changelog.ts` exports `COMMENT` (the comment regex) for the tests; `versionsOf` and `bulletCount`
keep their signatures.

- [ ] **Step 1 RED (P12.12):** `versionsOf('## [1.0.0](https://a b) - 2026\n')` → `[]` and the parser gives that
  heading `version: null` (they agree: a URL with whitespace is no link); `bulletCount('\uFEFF- a\n- b\n')` → `2`.
- [ ] **Step 2:** `VERSION`'s link part takes no whitespace (`\([^)\s]*\)`, as the inline link rule); `bulletCount`
  strips a leading BOM. Mirror both in step 134's copy, with the comment naming the other place.
- [ ] **Step 3 (P12.18):** `changelog.test.ts` (the heading test, ~line 93) checks the heading's `inlines`; the "keeps
  every word" test imports `COMMENT` instead of its own copy. Mutation-check the heading test.
- [ ] **Step 4:** `just test`, `just lint` → green (step 134 runs in Task 7's `just e2e`). Commits:
  `chore(app): the changelog reader agrees with itself on unusual headings and a BOM`; `test(app): …`.

### Task 7: e2e: "nothing was written" checks wait for a later write (model: sonnet)

**Files:** `app/e2e/smoke.mjs` (step 142, and any `frames()` used as a no-write guard in steps 138 to 147).

Rule: after Cancel or Esc, the step does its next real change through the same queue and asserts the *whole* file
after it equals the earlier bytes plus exactly that change. Commands run in order, so a write from the cancelled
action would show. Where no later change follows in the step, add one that the step undoes (for example add a daily
`Barrier` and delete it), asserting bytes both times.

- [ ] **Step 1:** in step 142, replace each `await frames()` + `readAt(...) === kept…` pair after Cancel/Esc with the
  barrier; keep the step's PASS lines the same.
- [ ] **Step 2:** show the guard can fail: make the Cancel button resolve true temporarily (or send the delete on
  Cancel) and see step 142 fail; restore. Record it in the report.
- [ ] **Step 3:** `just e2e` twice → 218 PASS both times. Commit `test(e2e): no-write checks after Cancel and Esc wait
  for the next write`.

### Task 8: Doc wording and wrap (model: haiku)

**Files:** `docs/spec.md` (§7.2, §7.12, §7.14), `docs/review.md` (items 115 to 126), `docs/STATUS.md` ("Test
baseline").

- [ ] **Step 1 (P12.25):** spec §7.2: "(a block of several lines is not joined onto a block with property lines, and a
  notice says why)" → "(a block of several lines is not joined onto a block whose text ends with property lines, and a
  notice says why)".
- [ ] **Step 2 (P12.26, P13.16):** rewrap to at most 120 columns, words unchanged: the `Keys` bullet of §7.2, every line
  of §7.12 and §7.14 over 120, and every line of review items 115 to 126 over 120. Check: `git diff --word-diff` shows
  only Step 1's words; `awk 'length > 120'` over those ranges prints nothing; `cargo test -p breccia-core format_doc::`
  and `just test` green (`app/scripts/docs.test.mjs` reads the docs).
- [ ] **Step 3:** spec §7.14 last bullet: "(`docs/backlog.md`)" → "(closed as not needed, `docs/backlogged.md` #92 to
  #94)".
- [ ] **Step 4 (P12.29):** `docs/STATUS.md` "Test baseline": "With little memory, `CARGO_BUILD_JOBS=2 just e2e`."
- [ ] **Step 5:** commit `docs: spec wording on joins, wrapped lines, low-memory e2e hint`.

### Task 9: Bookkeeping (model: sonnet)

**Files:** both follow-ups files, `docs/backlog.md`, `docs/review.md`, `docs/STATUS.md`,
`.superpowers/sdd/2026-11-19-14-open-followups/progress.md`.

- [ ] **Step 1:** in both follow-ups files strike through every item of the table: `~~…~~ Done in plan 14 (<what>).`,
  `~~…~~ Closed in plan 14: <reason>.`, `~~…~~ Moved to backlog #N.` P12.1 and P13.1 stay as notes.
- [ ] **Step 2:** `docs/backlog.md`: **#95. Pressing a cut-off page-tree row can drag the wrong row (Pages and
  links)** (P13.2 text; "from plan 14 triage"; to do: steps that show it, then the cause); **#96. A "nothing left to
  save" signal for the e2e test (Tests)** (`expectFile` and `expectFileLike` wait a fixed second for the save pause;
  the window could expose when nothing is pending and the queue is idle, so the waits become waits for a state; from
  P13.15).
- [ ] **Step 3:** `docs/review.md`, heading `## Open follow-ups (plans 12 and 13)`, items from 127, each with how to try
  it: 127 the log hides a Git password with an apostrophe (Task 1); 128 a daily is not deleted when lines were added
  under it while asking (Task 3); 129 right-click while editing a daily shows Copy and Paste (Task 4); 130 a refused
  Dailies change shows one notice (Task 4, with `dailies.md` made unreadable); 131 typing the default into a Settings
  number field fixes a wrong value in the file (Task 5). Drop any item whose question the owner answered "leave it".
- [ ] **Step 4:** `docs/STATUS.md`: plan 14 in the table and "Next", the test counts, the e2e PASS count.
- [ ] **Step 5:** commit `docs: plan 14 bookkeeping, follow-ups struck, backlog #95 and #96`.

## Finishing (controller)

`just test`, `just lint`, `just e2e`; write `docs/plans/2026-11-19-14-open-followups-followups.md`; update
`docs/STATUS.md`; delete the workspace's scratch files except `progress.md` and `plan-path`; report to the owner (what
was built, verification, rulings with their cost if wrong, open items).
