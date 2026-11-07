//! What the frontend gets back: views of pages and settings, notices, errors.

use std::collections::HashSet;
use std::fmt;
use std::path::PathBuf;

use serde::Serialize;

use crate::config::Config;
use crate::error::EditError;
use crate::git::{GitLogView, GitView};
use crate::inline::{LinkKind, links};
use crate::naming::{journal_display, parse_journal_name};
use crate::outline::{Block, BlockId};
use crate::render::{block_html, crumb, preamble_html};
use crate::task::task_state;
pub use crate::workspace::StateUsage;
use crate::workspace::{LoadWarning, NameEntry, Page, PageError, PageKind, SaveError, Workspace};

use super::board::{ArchivedView, BoardView};
use super::graph::GraphView;
use super::search::{DateView, SearchView};
use super::table::PageRowView;
use super::tree::{JournalDay, TreeView};

/// The result of a command. Only the parts a command produces are set.
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Output {
    pub page: Option<PageView>,
    pub focus: Option<Focus>,
    pub notices: Vec<Notice>,
    pub folder: Option<FolderView>,
    pub config: Option<ConfigView>,
    pub refs: Option<RefsView>,
    pub names: Option<Vec<NameView>>,
    pub tree: Option<TreeView>,
    /// Pages other than `page` that the command changed.
    pub changed: Vec<PageView>,
    /// Keys of pages that are gone.
    pub removed: Vec<String>,
    /// The pages with unsaved edits; set by `session.dirty`.
    pub dirty: Option<Vec<DirtyView>>,
    /// The journal feed; set by `journal.feed`.
    pub feed: Option<FeedView>,
    /// Pages a query returned without showing them (`pages.get`); not emitted as events.
    pub pages: Vec<PageView>,
    /// The board built by `board.get`.
    pub board: Option<BoardView>,
    /// The rows of the All pages table; set by `pages.table`.
    pub table: Option<Vec<PageRowView>>,
    /// The matches of `search.query`.
    pub search: Option<SearchView>,
    /// One journal day for the date picker; set by `journal.day`.
    pub day: Option<DateView>,
    /// Pages whose key changed because the file was edited outside (`files.changed`).
    pub renamed: Vec<RenameView>,
    /// The Git item's state; set by the shell's `git.*` answers, never by the session.
    pub git: Option<GitView>,
    /// How much of the notes each state covers; set by `states.usage`.
    pub usage: Option<Vec<StateUsage>>,
    /// Pages that did not load (and are neither counted nor renamed); set with `usage`.
    pub usage_skipped: Option<usize>,
    /// The network view's pages and links; set by `graph.get`.
    pub graph: Option<GraphView>,
    /// Keys of pages whose earlier save failed and whose file now holds
    /// Breccia's text, so their "could not be saved" notice can go.
    pub saved: Vec<String>,
    /// How many other pages a rename would rewrite; set by `page.renameReach`.
    pub reach: Option<usize>,
    /// One page of the notes folder's commits; set by the shell's `git.log`.
    pub git_log: Option<GitLogView>,
    /// The archived tasks (`archive.list`).
    pub archive: Option<Vec<ArchivedView>>,
}

impl Output {
    /// Whether the command produced nothing: every field is as in
    /// `Output::default()`. Compared through serde, so a field added later is
    /// never forgotten here.
    pub fn is_empty(&self) -> bool {
        serde_json::to_value(self).ok() == serde_json::to_value(Output::default()).ok()
    }
}

/// A page that other software re-keyed: `from` and `to` are page keys.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameView {
    pub from: String,
    pub to: String,
}

/// The days of the journal feed.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedView {
    /// Today's key; also the first day.
    pub today: String,
    /// Newest first. `JournalDay` is the sidebar's type from tree.rs: key and long title.
    pub days: Vec<JournalDay>,
}

/// A page with edits its file does not hold.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirtyView {
    pub key: String,
    /// The long date for a journal, else the name.
    pub title: String,
}

impl DirtyView {
    pub(crate) fn of(page: &Page) -> DirtyView {
        DirtyView {
            key: page.key.clone(),
            title: title_of(page).1,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PageViewKind {
    Journal,
    Page,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageView {
    pub key: String,
    pub name: String,
    pub kind: PageViewKind,
    /// The long date for a journal, else the name.
    pub title: String,
    pub preamble_html: String,
    pub blocks: Vec<BlockView>,
    /// Whether the page has a file; a moved page's file may be empty.
    pub has_file: bool,
    /// The page's own color; none for a journal.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<crate::color::PageColor>,
    /// Journals only: the links and tags of its blocks that can be given a color.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub targets: Vec<TargetView>,
}

/// A link or tag in a journal whose page can be given a color: one that goes
/// to an existing page that is not a journal, or a tag without a page yet.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetView {
    /// The link's key as the rendered anchor's `data-page` holds it.
    pub raw: String,
    pub kind: TargetKind,
    /// The page the link goes to.
    pub key: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<crate::color::PageColor>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TargetKind {
    Link,
    Tag,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockView {
    pub id: BlockId,
    pub depth: usize,
    pub text: String,
    pub html: String,
    /// The task state keyword, if the block has one.
    pub state: Option<String>,
    /// Whether that state counts as finished.
    pub finished: bool,
    pub has_children: bool,
    /// Journal blocks only: the page the block's first topic link goes to.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topic: Option<String>,
    /// Journal blocks only: that page's color, when it has one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<crate::color::PageColor>,
}

/// Where the caret goes: a block and a UTF-8 byte offset in its text.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Focus {
    pub id: BlockId,
    pub at: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderView {
    /// The open notes folder; `None` while no folder is open.
    pub path: Option<PathBuf>,
    pub generation: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigView {
    pub states: Vec<StateView>,
    pub boards: Vec<BoardSummary>,
    pub archive_after_days: u32,
    /// `[board] auto_archive`.
    pub auto_archive: bool,
    pub git: GitSettingsView,
    /// Goes up with every reload and every write of `config.toml`; changes
    /// that write the file carry the one they were made from.
    pub version: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSettingsView {
    pub enabled: bool,
    pub commit_delay_minutes: u32,
    pub pull_interval_minutes: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StateView {
    pub keyword: String,
    pub color: String,
    pub finished: bool,
    pub in_cycle: bool,
}

/// Something the user should know about that did not fail the command.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Notice {
    LoadWarning {
        message: String,
    },
    /// The edit is kept in memory but its file was not written.
    SaveFailed {
        page: String,
        reason: SaveFailReason,
        message: String,
    },
    Refused {
        message: String,
    },
    /// A quiet note about something Breccia did by itself.
    Info {
        message: String,
    },
    /// A block was typed into after another program changed or deleted it;
    /// `mine` was kept, `theirs` is the disk text (`None`: deleted).
    Conflict {
        page: String,
        block: BlockId,
        mine: String,
        theirs: Option<String>,
        message: String,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SaveFailReason {
    ChangedOnDisk,
    PathTaken,
    Io,
}

/// A command that did not run. `code` is camelCase and stable; `message`
/// is for people.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: String,
    pub message: String,
}

impl CommandError {
    pub(crate) fn new(code: &str, message: impl fmt::Display) -> Self {
        CommandError {
            code: code.to_string(),
            message: message.to_string(),
        }
    }

    pub(crate) fn no_folder() -> Self {
        CommandError::new("noFolder", "no notes folder is open")
    }

    pub(crate) fn unknown_page(key: &str) -> Self {
        CommandError::new("unknownPage", format_args!("unknown page: {key}"))
    }
}

impl fmt::Display for CommandError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for CommandError {}

impl From<PageError> for CommandError {
    fn from(e: PageError) -> Self {
        let code = match e {
            PageError::InvalidName(_) => "invalidName",
            PageError::NotLinkable(_) => "invalidName",
            PageError::Exists(_) => "pageExists",
            PageError::IsAlias { .. } => "pageExists",
            PageError::UnknownFolder(_) => "unknownFolder",
            PageError::FolderExists(_) => "folderExists",
            PageError::Journal(_) => "journal",
            PageError::UnknownColor(_) => "unknownColor",
            PageError::UnknownPage(_) => "unknownPage",
            PageError::FolderNotEmpty(_) => "folderNotEmpty",
            PageError::IntoItself(_) => "intoItself",
            PageError::ChangedOnDisk(_) => "changedOnDisk",
            PageError::Io(_) => "io",
        };
        CommandError::new(code, e)
    }
}

impl From<EditError> for CommandError {
    fn from(e: EditError) -> Self {
        let code = match e {
            EditError::UnknownBlock => "unknownBlock",
            EditError::UnknownState(_) => "unknownState",
            EditError::NoPreviousSibling => "noPreviousSibling",
            EditError::NoNextSibling => "noNextSibling",
            EditError::NoParent => "noParent",
            EditError::NoPrevious => "noPrevious",
            EditError::InvalidOffset => "invalidOffset",
            EditError::InsideFence => "insideFence",
            EditError::WouldChangeStructure => "wouldChangeStructure",
            EditError::NoCycle => "noCycle",
        };
        CommandError::new(code, e)
    }
}

impl PageView {
    pub(crate) fn of(page: &Page, ws: &Workspace) -> PageView {
        let (kind, title) = title_of(page);
        let blocks = page.doc.blocks();
        let mut views = BlockView::list(blocks, &ws.config);
        let mut targets = Vec::new();
        if kind == PageViewKind::Journal {
            targets = TargetView::list(blocks, ws);
            // A top-level block takes its topic's color; deeper blocks keep their ancestor's.
            let mut current: Option<(String, crate::color::PageColor)> = None;
            for (v, b) in views.iter_mut().zip(blocks) {
                if b.depth() == 0 {
                    current = ws
                        .topic_of(b.text())
                        .and_then(|t| ws.page_color(&t).map(|c| (t, c)));
                }
                if let Some((t, c)) = &current {
                    v.topic = Some(t.clone());
                    v.color = Some(*c);
                }
            }
        }
        PageView {
            key: page.key.clone(),
            name: page.name.clone(),
            kind,
            title,
            preamble_html: preamble_html(page.doc.preamble()),
            blocks: views,
            has_file: page.has_file(),
            color: crate::color::own_color(page),
            targets,
        }
    }
}

impl TargetView {
    /// The colorable targets of `blocks`, one per raw key and kind, in the
    /// order they first appear.
    fn list(blocks: &[Block], ws: &Workspace) -> Vec<TargetView> {
        let mut seen = HashSet::new();
        let mut out = Vec::new();
        for l in blocks.iter().flat_map(|b| links(b.text())) {
            let kind = match l.kind {
                LinkKind::Page => TargetKind::Link,
                LinkKind::Tag => TargetKind::Tag,
            };
            if !seen.insert((l.key.clone(), kind)) {
                continue;
            }
            let t = ws.link_target(&l.target, l.kind);
            let journal = match ws.page(&t.key) {
                Some(p) => matches!(p.kind, PageKind::Journal(_)),
                None => parse_journal_name(&t.key).is_some(),
            };
            if journal {
                continue;
            }
            // A tag may name a page that has no content yet: the color gives it its file.
            if !t.exists && kind == TargetKind::Link {
                continue;
            }
            out.push(TargetView {
                raw: l.key,
                kind,
                color: ws.page_color(&t.key),
                key: t.key,
                name: t.name,
            });
        }
        out
    }
}

/// The kind of a page and the title it is shown with: the long date for a
/// journal, else the name.
pub(super) fn title_of(page: &Page) -> (PageViewKind, String) {
    match &page.kind {
        PageKind::Journal(date) => (PageViewKind::Journal, journal_display(*date)),
        PageKind::Page => (PageViewKind::Page, page.name.clone()),
    }
}

impl BlockView {
    /// Views of `blocks`, which must end at the end of a subtree: a block has
    /// children when the next one is deeper.
    pub(crate) fn list(blocks: &[Block], cfg: &Config) -> Vec<BlockView> {
        blocks
            .iter()
            .enumerate()
            .map(|(i, b)| {
                let state = task_state(b.text(), cfg);
                BlockView {
                    id: b.id(),
                    depth: b.depth(),
                    text: b.text().to_string(),
                    html: block_html(b.text(), cfg),
                    state: state.map(|s| s.keyword.clone()),
                    finished: state.is_some_and(|s| s.finished),
                    has_children: blocks.get(i + 1).is_some_and(|n| n.depth() > b.depth()),
                    topic: None,
                    color: None,
                }
            })
            .collect()
    }
}

/// The linked references to a page.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefsView {
    pub key: String,
    /// The total number of roots.
    pub count: usize,
    pub groups: Vec<RefGroup>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefGroup {
    pub page: String,
    pub title: String,
    pub kind: PageViewKind,
    pub refs: Vec<RefView>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefView {
    /// The ancestors of the root, outermost first, as breadcrumbs.
    pub crumbs: Vec<String>,
    /// The root and its subtree, with `depth` relative to the root.
    pub blocks: Vec<BlockView>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NameView {
    pub key: String,
    pub name: String,
    pub exists: bool,
}

impl NameView {
    pub(crate) fn of(e: NameEntry) -> NameView {
        NameView {
            key: e.key,
            name: e.name,
            exists: e.exists,
        }
    }
}

impl RefsView {
    pub(crate) fn of(ws: &Workspace, key: &str) -> RefsView {
        let mut count = 0;
        let groups = ws
            .backlinks(key)
            .into_iter()
            .map(|bl| {
                let blocks = bl.page.doc.blocks();
                let refs: Vec<RefView> = bl
                    .roots
                    .iter()
                    .filter_map(|&id| {
                        let i = bl.page.doc.index_of(id)?;
                        let depth = blocks[i].depth();
                        let end = blocks[i + 1..]
                            .iter()
                            .position(|b| b.depth() <= depth)
                            .map_or(blocks.len(), |n| i + 1 + n);
                        let mut crumbs = Vec::new();
                        let mut want = depth;
                        for b in blocks[..i].iter().rev() {
                            if b.depth() < want {
                                want = b.depth();
                                crumbs.push(crumb(b.text()));
                            }
                        }
                        crumbs.reverse();
                        let mut views = BlockView::list(&blocks[i..end], &ws.config);
                        for v in &mut views {
                            v.depth -= depth;
                        }
                        Some(RefView {
                            crumbs,
                            blocks: views,
                        })
                    })
                    .collect();
                count += refs.len();
                let (kind, title) = title_of(bl.page);
                RefGroup {
                    page: bl.page.key.clone(),
                    title,
                    kind,
                    refs,
                }
            })
            .collect();
        RefsView {
            key: key.to_string(),
            count,
            groups,
        }
    }
}

impl ConfigView {
    pub(crate) fn of(cfg: &Config, version: u64) -> ConfigView {
        ConfigView {
            states: cfg
                .states
                .iter()
                .map(|s| StateView {
                    keyword: s.keyword.clone(),
                    color: s.color.clone(),
                    finished: s.finished,
                    in_cycle: s.in_cycle,
                })
                .collect(),
            boards: cfg
                .boards
                .iter()
                .map(|b| BoardSummary {
                    name: b.name.clone(),
                    columns: b.columns.clone(),
                })
                .collect(),
            archive_after_days: cfg.board.archive_after_days,
            auto_archive: cfg.board.auto_archive,
            git: GitSettingsView {
                enabled: cfg.git.enabled,
                commit_delay_minutes: cfg.git.commit_delay_minutes,
                pull_interval_minutes: cfg.git.pull_interval_minutes,
            },
            version,
        }
    }
}

impl Notice {
    pub(crate) fn load_warning(w: &LoadWarning) -> Notice {
        let message = match w {
            LoadWarning::NotUtf8(p) => format!("not valid UTF-8, not loaded: {}", p.display()),
            LoadWarning::BadJournalName(p) => format!(
                "journal file name is not a YYYY-MM-DD date, not loaded: {}",
                p.display()
            ),
            LoadWarning::NonUnicodeName(p) => format!(
                "file name is not valid Unicode, not loaded: {}",
                p.to_string_lossy()
            ),
            LoadWarning::LinkedFolder(p) => format!(
                "{} is a link to a folder; Breccia does not follow folder links",
                p.display()
            ),
            LoadWarning::ExtensionCase(p) => format!(
                "extension must be lower-case .md, not loaded: {}",
                p.to_string_lossy()
            ),
            LoadWarning::Unreadable { path, error } => {
                format!("cannot read {}: {error}", path.display())
            }
            LoadWarning::InvalidName(p) => {
                format!("not a valid page name, not loaded: {}", p.display())
            }
            LoadWarning::DuplicatePage { key, kept, ignored } => format!(
                "two files for page {key:?}: kept {}, ignored {}",
                kept.display(),
                ignored.display()
            ),
            LoadWarning::AliasIsName {
                alias,
                listed_in,
                page,
            } => format!(
                "the alias “{alias}” in {} is the name of the page {}; links to it go to that page",
                listed_in.display(),
                page.display()
            ),
            LoadWarning::DuplicateAlias {
                alias,
                kept,
                ignored,
            } => format!(
                "the alias “{alias}” is listed in {} and {}; links to it go to {}",
                kept.display(),
                ignored.display(),
                kept.display()
            ),
        };
        Notice::LoadWarning { message }
    }

    /// Typing into a block that changed on disk kept `mine` over `theirs`.
    pub(crate) fn changed_on_disk(page: &str, block: BlockId, mine: &str, theirs: &str) -> Notice {
        Notice::Conflict {
            page: page.to_string(),
            block,
            mine: mine.to_string(),
            theirs: Some(theirs.to_string()),
            message: "This block changed on disk while you were editing it.".to_string(),
        }
    }

    /// Typing into a block deleted on disk kept `mine` as the new `block`.
    pub(crate) fn deleted_on_disk(page: &str, block: BlockId, mine: &str) -> Notice {
        Notice::Conflict {
            page: page.to_string(),
            block,
            mine: mine.to_string(),
            theirs: None,
            message: "This block was deleted on disk while you were editing it; your text was kept as a new block."
                .to_string(),
        }
    }

    pub(crate) fn save_failed(key: &str, e: &SaveError) -> Notice {
        let reason = match e {
            SaveError::ChangedOnDisk(_) => SaveFailReason::ChangedOnDisk,
            SaveError::PathTaken(_) => SaveFailReason::PathTaken,
            SaveError::Io(_) | SaveError::UnknownPage(_) | SaveError::DanglingLink(_) => {
                SaveFailReason::Io
            }
        };
        Notice::SaveFailed {
            page: key.to_string(),
            reason,
            message: e.to_string(),
        }
    }
}

/// A board's name and column keywords, as listed in `config.get`.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardSummary {
    pub name: String,
    pub columns: Vec<String>,
}
