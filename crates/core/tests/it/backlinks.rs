use breccia_core::inline::LinkKind;
use breccia_core::render::crumb;
use breccia_core::{Clock, Output, Session, Workspace};
use chrono::NaiveDate;
use serde_json::{Value, json};
use std::fs;
use std::path::Path;
use tempfile::TempDir;

fn put(root: &Path, rel: &str, text: &str) {
    let p = root.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
}

fn dir(files: &[(&str, &str)]) -> TempDir {
    let t = tempfile::tempdir().unwrap();
    for (rel, text) in files {
        put(t.path(), rel, text);
    }
    t
}

fn cmd(s: &mut Session, command: Value) -> Output {
    cmd_at(s, command, 0)
}

fn cmd_at(s: &mut Session, command: Value, ms: u64) -> Output {
    let req =
        serde_json::from_value(json!({"generation": s.generation(), "command": command})).unwrap();
    let clock = Clock {
        today: NaiveDate::from_ymd_opt(2026, 10, 29).unwrap(),
        time: chrono::NaiveTime::from_hms_opt(14, 5, 9).unwrap(),
        ms,
    };
    s.run(req, clock).unwrap()
}

fn session(t: &TempDir) -> Session {
    let mut s = Session::new();
    cmd(&mut s, json!({"type": "folder.open", "path": t.path()}));
    s
}

#[test]
fn backlinks_group_by_page_journals_newest_first() {
    let t = dir(&[
        ("pages/Anna.md", "- self [[Anna]]\n"),
        ("pages/Zed.md", "- see [[anna]]\n"),
        (
            "pages/Bob.md",
            "- #Anna\n- x\n  owner:: [[Anna]]\n- `[[Anna]]`\n- y\n  owner:: Anna\n",
        ),
        ("journals/2026-10-27.md", "- [[Anna]]\n"),
        ("journals/2026-10-29.md", "- [[ANNA]] hi\n"),
    ]);
    let (ws, _) = Workspace::open(t.path()).unwrap();
    let bl = ws.backlinks("anna");
    let keys: Vec<&str> = bl.iter().map(|b| b.page.key.as_str()).collect();
    assert_eq!(keys, ["bob", "zed", "2026-10-29", "2026-10-27"]);
    let bob = ws.page("bob").unwrap();
    let first_two: Vec<_> = bob.doc.blocks()[..2].iter().map(|b| b.id()).collect();
    assert_eq!(bl[0].roots, first_two);
}

#[test]
fn a_linking_subtree_is_shown_once() {
    let t = dir(&[("pages/P.md", "- [[A]] parent\n\t- [[A]] child\n\t- other\n")]);
    let (ws, _) = Workspace::open(t.path()).unwrap();
    let bl = ws.backlinks("a");
    assert_eq!(bl.len(), 1);
    let parent = ws.page("p").unwrap().doc.blocks()[0].id();
    assert_eq!(bl[0].roots, [parent]);
}

#[test]
fn index_follows_edits() {
    let t = dir(&[("pages/P.md", "- see [[A]]\n")]);
    let mut s = session(&t);
    cmd(&mut s, json!({"type": "page.open", "name": "A"}));
    let count = |s: &mut Session| {
        cmd(s, json!({"type": "page.refs", "key": "a"}))
            .refs
            .unwrap()
            .groups
            .len()
    };
    assert_eq!(count(&mut s), 1);
    let id = cmd(&mut s, json!({"type": "page.get", "key": "p"}))
        .page
        .unwrap()
        .blocks[0]
        .id;
    cmd(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "see nothing"}),
    );
    assert_eq!(count(&mut s), 0);
    // A pause between the two edits, so each is its own undo step; the
    // `page.refs` query between them does not end a run of typing.
    cmd_at(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "see #a"}),
        5000,
    );
    assert_eq!(count(&mut s), 1);
    cmd(&mut s, json!({"type": "history.undo", "page": "p"}));
    assert_eq!(count(&mut s), 0);
}

#[test]
fn page_names_include_link_targets_but_not_journals() {
    let t = dir(&[("pages/A.md", "- [[New thing]] #tag [[2026-10-29]]\n")]);
    let (ws, _) = Workspace::open(t.path()).unwrap();
    let names = ws.page_names();
    let keys: Vec<&str> = names.iter().map(|n| n.key.as_str()).collect();
    assert_eq!(keys, ["a", "new thing", "tag"]);
    let exists: Vec<bool> = names.iter().map(|n| n.exists).collect();
    assert_eq!(exists, [true, false, false]);
    assert_eq!(names[1].name, "New thing");
}

#[test]
fn crumbs_show_link_text_and_are_cut() {
    assert_eq!(
        crumb("see [[2026-10-29]] and #[[Ben B]]\nowner:: x"),
        "see Thursday, 29 Oct 2026 and #Ben B"
    );
    assert_eq!(crumb(&"x".repeat(50)), format!("{}…", "x".repeat(40)));
    assert_eq!(crumb("  #x and [[Y]] "), "#x and Y");
}

#[test]
fn page_refs_view() {
    let t = dir(&[
        ("pages/A.md", "- body\n"),
        (
            "journals/2026-10-29.md",
            "- parent\n\t- [[A]] child\n\t\t- grandchild\n",
        ),
    ]);
    let mut s = session(&t);
    let out = cmd(&mut s, json!({"type": "page.refs", "key": "a"}));
    let refs = out.refs.unwrap();
    assert_eq!(refs.count, 1);
    let v = serde_json::to_value(&refs).unwrap();
    assert_eq!(v["groups"][0]["title"], "Thursday, 29 Oct 2026");
    assert_eq!(v["groups"][0]["kind"], "journal");
    assert_eq!(v["groups"][0]["refs"][0]["crumbs"], json!(["parent"]));
    let depths: Vec<u64> = v["groups"][0]["refs"][0]["blocks"]
        .as_array()
        .unwrap()
        .iter()
        .map(|b| b["depth"].as_u64().unwrap())
        .collect();
    assert_eq!(depths, [0, 1]);
}

#[test]
fn pages_list_command() {
    let t = dir(&[("pages/A.md", "- [[New thing]]\n")]);
    let mut s = session(&t);
    let out = cmd(&mut s, json!({"type": "pages.list"}));
    let v = serde_json::to_value(out.names.unwrap()).unwrap();
    assert_eq!(
        v,
        json!([
            {"key": "a", "name": "A", "exists": true},
            {"key": "new thing", "name": "New thing", "exists": false}
        ])
    );
}

fn open(files: &[(&str, &str)]) -> (TempDir, Workspace) {
    let t = dir(files);
    let (mut ws, _) = Workspace::open(t.path()).unwrap();
    ws.take_touched();
    (t, ws)
}

fn roots(ws: &Workspace, target: &str) -> Vec<(String, Vec<breccia_core::BlockId>)> {
    ws.backlinks(target)
        .iter()
        .map(|b| (b.page.key.clone(), b.roots.clone()))
        .collect()
}

#[test]
fn split_keeps_the_link_index_fresh() {
    let (_t, mut ws) = open(&[("pages/P.md", "- see [[A]] and [[B]]\n")]);
    let id = ws.page("p").unwrap().doc.blocks()[0].id();
    let at = "see [[A]] and ".len();
    let new = ws
        .edit("p", |d, ids| d.split(id, at, ids))
        .unwrap()
        .unwrap();
    assert_eq!(roots(&ws, "a"), [("p".to_string(), vec![id])]);
    assert_eq!(roots(&ws, "b"), [("p".to_string(), vec![new])]);
    assert_eq!(ws.take_touched(), ["p"]);
}

#[test]
fn merge_keeps_the_link_index_fresh() {
    let (_t, mut ws) = open(&[("pages/P.md", "- x\n- see [[B]]\n")]);
    let b = ws
        .page("p")
        .unwrap()
        .doc
        .blocks()
        .iter()
        .map(|b| b.id())
        .collect::<Vec<_>>();
    assert_eq!(roots(&ws, "b"), [("p".to_string(), vec![b[1]])]);
    ws.edit("p", |d, ids| d.merge_into_previous(b[1], ids))
        .unwrap()
        .unwrap();
    assert_eq!(roots(&ws, "b"), [("p".to_string(), vec![b[0]])]);
    assert_eq!(ws.take_touched(), ["p"]);
}

#[test]
fn paste_keeps_the_link_index_fresh() {
    let (_t, mut ws) = open(&[("pages/P.md", "- start\n")]);
    let id = ws.page("p").unwrap().doc.blocks()[0].id();
    ws.edit("p", |d, ids| d.paste(id, 0, "a [[C]]\n- b [[D]]", ids))
        .unwrap()
        .unwrap();
    let blocks: Vec<_> = ws
        .page("p")
        .unwrap()
        .doc
        .blocks()
        .iter()
        .map(|b| b.id())
        .collect();
    assert_eq!(blocks.len(), 2);
    assert_eq!(roots(&ws, "c"), [("p".to_string(), vec![blocks[0]])]);
    assert_eq!(roots(&ws, "d"), [("p".to_string(), vec![blocks[1]])]);
    assert_eq!(ws.take_touched(), ["p"]);
}

#[test]
fn reload_keeps_the_link_index_fresh() {
    let (t, mut ws) = open(&[("pages/P.md", "- [[A]]\n")]);
    assert_eq!(ws.backlinks("a").len(), 1);
    put(t.path(), "pages/P.md", "- [[B]]\n");
    ws.apply_disk_changes(&[std::path::PathBuf::from("pages/P.md")]);
    let id = ws.page("p").unwrap().doc.blocks()[0].id();
    assert!(ws.backlinks("a").is_empty());
    assert_eq!(roots(&ws, "b"), [("p".to_string(), vec![id])]);
    assert_eq!(ws.take_touched(), ["p"]);
}

#[test]
fn rekey_moves_the_links_with_the_page() {
    let (_t, mut ws) = open(&[("pages/P.md", "- [[A]]\n")]);
    ws.rename_page("p", "Q").unwrap();
    let id = ws.page("q").unwrap().doc.blocks()[0].id();
    assert_eq!(roots(&ws, "a"), [("q".to_string(), vec![id])]);
    assert_eq!(ws.links_out("q"), 1);
    assert_eq!(ws.links_out("p"), 0);
    assert_eq!(ws.take_touched(), ["p", "q"]);
}

const K: &str = "---\naliases:\n  - k8s\n---\n- the page\n";

#[test]
fn an_alias_link_is_a_backlink() {
    let t = dir(&[
        ("pages/Kubernetes.md", K),
        (
            "pages/Ops.md",
            "- see [[k8s]]\n- and #K8S\n- and [[Kubernetes]]\n",
        ),
    ]);
    let (ws, _) = Workspace::open(t.path()).unwrap();
    let bl = ws.backlinks("kubernetes");
    assert_eq!(bl.len(), 1);
    assert_eq!(bl[0].page.key, "ops");
    let ops = ws.page("ops").unwrap();
    let all: Vec<_> = ops.doc.blocks().iter().map(|b| b.id()).collect();
    assert_eq!(bl[0].roots, all);
    assert_eq!(ws.linked_from("kubernetes"), 3);
    assert!(ws.backlinks("k8s").is_empty());
    assert_eq!(ws.links_out("ops"), 1);
}

#[test]
fn a_page_beats_an_alias() {
    let t = dir(&[
        ("pages/Kubernetes.md", K),
        ("pages/k8s.md", "- own page\n"),
        ("pages/Ops.md", "- see [[k8s]]\n"),
    ]);
    let (ws, _) = Workspace::open(t.path()).unwrap();
    assert_eq!(ws.linked_from("k8s"), 1);
    assert_eq!(ws.linked_from("kubernetes"), 0);
    assert_eq!(ws.link_target("k8s", LinkKind::Page).key, "k8s");
}

#[test]
fn the_first_page_wins_a_shared_alias() {
    let t = dir(&[
        ("pages/A.md", "---\naliases: [x]\n---\n- a\n"),
        ("pages/B.md", "---\naliases: [x]\n---\n- b\n"),
    ]);
    let (mut ws, _) = Workspace::open(t.path()).unwrap();
    assert_eq!(ws.link_target("x", LinkKind::Page).key, "a");
    ws.delete_page("a").unwrap();
    assert_eq!(ws.link_target("x", LinkKind::Page).key, "b");
}

#[test]
fn an_alias_listed_twice_counts_once() {
    let t = dir(&[
        (
            "pages/Kubernetes.md",
            "---\naliases:\n  - k8s\n  - K8S\n---\n- the page\n",
        ),
        ("pages/Ops.md", "- see [[K8s]]\n"),
    ]);
    let (ws, _) = Workspace::open(t.path()).unwrap();
    assert_eq!(ws.aliases_of("kubernetes"), ["k8s"]);
    assert_eq!(ws.link_keys("kubernetes"), ["kubernetes", "k8s"]);
    assert_eq!(ws.linked_from("kubernetes"), 1);
}

fn graph_keys(s: &mut Session) -> Vec<String> {
    let g = cmd(s, json!({"type": "graph.get"})).graph.unwrap();
    g.nodes.iter().map(|n| n.key.clone()).collect()
}

#[test]
fn a_heading_link_is_a_backlink() {
    let t = dir(&[
        ("pages/Page.md", "- p\n"),
        (
            "pages/Ops.md",
            "- [[Page#Setup]]\n- [[page#^b1|step]]\n- #Page#tag\n",
        ),
    ]);
    let (ws, _) = Workspace::open(t.path()).unwrap();
    // The tag is a tag named `Page#tag`, not a link to Page.
    assert_eq!(ws.linked_from("page"), 2);
    assert_eq!(ws.link_target("Page#Setup", LinkKind::Page).key, "page");
    assert_eq!(ws.link_target("Page#tag", LinkKind::Tag).key, "page#tag");
    let mut s = session(&t);
    let keys = graph_keys(&mut s);
    assert!(!keys.iter().any(|k| k == "page#setup"), "{keys:?}");
    assert!(!keys.iter().any(|k| k == "page#^b1"), "{keys:?}");
}

#[test]
fn an_existing_hash_page_keeps_its_links() {
    let t = dir(&[
        ("pages/C.md", "- c\n"),
        ("pages/C# notes.md", "- notes\n"),
        ("pages/Ops.md", "- [[C# notes]]\n- [[C#]]\n"),
    ]);
    let (ws, _) = Workspace::open(t.path()).unwrap();
    assert_eq!(ws.linked_from("c# notes"), 1);
    assert_eq!(ws.linked_from("c"), 0);
    assert_eq!(ws.link_target("C# notes", LinkKind::Page).key, "c# notes");
    assert_eq!(ws.link_target("C#", LinkKind::Page).key, "c#");
}

#[test]
fn a_heading_link_without_its_page() {
    // With no page `Gone`, the whole text is the page name.
    let t = dir(&[("pages/Ops.md", "- [[Gone#H]]\n- [[Issue #42]]\n")]);
    let (ws, _) = Workspace::open(t.path()).unwrap();
    let names = ws.page_names();
    let gone = names.iter().find(|n| n.key == "gone#h").unwrap();
    assert_eq!((gone.name.as_str(), gone.exists), ("Gone#H", false));
    assert!(!names.iter().any(|n| n.key == "gone"), "{names:?}");
    assert!(!names.iter().any(|n| n.key == "issue"), "{names:?}");
    let t = ws.link_target("Issue #42", LinkKind::Page);
    assert_eq!(
        (t.key.as_str(), t.name.as_str()),
        ("issue #42", "Issue #42")
    );
    assert_eq!(ws.linked_from("issue #42"), 1);
}

#[test]
fn a_heading_through_an_alias() {
    let t = dir(&[
        ("pages/Kubernetes.md", K),
        ("pages/Ops.md", "- [[k8s#Setup]]\n"),
    ]);
    let (ws, _) = Workspace::open(t.path()).unwrap();
    assert_eq!(ws.linked_from("kubernetes"), 1);
    let t = ws.link_target("K8s#Setup", LinkKind::Page);
    assert_eq!(
        (t.key.as_str(), t.name.as_str(), t.exists),
        ("kubernetes", "Kubernetes", true)
    );
}

#[test]
fn a_heading_key_is_counted_per_page() {
    let t = dir(&[
        ("pages/Page.md", "- p\n"),
        ("pages/A.md", "- [[Page#H]]\n"),
        ("pages/B.md", "- [[Page#H]]\n"),
    ]);
    let (mut ws, _) = Workspace::open(t.path()).unwrap();
    assert_eq!(ws.linked_from("page"), 2);
    let a = ws.page("a").unwrap().doc.blocks()[0].id();
    ws.edit("a", |d, ids| d.set_text(a, "nothing", ids))
        .unwrap()
        .unwrap();
    assert_eq!(ws.linked_from("page"), 1);
}
