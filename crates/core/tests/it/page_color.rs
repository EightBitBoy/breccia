use crate::support::{self, clock_on, folder_at, put, run};
use breccia_core::color::PageColor;
use breccia_core::{Clock, CommandError, Output, Session};
use serde_json::{Value, json};
use tempfile::TempDir;

fn clock(ms: u64) -> Clock {
    clock_on((2026, 10, 29), ms)
}

fn cmd(s: &mut Session, json: Value, ms: u64) -> Result<Output, CommandError> {
    run(s, json, clock(ms))
}

fn ok(s: &mut Session, json: Value, ms: u64) -> Output {
    support::ok(s, json, clock(ms))
}

fn folder(files: &[(&str, &str)]) -> (TempDir, Session) {
    folder_at(files, clock(0))
}

fn read(t: &TempDir, rel: &str) -> String {
    support::read(t.path(), rel)
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
    assert_eq!(out.page.unwrap().color, Some(PageColor::Named("red")));
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
    assert_eq!(out.page.unwrap().color, Some(PageColor::Named("red")));
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
    assert_eq!(out.page.unwrap().color, Some(PageColor::Named("red")));
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

const DAY: &str = "- [[Project]]: Today [[Sam]] gave me tasks\n\t- [[Hiring]]: stays with its parent\n- [[2026-10-28]]: follow-up on [[Project]]\n- [[Nowhere]] then #hiring\n- [[Plain]] then [[Project]]\n- no link at all\n- `[[Project]]` in code, then [[Hiring]]\n- [[Project#Goals]] heading link\n- #k8s rollout\n- standup notes\n  with:: [[Hiring]]\n";

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

type Entry = (String, String, String, Option<String>);

fn targets(view: &breccia_core::session::PageView) -> Vec<Entry> {
    let v = serde_json::to_value(view).unwrap();
    v["targets"]
        .as_array()
        .expect("a journal view lists its targets")
        .iter()
        .map(|t| {
            (
                t["raw"].as_str().unwrap().into(),
                t["kind"].as_str().unwrap().into(),
                t["key"].as_str().unwrap().into(),
                t.get("color").map(|c| c.as_str().unwrap().into()),
            )
        })
        .collect()
}

fn entry(raw: &str, kind: &str, key: &str, color: Option<&str>) -> Entry {
    (raw.into(), kind.into(), key.into(), color.map(Into::into))
}

#[test]
fn journal_views_list_their_colorable_targets() {
    let text = format!("{DAY}- #garden and [[Missing]], #2026-11-01\n");
    let (_t, mut s) = folder(&[
        ("pages/Project.md", "color:: red\n- p\n"),
        ("pages/Hiring.md", "color:: blue\n- h\n"),
        ("pages/Plain.md", "- x [[Project]]\n"),
        (
            "pages/Kubernetes.md",
            "---\naliases:\n  - k8s\n---\ncolor:: teal\n- k\n",
        ),
        ("pages/Notes.md", "- x #garden\n"),
        ("journals/2026-10-28.md", "- y\n"),
        ("journals/2026-10-29.md", &text),
    ]);
    let out = ok(&mut s, json!({"type": "page.get", "key": "2026-10-29"}), 0);
    let view = out.page.unwrap();
    assert_eq!(
        targets(&view),
        vec![
            entry("project", "link", "project", Some("red")),
            entry("hiring", "link", "hiring", Some("blue")),
            entry("hiring", "tag", "hiring", Some("blue")),
            entry("plain", "link", "plain", None),
            entry("project#goals", "link", "project", Some("red")),
            entry("k8s", "tag", "kubernetes", Some("teal")),
            entry("garden", "tag", "garden", None),
        ]
    );
    let json = serde_json::to_value(&view).unwrap();
    let k8s = &json["targets"][5];
    assert_eq!(k8s["name"], "Kubernetes");
    let out = ok(&mut s, json!({"type": "page.get", "key": "plain"}), 0);
    let plain = serde_json::to_value(out.page.unwrap()).unwrap();
    assert!(plain.get("targets").is_none(), "{plain}");
    let out = pick(&mut s, "hiring", json!("green"));
    let hiring: Vec<Entry> = targets(day(&out))
        .into_iter()
        .filter(|e| e.2 == "hiring")
        .collect();
    assert_eq!(
        hiring,
        vec![
            entry("hiring", "link", "hiring", Some("green")),
            entry("hiring", "tag", "hiring", Some("green")),
        ]
    );
}

#[test]
fn adding_and_removing_an_alias_updates_the_journal_days() {
    let (t, mut s) = folder(&[
        ("pages/Hiring.md", "color:: blue\n- h\n"),
        ("journals/2026-10-29.md", "- meet [[Recruiting]]\n"),
    ]);
    let out = ok(&mut s, json!({"type": "page.get", "key": "2026-10-29"}), 0);
    assert_eq!(pairs(&out.page.unwrap()), vec![None]);
    put(
        t.path(),
        "pages/Hiring.md",
        "---\naliases:\n  - Recruiting\n---\ncolor:: blue\n- h\n",
    );
    let out = ok(
        &mut s,
        json!({"type": "files.changed", "paths": ["pages/Hiring.md"]}),
        0,
    );
    assert_eq!(pairs(day(&out)), vec![p("hiring", "blue")]);
    put(t.path(), "pages/Hiring.md", "color:: blue\n- h\n");
    let out = ok(
        &mut s,
        json!({"type": "files.changed", "paths": ["pages/Hiring.md"]}),
        0,
    );
    assert_eq!(pairs(day(&out)), vec![None]);
}

#[test]
fn set_color_with_a_hue() {
    let (t, mut s) = folder(&[("pages/Garden.md", "- a\n\t- b\n")]);
    let out = pick(&mut s, "garden", json!("hue 212"));
    assert_eq!(read(&t, "pages/Garden.md"), "color:: hue 212\n- a\n\t- b\n");
    let view = serde_json::to_value(out.page.unwrap()).unwrap();
    assert_eq!(view["color"], "hue 212");
    pick(&mut s, "garden", json!("HUE 012"));
    assert!(read(&t, "pages/Garden.md").starts_with("color:: hue 12\n"));
    pick(&mut s, "garden", json!("red"));
    assert!(read(&t, "pages/Garden.md").starts_with("color:: red\n"));
    let before = read(&t, "pages/Garden.md");
    for bad in ["hue 360", "hue x"] {
        let e = cmd(
            &mut s,
            json!({"type": "page.setColor", "key": "garden", "color": bad}),
            0,
        )
        .unwrap_err();
        assert_eq!(e.code, "unknownColor", "{bad}");
        assert_eq!(read(&t, "pages/Garden.md"), before);
    }
}

#[test]
fn a_pick_of_the_saved_hue_records_no_step() {
    let (t, mut s) = folder(&[("pages/Garden.md", "- a\n\t- b\n")]);
    pick(&mut s, "garden", json!("hue 40"));
    pick(&mut s, "garden", json!("hue 40"));
    undo(&mut s, "garden");
    assert_eq!(read(&t, "pages/Garden.md"), "- a\n\t- b\n");
}

#[test]
fn journal_blocks_carry_a_hue() {
    let (_t, mut s) = topics_folder();
    let out = pick(&mut s, "hiring", json!("hue 300"));
    let pr = pairs(day(&out));
    for i in [3, 6, 9] {
        assert_eq!(pr[i], p("hiring", "hue 300"), "block {}", i + 1);
    }
    let out = pick(&mut s, "hiring", json!("hue 301"));
    let pr = pairs(day(&out));
    for i in [3, 6, 9] {
        assert_eq!(pr[i], p("hiring", "hue 301"), "block {}", i + 1);
    }
    let v = serde_json::to_value(day(&out)).unwrap();
    let t = v["targets"]
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["key"] == "hiring")
        .unwrap();
    assert_eq!(t["color"], "hue 301");
}

#[test]
fn set_color_with_a_vividness() {
    let (t, mut s) = folder(&[("pages/Garden.md", "- a\n\t- b\n")]);
    let out = pick(&mut s, "garden", json!("hue 212 vivid 150"));
    assert_eq!(
        read(&t, "pages/Garden.md"),
        "color:: hue 212 vivid 150\n- a\n\t- b\n"
    );
    let view = serde_json::to_value(out.page.unwrap()).unwrap();
    assert_eq!(view["color"], "hue 212 vivid 150");
    pick(&mut s, "garden", Value::Null);
    pick(&mut s, "garden", json!("HUE 212 VIVID 0150"));
    assert_eq!(
        read(&t, "pages/Garden.md"),
        "color:: hue 212 vivid 150\n- a\n\t- b\n"
    );
    pick(&mut s, "garden", json!("hue 212 vivid 100"));
    assert_eq!(read(&t, "pages/Garden.md"), "color:: hue 212\n- a\n\t- b\n");
    let before = read(&t, "pages/Garden.md");
    let e = cmd(
        &mut s,
        json!({"type": "page.setColor", "key": "garden", "color": "hue 212 vivid 300"}),
        0,
    )
    .unwrap_err();
    assert_eq!(e.code, "unknownColor");
    assert_eq!(read(&t, "pages/Garden.md"), before);
}

#[test]
fn a_pick_of_the_saved_vividness_records_no_step() {
    let (t, mut s) = folder(&[("pages/Garden.md", "- a\n\t- b\n")]);
    pick(&mut s, "garden", json!("hue 40 vivid 60"));
    pick(&mut s, "garden", json!("hue 40 vivid 60"));
    pick(&mut s, "garden", json!("hue 40 vivid 65"));
    undo(&mut s, "garden");
    assert_eq!(
        read(&t, "pages/Garden.md"),
        "color:: hue 40 vivid 60\n- a\n\t- b\n"
    );
    undo(&mut s, "garden");
    assert_eq!(read(&t, "pages/Garden.md"), "- a\n\t- b\n");
}

#[test]
fn journal_blocks_carry_a_vividness() {
    let (_t, mut s) = topics_folder();
    let out = pick(&mut s, "hiring", json!("hue 300 vivid 120"));
    let pr = pairs(day(&out));
    for i in [3, 6, 9] {
        assert_eq!(pr[i], p("hiring", "hue 300 vivid 120"), "block {}", i + 1);
    }
}
