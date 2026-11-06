//! Multi-select edits: which blocks a batch acts on, and in which order.
//! The session makes a batch all-or-nothing by restoring the document when
//! a step fails.

use crate::error::EditError;
use crate::outline::{BlockId, Document};

/// The selected blocks no ancestor of which is also selected, in document
/// order. Fails with [`EditError::UnknownBlock`] if an id is not in `doc`.
pub(crate) fn roots(doc: &Document, ids: &[BlockId]) -> Result<Vec<BlockId>, EditError> {
    let mut idx = selected(doc, ids)?;
    idx.retain(|&i| {
        let mut cur = doc.blocks()[i].id();
        while let Some(parent) = doc.parent_of(cur) {
            if ids.contains(&parent) {
                return false;
            }
            cur = parent;
        }
        true
    });
    Ok(idx.into_iter().map(|i| doc.blocks()[i].id()).collect())
}

/// Every selected block once, in document order.
pub(crate) fn all(doc: &Document, ids: &[BlockId]) -> Result<Vec<BlockId>, EditError> {
    Ok(selected(doc, ids)?
        .into_iter()
        .map(|i| doc.blocks()[i].id())
        .collect())
}

fn selected(doc: &Document, ids: &[BlockId]) -> Result<Vec<usize>, EditError> {
    let mut idx = ids
        .iter()
        .map(|&id| doc.index_of(id).ok_or(EditError::UnknownBlock))
        .collect::<Result<Vec<_>, _>>()?;
    idx.sort_unstable();
    idx.dedup();
    Ok(idx)
}
