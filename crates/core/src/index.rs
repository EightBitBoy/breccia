//! The link index: which blocks link to which page.
//!
//! It covers block text only. Property lines are part of the block text, so
//! `owner:: [[Anna]]` counts; a bare `owner:: Anna` is not a link, and the
//! preamble is not indexed. Both `[[links]]` and `#tags` count. The index is
//! rebuilt per page, which is cheap at this scale.

use std::collections::{BTreeMap, HashMap};

use crate::inline::{LinkKind, heading_base, links};
use crate::naming::page_key;
use crate::outline::{BlockId, Document};

/// How a page links to a target: `[[…]]` (in text or a property value) and/or `#tag`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct LinkForms {
    pub page: bool,
    pub tag: bool,
}

/// One target a page links to.
#[derive(Debug)]
struct OutLink {
    key: String,
    /// The first spelling in the page.
    spelling: String,
    forms: LinkForms,
    /// How many of the page's blocks have it as a `#tag`.
    tag_blocks: usize,
}

#[derive(Debug, Default)]
pub struct LinkIndex {
    /// Per page, the targets it links to, in document order without repeats.
    outgoing: HashMap<String, Vec<OutLink>>,
    /// `target key → page key → linking blocks` in document order.
    inbound: HashMap<String, BTreeMap<String, Vec<BlockId>>>,
    /// `base key → heading key → number of pages` with a page link
    /// `[[Base#…]]` of that key (tags never count).
    headings: HashMap<String, HashMap<String, usize>>,
    /// For keys with a heading part only (`page#x`), `inbound` split by
    /// form: a `[[Page#x]]` may go to `Page` while the tag `#Page#x` never
    /// does, so the two can go to different pages.
    split: HashMap<String, FormSources>,
}

/// `page key → linking blocks` per link form.
#[derive(Debug, Default)]
struct FormSources {
    page: BTreeMap<String, Vec<BlockId>>,
    tag: BTreeMap<String, Vec<BlockId>>,
}

/// The base key of a raw link key that has a heading part.
fn base_key(raw_key: &str) -> Option<String> {
    heading_base(raw_key).map(page_key)
}

impl LinkIndex {
    pub fn new() -> Self {
        Self::default()
    }

    /// Replaces what the index holds for a page. Returns whether the
    /// page's targets (keys, first spellings or forms) changed.
    pub fn set_page(&mut self, key: &str, doc: &Document) -> bool {
        let before: Vec<(String, String, LinkForms, usize)> = self
            .outgoing
            .get(key)
            .map(|v| {
                v.iter()
                    .map(|o| (o.key.clone(), o.spelling.clone(), o.forms, o.tag_blocks))
                    .collect()
            })
            .unwrap_or_default();
        self.remove_page(key);
        let mut out: Vec<OutLink> = Vec::new();
        for b in doc.blocks() {
            let mut seen: Vec<String> = Vec::new();
            let mut tagged: Vec<String> = Vec::new();
            let mut split_seen: Vec<(String, LinkKind)> = Vec::new();
            for l in links(b.text()) {
                if base_key(&l.key).is_some() && !split_seen.contains(&(l.key.clone(), l.kind)) {
                    let forms = self.split.entry(l.key.clone()).or_default();
                    let map = match l.kind {
                        LinkKind::Page => &mut forms.page,
                        LinkKind::Tag => &mut forms.tag,
                    };
                    map.entry(key.to_string()).or_default().push(b.id());
                    split_seen.push((l.key.clone(), l.kind));
                }
                let at = match out.iter().position(|o| o.key == l.key) {
                    Some(at) => at,
                    None => {
                        out.push(OutLink {
                            key: l.key.clone(),
                            spelling: l.target.clone(),
                            forms: LinkForms::default(),
                            tag_blocks: 0,
                        });
                        out.len() - 1
                    }
                };
                match l.kind {
                    LinkKind::Page => out[at].forms.page = true,
                    LinkKind::Tag => {
                        out[at].forms.tag = true;
                        if !tagged.contains(&l.key) {
                            out[at].tag_blocks += 1;
                            tagged.push(l.key.clone());
                        }
                    }
                }
                if !seen.contains(&l.key) {
                    self.inbound
                        .entry(l.key.clone())
                        .or_default()
                        .entry(key.to_string())
                        .or_default()
                        .push(b.id());
                    seen.push(l.key);
                }
            }
        }
        for o in out.iter().filter(|o| o.forms.page) {
            if let Some(base) = base_key(&o.key) {
                *self
                    .headings
                    .entry(base)
                    .or_default()
                    .entry(o.key.clone())
                    .or_default() += 1;
            }
        }
        let changed = before.len() != out.len()
            || before.iter().zip(&out).any(|(b, o)| {
                b.0 != o.key || b.1 != o.spelling || b.2 != o.forms || b.3 != o.tag_blocks
            });
        if !out.is_empty() {
            self.outgoing.insert(key.to_string(), out);
        }
        changed
    }

    pub fn remove_page(&mut self, key: &str) {
        let Some(old) = self.outgoing.remove(key) else {
            return;
        };
        for OutLink {
            key: target, forms, ..
        } in old
        {
            if forms.page
                && let Some(base) = base_key(&target)
                && let Some(keys) = self.headings.get_mut(&base)
            {
                if let Some(n) = keys.get_mut(&target) {
                    *n -= 1;
                    if *n == 0 {
                        keys.remove(&target);
                    }
                }
                if keys.is_empty() {
                    self.headings.remove(&base);
                }
            }
            if let Some(srcs) = self.inbound.get_mut(&target) {
                srcs.remove(key);
                if srcs.is_empty() {
                    self.inbound.remove(&target);
                }
            }
            if let Some(forms) = self.split.get_mut(&target) {
                forms.page.remove(key);
                forms.tag.remove(key);
                if forms.page.is_empty() && forms.tag.is_empty() {
                    self.split.remove(&target);
                }
            }
        }
    }

    /// The pages whose blocks link to `target` (a key), by page key, with the
    /// linking blocks in document order.
    pub fn sources(&self, target: &str) -> Vec<(String, Vec<BlockId>)> {
        self.inbound
            .get(target)
            .map(|m| m.iter().map(|(p, ids)| (p.clone(), ids.clone())).collect())
            .unwrap_or_default()
    }

    /// [`sources`](Self::sources), borrowed: page key → linking blocks.
    pub fn sources_ref(&self, target: &str) -> Option<&BTreeMap<String, Vec<BlockId>>> {
        self.inbound.get(target)
    }

    /// The sources of a key with a heading part (`page#x`) in one link
    /// form only: page links `[[…]]` or tags. `None` for other keys.
    pub fn form_sources_ref(
        &self,
        target: &str,
        kind: LinkKind,
    ) -> Option<&BTreeMap<String, Vec<BlockId>>> {
        let forms = self.split.get(target)?;
        let map = match kind {
            LinkKind::Page => &forms.page,
            LinkKind::Tag => &forms.tag,
        };
        (!map.is_empty()).then_some(map)
    }

    /// Whether some block has this key with a heading part as a `#tag`.
    pub fn is_heading_tag(&self, raw_key: &str) -> bool {
        self.split.get(raw_key).is_some_and(|f| !f.tag.is_empty())
    }

    /// The raw keys of page links `[[Base#…]]` whose base has the key
    /// `base_key`, sorted.
    pub fn heading_keys(&self, base_key: &str) -> Vec<&str> {
        let mut out: Vec<&str> = self
            .headings
            .get(base_key)
            .map(|m| m.keys().map(String::as_str).collect())
            .unwrap_or_default();
        out.sort_unstable();
        out
    }

    /// Whether some page links `[[raw_key]]` and the key has a heading part.
    pub fn is_heading_key(&self, raw_key: &str) -> bool {
        base_key(raw_key)
            .and_then(|b| self.headings.get(&b))
            .is_some_and(|m| m.contains_key(raw_key))
    }

    /// The keys of the targets a page links to, with their forms, in
    /// document order without repeats.
    pub fn targets_of(&self, key: &str) -> impl Iterator<Item = (&str, LinkForms)> {
        self.outgoing
            .get(key)
            .into_iter()
            .flat_map(|v| v.iter().map(|o| (o.key.as_str(), o.forms)))
    }

    /// Every linked target as `(key, first spelling seen)`, where the first
    /// spelling is the first in the page with the smallest key.
    pub fn targets(&self) -> impl Iterator<Item = (&str, &str)> {
        self.inbound.iter().filter_map(|(t, srcs)| {
            let page = srcs.keys().next()?;
            let o = self.outgoing.get(page)?.iter().find(|o| o.key == *t)?;
            Some((t.as_str(), o.spelling.as_str()))
        })
    }

    /// Every `(source page key, target key, first spelling, blocks)` where
    /// the page's blocks have the target as a `#tag`.
    pub fn tag_uses(&self) -> impl Iterator<Item = (&str, &str, &str, usize)> {
        self.outgoing.iter().flat_map(|(page, v)| {
            v.iter().filter(|o| o.tag_blocks > 0).map(move |o| {
                (
                    page.as_str(),
                    o.key.as_str(),
                    o.spelling.as_str(),
                    o.tag_blocks,
                )
            })
        })
    }

    /// Every `(source page key, target key, forms)` the index holds, a page's
    /// link to itself included.
    pub fn link_forms(&self) -> impl Iterator<Item = (&str, &str, LinkForms)> {
        self.outgoing.iter().flat_map(|(page, v)| {
            v.iter()
                .map(move |o| (page.as_str(), o.key.as_str(), o.forms))
        })
    }
}
