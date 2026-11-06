//! What the frontend sends: a request with its generation and a named command.

use std::path::PathBuf;

use chrono::{NaiveDate, NaiveDateTime, NaiveTime};
use serde::Deserialize;

use crate::config::Board;
use crate::outline::BlockId;

use super::graph::NodePosition;

/// The time a command runs at, given by the caller.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Clock {
    /// The local date, for journals and `done::`.
    pub today: NaiveDate,
    /// The local time of day, for the time on `done::` and `archived::`.
    pub time: NaiveTime,
    /// A monotonic millisecond counter, used only to coalesce typing into
    /// undo steps.
    pub ms: u64,
}

impl Clock {
    /// The local date and time.
    pub fn now(&self) -> NaiveDateTime {
        self.today.and_time(self.time)
    }
}

/// One state of the list `states.set` writes.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StateInput {
    pub keyword: String,
    pub color: String,
    pub finished: bool,
    pub in_cycle: bool,
}

/// A state whose keyword changed: the blocks that start with `from` get `to`.
#[derive(Clone, Debug, Deserialize)]
pub struct StateRename {
    pub from: String,
    pub to: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Request {
    /// The session generation the command's block IDs belong to.
    pub generation: u64,
    pub command: Command,
}

/// The named commands. `type` holds the name, the other fields are camelCase.
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "type", rename_all_fields = "camelCase")]
pub enum Command {
    #[serde(rename = "folder.open")]
    FolderOpen { path: PathBuf },
    #[serde(rename = "folder.create")]
    FolderCreate { path: PathBuf },
    #[serde(rename = "folder.status")]
    FolderStatus,
    #[serde(rename = "folder.tree")]
    FolderTree,
    #[serde(rename = "config.get")]
    ConfigGet,
    #[serde(rename = "page.today")]
    PageToday,
    #[serde(rename = "page.show")]
    PageShow { key: String },
    #[serde(rename = "page.open")]
    PageOpen {
        name: String,
        /// The name is a link target: `Page#Heading` opens `Page` when
        /// that page (or alias) exists.
        #[serde(default)]
        link: bool,
    },
    #[serde(rename = "page.create")]
    PageCreate { name: String, folder: String },
    #[serde(rename = "dir.create")]
    DirCreate { path: String },
    #[serde(rename = "page.rename")]
    PageRename { key: String, name: String },
    #[serde(rename = "page.move")]
    PageMove { key: String, folder: String },
    #[serde(rename = "page.delete")]
    PageDelete { key: String },
    #[serde(rename = "dir.rename")]
    DirRename { path: String, to: String },
    #[serde(rename = "dir.delete")]
    DirDelete { path: String },
    #[serde(rename = "page.get")]
    PageGet { key: String },
    #[serde(rename = "journal.feed")]
    JournalFeed,
    #[serde(rename = "pages.table")]
    PagesTable,
    #[serde(rename = "graph.get")]
    GraphGet,
    #[serde(rename = "graph.saveLayout")]
    GraphSaveLayout { positions: Vec<NodePosition> },
    #[serde(rename = "pages.get")]
    PagesGet { keys: Vec<String> },
    #[serde(rename = "page.reload")]
    PageReload { key: String },
    #[serde(rename = "page.overwrite")]
    PageOverwrite { key: String },
    #[serde(rename = "page.refs")]
    PageRefs { key: String },
    /// How many other pages a rename of page `key` to `name` would rewrite
    /// (the rename question); answers in `reach`.
    #[serde(rename = "page.renameReach")]
    PageRenameReach { key: String, name: String },
    /// The board's live tasks; archived ones are listed by `archive.list`.
    #[serde(rename = "board.get")]
    BoardGet { index: usize },
    /// A drop on a board: card `id` goes into column `keyword`,
    /// directly above card `before` (`None`: at the column's end). The state
    /// changes to `keyword` and `priority::` is set for the place;
    /// cards above may be raised, on any page, as one undo step.
    #[serde(rename = "board.place")]
    BoardPlace {
        id: BlockId,
        keyword: String,
        #[serde(default)]
        before: Option<BlockId>,
    },
    /// Every archived task, for the Archive view; answers in `archive`.
    #[serde(rename = "archive.list")]
    ArchiveList,
    /// A new top-level block with `text` at the end of today's journal (made in memory if needed).
    #[serde(rename = "journal.append")]
    JournalAppend { text: String },
    /// Archives (adds `archived::` to) every block in state `keyword` whose done date is more than
    /// `[board] archive_after_days` days before today.
    #[serde(rename = "board.archive")]
    BoardArchive { keyword: String },
    /// Replaces the boards in `config.toml`; answers with `config`.
    #[serde(rename = "boards.set")]
    BoardsSet { boards: Vec<Board>, version: u64 },
    /// How many blocks and pages use each state; answers with `usage`.
    #[serde(rename = "states.usage")]
    StatesUsage,
    /// Replaces the states in `config.toml` and renames the keyword in the notes
    /// for each rename. `version` is the `ConfigView.version` the list was made from.
    #[serde(rename = "states.set")]
    StatesSet {
        states: Vec<StateInput>,
        renames: Vec<StateRename>,
        version: u64,
    },
    /// Sets `[git]` in `config.toml`; answers with `config`.
    #[serde(rename = "config.setGit")]
    ConfigSetGit {
        enabled: bool,
        commit_delay_minutes: u32,
        pull_interval_minutes: u32,
        version: u64,
    },
    /// Sets `[board]` in `config.toml`; answers with `config`. `autoArchive`
    /// left out keeps the switch as it is.
    #[serde(rename = "config.setBoard")]
    ConfigSetBoard {
        archive_after_days: u32,
        #[serde(default)]
        auto_archive: Option<bool>,
        version: u64,
    },
    #[serde(rename = "pages.list")]
    PagesList,
    #[serde(rename = "block.insert")]
    BlockInsert {
        page: String,
        after: Option<BlockId>,
        text: String,
    },
    #[serde(rename = "block.setText")]
    BlockSetText { id: BlockId, text: String },
    #[serde(rename = "block.split")]
    BlockSplit { id: BlockId, at: usize },
    #[serde(rename = "block.merge")]
    BlockMerge { id: BlockId },
    #[serde(rename = "block.paste")]
    BlockPaste {
        id: BlockId,
        at: usize,
        text: String,
    },
    #[serde(rename = "block.cycleState")]
    BlockCycleState { id: BlockId },
    #[serde(rename = "block.stepState")]
    BlockStepState { id: BlockId },
    /// The block's editor closed; `before` is the state it had when the editor
    /// opened. A state typed or removed by hand gets the lines a change of
    /// state brings.
    #[serde(rename = "block.settle")]
    BlockSettle { id: BlockId, before: Option<String> },
    #[serde(rename = "blocks.setState")]
    BlocksSetState {
        ids: Vec<BlockId>,
        keyword: Option<String>,
    },
    /// Archives, by itself, every task due (see `board.archive`) in any finished
    /// state, while `[board] auto_archive` is on; skips the block `editing`
    /// (the one whose editor is open). No undo step.
    #[serde(rename = "archive.auto")]
    ArchiveAuto {
        #[serde(default)]
        editing: Option<BlockId>,
    },
    /// Archives (`archived:: <today>`) or unarchives the blocks.
    #[serde(rename = "blocks.setArchived")]
    BlocksSetArchived { ids: Vec<BlockId>, archived: bool },
    #[serde(rename = "blocks.indent")]
    BlocksIndent { ids: Vec<BlockId> },
    #[serde(rename = "blocks.outdent")]
    BlocksOutdent { ids: Vec<BlockId> },
    #[serde(rename = "blocks.moveUp")]
    BlocksMoveUp { ids: Vec<BlockId> },
    #[serde(rename = "blocks.moveDown")]
    BlocksMoveDown { ids: Vec<BlockId> },
    #[serde(rename = "blocks.delete")]
    BlocksDelete { ids: Vec<BlockId> },
    #[serde(rename = "history.undo")]
    HistoryUndo { page: String },
    #[serde(rename = "history.redo")]
    HistoryRedo { page: String },
    /// Sent by the shell's watcher: files under the root that other
    /// programs may have changed, relative to the root.
    #[serde(rename = "files.changed")]
    FilesChanged { paths: Vec<PathBuf> },
    /// The blocks that match `text`: words, a state keyword and `#tags` or `[[links]]`.
    #[serde(rename = "search.query")]
    SearchQuery { text: String },
    /// The "Go to" line of journal day `key` (`YYYY-MM-DD`), as a typed date
    /// gets it; answers in `day` (for the date picker). Writes nothing.
    #[serde(rename = "journal.day")]
    JournalDay { key: String },
    /// The pages with edits their files do not hold, e.g. before closing.
    #[serde(rename = "session.dirty")]
    SessionDirty,
    /// The Git item's current state. Answered by the shell, never by the session.
    #[serde(rename = "git.status")]
    GitStatus,
    /// Commit and sync now (a click on the Git item). Shell only.
    #[serde(rename = "git.sync")]
    GitSync,
    /// `git init` in the notes folder, then the first commit. Shell only.
    #[serde(rename = "git.init")]
    GitInit,
    /// `limit` commits of the notes folder after the newest `skip`, newest
    /// first (the Git history view); answers in `gitLog`. Shell only.
    #[serde(rename = "git.log")]
    GitLog { skip: usize, limit: usize },
}
