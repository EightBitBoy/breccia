# Program

Each theme says what is wrong with the structure and why it will cost more later. Each move is a refactor that
keeps behaviour: it can be one plan task, with the existing tests as the safety net.

## T1: `config.rs` is three modules in one file

`crates/core/src/config.rs` is 1,160 lines and holds three things with different reasons to change: the settings
model with its validation (`Config`, `State`, `Board`, `check_states`, `check_boards`, `cycle_next`), a
format-preserving TOML editor that knows nothing about Breccia (`rebuild_array`, `rebuild_tables`, `put`,
`set_keeping_decor`, `AppendKey`, the comment-carrying helpers), and the file access (`edit_file`, `load`,
`read_text`). The editor part is the hardest code in the core to read, and it sits between the model's `impl`
blocks. Any new settings section (journal settings, an update channel, per-board filters from the backlog) adds to
all three at once.

### M1: split `config.rs` into `config/{mod,model,toml_keep,file}.rs`

- `model.rs`: the structs, defaults, `PALETTE`, `valid_keyword`, `validate`, `check_states`, `check_boards`,
  `state`, `cycle_next`. No `toml_edit` import.
- `toml_keep.rs`: the generic editing helpers. They take `toml_edit` types and plain strings only; none of them
  needs `State` or `Board`.
- `file.rs` (or `mod.rs`): `edit_file`, `Expect`, `load*`, and the four `write_*` functions with the small
  state and board adapters (`update_state`, `update_board`, `match_states`, `match_boards`).
- Public paths stay (`breccia_core::Config`, `config::Expect`), so no caller changes.

### M2: one validation for state lists

`Config::validate` (`config.rs:1146`) repeats the keyword and duplicate checks of `Config::check_states`
(`config.rs:1003`). Make `validate` call a shared `check_keywords(&[State])`, so a rule added to one cannot be
missed in the other.

### M3: one spelling for `toml_edit` types

The file imports `Value`, `Item`, `Table`, `Array`, `InlineTable` and also writes `toml_edit::Value`,
`toml_edit::Item`, `toml_edit::Table` in full (lines 182 to 376 against 411 onward). Use the imports throughout.
Also drop the `create_dir_all` in `edit_file` (`config.rs:404`): `fsio::write_atomic` already creates the parent.

## T2: block properties are edited by four copies of the same function

`crates/core/src/task.rs` has `with_priority`, `with_archived`, `with_created` and `with_done` (lines 176 to 331),
each with its own `is_<key>_line` predicate. `with_archived` and `with_created` differ only in the key. All of them
split the text into lines, find the end of the property lines with `props_end`, and insert or filter. A fifth
property Breccia writes (a due date, a scheduled date, an estimate: all natural next features for a task tool)
would be a fifth copy.

### M4: a single property editor

Add, next to `inline::properties`, one function that owns the rule "property lines directly after the first line":

```rust
/// `text` with property `key` set to `value` (the first such line is replaced, further ones removed, or the line is
/// added after the last property line), or with every `key` line removed (`None`).
pub(crate) fn with_property(text: &str, key: &str, value: Option<&str>) -> String
```

`with_priority` is this function. `with_archived`, `with_created` and `with_done` become "if absent, set" one-liners
on top of it and a `has_property(text, key)`. `props_end` and the four `is_*_line` helpers go. The tests in
`crates/core/tests/it/task.rs` pin the behaviour.

### M5: one way to find a block in `task.rs`

Eight methods in `task.rs` repeat `self.blocks.iter().find(|b| b.id == id).ok_or(EditError::UnknownBlock)?`, while
`edit.rs` has a private `Document::find`. Add `Document::block(&self, id) -> Result<&Block, EditError>` in
`outline.rs` and use it in both files (`replace_text` and `replace_keyword` too).

## T3: small layering slips in the format modules

The format modules (`outline`, `inline`, `naming`, `color`, `aliases`, `relink`, `task`, `render`) are the bottom
layer. Three things break that:

### M6: `color.rs` must not import the workspace

`color::own_color` (`color.rs:113`) takes a `workspace::Page`, so the lowest layer depends on the layer above it.
Move it to `workspace` as `Page::own_color(&self)`; `color.rs` then needs only `inline` and `outline`.

### M7: one reader for preamble property lines

`inline::title_line` (`inline.rs:221`) and `color::color_line` (`color.rs:130`) both skip the front matter by
counting its newlines and then scan `preamble.split('\n')` for a property with a given key. Extract
`inline::preamble_properties(preamble) -> impl Iterator<Item = (usize, String, String)>` and build both on it. The
line-terminator helper `content` also exists twice (`outline.rs:178`, `aliases.rs:7`); make the one in `outline`
`pub(crate)`.

### M8: tests at the end of `outline.rs`

`mod tests` sits at line 557, and `Carried` and `carry_ids` (the public re-read API) come after it at line 750. Move
the module to the end of the file, or move `carry_ids` into its own `outline/carry.rs` when B1 is fixed.

## T4: the core has no logging, only `eprintln!`

There are 21 `eprintln!` calls in the core and the shell (for example `fsio.rs:58` and `fsio.rs:64`). A release
build on Windows has no console, so every one of these messages is lost exactly where it is needed: on a user's
machine. `BRECCIA_TRACE` is a second, separate channel.

### M9: a log file

Use the `log` facade in the core (`log::warn!` instead of `eprintln!`) and one sink in the shell that writes to a
size-capped file in the app's data folder (`tauri-plugin-log`, or a few lines over `std::fs`). Route
`BRECCIA_TRACE` through the same facade at `trace` level. Add "Open log folder" to Settings or the `?` overlay
(this part is user-visible and needs the owner's yes). This is the precondition for diagnosing any bug report once
the app has users.
