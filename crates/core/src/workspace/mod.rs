//! A notes folder held in memory: open or create it, edit pages, save them.
//!
//! Saving never overwrites a file Breccia did not read: a page without a file
//! is only written when nothing exists at its path yet.

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use chrono::NaiveDate;
use serde::Serialize;

use crate::color::{PageColor, page_color};
use crate::config::{Config, ConfigError};
use crate::fsio::write_atomic;
use crate::index::LinkIndex;
use crate::layout::{self, JOURNALS, PAGES};
use crate::naming::{is_valid_page_name, journal_name, page_key, parse_journal_name};
use crate::outline::{BlockId, Carried, Document, IdGen, parse};

mod changes;
mod disk;
mod files;
mod names;
mod pages;
mod states;

use files::{
    Found, decode, is_blank, is_exact_file, path_taken, preamble_title, scan_journals, walk_pages,
};
pub(crate) use files::{NotePath, classify};
pub use names::Target;
pub use states::{StateRenameReport, StateUsage};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PageKind {
    Journal(NaiveDate),
    Page,
}

#[derive(Clone, Debug)]
pub struct Page {
    pub name: String,
    pub key: String,
    pub kind: PageKind,
    /// Path under `pages/` joined with `/`; `""` at top level and for journals.
    pub folder: String,
    /// Relative to the notes root; for a page without a file, the path its
    /// file will get.
    pub rel_path: PathBuf,
    pub doc: Document,
    /// The text last read from or written to the file; `None` if there is no file.
    on_disk: Option<String>,
    /// The file's modification time when read or reloaded, the time of
    /// Breccia's last write, `None` without a file.
    edited: Option<SystemTime>,
    /// The file's creation time when read, reloaded or written; `None`
    /// without a file or where the file system has none.
    created: Option<SystemTime>,
}

impl Page {
    /// The color the page has of its own: none for a journal, else what its
    /// preamble gives it.
    pub fn own_color(&self) -> Option<PageColor> {
        match self.kind {
            PageKind::Journal(_) => None,
            PageKind::Page => page_color(self.doc.preamble()),
        }
    }

    /// When the page's file was created; `None` for a page without a file
    /// or where the file system has no creation time.
    pub fn created(&self) -> Option<SystemTime> {
        self.created
    }

    /// When the page's file was last changed; `None` for a page without a file.
    pub fn edited(&self) -> Option<SystemTime> {
        self.edited
    }

    /// Whether the page has a file on disk (or had one when last read or written).
    pub fn has_file(&self) -> bool {
        self.on_disk.is_some()
    }

    /// Whether the page has a file, or a block whose text is not blank.
    /// A page without either is a new page nobody has touched.
    pub fn has_content(&self) -> bool {
        self.has_file()
            || self
                .doc
                .blocks()
                .iter()
                .any(|b| !b.text().trim().is_empty())
    }

    /// Whether the page holds edits its file does not: its text differs
    /// from the file's, or it has no file and has content.
    pub fn is_unsaved(&self) -> bool {
        match &self.on_disk {
            Some(_) if self.blank_on_empty_file() => false,
            Some(old) => self.doc.render() != *old,
            None => !is_blank(&self.doc),
        }
    }

    /// Whether the file holds nothing but the preamble (a moved page's
    /// empty file) and the page has no block with text: blank blocks are
    /// not written into such a file, so it stays as it is until text is typed.
    fn blank_on_empty_file(&self) -> bool {
        self.on_disk.as_deref() == Some(self.doc.preamble()) && is_blank(&self.doc)
    }
}

/// The pages that link to a page: one entry per linking page.
#[derive(Debug)]
pub struct Backlinks<'a> {
    pub page: &'a Page,
    /// The linking blocks none of whose ancestors link, in document order.
    pub roots: Vec<BlockId>,
}

/// A name used as `#tag`, for the sidebar's Tags section.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagEntry {
    pub key: String,
    /// The page's name when there is a page, else the first spelling.
    pub name: String,
    /// The blocks that have the tag.
    pub count: usize,
    /// No file and no text of its own.
    pub linked_only: bool,
}

/// A page name for completion: an existing page or a link target without one.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NameEntry {
    pub key: String,
    pub name: String,
    pub exists: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LoadWarning {
    NotUtf8(PathBuf),
    BadJournalName(PathBuf),
    /// A folder, or a `.md` file, whose name is not valid Unicode. Not loaded.
    NonUnicodeName(PathBuf),
    /// A link to a folder (relative path). Breccia does not follow it.
    LinkedFolder(PathBuf),
    /// A page file whose extension is `.MD`, `.Md`, …; only `.md` is loaded.
    ExtensionCase(PathBuf),
    /// A file `open` could not read. The folder still opens.
    Unreadable {
        path: PathBuf,
        error: String,
    },
    /// A page whose name, from its file stem, is not a valid page name and
    /// which has no valid `title::`. It is not loaded and never written.
    InvalidName(PathBuf),
    DuplicatePage {
        key: String,
        kept: PathBuf,
        ignored: PathBuf,
    },
    /// A page lists an alias that is the name of another page; links to it
    /// go to that page. Paths are `/`-separated.
    AliasIsName {
        alias: String,
        listed_in: PathBuf,
        page: PathBuf,
    },
    /// Two pages list the same alias; links to it go to `kept`.
    DuplicateAlias {
        alias: String,
        kept: PathBuf,
        ignored: PathBuf,
    },
}

impl LoadWarning {
    /// The path (relative to the notes folder) the warning is about.
    pub fn path(&self) -> &Path {
        match self {
            LoadWarning::NotUtf8(p)
            | LoadWarning::BadJournalName(p)
            | LoadWarning::NonUnicodeName(p)
            | LoadWarning::LinkedFolder(p)
            | LoadWarning::ExtensionCase(p)
            | LoadWarning::InvalidName(p) => p,
            LoadWarning::Unreadable { path, .. } => path,
            LoadWarning::DuplicatePage { ignored, .. }
            | LoadWarning::DuplicateAlias { ignored, .. } => ignored,
            LoadWarning::AliasIsName { listed_in, .. } => listed_in,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum OpenError {
    #[error("cannot read notes folder: {0}")]
    Io(#[from] io::Error),
    #[error(transparent)]
    Config(#[from] ConfigError),
    #[error("folder is not empty: {0}")]
    NotEmpty(PathBuf),
}

#[derive(Debug, PartialEq, Eq)]
pub enum SaveOutcome {
    Unchanged,
    NotCreated,
    Written(PathBuf),
}

#[derive(Debug, thiserror::Error)]
pub enum SaveError {
    #[error("cannot write page: {0}")]
    Io(#[from] io::Error),
    #[error("unknown page: {0}")]
    UnknownPage(String),
    #[error("a file already exists at {0}")]
    PathTaken(PathBuf),
    #[error("the file changed on disk: {0}")]
    ChangedOnDisk(PathBuf),
    #[error("the page file is a link to a file that does not exist: {0}")]
    DanglingLink(PathBuf),
}

#[derive(Debug, thiserror::Error)]
pub enum ReloadError {
    #[error("cannot read page: {0}")]
    Io(#[from] io::Error),
    #[error("file is not valid UTF-8: {0}")]
    NotUtf8(PathBuf),
    #[error("unknown page: {0}")]
    UnknownPage(String),
    #[error("page has no file: {0}")]
    NoFile(String),
}

#[derive(Debug, thiserror::Error)]
pub enum PageError {
    #[error("invalid page name: {0:?}")]
    InvalidName(String),
    #[error("a page name cannot contain [, ] or |: {0:?}")]
    NotLinkable(String),
    #[error("a page with this name exists: {0}")]
    Exists(String),
    #[error("“{name}” is an alias of the page “{page}”")]
    IsAlias { name: String, page: String },
    #[error("unknown folder: {0}")]
    UnknownFolder(String),
    #[error("a folder with this name exists: {0}")]
    FolderExists(String),
    #[error("journal days cannot be renamed, moved or colored: {0}")]
    Journal(String),
    #[error("unknown page color: {0:?}")]
    UnknownColor(String),
    #[error("unknown page: {0}")]
    UnknownPage(String),
    #[error("folder is not empty: {0}")]
    FolderNotEmpty(String),
    #[error("cannot move a folder into itself: {0}")]
    IntoItself(String),
    #[error("the file changed on disk: {0}")]
    ChangedOnDisk(PathBuf),
    #[error("cannot change the files: {0}")]
    Io(#[from] io::Error),
}

/// What a reload did.
#[derive(Debug)]
pub struct Reloaded {
    /// The page's key after the reload; new if its `title::` changed.
    pub key: String,
    pub carried: Carried,
    /// Set if the new name was taken, so the old one stayed.
    pub warning: Option<LoadWarning>,
}

/// What [`Workspace::apply_disk_changes`] did.
#[derive(Debug, Default)]
pub struct DiskReport {
    /// Pages re-read from their files, and blank pages without a file that
    /// took the content of a new file of their name.
    pub reloaded: Vec<Reloaded>,
    /// Pages loaded from new files, by key.
    pub added: Vec<String>,
    /// Keys that no longer name a page: the file is gone, or a reload gave
    /// the page a new key.
    pub removed: Vec<String>,
    /// Pages with unsaved edits whose file changed, went away, or appeared;
    /// they are left as they are.
    pub kept_unsaved: Vec<String>,
    /// `(old, new)` keys of pages whose reload gave them a new key.
    pub rekeyed: Vec<(String, String)>,
    pub warnings: Vec<LoadWarning>,
    /// Documents of pages removed in this batch, so a page loaded again
    /// under the same key (a file moved on disk) keeps its block IDs.
    gone: HashMap<String, Document>,
}

/// What a page rename did beyond renaming the page.
#[derive(Debug)]
pub struct RenameReport {
    /// The page's key under its new name.
    pub key: String,
    /// The pages whose links were rewritten, by key; the renamed page is
    /// among them if it links to itself.
    pub rewritten: Vec<String>,
    /// Blocks (or preambles) with links to the page that were left alone.
    pub skipped: usize,
    /// Pages whose rewrite is kept in memory but could not be saved.
    pub save_errors: Vec<(String, SaveError)>,
    /// Pages the rename saved successfully (the renamed page and the
    /// rewritten ones); empty if it changed nothing.
    pub saved: Vec<String>,
}

pub struct Workspace {
    pub root: PathBuf,
    pub config: Config,
    /// The text of `breccia/config.toml` that `config` was read from or
    /// last written as (`None`: the file was missing).
    pub(crate) config_text: Option<String>,
    pages: HashMap<String, Page>,
    ids: IdGen,
    block_index: HashMap<BlockId, String>,
    links: LinkIndex,
    /// Each page's aliases and the page each alias goes to.
    names: names::Names,
    /// Folders under `pages/` as `/`-joined paths, empty ones included.
    folders: BTreeSet<String>,
    /// Page key → color, for the non-journal pages with a valid `color::`.
    colors: HashMap<String, crate::color::PageColor>,
    /// Versions and key sets that say what changed; see `changes`.
    changes: changes::Changes,
    /// Relative paths a load warning was reported for since `open`: a file
    /// that stays broken is not reported again by every change event.
    warned: HashSet<PathBuf>,
}

impl Workspace {
    /// Creates a new notes folder at `root`, which must not exist or be empty.
    pub fn create(root: &Path) -> Result<Workspace, OpenError> {
        match fs::read_dir(root) {
            Ok(mut entries) => {
                if entries.next().is_some() {
                    return Err(OpenError::NotEmpty(root.to_path_buf()));
                }
            }
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            // Something that is not a directory is in the way.
            Err(_) if root.exists() && !root.is_dir() => {
                return Err(OpenError::NotEmpty(root.to_path_buf()));
            }
            Err(e) => return Err(e.into()),
        }
        fs::create_dir_all(root.join(JOURNALS))?;
        fs::create_dir_all(root.join(PAGES))?;
        write_atomic(&layout::config_path(root), Config::default_toml())?;
        let (config, text, _) = Config::load_with_text(root)?;
        Ok(Workspace::empty(root, config, text))
    }

    /// Opens a notes folder and loads every page into memory.
    pub fn open(root: &Path) -> Result<(Workspace, Vec<LoadWarning>), OpenError> {
        let (config, text, _) = Config::load_with_text(root)?;
        let mut ws = Workspace::empty(root, config, text);
        let mut warnings = Vec::new();

        let mut found = scan_journals(root, &mut warnings)?;
        let mut pages = Vec::new();
        let mut folders = Vec::new();
        walk_pages(
            root,
            Path::new(PAGES),
            &mut pages,
            &mut folders,
            &mut warnings,
        )?;
        ws.folders.extend(folders);
        pages.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
        found.extend(pages);

        // Journals come first, then pages in path order: the first one wins.
        ws.begin_alias_batch();
        for f in found {
            ws.load_file(f, &mut warnings);
        }
        ws.end_alias_batch();
        ws.warned = warnings.iter().map(|w| w.path().to_path_buf()).collect();
        // After `warned` is filled: an alias warning never hides a later
        // real warning for the same file.
        warnings.extend(ws.take_alias_warnings());
        Ok((ws, warnings))
    }

    fn empty(root: &Path, config: Config, config_text: Option<String>) -> Workspace {
        Workspace {
            root: root.to_path_buf(),
            config,
            config_text,
            pages: HashMap::new(),
            ids: IdGen::new(),
            block_index: HashMap::new(),
            links: LinkIndex::new(),
            names: names::Names::default(),
            folders: BTreeSet::new(),
            colors: HashMap::new(),
            changes: changes::Changes::default(),
            warned: HashSet::new(),
        }
    }

    /// Reads a found file into a page and adds it, unless its key is taken.
    /// Returns the key of the page added.
    fn load_file(&mut self, found: Found, warnings: &mut Vec<LoadWarning>) -> Option<String> {
        let page = match self.read_page(found) {
            Ok(page) => page,
            Err(w) => {
                warnings.push(w);
                return None;
            }
        };
        self.add_page(page, warnings)
    }

    /// Reads a found file into a page, without adding it.
    fn read_page(&mut self, f: Found) -> Result<Page, LoadWarning> {
        let path = self.root.join(&f.rel_path);
        let text = decode(&f.rel_path, fs::read(&path))?;
        let meta = fs::metadata(&path).ok();
        let edited = meta.as_ref().and_then(|m| m.modified().ok());
        let created = meta.as_ref().and_then(|m| m.created().ok());
        let doc = parse(&text, &mut self.ids);
        let name = match f.journal {
            Some(_) => f.stem,
            None => preamble_title(&doc.preamble).unwrap_or(f.stem),
        };
        if !is_valid_page_name(&name) {
            return Err(LoadWarning::InvalidName(f.rel_path));
        }
        Ok(Page {
            key: page_key(&name),
            name,
            kind: f.journal.map_or(PageKind::Page, PageKind::Journal),
            folder: f.folder,
            rel_path: f.rel_path,
            doc,
            on_disk: Some(text),
            edited,
            created,
        })
    }

    /// Adds a page read from a file, unless its key is taken.
    fn add_page(&mut self, page: Page, warnings: &mut Vec<LoadWarning>) -> Option<String> {
        if let Some(kept) = self.pages.get(&page.key) {
            warnings.push(LoadWarning::DuplicatePage {
                key: page.key,
                kept: kept.rel_path.clone(),
                ignored: page.rel_path,
            });
            return None;
        }
        let key = page.key.clone();
        self.insert(page);
        Some(key)
    }

    fn insert(&mut self, page: Page) {
        for b in &page.doc.blocks {
            self.block_index.insert(b.id, page.key.clone());
        }
        let key = page.key.clone();
        self.changes.touch(&key);
        self.pages.insert(key.clone(), page);
        self.index_page(&key);
    }

    /// The keys of the pages whose blocks, name or existence changed, or
    /// whose file was written, since the last call; sorted, without repeats.
    /// `open` leaves every loaded page touched.
    pub fn take_touched(&mut self) -> Vec<String> {
        self.changes.take_touched()
    }

    /// Whether page `key`'s file still holds what Breccia last read or wrote
    /// (a page without a file counts as matching); false for an unknown page.
    pub(crate) fn matches_disk(&self, key: &str) -> bool {
        self.pages
            .get(key)
            .is_some_and(|p| self.check_on_disk(p).is_ok())
    }

    /// The pages with edits their files do not hold, by key.
    pub fn unsaved(&self) -> Vec<&Page> {
        let mut out: Vec<&Page> = self.pages.values().filter(|p| p.is_unsaved()).collect();
        out.sort_by(|a, b| a.key.cmp(&b.key));
        out
    }

    pub fn page(&self, key: &str) -> Option<&Page> {
        self.pages.get(key)
    }

    pub fn pages(&self) -> impl Iterator<Item = &Page> {
        self.pages.values()
    }

    /// The pages of the journal feed. The page named for `today` comes first
    /// if there is one, whatever its kind and content; then every earlier
    /// journal with content (a preamble counts), newest first.
    pub fn journal_feed(&self, today: NaiveDate) -> Vec<&Page> {
        let mut older: Vec<(NaiveDate, &Page)> = self
            .pages
            .values()
            .filter_map(|p| match p.kind {
                PageKind::Journal(d) if d < today && !p.doc.is_blank() => Some((d, p)),
                _ => None,
            })
            .collect();
        older.sort_by(|a, b| b.0.cmp(&a.0));
        self.pages
            .get(&journal_name(today))
            .into_iter()
            .chain(older.into_iter().map(|(_, p)| p))
            .collect()
    }

    /// The folders under `pages/` as `/`-joined paths, empty ones included.
    pub fn folders(&self) -> impl Iterator<Item = &str> {
        self.folders.iter().map(String::as_str)
    }

    /// Goes up whenever the page tree may have changed: a page file is first
    /// written, a folder is created, and so on.
    pub fn tree_version(&self) -> u64 {
        self.changes.tree_version()
    }

    /// Goes up whenever the linked-only pages may have changed; the session
    /// resends the tree then.
    pub fn link_version(&self) -> u64 {
        self.changes.link_version()
    }

    /// The known folder equal to `path` ignoring case.
    fn find_folder(&self, path: &str) -> Option<&str> {
        let lower = path.to_lowercase();
        self.folders().find(|f| f.to_lowercase() == lower)
    }

    /// The page holding a block and the block's index in it.
    pub fn locate(&self, id: BlockId) -> Option<(&Page, usize)> {
        let page = self.pages.get(self.block_index.get(&id)?)?;
        Some((page, page.doc.index_of(id)?))
    }

    /// The pages whose blocks link to `key` (or to one of its aliases),
    /// other than the page itself: pages by key, then journals newest first.
    pub fn backlinks(&self, key: &str) -> Vec<Backlinks<'_>> {
        let keys = self.link_keys(key);
        let maps: Vec<&BTreeMap<String, Vec<BlockId>>> = keys
            .iter()
            .filter_map(|k| self.links.sources_ref(k))
            .collect();
        let mut out: Vec<Backlinks<'_>> = Vec::new();
        let mut push = |src: &str, linking: &dyn Fn(&BlockId) -> bool| {
            if src == key {
                return;
            }
            let Some(page) = self.pages.get(src) else {
                return;
            };
            let mut roots = Vec::new();
            let mut inside: Option<usize> = None;
            for b in page.doc.blocks() {
                if inside.is_some_and(|d| b.depth() > d) {
                    continue;
                }
                inside = None;
                if linking(&b.id()) {
                    roots.push(b.id());
                    inside = Some(b.depth());
                }
            }
            out.push(Backlinks { page, roots });
        };
        if let [one] = maps.as_slice() {
            // One key (no aliases, no heading links): borrow its sources.
            for (src, ids) in one.iter() {
                push(src, &|id| ids.contains(id));
            }
        } else {
            let mut by_source: BTreeMap<&str, HashSet<BlockId>> = BTreeMap::new();
            for m in &maps {
                for (src, ids) in m.iter() {
                    by_source
                        .entry(src.as_str())
                        .or_default()
                        .extend(ids.iter().copied());
                }
            }
            for (src, linking) in &by_source {
                push(src, &|id| linking.contains(id));
            }
        }
        out.sort_by(|a, b| match (&a.page.kind, &b.page.kind) {
            (PageKind::Page, PageKind::Page) => a.page.key.cmp(&b.page.key),
            (PageKind::Page, PageKind::Journal(_)) => std::cmp::Ordering::Less,
            (PageKind::Journal(_), PageKind::Page) => std::cmp::Ordering::Greater,
            (PageKind::Journal(x), PageKind::Journal(y)) => y.cmp(x),
        });
        out
    }

    /// The page's linked-references count: the blocks shown under it in
    /// "Linked references" (a block nested under a linking block counts once).
    pub fn linked_from(&self, key: &str) -> usize {
        self.backlinks(key).iter().map(|b| b.roots.len()).sum()
    }

    /// How many different other pages `key` links to (aliases resolved).
    pub fn links_out(&self, key: &str) -> usize {
        self.links
            .targets_of(key)
            .map(|t| self.resolve_key_ref(t))
            .filter(|t| *t != key)
            .collect::<HashSet<&str>>()
            .len()
    }

    /// Every page with a file or content; every winning alias whose key is
    /// no page with content (a blank page of that key does not hide it);
    /// and every link target that goes to no page, except journal names.
    /// Sorted by key.
    pub fn page_names(&self) -> Vec<NameEntry> {
        let mut out: Vec<NameEntry> = self
            .pages
            .values()
            .filter(|p| p.kind == PageKind::Page)
            .filter(|p| p.has_content())
            .map(|p| NameEntry {
                key: p.key.clone(),
                name: p.name.clone(),
                exists: true,
            })
            .collect();
        for (key, name) in self.alias_names() {
            out.push(NameEntry {
                key,
                name,
                exists: true,
            });
        }
        let known: HashSet<String> = out.iter().map(|e| e.key.clone()).collect();
        for (key, spelling) in self.links.targets() {
            if known.contains(key)
                || self.resolve_key(key) != key
                || parse_journal_name(spelling).is_some()
            {
                continue;
            }
            out.push(NameEntry {
                key: key.to_string(),
                name: spelling.to_string(),
                exists: false,
            });
        }
        out.sort_by(|a, b| a.key.cmp(&b.key));
        out
    }

    /// Runs an edit on a page's document and re-indexes its blocks.
    pub fn edit<R>(
        &mut self,
        key: &str,
        f: impl FnOnce(&mut Document, &mut IdGen) -> R,
    ) -> Option<R> {
        self.edit_with_config(key, |d, ids, _| f(d, ids))
    }

    /// Like [`edit`](Self::edit), with the folder's config at hand.
    pub(crate) fn edit_with_config<R>(
        &mut self,
        key: &str,
        f: impl FnOnce(&mut Document, &mut IdGen, &Config) -> R,
    ) -> Option<R> {
        self.with_page(key, |p, ids, cfg| f(&mut p.doc, ids, cfg))
    }

    /// Removes a page, its block ids and its links, and marks its key
    /// touched. The one way a page leaves the workspace.
    fn take_page(&mut self, key: &str) -> Option<Page> {
        let page = self.pages.remove(key)?;
        for b in &page.doc.blocks {
            self.block_index.remove(&b.id);
        }
        self.unindex_page(key);
        self.changes.touch(key);
        Some(page)
    }

    /// Runs `f` on a page, then indexes its blocks and links again. The one
    /// way a page's blocks are replaced in place.
    fn with_page<R>(
        &mut self,
        key: &str,
        f: impl FnOnce(&mut Page, &mut IdGen, &Config) -> R,
    ) -> Option<R> {
        let page = self.pages.get_mut(key)?;
        for b in &page.doc.blocks {
            self.block_index.remove(&b.id);
        }
        let result = f(page, &mut self.ids, &self.config);
        for b in &page.doc.blocks {
            self.block_index.insert(b.id, page.key.clone());
        }
        self.changes.touch(&page.key);
        self.index_page(key);
        Some(result)
    }

    /// Writes a page to its file if its text changed. A page without a file
    /// gets one only once it has content and its path is still free. A page
    /// with a file is only written while the file still holds what was read.
    /// A blank page without a file is never created here (`NotCreated`);
    /// only [`create_file`](Self::create_file) writes one.
    pub fn save(&mut self, key: &str) -> Result<SaveOutcome, SaveError> {
        self.save_with(key, false, false)
    }

    /// Like [`save`](Self::save), but a page without a file gets one even
    /// when it is blank: the file then holds only the preamble, often nothing.
    /// For a page moved into a folder before it had a file.
    pub fn create_file(&mut self, key: &str) -> Result<SaveOutcome, SaveError> {
        self.save_with(key, false, true)
    }

    /// Like [`save`](Self::save) but skips the changed-on-disk check, so it
    /// replaces a file Breccia did not read. Only for an explicit user choice.
    pub fn save_overwrite(&mut self, key: &str) -> Result<SaveOutcome, SaveError> {
        self.save_with(key, true, false)
    }

    fn save_with(
        &mut self,
        key: &str,
        overwrite: bool,
        create: bool,
    ) -> Result<SaveOutcome, SaveError> {
        let page = self
            .pages
            .get_mut(key)
            .ok_or_else(|| SaveError::UnknownPage(key.to_string()))?;
        let text = page.doc.render();
        let path = self.root.join(&page.rel_path);
        if page.on_disk.as_ref() == Some(&text) || page.blank_on_empty_file() {
            return Ok(SaveOutcome::Unchanged);
        }
        // First, so the answer is not ChangedOnDisk or PathTaken: the file is a
        // link whose target is gone, and the write would be refused anyway.
        if path
            .symlink_metadata()
            .is_ok_and(|m| m.file_type().is_symlink())
            && fs::metadata(&path).is_err_and(|e| e.kind() == io::ErrorKind::NotFound)
        {
            return Err(SaveError::DanglingLink(path));
        }
        match &page.on_disk {
            Some(old) => {
                // Never overwrite bytes Breccia did not read: a file that is gone,
                // unreadable or different counts as changed.
                if !overwrite && fs::read(&path).map_or(true, |now| now != old.as_bytes()) {
                    return Err(SaveError::ChangedOnDisk(path));
                }
            }
            None => {
                // The `title::` preamble of a new page is Breccia's own; ignore it.
                if !create && page.doc.blocks.iter().all(|b| b.text.trim().is_empty()) {
                    return Ok(SaveOutcome::NotCreated);
                }
                // Keep mine may replace a file at exactly this page's path,
                // never another one (such as another case of its name).
                if path_taken(&path)? && !(overwrite && is_exact_file(&path)) {
                    return Err(SaveError::PathTaken(path));
                }
            }
        }
        // Every save writes LF; a file that is never saved keeps its bytes.
        page.doc.to_lf();
        let text = page.doc.render();
        write_atomic(&path, &text)?;
        self.changes.touch(key);
        let first_write = page.on_disk.is_none();
        page.on_disk = Some(text);
        let meta = fs::metadata(&path).ok();
        page.edited = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .or_else(|| Some(SystemTime::now()));
        page.created = meta
            .as_ref()
            .and_then(|m| m.created().ok())
            .or(page.created);
        if first_write {
            self.changes.bump_tree();
        }
        Ok(SaveOutcome::Written(path))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn put(root: &Path, rel: &str, text: &str) {
        let p = root.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, text).unwrap();
    }

    /// Every block of every page is in the block index, and nothing else.
    fn assert_index_exact(ws: &Workspace, what: &str) {
        let blocks: usize = ws.pages.values().map(|p| p.doc.blocks.len()).sum();
        assert_eq!(ws.block_index.len(), blocks, "{what}");
    }

    #[test]
    fn the_block_index_holds_exactly_the_blocks_of_the_pages() {
        let t = tempfile::tempdir().unwrap();
        for (rel, text) in [
            ("pages/Keep.md", "- k\n"),
            ("pages/Ren.md", "- r1\n- r2\n"),
            ("pages/Del.md", "- d\n"),
            ("pages/Gone.md", "- g\n"),
        ] {
            put(t.path(), rel, text);
        }
        let (mut ws, _) = Workspace::open(t.path()).unwrap();
        ws.create_folder("sub").unwrap();
        ws.create_page("Inner", "sub").unwrap();
        ws.edit("inner", |d, ids| d.insert_after(None, "", ids).unwrap())
            .unwrap();
        assert_index_exact(&ws, "open");

        ws.delete_page("del").unwrap();
        assert_index_exact(&ws, "delete_page");
        ws.delete_folder("sub").unwrap();
        assert_index_exact(&ws, "delete_folder");
        ws.rename_page("ren", "Ren2").unwrap();
        assert_index_exact(&ws, "rename");

        fs::remove_file(t.path().join("pages/Gone.md")).unwrap();
        ws.apply_disk_changes(&["pages/Gone.md".into()]);
        assert_index_exact(&ws, "file_gone");

        ws.ensure_page("Fresh").unwrap();
        put(t.path(), "pages/Fresh.md", "- f1\n- f2\n");
        ws.apply_disk_changes(&["pages/Fresh.md".into()]);
        assert_index_exact(&ws, "adopt");
    }
}
