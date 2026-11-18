use breccia_core::dailies::*;
use breccia_core::{BlockId, Document, EditError, IdGen, parse};
use chrono::{NaiveDate, NaiveDateTime};

fn at(h: u32, m: u32, s: u32) -> NaiveDateTime {
    NaiveDate::from_ymd_opt(2026, 11, 18)
        .unwrap()
        .and_hms_opt(h, m, s)
        .unwrap()
}

fn doc(src: &str) -> Document {
    parse(src, &mut IdGen::new())
}

fn id(d: &Document, i: usize) -> BlockId {
    d.blocks()[i].id()
}

#[test]
fn checked_at_reads_the_three_forms() {
    assert_eq!(
        checked_at("a\nchecked:: 2026-11-18 07:42"),
        Some(at(7, 42, 0))
    );
    assert_eq!(
        checked_at("a\nchecked:: 2026-11-18 07:42:09"),
        Some(at(7, 42, 0))
    );
    assert_eq!(checked_at("a\nchecked:: 2026-11-18"), Some(at(0, 0, 0)));
    for t in [
        "a\nchecked:: [[2026-11-18]] 07:42",
        "a\nchecked:: soon",
        "a\nChecked:: 2026-11-18 07:42",
        "a\nplain\nchecked:: 2026-11-18 07:42",
        "a",
    ] {
        assert_eq!(checked_at(t), None, "{t:?}");
    }
    assert_eq!(
        checked_at("a\nchecked:: 2026-11-18 07:42\nchecked:: 2026-11-17 01:00"),
        Some(at(7, 42, 0))
    );
    assert_eq!(daily_text("a b\nchecked:: x"), "a b");
}

#[test]
fn check_writes_one_line() {
    let mut d = doc("- Check emails\n- Water\n");
    let first = id(&d, 0);
    d.check_daily(first, at(7, 42, 31)).unwrap();
    assert_eq!(
        d.render(),
        "- Check emails\n  checked:: 2026-11-18 07:42\n- Water\n"
    );
    d.check_daily(first, at(8, 0, 0)).unwrap();
    assert_eq!(
        d.render(),
        "- Check emails\n  checked:: 2026-11-18 08:00\n- Water\n"
    );
}

#[test]
fn uncheck_removes_every_checked_line() {
    let mut d = doc(
        "- a\n  checked:: 2026-11-18 07:42\n  note:: x\n  checked:: 2026-11-17 01:00\n  other:: y\n- b\n",
    );
    let a = id(&d, 0);
    d.uncheck_daily(a).unwrap();
    assert_eq!(d.render(), "- a\n  note:: x\n  other:: y\n- b\n");
    // Nothing to remove: no change.
    d.uncheck_daily(a).unwrap();
    assert_eq!(d.render(), "- a\n  note:: x\n  other:: y\n- b\n");
}

#[test]
fn edit_keeps_everything_after_the_first_line() {
    let src = "- a\n  note:: x\n  checked:: 2026-11-18 07:42\n  more\n- z\n";
    let mut d = doc(src);
    let a = id(&d, 0);
    d.edit_daily(a, "b").unwrap();
    assert_eq!(
        d.render(),
        "- b\n  note:: x\n  checked:: 2026-11-18 07:42\n  more\n- z\n"
    );
    for t in ["", "  "] {
        assert_eq!(d.edit_daily(a, t), Err(EditError::EmptyDaily), "{t:?}");
    }
    assert_eq!(d.edit_daily(a, "x\ny"), Err(EditError::MultiLineDaily));
    let before = d.render();
    assert_eq!(d.edit_daily(a, "```"), Err(EditError::WouldChangeStructure));
    assert_eq!(d.render(), before);

    let mut n = doc("- a\n\t- child\n");
    let child = id(&n, 1);
    assert_eq!(n.edit_daily(child, "x"), Err(EditError::NotADaily));
    assert_eq!(n.check_daily(child, at(1, 0, 0)), Err(EditError::NotADaily));
    assert_eq!(n.uncheck_daily(child), Err(EditError::NotADaily));
    assert_eq!(n.move_daily(child, None), Err(EditError::NotADaily));
    let a = id(&n, 0);
    assert_eq!(n.move_daily(a, Some(child)), Err(EditError::NotADaily));
    assert_eq!(n.render(), "- a\n\t- child\n");
}

#[test]
fn add_appends_a_top_level_block() {
    let mut ids = IdGen::new();
    let mut d = parse("", &mut ids);
    d.add_daily("a", &mut ids).unwrap();
    assert_eq!(d.render(), "- a\n");

    let mut d = parse("- old", &mut ids);
    let old = d.blocks()[0].id();
    let new = d.add_daily("new", &mut ids).unwrap();
    assert_eq!(d.render(), "- old\n- new\n");
    assert_eq!(d.blocks()[0].id(), old);
    assert_eq!(d.blocks()[1].id(), new);
    assert_eq!(d.blocks()[0].raw(), Some("- old"));

    let mut d = parse("# My dailies\n- a\n", &mut ids);
    d.add_daily("b", &mut ids).unwrap();
    assert_eq!(d.render(), "# My dailies\n- a\n- b\n");

    let mut d = parse("# My dailies\n", &mut ids);
    d.add_daily("b", &mut ids).unwrap();
    assert_eq!(d.render(), "# My dailies\n- b\n");

    // Refused, and the document is as it was.
    let mut d = parse("- old", &mut ids);
    assert_eq!(
        d.add_daily("```", &mut ids),
        Err(EditError::WouldChangeStructure)
    );
    assert_eq!(d.render(), "- old");
    assert_eq!(d.blocks().len(), 1);
    assert_eq!(d.add_daily(" ", &mut ids), Err(EditError::EmptyDaily));
    assert_eq!(
        d.add_daily("a\nb", &mut ids),
        Err(EditError::MultiLineDaily)
    );
    assert_eq!(d.render(), "- old");
}

#[test]
fn move_daily_changes_only_the_order() {
    let mut d = doc("- a\n  checked:: 2026-11-18 07:42\n\t- child\n- b\n- c");
    let (a, c) = (id(&d, 0), id(&d, 3));
    d.move_daily(c, Some(a)).unwrap();
    assert_eq!(
        d.render(),
        "- c\n- a\n  checked:: 2026-11-18 07:42\n\t- child\n- b\n"
    );
    d.move_daily(a, None).unwrap();
    assert_eq!(
        d.render(),
        "- c\n- b\n- a\n  checked:: 2026-11-18 07:42\n\t- child\n"
    );
    // Edges: before itself is a no-op; a missing target is unknown.
    let before = d.render();
    d.move_daily(a, Some(a)).unwrap();
    assert_eq!(d.render(), before);
    d.move_daily(a, None).unwrap();
    assert_eq!(d.render(), before);
    assert_eq!(
        d.move_daily(a, Some(BlockId(9999))),
        Err(EditError::UnknownBlock)
    );
}

#[test]
fn move_before_refuses_a_non_sibling() {
    let mut d = doc("- a\n\t- x\n- b\n\t- y\n");
    let (a, x, y) = (id(&d, 0), id(&d, 1), id(&d, 3));
    assert_eq!(
        d.move_before(x, Some(y)),
        Err(EditError::WouldChangeStructure)
    );
    assert_eq!(
        d.move_before(a, Some(x)),
        Err(EditError::WouldChangeStructure)
    );
    assert_eq!(d.render(), "- a\n\t- x\n- b\n\t- y\n");
    // Nested end-of-parent move.
    let mut d = doc("- a\n\t- x\n\t- y\n- b\n");
    let x = id(&d, 1);
    d.move_before(x, None).unwrap();
    assert_eq!(d.render(), "- a\n\t- y\n\t- x\n- b\n");
}

#[test]
fn ops_touch_only_their_lines() {
    let src = "\u{feff}# My dailies\r\n- a\r\n  unknown:: 1\r\n\t- nested\r\n- b\r\n  checked:: soon\r\n- c\r\n";
    let mut d = doc(src);
    let raws: Vec<Option<String>> = d
        .blocks()
        .iter()
        .map(|b| b.raw().map(String::from))
        .collect();
    let c = id(&d, 3);
    d.check_daily(c, at(7, 42, 0)).unwrap();
    for (i, raw) in raws.iter().enumerate().take(3) {
        assert_eq!(&d.blocks()[i].raw().map(String::from), raw, "block {i}");
    }
    d.to_lf();
    let expected = src
        .replace("\r\n", "\n")
        .replace("- c\n", "- c\n  checked:: 2026-11-18 07:42\n");
    assert_eq!(d.render(), expected);
}
