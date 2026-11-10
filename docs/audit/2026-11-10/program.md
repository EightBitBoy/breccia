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

## T5: the workspace's bookkeeping is repeated at every call site

`Workspace` (`crates/core/src/workspace/mod.rs:315`) keeps five things in step by hand: the page map, the block
index, the link index with the alias table, the `touched` set and the version counters. Each operation that adds,
replaces or removes a page repeats the steps, so each new operation (merge two pages, a trash, block references)
is a new chance to forget one.

### M10: one `remove_page`

This sequence appears four times (`pages.rs:463` in `delete_page`, `pages.rs:571` in `delete_folder`,
`disk.rs:256` in `file_gone`, `disk.rs:352` in `adopt`):

```rust
if let Some(page) = self.pages.remove(key) {
    for b in &page.doc.blocks { self.block_index.remove(&b.id); }
}
self.unindex_page(key);
self.touched.insert(key.to_string());
```

Make it `fn take_page(&mut self, key: &str) -> Option<Page>` next to `insert` in `mod.rs` and call it from the four
places.

### M11: one way to replace a page's blocks in the block index

"Remove the old block ids, change the document, insert the new ids, mark touched, re-index" is written out in
`edit_with_config` (`mod.rs:713`), `reload` (`disk.rs:46`), `rekey` (`pages.rs:191`) and `insert` (`mod.rs:494`).
`reload` can be expressed through `edit_with_config` (the closure swaps the document and returns `Carried`); `rekey`
through `take_page` and `insert`.

### M12: change tracking as its own struct

`tree_version`, `link_version`, `topic_changes`, `touched` and `warned` are five fields of `Workspace` that exist
only so the session can ask "what changed since I last looked". Group them in a `Changes` struct with the `take_*`
methods; the 15-field `Workspace` becomes a store plus a change log, and the rule "who bumps what" is in one file.

### M13: fix the stray doc comment

`mod.rs:511`: the line "The pages with edits their files do not hold, by key." belongs to `unsaved` (line 520) but
sits on top of `matches_disk`'s doc comment.

## T6: four places decide what a page file is

Whether a path is a page file, and which page, is decided in `Workspace::open` (`mod.rs:380` to `403`, through
`list_md` and `walk_pages`), in `dir_appeared` (`disk.rs:374`, which repeats the journal loop of `open` line for
line), in `found_at` (`disk.rs:473`) and in `watch::relevant` (`watch.rs:22`). `watch.rs` also spells `"pages"`,
`"journals"` and `"breccia"` as literals while `workspace/mod.rs` has the constants `PAGES` and `JOURNALS`. A new
kind of file (templates, attachments, a `breccia/themes/*.css` from spec §7.10) has to be taught to all four.

### M14: one classifier for relative paths

Add to `workspace/files.rs`:

```rust
pub(crate) enum NotePath { Journal(NaiveDate), Page { folder: String, stem: String }, Config, Folder(String) }
pub(crate) fn classify(rel: &Path) -> Result<Option<NotePath>, LoadWarning>
```

`found_at` becomes a thin wrapper, `watch::relevant` asks it (keeping its own "might be a folder" rule), and the
journal loop shared by `open` and `dir_appeared` becomes one function `scan_journals(root, warnings) -> Vec<Found>`.
Export `PAGES`, `JOURNALS` and a `CONFIG_DIR` constant from one place and use them in `watch.rs`, `config.rs`
(`root.join("breccia").join("config.toml")` is written three times) and the Git code.

### M15: a path index for disk changes

`key_of_file` (`disk.rs:194`) and `gone_below` (`disk.rs:205`) scan every page for every changed path, and
`gone_below` also clones every page's folder name per path. A pull that changes 2,000 files in a folder of 5,000
pages is 10 million path comparisons on the main session lock. Keep a `HashMap<PathBuf, String>` (relative path to
key) beside the page map, maintained in `insert`, `take_page` and the three places that set `rel_path`. Measure
first with `crates/core/tests/it/scale.rs`; do it only if a large pull shows up in the trace.
