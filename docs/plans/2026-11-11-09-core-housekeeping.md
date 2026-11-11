# Core housekeeping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tidy the core and the shell without changing anything a user can see: split the three files over 1,000
lines along their seams, give repeated bookkeeping one home each, decide "what is a page file" in one place, and give
the core's tests one shared support module.

**Architecture:** Pure moves, guarded by the existing tests (core 737, Vitest 1068, e2e 201 PASS lines). The order is
safe for moving code: first the test support module (later tasks write their characterization tests with it), then
the format layer (`config`, `task`, `outline`, `color`, `inline`), then the workspace (bookkeeping, change tracking,
the path classifier), then the session (the command table, then the small findings), then search and Git, and last
the shell's `lib.rs`. Where a move is not a pure move (a rule is subtle, or two copies turned out to differ), a
characterization test pins today's behaviour first, and the plan says which differences must stay.

**Tech Stack:** Rust 1.90 (`breccia-core`, the Tauri 2 shell `breccia`), `toml_edit`, `rusqlite`, Vitest (one
contract test), Playwright over WebView2 (`just e2e`). No new dependency.

**Spec:** the audit `docs/audit/2026-11-10/` (`program.md` themes T1 to T3, T5 to T7, T9 to T12; `notes.md`, whose
rules are invariants here), `docs/spec.md` §2 (anti-goals), §4 (files), §9 (commands), and this plan's "Product
questions". The audit's line numbers are from commit `4b91b0c`; "Code against the audit" below gives what changed.

## Scope

Audit moves M1 to M8, M10 to M14, M16, M18, M22 to M31 and M33. M9 is done (plan 6). M15, M17 and M19 to M21 and
M32, M34, M35 stay where the audit's "Priorities" put them (M17 is done, plan 6). Also these open follow-ups and one
backlog item, which are housekeeping of the same kind:

| Taken | What | Task |
|---|---|---|
| Plan 1 follow-up 10 | `rename.rs`: assert the re-sent keys equal `["2026-10-29"]` | 2 |
| Plan 1 follow-up 11 | `page_color.rs`: the null pick on `other` must be able to fail | 2 |
| Plan 2 follow-up 8 | raw newline and tab characters in test strings of `color.rs`, `page_color.rs`, `render.rs` | 2 |
| Plan 3 follow-up 7 | long module doc line in `format_doc.rs` | 2 |
| Plan 2 follow-up 12 | `session/view.rs` spells `crate::color::PageColor` four times | 6 |
| Plan 3 follow-up 5 | `color.rs` casts with `v as u8` | 6 |
| Plan 7 follow-up 16 | a redundant second `self.find(id)?` in `Document::delete_block` | 5 |
| Plan 6 follow-up 18 | the generation exemption and the "writes the config" list are hand-kept lists of commands | 10, 14 |
| Backlog #31 | link filters in search are paired by position | 13 |

Not taken, and why: plan 6 follow-ups 2 to 16 change how recovery behaves; plan 6 follow-up 24 changes the trace
lines that `app/e2e/trace.mjs` reads (dev-visible, its own small change); plan 7 follow-up 17 changes a command's
answer; backlog #30 changes notice wording; plan 1 follow-up 15 is performance and waits for a measurement (audit
plan 6, "Measure, then decide").

## Code against the audit (checked 2026-11-11 at `e35ed85`)

Since `4b91b0c`, plans 6 to 8 changed only these core and shell files: `session/{command,mod}.rs`, `edit.rs`,
`fsio.rs`, `lib.rs`, `watch.rs`, `crates/core/Cargo.toml`, the tests `backlinks.rs`, `edit.rs`, `session.rs`, and the
shell's `lib.rs`, `git.rs`, plus the new `guard.rs` and `logfile.rs`. Everything else the moves name is as the audit
read it. Per move:

- **M1, M3:** as described; `config.rs` is 1,160 lines. `fsio::write_atomic` creates the parent folder
  (`fsio.rs:45`), so the `create_dir_all` in `edit_file` can go.
- **M2: the error order must stay.** `check_states` checks state by state (keyword, repeat, then colour), so for
  `[A with a bad colour, B with a bad keyword]` it reports A's colour. A shared "check all keywords first" would report
  B's keyword instead: a different message in Settings. The shared helper is per state (Task 4).
- **M4:** as described. `with_archived`, `with_created` and `with_done` return the text unchanged when their key is
  already among the properties (they never replace); `with_priority` replaces the first and drops further ones. Both
  rules stay.
- **M5:** eight `.ok_or(EditError::UnknownBlock)` in `task.rs` (lines 352 to 507) and two in `outline.rs` (473, 524);
  `edit.rs:414` has the private `find`. Plan 7 added `delete_block` with a redundant second `self.find(id)?` (follow-up
  16).
- **M6, M7:** as described, with two corrections. `outline::content` and `aliases::content` are **not** the same: for a
  last line ending in a lone `\r` (no `\n`) the first keeps the `\r`, the second strips it. That half of M7 is dropped.
  And `title_line` parses the raw line while `color_line` trims `\r\n` first; the shared helper therefore yields
  `(index, line)` after the front matter, and each caller keeps its own parse.
- **M8:** `mod tests` at `outline.rs:558`, `Carried` and `carry_ids` at 752 and 765. The tests move to the end.
- **M10:** the four sites are `pages.rs:463` (`delete_page`), `pages.rs:571` (`delete_folder`), `disk.rs:256`
  (`file_gone`), `disk.rs:352` (`adopt`), as the audit says.
- **M11: `reload` cannot go through `edit_with_config` as the audit proposes.** `reload` sets `on_disk` before
  `index_page` runs, and `index_page` asks `page.has_content()`, which is true for any page with a file. Setting
  `on_disk` after the re-index (inside a closure that only gets the `Document`) would index a once-fileless page as
  "no content" and change its aliases and linked-only state. The shared helper therefore hands the closure the whole
  `Page` (Task 7).
- **M12, M13:** as described (the stray line is now `workspace/mod.rs:506`).
- **M14, two corrections.** (a) The four deciders do not agree today: `watch::relevant` compares the extension
  case-sensitively, so a `pages/x.MD` saved while Breccia runs is ignored without a warning, while `open` warns about
  it (`LoadWarning::ExtensionCase`). This plan keeps each caller's answers exactly (Product question Q2). (b)
  `git/message.rs` names files Git reports, including ones Breccia does not load (a hidden folder, a journal with a bad
  name); it takes the shared constants but keeps its own rule.
- **M16:** plan 6 split `dispatch` into `dispatch` (the typing-run rule, 20 lines) and `execute` (the `match`, lines
  330 to 845); `session/mod.rs` is now 1,501 lines. The target applies to `execute`. The `GitStatus | GitSync |
  GitInit | GitLog` arm that answers `shellOnly` stays (M35 is the contract plan's).
- **M18:** the limits are at `session/mod.rs:592` and `613`, checked before `config_guard`; the order stays.
- **M22 to M25:** as described (`board.rs:318` `raises`, `board.rs:346` `ArchivedRow`, `mod.rs:57` `typed_step`;
  formats at `naming.rs:79`, `render.rs:411`, `413`, `board.rs:248`, `342`, `tree.rs:125`; `TagView` at `tree.rs:21`,
  `NameView` at `view.rs:492`; `history.rs:486`; the doubled doc line at `session/search.rs:319`).
- **M26:** `busy_name` is identical twice. `failed` differs only in taking `&GitError` or `GitError`. `first_line`
  is **not** the same twice: both take the first non-empty stderr line, but the fallback differs (`GitError`'s text in
  `engine.rs`, `git failed (<code>)` in `sync.rs`). Only the stderr scan is shared.
- **M28: the rebuild rule is subtle and must stay.** Today a file damaged when it is opened is deleted and created
  again inside `SearchIndex::open`, silently, and that does **not** use up the one rebuild (`IndexState.rebuilt` stays
  false). Damage found by `prepare` after the open does use it up. A later damage then rebuilds only if `rebuilt` is
  still false, else the index moves to memory with a notice. Task 13 moves the deletion into `IndexState` with these
  exact counts.
- **M29:** as described; it also closes backlog #31.
- **M30:** as described (`git/engine.rs:116` to `118`, `#[doc(hidden)]` setters from line 203).
- **M31:** helper copies today: `put` in 17 files, `clock` 14, `open` 12, `ok` 12, `cmd` 10, `read` 8, `folder` 7,
  `ids` 2. Their signatures differ (`ok(s, json, ms)` in `session.rs`, `ok(s, json)` with a fixed day in
  `board.rs`), so files keep one-line local wrappers where their shape differs.
- **M33:** `app/src-tauri/src/lib.rs` is now 1,841 lines (plan 6 added recovery, the test-panic hook and the log
  folder). The "seven places that lock the session" are already one helper (`guard.rs`, plan 6). Two things read
  `lib.rs` as text: `app/src/lib/contract.test.ts` (the event constants, among them `TRAY_EXIT`) and the Rust test
  `single_instance_is_the_first_plugin` (`include_str!("lib.rs")`, looks for `pub fn run()`).

## Product questions

This is a refactor plan: no task changes what a user sees, except the one fix the owner chose for Q2 (Task 9, Step 7).

**Owner decisions (2026-11-11):** Q1: keep today's behaviour; add a backlog item (Finish). Q2: alternative (a), fix
it in Task 9 as a separate `fix` commit with its own review item.

- **Q1. Settings typed into `breccia/config.toml` by hand that are out of range** (M18). Settings refuses a Git
  interval over 1,440 minutes and "archive after" outside 1 to 3,650 days. A hand-edited file with
  `pull_interval_minutes = 100000` or `archive_after_days = 0` loads without a word and is used as written. After Task
  4 the rule lives in one place, so it could apply to the file too.
  *Recommended:* keep today's behaviour in this plan; put "out-of-range values in a hand-edited `config.toml`" on the
  backlog for a plan that also decides the wording. *Alternatives:* (a) the file loads, each out-of-range value is
  replaced by its default for this run, and one notice names the key (the file is not rewritten); (b) the file is
  refused like a file with a bad state keyword: Breccia keeps the settings it had and shows "cannot be read". Cost if
  wrong: one call in `Config::validate` and a notice text.
- **Q2. A page file with an upper-case extension saved while Breccia runs** (found while checking M14). When a folder
  is opened, `pages/Plan.MD` gives the warning "only `.md` is loaded". The same file saved while Breccia is open is
  ignored without a warning until the folder is opened again.
  *Recommended:* keep it in this plan (it is a pure refactor) and add it to the backlog; the one classifier from Task
  9 makes the later fix one line. *Alternatives:* (a) fix it in Task 9 (the watcher passes such files on, and the
  warning appears at once; a small visible change with its own review item); (b) leave it for good. Cost if wrong: one
  match arm in `watch.rs` and a test.

## Global Constraints

- **No visible change.** No `feat` or `fix` commit unless a real defect turns up (then it gets a failing test, its own
  commit and a `docs/review.md` item under a new heading `## Core housekeeping (plan 9)`, numbered from 87). Commit
  subjects are `refactor(core): …`, `refactor(app): …`, `test: …`, `chore: …` or `docs: …`.
- **The rules in `docs/audit/2026-11-10/notes.md` are invariants.** Each task names the ones it must not weaken. In
  short: write, re-read, compare, else refuse (`Document::store`, `replace_keeping_structure`, `set_preamble`); one line
  classifier (`outline::LineScanner`); one state rule (`task::starts_with_keyword`); never write over bytes Breccia did
  not read (`save_with`, `path_taken`, `rename_no_clobber`); unsaved edits win over the disk (`kept_unsaved`); own writes
  recognised by content, never by time; block ids survive a reload (`carry_ids`, `DiskReport::gone`); a rename stands
  once the file is renamed; config writes keep the user's file (`Expect::Text`, comments and unknown keys kept,
  `DEFAULT_TOML` equals `Config::default()`); `Session::run` is the one entry, with `Clock` as a parameter; a failed
  save never fails a command; edits are all-or-nothing (`mutate_tracked`); generations refuse stale ids; settings are
  never written from stale knowledge (`config_guard`); the search index is a cache that repairs itself once; Git never
  destroys; nothing is emitted while the session lock is held; the event payload keeps the answer's field order.
- **Public paths stay** where the shell or the tests use them (`breccia_core::{Config, State, Board, ConfigError,
  Command, Output, …}`, `breccia_core::config::{Expect, PALETTE, …}`, `breccia_core::watch::FolderWatcher`), unless a
  task says otherwise.
- **Test discipline.** Every new test fails first (RED) and the RED run is in the task report. A characterization test
  that pins behaviour which already holds is shown to fail by a temporary mutation of the product code, noted in the
  report and reverted. For a pure move the task names the existing tests that guard it; the number of tests may not
  drop: record `cargo test -p breccia-core -- --list 2>/dev/null | grep -c ": test$"` before and after (737 core tests
  at the start of the plan, plus what the plan adds).
- **Sizes after the plan:** no file under `crates/core/src/` or `app/src-tauri/src/` over 1,000 lines; the new and
  split files under 600 where the task says so.
- `cargo fmt --all` before every commit; `just lint` clean (clippy `-D warnings`).
- e2e: one new step (Task 9, Step 7, the Q2 fix); the expected count is **201 PASS lines** until then and **202** after. `just e2e` runs after Tasks 9, 10 and 14 and at the
  finish.
- Commit on `main` and push after each commit. No attribution lines. LF line endings.
- No new dependency (the core's dev-dependency on itself in Task 12 is not a new crate).

## Review Focus

- **Page files with unusual names** (`pages/x.MD`, `pages/.hidden/x.md`, `pages/v1.2` as a folder, `journals/sub/x.md`,
  `journals/not-a-date.md`, a non-UTF-8 name, `breccia/config.toml`, `breccia/other.toml`). Open, the watcher, a disk
  change and the Git message must answer exactly as today. Pinned in Task 9 (`classify_table` and the per-caller
  characterization tests written before the move).
- **A hand-written `config.toml` with comments, unknown keys and CRLF** written through each of the four writers. The
  bytes must be identical before and after the split. Pinned in Task 3 (`writers_keep_the_users_file_bytes`, recorded
  before the move).
- **Property lines in odd places** (two `priority::` lines, a property line after a non-property line, a one-line
  block, a block whose first property is not ours). Set, replace and remove must give today's bytes. Pinned in Task 5
  (`with_property_*` tests written against the old functions first).
- **A damaged search index, at open and later.** The first damage at open is silent and keeps the one rebuild; the
  second damage moves to memory with a notice. Pinned in Task 13 (`damage_at_open_keeps_the_one_rebuild`,
  `damage_twice_moves_the_index_to_memory`, written before the move).
- **Block ids after a page is removed, rekeyed, reloaded or adopted.** An old id must not find a page, the kept ids
  must find the right one, and a once-fileless page that is reloaded keeps its aliases. Pinned in Task 7
  (`locate_follows_every_page_change`, `reload_of_a_fileless_page_indexes_its_aliases`).

---

### Task 1: A shared support module for the core's tests (model: sonnet)

M31. Later tasks write their characterization tests with it.

**Files:**
- Create: `crates/core/tests/it/support/mod.rs`
- Modify: `crates/core/tests/it/main.rs` (`mod support;`), and every file under `crates/core/tests/it/` that defines
  one of the helpers below (about 20 files)

**Interfaces:**
- Produces (all `pub`, in `support`):
  - `put(root: &Path, rel: &str, text: &str)` (creates parent folders), `read(root: &Path, rel: &str) -> String`
  - `clock_on(day: (i32, u32, u32), ms: u64) -> Clock` (time 14:05:09, as every copy uses today)
  - `request(s: &Session, command: Value) -> Request` (adds the session's generation)
  - `run(s: &mut Session, command: Value, clock: Clock) -> Result<Output, CommandError>`
  - `ok(s: &mut Session, command: Value, clock: Clock) -> Output` (panics with the command's JSON and the error)
  - `open_at(root: &Path, clock: Clock) -> Session` (`folder.open`), `folder_at(files: &[(&str, &str)], clock: Clock)
    -> (TempDir, Session)`
  - `ids(s: &mut Session, key: &str) -> Vec<BlockId>`
  - `const DAY: (i32, u32, u32) = (2026, 10, 29)` (the day most files fix)

- [ ] **Step 1:** Record the test count (Global Constraints) and `cargo test -p breccia-core` green.
- [ ] **Step 2:** Write `support/mod.rs` with the helpers above and `#![allow(dead_code)]` at its top (not every file
  uses every helper). Add `mod support;` to `main.rs`.
- [ ] **Step 3:** File by file, delete each local copy whose body equals a support helper and import it; where the
  file's signature differs (`ok(s, json)` with a fixed day, `ok(s, json, ms)`), keep a one-line local wrapper over the
  support helper with the same name and signature, so **no test body changes**. A helper that does something no other
  file does stays local. Run `cargo test -p breccia-core <file>::` after each file.
- [ ] **Step 4:** Show the module is used: temporarily change `put` in `support` to write `"x"` instead of `text`, run
  `cargo test -p breccia-core`, see failures in several files; revert. Note it in the report.
- [ ] **Step 5:** Test count equal to Step 1; `cargo test -p breccia-core` and `just lint` green.
- [ ] **Step 6: Commit and push** — `test: one support module for the core's integration tests`.

---

### Task 2: Test hygiene and two tighter assertions (model: sonnet)

M25, plan 1 follow-ups 10 and 11, plan 2 follow-up 8, plan 3 follow-up 7.

**Files:**
- Modify: `crates/core/src/session/history.rs` (the test `rebase_changes_every_snapshot_of_the_page_and_its_size`)
- Modify: `crates/core/src/session/search.rs:319` (delete the doubled doc line "Updates the first `max` pending pages
  (all with `None`).")
- Modify: `crates/core/tests/it/{color,page_color,render}.rs` (raw newline and tab characters inside string literals
  become `\n` and `\t`)
- Modify: `crates/core/tests/it/format_doc.rs` (wrap the module doc at about 120 columns)
- Modify: `crates/core/tests/it/rename.rs` (`rename_reports_links_it_cannot_write`), `crates/core/tests/it/page_color.rs`
  (the tag-only test's null pick on `other`)

**Interfaces:** none.

- [ ] **Step 1: Rewrite the string literals** in `history.rs` and the three test files without changing their values.
  Prove it: before editing, add a temporary test (or a `dbg!`) that prints each changed literal's bytes as hex, run it,
  edit, run again, and compare; remove the probe. Note the comparison in the report.
- [ ] **Step 2: Tighten `rename_reports_links_it_cannot_write`:** its `out.changed.iter().all(|v| v.key ==
  "2026-10-29")` also passes when nothing is re-sent; assert the keys of `out.changed` equal `["2026-10-29"]` exactly. Show it can fail: temporarily skip the re-send in the product code (or assert
  `["2026-10-30"]`), see FAIL, revert.
- [ ] **Step 3: Tighten the null pick on `other`** (`set_color_on_a_tag_only_page_creates_its_file`, which today only
  asserts that no file appears): also assert what the answer of that pick carries today (the page `other` without a
  file and without a color, or whatever fields the answer sets; read them from a run first). Show it fails with the
  `page.setColor` arm temporarily answering `Output::default()` for a null color; revert. If today's answer carries
  nothing that tells the two apart, say so in the report and leave the follow-up open.
- [ ] **Step 4:** `cargo test -p breccia-core color:: page_color:: render:: rename:: format_doc::` and
  `cargo test -p breccia-core --lib history` green; `just lint` clean.
- [ ] **Step 5: Commit and push** — two commits: `test: escaped test strings and one doc line in the core's tests`
  and `test: the rename and page-color tests can fail when nothing is re-sent or cleared`.

---

### Task 3: `config.rs` becomes `config/` (model: sonnet)

M1 and M3. Rules not to weaken: config writes keep the user's file (comments, unknown keys, formatting; `Expect::Text`
refuses a changed file); `DEFAULT_TOML` equals `Config::default()`.

**Files:**
- Delete: `crates/core/src/config.rs`
- Create: `crates/core/src/config/mod.rs` (module doc from the old file; `mod model; mod toml_keep; mod file;`;
  `pub use model::*;` and `pub use file::Expect;`; `ConfigError`)
- Create: `crates/core/src/config/model.rs` (`State`, `Board`, `BoardSettings`, `GitSettings`, `Config`, their
  `Default`s, `PALETTE`, `DEFAULT_TOML` and `default_toml`, `valid_keyword`, `validate`, `check_states`,
  `check_boards`, `state`, `cycle_next`, `parse`). No `toml_edit` import.
- Create: `crates/core/src/config/toml_keep.rs` (the generic helpers: `is_multi_line`, `set_columns`,
  `set_keeping_decor`, `rebuild_tables`, `rebuild_array`, `has_comment`, `keeps_a_comment`, `same_value`, `AppendKey`
  and its impls, `put`, the comment helpers `comment_lines`, `comment_lines_str`, `prepend_comments`,
  `carry_removed_comments`, `put_comments_after`, `split_trail`, `Entry`, `put_entries`, `write_section`). They take
  `toml_edit` types and plain strings only; none names `State` or `Board`.
- Create: `crates/core/src/config/file.rs` (`Expect`, `edit_file`, `load`, `load_with_text`, `read_text`,
  `write_boards`, `write_states`, `write_git`, `write_board_settings`, and the state and board adapters
  `columns_value`, `board_table`, `board_inline`, `match_boards`, `board_in`, `update_board`, `write_board_tables`,
  `write_board_inline`, `keyword_in`, `update_state`, `state_table`, `state_inline`, `match_states`,
  `write_state_inline`, `rename_board_columns`)
- Test: `crates/core/tests/it/config.rs`

**Interfaces:**
- Produces: the same public paths as today (`breccia_core::config::{Config, State, Board, BoardSettings, GitSettings,
  Expect, ConfigError, PALETTE}`; the `impl Config` methods keep their names and signatures; an `impl Config` block may
  live in `model.rs` and another in `file.rs`). Task 9 adds the path constants; Task 4 adds `check_keyword`.

- [ ] **Step 1: Characterization test** `writers_keep_the_users_file_bytes` in `tests/it/config.rs`: a fixture
  `config.toml` with comments above and beside tables, an unknown key in a state table and in `[git]`, inline-table
  boards, and CRLF line endings; run each of the four writers once (a state renamed and one removed, a board renamed
  and its columns changed, `[git]` changed, `[board]` changed) and compare the written text with an expected string.
  Write the expected strings from today's output, then show the test can fail by temporarily dropping the
  `carry_removed_comments` call; revert.
- [ ] **Step 2: Move** the code into the four files as listed; private helpers become `pub(super)`. Use the
  `toml_edit` imports everywhere (`Value`, `Item`, `Table`, `Array`, `InlineTable`, `TableLike`), never the full path
  (M3). Delete the `create_dir_all` in `edit_file` (M3; `write_atomic` makes the folder). No line of logic changes.
- [ ] **Step 3: Check** `grep -n toml_edit crates/core/src/config/model.rs` prints nothing, and
  `grep -nE "\bState\b|\bBoard\b" crates/core/src/config/toml_keep.rs` prints nothing.
- [ ] **Step 4:** `cargo test -p breccia-core config:: session:: states:: board::` and `just test` green (the format
  doc and demo tests read the config too); `just lint` clean; test count not lower.
- [ ] **Step 5: Commit and push** — `refactor(core): split the settings file code into model, TOML editing and file access`.

---

### Task 4: One keyword check, and the settings limits live with the settings (model: sonnet)

M2 and M18. Rules not to weaken: settings are never written from stale knowledge (the limit check stays **before**
`config_guard`, as today); a hand-edited `config.toml` loads as today (Q1).

**Files:**
- Modify: `crates/core/src/config/model.rs`, `crates/core/src/config/mod.rs` (`ConfigError`)
- Modify: `crates/core/src/session/mod.rs` (the `ConfigSetGit` and `ConfigSetBoard` arms)
- Test: `crates/core/tests/it/config.rs`

**Interfaces:**
- Produces:
  - `fn check_keyword(states: &[State], i: usize) -> Result<(), ConfigError>` in `model.rs` (state `i` has a valid
    keyword that no earlier state has; `InvalidKeyword` or `DuplicateState`). `check_states` calls it in its loop
    before the colour check of the same state; `validate` calls it for every state. Both keep their own
    `NoStates` check first.
  - `impl GitSettings { pub fn check(&self) -> Result<(), ConfigError> }`: `commit_delay_minutes` and
    `pull_interval_minutes` at most `GitSettings::MAX_MINUTES = 1440`.
  - `impl BoardSettings { pub fn check(&self) -> Result<(), ConfigError> }`: `archive_after_days` in
    `BoardSettings::DAYS = 1..=3650`.
  - `ConfigError::InvalidSetting(&'static str)` with `#[error("{0}")]`; the messages are exactly today's:
    `the minutes must be at most 1440 (one day)` and `archive after days must be between 1 and 3650`.
  - Task 10 moves the two arms; they call `check` and map `InvalidSetting` to `CommandError::new("invalidSetting", …)`.

- [ ] **Step 1: Write the failing tests** in `tests/it/config.rs`:
  - `git_settings_check_limits`: 1440 and 1440 pass; 1441 for either field gives `InvalidSetting` with the message
    above; 0 passes.
  - `board_settings_check_limits`: 1 and 3650 pass; 0 and 3651 fail with the message above.
  - `check_states_reports_the_first_state_first`: `[A with colour "nope", B with keyword "b c"]` gives the colour error
    for A (pins the order; passes on today's code, so show it can fail by temporarily checking all keywords first).
  - `parse_and_check_states_agree_on_keywords`: for `"bad word"`, `""`, and a repeated keyword, `Config::parse` of a
    file with those states and `check_states` give the same error variant.
- [ ] **Step 2: Run** `cargo test -p breccia-core config::` → the first two fail to compile (RED).
- [ ] **Step 3: Implement** the interfaces; in `session/mod.rs` replace the inline limit checks with
  `git.check()` / `board.check()` on the values built from the command, mapped to `invalidSetting`, before
  `config_guard` as today. `Config::validate` does **not** call the two `check`s (Q1).
- [ ] **Step 4:** `cargo test -p breccia-core config:: session::` green (the existing session test at
  `tests/it/session.rs:1197` to `1204` pins the codes); `just lint` clean.
- [ ] **Step 5: Commit and push** — `refactor(core): one keyword check for state lists; the settings limits live in the settings`.

---

### Task 5: One property editor and one block lookup (model: sonnet)

M4, M5, plan 7 follow-up 16. Rules not to weaken: write, re-read, compare, else refuse (`set_state` and the other
task edits still go through `replace_text` and `replace_keyword`); one state rule (`starts_with_keyword`).

**Files:**
- Modify: `crates/core/src/inline.rs` (next to `properties`), `crates/core/src/task.rs`, `crates/core/src/outline.rs`,
  `crates/core/src/edit.rs`
- Test: `crates/core/tests/it/task.rs`, `crates/core/tests/it/inline.rs`

**Interfaces:**
- Produces:
  - `pub(crate) fn with_property(text: &str, key: &str, value: Option<&str>) -> String` in `inline.rs`: among the
    property lines directly after the first line, `Some(v)` replaces the first `key:: …` line with `key:: v` and removes
    further ones, or adds the line after the last property line; `None` removes every such line. Lines are split on
    `\n` and joined with `\n`, as today.
  - `pub(crate) fn has_property(text: &str, key: &str) -> bool` (a `key` line among those property lines).
  - `with_priority(text, n)` is `with_property(text, "priority", n.map(…))`; `with_archived`, `with_created` and
    `with_done` are "if `has_property` is false, `with_property(Some)`" and `with_property(None)`. `props_end` and the
    four `is_*_line` helpers go.
  - `impl Document { pub(crate) fn block(&self, id: BlockId) -> Result<&Block, EditError>; pub(crate) fn find(&self, id:
    BlockId) -> Result<usize, EditError> }` in `outline.rs` (`find` moves there from `edit.rs`).

- [ ] **Step 1: Characterization tests against the old code**, in `tests/it/task.rs` through the public commands that
  use the four functions (`set_state`, `set_priority`, `set_archived`; whichever the file already drives): a block of
  one line; two `priority::` lines (set replaces the first, drops the second; remove drops both); a property line after
  a non-property line (not touched); `created::` already present (state change keeps it, bytes unchanged); `done::`
  present and the state stays finished (unchanged); a foreign `owner:: x` line first (new line goes after it). Expected
  bytes are today's output. Show one can fail by a temporary mutation of `props_end` (`take_while` → `take(1)`);
  revert.
- [ ] **Step 2: Unit tests for the new functions** in `tests/it/inline.rs` cannot reach `pub(crate)`; put them as
  `#[cfg(test)] mod tests` in `inline.rs`: `with_property_sets_replaces_and_removes`, `has_property_only_counts_the_
  property_lines`. RED: they do not compile.
- [ ] **Step 3: Implement** `with_property` and `has_property`; rewrite the four functions on them; delete
  `props_end` and the `is_*_line` helpers.
- [ ] **Step 4: Block lookup:** add `Document::block` and move `find` to `outline.rs`; replace the eight
  `.find(|b| b.id == id).ok_or(EditError::UnknownBlock)?` in `task.rs` and the two in `outline.rs`; in
  `Document::delete_block` (`edit.rs`) drop the second `self.find(id)?` and reuse the first index (check that nothing
  between the two calls changes the blocks; if something does, keep it and say so).
- [ ] **Step 5:** `cargo test -p breccia-core task:: edit:: board:: auto_archive:: session:: roundtrip::` and
  `cargo test -p breccia-core --lib` green; `just lint` clean.
- [ ] **Step 6: Commit and push** — two commits: `refactor(core): one editor for a block's property lines` and
  `refactor(core): one way to find a block by id`.

---

### Task 6: The format layer depends on nothing above it (model: sonnet)

M6, M7 (first half only; see "Code against the audit"), M8, plan 2 follow-up 12, plan 3 follow-up 5. Rules not to
weaken: one line classifier; the round trip (`roundtrip.rs` property tests stay green without loosening).

**Files:**
- Modify: `crates/core/src/color.rs`, `crates/core/src/inline.rs`, `crates/core/src/outline.rs`,
  `crates/core/src/workspace/mod.rs` (or `pages.rs`), `crates/core/src/workspace/pages.rs:425`,
  `crates/core/src/session/view.rs`
- Test: `crates/core/tests/it/{color,page_color,inline,frontmatter}.rs`

**Interfaces:**
- Produces:
  - `impl Page { pub fn own_color(&self) -> Option<PageColor> }` in `workspace`; `color::own_color` is deleted and
    `color.rs` no longer imports `crate::workspace`.
  - `pub(crate) fn preamble_lines(preamble: &str) -> impl Iterator<Item = (usize, &str)>` in `inline.rs`: the lines of
    `preamble.split('\n')` with their index, skipping the front matter's lines. `title_line` and `color_line` are built
    on it; each keeps its own parse of a line (`title_line` the raw line, `color_line` with `\r\n` trimmed).

- [ ] **Step 1: Characterization test** `title_and_color_lines_skip_front_matter_alike` in `tests/it/color.rs`: a
  preamble with front matter that itself holds `title:: A` and `color:: blue` lines, then CRLF `title:: B` and
  `color:: red` lines; assert `title_line` gives B's index and value and `color_line` red's index. Passes today; show
  it fails with `skip` temporarily removed from `color_line`; revert.
- [ ] **Step 2:** Add `preamble_lines`; rebuild `title_line` and `color_line` on it.
- [ ] **Step 3:** Move `own_color` to `Page::own_color`; update `view.rs:384` and `pages.rs:425`. In `view.rs`, one
  `use crate::color::PageColor;` replaces the four full paths. In `color.rs`, replace `v as u8` with
  `u8::try_from(v)` and the existing bound (keep the result identical; the value is at most 200).
- [ ] **Step 4:** Move `mod tests` of `outline.rs` to the end of the file (after `carry_ids`), unchanged.
- [ ] **Step 5: Check** `grep -n "crate::workspace" crates/core/src/{color,inline,outline,naming,aliases,relink,task,render}.rs`
  prints nothing. `cargo test -p breccia-core color:: page_color:: inline:: frontmatter:: roundtrip:: aliases::` and
  `cargo test -p breccia-core --lib` green; `just lint` clean.
- [ ] **Step 6: Commit and push** — `refactor(core): the format modules no longer reach into the workspace`.

---

### Task 7: The workspace removes and replaces a page in one place each (model: sonnet, reviewer opus)

M10, M11 (adjusted), M13. Rules not to weaken: unsaved edits win over the disk (`file_gone` keeps an unsaved page and
reports it in `kept_unsaved`); block ids survive a reload, also for a file moved within one batch (`DiskReport::gone`
still receives the removed page's document); a rename stands once the file is renamed; own writes are recognised by
content.

**Files:**
- Modify: `crates/core/src/workspace/mod.rs` (`take_page`, `with_page`, `edit_with_config`, the doc comment at line
  506), `crates/core/src/workspace/pages.rs` (`delete_page`, `delete_folder`, `rekey`),
  `crates/core/src/workspace/disk.rs` (`reload`, `file_gone`, `adopt`)
- Test: `crates/core/tests/it/workspace.rs`, `crates/core/tests/it/disk.rs`

**Interfaces:**
- Produces (private to `workspace`):
  - `fn take_page(&mut self, key: &str) -> Option<Page>`: removes the page, its block ids from the block index, its
    links (`unindex_page`), and marks the key touched. The four sites call it (`file_gone` passes the page's `doc` to
    `report.gone` as today).
  - `fn with_page<R>(&mut self, key: &str, f: impl FnOnce(&mut Page, &mut IdGen, &Config) -> R) -> Option<R>`: removes
    the page's block ids, runs `f`, inserts the ids again, marks touched, re-indexes. `edit_with_config` calls it with
    `|p, ids, cfg| f(&mut p.doc, ids, cfg)`. `reload` reads and parses the file first, then swaps `doc`, `on_disk`,
    `edited` and `created` **inside** the closure, so `index_page` sees the page with its file (see "Code against the
    audit", M11).
  - `rekey` becomes `take_page` + set the key + `insert`.

- [ ] **Step 1: Characterization tests** (they pass today; show each can fail by a temporary mutation, e.g. dropping
  the block-index removal in `delete_page`, or moving `page.on_disk = …` after `index_page` in `reload`):
  - `locate_follows_every_page_change` in `tests/it/workspace.rs`: after `delete_page`, `delete_folder`, a rename
    (rekey), a file deleted on disk (`file_gone`), and a blank page adopted by a new file, `locate` of each removed id
    is `None` and `locate` of each kept id names the right key.
  - `reload_of_a_fileless_page_indexes_its_aliases` in `tests/it/disk.rs`: a page created without a file, then a file
    for it appears on disk with an `alias:: Other` front matter; after the change, a link `[[Other]]` resolves to the
    page.
- [ ] **Step 2: Implement** `take_page` and call it from the four sites; `with_page` with `edit_with_config` and
  `reload` on it; `rekey` on `take_page` and `insert`. Move the line "The pages with edits their files do not hold, by
  key." from above `matches_disk` to above `unsaved` (M13).
- [ ] **Step 3:** `cargo test -p breccia-core workspace:: disk:: rename:: session:: aliases:: backlinks:: tree::` and
  `just test` green; `just lint` clean.
- [ ] **Step 4: Commit and push** — `refactor(core): one way to remove a page and one to replace its blocks`.

---

### Task 8: The workspace's change log as its own struct (model: sonnet)

M12. Rule not to weaken: aliases batch to one recompute per folder open (the test that counts it stays green).

**Files:**
- Create: `crates/core/src/workspace/changes.rs`
- Modify: `crates/core/src/workspace/{mod,names,pages,disk}.rs`

**Interfaces:**
- Produces: `pub(super) struct Changes { tree_version: u64, link_version: u64, topics: BTreeSet<String>, touched:
  BTreeSet<String>, warned: HashSet<PathBuf> }` with `bump_tree(&mut self)`, `bump_links(&mut self)`, `touch(&mut self,
  key: &str)`, `topic(&mut self, key: &str)`, `take_touched(&mut self) -> Vec<String>`, `take_topics(&mut self) ->
  BTreeSet<String>`, `first_warning(&mut self, rel: &Path) -> bool` (true the first time), `forget_warnings(&mut self)`,
  and readers `tree_version()`, `link_version()`. `Workspace` holds `changes: Changes` instead of the five fields. Its
  public methods (`take_touched`, `tree_version`, `link_version`, `take_topic_changes`) keep their names and
  signatures. The module doc says who bumps what.

- [ ] **Step 1:** Unit tests in `changes.rs` (`#[cfg(test)]`): `take_touched_is_sorted_and_empties`,
  `first_warning_is_true_once`, `versions_only_go_up`. RED: they do not compile.
- [ ] **Step 2:** Implement `Changes`; replace every `self.tree_version += 1`, `self.link_version += 1`,
  `self.touched.insert`, `self.topic_changes.insert` and `self.warned` use with the methods (15, 5, 11, 4 and 5 sites
  today).
- [ ] **Step 3:** `grep -nE "self\.(tree_version|link_version|topic_changes|touched|warned)\b" crates/core/src/workspace`
  prints nothing outside `changes.rs`. `cargo test -p breccia-core workspace:: disk:: tree:: session:: graph::
  page_color:: aliases::` and `just test` green; `just lint` clean.
- [ ] **Step 4: Commit and push** — `refactor(core): the workspace keeps its change tracking in one struct`.

---

### Task 9: One classifier for paths in the notes folder (model: opus)

M14, with the corrections in "Code against the audit". Rules not to weaken: the watcher's "might be a folder" rule
(`relevant_now`); load warnings reported once per file; own writes recognised by content. Each caller answers exactly
as today (Q2).

**Files:**
- Create: `crates/core/src/layout.rs` (the folder's fixed names; a bottom-layer module, so `config/` can use it)
- Modify: `crates/core/src/lib.rs` (`pub mod layout;`), `crates/core/src/workspace/files.rs` (`NotePath`, `classify`,
  `scan_journals`), `crates/core/src/workspace/mod.rs` (`open`; the old `PAGES`, `JOURNALS` constants go),
  `crates/core/src/workspace/disk.rs` (`found_at`, `dir_appeared`), `crates/core/src/watch.rs` (`relevant`),
  `crates/core/src/config/file.rs` (three `root.join("breccia").join("config.toml")`),
  `crates/core/src/session/mod.rs` (`CONFIG_REL`), `crates/core/src/git/message.rs` (constants only)
- Test: `crates/core/tests/it/watch.rs`, `crates/core/tests/it/disk.rs`, `crates/core/tests/it/workspace.rs`,
  `crates/core/tests/it/git_commit.rs` (or wherever `message.rs` is tested)

**Interfaces:**
- Produces:
  - In `layout.rs`: `pub const PAGES: &str = "pages"`, `pub const JOURNALS: &str = "journals"`, `pub const CONFIG_DIR:
    &str = "breccia"`, `pub const CONFIG_FILE: &str = "config.toml"`, `pub const CONFIG_REL: &str =
    "breccia/config.toml"`, `pub fn config_path(root: &Path) -> PathBuf`.
  - In `workspace/files.rs`: `pub(crate) enum NotePath { Journal(NaiveDate), Page { folder: String, stem: String },
    Config }` and `pub(crate) fn classify(rel: &Path) -> Result<Option<NotePath>, LoadWarning>` (`Ok(None)`: not a
    note file; `Err`: a note file Breccia cannot load, with today's warning: `NonUnicodeName`, `ExtensionCase`,
    `BadJournalName`). `pub(super) fn scan_journals(root: &Path, warnings: &mut Vec<LoadWarning>) -> Vec<Found>` (the
    loop `open` and `dir_appeared` share today).
  - `found_at` becomes a thin wrapper over `classify`. `watch::relevant` asks `classify` for files and keeps its own
    rules: an extension-less path under `pages/` (a possible folder), `breccia/config.toml`, and **today's
    case-sensitive `.md` test** (so `x.MD` stays not relevant through Step 6; Step 7 changes that, per Q2).

- [ ] **Step 1: Characterization tests before any move**, each passing on today's code (show one fails by a temporary
  mutation, e.g. `journals` depth 2 → any depth in `found_at`; revert):
  - `relevant_table` in `tests/it/watch.rs`: `relevant` and `relevant_now` for `journals/2026-10-29.md`,
    `journals/x.md`, `journals/sub/2026-10-29.md`, `journals/2026-10-29.MD`, `pages/a.md`, `pages/f/g/a.md`,
    `pages/a.MD`, `pages/.h/a.md`, `pages/v1.2` (a folder and a missing path), `pages/f` (folder), `breccia/config.toml`,
    `breccia/other.toml`, `other/a.md`, `a.md`.
  - `disk_change_table` in `tests/it/disk.rs`: the same file names created while the folder is open
    (`files.changed`), asserting which pages appear and which warnings come back.
  - `open_table` in `tests/it/workspace.rs`: the same files present at `open`, asserting pages and warnings (on Windows
    a non-UTF-8 name cannot be made; skip it there with a comment, as existing tests do).
  - `message_names_table` for `git/message.rs`: the ranks and names for the same paths plus a hidden page and a
    journal with a bad name.
- [ ] **Step 2:** Add `layout.rs` and use its constants in `workspace`, `watch.rs`, `config/file.rs`,
  `session/mod.rs` and `git/message.rs` (no `"pages"`, `"journals"`, `"breccia"` or `"config.toml"` literal left in
  production code outside `layout.rs`; doc comments may keep them).
- [ ] **Step 3:** Add `NotePath`, `classify` and `scan_journals`; rebuild `found_at`, `open`'s journal loop,
  `dir_appeared`'s journal branch and `relevant` on them. `message.rs` keeps its own rule (with a comment saying why:
  it names what Git reports, not what Breccia loads).
- [ ] **Step 4:** All four tables still pass unchanged; `cargo test -p breccia-core watch:: disk:: workspace::
  git_commit:: git_engine:: session:: demo::` and `just test` green; `just lint` clean.
- [ ] **Step 5:** `just e2e` → 201 PASS (the watcher runs in the app).
- [ ] **Step 6: Commit and push** — two commits: `refactor(core): the notes folder's fixed names in one module` and
  `refactor(core): one classifier decides what a path in the notes folder is`.
- [ ] **Step 7: Q2 fix (owner decision: warn while running too).** RED first: flip the `pages/a.MD` and
  `journals/2026-10-29.MD` rows of `relevant_table` and `disk_change_table` to expect the file is passed on and the
  same `ExtensionCase` warning comes back as at `open` (once per file); show they fail. Then let `watch::relevant`
  ask `classify` for these paths too, so the warning appears at once. Add an e2e step that writes `pages/x.MD` while
  the app runs and asserts the warning appears (bump the expected PASS count in `docs/STATUS.md`). `just test`,
  `just lint`, `just e2e`. Add a `docs/review.md` item (next free number) saying what to try by hand. Commit and push:
  `fix(core): a page file saved with an upper-case .MD extension is reported at once, not only on reopen`.

---

### Task 10: The command table: `execute` has one-line arms (model: opus)

M16, plan 6 follow-up 18 (core half). Rules not to weaken: `Session::run` is the one entry with `Clock` as a
parameter; the generation check refuses stale requests (`stale`) except for the folder commands; the typing run is
restored in `dispatch` by the command's kind; edits are all-or-nothing (`mutate_tracked`); a failed save never fails
the command; settings writes go through `config_guard` then `write_config`; typing over an outside change keeps both
(`set_text_on_marked`); nothing in the session emits events.

**Files:**
- Create: `crates/core/src/session/folder.rs` (`folder.open`, `folder.create`, `files.changed`, the open and recovery
  helpers if they fit), `crates/core/src/session/page.rs` (`page.*` arms with logic: `page.setColor`, `page.move`,
  `page.reload`, `page.refs`, `page.overwrite`, rename, delete, dirs), `crates/core/src/session/block.rs` (`block.*` and
  `blocks.*` arms with logic: `block.setText`, `block.settle`, delete, paste, split, merge, state), and
  `crates/core/src/session/settings.rs` (`boards.set`, `states.set` with `states_set`, `config.setGit`,
  `config.setBoard`, `config.get`). The file is `settings.rs`, not `config.rs`, so it is not confused with
  `crate::config`.
- Modify: `crates/core/src/session/mod.rs` (keeps `Session`, `new`, `run`, `dispatch`, `execute`, the generation
  check, and the shared plumbing: `config_guard`, `write_config`, `mutate`, `mutate_tracked`, `save`, `note_save`,
  `note_failed_save`, `page_output`, `ws`, `ws_mut`), `crates/core/src/session/board.rs` (`board.get` logic),
  `crates/core/src/session/command.rs`
- Test: `crates/core/tests/it/session.rs`

**Interfaces:**
- Consumes: `GitSettings::check`, `BoardSettings::check` (Task 4).
- Produces:
  - In `command.rs`, next to `kind()`: `pub fn ignores_generation(&self) -> bool` (true for `folder.open`,
    `folder.create`, `folder.status`, `folder.tree`; it replaces the `folder_command` list in `execute`) and
    `pub fn writes_config(&self) -> bool` (true for `boards.set`, `states.set`, `config.setGit`, `config.setBoard`;
    Task 14 uses it in the shell).
  - One method per former inline arm, named after the command (`page_set_color`, `page_move`, `page_reload`,
    `page_refs`, `board_get`, `config_set_git`, `config_set_board`, `boards_set`, `block_set_text`, `block_settle`, …),
    each `fn …(&mut self, …, now/today as needed) -> Result<Output, CommandError>`.
  - `execute`'s arms are each one expression: a method call, or `Ok(Output { one_field: …, ..Default::default() })` for
    a plain query.

- [ ] **Step 1: Tests for the two new methods** in `tests/it/session.rs`: `commands_that_ignore_the_generation` and
  `commands_that_write_the_config`, each a table over **every** command name in `command.rs` (build each command from
  a minimal JSON, as `command_names_deserialize` does) with the expected answer. RED: they do not compile.
- [ ] **Step 2:** Implement the two methods; `execute` uses `ignores_generation`.
- [ ] **Step 3:** Move the inline logic arm by arm into the family files, one family per commit-sized step, running
  `cargo test -p breccia-core session::` after each. Logic moves unchanged; the order of checks inside an arm stays
  (for example the limit check before `config_guard`).
- [ ] **Step 4: Check sizes:** `session/mod.rs` under 700 lines, each new file under 600, `execute` under 200 lines
  (`awk` from `fn execute` to its closing brace).
- [ ] **Step 5:** `just test` green; `just lint` clean; `just e2e` → 202 PASS.
- [ ] **Step 6: Commit and push** — `refactor(core): each command's work lives in a named method, the dispatch is a table`
  (one commit per family is fine, each with this prefix and the family named).

---

### Task 11: Named tuples, one place for date formats, one rule for view types (model: sonnet)

M22, M23, M24. Rule not to weaken: the wire format (field names and order of every serialized type; the contract
test and the shell's field-order test stay green).

**Files:**
- Modify: `crates/core/src/session/board.rs` (`raises`, `ArchivedRow`, `place_card`'s `writes`),
  `crates/core/src/session/mod.rs` (`typed_step`), `crates/core/src/naming.rs`, `crates/core/src/render.rs`,
  `crates/core/src/session/tree.rs`, `crates/core/src/task.rs`, `crates/core/src/workspace/mod.rs` (`TagEntry`,
  `NameEntry`), `crates/core/src/session/view.rs` (`NameView`), `crates/core/src/session/mod.rs` (re-exports)
- Test: `crates/core/tests/it/{naming,tree,backlinks,board}.rs`

**Interfaces:**
- Produces:
  - `struct PriorityWrite { id: BlockId, page: String, priority: Option<u32> }` (for `raises` and `writes`), `struct
    ArchivedRow { … }` with named fields for today's four, `struct TypedStep { id: BlockId, page: String, seq:
    Option<u64> }`; field names are the implementer's, read from how each position is used.
  - In `naming.rs`: `pub fn day_short(d: NaiveDate) -> String` (`%-d %b`), `pub fn day_with_year(d: NaiveDate) ->
    String` (`%-d %b %Y`), `pub fn day_long(d: NaiveDate) -> String` (`%A, %-d %b %Y`), `pub fn month_name(d:
    NaiveDate) -> String` (`%B`), and `pub(crate) const STAMP_FORMAT: &str = "%Y-%m-%d %H:%M:%S"` for the `created::` and
    `archived::` lines in `task.rs`. Every listed site uses them.
  - `TagEntry` and `NameEntry` derive `Serialize` with `#[serde(rename_all = "camelCase")]`; `TagView`, `NameView` and
    their conversion code are deleted; `session` re-exports `TagEntry` where `TagView` was exported, and
    `tests/it/tree.rs` uses the new name.

- [ ] **Step 1: Tests:** `display_formats` in `tests/it/naming.rs` for the four functions on 2026-10-01 and 2026-11-29
  (`1 Oct`, `1 Oct 2026`, `Thursday, 1 Oct 2026`, `October`); RED: they do not compile. The JSON of tags and names is
  already pinned (`tree.rs:419`, `backlinks.rs:168`); show those fail if `rename_all` is left off; revert.
- [ ] **Step 2:** Implement the structs, the format functions and the derives; delete the copies.
- [ ] **Step 3:** `grep -rn '%-d %b\|%A, %-d\|"%B"' crates/core/src` prints only `naming.rs`. `just test` green (the
  contract test reads `view.rs`); `just lint` clean.
- [ ] **Step 4: Commit and push** — three commits: `refactor(core): named fields instead of tuples in boards and typing`,
  `refactor(core): the display date formats in one module`, `refactor(core): tags and names serialise themselves`.

---

### Task 12: Git: one set of helpers, the problem's name from one place, test seams behind a feature (model: sonnet)

M26, M27, M30. Rules not to weaken: Git never destroys; the engine owns no thread and no clock; network commands never
hold the session lock (`last_lock_held`); `index.lock` is never deleted.

**Files:**
- Modify: `crates/core/src/git/{repo,engine,sync,view}.rs`, `crates/core/Cargo.toml`
- Test: `crates/core/tests/it/{git_engine,git_sync}.rs`

**Interfaces:**
- Produces:
  - `impl Busy { pub fn name(self) -> &'static str }` in `repo.rs` (both `busy_name` go).
  - `impl Problem { pub(crate) fn failed(e: &GitError) -> Problem }` (both `failed` go; `sync.rs` passes `&e`).
  - `pub(crate) fn first_stderr_line(stderr: &str) -> Option<String>` in `sync.rs`; `engine.rs`'s `first_line` and
    `sync.rs`'s keep their own fallbacks on top of it.
  - `impl Problem { pub fn kind(&self) -> &'static str }` with one exhaustive `match`; `ProblemView::of` uses it.
  - A cargo feature `test-seams = []` in `crates/core/Cargo.toml`, enabled for the tests by a dev-dependency on the
    crate itself (`breccia-core = { path = ".", features = ["test-seams"] }`). The three hook fields, their setters and
    their call sites are `#[cfg(feature = "test-seams")]`; `#[doc(hidden)]` goes.

- [ ] **Step 1: Tests:** `problem_kind_matches_its_serde_tag` in `tests/it/git_sync.rs` (or the file that builds
  `Problem`s): for one value of every variant, `serde_json::to_value(&p)["kind"]` equals `p.kind()`. RED: `kind` does not
  exist. `busy_names` for the five names (RED: `Busy::name` does not exist).
- [ ] **Step 2:** Implement the helpers and `kind`; delete the copies.
- [ ] **Step 3:** The feature. Check the release build does not see it:
  `cargo tree -p breccia -e features --edges normal,build | grep test-seams` prints nothing, and
  `cargo test -p breccia-core git_engine::` passes (the hooks are used there). If Cargo refuses the self
  dev-dependency, stop this step, keep `#[doc(hidden)]`, and record it for the follow-ups.
- [ ] **Step 4:** `cargo test -p breccia-core git_engine:: git_sync:: git_repo:: git_commit::` and `just test` green;
  `just lint` clean (clippy runs with all targets, so both the feature on and off must build: also run
  `cargo clippy -p breccia-core --lib -- -D warnings` without the dev build).
- [ ] **Step 5: Commit and push** — two commits: `refactor(core): one copy of each Git helper and of each problem's name`
  and `refactor(core): the Git engine's test hooks only exist in test builds`.

---

### Task 13: Search: one damage recovery, typed links in the query (model: sonnet, reviewer opus)

M28 (keeping today's counts, see "Code against the audit"), M29, backlog #31. Rules not to weaken: the index is a
cache and never writes into the notes folder; a damaged file is rebuilt once, then the index moves to memory with a
notice; `SCHEMA_VERSION` is unchanged (nothing stored changes).

**Files:**
- Modify: `crates/core/src/search/mod.rs` (`SearchIndex::open` only opens; a schema-version mismatch still starts
  over, as today), `crates/core/src/session/search.rs` (`IndexState::open`, `recover`, `run_query`),
  `crates/core/src/search/query.rs` (`Query`, `parse_query`), `crates/core/src/search/store.rs` (reads `links`)
- Test: `crates/core/tests/it/search.rs`, `crates/core/tests/it/search_store.rs`

**Interfaces:**
- Produces:
  - `SearchIndex::open(file) -> Result<SearchIndex, SearchError>` returns the damage error instead of deleting.
  - `IndexState::open`: on damage from `SearchIndex::open`, delete the files and open again **without** setting
    `rebuilt`; on damage from `prepare`, delete, set `rebuilt`, and open and prepare again. `recover` deletes once if
    `rebuilt` is false, else falls back to memory with the notice, as today.
  - `pub struct QueryLink { pub target: String, pub kind: LinkKind, pub keys: Vec<String> }` (use the link kind type
    `inline::links` already returns); `Query.links: Vec<QueryLink>`; `parse_query` fills `keys: vec![key]`. `run_query`
    widens each entry's `keys` from its own `target` and `kind`, with no second parse of the text.

- [ ] **Step 1: Characterization tests before the move** (session level, in `tests/it/search.rs`; each passes today,
  shown to fail by a temporary mutation, then reverted):
  - `damage_at_open_keeps_the_one_rebuild`: a garbage index file in the cache folder, open the folder (no notice),
    then damage the file again while open and search (rebuilt, no notice).
  - `damage_twice_moves_the_index_to_memory`: damage found by `prepare` at open (a valid database with a broken
    table), then damage again later: the search still answers and one notice says the index cannot be stored.
  - Backlog #31: `query_with_mixed_links_widens_each_link` (`[[A]] #b [[A]] text`, where `A` has an alias; each filter
    finds the alias spelling of its own page) and `query_link_to_an_unknown_page_keeps_its_key`.
- [ ] **Step 2:** The test in `search_store.rs` that opens a garbage file through `SearchIndex::open` and expects it
  rebuilt now expects the damage error; rewrite it to say so (RED until Step 3).
- [ ] **Step 3:** Implement M28 and M29 as above.
- [ ] **Step 4:** `cargo test -p breccia-core search:: search_store:: session::` and `just test` green; `just lint`
  clean.
- [ ] **Step 5: Commit and push** — two commits: `refactor(core): the search index's damage policy lives in one place`
  and `refactor(core): a search query keeps each typed link with its own filter`. Mark backlog #31 done
  (`docs/backlog.md`, "(done 2026-11-…, plan 9)") in the second.

---

### Task 14: The shell's `lib.rs` split by job (model: opus)

M33 (adjusted), plan 6 follow-up 18 (shell half). Rules not to weaken: everything runs off the main thread and nothing
is emitted while the session lock is held; the event payload keeps the answer's field order
(`page_changed_payload_keeps_the_answer_field_order` stays green and unchanged); the close is bounded; test hooks are
environment variables read in one place each, each with its small pure function and test; the capabilities are not
widened; `settings.json` handling is untouched.

**Files:**
- Create in `app/src-tauri/src/`: `events.rs` (the event-name constants except `TRAY_EXIT`, `events`, `emit_all`),
  `indexing.rs` (`IndexEvent`, `cache_dir_for`, `reports_progress`, `progress_event`, `index_in_background`,
  `index_loop`, `needs_index_run`, `index_if_large`), `watching.rs` (`start_watcher`), `recovery.rs`
  (`RecoveredEvent`, `recovered_error`, `Cause`, `FollowUp`, `follow_up`, `after_recovery`, `test_panic`,
  `take_test_panic`), `commands.rs` (the `commands` module's content, `UiState`, `RecentFolder`, `shell_answer`,
  `git_log_answer`, `send_git`, `close_git`, `trace_enabled`, `trace_line`), `tray.rs` (`TRAY_EXIT`, `tray_wanted`,
  `show_main`, `build_tray`), `window.rs` (`offscreen_enabled`, `OFFSCREEN`, `place_offscreen`, `show_offscreen`,
  `show_inactive`, `window_state`)
- Modify: `app/src-tauri/src/lib.rs` (keeps `App`, `run`, `today_override`, `config_override`,
  `single_instance_wanted`, `ready_log_dir`, `startup_folder`, `open_startup_folder`, the `mod` lines)
- Modify: `app/src/lib/contract.test.ts` (read every shell source, not only `lib.rs`)
- Modify: `docs/audit/2026-11-10/notes.md` (the shell section names `lib.rs` line numbers; point them at the new files)

**Interfaces:**
- Consumes: `Command::writes_config` (Task 10); `run_blocking` uses it instead of its own list (`opened` keeps its
  `match`, since it needs the path).
- Produces: module boundaries only; the Tauri command names, the handler list and the event names are unchanged.

- [ ] **Step 1: The contract test first.** Change `contract.test.ts` to read all shell sources:
  `import.meta.glob('../../src-tauri/src/*.rs', { query: '?raw', import: 'default', eager: true })`, joined, in place of
  the `lib.rs` import; `event_names_match` runs over the joined text. Run `cd app && npx vitest run
  src/lib/contract.test.ts` → PASS. Show it still fails on drift: temporarily rename `"tree:changed"` in `lib.rs`, see
  FAIL; revert.
- [ ] **Step 2:** Move the code module by module, each with its tests (the `mod tests` block of `lib.rs` is split the
  same way; `e2e_config_is_the_default_config` keeps its `include_str!("../../e2e/smoke.mjs")` path, which is the same
  from any file in `src/`; `single_instance_is_the_first_plugin` stays in `lib.rs` with `run`). After each module:
  `cargo test -p breccia`.
- [ ] **Step 3:** Replace `writes_config`'s list in `run_blocking` with `request.command.writes_config()`.
- [ ] **Step 4: Check sizes:** `lib.rs` under 450 lines including its tests; no shell file over 600.
  `cd app && npx vitest run scripts/logging.test.mjs` green (it scans every shell file for `eprintln!`).
- [ ] **Step 5:** `just test` green; `just lint` clean; `just e2e` → 202 PASS.
- [ ] **Step 6: Commit and push** — `refactor(app): split the shell's main file by job` (and `test: the contract test
  reads every shell source` for Step 1, committed first).

---

### Task 15: Docs follow the moves (model: haiku)

**Files:**
- Modify: `docs/audit/2026-11-10/notes.md` (core sections: `workspace/mod.rs:748` `save_with`, `disk.rs:274`,
  `config.rs`, `view.rs:355`, `pages.rs:453` and any other path or line the moves made wrong; name the file and the
  function, drop line numbers where a function name is enough)
- Modify: `docs/audit/2026-11-10/progress.md` (one log line: "plan 9 closed M1 to M8, M10 to M14, M16, M18, M22 to M31,
  M33")

- [ ] **Step 1:** For each path in `notes.md`, check it exists (`ls`) and the named function is in it (`grep`); fix
  the ones that moved. `cd app && npx vitest run scripts/docs.test.mjs` green before and after. No behaviour; no RED
  step.
- [ ] **Step 2: Commit and push** — `docs: the audit's notes point at the files after the core housekeeping`.

---

## Finish (the controller, not a task)

- Final whole-plan review on opus (the diff since the plan's first commit), with one fix wave.
- `just test`, `just lint`, `just e2e` (202 PASS expected) on the final `main`; CI green on the last commit. Record the
  core test count and the Vitest count.
- `docs/backlog.md`: a new item (next free number) for Q1, out-of-range values in a hand-edited `config.toml`, with
  the alternatives from "Product questions".
- Follow-ups doc `docs/plans/2026-11-11-09-core-housekeeping-followups.md`, at least: Q1 (backlog item) and Q2 (fixed
  in Task 9); any difference the characterization tables of Task 9 showed between the
  deciders; whether the self dev-dependency of Task 12 worked; `session/mod.rs` and `lib.rs` sizes reached; plan 6
  follow-up 24 (the `trace git state=…` lines) still open.
- `docs/STATUS.md`: plan 9 done, the audit keys it closed, the test baseline, the Q2 review item (and any other defect that turned
  up, see Global Constraints).
- `docs/review.md`: the Q2 item from Task 9, plus any real defect a task found and fixed.
- Delete the plan's scratch files in `.superpowers/sdd/2026-11-11-09-core-housekeeping/`, keep `progress.md` and
  `plan-path`; commit and push the ledger.
- Report to the owner: what moved, the verification results, every ruling with its cost if wrong, open items.
