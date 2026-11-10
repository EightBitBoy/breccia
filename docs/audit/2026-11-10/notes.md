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
