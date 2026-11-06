//! Shared helpers for the tests that run `git`: a temp root with its own
//! gitconfig, so no test ever reads the developer's Git configuration or
//! finds a repository above the temp root.
// Each test crate compiles this whole module, and a file that does not use
// `bare` or `repo` would fail `clippy -D warnings` with `dead_code`.
#![allow(dead_code)]

use breccia_core::git::{Git, LOCAL_LIMIT};
use std::path::{Path, PathBuf};

pub struct Env {
    pub root: tempfile::TempDir,
    pub git: Git,
}

pub fn env() -> Env {
    let root = tempfile::tempdir().unwrap();
    let home = root.path().join("home");
    std::fs::create_dir_all(&home).unwrap();
    let config = home.join("gitconfig");
    std::fs::write(
        &config,
        "[user]\n\tname = Breccia Test\n\temail = test@example.invalid\n\
         [commit]\n\tgpgsign = false\n[tag]\n\tgpgsign = false\n\
         [init]\n\tdefaultBranch = main\n[core]\n\tautocrlf = false\n",
    )
    .unwrap();
    let canon = root.path().canonicalize().unwrap();
    let canon = canon.to_string_lossy().to_string();
    let canon = canon.strip_prefix(r"\\?\").unwrap_or(&canon).to_string();
    let sep = if cfg!(windows) { ";" } else { ":" };
    let ceiling = format!("{}{}{}", root.path().display(), sep, canon);
    let git = Git::new()
        .with_env("GIT_CONFIG_NOSYSTEM", "1")
        .with_env("GIT_CONFIG_GLOBAL", &config)
        .with_env("GIT_CEILING_DIRECTORIES", ceiling)
        .without_env("GIT_DIR")
        .without_env("GIT_WORK_TREE")
        .without_env("GIT_INDEX_FILE");
    Env { root, git }
}

/// Runs git and returns its trimmed stdout; panics with stderr on failure.
pub fn git(e: &Env, dir: &Path, args: &[&str]) -> String {
    match e.git.ok(dir, args, LOCAL_LIMIT) {
        Ok(out) => out.text(),
        Err(err) => panic!("git {args:?} failed: {err}"),
    }
}

/// `git init`, write the files, add, commit "init".
pub fn repo(e: &Env, name: &str, files: &[(&str, &str)]) -> PathBuf {
    let dir = e.root.path().join(name);
    std::fs::create_dir_all(&dir).unwrap();
    git(e, &dir, &["init", "-q"]);
    for (rel, text) in files {
        let p = dir.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, text).unwrap();
    }
    git(e, &dir, &["add", "-A"]);
    git(e, &dir, &["commit", "-q", "-m", "init"]);
    dir
}

pub fn bare(e: &Env, name: &str) -> PathBuf {
    let dir = e.root.path().join(name);
    std::fs::create_dir_all(&dir).unwrap();
    git(e, &dir, &["init", "-q", "--bare", "-b", "main"]);
    dir
}

/// A stand-in for `ssh`: writes `body` as a shell script in the temp root and
/// returns the value for `GIT_SSH_COMMAND`. The path is quoted (a temp path may
/// contain parentheses) and uses forward slashes, as Git runs it through `sh`.
pub fn fake_ssh(e: &Env, name: &str, body: &str) -> String {
    let path = e.root.path().join(name);
    std::fs::write(&path, body).unwrap();
    format!("sh '{}'", path.to_string_lossy().replace('\\', "/"))
}
