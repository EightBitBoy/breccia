use crate::support::{self, clock_on, folder_at, put, run};
use breccia_core::search::parse_query;
use breccia_core::session::{IndexProgress, Notice, SearchView};
use breccia_core::{Clock, Command, CommandError, Config, Output, Session};
use serde_json::{Value, json};
use std::fs;
use std::path::Path;
use tempfile::TempDir;

fn clock() -> Clock {
    clock_on((2026, 10, 30), 0)
}

fn cmd(s: &mut Session, json: Value) -> Result<Output, CommandError> {
    run(s, json, clock())
}

fn ok(s: &mut Session, json: Value) -> Output {
    support::ok(s, json, clock())
}

fn folder(files: &[(&str, &str)]) -> (TempDir, Session) {
    folder_at(files, clock())
}

fn search(s: &mut Session, text: &str) -> SearchView {
    ok(s, json!({"type": "search.query", "text": text}))
        .search
        .unwrap()
}

/// (page key, plain text of the hit) per hit, in order.
fn hits(v: &SearchView) -> Vec<(String, String)> {
    v.groups
        .iter()
        .flat_map(|g| {
            g.hits.iter().map(|h| {
                let text: String = h.segments.iter().map(|s| s.text.as_str()).collect();
                (g.page.clone(), text)
            })
        })
        .collect()
}

/// Every file under `root` with its bytes, sorted.
fn snapshot(root: &Path) -> Vec<(String, Vec<u8>)> {
    fn walk(dir: &Path, root: &Path, out: &mut Vec<(String, Vec<u8>)>) {
        for e in fs::read_dir(dir).unwrap() {
            let p = e.unwrap().path();
            if p.is_dir() {
                walk(&p, root, out);
            } else {
                let rel = p.strip_prefix(root).unwrap().to_string_lossy().into_owned();
                out.push((rel, fs::read(&p).unwrap()));
            }
        }
    }
    let mut out = Vec::new();
    walk(root, root, &mut out);
    out.sort();
    out
}

#[test]
fn the_query_is_parsed_by_the_core() {
    let cfg = Config::default();
    let q = parse_query("TODO #budget licence #[[multi word]] [[Anna]] todo", &cfg);
    assert_eq!(q.states, ["TODO"]);
    assert_eq!(q.links, [vec!["budget"], vec!["multi word"], vec!["anna"]]);
    assert_eq!(q.words, ["licence", "todo"]);
}

#[test]
fn filters_and_words_combine() {
    let (_t, mut s) = folder(&[(
        "pages/P.md",
        "- TODO Ask [[Ben]] about the licence costs #budget\n- licence notes\n- TODO other #budget\n",
    )]);
    let v = search(&mut s, "TODO #budget licence");
    assert!(v.filtered);
    assert_eq!(v.text, "licence");
    assert_eq!(
        hits(&v),
        [(
            "p".into(),
            "TODO Ask [[Ben]] about the licence costs #budget".into()
        )]
    );
    assert_eq!(v.groups[0].hits[0].state.as_deref(), Some("TODO"));
    assert_eq!(hits(&search(&mut s, "licence")).len(), 2);
    assert!(!search(&mut s, "licence").filtered);
}

#[test]
fn a_hit_names_the_block_and_its_page_title() {
    let (_t, mut s) = folder(&[("journals/2026-10-29.md", "- first\n- met Anna\n")]);
    let v = search(&mut s, "anna");
    assert_eq!(v.query, "anna");
    assert_eq!(v.groups.len(), 1);
    let g = &v.groups[0];
    assert_eq!(g.page, "2026-10-29");
    assert_eq!(g.title, "Thursday, 29 Oct 2026");
    assert_eq!(serde_json::to_value(g.kind).unwrap(), json!("journal"));
    let page = ok(&mut s, json!({"type": "page.get", "key": "2026-10-29"}))
        .page
        .unwrap();
    assert_eq!(g.hits[0].id, page.blocks[1].id);
}

#[test]
fn a_query_sees_unsaved_and_reloaded_text() {
    let (t, mut s) = folder(&[("pages/P.md", "- one\n")]);
    assert!(hits(&search(&mut s, "zebra")).is_empty());
    let id = ok(&mut s, json!({"type": "page.get", "key": "p"}))
        .page
        .unwrap()
        .blocks[0]
        .id;
    ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "a zebra"}),
    );
    assert_eq!(hits(&search(&mut s, "zebra")).len(), 1);

    // A page new in this session is indexed too.
    ok(&mut s, json!({"type": "page.open", "name": "New"}));
    ok(
        &mut s,
        json!({"type": "block.insert", "page": "new", "after": null, "text": "a yak"}),
    );
    assert_eq!(hits(&search(&mut s, "yak")).len(), 1);

    // Another program rewrites the file.
    put(t.path(), "pages/P.md", "- quokka\n");
    ok(
        &mut s,
        json!({"type": "files.changed", "paths": ["pages/P.md"]}),
    );
    assert_eq!(hits(&search(&mut s, "quokka")).len(), 1);
    assert!(hits(&search(&mut s, "zebra")).is_empty());
}

#[test]
fn a_query_before_the_background_build_is_complete() {
    let files: Vec<(String, String)> = (0..120)
        .map(|i| (format!("pages/P{i}.md"), format!("- word{i} common\n")))
        .collect();
    let refs: Vec<(&str, &str)> = files
        .iter()
        .map(|(a, b)| (a.as_str(), b.as_str()))
        .collect();
    let (_t, mut s) = folder(&refs);
    let g = s.generation();
    assert_eq!(
        s.index_step(g, 50).unwrap(),
        Some(IndexProgress {
            done: 50,
            total: 120
        })
    );
    assert_eq!(hits(&search(&mut s, "common")).len(), 120);
    assert_eq!(
        s.index_step(g, 50).unwrap(),
        Some(IndexProgress { done: 0, total: 0 })
    );
}

#[test]
fn a_finished_build_and_one_edit_report_one_of_one() {
    let (_t, mut s) = folder(&[("pages/A.md", "- a\n"), ("pages/B.md", "- b\n")]);
    let g = s.generation();
    assert_eq!(
        s.index_step(g, 50).unwrap(),
        Some(IndexProgress { done: 2, total: 2 })
    );
    let id = ok(&mut s, json!({"type": "page.get", "key": "a"}))
        .page
        .unwrap()
        .blocks[0]
        .id;
    ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "changed"}),
    );
    assert_eq!(
        s.index_step(g, 50).unwrap(),
        Some(IndexProgress { done: 1, total: 1 })
    );
    assert_eq!(
        s.index_step(g, 50).unwrap(),
        Some(IndexProgress { done: 0, total: 0 })
    );
}

#[test]
fn index_step_ignores_another_generation() {
    let mut none = Session::new();
    assert_eq!(none.index_step(0, 50).unwrap(), None);
    let (_t, mut s) = folder(&[("pages/P.md", "- x\n")]);
    let g = s.generation();
    assert_eq!(s.index_step(g + 1, 50).unwrap(), None);
}

#[test]
fn more_than_200_matches_are_cut() {
    let body: String = (0..205).map(|i| format!("- x{i} common\n")).collect();
    let (_t, mut s) = folder(&[("pages/P.md", &body)]);
    let v = search(&mut s, "common");
    assert_eq!(hits(&v).len(), 200);
    assert!(v.more);
    let v = search(&mut s, "x1");
    assert!(hits(&v).len() <= 200);
    assert!(!v.more);
}

#[test]
fn fts_syntax_in_the_query_is_only_words() {
    let (_t, mut s) = folder(&[("pages/P.md", "- a \"quoted\" (paren) word: AND NEAR\n")]);
    for q in [
        "\"", "*", "-x", "(", "a:b", "AND", "NEAR(", "^", "😀", "#", "[[", "quoted\"", "word:",
    ] {
        let r = cmd(&mut s, json!({"type": "search.query", "text": q}));
        assert!(r.is_ok(), "{q:?}: {:?}", r.err());
    }
    assert_eq!(hits(&search(&mut s, "AND")).len(), 1);
    assert_eq!(hits(&search(&mut s, "word:")).len(), 1);
}

fn drain(s: &mut Session) -> IndexProgress {
    let g = s.generation();
    let mut last = s.index_step(g, 50).unwrap().unwrap();
    while last.done != last.total {
        last = s.index_step(g, 50).unwrap().unwrap();
    }
    last
}

#[test]
fn a_cached_index_is_reused_and_only_changed_pages_are_indexed() {
    let t = tempfile::tempdir().unwrap();
    let cache = tempfile::tempdir().unwrap();
    for (rel, text) in [
        ("pages/A.md", "- alpha\n"),
        ("pages/B.md", "- beta\n"),
        ("pages/C.md", "- gamma\n"),
    ] {
        put(t.path(), rel, text);
    }
    let open = |t: &TempDir| {
        let mut s = Session::with_cache(cache.path().to_path_buf());
        ok(&mut s, json!({"type": "folder.open", "path": t.path()}));
        s
    };
    let mut s = open(&t);
    assert_eq!(drain(&mut s), IndexProgress { done: 3, total: 3 });
    drop(s);

    let mut s = open(&t);
    let g = s.generation();
    assert_eq!(
        s.index_step(g, 50).unwrap(),
        Some(IndexProgress { done: 0, total: 0 })
    );
    assert_eq!(hits(&search(&mut s, "beta")).len(), 1);
    drop(s);

    put(t.path(), "pages/B.md", "- beta changed\n");
    let mut s = open(&t);
    let g = s.generation();
    assert_eq!(
        s.index_step(g, 50).unwrap(),
        Some(IndexProgress { done: 1, total: 1 })
    );
}

#[test]
fn an_unwritable_cache_falls_back_to_memory() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/P.md", "- findable text\n");
    let blocker = tempfile::NamedTempFile::new().unwrap();
    let mut s = Session::with_cache(blocker.path().to_path_buf());
    let out = ok(&mut s, json!({"type": "folder.open", "path": t.path()}));
    let warnings: Vec<&String> = out
        .notices
        .iter()
        .filter_map(|n| match n {
            Notice::LoadWarning { message } => Some(message),
            _ => None,
        })
        .collect();
    assert_eq!(warnings.len(), 1, "{:?}", out.notices);
    assert!(warnings[0].contains("search index"), "{}", warnings[0]);
    assert_eq!(hits(&search(&mut s, "findable")).len(), 1);
}

#[test]
fn searching_writes_nothing() {
    let (t, mut s) = folder(&[
        ("pages/P.md", "- TODO licence #budget\n"),
        ("journals/2026-10-29.md", "- met Anna\n"),
    ]);
    let before = snapshot(t.path());
    for q in ["licence", "TODO #budget", "anna", "zzz", ""] {
        search(&mut s, q);
    }
    assert_eq!(snapshot(t.path()), before);
}

#[test]
fn substring_and_short_words_through_search_query() {
    let (_t, mut s) = folder(&[("pages/P.md", "- the licence costs\n- Q3 plan by Härtel\n")]);
    assert_eq!(hits(&search(&mut s, "cence")).len(), 1);
    assert_eq!(hits(&search(&mut s, "ence costs")).len(), 1);
    assert_eq!(hits(&search(&mut s, "q3")).len(), 1);
    assert_eq!(hits(&search(&mut s, "ÄRT q3")).len(), 1);
    assert!(hits(&search(&mut s, "q3 cence")).is_empty());
}

#[test]
fn search_query_is_a_command_name() {
    let c: Command = serde_json::from_value(json!({"type": "search.query", "text": "x"})).unwrap();
    assert!(matches!(c, Command::SearchQuery { .. }));
}

#[test]
fn a_typed_date_offers_the_day() {
    let (_t, mut s) = folder(&[
        ("journals/2026-03-12.md", "- met Anna\n"),
        ("journals/2026-03-11.md", "- \n"),
    ]);
    let v = search(&mut s, "12 Mar");
    let date = v.date.unwrap();
    assert_eq!(
        (date.key.as_str(), date.title.as_str(), date.in_feed),
        ("2026-03-12", "Thursday, 12 Mar 2026", true)
    );
    assert!(
        !search(&mut s, "11 Mar").date.unwrap().in_feed,
        "a blank day is not in the feed"
    );
    assert!(!search(&mut s, "10 Mar").date.unwrap().in_feed, "no file");
    assert!(
        search(&mut s, "today").date.unwrap().in_feed,
        "today is always in the feed"
    );
    assert!(!search(&mut s, "tomorrow").date.unwrap().in_feed);
    assert!(search(&mut s, "Anna").date.is_none());
}

#[test]
fn index_step_pages_counts_the_pages_of_the_last_step() {
    let files: Vec<(String, String)> = (0..120)
        .map(|i| (format!("pages/P{i}.md"), format!("- word{i}\n")))
        .collect();
    let refs: Vec<(&str, &str)> = files
        .iter()
        .map(|(a, b)| (a.as_str(), b.as_str()))
        .collect();
    let (_t, mut s) = folder(&refs);
    let g = s.generation();
    let mut counts = Vec::new();
    for _ in 0..4 {
        s.index_step(g, 50).unwrap();
        counts.push(s.index_step_pages());
    }
    assert_eq!(counts, vec![50, 50, 20, 0]);
    s.index_step(g + 1, 50).unwrap();
    assert_eq!(s.index_step_pages(), 0);
}

/// The one stored index in `cache`.
fn index_file(cache: &Path) -> std::path::PathBuf {
    let mut files: Vec<_> = fs::read_dir(cache)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| {
            let n = p.file_name().unwrap().to_string_lossy().into_owned();
            n.starts_with("index-") && n.ends_with(".sqlite3")
        })
        .collect();
    assert_eq!(files.len(), 1, "{files:?}");
    files.pop().unwrap()
}

/// Breaks the schema of the index at `file` from a second connection, which
/// is closed again before returning (Windows cannot delete an open file).
fn break_schema(file: &Path) {
    let conn = rusqlite::Connection::open(file).unwrap();
    let v: i64 = conn
        .query_row("PRAGMA schema_version", [], |r| r.get(0))
        .unwrap();
    conn.execute_batch(&format!(
        "PRAGMA writable_schema=ON; \
         UPDATE sqlite_schema SET sql='CREATE TABLE blocks(' WHERE name='blocks'; \
         PRAGMA schema_version={}; PRAGMA writable_schema=OFF;",
        v + 1
    ))
    .unwrap();
}

fn load_warnings(out: &Output) -> Vec<&String> {
    out.notices
        .iter()
        .filter_map(|n| match n {
            Notice::LoadWarning { message } => Some(message),
            _ => None,
        })
        .collect()
}

fn open_cached(t: &TempDir, cache: &Path) -> (Session, Output) {
    let mut s = Session::with_cache(cache.to_path_buf());
    let out = ok(&mut s, json!({"type": "folder.open", "path": t.path()}));
    (s, out)
}

fn query_out(s: &mut Session, text: &str) -> Output {
    ok(s, json!({"type": "search.query", "text": text}))
}

#[test]
fn a_damaged_index_behind_a_valid_header_is_rebuilt_at_open() {
    let t = tempfile::tempdir().unwrap();
    let cache = tempfile::tempdir().unwrap();
    put(t.path(), "pages/P.md", "- a zebra\n");
    let (mut s, _) = open_cached(&t, cache.path());
    assert_eq!(hits(&search(&mut s, "zebra")).len(), 1);
    drop(s);

    let file = index_file(cache.path());
    let mut bytes = fs::read(&file).unwrap();
    assert!(bytes.len() > 4096);
    bytes[4096..].fill(0x5A);
    fs::write(&file, bytes).unwrap();

    let (mut s, out) = open_cached(&t, cache.path());
    assert!(load_warnings(&out).is_empty(), "{:?}", out.notices);
    assert_eq!(hits(&search(&mut s, "zebra")).len(), 1);
    drop(s);
    let (_s, out) = open_cached(&t, cache.path());
    assert!(load_warnings(&out).is_empty(), "{:?}", out.notices);
}

#[test]
fn damage_found_by_a_query_rebuilds_once() {
    let t = tempfile::tempdir().unwrap();
    let cache = tempfile::tempdir().unwrap();
    put(t.path(), "pages/P.md", "- a zebra\n");
    let (mut s, _) = open_cached(&t, cache.path());
    assert_eq!(hits(&search(&mut s, "zebra")).len(), 1);
    break_schema(&index_file(cache.path()));

    let out = query_out(&mut s, "zebra");
    assert!(out.notices.is_empty(), "{:?}", out.notices);
    assert_eq!(hits(&out.search.unwrap()).len(), 1);
    // The rebuilt file is a stored one again.
    assert_eq!(hits(&search(&mut s, "zebra")).len(), 1);
}

#[test]
fn damage_found_by_the_background_build_rebuilds_once() {
    let t = tempfile::tempdir().unwrap();
    let cache = tempfile::tempdir().unwrap();
    put(t.path(), "pages/A.md", "- a zebra\n");
    put(t.path(), "pages/B.md", "- b zebra\n");
    let (mut s, _) = open_cached(&t, cache.path());
    drain(&mut s);
    break_schema(&index_file(cache.path()));

    // An edit makes the next step read the index.
    let id = ok(&mut s, json!({"type": "page.get", "key": "a"}))
        .page
        .unwrap()
        .blocks[0]
        .id;
    ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "a zebra again"}),
    );
    let g = s.generation();
    s.index_step(g, 50).unwrap();
    drain(&mut s);
    let out = query_out(&mut s, "zebra");
    assert!(out.notices.is_empty(), "{:?}", out.notices);
    assert_eq!(hits(&out.search.unwrap()).len(), 2);
}

#[test]
fn a_second_damage_keeps_the_index_in_memory() {
    let t = tempfile::tempdir().unwrap();
    let cache = tempfile::tempdir().unwrap();
    put(t.path(), "pages/P.md", "- a zebra\n");
    let (mut s, _) = open_cached(&t, cache.path());
    assert_eq!(hits(&search(&mut s, "zebra")).len(), 1);

    break_schema(&index_file(cache.path()));
    assert!(query_out(&mut s, "zebra").notices.is_empty());
    break_schema(&index_file(cache.path()));
    let out = query_out(&mut s, "zebra");
    let warnings = load_warnings(&out);
    assert_eq!(warnings.len(), 1, "{:?}", out.notices);
    assert!(warnings[0].contains("cannot be stored"), "{}", warnings[0]);
    assert_eq!(hits(&out.search.unwrap()).len(), 1);

    let out = query_out(&mut s, "zebra");
    assert!(out.notices.is_empty(), "{:?}", out.notices);
    assert_eq!(hits(&out.search.unwrap()).len(), 1);
}

#[test]
fn an_undo_to_the_indexed_text_refreshes_last_edited_order() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/Old.md", "- old zebra\n");
    put(t.path(), "pages/New.md", "- new zebra\n");
    let old = fs::File::options()
        .write(true)
        .open(t.path().join("pages/Old.md"))
        .unwrap();
    old.set_modified(std::time::SystemTime::now() - std::time::Duration::from_secs(86_400))
        .unwrap();
    drop(old);
    let mut s = Session::new();
    ok(&mut s, json!({"type": "folder.open", "path": t.path()}));

    let order =
        |v: &SearchView| -> Vec<String> { v.groups.iter().map(|g| g.page.clone()).collect() };
    assert_eq!(order(&search(&mut s, "zebra")), ["new", "old"]);

    let id = ok(&mut s, json!({"type": "page.get", "key": "old"}))
        .page
        .unwrap()
        .blocks[0]
        .id;
    ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "old zebra edited"}),
    );
    ok(&mut s, json!({"type": "history.undo", "page": "old"}));
    assert_eq!(order(&search(&mut s, "zebra")), ["old", "new"]);
}

#[test]
fn searching_a_page_finds_its_alias_and_heading_links() {
    let (_t, mut s) = folder(&[
        (
            "pages/Kubernetes.md",
            "---\naliases: [k8s]\n---\n- the page\n",
        ),
        (
            "pages/Ops.md",
            "- [[k8s]] one\n- [[Kubernetes#Setup]] two\n- [[Kubernetes]] three\n",
        ),
    ]);
    let want = |v: &SearchView| hits(v).into_iter().map(|(_, t)| t).collect::<Vec<_>>();
    let a = want(&search(&mut s, "[[Kubernetes]]"));
    assert_eq!(a.len(), 3, "{a:?}");
    assert_eq!(want(&search(&mut s, "[[k8s]]")), a);
}

/// The date picker asks for one day the way a typed date does.
#[test]
fn journal_day_answers_like_a_typed_date_and_writes_nothing() {
    let (t, mut s) = folder(&[
        ("journals/2026-03-12.md", "- met Anna\n"),
        ("journals/2026-03-11.md", "- \n"),
        ("journals/2026-11-20.md", "- later\n"),
    ]);
    let before = snapshot(t.path());
    let day = |s: &mut Session, key: &str| {
        let d = ok(s, json!({"type": "journal.day", "key": key}))
            .day
            .unwrap();
        (d.key, d.title, d.in_feed)
    };
    assert_eq!(
        day(&mut s, "2026-03-12"),
        ("2026-03-12".into(), "Thursday, 12 Mar 2026".into(), true)
    );
    assert!(
        !day(&mut s, "2026-03-11").2,
        "a blank day is not in the feed"
    );
    assert!(!day(&mut s, "2026-03-10").2, "no file");
    assert!(day(&mut s, "2026-10-30").2, "today is always in the feed");
    assert!(
        !day(&mut s, "2026-11-20").2,
        "a future day is never in the feed"
    );
    assert_eq!(snapshot(t.path()), before, "asking writes nothing");
    let e = cmd(&mut s, json!({"type": "journal.day", "key": "12 Mar"})).unwrap_err();
    assert_eq!(e.code, "badDate");
}

#[test]
fn damage_at_open_keeps_the_one_rebuild() {
    let t = tempfile::tempdir().unwrap();
    let cache = tempfile::tempdir().unwrap();
    put(t.path(), "pages/P.md", "- a zebra\n");
    let (s, _) = open_cached(&t, cache.path());
    drop(s);
    fs::write(
        index_file(cache.path()),
        b"not a database, not even close, just some bytes",
    )
    .unwrap();

    let (mut s, out) = open_cached(&t, cache.path());
    assert!(out.notices.is_empty(), "{:?}", out.notices);
    assert_eq!(hits(&search(&mut s, "zebra")).len(), 1);
    break_schema(&index_file(cache.path()));
    let out = query_out(&mut s, "zebra");
    assert!(out.notices.is_empty(), "{:?}", out.notices);
    assert_eq!(hits(&out.search.unwrap()).len(), 1);
}

#[test]
fn damage_twice_moves_the_index_to_memory() {
    let t = tempfile::tempdir().unwrap();
    let cache = tempfile::tempdir().unwrap();
    put(t.path(), "pages/P.md", "- a zebra\n");
    let (mut s, _) = open_cached(&t, cache.path());
    assert_eq!(hits(&search(&mut s, "zebra")).len(), 1);
    drop(s);
    let file = index_file(cache.path());
    let mut bytes = fs::read(&file).unwrap();
    assert!(bytes.len() > 4096);
    bytes[4096..].fill(0x5A);
    fs::write(&file, bytes).unwrap();

    let (mut s, out) = open_cached(&t, cache.path());
    assert!(load_warnings(&out).is_empty(), "{:?}", out.notices);
    break_schema(&index_file(cache.path()));
    let out = query_out(&mut s, "zebra");
    let warnings = load_warnings(&out);
    assert_eq!(warnings.len(), 1, "{:?}", out.notices);
    assert!(warnings[0].contains("cannot be stored"), "{}", warnings[0]);
    assert_eq!(hits(&out.search.unwrap()).len(), 1);
    assert!(query_out(&mut s, "zebra").notices.is_empty());
}

#[test]
fn query_with_mixed_links_widens_each_link() {
    let (_t, mut s) = folder(&[
        ("pages/A.md", "---\naliases: [alpha]\n---\n- the page\n"),
        (
            "pages/Ops.md",
            "- [[alpha]] #b one\n- [[A]] two\n- [[alpha]] #b [[A]] three\n- #b four\n",
        ),
    ]);
    let want = |v: &SearchView| hits(v).into_iter().map(|(_, t)| t).collect::<Vec<_>>();
    let both = want(&search(&mut s, "[[A]] #b [[A]] text"));
    assert!(both.is_empty(), "{both:?}");
    let both = want(&search(&mut s, "[[A]] #b [[A]]"));
    assert_eq!(both, ["[[alpha]] #b one", "[[alpha]] #b [[A]] three"]);
    // Each filter finds the alias spelling of its own page.
    assert_eq!(want(&search(&mut s, "#b [[A]]")).len(), 2);
    assert_eq!(want(&search(&mut s, "[[A]] #b")).len(), 2);
}

#[test]
fn query_link_to_an_unknown_page_keeps_its_key() {
    let (_t, mut s) = folder(&[
        ("pages/A.md", "---\naliases: [alpha]\n---\n- the page\n"),
        (
            "pages/Ops.md",
            "- [[Nowhere]] one\n- [[alpha]] two\n- [[alpha]] [[Nowhere]] three\n",
        ),
    ]);
    let want = |v: &SearchView| hits(v).into_iter().map(|(_, t)| t).collect::<Vec<_>>();
    assert_eq!(want(&search(&mut s, "[[Nowhere]]")).len(), 2);
    let both = want(&search(&mut s, "[[A]] [[Nowhere]]"));
    assert_eq!(both.len(), 1, "{both:?}");
    assert!(both[0].contains("three"), "{both:?}");
}
