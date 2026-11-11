use crate::gitenv::*;
use crate::support::read;
use breccia_core::git::{
    Discovered, Git, LOCAL_LIMIT, Problem, Pushed, Repo, Target, discover, is_ssh_url,
};
use std::path::{Path, PathBuf};

fn open(g: &Git, dir: &Path) -> Repo {
    match discover(g, dir).unwrap() {
        Discovered::Repo(r) => r,
        _ => panic!("not a repo"),
    }
}

fn clone(e: &Env, bare: &Path, name: &str) -> PathBuf {
    let dir = e.root.path().join(name);
    git(
        e,
        e.root.path(),
        &["clone", "-q", &bare.to_string_lossy(), name],
    );
    dir
}

/// A bare remote with `files` pushed to `main`, cloned twice.
fn clones(e: &Env, files: &[(&str, &str)]) -> (PathBuf, PathBuf, PathBuf) {
    let seed = repo(e, "seed", files);
    let bare = bare(e, "remote.git");
    git(
        e,
        &seed,
        &[
            "push",
            "-q",
            &bare.to_string_lossy(),
            "HEAD:refs/heads/main",
        ],
    );
    let mine = clone(e, &bare, "mine");
    let theirs = clone(e, &bare, "theirs");
    (bare, mine, theirs)
}

fn two_clones(e: &Env) -> (PathBuf, PathBuf, PathBuf) {
    clones(e, &[("pages/A.md", "- a\n"), ("pages/B.md", "- b\n")])
}

fn commit_file(e: &Env, dir: &Path, rel: &str, text: &str) {
    std::fs::write(dir.join(rel), text).unwrap();
    git(e, dir, &["add", "-A"]);
    git(e, dir, &["commit", "-q", "-m", "change"]);
}

fn target(r: &Repo) -> Target {
    r.target("main").unwrap().unwrap().unwrap()
}

#[test]
fn a_remote_change_is_pulled_and_reported() {
    let e = env();
    let (bare, mine, theirs) = two_clones(&e);
    commit_file(&e, &theirs, "pages/B.md", "- b2\n");
    git(&e, &theirs, &["push", "-q", "origin", "main"]);
    commit_file(&e, &mine, "pages/A.md", "- a2\n");
    let r = open(&e.git, &mine);
    let t = target(&r);
    assert_eq!(t.upstream.as_deref(), Some("origin/main"));
    r.fetch(&t).unwrap();
    let done = r.integrate(&t).unwrap();
    assert!(done.moved);
    assert_eq!(done.changed, vec![PathBuf::from("pages").join("B.md")]);
    assert_eq!(read(&mine, "pages/B.md"), "- b2\n");
    assert_eq!(read(&mine, "pages/A.md"), "- a2\n");
    assert_eq!(git(&e, &mine, &["rev-list", "--merges", "HEAD"]), "");
    assert_eq!(r.ahead("origin").unwrap(), 1);
    assert_eq!(r.push(&t).unwrap(), Pushed::Done);
    assert_eq!(
        git(&e, &bare, &["rev-parse", "main"]),
        git(&e, &mine, &["rev-parse", "HEAD"])
    );
    assert_eq!(r.ahead("origin").unwrap(), 0);
}

#[test]
fn a_conflict_is_aborted_and_changes_nothing() {
    let e = env();
    let (bare, mine, theirs) = two_clones(&e);
    commit_file(&e, &theirs, "pages/A.md", "- theirs\n");
    git(&e, &theirs, &["push", "-q", "origin", "main"]);
    commit_file(&e, &mine, "pages/A.md", "- mine\n");
    let r = open(&e.git, &mine);
    let t = target(&r);
    let head = git(&e, &mine, &["rev-parse", "HEAD"]);
    let remote_before = git(&e, &bare, &["rev-parse", "main"]);
    r.fetch(&t).unwrap();
    assert_eq!(
        r.integrate(&t),
        Err(Problem::Conflict {
            files: vec!["pages/A.md".into()]
        })
    );
    assert_eq!(git(&e, &mine, &["rev-parse", "HEAD"]), head);
    assert_eq!(read(&mine, "pages/A.md"), "- mine\n");
    assert_eq!(read(&mine, "pages/B.md"), "- b\n");
    assert_eq!(git(&e, &mine, &["status", "--porcelain"]), "");
    assert!(r.busy().unwrap().is_none());
    assert_eq!(git(&e, &bare, &["rev-parse", "main"]), remote_before);
}

#[test]
fn changes_outside_the_folder_block_the_pull_untouched() {
    let e = env();
    let (_bare, mine, theirs) =
        clones(&e, &[("notes/pages/A.md", "- a\n"), ("other/x.txt", "x\n")]);
    commit_file(&e, &theirs, "notes/pages/A.md", "- a2\n");
    git(&e, &theirs, &["push", "-q", "origin", "main"]);
    let r = open(&e.git, &mine.join("notes"));
    let t = target(&r);
    r.fetch(&t).unwrap();
    std::fs::write(mine.join("other/x.txt"), "mine\n").unwrap();
    let head = git(&e, &mine, &["rev-parse", "HEAD"]);
    assert_eq!(
        r.integrate(&t),
        Err(Problem::DirtyOutside {
            files: vec!["other/x.txt".into()]
        })
    );
    assert_eq!(read(&mine, "other/x.txt"), "mine\n");
    assert_eq!(git(&e, &mine, &["stash", "list"]), "");
    assert_eq!(git(&e, &mine, &["rev-parse", "HEAD"]), head);
}

#[test]
fn the_first_push_creates_the_branch_and_sets_upstream() {
    let e = env();
    let dir = repo(&e, "mine", &[("pages/A.md", "- a\n")]);
    let bare = bare(&e, "empty.git");
    git(
        &e,
        &dir,
        &["remote", "add", "origin", &bare.to_string_lossy()],
    );
    let r = open(&e.git, &dir);
    let t = target(&r);
    assert_eq!(
        t,
        Target {
            remote: "origin".into(),
            branch: "main".into(),
            upstream: None
        }
    );
    let done = r.integrate(&t).unwrap();
    assert!(!done.moved && done.changed.is_empty());
    assert_eq!(r.push(&t).unwrap(), Pushed::Done);
    assert_eq!(
        git(&e, &dir, &["rev-parse", "--abbrev-ref", "@{u}"]),
        "origin/main"
    );
    assert_eq!(
        git(&e, &bare, &["rev-parse", "main"]),
        git(&e, &dir, &["rev-parse", "HEAD"])
    );
}

#[test]
fn an_unreachable_remote_is_not_red() {
    let e = env();
    let dir = repo(&e, "mine", &[("pages/A.md", "- a\n")]);
    let gone = e.root.path().join("does-not-exist.git");
    git(
        &e,
        &dir,
        &["remote", "add", "origin", &gone.to_string_lossy()],
    );
    let r = open(&e.git, &dir);
    let t = target(&r);
    let p = r.fetch(&t).unwrap_err();
    assert!(matches!(p, Problem::Unreachable { .. }), "{p:?}");
    assert!(!p.red());
    let p = r.push(&t).unwrap_err();
    assert!(matches!(p, Problem::Unreachable { .. }), "{p:?}");
}

#[test]
fn a_rejected_push_says_so() {
    let e = env();
    let (_bare, mine, theirs) = two_clones(&e);
    let r = open(&e.git, &mine);
    let t = target(&r);
    commit_file(&e, &theirs, "pages/B.md", "- b2\n");
    git(&e, &theirs, &["push", "-q", "origin", "main"]);
    commit_file(&e, &mine, "pages/A.md", "- a2\n");
    assert_eq!(r.push(&t).unwrap(), Pushed::Rejected);
}

#[test]
fn a_remote_hook_refusal_is_red() {
    let e = env();
    let (bare, mine, _theirs) = two_clones(&e);
    std::fs::write(
        bare.join("hooks/pre-receive"),
        "#!/bin/sh\necho no >&2\nexit 1\n",
    )
    .unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let hook = bare.join("hooks/pre-receive");
        std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
    commit_file(&e, &mine, "pages/A.md", "- a2\n");
    let r = open(&e.git, &mine);
    let p = r.push(&target(&r)).unwrap_err();
    assert!(matches!(p, Problem::Failed { .. }), "{p:?}");
    assert!(p.red());
}

#[test]
fn several_remotes_without_upstream_need_a_choice() {
    let e = env();
    let dir = repo(&e, "mine", &[("pages/A.md", "- a\n")]);
    for name in ["a", "b"] {
        let b = bare(&e, &format!("{name}.git"));
        git(&e, &dir, &["remote", "add", name, &b.to_string_lossy()]);
    }
    let r = open(&e.git, &dir);
    assert_eq!(
        r.target("main").unwrap(),
        Err(Problem::NoRemoteChoice {
            remotes: vec!["a".into(), "b".into()]
        })
    );
}

#[test]
fn no_remote_means_no_target() {
    let e = env();
    let dir = repo(&e, "mine", &[("pages/A.md", "- a\n")]);
    let r = open(&e.git, &dir);
    assert_eq!(r.target("main").unwrap(), Ok(None));
}

#[test]
fn a_remote_name_with_a_slash_is_kept_whole() {
    let e = env();
    let (_bare, mine, _theirs) = two_clones(&e);
    git(&e, &mine, &["remote", "rename", "origin", "team/up"]);
    let r = open(&e.git, &mine);
    let t = target(&r);
    assert_eq!(t.remote, "team/up");
    assert_eq!(t.branch, "main");
    assert_eq!(t.upstream.as_deref(), Some("team/up/main"));
}

#[test]
fn a_rebase_that_cannot_start_is_refused_not_aborted() {
    let e = env();
    let (_bare, mine, theirs) = two_clones(&e);
    commit_file(&e, &theirs, "pages/B.md", "- b2\n");
    git(&e, &theirs, &["push", "-q", "origin", "main"]);
    let r = open(&e.git, &mine);
    let t = target(&r);
    r.fetch(&t).unwrap();
    std::fs::write(mine.join("pages/A.md"), "- unsaved\n").unwrap();
    let p = r.integrate(&t).unwrap_err();
    assert!(matches!(p, Problem::RebaseRefused { .. }), "{p:?}");
    assert!(p.red());
    assert_eq!(read(&mine, "pages/A.md"), "- unsaved\n");
    assert_eq!(git(&e, &mine, &["stash", "list"]), "");
    assert!(r.busy().unwrap().is_none());
}

#[test]
fn a_rebase_already_in_progress_is_never_touched() {
    let e = env();
    let (_bare, mine, theirs) = two_clones(&e);
    commit_file(&e, &theirs, "pages/A.md", "- theirs\n");
    git(&e, &theirs, &["push", "-q", "origin", "main"]);
    commit_file(&e, &mine, "pages/A.md", "- mine\n");
    let r = open(&e.git, &mine);
    let t = target(&r);
    r.fetch(&t).unwrap();
    // The user's own rebase, stopped on a conflict.
    let out = e
        .git
        .run(&mine, &["rebase", "origin/main"], LOCAL_LIMIT)
        .unwrap();
    assert_ne!(out.code, 0);
    assert!(r.busy().unwrap().is_some());
    assert_eq!(
        r.integrate(&t),
        Err(Problem::Busy {
            what: "rebase".into()
        })
    );
    assert!(r.busy().unwrap().is_some()); // still the user's, not aborted
}

#[test]
fn a_tag_named_like_the_branch_does_not_win() {
    let e = env();
    let (_bare, mine, theirs) = two_clones(&e);
    // A tag with the short name of the tracking ref, on the older commit.
    git(&e, &mine, &["tag", "origin/main"]);
    let old = git(&e, &mine, &["rev-parse", "HEAD"]);
    commit_file(&e, &theirs, "pages/B.md", "- b2\n");
    git(&e, &theirs, &["push", "-q", "origin", "main"]);
    let new = git(&e, &theirs, &["rev-parse", "HEAD"]);
    commit_file(&e, &mine, "pages/A.md", "- a2\n");
    let r = open(&e.git, &mine);
    let t = target(&r);
    r.fetch(&t).unwrap();
    let done = r.integrate(&t).unwrap();
    assert!(done.moved);
    assert_eq!(
        read(&mine, "pages/B.md"),
        "- b2\n",
        "rebased onto the branch"
    );
    assert_eq!(git(&e, &mine, &["rev-parse", "HEAD~1"]), new);
    assert_ne!(new, old);
}

#[test]
fn problems_read_as_the_spec_says() {
    let c = Problem::Conflict {
        files: vec!["pages/A.md".into(), "pages/B.md".into()],
    };
    assert!(c.red());
    assert!(c.message().contains("both changed pages/A.md, pages/B.md."));
    let v = serde_json::to_value(Problem::DirtyOutside {
        files: vec!["x".into()],
    })
    .unwrap();
    assert_eq!(
        v,
        serde_json::json!({"kind": "dirtyOutside", "files": ["x"]})
    );
}

/// Adds settings to the test's own gitconfig (never the user's).
fn add_config(e: &Env, text: &str) {
    use std::io::Write;
    let mut f = std::fs::OpenOptions::new()
        .append(true)
        .open(e.root.path().join("home").join("gitconfig"))
        .unwrap();
    f.write_all(text.as_bytes()).unwrap();
}

#[test]
fn diff_relative_does_not_hide_pulled_or_conflicting_files() {
    let e = env();
    let (_bare, mine, theirs) = clones(
        &e,
        &[
            ("notes/pages/A.md", "- a\n"),
            ("notes/pages/B.md", "- b\n"),
            ("other/x.txt", "x\n"),
        ],
    );
    add_config(&e, "[diff]\n\trelative = true\n");
    // A clean pull: the changed list must name the folder's file.
    commit_file(&e, &theirs, "notes/pages/B.md", "- b2\n");
    git(&e, &theirs, &["push", "-q", "origin", "main"]);
    let r = open(&e.git, &mine.join("notes"));
    let t = target(&r);
    r.fetch(&t).unwrap();
    let done = r.integrate(&t).unwrap();
    assert_eq!(done.changed, vec![PathBuf::from("pages").join("B.md")]);
    // A conflict inside and outside the folder: both are named.
    std::fs::write(theirs.join("notes/pages/A.md"), "- theirs\n").unwrap();
    std::fs::write(theirs.join("other/x.txt"), "theirs\n").unwrap();
    git(&e, &theirs, &["add", "-A"]);
    git(&e, &theirs, &["commit", "-q", "-m", "t"]);
    git(&e, &theirs, &["push", "-q", "origin", "main"]);
    std::fs::write(mine.join("notes/pages/A.md"), "- mine\n").unwrap();
    std::fs::write(mine.join("other/x.txt"), "mine\n").unwrap();
    git(&e, &mine, &["add", "-A"]);
    git(&e, &mine, &["commit", "-q", "-m", "m"]);
    r.fetch(&t).unwrap();
    assert_eq!(
        r.integrate(&t),
        Err(Problem::Conflict {
            files: vec![
                "other/x.txt (outside the notes folder)".into(),
                "pages/A.md".into()
            ]
        })
    );
    assert!(r.busy().unwrap().is_none());
}

#[test]
fn autocrlf_never_changes_line_endings_on_abort_or_pull() {
    let e = env();
    let (_bare, mine, theirs) = two_clones(&e);
    // Clean pull first.
    commit_file(&e, &theirs, "pages/B.md", "- b2\n");
    git(&e, &theirs, &["push", "-q", "origin", "main"]);
    add_config(&e, "[core]\n\tautocrlf = true\n");
    let r = open(&e.git, &mine);
    let t = target(&r);
    r.fetch(&t).unwrap();
    r.integrate(&t).unwrap();
    assert_eq!(std::fs::read(mine.join("pages/B.md")).unwrap(), b"- b2\n");
    // Then a conflict and its abort.
    commit_file(&e, &theirs, "pages/A.md", "- theirs\n");
    git(&e, &theirs, &["push", "-q", "origin", "main"]);
    commit_file(&e, &mine, "pages/A.md", "- mine\n");
    r.fetch(&t).unwrap();
    assert!(matches!(r.integrate(&t), Err(Problem::Conflict { .. })));
    assert_eq!(std::fs::read(mine.join("pages/A.md")).unwrap(), b"- mine\n");
    assert_eq!(std::fs::read(mine.join("pages/B.md")).unwrap(), b"- b2\n");
}

#[test]
fn text_auto_attributes_never_make_a_pull_write_crlf() {
    let e = env();
    let (_bare, mine, theirs) = clones(
        &e,
        &[
            (".gitattributes", "* text=auto\n"),
            ("pages/A.md", "- a\n"),
            ("pages/B.md", "- b\n"),
        ],
    );
    add_config(&e, "[core]\n\tautocrlf = true\n");
    // The clone may have been checked out with CRLF (core.eol is native);
    // the user's files are LF.
    std::fs::write(mine.join("pages/A.md"), "- a\n").unwrap();
    std::fs::write(mine.join("pages/B.md"), "- b\n").unwrap();
    git(&e, &mine, &["add", "-A"]);
    assert_eq!(git(&e, &mine, &["status", "--porcelain"]), "");
    assert_eq!(git(&e, &mine, &["status", "--porcelain"]), "");
    commit_file(&e, &theirs, "pages/B.md", "- b2\n");
    git(&e, &theirs, &["push", "-q", "origin", "main"]);
    let r = open(&e.git, &mine);
    let t = target(&r);
    r.fetch(&t).unwrap();
    r.integrate(&t).unwrap();
    assert_eq!(std::fs::read(mine.join("pages/B.md")).unwrap(), b"- b2\n");
    commit_file(&e, &theirs, "pages/A.md", "- theirs\n");
    git(&e, &theirs, &["push", "-q", "origin", "main"]);
    commit_file(&e, &mine, "pages/A.md", "- mine\n");
    r.fetch(&t).unwrap();
    assert!(matches!(r.integrate(&t), Err(Problem::Conflict { .. })));
    assert_eq!(std::fs::read(mine.join("pages/A.md")).unwrap(), b"- mine\n");
    assert_eq!(std::fs::read(mine.join("pages/B.md")).unwrap(), b"- b2\n");
}

#[test]
fn is_ssh_url_tells_ssh_addresses() {
    for url in [
        "ssh://git@github.com/a/b.git",
        "git@github.com:a/b.git",
        "github.com:a/b",
        "git+ssh://h/x",
        "ssh+git://h/x",
        "[::1]:a/b.git",
        "[git@host:22]:a/b.git",
        "file:/srv/b",
    ] {
        assert!(is_ssh_url(url), "{url}");
    }
    for url in [
        "https://github.com/a/b",
        "http://h/x",
        "file:///srv/b",
        "/srv/b.git",
        "../b.git",
        "C:\\repos\\b.git",
        "C:/repos/b.git",
        r"\\server\share\b.git",
        "[::1]",
        "",
    ] {
        assert!(!is_ssh_url(url), "{url}");
    }
}

/// A clone whose `origin` is an SSH address, with an `ssh` that refuses.
fn ssh_refusing(e: &Env) -> (Git, PathBuf) {
    let (_bare, mine, _theirs) = two_clones(e);
    git(
        e,
        &mine,
        &["remote", "set-url", "origin", "ssh://example.invalid/x.git"],
    );
    let script = fake_ssh(
        e,
        "refuse.sh",
        "echo 'Host key verification failed.' >&2\nexit 255\n",
    );
    (e.git.clone().with_env("GIT_SSH_COMMAND", script), mine)
}

#[test]
fn ssh_refusals_are_an_ssh_problem() {
    let e = env();
    let (g, mine) = ssh_refusing(&e);
    let r = open(&g, &mine);
    assert_eq!(
        r.remote_url("origin").as_deref(),
        Some("ssh://example.invalid/x.git")
    );
    let t = target(&r);
    assert_eq!(
        r.fetch(&t),
        Err(Problem::SshKey {
            remote: "origin".into()
        })
    );
    assert_eq!(
        r.push(&t),
        Err(Problem::SshKey {
            remote: "origin".into()
        })
    );
}

#[test]
fn a_remote_without_a_url_is_not_ssh() {
    let e = env();
    let (_bare, mine, _theirs) = two_clones(&e);
    let r = open(&e.git, &mine);
    assert_eq!(r.remote_url("nope"), None);
}

#[test]
fn an_ssh_that_hangs_is_an_ssh_problem_but_a_cancel_is_not() {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::{Duration, Instant};
    let e = env();
    let (_bare, mine, _theirs) = two_clones(&e);
    git(
        &e,
        &mine,
        &["remote", "set-url", "origin", "ssh://example.invalid/x.git"],
    );
    let script = fake_ssh(&e, "hang.sh", "sleep 30\n");
    let base = e.git.clone().with_env("GIT_SSH_COMMAND", script);

    // The full limit ran out: SshKey.
    let g = base.clone().with_network_limit(Duration::from_secs(2));
    assert_eq!(g.network_limit(), Duration::from_secs(2));
    let r = open(&g, &mine);
    let t = target(&r);
    let start = Instant::now();
    assert_eq!(
        r.fetch(&t),
        Err(Problem::SshKey {
            remote: "origin".into()
        })
    );
    assert!(start.elapsed() >= Duration::from_secs(2));

    // Cancelled well before the limit (close): never SshKey.
    let flag = Arc::new(AtomicBool::new(false));
    let g = base.with_cancel(flag.clone());
    let r = open(&g, &mine);
    let setter = std::thread::spawn({
        let flag = flag.clone();
        move || {
            std::thread::sleep(Duration::from_millis(500));
            flag.store(true, Ordering::SeqCst);
        }
    });
    let start = Instant::now();
    let err = r.fetch(&t).unwrap_err();
    setter.join().unwrap();
    // 500 ms until the flag, then a short wind-down. The bound is loose for slow
    // build machines (the tag build runs this); without the cancel it takes ~30 s,
    // so it still fails then.
    assert!(
        start.elapsed() < Duration::from_secs(10),
        "{:?}",
        start.elapsed()
    );
    assert!(matches!(err, Problem::Unreachable { .. }), "{err:?}");
}

#[test]
fn an_ssh_push_url_that_hangs_is_an_ssh_problem() {
    use std::time::Duration;
    let e = env();
    let (_bare, mine, _theirs) = two_clones(&e);
    // The fetch address stays the local bare repository; only the push goes over SSH.
    git(
        &e,
        &mine,
        &[
            "config",
            "remote.origin.pushurl",
            "ssh://example.invalid/x.git",
        ],
    );
    let script = fake_ssh(&e, "hang.sh", "sleep 30\n");
    let g = e
        .git
        .clone()
        .with_env("GIT_SSH_COMMAND", script)
        .with_network_limit(Duration::from_secs(2));
    commit_file(&e, &mine, "pages/A.md", "- a2\n");
    let r = open(&g, &mine);
    let t = target(&r);
    assert_eq!(
        r.push(&t),
        Err(Problem::SshKey {
            remote: "origin".into()
        })
    );
}

#[test]
fn a_conflict_outside_the_notes_folder_says_so() {
    let e = env();
    let (_bare, mine, theirs) =
        clones(&e, &[("README.md", "top\n"), ("notes/pages/A.md", "- a\n")]);
    commit_file(&e, &theirs, "README.md", "theirs\n");
    git(&e, &theirs, &["push", "-q", "origin", "main"]);
    commit_file(&e, &mine, "README.md", "mine\n");
    let r = open(&e.git, &mine.join("notes"));
    let t = target(&r);
    r.fetch(&t).unwrap();
    assert_eq!(
        r.integrate(&t),
        Err(Problem::Conflict {
            files: vec!["README.md (outside the notes folder)".into()]
        })
    );
    // The same set-up with the conflict inside the folder.
    let e = env();
    let (_bare, mine, theirs) =
        clones(&e, &[("README.md", "top\n"), ("notes/pages/A.md", "- a\n")]);
    commit_file(&e, &theirs, "notes/pages/A.md", "- theirs\n");
    git(&e, &theirs, &["push", "-q", "origin", "main"]);
    commit_file(&e, &mine, "notes/pages/A.md", "- mine\n");
    let r = open(&e.git, &mine.join("notes"));
    let t = target(&r);
    r.fetch(&t).unwrap();
    assert_eq!(
        r.integrate(&t),
        Err(Problem::Conflict {
            files: vec!["pages/A.md".into()]
        })
    );
}

#[test]
fn a_rebase_left_by_a_crash_explains_itself() {
    let m = Problem::Busy {
        what: "rebase".into(),
    }
    .message();
    assert!(m.contains("git rebase --abort"), "{m}");
    assert!(m.contains("git rebase --continue"), "{m}");
    assert!(m.contains("cut off"), "{m}");
    let other = Problem::Busy {
        what: "merge".into(),
    }
    .message();
    assert!(other.contains("Finish it with Git tools"), "{other}");
}

#[test]
fn a_rebase_git_refuses_to_start_is_a_refusal() {
    let e = env();
    let (_bare, mine, theirs) = two_clones(&e);
    commit_file(&e, &theirs, "pages/B.md", "- b2\n");
    git(&e, &theirs, &["push", "-q", "origin", "main"]);
    commit_file(&e, &mine, "pages/B.md", "- b mine\n");
    let r = open(&e.git, &mine);
    let t = target(&r);
    r.fetch(&t).unwrap();
    std::fs::write(mine.join("pages/A.md"), "- outside\n").unwrap();
    assert!(matches!(
        r.integrate(&t),
        Err(Problem::RebaseRefused { .. })
    ));
}
