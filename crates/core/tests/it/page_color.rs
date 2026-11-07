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

const DAY: &str = "- [[Project]]: Today [[Sam]] gave me tasks
\t- [[Hiring]]: stays with its parent
- [[2026-10-28]]: follow-up on [[Project]]
- [[Nowhere]] then #hiring
- [[Plain]] then [[Project]]
- no link at all
- `[[Project]]` in code, then [[Hiring]]
- [[Project#Goals]] heading link
- #k8s rollout
- standup notes
  with:: [[Hiring]]
";

fn topics_folder() -> (TempDir, Session) {
    folder(&[
        ("pages/Project.md", "color:: red\n- p\n"),
        ("pages/Hiring.md", "color:: blue\n- h\n"),
        ("pages/Plain.md", "- x [[Project]]\n"),
        (
            "pages/Kubernetes.md",
            "---\naliases:\n  - k8s\n---\ncolor:: teal\n- k\n",
        ),
        ("journals/2026-10-28.md", "- y\n"),
        ("journals/2026-10-29.md", DAY),
    ])
}

type Pairs = Vec<Option<(String, String)>>;

fn pairs(view: &breccia_core::session::PageView) -> Pairs {
    serde_json::to_value(view).unwrap()["blocks"]
        .as_array()
        .unwrap()
        .iter()
        .map(|b| match (b.get("topic"), b.get("color")) {
            (Some(t), Some(c)) => Some((t.as_str().unwrap().into(), c.as_str().unwrap().into())),
            (None, None) => None,
            other => panic!("topic and color travel together: {other:?}"),
        })
        .collect()
}

fn p(topic: &str, color: &str) -> Option<(String, String)> {
    Some((topic.into(), color.into()))
}

fn day(out: &Output) -> &breccia_core::session::PageView {
    out.changed
        .iter()
        .find(|v| v.key == "2026-10-29")
        .expect("2026-10-29 was re-sent")
}

#[test]
fn journal_blocks_take_the_color_of_their_first_topic_link() {
    let (_t, mut s) = topics_folder();
    let out = ok(&mut s, json!({"type": "page.get", "key": "2026-10-29"}), 0);
    assert_eq!(
        pairs(&out.page.unwrap()),
        vec![
            p("project", "red"),
            p("project", "red"),
            p("project", "red"),
            p("hiring", "blue"),
            None,
            None,
            p("hiring", "blue"),
            p("project", "red"),
            p("kubernetes", "teal"),
            p("hiring", "blue"),
        ]
    );
}

#[test]
fn other_views_carry_no_block_colors() {
    let (_t, mut s) = topics_folder();
    let out = ok(&mut s, json!({"type": "page.get", "key": "plain"}), 0);
    assert!(pairs(&out.page.unwrap()).iter().all(Option::is_none));
    let out = ok(&mut s, json!({"type": "page.refs", "key": "project"}), 0);
    let refs = serde_json::to_value(out.refs.unwrap()).unwrap();
    let text = refs.to_string();
    assert!(!text.contains("\"topic\""), "{text}");
    assert!(!text.contains("\"color\""), "{text}");
}

#[test]
fn typing_a_link_recolors_the_block() {
    let (_t, mut s) = topics_folder();
    let page = ok(&mut s, json!({"type": "page.get", "key": "2026-10-29"}), 0)
        .page
        .unwrap();
    let id = page.blocks[5].id;
    let out = ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "now [[Hiring]]"}),
        100,
    );
    assert_eq!(pairs(&out.page.unwrap())[5], p("hiring", "blue"));
}

#[test]
fn a_color_change_updates_the_journal_days_that_link_to_the_page() {
    let (_t, mut s) = topics_folder();
    let out = pick(&mut s, "hiring", json!("green"));
    let pr = pairs(day(&out));
    for i in [3, 6, 9] {
        assert_eq!(pr[i], p("hiring", "green"), "block {}", i + 1);
    }
    assert!(out.changed.iter().all(|v| v.key != "2026-10-28"));
}

#[test]
fn an_outside_color_edit_updates_the_journal_days() {
    let (t, mut s) = topics_folder();
    put(t.path(), "pages/Project.md", "- p\n");
    let out = ok(
        &mut s,
        json!({"type": "files.changed", "paths": ["pages/Project.md"]}),
        0,
    );
    let pr = pairs(day(&out));
    for i in [0, 1, 2, 7] {
        assert_eq!(pr[i], None, "block {}", i + 1);
    }
    assert_eq!(pr[3], p("hiring", "blue"));
}

#[test]
fn a_new_page_stops_the_walk_at_its_link() {
    let (t, mut s) = topics_folder();
    put(t.path(), "pages/Nowhere.md", "- now here\n");
    let out = ok(
        &mut s,
        json!({"type": "files.changed", "paths": ["pages/Nowhere.md"]}),
        0,
    );
    assert_eq!(pairs(day(&out))[3], None);
}

#[test]
fn undoing_a_pick_updates_the_journal_days() {
    let (_t, mut s) = topics_folder();
    pick(&mut s, "hiring", json!("green"));
    let out = undo(&mut s, "hiring");
    assert_eq!(pairs(day(&out))[3], p("hiring", "blue"));
    let out = ok(&mut s, json!({"type": "history.redo", "page": "hiring"}), 0);
    assert_eq!(pairs(day(&out))[3], p("hiring", "green"));
}

#[test]
fn a_rename_keeps_the_colors() {
    let (t, mut s) = topics_folder();
    let out = ok(
        &mut s,
        json!({"type": "page.rename", "key": "project", "name": "Projekt"}),
        0,
    );
    assert_eq!(pairs(day(&out))[0], p("projekt", "red"));
    assert!(read(&t, "pages/Projekt.md").starts_with("color:: red\n"));
}

#[test]
fn deleting_a_page_removes_the_wash_of_a_heading_link() {
    let (_t, mut s) = folder(&[
        ("pages/Project.md", "color:: red\n- p\n"),
        ("journals/2026-10-29.md", "- [[Project#Goals]] only\n"),
    ]);
    let out = ok(&mut s, json!({"type": "page.get", "key": "2026-10-29"}), 0);
    assert_eq!(pairs(&out.page.unwrap()), vec![p("project", "red")]);
    let out = ok(&mut s, json!({"type": "page.delete", "key": "project"}), 0);
    assert_eq!(pairs(day(&out)), vec![None]);
}

#[test]
fn opening_a_folder_sends_no_stale_journals() {
    let (_t, mut s) = topics_folder();
    let other = tempfile::tempdir().unwrap();
    put(other.path(), "pages/Other.md", "color:: red\n- o\n");
    put(other.path(), "journals/2026-10-29.md", "- [[Other]]\n");
    let out = ok(
        &mut s,
        json!({"type": "folder.open", "path": other.path()}),
        0,
    );
    assert!(out.changed.is_empty());
}
