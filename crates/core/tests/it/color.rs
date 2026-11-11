use breccia_core::LineEnding;
use breccia_core::color::{PAGE_COLORS, PageColor, color_line, page_color, parse_color, recolor};

#[test]
fn page_color_reads_the_first_known_color_line() {
    assert_eq!(page_color("color:: red\n"), Some(PageColor::Named("red")));
    assert_eq!(page_color("Color:: Red\n"), Some(PageColor::Named("red")));
    assert_eq!(
        page_color("color:: banana\ncolor:: blue\n"),
        Some(PageColor::Named("blue"))
    );
    assert_eq!(page_color("color:: banana\n"), None);
    assert_eq!(page_color("color::red\n"), None);
    assert_eq!(page_color("---\ncolor:: red\n---\n"), None);
    assert_eq!(page_color("---\ncolor: red\n---\n"), None);
    assert_eq!(
        color_line("title:: x\ncolor:: teal\n"),
        Some((1, PageColor::Named("teal")))
    );
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

#[test]
fn parse_color_reads_names_and_hues() {
    use PageColor::Named;
    let hue = PageColor::hue;
    assert_eq!(parse_color("Red"), Some(Named("red")));
    assert_eq!(parse_color("hue 212"), Some(hue(212)));
    assert_eq!(parse_color("HUE 0212"), Some(hue(212)));
    assert_eq!(parse_color("Hue  7"), Some(hue(7)));
    assert_eq!(parse_color("hue\t7"), Some(hue(7)));
    assert_eq!(parse_color("hue 0"), Some(hue(0)));
    assert_eq!(parse_color("hue 359"), Some(hue(359)));
    for bad in [
        "hue 360",
        "hue 999",
        "hue -1",
        "hue +5",
        "hue 12.5",
        "hue",
        "hue212",
        "hue 1 2",
        "hue x",
        "hue 99999999999999999999",
    ] {
        assert_eq!(parse_color(bad), None, "{bad}");
    }
    assert_eq!(hue(7).to_string(), "hue 7");
    assert_eq!(serde_json::to_string(&hue(212)).unwrap(), "\"hue 212\"");
    assert_eq!(serde_json::to_string(&Named("red")).unwrap(), "\"red\"");
}

#[test]
fn page_color_reads_a_hue_line() {
    assert_eq!(page_color("color:: HUE 012\n"), Some(PageColor::hue(12)));
    assert_eq!(
        page_color("color:: hue 999\ncolor:: hue 5\n"),
        Some(PageColor::hue(5))
    );
    assert_eq!(
        color_line("title:: x\ncolor:: hue 40\n"),
        Some((1, PageColor::hue(40)))
    );
}

#[test]
fn recolor_writes_and_replaces_a_hue() {
    let lf = LineEnding::Lf;
    assert_eq!(
        recolor("- a\n", Some("hue 212"), lf),
        "color:: hue 212\n- a\n"
    );
    assert_eq!(
        recolor("color:: red\nx\n", Some("hue 9"), lf),
        "color:: hue 9\nx\n"
    );
    assert_eq!(
        recolor("color:: hue 9\n", Some("teal"), lf),
        "color:: teal\n"
    );
    assert_eq!(recolor("color:: hue 999\n", None, lf), "");
}

fn vivid(h: u16, v: u8) -> PageColor {
    PageColor::Hue { hue: h, vivid: v }
}

#[test]
fn parse_color_reads_a_vividness() {
    let hue = PageColor::hue;
    assert_eq!(parse_color("hue 212 vivid 150"), Some(vivid(212, 150)));
    assert_eq!(parse_color("Hue 212 Vivid 0150"), Some(vivid(212, 150)));
    assert_eq!(parse_color("hue 7\tvivid  50"), Some(vivid(7, 50)));
    assert_eq!(parse_color("hue 0 vivid 200"), Some(vivid(0, 200)));
    assert_eq!(parse_color("hue 212 vivid 100"), Some(hue(212)));
    for bad in [
        "hue 212 vivid",
        "hue 212 vivid 49",
        "hue 212 vivid 201",
        "hue 212 vivid 0",
        "hue 212 vivid -60",
        "hue 212 vivid +60",
        "hue 212 vivid 1.5",
        "hue 212 vivid x",
        "hue 212 vivid 80 x",
        "hue 212 strong 80",
        "vivid 80 hue 212",
        "hue 360 vivid 80",
        "hue 212 vivid 99999999999999999999",
        "red vivid 150",
    ] {
        assert_eq!(parse_color(bad), None, "{bad}");
    }
    assert_eq!(vivid(212, 150).to_string(), "hue 212 vivid 150");
    assert_eq!(vivid(212, 100).to_string(), "hue 212");
    assert_eq!(
        serde_json::to_string(&vivid(9, 55)).unwrap(),
        "\"hue 9 vivid 55\""
    );
}

#[test]
fn page_color_reads_a_lone_invalid_hue() {
    assert_eq!(page_color("color:: hue 999\n"), None);
    assert_eq!(page_color("color:: hue 212 vivid 300\n"), None);
}

#[test]
fn recolor_writes_a_vividness() {
    let lf = LineEnding::Lf;
    assert_eq!(
        recolor("- a\n", Some("hue 212 vivid 150"), lf),
        "color:: hue 212 vivid 150\n- a\n"
    );
    assert_eq!(
        recolor("color:: hue 212 vivid 150\nx\n", Some("teal"), lf),
        "color:: teal\nx\n"
    );
}

#[test]
fn title_and_color_lines_skip_front_matter_alike() {
    let preamble = "---\ntitle:: A\ncolor:: blue\n---\r\ntitle:: B\r\ncolor:: red\r\n";
    assert_eq!(
        breccia_core::inline::title_line(preamble),
        Some((4, "B".to_string()))
    );
    assert_eq!(color_line(preamble), Some((5, PageColor::Named("red"))));
}
