//! `search.query` and the search index of the open folder: which pages are
//! waiting to be indexed, the background build's progress, and the views.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use chrono::NaiveDate;
use serde::Serialize;

use crate::dates::parse_typed_date;
use crate::naming::{journal_display, journal_name, parse_journal_name};

use crate::inline::links;
use crate::outline::BlockId;
use crate::search::{
    Hit, Query, SearchError, SearchIndex, Segment, index_file_name, parse_query, remove_index_files,
};
use crate::workspace::{PageKind, Workspace};

use super::Session;
use super::view::{CommandError, Notice, Output, PageViewKind, title_of};

/// At most this many hits are shown; one more is fetched to know about more.
pub const SEARCH_LIMIT: usize = 200;

/// How far the background build of the index is.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexProgress {
    pub done: usize,
    pub total: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchView {
    /// The text sent.
    pub query: String,
    /// The free words as typed, joined by one space.
    pub text: String,
    /// Whether the text holds a state or a link filter.
    pub filtered: bool,
    pub date: Option<DateView>,
    pub groups: Vec<SearchGroup>,
    /// More than [`SEARCH_LIMIT`] blocks matched.
    pub more: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DateView {
    pub key: String,
    pub title: String,
    pub in_feed: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchGroup {
    pub page: String,
    /// The long date for a journal, else the name.
    pub title: String,
    pub kind: PageViewKind,
    pub hits: Vec<SearchHit>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub id: BlockId,
    pub state: Option<String>,
    pub segments: Vec<Segment>,
}

impl SearchView {
    /// Groups `hits` by page in order of first appearance. `hits` come from
    /// an index that was updated under the same lock, so every position
    /// names a block of the page.
    fn build(
        query: &str,
        q: &Query,
        mut hits: Vec<Hit>,
        ws: &Workspace,
        today: NaiveDate,
    ) -> SearchView {
        let more = hits.len() > SEARCH_LIMIT;
        hits.truncate(SEARCH_LIMIT);
        let mut groups: Vec<SearchGroup> = Vec::new();
        for hit in hits {
            let Some(page) = ws.page(&hit.page) else {
                continue;
            };
            let Some(block) = page.doc.blocks().get(hit.pos) else {
                continue;
            };
            let at = match groups.iter().position(|g| g.page == hit.page) {
                Some(at) => at,
                None => {
                    let (kind, title) = title_of(page);
                    groups.push(SearchGroup {
                        page: hit.page.clone(),
                        title,
                        kind,
                        hits: Vec::new(),
                    });
                    groups.len() - 1
                }
            };
            groups[at].hits.push(SearchHit {
                id: block.id(),
                state: hit.state,
                segments: hit.segments,
            });
        }
        SearchView {
            query: query.to_string(),
            text: q.words.join(" "),
            filtered: !q.states.is_empty() || !q.links.is_empty(),
            date: parse_typed_date(query, today).map(|d| date_view(d, today, ws)),
            groups,
            more,
        }
    }
}

impl Session {
    /// `journal.day`: the "Go to" line of day `key`, for the date picker.
    pub(super) fn journal_day(
        &mut self,
        key: &str,
        today: NaiveDate,
    ) -> Result<Output, CommandError> {
        let d = parse_journal_name(key).ok_or_else(|| {
            CommandError::new("badDate", format_args!("not a journal day: {key}"))
        })?;
        Ok(Output {
            day: Some(date_view(d, today, self.ws()?)),
            ..Output::default()
        })
    }
}

/// The "Go to" line for `d`; `in_feed` follows `Workspace::journal_feed`.
fn date_view(d: NaiveDate, today: NaiveDate, ws: &Workspace) -> DateView {
    let key = journal_name(d);
    let in_feed = d == today
        || (d < today
            && ws
                .page(&key)
                .is_some_and(|p| matches!(p.kind, PageKind::Journal(_)) && !p.doc.is_blank()));
    DateView {
        key,
        title: journal_display(d),
        in_feed,
    }
}

/// The index of an open folder and what it still has to take in.
#[derive(Default)]
pub(super) struct IndexState {
    /// Where the indexes live; `None` keeps them in memory.
    cache: Option<PathBuf>,
    index: Option<SearchIndex>,
    /// The stored index in use; `None` while the index is in memory.
    file: Option<PathBuf>,
    /// Whether a damaged file was already rebuilt for this folder.
    rebuilt: bool,
    /// Set when the index had to move to memory; shown by the next query.
    warning: Option<Notice>,
    /// Keys of pages whose rows may not be current.
    pending: BTreeSet<String>,
    /// The pages of the current build, so progress can be shown.
    build_total: usize,
    /// How many pages the last [`Session::index_step`] indexed.
    step_pages: usize,
}

impl IndexState {
    pub(super) fn with_cache(dir: PathBuf) -> IndexState {
        IndexState {
            cache: Some(dir),
            ..IndexState::default()
        }
    }

    /// The cache directory, if there is one.
    pub(super) fn cache_dir(&self) -> Option<&Path> {
        self.cache.as_deref()
    }

    /// Adds `keys`; only keys not yet pending grow the build.
    fn add_pending(&mut self, keys: impl IntoIterator<Item = String>) {
        for key in keys {
            if self.pending.insert(key) {
                self.build_total += 1;
            }
        }
    }

    /// Ends the build once nothing is pending.
    fn finish_if_idle(&mut self) {
        if self.pending.is_empty() {
            self.build_total = 0;
        }
    }

    /// Opens the index of `ws` (in memory when it cannot be stored) and
    /// queues the pages whose rows are not current. A damaged file is
    /// deleted and built again once, without a warning. Returns a warning
    /// when the file could not be used.
    pub(super) fn open(&mut self, ws: &mut Workspace) -> Option<Notice> {
        self.index = None;
        self.file = None;
        self.rebuilt = false;
        self.warning = None;
        self.pending.clear();
        self.build_total = 0;
        let touched = ws.take_touched();
        let mut warning = None;
        if let Some(dir) = &self.cache {
            let file = dir.join(index_file_name(&ws.root));
            // A file that is not a database is deleted without counting as
            // the rebuild; damage found while reading it counts.
            let open_fresh = || match SearchIndex::open(&file) {
                Err(e) if e.is_damage() => {
                    remove_index_files(&file).and_then(|()| SearchIndex::open(&file))
                }
                other => other,
            };
            let try_open = || open_fresh().and_then(|i| prepare(i, ws, &touched));
            let mut result = try_open();
            if result.as_ref().is_err_and(SearchError::is_damage) {
                self.rebuilt = true;
                result = remove_index_files(&file).and_then(|()| try_open());
            }
            match result {
                Ok((index, stale)) => {
                    self.index = Some(index);
                    self.file = Some(file);
                    self.add_pending(stale);
                    return None;
                }
                Err(e) => warning = Some(cannot_store(&e)),
            }
        }
        match SearchIndex::in_memory().and_then(|i| prepare(i, ws, &touched)) {
            Ok((index, stale)) => {
                self.index = Some(index);
                self.add_pending(stale);
            }
            Err(e) => {
                warning = Some(Notice::LoadWarning {
                    message: format!("the search index cannot be built ({e}); search is off"),
                });
            }
        }
        warning
    }

    /// The stored index was found damaged: the first time it is deleted and
    /// built again; after that (or when it cannot be deleted) the index
    /// stays in memory and `warning` says so. Every page is queued.
    fn recover(&mut self, ws: &Workspace, cause: &SearchError) {
        // The file cannot be deleted while a connection holds it (Windows).
        self.index = None;
        let file = self.file.take();
        let mut fresh = None;
        if let Some(file) = file.filter(|_| !self.rebuilt) {
            self.rebuilt = true;
            if remove_index_files(&file).is_ok()
                && let Ok(index) = SearchIndex::open(&file)
            {
                fresh = Some(index);
                self.file = Some(file);
            }
        }
        if fresh.is_none() {
            fresh = SearchIndex::in_memory().ok();
            self.warning = Some(cannot_store(cause));
        }
        self.index = fresh;
        self.pending.clear();
        self.build_total = 0;
        let keys: Vec<String> = ws
            .pages()
            .filter(|p| p.has_content())
            .map(|p| p.key.clone())
            .collect();
        self.add_pending(keys);
    }

    /// Runs `work`; when it meets a damaged stored index, recovers and runs
    /// it once more. A second error is returned as is.
    fn guarded<T>(
        &mut self,
        ws: &mut Workspace,
        mut work: impl FnMut(&mut IndexState, &mut Workspace) -> Result<T, SearchError>,
    ) -> Result<T, SearchError> {
        match work(self, ws) {
            Err(e) if e.is_damage() && self.file.is_some() => {
                self.recover(ws, &e);
                work(self, ws)
            }
            other => other,
        }
    }

    /// Queues the pages touched since the last call whose rows are not current.
    fn collect(&mut self, ws: &mut Workspace) -> Result<(), SearchError> {
        let Some(index) = &self.index else {
            return Ok(());
        };
        let touched = ws.take_touched();
        match index.stale(ws, &touched) {
            Ok(stale) => {
                self.add_pending(stale);
                Ok(())
            }
            Err(e) => {
                // Keep them all: `update` skips the current ones.
                self.add_pending(touched);
                Err(e)
            }
        }
    }

    /// Updates up to `max` pending pages and returns how many it updated.
    fn flush(&mut self, ws: &Workspace, max: Option<usize>) -> Result<usize, SearchError> {
        let Some(index) = &mut self.index else {
            return Ok(0);
        };
        let batch: Vec<String> = self
            .pending
            .iter()
            .take(max.unwrap_or(usize::MAX))
            .cloned()
            .collect();
        index.update(ws, &batch)?;
        for key in &batch {
            self.pending.remove(key);
        }
        Ok(batch.len())
    }
}

/// Removes the rows of pages that are gone and lists which of `touched` have
/// rows that are not current.
fn prepare(
    mut index: SearchIndex,
    ws: &Workspace,
    touched: &[String],
) -> Result<(SearchIndex, Vec<String>), SearchError> {
    index.prune(ws)?;
    let stale = index.stale(ws, touched)?;
    Ok((index, stale))
}

fn cannot_store(e: &SearchError) -> Notice {
    Notice::LoadWarning {
        message: format!(
            "the search index cannot be stored ({e}); it is built again at each start"
        ),
    }
}

fn search_error(e: SearchError) -> CommandError {
    CommandError::new("search", e)
}

impl Session {
    /// The index of every opened folder is a file in `dir`.
    pub fn with_cache(dir: PathBuf) -> Session {
        Session {
            search: IndexState::with_cache(dir),
            ..Session::default()
        }
    }

    /// Opens the index of the folder just opened; a warning when it could
    /// not be stored.
    pub(super) fn open_index(&mut self) -> Option<Notice> {
        let ws = self.ws.as_mut()?;
        self.search.open(ws)
    }

    /// One step of the background build: updates up to `max_pages` pending
    /// pages. `None` when no folder is open or `generation` is not the
    /// session's. The build is finished when `done == total`.
    pub fn index_step(
        &mut self,
        generation: u64,
        max_pages: usize,
    ) -> Result<Option<IndexProgress>, CommandError> {
        self.search.step_pages = 0;
        if generation != self.generation {
            return Ok(None);
        }
        let Some(ws) = self.ws.as_mut() else {
            return Ok(None);
        };
        let search = &mut self.search;
        search.step_pages = search
            .guarded(ws, |s, ws| {
                s.collect(ws)?;
                s.flush(ws, Some(max_pages))
            })
            .map_err(search_error)?;
        let progress = IndexProgress {
            done: search.build_total - search.pending.len(),
            total: search.build_total,
        };
        search.finish_if_idle();
        Ok(Some(progress))
    }

    /// How many pages the last [`Session::index_step`] indexed.
    pub fn index_step_pages(&self) -> usize {
        self.search.step_pages
    }

    /// Updates every pending page, then answers with the matches of `text`.
    pub(super) fn run_query(
        &mut self,
        text: &str,
        today: NaiveDate,
    ) -> Result<Output, CommandError> {
        let ws = self.ws.as_mut().ok_or_else(CommandError::no_folder)?;
        let search = &mut self.search;
        let mut q = parse_query(text, &ws.config);
        // Each typed link also finds links written as an alias of its page
        // or to one of its headings.
        let mut seen: Vec<String> = Vec::new();
        for l in links(text) {
            if seen.contains(&l.key) {
                continue;
            }
            seen.push(l.key.clone());
            let keys = ws.link_keys(&ws.link_target(&l.target, l.kind).key);
            if let Some(entry) = q.links.get_mut(seen.len() - 1)
                && !keys.is_empty()
            {
                *entry = keys;
            }
        }
        let hits = search
            .guarded(ws, |s, ws| {
                s.collect(ws)?;
                s.flush(ws, None)?;
                s.finish_if_idle();
                s.index
                    .as_ref()
                    .map(|i| i.query(&q, SEARCH_LIMIT + 1))
                    .transpose()
            })
            .map_err(search_error)?
            .ok_or_else(|| CommandError::new("search", "the search index is not available"))?;
        Ok(Output {
            search: Some(SearchView::build(text, &q, hits, ws, today)),
            notices: search.warning.take().into_iter().collect(),
            ..Output::default()
        })
    }
}
