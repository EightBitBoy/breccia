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
    /// A block with several lines joined onto one whose text ends in property
    /// lines (a task's `created::`): its later lines would land after them.
    #[error(
        "This block can't be joined onto the one above: its own lines would end up          after the created:: and other property lines there"
    )]
    JoinOntoProperties,
    #[error("cannot split a block inside a code fence")]
    InsideFence,
    /// A daily operation on a block that is not a top-level block.
    #[error("not a daily")]
    NotADaily,
    #[error("A daily needs one line of text.")]
    EmptyDaily,
    #[error("A daily needs one line of text.")]
    MultiLineDaily,
    #[error("No state is in the cycle (Settings → States)")]
    NoCycle,
}
