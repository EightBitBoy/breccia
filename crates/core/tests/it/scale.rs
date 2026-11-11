//! Scale measurement (spec §8): 5,000 pages (2,000 pages + 3,000 journal days) and
//! 100,000 blocks. Run by hand, it is not part of the normal suite:
//!
//!   cargo test --release -p breccia-core -- --ignored --nocapture scale::
//!
//! It prints one line per operation, `name median_ms bar_ms ok|OVER`, and asserts nothing
//! about time (machines differ). It asserts only that the folder is not empty.

use crate::support::{self, DAY, clock_on, put};
use breccia_core::git::{Discovered, GitEngine, Now, discover};
use breccia_core::index::LinkIndex;
use breccia_core::search::INDEX_CHUNK_PAGES;
use breccia_core::{Clock, IdGen, Output, Session, parse};
use chrono::{Duration, NaiveDate};
use serde_json::{Value, json};
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Instant;

const RUNS: usize = 5;
/// How many pages to generate; lowering it must trip the row-count assertion.
const PAGES: usize = 2000;
const DAYS: usize = 3000;
const BLOCKS: usize = 20;

fn today() -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 10, 29).unwrap()
}

fn clock() -> Clock {
    clock_on(DAY, 0)
}

fn run(s: &mut Session, command: Value) -> Output {
    support::ok(s, command, clock())
}

/// The text of file number `i`: 20 blocks, each linking one page, every fourth with a
/// tag, every tenth a TODO.
fn content(i: usize, edit: usize) -> String {
    let mut out = String::new();
    for b in 0..BLOCKS {
        let todo = if b % 10 == 0 { "TODO " } else { "" };
        let tag = if b % 4 == 0 {
            format!(" #t{}", b % 50)
        } else {
            String::new()
        };
        let mark = if edit > 0 && b == 1 {
            format!(" edit{edit}")
        } else {
            String::new()
        };
        out.push_str(&format!(
            "- {todo}Block {b} links [[Page {}]]{tag}{mark}\n",
            (i * 7 + b) % PAGES
        ));
    }
    out
}

fn page_rel(i: usize) -> String {
    format!("pages/F{}/Page {i}.md", i % 50)
}

fn generate(root: &Path) {
    for i in 0..PAGES {
        put(root, &page_rel(i), &content(i, 0));
    }
    // 3,000 days from yesterday back; today's page is made in memory by the feed.
    for k in 0..DAYS {
        let d = today() - Duration::days(1 + k as i64);
        put(
            root,
            &format!("journals/{}.md", d.format("%Y-%m-%d")),
            &content(k, 0),
        );
    }
}

fn median(mut v: Vec<f64>) -> f64 {
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    v[v.len() / 2]
}

/// Median over `RUNS` runs of `f`, in milliseconds; `f` returns the time it wants counted.
fn time(mut f: impl FnMut() -> f64) -> f64 {
    median((0..RUNS).map(|_| f()).collect())
}

/// The sum of the sizes of all files under `dir`, in bytes.
fn dir_bytes(dir: &Path) -> u64 {
    fs::read_dir(dir)
        .unwrap()
        .map(|e| {
            let e = e.unwrap();
            let m = e.metadata().unwrap();
            if m.is_dir() {
                dir_bytes(&e.path())
            } else {
                m.len()
            }
        })
        .sum()
}

/// Runs `search.query` and returns (blocks matched, more, has a date line).
fn query(s: &mut Session, text: &str) -> (usize, bool, bool) {
    let v = run(s, json!({"type": "search.query", "text": text}))
        .search
        .expect("search view");
    let n = v.groups.iter().map(|g| g.hits.len()).sum();
    (n, v.more, v.date.is_some())
}

fn ms(t: Instant) -> f64 {
    t.elapsed().as_secs_f64() * 1000.0
}

fn report(name: &str, median_ms: f64, bar_ms: f64) {
    let verdict = if median_ms <= bar_ms { "ok" } else { "OVER" };
    println!("{name} {median_ms:.2} {bar_ms:.0} {verdict}");
}

#[test]
#[ignore]
fn scale_5000_pages() {
    let t = tempfile::tempdir().unwrap();
    let root = t.path();
    generate(root);

    let open_ms = time(|| {
        let mut s = Session::new();
        let t0 = Instant::now();
        run(&mut s, json!({"type": "folder.open", "path": root}));
        ms(t0)
    });

    let cache = tempfile::tempdir().unwrap();
    let mut s = Session::with_cache(cache.path().to_path_buf());
    run(&mut s, json!({"type": "folder.open", "path": root}));

    // The whole background build, in chunks as the shell does it.
    let gen_ = s.generation();
    let mut chunks = Vec::new();
    let build_t0 = Instant::now();
    let total = loop {
        let t0 = Instant::now();
        let p = s
            .index_step(gen_, INDEX_CHUNK_PAGES)
            .unwrap()
            .expect("folder is open");
        chunks.push(ms(t0));
        if p.done == p.total {
            break p.total;
        }
    };
    let build_ms = ms(build_t0);
    let chunk_ms = median(chunks.clone());
    let chunk_max = chunks.iter().cloned().fold(0.0, f64::max);
    println!(
        "index build: {total} pages in {} chunks, max chunk {chunk_max:.2} ms",
        chunks.len()
    );

    let mut q_words = (0, false, false);
    let q_words_ms = time(|| {
        let t0 = Instant::now();
        q_words = query(&mut s, "page 12");
        ms(t0)
    });
    let mut q_sub = (0, false, false);
    let q_sub_ms = time(|| {
        let t0 = Instant::now();
        q_sub = query(&mut s, "age 12");
        ms(t0)
    });
    let mut q_short = (0, false, false);
    let q_short_ms = time(|| {
        let t0 = Instant::now();
        q_short = query(&mut s, "12");
        ms(t0)
    });
    let mut q_todo = (0, false, false);
    let q_todo_ms = time(|| {
        let t0 = Instant::now();
        q_todo = query(&mut s, "TODO");
        ms(t0)
    });
    let mut q_date = (0, false, false);
    let q_date_ms = time(|| {
        let t0 = Instant::now();
        q_date = query(&mut s, "12 Mar");
        ms(t0)
    });

    let mut feed_days = 0;
    let feed_ms = time(|| {
        let t0 = Instant::now();
        let out = run(&mut s, json!({"type": "journal.feed"}));
        let e = ms(t0);
        feed_days = out.feed.unwrap().days.len();
        e
    });

    let tree_ms = time(|| {
        let t0 = Instant::now();
        let out = run(&mut s, json!({"type": "folder.tree"}));
        let e = ms(t0);
        assert!(out.tree.is_some());
        e
    });

    let mut rows = Vec::new();
    let table_ms = time(|| {
        let t0 = Instant::now();
        let out = run(&mut s, json!({"type": "pages.table"}));
        let e = ms(t0);
        rows = out.table.unwrap();
        e
    });

    let board_ms = time(|| {
        let t0 = Instant::now();
        let out = run(&mut s, json!({"type": "board.get", "index": 0}));
        let e = ms(t0);
        assert!(out.board.is_some());
        e
    });

    // The network view: graph.get without and with a layout file (the file
    // read happens under the session lock), and graph.saveLayout for every node.
    let mut graph = None;
    let get_cold_ms = time(|| {
        let t0 = Instant::now();
        let out = run(&mut s, json!({"type": "graph.get"}));
        let e = ms(t0);
        graph = out.graph;
        e
    });
    let graph = graph.expect("graph view");
    assert!(graph.nodes.len() >= 5000, "graph.get answers every page");
    assert!(
        graph.positions.iter().all(Option::is_none),
        "no layout file yet"
    );
    let graph_json_bytes = serde_json::to_string(&graph).unwrap().len();
    let positions: Vec<Value> = graph
        .nodes
        .iter()
        .enumerate()
        .map(|(i, n)| json!({"key": n.key, "x": i as f64 * 1.37, "y": (i % 97) as f64 * 2.91}))
        .collect();
    let save_ms = time(|| {
        let t0 = Instant::now();
        run(
            &mut s,
            json!({"type": "graph.saveLayout", "positions": positions}),
        );
        ms(t0)
    });
    let mut with_layout = 0;
    let get_warm_ms = time(|| {
        let t0 = Instant::now();
        let out = run(&mut s, json!({"type": "graph.get"}));
        let e = ms(t0);
        with_layout = out.graph.unwrap().positions.iter().flatten().count();
        e
    });
    assert_eq!(
        with_layout,
        graph.nodes.len(),
        "the layout file is read back"
    );
    println!(
        "graph: {} nodes, {} edges (directed), graph.get JSON {:.2} MB",
        graph.nodes.len(),
        graph.edges.len(),
        graph_json_bytes as f64 / 1e6
    );

    // files.changed: change files on disk (outside the timing), then tell the session.
    let mut edit = 0;
    let mut changed = |n: usize| {
        time(|| {
            edit += 1;
            let paths: Vec<String> = (0..n).map(page_rel).collect();
            for (i, rel) in paths.iter().enumerate() {
                put(root, rel, &content(i, edit));
            }
            let t0 = Instant::now();
            let out = run(&mut s, json!({"type": "files.changed", "paths": paths}));
            let e = ms(t0);
            assert_eq!(out.changed.len(), n, "files.changed answers every file");
            e
        })
    };
    let changed1_ms = changed(1);
    let changed100_ms = changed(100);

    // block.setText on a page block: open Page 1000, then set the text of its first block.
    let shown = run(&mut s, json!({"type": "page.get", "key": "page 1000"}));
    let id = shown.page.expect("page 1000").blocks[0].id;
    let mut n = 0;
    let set_ms = time(|| {
        n += 1;
        let t0 = Instant::now();
        run(
            &mut s,
            json!({"type": "block.setText", "id": id, "text": format!("typed {n} [[Page 3]]")}),
        );
        ms(t0)
    });

    // block.split: 21 runs, each on the block the last answer put the caret in.
    let shown = run(&mut s, json!({"type": "page.get", "key": "page 1001"}));
    let mut split_id = shown.page.expect("page 1001").blocks[0].id;
    let mut split_samples = Vec::new();
    for _ in 0..21 {
        let t0 = Instant::now();
        let out = run(
            &mut s,
            json!({"type": "block.split", "id": split_id, "at": 0}),
        );
        split_samples.push(ms(t0));
        split_id = out.focus.expect("split focus").id;
    }
    let mut sorted = split_samples.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    println!("block.split samples (sorted, ms): {sorted:.2?}");
    let split_ms = median(split_samples);

    // links.set_page: a LinkIndex filled with every generated page, then page 1000's document.
    let mut links = LinkIndex::new();
    let mut ids = IdGen::new();
    let mut doc1000 = None;
    for i in 0..PAGES {
        let doc = parse(&content(i, 0), &mut ids);
        links.set_page(&format!("page {i}"), &doc);
        if i == 1000 {
            doc1000 = Some(doc);
        }
    }
    for k in 0..DAYS {
        let d = today() - Duration::days(1 + k as i64);
        links.set_page(
            &d.format("%Y-%m-%d").to_string(),
            &parse(&content(k, 0), &mut ids),
        );
    }
    let doc1000 = doc1000.unwrap();
    let set_page_ms = time(|| {
        let t0 = Instant::now();
        links.set_page("page 1000", &doc1000);
        ms(t0)
    });

    // Query-time flush: a fresh session whose first query finds every page pending.
    let cache2 = tempfile::tempdir().unwrap();
    let mut s2 = Session::with_cache(cache2.path().to_path_buf());
    run(&mut s2, json!({"type": "folder.open", "path": root}));
    let t0 = Instant::now();
    let flushed = query(&mut s2, "page 12");
    let flush_ms = ms(t0);
    assert!(flushed.0 > 0, "flush answers hits");
    drop(s2);

    // Index size: close the session (the last connection checkpoints the log), sum the cache.
    drop(s);
    let index_bytes = dir_bytes(cache.path());
    let notes_bytes = dir_bytes(root);

    println!("name median_ms bar_ms verdict");
    report("search index build (all pages, chunks)", build_ms, 10000.0);
    report("index_step (one chunk)", chunk_ms, 16.0);
    report("search.query words \"page 12\"", q_words_ms, 100.0);
    report("search.query substring \"age 12\"", q_sub_ms, 100.0);
    report("search.query short word \"12\"", q_short_ms, 100.0);
    report("search.query filter \"TODO\"", q_todo_ms, 100.0);
    report("search.query date \"12 Mar\"", q_date_ms, 100.0);
    println!(
        "search index size {:.1} MB, notes folder {:.1} MB",
        index_bytes as f64 / 1e6,
        notes_bytes as f64 / 1e6
    );
    println!("query-time flush of all pages (fresh session) {flush_ms:.0} ms");
    println!("links.set_page (one 20-block page) {set_page_ms:.3} ms (no bar)");
    report("block.split (21 samples)", split_ms, 16.0);
    report("folder.open + journal.feed", open_ms + feed_ms, 2000.0);
    report("folder.open", open_ms, 2000.0);
    report("journal.feed", feed_ms, 2000.0);
    report("folder.tree", tree_ms, 100.0);
    report("pages.table", table_ms, 100.0);
    report("board.get", board_ms, 200.0);
    report("graph.get (no layout file)", get_cold_ms, 100.0);
    report("graph.get (with layout file)", get_warm_ms, 100.0);
    report("graph.saveLayout (every node)", save_ms, 50.0);
    report("files.changed (1 file)", changed1_ms, 50.0);
    report("files.changed (100 files)", changed100_ms, 500.0);
    report("block.setText", set_ms, 16.0);

    // Not a time check: the folder must not be empty, so a number cannot be silently
    // the measurement of nothing. 5,000 pages = 2,000 pages + 3,000 days; the feed lists today too.
    assert!(
        q_words.0 > 0 && q_sub.0 > 0 && q_short.0 > 0,
        "queries answer hits"
    );
    assert_eq!(q_todo.0, 200, "TODO filter hits");
    assert!(q_todo.1, "TODO filter has more");
    assert!(q_date.2, "the date query shows a date line");
    assert_eq!(
        q_date.0, 0,
        "no block of the fixture contains the text 12 Mar"
    );
    assert!(!q_date.1, "date query has no more");
    assert_eq!(total, 5000, "index build covers every page and day");
    assert_eq!(rows.len(), 5000, "pages.table rows");
    assert_eq!(feed_days, 3001, "journal.feed days");
}

/// The Git engine on 5,000 pages: a commit step after one changed
/// page, the created dates, and how long a pull holds the session lock. Bar: the lock
/// is held under 500 ms for an integrate that brings in one changed page, with the
/// pre-rebase commit of a save that landed during the fetch.
///
///   cargo test --release -p breccia-core -- --ignored --nocapture scale::git_at_scale
#[test]
#[ignore]
fn git_at_scale() {
    const MIN: i64 = 60_000;
    let e = crate::gitenv::env();
    let bare = crate::gitenv::bare(&e, "remote.git");
    let mine = e.root.path().join("mine");
    fs::create_dir_all(&mine).unwrap();
    crate::gitenv::git(&e, &mine, &["init", "-q"]);
    generate(&mine);
    let git = |dir: &Path, args: &[&str]| crate::gitenv::git(&e, dir, args);
    git(&mine, &["add", "-A"]);
    git(&mine, &["commit", "-q", "-m", "all"]);
    git(&mine, &["remote", "add", "origin", &bare.to_string_lossy()]);
    git(&mine, &["push", "-q", "-u", "origin", "main"]);
    let theirs = e.root.path().join("theirs");
    git(
        e.root.path(),
        &["clone", "-q", &bare.to_string_lossy(), "theirs"],
    );

    let session = Arc::new(Mutex::new(Session::new()));
    run(
        &mut session.lock().unwrap(),
        json!({"type": "folder.open", "path": &mine}),
    );
    let now = |ms: i64| Now {
        ms,
        local: chrono::DateTime::from_timestamp_millis(ms)
            .unwrap()
            .naive_utc(),
        clock: clock(),
    };
    let t0: i64 = 1_800_000_000_000;
    let mut engine = GitEngine::new(e.git.clone());
    let start = Instant::now();
    engine.tick(&session, now(t0));
    println!(
        "first tick (discovery, commit step, pull, dates) {:.0} ms",
        ms(start)
    );

    let repo = match discover(&e.git, &mine).unwrap() {
        Discovered::Repo(r) => r,
        _ => panic!("not a repo"),
    };
    let created_ms = time(|| {
        let t = Instant::now();
        let dates = repo.created_dates().unwrap();
        let took = ms(t);
        assert!(dates.len() >= 5000, "created dates cover the pages");
        took
    });

    // A commit step after one changed page: save, status, commit.
    let mut n = 0;
    let commit_ms = time(|| {
        n += 1;
        put(&mine, &page_rel(7), &content(7, 100 + n));
        let t = Instant::now();
        assert!(repo.identity_ok().unwrap());
        let changes = repo.changes().unwrap();
        assert_eq!(changes.len(), 1);
        repo.commit("notes: scale").unwrap().expect("a commit");
        ms(t)
    });
    git(&mine, &["push", "-q", "origin", "main"]);

    // A pull that brings in one changed page, while a save lands during the fetch.
    let shown = run(
        &mut session.lock().unwrap(),
        json!({"type": "page.get", "key": "page 1000"}),
    );
    let id = shown.page.expect("page 1000").blocks[0].id;
    let typed = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let save_hook = || -> Box<dyn FnMut() + Send> {
        let hooked = Arc::clone(&session);
        let typed = Arc::clone(&typed);
        Box::new(move || {
            let k = typed.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            run(
                &mut hooked.lock().unwrap(),
                json!({"type": "block.setText", "id": id, "text": format!("saved during fetch {k}")}),
            );
        })
    };
    // One round: `theirs` pushes a changed page, then `mine` ticks; returns
    // (lock held ms, whole tick ms).
    let mut round_no = 0;
    let mut round = |engine: &mut GitEngine| -> (f64, f64) {
        round_no += 1;
        let k = round_no;
        git(&theirs, &["pull", "-q", "--rebase", "origin", "main"]);
        put(&theirs, &page_rel(1001), &content(1001, 500 + k as usize));
        git(&theirs, &["add", "-A"]);
        git(&theirs, &["commit", "-q", "-m", "theirs"]);
        git(&theirs, &["push", "-q", "origin", "main"]);
        let t = Instant::now();
        let step = engine.tick(&session, now(t0 + k * 5 * MIN));
        let tick = ms(t);
        let held = engine.last_lock_held().expect("the pull ran");
        assert_eq!(step.outputs.len(), 1, "the pull reloaded its page");
        assert_eq!(step.outputs[0].1.changed.len(), 1);
        assert_eq!(git(&mine, &["status", "--porcelain"]), "");
        (held.as_secs_f64() * 1000.0, tick)
    };

    // A save lands during the fetch: the unlocked commit after the fetch takes it.
    engine.after_fetch(save_hook());
    let (mut during, mut during_tick) = (Vec::new(), Vec::new());
    for _ in 0..RUNS {
        let (l, t) = round(&mut engine);
        during.push(l);
        during_tick.push(t);
    }
    println!("lock held, save during fetch (ms): {during:.1?}");
    let lock_ms = median(during);
    let tick_ms = median(during_tick);

    // Worst case: a save lands in the last instant before the lock, so the
    // commit under the lock has to take it.
    engine.after_fetch(Box::new(|| {}));
    engine.before_lock(save_hook());
    let mut last = Vec::new();
    for _ in 0..RUNS {
        last.push(round(&mut engine).0);
    }
    println!("lock held, save just before the lock (ms): {last:.1?}");
    let last_ms = median(last);

    // No save during the fetch: the lock covers the status check, the rebase and the reload.
    engine.before_lock(Box::new(|| {}));
    let mut quiet_samples = Vec::new();
    for _ in 0..RUNS {
        quiet_samples.push(round(&mut engine).0);
    }
    println!("lock held, no save during fetch (ms): {quiet_samples:.1?}");
    let quiet_ms = median(quiet_samples);
    let status_ms = time(|| {
        let t = Instant::now();
        repo.changes().unwrap();
        ms(t)
    });

    println!("name median_ms bar_ms verdict");
    println!("git commit step (1 changed page, 5,000 pages) {commit_ms:.1} ms (no bar)");
    println!("git created_dates (5,000 pages, 1 commit + {n} more) {created_ms:.1} ms (no bar)");
    println!("git whole tick of a pull with a save during the fetch {tick_ms:.1} ms (no bar)");
    println!("git status of the folder (clean) {status_ms:.1} ms (no bar)");
    report(
        "git lock held, integrate with a save during the fetch",
        lock_ms,
        500.0,
    );
    report(
        "git lock held, integrate with a save just before the lock (worst case)",
        last_ms,
        500.0,
    );
    report(
        "git lock held, integrate with no save during the fetch",
        quiet_ms,
        500.0,
    );
}
