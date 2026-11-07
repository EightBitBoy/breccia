use breccia_core::{Clock, CommandError, Output, Session};
use chrono::NaiveDate;
use serde_json::{Value, json};
use std::fs;
use std::path::Path;
use tempfile::TempDir;

fn clock(ms: u64) -> Clock {
    Clock {
        today: NaiveDate::from_ymd_opt(2026, 10, 29).unwrap(),
        time: chrono::NaiveTime::from_hms_opt(14, 5, 9).unwrap(),
        ms,
    }
}

fn cmd(s: &mut Session, json: Value, ms: u64) -> Result<Output, CommandError> {
    let req = serde_json::from_value(json!({"generation": s.generation(), "command": json}))
        .unwrap_or_else(|e| panic!("bad request: {e}"));
    s.run(req, clock(ms))
}

fn ok(s: &mut Session, json: Value, ms: u64) -> Output {
    let j = json.clone();
    cmd(s, json, ms).unwrap_or_else(|e| panic!("{j}: {e:?}"))
}

fn put(root: &Path, rel: &str, text: &str) {
    let p = root.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
}

fn folder(files: &[(&str, &str)]) -> (TempDir, Session) {
    let t = tempfile::tempdir().unwrap();
    for (rel, text) in files {
        put(t.path(), rel, text);
    }
    let mut s = Session::new();
    ok(&mut s, json!({"type": "folder.open", "path": t.path()}), 0);
    (t, s)
}

fn read(t: &TempDir, rel: &str) -> String {
    fs::read_to_string(t.path().join(rel)).unwrap()
}

fn pick(s: &mut Session, key: &str, color: Value) -> Output {
    ok(
        s,
        json!({"type": "page.setColor", "key": key, "color": color}),
        0,
    )
}

fn undo(s: &mut Session, key: &str) -> Output {
    ok(s, json!({"type": "history.undo", "page": key}), 0)
}

#[test]
fn set_color_writes_only_the_color_line() {
    let (t, mut s) = folder(&[("pages/Garden.md", "- a\n\t- b\n")]);
    let out = pick(&mut s, "garden", json!("red"));
    assert_eq!(read(&t, "pages/Garden.md"), "color:: red\n- a\n\t- b\n");
    assert_eq!(out.page.unwrap().color, Some("red"));
    pick(&mut s, "garden", json!("blue"));
    assert_eq!(read(&t, "pages/Garden.md"), "color:: blue\n- a\n\t- b\n");
    let out = pick(&mut s, "garden", Value::Null);
    assert_eq!(read(&t, "pages/Garden.md"), "- a\n\t- b\n");
    let view = serde_json::to_value(out.page.unwrap()).unwrap();
    assert!(view.get("color").is_none());
}

#[test]
fn set_color_keeps_title_and_front_matter() {
    let (t, mut s) = folder(&[(
        "pages/Q&A_ hiring.md",
        "---\naliases:\n  - \"Q&A: hiring\"\n---\ntitle:: Q&A: hiring\n- a\n",
    )]);
    pick(&mut s, "q&a: hiring", json!("teal"));
    assert_eq!(
        read(&t, "pages/Q&A_ hiring.md"),
        "---\naliases:\n  - \"Q&A: hiring\"\n---\ntitle:: Q&A: hiring\ncolor:: teal\n- a\n"
    );
}

#[test]
fn set_color_on_a_crlf_file_adds_only_the_line() {
    let (t, mut s) = folder(&[("pages/Win.md", "title:: Win\r\n- a\r\n")]);
    pick(&mut s, "win", json!("red"));
    assert_eq!(read(&t, "pages/Win.md"), "title:: Win\ncolor:: red\n- a\n");
}

#[test]
fn set_color_on_a_tag_only_page_creates_its_file() {
    let (t, mut s) = folder(&[("pages/Notes.md", "- x #garden #other\n")]);
    let out = pick(&mut s, "garden", json!("red"));
    assert_eq!(read(&t, "pages/garden.md"), "color:: red\n");
    assert!(out.page.unwrap().has_file);
    assert!(out.tree.is_some());
    pick(&mut s, "other", Value::Null);
    assert!(!t.path().join("pages/other.md").exists());
}

#[test]
fn set_color_refuses_unknown_names_journals_and_changed_files() {
    let (t, mut s) = folder(&[
        ("pages/Garden.md", "- a\n"),
        ("journals/2026-10-29.md", "- j\n"),
    ]);
    let code = |s: &mut Session, key: &str, color: &str| {
        cmd(
            s,
            json!({"type": "page.setColor", "key": key, "color": color}),
            0,
        )
        .unwrap_err()
        .code
    };
    assert_eq!(code(&mut s, "garden", "banana"), "unknownColor");
    assert_eq!(code(&mut s, "2026-10-29", "red"), "journal");
    put(t.path(), "pages/Garden.md", "- changed outside\n");
    assert_eq!(code(&mut s, "garden", "red"), "changedOnDisk");
    assert_eq!(read(&t, "pages/Garden.md"), "- changed outside\n");
}

#[test]
fn page_view_carries_the_page_color() {
    let (_t, mut s) = folder(&[
        ("pages/Garden.md", "color:: Red\n- a\n"),
        ("journals/2026-10-29.md", "color:: red\n- j\n"),
    ]);
    let out = ok(&mut s, json!({"type": "page.get", "key": "garden"}), 0);
    assert_eq!(out.page.unwrap().color, Some("red"));
    let out = ok(&mut s, json!({"type": "page.get", "key": "2026-10-29"}), 0);
    assert_eq!(out.page.unwrap().color, None);
}

#[test]
fn a_pick_is_its_own_undo_step() {
    let (t, mut s) = folder(&[("pages/Garden.md", "- a\n\t- b\n")]);
    let id = ok(&mut s, json!({"type": "page.get", "key": "garden"}), 0)
        .page
        .unwrap()
        .blocks[0]
        .id;
    ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "a typed"}),
        100,
    );
    pick(&mut s, "garden", json!("red"));
    pick(&mut s, "garden", json!("blue"));
    let out = undo(&mut s, "garden");
    assert_eq!(
        read(&t, "pages/Garden.md"),
        "color:: red\n- a typed\n\t- b\n"
    );
    assert_eq!(out.page.unwrap().color, Some("red"));
    undo(&mut s, "garden");
    assert_eq!(read(&t, "pages/Garden.md"), "- a typed\n\t- b\n");
    undo(&mut s, "garden");
    assert_eq!(read(&t, "pages/Garden.md"), "- a\n\t- b\n");
    for _ in 0..3 {
        ok(&mut s, json!({"type": "history.redo", "page": "garden"}), 0);
    }
    assert_eq!(
        read(&t, "pages/Garden.md"),
        "color:: blue\n- a typed\n\t- b\n"
    );
}

#[test]
fn picking_the_current_color_records_no_step() {
    let (t, mut s) = folder(&[("pages/Garden.md", "- a\n")]);
    pick(&mut s, "garden", json!("red"));
    pick(&mut s, "garden", json!("red"));
    undo(&mut s, "garden");
    assert_eq!(read(&t, "pages/Garden.md"), "- a\n");
}

#[test]
fn an_outside_edit_ends_undo_of_a_pick() {
    let (t, mut s) = folder(&[("pages/Garden.md", "- a\n")]);
    pick(&mut s, "garden", json!("red"));
    put(t.path(), "pages/Garden.md", "- outside\n");
    ok(
        &mut s,
        json!({"type": "files.changed", "paths": ["pages/Garden.md"]}),
        0,
    );
    undo(&mut s, "garden");
    assert_eq!(read(&t, "pages/Garden.md"), "- outside\n");
}

#[test]
fn undoing_a_pick_on_a_tag_only_page_empties_its_file() {
    let (t, mut s) = folder(&[("pages/Notes.md", "- x #garden\n")]);
    pick(&mut s, "garden", json!("red"));
    let out = undo(&mut s, "garden");
    assert_eq!(read(&t, "pages/garden.md"), "");
    assert_eq!(out.page.unwrap().color, None);
}
