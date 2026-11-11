use crate::support::put;
use breccia_core::search::{
    Hit, Query, SCHEMA_VERSION, SearchIndex, fold, highlight, index_file_name, page_hash,
};
use breccia_core::{Config, Workspace};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

fn open(files: &[(&str, &str)]) -> (tempfile::TempDir, Workspace) {
    let t = tempfile::tempdir().unwrap();
    for (rel, text) in files {
        put(t.path(), rel, text);
    }
    let (ws, _) = Workspace::open(t.path()).unwrap();
    (t, ws)
}

fn words(w: &[&str]) -> Query {
    Query {
        words: w.iter().map(|s| s.to_string()).collect(),
        states: vec![],
        links: vec![],
    }
}

fn texts(hits: &[Hit]) -> Vec<String> {
    hits.iter()
        .map(|h| {
            h.segments
                .iter()
                .map(|s| s.text.as_str())
                .collect::<String>()
        })
        .collect()
}

fn keys(k: &[&str]) -> Vec<String> {
    k.iter().map(|s| s.to_string()).collect()
}

#[test]
fn fts5_is_compiled_in_and_a_page_is_found() {
    let (_t, ws) = open(&[("pages/P.md", "- the licence costs\n- other\n")]);
    let mut ix = SearchIndex::in_memory().unwrap();
    assert_eq!(ix.update(&ws, &["p".into()]).unwrap(), 1);
    let hits = ix.query(&words(&["licen"]), 10).unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!((hits[0].page.as_str(), hits[0].pos), ("p", 0));
    assert!(
        hits[0].segments.iter().any(|s| s.hit && s.text == "licen"),
        "{:?}",
        hits[0].segments
    );
    assert_eq!(texts(&hits), ["the licence costs"]);
}

#[test]
fn words_match_in_the_middle_and_at_the_end() {
    let (_t, ws) = open(&[("pages/P.md", "- the licence costs\n- unrelated\n")]);
    let mut ix = SearchIndex::in_memory().unwrap();
    ix.update(&ws, &["p".into()]).unwrap();
    for w in ["icen", "cence", "ence", "osts"] {
        let hits = ix.query(&words(&[w]), 10).unwrap();
        assert_eq!(hits.len(), 1, "{w}");
        assert!(
            hits[0].segments.iter().any(|s| s.hit && s.text == w),
            "{w}: {:?}",
            hits[0].segments
        );
    }
    assert_eq!(
        ix.query(&words(&["cence", "costs"]), 10).unwrap().len(),
        1,
        "every word must appear"
    );
    assert!(ix.query(&words(&["cence", "nope"]), 10).unwrap().is_empty());
}

#[test]
fn short_words_match_anywhere_alone_or_with_long_words() {
    let (_t, ws) = open(&[(
        "pages/P.md",
        "- Q3 plan\n- FAQ3 list\n- plan b\n- 50%_off\n",
    )]);
    let mut ix = SearchIndex::in_memory().unwrap();
    ix.update(&ws, &["p".into()]).unwrap();
    let poses = |w: &[&str]| {
        ix.query(&words(w), 10)
            .unwrap()
            .iter()
            .map(|h| h.pos)
            .collect::<Vec<_>>()
    };
    assert_eq!(poses(&["q3"]), [0, 1]);
    assert_eq!(poses(&["q3", "plan"]), [0]);
    assert_eq!(poses(&["b", "plan"]), [2]);
    assert_eq!(poses(&["0%"]), [3]);
    assert!(poses(&["0_"]).is_empty(), "LIKE wildcards are literal");
}

#[test]
fn case_and_accents_do_not_matter() {
    let (_t, ws) = open(&[("pages/P.md", "- Stefan Härtel\n- Crème brûlée\n")]);
    let mut ix = SearchIndex::in_memory().unwrap();
    ix.update(&ws, &["p".into()]).unwrap();
    let hits = ix.query(&words(&["hartel"]), 10).unwrap();
    assert_eq!(hits.len(), 1);
    assert!(
        hits[0].segments.iter().any(|s| s.hit && s.text == "Härtel"),
        "{:?}",
        hits[0].segments
    );
    assert_eq!(ix.query(&words(&["STEFAN"]), 10).unwrap().len(), 1);
    assert_eq!(ix.query(&words(&["HÄRT"]), 10).unwrap().len(), 1);
    assert_eq!(
        ix.query(&words(&["rulee"]), 10).unwrap().len(),
        1,
        "accent in the middle of a word"
    );
    assert_eq!(
        ix.query(&words(&["RÛ"]), 10).unwrap().len(),
        1,
        "a short accented word folds too (ru occurs only in brûlée)"
    );
}

#[test]
fn fold_and_highlight() {
    assert_eq!(fold("Härtel ÉCOLE Straße"), "hartel ecole straße");
    let seg = |t: &str, w: &[&str], width| {
        let w: Vec<String> = w.iter().map(|s| s.to_string()).collect();
        highlight(t, &w, width)
            .into_iter()
            .map(|s| (s.text, s.hit))
            .collect::<Vec<_>>()
    };
    let s = |t: &str, hit| (t.to_string(), hit);
    assert_eq!(
        seg("Härtel and härtel", &["hart"], 160),
        [
            s("Härt", true),
            s("el and ", false),
            s("härt", true),
            s("el", false)
        ]
    );
    assert_eq!(
        seg("aaaa", &["aa", "aaa"], 160),
        [s("aaaa", true)],
        "overlaps merge"
    );
    assert_eq!(
        seg("line one\nline two", &[], 160),
        [s("line one line two", false)]
    );
    let long = format!("{} needle {}", "x".repeat(300), "y".repeat(300));
    let out = seg(&long, &["needle"], 60);
    assert!(
        out.first().unwrap().0 == "…" && out.last().unwrap().0 == "…",
        "{out:?}"
    );
    assert!(out.iter().any(|x| x.1 && x.0 == "needle"));
    assert!(out.iter().map(|x| x.0.chars().count()).sum::<usize>() <= 62);
}

#[test]
fn unchanged_pages_are_skipped_and_a_states_change_reindexes() {
    let (_t, mut ws) = open(&[
        ("pages/P.md", "- TODO one\n- two\n"),
        ("pages/Q.md", "- three\n"),
    ]);
    let mut ix = SearchIndex::in_memory().unwrap();
    let all = keys(&["p", "q"]);
    assert_eq!(ix.update(&ws, &all).unwrap(), 2);
    assert_eq!(ix.update(&ws, &all).unwrap(), 0);
    ws.edit("p", |d, ids| {
        let id = d.blocks()[1].id();
        d.set_text(id, "TWO", ids).unwrap();
    });
    assert_eq!(ix.update(&ws, &all).unwrap(), 1);
    assert_eq!(ix.query(&words(&["two"]), 10).unwrap().len(), 1);
    ws.config.states[0].keyword = "TASK".into();
    assert_eq!(ix.update(&ws, &all).unwrap(), 2, "states are in the hash");
    assert_eq!(ix.update(&ws, &all).unwrap(), 0);
}

#[test]
fn a_page_without_content_or_gone_leaves_the_index() {
    let (_t, mut ws) = open(&[("pages/P.md", "- hello\n")]);
    let mut ix = SearchIndex::in_memory().unwrap();
    assert_eq!(ix.update(&ws, &["p".into()]).unwrap(), 1);
    assert_eq!(ix.query(&words(&["hello"]), 10).unwrap().len(), 1);
    ws.delete_page("p").unwrap();
    assert_eq!(ix.update(&ws, &["p".into()]).unwrap(), 1);
    assert!(ix.query(&words(&["hello"]), 10).unwrap().is_empty());
    assert_eq!(ix.update(&ws, &["p".into()]).unwrap(), 0);

    let key = ws.create_page("Fresh", "").unwrap();
    assert!(!ws.page(&key).unwrap().has_content());
    assert_eq!(ix.update(&ws, &[key]).unwrap(), 0);
    assert!(ix.query(&words(&["fresh"]), 10).unwrap().is_empty());
}

#[test]
fn stale_names_only_pages_that_need_work() {
    let (t, ws) = open(&[("pages/A.md", "- a\n"), ("pages/B.md", "- b\n")]);
    let mut ix = SearchIndex::in_memory().unwrap();
    let all = keys(&["a", "b", "c"]);
    assert_eq!(ix.update(&ws, &all).unwrap(), 2);
    assert!(ix.stale(&ws, &all).unwrap().is_empty());
    put(t.path(), "pages/B.md", "- b changed\n");
    put(t.path(), "pages/C.md", "- c\n");
    let (ws, _) = Workspace::open(t.path()).unwrap();
    assert_eq!(ix.stale(&ws, &all).unwrap(), ["b", "c"]);
    ix.update(&ws, &keys(&["b", "c"])).unwrap();
    assert!(ix.stale(&ws, &all).unwrap().is_empty());
    // A stored page whose file is gone is stale too.
    fs::remove_file(t.path().join("pages/A.md")).unwrap();
    let (ws, _) = Workspace::open(t.path()).unwrap();
    assert_eq!(ix.stale(&ws, &all).unwrap(), ["a"]);
}

#[test]
fn prune_drops_pages_the_folder_no_longer_has() {
    let t = tempfile::tempdir().unwrap();
    let file = t.path().join("index.sqlite3");
    let (n, ws_both) = open(&[("pages/A.md", "- alpha\n"), ("pages/B.md", "- bravo\n")]);
    let mut ix = SearchIndex::open(&file).unwrap();
    ix.update(&ws_both, &keys(&["a", "b"])).unwrap();
    drop(ix);
    fs::remove_file(n.path().join("pages/B.md")).unwrap();
    let (ws_a, _) = Workspace::open(n.path()).unwrap();
    let mut ix = SearchIndex::open(&file).unwrap();
    assert_eq!(ix.prune(&ws_a).unwrap(), 1);
    assert_eq!(ix.prune(&ws_a).unwrap(), 0);
    assert!(ix.query(&words(&["bravo"]), 10).unwrap().is_empty());
    assert_eq!(ix.query(&words(&["alpha"]), 10).unwrap().len(), 1);
}

#[test]
fn filters_by_state_and_link() {
    let (_t, ws) = open(&[(
        "pages/P.md",
        "- TODO a #budget\n- TODO b\n- DONE c #budget\n  done:: [[2026-10-29]]\n- d [[Budget]]\n",
    )]);
    let mut ix = SearchIndex::in_memory().unwrap();
    ix.update(&ws, &["p".into()]).unwrap();
    let q = |states: &[&str], links: &[&str]| Query {
        words: vec![],
        states: keys(states),
        links: links.iter().map(|k| keys(&[k])).collect(),
    };
    let poses = |q: Query| {
        ix.query(&q, 10)
            .unwrap()
            .iter()
            .map(|h| h.pos)
            .collect::<Vec<_>>()
    };
    assert_eq!(poses(q(&["TODO"], &[])), [0, 1]);
    assert_eq!(poses(q(&[], &["budget"])), [0, 2, 3]);
    assert_eq!(poses(q(&["TODO"], &["budget"])), [0]);
    assert_eq!(poses(q(&[], &["2026-10-29"])), [2]);
    assert_eq!(poses(q(&["TODO", "DONE"], &[])), [0, 1, 2]);
    let hits = ix.query(&q(&["TODO"], &[]), 10).unwrap();
    assert_eq!(hits[0].state.as_deref(), Some("TODO"));
    assert!(Query::default().is_empty());
    assert!(!q(&["TODO"], &[]).is_empty());
    assert!(ix.query(&Query::default(), 10).unwrap().is_empty());
}

#[test]
fn newest_page_first_then_file_order() {
    let (_t, ws) = open(&[
        ("journals/2026-10-28.md", "- x one\n- x two\n"),
        ("journals/2026-10-29.md", "- x three\n- x four\n"),
        ("pages/P.md", "- x five\n"),
    ]);
    let mut ix = SearchIndex::in_memory().unwrap();
    ix.update(&ws, &keys(&["2026-10-28", "2026-10-29", "p"]))
        .unwrap();
    let hits = ix.query(&words(&["x"]), 10).unwrap();
    let order: Vec<(String, usize)> = hits.iter().map(|h| (h.page.clone(), h.pos)).collect();
    // The page's recent is its edit time (a file just written, so later
    // than the journals' 2026 dates only if the clock says so).
    let page_recent = ws
        .page("p")
        .unwrap()
        .edited()
        .unwrap()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    let journal_29 = chrono::NaiveDate::from_ymd_opt(2026, 10, 29)
        .unwrap()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp_millis();
    let journals = vec![
        ("2026-10-29".to_string(), 0),
        ("2026-10-29".to_string(), 1),
        ("2026-10-28".to_string(), 0),
        ("2026-10-28".to_string(), 1),
    ];
    let page = vec![("p".to_string(), 0)];
    let expected = if page_recent > journal_29 {
        [page, journals].concat()
    } else {
        [journals, page].concat()
    };
    assert_eq!(order, expected);
    assert_eq!(ix.query(&words(&["x"]), 2).unwrap().len(), 2, "limit");
}

#[test]
fn the_index_survives_a_reopen() {
    let t = tempfile::tempdir().unwrap();
    let file = t.path().join("cache").join("index.sqlite3");
    let (_n, ws) = open(&[("pages/P.md", "- hello\n")]);
    SearchIndex::open(&file)
        .unwrap()
        .update(&ws, &["p".into()])
        .unwrap();
    let mut again = SearchIndex::open(&file).unwrap();
    assert_eq!(again.update(&ws, &["p".into()]).unwrap(), 0);
    assert_eq!(again.query(&words(&["hello"]), 10).unwrap().len(), 1);
}

#[test]
fn opening_a_corrupt_index_file_reports_the_damage() {
    let t = tempfile::tempdir().unwrap();
    let file = t.path().join("index.sqlite3");
    fs::write(&file, b"not a database, not even close, just some bytes").unwrap();
    let Err(e) = SearchIndex::open(&file) else {
        panic!("a garbage file must not open");
    };
    assert!(e.is_damage(), "{e}");
    // `open` only opens: the file is the caller's to delete.
    assert!(file.exists());
}

#[test]
fn an_old_schema_is_rebuilt() {
    let t = tempfile::tempdir().unwrap();
    let file = t.path().join("index.sqlite3");
    {
        let c = rusqlite::Connection::open(&file).unwrap();
        c.execute_batch("CREATE TABLE junk (x INTEGER); INSERT INTO junk VALUES (1);")
            .unwrap();
    }
    drop(SearchIndex::open(&file).unwrap());
    let c = rusqlite::Connection::open(&file).unwrap();
    let v: i32 = c
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .unwrap();
    assert_eq!(v, SCHEMA_VERSION);
    let junk: i64 = c
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE name = 'junk'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(junk, 0);
}

#[test]
fn index_file_name_is_stable_per_folder() {
    let a = tempfile::tempdir().unwrap();
    let b = tempfile::tempdir().unwrap();
    assert_eq!(index_file_name(a.path()), index_file_name(a.path()));
    assert_ne!(index_file_name(a.path()), index_file_name(b.path()));
    let name = index_file_name(a.path());
    let hex = name
        .strip_prefix("index-")
        .and_then(|s| s.strip_suffix(".sqlite3"))
        .unwrap();
    assert!(
        hex.len() == 16 && hex.chars().all(|c| matches!(c, '0'..='9' | 'a'..='f')),
        "{name}"
    );
}

#[test]
fn page_hash_follows_text_and_states() {
    let (_t, ws) = open(&[("pages/P.md", "- a\n"), ("pages/Q.md", "- b\n")]);
    let cfg = Config::default();
    let p = page_hash(ws.page("p").unwrap(), &cfg);
    assert_eq!(p, page_hash(ws.page("p").unwrap(), &cfg));
    assert_ne!(p, page_hash(ws.page("q").unwrap(), &cfg));
    let mut other = cfg.clone();
    other.states[0].keyword = "TASK".into();
    assert_ne!(p, page_hash(ws.page("p").unwrap(), &other));
}

fn snapshot(root: &Path) -> BTreeMap<String, Vec<u8>> {
    fn walk(dir: &Path, root: &Path, out: &mut BTreeMap<String, Vec<u8>>) {
        for e in fs::read_dir(dir).unwrap() {
            let p = e.unwrap().path();
            if p.is_dir() {
                walk(&p, root, out);
            } else {
                let rel = p.strip_prefix(root).unwrap().to_string_lossy().to_string();
                out.insert(rel, fs::read(&p).unwrap());
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(root, root, &mut out);
    out
}

#[test]
fn the_notes_folder_is_never_written() {
    let (n, ws) = open(&[
        ("pages/P.md", "- hello #tag\n"),
        ("journals/2026-10-29.md", "- TODO world\n"),
    ]);
    let before = snapshot(n.path());
    let cache = tempfile::tempdir().unwrap();
    let file = cache.path().join("c").join(index_file_name(n.path()));
    let mut ix = SearchIndex::open(&file).unwrap();
    ix.update(&ws, &keys(&["p", "2026-10-29"])).unwrap();
    assert_eq!(ix.query(&words(&["hello"]), 10).unwrap().len(), 1);
    drop(ix);
    let after = snapshot(n.path());
    assert_eq!(before, after);
    assert!(after.keys().all(|k| !k.contains(".sqlite3")), "{after:?}");
}

#[test]
fn alias_links_are_indexed_under_their_target() {
    let (_t, ws) = open(&[("pages/P.md", "- see [[Target|shown]]\n- other\n")]);
    let mut ix = SearchIndex::in_memory().unwrap();
    ix.update(&ws, &["p".into()]).unwrap();
    let q = |links: &[&str]| Query {
        words: vec![],
        states: vec![],
        links: links.iter().map(|k| keys(&[k])).collect(),
    };
    let hits = ix.query(&q(&["target"]), 10).unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!((hits[0].page.as_str(), hits[0].pos), ("p", 0));
    assert!(ix.query(&q(&["target|shown"]), 10).unwrap().is_empty());
}

#[test]
fn the_schema_version_covers_alias_link_keys() {
    // Version 2: `[[a|b]]` links index the target `a`; version 3 re-reads link
    // keys after the `\|` change. Behaviour: the two tests around this one.
    assert_eq!(SCHEMA_VERSION, 3);
}

#[test]
fn escaped_pipe_links_are_indexed_under_their_target() {
    let (_t, ws) = open(&[("pages/P.md", "- | [[Target\\|t]] |\n- other\n")]);
    let mut ix = SearchIndex::in_memory().unwrap();
    ix.update(&ws, &["p".into()]).unwrap();
    let q = Query {
        words: vec![],
        states: vec![],
        links: vec![keys(&["target"])],
    };
    let hits = ix.query(&q, 10).unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!((hits[0].page.as_str(), hits[0].pos), ("p", 0));
}

#[test]
fn a_link_filter_matches_any_of_its_keys() {
    let (_t, ws) = open(&[(
        "pages/P.md",
        "- [[k8s]] a\n- [[Kubernetes]] b\n- [[other]] c\n",
    )]);
    let mut ix = SearchIndex::in_memory().unwrap();
    ix.update(&ws, &["p".into()]).unwrap();
    let q = Query {
        words: vec![],
        states: vec![],
        links: vec![keys(&["kubernetes", "k8s"])],
    };
    let hits = ix.query(&q, 10).unwrap();
    assert_eq!(hits.iter().map(|h| h.pos).collect::<Vec<_>>(), [0, 1]);
}
