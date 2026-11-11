//! `archive.auto`: Breccia archives finished tasks by itself.

use crate::support::{self, DAY, clock_on, open_at, put, read};
use breccia_core::session::Notice;
use breccia_core::{Clock, Output, Session};
use serde_json::{Value, json};
use std::fs;
use std::path::Path;

fn clock(ms: u64) -> Clock {
    clock_on(DAY, ms)
}

fn ok_at(s: &mut Session, json: Value, ms: u64) -> Output {
    support::ok(s, json, clock(ms))
}

fn ok(s: &mut Session, json: Value) -> Output {
    ok_at(s, json, 0)
}

fn open(root: &Path) -> Session {
    open_at(root, clock(0))
}

fn auto(s: &mut Session) -> Output {
    ok(s, json!({"type": "archive.auto"}))
}

/// The id of the block of page `key` whose text starts with `start`.
fn id_of(s: &mut Session, key: &str, start: &str) -> breccia_core::outline::BlockId {
    let page = ok(s, json!({"type": "page.get", "key": key})).page.unwrap();
    page.blocks
        .iter()
        .find(|b| b.text.starts_with(start))
        .unwrap_or_else(|| panic!("no block {start}"))
        .id
}

fn infos(out: &Output) -> Vec<&str> {
    out.notices
        .iter()
        .filter_map(|n| match n {
            Notice::Info { message } => Some(message.as_str()),
            _ => None,
        })
        .collect()
}

const STATES: &str = r#"[[states]]
keyword = "TODO"
finished = false

[[states]]
keyword = "DONE"
finished = true

[[states]]
keyword = "CANCELED"
finished = true
"#;

#[test]
fn only_finished_tasks_done_more_than_n_days_ago_are_archived() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "breccia/config.toml", STATES);
    let page = "- DONE fifteen days
  done:: [[2026-10-14]]
- DONE fourteen days
  done:: [[2026-10-15]]
- DONE no date
- CANCELED dropped long ago
  done:: [[2026-09-01]]
- TODO open with an old done line
  done:: [[2026-09-01]]
- DONE already
  done:: [[2026-09-01]]
  archived:: 2026-09-20
- not a task
  done:: [[2026-09-01]]
";
    put(t.path(), "pages/P.md", page);
    put(
        t.path(),
        "journals/2026-09-30.md",
        "- DONE in a journal\n  done:: [[2026-09-30]]\n",
    );
    let mut s = open(t.path());
    let out = auto(&mut s);
    assert_eq!(
        read(t.path(), "pages/P.md"),
        "- DONE fifteen days
  done:: [[2026-10-14]]
  archived:: 2026-10-29 14:05:09
- DONE fourteen days
  done:: [[2026-10-15]]
- DONE no date
- CANCELED dropped long ago
  done:: [[2026-09-01]]
  archived:: 2026-10-29 14:05:09
- TODO open with an old done line
  done:: [[2026-09-01]]
- DONE already
  done:: [[2026-09-01]]
  archived:: 2026-09-20
- not a task
  done:: [[2026-09-01]]
"
    );
    assert_eq!(
        read(t.path(), "journals/2026-09-30.md"),
        "- DONE in a journal\n  done:: [[2026-09-30]]\n  archived:: 2026-10-29 14:05:09\n"
    );
    let mut keys: Vec<&str> = out.changed.iter().map(|p| p.key.as_str()).collect();
    keys.sort();
    assert_eq!(keys, ["2026-09-30", "p"]);
    assert_eq!(
        infos(&out),
        ["Archived 3 finished tasks (done more than 14 days ago)"]
    );
    // A second run finds nothing: no change, no note.
    let again = auto(&mut s);
    assert!(
        again.changed.is_empty() && again.notices.is_empty(),
        "{again:?}"
    );
}

#[test]
fn whole_days_count_from_the_date_whatever_the_time() {
    // Today is 2026-10-29 at 14:05:09; 14 days is the default.
    let t = tempfile::tempdir().unwrap();
    let page = "- DONE fifteen days, late in the day\n  done:: [[2026-10-14]] 23:59:59\n- DONE fourteen days, at dawn\n  done:: [[2026-10-15]] 00:00:01\n";
    put(t.path(), "pages/P.md", page);
    let mut s = open(t.path());
    auto(&mut s);
    assert_eq!(
        read(t.path(), "pages/P.md"),
        "- DONE fifteen days, late in the day\n  done:: [[2026-10-14]] 23:59:59\n  archived:: 2026-10-29 14:05:09\n- DONE fourteen days, at dawn\n  done:: [[2026-10-15]] 00:00:01\n"
    );
}

#[test]
fn one_task_is_named_in_the_singular_and_the_days_follow_the_setting() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "breccia/config.toml",
        "[board]\narchive_after_days = 3\n",
    );
    put(
        t.path(),
        "pages/P.md",
        "- DONE x\n  done:: [[2026-10-25]]\n",
    );
    let mut s = open(t.path());
    assert_eq!(
        infos(&auto(&mut s)),
        ["Archived 1 finished task (done more than 3 days ago)"]
    );
}

#[test]
fn nothing_is_archived_while_the_setting_is_off() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "breccia/config.toml",
        "[board]\nauto_archive = false\n",
    );
    let text = "- DONE x\n  done:: [[2026-09-01]]\n";
    put(t.path(), "pages/P.md", text);
    let mut s = open(t.path());
    let out = auto(&mut s);
    assert!(out.changed.is_empty() && out.notices.is_empty(), "{out:?}");
    assert_eq!(read(t.path(), "pages/P.md"), text);
    // The column menu's "Archive finished …" still works.
    ok(&mut s, json!({"type": "board.archive", "keyword": "DONE"}));
    assert_eq!(
        read(t.path(), "pages/P.md"),
        "- DONE x\n  done:: [[2026-09-01]]\n  archived:: 2026-10-29 14:05:09\n"
    );
}

#[test]
fn the_block_being_edited_is_left_for_a_later_run() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "pages/P.md",
        "- DONE edited\n  done:: [[2026-09-01]]\n- DONE other\n  done:: [[2026-09-01]]\n",
    );
    let mut s = open(t.path());
    let id = id_of(&mut s, "p", "DONE edited");
    let out = ok(&mut s, json!({"type": "archive.auto", "editing": id}));
    assert_eq!(
        read(t.path(), "pages/P.md"),
        "- DONE edited\n  done:: [[2026-09-01]]\n- DONE other\n  done:: [[2026-09-01]]\n  archived:: 2026-10-29 14:05:09\n"
    );
    assert_eq!(
        infos(&out),
        ["Archived 1 finished task (done more than 14 days ago)"]
    );
    auto(&mut s);
    assert_eq!(
        read(t.path(), "pages/P.md"),
        "- DONE edited\n  done:: [[2026-09-01]]\n  archived:: 2026-10-29 14:05:09\n- DONE other\n  done:: [[2026-09-01]]\n  archived:: 2026-10-29 14:05:09\n"
    );
}

#[test]
fn undo_and_redo_skip_the_automatic_archive() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "pages/P.md",
        "- note\n- DONE old\n  done:: [[2026-09-01]]\n",
    );
    let mut s = open(t.path());
    let note = id_of(&mut s, "p", "note");
    ok(
        &mut s,
        json!({"type": "block.setText", "id": note, "text": "note typed"}),
    );
    auto(&mut s);
    let archived =
        "- note typed\n- DONE old\n  done:: [[2026-09-01]]\n  archived:: 2026-10-29 14:05:09\n";
    assert_eq!(read(t.path(), "pages/P.md"), archived);
    // Undo takes back the typing only; the archive stays.
    ok(&mut s, json!({"type": "history.undo", "page": "p"}));
    assert_eq!(
        read(t.path(), "pages/P.md"),
        "- note\n- DONE old\n  done:: [[2026-09-01]]\n  archived:: 2026-10-29 14:05:09\n"
    );
    // Nothing more to undo: the archive was no step of its own.
    ok(&mut s, json!({"type": "history.undo", "page": "p"}));
    assert_eq!(
        read(t.path(), "pages/P.md"),
        "- note\n- DONE old\n  done:: [[2026-09-01]]\n  archived:: 2026-10-29 14:05:09\n"
    );
    ok(&mut s, json!({"type": "history.redo", "page": "p"}));
    assert_eq!(read(t.path(), "pages/P.md"), archived);
}

#[test]
fn a_redo_step_made_before_the_run_keeps_the_archive() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "pages/P.md",
        "- note\n- DONE old\n  done:: [[2026-09-01]]\n",
    );
    let mut s = open(t.path());
    let note = id_of(&mut s, "p", "note");
    ok(
        &mut s,
        json!({"type": "block.setText", "id": note, "text": "note typed"}),
    );
    ok(&mut s, json!({"type": "history.undo", "page": "p"}));
    auto(&mut s);
    ok(&mut s, json!({"type": "history.redo", "page": "p"}));
    assert_eq!(
        read(t.path(), "pages/P.md"),
        "- note typed\n- DONE old\n  done:: [[2026-09-01]]\n  archived:: 2026-10-29 14:05:09\n"
    );
}

#[test]
fn a_run_does_not_end_a_run_of_typing() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "pages/P.md",
        "- note\n- DONE old\n  done:: [[2026-09-01]]\n",
    );
    let mut s = open(t.path());
    let note = id_of(&mut s, "p", "note");
    ok_at(
        &mut s,
        json!({"type": "block.setText", "id": note, "text": "note a"}),
        100,
    );
    ok_at(
        &mut s,
        json!({"type": "archive.auto", "editing": note}),
        200,
    );
    ok_at(
        &mut s,
        json!({"type": "block.setText", "id": note, "text": "note ab"}),
        300,
    );
    // One undo takes back the whole run of typing.
    ok(&mut s, json!({"type": "history.undo", "page": "p"}));
    assert_eq!(
        read(t.path(), "pages/P.md"),
        "- note\n- DONE old\n  done:: [[2026-09-01]]\n  archived:: 2026-10-29 14:05:09\n"
    );
}

#[test]
fn a_page_changed_on_disk_or_unsaved_is_left_alone() {
    let t = tempfile::tempdir().unwrap();
    let old = "- DONE x\n  done:: [[2026-09-01]]\n";
    put(t.path(), "pages/A.md", old);
    put(t.path(), "pages/B.md", old);
    let mut s = open(t.path());
    // Another program changes B after Breccia read it; the watcher has not told yet.
    let outside = "- DONE x\n  done:: [[2026-09-01]]\n- outside\n";
    fs::write(t.path().join("pages/B.md"), outside).unwrap();
    let out = auto(&mut s);
    assert_eq!(
        read(t.path(), "pages/A.md"),
        "- DONE x\n  done:: [[2026-09-01]]\n  archived:: 2026-10-29 14:05:09\n"
    );
    assert_eq!(read(t.path(), "pages/B.md"), outside);
    let keys: Vec<&str> = out.changed.iter().map(|p| p.key.as_str()).collect();
    assert_eq!(keys, ["a"]);
    assert_eq!(
        infos(&out),
        ["Archived 1 finished task (done more than 14 days ago)"]
    );
    assert_eq!(out.notices.len(), 1, "{:?}", out.notices);
    // Once the watcher reports it, B is read again and archived on the next run.
    ok(
        &mut s,
        json!({"type": "files.changed", "paths": ["pages/B.md"]}),
    );
    auto(&mut s);
    assert_eq!(
        read(t.path(), "pages/B.md"),
        "- DONE x\n  done:: [[2026-09-01]]\n  archived:: 2026-10-29 14:05:09\n- outside\n"
    );
}

#[test]
fn a_block_changed_on_disk_waits_until_it_is_shown() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "pages/P.md",
        "- DONE x\n  done:: [[2026-09-01]]\n",
    );
    let mut s = open(t.path());
    id_of(&mut s, "p", "DONE x");
    let theirs = "- DONE x changed\n  done:: [[2026-09-01]]\n";
    fs::write(t.path().join("pages/P.md"), theirs).unwrap();
    ok(
        &mut s,
        json!({"type": "files.changed", "paths": ["pages/P.md"]}),
    );
    // The editor may still show the old text of this block.
    auto(&mut s);
    assert_eq!(read(t.path(), "pages/P.md"), theirs);
    // Shown again: archived.
    id_of(&mut s, "p", "DONE x");
    auto(&mut s);
    assert_eq!(
        read(t.path(), "pages/P.md"),
        "- DONE x changed\n  done:: [[2026-09-01]]\n  archived:: 2026-10-29 14:05:09\n"
    );
}

#[test]
fn the_note_serializes_as_an_info_notice() {
    let n = Notice::Info {
        message: "Archived 1 finished task (done more than 14 days ago)".into(),
    };
    assert_eq!(
        serde_json::to_value(&n).unwrap(),
        json!({"kind": "info", "message": "Archived 1 finished task (done more than 14 days ago)"})
    );
}
