use breccia_core::inline::*;

fn targets(t: &str) -> Vec<(String, LinkKind)> {
    links(t).into_iter().map(|l| (l.target, l.kind)).collect()
}

#[test]
fn page_links_and_tags() {
    use LinkKind::*;
    assert_eq!(
        targets("Standup with [[Anna]] and [[Ben]]"),
        vec![("Anna".into(), Page), ("Ben".into(), Page)]
    );
    assert_eq!(
        targets("DOING Draft for [[Project X]] #infra"),
        vec![("Project X".into(), Page), ("infra".into(), Tag)]
    );
    assert_eq!(
        targets("a #[[multi word tag]] b"),
        vec![("multi word tag".into(), Tag)]
    );
    assert_eq!(
        targets("ask about #budget, then #done."),
        vec![("budget".into(), Tag), ("done".into(), Tag)]
    );
    assert_eq!(
        targets("DONE x\ndone:: [[2026-10-29]]"),
        vec![("2026-10-29".into(), Page)]
    );
}

#[test]
fn keys_and_ranges() {
    let t = "see [[Project X]]";
    let l = &links(t)[0];
    assert_eq!(l.key, "project x");
    assert_eq!(&t[l.range.clone()], "[[Project X]]");
}

#[test]
fn not_links() {
    for t in [
        "issue#12 and C# code",
        "# Heading",
        "[[]]",
        "[[ ]]",
        "[[unclosed",
        "a # b",
        "[[a [b]]]",
    ] {
        assert_eq!(links(t), vec![], "{t:?}");
    }
}

#[test]
fn no_links_in_fences_or_code() {
    assert_eq!(
        targets("x `[[no]] #no`\n```\n[[no]] #no\n```\n[[yes]]"),
        vec![("yes".into(), LinkKind::Page)]
    );
}

#[test]
fn property_lines() {
    assert_eq!(
        properties("TODO x\nfoo:: bar\nbaz::\nnot a prop\nlater:: no"),
        vec![("foo".into(), "bar".into()), ("baz".into(), "".into())]
    );
    assert_eq!(properties("foo:: on first line"), vec![]);
}

#[test]
fn hash_runs_are_not_tags() {
    for t in ["## Heading", "##tag", "### Title"] {
        assert_eq!(links(t), vec![], "{t:?}");
    }
    assert_eq!(targets("### x [[A]]"), vec![("A".into(), LinkKind::Page)]);
}

#[test]
fn tag_ends_at_backtick() {
    assert_eq!(links("#`x`"), vec![]);
    assert_eq!(targets("#a`b`"), vec![("a".into(), LinkKind::Tag)]);
}

#[test]
fn tilde_fence_hides_and_resumes() {
    assert_eq!(
        targets("~~~\n[[no]]\n~~~\n[[yes]]"),
        vec![("yes".into(), LinkKind::Page)]
    );
}

#[test]
fn backtick_info_string_does_not_open_fence() {
    assert_eq!(
        targets("```x [[a]]```\n[[b]]"),
        vec![("b".into(), LinkKind::Page)]
    );
}

#[test]
fn non_ascii_ranges() {
    let t = "ä [[Ünï]] #täg";
    let ls = links(t);
    assert_eq!(
        targets(t),
        vec![
            ("Ünï".into(), LinkKind::Page),
            ("täg".into(), LinkKind::Tag)
        ]
    );
    assert_eq!(&t[ls[0].range.clone()], "[[Ünï]]");
    assert_eq!(&t[ls[1].range.clone()], "#täg");
}

#[test]
fn trimmed_tag_range() {
    let t = "x #done.";
    assert_eq!(&t[links(t)[0].range.clone()], "#done");
}

#[test]
fn code_span_lengths() {
    assert_eq!(
        targets("``a [[x]] b`` [[y]]"),
        vec![("y".into(), LinkKind::Page)]
    );
    assert_eq!(targets("a ` [[y]]"), vec![("y".into(), LinkKind::Page)]);
}

#[test]
fn nested_fence_hides_links_until_its_own_run_closes_it() {
    // the inner ``` lines do not close the four-backtick fence
    assert_eq!(
        targets("````md\n```js\n- [[x]]\n```\n[[x]]\n````\n[[yes]]"),
        vec![("yes".into(), LinkKind::Page)]
    );
    // a closing run must stand alone on its line
    assert_eq!(targets("```\n``` [[no]]\n[[no]]"), vec![]);
}

#[test]
fn code_span_across_lines_hides_links() {
    assert_eq!(
        targets("a `x\n[[no]] y` [[yes]]"),
        vec![("yes".into(), LinkKind::Page)]
    );
}

#[test]
fn blank_line_ends_a_code_span() {
    assert_eq!(
        targets("a `x\n\n[[yes]]"),
        vec![("yes".into(), LinkKind::Page)]
    );
}

#[test]
fn title_line_finds_the_first_valid_title() {
    assert_eq!(
        title_line("title:: a/b\nalias:: x\n"),
        Some((0, "a/b".into()))
    );
    assert_eq!(title_line("intro\nTitle:: X\n"), Some((1, "X".into())));
    assert_eq!(title_line("title:: [[x]]\n"), None);
}

#[test]
fn alias_links() {
    let l =
        links("see [[Project X|the project]] and [[ a | b ]] and [[a|b|c]] and [[x|]] and [[|y]]");
    assert_eq!(
        l.iter()
            .map(|l| (l.target.as_str(), l.label.as_deref()))
            .collect::<Vec<_>>(),
        vec![
            ("Project X", Some("the project")),
            ("a", Some("b")),
            ("a", Some("b|c")),
            ("x", None)
        ]
    );
    assert_eq!(l[0].key, "project x");
    assert_eq!(links("#[[a|b]]")[0].target, "a|b");
    assert_eq!(links("#[[a|b]]")[0].label, None);
}

#[test]
fn an_escaped_pipe_splits_like_a_pipe() {
    let one = |t: &str| {
        let l = links(t);
        assert_eq!(l.len(), 1, "{t}");
        let l = l.into_iter().next().unwrap();
        (l.target, l.kind, l.label, l.range)
    };
    assert_eq!(
        one("[[x\\|y]]"),
        ("x".into(), LinkKind::Page, Some("y".into()), 0..8)
    );
    let l = one("[[ x \\|  y ]]");
    assert_eq!((l.0.as_str(), l.2.as_deref()), ("x", Some("y")));
    let l = one("[[x\\|]]");
    assert_eq!((l.0.as_str(), l.2), ("x", None));
    let l = one("[[x\\]]");
    assert_eq!((l.0.as_str(), l.2), ("x\\", None));
    let l = one("[[a|b\\|c]]");
    assert_eq!((l.0.as_str(), l.2.as_deref()), ("a", Some("b\\|c")));
    let l = one("#[[x\\|y]]");
    assert_eq!((l.0.as_str(), l.1), ("x\\|y", LinkKind::Tag));
}

#[test]
fn heading_base_cuts_at_the_first_hash() {
    assert_eq!(heading_base("Page#Heading"), Some("Page"));
    assert_eq!(heading_base("Page #H"), Some("Page"));
    assert_eq!(heading_base("Page#^abc"), Some("Page"));
    assert_eq!(heading_base("a#b#c"), Some("a"));
    assert_eq!(heading_base("C#"), None);
    assert_eq!(heading_base("#H"), None);
    assert_eq!(heading_base("C# "), None);
}

#[test]
fn a_backslash_that_is_not_before_a_pipe_stays_in_the_name() {
    // Rust strings: `a\b` and `c\\d`, each backslash written twice.
    let l = links("see [[a\\b]] and [[c\\\\d]]");
    let targets: Vec<&str> = l.iter().map(|l| l.target.as_str()).collect();
    assert_eq!(targets, ["a\\b", "c\\\\d"]);
    assert!(l.iter().all(|l| l.label.is_none()));
}
