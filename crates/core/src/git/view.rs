//! What the status bar is told about Git.

use super::sync::Problem;
use serde::Serialize;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitState {
    /// No folder is open, or `[git] enabled = false`.
    #[default]
    Off,
    /// The `git` command is not installed.
    NoGit,
    /// The folder is not in a repository; it can be set up.
    NotRepo,
    Ready,
    /// A commit or sync is running.
    Working,
    Problem,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProblemView {
    /// The problem's tag: `conflict`, `identity`, `unreachable`, …
    pub kind: String,
    pub red: bool,
    pub message: String,
}

impl ProblemView {
    pub fn of(p: &Problem) -> ProblemView {
        ProblemView {
            kind: p.kind().into(),
            red: p.red(),
            message: p.message(),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitView {
    pub state: GitState,
    /// The top of the repository, as Git prints it.
    pub top: Option<String>,
    /// The remote synced with, if the repository has one.
    pub remote: Option<String>,
    /// Commits of the notes folder the remote does not have.
    pub ahead: usize,
    /// When the folder was last committed, ms since 1970.
    pub last_commit: Option<i64>,
    /// When a fetch (with its integrate) or a push last worked.
    pub last_sync: Option<i64>,
    pub head: Option<String>,
    pub problem: Option<ProblemView>,
}
