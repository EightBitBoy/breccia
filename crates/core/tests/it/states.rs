use crate::support::put;
use breccia_core::{SaveError, StateUsage, Workspace};
use std::fs;
use std::time::SystemTime;

const A: &str = "title:: A\n- WAITING one\n    odd indent continuation\n  done:: [[2026-10-01]]\n- text with WAITING inside\n";
const J: &str = "- TODO x\n\t- WAITING y\n";

fn open(files: &[(&str, &str)]) -> (tempfile::TempDir, Workspace) {
    let t = tempfile::tempdir().unwrap();
    for (rel, text) in files {
        put(t.path(), rel, text);
    }
    let (ws, _) = Workspace::open(t.path()).unwrap();
    (t, ws)
}

fn mtime(p: &std::path::Path) -> SystemTime {
    fs::metadata(p).unwrap().modified().unwrap()
}

fn fixture() -> (tempfile::TempDir, Workspace) {
    open(&[
        ("pages/A.md", A),
        ("journals/2026-10-01.md", J),
        ("pages/B.md", "- plain\n"),
    ])
}

#[test]
fn rename_state_changes_only_the_keyword_bytes() {
    let (t, mut ws) = fixture();
    let b_time = mtime(&t.path().join("pages/B.md"));
    ws.take_touched();
    let report = ws.rename_state("WAITING", "BLOCKED");
    assert_eq!(
        fs::read_to_string(t.path().join("pages/A.md")).unwrap(),
        A.replacen("- WAITING one", "- BLOCKED one", 1)
    );
    assert_eq!(
        fs::read_to_string(t.path().join("journals/2026-10-01.md")).unwrap(),
        "- TODO x\n\t- BLOCKED y\n"
    );
    assert_eq!(
        fs::read_to_string(t.path().join("pages/B.md")).unwrap(),
        "- plain\n"
    );
    assert_eq!(mtime(&t.path().join("pages/B.md")), b_time);
    assert_eq!(report.blocks, 2);
    let mut rewritten = report.rewritten.clone();
    rewritten.sort();
    assert_eq!(rewritten, vec!["2026-10-01".to_string(), "a".to_string()]);
    assert!(report.save_errors.is_empty());
    // The search index's work list names exactly the rewritten pages.
    assert_eq!(
        ws.take_touched(),
        vec!["2026-10-01".to_string(), "a".to_string()]
    );
    assert!(ws.unsaved().is_empty());
}

#[test]
fn rename_state_skips_lookalikes() {
    let (t, mut ws) = open(&[("pages/A.md", "- DO it\n- DONE it\n- DOING\n- do it\n")]);
    let report = ws.rename_state("DO", "MAYBE");
    assert_eq!(report.blocks, 1);
    assert_eq!(
        fs::read_to_string(t.path().join("pages/A.md")).unwrap(),
        "- MAYBE it\n- DONE it\n- DOING\n- do it\n"
    );
}

#[test]
fn rename_state_leaves_code_fences_and_preambles_alone() {
    let src =
        "WAITING preamble\n- WAITING a\n  ```\n  WAITING code\n  ```\n- x\n  WAITING second line\n";
    let (t, mut ws) = open(&[("pages/A.md", src)]);
    let report = ws.rename_state("WAITING", "BLOCKED");
    assert_eq!(report.blocks, 1);
    assert_eq!(
        fs::read_to_string(t.path().join("pages/A.md")).unwrap(),
        src.replacen("- WAITING a", "- BLOCKED a", 1)
    );
}

#[test]
fn rename_state_on_an_edited_block() {
    let (t, mut ws) = open(&[("pages/A.md", "- WAITING one\n- keep   it\n\t- DONE x\n")]);
    let id = ws.page("a").unwrap().doc.blocks()[0].id();
    ws.edit("a", |d, ids| d.set_text(id, "WAITING changed", ids))
        .unwrap()
        .unwrap();
    assert!(ws.unsaved().iter().any(|p| p.key == "a"));
    let report = ws.rename_state("WAITING", "BLOCKED");
    assert!(report.save_errors.is_empty());
    assert_eq!(
        fs::read_to_string(t.path().join("pages/A.md")).unwrap(),
        "- BLOCKED changed\n- keep   it\n\t- DONE x\n"
    );
}

#[test]
fn rename_state_keeps_an_unsavable_page_in_memory() {
    let (t, mut ws) = fixture();
    let outside = A.replace("odd indent", "someone else's");
    put(t.path(), "pages/A.md", &outside);
    let report = ws.rename_state("WAITING", "BLOCKED");
    assert_eq!(report.save_errors.len(), 1);
    assert_eq!(report.save_errors[0].0, "a");
    assert!(matches!(
        report.save_errors[0].1,
        SaveError::ChangedOnDisk(_)
    ));
    assert_eq!(
        fs::read_to_string(t.path().join("pages/A.md")).unwrap(),
        outside
    );
    assert!(ws.page("a").unwrap().doc.render().contains("- BLOCKED one"));
    assert!(ws.unsaved().iter().any(|p| p.key == "a"));
    // The journal could be saved.
    assert_eq!(
        fs::read_to_string(t.path().join("journals/2026-10-01.md")).unwrap(),
        "- TODO x\n\t- BLOCKED y\n"
    );
}

#[test]
fn state_usage_counts_blocks_and_pages() {
    let (_t, ws) = fixture();
    let usage = ws.state_usage();
    let got: Vec<(&str, usize, usize)> = usage
        .iter()
        .map(|u: &StateUsage| (u.keyword.as_str(), u.blocks, u.pages))
        .collect();
    assert_eq!(
        got,
        vec![
            ("TODO", 1, 1),
            ("DOING", 0, 0),
            ("WAITING", 2, 2),
            ("DONE", 0, 0),
        ]
    );
}
