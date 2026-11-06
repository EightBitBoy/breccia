//! Aliases: other names a page answers to, read from the `aliases:` key of its
//! front matter (Obsidian's property), and Breccia's own alias block.

use crate::naming::{is_linkable_name, page_key, parse_journal_name};
use crate::outline::{LineEnding, front_matter_len};

fn content(line: &str) -> &str {
    let l = line.strip_suffix('\n').unwrap_or(line);
    l.strip_suffix('\r').unwrap_or(l)
}

/// The alias spellings of a preamble's front matter: trimmed, in file order,
/// without repeats by key. Skips values that are not linkable names and
/// journal names. The caller drops the page's own name.
pub fn aliases(preamble: &str) -> Vec<String> {
    let Some(n) = front_matter_len(preamble) else {
        return Vec::new();
    };
    let lines: Vec<&str> = preamble[..n].split_inclusive('\n').map(content).collect();
    // Between the two `---` lines.
    let inner = &lines[1..lines.len() - 1];
    let Some(at) = inner.iter().position(|l| l.starts_with("aliases:")) else {
        return Vec::new();
    };
    let rest = inner[at]["aliases:".len()..].trim_matches([' ', '\t']);
    let mut raw: Vec<Option<String>> = Vec::new();
    if rest.is_empty() || rest.starts_with('#') {
        for line in &inner[at + 1..] {
            let t = line.trim_start_matches([' ', '\t']);
            // Blank lines and comment lines do not end the list.
            if t.is_empty() || t.starts_with('#') {
                continue;
            }
            if !line.starts_with([' ', '\t']) {
                break;
            }
            let Some(item) = t.strip_prefix('-') else {
                break;
            };
            if !(item.is_empty() || item.starts_with([' ', '\t'])) {
                break;
            }
            raw.push(scalar(item.trim_matches([' ', '\t'])));
        }
    } else if let Some(body) = rest.strip_prefix('[') {
        match split_flow(body) {
            Some(items) => raw.extend(items.into_iter().map(|s| scalar(s.trim()))),
            None => return Vec::new(),
        }
    } else if rest.starts_with(['|', '>']) {
        return Vec::new();
    } else {
        raw.push(scalar(rest));
    }
    let mut out: Vec<String> = Vec::new();
    for name in raw.into_iter().flatten() {
        if !is_linkable_name(&name) || parse_journal_name(&name).is_some() {
            continue;
        }
        if out.iter().any(|o| page_key(o) == page_key(&name)) {
            continue;
        }
        out.push(name);
    }
    out
}

/// Splits a flow list after its `[` at commas outside quotes, up to the
/// closing `]`, after which only a ` #` comment may follow. A quote opens
/// only at the start of an item (`don't` is text). `None` when there is no
/// closing `]` or something else follows it.
fn split_flow(s: &str) -> Option<Vec<&str>> {
    let mut parts = Vec::new();
    let mut start = 0;
    let mut quote: Option<char> = None;
    let mut at_item_start = true;
    let mut close = None;
    let mut chars = s.char_indices();
    while let Some((i, c)) = chars.next() {
        match quote {
            Some('"') if c == '\\' => {
                chars.next();
            }
            Some(q) if c == q => quote = None,
            Some(_) => {}
            None if at_item_start && (c == '"' || c == '\'') => {
                quote = Some(c);
                at_item_start = false;
            }
            None if c == ',' => {
                parts.push(&s[start..i]);
                start = i + 1;
                at_item_start = true;
            }
            None if c == ']' => {
                close = Some(i);
                break;
            }
            None if c == ' ' || c == '\t' => {}
            None => at_item_start = false,
        }
    }
    let close = close?;
    if !tail_ok(&s[close + 1..]) {
        return None;
    }
    parts.push(&s[start..close]);
    if parts.len() == 1 && parts[0].trim().is_empty() {
        parts.clear();
    }
    Some(parts)
}

/// A YAML scalar; `None` for nothing, or when it cannot be read.
fn scalar(s: &str) -> Option<String> {
    if let Some(body) = s.strip_prefix('"') {
        let mut out = String::new();
        let mut chars = body.char_indices();
        while let Some((i, c)) = chars.next() {
            match c {
                '\\' => match chars.next() {
                    Some((_, e @ ('\\' | '"'))) => out.push(e),
                    _ => return None,
                },
                '"' => return tail_ok(&body[i + 1..]).then(|| trimmed(out)),
                _ => out.push(c),
            }
        }
        None
    } else if let Some(body) = s.strip_prefix('\'') {
        let mut out = String::new();
        let mut chars = body.char_indices().peekable();
        while let Some((i, c)) = chars.next() {
            if c == '\'' {
                if chars.peek().is_some_and(|&(_, n)| n == '\'') {
                    chars.next();
                    out.push('\'');
                } else {
                    return tail_ok(&body[i + 1..]).then(|| trimmed(out));
                }
            } else {
                out.push(c);
            }
        }
        None
    } else {
        let cut = [" #", "\t#"]
            .iter()
            .filter_map(|m| s.find(m))
            .min()
            .unwrap_or(s.len());
        let v = s[..cut].trim_matches([' ', '\t']);
        (!v.is_empty() && v != "~" && v != "null" && !v.starts_with('#')).then(|| v.to_string())
    }
}

/// A quoted value trimmed like a plain one.
fn trimmed(s: String) -> String {
    s.trim_matches([' ', '\t']).to_string()
}

/// After a closing quote only whitespace and a ` #` comment may follow.
fn tail_ok(t: &str) -> bool {
    let tt = t.trim_matches([' ', '\t']);
    tt.is_empty() || (t.starts_with([' ', '\t']) && tt.starts_with('#'))
}

/// Breccia's alias block: front matter with one double-quoted alias. Each
/// line ends with `le`. A caller that wants to recognise or replace the block
/// compares a preamble with `alias_block(old_name, le)` byte for byte.
pub fn alias_block(name: &str, le: LineEnding) -> String {
    let e = le.as_str();
    let q = name.replace('\\', "\\\\").replace('"', "\\\"");
    format!("---{e}aliases:{e}  - \"{q}\"{e}---{e}")
}

/// The preamble of a page renamed from `old_name`: when it starts with
/// Breccia's block for the old name (`alias_block(old_name, le)`, byte for
/// byte), that block is replaced by the one for `new_name`, or removed when
/// `new_name` is `None`. Any other preamble is returned as it is: a rename
/// never adds a block and never changes front matter the user wrote.
pub fn realias(preamble: &str, old_name: &str, new_name: Option<&str>, le: LineEnding) -> String {
    match preamble.strip_prefix(&alias_block(old_name, le)) {
        Some(rest) => match new_name {
            Some(n) => format!("{}{rest}", alias_block(n, le)),
            None => rest.to_string(),
        },
        None => preamble.to_string(),
    }
}
