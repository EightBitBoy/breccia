//! The session behind the UI: one open notes folder, the named commands the
//! frontend sends, undo and redo per page, and saving after every edit.
//!
//! [`Session::run`] is the only place that knows the command names. Every
//! command that changes a page saves it right away; a failed save never
//! fails the command, it keeps the edit in memory and adds a
//! [`Notice::SaveFailed`].

mod batch;
mod block;
mod board;
mod command;
mod folder;
mod graph;
mod history;
mod journal;
mod page;
mod search;
mod settings;
mod table;
mod tree;
mod view;

use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};

pub use crate::workspace::TagEntry;
pub use board::{ArchivedView, BoardView, CardView, ColumnView};
pub use command::{Clock, Command, CommandKind, Request, StateInput, StateRename};
pub use folder::Recovery;
pub use graph::{GraphNode, GraphView, NodePosition, layout_file_name};
pub use search::{DateView, IndexProgress, SEARCH_LIMIT, SearchGroup, SearchHit, SearchView};
pub use table::PageRowView;
use tree::LinkLists;
pub use tree::{JournalDay, JournalMonth, JournalYear, TreeNode, TreeView};
pub use view::{
    BlockView, BoardSummary, CommandError, ConfigView, DirtyView, FeedView, Focus, FolderView,
    GitSettingsView, Notice, Output, PageView, PageViewKind, RefGroup, RefView, RefsView,
    RenameView, SaveFailReason, StateUsage, StateView,
};

use crate::config::{Config, ConfigError, Expect, GitSettings};
use crate::error::EditError;
use crate::naming::journal_name;
use crate::outline::{BlockId, Document, IdGen};
use crate::workspace::{SaveError, Workspace};
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
    typed_step: Option<TypedStep>,
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

fn config_changed() -> CommandError {
    CommandError::new(
        "configChanged",
        "breccia/config.toml changed on disk, so this change was not saved. Breccia has read the new file; make the change again.",
    )
}

/// The last `block.setText` that changed text, for `block.settle`.
struct TypedStep {
    id: BlockId,
    page: String,
    /// The page's newest undo step then.
    seq: Option<u64>,
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
            out.notices.extend(
                ws.take_config_replaced()
                    .iter()
                    .map(Notice::config_replaced),
            );
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

    /// The command table: each arm is one method call, or the answer of a
    /// plain query.
    fn execute(&mut self, req: Request, clock: Clock) -> Result<Output, CommandError> {
        // Only a `block.setText` right after another one can coalesce.
        let typing = self.typing.take();
        if !req.command.ignores_generation() && req.generation != self.generation {
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
            Command::FolderOpen { path } => self.folder_open(&path),
            Command::FolderCreate { path } => self.folder_create(&path),
            Command::FolderStatus => Ok(Output {
                folder: Some(self.folder_view()),
                ..Output::default()
            }),
            Command::FolderTree => Ok(Output {
                tree: Some(TreeView::of(self.ws()?)),
                ..Output::default()
            }),
            Command::PageCreate { name, folder } => self.page_create(&name, &folder),
            Command::DirCreate { path } => self.dir_create(&path),
            Command::PageRename { key, name } => self.page_rename(&key, &name),
            Command::PageSetColor { key, color } => self.page_set_color(&key, color.as_deref()),
            Command::PageMove { key, folder } => self.page_move(&key, &folder),
            Command::PageDelete { key } => self.page_delete(key),
            Command::DirRename { path, to } => self.dir_rename(&path, &to),
            Command::DirDelete { path } => self.dir_delete(&path),
            Command::ConfigGet => self.config_output(),
            Command::PageToday => self.open_page(&journal_name(today), false),
            Command::PageShow { key } => self.page_show(&key),
            Command::PageOpen { name, link } => self.open_page(&name, link),
            Command::PageGet { key } => self.page_get(&key),
            Command::JournalFeed => self.journal_feed(today),
            Command::PagesGet { keys } => self.pages_get(&keys),
            Command::PagesTable => Ok(Output {
                table: Some(PageRowView::all(self.ws()?, &self.git_created)),
                ..Output::default()
            }),
            Command::GraphGet => self.graph_get(),
            Command::GraphSaveLayout { positions } => self.graph_save_layout(&positions),
            Command::PageReload { key } => self.page_reload(key),
            Command::PageRefs { key } => self.page_refs(&key),
            Command::PageRenameReach { key, name } => self.page_rename_reach(&key, &name),
            Command::BoardGet { index } => self.board_get(index),
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
            Command::BoardsSet { boards, version } => self.boards_set(&boards, version),
            Command::StatesUsage => self.states_usage(),
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
            } => self.config_set_git(
                GitSettings {
                    enabled,
                    commit_delay_minutes,
                    pull_interval_minutes,
                },
                version,
            ),
            Command::ConfigSetBoard {
                archive_after_days,
                auto_archive,
                version,
            } => self.config_set_board(archive_after_days, auto_archive, version),
            Command::PagesList => Ok(Output {
                names: Some(self.ws()?.page_names()),
                ..Output::default()
            }),
            Command::PageOverwrite { key } => self.page_overwrite(&key),
            Command::BlockInsert { page, after, text } => self.block_insert(&page, after, text),
            Command::BlockSetText { id, text } => self.block_set_text(id, text, typing, clock.ms),
            Command::BlockSettle { id, before } => self.block_settle(id, before, now),
            Command::BlockSplit { id, at } => self.block_split(id, at),
            Command::BlockMerge { id } => self.block_merge(id),
            Command::BlockPaste { id, at, text } => self.block_paste(id, at, text),
            Command::BlockCycleState { id } => self.block_cycle_state(id, now),
            Command::BlockStepState { id } => self.block_step_state(id, now),
            Command::BlocksSetState { ids, keyword } => self.blocks_set_state(ids, keyword, now),
            Command::BlocksSetArchived { ids, archived } => {
                self.blocks_set_archived(ids, archived, now)
            }
            Command::BlocksIndent { ids } => self.on_roots(&ids, false, Document::indent),
            Command::BlocksOutdent { ids } => self.on_roots(&ids, false, Document::outdent),
            Command::BlocksMoveUp { ids } => self.on_roots(&ids, false, Document::move_up),
            Command::BlocksMoveDown { ids } => self.on_roots(&ids, true, Document::move_down),
            Command::BlocksDelete { ids, keep_one } => self.blocks_delete(ids, keep_one),
            Command::BlockDelete { id } => self.block_delete(id),
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
