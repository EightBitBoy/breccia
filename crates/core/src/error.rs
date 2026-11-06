//! Errors for edits on a [`Document`](crate::outline::Document).

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum EditError {
    #[error("unknown block")]
    UnknownBlock,
    #[error("unknown state: {0}")]
    UnknownState(String),
    #[error("block has no previous sibling")]
    NoPreviousSibling,
    #[error("block has no next sibling")]
    NoNextSibling,
    #[error("block has no parent")]
    NoParent,
    #[error("block has no previous block")]
    NoPrevious,
    #[error("offset is not a valid position in the text")]
    InvalidOffset,
    #[error("the change would alter the outline around the block")]
    WouldChangeStructure,
    #[error("cannot split a block inside a code fence")]
    InsideFence,
    #[error("No state is in the cycle (Settings → States)")]
    NoCycle,
}
