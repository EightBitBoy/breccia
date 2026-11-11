# Out-of-range values in a hand-edited `config.toml` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `breccia/config.toml` edited by hand with a number outside the range Settings allows (say
`pull_interval_minutes = 100000` or `archive_after_days = 0`) still loads; Breccia uses that key's default for the run
and shows a notice that names the key, and leaves the file as it is (backlog #80).

**Architecture:** One function in `crates/core/src/config/` reads the three bounded numbers with `toml_edit` before
the file is deserialized. Each integer outside its range is replaced, in the parsed document only, by its default
(decor kept, so the lines of every other error stay where they were), and is returned as a `Replaced` record. The
workspace keeps the records of the last read until the session's `run` turns them into `loadWarning` notices, the
same way alias warnings travel today. The frontend already shows `loadWarning` notices, so no app wiring changes.

**Tech Stack:** Rust (`breccia-core`), `toml` 0.9, `toml_edit` 0.25; cargo integration tests in
`crates/core/tests/it/`. No frontend change, no new dependency, no e2e change.

**Spec:** `docs/backlog.md` #80; `docs/spec.md` §6 ("External changes", the `config.toml` sentence) and §7.9;
`docs/format.md` §11; plan 9's follow-up 1 (`docs/plans/2026-11-11-09-core-housekeeping-followups.md`); this plan's
"Owner decisions" and "Rulings".

## Owner decisions (2026-11-11)

1. **Option (a) of backlog #80:** the file still loads. Each out-of-range value is replaced by its default for this
   run, and a notice names the key. The file is **not** rewritten: `config.toml` keeps its comments, unknown keys and
   the user's text (spec anti-goal §2); Breccia never reformats or drops what the user wrote.
2. **Q1, wording (answered 2026-11-11):** the default wording below.
3. **Q2, where (answered 2026-11-11):** the notice list only, nothing in Settings.
4. **Q3, several bad keys (answered 2026-11-11):** one notice per bad key (R5).
5. **Q4, what is replaced (answered 2026-11-11):** only the bad key (R4).
6. **Q5, Settings save (answered 2026-11-11):** a save of that section writing the default over the bad number is
   acceptable (R7).
7. **Plan approved by the owner, 2026-11-11.** The owner asked to skip the opus pre-flight scan and to keep token use down: sonnet reviews, one final review.

## Rulings (made in this plan; each with what it costs if wrong)

- **R1. Which values and ranges.** The three bounded numbers, with the ranges Settings already enforces and from the
  same constants (`GitSettings::MAX_MINUTES`, `BoardSettings::DAYS`; no second copy of a number):
  `[git] commit_delay_minutes` 0 to 1440 (default 5), `[git] pull_interval_minutes` 0 to 1440 (default 5),
  `[board] archive_after_days` 1 to 3650 (default 14). Cost if wrong: a range change later is one constant.
- **R2. Any whole number outside the range counts, negative ones too.** `archive_after_days = -1` used to stop the
  folder from opening (a `u32` type error); now it is replaced like `0`. Cost if wrong: a negative number loads with a
  notice instead of refusing the folder; harmless, and the notice says what happened.
- **R3. A value of the wrong type is still refused as before** (`pull_interval_minutes = "5"`, `= 5.5`, `= true`):
  "cannot be read", the settings in use stay. Only integers are checked for range. Cost if wrong: a quoted number
  still blocks the file; making it lenient is a follow-up.
- **R4. Only the bad key is replaced**; the other keys of the section keep their values from the file. Cost if wrong:
  none in practice; replacing the whole section would throw away good values.
- **R5. One notice per bad key** (Open question Q3 may change it). The frontend shows a notice once while it is shown
  (same text, `noticeKey`), so two keys give two notices and a repeat of the same one does not pile up. Cost if wrong:
  with all three keys bad, three notices; merging them is a change in one function.
- **R6. When the notice comes:** each time the file is read and a value is still out of range: when a folder opens,
  and when the file changes on disk (a hand edit, a Git pull; `files.changed`). Not after Breccia's own Settings write,
  whose text is read again silently: the notice was given when the file was read. A notice the user closed comes back
  only when the file changes again or the folder is opened again. Cost if wrong: a dismissed notice reappearing on the
  next unrelated hand edit of `config.toml`; making it once per session is a small state set.
- **R7. A Settings save of the same section writes the value Settings shows** (the default) over the bad one, because
  the Git and board writers write each value that differs from the file (`write_section`, `format.md` §11). That is the
  user's own save, not a rewrite on load, so decision 1 holds; the rest of the file keeps its bytes. A save in another
  section (states, boards, the other of Git and board) leaves the bad value's text as it is. Cost if wrong (Q5): the
  user's hand-written number is replaced by 5 or 14 when they change, say, "Git enabled" in Settings; avoiding it
  needs the frontend to send only changed keys for those fields, which it already does for the others, a follow-up.
- **R8. The replacement works on the parsed `toml_edit` document, not on the text.** When a bad value is found, the
  value in the document is set to the default with its decor kept and the document's text (otherwise byte-identical,
  `toml_edit` keeps formatting) is deserialized with the existing `toml::from_str` path. With nothing out of range the
  original text goes down the old path unchanged, so every error message stays as it is today. Cost if wrong: an error
  on the same line as a replaced value may report a column shifted by the difference in digits; line numbers are
  unchanged.
- **R9. The notices travel in the workspace** (`Workspace::take_config_replaced`, drained by `Session::run` next to
  `take_alias_warnings`), not in `reload_config`'s return value. Every reader of the file (folder open, recovery
  reopen, `files.changed`, the Settings guard, the Git engine's second read) is then covered with no change to its
  caller; a read during a command that fails (the guard's `configChanged`) is shown with the next command. The Git
  engine needs no change: its pull runs `files.changed` through `run`. Cost if wrong: a notice may arrive one command
  late in the guard case.
- **R10. `Config::parse` stays and replaces silently**; `Config::parse_reporting` also returns the records. `parse`
  is used after Breccia's own writes (R6) and by tests. Cost if wrong: none; one wrapper.
- **R11. The format version stays 8.** A setting is read differently, not a block, link, name or state (format.md's
  rule; the precedent is version 3's auto-archive note). Cost if wrong: one history line.
- **R12. No e2e step.** No app wiring changes: the notice is an existing `loadWarning`, which the notice center
  already shows (`app/src/lib/noticeCenter.svelte.ts:19`). The e2e count stays **203 PASS lines**. Cost if wrong: the
  owner's by-hand check (review item 89) is the only check in the real window.

## Open questions for the owner (the plan proceeds with the stated default)

- **Q1. Notice wording.** Default (one line, a warning, not red):
  "breccia/config.toml: [git] pull_interval_minutes = 100000 is outside 0 to 1440, so Breccia uses 5 instead. Change
  it in Settings or in the file."
  and for the board: "breccia/config.toml: [board] archive_after_days = 0 is outside 1 to 3650, so Breccia uses 14
  instead. Change it in Settings or in the file."
- **Q2. Where it shows.** Default: the notice list, like the "cannot be read" and `.MD` notices, nothing in Settings.
  Alternative: also a line under the field in Settings > Git or the board settings (frontend work, a follow-up).
- **Q3. Several bad keys:** one notice per key (default, R5), or one notice naming all of them?
- **Q4. What is replaced:** only the bad key, by its own default (default, R4), or the whole `[git]` / `[board]`
  section by its defaults?
- **Q5. A Settings save of that section** writes the default over the bad number (R7). Fine, or should Settings leave
  an untouched field's hand-written number alone?

## Code against the backlog (checked 2026-11-11 at `8d0f80e`)

- **Model and rules:** `crates/core/src/config/model.rs`: `BoardSettings`, `GitSettings` (`u32` fields,
  `#[serde(default)]`), `GitSettings::MAX_MINUTES = 1440` and `check()` (`:74`–`:88`), `BoardSettings::DAYS =
  1..=3650` and `check()` (`:90`–`:101`), the defaults (`:103`–`:121`: 14, true; true, 5, 5), `Config::parse`
  (`toml::from_str` then `validate`, `:196`), `validate` (no states, keywords; `:272`). A bad keyword is refused by
  `validate` with `ConfigError::InvalidKeyword`; nothing checks the numbers when a file is read.
- **Reading the file:** `crates/core/src/config/file.rs:326`–`:349`: `load`, `load_with_text` (callers:
  `crates/core/src/workspace/mod.rs:369` `create`, `:375` `open`), `read_text`. `toml_keep::set_keeping_decor`
  (`toml_keep.rs:40`) sets a value keeping its decor.
- **Reread on change:** `Session::reload_config` (`crates/core/src/session/settings.rs:17`) parses with
  `Config::parse`; callers: `files.changed` (`session/folder.rs:236`–`:247`, a failure becomes a `LoadWarning` notice
  "… cannot be read (…); Breccia keeps the settings it had"), the Settings guard (`session/mod.rs:169`), `write_config`
  (`session/mod.rs:202`) and the Git engine (`git/engine.rs:803`). `write_config` parses Breccia's own written text
  with `Config::parse` (`session/mod.rs:209`).
- **Folder open:** `Session::open_folder` (`session/folder.rs:98`) turns `Workspace::open`'s `LoadWarning`s into
  notices. A new `LoadWarning` variant is not suitable: `ws.warned` is built from every warning's path and its size is
  the "skipped files" count (`workspace/states.rs:35`).
- **Notices:** `Notice::LoadWarning { message }` (`session/view.rs:247`); `Session::run` adds alias warnings to every
  output (`session/mod.rs:229`–`:231`). The frontend shows `loadWarning` as a non-error notice and shows the same text
  only once (`app/src/lib/notices.ts`).
- **Tests:** `crates/core/tests/it/config.rs` (`invalid_configs`, `git_settings_check_limits`,
  `board_settings_check_limits`), `it/session.rs` (`a_hand_edit_of_config_is_followed:1445`,
  `a_broken_config_keeps_the_old_one_and_refuses_writes:1470`, `CONFIG` const `:1141`), `it/workspace.rs`
  (`invalid_config_fails_open:224`).
- **Docs:** `docs/format.md` §11 says "The file accepts any whole number ≥ 0 for the numbers below. Settings offers a
  smaller range…" (`:995`) and types the three keys "integer ≥ 0"; the "Validation" paragraph follows the table.
  `docs/spec.md:182` has the `config.toml` sentence of §6.
- **Review list:** items up to 88 are used; the new item is **89**.

## Global Constraints

- Spec anti-goal §2: `config.toml` is never written on load; its bytes stay identical after open and after a
  `files.changed` with a bad value. Tests assert the bytes on disk.
- The ranges come from `GitSettings::MAX_MINUTES` and `BoardSettings::DAYS` only.
- Every test fails first (RED) and the RED run is in the task report. A test pinning what already holds is shown to
  fail by a temporary mutation, noted and reverted.
- Error messages of files that cannot be read are unchanged when no value is out of range (existing tests pin them).
- Notices are `Notice::LoadWarning` with the exact text of Q1's default, built in one place.
- `cargo fmt --all`; `just lint` clean (clippy `-D warnings`).
- Commits: conventional subjects; `feat`/`fix` only for what a user sees, in plain words, at most about 90 characters,
  no trailing period, no attribution lines. Commit on `main`, push after each commit.
- No new dependency. No frontend change.

## Review Focus

- **A negative number** (`archive_after_days = -1`, `commit_delay_minutes = -5`). Expected: replaced like an
  out-of-range value, not a refused file. Pinned in Task 1.
- **The section written as an inline table or dotted keys** (`git = { pull_interval_minutes = 100000 }`,
  `git.pull_interval_minutes = 100000`). Expected: found and replaced the same way. Pinned in Task 1.
- **A bad value together with another error** (a bad keyword, a type error later in the file). Expected: the file is
  refused with the same error, and the same line number, as without the bad value. Pinned in Task 1.
- **A Settings save in another section while the bad value is in the file.** Expected: the bad value's text stays in
  the file, memory keeps the default, no new notice. Pinned in Task 2.
- **The same `files.changed` twice** (the watcher reports the file again, text unchanged). Expected: no second notice;
  a later change that leaves the value bad gives it again, a change that fixes it gives none and the value is used.
  Pinned in Task 2.

---

### Task 1: Read out-of-range numbers as their defaults (model: sonnet)

**Files:**
- Modify: `crates/core/src/config/model.rs` (`Replaced`, `Config::parse_reporting`, `Config::parse`)
- Create: `crates/core/src/config/range.rs` (finding and replacing the values in a `toml_edit` document); add
  `mod range;` in `config/mod.rs`
- Modify: `crates/core/src/config/file.rs` (`load_with_text`), `crates/core/src/workspace/mod.rs:369`, `:375`
  (destructure the new tuple; the records are dropped here until Task 2)
- Test: `crates/core/tests/it/config.rs`

**Interfaces:**
- Produces (re-exported by `config::*`):
  ```rust
  #[derive(Clone, Debug, PartialEq, Eq)]
  pub struct Replaced {
      pub key: &'static str,           // "[git] commit_delay_minutes", "[git] pull_interval_minutes", "[board] archive_after_days"
      pub value: i64,                  // as written
      pub range: RangeInclusive<u32>,  // 0..=1440 or 1..=3650
      pub default: u32,                // 5 or 14
  }
  impl Config {
      pub fn parse_reporting(s: &str) -> Result<(Config, Vec<Replaced>), ConfigError>;
      pub fn parse(s: &str) -> Result<Config, ConfigError>; // = parse_reporting(s).map(|(c, _)| c)
      pub fn load_with_text(root: &Path) -> Result<(Config, Option<String>, Vec<Replaced>), ConfigError>;
  }
  ```
  Records come in file order of the keys: `[git] commit_delay_minutes`, `[git] pull_interval_minutes`,
  `[board] archive_after_days` (fixed order, one record per bad key). A missing file gives no records.
- Approach (R8): parse `s` as `toml_edit::DocumentMut`; if that fails, take the old path on `s` (same error as
  today). Look up each key through `doc.get_mut(section).and_then(Item::as_table_like_mut)` (covers `[git]`, inline
  tables and dotted keys); only `Value::Integer` outside its range counts. Replace with `set_keeping_decor`. No
  records: old path on `s`; else old path on `doc.to_string()`. Then `validate` as before.

- [ ] **Step 1: Write the failing tests** in `it/config.rs`:
  - `out_of_range_values_are_replaced_by_defaults`: for `"[git]\ncommit_delay_minutes = 1441\npull_interval_minutes = 100000\n[board]\narchive_after_days = 0\n"`,
    `parse_reporting` gives `git.commit_delay_minutes == 5`, `git.pull_interval_minutes == 5`,
    `board.archive_after_days == 14`, and records equal to
    `[Replaced { key: "[git] commit_delay_minutes", value: 1441, range: 0..=1440, default: 5 }, Replaced { key: "[git] pull_interval_minutes", value: 100000, range: 0..=1440, default: 5 }, Replaced { key: "[board] archive_after_days", value: 0, range: 1..=3650, default: 14 }]`;
    `Config::parse` of the same text gives the same `Config`.
  - `edge_values_are_kept`: `commit_delay_minutes = 0`, `pull_interval_minutes = 1440`, `archive_after_days = 1`, and
    separately `archive_after_days = 3650`: used as written, no records. `auto_archive` and `enabled` next to a bad
    number keep their file values (R4).
  - `negative_values_are_replaced`: `archive_after_days = -1` and `commit_delay_minutes = -5` give the defaults and
    records with `value: -1` and `-5` (R2).
  - `inline_and_dotted_sections_are_checked`: `git = { enabled = false, pull_interval_minutes = 100000 }` and
    `git.pull_interval_minutes = 100000` give `pull_interval_minutes == 5`, one record each, and `enabled == false` in
    the first.
  - `wrong_types_are_still_refused`: `pull_interval_minutes = "5"` and `archive_after_days = 5.5` give
    `Err(ConfigError::Toml(_))`, as before (R3).
  - `a_bad_value_does_not_change_other_errors`: the error string of
    `"[git]\npull_interval_minutes = 100000\n[[states]]\nkeyword = 1\n"` equals that of the same text with `5`, and
    contains `line 4`; `"[git]\npull_interval_minutes = 100000\n[[states]]\nkeyword = \"todo\"\n"` gives
    `Err(ConfigError::InvalidKeyword(_))`.
  - `load_with_text_reports_and_keeps_the_file`: a temp root with `breccia/config.toml` holding
    `"# mine\n[board]\narchive_after_days = 0 # hand\n"`: `load_with_text` gives `board.archive_after_days == 14`,
    the text exactly as on disk, one record; the file's bytes are unchanged.
- [ ] **Step 2: Run** `cargo test -p breccia-core config::`. Expected: FAIL to compile (`Replaced`,
  `parse_reporting` unknown; `load_with_text` returns two values).
- [ ] **Step 3: Implement** the interfaces above. `GitSettings::check` and `BoardSettings::check` keep their messages;
  if a `MINUTES: RangeInclusive<u32> = 0..=Self::MAX_MINUTES` constant helps, add it on `GitSettings` and use it in
  both places.
- [ ] **Step 4: Verify.** `cargo test -p breccia-core config::` PASS; `cargo test -p breccia-core` all PASS (the
  existing `invalid_configs`, `writers_keep_the_users_file_bytes`, `format_doc_*` included); `just lint` clean.
- [ ] **Step 5: Commit** `chore(core): read out-of-range config numbers as their defaults`; push. (Task 2 carries
  the changelog line, when the user also sees the notice.)

### Task 2: The notice that names the key (model: sonnet)

**Files:**
- Modify: `crates/core/src/workspace/mod.rs` (field `config_replaced: Vec<Replaced>`, filled in `open` and `create`;
  `pub fn take_config_replaced(&mut self) -> Vec<Replaced>`)
- Modify: `crates/core/src/session/settings.rs` (`reload_config` uses `parse_reporting` and stores the records in
  `ws.config_replaced`, replacing any pending ones; nothing stored when the text is unchanged or cannot be read)
- Modify: `crates/core/src/session/view.rs` (`Notice::config_replaced(r: &Replaced) -> Notice`)
- Modify: `crates/core/src/session/mod.rs:229`–`:231` (`run` also drains `ws.take_config_replaced()` into
  `out.notices`, after the alias warnings)
- Test: `crates/core/tests/it/session.rs`, `crates/core/tests/it/workspace.rs`

**Interfaces:**
- Consumes: `Replaced`, `Config::parse_reporting`, `Config::load_with_text` (Task 1).
- Produces: `Notice::config_replaced(r: &Replaced) -> Notice`, a `Notice::LoadWarning` whose message is exactly
  `format!("breccia/config.toml: {key} = {value} is outside {start} to {end}, so Breccia uses {default} instead. Change it in Settings or in the file.")`
  (Q1 default; `start`/`end` from `range`). `write_config` keeps `Config::parse` (silent, R6).

- [ ] **Step 1: Write the failing tests.**
  - `it/workspace.rs` `out_of_range_config_opens_with_defaults`: a folder whose `breccia/config.toml` is
    `"[git]\npull_interval_minutes = 100000\n"`: `Workspace::open` is `Ok`, `ws.config.git.pull_interval_minutes == 5`,
    `ws.take_config_replaced()` has one record and a second call is empty; the file's bytes are unchanged.
  - `it/session.rs` `an_out_of_range_value_gives_a_notice_on_open`: `folder(&[(CONFIG, "[board]\narchive_after_days = 0 # hand\n"), ("pages/P.md", "- a\n")])`
    (the helper drops its own open output), then `folder.open` of `t.path()` again: that output's notices hold exactly
    one `LoadWarning` with message
    `"breccia/config.toml: [board] archive_after_days = 0 is outside 1 to 3650, so Breccia uses 14 instead. Change it in Settings or in the file."`;
    `config.get` shows `archiveAfterDays` 14; the next command (`config.get`) has no such notice; the file's text is
    `"[board]\narchive_after_days = 0 # hand\n"`.
  - `an_out_of_range_hand_edit_gives_a_notice_once`: default config; write the default text with
    `pull_interval_minutes = 100000` (and `commit_delay_minutes = 1441`); `files.changed` `[CONFIG]`: `out.config` is
    `Some` with both minutes 5, and two notices with the Q1 texts, in key order. The same `files.changed` again: no
    notice, no config. Change only a comment in the file: the two notices again (R6). Fix to
    `pull_interval_minutes = 30` and `commit_delay_minutes = 7`: no notice, `config.get` shows 30 and 7. The file is
    never written by Breccia in this test (bytes equal what the test last wrote).
  - `a_settings_write_elsewhere_keeps_the_bad_value`: config with `"[git]\npull_interval_minutes = 100000\n"` plus the
    default states; drain the open notice; `config.setBoard` with `archiveAfterDays: 30`: ok, no notice; the file still
    contains the line `pull_interval_minutes = 100000`; `config.get` shows `pullIntervalMinutes` 5. Then
    `config.setGit` with `enabled: false, commitDelayMinutes: 5, pullIntervalMinutes: 5`: the file now has
    `pull_interval_minutes = 5` and no `100000` (R7), no notice.
- [ ] **Step 2: Run** `cargo test -p breccia-core session:: workspace::`. Expected: FAIL (no `take_config_replaced`,
  no notice).
- [ ] **Step 3: Implement** the field, the drain and the notice as above.
- [ ] **Step 4: Verify.** The same command PASS; `cargo test --workspace` all PASS (the shell's tests and
  `it/git_engine.rs` `a_pull_that_changes_the_config_reloads_it` included); `just lint` clean.
- [ ] **Step 5: Commit** `fix(core): Settings: an out-of-range value in config.toml falls back to its default, with a notice`;
  push.

### Task 3: Spec, format and review item (model: haiku)

**Files:**
- Modify: `docs/spec.md` §6 (`:182`), `docs/format.md` §11, `docs/review.md`
- Check: `crates/core/tests/it/format_doc.rs` still passes (it reads §11's fences)

- [ ] **Step 1: Spec §6**, after "…and Breccia does not write it until it can.": "A number outside the range Settings
  allows (Git minutes 0 to 1440, archive days 1 to 3650) does not stop the file from being read: Breccia uses that
  setting's default and shows a notice naming it, and leaves the file as it is."
- [ ] **Step 2: `docs/format.md` §11.** Replace "The file accepts any whole number ≥ 0 for the numbers below. Settings
  offers a smaller range: 0 to 1440 minutes for Git, 1 to 3650 days for archiving." with "The numbers below have a
  range: 0 to 1440 for the Git minutes, 1 to 3650 for `archive_after_days`. A whole number outside it (a negative one
  too) is read as the key's default, with a notice naming the key; Breccia does not change the file." In the table, the
  type of the three keys becomes "integer, 0 to 1440" (both Git keys) and "integer, 1 to 3650". In "Validation", after
  "Unknown keys are ignored.", add "A number of the wrong type (`\"5\"`, `5.5`) is an error like any other type."
- [ ] **Step 3: `docs/review.md`**, new heading `## Config values out of range (plan 11)`:
  - 89. [ ] **A number out of range in `config.toml`:** with a folder open, edit `breccia/config.toml` in another
    editor: under `[git]` set `pull_interval_minutes = 100000`, save. A notice appears at once: "breccia/config.toml:
    [git] pull_interval_minutes = 100000 is outside 0 to 1440, so Breccia uses 5 instead. Change it in Settings or in
    the file." Settings > Git shows 5. The file is unchanged (your comments too). Set `archive_after_days = 0` under
    `[board]`: a second notice, the board settings show 14. Close Breccia and start it again: the notices come again.
    Fix both values: no notice, the new values are used. Then put `100000` back and change "Git enabled" in Settings:
    the file now says `pull_interval_minutes = 5` (R7). Is the wording right (Q1), the place (Q2), one notice per key
    (Q3), only that key replaced (Q4), and the Settings save writing the default (Q5)?
- [ ] **Step 4: Verify.** `cargo test -p breccia-core format_doc::` PASS.
- [ ] **Step 5: Commit** `docs: out-of-range config numbers in the spec, the format and the review list`; push.

---

## Finish (the controller, not a task)

- `just test`, `just lint`, `just e2e` (**203 PASS** expected, unchanged, R12) on the final `main`; CI green on the
  last commit.
- Follow-ups doc `docs/plans/2026-11-11-11-config-out-of-range-values-followups.md`, at least: the owner's answers to
  Q1 to Q5 (or "default kept"); R3 (a quoted or decimal number still refuses the file); R6 (a dismissed notice returns
  on the next change of the file); R7 (a Settings save writes the default over the hand-written number); R8 (a column
  number may shift on the replaced value's line); a notice inside Settings beside the field if Q2 asks for it.
- `docs/backlog.md`: #80 heading gets "(done 2026-11-11, plan 11)".
- `docs/STATUS.md`: plan 11 in the table and in "Where the project stands"/"Next" (replace "Out-of-range values in a
  hand-edited `config.toml` still load silently (Q1, backlog #80)" in plan 9's paragraph), the owner decision, the
  test baseline (cargo counts; e2e 203), review item 89.
- Delete the plan's scratch files in `.superpowers/sdd/2026-11-11-11-config-out-of-range-values/`, keep
  `progress.md` and `plan-path`; commit and push the ledger.
- Report to the owner: what was built, the verification results, every ruling with its cost if wrong, open items.
