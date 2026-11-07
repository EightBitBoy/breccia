//! `docs/demo/` is the sample notes folder the docs and the README
//! screenshots use. It must open without warnings, show every feature it is
//! meant to show, and be byte-stable: Breccia reads it and writes nothing.

use breccia_core::inline::{LinkKind, links};
use breccia_core::task::{done_date, task_state};
use breccia_core::{Config, IdGen, PageKind, Workspace, front_matter_len, parse};
use std::path::{Path, PathBuf};

const FOLDER: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../docs/demo");

/// Every file under `dir`, recursively.
fn files(dir: &Path, out: &mut Vec<PathBuf>) {
    for e in std::fs::read_dir(dir).unwrap_or_else(|e| panic!("{}: {e}", dir.display())) {
        let p = e.unwrap().path();
        if p.is_dir() {
            files(&p, out);
        } else {
            out.push(p);
        }
    }
}

#[test]
fn the_example_folder_opens_cleanly() {
    let root = Path::new(FOLDER);
    assert!(root.is_dir(), "{FOLDER} is missing");
    let (ws, warnings) = Workspace::open(root).unwrap();
    assert!(warnings.is_empty(), "warnings: {warnings:?}");

    let journals = ws
        .pages()
        .filter(|p| matches!(p.kind, PageKind::Journal(_)))
        .count();
    let pages = ws.pages().count() - journals;
    assert!(journals >= 3, "{journals} journals");
    assert!(pages >= 8, "{pages} pages");

    let qa = ws.page("q&a: hiring").expect("page `Q&A: hiring`");
    assert_eq!(qa.rel_path, Path::new("pages").join("Q&A_ hiring.md"));

    let reading = ws.page("reading list").expect("page `Reading list`");
    assert!(front_matter_len(reading.doc.preamble()).is_some());
    assert!(!reading.doc.blocks().is_empty());

    // `[[Reading list]]` in one journal and `[[books]]` (its alias) in another.
    assert_eq!(ws.linked_from("reading list"), 2);
    assert_eq!(
        ws.link_target("books", LinkKind::Page).key,
        "reading list",
        "`books` is an alias of Reading list"
    );
    assert_eq!(
        ws.link_target("Q&A: hiring", LinkKind::Page).key,
        "q&a: hiring"
    );

    let blocks: Vec<&str> = ws
        .pages()
        .flat_map(|p| p.doc.blocks().iter().map(|b| b.text()))
        .collect();
    assert!(
        blocks
            .iter()
            .flat_map(|t| links(t))
            .any(|l| l.key == "project x" && l.target == "Project X" && l.label.is_some()),
        "no `[[Project X|…]]` link"
    );
    for keyword in ["TODO", "DOING", "WAITING", "DONE"] {
        assert!(
            blocks
                .iter()
                .any(|t| task_state(t, &ws.config).is_some_and(|s| s.keyword == keyword)),
            "no {keyword} block"
        );
    }
    assert!(
        blocks.iter().any(|t| done_date(t).is_some()),
        "no done date"
    );

    let mut all = Vec::new();
    files(root, &mut all);
    let mut md = 0;
    for p in &all {
        let bytes = std::fs::read(p).unwrap();
        let text =
            String::from_utf8(bytes).unwrap_or_else(|_| panic!("{}: not UTF-8", p.display()));
        assert!(!text.starts_with('\u{feff}'), "{}: BOM", p.display());
        assert!(!text.contains('\r'), "{}: CR", p.display());
        match p.extension().and_then(|e| e.to_str()) {
            Some("md") => {
                assert_eq!(
                    parse(&text, &mut IdGen::new()).render(),
                    text,
                    "{}: does not round-trip",
                    p.display()
                );
                md += 1;
            }
            Some("toml") => {
                assert_eq!(p, &root.join("breccia").join("config.toml"));
                // The default, except that automatic archiving is off, so opening the
                // demo folder never writes `archived::` into the repository's files.
                assert_eq!(
                    text,
                    Config::default_toml().replacen(
                        "auto_archive = true",
                        "auto_archive = false",
                        1
                    ),
                    "config.toml is not the default with auto_archive = false"
                );
                assert!(!ws.config.board.auto_archive, "auto_archive is on");
            }
            _ => panic!("{}: unexpected file", p.display()),
        }
    }
    assert_eq!(md, ws.pages().count(), "every .md file is a page");
}

/// Copies `src` to `dst`, so a test never writes into the repository's demo folder.
fn copy_dir(src: &Path, dst: &Path) {
    std::fs::create_dir_all(dst).unwrap();
    for e in std::fs::read_dir(src).unwrap() {
        let p = e.unwrap().path();
        let to = dst.join(p.file_name().unwrap());
        if p.is_dir() {
            copy_dir(&p, &to);
        } else {
            std::fs::copy(&p, &to).unwrap();
        }
    }
}

/// `(topic, color)` of the journal blocks whose text starts with `prefix`.
fn topic_of(day: &serde_json::Value, prefix: &str) -> String {
    let b = day["blocks"]
        .as_array()
        .unwrap()
        .iter()
        .find(|b| b["text"].as_str().is_some_and(|t| t.starts_with(prefix)))
        .unwrap_or_else(|| panic!("no block starting with {prefix:?}"));
    format!(
        "{}/{}",
        b["topic"].as_str().unwrap_or("-"),
        b["color"].as_str().unwrap_or("-")
    )
}

#[test]
fn the_demo_shows_page_colors() {
    let tmp = tempfile::tempdir().unwrap();
    copy_dir(Path::new(FOLDER), tmp.path());
    let mut s = breccia_core::Session::new();
    let clock = breccia_core::Clock {
        today: chrono::NaiveDate::from_ymd_opt(2026, 10, 29).unwrap(),
        time: chrono::NaiveTime::from_hms_opt(14, 5, 9).unwrap(),
        ms: 0,
    };
    let mut run = |command: serde_json::Value| {
        let req = serde_json::from_value(
            serde_json::json!({"generation": s.generation(), "command": command}),
        )
        .unwrap();
        s.run(req, clock).unwrap_or_else(|e| panic!("{e:?}"))
    };
    run(serde_json::json!({"type": "folder.open", "path": tmp.path()}));

    let d29 = serde_json::to_value(
        run(serde_json::json!({"type": "page.get", "key": "2026-10-29"}))
            .page
            .unwrap(),
    )
    .unwrap();
    assert_eq!(topic_of(&d29, "TODO Book a room"), "q&a: hiring/violet");
    assert_eq!(
        topic_of(&d29, "[[Q&A: hiring]]: three candidates"),
        "q&a: hiring/violet"
    );

    let d28 = serde_json::to_value(
        run(serde_json::json!({"type": "page.get", "key": "2026-10-28"}))
            .page
            .unwrap(),
    )
    .unwrap();
    assert_eq!(topic_of(&d28, "Planning for"), "release 2/green");
    assert_eq!(topic_of(&d28, "We ship on"), "release 2/green");
    assert_eq!(topic_of(&d28, "Release notes go out"), "release 2/green");
    assert_eq!(topic_of(&d28, "Restarted the queue"), "on call/amber");

    let (ws, _) = Workspace::open(tmp.path()).unwrap();
    assert_eq!(
        ws.page_color("project x"),
        Some(breccia_core::color::PageColor::Named("blue"))
    );
}
