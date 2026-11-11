//! `graph.get`: the pages, the link targets without a page, and the links
//! between them, for the network view.

use std::collections::{BTreeMap, HashMap};
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::naming::{journal_display, parse_journal_name};
use crate::search::folder_hash;
use crate::workspace::Workspace;

use super::Session;
use super::view::{CommandError, Output, PageViewKind, title_of};

/// A dot of the network view.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub key: String,
    /// The page's name, or the first spelling of a link target without a page: what `page.open` takes.
    /// When a `Page` exists for the key (even one without content), its `name`, `kind` and `title_of` win over the link spelling.
    pub name: String,
    /// `title_of` for pages (long date for journals); for a target without a page, the long date if
    /// `parse_journal_name(name)` is a date, else `name`.
    pub title: String,
    /// For a target without a page: `Journal` when `parse_journal_name(name)` is a date, else `Page`.
    pub kind: PageViewKind,
    /// The page's folder; "" for journals and targets without a page.
    pub folder: String,
    /// `Workspace::linked_from(key)`: the All pages number.
    pub linked_from: usize,
    /// `Page::has_content()`; false for a target without a page.
    pub exists: bool,
    /// Some block links to it as `#tag`.
    pub tag: bool,
    /// `tag`, no `[[…]]` link to it anywhere, and `!exists`.
    pub tag_only: bool,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphView {
    /// Sorted by key.
    pub nodes: Vec<GraphNode>,
    /// `[from, to]` node indexes: a page links to a page. Directed, no self links, no repeats, sorted.
    pub edges: Vec<[u32; 2]>,
    /// Saved positions aligned with `nodes`.
    pub positions: Vec<Option<[f64; 2]>>,
}

/// The file in the cache directory that remembers the layout of the notes folder `root`.
pub fn layout_file_name(root: &Path) -> String {
    format!("graph-{:016x}.json", folder_hash(root))
}

/// One saved dot position (`graph.saveLayout`).
#[derive(Clone, Debug, Deserialize)]
pub struct NodePosition {
    pub key: String,
    pub x: f64,
    pub y: f64,
}

/// Replaces the layout file with `positions` (keys sorted, LF, atomically).
pub(super) fn save_layout(file: &Path, positions: &[NodePosition]) -> Result<(), CommandError> {
    let map: BTreeMap<&str, [f64; 2]> = positions
        .iter()
        .filter(|p| p.x.is_finite() && p.y.is_finite())
        .map(|p| (p.key.as_str(), [p.x, p.y]))
        .collect();
    let text = serde_json::json!({"version": 1, "positions": map}).to_string();
    crate::fsio::write_atomic(file, &text).map_err(|e| CommandError::new("layout", e))
}

impl GraphView {
    /// Fills `positions` from the layout file; a missing or broken file, or
    /// one entry that is not two finite numbers for a node, leaves `None`.
    pub(super) fn load_layout(&mut self, file: &Path) {
        let Ok(text) = std::fs::read_to_string(file) else {
            return;
        };
        let Ok(Value::Object(root)) = serde_json::from_str::<Value>(&text) else {
            return;
        };
        if root.get("version").and_then(Value::as_u64) != Some(1) {
            return;
        }
        let Some(Value::Object(saved)) = root.get("positions") else {
            return;
        };
        for (slot, node) in self.positions.iter_mut().zip(&self.nodes) {
            if let Some(Value::Array(xy)) = saved.get(&node.key)
                && let [x, y] = xy.as_slice()
                && let (Some(x), Some(y)) = (x.as_f64(), y.as_f64())
                && x.is_finite()
                && y.is_finite()
            {
                *slot = Some([x, y]);
            }
        }
    }
}

impl GraphView {
    pub(crate) fn of(ws: &Workspace) -> GraphView {
        let mut nodes: BTreeMap<String, GraphNode> = BTreeMap::new();
        for p in ws.pages().filter(|p| p.has_content()) {
            let (kind, title) = title_of(p);
            nodes.insert(
                p.key.clone(),
                GraphNode {
                    key: p.key.clone(),
                    name: p.name.clone(),
                    title,
                    kind,
                    folder: p.folder.clone(),
                    linked_from: ws.linked_from(&p.key),
                    exists: true,
                    tag: false,
                    tag_only: false,
                },
            );
        }
        let spellings: HashMap<String, String> = ws.link_targets().into_iter().collect();
        let link_forms = ws.link_forms();
        // Per target: linked as `#tag` somewhere, linked as `[[…]]` somewhere.
        let mut forms: HashMap<&str, (bool, bool)> = HashMap::new();
        for (_, to, f) in &link_forms {
            let e = forms.entry(to).or_default();
            e.0 |= f.tag;
            e.1 |= f.page;
            if !nodes.contains_key(*to) {
                nodes.insert(to.to_string(), target_node(ws, to, spellings.get(*to)));
            }
        }
        for (key, node) in nodes.iter_mut() {
            let (tag, page) = forms.get(key.as_str()).copied().unwrap_or_default();
            node.tag = tag;
            node.tag_only = tag && !page && !node.exists;
        }
        let nodes: Vec<GraphNode> = nodes.into_values().collect();
        let index: HashMap<&str, u32> = nodes
            .iter()
            .enumerate()
            .map(|(i, n)| (n.key.as_str(), i as u32))
            .collect();
        let mut edges: Vec<[u32; 2]> = link_forms
            .iter()
            .filter(|(from, to, _)| from != to)
            .filter_map(|(from, to, _)| Some([*index.get(from)?, index[to]]))
            .collect();
        edges.sort_unstable();
        edges.dedup();
        let positions = vec![None; nodes.len()];
        GraphView {
            nodes,
            edges,
            positions,
        }
    }
}

/// A node for a link target that has no page with content: a page held in
/// memory (blank) wins over the link's spelling, else the spelling decides.
fn target_node(ws: &Workspace, key: &str, spelling: Option<&String>) -> GraphNode {
    if let Some(p) = ws.page(key) {
        let (kind, title) = title_of(p);
        return GraphNode {
            key: key.to_string(),
            name: p.name.clone(),
            title,
            kind,
            folder: p.folder.clone(),
            linked_from: ws.linked_from(key),
            exists: p.has_content(),
            tag: false,
            tag_only: false,
        };
    }
    let name = spelling.map_or(key, String::as_str).to_string();
    let date = parse_journal_name(&name);
    GraphNode {
        key: key.to_string(),
        title: date.map_or_else(|| name.clone(), journal_display),
        kind: if date.is_some() {
            PageViewKind::Journal
        } else {
            PageViewKind::Page
        },
        name,
        folder: String::new(),
        linked_from: ws.linked_from(key),
        exists: false,
        tag: false,
        tag_only: false,
    }
}

impl Session {
    /// `graph.get`, with the layout saved in the cache, if any.
    pub(super) fn graph_get(&self) -> Result<Output, CommandError> {
        let ws = self.ws()?;
        let mut graph = GraphView::of(ws);
        if let Some(dir) = self.search.cache_dir() {
            graph.load_layout(&dir.join(layout_file_name(&ws.root)));
        }
        Ok(Output {
            graph: Some(graph),
            ..Output::default()
        })
    }

    /// `graph.saveLayout`: the positions go to the cache, if there is one.
    pub(super) fn graph_save_layout(
        &self,
        positions: &[NodePosition],
    ) -> Result<Output, CommandError> {
        let root = self.ws()?.root.clone();
        if let Some(dir) = self.search.cache_dir() {
            save_layout(&dir.join(layout_file_name(&root)), positions)?;
        }
        Ok(Output::default())
    }
}
