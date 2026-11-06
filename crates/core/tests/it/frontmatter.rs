use breccia_core::{IdGen, front_matter_len, parse};

fn texts(src: &str) -> Vec<String> {
    let mut ids = IdGen::new();
    parse(src, &mut ids)
        .blocks()
        .iter()
        .map(|b| b.text().to_string())
        .collect()
}

fn preamble(src: &str) -> String {
    let mut ids = IdGen::new();
    parse(src, &mut ids).preamble().to_string()
}

fn round_trips(src: &str) {
    let mut ids = IdGen::new();
    assert_eq!(parse(src, &mut ids).render(), src);
}

#[test]
fn yaml_list_in_front_matter_is_not_a_block() {
    let src = "---\ntags:\n  - a\n  - b\n---\n- first\n";
    assert_eq!(preamble(src), "---\ntags:\n  - a\n  - b\n---\n");
    assert_eq!(texts(src), ["first"]);
    round_trips(src);
}

#[test]
fn unclosed_front_matter_reads_as_before() {
    let src = "---\ntags:\n  - a\n";
    assert_eq!(texts(src), ["a"]);
    assert_eq!(preamble(src), "---\ntags:\n");
    assert_eq!(front_matter_len(src), None);
    round_trips(src);
}

#[test]
fn a_bullet_after_the_rule_is_a_block() {
    // Line 2 is a bullet: not front matter; the second `---` is a
    // continuation line of `a`.
    let src = "---\n- a\n---\n- b\n";
    assert_eq!(texts(src), ["a\n---", "b"]);
    assert_eq!(front_matter_len(src), None);
    round_trips(src);
}

#[test]
fn a_top_level_bullet_inside_ends_no_front_matter() {
    let src = "---\ntitle: x\n- TODO a\n- b\n---\n- c\n";
    assert_eq!(front_matter_len(src), None);
    assert_eq!(texts(src), ["TODO a", "b\n---", "c"]);
    round_trips(src);
}

#[test]
fn a_blank_second_line_is_no_front_matter() {
    let src = "---\n\nintro\n- TODO a\n---\n- c\n";
    assert_eq!(front_matter_len(src), None);
    assert_eq!(texts(src), ["TODO a\n---", "c"]);
    round_trips(src);
}

#[test]
fn front_matter_only_at_the_start() {
    let src = "x\n---\n  - a\n---\n";
    assert_eq!(front_matter_len(src), None);
    assert_eq!(texts(src), ["a\n---"]);
    round_trips(src);
}

#[test]
fn front_matter_with_bom_and_crlf() {
    let src = "\u{feff}---\r\ntags:\r\n  - a\r\n---\r\n- b\r\n";
    assert_eq!(texts(src), ["b"]);
    round_trips(src);
}

#[test]
fn a_fence_inside_front_matter_opens_nothing() {
    // Without front matter the indented fence line swallows `- a`.
    let src = "---\nnote: |\n  ```\n---\n- a\n";
    assert_eq!(texts(src), ["a"]);
    round_trips(src);
    assert!(texts("note: |\n  ```\n---\n- a\n").is_empty());
}

#[test]
fn a_block_is_added_after_front_matter_holding_a_fence_line() {
    let src = "---\nnote: |\n  ```\n---\n";
    let mut ids = IdGen::new();
    let mut doc = parse(src, &mut ids);
    assert!(doc.blocks().is_empty());
    assert!(doc.insert_after(None, "a", &mut ids).is_ok());
    assert_eq!(doc.render(), format!("{src}- a\n"));
}

#[test]
fn empty_front_matter() {
    let src = "---\n---\n- a\n";
    assert_eq!(front_matter_len(src), Some(8));
    assert_eq!(texts(src), ["a"]);
    round_trips(src);
}

#[test]
fn front_matter_and_trailing_space() {
    let src = "--- \ntitle: x\n---\t\n- a\n";
    assert_eq!(front_matter_len(src), Some(19));
    assert_eq!(texts(src), ["a"]);
    round_trips(src);
}

#[test]
fn closing_line_without_terminator_is_all_front_matter() {
    let src = "---\na: b\n---";
    assert_eq!(front_matter_len(src), Some(src.len()));
    assert!(texts(src).is_empty());
    round_trips(src);
}

#[test]
fn files_with_front_matter_round_trip_byte_for_byte() {
    for src in [
        "---\ntags:\n  - a\n---\n",
        "---\ntags:\n  - a\n---\nprose\n- b\n  c\n",
        "---\r\na: 1\r\n---\r\n\r\n- b\r\n",
        "---\ntitle: x  \n\n  - odd\n---   \n- a\n\t- b\n",
        "---\na: [[X]]\n---",
        "---\n---\n",
    ] {
        round_trips(src);
    }
}
