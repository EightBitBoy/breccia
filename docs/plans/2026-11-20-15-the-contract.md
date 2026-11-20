# Plan 15: The contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry out the audit's plan "3. The contract" (`docs/audit/2026-11-10/README.md`, "Priorities"): the Git
commands leave the core (M35), error codes become one enum (M19), the window's TypeScript types are generated from the
Rust types (M42), one table classifies the commands in the window (M44), a command's reply is split into what it changed
and what it answers (M20), and, if the owner says yes (Q1), the shell stops sending a command's own changes back as
events (M43).

**Architecture:** A refactor of the wire between the core, the shell and the window. Nothing a user sees changes. The
order keeps `main` green after every task: first the two Rust-only moves that keep the wire as it is (M35, M19), then
the generated types (M42), so that every later wire change is checked by the TypeScript compiler on the window's side;
then the command table (M44); then the reply split in two steps (M20); then the echoes (M43) in two steps, window first.

**Tech Stack:** Rust 1.90 (`crates/core`, `app/src-tauri`), Svelte 5 + TypeScript, Vitest (node, no DOM),
`svelte-check` (in `just lint`), Playwright e2e over WebView2 (`app/e2e/smoke.mjs`). New: `ts-rs` as a
developer-only dependency of the core (Q2).

**Spec:** `docs/spec.md` (binding; §3 "the core has no Tauri dependency", §6 "How data flows", §9 "Room for plugins
later"), the audit's moves in `docs/audit/2026-11-10/program.md` (T7 M19, T8 M20, T12 M35, T14 M42, T15 M43, M44) and
its safety rules in `notes.md`, and this plan's "Owner decisions" once answered.

## State

Written 2026-11-20 at commit `42de232`. Owner answers 2026-11-20: Q1 yes (after asking for the advantages and
disadvantages), Q2 yes (`ts-rs`). All nine tasks are in.

Already done by earlier plans, so not planned again:

- **M17** (a command says what kind it is): `Command::kind()` with `Edit`, `Query`, `Background` exists
  (`crates/core/src/session/command.rs`, plan 6), and with it B5.
- **M41** (contract test): `app/src/lib/contract.test.ts` (plan 6, extended in plans 9, 12 and 14) compares command
  names, event names, `Output` fields, notice kinds, the recovery code and texts, and the range keys, by reading the
  Rust sources as text.
- **Part of M35:** `Command::writes_config()` and `Command::ignores_generation()` live in the core (plan 9; follow-up
  18 of plan 6). Left: the four `git.*` variants, the `shellOnly` arm in the session, the shell's three-way check in
  `run_blocking`, and the shell's own `FolderOpen | FolderCreate` match (`opened`).
- **M16, M33** (dispatch table, shell split, plan 9): `events.rs` and `commands.rs` exist in the shell, which this plan
  edits.

Not in this plan: M34 (one command for machine settings) is in the audit's theme T12 but in none of its plans; it stays
open. The follow-ups of plan 14 touch none of these moves and stay for a later plan.

## Owner decisions

Answered 2026-11-20: **Q1 yes** (the shell stops echoing; Tasks 7 and 8 stay), **Q2 yes** (`ts-rs`, developer
build only).

Plain words, recommendation first. "Cost if wrong" is what changes later.

- **Q1. Should Breccia stop sending a window's own changes back to it?** (Audit Q3, move M43; review item 66.) Item 66
  was ticked on 2026-11-19 without a written answer, so it is asked again here. Today, when you type, rename or move
  something, the app answers the window with the result *and* also sends the same result again as a "something changed"
  message; the window then has to recognise its own result and ignore it. Changes from outside (another editor, a Git
  pull) also come as such messages. *Recommended: yes.* Only outside changes send messages; the window takes its own
  changes from the answer. Nothing changes on screen. It removes a fragile part of the window and some work per edit.
  The spec's sentence "every change emits a named event" (§9) and the line in §6 that views update "from those events"
  are reworded to say so; a later plugin system or second window would get messages that say who made the change.
  *Alternatives:* (a) no, keep the messages as they are (Tasks 7 and 8 drop out); (b) later, in another plan (the same).
  Cost if wrong: two tasks; undoing it means sending the messages again and putting back the recognition code.
- **Q2. A developer tool that writes the window's type list from the core's.** Today the list of what the core and the
  window send each other is written twice, once in Rust and once in TypeScript, and a test reads the Rust files as
  text to compare the names. *Recommended:* add the open-source library `ts-rs` to the developer build only (not to the
  installed app): a test writes the TypeScript list from the Rust one, and fails when the written file is out of date,
  so a mismatch can no longer reach a user. *Alternatives:* (a) the library `specta`, which does the same but is still a
  pre-release and is built to take over how the window calls the app, which Breccia does not need; (b) no new library:
  keep the hand-written list and widen the text-reading test to optional fields, error codes and the new answer kinds
  (it then still misses field types). Cost if wrong: one dependency in the developer build and one generated file of
  about 600 lines; with (b), Task 3 becomes a test change and later tasks edit the TypeScript by hand.

## Global Constraints

- Nothing a user sees changes: no new or changed texts, notices, keys, settings or files. A task that finds it must
  change something visible stops and asks the owner (via the controller).
- No notes-file format change. Files Breccia does not change stay byte-identical; notes files are saved with LF (spec
  §2, §4). `breccia/config.toml` keeps its comments and unknown keys.
- The core stays free of Tauri (spec §3). `ts-rs` is an optional dependency of the core behind the feature
  `wire-types`, turned on only by the core's own dev-dependency (as `test-seams` is), so the shell's and the release
  build do not compile it.
- Wire names stay as they are unless a task says otherwise: every command name, field name, event name and error code
  string. Tauri event names are `noun:verb`; command names keep their dots.
- `serde_json`'s `preserve_order` in the shell stays (see Task 8's ruling: `lib/configChange.ts` compares a
  `ConfigView` from an answer with one from `config:changed` as JSON text).
- Every test must be able to fail: capture the RED run before the change. A test that pins behaviour that already
  holds is shown to fail by a temporary mutation of the code, noted in the task report.
- Logic that needs tests goes into `app/src/lib/` (`App.svelte` has no unit-test harness).
- No colour literals or `color-mix` outside `app/src/styles/tokens.css`.
- Each task ends with `just test`, `just lint` and `just e2e`. Baseline: Vitest 1233, core lib 51, core integration 852
  (2 ignored), shell 89; e2e 218 PASS lines (last step 147). Expected after the plan: 218, or 219 with Q1 yes (Task 8
  adds step 148 with one PASS line). The counted number is the rule; record it in `docs/STATUS.md`.
- Commits: conventional subjects, one change per commit, `refactor`, `test`, `chore`, `docs` (no `feat`/`fix`: nothing
  is visible). No attribution lines. Commit on `main` and push after each commit, unless the owner says "commit only"
  when approving.
- Words from `docs/vocabulary.md` in comments and docs: command, event, notice, page, block, notes folder.

## Review Focus

- **An error the window branches on keeps its exact code.** `stale`, `unknownPage`, `configChanged`, `boardChanged`,
  `recovered`, `unknownBlock`, `noPrevious`, `insideFence`, `noFolder`, `unknownBoard`, `unknownDaily` and the rest
  are compared as strings in the window; a renamed variant would make a refusal fall through to the generic notice.
  Pinned in Task 2 (`error_codes_keep_their_wire_names`) and by the generated union in Task 3 (`svelte-check`).
- **A request the shell answers itself refuses as before.** `git.log` with no notes folder answers code `git` with
  "No notes folder is open."; a request that is neither a shell nor a core command answers `badRequest`. Pinned in
  Task 1.
- **A command that both changes and answers applies both.** `folder.open` changes the page, tree and settings and
  answers with the folder; after the split the window must still apply all four. Pinned in Task 5 (core test) and by
  e2e step 1 onwards (every run opens a folder).
- **After the window's own create, rename, move or delete of a page, the other views still follow.** Today the
  sidebar's names, an open search box, All pages and the graph refresh on the echo of the window's own change. Pinned
  in Task 7 (route tests, one per consumer).
- **An outside change while a command runs still waits for the command's answer** and is then shown (the window's
  `InFlight` stays after M43). Pinned by `app/src/lib/external.test.ts` (kept green) and Task 8's e2e step 148.

---

## Tasks

### Task 1: The Git commands leave the core (M35) (model: sonnet)

**Files:** `crates/core/src/session/command.rs` (delete `GitStatus`, `GitSync`, `GitInit`, `GitLog` and their `kind()`
arms; add `opened_folder`), `crates/core/src/session/mod.rs` (delete the `shellOnly` arm), `app/src-tauri/src/commands.rs`
(the new enum, `parse_request`, `shell_answer` and `git_log_answer` take it, `run_blocking`), `crates/core/tests/it/session.rs`,
`app/src/lib/contract.test.ts` (`command_names_match`).

**Interfaces:**
- Produces in `commands.rs`:
  `#[derive(Clone, Debug, Deserialize)] #[serde(tag = "type", rename_all_fields = "camelCase")] pub(crate) enum ShellCommand { #[serde(rename = "git.status")] GitStatus, #[serde(rename = "git.sync")] GitSync, #[serde(rename = "git.init")] GitInit, #[serde(rename = "git.log")] GitLog { skip: usize, limit: usize } }`;
  `pub(crate) enum Incoming { Shell(ShellCommand), Core(Request) }`;
  `pub(crate) fn parse_request(v: serde_json::Value) -> Result<Incoming, CommandError>` (a `{generation, command}`
  whose command is a `ShellCommand` is `Shell`, the generation ignored as today; otherwise it is parsed as a core
  `Request`, and that parse's error is the `badRequest` message).
- `shell_answer(cmd: &ShellCommand, view: &GitView) -> (Output, Option<GitMsg>)` and
  `git_log_answer(skip: usize, limit: usize, git: &Git, root: Option<&Path>) -> Result<Output, CommandError>` (no
  more `Option`: the caller has already decided).
- Produces in the core: `Command::opened_folder(&self) -> Option<&Path>` (`FolderOpen`/`FolderCreate` give their path).

- [ ] **Step 1: RED tests.** Shell, in `commands.rs` tests: `parse_request_sends_git_commands_to_the_shell` (`git.log`
  with `skip: 0, limit: 50` → `Incoming::Shell(GitLog { skip: 0, limit: 50 })`; `git.status` → `Shell(GitStatus)`);
  `parse_request_sends_the_rest_to_the_core` (`page.today` → `Incoming::Core(_)`);
  `parse_request_refuses_an_unknown_command` (`{"type": "nope"}` → `Err` with code `badRequest`). Core, in
  `it/session.rs`: `git_commands_are_not_core_commands` (the JSON `{"generation": 0, "command": {"type":
  "git.status"}}` does not deserialize as `Request`); `opened_folder_names_the_path` (unit test in `command.rs`).
- [ ] **Step 2:** `cargo test -p breccia --lib commands::` and `cargo test -p breccia-core session::` → fail (no
  `parse_request`; `git.status` still parses).
- [ ] **Step 3:** implement. `run_blocking`: `match parse_request(request)?` → `Shell(GitLog{..})` answers
  `git_log_answer` (outside the session lock, as today), other `Shell` commands answer `shell_answer` and send their
  `GitMsg`; `Core(request)` goes on as today, with `opened` = `request.command.opened_folder().map(Path::to_path_buf)`.
  The trace name is read before parsing, as today. Delete the four core variants, their `kind()` arms and the session's
  `shellOnly` arm (its `ErrorCode` does not exist yet; Task 2 lists the codes after this).
- [ ] **Step 4:** `contract.test.ts` `command_names_match` reads the names of `pub enum Command {` in `command.rs`
  *and* of `pub(crate) enum ShellCommand {` in the shell sources; the TypeScript `Command` union is unchanged. Show it
  fails by renaming `"git.log"` in `ShellCommand` temporarily.
- [ ] **Step 5:** `just test`, `just lint`, `just e2e` (218). The Git item, Sync now, Git init and the Git history view
  are covered by existing e2e steps.
- [ ] **Step 6:** commit `refactor(app): the shell parses its Git commands itself, the core no longer lists them`.

### Task 2: Error codes as one enum (M19) (model: sonnet)

**Files:** create `crates/core/src/session/error.rs` (move `CommandError`, its `From<PageError>`, `From<EditError>`
and helpers out of `view.rs`; add `ErrorCode`), `crates/core/src/session/mod.rs` (module, re-exports), every
`CommandError::new` site (`block.rs`, `board.rs`, `dailies.rs`, `folder.rs`, `graph.rs`, `journal.rs`, `mod.rs`,
`page.rs`, `search.rs`, `settings.rs`, `crates/core/src/lib.rs`), the shell's `commands.rs` (`error`), `recovery.rs`,
`indexing.rs` (test), core tests that compare `code` with a string (`it/support/mod.rs` and the files `grep -rn
'\.code' crates/core/tests` lists), `app/src/lib/contract.test.ts` (the recovered-code case reads the new spelling).

**Interfaces:**
- `#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize)] #[serde(rename_all = "camelCase")] pub enum ErrorCode`
  with one variant per code in use after Task 1, among them the shell's own: `Internal`, `BadRequest`, `Recovered`,
  `Git` (documented "answered by the shell"). `impl ErrorCode { pub const ALL: &'static [ErrorCode]; pub fn as_str(self) -> &'static str }`
  (`as_str` is an exhaustive `match`; `Display` for `CommandError` uses it, so the text stays `"{code}: {message}"`).
- `pub struct CommandError { pub code: ErrorCode, pub message: String }`; `CommandError::new(code: ErrorCode, message: impl Display)`
  becomes `pub` (the shell uses it; `commands::error` is deleted).

- [ ] **Step 1: list the codes.** `grep -rn 'CommandError::new\|error("\|code: "' crates/core/src app/src-tauri/src`
  plus the two `From` impls. Expected set (after Task 1): badDate, badRequest, boardChanged, changedOnDisk, config,
  configChanged, create, dailiesSave, dailiesUnreadable, folderExists, folderMissing, folderNotEmpty, git, insideFence,
  internal, intoItself, invalidBoard, invalidDaily, invalidName, invalidOffset, invalidSetting, invalidState, io,
  joinOntoProperties, journal, layout, noCycle, noFolder, noNextSibling, noParent, noPrevious, noPreviousSibling, notFinished,
  open, pageExists, recovered, reload, search, stale, unknownBlock, unknownBoard, unknownColor, unknownDaily,
  unknownFolder, unknownPage, unknownState, unsaved, wouldChangeStructure. Any difference from the grep is reported,
  and the grep wins.
- [ ] **Step 2: RED test** in `error.rs`: `error_codes_keep_their_wire_names`: for every `c` in `ErrorCode::ALL`,
  `serde_json::to_string(&c)` equals `format!("\"{}\"", c.as_str())`, and the sorted `as_str` list equals the list of
  Step 1 written out as string literals. `cargo test -p breccia-core --lib error::` → does not compile (no
  `ErrorCode`): that is the RED run.
- [ ] **Step 3:** implement; replace every literal with its variant. The core's integration tests compare
  `err.code == ErrorCode::Stale` (not strings). Wire unchanged: the e2e and the window are untouched.
- [ ] **Step 4:** mutation check: rename `UnknownPage`'s wire name by a `#[serde(rename = "unknownpage")]` → the test
  fails; undo.
- [ ] **Step 5:** `just test`, `just lint`, `just e2e` (218). Commit `refactor(core): error codes are one enum`.

### Task 3: Generate the window's types from the core (M42) (model: opus; wire format; Q2)

If the owner answers Q2 (b), this task instead extends `contract.test.ts` to compare optional `Output` fields, the
`ErrorCode` list and (after Tasks 5 and 6) the answer kinds, and Tasks 5 and 6 edit `types.ts` by hand.

**Why `ts-rs`:** it is a derive that reads the serde attributes already on the types, has no tie to Tauri (the core must
stay free of it, spec §3), needs nothing in Node or npm, builds on the toolchain in `CLAUDE.md` (Rust 1.90), and can be
compiled only for tests. `specta` 2 is a release candidate, and its Tauri layer replaces the command calls, where
Breccia has one `run` command and needs only the types.

**Files:** `crates/core/Cargo.toml` (optional `ts-rs`, feature `wire-types`, the self dev-dependency gets the feature),
every wire type in the core (`#[cfg_attr(feature = "wire-types", derive(ts_rs::TS))]` and `ts(...)` attributes):
`session/command.rs`, `session/view.rs`, `session/error.rs`, `session/board.rs`, `session/graph.rs`,
`session/search.rs`, `session/table.rs`, `session/tree.rs`, `session/dailies.rs` (or wherever `DailyView` lives),
`workspace` (`NameEntry`, `StateUsage`), `git` (`GitView`, `GitLogView` and their parts), `config` (`Board`),
`color.rs` (`PageColor`), `outline.rs` (`BlockId`), the index progress type; create `crates/core/tests/it/wire_types.rs`
(and `mod wire_types;` in `it/main.rs`); create `app/src/lib/generated.ts`; `app/src/lib/types.ts`; `app/src/api.ts`
(`errorCode`); `app/src/lib/contract.test.ts`; `justfile` (recipe `types`); `CLAUDE.md` ("Where things are",
"Commands").

**Interfaces:**
- Produces `app/src/lib/generated.ts`: first line `// Generated by \`just types\` from crates/core. Do not edit.`, then
  one `export type` per wire type reachable from the roots `Request`, `Command`, `Output`, `CommandError` and the event
  payloads (`PageView`, `TreeView`, `RenameView`, `ConfigView`, `DailyView`, `Notice`, `GitView`, the index progress
  type), sorted by name, LF line endings.
- `types.ts` keeps every name the window imports today: it re-exports the generated types, under today's name where the
  Rust name differs (for example `export type NameView = NameEntry`), and `export type Command = CoreCommand |
  ShellCommand`, where `ShellCommand` (the four `git.*` commands) stays hand-written next to the shell-only types
  (`UiState`, `RecentFolder`, `RecoveredEvent`) and the window-only ones (`Item`, `NoticeAction`, …).
- `errorCode(e: unknown): ErrorCode | null`.

- [ ] **Step 1: spike.** Add `ts-rs` (the newest release; note the version in the commit body) with the feature; derive
  on `BlockId` and `Focus` only; print their `decl()` in a scratch test. Check, and record in the task report: 64-bit
  integers come out as `bigint` (each `u64` field and `BlockId` then gets `ts(type = "number")`, the values stay below
  2^53 as the hand types already assume); `#[serde(rename_all_fields)]` on `Command` and `Notice` is honoured (if not,
  give each struct variant its own `#[serde(rename_all = "camelCase")]`, which leaves the wire unchanged, and check it
  with the session tests that send JSON); a field with `#[serde(default)]` or `skip_serializing_if` gets
  `ts(optional)` so it is `name?:` as in today's hand types; `PageColor`'s own `Serialize` gets `ts(type = "string")`.
- [ ] **Step 2: RED test** `wire_types::generated_types_are_current`: renders the file (`fn render() -> String`:
  collect the roots' declarations and their dependencies with ts-rs's dependency visitor, sort by name, prefix
  `export `), and compares it with `app/src/lib/generated.ts` (path from `CARGO_MANIFEST_DIR`). With
  `BRECCIA_WRITE_TYPES=1` it writes the file instead and passes. Failure message: "app/src/lib/generated.ts is out of
  date: run `just types`". `cargo test -p breccia-core wire_types::` → fails (the file does not exist).
- [ ] **Step 3:** derive on every wire type; `just types` (recipe:
  `$env:BRECCIA_WRITE_TYPES = '1'; cargo test -p breccia-core wire_types::`) writes the file; the test passes.
- [ ] **Step 4: switch the window.** `types.ts` re-exports; delete each hand type the file now holds. Run `npm run
  check` in `app/` and fix every error by following the wire, never by loosening a generated type (test fakes that
  build an `Output` share one helper if many need the same empty fields). Where a generated type is stricter than the
  hand one (for example a field that was `?:` by hand and is always sent), the generated one is right.
- [ ] **Step 5: contract test.** Delete the cases the generation now covers (`command_names_match` for the core part,
  `output_fields_match`, `notice_kinds_match`); keep the shell part of `command_names_match`, `event_names_match`, the
  recovery cases, `recovered_event_fields_match` and the range-key cases.
- [ ] **Step 6: staleness check.** Rename a field of `DateView` in Rust (with its serde name): the core test fails with
  the message of Step 2; run `just types`: `npm run check` now fails in the window where it reads that field; undo
  both. Note both failures in the report.
- [ ] **Step 7:** `CLAUDE.md`: "Where things are" names `app/src/lib/generated.ts` (written by `just types`, checked
  by `cargo test`); "Commands" gets `just types`. `cargo build -p breccia --release` does not compile `ts-rs` (check
  `cargo tree -p breccia -e normal | grep ts-rs` prints nothing).
- [ ] **Step 8:** `just test`, `just lint`, `just e2e` (218). Commits: `chore(core): ts-rs for the window's types,
  developer build only`; `refactor(app): the window's wire types are generated from the core`.

### Task 4: One table says what each command is (M44) (model: sonnet)

**Files:** create `app/src/lib/commands.ts` and `app/src/lib/commands.test.ts`; `app/src/lib/sync.ts` (`kindOf` and
`countsInFlight` read the table); `app/src/lib/sync.test.ts`.

**Interfaces:**
- `export interface CommandInfo { editor: Kind; holdsEvents: boolean }` and
  `export const COMMANDS = { 'folder.open': { editor: 'other', holdsEvents: true }, … } as const satisfies Record<Command['type'], CommandInfo>`
  (every command of the union, including the shell's four). `kindOf(type)` returns `COMMANDS[type].editor`;
  `countsInFlight(type)` returns `COMMANDS[type].holdsEvents`. `Kind` stays exported from `sync.ts` (or moves to
  `commands.ts` and is re-exported).
- Ruling: `holdsEvents` is the window's own decision, not the core's `Query` kind. The two differ: `page.get`,
  `pages.get`, `folder.status`, `folder.tree`, `config.get`, `journal.feed`, `dailies.list`, `session.dirty`, `states.usage`,
  `git.status` and `git.log` are queries that hold events today, and `graph.saveLayout` is a query that does not.
  Generating the core's kind into the window adds nothing the window uses. *Cost if wrong:* a column added later.

- [ ] **Step 1: RED test** `commands.test.ts`: `every command keeps its editor kind and its event hold`: for every key
  of `COMMANDS`, `[type, kindOf(type), countsInFlight(type)]`, compared with the full list written out from today's
  `kindOf` and `countsInFlight` (the ten names that do not hold events, the four `structure`, thirteen `text`, `typing`,
  `split`, `refresh`, the rest `other`). Also a type-only check in the same file: an object missing one command fails
  `svelte-check` (`// @ts-expect-error` on a `satisfies` with one key removed). `npx vitest run src/lib/commands.test.ts`
  → fails (no module).
- [ ] **Step 2:** implement; `kindOf` loses its `default` branch, `countsInFlight` its 300-character line.
- [ ] **Step 3:** mutation: change one entry's `editor` → the test fails; undo. Drop a key → `npm run check` fails;
  undo.
- [ ] **Step 4:** `just test`, `just lint`, `just e2e` (218). Commit `refactor(app): one table says what each command is`.

### Task 5: A command's reply: what it changed, and its answer (M20, part 1) (model: opus; wire format)

**The rule:** a reply holds the *changes* every view must follow, whoever caused them, and at most one *answer* that
only the asker wants. Changes stay as fields of `Output`: `page`, `focus`, `notices`, `config`, `tree`, `changed`,
`removed`, `renamed`, `saved`, `dailies` (the watcher's runs carry `config` and `dailies` as changes too, so they are
changes; `config.get` and `dailies.list` answer through them, as now). Every other field becomes one variant of
`Answer`. Ruling: no nested `effects` object, so the window's many reads of `out.page` and friends do not move. *Cost if
wrong:* a later rename of fields. Wire of the answer: `answer: { kind: 'refs', value: RefsView } | null` (serde's
adjacent tagging, because some answers are lists or numbers).

**Files:** `crates/core/src/session/view.rs` (`Answer`, `UsageView`, `Output.answer`), the session files that set the
fields of this part (`folder.rs`, `mod.rs`, `page.rs`, `search.rs`, `settings.rs`), the shell's `commands.rs`
(`shell_answer`, `git_log_answer`), core tests (`it/support/mod.rs` gets the `answer!` macro; the test files that read
these fields), shell tests, `app/src/lib/generated.ts` (by `just types`), create `app/src/lib/answer.ts` and
`app/src/lib/answer.test.ts`, `app/src/App.svelte` (`apply` and the other readers), the `lib/` classes and tests that
read these fields (find them with `npm run check` after regenerating).

**Interfaces:**
- `#[derive(Clone, Debug, Serialize)] #[serde(tag = "kind", content = "value", rename_all = "camelCase")] pub enum Answer`.
  This task adds `Folder(FolderView)` (folder.open, folder.create, folder.status), `Dirty(Vec<DirtyView>)`,
  `Reach(usize)`, `Day(DateView)`, `Names(Vec<NameEntry>)`, `Usage(UsageView)` with
  `pub struct UsageView { pub states: Vec<StateUsage>, pub skipped: usize }`, `Git(GitView)`, `GitLog(GitLogView)`;
  and deletes the fields `folder`, `dirty`, `reach`, `day`, `names`, `usage`, `usage_skipped`, `git`, `git_log`.
  `Output.answer: Option<Answer>`, serialized after the changes (as the last field).
- Core test support: `macro_rules! answer { ($out:expr, $v:ident) => { match $out.answer { Some(Answer::$v(x)) => x, other => panic!("expected {} answer, got {other:?}", stringify!($v)) } } }`.
- Window: `export function answerOf<K extends Answer['kind']>(out: Output, kind: K): Extract<Answer, { kind: K }>['value'] | null`
  in `lib/answer.ts`.

- [ ] **Step 1: RED tests.** Core, in `it/session.rs`: `folder_open_answers_the_folder_and_changes_the_rest` (open a
  folder with one page: `answer!(out, Folder).generation` equals the session's, and `out.page`, `out.tree`,
  `out.config` are set); `answers_have_kind_and_value` (`serde_json::to_value` of a `page.renameReach` reply has
  `answer == {"kind": "reach", "value": 0}` and no top-level `reach`). Shell: `git_status_answers_git`
  (`shell_answer(&GitStatus, &view).0.answer` is `Some(Answer::Git(_))`). Window, `answer.test.ts`: `answerOf` gives
  the value for its kind and null for another kind and for no answer. Run → fail (no `Answer`).
- [ ] **Step 2:** implement in the core and the shell; `answer!` in the tests. If any command sets two of these fields
  today, stop and report (the enum allows one answer).
- [ ] **Step 3:** `just types`; `npm run check` lists every window site that read a moved field; each reads
  `answerOf(out, '…')` instead (in `route.ts` too, with its tests). No behaviour change in the window.
- [ ] **Step 4:** `just test`, `just lint`, `just e2e` (218). Commit `refactor(app): a command's answer is apart from
  what it changed (folder, Git and small answers)`.

### Task 6: The reply split, part 2 (M20) (model: opus; wire format)

**Files:** as Task 5, for the fields of this part: `session/page.rs` (`refs`), `journal.rs` (`feed`, `pages`),
`board.rs` (`board`, `archive`), `mod.rs` (`table`, `archive`), `graph.rs` (`graph`), `search.rs` (`search`); the window's
`route.ts` and `route.test.ts`, `journal.svelte.ts`, `boards.svelte.ts`, `allPages.svelte.ts`, `archive.svelte.ts`,
`network.svelte.ts`, `search.svelte.ts` (whichever read these fields), `App.svelte`.

**Interfaces:** `Answer` gains `Refs(RefsView)`, `Feed(FeedView)`, `Pages(Vec<PageView>)`, `Board(BoardView)`,
`Table(Vec<PageRowView>)`, `Archive(Vec<ArchivedView>)`, `Graph(GraphView)`, `Search(SearchView)`; the fields `refs`,
`feed`, `pages`, `board`, `table`, `archive`, `graph`, `search` go. Afterwards `Output` holds only the changes and
`answer`. `Output::is_empty` keeps comparing through serde.

- [ ] **Step 1: RED tests.** Core: `page_refs_answers_refs` and `pages_get_answers_pages_and_changes_nothing`
  (`out.page` is `None`, `out.changed` empty, `answer!(out, Pages)` has the asked page); shell `events.rs`:
  `events_ignore_the_answer` (an `Output` whose only content is `answer: Some(Answer::Pages(vec![page]))` gives no
  events; today `pages` is not emitted, and this keeps it so). Window, `route.test.ts`: the existing cases that build
  an output with `refs` or `feed` are rewritten to the new shape first and fail against the old `route`.
- [ ] **Step 2:** implement in the core; `answer!` in the tests.
- [ ] **Step 3:** `just types`; fix every site `npm run check` lists, through `answerOf`. `route` reads
  `answerOf(out, 'feed')` and `answerOf(out, 'refs')`; `apply` passes `answerOf(out, 'pages')` to
  `journal.applyPages`.
- [ ] **Step 4:** `just test`, `just lint`, `just e2e` (218). Commit `refactor(app): views and lists answer apart
  from what a command changed`.

### Task 7: The window takes its own changes from the answer (M43, part 1; only with Q1 yes) (model: opus; UI integration)

Today the window gets each change of its own commands twice: in the answer, which `apply` uses, and as events, which
the handlers in `App.svelte` (`listenShell`, about line 1592) recognise with `Echoes` and mostly skip. Some handlers
act before the echo check, so the window relies on its own echoes for these (the inventory, checked against `main`
at `42de232`):

| Event handler | Acts on own echoes | After this task, from the answer |
|---|---|---|
| `pageChanged` | `search.refresh()`, `journal.changed(p)` for every page | a route field each |
| `pageChanged` | `allPages`/`archiveView`/`network`.`changed(true)`, `boards.changed(p, true)`: nothing for own pages | nothing |
| `treeChanged` | `search.refresh()`, `search.refreshNames()`, `allPages.refresh()`, `network.refresh()` (no echo check at all) | route fields, set when `out.tree` is set |
| `pageRemoved` | `search.refresh()`, `network.refresh()`; `pageRemoved(key)` skips own removals | route fields, set when `out.removed` is not empty |

This task adds the answer side only; the echoes still arrive and are still skipped or acted on, so for one task some
refreshes run twice (harmless: each is a query).

**Files:** `app/src/lib/route.ts`, `app/src/lib/route.test.ts`, `app/src/App.svelte` (`apply`); `journal.svelte.ts` if
`journal.changed` needs a form for several pages.

**Interfaces:** `Route` gains `refreshSearch: boolean` (the output changed or removed a page, or carries a tree),
`refreshNames: boolean`, `refreshAllPages` (exists; widened to "a tree came"), `refreshGraph: boolean`,
`journalChanged: PageView[]` (`out.page` and `out.changed`). `apply` carries each out at the place the event handler
does today.

- [ ] **Step 1: list again.** Before writing tests, re-read the handlers in `App.svelte` and confirm the table; any
  other consumer found gets a row and a test. Record the final table in the task report.
- [ ] **Step 2: RED tests** in `route.test.ts`, one per row: `a page in the answer refreshes an open search`,
  `a tree in the answer refreshes the names, All pages and the graph`, `a removal in the answer refreshes search and
  the graph`, `every page of the answer goes to the journal`, and the negatives (`a query answer refreshes nothing`:
  `search.query`, `page.refs`). Run → fail.
- [ ] **Step 3:** implement in `route` and `apply`.
- [ ] **Step 4:** `just test`, `just lint`, `just e2e` (218). Commit `refactor(app): the window follows its own
  changes from the answer`.

### Task 8: The shell stops echoing a command's changes (M43, part 2; only with Q1 yes) (model: opus; UI integration)

**Files:** `app/src-tauri/src/commands.rs` (`run_blocking` emits nothing), `app/src-tauri/src/events.rs` (`events`
loses `from_watcher`: every caller is the watcher or the Git thread, so config, dailies, saved and notices always
go; its tests), `watching.rs`, `git.rs` (callers); the window: delete `app/src/lib/echo.ts`, `echo.test.ts`,
`echo.bench.ts`; `route.ts` (`own` goes), `allPages.svelte.ts`, `archive.svelte.ts`, `network.svelte.ts`,
`boards.svelte.ts` (`changed` loses `own`), `pageChanged`'s `own` in its `lib/` module, their tests, `App.svelte`
(`Echoes`, `ownRemovals`, `isOwnRemoval`, `isOwnPage`); `app/src/lib/contract.test.ts`; `app/e2e/smoke.mjs` (step 148);
`docs/spec.md` (§6, §9); `CLAUDE.md` (lesson on field order).

Ruling: `InFlight` and `WhenIdle` stay: an outside event must still wait for a running command (audit M43).
`preserve_order` and `page_changed_payload_keeps_the_answer_field_order` stay too, with a new reason: `configChange.ts`
compares a `ConfigView` from an answer with one from `config:changed` as JSON text, and the event goes through
`serde_json::Value`, which without `preserve_order` sorts the keys. *Cost if wrong:* a dependency feature kept that
could go after a change to `configChange.ts`.

- [ ] **Step 1: RED tests.** `contract.test.ts`: `the window's own commands send no events`: the shell source of
  `commands.rs` contains no `emit_all(` and no `app.emit(`. `events.rs`: `outside_runs_send_every_change` (an `Output`
  with config, dailies, saved and notices gives `config:changed`, `dailies:changed`, `pages:saved`, `notices:added` in
  today's order, without a flag). e2e **step 148** (after step 147): the window listens for `page:changed` through
  `window.__TAURI_INTERNALS__` (as steps 126 and the tray step reach it); type a word into today's journal and wait for
  the bytes on disk: no `page:changed` arrived; then append a line to that journal file from outside: one
  `page:changed` arrives for its key, and the line shows. Run → the contract test and step 148 fail.
- [ ] **Step 2:** implement the shell side.
- [ ] **Step 3:** remove the echo code in the window; `npm run check` and the tests guide the rest. `pageRemoved(key)`
  no longer asks whether the removal is its own.
- [ ] **Step 4: spec.** §6: "The core applies the intent to its model, writes the file (…), updates the index and
  answers with what changed. Every open view (…) updates from that answer; changes made outside the window (another
  program, a Git pull) come as named events." §9: "every user action goes through a named **command** (…), and every
  change made outside the window emits a named **event**; the window's own commands get their changes in the answer. A
  later plugin API or second window would get events that name who caused them." `CLAUDE.md` lesson: "Event payloads
  keep struct field order (serde_json `preserve_order`), because `lib/configChange.ts` compares a `ConfigView` from an
  answer with one from `config:changed` as JSON text."
- [ ] **Step 5:** `just test`, `just lint`, `just e2e` (219). Commits: `refactor(app): a command's changes are not
  sent back as events`; `test(e2e): own edits send no page events, outside edits do`; `docs: spec §6 and §9, own
  changes come in the answer`.

### Task 9: Bookkeeping (model: sonnet)

**Files:** `docs/STATUS.md`, `docs/backlog.md` (only if a task found something to leave), `docs/review.md` (only for
something a user can see; none is expected), `.superpowers/sdd/2026-11-20-15-the-contract/progress.md`.

- [ ] **Step 1:** `docs/STATUS.md`: plan 15 in the table and in "Next" (what was done, the audit moves closed: M19,
  M20, M35, M42, M44, and M43 if Q1 yes; M34 still open; the audit's plans 4 and 5 still wait); "Test baseline" with
  the counted numbers and the e2e PASS count; "Owner decisions in force": Q1's answer, and with Q2 yes "the window's
  wire types are generated (`just types`)".
- [ ] **Step 2:** `docs/review.md`: no item unless a task changed something visible (then from 133, under
  `## The contract (plan 15)`). If Q1 was answered, add the answer under item 66 in `docs/reviewed.md`
  ("Owner, 2026-11-2x: yes/no …").
- [ ] **Step 3:** commit `docs: plan 15 bookkeeping`.

## Finishing (controller)

`just test`, `just lint`, `just e2e`; write `docs/plans/2026-11-20-15-the-contract-followups.md`; update
`docs/STATUS.md`; delete the workspace's scratch files except `progress.md` and `plan-path`; report to the owner (what
was built, verification, rulings with their cost if wrong, open items).
