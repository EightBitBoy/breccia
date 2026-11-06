//! `journal.feed` and `pages.get`.

use breccia_core::session::FeedView;
use breccia_core::{Clock, CommandError, Output, Session};
use chrono::NaiveDate;
use serde_json::{Value, json};
use std::fs;
use std::path::Path;
use tempfile::TempDir;

fn clock((y, m, d): (i32, u32, u32)) -> Clock {
    Clock {
        today: NaiveDate::from_ymd_opt(y, m, d).unwrap(),
        time: chrono::NaiveTime::from_hms_opt(14, 5, 9).unwrap(),
        ms: 0,
    }
}

fn cmd_on(s: &mut Session, json: Value, date: (i32, u32, u32)) -> Result<Output, CommandError> {
    let req = serde_json::from_value(json!({"generation": s.generation(), "command": json}))
        .unwrap_or_else(|e| panic!("bad request: {e}"));
    s.run(req, clock(date))
}

fn ok_on(s: &mut Session, json: Value, date: (i32, u32, u32)) -> Output {
    let j = json.clone();
    cmd_on(s, json, date).unwrap_or_else(|e| panic!("{j}: {e:?}"))
}

fn ok(s: &mut Session, json: Value) -> Output {
    ok_on(s, json, (2026, 10, 29))
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
    ok(&mut s, json!({"type": "folder.open", "path": t.path()}));
    (t, s)
}

fn feed_on(s: &mut Session, date: (i32, u32, u32)) -> FeedView {
    ok_on(s, json!({"type": "journal.feed"}), date)
        .feed
        .unwrap()
}

fn feed_keys(s: &mut Session, date: (i32, u32, u32)) -> Vec<String> {
    feed_on(s, date).days.into_iter().map(|d| d.key).collect()
}

#[test]
fn feed_lists_today_then_days_with_content_newest_first() {
    let (t, mut s) = folder(&[
        ("journals/2026-10-25.md", "- b\n"),
        ("journals/2026-10-26.md", "note before any bullet\n"),
        ("journals/2026-10-27.md", "- a\n"),
        ("journals/2026-10-28.md", "- \n\t- \n"),
        ("journals/2026-11-02.md", "- future\n"),
    ]);
    let feed = feed_on(&mut s, (2026, 10, 29));
    assert_eq!(feed.today, "2026-10-29");
    let keys: Vec<&str> = feed.days.iter().map(|d| d.key.as_str()).collect();
    assert_eq!(
        keys,
        ["2026-10-29", "2026-10-27", "2026-10-26", "2026-10-25"]
    );
    assert_eq!(feed.days[0].title, "Thursday, 29 Oct 2026");
    assert!(!t.path().join("journals/2026-10-29.md").exists());
}

#[test]
fn feed_follows_the_clock() {
    let (_t, mut s) = folder(&[]);
    assert_eq!(feed_keys(&mut s, (2026, 10, 29)), ["2026-10-29"]);
    assert_eq!(feed_keys(&mut s, (2026, 10, 30)), ["2026-10-30"]);
}

#[test]
fn feed_keeps_yesterday_once_it_has_content() {
    let (_t, mut s) = folder(&[]);
    feed_keys(&mut s, (2026, 10, 29));
    ok_on(
        &mut s,
        json!({"type": "pages.get", "keys": ["2026-10-29"]}),
        (2026, 10, 29),
    );
    ok_on(
        &mut s,
        json!({"type": "block.insert", "page": "2026-10-29", "after": null, "text": "x"}),
        (2026, 10, 29),
    );
    assert_eq!(
        feed_keys(&mut s, (2026, 10, 30)),
        ["2026-10-30", "2026-10-29"]
    );
}

#[test]
fn today_is_first_even_when_a_page_has_its_name() {
    let (_t, mut s) = folder(&[("pages/2026-10-29.md", "- p\n")]);
    let feed = ok(&mut s, json!({"type": "journal.feed"})).feed.unwrap();
    let keys: Vec<&str> = feed.days.iter().map(|d| d.key.as_str()).collect();
    assert_eq!(keys, ["2026-10-29"]);
    assert_eq!(feed.days[0].title, "Thursday, 29 Oct 2026");
}

#[test]
fn pages_get_returns_known_pages_in_the_order_asked() {
    let (_t, mut s) = folder(&[
        ("journals/2026-10-25.md", "- b\n"),
        ("journals/2026-10-27.md", "- a\n"),
    ]);
    let out = ok(
        &mut s,
        json!({"type": "pages.get", "keys": ["2026-10-27", "nope", "2026-10-25"]}),
    );
    let keys: Vec<&str> = out.pages.iter().map(|p| p.key.as_str()).collect();
    assert_eq!(keys, ["2026-10-27", "2026-10-25"]);
    assert!(out.page.is_none());
    assert!(out.changed.is_empty());
}

#[test]
fn pages_get_returns_each_key_once() {
    let (_t, mut s) = folder(&[("journals/2026-10-28.md", "- a\n")]);
    let out = ok(
        &mut s,
        json!({"type": "pages.get", "keys": ["2026-10-28", "nope", "2026-10-28"]}),
    );
    let keys: Vec<&str> = out.pages.iter().map(|p| p.key.as_str()).collect();
    assert_eq!(keys, ["2026-10-28"]);
}

#[test]
fn pages_get_acknowledges_disk_changes() {
    let (t, mut s) = folder(&[("journals/2026-10-27.md", "- j\n")]);
    let first = ok(&mut s, json!({"type": "pages.get", "keys": ["2026-10-27"]}));
    let id = first.pages[0].blocks[0].id;
    put(t.path(), "journals/2026-10-27.md", "- J\n");
    ok(
        &mut s,
        json!({"type": "files.changed", "paths": ["journals/2026-10-27.md"]}),
    );
    ok(&mut s, json!({"type": "pages.get", "keys": ["2026-10-27"]}));
    let out = ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "mine"}),
    );
    assert!(out.notices.is_empty());
}

#[test]
fn journal_commands_need_a_folder() {
    let mut s = Session::new();
    for c in [
        json!({"type": "journal.feed"}),
        json!({"type": "pages.get", "keys": ["a"]}),
    ] {
        assert_eq!(
            cmd_on(&mut s, c, (2026, 10, 29)).unwrap_err().code,
            "noFolder"
        );
    }
}

#[test]
fn journal_append_adds_a_block_at_the_end_of_today() {
    let (t, mut s) = folder(&[]);
    let out = ok(&mut s, json!({"type": "journal.append", "text": "TODO"}));
    let page = out.page.unwrap();
    assert_eq!(page.key, "2026-10-29");
    let last = page.blocks.last().unwrap();
    let focus = out.focus.unwrap();
    assert_eq!(focus.id, last.id);
    assert_eq!(focus.at, 4);
    assert_eq!(
        fs::read_to_string(t.path().join("journals/2026-10-29.md")).unwrap(),
        "- TODO\n  created:: 2026-10-29 14:05:09\n"
    );
    ok(&mut s, json!({"type": "journal.append", "text": "DOING"}));
    assert_eq!(
        fs::read_to_string(t.path().join("journals/2026-10-29.md")).unwrap(),
        "- TODO\n  created:: 2026-10-29 14:05:09\n- DOING\n  created:: 2026-10-29 14:05:09\n"
    );
    // Text without a state is not a task: no created line.
    ok(&mut s, json!({"type": "journal.append", "text": "Note"}));
    assert!(
        fs::read_to_string(t.path().join("journals/2026-10-29.md"))
            .unwrap()
            .ends_with("- Note\n")
    );
}

#[test]
fn journal_append_after_a_last_line_without_newline_and_after_a_preamble() {
    let (t, mut s) = folder(&[("journals/2026-10-29.md", "- a")]);
    ok(&mut s, json!({"type": "journal.append", "text": "TODO"}));
    assert_eq!(
        fs::read_to_string(t.path().join("journals/2026-10-29.md")).unwrap(),
        "- a\n- TODO\n  created:: 2026-10-29 14:05:09\n"
    );
    let (t, mut s) = folder(&[("journals/2026-10-29.md", "tags:: x\n")]);
    ok(&mut s, json!({"type": "journal.append", "text": "TODO"}));
    assert_eq!(
        fs::read_to_string(t.path().join("journals/2026-10-29.md")).unwrap(),
        "tags:: x\n- TODO\n  created:: 2026-10-29 14:05:09\n"
    );
}
