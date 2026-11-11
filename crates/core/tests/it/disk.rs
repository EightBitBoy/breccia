//! Changes made on disk by other programs: `files.changed`, conflict marks
//! and `session.dirty`.

use crate::support::{self, DAY, clock_on, folder_at, put, run};
use breccia_core::session::{Notice, TreeNode};
use breccia_core::{BlockId, Clock, CommandError, Output, Session};
use serde_json::{Value, json};
use std::fs;
use std::sync::atomic::{AtomicU64, Ordering};
use tempfile::TempDir;

/// Every command is stamped this far after the one before it.
static NOW: AtomicU64 = AtomicU64::new(0);

const CHANGED: &str = "This block changed on disk while you were editing it.";
const DELETED: &str =
    "This block was deleted on disk while you were editing it; your text was kept as a new block.";

fn clock(ms: u64) -> Clock {
    clock_on(DAY, ms)
}

/// Runs a command. Each call is far enough from the last in time that
/// typing never coalesces into one undo step.
fn cmd(s: &mut Session, json: Value) -> Result<Output, CommandError> {
    run(s, json, clock(NOW.fetch_add(10_000, Ordering::Relaxed)))
}

fn ok(s: &mut Session, json: Value) -> Output {
    support::ok(s, json, clock(NOW.fetch_add(10_000, Ordering::Relaxed)))
}

fn folder(files: &[(&str, &str)]) -> (TempDir, Session) {
    folder_at(files, clock(NOW.fetch_add(10_000, Ordering::Relaxed)))
}

fn read(t: &TempDir, rel: &str) -> String {
    support::read(t.path(), rel)
}

/// Runs `files.changed` for paths relative to the root.
fn changed(s: &mut Session, paths: &[&str]) -> Output {
    ok(s, json!({"type": "files.changed", "paths": paths}))
}

fn set_text(s: &mut Session, id: BlockId, text: &str) -> Output {
    ok(s, json!({"type": "block.setText", "id": id, "text": text}))
}

fn page(s: &mut Session, key: &str) -> Output {
    ok(s, json!({"type": "page.get", "key": key}))
}

/// Block ids of a page, in document order. Viewing the page acknowledges
/// changes on disk, so call this before them.
fn ids(s: &mut Session, key: &str) -> Vec<BlockId> {
    page(s, key)
        .page
        .unwrap()
        .blocks
        .iter()
        .map(|b| b.id)
        .collect()
}

fn texts(out: &Output) -> Vec<String> {
    let p = out.page.as_ref().expect("page");
    p.blocks.iter().map(|b| b.text.clone()).collect()
}

fn changed_keys(out: &Output) -> Vec<String> {
    out.changed.iter().map(|p| p.key.clone()).collect()
}

fn reason(n: &Notice) -> Option<(String, String)> {
    match n {
        Notice::SaveFailed { page, reason, .. } => Some((
            page.clone(),
            serde_json::to_value(reason)
                .unwrap()
                .as_str()
                .unwrap()
                .into(),
        )),
        _ => None,
    }
}

/// The names in the page tree, folders and pages, depth first.
fn tree_names(out: &Output) -> Vec<String> {
    fn walk(nodes: &[TreeNode], out: &mut Vec<String>) {
        for n in nodes {
            match n {
                TreeNode::Folder { path, children, .. } => {
                    out.push(format!("{path}/"));
                    walk(children, out);
                }
                TreeNode::Page { key, .. } => out.push(key.clone()),
            }
        }
    }
    let mut v = Vec::new();
    walk(&out.tree.as_ref().expect("tree").pages, &mut v);
    v
}

fn dirty(s: &mut Session) -> Value {
    let out = ok(s, json!({"type": "session.dirty"}));
    serde_json::to_value(&out).unwrap()["dirty"].clone()
}

#[test]
fn own_write_is_ignored() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let a = ids(&mut s, "p")[0];
    let out = set_text(&mut s, a, "b");
    assert!(out.notices.is_empty());
    assert_eq!(read(&t, "pages/P.md"), "- b\n");

    let out = changed(&mut s, &["pages/P.md"]);
    assert!(out.changed.is_empty());
    assert!(out.notices.is_empty());
    assert!(out.removed.is_empty());
    assert!(out.tree.is_none());

    let out = ok(&mut s, json!({"type": "history.undo", "page": "p"}));
    assert_eq!(texts(&out), ["a"]);
    assert_eq!(read(&t, "pages/P.md"), "- a\n");
}

#[test]
fn own_lf_write_of_a_crlf_file_is_ignored() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\r\n- b\r\n")]);
    let a = ids(&mut s, "p")[0];
    let out = set_text(&mut s, a, "x");
    assert!(out.notices.is_empty());
    assert_eq!(read(&t, "pages/P.md"), "- x\n- b\n");

    let out = changed(&mut s, &["pages/P.md"]);
    assert!(out.changed.is_empty());
    assert!(out.removed.is_empty());
    assert!(out.notices.is_empty());
}

#[test]
fn identical_external_write_after_own_write_is_harmless() {
    // Another program writes exactly what Breccia wrote: nothing to tell apart,
    // nothing lost.
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let a = ids(&mut s, "p")[0];
    set_text(&mut s, a, "b");
    put(t.path(), "pages/P.md", "- b\n");
    let out = changed(&mut s, &["pages/P.md", "pages/P.md"]);
    assert!(out.changed.is_empty() && out.notices.is_empty());
    // The next edit saves normally.
    set_text(&mut s, a, "c");
    assert_eq!(read(&t, "pages/P.md"), "- c\n");
}

#[test]
fn external_change_reloads_and_keeps_ids() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n- c\n")]);
    let old = ids(&mut s, "p");
    put(t.path(), "pages/P.md", "- a\n- B2\n- c\n- d\n");
    let out = changed(&mut s, &["pages/P.md"]);
    assert_eq!(changed_keys(&out), ["p"]);
    let view = &out.changed[0];
    let new: Vec<BlockId> = view.blocks.iter().map(|b| b.id).collect();
    assert_eq!(&new[..3], &old[..]);
    assert_eq!(new.len(), 4);
    assert!(!old.contains(&new[3]));
    assert_eq!(view.blocks[1].text, "B2");
    assert!(out.notices.is_empty());
    // Saving works again against the new disk text.
    set_text(&mut s, old[0], "x");
    assert_eq!(read(&t, "pages/P.md"), "- x\n- B2\n- c\n- d\n");
}

#[test]
fn typing_into_a_block_changed_on_disk_keeps_mine_and_reports_both() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n")]);
    let b = ids(&mut s, "p")[1];
    put(t.path(), "pages/P.md", "- a\n- theirs\n");
    changed(&mut s, &["pages/P.md"]);

    let out = set_text(&mut s, b, "mine");
    assert_eq!(read(&t, "pages/P.md"), "- a\n- mine\n");
    assert_eq!(
        out.notices,
        [Notice::Conflict {
            page: "p".into(),
            block: b,
            mine: "mine".into(),
            theirs: Some("theirs".into()),
            message: CHANGED.into(),
        }]
    );
    let v = serde_json::to_value(&out.notices[0]).unwrap();
    assert_eq!(v["kind"], "conflict");
    assert_eq!(v["theirs"], "theirs");

    // The mark is used up.
    let out = set_text(&mut s, b, "mine2");
    assert!(out.notices.is_empty());
    assert_eq!(read(&t, "pages/P.md"), "- a\n- mine2\n");
}

#[test]
fn typing_the_disk_text_is_no_conflict() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n")]);
    let b = ids(&mut s, "p")[1];
    put(t.path(), "pages/P.md", "- a\n- theirs\n");
    changed(&mut s, &["pages/P.md"]);
    let out = set_text(&mut s, b, "theirs");
    assert!(out.notices.is_empty());
}

#[test]
fn conflicts_in_two_blocks_are_both_reported() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n")]);
    let old = ids(&mut s, "p");
    put(t.path(), "pages/P.md", "- A\n- B\n");
    changed(&mut s, &["pages/P.md"]);
    let first = set_text(&mut s, old[0], "x");
    let second = set_text(&mut s, old[1], "y");
    assert!(matches!(&first.notices[..], [Notice::Conflict { block, .. }] if *block == old[0]));
    assert!(matches!(&second.notices[..], [Notice::Conflict { block, .. }] if *block == old[1]));
    assert_eq!(read(&t, "pages/P.md"), "- x\n- y\n");
}

#[test]
fn viewing_the_page_acknowledges_disk_changes() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n")]);
    let b = ids(&mut s, "p")[1];
    put(t.path(), "pages/P.md", "- a\n- theirs\n");
    changed(&mut s, &["pages/P.md"]);
    page(&mut s, "p");
    let out = set_text(&mut s, b, "x");
    assert!(out.notices.is_empty());

    // page.open acknowledges too.
    put(t.path(), "pages/P.md", "- a\n- theirs2\n");
    changed(&mut s, &["pages/P.md"]);
    ok(&mut s, json!({"type": "page.open", "name": "P"}));
    assert!(set_text(&mut s, b, "y").notices.is_empty());
}

#[test]
fn page_today_and_refs_acknowledge_disk_changes() {
    let (t, mut s) = folder(&[
        ("journals/2026-10-29.md", "- j\n"),
        ("pages/A.md", "- see [[B]]\n- other\n"),
        ("pages/B.md", "- b\n"),
    ]);
    let j = ids(&mut s, "2026-10-29")[0];
    let a = ids(&mut s, "a");
    put(t.path(), "journals/2026-10-29.md", "- J\n");
    put(t.path(), "pages/A.md", "- see [[B]] now\n- other2\n");
    changed(&mut s, &["journals/2026-10-29.md", "pages/A.md"]);

    ok(&mut s, json!({"type": "page.today"}));
    assert!(set_text(&mut s, j, "mine").notices.is_empty());

    // page.refs returns only the linking block of A: its mark goes, the
    // other block's stays.
    ok(&mut s, json!({"type": "page.refs", "key": "b"}));
    assert!(set_text(&mut s, a[0], "see [[B]] mine").notices.is_empty());
    assert_eq!(set_text(&mut s, a[1], "mine").notices.len(), 1);
}

#[test]
fn typing_into_a_block_deleted_on_disk_keeps_the_text() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n- c\n")]);
    let old = ids(&mut s, "p");
    let b = old[1];
    put(t.path(), "pages/P.md", "- a\n- c\n");
    changed(&mut s, &["pages/P.md"]);

    let out = set_text(&mut s, b, "mine");
    assert_eq!(read(&t, "pages/P.md"), "- a\n- mine\n- c\n");
    assert_eq!(texts(&out), ["a", "mine", "c"]);
    let new = out.page.as_ref().unwrap().blocks[1].id;
    assert_ne!(new, b);
    let focus = out.focus.expect("focus");
    assert_eq!((focus.id, focus.at), (new, 4));
    assert_eq!(
        out.notices,
        [Notice::Conflict {
            page: "p".into(),
            block: new,
            mine: "mine".into(),
            theirs: None,
            message: DELETED.into(),
        }]
    );
    let v = serde_json::to_value(&out.notices[0]).unwrap();
    assert_eq!(v["theirs"], Value::Null);

    // The old id is gone for good once the mark is used.
    let e = cmd(
        &mut s,
        json!({"type": "block.setText", "id": b, "text": "again"}),
    );
    assert_eq!(e.unwrap_err().code, "unknownBlock");
}

#[test]
fn typing_into_a_deleted_first_block_goes_to_the_end() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n")]);
    let a = ids(&mut s, "p")[0];
    put(t.path(), "pages/P.md", "- b\n");
    changed(&mut s, &["pages/P.md"]);
    let out = set_text(&mut s, a, "mine");
    assert_eq!(read(&t, "pages/P.md"), "- b\n- mine\n");
    assert!(matches!(
        &out.notices[..],
        [Notice::Conflict { theirs: None, .. }]
    ));
}

#[test]
fn unsaved_edits_survive_external_change_and_deletion() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let a = ids(&mut s, "p")[0];
    put(t.path(), "pages/P.md", "- theirs\n");
    let out = set_text(&mut s, a, "mine");
    assert_eq!(
        reason(&out.notices[0]),
        Some(("p".into(), "changedOnDisk".into()))
    );

    put(t.path(), "pages/P.md", "- theirs2\n");
    let out = changed(&mut s, &["pages/P.md"]);
    assert_eq!(
        out.notices.iter().filter_map(reason).collect::<Vec<_>>(),
        [("p".to_string(), "changedOnDisk".to_string())]
    );
    assert!(out.changed.is_empty());
    assert_eq!(texts(&page(&mut s, "p")), ["mine"]);
    assert_eq!(read(&t, "pages/P.md"), "- theirs2\n");

    fs::remove_file(t.path().join("pages/P.md")).unwrap();
    let out = changed(&mut s, &["pages/P.md"]);
    assert!(out.removed.is_empty());
    assert_eq!(
        out.notices.iter().filter_map(reason).collect::<Vec<_>>(),
        [("p".to_string(), "changedOnDisk".to_string())]
    );
    // Without a file the page leaves the tree.
    assert!(!tree_names(&out).contains(&"p".to_string()));
    assert_eq!(texts(&page(&mut s, "p")), ["mine"]);

    let out = ok(&mut s, json!({"type": "page.overwrite", "key": "p"}));
    assert!(out.notices.is_empty());
    assert_eq!(read(&t, "pages/P.md"), "- mine\n");
    // The page is back in the tree and saves normally.
    set_text(&mut s, a, "mine2");
    assert_eq!(read(&t, "pages/P.md"), "- mine2\n");
}

#[test]
fn unsaved_page_whose_file_is_deleted_is_saved_again_on_the_next_edit() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let a = ids(&mut s, "p")[0];
    put(t.path(), "pages/P.md", "- theirs\n");
    set_text(&mut s, a, "mine");
    fs::remove_file(t.path().join("pages/P.md")).unwrap();
    changed(&mut s, &["pages/P.md"]);
    let out = set_text(&mut s, a, "mine2");
    assert!(out.notices.is_empty());
    assert_eq!(read(&t, "pages/P.md"), "- mine2\n");
}

#[test]
fn not_utf8_change_warns_and_keeps_the_page() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    fs::write(t.path().join("pages/P.md"), b"- \xff\n").unwrap();
    let out = changed(&mut s, &["pages/P.md"]);
    assert!(matches!(
        &out.notices[..],
        [Notice::LoadWarning { message }] if message.contains("UTF-8")
    ));
    assert!(out.changed.is_empty());
    assert_eq!(texts(&page(&mut s, "p")), ["a"]);
}

#[test]
fn new_and_removed_files_update_the_tree() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    put(t.path(), "pages/New.md", "- n\n");
    let out = changed(&mut s, &["pages/New.md"]);
    assert_eq!(changed_keys(&out), ["new"]);
    assert_eq!(tree_names(&out), ["new", "p"]);

    fs::remove_file(t.path().join("pages/New.md")).unwrap();
    let out = changed(&mut s, &["pages/New.md"]);
    assert_eq!(out.removed, ["new"]);
    assert_eq!(tree_names(&out), ["p"]);
    assert_eq!(
        cmd(&mut s, json!({"type": "page.get", "key": "new"}))
            .unwrap_err()
            .code,
        "unknownPage"
    );

    fs::create_dir(t.path().join("pages/Dir")).unwrap();
    let out = changed(&mut s, &["pages/Dir"]);
    assert_eq!(tree_names(&out), ["Dir/", "p"]);
}

#[test]
fn new_journal_is_loaded() {
    let (t, mut s) = folder(&[]);
    put(t.path(), "journals/2026-10-28.md", "- j\n");
    put(t.path(), "journals/notes.md", "- x\n");
    let out = changed(&mut s, &["journals/2026-10-28.md", "journals/notes.md"]);
    assert_eq!(changed_keys(&out), ["2026-10-28"]);
    assert_eq!(out.tree.unwrap().journals.len(), 1);
    assert!(matches!(&out.notices[..], [Notice::LoadWarning { .. }]));
}

#[test]
fn new_file_in_a_new_folder_brings_the_folder() {
    let (t, mut s) = folder(&[]);
    put(t.path(), "pages/A/B/X.md", "- x\n");
    let out = changed(&mut s, &["pages/A/B/X.md"]);
    assert_eq!(tree_names(&out), ["A/", "A/B/", "x"]);
}

#[test]
fn new_folder_loads_the_files_below_it() {
    let (t, mut s) = folder(&[]);
    put(t.path(), "pages/v1.2/X.md", "- x\n");
    put(t.path(), "pages/v1.2/sub/Y.md", "- y\n");
    let out = changed(&mut s, &["pages/v1.2"]);
    let mut keys = changed_keys(&out);
    keys.sort();
    assert_eq!(keys, ["x", "y"]);
    assert_eq!(tree_names(&out), ["v1.2/", "v1.2/sub/", "y", "x"]);
}

#[test]
fn folder_renamed_on_disk_moves_its_pages() {
    let (t, mut s) = folder(&[("pages/A/X.md", "- x\n"), ("pages/A/Y.md", "- y\n")]);
    let y = ids(&mut s, "y")[0];
    // Y has an unsaved edit.
    put(t.path(), "pages/A/Y.md", "- theirs\n");
    set_text(&mut s, y, "mine");

    fs::rename(t.path().join("pages/A"), t.path().join("pages/B")).unwrap();
    let out = changed(&mut s, &["pages/A", "pages/B"]);
    // X is gone from A and loaded from B; Y keeps the user's text and is
    // not replaced by B/Y.md, which would be a second page of that name.
    assert_eq!(changed_keys(&out), ["x"]);
    assert!(out.removed.is_empty());
    assert_eq!(
        out.notices.iter().filter_map(reason).collect::<Vec<_>>(),
        [("y".to_string(), "changedOnDisk".to_string())]
    );
    assert_eq!(texts(&page(&mut s, "y")), ["mine"]);
    assert_eq!(read(&t, "pages/B/Y.md"), "- theirs\n");
    assert!(tree_names(&out).contains(&"B/".to_string()));
}

#[test]
fn existing_folder_reported_again_changes_nothing() {
    let (t, mut s) = folder(&[("pages/A/X.md", "- x\n"), ("pages/A/Y.md", "- y\n")]);
    let x = ids(&mut s, "x")[0];
    let y = ids(&mut s, "y")[0];
    set_text(&mut s, x, "x2");
    // Y has an unsaved edit.
    put(t.path(), "pages/A/Y.md", "- theirs\n");
    set_text(&mut s, y, "mine");
    let out = changed(&mut s, &["pages/A", "pages"]);
    assert!(out.changed.is_empty() && out.removed.is_empty());
    assert!(out.notices.is_empty());
    assert!(out.tree.is_none());
    // Ids and history are intact, and Y still knows its file.
    let undo = ok(&mut s, json!({"type": "history.undo", "page": "x"}));
    assert_eq!(texts(&undo), ["x"]);
    let out = ok(&mut s, json!({"type": "page.overwrite", "key": "y"}));
    assert!(out.notices.is_empty());
    assert_eq!(read(&t, "pages/A/Y.md"), "- mine\n");
}

#[test]
fn folder_deleted_on_disk_removes_its_pages_and_folders() {
    let (t, mut s) = folder(&[("pages/A/X.md", "- x\n"), ("pages/A/S/Y.md", "- y\n")]);
    fs::remove_dir_all(t.path().join("pages/A")).unwrap();
    let out = changed(&mut s, &["pages/A"]);
    let mut removed = out.removed.clone();
    removed.sort();
    assert_eq!(removed, ["x", "y"]);
    assert!(tree_names(&out).is_empty());
}

#[test]
fn folder_deleted_on_disk_keeps_unsaved_pages() {
    let (t, mut s) = folder(&[("pages/A/X.md", "- x\n")]);
    let x = ids(&mut s, "x")[0];
    put(t.path(), "pages/A/X.md", "- theirs\n");
    set_text(&mut s, x, "mine");
    fs::remove_dir_all(t.path().join("pages/A")).unwrap();
    let out = changed(&mut s, &["pages/A"]);
    assert!(out.removed.is_empty());
    assert_eq!(out.notices.iter().filter_map(reason).count(), 1);
    // The next save re-creates the folder and the file.
    set_text(&mut s, x, "mine2");
    assert_eq!(read(&t, "pages/A/X.md"), "- mine2\n");
}

#[test]
fn new_file_fills_a_blank_page_without_a_file() {
    let (t, mut s) = folder(&[]);
    ok(&mut s, json!({"type": "page.open", "name": "Q"}));
    put(t.path(), "pages/Q.md", "- from disk\n");
    let out = changed(&mut s, &["pages/Q.md"]);
    assert_eq!(changed_keys(&out), ["q"]);
    assert_eq!(texts(&page(&mut s, "q")), ["from disk"]);
    assert_eq!(tree_names(&out), ["q"]);
}

#[test]
fn new_file_does_not_replace_a_page_with_unsaved_content() {
    let (t, mut s) = folder(&[]);
    ok(&mut s, json!({"type": "page.open", "name": "Q"}));
    // Another program creates the file just before the first save.
    put(t.path(), "pages/Q.md", "- theirs\n");
    let out = ok(
        &mut s,
        json!({"type": "block.insert", "page": "q", "after": null, "text": "mine"}),
    );
    let q = out.page.as_ref().unwrap().blocks[0].id;
    assert_eq!(
        reason(&out.notices[0]),
        Some(("q".into(), "pathTaken".into()))
    );
    let out = changed(&mut s, &["pages/Q.md"]);
    assert_eq!(
        out.notices.iter().filter_map(reason).collect::<Vec<_>>(),
        [("q".to_string(), "changedOnDisk".to_string())]
    );
    assert!(out.changed.is_empty());
    assert_eq!(texts(&page(&mut s, "q")), ["mine"]);
    assert_eq!(read(&t, "pages/Q.md"), "- theirs\n");
    // Saving still refuses to replace the file.
    set_text(&mut s, q, "mine2");
    assert_eq!(read(&t, "pages/Q.md"), "- theirs\n");

    // Keep mine replaces the file at exactly the page's path.
    let out = ok(&mut s, json!({"type": "page.overwrite", "key": "q"}));
    assert!(out.notices.is_empty());
    assert_eq!(read(&t, "pages/Q.md"), "- mine2\n");
    assert!(tree_names(&out).contains(&"q".to_string()));
    set_text(&mut s, q, "mine3");
    assert_eq!(read(&t, "pages/Q.md"), "- mine3\n");
}

/// A page with text and no file, after another program created its file:
/// the session from `new_file_does_not_replace_a_page_with_unsaved_content`.
fn fileless_page_beside_its_file(file: &str) -> (TempDir, Session) {
    let (t, mut s) = folder(&[]);
    ok(&mut s, json!({"type": "page.open", "name": "Q"}));
    put(t.path(), file, "- theirs\n");
    ok(
        &mut s,
        json!({"type": "block.insert", "page": "q", "after": null, "text": "mine"}),
    );
    changed(&mut s, &[file]);
    (t, s)
}

#[test]
fn reload_takes_the_file_another_program_created_for_a_fileless_page() {
    let (t, mut s) = fileless_page_beside_its_file("pages/Q.md");
    let out = ok(&mut s, json!({"type": "page.reload", "key": "q"}));
    assert_eq!(texts(&out), ["theirs"]);
    assert!(tree_names(&out).contains(&"q".to_string()));
    let id = out.page.unwrap().blocks[0].id;
    let out = set_text(&mut s, id, "edited");
    assert!(out.notices.is_empty());
    assert_eq!(read(&t, "pages/Q.md"), "- edited\n");
}

#[test]
fn keep_mine_never_replaces_another_case_of_the_name() {
    // `pages/q.md` is not the page's path `pages/Q.md`, even where the file
    // system would open it under that name.
    let (t, mut s) = fileless_page_beside_its_file("pages/q.md");
    let out = ok(&mut s, json!({"type": "page.overwrite", "key": "q"}));
    assert_eq!(
        reason(&out.notices[0]),
        Some(("q".into(), "pathTaken".into()))
    );
    assert_eq!(read(&t, "pages/q.md"), "- theirs\n");
    assert_eq!(
        cmd(&mut s, json!({"type": "page.reload", "key": "q"}))
            .unwrap_err()
            .code,
        "reload"
    );
    assert_eq!(texts(&page(&mut s, "q")), ["mine"]);
}

#[test]
fn page_moved_on_disk_keeps_its_block_ids() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n")]);
    let old = ids(&mut s, "p");
    fs::create_dir(t.path().join("pages/sub")).unwrap();
    fs::rename(t.path().join("pages/P.md"), t.path().join("pages/sub/P.md")).unwrap();
    let out = changed(&mut s, &["pages/P.md", "pages/sub", "pages/sub/P.md"]);
    assert!(out.removed.is_empty());
    assert_eq!(changed_keys(&out), ["p"]);
    let new: Vec<BlockId> = out.changed[0].blocks.iter().map(|b| b.id).collect();
    assert_eq!(new, old);
    // Typing sent for the old ids lands in the moved file.
    let out = set_text(&mut s, old[1], "typed");
    assert!(out.notices.is_empty());
    assert_eq!(read(&t, "pages/sub/P.md"), "- a\n- typed\n");
}

#[test]
fn page_moved_and_changed_on_disk_marks_its_changed_blocks() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n")]);
    let old = ids(&mut s, "p");
    fs::remove_file(t.path().join("pages/P.md")).unwrap();
    put(t.path(), "pages/sub/P.md", "- a\n- theirs\n");
    changed(&mut s, &["pages/P.md", "pages/sub/P.md"]);
    let out = set_text(&mut s, old[1], "mine");
    assert!(matches!(
        &out.notices[..],
        [Notice::Conflict { theirs: Some(t), .. }] if t == "theirs"
    ));
    assert_eq!(read(&t, "pages/sub/P.md"), "- a\n- mine\n");
}

#[test]
fn deleted_block_mark_follows_a_title_change_on_disk() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n")]);
    let b = ids(&mut s, "p")[1];
    put(t.path(), "pages/P.md", "- a\n");
    changed(&mut s, &["pages/P.md"]);
    put(t.path(), "pages/P.md", "title:: Q\n- a\n");
    changed(&mut s, &["pages/P.md"]);
    let out = set_text(&mut s, b, "mine");
    assert_eq!(out.page.as_ref().unwrap().key, "q");
    assert_eq!(read(&t, "pages/P.md"), "title:: Q\n- a\n- mine\n");
}

#[test]
fn new_file_named_like_a_page_with_a_file_is_a_duplicate() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    put(t.path(), "pages/sub/p.md", "- other\n");
    let out = changed(&mut s, &["pages/sub/p.md"]);
    assert!(
        matches!(&out.notices[..], [Notice::LoadWarning { message }] if message.contains("two files"))
    );
    assert!(out.changed.is_empty());
    assert_eq!(texts(&page(&mut s, "p")), ["a"]);
}

#[test]
fn title_changed_on_disk_moves_the_page_to_its_new_key() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    put(t.path(), "pages/P.md", "title:: Q\n- a\n");
    let out = changed(&mut s, &["pages/P.md"]);
    assert_eq!(changed_keys(&out), ["q"]);
    assert_eq!(out.removed, ["p"]);
}

#[test]
fn external_change_clears_undo_history() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let a = ids(&mut s, "p")[0];
    set_text(&mut s, a, "b");
    put(t.path(), "pages/P.md", "- c\n");
    changed(&mut s, &["pages/P.md"]);
    let out = ok(&mut s, json!({"type": "history.undo", "page": "p"}));
    assert_eq!(texts(&out), ["c"]);
    assert_eq!(read(&t, "pages/P.md"), "- c\n");
}

#[test]
fn dirty_lists_pages_with_unsaved_edits() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    assert_eq!(dirty(&mut s), json!([]));
    // A blank page without a file is not dirty.
    ok(&mut s, json!({"type": "page.open", "name": "Blank"}));
    assert_eq!(dirty(&mut s), json!([]));

    let a = ids(&mut s, "p")[0];
    put(t.path(), "pages/P.md", "- theirs\n");
    set_text(&mut s, a, "mine");
    assert_eq!(dirty(&mut s), json!([{"key": "p", "title": "P"}]));

    ok(&mut s, json!({"type": "page.overwrite", "key": "p"}));
    assert_eq!(dirty(&mut s), json!([]));
}

#[test]
fn stale_files_changed_is_refused() {
    let (_t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let r = s.run(
        serde_json::from_value(json!({
            "generation": 999,
            "command": {"type": "files.changed", "paths": ["pages/P.md"]}
        }))
        .unwrap(),
        clock(0),
    );
    assert_eq!(r.unwrap_err().code, "stale");
}

#[test]
fn a_rescan_finds_top_level_files_and_folders_deleted_while_events_were_lost() {
    let (t, mut s) = folder(&[
        ("pages/Top.md", "- t\n"),
        ("pages/Keep.md", "- k\n"),
        ("pages/A/X.md", "- x\n"),
        ("journals/2026-10-28.md", "- j\n"),
    ]);
    fs::remove_file(t.path().join("pages/Top.md")).unwrap();
    fs::remove_file(t.path().join("journals/2026-10-28.md")).unwrap();
    fs::remove_dir_all(t.path().join("pages/A")).unwrap();
    let paths = breccia_core::watch::rescan(t.path());
    let out = ok(&mut s, json!({"type": "files.changed", "paths": paths}));
    let mut removed = out.removed.clone();
    removed.sort();
    assert_eq!(removed, ["2026-10-28", "top", "x"]);
    assert!(out.changed.is_empty());
    assert_eq!(tree_names(&out), ["keep"]);
}

#[test]
fn reload_reports_a_duplicate_name() {
    let (t, mut s) = folder(&[("pages/A.md", "- a\n"), ("pages/B.md", "- b\n")]);
    put(t.path(), "pages/B.md", "title:: A\n- b\n");
    let out = ok(&mut s, json!({"type": "page.reload", "key": "b"}));
    assert!(
        matches!(out.notices.as_slice(), [Notice::LoadWarning { .. }]),
        "{:?}",
        out.notices
    );
}

#[test]
fn a_case_only_title_change_updates_the_tree() {
    let (t, mut s) = folder(&[("pages/Foo.md", "title:: Foo Bar\n- a\n")]);
    put(t.path(), "pages/Foo.md", "title:: foo bar\n- a\n");
    let out = ok(&mut s, json!({"type": "page.reload", "key": "foo bar"}));
    assert_eq!(out.page.unwrap().name, "foo bar");
    assert!(out.tree.is_some(), "the tree keeps the old spelling");
}

#[test]
fn reload_of_a_fileless_page_indexes_its_aliases() {
    let (t, mut s) = fileless_page_beside_its_file("pages/Q.md");
    // Only front matter, no block text: the page counts as having content
    // through its file alone.
    put(t.path(), "pages/Q.md", "---\naliases: [Other]\n---\n");
    ok(&mut s, json!({"type": "page.reload", "key": "q"}));
    ok(&mut s, json!({"type": "page.open", "name": "Other"}));
    let out = ok(&mut s, json!({"type": "page.open", "name": "Other"}));
    assert_eq!(out.page.unwrap().key, "q");
}

/// The paths the classifier decides on, each made in its own open folder and
/// passed to `files.changed`: `(path, a folder?, pages loaded, folders in
/// the tree, notices)`. Notices use `/` on every system.
#[allow(clippy::type_complexity)]
const DISK_ROWS: &[(&str, bool, &[&str], &[&str], &[&str])] = &[
    ("journals/2026-10-29.md", false, &["2026-10-29"], &[], &[]),
    (
        "journals/x.md",
        false,
        &[],
        &[],
        &["journal file name is not a YYYY-MM-DD date, not loaded: journals/x.md"],
    ),
    ("journals/sub/2026-10-29.md", false, &[], &[], &[]),
    (
        "journals/2026-10-29.MD",
        false,
        &[],
        &[],
        &["extension must be lower-case .md, not loaded: journals/2026-10-29.MD"],
    ),
    ("pages/a.md", false, &["a"], &[], &[]),
    ("pages/f/g/a.md", false, &["a"], &["f/", "f/g/"], &[]),
    (
        "pages/a.MD",
        false,
        &[],
        &[],
        &["extension must be lower-case .md, not loaded: pages/a.MD"],
    ),
    ("pages/.h/a.md", false, &[], &[], &[]),
    ("pages/v1.2", true, &[], &["v1.2/"], &[]),
    ("pages/v1.2", false, &[], &[], &[]),
    ("pages/f", true, &[], &["f/"], &[]),
    ("breccia/config.toml", false, &[], &[], &[]),
    ("breccia/other.toml", false, &[], &[], &[]),
    ("other/a.md", false, &[], &[], &[]),
    ("a.md", false, &[], &[], &[]),
];

#[test]
fn disk_change_table() {
    for &(rel, is_dir, keys, folders, notices) in DISK_ROWS {
        let (t, mut s) = folder(&[]);
        let path = t.path().join(rel);
        if is_dir {
            fs::create_dir_all(&path).unwrap();
        } else if rel == "pages/v1.2" {
            // Reported, but nothing is there.
        } else if rel == "breccia/config.toml" {
            put(t.path(), rel, "");
        } else {
            put(t.path(), rel, "- x\n");
        }
        let out = changed(&mut s, &[rel]);
        let got: Vec<String> = out
            .notices
            .iter()
            .map(|n| match n {
                Notice::LoadWarning { message } => message.replace('\\', "/"),
                other => format!("{other:?}"),
            })
            .collect();
        let tree: Vec<String> = out
            .tree
            .as_ref()
            .map(|_| tree_names(&out))
            .unwrap_or_default()
            .into_iter()
            .filter(|n| n.ends_with('/'))
            .collect();
        assert_eq!(changed_keys(&out), keys, "pages {rel}");
        assert_eq!(tree, folders, "folders {rel}");
        assert_eq!(got, notices, "notices {rel}");
        // A warning is given once per file: the same file reported again is quiet.
        let again = changed(&mut s, &[rel]);
        assert!(again.notices.is_empty(), "again {rel}: {:?}", again.notices);
    }
}
