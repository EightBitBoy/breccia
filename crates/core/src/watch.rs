//! Watches the notes folder for changes other programs make.

use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::file_id::{FileId, get_file_id};
use notify_debouncer_full::{Debouncer, FileIdCache, new_debouncer_opt};

use crate::layout::{self, CONFIG_DIR, CONFIG_FILE, JOURNALS, PAGES};
use crate::workspace::{LoadWarning, NotePath, classify};

/// How long events are collected before a batch is passed on.
pub const DEBOUNCE_MS: u64 = 200;

#[derive(Debug, thiserror::Error)]
#[error("cannot watch the folder: {0}")]
pub struct WatchError(#[from] notify::Error);

/// The relative path of `path` if a page file (or a possible folder of
/// pages) lives there: a `.md` file directly in `journals/` (a name that is
/// not a date too), a `.md` file anywhere under `pages/`, a `.MD` file in
/// either place, `breccia/config.toml`, or an extension-less path under
/// `pages/` (the watcher's own rule: it might be a folder). No component may
/// start with `.`. The workspace's `classify` decides the files; a page file
/// it cannot load (a bad journal name, a `.MD` file) is passed on, so that
/// `files.changed` warns about it as `open` does.
pub fn relevant(root: &Path, path: &Path) -> Option<PathBuf> {
    let rel = path.strip_prefix(root).ok()?;
    let mut parts = Vec::new();
    for c in rel.components() {
        match c {
            Component::Normal(s) if !s.to_str()?.starts_with('.') => parts.push(s),
            _ => return None,
        }
    }
    let ok = match classify(rel) {
        Ok(Some(NotePath::Journal(_) | NotePath::Page { .. } | NotePath::Config)) => true,
        Err(LoadWarning::BadJournalName(_) | LoadWarning::ExtensionCase(_)) => true,
        Ok(None) => parts.len() >= 2 && parts[0] == PAGES && rel.extension().is_none(),
        Err(_) => false,
    };
    ok.then(|| rel.to_path_buf())
}

/// Like `relevant`, but also accepts a dotted folder name under `pages/`
/// (`v1.2`) when `path` currently is a directory, and any clean path under
/// `pages/` that does not exist any more (a deleted `v1.2`: `files.changed`
/// treats a gone path as "everything below it is gone").
pub fn relevant_now(root: &Path, path: &Path) -> Option<PathBuf> {
    relevant(root, path).or_else(|| {
        let rel = path.strip_prefix(root).ok()?;
        let mut comps = rel.components();
        let under_pages = matches!(comps.next(), Some(Component::Normal(s)) if s == PAGES);
        let clean = rel
            .components()
            .all(|c| matches!(c, Component::Normal(s) if !s.to_str().is_some_and(|s| s.starts_with('.'))));
        let gone = std::fs::symlink_metadata(path).is_err();
        (under_pages && clean && rel.components().count() >= 2 && (gone || path.is_dir()))
            .then(|| rel.to_path_buf())
    })
}

/// The relevant paths of one debouncer result. Errors and events that say
/// the queue overflowed (`need_rescan`) are logged and answered with a
/// rescan: every relevant path currently under `root`, so `files.changed`
/// can resync whatever events were lost.
pub fn batch_paths(
    root: &Path,
    result: notify_debouncer_full::DebounceEventResult,
) -> Vec<PathBuf> {
    let events = match result {
        Ok(events) => events,
        Err(errors) => {
            for e in &errors {
                log::warn!("watcher error: {e}");
            }
            return rescan(root);
        }
    };
    if events.iter().any(|e| e.event.need_rescan()) {
        log::warn!("watcher lost events; rescanning the folder");
        return rescan(root);
    }
    let mut paths: Vec<PathBuf> = Vec::new();
    for p in events.iter().flat_map(|e| e.event.paths.iter()) {
        if let Some(rel) = relevant_now(root, p)
            && !paths.contains(&rel)
        {
            paths.push(rel);
        }
    }
    paths
}

/// Every relevant path currently under `pages/` and `journals/`, and those
/// two folders themselves: `files.changed` drops every known page below a
/// reported folder whose file is gone, so files and folders deleted while
/// events were lost are found too.
pub fn rescan(root: &Path) -> Vec<PathBuf> {
    fn walk(root: &Path, dir: &Path, out: &mut Vec<PathBuf>) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(rel) = relevant_now(root, &path) {
                out.push(rel);
            }
            // Real directories only: a link to a folder is reported (so that
            // `files.changed` can say so) but never walked.
            let is_dir = entry.file_type().is_ok_and(|t| t.is_dir());
            if is_dir && !entry.file_name().to_string_lossy().starts_with('.') {
                walk(root, &path, out);
            }
        }
    }
    let mut out = Vec::new();
    // The settings file too, so a lost-events rescan follows a hand edit of it.
    if layout::config_path(root).is_file() {
        out.push(PathBuf::from(CONFIG_DIR).join(CONFIG_FILE));
    }
    for top in [PAGES, JOURNALS] {
        out.push(PathBuf::from(top));
        walk(root, &root.join(top), &mut out);
    }
    out.sort();
    out.dedup();
    out
}

/// The folders whose changes matter, with how deep to look. `.git` is not
/// among them, and the notes folder itself is watched one level deep only.
pub fn watch_roots(root: &Path) -> Vec<(PathBuf, RecursiveMode)> {
    vec![
        (root.to_path_buf(), RecursiveMode::NonRecursive),
        (root.join(PAGES), RecursiveMode::Recursive),
        (root.join(JOURNALS), RecursiveMode::Recursive),
        (root.join(CONFIG_DIR), RecursiveMode::NonRecursive),
    ]
}

/// The debouncer's file ID cache. Upstream's `FileIdMap` walks everything
/// below each path it is told about, links followed: a commit or fetch adds
/// every new file under `.git/objects`, and a folder link would be walked
/// twice. This one skips dot entries and links.
#[derive(Debug)]
pub struct NotesCache {
    root: PathBuf,
    ids: HashMap<PathBuf, FileId>,
}

impl NotesCache {
    pub fn new(root: &Path) -> NotesCache {
        NotesCache {
            root: root.to_path_buf(),
            ids: HashMap::new(),
        }
    }

    /// Records `path`, and below it everything but dot entries and folder
    /// links, if `recursive` (else only `path` and its direct children).
    fn walk(&mut self, path: &Path, recursive: bool, top: bool) {
        let Ok(meta) = std::fs::symlink_metadata(path) else {
            return;
        };
        if meta.file_type().is_symlink() && std::fs::metadata(path).is_ok_and(|m| m.is_dir()) {
            return;
        }
        if let Ok(id) = get_file_id(path) {
            self.ids.insert(path.to_path_buf(), id);
        }
        if !meta.is_dir() || !(top || recursive) {
            return;
        }
        let Ok(entries) = std::fs::read_dir(path) else {
            return;
        };
        for entry in entries.flatten() {
            if entry.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            self.walk(&entry.path(), recursive, false);
        }
    }
}

impl FileIdCache for NotesCache {
    fn cached_file_id(&self, path: &Path) -> Option<impl AsRef<FileId>> {
        self.ids.get(path)
    }

    fn add_path(&mut self, path: &Path, recursive_mode: RecursiveMode) {
        // Linux keeps upstream's `NoCache`: inotify reports renames whole.
        if cfg!(any(target_os = "linux", target_os = "android")) {
            return;
        }
        if path == self.root {
            for (p, mode) in watch_roots(&self.root) {
                self.walk(&p, mode == RecursiveMode::Recursive, true);
            }
            return;
        }
        let Ok(rel) = path.strip_prefix(&self.root) else {
            return;
        };
        let dotted = rel
            .components()
            .any(|c| c.as_os_str().to_string_lossy().starts_with('.'));
        if !dotted {
            self.walk(path, recursive_mode == RecursiveMode::Recursive, true);
        }
    }

    fn remove_path(&mut self, path: &Path) {
        self.ids.retain(|p, _| !p.starts_with(path));
    }
}

/// Watches a folder; dropping it stops watching.
pub struct FolderWatcher {
    _debouncer: Debouncer<RecommendedWatcher, NotesCache>,
}

impl FolderWatcher {
    /// Watches `root` recursively and passes on the relevant relative paths
    /// of each debounced batch, deduplicated and never empty.
    pub fn start(
        root: &Path,
        mut on_change: impl FnMut(Vec<PathBuf>) + Send + 'static,
    ) -> Result<FolderWatcher, WatchError> {
        let base = root.to_path_buf();
        let mut debouncer = new_debouncer_opt::<_, RecommendedWatcher, NotesCache>(
            Duration::from_millis(DEBOUNCE_MS),
            None,
            move |result: notify_debouncer_full::DebounceEventResult| {
                let paths = batch_paths(&base, result);
                if !paths.is_empty() {
                    on_change(paths);
                }
            },
            NotesCache::new(root),
            notify::Config::default(),
        )?;
        debouncer.watch(root, RecursiveMode::Recursive)?;
        Ok(FolderWatcher {
            _debouncer: debouncer,
        })
    }
}
