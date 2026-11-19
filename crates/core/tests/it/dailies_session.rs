use crate::support::{self, DAY, clock_on};
use breccia_core::session::Notice;
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
    let l2 = ok(
        &mut s,
        json!({"type": "dailies.check", "id": l[0].0, "shown": "Check emails"}),
    );
    assert_eq!(
        read(&t),
        "- Check emails\n  checked:: 2026-10-29 14:05\n- Water\n"
    );
    assert_eq!(l2[0].2.as_deref(), Some("2026-10-29 14:05"));
    assert_eq!(l2[1].2, None);
    let l3 = ok(
        &mut s,
        json!({"type": "dailies.uncheck", "id": l[0].0, "shown": "Check emails"}),
    );
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
        json!({"type": "dailies.edit", "id": b, "text": "bee", "shown": "b"}),
    );
    assert_eq!(read(&t), "- a\n- bee\n- c\n");
    ok(
        &mut s,
        json!({"type": "dailies.move", "id": c, "before": a, "shown": "c"}),
    );
    assert_eq!(read(&t), "- c\n- a\n- bee\n");
    // `before: None` puts the daily last.
    let l = ok(
        &mut s,
        json!({"type": "dailies.move", "id": c, "before": null, "shown": "c"}),
    );
    assert_eq!(read(&t), "- a\n- bee\n- c\n");
    assert_eq!(
        l.iter().map(|d| d.1.as_str()).collect::<Vec<_>>(),
        ["a", "bee", "c"]
    );
    let l = ok(
        &mut s,
        json!({"type": "dailies.delete", "id": b, "shown": "bee", "nested": false}),
    );
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
    ok(
        &mut s,
        json!({"type": "dailies.delete", "id": v[0].id, "shown": "a", "nested": true}),
    );
    assert_eq!(read(&t), "- b\n");
}

#[test]
fn delete_is_refused_when_lines_were_added_under_the_daily() {
    let (t, mut s) = folder(&[(
        FILE, "- a
- b
",
    )]);
    let l = list(&mut s);
    let a = l[0].0;
    let outside = "- a
  more
- b
";
    fs::write(t.path().join(FILE), outside).unwrap();
    let cmd =
        |nested: bool| json!({"type": "dailies.delete", "id": a, "shown": "a", "nested": nested});
    assert_eq!(err_code(&mut s, cmd(false)), "unknownDaily");
    assert_eq!(read(&t), outside);
    ok(&mut s, cmd(true));
    assert_eq!(
        read(&t),
        "- b
"
    );
}

#[test]
fn delete_with_nested_as_shown_deletes() {
    let (t, mut s) = folder(&[(
        FILE,
        "- a
	- c
- b
",
    )]);
    let l = list(&mut s);
    ok(
        &mut s,
        json!({"type": "dailies.delete", "id": l[0].0, "shown": "a", "nested": true}),
    );
    assert_eq!(
        read(&t),
        "- b
"
    );
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
            json!({"type": "dailies.edit", "id": l[0].0, "text": "", "shown": "a"})
        ),
        "invalidDaily"
    );
    assert_eq!(
        err_code(
            &mut s,
            json!({"type": "dailies.check", "id": 9999, "shown": "a"})
        ),
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
    let l2 = ok(
        &mut s,
        json!({"type": "dailies.check", "id": l[1].0, "shown": "b"}),
    );
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
        json!({"type": "dailies.check", "id": l[1].0, "shown": "b"}),
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
        err_code(
            &mut s,
            json!({"type": "dailies.check", "id": l[1].0, "shown": "b"})
        ),
        "unknownDaily"
    );
    assert_eq!(read(&t), "- a\n- other\n");
}

/// The watcher has taken the outside text (the replaced daily keeps its id) while a delete confirm or an edit field
/// was open: the command carries the text the window showed and is refused.
#[test]
fn a_daily_replaced_on_disk_after_the_watcher_ran_is_refused() {
    let (t, mut s) = folder(&[(FILE, "- a\n- b\n")]);
    let l = list(&mut s);
    let b = l[1].0;
    let outside = "- a\n- other\n  note:: x\n";
    fs::write(t.path().join(FILE), outside).unwrap();
    let out = support::ok(
        &mut s,
        json!({"type": "files.changed", "paths": [FILE]}),
        clock(),
    );
    let now = out.dailies.expect("the watcher run answers the list");
    assert_eq!((now[1].id, now[1].text.as_str()), (b, "other"));
    for cmd in [
        json!({"type": "dailies.delete", "id": b, "shown": "b", "nested": false}),
        json!({"type": "dailies.edit", "id": b, "text": "bee", "shown": "b"}),
        json!({"type": "dailies.check", "id": b, "shown": "b"}),
        json!({"type": "dailies.uncheck", "id": b, "shown": "b"}),
        json!({"type": "dailies.move", "id": b, "before": l[0].0, "shown": "b"}),
    ] {
        assert_eq!(err_code(&mut s, cmd.clone()), "unknownDaily", "{cmd}");
        assert_eq!(read(&t), outside, "{cmd}");
    }
    // The text the window shows now is acted on.
    ok(
        &mut s,
        json!({"type": "dailies.delete", "id": b, "shown": "other", "nested": true}),
    );
    assert_eq!(read(&t), "- a\n");
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
    ok(
        &mut s,
        json!({"type": "dailies.check", "id": c, "shown": "c"}),
    );
    let lf = src.replace("\r\n", "\n");
    let checked = lf.replace("- c\n", "- c\n  checked:: 2026-10-29 14:05\n");
    assert_eq!(bytes(&t), checked);
    ok(
        &mut s,
        json!({"type": "dailies.uncheck", "id": c, "shown": "c"}),
    );
    assert_eq!(bytes(&t), lf);
    ok(
        &mut s,
        json!({"type": "dailies.move", "id": c, "before": l[0].0, "shown": "c"}),
    );
    assert_eq!(
        bytes(&t),
        "\u{feff}# My dailies\n- c\n- a\n  unknown:: 1\n\t- nested\n- b\n  checked:: soon\n"
    );
    ok(
        &mut s,
        json!({"type": "dailies.edit", "id": c, "text": "see", "shown": "c"}),
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
            .any(|n| matches!(n, Notice::LoadWarning { message }
            if message.contains("breccia/dailies.md") && message.contains("UTF-8"))),
        "{:?}",
        out.notices
    );
    let e = support::run(&mut s, json!({"type": "dailies.add", "text": "x"}), clock()).unwrap_err();
    assert_eq!(e.code, "dailiesUnreadable");
    assert_eq!(fs::read(t.path().join(FILE)).unwrap(), bad);
}

#[test]
fn load_dailies_reports_an_io_error() {
    let t = tempfile::tempdir().unwrap();
    // A folder in place of the file cannot be read.
    fs::create_dir_all(t.path().join(FILE)).unwrap();
    let mut s = Session::new();
    let out = support::ok(
        &mut s,
        json!({"type": "folder.open", "path": t.path()}),
        clock(),
    );
    assert!(
        out.notices
            .iter()
            .any(|n| matches!(n, Notice::LoadWarning { message }
            if message.contains("breccia/dailies.md") && !message.contains("UTF-8"))),
        "{:?}",
        out.notices
    );
    let e = support::run(&mut s, json!({"type": "dailies.add", "text": "x"}), clock()).unwrap_err();
    assert_eq!(e.code, "dailiesUnreadable");
    assert!(t.path().join(FILE).is_dir());
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
