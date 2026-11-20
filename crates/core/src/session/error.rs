//! Errors of a command: the code the window can tell apart and the message for people.

use std::fmt;

use serde::Serialize;

use crate::error::EditError;
use crate::workspace::PageError;

/// Why a command did not run: the stable, camelCase code of a `CommandError`.
/// The codes `Internal`, `BadRequest`, `Recovered` and `Git` are answered by the shell.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ErrorCode {
    BadDate,
    BadRequest,
    BoardChanged,
    ChangedOnDisk,
    Config,
    ConfigChanged,
    Create,
    DailiesSave,
    DailiesUnreadable,
    FolderExists,
    FolderMissing,
    FolderNotEmpty,
    Git,
    InsideFence,
    Internal,
    IntoItself,
    InvalidBoard,
    InvalidDaily,
    InvalidName,
    InvalidOffset,
    InvalidSetting,
    InvalidState,
    Io,
    JoinOntoProperties,
    Journal,
    Layout,
    NoCycle,
    NoFolder,
    NoNextSibling,
    NoParent,
    NoPrevious,
    NoPreviousSibling,
    NotFinished,
    Open,
    PageExists,
    Recovered,
    Reload,
    Search,
    Stale,
    UnknownBlock,
    UnknownBoard,
    UnknownColor,
    UnknownDaily,
    UnknownFolder,
    UnknownPage,
    UnknownState,
    Unsaved,
    WouldChangeStructure,
}

impl ErrorCode {
    pub const ALL: &'static [ErrorCode] = &[
        ErrorCode::BadDate,
        ErrorCode::BadRequest,
        ErrorCode::BoardChanged,
        ErrorCode::ChangedOnDisk,
        ErrorCode::Config,
        ErrorCode::ConfigChanged,
        ErrorCode::Create,
        ErrorCode::DailiesSave,
        ErrorCode::DailiesUnreadable,
        ErrorCode::FolderExists,
        ErrorCode::FolderMissing,
        ErrorCode::FolderNotEmpty,
        ErrorCode::Git,
        ErrorCode::InsideFence,
        ErrorCode::Internal,
        ErrorCode::IntoItself,
        ErrorCode::InvalidBoard,
        ErrorCode::InvalidDaily,
        ErrorCode::InvalidName,
        ErrorCode::InvalidOffset,
        ErrorCode::InvalidSetting,
        ErrorCode::InvalidState,
        ErrorCode::Io,
        ErrorCode::JoinOntoProperties,
        ErrorCode::Journal,
        ErrorCode::Layout,
        ErrorCode::NoCycle,
        ErrorCode::NoFolder,
        ErrorCode::NoNextSibling,
        ErrorCode::NoParent,
        ErrorCode::NoPrevious,
        ErrorCode::NoPreviousSibling,
        ErrorCode::NotFinished,
        ErrorCode::Open,
        ErrorCode::PageExists,
        ErrorCode::Recovered,
        ErrorCode::Reload,
        ErrorCode::Search,
        ErrorCode::Stale,
        ErrorCode::UnknownBlock,
        ErrorCode::UnknownBoard,
        ErrorCode::UnknownColor,
        ErrorCode::UnknownDaily,
        ErrorCode::UnknownFolder,
        ErrorCode::UnknownPage,
        ErrorCode::UnknownState,
        ErrorCode::Unsaved,
        ErrorCode::WouldChangeStructure,
    ];

    /// The wire name, as serde writes it.
    pub fn as_str(self) -> &'static str {
        match self {
            ErrorCode::BadDate => "badDate",
            ErrorCode::BadRequest => "badRequest",
            ErrorCode::BoardChanged => "boardChanged",
            ErrorCode::ChangedOnDisk => "changedOnDisk",
            ErrorCode::Config => "config",
            ErrorCode::ConfigChanged => "configChanged",
            ErrorCode::Create => "create",
            ErrorCode::DailiesSave => "dailiesSave",
            ErrorCode::DailiesUnreadable => "dailiesUnreadable",
            ErrorCode::FolderExists => "folderExists",
            ErrorCode::FolderMissing => "folderMissing",
            ErrorCode::FolderNotEmpty => "folderNotEmpty",
            ErrorCode::Git => "git",
            ErrorCode::InsideFence => "insideFence",
            ErrorCode::Internal => "internal",
            ErrorCode::IntoItself => "intoItself",
            ErrorCode::InvalidBoard => "invalidBoard",
            ErrorCode::InvalidDaily => "invalidDaily",
            ErrorCode::InvalidName => "invalidName",
            ErrorCode::InvalidOffset => "invalidOffset",
            ErrorCode::InvalidSetting => "invalidSetting",
            ErrorCode::InvalidState => "invalidState",
            ErrorCode::Io => "io",
            ErrorCode::JoinOntoProperties => "joinOntoProperties",
            ErrorCode::Journal => "journal",
            ErrorCode::Layout => "layout",
            ErrorCode::NoCycle => "noCycle",
            ErrorCode::NoFolder => "noFolder",
            ErrorCode::NoNextSibling => "noNextSibling",
            ErrorCode::NoParent => "noParent",
            ErrorCode::NoPrevious => "noPrevious",
            ErrorCode::NoPreviousSibling => "noPreviousSibling",
            ErrorCode::NotFinished => "notFinished",
            ErrorCode::Open => "open",
            ErrorCode::PageExists => "pageExists",
            ErrorCode::Recovered => "recovered",
            ErrorCode::Reload => "reload",
            ErrorCode::Search => "search",
            ErrorCode::Stale => "stale",
            ErrorCode::UnknownBlock => "unknownBlock",
            ErrorCode::UnknownBoard => "unknownBoard",
            ErrorCode::UnknownColor => "unknownColor",
            ErrorCode::UnknownDaily => "unknownDaily",
            ErrorCode::UnknownFolder => "unknownFolder",
            ErrorCode::UnknownPage => "unknownPage",
            ErrorCode::UnknownState => "unknownState",
            ErrorCode::Unsaved => "unsaved",
            ErrorCode::WouldChangeStructure => "wouldChangeStructure",
        }
    }
}

/// A command that did not run. `code` is camelCase and stable; `message`
/// is for people.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: ErrorCode,
    pub message: String,
}

impl CommandError {
    pub fn new(code: ErrorCode, message: impl fmt::Display) -> Self {
        CommandError {
            code,
            message: message.to_string(),
        }
    }

    pub(crate) fn no_folder() -> Self {
        CommandError::new(ErrorCode::NoFolder, "no notes folder is open")
    }

    pub(crate) fn unknown_page(key: &str) -> Self {
        CommandError::new(ErrorCode::UnknownPage, format_args!("unknown page: {key}"))
    }
}

impl fmt::Display for CommandError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code.as_str(), self.message)
    }
}

impl std::error::Error for CommandError {}

impl From<PageError> for CommandError {
    fn from(e: PageError) -> Self {
        let code = match e {
            PageError::InvalidName(_) => ErrorCode::InvalidName,
            PageError::NotLinkable(_) => ErrorCode::InvalidName,
            PageError::Exists(_) => ErrorCode::PageExists,
            PageError::IsAlias { .. } => ErrorCode::PageExists,
            PageError::UnknownFolder(_) => ErrorCode::UnknownFolder,
            PageError::FolderExists(_) => ErrorCode::FolderExists,
            PageError::Journal(_) => ErrorCode::Journal,
            PageError::UnknownColor(_) => ErrorCode::UnknownColor,
            PageError::UnknownPage(_) => ErrorCode::UnknownPage,
            PageError::FolderNotEmpty(_) => ErrorCode::FolderNotEmpty,
            PageError::IntoItself(_) => ErrorCode::IntoItself,
            PageError::ChangedOnDisk(_) => ErrorCode::ChangedOnDisk,
            PageError::Io(_) => ErrorCode::Io,
        };
        CommandError::new(code, e)
    }
}

impl From<EditError> for CommandError {
    fn from(e: EditError) -> Self {
        let code = match e {
            EditError::UnknownBlock => ErrorCode::UnknownBlock,
            EditError::UnknownState(_) => ErrorCode::UnknownState,
            EditError::NoPreviousSibling => ErrorCode::NoPreviousSibling,
            EditError::NoNextSibling => ErrorCode::NoNextSibling,
            EditError::NoParent => ErrorCode::NoParent,
            EditError::NoPrevious => ErrorCode::NoPrevious,
            EditError::InvalidOffset => ErrorCode::InvalidOffset,
            EditError::InsideFence => ErrorCode::InsideFence,
            EditError::WouldChangeStructure => ErrorCode::WouldChangeStructure,
            EditError::JoinOntoProperties => ErrorCode::JoinOntoProperties,
            EditError::NoCycle => ErrorCode::NoCycle,
            EditError::NotADaily => ErrorCode::UnknownDaily,
            EditError::EmptyDaily | EditError::MultiLineDaily => ErrorCode::InvalidDaily,
        };
        CommandError::new(code, e)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_codes_keep_their_wire_names() {
        for c in ErrorCode::ALL {
            assert_eq!(
                serde_json::to_string(c).unwrap(),
                format!("\"{}\"", c.as_str())
            );
        }
        let mut names: Vec<&str> = ErrorCode::ALL.iter().map(|c| c.as_str()).collect();
        names.sort_unstable();
        let expected = [
            "badDate",
            "badRequest",
            "boardChanged",
            "changedOnDisk",
            "config",
            "configChanged",
            "create",
            "dailiesSave",
            "dailiesUnreadable",
            "folderExists",
            "folderMissing",
            "folderNotEmpty",
            "git",
            "insideFence",
            "internal",
            "intoItself",
            "invalidBoard",
            "invalidDaily",
            "invalidName",
            "invalidOffset",
            "invalidSetting",
            "invalidState",
            "io",
            "joinOntoProperties",
            "journal",
            "layout",
            "noCycle",
            "noFolder",
            "noNextSibling",
            "noParent",
            "noPrevious",
            "noPreviousSibling",
            "notFinished",
            "open",
            "pageExists",
            "recovered",
            "reload",
            "search",
            "stale",
            "unknownBlock",
            "unknownBoard",
            "unknownColor",
            "unknownDaily",
            "unknownFolder",
            "unknownPage",
            "unknownState",
            "unsaved",
            "wouldChangeStructure",
        ];
        assert_eq!(names, expected);
    }
}
