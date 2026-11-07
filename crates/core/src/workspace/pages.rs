//! Creating, renaming, moving and deleting pages and folders.

use std::collections::{BTreeSet, HashSet};
use std::ffi::OsStr;
use std::fs;
use std::io;
use std::path::Path;

use super::files::{is_within, names_in_dir, path_taken};
use super::{JOURNALS, PAGES, Page, PageError, PageKind, RenameReport, Workspace};
use crate::aliases::realias;
use crate::color::{canonical_color, recolor};
use crate::inline::{LinkKind, heading_base, links, title_line};
use crate::naming::{
    file_stem_for, is_linkable_name, is_valid_folder_path, is_valid_page_name, page_key,
    parse_journal_name,
};
use crate::outline::{LineEnding, front_matter_len, parse};
use crate::relink::{name_len, relink};

impl Workspace {
    /// Returns the key of the page with this name, creating it in memory if
    /// needed. Whitespace around the name is ignored. A name that is a
    /// page's alias (and no page with content) gives that page. The name
    /// never splits at `#` (that is [`open_link`](Self::open_link)'s job).
    pub fn ensure_page(&mut self, name: &str) -> Result<String, PageError> {
        let name = name.trim();
        if !is_valid_page_name(name) {
            return Err(PageError::InvalidName(name.to_string()));
        }
        let key = page_key(name);
        let key = self.resolve_name(&key).unwrap_or(key);
        if self.pages.contains_key(&key) {
            return Ok(key);
        }
        Ok(self.new_page(name, ""))
    }

    /// Creates a page in memory whose file will go to `pages/{folder}`. Like
    /// [`ensure_page`](Self::ensure_page), but the name must be free and the
    /// folder known (`""` is the top level). Journals cannot be created.
    pub fn create_page(&mut self, name: &str, folder: &str) -> Result<String, PageError> {
        let name = name.trim();
        if !is_valid_page_name(name) || parse_journal_name(name).is_some() {
            return Err(PageError::InvalidName(name.to_string()));
        }
        if !is_linkable_name(name) {
            return Err(PageError::NotLinkable(name.to_string()));
        }
        let key = page_key(name);
        if self.pages.contains_key(&key) {
            return Err(PageError::Exists(key));
        }
        self.refuse_alias(name, &key, None)?;
        let folder = if folder.is_empty() {
            String::new()
        } else {
            self.find_folder(folder)
                .ok_or_else(|| PageError::UnknownFolder(folder.to_string()))?
                .to_string()
        };
        Ok(self.new_page(name, &folder))
    }

    /// Creates the folder, and the ones above it, under `pages/`.
    pub fn create_folder(&mut self, path: &str) -> Result<(), PageError> {
        if !is_valid_folder_path(path) {
            return Err(PageError::InvalidName(path.to_string()));
        }
        if self.find_folder(path).is_some() {
            return Err(PageError::FolderExists(path.to_string()));
        }
        // Reuse the spelling of folders that exist, so `projects/x` goes
        // into `Projects` instead of beside it.
        let mut canonical = String::new();
        let mut prefixes = Vec::new();
        for c in path.split('/') {
            let joined = if canonical.is_empty() {
                c.to_string()
            } else {
                format!("{canonical}/{c}")
            };
            canonical = self.find_folder(&joined).unwrap_or(&joined).to_string();
            prefixes.push(canonical.clone());
        }
        fs::create_dir_all(self.root.join(PAGES).join(&canonical))?;
        self.folders.extend(prefixes);
        self.tree_version += 1;
        Ok(())
    }

    /// A page for a valid, free name, not yet in the tree (no file).
    pub(super) fn new_page(&mut self, name: &str, folder: &str) -> String {
        let key = page_key(name);
        let page = match parse_journal_name(name) {
            Some(date) => Page {
                name: name.to_string(),
                key: key.clone(),
                kind: PageKind::Journal(date),
                folder: String::new(),
                rel_path: Path::new(JOURNALS).join(format!("{name}.md")),
                doc: parse("", &mut self.ids),
                on_disk: None,
                edited: None,
                created: None,
            },
            None => {
                let stem = self.free_page_stem(folder, &file_stem_for(name), None);
                let preamble = if stem == name {
                    String::new()
                } else {
                    format!(
                        "{}title:: {name}\n",
                        crate::aliases::alias_block(name, LineEnding::Lf)
                    )
                };
                Page {
                    name: name.to_string(),
                    key: key.clone(),
                    kind: PageKind::Page,
                    folder: folder.to_string(),
                    rel_path: Path::new(PAGES).join(folder).join(format!("{stem}.md")),
                    doc: parse(&preamble, &mut self.ids),
                    on_disk: None,
                    edited: None,
                    created: None,
                }
            }
        };
        self.insert(page);
        key
    }

    /// `stem`, or `stem 2`, `stem 3`, … : the first whose file name in
    /// `pages/{folder}` is neither on disk nor used by a loaded page (ignoring
    /// case). The page file `except` does not count as used.
    pub(crate) fn free_page_stem(&self, folder: &str, stem: &str, except: Option<&Path>) -> String {
        let dir = Path::new(PAGES).join(folder);
        // The file `except` is skipped by its exact name, so on a
        // case-sensitive file system another file differing only in case
        // still counts.
        let except_name = except
            .filter(|e| e.parent() == Some(dir.as_path()))
            .and_then(Path::file_name);
        let mut taken = names_in_dir(&self.root.join(&dir), except_name);
        taken.extend(
            self.pages
                .values()
                .filter(|p| p.rel_path.parent() == Some(dir.as_path()))
                .filter(|p| except != Some(p.rel_path.as_path()))
                .filter_map(|p| p.rel_path.file_name())
                .map(|n| n.to_string_lossy().to_lowercase()),
        );
        let mut candidate = stem.to_string();
        let mut n = 1;
        while taken.contains(&format!("{candidate}.md").to_lowercase()) {
            n += 1;
            candidate = format!("{stem} {n}");
        }
        candidate
    }

    /// The page, unless it is a journal.
    pub(super) fn movable(&self, key: &str) -> Result<&Page, PageError> {
        let page = self
            .pages
            .get(key)
            .ok_or_else(|| PageError::UnknownPage(key.to_string()))?;
        if matches!(page.kind, PageKind::Journal(_)) {
            return Err(PageError::Journal(key.to_string()));
        }
        Ok(page)
    }

    /// Fails unless the page's file still holds what Breccia last read or
    /// wrote; a file that is gone or unreadable counts as changed. A page
    /// without a file passes.
    pub(super) fn check_on_disk(&self, page: &Page) -> Result<(), PageError> {
        let Some(old) = &page.on_disk else {
            return Ok(());
        };
        let path = self.root.join(&page.rel_path);
        if fs::read(&path).map_or(true, |now| now != old.as_bytes()) {
            return Err(PageError::ChangedOnDisk(path));
        }
        Ok(())
    }

    /// Moves a page to another key in the page map, the block index and
    /// the link index.
    pub(super) fn rekey(&mut self, old: &str, new: &str) {
        if old == new {
            return;
        }
        let Some(mut page) = self.pages.remove(old) else {
            return;
        };
        self.unindex_page(old);
        self.touched.insert(old.to_string());
        page.key = new.to_string();
        for b in &page.doc.blocks {
            self.block_index.insert(b.id, new.to_string());
        }
        self.touched.insert(new.to_string());
        self.pages.insert(new.to_string(), page);
        self.index_page(new);
    }

    /// Renames a page: its file (in the same folder), its `title::` line,
    /// and every link to it in every page. Block IDs stay valid.
    ///
    /// Nothing changes unless the page exists, is not a journal, the new
    /// name is valid and free, and the page's file still holds what Breccia
    /// read. Once the file is renamed the rename stands: links that cannot
    /// be rewritten are counted in `skipped`, and pages that cannot be
    /// saved keep their rewrite in memory and are listed in `save_errors`.
    pub fn rename_page(&mut self, key: &str, new_name: &str) -> Result<RenameReport, PageError> {
        let new_name = new_name.trim();
        let page = self.movable(key)?;
        if !is_valid_page_name(new_name) || parse_journal_name(new_name).is_some() {
            return Err(PageError::InvalidName(new_name.to_string()));
        }
        if !is_linkable_name(new_name) {
            return Err(PageError::NotLinkable(new_name.to_string()));
        }
        let new_key = page_key(new_name);
        if new_key != key && self.pages.contains_key(&new_key) {
            return Err(PageError::Exists(new_key));
        }
        if new_key != key {
            self.refuse_alias(new_name, &new_key, Some(key))?;
        }
        let mut report = RenameReport {
            key: new_key.clone(),
            rewritten: Vec::new(),
            skipped: 0,
            save_errors: Vec::new(),
            saved: Vec::new(),
        };
        if page.name == new_name {
            return Ok(report);
        }
        self.check_on_disk(page)?;

        let old_rel = page.rel_path.clone();
        let stem = self.free_page_stem(&page.folder, &file_stem_for(new_name), Some(&old_rel));
        let new_rel = old_rel.with_file_name(format!("{stem}.md"));
        let title = (stem != new_name).then_some(new_name);
        let le = page.doc.line_ending();
        let preamble = retitle(
            &realias(page.doc.preamble(), &page.name, title, le),
            title,
            le,
        );
        let scope = self.rename_scope(key, new_name);
        if new_rel != old_rel && page.has_file() {
            rename_no_clobber(&self.root.join(&old_rel), &self.root.join(&new_rel))?;
        }

        // The rename stands from here on.
        if let Some(page) = self.pages.get_mut(key) {
            page.name = new_name.to_string();
            page.rel_path = new_rel;
            // A title line is neither a bullet nor a fence line, so this
            // is never refused.
            let _ = page.doc.set_preamble(&preamble);
        }
        // Its alias list leaves out its own name, which changed; `rekey`
        // does nothing when only the case changes.
        self.index_page(key);
        self.rekey(key, &new_key);
        self.tree_version += 1;

        for k in &scope.pages {
            // The page itself has its new key now.
            let k = if k == key { new_key.clone() } else { k.clone() };
            if let Some((changed, skipped)) =
                self.edit(&k, |d, _| d.relink(key, new_name, &scope.headings))
            {
                report.skipped += skipped;
                if let Some(p) = self.pages.get(&k) {
                    report.skipped += kept_links(&p.doc, &scope.kept);
                }
                if changed > 0 {
                    report.rewritten.push(k);
                }
            }
        }
        let mut to_save = vec![new_key.clone()];
        to_save.extend(report.rewritten.iter().filter(|k| **k != new_key).cloned());
        for k in to_save {
            match self.save(&k) {
                Ok(_) => report.saved.push(k),
                Err(e) => report.save_errors.push((k, e)),
            }
        }
        Ok(report)
    }

    /// How many other pages a rename of the page `key` to `new_name` would
    /// rewrite: those with a link to it by its name or to one of its
    /// headings that the rename changes (links through an alias stay as
    /// they are). 0 for an unknown page or its own name.
    pub fn rename_reach(&self, key: &str, new_name: &str) -> usize {
        let new_name = new_name.trim();
        if self.pages.get(key).is_none_or(|p| p.name == new_name) {
            return 0;
        }
        let scope = self.rename_scope(key, new_name);
        scope
            .pages
            .iter()
            .filter(|k| *k != key)
            .filter_map(|k| self.pages.get(k))
            .filter(|p| {
                std::iter::once(p.doc.preamble())
                    .chain(p.doc.blocks().iter().map(|b| b.text()))
                    .any(|t| relink(t, key, new_name, &scope.headings).is_some())
            })
            .count()
    }

    /// What a rename of the page `key` to `new_name` touches. Worked out
    /// before the page's key changes.
    ///
    /// A heading link `[[Name#…]]` goes to the page by its own name when
    /// its base is `key`, `key` names that page, and the whole key names no
    /// page or alias of its own. It is rewritten unless its new form would
    /// name another page or alias.
    fn rename_scope(&self, key: &str, new_name: &str) -> RenameScope {
        let own = self.resolve_name(key).as_deref() == Some(key);
        let goes_here = |raw: &str| {
            own && heading_base(raw).is_some_and(|b| page_key(b) == key)
                && self.resolve_name(raw).is_none()
        };
        let mut found: HashSet<String> = self
            .links
            .heading_keys(key)
            .into_iter()
            .filter(|h| goes_here(h))
            .map(str::to_string)
            .collect();
        // The preamble is not in the link index, so it is searched here.
        let mut pages: BTreeSet<String> = BTreeSet::new();
        for p in self.pages.values() {
            for l in links(p.doc.preamble()) {
                if l.key == key {
                    pages.insert(p.key.clone());
                } else if l.kind == LinkKind::Page && goes_here(&l.key) {
                    pages.insert(p.key.clone());
                    found.insert(l.key);
                }
            }
        }
        for k in std::iter::once(key).chain(found.iter().map(String::as_str)) {
            pages.extend(self.links.sources(k).into_iter().map(|(p, _)| p));
        }
        let (kept, headings) = found.into_iter().partition(|h| {
            let new = page_key(&format!("{new_name}{}", &h[name_len(h)..]));
            self.resolve_name(&new).is_some_and(|k| k != key)
        });
        RenameScope {
            headings,
            kept,
            pages,
        }
    }

    /// Moves a page to the folder `folder` (`""` is the top level). Its file
    /// keeps its stem if that is free there; otherwise it gets a free one
    /// and the name goes into a `title::` line, which the caller writes by
    /// saving the page. A page without a file changes its path, and the
    /// answer is `true`: the caller writes its file with
    /// [`create_file`](Workspace::create_file), even though it is blank. A
    /// move to the folder the page is already in does nothing (`false`).
    pub fn move_page(&mut self, key: &str, folder: &str) -> Result<bool, PageError> {
        let page = self.movable(key)?;
        let folder = if folder.is_empty() {
            String::new()
        } else {
            self.find_folder(folder)
                .ok_or_else(|| PageError::UnknownFolder(folder.to_string()))?
                .to_string()
        };
        if folder == page.folder {
            return Ok(false);
        }
        self.check_on_disk(page)?;
        let create = !page.has_file();
        let old_rel = page.rel_path.clone();
        let stem = old_rel
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| file_stem_for(&page.name));
        let new_stem = self.free_page_stem(&folder, &stem, None);
        let new_rel = Path::new(PAGES)
            .join(&folder)
            .join(format!("{new_stem}.md"));
        let preamble = (new_stem != stem && new_stem != page.name).then(|| {
            retitle(
                page.doc.preamble(),
                Some(&page.name),
                page.doc.line_ending(),
            )
        });
        if page.has_file() {
            rename_no_clobber(&self.root.join(&old_rel), &self.root.join(&new_rel))?;
        }
        if let Some(page) = self.pages.get_mut(key) {
            page.folder = folder;
            page.rel_path = new_rel;
            if let Some(p) = preamble {
                // Never refused, as in `rename_page`.
                let _ = page.doc.set_preamble(&p);
            }
        }
        self.reorder_aliases();
        self.tree_version += 1;
        Ok(create)
    }

    /// The color of the page's `color::` line; none for a journal or an
    /// unknown key.
    pub fn page_color(&self, key: &str) -> Option<&'static str> {
        let page = self.pages.get(key)?;
        match page.kind {
            PageKind::Journal(_) => None,
            PageKind::Page => crate::color::page_color(page.doc.preamble()),
        }
    }

    /// The preamble the page gets with `color` (`None` removes the color),
    /// and whether the caller must write a new file afterwards (the page has
    /// no file and gets a color). Changes nothing itself: the caller applies
    /// the preamble as an edit.
    pub fn color_change(
        &self,
        key: &str,
        color: Option<&str>,
    ) -> Result<(String, bool), PageError> {
        let color = color
            .map(|c| canonical_color(c).ok_or_else(|| PageError::UnknownColor(c.to_string())))
            .transpose()?;
        let page = self.movable(key)?;
        self.check_on_disk(page)?;
        let preamble = recolor(page.doc.preamble(), color, page.doc.line_ending());
        Ok((preamble, !page.has_file() && color.is_some()))
    }

    /// Deletes a page's file and the page. Links to it stay. Journals may
    /// be deleted too.
    pub fn delete_page(&mut self, key: &str) -> Result<(), PageError> {
        let page = self
            .pages
            .get(key)
            .ok_or_else(|| PageError::UnknownPage(key.to_string()))?;
        self.check_on_disk(page)?;
        if page.has_file() {
            fs::remove_file(self.root.join(&page.rel_path))?;
            self.tree_version += 1;
        }
        if let Some(page) = self.pages.remove(key) {
            for b in &page.doc.blocks {
                self.block_index.remove(&b.id);
            }
        }
        self.unindex_page(key);
        self.touched.insert(key.to_string());
        Ok(())
    }

    /// Renames or moves the folder `path` to `to`, a full path under
    /// `pages/` whose parent folder must exist. The pages below it move
    /// with it. Only the case may change, too.
    pub fn rename_folder(&mut self, path: &str, to: &str) -> Result<(), PageError> {
        if !is_valid_folder_path(to) {
            return Err(PageError::InvalidName(to.to_string()));
        }
        let from = self
            .find_folder(path)
            .ok_or_else(|| PageError::UnknownFolder(path.to_string()))?
            .to_string();
        let (from_lower, to_lower) = (from.to_lowercase(), to.to_lowercase());
        let case_only = to_lower == from_lower;
        if to == from || (is_within(&to_lower, &from_lower) && !case_only) {
            return Err(PageError::IntoItself(to.to_string()));
        }
        let new_path = match to.rsplit_once('/') {
            Some((parent, name)) => {
                let parent = self
                    .find_folder(parent)
                    .ok_or_else(|| PageError::UnknownFolder(parent.to_string()))?;
                format!("{parent}/{name}")
            }
            None => to.to_string(),
        };
        let target = self.root.join(PAGES).join(&new_path);
        let taken = if case_only {
            self.folders.contains(&new_path)
        } else {
            self.find_folder(&new_path).is_some() || path_taken(&target)?
        };
        if taken {
            return Err(PageError::FolderExists(to.to_string()));
        }
        rename_no_clobber(&self.root.join(PAGES).join(&from), &target)?;

        let moved = |p: &str| format!("{new_path}{}", &p[from.len()..]);
        let below: Vec<String> = self
            .folders
            .iter()
            .filter(|f| is_within(f, &from))
            .cloned()
            .collect();
        for f in below {
            self.folders.remove(&f);
            self.folders.insert(moved(&f));
        }
        for page in self.pages.values_mut() {
            if page.kind == PageKind::Page && is_within(&page.folder, &from) {
                page.folder = moved(&page.folder);
                let file = page.rel_path.file_name().map(OsStr::to_os_string);
                page.rel_path = Path::new(PAGES)
                    .join(&page.folder)
                    .join(file.unwrap_or_default());
            }
        }
        self.reorder_aliases();
        self.tree_version += 1;
        Ok(())
    }

    /// Deletes the folder `path`, only if it holds nothing on disk and no
    /// page with content is in it. Pages without content (new pages that
    /// were never touched) go with it, once the folder is gone; their keys
    /// are returned. A refusal changes nothing.
    pub fn delete_folder(&mut self, path: &str) -> Result<Vec<String>, PageError> {
        let folder = self
            .find_folder(path)
            .ok_or_else(|| PageError::UnknownFolder(path.to_string()))?
            .to_string();
        if self
            .pages
            .values()
            .any(|p| p.kind == PageKind::Page && is_within(&p.folder, &folder) && p.has_content())
        {
            return Err(PageError::FolderNotEmpty(folder));
        }
        let dir = self.root.join(PAGES).join(&folder);
        match fs::read_dir(&dir) {
            Ok(mut entries) => {
                if entries.next().is_some() {
                    return Err(PageError::FolderNotEmpty(folder));
                }
                remove_empty_dir(&dir)?;
            }
            // Already gone: only the tree needs to forget it.
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
        let mut gone: Vec<String> = self
            .pages
            .values()
            .filter(|p| p.kind == PageKind::Page && is_within(&p.folder, &folder))
            .map(|p| p.key.clone())
            .collect();
        gone.sort();
        self.begin_alias_batch();
        for key in &gone {
            if let Some(page) = self.pages.remove(key) {
                for b in &page.doc.blocks {
                    self.block_index.remove(&b.id);
                }
            }
            self.unindex_page(key);
            self.touched.insert(key.clone());
        }
        self.end_alias_batch();
        self.folders.retain(|f| !is_within(f, &folder));
        self.tree_version += 1;
        Ok(gone)
    }
}

/// Removes the empty folder `dir`. Windows refuses (os error 5) a folder
/// with the read-only attribute, which OneDrive sets on the folders it syncs;
/// then the attribute is cleared and the removal tried once more.
fn remove_empty_dir(dir: &Path) -> io::Result<()> {
    match fs::remove_dir(dir) {
        Err(e) if e.kind() == io::ErrorKind::PermissionDenied => {
            let mut perms = fs::metadata(dir)?.permissions();
            if !perms.readonly() {
                return Err(e);
            }
            #[allow(clippy::permissions_set_readonly_false)]
            perms.set_readonly(false);
            fs::set_permissions(dir, perms)?;
            fs::remove_dir(dir)
        }
        other => other,
    }
}

/// Renames `from` to `to` without replacing anything: if an entry in
/// `to`'s directory, other than `from` itself, has `to`'s name ignoring
/// case, it fails with `AlreadyExists` (`fs::rename` alone would replace a
/// file). Renaming to another case of the same name changes the case in
/// place.
pub(super) fn rename_no_clobber(from: &Path, to: &Path) -> io::Result<()> {
    let (Some(dir), Some(name)) = (to.parent(), to.file_name()) else {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "no file name"));
    };
    let skip = (from.parent() == Some(dir))
        .then(|| from.file_name())
        .flatten();
    let name = name.to_string_lossy().to_lowercase();
    for entry in fs::read_dir(dir)? {
        let n = entry?.file_name();
        if Some(n.as_os_str()) != skip && n.to_string_lossy().to_lowercase() == name {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                format!("already exists: {}", to.display()),
            ));
        }
    }
    fs::rename(from, to)
}

/// What a rename touches; see [`Workspace::rename_scope`].
struct RenameScope {
    /// The heading link keys to rewrite.
    headings: HashSet<String>,
    /// The heading link keys left alone: their new form would name another
    /// page or alias.
    kept: HashSet<String>,
    /// The pages with such links or links by the page's name (the renamed
    /// page under its old key).
    pages: BTreeSet<String>,
}

/// How many texts of `doc` (the preamble counting as one) hold a page link
/// with a key in `kept`.
fn kept_links(doc: &crate::outline::Document, kept: &HashSet<String>) -> usize {
    if kept.is_empty() {
        return 0;
    }
    std::iter::once(doc.preamble())
        .chain(doc.blocks().iter().map(|b| b.text()))
        .filter(|t| {
            links(t)
                .iter()
                .any(|l| l.kind == LinkKind::Page && kept.contains(&l.key))
        })
        .count()
}

/// `preamble` with `title::` set: with `Some(name)` its first valid title
/// line is replaced by `title:: name` as the first line (after any front matter); with `None` every
/// valid title line is removed, so the name comes from the file stem.
pub(super) fn retitle(preamble: &str, name: Option<&str>, le: LineEnding) -> String {
    // Front matter stays as it is; a title line goes after it.
    let (front, body) = preamble.split_at(front_matter_len(preamble).unwrap_or(0));
    let mut lines: Vec<&str> = body.split_inclusive('\n').collect();
    while let Some((i, _)) = title_line(&lines.concat()) {
        lines.remove(i);
        if name.is_some() {
            break;
        }
    }
    let rest = lines.concat();
    match name {
        Some(n) => {
            // A closing line without terminator needs one before the title.
            let sep = if front.is_empty() || front.ends_with('\n') {
                ""
            } else {
                le.as_str()
            };
            format!("{front}{sep}title:: {n}{}{rest}", le.as_str())
        }
        None => format!("{front}{rest}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rename_never_replaces_a_file() {
        let t = tempfile::tempdir().unwrap();
        let (a, b) = (t.path().join("a.md"), t.path().join("b.md"));
        fs::write(&a, "a").unwrap();
        fs::write(&b, "b").unwrap();
        let err = rename_no_clobber(&a, &t.path().join("B.md")).unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::AlreadyExists);
        assert_eq!(fs::read_to_string(&a).unwrap(), "a");
        assert_eq!(fs::read_to_string(&b).unwrap(), "b");
        // Another case of its own name is fine.
        rename_no_clobber(&a, &t.path().join("A.md")).unwrap();
        let mut names: Vec<_> = fs::read_dir(t.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        names.sort();
        assert_eq!(names, ["A.md", "b.md"]);
    }

    #[test]
    fn retitle_puts_the_title_first_or_removes_it() {
        let crlf = LineEnding::CrLf;
        assert_eq!(retitle("", Some("a/b"), crlf), "title:: a/b\r\n");
        assert_eq!(
            retitle("x:: 1\r\ntitle:: old\r\n", Some("n"), crlf),
            "title:: n\r\nx:: 1\r\n"
        );
        assert_eq!(
            retitle("title:: a\nx\ntitle:: b\n", None, LineEnding::Lf),
            "x\n"
        );
        // An invalid title line is not a title and stays.
        assert_eq!(retitle("title:: \n", None, LineEnding::Lf), "title:: \n");
        assert_eq!(retitle("x\ntitle:: a", None, LineEnding::Lf), "x\n");
        // A title goes after front matter, which stays untouched.
        let fm = "---\ntags:\n  - x\n---\n";
        assert_eq!(
            retitle(&format!("{fm}x\n"), Some("n"), LineEnding::Lf),
            format!("{fm}title:: n\nx\n")
        );
        assert_eq!(
            retitle(&format!("{fm}title:: o\nx\n"), None, LineEnding::Lf),
            format!("{fm}x\n")
        );
        // A `title::` inside the front matter is not a title.
        assert_eq!(
            retitle("---\ntitle:: i\n---\n", Some("n"), LineEnding::Lf),
            "---\ntitle:: i\n---\ntitle:: n\n"
        );
        // A closing line without terminator gets one first.
        assert_eq!(
            retitle("---\na: b\n---", Some("n"), LineEnding::Lf),
            "---\na: b\n---\ntitle:: n\n"
        );
    }
}
