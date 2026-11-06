use breccia_core::{IdGen, LineEnding, parse};

fn rt(src: &str) {
    let mut ids = IdGen::new();
    assert_eq!(parse(src, &mut ids).render(), src);
}

#[test]
fn fixtures_roundtrip() {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/roundtrip");
    let mut count = 0;
    for e in std::fs::read_dir(dir).unwrap() {
        let p = e.unwrap().path();
        let src = std::fs::read_to_string(&p).unwrap();
        let mut ids = IdGen::new();
        assert_eq!(parse(&src, &mut ids).render(), src, "{}", p.display());
        count += 1;
    }
    assert!(
        count >= 14,
        "expected the roundtrip fixtures, found {count}"
    );
}

#[test]
fn byte_quirks_roundtrip() {
    for src in [
        "",
        "- a",
        "- a\r\n- b\r\n",
        "\u{feff}- a\n",
        "- a\n\n\n",
        "x\r\ny",
        "- a\n\t- b\n  - c\n",
        "- a  \n  cont \n",
    ] {
        rt(src);
    }
}

#[test]
fn structure_of_spec_example() {
    let src = "- Standup with [[Anna]]\n\t- DOING Draft #infra\n\t- TODO Ask [[Ben]]\n- DONE Review PR 412\n  done:: [[2026-10-29]]\n";
    let d = parse(src, &mut IdGen::new());
    let got: Vec<_> = d.blocks().iter().map(|b| (b.depth(), b.text())).collect();
    assert_eq!(
        got,
        vec![
            (0, "Standup with [[Anna]]"),
            (1, "DOING Draft #infra"),
            (1, "TODO Ask [[Ben]]"),
            (0, "DONE Review PR 412\ndone:: [[2026-10-29]]"),
        ]
    );
    assert_eq!(d.indent_unit(), "\t");
    assert_eq!(d.line_ending(), LineEnding::Lf);
}

#[test]
fn backtick_fence_info_string_must_not_contain_backticks() {
    let d = parse("- ```x``` a\n- b\n", &mut IdGen::new());
    assert_eq!(d.blocks().len(), 2);
    let d = parse("- ``` foo ` bar\n- b\n", &mut IdGen::new());
    assert_eq!(d.blocks().len(), 2);
    // Same rule for the preamble.
    let d = parse("```x``` preamble\n- a\n- b\n", &mut IdGen::new());
    assert_eq!(d.blocks().len(), 2);
    let d = parse("- ```rust\n  code\n  ```\n- b\n", &mut IdGen::new());
    assert_eq!(d.blocks().len(), 2);
    assert_eq!(d.blocks()[0].text(), "```rust\ncode\n```");
    // Tilde fences may have any info string, backticks included.
    let d = parse("- ~~~ a ` b\n  - c\n  ~~~\n- d\n", &mut IdGen::new());
    assert_eq!(d.blocks().len(), 2);
}

#[test]
fn fence_hides_bullets() {
    let d = parse(
        "- code:\n  ```\n  - not a block\n  ```\n- next\n",
        &mut IdGen::new(),
    );
    assert_eq!(d.blocks().len(), 2);
    assert_eq!(d.blocks()[0].text(), "code:\n```\n- not a block\n```");
}

#[test]
fn preamble_and_detection() {
    let d = parse("title:: a/b\n- x\r\n  - y\r\n", &mut IdGen::new());
    assert_eq!(d.preamble(), "title:: a/b\n");
    assert_eq!(d.line_ending(), LineEnding::Lf); // first terminator decides
    let d = parse("- x\r\n  - y\r\n", &mut IdGen::new());
    assert_eq!((d.line_ending(), d.indent_unit()), (LineEnding::CrLf, "  "));
}

proptest::proptest! {
    #[test]
    fn any_string_roundtrips(s in proptest::prelude::any::<String>()) { rt(&s); }

    #[test]
    fn any_string_with_optional_bom_roundtrips(s in "(\u{feff})?[\\s\\S]*") { rt(&s); }

    #[test]
    fn whitespace_heavy_strings_roundtrip(s in "(\u{feff})?[\\t\\r\\n -~äé😀]*") { rt(&s); }

    #[test]
    fn outline_like_strings_roundtrip(parts in proptest::collection::vec(proptest::sample::select(vec![
        "- ", "-", "\t", "  ", "TODO ", "```", "~~~", "text", "[[a]]", "#t", "\n", "\r\n", "key:: v", "---",
    ]), 0..60)) { rt(&parts.concat()); }
}
