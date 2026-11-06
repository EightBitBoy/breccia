//! `pages.table`: one row per page, for the All pages table.

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::workspace::Workspace;

use super::view::{PageViewKind, title_of};

/// A row of the All pages table.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageRowView {
    pub key: String,
    pub name: String,
    /// The long date for a journal, else the name (`title_of`).
    pub title: String,
    pub kind: PageViewKind,
    /// `/`-joined folder under `pages/`; "" at top level and for journals.
    pub folder: String,
    /// Milliseconds since 1970-01-01 UTC: the date Git first added the file
    /// when known, else the file's; None without either.
    pub created: Option<i64>,
    pub edited: Option<i64>,
    /// The page's linked-references count.
    pub linked_from: usize,
    /// Different other pages this page links to.
    pub links_out: usize,
    /// No file and no text of its own: only `[[…]]` links go to it.
    pub linked_only: bool,
}

/// Milliseconds since 1970-01-01 UTC; `None` before 1970.
fn epoch_ms(t: SystemTime) -> Option<i64> {
    let d = t.duration_since(UNIX_EPOCH).ok()?;
    i64::try_from(d.as_millis()).ok()
}

impl PageRowView {
    /// One row per page with a file or content, journals included, and one
    /// per page only linked to (by `[[…]]` or `#tag`); sorted by key.
    pub(super) fn all(ws: &Workspace, git_created: &HashMap<PathBuf, i64>) -> Vec<PageRowView> {
        let mut rows: Vec<PageRowView> = ws
            .pages()
            .filter(|p| p.has_content())
            .map(|p| {
                let (kind, title) = title_of(p);
                PageRowView {
                    key: p.key.clone(),
                    name: p.name.clone(),
                    title,
                    kind,
                    folder: p.folder.clone(),
                    created: git_created
                        .get(&p.rel_path)
                        .copied()
                        .or_else(|| p.created().and_then(epoch_ms)),
                    edited: p.edited().and_then(epoch_ms),
                    linked_from: ws.linked_from(&p.key),
                    links_out: ws.links_out(&p.key),
                    linked_only: false,
                }
            })
            .collect();
        let mut linked = ws.linked_only_pages();
        linked.extend(
            ws.tags()
                .into_iter()
                .filter(|t| t.linked_only)
                .map(|t| (t.key, t.name)),
        );
        linked.sort();
        linked.dedup_by(|a, b| a.0 == b.0);
        rows.extend(linked.into_iter().map(|(key, name)| PageRowView {
            linked_from: ws.linked_from(&key),
            links_out: 0,
            title: name.clone(),
            kind: PageViewKind::Page,
            folder: String::new(),
            created: None,
            edited: None,
            linked_only: true,
            key,
            name,
        }));
        rows.sort_by(|a, b| a.key.cmp(&b.key));
        rows
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn times_before_1970_are_none() {
        use std::time::Duration;
        assert_eq!(
            epoch_ms(UNIX_EPOCH + Duration::from_millis(1500)),
            Some(1500)
        );
        assert_eq!(epoch_ms(UNIX_EPOCH - Duration::from_secs(1)), None);
    }
}
