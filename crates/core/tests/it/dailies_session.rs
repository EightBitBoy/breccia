use crate::support::{self, DAY, clock_on};
use breccia_core::{BlockId, Clock, Session};
use serde_json::{Value, json};
use std::fs;
use tempfile::TempDir;

const FILE: &str = "breccia/dailies.md";

fn clock() -> Clock {
    clock_on(DAY, 0)
}

fn ok(s: &mut Session, cmd: Value) -> Vec<(BlockId, String, Option<String>)> {
    let out = support::ok(s, cmd, clock());
    out.dailies
        .expect("the answer holds dailies")
        .into_iter()
        .map(|d| (d.id, d.text, d.checked))
        .collect()
}

fn err_code(s: &mut Session, cmd: Value) -> String {
    support::run(s, cmd, clock()).unwrap_err().code
}

fn folder(files: &[(&str, &str)]) -> (TempDir, Session) {
    support::folder_at(files, clock())
}

fn read(t: &TempDir) -> String {
    support::read(t.path(), FILE)
}

fn list(s: &mut Session) -> Vec<(BlockId, String, Option<String>)> {
    ok(s, json!({"type": "dailies.list"}))
}

fn add(s: &mut Session, text: &str) -> Vec<(BlockId, String, Option<String>)> {
    ok(s, json!({"type": "dailies.add", "text": text}))
}

#[test]
fn list_of_a_folder_without_the_file_is_empty() {
    let (t, mut s) = folder(&[("pages/A.md", "- a\n")]);
    assert!(list(&mut s).is_empty());
    assert!(!t.path().join("breccia").join("dailies.md").exists());
}

#[test]
fn add_creates_the_folder_and_file() {
    let (t, mut s) = folder(&[("pages/A.md", "- a\n")]);
    assert!(!t.path().join("breccia").exists());
    let l = add(&mut s, "Check emails");
    assert_eq!(l.len(), 1);
    assert_eq!(l[0].1, "Check emails");
    assert_eq!(l[0].2, None);
    assert_eq!(read(&t), "- Check emails\n");
    add(&mut s, "Water");
    assert_eq!(read(&t), "- Check emails\n- Water\n");
}

#[test]
fn check_and_uncheck_write_the_line() {
    let (t, mut s) = folder(&[(FILE, "- Check emails\n- Water\n")]);
    let l = list(&mut s);
    let before = read(&t);
    let l2 = ok(&mut s, json!({"type": "dailies.check", "id": l[0].0}));
    assert_eq!(
        read(&t),
        "- Check emails\n  checked:: 2026-10-29 14:05\n- Water\n"
    );
    assert_eq!(l2[0].2.as_deref(), Some("2026-10-29 14:05"));
    assert_eq!(l2[1].2, None);
    let l3 = ok(&mut s, json!({"type": "dailies.uncheck", "id": l[0].0}));
    assert_eq!(read(&t), before);
    assert_eq!(l3[0].2, None);
}

#[test]
fn edit_delete_move_write_the_file() {
    let (t, mut s) = folder(&[(FILE, "- a\n- b\n- c\n")]);
    let l = list(&mut s);
    let (a, b, c) = (l[0].0, l[1].0, l[2].0);
    ok(
        &mut s,
        json!({"type": "dailies.edit", "id": b, "text": "bee"}),
    );
    assert_eq!(read(&t), "- a\n- bee\n- c\n");
    ok(
        &mut s,
        json!({"type": "dailies.move", "id": c, "before": a}),
    );
    assert_eq!(read(&t), "- c\n- a\n- bee\n");
    // `before: None` puts the daily last.
    let l = ok(
        &mut s,
        json!({"type": "dailies.move", "id": c, "before": null}),
    );
    assert_eq!(read(&t), "- a\n- bee\n- c\n");
    assert_eq!(
        l.iter().map(|d| d.1.as_str()).collect::<Vec<_>>(),
        ["a", "bee", "c"]
    );
    let l = ok(&mut s, json!({"type": "dailies.delete", "id": b}));
    assert_eq!(read(&t), "- a\n- c\n");
    assert_eq!(l.len(), 2);
}

#[test]
fn nested_lines_are_flagged_and_deleted_with_the_daily() {
    let (t, mut s) = folder(&[(FILE, "- a\n\t- under\n- b\n")]);
    let out = support::ok(&mut s, json!({"type": "dailies.list"}), clock());
    let v = out.dailies.unwrap();
    assert_eq!(v.len(), 2);
    assert!(v[0].nested);
    assert!(!v[1].nested);
    ok(&mut s, json!({"type": "dailies.delete", "id": v[0].id}));
    assert_eq!(read(&t), "- b\n");
}

#[test]
fn invalid_text_and_unknown_ids_are_refused() {
    let (t, mut s) = folder(&[(FILE, "- a\n\t- under\n")]);
    let l = list(&mut s);
    assert_eq!(
        err_code(&mut s, json!({"type": "dailies.add", "text": "  "})),
        "invalidDaily"
    );
    assert_eq!(
        err_code(&mut s, json!({"type": "dailies.add", "text": "x\ny"})),
        "invalidDaily"
    );
    assert_eq!(
        err_code(
            &mut s,
            json!({"type": "dailies.edit", "id": l[0].0, "text": ""})
        ),
        "invalidDaily"
    );
    assert_eq!(
        err_code(&mut s, json!({"type": "dailies.check", "id": 9999})),
        "unknownDaily"
    );
    // A nested block is no daily.
    assert_eq!(read(&t), "- a\n\t- under\n");
}

#[test]
fn a_change_on_disk_is_read_before_writing() {
    let (t, mut s) = folder(&[(FILE, "- a\n- b\n")]);
    let l = list(&mut s);
    fs::write(t.path().join(FILE), "- a\n  note:: x\n- b\n- Outside\n").unwrap();
    let l2 = ok(&mut s, json!({"type": "dailies.check", "id": l[1].0}));
    assert_eq!(
        read(&t),
        "- a\n  note:: x\n- b\n  checked:: 2026-10-29 14:05\n- Outside\n"
    );
    // Daily b kept its id; the new one has its own.
    assert_eq!(l2[1].0, l[1].0);
    assert_eq!(l2.len(), 3);
}

#[test]
fn a_daily_gone_on_disk_is_refused() {
    let (t, mut s) = folder(&[(FILE, "- a\n- b\n")]);
    let l = list(&mut s);
    fs::write(t.path().join(FILE), "- a\n").unwrap();
    let e = support::run(
        &mut s,
        json!({"type": "dailies.check", "id": l[1].0}),
        clock(),
    )
    .unwrap_err();
    assert_eq!(e.code, "unknownDaily");
    assert_eq!(
        e.message,
        "This daily changed in another program; the list now shows the file as it is."
    );
    assert_eq!(read(&t), "- a\n");
    let l2 = list(&mut s);
    assert_eq!(l2.len(), 1);
    assert_eq!(l2[0].1, "a");
}

#[test]
fn a_daily_renamed_on_disk_is_refused_not_ticked_wrong() {
    let (t, mut s) = folder(&[(FILE, "- a\n- b\n")]);
    let l = list(&mut s);
    fs::write(t.path().join(FILE), "- a\n- other\n").unwrap();
    assert_eq!(
        err_code(&mut s, json!({"type": "dailies.check", "id": l[1].0})),
        "unknownDaily"
    );
    assert_eq!(read(&t), "- a\n- other\n");
}

#[test]
fn a_file_deleted_on_disk_gives_an_empty_list() {
    let (t, mut s) = folder(&[(FILE, "- a\n")]);
    assert_eq!(list(&mut s).len(), 1);
    fs::remove_file(t.path().join(FILE)).unwrap();
    assert!(list(&mut s).is_empty());
    add(&mut s, "z");
    assert_eq!(read(&t), "- z\n");
}

#[test]
fn a_hand_written_file_survives_every_command() {
    let src = "\u{feff}# My dailies\r\n- a\r\n  unknown:: 1\r\n\t- nested\r\n- b\r\n  checked:: soon\r\n- c\r\n";
    let (t, mut s) = folder(&[(FILE, src)]);
    let l = list(&mut s);
    assert_eq!(l.len(), 3);
    let bytes = |t: &TempDir| fs::read_to_string(t.path().join(FILE)).unwrap();
    // Nothing is written by a list.
    assert_eq!(bytes(&t), src);
    let c = l[2].0;
    ok(&mut s, json!({"type": "dailies.check", "id": c}));
    let lf = src.replace("\r\n", "\n");
    let checked = lf.replace("- c\n", "- c\n  checked:: 2026-10-29 14:05\n");
    assert_eq!(bytes(&t), checked);
    ok(&mut s, json!({"type": "dailies.uncheck", "id": c}));
    assert_eq!(bytes(&t), lf);
    ok(
        &mut s,
        json!({"type": "dailies.move", "id": c, "before": l[0].0}),
    );
    assert_eq!(
        bytes(&t),
        "\u{feff}# My dailies\n- c\n- a\n  unknown:: 1\n\t- nested\n- b\n  checked:: soon\n"
    );
    ok(
        &mut s,
        json!({"type": "dailies.edit", "id": c, "text": "see"}),
    );
    assert_eq!(
        bytes(&t),
        "\u{feff}# My dailies\n- see\n- a\n  unknown:: 1\n\t- nested\n- b\n  checked:: soon\n"
    );
}

#[test]
fn an_unreadable_dailies_file_warns_and_refuses() {
    let t = tempfile::tempdir().unwrap();
    let bad: &[u8] = &[0x2d, 0x20, 0xff, 0xfe, 0x0a];
    fs::create_dir_all(t.path().join("breccia")).unwrap();
    fs::write(t.path().join(FILE), bad).unwrap();
    let mut s = Session::new();
    let out = support::ok(
        &mut s,
        json!({"type": "folder.open", "path": t.path()}),
        clock(),
    );
    assert!(
        out.notices
            .iter()
            .any(|n| format!("{n:?}").contains("breccia/dailies.md")),
        "{:?}",
        out.notices
    );
    let e = support::run(&mut s, json!({"type": "dailies.add", "text": "x"}), clock()).unwrap_err();
    assert_eq!(e.code, "dailiesUnreadable");
    assert_eq!(fs::read(t.path().join(FILE)).unwrap(), bad);
}

#[test]
fn dailies_are_not_pages() {
    let (_t, mut s) = folder(&[("pages/A.md", "- a\n"), (FILE, "- zebrafinch [[Linked]]\n")]);
    list(&mut s);
    let q = support::ok(
        &mut s,
        json!({"type": "search.query", "text": "zebrafinch"}),
        clock(),
    );
    assert!(q.search.unwrap().groups.is_empty());
    let names = support::ok(&mut s, json!({"type": "pages.list"}), clock())
        .names
        .unwrap();
    assert!(
        names
            .iter()
            .all(|n| n.key != "linked" && !n.name.contains("zebra"))
    );
    let tree = support::ok(&mut s, json!({"type": "folder.tree"}), clock());
    assert!(!format!("{:?}", tree.tree).contains("zebra"));
    assert!(
        !format!("{:?}", tree.tree)
            .to_lowercase()
            .contains("dailies")
    );
}

#[test]
fn a_daily_with_hidden_lines_is_flagged() {
    let src = "- a\n  note:: x\n- b\n  checked:: 2026-10-29 09:00\n- c\n  more text\n- d\n  checked:: 2026-10-29 09:00\n  other:: 1\n- e\n";
    let (_t, mut s) = folder(&[(FILE, src)]);
    let out = support::ok(&mut s, json!({"type": "dailies.list"}), clock());
    let flags: Vec<(String, bool)> = out
        .dailies
        .unwrap()
        .into_iter()
        .map(|d| (d.text, d.nested))
        .collect();
    assert_eq!(
        flags,
        [
            ("a", true),
            ("b", false),
            ("c", true),
            ("d", true),
            ("e", false)
        ]
        .map(|(t, n)| (t.to_string(), n))
    );
}
