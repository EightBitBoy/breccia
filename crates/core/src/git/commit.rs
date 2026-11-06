//! Committing only the notes folder, `git init`, and dates from the history.

use super::message::Change;
use super::repo::{Discovered, Repo, discover};
use super::run::{Git, GitError, LOCAL_LIMIT};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Breccia's half-written temporary files never go into a commit.
pub const TMP_EXCLUDE: &str = ":(exclude,glob)**/.*.breccia-tmp";

pub const GITIGNORE: &str = "# Breccia's temporary files while saving\n.*.breccia-tmp\n# System files\n.DS_Store\nThumbs.db\ndesktop.ini\n";
pub const GITATTRIBUTES: &str =
    "# Breccia saves every file with LF line endings\n* text=auto eol=lf\n";

impl Repo {
    /// Folder-relative paths of every change in the notes folder, sorted, without repeats.
    pub fn changes(&self) -> Result<Vec<PathBuf>, GitError> {
        let args = [
            "status",
            "--porcelain=v1",
            "-z",
            "--untracked-files=all",
            "--no-renames",
            "--",
            ".",
            TMP_EXCLUDE,
        ];
        let out = self.git.ok(&self.folder, &args, LOCAL_LIMIT)?;
        let mut paths: Vec<PathBuf> = out
            .nul_list()
            .iter()
            .filter(|entry| entry.len() > 3)
            .filter_map(|entry| self.to_folder_path(&entry[3..]))
            .collect();
        paths.sort();
        paths.dedup();
        Ok(paths)
    }

    /// Whether Git knows who is committing (author and committer).
    pub fn identity_ok(&self) -> Result<bool, GitError> {
        for var in ["GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"] {
            if self.git.run(&self.folder, &["var", var], LOCAL_LIMIT)?.code != 0 {
                return Ok(false);
            }
        }
        Ok(true)
    }

    /// Commits the changes inside the notes folder and nothing else: files the
    /// user staged elsewhere stay staged. `Ok(None)` when there is nothing to
    /// commit; else the new HEAD hash.
    pub fn commit(&self, message: &str) -> Result<Option<String>, GitError> {
        self.commit_with(|_| message.to_string())
    }

    /// As [`Repo::commit`], with the message made from the staged changes
    /// (renames found by Git, as `git diff --cached -M` sees them).
    pub fn commit_with(
        &self,
        message: impl FnOnce(&[Change]) -> String,
    ) -> Result<Option<String>, GitError> {
        self.git.ok(
            &self.folder,
            &["add", "-A", "--", ".", TMP_EXCLUDE],
            LOCAL_LIMIT,
        )?;
        let staged = self.staged()?;
        if staged.is_empty() {
            return Ok(None);
        }
        let message = message(&staged);
        self.git.ok(
            &self.folder,
            &["commit", "-q", "-m", &message, "--only", "--", "."],
            LOCAL_LIMIT,
        )?;
        self.head_hash()
    }

    /// The staged changes inside the notes folder, folder-relative.
    fn staged(&self) -> Result<Vec<Change>, GitError> {
        let out = self.git.ok(
            &self.folder,
            &["diff", "--cached", "--name-status", "-z", "-M", "--", "."],
            LOCAL_LIMIT,
        )?;
        let items = out.nul_list();
        let mut changes = Vec::new();
        let mut it = items.iter();
        while let Some(status) = it.next() {
            let Some(path) = it.next() else { break };
            let path = self.to_folder_path(path);
            match status.chars().next() {
                Some('R') => {
                    let to = it.next().and_then(|p| self.to_folder_path(p));
                    match (path, to) {
                        (Some(from), Some(to)) => changes.push(Change::Renamed { from, to }),
                        (None, Some(to)) => changes.push(Change::Added(to)),
                        (Some(from), None) => changes.push(Change::Deleted(from)),
                        (None, None) => {}
                    }
                }
                Some('C') => {
                    // A copy: the second path is the new file.
                    if let Some(to) = it.next().and_then(|p| self.to_folder_path(p)) {
                        changes.push(Change::Added(to));
                    }
                }
                Some('A') => changes.extend(path.map(Change::Added)),
                Some('D') => changes.extend(path.map(Change::Deleted)),
                _ => changes.extend(path.map(Change::Modified)),
            }
        }
        Ok(changes)
    }

    /// When the last commit touching the notes folder was made, in ms.
    pub fn last_commit_ms(&self) -> Result<Option<i64>, GitError> {
        if self.head_hash()?.is_none() {
            return Ok(None);
        }
        let out = self.git.ok(
            &self.folder,
            &["log", "-1", "--format=%ct", "--", "."],
            LOCAL_LIMIT,
        )?;
        Ok(out.text().trim().parse::<i64>().ok().map(|s| s * 1000))
    }

    /// For each file in the notes folder, when it was first added, in ms (the
    /// oldest add wins).
    pub fn created_dates(&self) -> Result<HashMap<PathBuf, i64>, GitError> {
        let mut dates = HashMap::new();
        if self.head_hash()?.is_none() {
            return Ok(dates);
        }
        let args = [
            "log",
            "--no-renames",
            "--diff-filter=A",
            "--no-relative",
            "--format=%x01%ct",
            "--name-only",
            "-z",
            "--",
            ".",
        ];
        let out = self.git.ok(&self.folder, &args, LOCAL_LIMIT)?;
        let mut time: Option<i64> = None;
        for item in out.nul_list() {
            // The first name after a header starts with the header's newline.
            let item = item.trim_start_matches('\n');
            if let Some(header) = item.strip_prefix('\x01') {
                time = header.trim().parse::<i64>().ok().map(|s| s * 1000);
                continue;
            }
            let (Some(ms), Some(path)) = (time, self.to_folder_path(item)) else {
                continue;
            };
            dates
                .entry(path)
                .and_modify(|old| *old = (*old).min(ms))
                .or_insert(ms);
        }
        Ok(dates)
    }
}

/// `git init` in `folder`, then `.gitignore` and `.gitattributes` where
/// missing. Refuses unless discovery says "not a repository", so a folder Git
/// refused to open (dubious ownership) never gets a nested repository. It does
/// not commit.
pub fn init(git: &Git, folder: &Path) -> Result<Repo, GitError> {
    match discover(git, folder)? {
        Discovered::NotARepo => {}
        Discovered::NotInstalled => return Err(GitError::NotInstalled),
        Discovered::Repo(_) => {
            return Err(GitError::Failed {
                code: 0,
                stderr: "the folder is already in a Git repository".into(),
            });
        }
    }
    git.ok(folder, &["init", "-q"], LOCAL_LIMIT)?;
    for (name, text) in [(".gitignore", GITIGNORE), (".gitattributes", GITATTRIBUTES)] {
        let path = folder.join(name);
        if !path.exists() {
            crate::fsio::write_atomic(&path, text)?;
        }
    }
    match discover(git, folder)? {
        Discovered::Repo(repo) => Ok(repo),
        _ => Err(GitError::Failed {
            code: 0,
            stderr: "git init did not create a repository".into(),
        }),
    }
}
