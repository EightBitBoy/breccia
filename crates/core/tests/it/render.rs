use breccia_core::{Config, render::block_html};
fn h(t: &str) -> String {
    block_html(t, &Config::default())
}

#[test]
fn links_and_tags() {
    assert_eq!(
        h("Standup with [[Anna]] and [[Ben]]"),
        "<p>Standup with <a class=\"link\" data-page=\"anna\" data-name=\"Anna\">Anna</a> and <a class=\"link\" data-page=\"ben\" data-name=\"Ben\">Ben</a></p>\n"
    );
    assert_eq!(
        h("DOING Draft for [[Project X]] #infra"),
        "<p><span class=\"st\" data-color=\"amber\">DOING</span> Draft for <a class=\"link\" data-page=\"project x\" data-name=\"Project X\">Project X</a> <a class=\"tag\" data-page=\"infra\" data-name=\"infra\">#infra</a></p>\n"
    );
}
#[test]
fn finished_task_with_done_chip() {
    assert_eq!(
        h("DONE Review PR 412\ndone:: [[2026-10-29]]"),
        "<p><span class=\"st\" data-color=\"green\">DONE</span> <span class=\"done-text\">Review PR 412</span><span class=\"chip\">✓ 29 Oct</span></p>\n"
    );
    // With the time Breccia now writes, the chip shows it too, without seconds.
    assert_eq!(
        h("DONE Review PR 412\ndone:: [[2026-10-29]] 14:05:09"),
        "<p><span class=\"st\" data-color=\"green\">DONE</span> <span class=\"done-text\">Review PR 412</span><span class=\"chip\">✓ 29 Oct 14:05</span></p>\n"
    );
}
#[test]
fn a_tasks_archived_line_is_not_shown() {
    // Under a task the archived date is not needed; the done chip is.
    assert_eq!(
        h("DONE Review PR 412\ndone:: [[2026-10-29]] 14:05:09\narchived:: 2026-11-12 09:00:00"),
        "<p><span class=\"st\" data-color=\"green\">DONE</span> <span class=\"done-text\">Review PR 412</span><span class=\"chip\">✓ 29 Oct 14:05</span></p>\n"
    );
    // Other properties of the task still show.
    assert!(h("DONE x\narchived:: 2026-11-12\nowner:: Anna").contains("prop-key\">owner<"));
    assert!(!h("DONE x\narchived:: 2026-11-12\nowner:: Anna").contains("archived"));
    // On a block that is not a task, archived:: is an ordinary property and shows.
    assert!(h("A note\narchived:: 2026-11-12").contains("prop-key\">archived<"));
}
/// The chip of a task created at `created` and done on 3 Nov 2026 at 14:05:09.
fn chip(created: &str) -> String {
    let html = h(&format!(
        "DONE x\ncreated:: {created}\ndone:: [[2026-11-03]] 14:05:09"
    ));
    let start = html.find("<span class=\"chip\">").expect("a chip");
    let end = start + html[start..].find("</span>").unwrap();
    html[start + "<span class=\"chip\">".len()..end].to_string()
}
#[test]
fn the_done_chip_says_how_long_the_task_took() {
    // Days, else hours, else minutes; rounded down; never under 1 minute.
    assert_eq!(chip("2026-10-31 14:05:09"), "✓ 3 Nov 14:05 after 3 days");
    assert_eq!(chip("2026-11-02 14:05:09"), "✓ 3 Nov 14:05 after 1 day");
    // 2 days 23 hours 59 minutes is 2 days.
    assert_eq!(chip("2026-10-31 14:06:09"), "✓ 3 Nov 14:05 after 2 days");
    assert_eq!(chip("2026-11-02 14:05:10"), "✓ 3 Nov 14:05 after 23 hours");
    assert_eq!(chip("2026-11-03 13:05:09"), "✓ 3 Nov 14:05 after 1 hour");
    assert_eq!(
        chip("2026-11-03 13:05:10"),
        "✓ 3 Nov 14:05 after 59 minutes"
    );
    assert_eq!(chip("2026-11-03 14:03:09"), "✓ 3 Nov 14:05 after 2 minutes");
    assert_eq!(chip("2026-11-03 14:04:09"), "✓ 3 Nov 14:05 after 1 minute");
    assert_eq!(chip("2026-11-03 14:04:10"), "✓ 3 Nov 14:05 after 1 minute");
    assert_eq!(chip("2026-11-03 14:05:09"), "✓ 3 Nov 14:05 after 1 minute");
    // A created:: later than done:: (edited by hand) or that cannot be read: no "after".
    assert_eq!(chip("2026-11-03 14:05:10"), "✓ 3 Nov 14:05");
    assert_eq!(chip("soon"), "✓ 3 Nov 14:05");
    // Without a time on done:: (older tasks) or without created:: there is no "after".
    assert!(
        h("DONE x\ncreated:: 2026-10-31 14:05:09\ndone:: [[2026-11-03]]")
            .contains("<span class=\"chip\">✓ 3 Nov</span>")
    );
    assert!(
        h("DONE x\ndone:: [[2026-11-03]] 14:05:09")
            .contains("<span class=\"chip\">✓ 3 Nov 14:05</span>")
    );
}
#[test]
fn a_tasks_created_line_is_not_shown() {
    // Like archived::, under a task it is not shown; other properties are.
    let html = h("TODO x\ncreated:: 2026-11-03 09:00:00\nowner:: Anna");
    assert!(!html.contains("created"), "{html}");
    assert!(html.contains("prop-key\">owner<"));
    // On a block that is not a task, created:: is an ordinary property and shows.
    assert!(h("A note\ncreated:: 2026-11-03").contains("prop-key\">created<"));
}
#[test]
fn keyword_alone() {
    assert_eq!(
        h("TODO"),
        "<p><span class=\"st\" data-color=\"grey\">TODO</span></p>\n"
    );
}
#[test]
fn day_links_show_long_date() {
    assert_eq!(
        h("see [[2026-10-29]]"),
        "<p>see <a class=\"link\" data-page=\"2026-10-29\" data-name=\"2026-10-29\">Thursday, 29 Oct 2026</a></p>\n"
    );
}
#[test]
fn other_properties_render_dimmed() {
    assert_eq!(
        h("x\nowner:: [[Ben]]"),
        "<p>x</p>\n<div class=\"props\"><div class=\"prop\"><span class=\"prop-key\">owner</span> <a class=\"link\" data-page=\"ben\" data-name=\"Ben\">Ben</a></div></div>"
    );
}
#[test]
fn markdown_and_code() {
    assert_eq!(
        h("**bold** and _em_"),
        "<p><strong>bold</strong> and <em>em</em></p>\n"
    );
    assert_eq!(h("a `[[x]]` b"), "<p>a <code>[[x]]</code> b</p>\n");
    assert_eq!(h("line1\nline2"), "<p>line1<br />\nline2</p>\n");
}
#[test]
fn raw_html_is_escaped() {
    let out = h("<script>alert(1)</script> and <img src=x onerror=alert(1)>");
    assert!(!out.contains("<script") && !out.contains("<img"), "{out}");
    assert!(out.contains("&lt;script&gt;"));
}
#[test]
fn names_are_escaped() {
    assert_eq!(
        h("[[a<b\"c]]"),
        "<p><a class=\"link\" data-page=\"a&lt;b&quot;c\" data-name=\"a&lt;b&quot;c\">a&lt;b&quot;c</a></p>\n"
    );
}
#[test]
fn preamble_hides_title_and_links() {
    assert_eq!(
        breccia_core::render::preamble_html("title:: Foo\nsee [[Ben]]"),
        "<p>see <a class=\"link\" data-page=\"ben\" data-name=\"Ben\">Ben</a></p>\n"
    );
}

#[test]
fn unsafe_links_lose_their_anchor() {
    for src in [
        "[x](javascript:alert(1))",
        "[x](JaVaScRiPt:alert(1))",
        "[x]( javascript:alert(1))",
        "[x](vbscript:foo)",
        "[x](data:text/html,<b>)",
        "[x](relative/path)",
        "<javascript:alert(1)>",
        "p\nk:: [x](javascript:alert(1))",
    ] {
        let out = h(src);
        assert!(
            !out.contains("<a ") && !out.contains("href"),
            "{src} -> {out}"
        );
    }
    assert_eq!(h("[x](javascript:alert(1))"), "<p>x</p>\n");
}
#[test]
fn allowed_links_are_ext() {
    assert_eq!(
        h("[x](https://e.com/?a=1&b=\"2\")"),
        "<p><a class=\"ext\" href=\"https://e.com/?a=1&amp;b=&quot;2&quot;\">x</a></p>
"
    );
    assert!(h("[m](mailto:a@b.c)").contains("class=\"ext\" href=\"mailto:a@b.c\""));
}
#[test]
fn disallowed_image_is_alt_text() {
    assert_eq!(h("![alt <b>](javascript:x)"), "<p>alt &lt;b&gt;</p>\n");
    assert_eq!(h("![a](data:image/png;base64,xx)"), "<p>a</p>\n");
    assert!(h("![a](https://x/i.png)").contains("<img src=\"https://x/i.png\" alt=\"a\""));
}
#[test]
fn placeholders_never_land_in_attributes() {
    assert!(h("![a #tag](https://x/i.png)").contains("alt=\"a #tag\""));
    assert!(h("[x](https://e \"a [[Ben]]\")").contains("title=\"a [[Ben]]\""));
    let out = h("[see [[Ben]]](https://e)");
    assert_eq!(out.matches("<a ").count(), 1, "{out}");
    assert!(out.contains(">see [[Ben]]</a>"), "{out}");
}
#[test]
fn private_use_markers_in_input_are_neutralised() {
    let out = h("\u{E000}1\u{E001} [[Ben]]");
    assert_eq!(out.matches("<a ").count(), 1, "{out}");
    assert!(!out.contains('\u{E000}'));
}

#[test]
fn preamble_hides_only_the_title_line() {
    let out = breccia_core::render::preamble_html("title:: a/b\ntitle:: second\n");
    assert!(!out.contains("a/b") && out.contains("second"), "{out}");
}

#[test]
fn card_html_is_the_first_line_without_its_keyword() {
    use breccia_core::render::card_html;
    let c = |t: &str| card_html(t, &Config::default());
    assert_eq!(
        c("TODO Ask [[Ben]] #budget\nowner:: x\n\t- child"),
        "Ask <a class=\"link\" data-page=\"ben\" data-name=\"Ben\">Ben</a> <a class=\"tag\" data-page=\"budget\" data-name=\"budget\">#budget</a>"
    );
    assert_eq!(
        c("DONE Review PR 412\ndone:: [[2026-10-29]]"),
        "<span class=\"done-text\">Review PR 412</span>"
    );
    assert_eq!(c("TODO"), "");
    assert_eq!(c("plain **b**"), "plain <strong>b</strong>");
}

#[test]
fn preamble_shows_front_matter_as_code() {
    let out = breccia_core::render::preamble_html("---\na: [[X]]\n---\nsee [[Ben]]\n");
    assert!(
        out.contains("<pre class=\"front-matter\"><code>---\na: [[X]]\n---</code></pre>"),
        "{out}"
    );
    assert_eq!(out.matches("data-page=\"ben\"").count(), 1, "{out}");
    assert!(!out.contains("data-page=\"x\""), "{out}");
}

#[test]
fn alias_link_shows_its_label() {
    assert!(
        h("[[Project X|the project]]")
            .contains("data-page=\"project x\" data-name=\"Project X\">the project</a>")
    );
    assert_eq!(
        breccia_core::render::crumb("[[2026-10-29|that day]] x"),
        "that day x"
    );
}

#[test]
fn a_link_in_a_table_cell_shows_its_text() {
    let html = h("t\n\n| a | b |\n|---|---|\n| [[x\\|y]] | 2 |");
    assert!(html.contains("<table>"), "{html}");
    assert!(
        html.contains("<a class=\"link\" data-page=\"x\" data-name=\"x\">y</a>"),
        "{html}"
    );
}

fn ext(url: &str, shown: &str) -> String {
    format!("<a class=\"ext\" href=\"{url}\">{shown}</a>")
}

#[test]
fn a_bare_url_becomes_a_link() {
    assert_eq!(
        h("see https://example.com/a_b?x=1&y=2#top now"),
        format!(
            "<p>see {} now</p>\n",
            ext(
                "https://example.com/a_b?x=1&amp;y=2#top",
                "https://example.com/a_b?x=1&amp;y=2#top"
            )
        )
    );
    assert!(h("http://example.com").contains(&ext("http://example.com", "http://example.com")));
    assert!(h("HTTPS://Example.com").contains("class=\"ext\""));
}

#[test]
fn a_bare_url_leaves_trailing_punctuation_out() {
    let u = "https://example.com/x";
    for tail in [".", ",", ";", ":", "!", "?", "...", ")", "\""] {
        let html = h(&format!("go to {u}{tail}"));
        assert!(html.contains(&ext(u, u)), "{tail}: {html}");
    }
    // a balanced parenthesis belongs to the address
    let w = "https://en.wikipedia.org/wiki/Rust_(language)";
    assert!(h(&format!("see {w}.")).contains(&ext(w, w)));
    assert!(h(&format!("(see {w})")).contains(&ext(w, w)));
}

#[test]
fn urls_in_code_links_and_html_are_left_alone() {
    assert_eq!(h("`https://e.com`"), "<p><code>https://e.com</code></p>\n");
    assert!(!h("```\nhttps://e.com\n```").contains("<a "));
    // a Markdown link keeps its own text and gets no second link
    assert_eq!(
        h("[https://e.com](https://e.com)"),
        format!("<p>{}</p>\n", ext("https://e.com", "https://e.com"))
    );
    assert_eq!(
        h("<https://e.com>"),
        format!("<p>{}</p>\n", ext("https://e.com", "https://e.com"))
    );
    // not a word that merely ends in the scheme, and not a scheme without an address
    assert!(!h("xhttps://e.com").contains("<a "));
    assert!(!h("https://").contains("<a "));
    assert!(!h("ftp://e.com").contains("<a "));
}

#[test]
fn a_bare_url_next_to_page_links_and_tags() {
    let html = h("[[Anna]] https://e.com #infra");
    assert!(html.contains("data-page=\"anna\""), "{html}");
    assert!(
        html.contains(&ext("https://e.com", "https://e.com")),
        "{html}"
    );
    assert!(html.contains("class=\"tag\""), "{html}");
    // a # inside the address is not a tag
    let html = h("https://e.com/a#frag");
    assert!(!html.contains("class=\"tag\""), "{html}");
}

#[test]
fn preamble_html_hides_the_color_line() {
    use breccia_core::render::preamble_html;
    let h = preamble_html("color:: red\nnote\n");
    assert!(!h.contains("color::") && h.contains("note"), "{h}");
    assert_eq!(preamble_html("title:: t\ncolor:: red\n"), "");
    assert!(preamble_html("color:: banana\n").contains("banana"));
}

#[test]
fn preamble_html_shows_an_invalid_hue() {
    use breccia_core::render::preamble_html;
    assert!(
        !preamble_html(
            "color:: hue 212
note
"
        )
        .contains("color::")
    );
    assert!(
        preamble_html(
            "color:: hue 360
"
        )
        .contains("hue 360")
    );
}
