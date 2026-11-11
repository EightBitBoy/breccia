use crate::gitenv::*;
use crate::support::read;
use breccia_core::git::{Git, GitEngine, GitState, GitView, Now, Step};
use breccia_core::{Clock, Output, Request, Session};
use chrono::NaiveDate;
use serde_json::{Value, json};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

const MIN: i64 = 60_000;
const T0: i64 = 1_800_000_000_000;

fn now(ms: i64) -> Now {
    Now {
        ms,
        local: chrono::DateTime::from_timestamp_millis(ms)
            .unwrap()
            .naive_utc(),
        clock: Clock {
            today: NaiveDate::from_ymd_opt(2026, 10, 30).unwrap(),
            time: chrono::NaiveTime::from_hms_opt(14, 5, 9).unwrap(),
            ms: 0,
        },
    }
}

fn clock() -> Clock {
    now(T0).clock
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

/// A bare remote with `files` on `main`, cloned twice: (bare, mine, theirs).
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
    (
        bare.clone(),
        clone(e, &bare, "mine"),
        clone(e, &bare, "theirs"),
    )
}

fn two_clones(e: &Env) -> (PathBuf, PathBuf, PathBuf) {
    clones(e, &[("pages/A.md", "- a\n"), ("pages/B.md", "- b\n")])
}

fn commit_file(e: &Env, dir: &Path, rel: &str, text: &str) {
    std::fs::write(dir.join(rel), text).unwrap();
    git(e, dir, &["add", "-A"]);
    git(e, dir, &["commit", "-q", "-m", "change"]);
}

fn count(e: &Env, dir: &Path) -> usize {
    git(e, dir, &["rev-list", "--count", "HEAD"])
        .parse()
        .unwrap()
}

fn cmd(s: &Mutex<Session>, command: Value) -> Output {
    let mut s = s.lock().unwrap();
    let req: Request =
        serde_json::from_value(json!({"generation": s.generation(), "command": command})).unwrap();
    s.run(req, clock())
        .unwrap_or_else(|e| panic!("{command}: {e:?}"))
}

fn open(path: &Path) -> Arc<Mutex<Session>> {
    let s = Arc::new(Mutex::new(Session::new()));
    cmd(&s, json!({"type": "folder.open", "path": path}));
    s
}

/// (id, text) of every block of a page.
fn blocks(s: &Mutex<Session>, key: &str) -> Vec<(breccia_core::BlockId, String)> {
    let out = cmd(s, json!({"type": "page.get", "key": key}));
    out.page
        .unwrap()
        .blocks
        .iter()
        .map(|b| (b.id, b.text.clone()))
        .collect()
}

fn set_text(s: &Mutex<Session>, key: &str, index: usize, text: &str) -> Output {
    let id = blocks(s, key)[index].0;
    cmd(s, json!({"type": "block.setText", "id": id, "text": text}))
}

fn problem_kind(v: &GitView) -> Option<&str> {
    v.problem.as_ref().map(|p| p.kind.as_str())
}

fn last_view(engine: &GitEngine, step: &Step) -> GitView {
    step.view.clone().unwrap_or_else(|| engine.view().clone())
}

#[test]
fn a_change_is_committed_after_the_pause_with_the_message() {
    let e = env();
    let (bare, mine, _theirs) = two_clones(&e);
    let session = open(&mine);
    let mut engine = GitEngine::new(e.git.clone());
    let s = engine.tick(&session, now(T0));
    assert_eq!(last_view(&engine, &s).state, GitState::Ready);
    assert_eq!(count(&e, &mine), 1, "nothing to commit at the start");

    set_text(&session, "a", 0, "a2");
    let t1 = T0 + 10_000;
    engine.changed(now(t1));
    engine.tick(&session, now(t1 + 4 * MIN));
    assert_eq!(count(&e, &mine), 1, "not before the pause is over");

    let step = engine.tick(&session, now(t1 + 5 * MIN));
    let v = last_view(&engine, &step);
    assert_eq!(count(&e, &mine), 2);
    let subject = git(&e, &mine, &["log", "-1", "--format=%s"]);
    assert_eq!(subject, "update A");
    assert_eq!(
        git(&e, &bare, &["rev-parse", "main"]),
        git(&e, &mine, &["rev-parse", "HEAD"])
    );
    assert_eq!(v.state, GitState::Ready);
    assert_eq!(v.ahead, 0);
    assert_eq!(v.remote.as_deref(), Some("origin"));
    assert_eq!(v.last_sync, Some(t1 + 5 * MIN));
    assert!(v.last_commit.is_some());
}

#[test]
fn a_pull_reloads_the_changed_pages_in_the_session() {
    let e = env();
    let (_bare, mine, theirs) = two_clones(&e);
    let session = open(&mine);
    let mut engine = GitEngine::new(e.git.clone());
    engine.tick(&session, now(T0));
    commit_file(&e, &theirs, "pages/B.md", "- b2\n");
    git(&e, &theirs, &["push", "-q", "origin", "main"]);

    let step = engine.tick(&session, now(T0 + 5 * MIN));
    let (generation, out) = &step.outputs[0];
    assert_eq!(*generation, session.lock().unwrap().generation());
    assert_eq!(out.changed.len(), 1);
    assert_eq!(out.changed[0].key, "b");
    assert_eq!(out.changed[0].blocks[0].text, "b2");
    assert_eq!(blocks(&session, "b")[0].1, "b2");
    assert_eq!(read(&mine, "pages/B.md"), "- b2\n");
}

#[test]
fn a_pull_never_overwrites_unsaved_text() {
    let e = env();
    let b5 = "- b1\n- b2\n- b3\n- b4\n- b5\n";
    let (_bare, mine, theirs) = clones(&e, &[("pages/A.md", "- a\n"), ("pages/B.md", b5)]);
    let session = open(&mine);
    let mut engine = GitEngine::new(e.git.clone());
    engine.tick(&session, now(T0));

    // B changes on disk outside Breccia, so the save of the typed text fails.
    std::fs::write(
        mine.join("pages/B.md"),
        "- b1\n- b2\n- b3\n- b4\n- b5 outside\n",
    )
    .unwrap();
    let typed = set_text(&session, "b", 2, "b3 typed");
    assert_eq!(typed.notices.len(), 1, "the save failed");
    // Their first line, pushed.
    commit_file(
        &e,
        &theirs,
        "pages/B.md",
        "- b1 theirs\n- b2\n- b3\n- b4\n- b5\n",
    );
    git(&e, &theirs, &["push", "-q", "origin", "main"]);

    let step = engine.tick(&session, now(T0 + 5 * MIN));
    assert_eq!(
        read(&mine, "pages/B.md"),
        "- b1 theirs\n- b2\n- b3\n- b4\n- b5 outside\n",
        "the file holds the merged pulled bytes; the typed text is not written over it"
    );
    let texts: Vec<String> = blocks(&session, "b").into_iter().map(|b| b.1).collect();
    assert_eq!(texts[2], "b3 typed", "the typed text stays in the session");
    let notices = serde_json::to_value(&step.outputs[0].1.notices).unwrap();
    let failed = notices
        .as_array()
        .unwrap()
        .iter()
        .any(|n| n["page"] == "b" && n["reason"] == "changedOnDisk");
    assert!(failed, "{notices}");
}

#[test]
fn a_conflict_stops_syncing_until_asked() {
    let e = env();
    let (bare, mine, theirs) = two_clones(&e);
    let session = open(&mine);
    let mut engine = GitEngine::new(e.git.clone());
    engine.tick(&session, now(T0));

    set_text(&session, "b", 0, "b mine");
    commit_file(&e, &theirs, "pages/B.md", "- b theirs\n");
    git(&e, &theirs, &["push", "-q", "origin", "main"]);
    let step = engine.tick(&session, now(T0 + 5 * MIN));
    let v = last_view(&engine, &step);
    assert_eq!(v.state, GitState::Problem);
    assert_eq!(problem_kind(&v), Some("conflict"));
    assert!(v.problem.as_ref().unwrap().red);
    assert_eq!(read(&mine, "pages/B.md"), "- b mine\n");
    let remote_at = git(&e, &bare, &["rev-parse", "main"]);

    // A later change is committed locally and neither fetched nor pushed.
    set_text(&session, "a", 0, "a mine");
    engine.changed(now(T0 + 6 * MIN));
    commit_file(&e, &theirs, "pages/B.md", "- b theirs again\n");
    git(&e, &theirs, &["push", "-q", "origin", "main"]);
    let tracking = git(&e, &mine, &["rev-parse", "refs/remotes/origin/main"]);
    let step = engine.tick(&session, now(T0 + 11 * MIN));
    let v = last_view(&engine, &step);
    assert_eq!(problem_kind(&v), Some("conflict"));
    assert_eq!(count(&e, &mine), 3, "committed locally");
    assert_eq!(v.ahead, 2);
    assert_eq!(
        git(&e, &mine, &["rev-parse", "refs/remotes/origin/main"]),
        tracking
    );
    assert_ne!(git(&e, &bare, &["rev-parse", "main"]), remote_at);

    // A click tries again: it fetches (the tracking ref moves) and conflicts again.
    let step = engine.sync_now(&session, now(T0 + 12 * MIN));
    let v = last_view(&engine, &step);
    assert_ne!(
        git(&e, &mine, &["rev-parse", "refs/remotes/origin/main"]),
        tracking
    );
    assert_eq!(problem_kind(&v), Some("conflict"));
    assert_eq!(read(&mine, "pages/B.md"), "- b mine\n");
}

#[test]
fn retry_before_commit_writes_the_unsaved_text() {
    let e = env();
    let (_bare, mine, _theirs) = two_clones(&e);
    let session = open(&mine);
    let mut engine = GitEngine::new(e.git.clone());
    engine.tick(&session, now(T0));

    // The save fails once: the file differs from what Breccia read.
    std::fs::write(mine.join("pages/A.md"), "- outside\n").unwrap();
    let out = set_text(&session, "a", 0, "typed");
    assert_eq!(out.notices.len(), 1);
    // The file is as Breccia read it again, so the save can succeed.
    std::fs::write(mine.join("pages/A.md"), "- a\n").unwrap();
    engine.changed(now(T0 + 10_000));
    engine.tick(&session, now(T0 + 5 * MIN + 10_000));
    assert_eq!(read(&mine, "pages/A.md"), "- typed\n");
    assert_eq!(git(&e, &mine, &["show", "HEAD:pages/A.md"]), "- typed");
    assert_eq!(git(&e, &mine, &["status", "--porcelain"]), "");
}

#[test]
fn a_retried_save_is_reported_saved() {
    let e = env();
    let (_bare, mine, _theirs) = two_clones(&e);
    let session = open(&mine);
    let mut engine = GitEngine::new(e.git.clone());
    engine.tick(&session, now(T0));

    // The save fails (the file differs from what Breccia read; portable,
    // unlike a read-only file), then the file is as Breccia read it again.
    std::fs::write(mine.join("pages/A.md"), "- outside\n").unwrap();
    let out = set_text(&session, "a", 0, "typed");
    assert_eq!(out.notices.len(), 1);
    assert!(out.saved.is_empty());
    std::fs::write(mine.join("pages/A.md"), "- a\n").unwrap();
    engine.changed(now(T0 + 10_000));
    let step = engine.tick(&session, now(T0 + 5 * MIN + 10_000));
    let saved: Vec<&Vec<String>> = step
        .outputs
        .iter()
        .map(|(_, o)| &o.saved)
        .filter(|s| !s.is_empty())
        .collect();
    assert_eq!(saved, vec![&vec!["a".to_string()]]);
    assert_eq!(git(&e, &mine, &["show", "HEAD:pages/A.md"]), "- typed");
}

/// The page whose save failed is saved by the step's retry; `during` runs
/// after the fetch. Returns the `saved` lists of the step's outputs.
fn retried_save_with(
    during: impl FnMut(&Arc<Mutex<Session>>, &Path) + Send + 'static,
) -> Vec<Vec<String>> {
    let e = env();
    let (_bare, mine, _theirs) = two_clones(&e);
    let session = open(&mine);
    let mut engine = GitEngine::new(e.git.clone());
    engine.tick(&session, now(T0));

    std::fs::write(mine.join("pages/A.md"), "- outside\n").unwrap();
    assert_eq!(set_text(&session, "a", 0, "typed").notices.len(), 1);
    std::fs::write(mine.join("pages/A.md"), "- a\n").unwrap();
    let (hooked, dir) = (Arc::clone(&session), mine.clone());
    let mut during = during;
    engine.after_fetch(Box::new(move || during(&hooked, &dir)));
    engine.changed(now(T0 + 10_000));
    let step = engine.tick(&session, now(T0 + 5 * MIN + 10_000));
    step.outputs
        .into_iter()
        .map(|(_, o)| o.saved)
        .filter(|s| !s.is_empty())
        .collect()
}

#[test]
fn a_retried_save_that_fails_again_during_the_step_is_not_reported_saved() {
    // The page is saved by the retry, then typed into during the fetch and
    // its save fails again: the late `saved` must not clear that failure.
    let saved = retried_save_with(|session, dir| {
        std::fs::write(dir.join("pages/A.md"), "- outside again\n").unwrap();
        let out = set_text(session, "a", 0, "typed again");
        assert_eq!(out.notices.len(), 1, "the save fails again");
    });
    assert!(saved.is_empty(), "{saved:?}");
}

#[test]
fn a_retried_save_is_not_reported_into_a_folder_opened_since() {
    // The folder is switched during the fetch: the old folder's `saved` must
    // not clear a notice of a same-named page in the new one.
    let saved = retried_save_with(|session, dir| {
        let other = dir.parent().unwrap().join("other");
        std::fs::create_dir_all(other.join("pages")).unwrap();
        std::fs::write(other.join("pages/A.md"), "- a\n").unwrap();
        cmd(session, json!({"type": "folder.open", "path": other}));
    });
    assert!(saved.is_empty(), "{saved:?}");
}

#[test]
fn not_a_repo_then_init() {
    let e = env();
    let dir = e.root.path().join("notes");
    std::fs::create_dir_all(dir.join("pages")).unwrap();
    std::fs::create_dir_all(dir.join("breccia")).unwrap();
    std::fs::write(dir.join("pages/A.md"), "- a\n").unwrap();
    std::fs::write(dir.join("breccia/config.toml"), "# mine\n").unwrap();
    let session = open(&dir);
    let mut engine = GitEngine::new(e.git.clone());
    let step = engine.tick(&session, now(T0));
    assert_eq!(last_view(&engine, &step).state, GitState::NotRepo);
    assert!(!dir.join(".git").exists());

    let step = engine.init(&session, now(T0 + 1000));
    let v = last_view(&engine, &step);
    assert!(dir.join(".git").exists());
    assert_eq!(read(&dir, ".gitignore"), breccia_core::git::GITIGNORE);
    assert_eq!(count(&e, &dir), 1);
    let files = git(&e, &dir, &["ls-tree", "-r", "--name-only", "HEAD"]);
    assert!(files.contains("breccia/config.toml"), "{files}");
    assert!(files.contains("pages/A.md"), "{files}");
    assert_eq!(v.state, GitState::Ready);
    assert_eq!(v.remote, None);
    // The start pull was used up by the first tick: nothing runs after init.
    let step = engine.tick(&session, now(T0 + 2000));
    assert!(step.view.is_none());
}

#[test]
fn a_repository_mid_rebase_is_left_alone() {
    let e = env();
    let (_bare, mine, theirs) = two_clones(&e);
    let session = open(&mine);
    let mut engine = GitEngine::new(e.git.clone());
    engine.tick(&session, now(T0));

    commit_file(&e, &mine, "pages/B.md", "- b mine\n");
    commit_file(&e, &theirs, "pages/B.md", "- b theirs\n");
    git(&e, &theirs, &["push", "-q", "origin", "main"]);
    git(&e, &mine, &["fetch", "-q", "origin"]);
    let r = e
        .git
        .run(
            &mine,
            &["rebase", "origin/main"],
            breccia_core::git::LOCAL_LIMIT,
        )
        .unwrap();
    assert_ne!(r.code, 0, "the user's own rebase stops on a conflict");
    let before = count(&e, &mine);

    set_text(&session, "a", 0, "a typed");
    engine.changed(now(T0 + 10_000));
    let step = engine.tick(&session, now(T0 + 5 * MIN + 10_000));
    let v = last_view(&engine, &step);
    assert_eq!(count(&e, &mine), before, "no commit");
    assert!(mine.join(".git/rebase-merge").exists() || mine.join(".git/rebase-apply").exists());
    assert_eq!(problem_kind(&v), Some("busy"));
    assert!(v.problem.as_ref().unwrap().red);
}

#[test]
fn off_and_no_git() {
    let e = env();
    let dir = e.root.path().join("notes");
    std::fs::create_dir_all(dir.join("pages")).unwrap();
    std::fs::create_dir_all(dir.join("breccia")).unwrap();
    std::fs::write(dir.join("pages/A.md"), "- a\n").unwrap();
    std::fs::write(dir.join("breccia/config.toml"), "[git]\nenabled = false\n").unwrap();
    let session = open(&dir);
    let missing: Git = e.git.clone().with_program("breccia-no-such-git");
    let mut engine = GitEngine::new(missing.clone());
    engine.tick(&session, now(T0));
    assert_eq!(engine.view().state, GitState::Off);
    assert_eq!(missing.runs(), 0, "no git call while off");

    std::fs::write(dir.join("breccia/config.toml"), "[git]\nenabled = true\n").unwrap();
    let session = open(&dir);
    let mut engine = GitEngine::new(missing);
    engine.tick(&session, now(T0));
    assert_eq!(engine.view().state, GitState::NoGit);
}

#[test]
fn close_commits_and_pushes() {
    let e = env();
    let (bare, mine, _theirs) = two_clones(&e);
    let session = open(&mine);
    let mut engine = GitEngine::new(e.git.clone());
    engine.tick(&session, now(T0));
    set_text(&session, "a", 0, "a before close");
    let step = engine.close(&session, now(T0 + 1000));
    assert_eq!(count(&e, &mine), 2);
    assert_eq!(
        git(&e, &bare, &["rev-parse", "main"]),
        git(&e, &mine, &["rev-parse", "HEAD"])
    );
    assert_ne!(last_view(&engine, &step).state, GitState::Working);
}

#[test]
fn a_save_during_the_fetch_is_committed_before_the_rebase() {
    let e = env();
    let (bare, mine, theirs) = two_clones(&e);
    let session = open(&mine);
    let mut engine = GitEngine::new(e.git.clone());
    engine.tick(&session, now(T0));
    commit_file(&e, &theirs, "pages/B.md", "- b theirs\n");
    git(&e, &theirs, &["push", "-q", "origin", "main"]);

    // A save lands after the engine's commits, just before it takes the lock:
    // only the commit under the lock can catch it. The lock is free until
    // then, or this would never come back.
    let hooked = Arc::clone(&session);
    engine.before_lock(Box::new(move || {
        set_text(&hooked, "a", 0, "saved during fetch");
    }));
    let step = engine.tick(&session, now(T0 + 5 * MIN));
    let v = last_view(&engine, &step);
    assert_eq!(v.state, GitState::Ready, "{:?}", v.problem);
    assert_eq!(
        git(&e, &mine, &["show", "HEAD:pages/A.md"]),
        "- saved during fetch"
    );
    assert_eq!(git(&e, &mine, &["status", "--porcelain"]), "");
    assert_eq!(read(&mine, "pages/B.md"), "- b theirs\n");
    assert_eq!(
        git(&e, &bare, &["rev-parse", "main"]),
        git(&e, &mine, &["rev-parse", "HEAD"])
    );
}

#[test]
fn a_tick_with_nothing_due_runs_no_git() {
    let e = env();
    let (_bare, mine, _theirs) = two_clones(&e);
    let session = open(&mine);
    let mut engine = GitEngine::new(e.git.clone());
    engine.tick(&session, now(T0));
    assert_eq!(engine.view().state, GitState::Ready);
    set_text(&session, "a", 0, "typing");
    engine.changed(now(T0 + 10_000));
    let runs = e.git.runs();
    let step = engine.tick(&session, now(T0 + 20_000));
    assert_eq!(e.git.runs(), runs);
    assert!(step.view.is_none());
    assert!(step.outputs.is_empty());
}

#[test]
fn a_repository_made_later_is_found() {
    let e = env();
    let dir = e.root.path().join("notes");
    std::fs::create_dir_all(dir.join("pages")).unwrap();
    std::fs::write(dir.join("pages/A.md"), "- a\n").unwrap();
    let session = open(&dir);
    let mut engine = GitEngine::new(e.git.clone());
    engine.tick(&session, now(T0));
    assert_eq!(engine.view().state, GitState::NotRepo);
    git(&e, &dir, &["init", "-q"]);
    // Nothing is due: nothing is noticed, and no git runs.
    let runs = e.git.runs();
    engine.tick(&session, now(T0 + MIN));
    assert_eq!(e.git.runs(), runs);
    assert_eq!(engine.view().state, GitState::NotRepo);
    // A tick that would do something looks again.
    engine.tick(&session, now(T0 + 5 * MIN));
    assert_eq!(engine.view().state, GitState::Ready);

    let dir2 = e.root.path().join("notes2");
    std::fs::create_dir_all(dir2.join("pages")).unwrap();
    std::fs::write(dir2.join("pages/A.md"), "- a\n").unwrap();
    let session2 = open(&dir2);
    let mut engine2 = GitEngine::new(e.git.clone());
    engine2.tick(&session2, now(T0));
    assert_eq!(engine2.view().state, GitState::NotRepo);
    git(&e, &dir2, &["init", "-q"]);
    engine2.sync_now(&session2, now(T0 + MIN));
    assert_eq!(engine2.view().state, GitState::Ready);
}

#[test]
fn a_locked_index_is_quiet() {
    let e = env();
    let (_bare, mine, _theirs) = two_clones(&e);
    let session = open(&mine);
    let mut engine = GitEngine::new(e.git.clone());
    engine.tick(&session, now(T0));
    set_text(&session, "a", 0, "locked out");
    engine.changed(now(T0 + 10_000));
    let before = git(&e, &mine, &["rev-parse", "HEAD"]);
    let lock = mine.join(".git/index.lock");
    std::fs::write(&lock, "").unwrap();
    let step = engine.tick(&session, now(T0 + 5 * MIN + 10_000));
    let v = last_view(&engine, &step);
    assert!(v.problem.as_ref().is_none_or(|p| !p.red), "{:?}", v.problem);
    assert_ne!(v.state, GitState::Working);
    assert_eq!(git(&e, &mine, &["rev-parse", "HEAD"]), before);
    std::fs::remove_file(&lock).unwrap();
    engine.tick(&session, now(T0 + 5 * MIN + 12_000));
    assert_ne!(git(&e, &mine, &["rev-parse", "HEAD"]), before);
    assert_eq!(git(&e, &mine, &["show", "HEAD:pages/A.md"]), "- locked out");
}

#[test]
fn begin_shows_working_only_when_something_is_due() {
    let e = env();
    let (_bare, mine, _theirs) = two_clones(&e);
    let session = open(&mine);
    let mut engine = GitEngine::new(e.git.clone());
    assert!(
        engine.begin(now(T0), false).is_none(),
        "state not known yet"
    );
    engine.tick(&session, now(T0));
    assert!(engine.begin(now(T0 + 1000), false).is_none());
    assert_eq!(engine.view().state, GitState::Ready);
    let v = engine.begin(now(T0 + 1000), true).expect("asked");
    assert_eq!(v.state, GitState::Working);
    let step = engine.sync_now(&session, now(T0 + 1000));
    assert_ne!(last_view(&engine, &step).state, GitState::Working);
    assert_eq!(engine.view().state, GitState::Ready);
}

#[test]
fn a_save_during_the_fetch_is_committed_before_the_lock_is_taken() {
    let e = env();
    let (_bare, mine, theirs) = two_clones(&e);
    let session = open(&mine);
    let mut engine = GitEngine::new(e.git.clone());
    engine.tick(&session, now(T0));
    commit_file(&e, &theirs, "pages/B.md", "- b theirs\n");
    git(&e, &theirs, &["push", "-q", "origin", "main"]);

    let hooked = Arc::clone(&session);
    engine.after_fetch(Box::new(move || {
        set_text(&hooked, "a", 0, "saved during fetch");
    }));
    let (git2, dir) = (e.git.clone(), mine.clone());
    let clean = Arc::new(Mutex::new(None));
    let seen = Arc::clone(&clean);
    engine.before_lock(Box::new(move || {
        let out = git2
            .ok(
                &dir,
                &["status", "--porcelain"],
                breccia_core::git::LOCAL_LIMIT,
            )
            .unwrap();
        *seen.lock().unwrap() = Some(out.text());
    }));
    let step = engine.tick(&session, now(T0 + 5 * MIN));
    assert_eq!(last_view(&engine, &step).state, GitState::Ready);
    assert_eq!(
        clean.lock().unwrap().as_deref(),
        Some(""),
        "the save was committed before the lock was taken"
    );
    assert_eq!(
        git(&e, &mine, &["show", "HEAD:pages/A.md"]),
        "- saved during fetch"
    );
}

#[test]
fn close_never_pulls_when_the_push_is_rejected() {
    let e = env();
    let (bare, mine, theirs) = two_clones(&e);
    let session = open(&mine);
    let mut engine = GitEngine::new(e.git.clone());
    engine.tick(&session, now(T0));
    // The other clone pushes first, so the push at close is rejected.
    commit_file(&e, &theirs, "pages/B.md", "- b theirs\n");
    git(&e, &theirs, &["push", "-q", "origin", "main"]);
    let remote = git(&e, &bare, &["rev-parse", "main"]);
    let tracking = git(&e, &mine, &["rev-parse", "refs/remotes/origin/main"]);
    let base = git(&e, &mine, &["rev-parse", "HEAD"]);
    set_text(&session, "a", 0, "a before close");

    let step = engine.close(&session, now(T0 + 1000));
    assert_eq!(
        git(&e, &mine, &["rev-parse", "refs/remotes/origin/main"]),
        tracking,
        "no fetch at close"
    );
    assert_eq!(git(&e, &bare, &["rev-parse", "main"]), remote, "not pushed");
    assert!(!mine.join(".git/rebase-merge").exists());
    assert!(!mine.join(".git/rebase-apply").exists());
    assert_eq!(count(&e, &mine), 2, "only the close commit was added");
    assert_eq!(git(&e, &mine, &["rev-parse", "HEAD~1"]), base);
    assert_eq!(read(&mine, "pages/B.md"), "- b\n", "nothing pulled");
    let v = last_view(&engine, &step);
    assert!(
        v.problem.as_ref().is_some_and(|p| !p.red),
        "{:?}",
        v.problem
    );
    assert!(step.outputs.is_empty());
}

#[test]
fn a_local_upstream_is_no_remote() {
    let e = env();
    let (bare, mine, _theirs) = two_clones(&e);
    // The branch the notes are on tracks another local branch (`remote = .`).
    git(
        &e,
        &mine,
        &["checkout", "-q", "-b", "work", "--track", "main"],
    );
    let main_before = git(&e, &mine, &["rev-parse", "main"]);
    let remote_before = git(&e, &bare, &["rev-parse", "main"]);
    let session = open(&mine);
    let mut engine = GitEngine::new(e.git.clone());
    engine.tick(&session, now(T0));
    set_text(&session, "a", 0, "on work");
    engine.changed(now(T0 + 10_000));
    engine.tick(&session, now(T0 + 6 * MIN));
    set_text(&session, "a", 0, "on work again");
    let step = engine.sync_now(&session, now(T0 + 7 * MIN));
    let v = last_view(&engine, &step);
    assert_eq!(
        git(&e, &mine, &["show", "work:pages/A.md"]),
        "- on work again"
    );
    assert_eq!(
        git(&e, &mine, &["rev-parse", "main"]),
        main_before,
        "main moved"
    );
    assert_eq!(git(&e, &bare, &["rev-parse", "main"]), remote_before);
    assert_eq!(v.state, GitState::Ready, "{:?}", v.problem);
    assert_eq!(v.remote, None);
    assert_eq!(v.ahead, 0);
}

#[test]
fn a_lasting_index_lock_becomes_a_red_problem() {
    let e = env();
    let (_bare, mine, _theirs) = two_clones(&e);
    let session = open(&mine);
    let mut engine = GitEngine::new(e.git.clone());
    engine.tick(&session, now(T0));
    set_text(&session, "a", 0, "locked out");
    engine.changed(now(T0 + 10_000));
    let before = git(&e, &mine, &["rev-parse", "HEAD"]);
    let lock = mine.join(".git/index.lock");
    std::fs::write(&lock, "").unwrap();
    let t = T0 + 5 * MIN + 10_000;
    for later in [0, 10_000, 50_000] {
        let step = engine.tick(&session, now(t + later));
        let v = last_view(&engine, &step);
        assert!(
            v.problem.as_ref().is_none_or(|p| !p.red),
            "{later}: {:?}",
            v.problem
        );
    }
    let step = engine.tick(&session, now(t + MIN));
    let v = last_view(&engine, &step);
    assert_eq!(v.state, GitState::Problem);
    let p = v.problem.expect("a problem");
    assert_eq!(p.kind, "locked");
    assert!(p.red);
    assert!(p.message.contains("index.lock"), "{}", p.message);
    assert!(lock.exists(), "Breccia never deletes the lock");
    assert_eq!(git(&e, &mine, &["rev-parse", "HEAD"]), before);

    std::fs::remove_file(&lock).unwrap();
    let step = engine.tick(&session, now(t + MIN + 10_000));
    assert_eq!(last_view(&engine, &step).state, GitState::Ready);
    assert_eq!(git(&e, &mine, &["show", "HEAD:pages/A.md"]), "- locked out");
    // A new lock later starts a new quiet minute.
    std::fs::write(&lock, "").unwrap();
    set_text(&session, "a", 0, "locked again");
    engine.changed(now(t + 2 * MIN));
    let step = engine.tick(&session, now(t + 8 * MIN));
    let v = last_view(&engine, &step);
    assert!(v.problem.as_ref().is_none_or(|p| !p.red), "{:?}", v.problem);
    std::fs::remove_file(&lock).unwrap();
}

#[test]
fn a_pull_that_changes_the_config_reloads_it() {
    let e = env();
    let config = breccia_core::Config::default_toml();
    let (_bare, mine, theirs) = clones(
        &e,
        &[("pages/A.md", "- a\n"), ("breccia/config.toml", config)],
    );
    let session = open(&mine);
    let mut engine = GitEngine::new(e.git.clone());
    engine.tick(&session, now(T0));
    let added = format!("{config}\n[[boards]]\nname = \"Theirs\" # from B\ncolumns = [\"DONE\"]\n");
    commit_file(&e, &theirs, "breccia/config.toml", &added);
    git(&e, &theirs, &["push", "-q", "origin", "main"]);

    let step = engine.sync_now(&session, now(T0 + MIN));
    assert_eq!(last_view(&engine, &step).state, GitState::Ready);
    assert_eq!(read(&mine, "breccia/config.toml"), added);
    let names = |c: &breccia_core::session::ConfigView| -> Vec<String> {
        c.boards.iter().map(|b| b.name.clone()).collect()
    };
    let sent = step
        .outputs
        .iter()
        .find_map(|(_, o)| o.config.clone())
        .expect("the new config is sent to the frontend");
    assert_eq!(names(&sent), ["Tasks", "Theirs"]);
    let c = cmd(&session, json!({"type": "config.get"})).config.unwrap();
    assert_eq!(names(&c), ["Tasks", "Theirs"]);
    // A board edit made from the new list keeps the pulled board and its comment.
    cmd(
        &session,
        json!({"type": "boards.set", "version": c.version, "boards": [
            {"name": "Tasks", "columns": ["TODO"]},
            {"name": "Theirs", "columns": ["DONE"]}
        ]}),
    );
    assert!(read(&mine, "breccia/config.toml").contains("name = \"Theirs\" # from B"));
}

#[test]
fn leftover_changes_are_committed_when_a_folder_opens() {
    // Changes made outside Breccia before it opened the
    // folder are committed by the first tick, with no remote and no pause.
    let e = env();
    let dir = repo(&e, "notes", &[("pages/A.md", "- a\n")]);
    assert_eq!(count(&e, &dir), 1);
    std::fs::write(dir.join("pages/x.md"), "- x\n").unwrap();
    let session = open(&dir);
    let mut engine = GitEngine::new(e.git.clone());
    engine.tick(&session, now(T0));
    assert_eq!(count(&e, &dir), 2);
    assert!(git(&e, &dir, &["ls-tree", "-r", "--name-only", "HEAD"]).contains("pages/x.md"));
}

#[test]
fn an_ssh_remote_that_hangs_needs_the_ssh_key() {
    use std::time::{Duration, Instant};
    let e = env();
    let (_bare, mine, _theirs) = two_clones(&e);
    git(
        &e,
        &mine,
        &["remote", "set-url", "origin", "ssh://example.invalid/x.git"],
    );
    std::fs::create_dir_all(mine.join("breccia")).unwrap();
    std::fs::write(
        mine.join("breccia/config.toml"),
        "[git]\npull_interval_minutes = 1\n",
    )
    .unwrap();
    // Every run of the fake ssh leaves a line in `ssh-calls`, so the test sees a fetch without timing it.
    let calls = e.root.path().join("ssh-calls");
    let body = format!(
        "echo x >> '{}'\nsleep 30\n",
        calls.to_string_lossy().replace('\\', "/")
    );
    let script = fake_ssh(&e, "hang.sh", &body);
    let g = e
        .git
        .clone()
        .with_env("GIT_SSH_COMMAND", script)
        .with_network_limit(Duration::from_secs(2));
    let session = open(&mine);
    let mut engine = GitEngine::new(g);
    set_text(&session, "a", 0, "a changed");
    engine.changed(now(T0));
    let step = engine.tick(&session, now(T0 + 5 * MIN));
    let v = last_view(&engine, &step);
    assert_eq!(problem_kind(&v), Some("sshKey"), "{v:?}");
    let p = v.problem.as_ref().unwrap();
    assert!(p.red);
    assert!(p.message.contains("origin"), "{}", p.message);
    assert!(git(&e, &mine, &["log", "--format=%s"]).lines().count() >= 2);
    assert_eq!(read(&mine, "pages/A.md"), "- a changed\n");

    // Stopped: the next pull does not run a fetch (no new run of the fake ssh; not timed, a loaded machine is slow).
    let runs = std::fs::read_to_string(&calls).unwrap().lines().count();
    assert!(runs >= 1);
    let step = engine.tick(&session, now(T0 + 7 * MIN));
    assert_eq!(
        std::fs::read_to_string(&calls).unwrap().lines().count(),
        runs
    );
    assert_eq!(problem_kind(&last_view(&engine, &step)), Some("sshKey"));

    // A click tries again.
    let start = Instant::now();
    let step = engine.sync_now(&session, now(T0 + 8 * MIN));
    assert!(start.elapsed() >= Duration::from_secs(2));
    assert_eq!(problem_kind(&last_view(&engine, &step)), Some("sshKey"));
}

/// `theirs` changes `pages/B.md` and pushes, so `mine` has something to pull.
fn their_change(e: &Env, theirs: &Path, text: &str) {
    commit_file(e, theirs, "pages/B.md", text);
    git(e, theirs, &["push", "-q", "origin", "main"]);
}

#[test]
fn a_refused_rebase_is_tried_again_once() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let e = env();
    let (_bare, mine, theirs) = two_clones(&e);
    let session = open(&mine);
    let mut engine = GitEngine::new(e.git.clone());
    their_change(&e, &theirs, "- b theirs\n");
    // Another program writes a tracked file just before the rebase, once.
    let calls = Arc::new(AtomicUsize::new(0));
    let (n, dir) = (Arc::clone(&calls), mine.clone());
    engine.before_rebase(Box::new(move || {
        if n.fetch_add(1, Ordering::SeqCst) == 0 {
            std::fs::write(dir.join("pages/A.md"), "- outside\n").unwrap();
        }
    }));
    let step = engine.tick(&session, now(T0));
    let v = last_view(&engine, &step);
    assert_eq!(v.state, GitState::Ready, "{:?}", v.problem);
    assert!(v.problem.is_none());
    assert_eq!(read(&mine, "pages/A.md"), "- outside\n");
    assert_eq!(read(&mine, "pages/B.md"), "- b\n", "not pulled yet");

    let step = engine.tick(&session, now(T0 + 10_000));
    let v = last_view(&engine, &step);
    assert_eq!(v.state, GitState::Ready, "{:?}", v.problem);
    assert_eq!(read(&mine, "pages/B.md"), "- b theirs\n");
    assert_eq!(read(&mine, "pages/A.md"), "- outside\n");
    let subject = git(&e, &mine, &["log", "-1", "--format=%s"]);
    assert_eq!(subject, "update A");
    assert_eq!(git(&e, &mine, &["status", "--porcelain"]), "");
}

#[test]
fn a_second_refusal_stops_syncing() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let e = env();
    let (_bare, mine, theirs) = two_clones(&e);
    let session = open(&mine);
    let mut engine = GitEngine::new(e.git.clone());
    their_change(&e, &theirs, "- b theirs\n");
    // Every rebase finds a tracked file changed (the text differs each time).
    let calls = Arc::new(AtomicUsize::new(0));
    let (n, dir) = (Arc::clone(&calls), mine.clone());
    engine.before_rebase(Box::new(move || {
        let k = n.fetch_add(1, Ordering::SeqCst);
        std::fs::write(dir.join("pages/A.md"), format!("- outside {k}\n")).unwrap();
    }));
    let step = engine.tick(&session, now(T0));
    assert!(last_view(&engine, &step).problem.is_none());
    let step = engine.tick(&session, now(T0 + 10_000));
    let v = last_view(&engine, &step);
    assert_eq!(problem_kind(&v), Some("rebaseRefused"), "{v:?}");
    assert!(v.problem.as_ref().unwrap().red);
    assert_eq!(calls.load(Ordering::SeqCst), 2);

    // The remote moves again; a stopped engine does not even fetch.
    let known = git(&e, &mine, &["rev-parse", "refs/remotes/origin/main"]);
    their_change(&e, &theirs, "- b theirs again\n");
    let newest = git(&e, &theirs, &["rev-parse", "HEAD"]);
    assert_ne!(known, newest);
    let step = engine.tick(&session, now(T0 + 20 * MIN));
    assert_eq!(
        problem_kind(&last_view(&engine, &step)),
        Some("rebaseRefused")
    );
    assert_eq!(
        git(&e, &mine, &["rev-parse", "refs/remotes/origin/main"]),
        known,
        "no fetch ran"
    );
    assert_eq!(calls.load(Ordering::SeqCst), 2);
}

#[test]
fn a_retry_that_ends_otherwise_forgets_the_refusal() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let e = env();
    let (bare, mine, theirs) = two_clones(&e);
    let session = open(&mine);
    let mut engine = GitEngine::new(e.git.clone());
    their_change(&e, &theirs, "- b theirs\n");
    // Every rebase finds a tracked file changed.
    let calls = Arc::new(AtomicUsize::new(0));
    let (n, dir) = (Arc::clone(&calls), mine.clone());
    engine.before_rebase(Box::new(move || {
        let k = n.fetch_add(1, Ordering::SeqCst);
        std::fs::write(dir.join("pages/A.md"), format!("- outside {k}\n")).unwrap();
    }));
    let step = engine.tick(&session, now(T0));
    assert!(last_view(&engine, &step).problem.is_none());

    // The retry cannot fetch: it ends without a refusal.
    let gone = e.root.path().join("gone.git");
    let url = git(&e, &mine, &["remote", "get-url", "origin"]);
    git(
        &e,
        &mine,
        &["remote", "set-url", "origin", gone.to_str().unwrap()],
    );
    let step = engine.tick(&session, now(T0 + 10_000));
    let v = last_view(&engine, &step);
    assert!(v.problem.is_some(), "the fetch failed");
    assert_ne!(problem_kind(&v), Some("rebaseRefused"), "{v:?}");
    assert_eq!(calls.load(Ordering::SeqCst), 1);

    // Much later one refusal is again only tried once more, quietly: what counts
    // is "two in a row".
    git(&e, &mine, &["remote", "set-url", "origin", &url]);
    assert!(bare.exists());
    let step = engine.tick(&session, now(T0 + 10_000 + 5 * MIN));
    let v = last_view(&engine, &step);
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    assert!(v.problem.is_none(), "{v:?}");
}

#[test]
fn a_deleted_git_folder_reads_not_in_git() {
    let e = env();
    let (_bare, mine, _theirs) = two_clones(&e);
    let session = open(&mine);
    let mut engine = GitEngine::new(e.git.clone());
    engine.tick(&session, now(T0));
    assert_eq!(engine.view().state, GitState::Ready);
    std::fs::remove_dir_all(mine.join(".git")).unwrap();
    set_text(&session, "a", 0, "a changed");
    engine.changed(now(T0 + 10_000));
    let step = engine.tick(&session, now(T0 + 10_000 + 5 * MIN));
    let v = last_view(&engine, &step);
    assert_eq!(v.state, GitState::NotRepo, "{:?}", v.problem);
    assert!(v.problem.is_none());
}
