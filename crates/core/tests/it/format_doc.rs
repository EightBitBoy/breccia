//! `docs/format.md` must say what the parser does. Its fences carry a
//! second info-string word (GitHub ignores it) that this test reads:
//! - ```` ```markdown example ```` is a file; the next ```` ```text reads ````
//!   fence after it must equal [`describe`] of that file;
//! - ```` ```toml default-config ```` is `Config::default_toml()`;
//! - ```` ```text colours ```` is `PALETTE` joined by spaces;
//! - ```` ```text file-names ```` holds `name → stem` lines for `file_stem_for`;
//! - ```` ```text page-colors ```` is `PAGE_COLORS`, five to a line;
//! - a ```` ```markdown before ```` fence is followed by a ```` ```markdown after-<name> ````
//!   fence (`<name>` a page color, `hue-<h>` or `none`): the `after` text is the `before`
//!   text with its preamble recolored with that color.

use breccia_core::aliases::aliases;
use breccia_core::color::{PAGE_COLORS, PageColor, page_color, parse_color, recolor};
use breccia_core::config::PALETTE;
use breccia_core::inline::{LinkKind, links, properties, title_line};
use breccia_core::naming::file_stem_for;
use breccia_core::task::{created_at, done_date, done_time, priority, task_state};
use breccia_core::{Config, IdGen, front_matter_len, parse};

const DOC_PATH: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../docs/format.md");

/// A fenced code block of the doc: its info string and its lines.
struct Fence {
    /// 1-based line number of the opening fence line.
    line: usize,
    info: String,
    /// The lines between the fence lines, each ending in `\n`.
    body: String,
}

fn doc() -> String {
    std::fs::read_to_string(DOC_PATH).unwrap_or_else(|e| panic!("{DOC_PATH}: {e}"))
}

/// The fenced code blocks of `text` (backtick or tilde runs of 3 or more; a
/// fence closes on a line holding only a run of its character at least as
/// long as the opener's).
fn fences(text: &str) -> Vec<Fence> {
    let mut out = Vec::new();
    let mut open: Option<(String, Fence)> = None;
    for (i, line) in text.split('\n').enumerate() {
        match &mut open {
            Some((run, fence)) => {
                let t = line.trim();
                let mark = run.chars().next().unwrap();
                if t.len() >= run.len() && t.chars().all(|c| c == mark) {
                    out.push(open.take().unwrap().1);
                } else {
                    fence.body.push_str(line);
                    fence.body.push('\n');
                }
            }
            None => {
                let t = line.trim_start();
                let Some(mark) = ['`', '~'].into_iter().find(|&m| t.starts_with(m)) else {
                    continue;
                };
                let run: String = t.chars().take_while(|&c| c == mark).collect();
                if run.len() < 3 {
                    continue;
                }
                open = Some((
                    run.clone(),
                    Fence {
                        line: i + 1,
                        info: t[run.len()..].trim().to_string(),
                        body: String::new(),
                    },
                ));
            }
        }
    }
    assert!(open.is_none(), "docs/format.md ends inside a fence");
    out
}

/// What Breccia reads from `src` with the default config, one item a line.
fn describe(src: &str) -> String {
    let cfg = Config::default();
    let doc = parse(src, &mut IdGen::new());
    let pre = doc.preamble();
    let front = front_matter_len(pre);
    let mut out = String::new();
    let after = &pre[front.unwrap_or(0)..];
    if !after.is_empty() {
        out += &format!("preamble {after:?}\n");
    }
    if let Some(n) = front {
        out += &format!("front-matter {} lines\n", pre[..n].lines().count());
    }
    if let Some((_, title)) = title_line(pre) {
        out += &format!("title {title:?}\n");
    }
    if let Some(color) = page_color(pre) {
        out += &format!("color \"{color}\"\n");
    }
    for alias in aliases(pre) {
        out += &format!("alias {alias:?}\n");
    }
    for b in doc.blocks() {
        let state = task_state(b.text(), &cfg).map_or("-", |s| s.keyword.as_str());
        out += &format!("{} {state} {:?}\n", b.depth(), b.text());
        for l in links(b.text()) {
            match (l.kind, &l.label) {
                (LinkKind::Page, Some(shown)) => {
                    out += &format!("  link {:?} shown {shown:?}\n", l.target)
                }
                (LinkKind::Page, None) => out += &format!("  link {:?}\n", l.target),
                (LinkKind::Tag, _) => out += &format!("  tag {:?}\n", l.target),
            }
        }
        for (k, v) in properties(b.text()) {
            out += &format!("  property {k:?} {v:?}\n");
        }
        if let Some(c) = created_at(b.text()) {
            out += &format!("  created {c}\n");
        }
        if let Some(d) = done_date(b.text()) {
            match done_time(b.text()) {
                Some(t) => out += &format!("  done {d} {t}\n"),
                None => out += &format!("  done {d}\n"),
            }
        }
        if let Some(n) = priority(b.text()) {
            out += &format!("  priority {n}\n");
        }
    }
    out
}

fn with_info<'a>(fences: &'a [Fence], info: &str) -> Vec<&'a Fence> {
    fences.iter().filter(|f| f.info == info).collect()
}

#[test]
fn format_doc_examples_read_as_documented() {
    let fences = fences(&doc());
    let mut failures = Vec::new();
    let mut examples = 0;
    let mut pending: Option<&Fence> = None;
    for f in &fences {
        match f.info.as_str() {
            "markdown example" => {
                if let Some(e) = pending {
                    failures.push(format!("line {}: example has no `reads` fence", e.line));
                }
                pending = Some(f);
            }
            "text reads" => {
                let Some(e) = pending.take() else {
                    failures.push(format!("line {}: `reads` fence without an example", f.line));
                    continue;
                };
                examples += 1;
                if e.body.contains('\r') {
                    failures.push(format!("line {}: example holds a \\r", e.line));
                }
                let rendered = parse(&e.body, &mut IdGen::new()).render();
                if rendered != e.body {
                    failures.push(format!(
                        "line {}: example does not round-trip:\n{rendered:?}",
                        e.line
                    ));
                }
                let actual = describe(&e.body);
                if actual != f.body {
                    failures.push(format!(
                        "line {}: example reads differently from the `reads` fence at line {}\n\
                         --- documented ---\n{}--- actual ---\n{actual}",
                        e.line, f.line, f.body
                    ));
                }
            }
            _ => {}
        }
    }
    if let Some(e) = pending {
        failures.push(format!("line {}: example has no `reads` fence", e.line));
    }
    assert!(failures.is_empty(), "{}", failures.join("\n\n"));
    assert!(examples >= 8, "only {examples} examples, want at least 8");
}

#[test]
fn format_doc_config_is_the_default() {
    let fences = fences(&doc());
    let found = with_info(&fences, "toml default-config");
    assert_eq!(found.len(), 1, "want one `toml default-config` fence");
    assert_eq!(
        found[0].body,
        Config::default_toml(),
        "line {}: the default config differs",
        found[0].line
    );
}

#[test]
fn format_doc_colours() {
    let fences = fences(&doc());
    let found = with_info(&fences, "text colours");
    assert_eq!(found.len(), 1, "want one `text colours` fence");
    assert_eq!(
        found[0].body.trim_end_matches('\n'),
        PALETTE.join(" "),
        "line {}: the colours differ",
        found[0].line
    );
}

#[test]
fn format_doc_file_names() {
    let fences = fences(&doc());
    let found = with_info(&fences, "text file-names");
    assert_eq!(found.len(), 1, "want one `text file-names` fence");
    let mut failures = Vec::new();
    let mut count = 0;
    for (i, line) in found[0].body.lines().enumerate() {
        let at = found[0].line + 1 + i;
        let Some((name, stem)) = line.split_once(" → ") else {
            failures.push(format!("line {at}: no ` → ` in {line:?}"));
            continue;
        };
        count += 1;
        let actual = file_stem_for(name);
        if actual != stem {
            failures.push(format!(
                "line {at}: {name:?} documented as {stem:?}, actual {actual:?}"
            ));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
    assert!(count >= 6, "only {count} file-name lines, want at least 6");
}

#[test]
fn format_doc_page_colors() {
    let fences = fences(&doc());
    let found = with_info(&fences, "text page-colors");
    assert_eq!(found.len(), 1, "want one `text page-colors` fence");
    let want = PAGE_COLORS
        .chunks(5)
        .map(|r| r.join(" "))
        .collect::<Vec<_>>()
        .join("\n");
    assert_eq!(
        found[0].body.trim_end_matches('\n'),
        want,
        "line {}: the page colors differ",
        found[0].line
    );
}

#[test]
fn format_doc_recolor_examples() {
    let fences = fences(&doc());
    let mut failures = Vec::new();
    let mut pairs = 0;
    let mut hue_pairs = 0;
    for (i, f) in fences.iter().enumerate() {
        if f.info != "markdown before" {
            continue;
        }
        let Some((after, name)) = fences
            .get(i + 1)
            .and_then(|a| a.info.strip_prefix("markdown after-").map(|name| (a, name)))
        else {
            failures.push(format!("line {}: `before` has no `after-…` fence", f.line));
            continue;
        };
        pairs += 1;
        if name.starts_with("hue-") {
            hue_pairs += 1;
        }
        let hue = hue_value(name);
        let color = match name {
            "none" => None,
            n if PAGE_COLORS.contains(&n) => Some(n),
            _ if hue.is_some() => hue.as_deref(),
            n => {
                failures.push(format!("line {}: unknown color {n:?}", after.line));
                continue;
            }
        };
        for fence in [f, after] {
            let rendered = parse(&fence.body, &mut IdGen::new()).render();
            if rendered != fence.body {
                failures.push(format!("line {}: does not round-trip", fence.line));
            }
        }
        let doc = parse(&f.body, &mut IdGen::new());
        let pre = doc.preamble();
        let rest = doc.render().strip_prefix(pre).unwrap().to_string();
        let got = format!("{}{rest}", recolor(pre, color, doc.line_ending()));
        if got != after.body {
            failures.push(format!(
                "line {}: recolor to {name} gives {got:?}, documented {:?}",
                f.line, after.body
            ));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
    assert!(pairs >= 6, "only {pairs} recolor pairs, want at least 6");
    assert!(
        hue_pairs >= 2,
        "only {hue_pairs} hue recolor pairs, want at least 2"
    );
}

/// `hue-<h>` as the value `hue <h>`, when `<h>` is a canonical hue (no leading zeros).
fn hue_value(name: &str) -> Option<String> {
    let h = name.strip_prefix("hue-")?;
    let value = format!("hue {h}");
    matches!(parse_color(&value), Some(PageColor::Hue(n)) if n.to_string() == h).then_some(value)
}

const KNOWN_PAIRS: [&str; 7] = [
    "text page-colors",
    "markdown before",
    "markdown example",
    "text reads",
    "toml default-config",
    "text colours",
    "text file-names",
];

/// `markdown after-<x>` with `<x>` a page color, `hue-<h>` or `none`.
fn is_after(info: &str) -> bool {
    info.strip_prefix("markdown after-")
        .is_some_and(|x| x == "none" || PAGE_COLORS.contains(&x) || hue_value(x).is_some())
}

/// Lines of fences whose info string has two words but is not a known pair.
fn unknown_pairs(fences: &[Fence]) -> Vec<String> {
    fences
        .iter()
        .filter(|f| f.info.split_whitespace().count() == 2)
        .filter(|f| !KNOWN_PAIRS.contains(&f.info.as_str()) && !is_after(&f.info))
        .map(|f| format!("line {}: unknown fence info {:?}", f.line, f.info))
        .collect()
}

#[test]
fn format_doc_fence_info_strings_are_known() {
    let bad = unknown_pairs(&fences(&doc()));
    assert!(bad.is_empty(), "{}", bad.join("\n"));
    let sample = fences(
        "```text raeds\nx\n```\n```markdown after-banana\nx\n```\n\
         ```markdown after-hue-212\nx\n```\n```markdown after-hue-360\nx\n```\n\
         ```markdown after-hue-07\nx\n```\n",
    );
    assert_eq!(
        unknown_pairs(&sample),
        [
            "line 1: unknown fence info \"text raeds\"",
            "line 4: unknown fence info \"markdown after-banana\"",
            "line 10: unknown fence info \"markdown after-hue-360\"",
            "line 13: unknown fence info \"markdown after-hue-07\""
        ]
    );
}
