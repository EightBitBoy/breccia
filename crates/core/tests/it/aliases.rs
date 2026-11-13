use breccia_core::aliases::{alias_block, aliases, realias};
use breccia_core::{LineEnding, front_matter_len};

fn fm(inner: &str) -> String {
    format!("---\n{inner}\n---\n")
}

fn al(inner: &str) -> Vec<String> {
    aliases(&fm(inner))
}

#[test]
fn block_list() {
    assert_eq!(
        al("aliases:\n  - k8s\n  - \"Kube: prod\"\n  - 'it''s'\ntags: x"),
        ["k8s", "Kube: prod", "it's"]
    );
}

#[test]
fn flow_list_and_single() {
    assert_eq!(al("aliases: [a, \"b, c\", 'd']"), ["a", "b, c", "d"]);
    assert_eq!(al("aliases: one name"), ["one name"]);
    for none in ["aliases: []", "aliases:", "aliases: ~", "aliases: null"] {
        assert!(al(none).is_empty(), "{none}");
    }
}

#[test]
fn only_the_aliases_key() {
    for other in ["alias: a", "Aliases: a", "  aliases: a", "tags: [aliases]"] {
        assert!(al(other).is_empty(), "{other}");
    }
    assert_eq!(al("aliases: a\naliases: b"), ["a"]);
}

#[test]
fn skipped_values() {
    assert_eq!(
        al("aliases: [2026-10-29, \"[[Kubernetes]]\", \"a|b\", \"\", k8s, K8S]"),
        ["k8s"]
    );
}

#[test]
fn odd_yaml_is_read_or_skipped() {
    assert_eq!(al("aliases: k8s # short"), ["k8s"]);
    assert_eq!(al("aliases: \"a # b\""), ["a # b"]);
    assert_eq!(al("aliases:\n  -\n  - x"), ["x"]);
    assert_eq!(al("aliases:\n\t- x"), ["x"]);
    for none in [
        "aliases:\nother: y",
        "aliases: [a,\n  b]",
        "aliases: |\n  a",
        "aliases: \"bad \\q escape\"",
        "aliases: [a, b] c",
        "aliases: [a, b]# c",
        "aliases: [\"  \"]",
    ] {
        assert!(al(none).is_empty(), "{none:?}");
    }
}

#[test]
fn a_quote_opens_only_at_the_start_of_an_item() {
    // An apostrophe inside a word is text.
    assert_eq!(al("aliases: [don't panic, dp]"), ["don't panic", "dp"]);
    assert_eq!(al("aliases: [it's, 'a, b']"), ["it's", "a, b"]);
}

#[test]
fn a_comment_may_follow_a_flow_list() {
    assert_eq!(al("aliases: [a, b] # short names"), ["a", "b"]);
    assert_eq!(al("aliases: [a, \"b, c # d\"] # x"), ["a", "b, c # d"]);
    // A `]` inside quotes does not close the list (the name is then skipped:
    // a link name cannot hold `]`).
    assert_eq!(al("aliases: [a, \"b ] c\", d] # x"), ["a", "d"]);
}

#[test]
fn a_comment_line_inside_a_block_list_is_skipped() {
    assert_eq!(
        al("aliases:\n  - a\n  # old name\n# note\n  - b\ntags: x"),
        ["a", "b"]
    );
}

#[test]
fn quoted_values_are_trimmed_like_plain_ones() {
    assert_eq!(al("aliases: [\" k8s \", ' kube ']"), ["k8s", "kube"]);
    assert_eq!(al("aliases:\n  - \" k8s \""), ["k8s"]);
}

#[test]
fn no_front_matter_no_aliases() {
    assert!(aliases("aliases: a\n").is_empty());
    assert!(aliases("---\naliases: a\n").is_empty());
}

#[test]
fn alias_block_round_trips() {
    let lf = alias_block("Q&A: hiring", LineEnding::Lf);
    assert_eq!(lf, "---\naliases:\n  - \"Q&A: hiring\"\n---\n");
    assert_eq!(
        alias_block("Q&A: hiring", LineEnding::CrLf),
        lf.replace('\n', "\r\n")
    );
    for n in ["Q&A: hiring", "say \"hi\"", "a\\b", "#x", "- y"] {
        for le in [LineEnding::Lf, LineEnding::CrLf] {
            let b = alias_block(n, le);
            assert_eq!(aliases(&b), [n], "{n}");
            assert_eq!(front_matter_len(&b), Some(b.len()), "{n}");
        }
    }
}

#[test]
fn realias_only_touches_its_own_block() {
    let lf = LineEnding::Lf;
    let block = alias_block("A: b", lf);
    let page = format!("{block}title:: A: b\n");
    let renamed = realias(&page, "A: b", Some("C: d"), lf);
    assert_eq!(
        renamed,
        format!("{}title:: A: b\n", alias_block("C: d", lf))
    );
    assert_eq!(realias(&page, "A: b", None, lf), "title:: A: b\n");
    // CRLF pages: the block in their line ending.
    let crlf = LineEnding::CrLf;
    let page = format!("{}title:: A: b\r\n", alias_block("A: b", crlf));
    assert_eq!(
        realias(&page, "A: b", Some("C: d"), crlf),
        format!("{}title:: A: b\r\n", alias_block("C: d", crlf))
    );
    // A rename never adds a block.
    assert_eq!(realias("x\n", "A: b", Some("C: d"), lf), "x\n");
    assert_eq!(realias("", "A: b", Some("C: d"), lf), "");
    // Front matter the user wrote or changed stays as it is.
    for p in [
        "---\naliases:\n  - \"A: b\"\nowner: x\n---\n- y\n".to_string(),
        "---\naliases:\n  - 'A: b'\n---\n".to_string(),
        "---\nowner: x\naliases:\n  - \"A: b\"\n---\n".to_string(),
        "---\ntags: [x]\n---\n".to_string(),
        alias_block("A: bb", lf),
    ] {
        for to in [Some("C: d"), None] {
            assert_eq!(realias(&p, "A: b", to, lf), p, "{p:?}");
        }
    }
    // The LF block in a CRLF page is not the block Breccia would write there.
    assert_eq!(realias(&block, "A: b", None, crlf), block);
}

#[test]
fn a_hand_written_list_with_crlf_line_endings_is_read() {
    let block = "---\r\naliases:\r\n  - k8s\r\n  - \"Kube: prod\"\r\ntags: x\r\n---\r\n";
    assert_eq!(aliases(block), ["k8s", "Kube: prod"]);
    let flow = "---\r\naliases: [a, \"b, c\"]\r\n---\r\n";
    assert_eq!(aliases(flow), ["a", "b, c"]);
    let single = "---\r\naliases: one name\r\n---\r\n";
    assert_eq!(aliases(single), ["one name"]);
}
