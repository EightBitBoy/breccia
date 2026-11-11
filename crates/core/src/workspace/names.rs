//! Aliases and link resolution: where a link goes, and every key that goes
//! to a page.
//!
//! The link index keeps raw link keys; they are resolved here, at lookup. A
//! page with content of a key always wins over an alias of that key. Among
//! pages listing the same alias, the first in page order wins (journals
//! before pages, then by path). Pages without content (a blank page made by
//! a click) list no aliases and never beat an alias.

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::path::{Path, PathBuf};

use super::{LoadWarning, Page, PageError, PageKind, TagEntry, Workspace};
use crate::aliases::aliases;
use crate::index::LinkForms;
use crate::inline::{LinkKind, heading_base};
use crate::naming::page_key;

/// Where a link goes.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Target {
    pub key: String,
    /// The page's name when it exists, else the target as typed.
    pub name: String,
    /// A page with content has this key.
    pub exists: bool,
}

/// The alias table: per page its alias spellings, and per alias key the
/// page that wins it.
#[derive(Debug, Default)]
pub(super) struct Names {
    /// Page key → alias spellings in file order (own name left out). Only
    /// pages with content and at least one alias are listed.
    lists: HashMap<String, Vec<String>>,
    /// Alias key → (winning page key, spelling).
    winners: HashMap<String, (String, String)>,
    /// Open batches: while one is open, a change only marks `dirty`, and
    /// the winners are worked out once when the last batch ends.
    batches: u32,
    dirty: bool,
    /// How often the winners were worked out (for tests).
    recomputes: u64,
    /// Keys of the indexed pages that have content.
    contented: HashSet<String>,
    /// The clashes may differ from `reported`.
    clashes_dirty: bool,
    /// The clash warnings the last `take_alias_warnings` knew of.
    reported: Vec<LoadWarning>,
}

impl Workspace {
    /// Where a link with this typed target goes: the page with content of
    /// that key; else the page whose winning alias it is; else, for a page
    /// link `[[Base#Heading]]`, the page (or alias) `Base` when it exists;
    /// else the target itself (`exists: false`). Tags never split at `#`.
    pub fn link_target(&self, target: &str, kind: LinkKind) -> Target {
        let target = target.trim();
        let key = page_key(target);
        let key = match self.resolve_name(&key) {
            Some(k) => k,
            None => match (kind, heading_base(target)) {
                (LinkKind::Page, Some(base)) => self.resolve_name(&page_key(base)).unwrap_or(key),
                _ => key,
            },
        };
        match self.pages.get(&key) {
            Some(p) => Target {
                name: p.name.clone(),
                exists: p.has_content(),
                key,
            },
            None => Target {
                key,
                name: target.to_string(),
                exists: false,
            },
        }
    }

    /// The key a raw link key goes to: as [`link_target`](Self::link_target),
    /// where a key splits at `#` only when some page link has it.
    pub(crate) fn resolve_key(&self, raw_key: &str) -> String {
        self.resolve_key_ref(raw_key).to_string()
    }

    /// [`resolve_key`](Self::resolve_key) without allocating: the key
    /// borrows the page map, the alias table or `raw_key`.
    pub(crate) fn resolve_key_ref<'a>(&'a self, raw_key: &'a str) -> &'a str {
        if let Some(k) = self.resolve_name_ref(raw_key) {
            return k;
        }
        if self.links.is_heading_key(raw_key)
            && let Some(base) = heading_base(raw_key)
            && let Some(k) = self.resolve_name_ref(&page_key(base))
        {
            return k;
        }
        raw_key
    }

    /// The page a key names, if it exists: a page with content of that
    /// key, else the page whose winning alias it is. Never splits at `#`.
    pub(super) fn resolve_name(&self, key: &str) -> Option<String> {
        self.resolve_name_ref(key).map(str::to_string)
    }

    /// [`resolve_name`](Self::resolve_name) without allocating.
    fn resolve_name_ref(&self, key: &str) -> Option<&str> {
        if let Some(p) = self.pages.get(key).filter(|p| p.has_content()) {
            return Some(p.key.as_str());
        }
        self.names.winners.get(key).map(|(page, _)| page.as_str())
    }

    /// Returns the key of the page a clicked link goes to, creating the
    /// page in memory (as [`ensure_page`](Self::ensure_page)) only when it
    /// does not exist. `Base#Heading` opens `Base` when it exists.
    pub fn open_link(&mut self, target: &str) -> Result<String, PageError> {
        let t = self.link_target(target, LinkKind::Page);
        if t.exists {
            return Ok(t.key);
        }
        self.ensure_page(target)
    }

    /// Every raw key that goes to `page_key`: itself (unless it goes to
    /// another page), then its winning aliases by key, then the heading
    /// keys (`[[Base#…]]`) of itself and of those aliases that go to it.
    pub fn link_keys(&self, page_key: &str) -> Vec<String> {
        let mut out = Vec::new();
        if self.resolve_key_ref(page_key) == page_key {
            out.push(page_key.to_string());
        }
        let mut alias_keys: Vec<String> = self
            .aliases_of(page_key)
            .iter()
            .map(|a| crate::naming::page_key(a))
            .collect();
        alias_keys.sort();
        let mut headings: Vec<String> = Vec::new();
        for base in std::iter::once(page_key).chain(alias_keys.iter().map(String::as_str)) {
            headings.extend(
                self.links
                    .heading_keys(base)
                    .into_iter()
                    .filter(|h| self.resolve_key_ref(h) == page_key)
                    .map(str::to_string),
            );
        }
        out.extend(alias_keys);
        out.extend(headings);
        out
    }

    /// The page's winning alias spellings, in file order.
    pub fn aliases_of(&self, page_key: &str) -> Vec<String> {
        let Some(list) = self.names.lists.get(page_key) else {
            return Vec::new();
        };
        list.iter()
            .filter(|a| {
                let k = crate::naming::page_key(a);
                !self.has_page_with_content(&k)
                    && self
                        .names
                        .winners
                        .get(&k)
                        .is_some_and(|(p, _)| p == page_key)
            })
            .cloned()
            .collect()
    }

    fn has_page_with_content(&self, key: &str) -> bool {
        self.pages.get(key).is_some_and(|p| p.has_content())
    }

    /// Every `(source page key, resolved target key, forms)`, merged per
    /// pair; a page's link to itself included. Sorted.
    pub(crate) fn link_forms(&self) -> Vec<(&str, &str, LinkForms)> {
        let mut cache: HashMap<&str, &str> = HashMap::new();
        let mut all: Vec<(&str, &str, LinkForms)> = self
            .links
            .link_forms()
            .map(|(src, raw, f)| {
                let to = *cache
                    .entry(raw)
                    .or_insert_with(|| self.resolve_key_ref(raw));
                (src, to, f)
            })
            .collect();
        all.sort_unstable_by(|a, b| (a.0, a.1).cmp(&(b.0, b.1)));
        let mut merged: Vec<(&str, &str, LinkForms)> = Vec::with_capacity(all.len());
        for (src, to, f) in all {
            match merged.last_mut() {
                Some(last) if last.0 == src && last.1 == to => {
                    last.2.page |= f.page;
                    last.2.tag |= f.tag;
                }
                _ => merged.push((src, to, f)),
            }
        }
        merged
    }

    /// Every resolved link target as `(key, name)`: its page's name when
    /// there is a page, else the first spelling.
    pub(crate) fn link_targets(&self) -> Vec<(String, String)> {
        let mut out: BTreeMap<&str, &str> = BTreeMap::new();
        for (raw, spelling) in self.links.targets() {
            let key = self.resolve_key_ref(raw);
            if out.contains_key(key) {
                continue;
            }
            let name = self.pages.get(key).map_or(spelling, |p| p.name.as_str());
            out.insert(key, name);
        }
        out.into_iter()
            .map(|(k, n)| (k.to_string(), n.to_string()))
            .collect()
    }

    /// The pages that are only linked to, as `(key, name)` sorted by key:
    /// every target of a `[[…]]` link (a `#tag` alone does not count) that
    /// goes to no page with a file or content, except journal names. The
    /// name is the blank page's when one is open, else the first spelling.
    pub fn linked_only_pages(&self) -> Vec<(String, String)> {
        let page_linked: HashSet<&str> = self
            .links
            .link_forms()
            .filter(|(_, _, f)| f.page)
            .map(|(_, raw, _)| raw)
            .collect();
        let mut out: Vec<(String, String)> = self
            .links
            .targets()
            .filter(|(raw, spelling)| {
                page_linked.contains(raw)
                    && self.resolve_key_ref(raw) == *raw
                    && crate::naming::parse_journal_name(spelling).is_none()
                    && !self
                        .pages
                        .get(*raw)
                        .is_some_and(|p| p.has_file() || p.has_content())
            })
            .map(|(raw, spelling)| {
                let name = self.pages.get(raw).map_or(spelling, |p| p.name.as_str());
                (raw.to_string(), name.to_string())
            })
            .collect();
        out.sort();
        out
    }

    /// Every name used as `#tag` (aliases resolved), except journal names,
    /// with the number of blocks that have it; sorted by lower-cased name,
    /// then name.
    pub fn tags(&self) -> Vec<TagEntry> {
        let mut uses: Vec<(&str, &str, &str, usize)> = self.links.tag_uses().collect();
        uses.sort_unstable();
        let mut by_key: BTreeMap<&str, (&str, usize)> = BTreeMap::new();
        for (_, raw, spelling, n) in uses {
            if crate::naming::parse_journal_name(spelling).is_some() {
                continue;
            }
            let key = self.resolve_key_ref(raw);
            by_key.entry(key).or_insert((spelling, 0)).1 += n;
        }
        let mut out: Vec<TagEntry> = by_key
            .into_iter()
            .map(|(key, (spelling, count))| {
                let page = self.pages.get(key);
                TagEntry {
                    key: key.to_string(),
                    name: page.map_or(spelling, |p| p.name.as_str()).to_string(),
                    count,
                    linked_only: !page.is_some_and(|p| p.has_file() || p.has_content()),
                }
            })
            .collect();
        out.sort_by(|a, b| (a.name.to_lowercase(), &a.name).cmp(&(b.name.to_lowercase(), &b.name)));
        out
    }

    /// The winning aliases whose keys are no page with content, as
    /// `(alias key, spelling)`.
    pub(super) fn alias_names(&self) -> Vec<(String, String)> {
        self.names
            .winners
            .iter()
            .filter(|(k, _)| !self.has_page_with_content(k))
            .map(|(k, (_, spelling))| (k.clone(), spelling.clone()))
            .collect()
    }

    /// The page a block's wash comes from: the first page link or tag in
    /// `text` that goes to an existing page that is not a journal.
    pub fn topic_of(&self, text: &str) -> Option<String> {
        crate::inline::links(text).into_iter().find_map(|l| {
            let t = self.link_target(&l.target, l.kind);
            let journal = matches!(self.pages.get(&t.key)?.kind, PageKind::Journal(_));
            (t.exists && !journal).then_some(t.key)
        })
    }

    /// The keys whose color, existence or alias winner changed since the
    /// last call.
    pub fn take_topic_changes(&mut self) -> BTreeSet<String> {
        self.changes.take_topics()
    }

    /// The journal pages with a block linking to any of `keys`, or to a
    /// spelling that goes to one: the key itself, its aliases, and every
    /// `[[Key#Heading]]` (unfiltered, so a deleted page's headings count).
    pub fn journals_linking(&self, keys: &BTreeSet<String>) -> BTreeSet<String> {
        let mut out = BTreeSet::new();
        for k in keys {
            let raw = std::iter::once(k.clone())
                .chain(self.link_keys(k))
                .chain(self.links.heading_keys(k).into_iter().map(str::to_string));
            for r in raw {
                for src in self
                    .links
                    .sources_ref(&r)
                    .into_iter()
                    .flat_map(|m| m.keys())
                {
                    if self
                        .pages
                        .get(src)
                        .is_some_and(|p| matches!(p.kind, PageKind::Journal(_)))
                    {
                        out.insert(src.clone());
                    }
                }
            }
        }
        out
    }

    /// Puts a page (already in the page map) into the link index and
    /// refreshes its alias list.
    pub(super) fn index_page(&mut self, key: &str) {
        let Some(page) = self.pages.get(key) else {
            return;
        };
        if self.links.set_page(key, &page.doc) {
            self.changes.bump_links();
        }
        let mut list: Vec<String> = Vec::new();
        if page.has_content() {
            for a in aliases(page.doc.preamble()) {
                let k = page_key(&a);
                // The first spelling of a key counts; the own name never.
                if k != page.key && !list.iter().any(|o| page_key(o) == k) {
                    list.push(a);
                }
            }
        }
        let content_changed = if page.has_content() {
            self.names.contented.insert(key.to_string())
        } else {
            self.names.contented.remove(key)
        };
        if content_changed {
            self.names.clashes_dirty = true;
            self.changes.bump_links();
        }
        if page.kind == PageKind::Page {
            let color = crate::color::page_color(page.doc.preamble());
            let color_changed = match color {
                Some(c) => self.colors.insert(key.to_string(), c) != Some(c),
                None => self.colors.remove(key).is_some(),
            };
            if color_changed || content_changed {
                self.changes.topic(key);
            }
        }
        let changed = if list.is_empty() {
            self.names.lists.remove(key).is_some()
        } else if self.names.lists.get(key) != Some(&list) {
            self.names.lists.insert(key.to_string(), list);
            true
        } else {
            false
        };
        if changed {
            self.aliases_changed();
        }
    }

    /// Takes a page out of the link index and the alias table.
    pub(super) fn unindex_page(&mut self, key: &str) {
        self.links.remove_page(key);
        self.changes.bump_links();
        let had_content = self.names.contented.remove(key);
        if had_content {
            self.names.clashes_dirty = true;
        }
        if self.colors.remove(key).is_some() || had_content {
            self.changes.topic(key);
        }
        if self.names.lists.remove(key).is_some() {
            self.aliases_changed();
        }
    }

    /// Re-decides the alias winners if a page with aliases may have moved
    /// in page order (its path changed).
    pub(super) fn reorder_aliases(&mut self) {
        if !self.names.lists.is_empty() {
            self.aliases_changed();
        }
    }

    /// Starts a batch of changes to many pages (opening a folder, applying
    /// outside changes): the winners are worked out once, at
    /// [`end_alias_batch`](Self::end_alias_batch). Nothing may resolve a
    /// link inside a batch.
    pub(super) fn begin_alias_batch(&mut self) {
        self.names.batches += 1;
    }

    /// Ends a batch; the last one to end works out the winners if needed.
    pub(super) fn end_alias_batch(&mut self) {
        self.names.batches = self.names.batches.saturating_sub(1);
        if self.names.batches == 0 && std::mem::take(&mut self.names.dirty) {
            self.recompute_aliases();
        }
    }

    fn aliases_changed(&mut self) {
        self.names.clashes_dirty = true;
        self.changes.bump_links();
        if self.names.batches > 0 {
            self.names.dirty = true;
        } else {
            self.recompute_aliases();
        }
    }

    /// The clashes among the aliases not returned before, sorted by alias
    /// key; one that ends and comes back is returned again. Does nothing
    /// when no page's aliases or existence changed since the last call.
    pub fn take_alias_warnings(&mut self) -> Vec<LoadWarning> {
        if !std::mem::take(&mut self.names.clashes_dirty) {
            return Vec::new();
        }
        let current = self.alias_clashes();
        let fresh = current
            .iter()
            .filter(|w| !self.names.reported.contains(w))
            .cloned()
            .collect();
        self.names.reported = current;
        fresh
    }

    /// Pages with aliases, in page order.
    fn alias_listers(&self) -> Vec<&Page> {
        let mut v: Vec<&Page> = self
            .names
            .lists
            .keys()
            .filter_map(|k| self.pages.get(k))
            .collect();
        v.sort_by(|a, b| {
            (a.kind == PageKind::Page, &a.rel_path, &a.key).cmp(&(
                b.kind == PageKind::Page,
                &b.rel_path,
                &b.key,
            ))
        });
        v
    }

    /// Every clash now, by alias key, then page order.
    fn alias_clashes(&self) -> Vec<LoadWarning> {
        let mut by_key: BTreeMap<String, Vec<(&Page, &str)>> = BTreeMap::new();
        for page in self.alias_listers() {
            for a in &self.names.lists[&page.key] {
                by_key.entry(page_key(a)).or_default().push((page, a));
            }
        }
        let mut out = Vec::new();
        for (k, listers) in by_key {
            if let Some(named) = self.pages.get(&k).filter(|p| p.has_content()) {
                for (p, a) in listers {
                    out.push(LoadWarning::AliasIsName {
                        alias: a.to_string(),
                        listed_in: slashed(&p.rel_path),
                        page: slashed(&named.rel_path),
                    });
                }
            } else if let Some(((kept, a), rest)) = listers.split_first() {
                for (p, _) in rest {
                    out.push(LoadWarning::DuplicateAlias {
                        alias: a.to_string(),
                        kept: slashed(&kept.rel_path),
                        ignored: slashed(&p.rel_path),
                    });
                }
            }
        }
        out
    }

    /// Refuses a new name that a page other than `except` lists as an alias.
    pub(super) fn refuse_alias(
        &self,
        name: &str,
        key: &str,
        except: Option<&str>,
    ) -> Result<(), PageError> {
        let owner = self.alias_listers().into_iter().find(|p| {
            Some(p.key.as_str()) != except
                && self.names.lists[&p.key].iter().any(|a| page_key(a) == key)
        });
        match owner {
            Some(p) => Err(PageError::IsAlias {
                name: name.to_string(),
                page: p.name.clone(),
            }),
            None => Ok(()),
        }
    }

    /// Re-decides every alias winner: the first page in page order listing it.
    fn recompute_aliases(&mut self) {
        let mut order: Vec<(bool, &std::path::Path, &str)> = self
            .names
            .lists
            .keys()
            .filter_map(|k| self.pages.get(k))
            .map(|p| {
                (
                    p.kind == PageKind::Page,
                    p.rel_path.as_path(),
                    p.key.as_str(),
                )
            })
            .collect();
        order.sort();
        let mut winners: HashMap<String, (String, String)> = HashMap::new();
        for (_, _, key) in order {
            for a in &self.names.lists[key] {
                winners
                    .entry(page_key(a))
                    .or_insert_with(|| (key.to_string(), a.clone()));
            }
        }
        for k in winners.keys().chain(self.names.winners.keys()) {
            let before = self.names.winners.get(k).map(|w| &w.0);
            if before != winners.get(k).map(|w| &w.0) {
                self.changes.topic(k);
            }
        }
        self.names.winners = winners;
        self.names.recomputes += 1;
    }
}

/// A relative path with `/` on every platform, as warnings show paths.
fn slashed(p: &Path) -> PathBuf {
    PathBuf::from(p.to_string_lossy().replace('\\', "/"))
}

#[cfg(test)]
mod tests {
    use super::super::Workspace;
    use std::fs;

    #[test]
    fn opening_a_folder_works_out_the_winners_once() {
        let t = tempfile::tempdir().unwrap();
        fs::create_dir_all(t.path().join("pages")).unwrap();
        for i in 0..50 {
            let text = format!("---\naliases: [a{i}, shared]\n---\n- page {i}\n");
            fs::write(t.path().join(format!("pages/P{i}.md")), text).unwrap();
        }
        let (mut ws, _) = Workspace::open(t.path()).unwrap();
        assert_eq!(ws.names.recomputes, 1);
        assert_eq!(ws.resolve_key("a7"), "p7");
        assert_eq!(ws.resolve_key("shared"), "p0");

        // Outside changes to many files: once more.
        let mut rels = Vec::new();
        for i in 0..50 {
            let text = format!("---\naliases: [b{i}]\n---\n- page {i}\n");
            fs::write(t.path().join(format!("pages/P{i}.md")), text).unwrap();
            rels.push(std::path::PathBuf::from(format!("pages/P{i}.md")));
        }
        ws.apply_disk_changes(&rels);
        assert_eq!(ws.names.recomputes, 2);
        assert_eq!(ws.resolve_key("b7"), "p7");
        assert_eq!(ws.resolve_key("a7"), "a7");
    }
}
