use breccia_core::LineEnding;
use breccia_core::color::{PAGE_COLORS, color_line, page_color, recolor};

#[test]
fn page_color_reads_the_first_known_color_line() {
    assert_eq!(page_color("color:: red\n"), Some("red"));
    assert_eq!(page_color("Color:: Red\n"), Some("red"));
    assert_eq!(page_color("color:: banana\ncolor:: blue\n"), Some("blue"));
    assert_eq!(page_color("color:: banana\n"), None);
    assert_eq!(page_color("color::red\n"), None);
    assert_eq!(page_color("---\ncolor:: red\n---\n"), None);
    assert_eq!(page_color("---\ncolor: red\n---\n"), None);
    assert_eq!(color_line("title:: x\ncolor:: teal\n"), Some((1, "teal")));
    assert_eq!(PAGE_COLORS.len(), 25);
}

#[test]
fn recolor_adds_after_the_title_or_first() {
    let lf = LineEnding::Lf;
    assert_eq!(recolor("", Some("red"), lf), "color:: red\n");
    assert_eq!(recolor("note\n", Some("red"), lf), "color:: red\nnote\n");
    assert_eq!(
        recolor("title:: Q&A: hiring\nnote\n", Some("red"), lf),
        "title:: Q&A: hiring\ncolor:: red\nnote\n"
    );
    assert_eq!(
        recolor("title:: x", Some("red"), lf),
        "title:: x\ncolor:: red\n"
    );
    let fm = "---\naliases:\n  - \"x\"\n---\n";
    assert_eq!(
        recolor(&format!("{fm}title:: x\n"), Some("blue"), lf),
        format!("{fm}title:: x\ncolor:: blue\n")
    );
    assert_eq!(
        recolor("---\na: b\n---", Some("red"), lf),
        "---\na: b\n---\ncolor:: red\n"
    );
    assert_eq!(
        recolor("title:: x\r\n", Some("red"), LineEnding::CrLf),
        "title:: x\r\ncolor:: red\r\n"
    );
}

#[test]
fn recolor_replaces_the_first_color_line_in_place() {
    assert_eq!(
        recolor("a\nColor:: banana\nb\n", Some("green"), LineEnding::Lf),
        "a\ncolor:: green\nb\n"
    );
    assert_eq!(
        recolor("color:: red\r\nx\r\n", Some("blue"), LineEnding::CrLf),
        "color:: blue\r\nx\r\n"
    );
    assert_eq!(
        recolor("color:: red\n", Some("red"), LineEnding::Lf),
        "color:: red\n"
    );
}

#[test]
fn recolor_none_removes_every_color_line() {
    let lf = LineEnding::Lf;
    assert_eq!(
        recolor("title:: x\ncolor:: red\nnote\nCOLOR:: blue\n", None, lf),
        "title:: x\nnote\n"
    );
    assert_eq!(recolor("note\n", None, lf), "note\n");
    assert_eq!(
        recolor("---\ncolor:: red\n---\n", None, lf),
        "---\ncolor:: red\n---\n"
    );
    assert_eq!(recolor("x\ncolor:: red", None, lf), "x\n");
}
