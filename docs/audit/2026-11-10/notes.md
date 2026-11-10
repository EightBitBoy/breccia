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
