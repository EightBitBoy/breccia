//! The session behind the UI: one open notes folder, the named commands the
//! frontend sends, undo and redo per page, and saving after every edit.
//!
//! [`Session::run`] is the only place that knows the command names. Every
//! command that changes a page saves it right away; a failed save never
//! fails the command, it keeps the edit in memory and adds a
//! [`Notice::SaveFailed`].

mod batch;
mod board;
mod command;
mod graph;
mod history;
mod journal;
mod search;
mod table;
mod tree;
mod view;

use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};

pub use board::{ArchivedView, BoardView, CardView, ColumnView};
pub use command::{Clock, Command, CommandKind, Request, StateInput, StateRename};
pub use graph::{GraphNode, GraphView, NodePosition, layout_file_name};
pub use search::{DateView, IndexProgress, SEARCH_LIMIT, SearchGroup, SearchHit, SearchView};
pub use table::PageRowView;
use tree::LinkLists;
pub use tree::{JournalDay, JournalMonth, JournalYear, TagView, TreeNode, TreeView};
pub use view::{
    BlockView, BoardSummary, CommandError, ConfigView, DirtyView, FeedView, Focus, FolderView,
    GitSettingsView, NameView, Notice, Output, PageView, PageViewKind, RefGroup, RefView, RefsView,
    RenameView, SaveFailReason, StateUsage, StateView,
};

use crate::config::{BoardSettings, Config, ConfigError, Expect, GitSettings, State};
use crate::error::EditError;
use crate::naming::journal_name;
use crate::outline::{BlockId, Document, IdGen};
use crate::workspace::{ReloadError, SaveError, Workspace};
use history::{Histories, Typing};
use search::IndexState;

/// The open folder and everything the UI's commands need between calls.
#[derive(Default)]
pub struct Session {
    ws: Option<Workspace>,
    /// Goes up each time a folder is opened or created. Block IDs are only
    /// valid in the generation they were handed out in.
    generation: u64,
    history: Histories,
    /// The previous command, if it was a successful `block.setText`.
    typing: Option<Typing>,
    /// The block, page and undo step of the last `block.setText` that changed
    /// text: a `block.settle` on that block joins the step while it is still
    /// the page's newest.
    typed_step: Option<(BlockId, String, Option<u64>)>,
    /// Blocks another program changed or deleted since the UI last showed
    /// them. Typing into one keeps the user's text and reports both.
    marks: HashMap<BlockId, DiskMark>,
    /// The search index and the pages it still has to take in.
    search: IndexState,
    /// When Git first added each file (folder-relative path, ms), for the
    /// All pages "Created" column. Empty until the Git engine reports.
    git_created: HashMap<PathBuf, i64>,
    /// Goes up whenever `config.toml` is read again or written (`ConfigView.version`).
    config_version: u64,
    /// Pages whose last save failed.
    failed_saves: BTreeSet<String>,
    /// Pages of `failed_saves` saved since; `run` hands them on in `Output.saved`.
    saved_now: Vec<String>,
    /// The linked-only pages and tags in the tree last sent, to resend it
    /// only when they changed.
    link_lists: LinkLists,
}

/// `breccia/config.toml` as the watcher and the Git engine name it.
const CONFIG_REL: &str = "breccia/config.toml";

fn config_changed() -> CommandError {
    CommandError::new(
        "configChanged",
        "breccia/config.toml changed on disk, so this change was not saved. Breccia has read the new file; make the change again.",
    )
}

/// What [`Session::recover`] did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Recovery {
    /// The open folder was read again from disk; block ids of before are stale.
    Reopened { generation: u64 },
    /// Some page holds edits its file does not, so nothing was changed.
    Kept,
    /// No folder is open (none was, or it could not be opened again).
    NoFolder,
}

/// What a reload from disk did to a block the UI may still be editing.
enum DiskMark {
    /// The block's text on disk is now `theirs`.
    Changed { theirs: String },
    /// The block is gone from page `page`; `after` is the nearest earlier
    /// block that stayed.
    Removed {
        page: String,
        after: Option<BlockId>,
    },
}

/// A change to one page's document. It returns where the caret goes, if
/// anywhere. On failure the session puts the document back as it was.
type Op<'a> =
    Box<dyn FnOnce(&mut Document, &mut IdGen, &Config) -> Result<Option<Focus>, EditError> + 'a>;

impl Session {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn generation(&self) -> u64 {
        self.generation
    }

    /// The open folder, its generation and its `[git]` settings; `None`
    /// without a folder. The Git engine reads this under the lock.
    pub fn git_target(&self) -> Option<(PathBuf, u64, GitSettings)> {
        let ws = self.ws.as_ref()?;
        Some((ws.root.clone(), self.generation, ws.config.git.clone()))
    }

    /// Drains the keys of pages saved since the last call whose save had
    /// failed before (see [`Output::saved`]).
    pub fn take_saved(&mut self) -> Vec<String> {
        std::mem::take(&mut self.saved_now)
    }

    /// Keeps of `keys`, reported saved by a run of folder `generation`, those
    /// still saved now: none once another folder is open, and none whose save
    /// has failed again since. The Git engine reports its retried saves only
    /// at the end of a step, after a fetch and a push.
    pub fn retain_saved(&self, generation: u64, keys: &mut Vec<String>) {
        if generation != self.generation || self.ws.is_none() {
            keys.clear();
        } else {
            keys.retain(|k| !self.failed_saves.contains(k));
        }
    }

    /// Saves every page that holds edits its file does not, with no notices
    /// (the Git engine calls this before a commit, so a save that failed for
    /// a passing reason is not left out). Returns how many are still unsaved.
    pub fn retry_saves(&mut self) -> usize {
        let keys: Vec<String> = match self.ws.as_ref() {
            Some(ws) => ws.unsaved().iter().map(|p| p.key.clone()).collect(),
            None => return 0,
        };
        for key in &keys {
            let _ = self.save(key);
        }
        self.ws.as_ref().map_or(0, |ws| ws.unsaved().len())
    }

    /// Reads `breccia/config.toml` again if its text is not what the session
    /// last read or wrote. `Ok(Some)`: the new settings are in use. `Err`: it
    /// changed but cannot be read; the old settings stay, and `boards.set` is
    /// refused until it can, so the file is never written over.
    pub fn reload_config(&mut self) -> Result<Option<ConfigView>, String> {
        let Some(ws) = self.ws.as_mut() else {
            return Ok(None);
        };
        let text = Config::read_text(&ws.root).map_err(|e| e.to_string())?;
        if text == ws.config_text {
            return Ok(None);
        }
        let config = match &text {
            Some(t) => Config::parse(t).map_err(|e| e.to_string())?,
            None => Config::default(),
        };
        ws.config = config;
        ws.config_text = text;
        self.config_version += 1;
        Ok(Some(ConfigView::of(&ws.config, self.config_version)))
    }

    /// Refuses a change to `config.toml` made from settings that are not the
    /// file's current ones (spec §2, §4: Settings never writes over a newer
    /// file). The file is read again first, so a refusal leaves the session
    /// with the new settings; `version` is the one the request was made from.
    fn config_guard(&mut self, version: u64) -> Result<(), CommandError> {
        self.ws()?;
        match self.reload_config() {
            Ok(None) => {}
            Ok(Some(_)) => return Err(config_changed()),
            Err(message) => {
                return Err(CommandError::new(
                    "configChanged",
                    format_args!(
                        "breccia/config.toml changed on disk and cannot be read ({message}), so this change was not saved. Fix the file, then try again."
                    ),
                ));
            }
        }
        if version != self.config_version {
            return Err(config_changed());
        }
        Ok(())
    }

    /// Writes `config.toml` with `write`, over the text the guard read only: a
    /// save that landed since is refused (`configChanged`, and the new file is
    /// read), never written over (§2). Memory then holds what was written, so the
    /// next change is not taken for an outside one. If the written text does not
    /// parse, the old settings and text stay, so the next guard reads the file
    /// again and says why.
    fn write_config(
        &mut self,
        write: impl FnOnce(&Path, Expect<'_>) -> Result<String, ConfigError>,
    ) -> Result<(), CommandError> {
        let ws = self.ws()?;
        let written = match write(&ws.root, Expect::Text(ws.config_text.as_deref())) {
            Ok(written) => written,
            Err(ConfigError::Changed) => {
                // A file that cannot be read keeps the old settings; the next guard says why.
                let _ = self.reload_config();
                return Err(config_changed());
            }
            Err(e) => return Err(CommandError::new("config", e)),
        };
        self.config_version += 1;
        let ws = self.ws_mut()?;
        ws.config = Config::parse(&written).map_err(|e| CommandError::new("config", e))?;
        ws.config_text = Some(written);
        Ok(())
    }

    /// The dates Git first added each file, for the All pages table. Dates
    /// for another generation than the open folder's are ignored.
    pub fn set_git_created(&mut self, generation: u64, dates: HashMap<PathBuf, i64>) {
        if generation == self.generation {
            self.git_created = dates;
        }
    }

    /// Runs one command. A request from another generation is refused with
    /// `stale`, except the `folder.*` commands.
    pub fn run(&mut self, req: Request, clock: Clock) -> Result<Output, CommandError> {
        let before = self.tree_state();
        let mut out = self.dispatch(req, clock)?;
        out.saved = self.take_saved();
        self.resend_journals(&mut out, before.map(|b| b.0));
        if let Some(ws) = self.ws.as_mut() {
            out.notices
                .extend(ws.take_alias_warnings().iter().map(Notice::load_warning));
        }
        // The tree travels with any command that changed it: a page file or
        // folder, or the linked-only pages.
        if let (Some((g, v, l)), Some((g2, v2, l2)), Some(ws)) =
            (before, self.tree_state(), self.ws.as_ref())
            && g == g2
            && out.tree.is_none()
        {
            if v != v2 || l != l2 {
                let lists = LinkLists::of(ws);
                if v != v2 || lists != self.link_lists {
                    out.tree = Some(TreeView::with(ws, &lists));
                    self.link_lists = lists;
                }
            }
        } else if out.tree.is_some()
            && let Some(ws) = self.ws.as_ref()
        {
            self.link_lists = LinkLists::of(ws);
        }
        Ok(out)
    }

    /// Journal days with a block whose topic's color, existence or alias
    /// changed travel with the command, unless the folder was switched
    /// (the changes then belong to another folder, or to a fresh one).
    fn resend_journals(&mut self, out: &mut Output, before: Option<u64>) {
        let generation = self.generation;
        let Some(ws) = self.ws.as_mut() else {
            return;
        };
        let changes = ws.take_topic_changes();
        if before != Some(generation) || changes.is_empty() {
            return;
        }
        for key in ws.journals_linking(&changes) {
            let sent = out.page.as_ref().is_some_and(|p| p.key == key)
                || out.changed.iter().any(|p| p.key == key)
                || out.removed.contains(&key);
            if let (false, Some(page)) = (sent, ws.page(&key)) {
                out.changed.push(PageView::of(page, ws));
            }
        }
    }

    /// The generation, tree version and link version, while a folder is open.
    fn tree_state(&self) -> Option<(u64, u64, u64)> {
        self.ws
            .as_ref()
            .map(|ws| (self.generation, ws.tree_version(), ws.link_version()))
    }

    /// Runs a command, then puts the typing run back when the command's kind
    /// says it is not an edit: queries always, `archive.auto` always and
    /// `files.changed` when it reported nothing. Edits end the run.
    fn dispatch(&mut self, req: Request, clock: Clock) -> Result<Output, CommandError> {
        let typing = self.typing;
        let kind = req.command.kind();
        let files_changed = matches!(req.command, Command::FilesChanged { .. });
        let result = self.execute(req, clock);
        let keep = match kind {
            CommandKind::Query => true,
            CommandKind::Background if files_changed => result.as_ref().is_ok_and(|out| {
                // The watcher reports Breccia's own saves too: a report that
                // changed nothing leaves the typing run as it was.
                out.notices.is_empty() && out.changed.is_empty() && out.removed.is_empty()
            }),
            CommandKind::Background => true,
            CommandKind::Edit => false,
        };
        if keep {
            self.typing = typing;
        }
        result
    }

    fn execute(&mut self, req: Request, clock: Clock) -> Result<Output, CommandError> {
        // Only a `block.setText` right after another one can coalesce.
        let typing = self.typing.take();
        let folder_command = matches!(
            req.command,
            Command::FolderOpen { .. }
                | Command::FolderCreate { .. }
                | Command::FolderStatus
                | Command::FolderTree
        );
        if !folder_command && req.generation != self.generation {
            return Err(CommandError::new(
                "stale",
                format_args!(
                    "request is for generation {}, the session is at {}",
                    req.generation, self.generation
                ),
            ));
        }
        let today = clock.today;
        let now = clock.now();
        match req.command {
            Command::FolderOpen { path } => {
                self.refuse_unsaved_switch()?;
                // A folder deleted (or a file) never opens as an empty phantom folder.
                if !path.is_dir() {
                    return Err(CommandError::new(
                        "folderMissing",
                        format_args!("This folder no longer exists: {}", path.display()),
                    ));
                }
                self.open_folder(&path)
            }
            Command::FolderCreate { path } => {
                self.refuse_unsaved_switch()?;
                let ws = Workspace::create(&path).map_err(|e| CommandError::new("create", e))?;
                Ok(self.replace_folder(ws, Vec::new()))
            }
            Command::FolderStatus => Ok(Output {
                folder: Some(self.folder_view()),
                ..Output::default()
            }),
            Command::FolderTree => Ok(Output {
                tree: Some(TreeView::of(self.ws()?)),
                ..Output::default()
            }),
            Command::PageCreate { name, folder } => {
                let key = self.ws_mut()?.create_page(&name, &folder)?;
                self.page_output(&key, None, Vec::new())
            }
            Command::DirCreate { path } => {
                self.ws_mut()?.create_folder(&path)?;
                Ok(Output::default())
            }
            Command::PageRename { key, name } => {
                self.load_linked(&key)?;
                let out = self.rename_page(&key, &name)?;
                if let Some(page) = &out.page {
                    self.rekey_marks(&key, &page.key);
                }
                Ok(out)
            }
            Command::PageSetColor { key, color } => {
                self.load_linked(&key)?;
                let (preamble, create) = self.ws()?.color_change(&key, color.as_deref())?;
                let out = self.mutate(
                    &key,
                    false,
                    Box::new(move |d, _, _| {
                        d.set_preamble(&preamble)?;
                        Ok(None)
                    }),
                )?;
                if !create {
                    return Ok(out);
                }
                // `mutate` skips the blank page without a file; a page with a
                // color gets its file now.
                let result = self.ws_mut()?.create_file(&key);
                let mut notices = out.notices;
                notices.extend(self.note_save(&key, result));
                self.page_output(&key, None, notices)
            }
            Command::PageMove { key, folder } => {
                // A page only linked to is made in memory first, as for a rename.
                self.load_linked(&key)?;
                let create = self.ws_mut()?.move_page(&key, &folder)?;
                self.history.remove(&key);
                // A new `title::` line is written here; a page without a file
                // gets its file, empty if it is blank.
                let notices = if create {
                    let result = self.ws_mut()?.create_file(&key);
                    self.note_save(&key, result)
                } else {
                    self.save(&key)
                };
                self.page_output(&key, None, notices)
            }
            Command::PageDelete { key } => {
                self.ws_mut()?.delete_page(&key)?;
                self.history.remove(&key);
                Ok(Output {
                    removed: vec![key],
                    ..Output::default()
                })
            }
            Command::DirRename { path, to } => {
                self.ws_mut()?.rename_folder(&path, &to)?;
                Ok(Output::default())
            }
            Command::DirDelete { path } => {
                let removed = self.ws_mut()?.delete_folder(&path)?;
                for key in &removed {
                    self.history.remove(key);
                }
                Ok(Output {
                    removed,
                    ..Output::default()
                })
            }
            Command::ConfigGet => Ok(Output {
                config: Some(ConfigView::of(&self.ws()?.config, self.config_version)),
                ..Output::default()
            }),
            Command::PageToday => self.open_page(&journal_name(today), false),
            Command::PageShow { key } => {
                if self.ws()?.page(&key).is_none() {
                    return Err(CommandError::unknown_page(&key));
                }
                self.open_page(&key, false)
            }
            Command::PageOpen { name, link } => self.open_page(&name, link),
            Command::PageGet { key } => {
                let out = self.page_output(&key, None, Vec::new())?;
                self.acknowledge_page(&key);
                Ok(out)
            }
            Command::JournalFeed => self.journal_feed(today),
            Command::PagesGet { keys } => self.pages_get(&keys),
            Command::PagesTable => Ok(Output {
                table: Some(PageRowView::all(self.ws()?, &self.git_created)),
                ..Output::default()
            }),
            Command::GraphGet => {
                let ws = self.ws()?;
                let mut graph = GraphView::of(ws);
                if let Some(dir) = self.search.cache_dir() {
                    graph.load_layout(&dir.join(layout_file_name(&ws.root)));
                }
                Ok(Output {
                    graph: Some(graph),
                    ..Output::default()
                })
            }
            Command::GraphSaveLayout { positions } => {
                let root = self.ws()?.root.clone();
                if let Some(dir) = self.search.cache_dir() {
                    graph::save_layout(&dir.join(layout_file_name(&root)), &positions)?;
                }
                Ok(Output::default())
            }
            Command::PageReload { key } => {
                let reloaded = self.ws_mut()?.reload(&key).map_err(|e| match e {
                    ReloadError::UnknownPage(_) => CommandError::unknown_page(&key),
                    e => CommandError::new("reload", e),
                })?;
                self.history.remove(&key);
                self.rekey_marks(&key, &reloaded.key);
                self.acknowledge_page(&reloaded.key);
                let notices = reloaded.warning.iter().map(Notice::load_warning).collect();
                let mut out = self.page_output(&reloaded.key, None, notices)?;
                if reloaded.key != key {
                    out.removed = vec![key];
                }
                Ok(out)
            }
            Command::PageRefs { key } => {
                let ws = self.ws()?;
                ws.page(&key)
                    .ok_or_else(|| CommandError::unknown_page(&key))?;
                let refs = RefsView::of(ws, &key);
                for g in &refs.groups {
                    for r in &g.refs {
                        for b in &r.blocks {
                            self.marks.remove(&b.id);
                        }
                    }
                }
                Ok(Output {
                    refs: Some(refs),
                    ..Output::default()
                })
            }
            Command::PageRenameReach { key, name } => {
                self.load_linked(&key)?;
                let ws = self.ws()?;
                ws.page(&key)
                    .ok_or_else(|| CommandError::unknown_page(&key))?;
                Ok(Output {
                    reach: Some(ws.rename_reach(&key, &name)),
                    ..Output::default()
                })
            }
            Command::BoardGet { index } => {
                let board = BoardView::of(self.ws()?, index).ok_or_else(|| {
                    CommandError::new("unknownBoard", format_args!("unknown board: {index}"))
                })?;
                for c in &board.columns {
                    for card in &c.cards {
                        for b in &card.blocks {
                            self.marks.remove(&b.id);
                        }
                    }
                }
                Ok(Output {
                    board: Some(board),
                    ..Output::default()
                })
            }
            Command::ArchiveList => Ok(Output {
                archive: Some(board::archived_tasks(self.ws()?)),
                ..Output::default()
            }),
            Command::BoardPlace {
                id,
                keyword,
                before,
            } => self.place_card(id, &keyword, before, now),
            Command::JournalAppend { text } => self.journal_append(now, text),
            Command::BoardArchive { keyword } => self.archive_finished(&keyword, now),
            Command::ArchiveAuto { editing } => self.auto_archive(now, editing),
            Command::BoardsSet { boards, version } => {
                // The list was made from the boards the session knows. If the
                // file changed since (a pull, an editor), writing it would put
                // them back over the new ones (spec §2).
                self.config_guard(version)?;
                self.ws()?
                    .config
                    .check_boards(&boards)
                    .map_err(|e| CommandError::new("invalidBoard", e))?;
                self.write_config(|root, expect| Config::write_boards(root, expect, &boards))?;
                self.config_output()
            }
            Command::StatesUsage => {
                let ws = self.ws()?;
                Ok(Output {
                    usage: Some(ws.state_usage()),
                    usage_skipped: Some(ws.skipped_count()),
                    ..Output::default()
                })
            }
            Command::StatesSet {
                states,
                renames,
                version,
            } => self.states_set(states, renames, version),
            Command::ConfigSetGit {
                enabled,
                commit_delay_minutes,
                pull_interval_minutes,
                version,
            } => {
                const DAY: u32 = 1440;
                if commit_delay_minutes > DAY || pull_interval_minutes > DAY {
                    return Err(CommandError::new(
                        "invalidSetting",
                        "the minutes must be at most 1440 (one day)",
                    ));
                }
                self.config_guard(version)?;
                let git = GitSettings {
                    enabled,
                    commit_delay_minutes,
                    pull_interval_minutes,
                };
                self.write_config(|root, expect| Config::write_git(root, expect, &git))?;
                self.config_output()
            }
            Command::ConfigSetBoard {
                archive_after_days,
                auto_archive,
                version,
            } => {
                if !(1..=3650).contains(&archive_after_days) {
                    return Err(CommandError::new(
                        "invalidSetting",
                        "archive after days must be between 1 and 3650",
                    ));
                }
                self.config_guard(version)?;
                let current = self.ws()?.config.board.auto_archive;
                let board = BoardSettings {
                    archive_after_days,
                    auto_archive: auto_archive.unwrap_or(current),
                };
                self.write_config(|root, expect| {
                    Config::write_board_settings(root, expect, &board)
                })?;
                self.config_output()
            }
            Command::PagesList => Ok(Output {
                names: Some(
                    self.ws()?
                        .page_names()
                        .into_iter()
                        .map(NameView::of)
                        .collect(),
                ),
                ..Output::default()
            }),
            Command::PageOverwrite { key } => {
                let ws = self.ws_mut()?;
                if ws.page(&key).is_none() {
                    return Err(CommandError::unknown_page(&key));
                }
                let result = ws.save_overwrite(&key);
                let notices = self.note_save(&key, result);
                self.page_output(&key, None, notices)
            }

            Command::BlockInsert { page, after, text } => self.mutate(
                &page,
                false,
                Box::new(move |d, ids, _| {
                    let id = d.insert_after(after, &text, ids)?;
                    Ok(Some(caret_at_end(d, id)))
                }),
            ),
            Command::BlockSetText { id, text } => {
                if let Some(out) = self.set_text_on_marked(id, &text)? {
                    return Ok(out);
                }
                let key = self.page_of(id)?;
                let coalesce = typing.is_some_and(|t| t.continues(id, clock.ms));
                // `set_text` fails only before it changes anything, so a
                // coalesced call needs no snapshot.
                let (out, changed) = self.mutate_tracked(
                    &key,
                    coalesce,
                    // Text that became several blocks moves the caret to the
                    // end of the last one, so the editor follows the split.
                    Box::new(move |d, ids, _| {
                        let extras = d.set_text(id, &text, ids)?;
                        Ok(extras.last().map(|&last| caret_at_end(d, last)))
                    }),
                )?;
                // A run of typing starts with a change that recorded a step;
                // typing that changes nothing does not start one.
                if changed {
                    self.typing = Some(Typing { id, ms: clock.ms });
                    self.typed_step = Some((id, key.clone(), self.history.newest_seq(&key)));
                }
                Ok(out)
            }
            Command::BlockSettle { id, before } => {
                let key = self.page_of(id)?;
                let ws = self.ws()?;
                let page = ws
                    .page(&key)
                    .ok_or_else(|| CommandError::unknown_page(&key))?;
                let settled = page
                    .doc
                    .settled_text(id, before.as_deref(), &ws.config, now)?;
                if settled.is_none() {
                    return self.page_output(&key, None, Vec::new());
                }
                // The lines join the typing that gave or took the state while
                // that is still the page's newest step: one undo takes both.
                let coalesce = self.typed_step.as_ref().is_some_and(|(t, k, seq)| {
                    *t == id && *k == key && seq.is_some() && *seq == self.history.newest_seq(&key)
                });
                self.mutate(
                    &key,
                    coalesce,
                    Box::new(move |d, _, cfg| {
                        d.settle_state(id, before.as_deref(), cfg, now)?;
                        Ok(None)
                    }),
                )
            }
            Command::BlockSplit { id, at } => {
                let key = self.page_of(id)?;
                self.mutate(
                    &key,
                    false,
                    Box::new(move |d, ids, _| {
                        let new = d.split(id, at, ids)?;
                        Ok(Some(Focus { id: new, at: 0 }))
                    }),
                )
            }
            Command::BlockMerge { id } => {
                let key = self.page_of(id)?;
                self.mutate(
                    &key,
                    false,
                    Box::new(move |d, ids, _| {
                        let (prev, at) = d.merge_into_previous(id, ids)?;
                        Ok(Some(Focus { id: prev, at }))
                    }),
                )
            }
            Command::BlockPaste { id, at, text } => {
                let key = self.page_of(id)?;
                self.mutate(
                    &key,
                    false,
                    Box::new(move |d, ids, _| {
                        let r = d.paste(id, at, &text, ids)?;
                        Ok(Some(Focus {
                            id: r.last,
                            at: r.at,
                        }))
                    }),
                )
            }
            Command::BlockCycleState { id } => {
                let key = self.page_of(id)?;
                self.mutate(
                    &key,
                    false,
                    Box::new(move |d, _, cfg| d.cycle_state(id, cfg, now).map(|_| None)),
                )
            }

            Command::BlockStepState { id } => {
                let key = self.page_of(id)?;
                self.mutate(
                    &key,
                    false,
                    Box::new(move |d, _, cfg| d.step_state(id, cfg, now).map(|_| None)),
                )
            }

            Command::BlocksSetState { ids, keyword } => {
                let key = self.page_of_selection(&ids)?;
                self.mutate(
                    &key,
                    false,
                    Box::new(move |d, _, cfg| {
                        for id in batch::all(d, &ids)? {
                            d.set_state(id, keyword.as_deref(), cfg, now)?;
                        }
                        Ok(None)
                    }),
                )
            }
            Command::BlocksSetArchived { ids, archived } => {
                let key = self.page_of_selection(&ids)?;
                self.mutate(
                    &key,
                    false,
                    Box::new(move |d, _, _| {
                        for id in batch::all(d, &ids)? {
                            d.set_archived(id, archived, now)?;
                        }
                        Ok(None)
                    }),
                )
            }
            Command::BlocksIndent { ids } => self.on_roots(&ids, false, Document::indent),
            Command::BlocksOutdent { ids } => self.on_roots(&ids, false, Document::outdent),
            Command::BlocksMoveUp { ids } => self.on_roots(&ids, false, Document::move_up),
            Command::BlocksMoveDown { ids } => self.on_roots(&ids, true, Document::move_down),
            Command::BlocksDelete { ids } => self.on_roots(&ids, false, Document::delete),

            Command::HistoryUndo { page } => self.step_history(&page, false),
            Command::HistoryRedo { page } => self.step_history(&page, true),

            Command::FilesChanged { paths } => self.files_changed(&paths),
            Command::SearchQuery { text } => self.run_query(&text, clock.today),
            Command::JournalDay { key } => self.journal_day(&key, clock.today),
            Command::GitStatus | Command::GitSync | Command::GitInit | Command::GitLog { .. } => {
                Err(CommandError::new(
                    "shellOnly",
                    "git commands are answered by the app shell, not the session",
                ))
            }
            Command::SessionDirty => Ok(Output {
                dirty: Some(
                    self.ws
                        .as_ref()
                        .map(|ws| ws.unsaved().into_iter().map(DirtyView::of).collect())
                        .unwrap_or_default(),
                ),
                ..Output::default()
            }),
        }
    }

    fn ws(&self) -> Result<&Workspace, CommandError> {
        self.ws.as_ref().ok_or_else(CommandError::no_folder)
    }

    fn ws_mut(&mut self) -> Result<&mut Workspace, CommandError> {
        self.ws.as_mut().ok_or_else(CommandError::no_folder)
    }

    fn config_output(&self) -> Result<Output, CommandError> {
        Ok(Output {
            config: Some(ConfigView::of(&self.ws()?.config, self.config_version)),
            ..Output::default()
        })
    }

    /// Switching folders drops the open pages from memory, so it is refused
    /// while any of them holds text its file does not.
    fn refuse_unsaved_switch(&self) -> Result<(), CommandError> {
        let Some(ws) = self.ws.as_ref() else {
            return Ok(());
        };
        let titles: Vec<&str> = ws.unsaved().iter().map(|p| p.name.as_str()).collect();
        if titles.is_empty() {
            return Ok(());
        }
        Err(CommandError::new(
            "unsaved",
            format_args!(
                "Breccia did not switch folders: changes to {} could not be saved. Resolve the notices first (Reload from disk or Keep mine), or copy the text.",
                titles.join(", ")
            ),
        ))
    }

    /// `states.set`: the guard, the checks, the config write, then the rename of
    /// each changed keyword in the notes. A failure before the write changes nothing.
    fn states_set(
        &mut self,
        inputs: Vec<StateInput>,
        renames: Vec<StateRename>,
        version: u64,
    ) -> Result<Output, CommandError> {
        self.config_guard(version)?;
        let invalid = |e: String| CommandError::new("invalidState", e);
        let ws = self.ws()?;
        let new: Vec<State> = inputs
            .into_iter()
            .map(|s| State {
                keyword: s.keyword,
                color: s.color,
                finished: s.finished,
                in_cycle: s.in_cycle,
            })
            .collect();
        // The current states under their new keywords, so a colour already in
        // the file is accepted even if it is not in the palette.
        let current: Vec<State> = ws
            .config
            .states
            .iter()
            .map(|s| {
                let mut s = s.clone();
                if let Some(r) = renames.iter().find(|r| r.from == s.keyword) {
                    s.keyword = r.to.clone();
                }
                s
            })
            .collect();
        Config::check_states(&new, &current).map_err(|e| invalid(e.to_string()))?;
        for (i, r) in renames.iter().enumerate() {
            let ok = ws.config.state(&r.from).is_some()
                && !new.iter().any(|s| s.keyword == r.from)
                && new.iter().any(|s| s.keyword == r.to)
                && ws.config.state(&r.to).is_none()
                && !renames[..i]
                    .iter()
                    .any(|p| p.from == r.from || p.to == r.to);
            if !ok {
                return Err(invalid(format!("cannot rename {} to {}", r.from, r.to)));
            }
        }
        let pairs: Vec<(String, String)> = renames
            .iter()
            .map(|r| (r.from.clone(), r.to.clone()))
            .collect();
        self.write_config(|root, expect| Config::write_states(root, expect, &new, &pairs))?;
        let ws = self.ws_mut()?;
        let mut rewritten: Vec<String> = Vec::new();
        let mut notices: Vec<Notice> = Vec::new();
        for r in &renames {
            let report = ws.rename_state(&r.from, &r.to);
            for key in report.rewritten {
                if !rewritten.contains(&key) {
                    rewritten.push(key);
                }
            }
            for (key, e) in &report.save_errors {
                notices.push(Notice::save_failed(key, e));
            }
        }
        // A rename is not an undo step: undo across it would bring the old
        // keyword back over the new config.
        for key in &rewritten {
            self.history.remove(key);
        }
        let ws = self.ws.as_ref().ok_or_else(CommandError::no_folder)?;
        self.marks.retain(|&id, m| match m {
            DiskMark::Changed { .. } => ws
                .locate(id)
                .is_none_or(|(p, _)| !rewritten.contains(&p.key)),
            DiskMark::Removed { page, .. } => !rewritten.contains(page),
        });
        let changed = rewritten
            .iter()
            .filter_map(|k| ws.page(k))
            .map(|p| PageView::of(p, ws))
            .collect();
        Ok(Output {
            config: Some(ConfigView::of(&ws.config, self.config_version)),
            changed,
            notices,
            ..Output::default()
        })
    }

    fn folder_view(&self) -> FolderView {
        FolderView {
            path: self.ws.as_ref().map(|ws| ws.root.clone()),
            generation: self.generation,
        }
    }

    fn open_folder(&mut self, path: &Path) -> Result<Output, CommandError> {
        let (ws, warnings) = Workspace::open(path).map_err(|e| CommandError::new("open", e))?;
        let notices = warnings.iter().map(Notice::load_warning).collect();
        Ok(self.replace_folder(ws, notices))
    }

    /// Puts the session back on its feet after an internal error (a panic)
    /// left it in an unknown state. The files are the truth and every edit is
    /// saved at once, so the open folder is read again from disk, as
    /// `folder.open` does: a new generation, a fresh undo history. A session
    /// holding edits its files do not is kept as it is (`Kept`): reading the
    /// disk would drop them. A folder that cannot be opened again leaves the
    /// session with no folder.
    ///
    /// It is the two steps [`Session::begin_recovery`] and [`Session::reopen`];
    /// a caller that guards against a panic in either runs them one by one.
    pub fn recover(&mut self) -> Recovery {
        if self.begin_recovery() {
            return Recovery::Kept;
        }
        self.reopen()
    }

    /// The first step of [`Session::recover`]: ends the typing run, and
    /// answers whether some page holds edits its file does not. If so, the
    /// session must be kept as it is.
    pub fn begin_recovery(&mut self) -> bool {
        self.typing = None;
        self.typed_step = None;
        self.ws.as_ref().is_some_and(|ws| !ws.unsaved().is_empty())
    }

    /// The second step of [`Session::recover`], only once
    /// [`Session::begin_recovery`] answered false: reads the open folder
    /// again from disk.
    pub fn reopen(&mut self) -> Recovery {
        let Some(ws) = self.ws.as_ref() else {
            return Recovery::NoFolder;
        };
        let root = ws.root.clone();
        // As `folder.open`: a folder that is gone never opens as an empty one.
        let opened = if root.is_dir() {
            Workspace::open(&root).map_err(|e| e.to_string())
        } else {
            Err("it no longer exists".to_string())
        };
        match opened {
            Ok((ws, warnings)) => {
                // Logged, not shown: the window gets the recovery's own notice.
                let notices = warnings.iter().map(Notice::load_warning).collect();
                for notice in self.replace_folder(ws, notices).notices {
                    log::warn!("recovery: {notice:?}");
                }
                Recovery::Reopened {
                    generation: self.generation,
                }
            }
            Err(e) => {
                log::error!("recovery: the notes folder could not be opened again: {e}");
                self.reset();
                Recovery::NoFolder
            }
        }
    }

    /// Replaces the session with a fresh one without a folder. The search
    /// cache directory stays, and the generation and config version move on,
    /// so no request or settings write of before is taken for a current one.
    pub fn reset(&mut self) {
        let search = match self.search.cache_dir() {
            Some(dir) => IndexState::with_cache(dir.to_path_buf()),
            None => IndexState::default(),
        };
        *self = Session {
            search,
            generation: self.generation + 1,
            config_version: self.config_version + 1,
            ..Session::default()
        };
    }

    /// Switches to another folder; block IDs of the old one become stale.
    fn replace_folder(&mut self, ws: Workspace, mut notices: Vec<Notice>) -> Output {
        self.ws = Some(ws);
        self.generation += 1;
        // A config write made from the previous folder's settings never passes.
        self.config_version += 1;
        self.history.clear();
        self.marks.clear();
        self.git_created.clear();
        self.failed_saves.clear();
        self.saved_now.clear();
        notices.extend(self.open_index());
        Output {
            folder: Some(self.folder_view()),
            notices,
            ..Output::default()
        }
    }

    /// Renames a page and rewrites the links to it. Rename is not an undo
    /// step: undo across it would make files and links disagree, so the
    /// history of every page it touched goes.
    /// A page that is only linked to (no file, not open) is made in memory,
    /// as a click on a link makes it, so it can be renamed.
    fn load_linked(&mut self, key: &str) -> Result<(), CommandError> {
        let ws = self.ws_mut()?;
        if ws.page(key).is_some() {
            return Ok(());
        }
        if let Some((_, name)) = ws.link_targets().into_iter().find(|(k, _)| k == key) {
            ws.ensure_page(&name)?;
        }
        Ok(())
    }

    fn rename_page(&mut self, key: &str, name: &str) -> Result<Output, CommandError> {
        let report = self.ws_mut()?.rename_page(key, name)?;
        // The page's file now has the new key: a failed save is tracked under that key from here on, and the
        // notice for the old key is done. If the rename's own save fails again, the notice just moves from the old
        // key to the new one (below): the page is never reported saved while that new notice stands.
        if report.key != key && self.failed_saves.remove(key) {
            self.saved_now.push(key.to_string());
        }
        for k in [key, report.key.as_str()]
            .into_iter()
            .chain(report.rewritten.iter().map(String::as_str))
        {
            self.history.remove(k);
        }
        // Only pages the rename really saved count as saved; a failed save is tracked and gets its notice.
        let mut notices: Vec<Notice> = Vec::new();
        for k in &report.saved {
            self.note_save(k, Ok(()));
        }
        for (k, e) in &report.save_errors {
            notices.push(self.note_failed_save(k, e));
        }
        if report.skipped > 0 {
            notices.push(Notice::Refused {
                message: format!("{} links could not be updated", report.skipped),
            });
        }
        let mut out = self.page_output(&report.key, None, notices)?;
        let ws = self.ws()?;
        out.changed = report
            .rewritten
            .iter()
            .filter(|k| **k != report.key)
            .filter_map(|k| ws.page(k))
            .map(|p| PageView::of(p, ws))
            .collect();
        Ok(out)
    }

    fn open_page(&mut self, name: &str, link: bool) -> Result<Output, CommandError> {
        let ws = self.ws_mut()?;
        let key = if link {
            ws.open_link(name)?
        } else {
            ws.ensure_page(name)?
        };
        let out = self.page_output(&key, None, Vec::new())?;
        self.acknowledge_page(&key);
        Ok(out)
    }

    /// Applies changes other programs made to files. Pages with unsaved
    /// edits are left alone and get a `saveFailed` notice; reloaded pages
    /// lose their history and mark the blocks that changed or went.
    fn files_changed(&mut self, paths: &[PathBuf]) -> Result<Output, CommandError> {
        let config_path = Path::new(CONFIG_REL);
        let config_touched = paths.iter().any(|p| p == config_path);
        let paths: Vec<PathBuf> = paths
            .iter()
            .filter(|p| *p != config_path)
            .cloned()
            .collect();
        let ws = self.ws_mut()?;
        let report = ws.apply_disk_changes(&paths);
        let mut notices: Vec<Notice> = report.warnings.iter().map(Notice::load_warning).collect();
        for key in &report.kept_unsaved {
            if let Some(page) = ws.page(key) {
                let path = ws.root.join(&page.rel_path);
                notices.push(Notice::save_failed(key, &SaveError::ChangedOnDisk(path)));
            }
        }
        for key in report.removed.iter().chain(&report.added) {
            self.history.remove(key);
        }
        for (old, new) in &report.rekeyed {
            self.rekey_marks(old, new);
        }
        for r in &report.reloaded {
            self.history.remove(&r.key);
            for (id, theirs) in &r.carried.changed {
                let theirs = theirs.clone();
                self.marks.insert(*id, DiskMark::Changed { theirs });
            }
            for &(id, after) in &r.carried.removed {
                let page = r.key.clone();
                self.marks.insert(id, DiskMark::Removed { page, after });
            }
        }
        // A hand edit of the settings (or a pull's) is followed first, so the
        // pages below show with the new states. A file that cannot be read
        // leaves the old settings in use and refuses writes.
        let mut config = None;
        if config_touched {
            match self.reload_config() {
                Ok(view) => config = view,
                Err(message) => notices.push(Notice::LoadWarning {
                    message: format!(
                        "breccia/config.toml cannot be read ({message}); Breccia keeps the settings it had"
                    ),
                }),
            }
        }
        let ws = self.ws.as_ref().ok_or_else(CommandError::no_folder)?;
        // Marks of blocks and pages that no longer exist can never be used.
        self.marks.retain(|&id, m| match m {
            DiskMark::Changed { .. } => ws.locate(id).is_some(),
            DiskMark::Removed { page, .. } => ws.page(page).is_some(),
        });
        let changed = report
            .reloaded
            .iter()
            .map(|r| r.key.as_str())
            .chain(report.added.iter().map(String::as_str))
            .filter_map(|k| ws.page(k))
            .map(|p| PageView::of(p, ws))
            .collect();
        Ok(Output {
            notices,
            config,
            changed,
            removed: report.removed,
            renamed: report
                .rekeyed
                .into_iter()
                .map(|(from, to)| RenameView { from, to })
                .collect(),
            ..Output::default()
        })
    }

    /// The page was shown with its current text: its blocks are no longer
    /// marked as changed on disk.
    fn acknowledge_page(&mut self, key: &str) {
        let Some(ws) = self.ws.as_ref() else {
            return;
        };
        self.marks.retain(|&id, m| match m {
            DiskMark::Changed { .. } => ws.locate(id).is_none_or(|(p, _)| p.key != key),
            DiskMark::Removed { page, .. } => page != key,
        });
    }

    /// Deleted-block marks follow their page to its new key.
    fn rekey_marks(&mut self, old: &str, new: &str) {
        for m in self.marks.values_mut() {
            if let DiskMark::Removed { page, .. } = m
                && page == old
            {
                *page = new.to_string();
            }
        }
    }

    /// `block.setText` on a block marked by a reload from disk; `None` if
    /// the block is not marked. The mark is used up only on success.
    ///
    /// A changed block takes the text as usual, with a conflict notice when
    /// it differs from the disk text. A deleted block's text becomes a new
    /// block after the nearest earlier block that stayed (or at the end of
    /// the page), so the user's typing is never lost.
    fn set_text_on_marked(
        &mut self,
        id: BlockId,
        text: &str,
    ) -> Result<Option<Output>, CommandError> {
        let out = match self.marks.get(&id) {
            None => return Ok(None),
            Some(DiskMark::Changed { theirs }) => {
                let theirs = theirs.clone();
                let key = self.page_of(id)?;
                let mine = text.to_string();
                let mut out = self.mutate(
                    &key,
                    false,
                    Box::new(move |d, ids, _| {
                        let extras = d.set_text(id, &mine, ids)?;
                        Ok(extras.last().map(|&last| caret_at_end(d, last)))
                    }),
                )?;
                if text != theirs {
                    let n = Notice::changed_on_disk(&key, id, text, &theirs);
                    out.notices.push(n);
                }
                out
            }
            Some(DiskMark::Removed { page, after }) => {
                let (key, after) = (page.clone(), *after);
                let mine = text.to_string();
                let mut out = self.mutate(
                    &key,
                    false,
                    Box::new(move |d, ids, _| {
                        let after = after.filter(|&a| d.index_of(a).is_some());
                        let new = match d.insert_after(after, &mine, ids) {
                            // A preamble ending in an open fence refuses a
                            // new top-level block: go after the last block.
                            Err(EditError::WouldChangeStructure) if after.is_none() => {
                                let last = d.blocks().last().map(|b| b.id());
                                let last = last.ok_or(EditError::WouldChangeStructure)?;
                                d.insert_after(Some(last), &mine, ids)?
                            }
                            r => r?,
                        };
                        Ok(Some(caret_at_end(d, new)))
                    }),
                )?;
                if let Some(focus) = out.focus {
                    out.notices
                        .push(Notice::deleted_on_disk(&key, focus.id, text));
                }
                out
            }
        };
        self.marks.remove(&id);
        Ok(Some(out))
    }

    fn page_output(
        &self,
        key: &str,
        focus: Option<Focus>,
        notices: Vec<Notice>,
    ) -> Result<Output, CommandError> {
        let ws = self.ws()?;
        let page = ws
            .page(key)
            .ok_or_else(|| CommandError::unknown_page(key))?;
        Ok(Output {
            page: Some(PageView::of(page, ws)),
            focus,
            notices,
            ..Output::default()
        })
    }

    /// The key of the page holding the block.
    fn page_of(&self, id: BlockId) -> Result<String, CommandError> {
        match self.ws()?.locate(id) {
            Some((page, _)) => Ok(page.key.clone()),
            None => Err(EditError::UnknownBlock.into()),
        }
    }

    /// The page of a selection's first block; the others must be on it too.
    fn page_of_selection(&self, ids: &[BlockId]) -> Result<String, CommandError> {
        match ids.first() {
            Some(&id) => self.page_of(id),
            None => Err(CommandError::new("unknownBlock", "no blocks selected")),
        }
    }

    /// Runs `step` on each selected root, last root first if `reverse`.
    fn on_roots(
        &mut self,
        ids: &[BlockId],
        reverse: bool,
        step: fn(&mut Document, BlockId) -> Result<(), EditError>,
    ) -> Result<Output, CommandError> {
        let key = self.page_of_selection(ids)?;
        self.mutate(
            &key,
            false,
            Box::new(move |d, _, _| {
                let mut roots = batch::roots(d, ids)?;
                if reverse {
                    roots.reverse();
                }
                for id in roots {
                    step(d, id)?;
                }
                Ok(None)
            }),
        )
    }

    /// [`mutate_tracked`](Self::mutate_tracked) without the change flag.
    fn mutate(&mut self, key: &str, coalesce: bool, op: Op<'_>) -> Result<Output, CommandError> {
        self.mutate_tracked(key, coalesce, op).map(|(out, _)| out)
    }

    /// Applies an edit to a page, records the undo step and saves. Returns
    /// the output and whether the edit changed the document (always `true`
    /// for a coalesced edit, which is not checked).
    ///
    /// A failed edit leaves the document and the history as they were. An
    /// edit that changes nothing records no step and keeps redo, so undo
    /// still reaches the last real change. An edit that `coalesce`s joins
    /// the last undo step: it takes no snapshot, so it must be one that
    /// fails before changing anything (only `block.setText` coalesces).
    fn mutate_tracked(
        &mut self,
        key: &str,
        coalesce: bool,
        op: Op<'_>,
    ) -> Result<(Output, bool), CommandError> {
        let ws = self.ws.as_mut().ok_or_else(CommandError::no_folder)?;
        let page = ws
            .page(key)
            .ok_or_else(|| CommandError::unknown_page(key))?;
        let before = (!coalesce).then(|| page.doc.clone());
        let result = ws
            .edit_with_config(key, move |d, ids, cfg| match op(d, ids, cfg) {
                Ok(focus) => {
                    let changed = before.as_ref().is_none_or(|b| b != d);
                    Ok((focus, changed.then_some(before).flatten(), changed))
                }
                Err(e) => {
                    if let Some(before) = before {
                        *d = before;
                    }
                    Err(e)
                }
            })
            .ok_or_else(|| CommandError::unknown_page(key))?;
        let (focus, before, changed) = result?;
        if changed {
            match before {
                Some(before) => self.history.record(key, before),
                // Coalesced: the step before this run of typing stays.
                None => self.history.clear_redo(key),
            }
        }
        let notices = self.save(key);
        Ok((self.page_output(key, focus, notices)?, changed))
    }

    /// Undo (or redo): swaps the page's document with the last snapshot and
    /// saves. A step of a multi-page change takes the other pages' parts with
    /// it (see [`Histories::take_undo_group`]); they are in `changed`. With
    /// nothing to undo it only returns the page.
    fn step_history(&mut self, key: &str, redo: bool) -> Result<Output, CommandError> {
        let ws = self.ws.as_mut().ok_or_else(CommandError::no_folder)?;
        if ws.page(key).is_none() {
            return Err(CommandError::unknown_page(key));
        }
        let taken = if redo {
            self.history.take_redo_group(key)
        } else {
            self.history.take_undo_group(key)
        };
        let mut notices = Vec::new();
        let mut others = Vec::new();
        for t in taken {
            let ws = self.ws.as_mut().ok_or_else(CommandError::no_folder)?;
            // Every page of a step is known: a page that goes loses its history.
            let Some(current) = ws.edit(&t.key, |d, _| std::mem::replace(d, t.doc)) else {
                continue;
            };
            if redo {
                self.history.push_undo_from_redo(&t.key, current, t.group);
            } else {
                self.history.push_redo(&t.key, current, t.group);
            }
            notices.extend(self.save(&t.key));
            if t.key != key {
                others.push(t.key);
            }
        }
        let mut out = self.page_output(key, None, notices)?;
        let ws = self.ws()?;
        out.changed = others
            .iter()
            .filter_map(|k| ws.page(k))
            .map(|p| PageView::of(p, ws))
            .collect();
        Ok(out)
    }

    /// Saves a page; a failure becomes a notice. A page without a file and
    /// without content is not created, silently.
    fn save(&mut self, key: &str) -> Vec<Notice> {
        let Some(ws) = self.ws.as_mut() else {
            return Vec::new();
        };
        let result = ws.save(key);
        self.note_save(key, result)
    }

    /// Keeps track of failed saves: a failure becomes a notice, and a page
    /// saved after a failure is reported in `Output.saved`.
    fn note_save<T>(&mut self, key: &str, result: Result<T, SaveError>) -> Vec<Notice> {
        match result {
            Ok(_) => {
                if self.failed_saves.remove(key) {
                    self.saved_now.push(key.to_string());
                }
                Vec::new()
            }
            Err(e) => vec![self.note_failed_save(key, &e)],
        }
    }

    /// A failed save: the page is tracked until it is saved, and the notice is returned.
    fn note_failed_save(&mut self, key: &str, e: &SaveError) -> Notice {
        self.failed_saves.insert(key.to_string());
        // Saved earlier in this run and failing again: it is not saved.
        self.saved_now.retain(|k| k != key);
        Notice::save_failed(key, e)
    }
}

/// The caret at the end of a block's text.
fn caret_at_end(doc: &Document, id: BlockId) -> Focus {
    let at = doc.index_of(id).map_or(0, |i| doc.blocks()[i].text().len());
    Focus { id, at }
}
