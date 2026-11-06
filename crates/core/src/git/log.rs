//! The notes folder's commits, newest first, for the Git history view.

use super::repo::{HeadState, Repo};
use super::run::{GitError, LOCAL_LIMIT};
use serde::Serialize;
use std::collections::HashSet;

/// One commit of the history view.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub hash: String,
    /// The first 7 characters of `hash`.
    pub short: String,
    /// When the change was written (the author date), ms since 1970.
    pub time_ms: i64,
    pub author: String,
    /// The first line of the message.
    pub subject: String,
    /// False when the remote does not have the commit yet. Always true
    /// without a remote.
    pub pushed: bool,
}

/// One page of the history: `git.log`'s answer.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLogView {
    pub entries: Vec<LogEntry>,
    /// Whether older commits follow.
    pub more: bool,
    /// How many newer commits were skipped (echoed from the request).
    pub skip: usize,
}

impl Repo {
    /// The commits that change something in the notes folder, newest first:
    /// `limit` of them after skipping `skip`.
    pub fn log(&self, skip: usize, limit: usize) -> Result<GitLogView, GitError> {
        let mut view = GitLogView {
            entries: Vec::new(),
            more: false,
            skip,
        };
        if limit == 0 || self.head_hash()?.is_none() {
            return Ok(view);
        }
        let skip_arg = format!("--skip={skip}");
        // One more than asked for says whether older commits follow.
        let count_arg = format!("--max-count={}", limit.saturating_add(1));
        let args = [
            // The user's `log.follow` would turn the folder pathspec into `--follow`.
            "-c",
            "log.follow=false",
            "log",
            "-z",
            "--no-show-signature",
            "--format=%H%x00%at%x00%an%x00%s",
            skip_arg.as_str(),
            count_arg.as_str(),
            "--",
            ".",
        ];
        let out = self.git.ok(&self.folder, &args, LOCAL_LIMIT)?;
        // `-z` ends each commit with a NUL too, so the fields come in fours.
        // Empty fields (an empty subject) keep their place.
        let fields: Vec<String> = out
            .stdout
            .split(|b| *b == 0)
            .map(|s| String::from_utf8_lossy(s).into_owned())
            .collect();
        let unpushed = self.unpushed()?;
        for f in fields.chunks_exact(4) {
            let hash = f[0].trim_start_matches('\n').to_string();
            if hash.is_empty() {
                continue;
            }
            view.entries.push(LogEntry {
                short: hash.chars().take(7).collect(),
                time_ms: f[1].trim().parse::<i64>().unwrap_or(0) * 1000,
                author: f[2].clone(),
                subject: f[3].clone(),
                pushed: !unpushed.contains(&hash),
                hash,
            });
        }
        if view.entries.len() > limit {
            view.entries.truncate(limit);
            view.more = true;
        }
        Ok(view)
    }

    /// The folder's commits the remote does not have, by the same rule as
    /// the status bar's "not pushed" count. Empty without a remote, and when
    /// HEAD is on no branch.
    fn unpushed(&self) -> Result<HashSet<String>, GitError> {
        let HeadState::Branch(branch) = self.head()? else {
            return Ok(HashSet::new());
        };
        let Ok(Some(target)) = self.target(&branch)? else {
            return Ok(HashSet::new());
        };
        let remotes = format!("--remotes={}", target.remote);
        let args = ["rev-list", "HEAD", "--not", &remotes, "--", "."];
        let out = self.git.ok(&self.folder, &args, LOCAL_LIMIT)?;
        Ok(out
            .text()
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect())
    }
}
