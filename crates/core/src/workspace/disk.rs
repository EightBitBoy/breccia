//! Following the disk: reloading pages and applying external changes.

use std::collections::BTreeSet;
use std::ffi::OsStr;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use super::files::{
    Found, has_md_extension, is_blank, is_exact_file, is_hidden, is_within, list_md,
    preamble_title, read_dir_sorted, walk_pages, within_or_all,
};
use super::{DiskReport, LoadWarning, Page, PageKind, ReloadError, Reloaded, Workspace};
use crate::layout::{JOURNALS, PAGES};
use crate::naming::{is_valid_page_name, page_key, parse_journal_name};
use crate::outline::{Carried, carry_ids, parse};

impl Workspace {
    /// Re-reads a page's file, replacing its document and what it holds as
    /// on-disk text, and re-indexes its blocks. Unsaved edits are dropped.
    /// Blocks that are still there keep their IDs. The name is read again
    /// (`title::` or the file stem; a journal keeps its date); if it gives
    /// a new key that is free, the page moves to it. Links are not
    /// rewritten: the external editor chose the new name.
    ///
    /// A page without a file takes the file another program wrote at
    /// exactly its path, if there is one.
    pub fn reload(&mut self, key: &str) -> Result<Reloaded, ReloadError> {
        let page = self
            .pages
            .get(key)
            .ok_or_else(|| ReloadError::UnknownPage(key.to_string()))?;
        let fileless = page.on_disk.is_none();
        let path = self.root.join(&page.rel_path);
        if fileless && !is_exact_file(&path) {
            return Err(ReloadError::NoFile(key.to_string()));
        }
        let bytes = fs::read(&path)?;
        let text =
            String::from_utf8(bytes).map_err(|_| ReloadError::NotUtf8(page.rel_path.clone()))?;
        if fileless {
            self.changes.bump_tree();
        }
        let meta = fs::metadata(&path).ok();
        let carried = self
            .with_page(key, |page, ids, _| {
                let mut doc = parse(&text, ids);
                let carried = carry_ids(&page.doc, &mut doc);
                page.doc = doc;
                page.on_disk = Some(text);
                page.edited = meta.as_ref().and_then(|m| m.modified().ok());
                page.created = meta.as_ref().and_then(|m| m.created().ok());
                carried
            })
            .expect("page checked above");
        let page = &self.pages[key];

        let mut new_name = None;
        if page.kind == PageKind::Page {
            let stem = page
                .rel_path
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            let name = preamble_title(page.doc.preamble()).unwrap_or(stem);
            if name != page.name && is_valid_page_name(&name) {
                new_name = Some(name);
            }
        }
        let mut reloaded = Reloaded {
            key: key.to_string(),
            carried,
            warning: None,
        };
        let Some(name) = new_name else {
            return Ok(reloaded);
        };
        let new_key = page_key(&name);
        if new_key != key
            && let Some(other) = self.pages.get(&new_key)
        {
            reloaded.warning = Some(LoadWarning::DuplicatePage {
                key: new_key,
                kept: other.rel_path.clone(),
                ignored: self.pages[key].rel_path.clone(),
            });
            return Ok(reloaded);
        }
        if let Some(page) = self.pages.get_mut(key) {
            page.name = name;
        }
        self.changes.bump_tree();
        if new_key != key {
            self.rekey(key, &new_key);
            reloaded.key = new_key;
        }
        Ok(reloaded)
    }

    /// Brings the pages in line with files other programs changed. `rel_paths`
    /// are relative to the root, in any order, repeats allowed.
    ///
    /// Unsaved edits are never dropped: a page that has them is not
    /// reloaded or removed, and a new file never replaces it. A file whose
    /// bytes equal what Breccia last read or wrote is Breccia's own write and
    /// is ignored. Gone files and folders are handled first, so a file moved
    /// within the folder is removed before it is loaded at its new path.
    pub fn apply_disk_changes(&mut self, rel_paths: &[PathBuf]) -> DiskReport {
        self.begin_alias_batch();
        let report = self.apply_disk_changes_batched(rel_paths);
        self.end_alias_batch();
        report
    }

    /// [`apply_disk_changes`](Self::apply_disk_changes) inside an alias batch.
    fn apply_disk_changes_batched(&mut self, rel_paths: &[PathBuf]) -> DiskReport {
        let paths: BTreeSet<PathBuf> = rel_paths.iter().filter_map(|p| normalize(p)).collect();
        let mut report = DiskReport::default();
        let mut present = Vec::new();
        let mut gone = Vec::new();
        for rel in paths {
            let full = self.root.join(&rel);
            // A link to a folder is never a folder here: say so once, and
            // treat what the link stood for as gone (nothing is loaded below it).
            let linked = fs::symlink_metadata(&full).is_ok_and(|m| m.file_type().is_symlink())
                && fs::metadata(&full).is_ok_and(|m| m.is_dir());
            if linked {
                report.warnings.push(LoadWarning::LinkedFolder(rel.clone()));
                self.gone_below(&rel, &mut report);
                continue;
            }
            match fs::metadata(&full) {
                Ok(meta) if meta.is_file() => present.push((rel, false)),
                Ok(meta) if meta.is_dir() => {
                    self.gone_below(&rel, &mut report);
                    present.push((rel, true));
                }
                _ => {
                    self.gone_below(&rel, &mut report);
                    gone.push(rel);
                }
            }
        }
        let files: Vec<PathBuf> = present
            .iter()
            .filter(|(_, is_dir)| !is_dir)
            .map(|(rel, _)| rel.clone())
            .collect();
        for (rel, is_dir) in present {
            if is_dir {
                self.dir_appeared(&rel, &mut report);
            } else if let Some(key) = self.key_of_file(&rel) {
                self.file_changed(&key, &mut report);
            } else if let Some(found) = found_at(&rel, &mut report.warnings) {
                self.load_new(found, &mut report);
            }
        }
        // A page removed and loaded again under the same key is still there.
        report.removed.retain(|k| !self.pages.contains_key(k));
        self.settle_warnings(&files, &gone, &mut report);
        report
    }

    /// Keeps the warnings that are new: a path warned about before stays
    /// quiet until it loads, or is gone, and breaks again.
    fn settle_warnings(&mut self, files: &[PathBuf], gone: &[PathBuf], report: &mut DiskReport) {
        for rel in gone {
            self.warned.retain(|p| !p.starts_with(rel));
        }
        for rel in files {
            if !report.warnings.iter().any(|w| w.path() == rel) {
                self.warned.remove(rel);
            }
        }
        let loaded = report
            .reloaded
            .iter()
            .map(|r| r.key.as_str())
            .chain(report.added.iter().map(String::as_str))
            .filter_map(|k| self.pages.get(k));
        for page in loaded {
            self.warned.remove(&page.rel_path);
        }
        let warned = &mut self.warned;
        report
            .warnings
            .retain(|w| warned.insert(w.path().to_path_buf()));
    }

    /// The key of the page whose file is at `rel`.
    fn key_of_file(&self, rel: &Path) -> Option<String> {
        self.pages
            .values()
            .find(|p| p.has_file() && p.rel_path == rel)
            .map(|p| p.key.clone())
    }

    /// Handles `rel` no longer being a file: the pages whose files were at
    /// or below it and are no longer files lose them, and the folders at or
    /// below it go unless their directories are still there or a page kept
    /// in memory will be saved into them.
    fn gone_below(&mut self, rel: &Path, report: &mut DiskReport) {
        let mut keys: Vec<String> = self
            .pages
            .values()
            .filter(|p| p.has_file() && p.rel_path.starts_with(rel))
            .filter(|p| !fs::metadata(self.root.join(&p.rel_path)).is_ok_and(|m| m.is_file()))
            .map(|p| p.key.clone())
            .collect();
        keys.sort();
        for key in keys {
            self.file_gone(&key, report);
        }
        let Some(folder) = folder_of(rel) else {
            return;
        };
        // Still a directory (reported again, or by a rescan): only the folders
        // below it whose directories are gone go.
        let still_dir = fs::metadata(self.root.join(rel)).is_ok_and(|m| m.is_dir());
        let needed: Vec<String> = self
            .pages
            .values()
            .filter(|p| p.kind == PageKind::Page)
            .map(|p| p.folder.clone())
            .collect();
        let root = self.root.join(PAGES);
        let before = self.folders.len();
        self.folders.retain(|f| {
            !within_or_all(f, &folder)
                || (still_dir && root.join(f).is_dir())
                || needed.iter().any(|n| is_within(n, f))
        });
        if self.folders.len() != before {
            self.changes.bump_tree();
        }
    }

    /// The file of a page is gone. With unsaved edits the page stays and
    /// forgets its file, so the next save writes it again.
    fn file_gone(&mut self, key: &str, report: &mut DiskReport) {
        let Some(page) = self.pages.get_mut(key) else {
            return;
        };
        self.changes.bump_tree();
        self.changes.touch(key);
        if page.is_unsaved() {
            page.on_disk = None;
            page.edited = None;
            page.created = None;
            push_once(&mut report.kept_unsaved, key);
            return;
        }
        if let Some(page) = self.take_page(key) {
            report.gone.insert(key.to_string(), page.doc);
        }
        report.removed.push(key.to_string());
    }

    /// The file of a known page exists and may have changed.
    fn file_changed(&mut self, key: &str, report: &mut DiskReport) {
        let page = &self.pages[key];
        let rel_path = page.rel_path.clone();
        let bytes = match fs::read(self.root.join(&rel_path)) {
            Ok(b) => b,
            Err(e) => return report_unreadable(&rel_path, &e, report),
        };
        if page
            .on_disk
            .as_ref()
            .is_some_and(|old| old.as_bytes() == bytes)
        {
            return;
        }
        if std::str::from_utf8(&bytes).is_err() {
            report.warnings.push(LoadWarning::NotUtf8(rel_path));
            return;
        }
        if page.is_unsaved() {
            push_once(&mut report.kept_unsaved, key);
            return;
        }
        match self.reload(key) {
            Ok(mut reloaded) => {
                if reloaded.key != key {
                    report.removed.push(key.to_string());
                    report.rekeyed.push((key.to_string(), reloaded.key.clone()));
                }
                report.warnings.extend(reloaded.warning.take());
                report.reloaded.push(reloaded);
            }
            Err(ReloadError::NotUtf8(p)) => report.warnings.push(LoadWarning::NotUtf8(p)),
            Err(e) => report.warnings.push(LoadWarning::Unreadable {
                path: rel_path,
                error: e.to_string(),
            }),
        }
    }

    /// A new file: loaded as `open` does, except that it fills a blank page
    /// of its name that has no file, and never replaces one with content.
    fn load_new(&mut self, found: Found, report: &mut DiskReport) {
        let mut page = match self.read_page(found) {
            Ok(page) => page,
            Err(w) => {
                report.warnings.push(w);
                return;
            }
        };
        if let Some(old) = self.pages.get(&page.key)
            && !old.has_file()
        {
            if is_blank(&old.doc) {
                let reloaded = self.adopt(page);
                report.reloaded.push(reloaded);
            } else {
                push_once(&mut report.kept_unsaved, &page.key);
            }
            return;
        }
        // Removed earlier in this batch: the same page, moved. Its blocks
        // keep their IDs, so edits the UI sends for them still land.
        let carried = report
            .gone
            .remove(&page.key)
            .map(|old| carry_ids(&old, &mut page.doc));
        let folder = page.folder.clone();
        if let Some(key) = self.add_page(page, &mut report.warnings) {
            self.add_folder(&folder);
            self.changes.bump_tree();
            match carried {
                Some(carried) => report.reloaded.push(Reloaded {
                    key,
                    carried,
                    warning: None,
                }),
                None => report.added.push(key),
            }
        }
    }

    /// Replaces a blank page without a file by the page read from a new
    /// file of its key. Blocks keep their IDs where they correspond.
    fn adopt(&mut self, mut page: Page) -> Reloaded {
        let mut carried = Carried::default();
        if let Some(old) = self.take_page(&page.key) {
            carried = carry_ids(&old.doc, &mut page.doc);
        }
        let key = page.key.clone();
        let folder = page.folder.clone();
        self.insert(page);
        self.add_folder(&folder);
        self.changes.bump_tree();
        Reloaded {
            key,
            carried,
            warning: None,
        }
    }

    /// A directory appeared (or is reported again): its folders join the
    /// tree and the files below it that no page holds are loaded.
    fn dir_appeared(&mut self, rel: &Path, report: &mut DiskReport) {
        let mut found = Vec::new();
        if rel == Path::new(JOURNALS) {
            let entries = match read_dir_sorted(&self.root, rel, &mut report.warnings) {
                Ok(e) => e,
                Err(e) => return report_unreadable(rel, &e, report),
            };
            for (rel_path, stem) in list_md(rel, &entries, &mut report.warnings) {
                match parse_journal_name(&stem) {
                    Some(date) => found.push(Found {
                        rel_path,
                        folder: String::new(),
                        stem,
                        journal: Some(date),
                    }),
                    None => report.warnings.push(LoadWarning::BadJournalName(rel_path)),
                }
            }
        } else if folder_of(rel).is_some() {
            if rel.iter().any(|c| is_hidden(&c.to_string_lossy())) {
                return;
            }
            let mut folders = Vec::new();
            if let Err(e) = walk_pages(
                &self.root,
                rel,
                &mut found,
                &mut folders,
                &mut report.warnings,
            ) {
                return report_unreadable(rel, &e, report);
            }
            for f in folders {
                self.add_folder(&f);
            }
            found.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
        }
        for f in found {
            if self.key_of_file(&f.rel_path).is_none() {
                self.load_new(f, report);
            }
        }
    }

    /// Adds a folder and the folders above it, unless known (ignoring case).
    fn add_folder(&mut self, path: &str) {
        let mut prefix = String::new();
        for c in path.split('/').filter(|c| !c.is_empty()) {
            if !prefix.is_empty() {
                prefix.push('/');
            }
            prefix.push_str(c);
            if self.find_folder(&prefix).is_none() {
                self.folders.insert(prefix.clone());
                self.changes.bump_tree();
            }
        }
    }
}

/// `path` rebuilt from its parts; `None` unless it is a plain relative path
/// (no root, `.` or `..`).
fn normalize(path: &Path) -> Option<PathBuf> {
    let mut out = PathBuf::new();
    for c in path.components() {
        match c {
            std::path::Component::Normal(c) => out.push(c),
            _ => return None,
        }
    }
    (!out.as_os_str().is_empty()).then_some(out)
}

/// The folder path (`/`-joined, `""` for `pages` itself) of a path under
/// `pages/`; `None` for anything else.
fn folder_of(rel: &Path) -> Option<String> {
    let mut parts = rel.iter();
    if parts.next()? != OsStr::new(PAGES) {
        return None;
    }
    let names: Option<Vec<&str>> = parts.map(OsStr::to_str).collect();
    Some(names?.join("/"))
}

fn report_unreadable(rel: &Path, e: &io::Error, report: &mut DiskReport) {
    report.warnings.push(LoadWarning::Unreadable {
        path: rel.to_path_buf(),
        error: e.to_string(),
    });
}

fn push_once(v: &mut Vec<String>, key: &str) {
    if !v.iter().any(|k| k == key) {
        v.push(key.to_string());
    }
}

/// The page file a new path names, if it is one: `journals/<date>.md` or
/// `pages/…/<name>.md`, with no hidden part. Wrong names are reported.
fn found_at(rel: &Path, warnings: &mut Vec<LoadWarning>) -> Option<Found> {
    let name = rel.file_name()?.to_string_lossy().into_owned();
    if rel.iter().any(|c| is_hidden(&c.to_string_lossy())) {
        return None;
    }
    let Some(parts) = rel.iter().map(OsStr::to_str).collect::<Option<Vec<&str>>>() else {
        if has_md_extension(&name) {
            warnings.push(LoadWarning::NonUnicodeName(rel.to_path_buf()));
        }
        return None;
    };
    let in_journals = parts.len() == 2 && parts[0] == JOURNALS;
    let in_pages = parts.len() >= 2 && parts[0] == PAGES;
    if !in_journals && !in_pages {
        return None;
    }
    let Some(stem) = name.strip_suffix(".md") else {
        if has_md_extension(&name) {
            warnings.push(LoadWarning::ExtensionCase(rel.to_path_buf()));
        }
        return None;
    };
    let stem = stem.to_string();
    let journal = if in_journals {
        let Some(date) = parse_journal_name(&stem) else {
            warnings.push(LoadWarning::BadJournalName(rel.to_path_buf()));
            return None;
        };
        Some(date)
    } else {
        None
    };
    Some(Found {
        rel_path: rel.to_path_buf(),
        folder: if in_pages {
            parts[1..parts.len() - 1].join("/")
        } else {
            String::new()
        },
        stem,
        journal,
    })
}
