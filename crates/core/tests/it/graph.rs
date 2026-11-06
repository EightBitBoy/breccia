//! `graph.get`: pages, link targets and the links between them.

use breccia_core::session::{GraphNode, GraphView, PageViewKind, layout_file_name};
use breccia_core::{Clock, CommandError, Output, Session};
use chrono::NaiveDate;
use serde_json::{Value, json};
use std::fs;
use std::path::Path;
use std::time::SystemTime;

fn clock() -> Clock {
    Clock {
        today: NaiveDate::from_ymd_opt(2026, 10, 29).unwrap(),
        time: chrono::NaiveTime::from_hms_opt(14, 5, 9).unwrap(),
        ms: 0,
    }
}

fn cmd(s: &mut Session, json: Value) -> Result<Output, CommandError> {
    let req = serde_json::from_value(json!({"generation": s.generation(), "command": json}))
        .unwrap_or_else(|e| panic!("bad request: {e}"));
    s.run(req, clock())
}

fn ok(s: &mut Session, json: Value) -> Output {
    let j = json.clone();
    cmd(s, json).unwrap_or_else(|e| panic!("{j}: {e:?}"))
}

fn put(root: &Path, rel: &str, text: &str) {
    let p = root.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
}

fn open(root: &Path) -> Session {
    let mut s = Session::new();
    ok(&mut s, json!({"type": "folder.open", "path": root}));
    s
}

fn graph(s: &mut Session) -> GraphView {
    ok(s, json!({"type": "graph.get"})).graph.unwrap()
}

fn node<'a>(g: &'a GraphView, key: &str) -> &'a GraphNode {
    g.nodes.iter().find(|n| n.key == key).unwrap()
}

fn keys(g: &GraphView) -> Vec<&str> {
    g.nodes.iter().map(|n| n.key.as_str()).collect()
}

fn edges(g: &GraphView) -> Vec<(&str, &str)> {
    g.edges
        .iter()
        .map(|&[a, b]| {
            (
                g.nodes[a as usize].key.as_str(),
                g.nodes[b as usize].key.as_str(),
            )
        })
        .collect()
}

#[test]
fn graph_lists_pages_targets_and_lines() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "pages/Anna.md",
        "- met [[Ben]] #infra\n- again [[ben]]\n",
    );
    put(
        t.path(),
        "pages/Projects/Ben.md",
        "- see [[Anna]]\n- me [[Ben]]\n",
    );
    put(
        t.path(),
        "journals/2026-10-28.md",
        "- TODO call [[Anna]]\n  done:: [[2026-10-27]]\n",
    );
    put(t.path(), "pages/Lonely.md", "- nothing\n");
    let mut s = open(t.path());
    let g = graph(&mut s);
    assert_eq!(
        keys(&g),
        ["2026-10-27", "2026-10-28", "anna", "ben", "infra", "lonely"]
    );
    let d27 = node(&g, "2026-10-27");
    assert_eq!(d27.kind, PageViewKind::Journal);
    assert!(!d27.exists);
    assert_eq!(d27.title, "Tuesday, 27 Oct 2026");
    assert_eq!(d27.name, "2026-10-27");
    let d28 = node(&g, "2026-10-28");
    assert_eq!(d28.kind, PageViewKind::Journal);
    assert!(d28.exists);
    assert_eq!(d28.title, "Wednesday, 28 Oct 2026");
    let ben = node(&g, "ben");
    assert_eq!(
        (
            ben.name.as_str(),
            ben.folder.as_str(),
            ben.linked_from,
            ben.exists
        ),
        ("Ben", "Projects", 2, true)
    );
    assert_eq!(node(&g, "anna").linked_from, 2);
    assert_eq!(node(&g, "lonely").linked_from, 0);
    let infra = node(&g, "infra");
    assert!(!infra.exists && infra.tag && infra.tag_only);
    assert_eq!(infra.folder, "");
    assert_eq!(infra.kind, PageViewKind::Page);
    assert_eq!(
        edges(&g),
        [
            ("2026-10-28", "2026-10-27"),
            ("2026-10-28", "anna"),
            ("anna", "ben"),
            ("anna", "infra"),
            ("ben", "anna"),
        ]
    );
    let rows = ok(&mut s, json!({"type": "pages.table"})).table.unwrap();
    for r in &rows {
        assert_eq!(node(&g, &r.key).linked_from, r.linked_from, "{}", r.key);
    }
    assert_eq!(g.positions.len(), g.nodes.len());
    assert!(g.positions.iter().all(Option::is_none));
}

#[test]
fn case_variants_are_one_node() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/X.md", "- [[anna]] [[Anna]] #Anna\n");
    put(t.path(), "pages/Anna.md", "- hi\n");
    let mut s = open(t.path());
    let g = graph(&mut s);
    assert_eq!(keys(&g), ["anna", "x"]);
    let anna = node(&g, "anna");
    assert_eq!(anna.name, "Anna");
    assert!(anna.tag && !anna.tag_only);
    assert_eq!(edges(&g), [("x", "anna")]);
}

#[test]
fn tag_only_needs_no_file_and_only_tags() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/A.md", "- #t1 #t2 [[t3]]\n");
    put(t.path(), "pages/B.md", "- [[t2]]\n");
    put(t.path(), "pages/T4.md", "- #t4\n");
    let mut s = open(t.path());
    let g = graph(&mut s);
    let flags = |k: &str| {
        let n = node(&g, k);
        (n.tag, n.tag_only)
    };
    assert_eq!(flags("t1"), (true, true));
    assert_eq!(flags("t2"), (true, false));
    assert_eq!(flags("t3"), (false, false));
    let t4 = node(&g, "t4");
    assert!(t4.exists && !t4.tag_only);
    assert!(!edges(&g).contains(&("t4", "t4")));
}

#[test]
fn a_page_without_content_wins_over_the_link_spelling() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/X.md", "- [[ghost]] [[2026-10-20]]\n");
    let mut s = open(t.path());
    ok(&mut s, json!({"type": "page.open", "name": "Ghost"})); // blank, in memory only
    ok(&mut s, json!({"type": "page.open", "name": "2026-10-20"}));
    let g = graph(&mut s);
    let ghost = node(&g, "ghost");
    assert_eq!(ghost.name, "Ghost");
    assert!(!ghost.exists);
    let day = node(&g, "2026-10-20");
    assert_eq!(day.kind, PageViewKind::Journal);
    assert_eq!(day.title, "Tuesday, 20 Oct 2026");
    assert!(!day.exists);
    // blank and unlinked: not a node
    ok(&mut s, json!({"type": "page.open", "name": "Blank"}));
    assert!(!keys(&graph(&mut s)).contains(&"blank"));
}

#[test]
fn graph_follows_edits_and_removals() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "pages/Anna.md",
        "- met [[Ben]] #infra\n- again [[ben]]\n",
    );
    put(t.path(), "pages/Ben.md", "- hi\n");
    put(t.path(), "pages/Lonely.md", "- nothing\n");
    let mut s = open(t.path());
    let g = graph(&mut s);
    assert!(keys(&g).contains(&"infra"));
    let first = ok(&mut s, json!({"type": "page.get", "key": "anna"}))
        .page
        .unwrap()
        .blocks[0]
        .id;
    ok(
        &mut s,
        json!({"type": "block.setText", "id": first, "text": "met nobody"}),
    );
    let g = graph(&mut s);
    assert!(!keys(&g).contains(&"infra"));
    assert_eq!(edges(&g), [("anna", "ben")]);
    ok(&mut s, json!({"type": "page.delete", "key": "lonely"}));
    assert!(!keys(&graph(&mut s)).contains(&"lonely"));
}

#[test]
fn empty_folder_has_an_empty_graph() {
    let t = tempfile::tempdir().unwrap();
    let mut s = open(t.path());
    let g = graph(&mut s);
    assert!(g.nodes.is_empty() && g.edges.is_empty() && g.positions.is_empty());
}

#[test]
fn graph_get_without_a_folder_fails() {
    let mut s = Session::new();
    assert_eq!(
        cmd(&mut s, json!({"type": "graph.get"})).unwrap_err().code,
        "noFolder"
    );
}

fn snapshot(root: &Path, dir: &Path, out: &mut Vec<(String, Vec<u8>, SystemTime)>) {
    for e in fs::read_dir(dir).unwrap() {
        let p = e.unwrap().path();
        if p.is_dir() {
            snapshot(root, &p, out);
        } else {
            let rel = p.strip_prefix(root).unwrap().to_string_lossy().into_owned();
            out.push((
                rel,
                fs::read(&p).unwrap(),
                fs::metadata(&p).unwrap().modified().unwrap(),
            ));
        }
    }
}

#[test]
fn graph_get_writes_nothing() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/Anna.md", "- [[Ben]] #x\n");
    put(t.path(), "journals/2026-10-28.md", "- [[Anna]]\n");
    let mut s = open(t.path());
    let mut before = Vec::new();
    snapshot(t.path(), t.path(), &mut before);
    graph(&mut s);
    graph(&mut s);
    let mut after = Vec::new();
    snapshot(t.path(), t.path(), &mut after);
    before.sort_by(|a, b| a.0.cmp(&b.0));
    after.sort_by(|a, b| a.0.cmp(&b.0));
    assert_eq!(before, after);
}

fn open_cached(root: &Path, cache: &Path) -> Session {
    let mut s = Session::with_cache(cache.to_path_buf());
    ok(&mut s, json!({"type": "folder.open", "path": root}));
    s
}

fn save(s: &mut Session, positions: Value) {
    ok(
        s,
        json!({"type": "graph.saveLayout", "positions": positions}),
    );
}

fn pos(g: &GraphView, key: &str) -> Option<[f64; 2]> {
    let i = g.nodes.iter().position(|n| n.key == key).unwrap();
    g.positions[i]
}

fn layout_path(root: &Path, cache: &Path) -> std::path::PathBuf {
    cache.join(layout_file_name(root))
}

#[test]
fn save_layout_writes_only_the_cache_file() {
    let t = tempfile::tempdir().unwrap();
    let cache = tempfile::tempdir().unwrap();
    put(t.path(), "pages/Anna.md", "- [[Ben]] [[Cy]]\n");
    put(t.path(), "pages/Ben.md", "- hi\n");
    let mut s = open_cached(t.path(), cache.path());
    let mut before = Vec::new();
    snapshot(t.path(), t.path(), &mut before);
    save(
        &mut s,
        json!([{"key":"anna","x":1.5,"y":-2.0},{"key":"ben","x":3.0,"y":4.0}]),
    );
    let file = layout_path(t.path(), cache.path());
    let v: Value = serde_json::from_str(&fs::read_to_string(&file).unwrap()).unwrap();
    assert_eq!(
        v,
        json!({"version":1,"positions":{"anna":[1.5,-2.0],"ben":[3.0,4.0]}})
    );
    assert!(!fs::read_to_string(&file).unwrap().contains('\r'));
    let mut after = Vec::new();
    snapshot(t.path(), t.path(), &mut after);
    before.sort_by(|a, b| a.0.cmp(&b.0));
    after.sort_by(|a, b| a.0.cmp(&b.0));
    assert_eq!(before, after);
    let g = graph(&mut s);
    assert_eq!(pos(&g, "anna"), Some([1.5, -2.0]));
    assert_eq!(pos(&g, "ben"), Some([3.0, 4.0]));
    assert_eq!(pos(&g, "cy"), None);
    save(&mut s, json!([{"key":"ben","x":7.0,"y":8.0}]));
    let g = graph(&mut s);
    assert_eq!(pos(&g, "anna"), None);
    assert_eq!(pos(&g, "ben"), Some([7.0, 8.0]));
}

#[test]
fn layout_file_is_per_folder() {
    let a = tempfile::tempdir().unwrap();
    let b = tempfile::tempdir().unwrap();
    let cache = tempfile::tempdir().unwrap();
    put(a.path(), "pages/Anna.md", "- hi\n");
    put(b.path(), "pages/Anna.md", "- hi\n");
    let (na, nb) = (layout_file_name(a.path()), layout_file_name(b.path()));
    assert_ne!(na, nb);
    assert_eq!(na, layout_file_name(a.path()));
    for n in [&na, &nb] {
        let hex = n
            .as_str()
            .strip_prefix("graph-")
            .unwrap()
            .strip_suffix(".json")
            .unwrap();
        assert_eq!(hex.len(), 16);
        assert!(hex.chars().all(|c| matches!(c, '0'..='9' | 'a'..='f')));
    }
    let mut sa = open_cached(a.path(), cache.path());
    let mut sb = open_cached(b.path(), cache.path());
    save(&mut sa, json!([{"key":"anna","x":1.0,"y":2.0}]));
    assert_eq!(pos(&graph(&mut sa), "anna"), Some([1.0, 2.0]));
    assert_eq!(pos(&graph(&mut sb), "anna"), None);
}

#[test]
fn a_broken_layout_file_is_ignored() {
    let t = tempfile::tempdir().unwrap();
    let cache = tempfile::tempdir().unwrap();
    put(t.path(), "pages/Anna.md", "- [[Lonely]]\n");
    put(t.path(), "pages/Ben.md", "- hi\n");
    let mut s = open_cached(t.path(), cache.path());
    let file = layout_path(t.path(), cache.path());
    let all_none = |s: &mut Session| {
        let out = ok(s, json!({"type": "graph.get"}));
        assert!(out.notices.is_empty());
        assert!(out.graph.unwrap().positions.iter().all(Option::is_none));
    };
    fs::write(&file, "not json").unwrap();
    all_none(&mut s);
    fs::write(&file, r#"{"version":2,"positions":{"anna":[1,2]}}"#).unwrap();
    all_none(&mut s);
    fs::write(
        &file,
        r#"{"version":1,"positions":{"anna":[1],"ben":"x","lonely":[5,6],"gone":[1,1]}}"#,
    )
    .unwrap();
    let out = ok(&mut s, json!({"type": "graph.get"}));
    assert!(out.notices.is_empty());
    let g = out.graph.unwrap();
    assert_eq!(pos(&g, "anna"), None);
    assert_eq!(pos(&g, "ben"), None);
    assert_eq!(pos(&g, "lonely"), Some([5.0, 6.0]));
    assert_eq!(g.positions.iter().flatten().count(), 1);
}

#[test]
fn without_a_cache_dir_save_is_a_no_op() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/Anna.md", "- hi\n");
    let mut s = open(t.path());
    let mut before = Vec::new();
    snapshot(t.path(), t.path(), &mut before);
    save(&mut s, json!([{"key":"anna","x":1.0,"y":2.0}]));
    assert!(graph(&mut s).positions.iter().all(Option::is_none));
    let mut after = Vec::new();
    snapshot(t.path(), t.path(), &mut after);
    before.sort_by(|a, b| a.0.cmp(&b.0));
    after.sort_by(|a, b| a.0.cmp(&b.0));
    assert_eq!(before, after);
}

#[test]
fn an_alias_is_no_node() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "pages/Kubernetes.md",
        "---\naliases:\n  - k8s\n---\n- the page\n",
    );
    put(t.path(), "pages/Ops.md", "- see [[k8s]]\n");
    let mut s = open(t.path());
    let g = graph(&mut s);
    assert_eq!(keys(&g), ["kubernetes", "ops"]);
    assert_eq!(g.edges, [[1, 0]]);
    assert_eq!(node(&g, "kubernetes").linked_from, 1);
}
