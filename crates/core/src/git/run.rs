//! Running `git` with a time limit, no window and no prompts.

use std::ffi::OsString;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, mpsc};
use std::time::{Duration, Instant};

/// Limit for commands that only touch the local disk.
pub const LOCAL_LIMIT: Duration = Duration::from_secs(120);
/// Limit for `fetch` and `push`.
pub const NETWORK_LIMIT: Duration = Duration::from_secs(60);

/// Variables that point Git at another repository. A shell or a hook that
/// started Breccia may have them set; Breccia's commands must work on the
/// repository of the notes folder only.
const REPOSITORY_VARS: [&str; 8] = [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_COMMON_DIR",
    "GIT_NAMESPACE",
    "GIT_PREFIX",
];

/// Per-command settings for every Git call of Breccia's. They are not a config change.
const BASE_FLAGS: [&str; 2] = ["-c", "core.quotepath=off"];

/// Git for Windows runs automatic `gc` and maintenance in the foreground. Inside
/// `rebase` it would hold the session lock, inside `fetch` it would use up the
/// network limit, so those two run without it. `commit` keeps it, so the
/// repository is still tidied now and then (Breccia makes most of its commits).
const NO_AUTO_GC: [&str; 4] = ["-c", "gc.auto=0", "-c", "maintenance.auto=false"];

/// Whether a call runs without automatic `gc`: a `fetch` or any `rebase`.
pub fn without_auto_gc(args: &[&str]) -> bool {
    args.first() == Some(&"fetch") || args.contains(&"rebase")
}

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, thiserror::Error)]
pub enum GitError {
    #[error("git is not installed")]
    NotInstalled,
    #[error("git {0} took too long")]
    TimedOut(String),
    #[error("git failed ({code}): {stderr}")]
    Failed { code: i32, stderr: String },
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

pub struct GitOut {
    pub code: i32,
    pub stdout: Vec<u8>,
    pub stderr: String,
}

impl GitOut {
    /// Stdout as text, with the trailing newline trimmed.
    pub fn text(&self) -> String {
        let s = String::from_utf8_lossy(&self.stdout);
        s.trim_end_matches(['\n', '\r']).to_string()
    }

    /// Stdout split on NUL (for `-z` output), empty items dropped.
    pub fn nul_list(&self) -> Vec<String> {
        self.stdout
            .split(|b| *b == 0)
            .filter(|s| !s.is_empty())
            .map(|s| String::from_utf8_lossy(s).into_owned())
            .collect()
    }
}

#[derive(Clone, Debug)]
pub struct Git {
    program: PathBuf,
    env: Vec<(OsString, OsString)>,
    remove_env: Vec<OsString>,
    cancel: Option<Arc<AtomicBool>>,
    runs: Arc<AtomicUsize>,
    network_limit: Duration,
}

impl Default for Git {
    fn default() -> Self {
        Self::new()
    }
}

impl Git {
    /// `git` from `PATH`, without the inherited variables that would point it
    /// at another repository.
    pub fn new() -> Git {
        Git {
            program: PathBuf::from("git"),
            env: Vec::new(),
            remove_env: REPOSITORY_VARS.iter().map(OsString::from).collect(),
            cancel: None,
            runs: Arc::new(AtomicUsize::new(0)),
            network_limit: NETWORK_LIMIT,
        }
    }

    pub fn with_env(mut self, key: impl Into<OsString>, value: impl Into<OsString>) -> Git {
        let key = key.into();
        self.remove_env.retain(|k| *k != key);
        self.env.retain(|(k, _)| *k != key);
        self.env.push((key, value.into()));
        self
    }

    /// Removes a variable from the child's environment.
    pub fn without_env(mut self, key: impl Into<OsString>) -> Git {
        let key = key.into();
        self.env.retain(|(k, _)| *k != key);
        if !self.remove_env.contains(&key) {
            self.remove_env.push(key);
        }
        self
    }

    pub fn with_program(mut self, program: impl Into<PathBuf>) -> Git {
        self.program = program.into();
        self
    }

    /// A running network command (`fetch`, `push`, `ls-remote`) is cancelled
    /// (reported as `TimedOut`) when the flag is set. Local commands (`add`,
    /// `commit`, `rebase`, `rebase --abort`...) are never cancelled: killing
    /// them would leave a stale `index.lock` or a half-done rebase.
    pub fn with_cancel(mut self, flag: Arc<AtomicBool>) -> Git {
        self.cancel = Some(flag);
        self
    }

    /// The limit for `fetch` and `push` (default `NETWORK_LIMIT`).
    pub fn with_network_limit(mut self, limit: Duration) -> Git {
        self.network_limit = limit;
        self
    }

    pub fn network_limit(&self) -> Duration {
        self.network_limit
    }

    /// Whether the cancel flag is set (the app is closing).
    pub fn cancelled(&self) -> bool {
        self.cancel
            .as_deref()
            .is_some_and(|c| c.load(Ordering::SeqCst))
    }

    /// How many times `run` was called, across all clones.
    pub fn runs(&self) -> usize {
        self.runs.load(Ordering::SeqCst)
    }

    /// Runs `git -C <dir> <BASE_FLAGS> [NO_AUTO_GC] <args>`. A non-zero exit is not an error.
    pub fn run(&self, dir: &Path, args: &[&str], limit: Duration) -> Result<GitOut, GitError> {
        self.runs.fetch_add(1, Ordering::SeqCst);
        let mut cmd = Command::new(&self.program);
        cmd.arg("-C").arg(dir).args(BASE_FLAGS);
        if without_auto_gc(args) {
            cmd.args(NO_AUTO_GC);
        }
        cmd.args(args);
        for key in &self.remove_env {
            cmd.env_remove(key);
        }
        for (k, v) in &self.env {
            cmd.env(k, v);
        }
        cmd.env("GIT_TERMINAL_PROMPT", "0");
        // Some answers are matched by their text, so Git must answer in English.
        cmd.env("LANGUAGE", "C").env("LC_ALL", "C");
        let what = args.first().copied().unwrap_or("");
        let cancel = self
            .cancel
            .as_deref()
            .filter(|_| matches!(what, "fetch" | "push" | "ls-remote"));
        let out = run_limited(cmd, limit, what, cancel)?;
        Ok(GitOut {
            code: out.status.code().unwrap_or(-1),
            stdout: out.stdout,
            stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
        })
    }

    /// Like `run`, but a non-zero exit is `GitError::Failed`.
    pub fn ok(&self, dir: &Path, args: &[&str], limit: Duration) -> Result<GitOut, GitError> {
        let out = self.run(dir, args, limit)?;
        if out.code == 0 {
            Ok(out)
        } else {
            Err(GitError::Failed {
                code: out.code,
                stderr: out.stderr.trim().to_string(),
            })
        }
    }
}

fn read_all<R: Read + Send + 'static>(mut r: R) -> mpsc::Receiver<Vec<u8>> {
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = r.read_to_end(&mut buf);
        let _ = tx.send(buf);
    });
    rx
}

/// Kills the child and everything it started. `Child::kill` ends only one
/// process, and Git's helpers (`git-remote-https`, `ssh`, the credential
/// manager) keep the inherited pipes open.
fn kill_tree(child: &mut std::process::Child) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill")
            .args(["/T", "/F", "/PID", &child.id().to_string()])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("pkill")
            .args(["-KILL", "-P", &child.id().to_string()])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// Runs `cmd` with stdin closed and stdout/stderr captured. On the limit or a
/// set `cancel` flag the whole process tree is killed and `TimedOut(what)` is
/// returned. The reader threads are not joined after that: they end when the
/// last pipe handle closes.
pub fn run_limited(
    mut cmd: Command,
    limit: Duration,
    what: &str,
    cancel: Option<&AtomicBool>,
) -> Result<Output, GitError> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            GitError::NotInstalled
        } else {
            GitError::Io(e)
        }
    })?;
    let out_rx = read_all(child.stdout.take().expect("stdout is piped"));
    let err_rx = read_all(child.stderr.take().expect("stderr is piped"));
    let start = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait()? {
            break status;
        }
        let cancelled = cancel.is_some_and(|c| c.load(Ordering::SeqCst));
        if cancelled || start.elapsed() >= limit {
            kill_tree(&mut child);
            return Err(GitError::TimedOut(what.to_string()));
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    // The process ended; a helper it left behind may still hold a pipe, so the
    // readers are waited for only within what is left of the limit.
    let left = limit
        .saturating_sub(start.elapsed())
        .max(Duration::from_secs(1));
    let (Ok(stdout), Ok(stderr)) = (out_rx.recv_timeout(left), err_rx.recv_timeout(left)) else {
        return Err(GitError::TimedOut(what.to_string()));
    };
    Ok(Output {
        status,
        stdout,
        stderr,
    })
}
