# Notes

What works and must survive any refactor, and the patterns the code follows. A refactor that breaks one of these
is wrong even if the tests pass.

## Core: format and outline (area 1)

- **The round trip is structural, not tested-in.** `outline::parse` keeps each block's bytes in `raw`;
  `Document::render` re-emits them and regenerates only blocks whose `raw` is `None`. Every edit goes through
  `Document::store`, `replace_keeping_structure` or `set_preamble`, and each of them re-reads the new bytes and
  refuses a change that would re-read as another outline (`EditError::WouldChangeStructure`, `InsideFence`). Keep
  this "write, re-read, compare, else refuse" shape for every new edit.
- **One line classifier.** `outline::LineScanner` decides what is a bullet and what is fenced code for the parser,
  the edits and `inline::links`. Nothing else may decide that.
- **One state rule.** `task::starts_with_keyword` is the only test for "this block is in that state"; rendering,
  the board and the state rename use it.
- **Relinking verifies itself.** `relink::rewrite` re-parses its output and returns `Refused` unless the links read
  back as intended. Keep that for any future bulk rewrite (block references, tag renames).
- **Rendering escapes everything.** `render.rs` turns raw HTML events into text, allows only `http`, `https` and
  `mailto` targets, and builds every attribute through `esc`. User text can never become markup. Private-use
  placeholders (`U+E000`, `U+E001`) are stripped from input by `clean` first.
- **Config writes keep the user's file.** `config.rs` edits the parsed TOML document in place and writes only what
  differs; `Expect::Text` refuses a write when the file changed since it was read. `DEFAULT_TOML` and
  `Config::default()` are held equal by `crates/core/tests/it/config.rs` (`default_toml_matches_default`).
- **Atomic writes** (`fsio::write_atomic`): temp file in the same folder, sync, rename with retries on Windows,
  creation time and permissions kept.
- Style the code follows: module docs (`//!`) say what the module owns; doc comments state the rule, not the
  mechanics; errors are `thiserror` enums; no `unwrap` on data that comes from a file.

## Core: workspace and watcher (area 2)

- **Never write over bytes Breccia did not read.** `Workspace::save_with` (`workspace/mod.rs:748`) re-reads the
  file and compares it with `on_disk` before every write; a page without a file is written only when nothing is at
  its path (`path_taken`, case-insensitive). `rename_no_clobber` does the same for renames and moves. Every new
  file operation must go through these.
- **Unsaved edits win over the disk.** `apply_disk_changes` never reloads or removes a page for which `is_unsaved`
  is true; it reports it in `kept_unsaved` and the user decides.
- **Own writes are recognised by content, not by time.** `file_changed` ignores a file whose bytes equal `on_disk`
  (`disk.rs:274`). There is no "ignore events for N ms" window; keep it that way.
- **Block ids survive a reload** through `carry_ids`, also for a file moved on disk within one batch
  (`DiskReport::gone`).
- **A rename stands once the file is renamed** (`rename_page`): later failures are collected in the report
  (`skipped`, `save_errors`) and never undo it. The state rename (`rename_state`) follows the same shape.
- **Aliases are resolved at lookup**, not stored in the link index (`workspace/names.rs`); batches
  (`begin_alias_batch`, `end_alias_batch`) keep opening a folder at one recompute, and a test counts it.
- Open question for the owner, kept in `README.md`: `delete_page` (`pages.rs:453`) removes the file for good with
  `fs::remove_file`; without Git there is no way back.

## Core: session (area 3)

- **One entry point.** `Session::run` is the only way in; the caller gives the time (`Clock`), so every command is
  testable without a real clock. Keep `Clock` as a parameter.
- **A failed save never fails the command.** The edit stays in memory, the page is tracked in `failed_saves`, a
  `Notice::SaveFailed` goes out, and `Output.saved` reports it once the file is written (`note_save`,
  `note_failed_save`).
- **Edits are all-or-nothing.** `mutate_tracked` snapshots the document, puts it back on error, and records an undo
  step only when the document really changed. Multi-page edits (`place_card`) do the same by hand and record one
  grouped step.
- **Block ids belong to a generation.** A request from another generation is refused with `stale`; opening a
  folder bumps the generation and the config version.
- **Settings are never written from stale knowledge.** `config_guard` re-reads the file, compares the version the
  request was made from, and `write_config` passes `Expect::Text`, so a hand edit between read and write is never
  lost.
- **Typing over an outside change keeps both.** `marks` remembers blocks a reload changed or removed;
  `set_text_on_marked` keeps the user's text and reports a `Notice::Conflict`.
- **Undo has one memory budget** for all pages (`history.rs`, 64 MB, 200 steps a page), and changes Breccia makes
  by itself (`archive.auto`) are rebased into the snapshots instead of becoming steps.
- **The search index repairs itself** (`IndexState::guarded`, `recover`): a damaged file is rebuilt once, then the
  index moves to memory with a notice.
- Carried to the synthesis (area 15): every edit answers with a complete `PageView`, in which every block of the
  page is rendered to HTML again (`PageView::of`, `view.rs:355`). That is simple and correct, and it is the first
  thing to measure when a long page feels slow.

## Core: search and Git (area 4)

- **The index is a cache.** `search/` never writes into the notes folder; a page's rows are current when
  `page_hash` (schema version, kind, state keywords, block texts) matches. Bump `SCHEMA_VERSION` whenever what is
  stored changes.
- **Git never destroys.** `git/sync.rs` runs no `reset`, `stash`, `clean`, `--amend` or forced push; a rebase that
  fails is aborted and the result checked (`after_failed_rebase`: aborted, HEAD restored, no operation left). A
  rebase the user has in progress is never touched (`Repo::busy` first).
- **Only the notes folder is committed** (`add -A -- .`, `commit --only -- .`), with Breccia's temp files
  excluded; files staged elsewhere stay staged.
- **Git's environment is cleaned** (`REPOSITORY_VARS` removed, `LC_ALL=C` so answers can be matched by text,
  `GIT_TERMINAL_PROMPT=0`, no sign-in window from a timer).
- **Network commands never hold the session lock**; the local rebase and the reload after it do
  (`integrate_locked`). `GitEngine::last_lock_held` measures it. A local Git command may take up to
  `LOCAL_LIMIT` (120 s), and during a rebase that is time the UI waits; look here first if the app ever freezes
  at a pull.
- **The engine owns no thread and no clock**: the shell calls `tick`, `sync_now`, `close`, `init` with a `Now`.
  `Schedule` is pure. Keep both testable that way.
- **`index.lock` is never deleted** by Breccia; it is waited for, then explained (`Problem::Locked`).

## Core: tests (area 5, sampled)

- **Property tests guard the round trip**: `roundtrip.rs` checks `parse(s).render() == s` for arbitrary strings,
  for whitespace-heavy strings and for strings built from outline tokens; `edit.rs` uses `proptest` too. Any
  parser change must keep these green without loosening the generators.
- **Tests speak the wire format**: `session.rs` sends commands as the JSON the frontend sends
  (`{"type": "block.setText", …}`), so the command names and field names are tested, not only the Rust API.
- **Git tests use real Git** in temp repositories (`gitenv/mod.rs`), including fake SSH that hangs, a held
  `index.lock` and two clones; the few `sleep` calls are inside those fakes, not in assertions.
- **One test program** (`tests/it/main.rs`) keeps link time down; a file runs alone with
  `cargo test -p breccia-core <file>::`.
- `docs/format.md` is checked against the code by `format_doc.rs`, and the demo folder by `demo.rs`.

## Shell (area 6)

- **Everything runs off the main thread** (`spawn_blocking` for commands, the watcher callback and the index
  loop; one plain thread for Git), and **nothing is emitted while the session lock is held**.
- **The event payload keeps the answer's field order** (`serde_json` with `preserve_order`, tested by
  `page_changed_payload_keeps_the_answer_field_order`), because the frontend recognises the echo of its own
  command by comparing JSON strings. Any change to how pages are sent must keep or replace that test.
- **The close is bounded**: the window goes at once, the last commit and push get `CLOSE_LIMIT` (15 s), a rebase
  under the lock is waited for, and nothing starts after the shell gave up (`begin_close`, `finish_close`).
- **Test hooks are environment variables** read in one place each (`BRECCIA_CONFIG_DIR`, `BRECCIA_FOLDER`,
  `BRECCIA_TODAY`, `BRECCIA_TRACE`, `BRECCIA_OFFSCREEN`, `BRECCIA_NO_TRAY`), each with a small pure function and a
  test. Keep new hooks in that shape.
- **`settings.json` survives damage and newer versions**: each field is decoded alone, unknown keys are kept
  (`Settings::other`), a file that is not JSON is copied to `settings.json.broken` before it is replaced.
- **The content security policy is narrow**: scripts only from the app, connections only to the IPC. Images may
  come from any `http` or `https` address (`img-src`), which a note needs for `![](https://…)`; it also means a
  note pulled from a shared repository can make Breccia fetch a remote address when the page is shown. Open
  question Q2 for the owner.
- The capabilities (`capabilities/default.json`) grant only window calls, the open dialog, window state and
  opening `http`, `https` and `mailto` addresses. No file-system or shell plugin is exposed to the page.

## Frontend: app shell and state (area 7)

- **One command at a time.** `createClient` (`app/src/lib/api.ts`) queues every command; `run` sends pending
  typed text first, so the core never sees a command before the text typed ahead of it. The generation is
  captured when a command is queued, not when it is sent. Every flow that leaves a view calls `host.leave()` and
  `client.flush()` first; keep that order in any new flow.
- **One place applies an answer.** `apply(out, cmd)` in `App.svelte` is the only function that turns an `Output`
  into state; the decisions are in `route` (`lib/route.ts`), which is pure and tested.
- **Own echoes are recognised, not suppressed.** Shell events wait while a command is in flight (`InFlight`) and
  are compared with what the command returned (`Echoes`); that is why the payload's field order matters.
- **State classes take an `env`.** `Journal`, `Boards`, `AllPages`, `Archive`, `Network`, `Search`, `GitLog`,
  `PageFlows` are plain classes in `lib/*.svelte.ts` that get `run`, `notify` and friends injected and are tested
  with fakes. New state follows this shape (M38, M39 extend it to what is still in `App.svelte`).
- **Heavy views load on demand** (`NetworkView`, `GitLogView`, `ArchiveView` through `{#await import(…)}`).
- **Settings writes are serialised** (`WriteQueue`) and each carries the config version its values came from.
