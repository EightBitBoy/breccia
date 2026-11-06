//! Finds `[[links]]`, `#tags` and `key:: value` properties in block text.

use std::ops::Range;

use crate::naming::{is_valid_page_name, page_key};
use crate::outline::LineScanner;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LinkKind {
    Page,
    Tag,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Link {
    /// The target as typed, trimmed. For `[[target|label]]`, the part before
    /// the first `|`.
    pub target: String,
    /// `page_key(target)`.
    pub key: String,
    pub kind: LinkKind,
    /// Byte range of the whole link syntax in the text.
    pub range: Range<usize>,
    /// The shown text of a page link written `[[target|label]]`: the part
    /// after the first `|`, trimmed. `None` without a `|` or with a blank
    /// label, and always for tags.
    pub label: Option<String>,
}

const TAG_END: &[char] = &[
    ',', ';', '!', '?', '(', ')', '[', ']', '{', '}', '"', '\'', '`',
];

fn make(name: &str, kind: LinkKind, range: Range<usize>) -> Option<Link> {
    let (target, label) = match (kind, name.split_once('|')) {
        (LinkKind::Page, Some((t, l))) => {
            let l = l.trim();
            // A backslash before the pipe is Obsidian's table-cell escape.
            let t = t.strip_suffix('\\').unwrap_or(t);
            (t, (!l.is_empty()).then(|| l.to_string()))
        }
        _ => (name, None),
    };
    let target = target.trim().to_string();
    if target.is_empty() {
        return None;
    }
    Some(Link {
        key: page_key(&target),
        target,
        kind,
        range,
        label,
    })
}

/// Parses `[[name]]` at the start of `s`; returns the name and the byte length.
fn bracket_link(s: &str) -> Option<(&str, usize)> {
    let rest = s.strip_prefix("[[")?;
    let end = rest.find(['[', ']'])?;
    if !rest[end..].starts_with("]]") {
        return None;
    }
    let name = &rest[..end];
    if name.trim().is_empty() {
        return None;
    }
    Some((name, end + 4))
}

/// Byte ranges of the inline code spans in one paragraph (which may span
/// lines). A backtick run opens a span that the next run of the same length
/// closes; a run with no partner is literal text.
fn code_ranges(para: &str, base: usize) -> Vec<Range<usize>> {
    let mut out = Vec::new();
    let mut i = 0;
    while let Some(p) = para[i..].find('`') {
        let start = i + p;
        let n = para[start..].len() - para[start..].trim_start_matches('`').len();
        let mut j = start + n;
        let mut end = None;
        while let Some(q) = para[j..].find('`') {
            let s = j + q;
            let run = para[s..].len() - para[s..].trim_start_matches('`').len();
            if run == n {
                end = Some(s + run);
                break;
            }
            j = s + run;
        }
        match end {
            Some(e) => {
                out.push(base + start..base + e);
                i = e;
            }
            None => i = start + n,
        }
    }
    out
}

fn scan_line(line: &str, base: usize, code: &[Range<usize>], out: &mut Vec<Link>) {
    let mut i = 0;
    let mut prev_ws = true;
    while i < line.len() {
        let rest = &line[i..];
        let c = rest.chars().next().unwrap();
        let pos = base + i;
        let step = if let Some(r) = code.iter().find(|r| r.contains(&pos)) {
            (r.end - pos).min(rest.len())
        } else {
            match c {
                '[' => match bracket_link(rest) {
                    Some((name, len)) => {
                        out.extend(make(name, LinkKind::Page, pos..pos + len));
                        len
                    }
                    None => 1,
                },
                '#' if prev_ws && rest[1..].starts_with('#') => {
                    rest.len() - rest.trim_start_matches('#').len()
                }
                '#' if prev_ws => {
                    let after = &rest[1..];
                    if let Some((name, len)) = bracket_link(after) {
                        out.extend(make(name, LinkKind::Tag, pos..pos + 1 + len));
                        1 + len
                    } else {
                        let end = after
                            .find(|ch: char| ch.is_whitespace() || TAG_END.contains(&ch))
                            .unwrap_or(after.len());
                        let tag = after[..end].trim_end_matches(['.', ':']);
                        if tag.is_empty() {
                            1
                        } else {
                            out.extend(make(tag, LinkKind::Tag, pos..pos + 1 + tag.len()));
                            1 + tag.len()
                        }
                    }
                }
                _ => c.len_utf8(),
            }
        };
        prev_ws = rest[..step]
            .chars()
            .next_back()
            .is_some_and(char::is_whitespace);
        i += step;
    }
}

/// The page part of a heading link target (`Page#Heading`, `Page#^block`):
/// the trimmed text before the first `#`, when it and the text after the
/// `#` are both non-empty. Else `None`.
pub fn heading_base(target: &str) -> Option<&str> {
    let (base, rest) = target.split_once('#')?;
    let base = base.trim();
    (!base.is_empty() && !rest.trim().is_empty()).then_some(base)
}

/// All page links and tags in `text`, in text order. Code spans (which may
/// continue across lines inside a paragraph) and fenced code hold no links.
pub fn links(text: &str) -> Vec<Link> {
    // (start, end) byte ranges of the paragraphs: runs of lines that are
    // neither blank nor fence lines nor fenced code.
    let mut paras: Vec<Range<usize>> = Vec::new();
    let mut scan = LineScanner::default();
    let mut base = 0;
    let mut cur: Option<usize> = None;
    for line in text.split('\n') {
        let trimmed = line.trim();
        if scan.code(trimmed) || trimmed.is_empty() {
            if let Some(s) = cur.take() {
                paras.push(s..base - 1);
            }
        } else if cur.is_none() {
            cur = Some(base);
        }
        base += line.len() + 1;
    }
    if let Some(s) = cur {
        paras.push(s..text.len());
    }

    let mut out = Vec::new();
    for para in paras {
        let code = code_ranges(&text[para.clone()], para.start);
        let mut base = para.start;
        for line in text[para.clone()].split('\n') {
            scan_line(line, base, &code, &mut out);
            base += line.len() + 1;
        }
    }
    out
}

pub(crate) fn property(line: &str) -> Option<(String, String)> {
    let (key, rest) = line.split_once("::")?;
    if key.is_empty()
        || !key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return None;
    }
    if !rest.is_empty() && !rest.starts_with(' ') {
        return None;
    }
    Some((key.to_string(), rest.trim().to_string()))
}

/// The `key:: value` lines directly after the first line.
pub fn properties(text: &str) -> Vec<(String, String)> {
    text.split('\n').skip(1).map_while(property).collect()
}

/// The first property line of `preamble` whose key is `title` (ASCII
/// case-insensitive) and whose value is a valid page name: its index among
/// `preamble.split('\n')` and the value.
/// Lines inside the front matter are skipped.
pub fn title_line(preamble: &str) -> Option<(usize, String)> {
    let skip = crate::outline::front_matter_len(preamble)
        .map_or(0, |n| preamble[..n].matches('\n').count());
    preamble
        .split('\n')
        .enumerate()
        .skip(skip)
        .find_map(|(i, l)| {
            let (k, v) = property(l)?;
            (k.eq_ignore_ascii_case("title") && is_valid_page_name(&v)).then_some((i, v))
        })
}
