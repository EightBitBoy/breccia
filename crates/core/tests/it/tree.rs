use crate::support::{self, DAY, clock_on, put, run};
use breccia_core::session::{JournalDay, TagEntry, TreeNode};
use breccia_core::{Clock, Command, CommandError, Output, Session};
use serde_json::{Value, json};
use std::fs;
use tempfile::TempDir;

fn clock(ms: u64) -> Clock {
    clock_on(DAY, ms)
}

fn cmd(s: &mut Session, json: Value) -> Result<Output, CommandError> {
    run(s, json, clock(0))
}

fn ok(s: &mut Session, json: Value) -> Output {
    support::ok(s, json, clock(0))
}

fn code(s: &mut Session, json: Value) -> String {
    cmd(s, json).unwrap_err().code
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

fn f(name: &str, path: &str, children: Vec<TreeNode>) -> TreeNode {
    TreeNode::Folder {
        name: name.into(),
        path: path.into(),
        children,
    }
}

fn p(key: &str, name: &str) -> TreeNode {
    TreeNode::Page {
        key: key.into(),
        name: name.into(),
        linked_only: false,
    }
}

/// A page that is only linked to: no file, no text of its own.
fn lp(key: &str, name: &str) -> TreeNode {
    TreeNode::Page {
        key: key.into(),
        name: name.into(),
        linked_only: true,
    }
}

/// Inserts a first block into the page and sets its text, as the editor does.
fn write_first_text(s: &mut Session, key: &str, text: &str) -> Output {
    let out = ok(
        s,
        json!({"type": "block.insert", "page": key, "after": null, "text": ""}),
    );
    assert!(out.tree.is_none());
    let id = out.page.unwrap().blocks[0].id;
    ok(s, json!({"type": "block.setText", "id": id, "text": text}))
}

#[test]
fn tree_lists_folders_first_case_insensitively() {
    let (_t, mut s) = folder(
        &[
            ("pages/b.md", "- x\n"),
            ("pages/A.md", "- x\n"),
            ("pages/Projects/X.md", "- x\n"),
            ("pages/people/Anna.md", "- x\n"),
        ],
        &["pages/Empty"],
    );
    let tree = ok(&mut s, json!({"type": "folder.tree"})).tree.unwrap();
    assert_eq!(
        tree.pages,
        vec![
            f("Empty", "Empty", vec![]),
            f("people", "people", vec![p("anna", "Anna")]),
            f("Projects", "Projects", vec![p("x", "X")]),
            p("a", "A"),
            p("b", "b"),
        ]
    );
}

#[test]
fn tree_groups_journals_newest_first() {
    let (_t, mut s) = folder(
        &[
            ("journals/2025-12-31.md", "- x\n"),
            ("journals/2026-10-27.md", "- x\n"),
            ("journals/2026-10-29.md", "- x\n"),
        ],
        &[],
    );
    let tree = ok(&mut s, json!({"type": "folder.tree"})).tree.unwrap();
    let years: Vec<_> = tree.journals.iter().map(|y| y.year).collect();
    assert_eq!(years, [2026, 2025]);
    let oct = &tree.journals[0].months;
    assert_eq!(oct.len(), 1);
    assert_eq!((oct[0].month, oct[0].label.as_str()), (10, "October"));
    assert_eq!(
        oct[0].days,
        vec![
            JournalDay {
                key: "2026-10-29".into(),
                title: "Thursday, 29 Oct 2026".into()
            },
            JournalDay {
                key: "2026-10-27".into(),
                title: "Tuesday, 27 Oct 2026".into()
            },
        ]
    );
    let dec = &tree.journals[1].months;
    assert_eq!((dec[0].month, dec[0].label.as_str()), (12, "December"));
    assert_eq!(dec[0].days.len(), 1);
}

#[test]
fn tree_serializes_with_kind_tags() {
    let (_t, mut s) = folder(&[("pages/D/X.md", "- x\n")], &[]);
    let tree = ok(&mut s, json!({"type": "folder.tree"})).tree.unwrap();
    assert_eq!(
        serde_json::to_value(&tree).unwrap()["pages"],
        json!([{"kind": "folder", "name": "D", "path": "D",
                "children": [{"kind": "page", "key": "x", "name": "X", "linkedOnly": false}]}])
    );
}

#[test]
fn a_page_enters_the_tree_with_its_first_text() {
    let (_t, mut s) = folder(&[], &[]);
    let out = ok(&mut s, json!({"type": "page.open", "name": "Ghost"}));
    assert!(out.tree.is_none());
    let tree = ok(&mut s, json!({"type": "folder.tree"})).tree.unwrap();
    assert!(tree.pages.is_empty());
    let out = write_first_text(&mut s, "ghost", "x");
    assert_eq!(out.tree.unwrap().pages, vec![p("ghost", "Ghost")]);
    // Further edits do not resend it.
    let id = ok(&mut s, json!({"type": "page.get", "key": "ghost"}))
        .page
        .unwrap()
        .blocks[0]
        .id;
    let out = ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "xy"}),
    );
    assert!(out.tree.is_none());
}

#[test]
fn create_page_in_a_folder() {
    let (t, mut s) = folder(&[], &["pages/Projects"]);
    let out = ok(
        &mut s,
        json!({"type": "page.create", "name": "Plan", "folder": "Projects"}),
    );
    assert_eq!(out.page.unwrap().key, "plan");
    let out = write_first_text(&mut s, "plan", "x");
    assert_eq!(
        fs::read_to_string(t.path().join("pages/Projects/Plan.md")).unwrap(),
        "- x\n"
    );
    assert_eq!(
        out.tree.unwrap().pages,
        vec![f("Projects", "Projects", vec![p("plan", "Plan")])]
    );
}

#[test]
fn create_page_takes_a_free_stem_in_its_folder() {
    let (t, mut s) = folder(&[("pages/Projects/Plan_.md", "- a\n")], &[]);
    // `Plan?` maps to the taken file name `Plan_.md`; only its folder counts.
    ok(
        &mut s,
        json!({"type": "page.create", "name": "Plan?", "folder": "Projects"}),
    );
    write_first_text(&mut s, "plan?", "y");
    assert_eq!(
        fs::read_to_string(t.path().join("pages/Projects/Plan_ 2.md")).unwrap(),
        "---\naliases:\n  - \"Plan?\"\n---\ntitle:: Plan?\n- y\n"
    );
}

#[test]
fn create_page_refusals() {
    let (t, mut s) = folder(&[("pages/people/Anna.md", "- x\n")], &[]);
    let c =
        |name: &str, folder: &str| json!({"type": "page.create", "name": name, "folder": folder});
    assert_eq!(code(&mut s, c("anna", "")), "pageExists");
    assert_eq!(code(&mut s, c("2026-10-29", "")), "invalidName");
    assert_eq!(code(&mut s, c("New", "Nope")), "unknownFolder");
    assert!(!t.path().join("pages/Nope").exists());
    assert!(!t.path().join("pages/New.md").exists());
    assert!(!t.path().join("journals").exists());
}

#[test]
fn create_folder() {
    let (t, mut s) = folder(&[], &[]);
    let out = ok(
        &mut s,
        json!({"type": "dir.create", "path": "Projects/2027"}),
    );
    assert!(t.path().join("pages/Projects/2027").is_dir());
    assert_eq!(
        out.tree.unwrap().pages,
        vec![f(
            "Projects",
            "Projects",
            vec![f("2027", "Projects/2027", vec![])]
        )]
    );
    assert_eq!(
        code(
            &mut s,
            json!({"type": "dir.create", "path": "projects/2027"})
        ),
        "folderExists"
    );
    assert_eq!(
        code(&mut s, json!({"type": "dir.create", "path": "a:b"})),
        "invalidName"
    );
    // A new folder under an existing one keeps its spelling.
    ok(
        &mut s,
        json!({"type": "dir.create", "path": "projects/2028"}),
    );
    assert!(t.path().join("pages/Projects/2028").is_dir());
}

#[test]
fn command_names_deserialize() {
    for j in [
        json!({"type":"folder.tree"}),
        json!({"type":"page.create","name":"a","folder":""}),
        json!({"type":"dir.create","path":"a"}),
    ] {
        serde_json::from_value::<Command>(j).unwrap();
    }
}

#[test]
fn linked_only_pages_are_listed_at_the_top_level_alphabetically() {
    let (_t, mut s) = folder(
        &[
            (
                "pages/Projects/Plan.md",
                "- see [[zeta]] and [[Anna]]
- #urgent only a tag
- [[2026-10-29]] a journal
",
            ),
            (
                "pages/Bob.md",
                "- [[Plan]] [[bob]]
",
            ),
            (
                "journals/2026-10-29.md",
                "- met [[Carl]]
",
            ),
        ],
        &[],
    );
    let tree = ok(&mut s, json!({"type": "folder.tree"})).tree.unwrap();
    assert_eq!(
        tree.pages,
        vec![
            f("Projects", "Projects", vec![p("plan", "Plan")]),
            lp("anna", "Anna"),
            p("bob", "Bob"),
            lp("carl", "Carl"),
            lp("zeta", "zeta"),
        ]
    );
}

#[test]
fn the_tree_is_resent_when_the_linked_only_pages_change() {
    let (_t, mut s) = folder(
        &[(
            "pages/A.md",
            "- x
",
        )],
        &[],
    );
    let id = ok(&mut s, json!({"type": "page.get", "key": "a"}))
        .page
        .unwrap()
        .blocks[0]
        .id;
    let set = |s: &mut Session, text: &str| {
        ok(s, json!({"type": "block.setText", "id": id, "text": text}))
    };
    assert_eq!(
        set(&mut s, "x [[New]]").tree.unwrap().pages,
        vec![p("a", "A"), lp("new", "New")]
    );
    // Text that changes no link sends no tree.
    assert!(set(&mut s, "xy [[New]]").tree.is_none());
    // A tag goes to the Tags section, not to the pages.
    let tree = set(&mut s, "xy [[New]] #tag").tree.unwrap();
    assert_eq!(tree.pages, vec![p("a", "A"), lp("new", "New")]);
    assert_eq!(tree.tags.len(), 1);
    assert_eq!(set(&mut s, "xy").tree.unwrap().pages, vec![p("a", "A")]);
}

#[test]
fn a_linked_only_page_leaves_the_list_when_it_gets_a_file() {
    let (_t, mut s) = folder(
        &[(
            "pages/A.md",
            "- [[New]]
",
        )],
        &[],
    );
    ok(&mut s, json!({"type": "page.open", "name": "New"}));
    let out = write_first_text(&mut s, "new", "own text");
    assert_eq!(out.tree.unwrap().pages, vec![p("a", "A"), p("new", "New")]);
}

#[test]
fn the_all_pages_table_has_linked_only_rows() {
    let (_t, mut s) = folder(
        &[(
            "pages/A.md",
            "- [[New]]
- [[New]] again #tag
",
        )],
        &[],
    );
    let table = ok(&mut s, json!({"type": "pages.table"})).table.unwrap();
    let rows: Vec<_> = table
        .iter()
        .map(|r| {
            (
                r.key.as_str(),
                r.name.as_str(),
                r.linked_only,
                r.linked_from,
                r.edited.is_none(),
            )
        })
        .collect();
    assert_eq!(
        rows,
        [
            ("a", "A", false, 0, false),
            ("new", "New", true, 2, true),
            ("tag", "tag", true, 1, true)
        ]
    );
}

fn tag(key: &str, name: &str, count: usize, linked_only: bool) -> TagEntry {
    TagEntry {
        key: key.into(),
        name: name.into(),
        count,
        linked_only,
    }
}

#[test]
fn the_tags_section_lists_every_tag_with_its_blocks() {
    let (_t, mut s) = folder(
        &[
            (
                "pages/A.md",
                "- #infra and #infra again\n- #Infra too\n- #2026-10-29 a day\n",
            ),
            ("pages/B.md", "- [[infra]] #ops\n  - child #ops\n"),
            ("pages/Ops.md", "- x\n"),
        ],
        &[],
    );
    let tree = ok(&mut s, json!({"type": "folder.tree"})).tree.unwrap();
    assert_eq!(
        tree.tags,
        vec![tag("infra", "infra", 2, true), tag("ops", "Ops", 2, false)]
    );
    // A tag also linked as [[…]] is a linked-only page as well.
    assert!(tree.pages.contains(&lp("infra", "infra")));
    assert_eq!(
        serde_json::to_value(&tree).unwrap()["tags"][1],
        json!({"key": "ops", "name": "Ops", "count": 2, "linkedOnly": false})
    );
}

#[test]
fn the_tree_is_resent_when_the_tags_change() {
    let (_t, mut s) = folder(&[("pages/A.md", "- x\n- y\n")], &[]);
    let blocks = ok(&mut s, json!({"type": "page.get", "key": "a"}))
        .page
        .unwrap()
        .blocks;
    let (a, b) = (blocks[0].id, blocks[1].id);
    let set = |s: &mut Session, id, text: &str| {
        ok(s, json!({"type": "block.setText", "id": id, "text": text}))
    };
    assert_eq!(
        set(&mut s, a, "x #todo").tree.unwrap().tags,
        vec![tag("todo", "todo", 1, true)]
    );
    assert!(set(&mut s, a, "xx #todo").tree.is_none());
    assert_eq!(
        set(&mut s, b, "y #todo").tree.unwrap().tags,
        vec![tag("todo", "todo", 2, true)]
    );
    assert!(set(&mut s, a, "xx").tree.unwrap().tags.len() == 1);
}

#[test]
fn the_all_pages_table_has_tag_only_rows() {
    let (_t, mut s) = folder(&[("pages/A.md", "- #urgent\n- [[Both]] #both\n")], &[]);
    let table = ok(&mut s, json!({"type": "pages.table"})).table.unwrap();
    let rows: Vec<_> = table
        .iter()
        .map(|r| (r.key.as_str(), r.linked_only))
        .collect();
    assert_eq!(rows, [("a", false), ("both", true), ("urgent", true)]);
}

#[test]
fn a_tag_without_a_page_can_be_renamed() {
    let (t, mut s) = folder(&[("pages/A.md", "- #urgent and [[Topic]]\n")], &[]);
    let reach = ok(
        &mut s,
        json!({"type": "page.renameReach", "key": "urgent", "name": "Important"}),
    )
    .reach;
    assert_eq!(reach, Some(1));
    ok(
        &mut s,
        json!({"type": "page.rename", "key": "urgent", "name": "Important"}),
    );
    ok(
        &mut s,
        json!({"type": "page.rename", "key": "topic", "name": "Subject"}),
    );
    assert_eq!(
        fs::read_to_string(t.path().join("pages/A.md")).unwrap(),
        "- #Important and [[Subject]]\n"
    );
    assert!(!t.path().join("pages/Important.md").exists());
    assert!(!t.path().join("pages/Subject.md").exists());
}

#[test]
fn every_tree_carries_a_newer_version_than_the_one_before() {
    let (_t, mut s) = folder(&[("pages/A.md", "- a\n")], &[]);
    let first = ok(&mut s, json!({"type": "folder.tree"})).tree.unwrap();
    let second = ok(&mut s, json!({"type": "folder.tree"})).tree.unwrap();
    assert!(second.version > first.version);
}

#[test]
fn a_blank_page_name_makes_no_page_and_no_file() {
    let (t, mut s) = folder(&[], &[]);
    for name in ["", " ", "   \t "] {
        let c = code(
            &mut s,
            json!({"type": "page.create", "name": name, "folder": ""}),
        );
        assert_eq!(c, "invalidName", "{name:?}");
    }
    // Nothing was made: no pages folder entry at all.
    assert_eq!(
        fs::read_dir(t.path().join("pages")).map_or(0, |r| r.count()),
        0
    );
}

#[test]
fn a_dot_dot_in_a_folder_path_never_leaves_the_pages_folder() {
    let (t, mut s) = folder(&[("pages/A/B.md", "- b\n")], &[]);
    let outside = t.path().parent().unwrap().to_path_buf();
    for path in [
        "..",
        "../Outside",
        "A/../../Outside",
        "A/..",
        "./A",
        "A/./C",
    ] {
        let c = cmd(&mut s, json!({"type": "dir.create", "path": path}));
        assert!(
            c.is_err(),
            "dir.create {path:?} should be refused, got {c:?}"
        );
    }
    let c = cmd(
        &mut s,
        json!({"type": "page.create", "name": "X", "folder": ".."}),
    );
    assert!(c.is_err(), "{c:?}");
    // Nothing was made beside the notes folder or inside it.
    assert!(!outside.join("Outside").exists());
    assert!(!t.path().join("Outside").exists());
    assert!(!t.path().join("pages/Outside").exists());
    assert!(!t.path().join("pages/X.md").exists());
}

#[test]
fn creating_a_page_next_to_a_file_with_a_capital_extension_never_overwrites_it() {
    // `A.MD` is reported and not loaded; its bytes are not Breccia's to touch.
    let (t, mut s) = folder(&[("pages/A.MD", "- theirs\n")], &[]);
    ok(
        &mut s,
        json!({"type": "page.create", "name": "a", "folder": ""}),
    );
    write_first_text(&mut s, "a", "mine");
    assert_eq!(
        fs::read(t.path().join("pages/A.MD")).unwrap(),
        b"- theirs\n"
    );
    // The new page got a file of its own.
    let names: Vec<String> = fs::read_dir(t.path().join("pages"))
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(names.len(), 2, "{names:?}");
}
