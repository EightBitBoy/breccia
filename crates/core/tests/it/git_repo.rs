use crate::gitenv::*;
use breccia_core::git::{
    Busy, Discovered, Git, GitError, GitOut, HeadState, LOCAL_LIMIT, classify_discover, discover,
    run_limited, without_auto_gc,
};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

fn slow_command() -> std::process::Command {
    #[cfg(windows)]
    {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "ping -n 6 127.0.0.1 > NUL"]);
        c
    }
    #[cfg(not(windows))]
    {
        let mut c = std::process::Command::new("sh");
        c.args(["-c", "sleep 5"]);
        c
    }
}

#[test]
fn a_missing_program_is_not_installed() {
    let g = Git::new().with_program("breccia-no-such-git");
    assert!(matches!(
        g.run(Path::new("."), &["--version"], LOCAL_LIMIT),
        Err(GitError::NotInstalled)
    ));
}

#[test]
fn a_slow_command_is_stopped_at_its_limit() {
    let t = std::time::Instant::now();
    assert!(matches!(
        run_limited(slow_command(), Duration::from_millis(300), "wait", None),
        Err(GitError::TimedOut(_))
    ));
    // The tree is killed and the reader threads are not joined, so this returns
    // although `ping` outlives `cmd`.
    assert!(t.elapsed() < Duration::from_secs(3));
}

#[test]
fn a_cancel_flag_stops_a_running_command() {
    let flag = Arc::new(AtomicBool::new(false));
    let setter = flag.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(200));
        setter.store(true, Ordering::SeqCst);
    });
    let t = std::time::Instant::now();
    assert!(matches!(
        run_limited(slow_command(), Duration::from_secs(60), "wait", Some(&flag)),
        Err(GitError::TimedOut(_))
    ));
    assert!(t.elapsed() < Duration::from_secs(3));
}

#[test]
fn runs_are_counted() {
    let e = env();
    assert_eq!(e.git.runs(), 0);
    e.git
        .run(e.root.path(), &["--version"], LOCAL_LIMIT)
        .unwrap();
    assert_eq!(e.git.runs(), 1);
}

#[test]
fn a_failing_git_command_is_an_error_only_through_ok() {
    let e = env();
    let args = ["rev-parse", "--verify", "nope"];
    let out = e.git.run(e.root.path(), &args, LOCAL_LIMIT).unwrap();
    assert_ne!(out.code, 0);
    assert!(matches!(
        e.git.ok(e.root.path(), &args, LOCAL_LIMIT),
        Err(GitError::Failed { .. })
    ));
}

#[test]
fn discovery_states() {
    let e = env();
    let plain = e.root.path().join("plain");
    std::fs::create_dir_all(&plain).unwrap();
    // The temp root itself is a repository, so `plain` is only NotARepo because
    // the ceiling stops discovery at the root.
    git(&e, e.root.path(), &["init", "-q"]);
    assert!(matches!(
        discover(&e.git, &plain).unwrap(),
        Discovered::NotARepo
    ));
    let top = repo(
        &e,
        "big",
        &[("other/x.txt", "x\n"), ("notes/pages/A.md", "- a\n")],
    );
    let Discovered::Repo(r) = discover(&e.git, &top.join("notes")).unwrap() else {
        panic!("expected a repository")
    };
    assert_eq!(r.prefix, "notes/");
    assert_eq!(
        r.to_folder_path("notes/pages/A.md"),
        Some(PathBuf::from("pages").join("A.md"))
    );
    assert_eq!(r.to_folder_path("other/x.txt"), None);
    assert!(matches!(r.head().unwrap(), HeadState::Branch(b) if b == "main"));
    assert!(r.busy().unwrap().is_none());
    assert!(r.head_hash().unwrap().is_some());
}

#[test]
fn a_missing_git_is_not_installed_for_discovery() {
    let e = env();
    let g = e.git.clone().with_program("breccia-no-such-git");
    assert!(matches!(
        discover(&g, e.root.path()).unwrap(),
        Discovered::NotInstalled
    ));
}

#[test]
fn unborn_detached_and_busy_are_seen() {
    let e = env();
    let fresh = e.root.path().join("fresh");
    std::fs::create_dir_all(&fresh).unwrap();
    git(&e, &fresh, &["init", "-q"]);
    let Discovered::Repo(r) = discover(&e.git, &fresh).unwrap() else {
        panic!()
    };
    assert!(matches!(r.head().unwrap(), HeadState::Unborn(b) if b == "main"));
    assert_eq!(r.head_hash().unwrap(), None);

    let d = repo(&e, "det", &[("a.txt", "1\n")]);
    std::fs::write(d.join("a.txt"), "2\n").unwrap();
    git(&e, &d, &["commit", "-q", "-am", "two"]);
    git(&e, &d, &["checkout", "-q", "--detach"]);
    let Discovered::Repo(r) = discover(&e.git, &d).unwrap() else {
        panic!()
    };
    assert!(matches!(r.head().unwrap(), HeadState::Detached));

    let b = repo(&e, "busy", &[("a.txt", "base\n")]);
    git(&e, &b, &["checkout", "-q", "-b", "side"]);
    std::fs::write(b.join("a.txt"), "side\n").unwrap();
    git(&e, &b, &["commit", "-q", "-am", "side"]);
    git(&e, &b, &["checkout", "-q", "main"]);
    std::fs::write(b.join("a.txt"), "main\n").unwrap();
    git(&e, &b, &["commit", "-q", "-am", "main"]);
    let out = e.git.run(&b, &["rebase", "side"], LOCAL_LIMIT).unwrap();
    assert_ne!(out.code, 0, "the rebase must stop on a conflict");
    let Discovered::Repo(r) = discover(&e.git, &b).unwrap() else {
        panic!()
    };
    assert_eq!(r.busy().unwrap(), Some(Busy::Rebase));
}

#[test]
fn only_a_missing_repository_is_not_a_repository() {
    let not_repo = GitOut {
        code: 128,
        stdout: vec![],
        stderr: "fatal: not a git repository (or any of the parent directories): .git\n".into(),
    };
    assert!(matches!(classify_discover(&not_repo), Ok(None)));
    let dubious = GitOut {
        code: 128,
        stdout: vec![],
        stderr: "fatal: detected dubious ownership in repository at 'X'\n".into(),
    };
    assert!(matches!(
        classify_discover(&dubious),
        Err(GitError::Failed { code: 128, .. })
    ));
}

#[test]
fn git_speaks_english_whatever_the_user_language() {
    // Breccia matches some of Git's messages, so a German Git must not answer in German.
    let e = env();
    let german = e
        .git
        .clone()
        .with_env("LANGUAGE", "de")
        .with_env("LC_ALL", "de_DE.UTF-8");
    let out = german
        .run(
            e.root.path(),
            &["-c", "alias.lang=!echo \"$LANGUAGE/$LC_ALL\"", "lang"],
            LOCAL_LIMIT,
        )
        .unwrap();
    assert_eq!(out.text(), "C/C");
}

#[test]
fn the_cancel_flag_stops_network_commands_but_never_local_ones() {
    let e = env();
    let work = repo(&e, "work", &[("a.md", "- a\n")]);
    let remote = bare(&e, "remote.git");
    git(
        &e,
        &work,
        &["remote", "add", "origin", remote.to_str().unwrap()],
    );
    let flag = Arc::new(AtomicBool::new(true));
    let g = e.git.clone().with_cancel(flag);
    // Local commands (commit, rebase --abort, status...) run to their end.
    g.ok(&work, &["status", "--porcelain"], LOCAL_LIMIT)
        .unwrap();
    std::fs::write(work.join("b.md"), "- b\n").unwrap();
    g.ok(&work, &["add", "-A"], LOCAL_LIMIT).unwrap();
    g.ok(&work, &["commit", "-q", "-m", "b"], LOCAL_LIMIT)
        .unwrap();
    // Network commands are stopped.
    assert!(matches!(
        g.run(&work, &["fetch", "-q", "origin"], LOCAL_LIMIT),
        Err(GitError::TimedOut(_))
    ));
    assert!(matches!(
        g.run(&work, &["push", "origin", "HEAD"], LOCAL_LIMIT),
        Err(GitError::TimedOut(_))
    ));
}

#[test]
fn automatic_gc_is_off_only_for_fetch_and_rebase() {
    // Off where it would hold the lock or use up the network limit ...
    assert!(without_auto_gc(&["fetch", "-q", "origin"]));
    assert!(without_auto_gc(&[
        "-c",
        "rebase.autoStash=false",
        "rebase",
        "origin/main"
    ]));
    assert!(without_auto_gc(&["-c", "core.eol=lf", "rebase", "--abort"]));
    // ... but kept for commits, so the repository is still tidied now and then.
    assert!(!without_auto_gc(&[
        "commit", "-q", "--only", "-m", "m", "--", "."
    ]));
    assert!(!without_auto_gc(&["add", "-A", "--", "."]));
}
