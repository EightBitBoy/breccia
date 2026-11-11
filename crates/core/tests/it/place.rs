//! `board.place`: a drop on a board sets the state and `priority::` for the
//! card's new place.

use crate::support::{self, clock_on, open_at, put, read, run};
use breccia_core::outline::BlockId;
use breccia_core::{Clock, CommandError, Output, Session};
use serde_json::{Value, json};
use std::fs;
use std::path::Path;

const DAY: &str = "journals/2026-10-29.md";

fn clock() -> Clock {
    clock_on((2026, 10, 29), 0)
}

fn cmd(s: &mut Session, json: Value) -> Result<Output, CommandError> {
    run(s, json, clock())
}

fn ok(s: &mut Session, json: Value) -> Output {
    support::ok(s, json, clock())
}

fn open(root: &Path) -> Session {
    open_at(root, clock())
}

/// The id of the card whose first line (keyword included) is `line`.
fn id(s: &mut Session, line: &str) -> BlockId {
    let b = ok(s, json!({"type": "board.get", "index": 0}))
        .board
        .unwrap();
    b.columns
        .iter()
        .flat_map(|c| &c.cards)
        .find(|c| c.blocks[0].text.split('\n').next() == Some(line))
        .unwrap_or_else(|| panic!("no card {line}"))
        .id
}

/// The first lines of column `kw`'s cards, top to bottom.
fn column(s: &mut Session, kw: &str) -> Vec<String> {
    let b = ok(s, json!({"type": "board.get", "index": 0}))
        .board
        .unwrap();
    b.columns
        .iter()
        .find(|c| c.keyword == kw)
        .unwrap()
        .cards
        .iter()
        .map(|c| c.blocks[0].text.split('\n').next().unwrap().to_string())
        .collect()
}

/// Drops card `card` into column `kw` above card `before` (none: at the end).
fn place(
    s: &mut Session,
    card: &str,
    kw: &str,
    before: Option<&str>,
) -> Result<Output, CommandError> {
    let card = id(s, card);
    let before = before.map(|b| id(s, b));
    cmd(
        s,
        json!({"type": "board.place", "id": card, "keyword": kw, "before": before}),
    )
}

fn placed(s: &mut Session, card: &str, kw: &str, before: Option<&str>) -> Output {
    place(s, card, kw, before).unwrap_or_else(|e| panic!("{card}: {e:?}"))
}

#[test]
fn a_drop_at_the_top_writes_one_more_than_the_top_card() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), DAY, "- TODO a\n- TODO b\n- TODO c\n");
    let mut s = open(t.path());
    // An all-unprioritized column: the top is 1.
    let out = placed(&mut s, "TODO c", "TODO", Some("TODO a"));
    assert_eq!(
        read(t.path(), DAY),
        "- TODO a\n- TODO b\n- TODO c\n  priority:: 1\n"
    );
    assert_eq!(
        out.page.as_ref().map(|p| p.key.as_str()),
        Some("2026-10-29")
    );
    assert_eq!(column(&mut s, "TODO"), ["TODO c", "TODO a", "TODO b"]);
    // Above a prioritized top card: its number + 1.
    placed(&mut s, "TODO b", "TODO", Some("TODO c"));
    assert_eq!(
        read(t.path(), DAY),
        "- TODO a\n- TODO b\n  priority:: 2\n- TODO c\n  priority:: 1\n"
    );
    assert_eq!(column(&mut s, "TODO"), ["TODO b", "TODO c", "TODO a"]);
}

#[test]
fn a_drop_between_two_cards_raises_the_cards_above_as_far_as_needed_on_every_page() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/P.md", "- TODO p\n  priority:: 3\n");
    put(
        t.path(),
        DAY,
        "- TODO q\n  priority:: 2\n- TODO r\n  priority:: 2\n- TODO s\n- TODO keep\n  priority:: high\n",
    );
    let mut s = open(t.path());
    assert_eq!(
        column(&mut s, "TODO"),
        ["TODO p", "TODO q", "TODO r", "TODO s", "TODO keep"]
    );
    let out = placed(&mut s, "TODO s", "TODO", Some("TODO r"));
    // s = r + 1 = 3; q (2) is not higher, so 4; p (3) is not higher, so 5.
    assert_eq!(
        read(t.path(), DAY),
        "- TODO q\n  priority:: 4\n- TODO r\n  priority:: 2\n- TODO s\n  priority:: 3\n- TODO keep\n  priority:: high\n"
    );
    assert_eq!(read(t.path(), "pages/P.md"), "- TODO p\n  priority:: 5\n");
    let changed: Vec<&str> = out.changed.iter().map(|p| p.key.as_str()).collect();
    assert_eq!(changed, ["p"]);
    assert_eq!(
        column(&mut s, "TODO"),
        ["TODO p", "TODO q", "TODO s", "TODO r", "TODO keep"]
    );

    // One undo step on either page takes the whole drop back, and redo brings it again.
    let out = ok(&mut s, json!({"type": "history.undo", "page": "p"}));
    assert_eq!(read(t.path(), "pages/P.md"), "- TODO p\n  priority:: 3\n");
    assert_eq!(
        read(t.path(), DAY),
        "- TODO q\n  priority:: 2\n- TODO r\n  priority:: 2\n- TODO s\n- TODO keep\n  priority:: high\n"
    );
    let changed: Vec<&str> = out.changed.iter().map(|p| p.key.as_str()).collect();
    assert_eq!(changed, ["2026-10-29"]);
    ok(
        &mut s,
        json!({"type": "history.redo", "page": "2026-10-29"}),
    );
    assert_eq!(read(t.path(), "pages/P.md"), "- TODO p\n  priority:: 5\n");
    assert!(read(t.path(), DAY).contains("- TODO s\n  priority:: 3\n"));
}

#[test]
fn the_raise_stops_once_the_order_holds() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        DAY,
        "- TODO a\n  priority:: 9\n- TODO b\n  priority:: 3\n- TODO c\n  priority:: 2\n- TODO d\n",
    );
    let mut s = open(t.path());
    placed(&mut s, "TODO d", "TODO", Some("TODO c"));
    // d = 3; b (3) is raised to 4; a (9) is higher already.
    assert_eq!(
        read(t.path(), DAY),
        "- TODO a\n  priority:: 9\n- TODO b\n  priority:: 4\n- TODO c\n  priority:: 2\n- TODO d\n  priority:: 3\n"
    );
}

#[test]
fn a_drop_just_above_the_unprioritized_cards_writes_one() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        DAY,
        "- TODO a\n  priority:: 1\n- TODO b\n- TODO c\n",
    );
    let mut s = open(t.path());
    placed(&mut s, "TODO c", "TODO", Some("TODO b"));
    // c = 1, and a (1) is raised to 2.
    assert_eq!(
        read(t.path(), DAY),
        "- TODO a\n  priority:: 2\n- TODO b\n- TODO c\n  priority:: 1\n"
    );
    assert_eq!(column(&mut s, "TODO"), ["TODO a", "TODO c", "TODO b"]);
    // At the end of a column of prioritized cards only, too.
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        DAY,
        "- TODO a\n  priority:: 5\n- TODO b\n  priority:: 4\n",
    );
    let mut s = open(t.path());
    placed(&mut s, "TODO a", "TODO", None);
    assert_eq!(
        read(t.path(), DAY),
        "- TODO a\n  priority:: 1\n- TODO b\n  priority:: 4\n"
    );
}

#[test]
fn a_drop_among_the_unprioritized_cards_removes_the_line() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        DAY,
        "- TODO a\n  priority:: 2\n  owner:: Ben\n- TODO b\n- TODO c\n- TODO d\n  priority:: high\n",
    );
    let mut s = open(t.path());
    placed(&mut s, "TODO a", "TODO", Some("TODO c"));
    assert_eq!(
        read(t.path(), DAY),
        "- TODO a\n  owner:: Ben\n- TODO b\n- TODO c\n- TODO d\n  priority:: high\n"
    );
    // Back in the computed order (place in the page).
    assert_eq!(
        column(&mut s, "TODO"),
        ["TODO a", "TODO b", "TODO c", "TODO d"]
    );
    // Among the unprioritized cards an invalid line goes too.
    placed(&mut s, "TODO d", "TODO", Some("TODO b"));
    assert_eq!(
        read(t.path(), DAY),
        "- TODO a\n  owner:: Ben\n- TODO b\n- TODO c\n- TODO d\n"
    );
}

#[test]
fn a_drop_into_another_column_sets_the_state_and_the_number() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        DAY,
        "- TODO a\n- DOING b\n  priority:: 4\n- TODO c\n  priority:: 7\n",
    );
    let mut s = open(t.path());
    placed(&mut s, "TODO a", "DOING", Some("DOING b"));
    assert_eq!(
        read(t.path(), DAY),
        "- DOING a\n  priority:: 5\n- DOING b\n  priority:: 4\n- TODO c\n  priority:: 7\n"
    );
    assert_eq!(column(&mut s, "DOING"), ["DOING a", "DOING b"]);
    // An empty column keeps the card's priority. Among the
    // unprioritized cards of another column: the line goes.
    placed(&mut s, "TODO c", "WAITING", None);
    assert!(read(t.path(), DAY).ends_with("- WAITING c\n  priority:: 7\n"));
    placed(&mut s, "DOING b", "TODO", None);
    put(t.path(), "pages/Q.md", "- TODO x\n- TODO y\n");
    let mut s = open(t.path());
    placed(&mut s, "DOING a", "TODO", Some("TODO y"));
    assert_eq!(
        read(t.path(), DAY),
        "- TODO a\n- TODO b\n  priority:: 4\n- WAITING c\n  priority:: 7\n"
    );
}

#[test]
fn a_drop_into_a_finished_column_only_changes_the_state() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        DAY,
        "- TODO a\n  priority:: 3\n- DONE b\n  done:: [[2026-10-20]]\n",
    );
    let mut s = open(t.path());
    placed(&mut s, "TODO a", "DONE", Some("DONE b"));
    let done = "- DONE a\n  done:: [[2026-10-29]] 14:05:09\n- DONE b\n  done:: [[2026-10-20]]\n";
    assert_eq!(read(t.path(), DAY), done);
    // Within a finished column nothing changes.
    let out = placed(&mut s, "DONE b", "DONE", Some("DONE a"));
    assert_eq!(read(t.path(), DAY), done);
    assert!(out.page.is_none() && out.changed.is_empty());
}

#[test]
fn a_drop_at_the_cards_own_place_changes_nothing() {
    let t = tempfile::tempdir().unwrap();
    let src = "- TODO a\n  priority:: 2\n- TODO b\n- TODO c\n";
    put(t.path(), DAY, src);
    let mut s = open(t.path());
    for (card, before) in [
        ("TODO a", Some("TODO b")),
        ("TODO a", Some("TODO a")),
        ("TODO b", Some("TODO c")),
        ("TODO c", None),
    ] {
        let out = placed(&mut s, card, "TODO", before);
        assert_eq!(read(t.path(), DAY), src, "{card} above {before:?}");
        assert!(out.page.is_none(), "{card} above {before:?}");
    }
}

#[test]
fn hand_typed_ties_are_ordered_by_the_drop() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        DAY,
        "- TODO a\n  priority:: 3\n- TODO b\n  priority:: 3\n- TODO c\n",
    );
    let mut s = open(t.path());
    placed(&mut s, "TODO c", "TODO", Some("TODO b"));
    assert_eq!(
        read(t.path(), DAY),
        "- TODO a\n  priority:: 5\n- TODO b\n  priority:: 3\n- TODO c\n  priority:: 4\n"
    );
    assert_eq!(column(&mut s, "TODO"), ["TODO a", "TODO c", "TODO b"]);
}

#[test]
fn a_stale_board_is_refused_and_nothing_is_written() {
    let t = tempfile::tempdir().unwrap();
    let src = "- TODO a\n- TODO b\n  priority:: 1\n- DOING c\n";
    put(t.path(), DAY, src);
    let mut s = open(t.path());
    // `before` is in another column now.
    let e = place(&mut s, "TODO a", "TODO", Some("DOING c")).unwrap_err();
    assert_eq!(e.code, "boardChanged");
    assert_eq!(read(t.path(), DAY), src);
    // A page to be written changed on disk since Breccia read it.
    put(t.path(), "pages/P.md", "- TODO p\n  priority:: 1\n");
    let mut s = open(t.path());
    let a = id(&mut s, "TODO a");
    let b = id(&mut s, "TODO b");
    fs::write(
        t.path().join("pages/P.md"),
        "- TODO p\n  priority:: 1\n- outside\n",
    )
    .unwrap();
    // a would take 2 above b (1), and p (1, above b) would be raised: refused before anything changes.
    let e = cmd(
        &mut s,
        json!({"type": "board.place", "id": a, "keyword": "TODO", "before": b}),
    )
    .unwrap_err();
    assert_eq!(e.code, "boardChanged", "{e:?}");
    assert_eq!(read(t.path(), DAY), src);
    assert_eq!(
        read(t.path(), "pages/P.md"),
        "- TODO p\n  priority:: 1\n- outside\n"
    );
}

#[test]
fn a_drop_into_an_empty_column_writes_no_priority() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), DAY, "- TODO a\n- TODO b\n  priority:: 2\n");
    let mut s = open(t.path());
    // An empty column gives no priority, and keeps one the task has.
    placed(&mut s, "TODO a", "DOING", None);
    assert_eq!(read(t.path(), DAY), "- DOING a\n- TODO b\n  priority:: 2\n");
    placed(&mut s, "TODO b", "WAITING", None);
    assert_eq!(
        read(t.path(), DAY),
        "- DOING a\n- WAITING b\n  priority:: 2\n"
    );
}
