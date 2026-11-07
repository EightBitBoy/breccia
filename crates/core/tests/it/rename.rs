use breccia_core::session::{Notice, SaveFailReason, TreeNode};
use breccia_core::{Clock, CommandError, LoadWarning, Output, Session, Workspace};
use chrono::NaiveDate;
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use tempfile::TempDir;

fn clock(ms: u64) -> Clock {
    Clock {
        today: NaiveDate::from_ymd_opt(2026, 10, 29).unwrap(),
        time: chrono::NaiveTime::from_hms_opt(14, 5, 9).unwrap(),
        ms,
    }
}

fn cmd(s: &mut Session, json: Value) -> Result<Output, CommandError> {
    let req = serde_json::from_value(json!({"generation": s.generation(), "command": json}))
        .unwrap_or_else(|e| panic!("bad request: {e}"));
    s.run(req, clock(0))
}

fn ok(s: &mut Session, json: Value) -> Output {
    let j = json.clone();
    cmd(s, json).unwrap_or_else(|e| panic!("{j}: {e:?}"))
}

fn code(s: &mut Session, json: Value) -> String {
    let j = json.clone();
    match cmd(s, json) {
        Ok(_) => panic!("{j} succeeded"),
        Err(e) => e.code,
    }
}

fn put(root: &Path, rel: &str, text: &str) {
    let p = root.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
}

fn folder(files: &[(&str, &str)], dirs: &[&str]) -> (TempDir, Session) {
    let t = tempfile::tempdir().unwrap();
    for (rel, text) in files {
        put(t.path(), rel, text);
    }
    for d in dirs {
        fs::create_dir_all(t.path().join(d)).unwrap();
    }
    let mut s = Session::new();
    ok(&mut s, json!({"type": "folder.open", "path": t.path()}));
    (t, s)
}

fn read(t: &TempDir, rel: &str) -> String {
    fs::read_to_string(t.path().join(rel)).unwrap_or_else(|e| panic!("{rel}: {e}"))
}

fn exists(t: &TempDir, rel: &str) -> bool {
    t.path().join(rel).exists()
}

/// Every file below the root, by relative path, with its bytes.
fn snapshot(t: &TempDir) -> BTreeMap<PathBuf, Vec<u8>> {
    fn walk(root: &Path, dir: &Path, out: &mut BTreeMap<PathBuf, Vec<u8>>) {
        for e in fs::read_dir(dir).unwrap() {
            let p = e.unwrap().path();
            if p.is_dir() {
                walk(root, &p, out);
            } else {
                out.insert(
                    p.strip_prefix(root).unwrap().to_path_buf(),
                    fs::read(&p).unwrap(),
                );
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(t.path(), t.path(), &mut out);
    out
}

/// The names in a directory, exactly as the file system spells them.
fn listing(t: &TempDir, rel: &str) -> Vec<String> {
    let mut v: Vec<String> = fs::read_dir(t.path().join(rel))
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    v.sort();
    v
}

fn changed_keys(out: &Output) -> Vec<String> {
    let mut v: Vec<String> = out.changed.iter().map(|p| p.key.clone()).collect();
    v.sort();
    v
}

fn ref_groups(s: &mut Session, key: &str) -> usize {
    ok(s, json!({"type": "page.refs", "key": key}))
        .refs
        .unwrap()
        .groups
        .len()
}

/// The `(path, children)` of the folders at the top of the page tree.
fn top_folders(out: &Output) -> Vec<String> {
    out.tree
        .as_ref()
        .expect("tree")
        .pages
        .iter()
        .filter_map(|n| match n {
            TreeNode::Folder { path, .. } => Some(path.clone()),
            TreeNode::Page { .. } => None,
        })
        .collect()
}

const OLD: (&str, &str) = ("pages/Old.md", "- body\n");
const B: (&str, &str) = ("pages/B.md", "- see [[old]] and #Old\n- `[[Old]]`\n");
const J: (&str, &str) = ("journals/2026-10-29.md", "- [[Old]]\n  owner:: [[OLD]]\n");

#[test]
fn rename_rewrites_links_and_moves_file() {
    let (t, mut s) = folder(&[OLD, B, J], &[]);
    let out = ok(
        &mut s,
        json!({"type": "page.rename", "key": "old", "name": "New Name"}),
    );
    assert_eq!(read(&t, "pages/New Name.md"), "- body\n");
    assert!(!exists(&t, "pages/Old.md"));
    assert_eq!(
        read(&t, "pages/B.md"),
        "- see [[New Name]] and #[[New Name]]\n- `[[Old]]`\n"
    );
    assert_eq!(
        read(&t, "journals/2026-10-29.md"),
        "- [[New Name]]\n  owner:: [[New Name]]\n"
    );
    let page = out.page.as_ref().unwrap();
    assert_eq!(page.key, "new name");
    assert_eq!(page.name, "New Name");
    let keys = changed_keys(&out);
    assert!(keys.contains(&"b".to_string()), "{keys:?}");
    assert!(keys.contains(&"2026-10-29".to_string()), "{keys:?}");
    assert!(!keys.contains(&"new name".to_string()), "{keys:?}");
    assert!(out.tree.is_some());
    assert!(out.notices.is_empty(), "{:?}", out.notices);
    assert_eq!(ref_groups(&mut s, "new name"), 2);
    let e = cmd(&mut s, json!({"type": "page.refs", "key": "old"})).unwrap_err();
    assert_eq!(e.code, "unknownPage");

    // A fresh read of the folder agrees.
    let (ws, warnings) = Workspace::open(t.path()).unwrap();
    assert!(warnings.is_empty(), "{warnings:?}");
    assert_eq!(ws.page("new name").unwrap().name, "New Name");
    assert!(ws.page("old").is_none());
    assert_eq!(ws.backlinks("new name").len(), 2);
}

#[test]
fn rename_rewrites_links_in_the_preamble() {
    let (t, mut s) = folder(
        &[OLD, ("pages/C.md", "related:: [[Old]]\nnote #old\n- c\n")],
        &[],
    );
    let out = ok(
        &mut s,
        json!({"type": "page.rename", "key": "old", "name": "New"}),
    );
    assert_eq!(
        read(&t, "pages/C.md"),
        "related:: [[New]]\nnote #New\n- c\n"
    );
    assert_eq!(changed_keys(&out), ["c"]);
}

#[test]
fn rename_keeps_unrelated_bytes() {
    let (t, mut s) = folder(
        &[
            OLD,
            ("pages/B.md", "- see [[Old]]\r\n-   other  \r\n"),
            ("pages/C.md", "- nothing\r\n  here  \n"),
            (
                "pages/D.md",
                "\u{feff}-  keep  \r\n- [[old]]\r\n\t-  child [[x]] \r\n",
            ),
        ],
        &[],
    );
    let c = fs::read(t.path().join("pages/C.md")).unwrap();
    ok(
        &mut s,
        json!({"type": "page.rename", "key": "old", "name": "New"}),
    );
    assert_eq!(read(&t, "pages/B.md"), "- see [[New]]\n-   other  \n");
    assert_eq!(fs::read(t.path().join("pages/C.md")).unwrap(), c);
    assert_eq!(
        read(&t, "pages/D.md"),
        "\u{feff}-  keep  \n- [[New]]\n\t-  child [[x]] \n"
    );
}

#[test]
fn rename_to_a_name_with_forbidden_chars_writes_title() {
    let (t, mut s) = folder(&[OLD], &[]);
    ok(
        &mut s,
        json!({"type": "page.rename", "key": "old", "name": "a/b"}),
    );
    assert_eq!(read(&t, "pages/a_b.md"), "title:: a/b\n- body\n");
    assert!(!exists(&t, "pages/Old.md"));
    let out = ok(
        &mut s,
        json!({"type": "page.rename", "key": "a/b", "name": "ab"}),
    );
    assert_eq!(read(&t, "pages/ab.md"), "- body\n");
    assert!(!exists(&t, "pages/a_b.md"));
    assert_eq!(out.page.unwrap().key, "ab");
}

#[test]
fn rename_onto_a_taken_stem_adds_suffix_and_title() {
    let (t, mut s) = folder(&[OLD, ("pages/New.md", "title:: Other\n- o\n")], &[]);
    ok(
        &mut s,
        json!({"type": "page.rename", "key": "old", "name": "New"}),
    );
    assert_eq!(read(&t, "pages/New 2.md"), "title:: New\n- body\n");
    assert_eq!(read(&t, "pages/New.md"), "title:: Other\n- o\n");
}

#[test]
fn rename_replaces_an_existing_title_line() {
    let (t, mut s) = folder(&[("pages/a_b.md", "x:: 1\ntitle:: a:b\n- body\n")], &[]);
    ok(
        &mut s,
        json!({"type": "page.rename", "key": "a:b", "name": "a?b"}),
    );
    assert_eq!(read(&t, "pages/a_b.md"), "title:: a?b\nx:: 1\n- body\n");
    ok(
        &mut s,
        json!({"type": "page.rename", "key": "a?b", "name": "plain"}),
    );
    assert_eq!(read(&t, "pages/plain.md"), "x:: 1\n- body\n");
}

#[test]
fn rename_case_only_renames_file() {
    let (t, mut s) = folder(&[("pages/project x.md", "- p\n")], &[]);
    let out = ok(
        &mut s,
        json!({"type": "page.rename", "key": "project x", "name": "Project X"}),
    );
    // On Windows `exists()` ignores case, so the listing is what counts.
    let names = listing(&t, "pages");
    assert!(names.contains(&"Project X.md".to_string()), "{names:?}");
    assert!(!names.contains(&"project x.md".to_string()), "{names:?}");
    assert_eq!(read(&t, "pages/Project X.md"), "- p\n");
    let page = out.page.unwrap();
    assert_eq!(page.key, "project x");
    assert_eq!(page.name, "Project X");
}

#[test]
fn rename_refuses_existing_name_journal_and_date() {
    let (t, mut s) = folder(&[OLD, ("pages/B.md", "- [[old]]\n"), J], &[]);
    let before = snapshot(&t);
    for (j, want) in [
        (
            json!({"type": "page.rename", "key": "old", "name": "b"}),
            "pageExists",
        ),
        (
            json!({"type": "page.rename", "key": "old", "name": "B"}),
            "pageExists",
        ),
        (
            json!({"type": "page.rename", "key": "2026-10-29", "name": "x"}),
            "journal",
        ),
        (
            json!({"type": "page.rename", "key": "old", "name": "2026-01-01"}),
            "invalidName",
        ),
        (
            json!({"type": "page.rename", "key": "old", "name": " "}),
            "invalidName",
        ),
        (
            json!({"type": "page.rename", "key": "nope", "name": "x"}),
            "unknownPage",
        ),
    ] {
        assert_eq!(code(&mut s, j.clone()), want, "{j}");
    }
    assert_eq!(snapshot(&t), before);
}

#[test]
fn rename_refuses_when_file_changed_on_disk() {
    let (t, mut s) = folder(&[OLD, ("pages/B.md", "- [[old]]\n")], &[]);
    put(t.path(), "pages/Old.md", "- changed\n");
    let before = snapshot(&t);
    assert_eq!(
        code(
            &mut s,
            json!({"type": "page.rename", "key": "old", "name": "New"})
        ),
        "changedOnDisk"
    );
    assert_eq!(snapshot(&t), before);
    // Gone from disk counts as changed too.
    fs::remove_file(t.path().join("pages/Old.md")).unwrap();
    assert_eq!(
        code(
            &mut s,
            json!({"type": "page.rename", "key": "old", "name": "New"})
        ),
        "changedOnDisk"
    );
    assert!(!exists(&t, "pages/New.md"));
}

#[test]
fn rename_keeps_going_when_a_linking_file_changed_on_disk() {
    let (t, mut s) = folder(&[OLD, ("pages/B.md", "- [[old]]\n"), J], &[]);
    put(t.path(), "pages/B.md", "- theirs [[old]]\n");
    let out = ok(
        &mut s,
        json!({"type": "page.rename", "key": "old", "name": "New"}),
    );
    // The rename stands and the other files are rewritten.
    assert_eq!(read(&t, "pages/New.md"), "- body\n");
    assert_eq!(
        read(&t, "journals/2026-10-29.md"),
        "- [[New]]\n  owner:: [[New]]\n"
    );
    // B's file is left alone; its rewrite stays in memory.
    assert_eq!(read(&t, "pages/B.md"), "- theirs [[old]]\n");
    assert!(
        out.notices.iter().any(|n| matches!(n,
            Notice::SaveFailed { page, reason: SaveFailReason::ChangedOnDisk, .. } if page == "b")),
        "{:?}",
        out.notices
    );
    let b = out.changed.iter().find(|p| p.key == "b").unwrap();
    assert_eq!(b.blocks[0].text, "[[New]]");
}

#[test]
fn rename_reports_links_it_cannot_write() {
    // The new name's backtick closes the unclosed one before the link, so the
    // rewritten link would not read back.
    let b = "- `x [[old]]\n- x\n";
    let j = "- `y [[Old]]\n  owner:: [[OLD]]\n";
    let (t, mut s) = folder(&[OLD, ("pages/B.md", b), (J.0, j)], &[]);
    let out = ok(
        &mut s,
        json!({"type": "page.rename", "key": "old", "name": "a`b"}),
    );
    assert_eq!(read(&t, "pages/a`b.md"), "- body\n");
    assert_eq!(read(&t, "pages/B.md"), b);
    assert_eq!(read(&t, J.0), j);
    // Only the journal day is re-sent: its topic page is gone (journal blocks take a topic's color).
    assert!(out.changed.iter().all(|v| v.key == "2026-10-29"));
    assert_eq!(
        out.notices,
        [Notice::Refused {
            message: "2 links could not be updated".into()
        }]
    );
}

#[test]
fn rename_keeps_block_ids_valid() {
    let (t, mut s) = folder(&[OLD, ("pages/B.md", "- [[old]]\n")], &[]);
    let id = ok(&mut s, json!({"type": "page.get", "key": "old"}))
        .page
        .unwrap()
        .blocks[0]
        .id;
    let bid = ok(&mut s, json!({"type": "page.get", "key": "b"}))
        .page
        .unwrap()
        .blocks[0]
        .id;
    ok(
        &mut s,
        json!({"type": "page.rename", "key": "old", "name": "New"}),
    );
    ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "edited"}),
    );
    ok(
        &mut s,
        json!({"type": "block.setText", "id": bid, "text": "[[New]]!"}),
    );
    assert_eq!(read(&t, "pages/New.md"), "- edited\n");
    assert_eq!(read(&t, "pages/B.md"), "- [[New]]!\n");
}

#[cfg(windows)]
#[test]
fn rename_of_a_locked_file_changes_nothing() {
    use std::os::windows::fs::OpenOptionsExt;
    let (t, mut s) = folder(&[OLD, ("pages/B.md", "- [[old]]\n")], &[]);
    let before = snapshot(&t);
    // Another program holds the file open and lets others only read it.
    let lock = fs::OpenOptions::new()
        .read(true)
        .share_mode(1) // FILE_SHARE_READ: it can be read, not renamed
        .open(t.path().join("pages/Old.md"))
        .unwrap();
    assert_eq!(
        code(
            &mut s,
            json!({"type": "page.rename", "key": "old", "name": "New"})
        ),
        "io"
    );
    drop(lock);
    assert_eq!(snapshot(&t), before);
    // Nothing changed in memory either: the rename works once the lock is gone.
    assert_eq!(ref_groups(&mut s, "old"), 1);
    ok(
        &mut s,
        json!({"type": "page.rename", "key": "old", "name": "New"}),
    );
    assert_eq!(read(&t, "pages/B.md"), "- [[New]]\n");
}

#[test]
fn page_titled_like_a_journal_is_a_duplicate() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "journals/2026-10-29.md", "- j\n");
    put(t.path(), "pages/X.md", "title:: 2026-10-29\n- p\n");
    let (ws, warnings) = Workspace::open(t.path()).unwrap();
    assert!(
        warnings.iter().any(|w| matches!(w,
            LoadWarning::DuplicatePage { key, ignored, .. }
                if key == "2026-10-29" && ignored == Path::new("pages/X.md"))),
        "{warnings:?}"
    );
    assert!(
        ws.page("2026-10-29")
            .unwrap()
            .rel_path
            .starts_with("journals")
    );
    drop(ws);

    let mut s = Session::new();
    ok(&mut s, json!({"type": "folder.open", "path": t.path()}));
    let out = ok(&mut s, json!({"type": "page.today"}));
    let id = out.page.unwrap().blocks[0].id;
    ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "j2"}),
    );
    assert_eq!(read(&t, "journals/2026-10-29.md"), "- j2\n");
    assert_eq!(read(&t, "pages/X.md"), "title:: 2026-10-29\n- p\n");
}

#[test]
fn move_page_between_folders() {
    let (t, mut s) = folder(&[("pages/A.md", "- a\n"), J], &["pages/Projects"]);
    let out = ok(
        &mut s,
        json!({"type": "page.move", "key": "a", "folder": "projects"}),
    );
    assert_eq!(read(&t, "pages/Projects/A.md"), "- a\n");
    assert!(!exists(&t, "pages/A.md"));
    let tree = out.tree.expect("tree");
    assert_eq!(
        tree.pages,
        [
            TreeNode::Folder {
                name: "Projects".into(),
                path: "Projects".into(),
                children: vec![TreeNode::Page {
                    key: "a".into(),
                    name: "A".into(),
                    linked_only: false,
                }],
            },
            // The journal links [[Old]], which has no page of its own.
            TreeNode::Page {
                key: "old".into(),
                name: "Old".into(),
                linked_only: true,
            }
        ]
    );
    assert_eq!(out.page.unwrap().key, "a");
    assert_eq!(
        code(
            &mut s,
            json!({"type": "page.move", "key": "a", "folder": "Nope"})
        ),
        "unknownFolder"
    );
    assert_eq!(
        code(
            &mut s,
            json!({"type": "page.move", "key": "2026-10-29", "folder": "Projects"})
        ),
        "journal"
    );
    // Back to the top level.
    ok(
        &mut s,
        json!({"type": "page.move", "key": "a", "folder": ""}),
    );
    assert_eq!(read(&t, "pages/A.md"), "- a\n");
    assert!(!exists(&t, "pages/Projects/A.md"));
}

#[test]
fn move_onto_a_taken_stem_adds_suffix_and_title() {
    let (t, mut s) = folder(
        &[
            ("pages/a_b.md", "title:: a:b\n- 1\n"),
            ("pages/X/a_b.md", "title:: a?b\n- 2\n"),
        ],
        &[],
    );
    ok(
        &mut s,
        json!({"type": "page.move", "key": "a:b", "folder": "X"}),
    );
    assert_eq!(read(&t, "pages/X/a_b 2.md"), "title:: a:b\n- 1\n");
    assert_eq!(read(&t, "pages/X/a_b.md"), "title:: a?b\n- 2\n");
    assert!(!exists(&t, "pages/a_b.md"));
}

#[test]
fn move_onto_a_taken_plain_stem_writes_a_title() {
    let (t, mut s) = folder(
        &[
            ("pages/A.md", "- 1\n"),
            ("pages/X/A.md", "title:: Other\n- 2\n"),
        ],
        &[],
    );
    ok(
        &mut s,
        json!({"type": "page.move", "key": "a", "folder": "X"}),
    );
    assert_eq!(read(&t, "pages/X/A 2.md"), "title:: A\n- 1\n");
    let (ws, _) = Workspace::open(t.path()).unwrap();
    assert_eq!(ws.page("a").unwrap().folder, "X");
}

#[test]
fn move_refuses_when_file_changed_on_disk() {
    let (t, mut s) = folder(&[("pages/A.md", "- a\n")], &["pages/X"]);
    put(t.path(), "pages/A.md", "- theirs\n");
    assert_eq!(
        code(
            &mut s,
            json!({"type": "page.move", "key": "a", "folder": "X"})
        ),
        "changedOnDisk"
    );
    assert_eq!(read(&t, "pages/A.md"), "- theirs\n");
    assert!(!exists(&t, "pages/X/A.md"));
}

#[test]
fn delete_page_removes_file_and_keeps_links() {
    let (t, mut s) = folder(
        &[("pages/A.md", "- a\n"), ("pages/B.md", "- [[a]]\n"), J],
        &[],
    );
    let out = ok(&mut s, json!({"type": "page.delete", "key": "a"}));
    assert!(!exists(&t, "pages/A.md"));
    assert_eq!(out.removed, ["a"]);
    assert!(out.tree.is_some());
    assert_eq!(read(&t, "pages/B.md"), "- [[a]]\n");
    let names = ok(&mut s, json!({"type": "pages.list"})).names.unwrap();
    let a = names.iter().find(|n| n.key == "a").unwrap();
    assert!(!a.exists);
    assert_eq!(
        code(&mut s, json!({"type": "page.get", "key": "a"})),
        "unknownPage"
    );
    // Journals may be deleted.
    ok(&mut s, json!({"type": "page.delete", "key": "2026-10-29"}));
    assert!(!exists(&t, J.0));
    assert_eq!(
        code(&mut s, json!({"type": "page.delete", "key": "a"})),
        "unknownPage"
    );
}

/// Every page node in the tree, anywhere, as `(folder, key, name, linked_only)`.
fn tree_pages(nodes: &[TreeNode], folder: &str, out: &mut Vec<(String, String, String, bool)>) {
    for n in nodes {
        match n {
            TreeNode::Folder { path, children, .. } => tree_pages(children, path, out),
            TreeNode::Page {
                key,
                name,
                linked_only,
            } => out.push((folder.into(), key.clone(), name.clone(), *linked_only)),
        }
    }
}

fn pages_in(out: &Output) -> Vec<(String, String, String, bool)> {
    let mut v = Vec::new();
    tree_pages(&out.tree.as_ref().expect("tree").pages, "", &mut v);
    v
}

fn row(folder: &str, key: &str, name: &str, linked_only: bool) -> (String, String, String, bool) {
    (folder.into(), key.into(), name.into(), linked_only)
}

#[test]
fn delete_linked_page_leaves_a_linked_only_row() {
    let (_t, mut s) = folder(
        &[
            ("pages/Projects/A.md", "- a\n"),
            ("pages/B.md", "- [[A]]\n"),
            ("pages/C.md", "- c\n"),
        ],
        &[],
    );
    let out = ok(&mut s, json!({"type": "page.delete", "key": "a"}));
    let expected = vec![
        row("", "a", "A", true),
        row("", "b", "B", false),
        row("", "c", "C", false),
    ];
    assert_eq!(pages_in(&out), expected);
    let fresh = ok(&mut s, json!({"type": "folder.tree"}));
    assert_eq!(pages_in(&fresh), expected);
    // The folder is still there, and empty.
    assert!(matches!(
        &fresh.tree.as_ref().unwrap().pages[0],
        TreeNode::Folder { path, children, .. } if path == "Projects" && children.is_empty()
    ));
    // Nothing links to C: it is gone from the tree.
    let out = ok(&mut s, json!({"type": "page.delete", "key": "c"}));
    assert!(pages_in(&out).iter().all(|r| r.1 != "c"));
}

#[test]
fn delete_refuses_when_file_changed_on_disk() {
    let (t, mut s) = folder(&[("pages/A.md", "- a\n")], &[]);
    put(t.path(), "pages/A.md", "- theirs\n");
    assert_eq!(
        code(&mut s, json!({"type": "page.delete", "key": "a"})),
        "changedOnDisk"
    );
    assert_eq!(read(&t, "pages/A.md"), "- theirs\n");
}

#[test]
fn folder_rename_moves_pages() {
    let (t, mut s) = folder(
        &[
            ("pages/Projects/X.md", "- x\n"),
            ("pages/Projects/Sub/Y.md", "- y\n"),
        ],
        &["pages/Work"],
    );
    ok(
        &mut s,
        json!({"type": "dir.rename", "path": "Projects", "to": "work/Projects"}),
    );
    assert_eq!(read(&t, "pages/Work/Projects/X.md"), "- x\n");
    assert_eq!(read(&t, "pages/Work/Projects/Sub/Y.md"), "- y\n");
    assert!(!exists(&t, "pages/Projects"));
    let (ws, _) = Workspace::open(t.path()).unwrap();
    assert_eq!(ws.page("x").unwrap().folder, "Work/Projects");
    drop(ws);
    // The session agrees: editing writes to the new place.
    let id = ok(&mut s, json!({"type": "page.get", "key": "y"}))
        .page
        .unwrap()
        .blocks[0]
        .id;
    ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "y2"}),
    );
    assert_eq!(read(&t, "pages/Work/Projects/Sub/Y.md"), "- y2\n");
    let out = ok(&mut s, json!({"type": "folder.tree"}));
    assert_eq!(top_folders(&out), ["Work"]);

    for (j, want) in [
        (
            json!({"type": "dir.rename", "path": "Work", "to": "Work/Sub"}),
            "intoItself",
        ),
        (
            json!({"type": "dir.rename", "path": "Work", "to": "work/projects/z"}),
            "intoItself",
        ),
        (
            json!({"type": "dir.rename", "path": "Work", "to": "Work"}),
            "intoItself",
        ),
        (
            json!({"type": "dir.rename", "path": "Nope", "to": "X"}),
            "unknownFolder",
        ),
        (
            json!({"type": "dir.rename", "path": "Work", "to": "Nope/X"}),
            "unknownFolder",
        ),
        (
            json!({"type": "dir.rename", "path": "Work/Projects/Sub", "to": "work"}),
            "folderExists",
        ),
        (
            json!({"type": "dir.rename", "path": "Work", "to": "a:b"}),
            "invalidName",
        ),
    ] {
        assert_eq!(code(&mut s, j.clone()), want, "{j}");
    }
}

#[test]
fn folder_rename_case_only() {
    let (t, mut s) = folder(&[("pages/projects/X.md", "- x\n")], &[]);
    let out = ok(
        &mut s,
        json!({"type": "dir.rename", "path": "projects", "to": "Projects"}),
    );
    assert_eq!(listing(&t, "pages"), ["Projects"]);
    assert_eq!(top_folders(&out), ["Projects"]);
    assert_eq!(read(&t, "pages/Projects/X.md"), "- x\n");
}

#[test]
fn folder_rename_refuses_a_name_a_file_holds() {
    let (t, mut s) = folder(&[("pages/A/X.md", "- x\n"), ("pages/notes", "plain")], &[]);
    assert_eq!(
        code(
            &mut s,
            json!({"type": "dir.rename", "path": "A", "to": "Notes"})
        ),
        "folderExists"
    );
    assert_eq!(read(&t, "pages/notes"), "plain");
    assert_eq!(read(&t, "pages/A/X.md"), "- x\n");
}

#[test]
fn folder_delete_only_when_empty() {
    let (t, mut s) = folder(
        &[
            ("pages/Projects/X.md", "- x\n"),
            ("pages/Img/image.png", "png"),
        ],
        &["pages/Empty"],
    );
    assert_eq!(
        code(&mut s, json!({"type": "dir.delete", "path": "Projects"})),
        "folderNotEmpty"
    );
    assert_eq!(
        code(&mut s, json!({"type": "dir.delete", "path": "Img"})),
        "folderNotEmpty"
    );
    assert_eq!(
        code(&mut s, json!({"type": "dir.delete", "path": "Nope"})),
        "unknownFolder"
    );
    let out = ok(&mut s, json!({"type": "dir.delete", "path": "empty"}));
    assert!(!exists(&t, "pages/Empty"));
    assert_eq!(top_folders(&out), ["Img", "Projects"]);
    assert_eq!(read(&t, "pages/Projects/X.md"), "- x\n");
    assert_eq!(read(&t, "pages/Img/image.png"), "png");
}

// OneDrive marks the folders it syncs read-only; Windows refuses to delete
// such a folder (os error 5) until the attribute is cleared.
#[test]
fn an_empty_read_only_folder_can_be_deleted() {
    let (t, mut s) = folder(
        &[(
            "pages/Keep.md",
            "- k
",
        )],
        &["pages/Foobar"],
    );
    let dir = t.path().join("pages/Foobar");
    let mut perms = fs::metadata(&dir).unwrap().permissions();
    perms.set_readonly(true);
    fs::set_permissions(&dir, perms).unwrap();
    ok(&mut s, json!({"type": "dir.delete", "path": "Foobar"}));
    assert!(!exists(&t, "pages/Foobar"));
}

#[test]
fn folder_delete_takes_untouched_new_pages_with_it() {
    let (t, mut s) = folder(&[], &["pages/Empty"]);
    ok(
        &mut s,
        json!({"type": "page.create", "name": "N", "folder": "Empty"}),
    );
    let out = ok(&mut s, json!({"type": "dir.delete", "path": "Empty"}));
    assert_eq!(out.removed, ["n"]);
    assert!(!exists(&t, "pages/Empty"));
    assert_eq!(
        code(&mut s, json!({"type": "page.show", "key": "n"})),
        "unknownPage"
    );
}

#[test]
fn refused_folder_delete_keeps_untouched_new_pages() {
    let (t, mut s) = folder(&[("pages/Dir/x.txt", "x")], &[]);
    ok(
        &mut s,
        json!({"type": "page.create", "name": "N", "folder": "Dir"}),
    );
    assert_eq!(
        code(&mut s, json!({"type": "dir.delete", "path": "Dir"})),
        "folderNotEmpty"
    );
    assert!(exists(&t, "pages/Dir/x.txt"));
    ok(&mut s, json!({"type": "page.show", "key": "n"}));
}

#[test]
fn folder_delete_refuses_a_folder_with_a_page_with_content() {
    let (t, mut s) = folder(&[("pages/Dir/P.md", "- a\n")], &[]);
    assert_eq!(
        code(&mut s, json!({"type": "dir.delete", "path": "Dir"})),
        "folderNotEmpty"
    );
    assert!(exists(&t, "pages/Dir/P.md"));
}

#[test]
fn names_with_brackets_are_refused_on_create_and_rename() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")], &[]);
    let before = snapshot(&t);
    assert_eq!(
        code(
            &mut s,
            json!({"type": "page.create", "name": "a]b", "folder": ""})
        ),
        "invalidName"
    );
    assert_eq!(
        code(
            &mut s,
            json!({"type": "page.rename", "key": "p", "name": "x[y"})
        ),
        "invalidName"
    );
    let e = cmd(
        &mut s,
        json!({"type": "page.rename", "key": "p", "name": "x[y"}),
    )
    .unwrap_err();
    assert!(
        e.message.contains("cannot contain [, ] or |"),
        "{}",
        e.message
    );
    assert_eq!(snapshot(&t), before);
}

#[test]
fn a_file_named_with_a_bracket_still_opens() {
    let (_t, mut s) = folder(&[("pages/a]b.md", "- x\n")], &[]);
    assert_eq!(
        ok(&mut s, json!({"type": "page.open", "name": "a]b"}))
            .page
            .unwrap()
            .name,
        "a]b"
    );
}

#[test]
fn rename_clears_history_of_touched_pages() {
    let (t, mut s) = folder(&[OLD, ("pages/B.md", "- see [[Old]]\n- x\n")], &[]);
    let id = ok(&mut s, json!({"type": "page.get", "key": "b"}))
        .page
        .unwrap()
        .blocks[1]
        .id;
    ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "y"}),
    );
    ok(
        &mut s,
        json!({"type": "page.rename", "key": "old", "name": "New"}),
    );
    assert_eq!(read(&t, "pages/B.md"), "- see [[New]]\n- y\n");
    ok(&mut s, json!({"type": "history.undo", "page": "b"}));
    assert_eq!(read(&t, "pages/B.md"), "- see [[New]]\n- y\n");
}

#[test]
fn a_title_line_goes_after_front_matter() {
    let fm = "---\ntags:\n  - x\n---\n";
    let (t, mut s) = folder(&[("pages/Old.md", &format!("{fm}- a\n"))], &[]);
    let out = ok(
        &mut s,
        json!({"type": "page.rename", "key": "old", "name": "a/b"}),
    );
    assert_eq!(
        read(&t, "pages/a_b.md"),
        "---\ntags:\n  - x\n---\ntitle:: a/b\n- a\n"
    );
    assert_eq!(out.page.unwrap().name, "a/b");
    ok(
        &mut s,
        json!({"type": "page.rename", "key": "a/b", "name": "Plain"}),
    );
    assert_eq!(read(&t, "pages/Plain.md"), format!("{fm}- a\n"));
}

#[test]
fn rename_still_rewrites_a_link_inside_front_matter() {
    let (t, mut s) = folder(
        &[
            OLD,
            (
                "pages/C.md",
                "---\nrelated: \"[[Old]]\"\ntags:\n  - x\n---\n- c\n",
            ),
        ],
        &[],
    );
    let out = ok(
        &mut s,
        json!({"type": "page.rename", "key": "old", "name": "New"}),
    );
    assert_eq!(
        read(&t, "pages/C.md"),
        "---\nrelated: \"[[New]]\"\ntags:\n  - x\n---\n- c\n"
    );
    assert_eq!(changed_keys(&out), ["c"]);
}

#[test]
fn a_name_listed_as_an_alias_is_refused() {
    let (t, mut s) = folder(
        &[
            ("pages/Kubernetes.md", "---\naliases: [k8s]\n---\n- k\n"),
            ("pages/Ops.md", "- o\n"),
        ],
        &[],
    );
    let before = snapshot(&t);
    assert_eq!(
        code(
            &mut s,
            json!({"type": "page.create", "name": "K8S", "folder": ""})
        ),
        "pageExists"
    );
    assert_eq!(
        code(
            &mut s,
            json!({"type": "page.rename", "key": "ops", "name": "k8s"})
        ),
        "pageExists"
    );
    assert_eq!(snapshot(&t), before);
    // Its own alias is allowed.
    ok(
        &mut s,
        json!({"type": "page.rename", "key": "kubernetes", "name": "k8s"}),
    );
    assert!(exists(&t, "pages/k8s.md"));
}

#[test]
fn renaming_a_page_with_breccias_block() {
    let lf = breccia_core::LineEnding::Lf;
    let block = |n: &str| breccia_core::aliases::alias_block(n, lf);
    let (t, mut s) = folder(
        &[(
            "pages/Q&A_ hiring.md",
            &format!("{}title:: Q&A: hiring\n- x\n", block("Q&A: hiring")),
        )],
        &[],
    );
    ok(
        &mut s,
        json!({"type": "page.rename", "key": "q&a: hiring", "name": "Hiring: 2026"}),
    );
    assert_eq!(
        read(&t, "pages/Hiring_ 2026.md"),
        format!("{}title:: Hiring: 2026\n- x\n", block("Hiring: 2026"))
    );
    assert!(!exists(&t, "pages/Q&A_ hiring.md"));
    ok(
        &mut s,
        json!({"type": "page.rename", "key": "hiring: 2026", "name": "Hiring"}),
    );
    assert_eq!(read(&t, "pages/Hiring.md"), "- x\n");
    // A rename never adds the block back.
    ok(
        &mut s,
        json!({"type": "page.rename", "key": "hiring", "name": "Hiring: 2027"}),
    );
    assert_eq!(
        read(&t, "pages/Hiring_ 2027.md"),
        "title:: Hiring: 2027\n- x\n"
    );
}

#[test]
fn a_rename_never_touches_front_matter_it_did_not_write() {
    let fm = "---\naliases:\n  - p\nowner: \"[[Anna]]\"\n---\n";
    for le in ["\n", "\r\n"] {
        let text = format!("{fm}- x\n").replace('\n', le);
        let (t, mut s) = folder(
            &[("pages/Plain.md", &text), ("pages/Anna.md", "- a\n")],
            &[],
        );
        ok(
            &mut s,
            json!({"type": "page.rename", "key": "plain", "name": "P: q"}),
        );
        // Saving writes LF (format §3); no other byte of the front matter changes.
        assert_eq!(
            read(&t, "pages/P_ q.md"),
            format!("{fm}title:: P: q\n- x\n"),
            "{le:?}"
        );
        assert_eq!(read(&t, "pages/Anna.md"), "- a\n");
    }
}

const K: (&str, &str) = (
    "pages/Kubernetes.md",
    "---\naliases:\n  - k8s\n---\n- the page\n",
);

#[test]
fn alias_links_stay_heading_links_follow() {
    let (t, mut s) = folder(
        &[
            K,
            (
                "pages/Ops.md",
                "- [[k8s]] [[Kubernetes#Setup]] [[k8s#Setup]]\n",
            ),
        ],
        &[],
    );
    ok(
        &mut s,
        json!({"type": "page.rename", "key": "kubernetes", "name": "Cluster"}),
    );
    assert_eq!(
        read(&t, "pages/Ops.md"),
        "- [[k8s]] [[Cluster#Setup]] [[k8s#Setup]]\n"
    );
    let (ws, _) = Workspace::open(t.path()).unwrap();
    assert_eq!(
        ws.link_target("k8s", breccia_core::inline::LinkKind::Page)
            .key,
        "cluster"
    );
}

#[test]
fn renaming_c_leaves_links_to_c_sharp_notes() {
    let (t, mut s) = folder(
        &[
            ("pages/C.md", "- c\n"),
            ("pages/C# notes.md", "- n\n"),
            ("pages/Ops.md", "- [[C# notes]] [[C#Intro]]\n"),
        ],
        &[],
    );
    ok(
        &mut s,
        json!({"type": "page.rename", "key": "c", "name": "Cee"}),
    );
    assert_eq!(read(&t, "pages/Ops.md"), "- [[C# notes]] [[Cee#Intro]]\n");
    ok(
        &mut s,
        json!({"type": "page.rename", "key": "c# notes", "name": "Sharp"}),
    );
    assert_eq!(read(&t, "pages/Ops.md"), "- [[Sharp]] [[Cee#Intro]]\n");
}

#[test]
fn a_dangling_heading_like_name_still_renames() {
    // With no page `Issue`, `[[Issue #42]]` names the page.
    let (t, mut s) = folder(
        &[
            ("pages/Issue #42.md", "- i\n"),
            ("pages/Ops.md", "- [[Issue #42]]\n"),
        ],
        &[],
    );
    ok(
        &mut s,
        json!({"type": "page.rename", "key": "issue #42", "name": "Bug 42"}),
    );
    assert_eq!(read(&t, "pages/Ops.md"), "- [[Bug 42]]\n");
}

#[test]
fn a_heading_link_is_left_alone_when_its_new_form_names_another_page() {
    let (t, mut s) = folder(
        &[
            ("pages/Old.md", "- o\n"),
            ("pages/Foo#H.md", "- a page named Foo#H\n"),
            ("pages/Bar.md", "---\naliases: [\"Foo#J\"]\n---\n- b\n"),
            ("pages/Ops.md", "- [[Old#H]] [[Old#J]] [[Old#K]] [[Old]]\n"),
        ],
        &[],
    );
    let out = ok(
        &mut s,
        json!({"type": "page.rename", "key": "old", "name": "Foo"}),
    );
    // `[[Foo#H]]` and `[[Foo#J]]` would open other pages, so those stay.
    assert_eq!(
        read(&t, "pages/Ops.md"),
        "- [[Old#H]] [[Old#J]] [[Foo#K]] [[Foo]]\n"
    );
    assert_eq!(changed_keys(&out), ["ops"]);
    assert_eq!(
        out.notices,
        [Notice::Refused {
            message: "1 links could not be updated".into()
        }]
    );
}

#[test]
fn a_heading_link_in_front_matter_follows_a_rename() {
    let fm = "---\nowner: \"[[Old#H]]\"\ntags:\n  - x # keep\n---\n";
    let (t, mut s) = folder(&[OLD, ("pages/C.md", &format!("{fm}- c\n"))], &[]);
    ok(
        &mut s,
        json!({"type": "page.rename", "key": "old", "name": "New"}),
    );
    assert_eq!(
        read(&t, "pages/C.md"),
        format!("{}- c\n", fm.replace("[[Old#H]]", "[[New#H]]"))
    );
}

// A page that is only linked to can be moved into a folder, which writes its file, empty.

#[test]
fn move_linked_only_page_writes_its_file() {
    let (t, mut s) = folder(&[("pages/B.md", "- [[Idea]]\n")], &["pages/Projects"]);
    let before = ok(&mut s, json!({"type": "folder.tree"}));
    assert!(pages_in(&before).contains(&row("", "idea", "Idea", true)));
    let out = ok(
        &mut s,
        json!({"type": "page.move", "key": "idea", "folder": "projects"}),
    );
    assert_eq!(read(&t, "pages/Projects/Idea.md"), "");
    assert!(!exists(&t, "pages/Idea.md"));
    assert_eq!(
        pages_in(&out),
        [
            row("Projects", "idea", "Idea", false),
            row("", "b", "B", false)
        ]
    );
    let page = out.page.unwrap();
    assert_eq!(page.key, "idea");
    assert!(page.blocks.is_empty());
    assert_eq!(read(&t, "pages/B.md"), "- [[Idea]]\n");
    // It is a normal page now, so it can be deleted.
    ok(&mut s, json!({"type": "page.delete", "key": "idea"}));
    assert!(!exists(&t, "pages/Projects/Idea.md"));
    let tree = ok(&mut s, json!({"type": "folder.tree"}));
    assert!(pages_in(&tree).contains(&row("", "idea", "Idea", true)));
}

#[test]
fn move_linked_only_page_with_a_title() {
    let (t, mut s) = folder(&[("pages/B.md", "- [[a:b]]\n")], &["pages/X"]);
    ok(
        &mut s,
        json!({"type": "page.move", "key": "a:b", "folder": "X"}),
    );
    assert_eq!(
        read(&t, "pages/X/a_b.md"),
        "---\naliases:\n  - \"a:b\"\n---\ntitle:: a:b\n"
    );
    assert_eq!(listing(&t, "pages/X"), ["a_b.md"]);
}

#[test]
fn move_linked_only_page_onto_a_taken_stem() {
    let (t, mut s) = folder(
        &[
            ("pages/B.md", "- [[Idea]]\n"),
            ("pages/X/Idea.md", "title:: Other\n- o\n"),
        ],
        &[],
    );
    ok(
        &mut s,
        json!({"type": "page.move", "key": "idea", "folder": "X"}),
    );
    assert_eq!(read(&t, "pages/X/Idea 2.md"), "title:: Idea\n");
    assert_eq!(read(&t, "pages/X/Idea.md"), "title:: Other\n- o\n");
}

#[test]
fn empty_page_file_is_a_page() {
    let files = [("pages/B.md", "- [[Idea]]\n"), ("pages/X/Idea.md", "")];
    let (t, mut s) = folder(&files, &[]);
    let expected = [row("X", "idea", "Idea", false), row("", "b", "B", false)];
    assert_eq!(
        pages_in(&ok(&mut s, json!({"type": "folder.tree"}))),
        expected
    );
    // After a reopen too.
    let (ws, _) = Workspace::open(t.path()).unwrap();
    assert_eq!(ws.page("idea").unwrap().folder, "X");
    assert!(ws.page("idea").unwrap().has_file());
    drop(ws);
    ok(&mut s, json!({"type": "folder.open", "path": t.path()}));
    assert_eq!(
        pages_in(&ok(&mut s, json!({"type": "folder.tree"}))),
        expected
    );
    // Deleted from outside while still linked: a linked-only row again.
    fs::remove_file(t.path().join("pages/X/Idea.md")).unwrap();
    ok(
        &mut s,
        json!({"type": "files.changed", "paths": ["pages/X/Idea.md"]}),
    );
    let tree = ok(&mut s, json!({"type": "folder.tree"}));
    assert_eq!(
        pages_in(&tree),
        [row("", "b", "B", false), row("", "idea", "Idea", true)]
    );
    // Written from outside, empty: the watcher lists it as a page in X.
    put(t.path(), "pages/X/Idea.md", "");
    ok(
        &mut s,
        json!({"type": "files.changed", "paths": ["pages/X/Idea.md"]}),
    );
    assert_eq!(
        pages_in(&ok(&mut s, json!({"type": "folder.tree"}))),
        expected
    );
}

#[test]
fn empty_page_file_is_kept() {
    let (t, mut s) = folder(&[("pages/B.md", "- [[Idea]]\n- b\n")], &["pages/X"]);
    ok(
        &mut s,
        json!({"type": "page.move", "key": "idea", "folder": "X"}),
    );
    let b = ok(&mut s, json!({"type": "page.get", "key": "b"}))
        .page
        .unwrap();
    ok(&mut s, json!({"type": "page.get", "key": "idea"}));
    ok(
        &mut s,
        json!({"type": "block.setText", "id": b.blocks[1].id, "text": "b2"}),
    );
    assert_eq!(read(&t, "pages/B.md"), "- [[Idea]]\n- b2\n");
    assert_eq!(read(&t, "pages/X/Idea.md"), "");
    // "Start writing": a first block, blank, leaves the file empty.
    let out = ok(
        &mut s,
        json!({"type": "block.insert", "page": "idea", "after": null, "text": ""}),
    );
    assert_eq!(read(&t, "pages/X/Idea.md"), "");
    let id = out.page.unwrap().blocks[0].id;
    ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "hi"}),
    );
    assert_eq!(read(&t, "pages/X/Idea.md"), "- hi\n");
}

#[test]
fn move_linked_only_page_to_the_top_level_writes_nothing() {
    let (t, mut s) = folder(&[("pages/B.md", "- [[Idea]]\n")], &["pages/X"]);
    let before = snapshot(&t);
    ok(
        &mut s,
        json!({"type": "page.move", "key": "idea", "folder": ""}),
    );
    assert_eq!(snapshot(&t), before);
    let tree = ok(&mut s, json!({"type": "folder.tree"}));
    assert!(pages_in(&tree).contains(&row("", "idea", "Idea", true)));
}

#[test]
fn move_linked_only_refusals() {
    let (t, mut s) = folder(&[("pages/B.md", "- [[Idea]]\n")], &["pages/X"]);
    let before = snapshot(&t);
    assert_eq!(
        code(
            &mut s,
            json!({"type": "page.move", "key": "idea", "folder": "Nope"})
        ),
        "unknownFolder"
    );
    assert_eq!(
        code(
            &mut s,
            json!({"type": "page.move", "key": "nobody", "folder": "X"})
        ),
        "unknownPage"
    );
    assert_eq!(snapshot(&t), before);
}

#[test]
fn opened_blank_page_moves_and_gets_a_file() {
    let (t, mut s) = folder(&[("pages/B.md", "- [[Idea]]\n")], &["pages/Projects"]);
    ok(&mut s, json!({"type": "page.open", "name": "Idea"}));
    let out = ok(
        &mut s,
        json!({"type": "page.move", "key": "idea", "folder": "Projects"}),
    );
    assert_eq!(read(&t, "pages/Projects/Idea.md"), "");
    assert!(!exists(&t, "pages/Idea.md"));
    assert!(pages_in(&out).contains(&row("Projects", "idea", "Idea", false)));
}

#[test]
fn page_view_says_whether_the_page_has_a_file() {
    let (_t, mut s) = folder(&[("pages/B.md", "- [[Idea]]\n")], &["pages/X"]);
    let blank = ok(&mut s, json!({"type": "page.open", "name": "Idea"}));
    assert!(!blank.page.unwrap().has_file);
    let moved = ok(
        &mut s,
        json!({"type": "page.move", "key": "idea", "folder": "X"}),
    );
    assert!(moved.page.unwrap().has_file);
    // The last field on the wire, after the blocks.
    let b = ok(&mut s, json!({"type": "page.get", "key": "b"}))
        .page
        .unwrap();
    let wire = serde_json::to_string(&b).unwrap();
    assert!(wire.ends_with(",\"hasFile\":true}"), "{wire}");
}
