//! Finding the repository a notes folder lives in, and reading its state.

use super::run::{Git, GitError, GitOut, LOCAL_LIMIT};
use std::path::{Path, PathBuf};

pub enum Discovered {
    NotInstalled,
    NotARepo,
    Repo(Repo),
}

#[derive(Clone, Debug)]
pub struct Repo {
    pub git: Git,
    pub folder: PathBuf,
    /// The top of the repository, as Git prints it.
    pub top: String,
    /// `""` at the top, else `"pages-dir/"` style with a trailing `/`.
    pub prefix: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HeadState {
    Branch(String),
    Unborn(String),
    Detached,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Busy {
    Rebase,
    Merge,
    CherryPick,
    Revert,
    Bisect,
}

/// `Ok(None)` is "not a repository"; `Ok(Some((top, prefix)))` is a repository.
/// Exit 128 is also Git's answer to "dubious ownership", an unreadable `.git`
/// or a broken `HEAD`, so only Git's own "not a git repository" counts as none.
pub fn classify_discover(out: &GitOut) -> Result<Option<(String, String)>, GitError> {
    if out.code != 0 {
        if out.stderr.contains("not a git repository") {
            return Ok(None);
        }
        return Err(GitError::Failed {
            code: out.code,
            stderr: out.stderr.trim().to_string(),
        });
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let mut lines = text.split('\n').map(|l| l.trim_end_matches('\r'));
    let top = lines.next().unwrap_or("").to_string();
    let prefix = lines.next().unwrap_or("").to_string();
    Ok(Some((top, prefix)))
}

pub fn discover(git: &Git, folder: &Path) -> Result<Discovered, GitError> {
    let args = ["rev-parse", "--show-toplevel", "--show-prefix"];
    let out = match git.run(folder, &args, LOCAL_LIMIT) {
        Ok(out) => out,
        Err(GitError::NotInstalled) => return Ok(Discovered::NotInstalled),
        Err(e) => return Err(e),
    };
    Ok(match classify_discover(&out)? {
        None => Discovered::NotARepo,
        Some((top, prefix)) => Discovered::Repo(Repo {
            git: git.clone(),
            folder: folder.to_path_buf(),
            top,
            prefix,
        }),
    })
}

impl Repo {
    pub fn head(&self) -> Result<HeadState, GitError> {
        let args = ["symbolic-ref", "-q", "--short", "HEAD"];
        let out = self.git.run(&self.folder, &args, LOCAL_LIMIT)?;
        match out.code {
            0 => {
                let name = out.text();
                Ok(if self.head_hash()?.is_some() {
                    HeadState::Branch(name)
                } else {
                    HeadState::Unborn(name)
                })
            }
            1 => Ok(HeadState::Detached),
            code => Err(GitError::Failed {
                code,
                stderr: out.stderr.trim().to_string(),
            }),
        }
    }

    pub fn head_hash(&self) -> Result<Option<String>, GitError> {
        let args = ["rev-parse", "-q", "--verify", "HEAD"];
        let out = self.git.run(&self.folder, &args, LOCAL_LIMIT)?;
        match out.code {
            0 => Ok(Some(out.text())),
            1 => Ok(None),
            code => Err(GitError::Failed {
                code,
                stderr: out.stderr.trim().to_string(),
            }),
        }
    }

    /// Which unfinished operation, if any, the repository is in the middle of.
    pub fn busy(&self) -> Result<Option<Busy>, GitError> {
        const MARKS: [(&str, Busy); 6] = [
            ("rebase-merge", Busy::Rebase),
            ("rebase-apply", Busy::Rebase),
            ("MERGE_HEAD", Busy::Merge),
            ("CHERRY_PICK_HEAD", Busy::CherryPick),
            ("REVERT_HEAD", Busy::Revert),
            ("BISECT_LOG", Busy::Bisect),
        ];
        let mut args = vec!["rev-parse"];
        for (name, _) in MARKS {
            args.push("--git-path");
            args.push(name);
        }
        let out = self.git.ok(&self.folder, &args, LOCAL_LIMIT)?;
        let text = out.text();
        for ((_, busy), line) in MARKS.iter().zip(text.lines()) {
            let line = line.trim_end_matches('\r');
            if self.folder.join(line).exists() {
                return Ok(Some(*busy));
            }
        }
        Ok(None)
    }

    /// A top-relative `/` path from Git output, made relative to the notes
    /// folder; `None` when it lies outside.
    pub fn to_folder_path(&self, git_path: &str) -> Option<PathBuf> {
        let rest = git_path.strip_prefix(self.prefix.as_str())?;
        let mut path = PathBuf::new();
        for part in rest.split('/').filter(|p| !p.is_empty()) {
            path.push(part);
        }
        Some(path)
    }
}
