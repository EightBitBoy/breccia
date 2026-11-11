//! The page tree the sidebar shows: folders and pages, and journals by date.

use chrono::Datelike;
use serde::Serialize;

use crate::naming::{journal_display, month_name};
use crate::workspace::{PageKind, TagEntry, Workspace};

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeView {
    pub pages: Vec<TreeNode>,
    pub journals: Vec<JournalYear>,
    /// The sidebar's Tags section ([`Workspace::tags`]).
    pub tags: Vec<TagEntry>,
}

/// The parts of the tree that follow the links: the linked-only pages and
/// the tags. The session resends the tree when they change.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct LinkLists {
    pub(crate) pages: Vec<(String, String)>,
    pub(crate) tags: Vec<TagEntry>,
}

impl LinkLists {
    pub(crate) fn of(ws: &Workspace) -> LinkLists {
        LinkLists {
            pages: ws.linked_only_pages(),
            tags: ws.tags(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TreeNode {
    Folder {
        name: String,
        path: String,
        children: Vec<TreeNode>,
    },
    Page {
        key: String,
        name: String,
        /// No file and no text of its own: only `[[…]]` links go to it.
        #[serde(rename = "linkedOnly")]
        linked_only: bool,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalYear {
    pub year: i32,
    pub months: Vec<JournalMonth>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalMonth {
    pub month: u32,
    /// The English month name, e.g. `October`.
    pub label: String,
    pub days: Vec<JournalDay>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalDay {
    pub key: String,
    pub title: String,
}

impl TreeView {
    /// Pages with a file, and at the top level the linked-only pages
    /// ([`Workspace::linked_only_pages`]). Folders first, then pages, each
    /// sorted by lower-cased name and then by name; journals newest first.
    pub(crate) fn of(ws: &Workspace) -> TreeView {
        TreeView::with(ws, &LinkLists::of(ws))
    }

    /// [`of`](Self::of), with the link lists already worked out.
    pub(crate) fn with(ws: &Workspace, lists: &LinkLists) -> TreeView {
        let mut journals = Vec::new();
        for p in ws.pages().filter(|p| p.has_file()) {
            if let PageKind::Journal(d) = &p.kind {
                journals.push((*d, p.key.clone()));
            }
        }
        journals.sort_by(|a, b| b.0.cmp(&a.0));
        let mut years: Vec<JournalYear> = Vec::new();
        for (date, key) in journals {
            if years.last().is_none_or(|y| y.year != date.year()) {
                years.push(JournalYear {
                    year: date.year(),
                    months: Vec::new(),
                });
            }
            let months = &mut years.last_mut().expect("just pushed").months;
            if months.last().is_none_or(|m| m.month != date.month()) {
                months.push(JournalMonth {
                    month: date.month(),
                    label: month_name(date),
                    days: Vec::new(),
                });
            }
            months
                .last_mut()
                .expect("just pushed")
                .days
                .push(JournalDay {
                    key,
                    title: journal_display(date),
                });
        }
        TreeView {
            pages: children(ws, "", &lists.pages),
            journals: years,
            tags: lists.tags.clone(),
        }
    }
}

/// The nodes directly inside the folder `parent` (`""` is the top).
fn children(ws: &Workspace, parent: &str, linked_only: &[(String, String)]) -> Vec<TreeNode> {
    let mut folders: Vec<(&str, &str)> = ws
        .folders()
        .filter_map(|path| {
            let name = match parent {
                "" => path,
                _ => path.strip_prefix(parent)?.strip_prefix('/')?,
            };
            (!name.contains('/')).then_some((name, path))
        })
        .collect();
    folders.sort_by(|a, b| (a.0.to_lowercase(), a.0).cmp(&(b.0.to_lowercase(), b.0)));
    let mut pages: Vec<(&str, &str, bool)> = ws
        .pages()
        .filter(|p| p.has_file() && p.kind == PageKind::Page && p.folder == parent)
        .map(|p| (p.name.as_str(), p.key.as_str(), false))
        .collect();
    if parent.is_empty() {
        pages.extend(
            linked_only
                .iter()
                .map(|(k, n)| (n.as_str(), k.as_str(), true)),
        );
    }
    pages.sort_by(|a, b| (a.0.to_lowercase(), a.0).cmp(&(b.0.to_lowercase(), b.0)));

    let mut out: Vec<TreeNode> = folders
        .into_iter()
        .map(|(name, path)| TreeNode::Folder {
            name: name.to_string(),
            path: path.to_string(),
            children: children(ws, path, linked_only),
        })
        .collect();
    out.extend(
        pages
            .into_iter()
            .map(|(name, key, linked_only)| TreeNode::Page {
                key: key.to_string(),
                name: name.to_string(),
                linked_only,
            }),
    );
    out
}
