//! Rewrites the links to a renamed page.
//!
//! Only the byte ranges [`links`] reports are touched, so code spans, fenced
//! code and every other byte stay as they are. A rewrite is only made when
//! the new text reads back with the same links, in the same order, except
//! that the old ones now name the new page. A name that link syntax cannot
//! hold (for example one with a single `]`) leaves the text alone.

use std::collections::HashSet;

use crate::error::EditError;
use crate::inline::{Link, LinkKind, links};
use crate::outline::{BlockId, Document};

/// What rewriting one text gives.
#[derive(Debug, PartialEq, Eq)]
enum Rewrite {
    /// No link to the old page, or each is already spelled as the new name.
    Same,
    Changed(String),
    /// The text has links to the old page but the rewrite would not read back.
    Refused,
}

/// `text` with every link to the page `old_key` changed to name `new_name`,
/// or `None` when nothing changes:
/// - `[[x]]` becomes `[[new_name]]`, and `[[x|shown]]` becomes
///   `[[new_name|shown]]`;
/// - `#[[x]]` becomes `#[[new_name]]`;
/// - `#x` becomes `#new_name` if that reads back as the whole tag, else
///   `#[[new_name]]`;
/// - a page link whose key is in `headings` (the keys of the heading links
///   `[[x#…]]` that go to the page by its name) becomes `[[new_name` plus
///   every byte after the name as typed: `[[x #h|y]]` gives
///   `[[new_name #h|y]]`. Tags are never heading links.
///
/// Also `None` when the new text would not read back with the same links.
pub fn relink(
    text: &str,
    old_key: &str,
    new_name: &str,
    headings: &HashSet<String>,
) -> Option<String> {
    match rewrite(text, old_key, new_name, headings) {
        Rewrite::Changed(t) => Some(t),
        Rewrite::Same | Rewrite::Refused => None,
    }
}

/// How one link is rewritten.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Hit {
    /// It names the page.
    Name,
    /// A page link to a heading of the page.
    Heading,
}

fn hit(l: &Link, old_key: &str, headings: &HashSet<String>) -> Option<Hit> {
    if l.key == old_key {
        Some(Hit::Name)
    } else if l.kind == LinkKind::Page && headings.contains(&l.key) {
        Some(Hit::Heading)
    } else {
        None
    }
}

/// The length of the page name at the start of a heading link's target
/// (or of its syntax after `[[`): the bytes before the first `#`, without
/// the blanks before it.
pub(crate) fn name_len(s: &str) -> usize {
    s.find('#').map_or(s.len(), |h| s[..h].trim_end().len())
}

fn rewrite(text: &str, old_key: &str, new_name: &str, headings: &HashSet<String>) -> Rewrite {
    let found = links(text);
    if !found.iter().any(|l| hit(l, old_key, headings).is_some()) {
        return Rewrite::Same;
    }
    let mut out = String::with_capacity(text.len() + new_name.len());
    let mut last = 0;
    for l in &found {
        let src = &text[l.range.clone()];
        let new = match hit(l, old_key, headings) {
            None => continue,
            Some(Hit::Name) => replacement(src, l.kind, new_name),
            Some(Hit::Heading) => {
                let inner = &src[2..];
                format!("[[{new_name}{}", &inner[name_len(inner)..])
            }
        };
        out.push_str(&text[last..l.range.start]);
        out.push_str(&new);
        last = l.range.end;
    }
    out.push_str(&text[last..]);
    if out == text {
        return Rewrite::Same;
    }
    let target = |l: &Link| match hit(l, old_key, headings) {
        Some(Hit::Name) => new_name.to_string(),
        Some(Hit::Heading) => format!("{new_name}{}", &l.target[name_len(&l.target)..]),
        None => l.target.clone(),
    };
    let want: Vec<(LinkKind, String)> = found.iter().map(|l| (l.kind, target(l))).collect();
    let got: Vec<(LinkKind, String)> = links(&out)
        .into_iter()
        .map(|l| (l.kind, l.target))
        .collect();
    if got == want {
        Rewrite::Changed(out)
    } else {
        Rewrite::Refused
    }
}

/// The new syntax for one link, `src` being its old syntax.
fn replacement(src: &str, kind: LinkKind, new_name: &str) -> String {
    match kind {
        // Keep every byte from the `|` on (from the `\` before it when there
        // is one): the shown text is the user's.
        LinkKind::Page => match src.find('|') {
            Some(bar) => {
                let from = if src[..bar].ends_with('\\') {
                    bar - 1
                } else {
                    bar
                };
                format!("[[{new_name}{}", &src[from..])
            }
            None => format!("[[{new_name}]]"),
        },
        LinkKind::Tag if !src.starts_with("#[[") && bare_tag_ok(new_name) => {
            format!("#{new_name}")
        }
        LinkKind::Tag => format!("#[[{new_name}]]"),
    }
}

/// Whether `#name` reads back as exactly one tag naming `name` that covers
/// the whole string.
fn bare_tag_ok(name: &str) -> bool {
    let tag = format!("#{name}");
    match links(&tag).as_slice() {
        [l] => l.kind == LinkKind::Tag && l.target == name && l.range == (0..tag.len()),
        _ => false,
    }
}

impl Document {
    /// Rewrites the links to the page `old_key` so they name `new_name`, in
    /// the preamble and in every block, with [`relink`]'s rules. Returns
    /// `(changed, skipped)`: how many blocks (the preamble counting as one)
    /// were rewritten, and how many hold such links but were left alone
    /// because the rewrite would not read back or would change the
    /// outline. Blocks that do not change keep their bytes and IDs.
    pub fn relink(
        &mut self,
        old_key: &str,
        new_name: &str,
        headings: &HashSet<String>,
    ) -> (usize, usize) {
        let (mut changed, mut skipped) = (0, 0);
        let mut count = |r: Result<(), EditError>| match r {
            Ok(()) => changed += 1,
            Err(_) => skipped += 1,
        };
        match rewrite(&self.preamble, old_key, new_name, headings) {
            Rewrite::Same => {}
            Rewrite::Changed(p) => count(self.set_preamble(&p)),
            Rewrite::Refused => count(Err(EditError::WouldChangeStructure)),
        }
        let texts: Vec<(BlockId, Rewrite)> = self
            .blocks
            .iter()
            .map(|b| (b.id, rewrite(&b.text, old_key, new_name, headings)))
            .collect();
        for (id, r) in texts {
            match r {
                Rewrite::Same => {}
                Rewrite::Changed(t) => count(self.replace_keeping_structure(id, &t)),
                Rewrite::Refused => count(Err(EditError::WouldChangeStructure)),
            }
        }
        (changed, skipped)
    }
}
