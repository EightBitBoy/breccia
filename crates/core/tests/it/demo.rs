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
