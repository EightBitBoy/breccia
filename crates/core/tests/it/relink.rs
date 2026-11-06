use breccia_core::relink::relink as relink_with;
use breccia_core::{IdGen, parse};
use std::collections::HashSet;

/// `relink` with no heading links.
fn relink(text: &str, old_key: &str, new_name: &str) -> Option<String> {
    relink_with(text, old_key, new_name, &HashSet::new())
}

fn set(keys: &[&str]) -> HashSet<String> {
    keys.iter().map(|k| k.to_string()).collect()
}

#[test]
fn relink_all_link_forms() {
    assert_eq!(
        relink(
            "[[Old]] [[ old ]] #old #[[OLD]] `[[old]]` [[Older]]",
            "old",
            "New Name"
        )
        .as_deref(),
        Some("[[New Name]] [[New Name]] #[[New Name]] #[[New Name]] `[[old]]` [[Older]]"),
    );
    assert_eq!(relink("#old, x", "old", "new").as_deref(), Some("#new, x"));
    assert_eq!(
        relink("x\nowner:: [[Old]]", "old", "New").as_deref(),
        Some("x\nowner:: [[New]]")
    );
    assert_eq!(relink("nothing [[else]]", "old", "New"), None);
}

#[test]
fn bare_tag_stays_bare_only_when_it_reads_back_whole() {
    assert_eq!(relink("#old.", "old", "a.b").as_deref(), Some("#a.b."));
    assert_eq!(relink("#old", "old", "x.").as_deref(), Some("#[[x.]]"));
    assert_eq!(relink("#old", "old", "a,b").as_deref(), Some("#[[a,b]]"));
    assert_eq!(relink("#old", "old", "#x").as_deref(), Some("#[[#x]]"));
}

#[test]
fn same_spelling_is_no_change() {
    assert_eq!(relink("[[New]] #New", "new", "New"), None);
    assert_eq!(
        relink("[[new]] #new", "new", "New").as_deref(),
        Some("[[New]] #New")
    );
}

#[test]
fn a_name_links_cannot_hold_is_not_written() {
    // `[[a]b]]` does not read back as a link to "a]b".
    assert_eq!(relink("see [[old]]", "old", "a]b"), None);
    // The new backtick would pair with the code span's opener, so the
    // code span's `[[y]]` would turn into a link.
    assert_eq!(relink("[[old]] ` [[y]] `", "old", "a`b"), None);
}

#[test]
fn document_relink_counts_changed_and_skipped_blocks() {
    let src = "related:: [[Old]]\r\n- a [[old]]\r\n-  untouched  \r\n\t- #old\r\n";
    let mut doc = parse(src, &mut IdGen::new());
    let ids: Vec<_> = doc.blocks().iter().map(|b| b.id()).collect();
    assert_eq!(doc.relink("old", "New", &HashSet::new()), (3, 0));
    assert_eq!(
        doc.render(),
        "related:: [[New]]\r\n- a [[New]]\r\n-  untouched  \r\n\t- #New\r\n"
    );
    assert_eq!(doc.blocks()[1].raw(), Some("-  untouched  \r\n"));
    let after: Vec<_> = doc.blocks().iter().map(|b| b.id()).collect();
    assert_eq!(ids, after);

    let mut doc = parse(src, &mut IdGen::new());
    assert_eq!(doc.relink("old", "a]b", &HashSet::new()), (0, 3));
    assert_eq!(doc.render(), src);
}

#[test]
fn rename_keeps_the_shown_text() {
    assert_eq!(
        relink(
            "[[Old|shown ]] [[Old]] #Old #[[Old]] #[[Old|x]]",
            "old",
            "New"
        )
        .as_deref(),
        Some("[[New|shown ]] [[New]] #New #[[New]] #[[Old|x]]")
    );
}

#[test]
fn a_rename_keeps_the_escaped_pipe() {
    assert_eq!(
        relink("| [[Old\\|o]] | 2 |", "old", "New").as_deref(),
        Some("| [[New\\|o]] | 2 |")
    );
    assert_eq!(
        relink("[[old\\|]]", "old", "New").as_deref(),
        Some("[[New\\|]]")
    );
}

#[test]
fn heading_links_follow_a_rename() {
    let h = set(&["old#h", "old#^b1", "old #x"]);
    assert_eq!(
        relink_with(
            "[[Old#H]] [[old#^b1|step]] [[Old #x]] [[Old]]",
            "old",
            "New",
            &h
        )
        .as_deref(),
        Some("[[New#H]] [[New#^b1|step]] [[New #x]] [[New]]")
    );
    // A key not in the set is left alone.
    assert_eq!(relink("[[Old#Other]]", "old", "New"), None);
    assert_eq!(relink_with("[[Old#Other]]", "old", "New", &h), None);
    // A tag with the same text is never a heading link.
    assert_eq!(
        relink_with("#Old#h [[Old#h]]", "old", "New", &h).as_deref(),
        Some("#Old#h [[New#h]]")
    );
    // The same in a document's blocks and preamble.
    let src = "owner:: [[Old#H]]\n- [[Old#H|x]]\n- [[Old#Other]]\n";
    let mut doc = parse(src, &mut IdGen::new());
    assert_eq!(doc.relink("old", "New", &h), (2, 0));
    assert_eq!(
        doc.render(),
        "owner:: [[New#H]]\n- [[New#H|x]]\n- [[Old#Other]]\n"
    );
}

#[test]
fn a_heading_link_in_a_table_keeps_its_escape() {
    assert_eq!(
        relink_with("| [[Old#H\\|o]] |", "old", "New", &set(&["old#h"])).as_deref(),
        Some("| [[New#H\\|o]] |")
    );
}
