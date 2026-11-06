//! Pull and push. A pull is a rebase of the local commits on the remote
//! branch. When it cannot be applied cleanly it is aborted at once, so the
//! user's files and commits stay exactly as they were. Nothing here ever runs
//! `reset`, `stash`, `clean`, `--amend` or a forced push.

use super::repo::{Busy, Repo};
use super::run::{GitError, GitOut, LOCAL_LIMIT};
use serde::Serialize;
use std::path::PathBuf;

/// Per-command settings that keep the user's Git configuration from making a
/// rebase stash their work or move other branches. They are not a config change.
const REBASE_FLAGS: [&str; 8] = [
    "-c",
    "rebase.autoStash=false",
    "-c",
    "rebase.updateRefs=false",
    "-c",
    "core.autocrlf=false",
    "-c",
    "core.eol=lf",
];

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Target {
    pub remote: String,
    /// The branch on the remote.
    pub branch: String,
    /// `"origin/main"` when the local branch already tracks it.
    pub upstream: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Integrated {
    /// Folder-relative paths the pull changed.
    pub changed: Vec<PathBuf>,
    pub moved: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pushed {
    Done,
    /// The remote moved: fetch and integrate again.
    Rejected,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Problem {
    Identity,
    Conflict {
        files: Vec<String>,
    },
    Busy {
        what: String,
    },
    /// `index.lock` has been held for a while.
    Locked,
    DirtyOutside {
        files: Vec<String>,
    },
    Detached,
    NoRemoteChoice {
        remotes: Vec<String>,
    },
    CommitRefused {
        message: String,
    },
    Unreachable {
        message: String,
    },
    /// An SSH remote refused, or waited for an answer Breccia cannot give
    /// (a passphrase, whether to trust the server).
    SshKey {
        remote: String,
    },
    /// A rebase that never started (Git refused to begin, for example because
    /// a file changed under it). The engine tries once more before it stops.
    RebaseRefused {
        message: String,
    },
    Failed {
        message: String,
    },
}

impl Problem {
    /// Everything but a remote that cannot be reached is shown red.
    pub fn red(&self) -> bool {
        !matches!(self, Problem::Unreachable { .. })
    }

    /// The explanation shown when the red item is clicked.
    pub fn message(&self) -> String {
        match self {
            Problem::Identity => "Git does not know your name and email, so Breccia cannot commit. Run: git config --global user.name \"Your Name\" and git config --global user.email you@example.com".into(),
            Problem::Conflict { files } => format!("Your notes and the remote both changed {}. Breccia undid its pull, so your files and commits are as they were, and stopped syncing. Merge with Git tools (for example git pull --rebase), then click here.", files.join(", ")),
            Problem::Busy { what } if what == "rebase" => format!("The repository is in the middle of a {what}. If you started it yourself, finish it with git rebase --continue. If Breccia's pull was cut off (Breccia or Windows stopped during it), undo it with git rebase --abort. Then click here."),
            Problem::Busy { what } => format!("The repository is in the middle of a {what}. Finish it with Git tools, then click here."),
            Problem::Locked => "Git's lock file .git/index.lock has been there for over a minute, so Breccia cannot commit, pull or push. A Git command that crashed or was stopped may have left it. If no Git program is running, delete .git/index.lock, then click here.".into(),
            Problem::DirtyOutside { files } => format!("The repository has uncommitted changes outside the notes folder ({}). Breccia does not pull until they are committed or put away.", files.join(", ")),
            Problem::Detached => "The repository is not on a branch. Check out a branch with Git tools, then click here.".into(),
            Problem::NoRemoteChoice { remotes } => format!("The repository has several remotes ({}) and no upstream. Set one with git branch -u <remote>/<branch>.", remotes.join(", ")),
            Problem::CommitRefused { message }
            | Problem::RebaseRefused { message }
            | Problem::Failed { message } => format!("Git refused: {message}"),
            Problem::Unreachable { message } => format!("Could not reach the remote: {message}"),
            Problem::SshKey { remote } => format!("Git could not use your SSH key for {remote}. SSH may be asking for a passphrase or whether to trust the server, and Breccia cannot answer it. Run git fetch once in a terminal in this folder (or add your key to ssh-agent), then click here."),
        }
    }
}

/// Whether a remote address is reached over SSH: an `ssh://`-like scheme, or
/// Git's scp-like `host:path` (no `://`, a `:` after a name that has no slash
/// and is longer than one character, so `C:` is a drive).
pub fn is_ssh_url(url: &str) -> bool {
    if ["ssh://", "git+ssh://", "ssh+git://"]
        .iter()
        .any(|p| url.starts_with(p))
    {
        return true;
    }
    if url.contains("://") {
        return false;
    }
    // Git's bracketed scp form: `[host]:path` (the host may hold colons).
    if url.starts_with('[') {
        return url.contains("]:");
    }
    match url.split_once(':') {
        Some((host, _)) => host.chars().count() > 1 && !host.contains(['/', '\\']),
        None => false,
    }
}

/// Whether Git's own words say the SSH login failed.
fn ssh_refusal(out: &GitOut) -> bool {
    out.stderr.contains("Host key verification failed")
        || out.stderr.contains("Permission denied (publickey")
}

fn failed(e: GitError) -> Problem {
    Problem::Failed {
        message: e.to_string(),
    }
}

/// The first non-empty line Git printed on stderr.
fn first_line(out: &GitOut) -> String {
    out.stderr
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("git failed ({})", out.code))
}

fn busy_name(b: Busy) -> &'static str {
    match b {
        Busy::Rebase => "rebase",
        Busy::Merge => "merge",
        Busy::CherryPick => "cherry-pick",
        Busy::Revert => "revert",
        Busy::Bisect => "bisect",
    }
}

impl Repo {
    /// Where to pull from and push to for the local `branch`. The inner
    /// `Ok(None)` means the repository has no remote, or the branch tracks
    /// another local branch.
    pub fn target(&self, branch: &str) -> Result<Result<Option<Target>, Problem>, GitError> {
        let refname = format!("refs/heads/{branch}");
        let args = [
            "for-each-ref",
            "--format=%(upstream:remotename)%00%(upstream:remoteref)",
            refname.as_str(),
        ];
        let out = self.git.ok(&self.folder, &args, LOCAL_LIMIT)?;
        let text = out.text();
        let mut parts = text.split('\0');
        let remote = parts.next().unwrap_or("");
        let remote_ref = parts.next().unwrap_or("");
        // An upstream that is another local branch (`branch.<b>.remote = .`)
        // is no remote: Breccia never pushes into a local branch.
        if remote == "." {
            return Ok(Ok(None));
        }
        if !remote.is_empty() && !remote_ref.is_empty() {
            let remote_branch = remote_ref
                .strip_prefix("refs/heads/")
                .unwrap_or(remote_ref)
                .to_string();
            let upstream = format!("{remote}/{remote_branch}");
            return Ok(Ok(Some(Target {
                remote: remote.to_string(),
                branch: remote_branch,
                upstream: Some(upstream),
            })));
        }
        let remotes: Vec<String> = self
            .git
            .ok(&self.folder, &["remote"], LOCAL_LIMIT)?
            .text()
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect();
        let chosen = match remotes.as_slice() {
            [] => return Ok(Ok(None)),
            [only] => only.clone(),
            many if many.iter().any(|r| r == "origin") => "origin".to_string(),
            _ => return Ok(Err(Problem::NoRemoteChoice { remotes })),
        };
        Ok(Ok(Some(Target {
            remote: chosen,
            branch: branch.to_string(),
            upstream: None,
        })))
    }

    /// The address `git fetch <remote>` uses; `None` when Git cannot say.
    pub fn remote_url(&self, remote: &str) -> Option<String> {
        self.url_of(remote, false)
    }

    fn url_of(&self, remote: &str, push: bool) -> Option<String> {
        let mut args = vec!["remote", "get-url"];
        if push {
            args.push("--push");
        }
        args.push(remote);
        let out = self.git.ok(&self.folder, &args, LOCAL_LIMIT).ok()?;
        Some(out.text())
    }

    /// A network command that ran out of time on an SSH remote, and was not
    /// cancelled by the app closing, is waiting for a key answer.
    fn timed_out(&self, remote: &str, push: bool, e: &GitError) -> Problem {
        if matches!(e, GitError::TimedOut(_))
            && !self.git.cancelled()
            && self.url_of(remote, push).is_some_and(|u| is_ssh_url(&u))
        {
            return Problem::SshKey {
                remote: remote.to_string(),
            };
        }
        Problem::Unreachable {
            message: e.to_string(),
        }
    }

    pub fn fetch(&self, t: &Target) -> Result<(), Problem> {
        match self.git.run(
            &self.folder,
            &["fetch", "-q", &t.remote],
            self.git.network_limit(),
        ) {
            Ok(out) if out.code == 0 => Ok(()),
            Ok(out) if ssh_refusal(&out) => Err(Problem::SshKey {
                remote: t.remote.clone(),
            }),
            Ok(out) => Err(Problem::Unreachable {
                message: first_line(&out),
            }),
            Err(GitError::NotInstalled) => Err(failed(GitError::NotInstalled)),
            Err(e) => Err(self.timed_out(&t.remote, false, &e)),
        }
    }

    /// The commit the remote branch is at, if it is known locally.
    fn remote_ref(&self, t: &Target) -> Result<Option<String>, GitError> {
        let name = match &t.upstream {
            // The exact tracking ref: a tag or branch named like the short
            // name must not win, and a custom fetch refspec is honoured.
            Some(up) => {
                let out = self.git.run(
                    &self.folder,
                    &["rev-parse", "--symbolic-full-name", "@{upstream}"],
                    LOCAL_LIMIT,
                )?;
                if out.code == 0 && !out.text().is_empty() {
                    out.text()
                } else {
                    up.clone()
                }
            }
            None => format!("refs/remotes/{}/{}", t.remote, t.branch),
        };
        let spec = format!("{name}^{{commit}}");
        let out = self.git.run(
            &self.folder,
            &["rev-parse", "-q", "--verify", &spec],
            LOCAL_LIMIT,
        )?;
        Ok((out.code == 0).then_some(name))
    }

    /// A Git path (top-relative, `/`) as shown in problems: with the folder
    /// prefix stripped where inside the folder.
    fn problem_path(&self, git_path: &str) -> String {
        match git_path.strip_prefix(self.prefix.as_str()) {
            Some(inside) => inside.to_string(),
            None => format!("{git_path} (outside the notes folder)"),
        }
    }

    /// Tracked changes outside the notes folder, top-relative.
    fn dirty_outside(&self) -> Result<Vec<String>, GitError> {
        let args = [
            "status",
            "--porcelain",
            "-z",
            "--untracked-files=no",
            "--no-renames",
            "--",
            ":/",
        ];
        let out = self.git.ok(&self.folder, &args, LOCAL_LIMIT)?;
        let mut files: Vec<String> = out
            .nul_list()
            .iter()
            .filter(|entry| entry.len() > 3)
            .map(|entry| entry[3..].to_string())
            .filter(|p| !p.starts_with(self.prefix.as_str()))
            .collect();
        files.sort();
        files.dedup();
        Ok(files)
    }

    /// Rebases the local commits on the remote branch. The caller commits the
    /// folder's changes first, under the same lock, so the tree is clean. On a
    /// conflict the rebase is aborted and the tree is as before.
    pub fn integrate(&self, t: &Target) -> Result<Integrated, Problem> {
        let nothing = Integrated {
            changed: Vec::new(),
            moved: false,
        };
        // Never touch an operation the user (or another tool) has in progress.
        if let Some(b) = self.busy().map_err(failed)? {
            return Err(Problem::Busy {
                what: busy_name(b).into(),
            });
        }
        let Some(old) = self.head_hash().map_err(failed)? else {
            return Ok(nothing);
        };
        let Some(remote) = self.remote_ref(t).map_err(failed)? else {
            return Ok(nothing);
        };
        if t.upstream.is_none() {
            // Best effort: a failure here only means the next pull tries again.
            let upstream = format!("--set-upstream-to={}/{}", t.remote, t.branch);
            let _ = self
                .git
                .run(&self.folder, &["branch", &upstream], LOCAL_LIMIT);
        }
        let ancestor = self
            .git
            .run(
                &self.folder,
                &["merge-base", "--is-ancestor", &remote, "HEAD"],
                LOCAL_LIMIT,
            )
            .map_err(failed)?;
        match ancestor.code {
            0 => return Ok(nothing),
            1 => {}
            _ => {
                return Err(Problem::Failed {
                    message: first_line(&ancestor),
                });
            }
        }
        let outside = self.dirty_outside().map_err(failed)?;
        if !outside.is_empty() {
            return Err(Problem::DirtyOutside { files: outside });
        }
        let mut args: Vec<&str> = REBASE_FLAGS.to_vec();
        args.extend(["rebase", "-q", &remote]);
        let (ok, message) = match self.git.run(&self.folder, &args, LOCAL_LIMIT) {
            Ok(out) => (out.code == 0, first_line(&out)),
            Err(e @ GitError::TimedOut(_)) => (false, e.to_string()),
            Err(e) => return Err(failed(e)),
        };
        if !ok {
            return Err(self.after_failed_rebase(&old, message));
        }
        let new = self.head_hash().map_err(failed)?;
        let moved = new.as_deref() != Some(old.as_str());
        let out = self
            .git
            .ok(
                &self.folder,
                &[
                    "diff",
                    "--name-only",
                    "--no-relative",
                    "-z",
                    "--no-renames",
                    &old,
                    "HEAD",
                    "--",
                    ".",
                ],
                LOCAL_LIMIT,
            )
            .map_err(failed)?;
        let changed = out
            .nul_list()
            .iter()
            .filter_map(|p| self.to_folder_path(p))
            .collect();
        Ok(Integrated { changed, moved })
    }

    /// The rebase failed. Abort it only when it is our own, in progress now
    /// (the caller checked that none was before). Otherwise it never started
    /// (for example "cannot rebase: You have unstaged changes") and nothing
    /// has to be undone.
    fn after_failed_rebase(&self, old: &str, message: String) -> Problem {
        match self.busy() {
            Ok(Some(Busy::Rebase)) => {}
            Ok(_) => return Problem::RebaseRefused { message },
            Err(e) => return failed(e),
        }
        let conflicted = self
            .git
            .ok(
                &self.folder,
                &[
                    "diff",
                    "--name-only",
                    "--no-relative",
                    "--diff-filter=U",
                    "-z",
                ],
                LOCAL_LIMIT,
            )
            .map(|o| o.nul_list())
            .unwrap_or_default();
        let mut args: Vec<&str> = REBASE_FLAGS.to_vec();
        args.extend(["rebase", "--abort"]);
        let abort = self.git.run(&self.folder, &args, LOCAL_LIMIT);
        let aborted = matches!(&abort, Ok(o) if o.code == 0);
        let restored = matches!(self.head_hash(), Ok(Some(h)) if h == old);
        let clear = matches!(self.busy(), Ok(None));
        if !(aborted && restored && clear) {
            let what = match &abort {
                Ok(o) if o.code != 0 => format!("rebase (Git said: {})", first_line(o)),
                Err(e) => format!("rebase (Git said: {e})"),
                _ => "rebase".to_string(),
            };
            return Problem::Busy { what };
        }
        if conflicted.is_empty() {
            return Problem::Failed { message };
        }
        let mut files: Vec<String> = conflicted.iter().map(|p| self.problem_path(p)).collect();
        files.sort();
        files.dedup();
        Problem::Conflict { files }
    }

    pub fn push(&self, t: &Target) -> Result<Pushed, Problem> {
        let refspec = format!("HEAD:refs/heads/{}", t.branch);
        let mut args = vec!["push", "--porcelain"];
        if t.upstream.is_none() {
            args.push("--set-upstream");
        }
        args.extend([t.remote.as_str(), refspec.as_str()]);
        let out = match self.git.run(&self.folder, &args, self.git.network_limit()) {
            Ok(out) => out,
            Err(GitError::NotInstalled) => return Err(failed(GitError::NotInstalled)),
            Err(e) => return Err(self.timed_out(&t.remote, true, &e)),
        };
        if out.code == 0 {
            return Ok(Pushed::Done);
        }
        if ssh_refusal(&out) {
            return Err(Problem::SshKey {
                remote: t.remote.clone(),
            });
        }
        let both = format!("{}\n{}", String::from_utf8_lossy(&out.stdout), out.stderr);
        if both.contains("[remote rejected]") {
            let line = both
                .lines()
                .find(|l| l.contains("[remote rejected]"))
                .unwrap_or("")
                .trim();
            return Err(Problem::Failed {
                message: format!("{line} {}", first_line(&out)).trim().to_string(),
            });
        }
        if both.contains("[rejected]") {
            return Ok(Pushed::Rejected);
        }
        Err(Problem::Unreachable {
            message: first_line(&out),
        })
    }

    /// How many commits touching the notes folder are not on any branch of
    /// `remote` yet (0 when unborn).
    pub fn ahead(&self, remote: &str) -> Result<usize, GitError> {
        if self.head_hash()?.is_none() {
            return Ok(0);
        }
        let remotes = format!("--remotes={remote}");
        let args = ["rev-list", "--count", "HEAD", "--not", &remotes, "--", "."];
        let out = self.git.ok(&self.folder, &args, LOCAL_LIMIT)?;
        Ok(out.text().trim().parse().unwrap_or(0))
    }
}
