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

## T7: `Session::dispatch` is one 520-line `match`, and `Session` holds everything

`crates/core/src/session/mod.rs` is 1,392 lines. `dispatch` (lines 295 to 812) has an arm for each of about 60
commands. Most arms are one call, but ten hold their own logic inline (`folder.open`, `page.setColor`, `page.move`,
`page.reload`, `page.refs`, `board.get`, `config.setGit`, `config.setBoard`, `block.setText`, `block.settle`), and
rules that belong to all commands are applied arm by arm. `Session` itself has twelve fields: the workspace, undo,
the typing run, disk marks, the search index, Git dates, the config version, failed saves and the tree's link
lists. Spec §9 wants every action to be a named command that a plugin API can expose later; that needs a command
table that can be read, listed and extended without opening a 500-line function.

### M16: `dispatch` becomes a table of one-line arms

Move the inline logic of the ten arms into named methods (`page_set_color`, `page_move`, `block_set_text`, …) in
family files beside the ones that exist (`board.rs`, `journal.rs`, `search.rs`): `session/folder.rs`,
`session/page.rs`, `session/block.rs`, `session/config.rs`. `mod.rs` keeps `Session`, `run`, `dispatch` and the
shared plumbing (`mutate_tracked`, `save`, `note_save`, `page_output`). Target: no file over 600 lines, `dispatch`
under 150.

### M17: a command says what kind it is

Add `Command::kind(&self) -> Kind` with `Edit`, `Query` and `Background` (`files.changed`, `archive.auto`), next to
the enum in `command.rs`. `dispatch` then restores `self.typing` once, for every command that is not an `Edit`,
instead of in five arms. This fixes B5 and gives later code one place to ask the same question: whether a command
may run while a folder is read-only, whether it needs the generation check (today a second list, `folder_command`
at `mod.rs:298`), whether a plugin may call it.

### M18: settings validation belongs to the settings

The limits "at most 1440 minutes" (`mod.rs:567`) and "1 to 3650 days" (`mod.rs:588`) are checked inside
`dispatch`. `Config::check_states` and `Config::check_boards` already live in `config.rs`; add
`GitSettings::check` and `BoardSettings::check` there, so a hand-edited `config.toml` and the Settings screen are
held to the same limits (today a file with `pull_interval_minutes = 100000` loads without complaint).

### M19: error codes as one enum

`CommandError.code` is a `String` set from literals in six files: `stale`, `noFolder`, `folderMissing`, `create`,
`open`, `reload`, `config`, `configChanged`, `invalidBoard`, `invalidState`, `invalidSetting`, `unknownBoard`,
`unknownState`, `boardChanged`, `notFinished`, `unsaved`, `shellOnly`, `search`, `badDate`, `layout`, and those of
the two `From` impls in `view.rs`. The frontend branches on some of them. Make it `enum ErrorCode` with
`#[serde(rename_all = "camelCase")]`; the list of codes is then in one place and can be mirrored (or generated, see
the IPC theme of area 7) on the TypeScript side.

## T8: every command answers with the same bag of 26 optional fields

`Output` (`crates/core/src/session/view.rs:29`) carries, in one struct, two different things: what a command did to
the notes (`page`, `changed`, `removed`, `renamed`, `tree`, `notices`, `saved`, `focus`, `config`) and the answer
to a question (`refs`, `names`, `feed`, `pages`, `board`, `table`, `search`, `day`, `usage`, `usage_skipped`,
`graph`, `reach`, `git_log`, `archive`, `dirty`, `folder`, `git`). Nothing ties a command to the fields it fills:
the caller has to know that `page.renameReach` answers in `reach`. Each new query adds a field to every reply.
`Output::is_empty` has to serialise two values to find out whether anything is set.

### M20: split `Output` into effects and an answer

```rust
pub struct Output { pub effects: Effects, pub answer: Option<Answer> }
pub struct Effects { page, focus, changed, removed, renamed, tree, config, notices, saved }
#[serde(tag = "kind")] pub enum Answer { Refs(RefsView), Names(Vec<NameView>), Board(BoardView), … }
```

The shell emits events from `effects` only; the frontend's `run` returns the `answer` typed per command. This
changes the wire format, so it goes together with the frontend's `api.ts` and `types.ts` (area 7) and needs
`just e2e`. It is the largest move in the core and the one with the most value for adding features.

## T9: smaller structure and legibility findings in the session

### M21: do not render cards to find a drop position

`board::column_slots` (`board.rs:273`) calls `collect`, which builds a full `CardView` for every card of the
column, including `card_html` and a `BlockView` (rendered HTML) for each block of each card's subtree, and then
keeps only id, page and priority. Every drop on a board pays for rendering the whole target column. Split
`collect` into a cheap pass that finds the tasks (`TaskRef { index, state, parent, counts }`) and a second that
renders; `column_slots` uses only the first.

### M22: name the tuples

`ArchivedRow` (`board.rs:346`) is a four-field tuple read as `a.1`, `a.2`, `a.3`; `writes` in `place_card`
(`board.rs:493`) is `Vec<(BlockId, String, Option<u32>)>` read as `writes[0].2`; `typed_step`
(`mod.rs:57`) is `Option<(BlockId, String, Option<u64>)>`. Give each a small struct with named fields.

### M23: one place for date formats

The same display formats are written out in six places: `%-d %b` (`render.rs:411`, `render.rs:413`,
`board.rs:248`), `%-d %b %Y` (`board.rs:342`), `%A, %-d %b %Y` (`naming.rs:79`), `%B` (`tree.rs:125`), and the ISO
forms in `board.rs:358` to `392` and `task.rs`. Put the display ones in `naming.rs` (or a `display.rs`) as
`day_short`, `day_with_year`, `day_long`, `month_name`. They are English only today; one module is also where a
locale would go.

### M24: one rule for view types

Some workspace types serialise themselves (`StateUsage`, `PageColor`), others have a field-for-field copy in the
session that exists only to be serialised: `TagView` for `TagEntry` (`tree.rs:21`), `NameView` for `NameEntry`
(`view.rs:492`). Derive `Serialize` with `rename_all = "camelCase"` on `TagEntry` and `NameEntry` and delete the
copies and their conversion code. (`StateView`, `BoardSummary` and `GitSettingsView` stay: their sources are read
from TOML in snake_case.)

### M25: repair the test strings in `history.rs`

`rebase_changes_every_snapshot_of_the_page_and_its_size` (`history.rs:482` to `552`) has string literals broken
across lines with real newlines inside them (`doc("- 1⏎")`), which reads like a damaged paste and which `rustfmt`
cannot repair. Write them as `"- 1\n"` like every other test in the file. Also remove the doubled doc line at
`session/search.rs:319`.

## T10: small duplications in search and Git

No defect was found in `crates/core/src/search/` and `crates/core/src/git/`. The findings are repeats that make
the next change touch two places.

### M26: one set of Git helper functions

`busy_name` is written twice, identically (`git/engine.rs:159`, `git/sync.rs:162`). `failed` (`engine.rs:126`,
`sync.rs:146`) and `first_line` (`engine.rs:132`, `sync.rs:153`) exist twice with slightly different signatures.
Keep one of each: `Busy::name(self)` on the enum in `repo.rs`, `Problem::failed(&GitError)` and a single
`first_line(&str)` in `sync.rs`.

### M27: the problem's tag from serde, not from a second `match`

`Problem` (`git/sync.rs:53`) derives `Serialize` with `tag = "kind"`, and `ProblemView::of` (`git/view.rs:32`) maps
every variant to the same camelCase name again by hand. A new problem has to be added in both. Either give
`Problem` a `kind(&self) -> &'static str` that both use, or drop the derive on `Problem` (it is only ever sent as
`ProblemView`).

### M28: one damage recovery for the search index

"The file is damaged: delete it and open it again" is implemented three times: `SearchIndex::open`
(`search/mod.rs:67`), `IndexState::open` (`session/search.rs:222` to `227`) and `IndexState::recover`
(`session/search.rs:255`). The first two run back to back on the same error. Let `SearchIndex::open` only open
(and report damage), and keep the policy (delete once, then fall back to memory) in `IndexState` alone.

### M29: `parse_query` returns the typed links

`Session::run_query` (`session/search.rs:425` to `437`) parses the links of the query text a second time and
relies on `parse_query` having listed them in the same order with the same de-duplication, addressing its result
by position (`q.links.get_mut(seen.len() - 1)`). Let `Query` keep each link's typed target and kind
(`links: Vec<QueryLink { target, kind, keys }>`), so the session widens `keys` without parsing again.

### M30: test seams behind a feature

`GitEngine` carries three hooks that only tests set (`after_fetch`, `before_lock`, `before_rebase`,
`git/engine.rs:116` to `118`), public and `#[doc(hidden)]`. The integration tests are a separate crate, so
`#[cfg(test)]` does not work; a cargo feature `test-seams` (enabled by the core's dev-dependency on itself) keeps
them out of the shipped binary and out of the public API.

Also for M14 (one path classifier): `git/message.rs:50` to `58` is a fifth place that decides what
`pages/**.md`, `journals/*.md` and `breccia/config.toml` are.

## T11: the core's test files each rebuild the same helpers

`crates/core/tests/it/` is one test program of 40 modules and about 1,000 tests. This area was sampled, not read
in full: `main.rs`, `roundtrip.rs`, the helper sections of `session.rs` and `scale.rs`, and counts over all files.
The suite is strong (see `notes.md`). The structural finding is that the modules share nothing except
`gitenv/mod.rs`.

### M31: a shared `support` module

The same helper functions are defined again in many files: `put` (write a file under a temp root) in 17 files,
`clock` in 14, `open` in 12, `ok` in 12, `cmd` in 10, `read` in 8, `folder` in 7. They differ in small ways (a
fixed date here, a parameter there), which makes a test read differently depending on its file. Add
`tests/it/support/mod.rs` with `put`, `read`, `clock(ms)`, `folder(files) -> (TempDir, Session)`, `cmd`, `ok` and
`ids`, as `gitenv` already does for the Git tests, and delete the local copies file by file. No test changes.

### M32: run the scale tests on a schedule

`scale.rs` holds the performance bars of spec §8 (`scale_5000_pages`, `git_at_scale`) as `#[ignore]` tests that
print `ok` or `OVER`. Nothing runs them: not `just test`, not a workflow. A slow-down is found only when someone
remembers. Add a `just scale` recipe (release build, `--ignored --nocapture scale::`) that fails on an `OVER`
line, and say in `docs/STATUS.md` when it was last run; a weekly scheduled workflow is the fuller version.

## T12: the shell says "wiring only" and is one 960-line file with six jobs

`app/src-tauri/src/lib.rs` (1,476 lines, 515 of them tests) holds the event names and the event list of an
`Output`, the background index loop, the watcher start, the Tauri commands, the tray, the off-screen test hook and
the app setup. `git.rs` and `settings.rs` show the shape the rest should have.

### M33: split `lib.rs` by job

`events.rs` (the nine event-name constants, `events`, `emit_all`), `indexing.rs` (`index_in_background`,
`index_loop`, `progress_event`, `IndexEvent`), `watching.rs` (`start_watcher`), `commands.rs` (the `commands`
module, `shell_answer`, `git_log_answer`), `tray.rs`, `window.rs` (`offscreen_enabled`, `place_offscreen`,
`show_offscreen`, `show_inactive`, `window_state`), and `lib.rs` with `App`, `run` and the startup-folder code.
Each module takes its tests with it. The seven places that lock the session move to one helper (see B7).

### M34: one command for machine settings instead of one per field

`settings.json` is reached through nine Tauri commands: `ui_state`, `set_ui_state`, `set_theme`, `set_zoom`,
`set_journals_at`, `hidden_columns`, `set_hidden_columns`, `recent_folders`, `forget_folder`. `UiState`
(`lib.rs:52`) is used for reading and for writing, with three fields that `set_ui_state` documents as ignored
("`set_ui_state` never changes it"). Every new machine-local setting (spec §4 lists several; an update channel
and a log level are coming) costs a field in `Settings`, a field in `UiState`, a command, a handler entry, a
wrapper in `app/src/lib/api.ts` and a type. Replace the five field setters with `settings_get() -> Settings view`
and `settings_patch(patch: Map<String, Value>)`, where the patch is checked against the known keys in
`settings.rs`. Recent folders and hidden columns keep their own commands (they are lists with their own rules).

### M35: the Git commands the shell answers do not belong in the core's `Command`

`Command::GitStatus`, `GitSync`, `GitInit` and `GitLog` are variants of the core enum
(`crates/core/src/session/command.rs:248` to `260`) only so that the shell can parse them; the session refuses
them with `shellOnly` (`session/mod.rs:796`). `run_blocking` (`lib.rs:481`) therefore checks every request three
times: `git_log_answer`, `shell_answer`, then the session. Give the shell its own small enum
(`ShellCommand { GitStatus, GitSync, GitInit, GitLog { skip, limit } }`), parse a request as that first and as a
core `Request` otherwise, and delete the four variants and the `shellOnly` arm from the core. Together with M17
(a command says what kind it is), `writes_config` (`lib.rs:506`) and `opened` (`lib.rs:513`) can then ask the
command instead of listing variants in the shell.

## T13: `App.svelte` is the application's controller, and it cannot be tested

`app/src/App.svelte` is 1,839 lines; its script is 1,590. It holds about 45 pieces of state and 70 functions:
which view the main area shows, every dialog, the folder's settings and their versions, Back and Forward, the
folder switch, the board dialog's save rules, what a removed or renamed page means, and `apply`, the 120-line
function every command answer goes through. `CLAUDE.md` says "`App.svelte` has no unit-test harness. Put logic that
needs tests in `app/src/lib/`", and much has been moved (`route`, `nav`, `configWrite`, `followRename`, …). What is
left is the glue between those pieces, and the glue is where the rules are: only `just e2e` covers it.

Spec §9 says "Views register with the shell rather than being hard-wired". Today a new main view has to be added
in eight places (listed in M36).

### M36: one value says what the main area shows

Nine independent flags describe one fact: `page`, `journal.feed`, `boards.index`, `allPages.shown`,
`archiveView.shown`, `settings.shown`, `network.shown`, `gitLog.shown`, `newPageFolder`. Because any of them could
be set at once, the code keeps them exclusive by hand:

- `leaveMainView(keep)` (`App.svelte:711`) closes every other view, one `if (keep !== …)` per view;
- `placeHere` (`App.svelte:358`) reads all nine in priority order;
- `route` returns `leaveBoard`, `leaveAllPages`, `leaveSettings`, `leaveGraph`, `leaveGitLog`, `leaveArchive`
  (`App.svelte:627` to `632`);
- `restore` (`App.svelte:426`) has an `if` chain over the place kinds;
- the template (`App.svelte:1693` to `1824`) has the same chain again;
- the `$effect` at `App.svelte:751` lists six of them to end the untitled page;
- the `page:changed` handler (`App.svelte:1458`) asks each view in turn "is this yours?";
- `apply` clears each view for a new folder (`App.svelte:556` to `575`).

Replace them with one `$state` of a union type, `main: { kind: 'feed' } | { kind: 'page', key } | { kind: 'board',
index } | { kind: 'allPages' } | …`, and give the view classes that exist (`Journal`, `Boards`, `AllPages`,
`Archive`, `Network`, `GitLog`, `SettingsScreen`) one interface: `open()`, `close()`, `newFolder()`,
`changed(page, own): boolean`, `refresh()`. A `views` table maps the kind to its object. Leaving a view is then
`views[main.kind].close()`, and the six `leave…` results of `route` become one `leave: boolean`. `NavPlace` in
`lib/nav.ts` is already this union; use it as the state instead of deriving it.

### M37: one value says which overlay is open

`dialogOpen()` (`App.svelte:1053`) lists seven conditions (`naming`, `settingsFor`, `flows.dialog`, `closing`,
`settingUpGit`, `question`, `helpShown`), and `dialogOpen() || search.shown` is written at eight call sites, three
of them with `|| pickerOpen`. Model the overlays as one optional value (`overlay: null | { kind: 'search' } |
{ kind: 'help' } | { kind: 'confirm', … } | …`) with `canOpen()`; the four separate `ConfirmDialog` blocks in the
template (`App.svelte:1602` to `1616`) become one.

### M38: the folder's settings as a store in `lib/`

`states`, `boardList`, `archiveDays`, `autoArchiveOn`, `gitSettings`, `configVersion`, `lastConfig`,
`foreignVersion`, `settingsFor`, `settingsForName`, `settingsForVersion`, `boardSaving`, `settingWrites`, and the
functions `applyConfig`, `sendConfig`, `setDialogBoards`, `saveBoard`, `deleteBoard`, `newBoard`, `setStates`,
`setGit`, `setBoardSettings`, `moveBoardTo` (`App.svelte:513` to `539` and `937` to `1144`) are one subject: the
shared settings and the rule that a write carries the version it was made from. Move them into a
`ConfigStore` class in `lib/config.svelte.ts`, built like `Boards` or `Journal` (an `env` with `run`, `notify`,
`flush`), and test it with a fake `run`: the refusal after a hand edit, two quick writes, the board dialog that
follows its board by name. These are the most intricate rules in the file and have no unit test today.

### M39: the rest of the controller into `lib/`

After M36 to M38, move what remains of the behaviour into an `AppController` class in `lib/app.svelte.ts` with
the Tauri and DOM calls injected: `apply`, `go` and `restore`, `switchFolder`, `jumpTo`, `pageRemoved`,
`pageRenamed`, `clickGit`, the close handlers. `App.svelte` keeps the template, `onMount` wiring and the two DOM
handlers (`onAnchorClick`, `onPointerDown`). Target: a script under 300 lines. Do it in steps, each with
`just e2e` green.

### M40: small repeats in `App.svelte`

- Six `$effect` blocks do the same thing for a status item (`App.svelte:256`, `264`, `268`, `323`, `328`, `336`):
  compute an item, then `untrack(() => (item ? status.set(item) : status.clear(id)))`. Add
  `StatusItems.bind(id, () => item | null)`.
- The status bar's click handler is a four-way nested conditional on one line (`App.svelte:1837`); use a map from
  item id to handler.
- `host.reconcile(null).catch((e) => console.error('editor update failed', e))` is written three times
  (`App.svelte:654`, `1471`, `1484`).
- Two doc comments are stacked on the wrong declarations: `App.svelte:294` to `296` ("The shown board and its open
  card" sits above `hiddenCols`) and `App.svelte:394` to `399` (the comment of `go` sits above `going`).

## T14: the contract between the core and the frontend is kept in step by hand

`app/src/lib/types.ts` (574 lines) says in its first line that it "mirrors the wire contract of
crates/core/src/session (command.rs, view.rs)". Nothing checks it. The 63 command names are the same on both
sides today (compared for this audit), but a renamed field, a new `Output` field or a new error code compiles on
both sides and fails at run time, in a place only `just e2e` reaches. The same knowledge is written twice in three
more places:

- the nine event names: `app/src-tauri/src/lib.rs:26` to `38` and `app/src/api.ts:10` to `50`;
- which commands are queries: the restore list in `Session::dispatch` (see B5, M17) and `countsInFlight` in
  `app/src/lib/sync.ts:49`, a hand-written list of ten command names;
- the error codes: string literals in the core (M19) and string comparisons in the frontend (`'unknownPage'`,
  `'stale'`, `'configChanged'`, `'boardChanged'`).

### M41: a contract test now

Add a Vitest file that reads `crates/core/src/session/command.rs`, `view.rs` and `app/src-tauri/src/lib.rs` as
text (as `lib.rs` already does with `include_str!("../../e2e/smoke.mjs")`) and asserts: every
`#[serde(rename = "…")]` command name is a member of the `Command` union and the reverse; every event constant has
its twin; every field of `Output` (camelCased) is a key of the TypeScript `Output`. Cheap, and it turns silent
drift into a failing `just test`.

### M42: generate the types

The durable fix is to derive the TypeScript from the Rust types (`ts-rs` or `specta`: a derive on the view and
command structs, a test that writes `app/src/lib/generated.ts`, and `just lint` failing when the file is stale).
Do it together with M20 (split `Output`) and M19 (error codes as an enum), because those change the wire format
anyway; `Command::kind` (M17) is generated too, and `countsInFlight` reads it.

## T15: the frontend works hard to ignore events it asked the shell not to need

For every command the shell does two things with the same page: it returns it in the `Output`, and it emits it as
`page:changed` (`emit_all(app, &output, false)`, `app/src-tauri/src/lib.rs:546`). There is one window, so the
event tells the sender what its answer already said. A whole mechanism exists to recognise and drop these echoes:

- `InFlight` and `WhenIdle` (`app/src/lib/external.ts`) hold every shell event while a command runs;
- `Echoes` (`app/src/lib/echo.ts`) keeps the last eight pages as JSON strings and stringifies each arriving page
  to compare (`echo.bench.ts` exists to measure that cost);
- `route` collects `own` pages (`app/src/lib/route.ts`, ten `r.own.push` sites), and `Boards.changed`,
  `AllPages.changed`, `Archive.changed`, `Network.changed` each take an `own` flag;
- the shell depends on `serde_json`'s `preserve_order` feature and two tests so that the event's field order
  equals the answer's (`lib.rs:1027`, `lib.rs:1296`), and `CLAUDE.md` lists that as a lesson that keeps coming
  back;
- each page is turned to JSON three times per edit: once as a `serde_json::Value` for the event, once when the
  event is sent, once for the answer.

### M43: do not send a command's own pages back as events

Emit `page:changed`, `page:removed`, `page:renamed` and `tree:changed` only for runs that did not come from the
window's own command: the watcher and the Git thread (`from_watcher == true`). The answer already carries
everything, and `apply` already routes it. Then `Echoes`, `echo.ts`, `echo.bench.ts`, the `own` plumbing in
`route` and in the four `changed(p, own)` methods, the field-order tests and the `preserve_order` feature can go;
`InFlight` stays (an outside event must still wait for a running command). This is a decision about spec §9
("every change emits a named event"): when a second window or a plugin API comes, events for others can come back
with an `origin` field that says who caused them, which is a cleaner way to tell an echo than comparing JSON.

Before doing it, list every consumer that today relies on its own echo. The `page:changed` handler in
`App.svelte:1458` calls `search.refresh()` and `journal.changed(p)` before it asks whether the page is its own;
each such call needs a line in `apply` instead, or a test that shows it is not needed. `just e2e` is the gate.

### M44: one table says what each command is, checked by the compiler

Three functions in the frontend classify commands by listing names: `countsInFlight` (`lib/sync.ts:49`, ten
names on one 300-character line), `kindOf` (`lib/sync.ts:53`, with `default: return 'other'`), and
`setsStateOf` (`editor/host.svelte.ts:568`). A new command falls into the defaults without anyone deciding:
a new text-changing command would be `'other'` and the editor would not lock while it runs. Replace the first two
with one table typed `Record<Command['type'], { editor: Kind; query: boolean }>` (`satisfies` makes a missing
command a compile error). With M17 and M42 the `query` column comes from the core.

## T16: the frontend has no linter and no formatter, and components have no tests

### M45: format and lint TypeScript and Svelte

`just lint` runs `cargo fmt --check`, clippy with `-D warnings`, `svelte-check` and `tsc`. For the 23,000 lines of
TypeScript and Svelte there is no formatter and no linter (no Prettier, ESLint or Biome configuration in `app/`).
The Rust side is uniform; the frontend's style is held by hand, and it shows in lines such as `lib/sync.ts:50` and
`App.svelte:1837`. Add Prettier with `prettier-plugin-svelte` (settings that match what the code already does: no
semicolons, single quotes, 120 columns) and ESLint with `eslint-plugin-svelte` and `typescript-eslint`, both in
`just lint`. Format in one `chore` commit of its own so that `git blame` can skip it
(`.git-blame-ignore-revs`).

### M46: a way to test components

`app/src/lib/` has a test file for nearly every module (the exceptions: `dnd.ts`, `sigmaView.ts`, `dom.ts` and
`customColor.ts`, 727 lines together). `app/src/components/` has 4,300 lines and no test file; Vitest runs in the
`node` environment, so a component cannot be mounted. Whatever logic sits in a component is covered only by
`just e2e`. Either keep moving logic out (the larger ones: `PageColorGrid.svelte` 383 lines, `NetworkView.svelte`
350, `Board.svelte` 314, `StatesSection.svelte` 274, `Sidebar.svelte` 274, `LinkColorMenu.svelte` 245), or add
`@testing-library/svelte` with `jsdom` for a few component tests of keyboard handling and focus, which are the
parts users notice and e2e covers thinly. Decide which; today the rule exists only for `App.svelte`.

### M47: the editor's `typed` map only grows

`EditorHost.typed` (`app/src/editor/host.svelte.ts:60`) keeps the last text typed into every block for "Keep
mine". Entries leave only when a folder is opened or a typed text moves to another block. In a long session it
holds one string per block ever typed in. Drop an entry when its block's `block.setText` is answered and no
conflict notice for the block is open (the `NoticeCenter` knows), or cap it like `Echoes`.
