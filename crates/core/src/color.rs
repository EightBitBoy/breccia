//! The `color::` line of a page's preamble: reading it, writing it, and the
//! 25 colors a page can have.

use crate::inline::{property, title_line};
use crate::outline::{LineEnding, front_matter_len};
use crate::workspace::{Page, PageKind};
use serde::{Serialize, Serializer};
use std::fmt;

/// The page colors, row by row in the order of the picker's grid.
pub const PAGE_COLORS: [&str; 25] = [
    "crimson", "red", "coral", "orange", "amber", "yellow", "olive", "lime", "green", "emerald",
    "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "magenta", "pink", "rose",
    "brown", "tan", "sand", "slate", "grey",
];

/// The entry of [`PAGE_COLORS`] equal to `name`, ignoring ASCII case.
pub fn canonical_color(name: &str) -> Option<&'static str> {
    PAGE_COLORS
        .iter()
        .copied()
        .find(|c| c.eq_ignore_ascii_case(name))
}

/// The vividness of a custom hue that looks as the hue always did.
pub const DEFAULT_VIVID: u8 = 100;
/// The least vividness a page color can have.
pub const MIN_VIVID: u8 = 50;
/// The most vividness a page color can have.
pub const MAX_VIVID: u8 = 200;

/// What a page's `color::` line gives it: one of [`PAGE_COLORS`] or a hue
/// (0 to 359 degrees) with a vividness (50 to 200, 100 is the default),
/// written `hue 212` or `hue 212 vivid 150`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum PageColor {
    Named(&'static str),
    Hue { hue: u16, vivid: u8 },
}

impl PageColor {
    /// A hue with the default vividness.
    pub const fn hue(hue: u16) -> PageColor {
        PageColor::Hue {
            hue,
            vivid: DEFAULT_VIVID,
        }
    }
}

impl fmt::Display for PageColor {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PageColor::Named(n) => f.write_str(n),
            PageColor::Hue { hue, vivid } if *vivid == DEFAULT_VIVID => write!(f, "hue {hue}"),
            PageColor::Hue { hue, vivid } => write!(f, "hue {hue} vivid {vivid}"),
        }
    }
}

impl Serialize for PageColor {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.collect_str(self)
    }
}

/// The number in `digits` (ASCII digits only, leading zeros allowed) when it
/// is at most `max`; long digit strings do not overflow.
fn bounded_number(digits: &str, max: u32) -> Option<u32> {
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let mut n = 0u32;
    for b in digits.bytes() {
        n = n * 10 + u32::from(b - b'0');
        if n > max {
            return None;
        }
    }
    Some(n)
}

/// A page color from its text: a name from [`PAGE_COLORS`] (any ASCII case),
/// or `hue` and a number from 0 to 359, optionally followed by `vivid` and a
/// number from 50 to 200. The words ignore ASCII case, the numbers are ASCII
/// digits only (leading zeros allowed), and the separator is ASCII whitespace.
pub fn parse_color(value: &str) -> Option<PageColor> {
    if let Some(n) = canonical_color(value) {
        return Some(PageColor::Named(n));
    }
    let mut words = value.split_ascii_whitespace();
    let (word, num) = (words.next()?, words.next()?);
    if !word.eq_ignore_ascii_case("hue") {
        return None;
    }
    let hue = bounded_number(num, 359)? as u16;
    let vivid = match (words.next(), words.next(), words.next()) {
        (None, ..) => DEFAULT_VIVID,
        (Some(w), Some(v), None) if w.eq_ignore_ascii_case("vivid") => {
            let v = bounded_number(v, u32::from(MAX_VIVID))?;
            if v < u32::from(MIN_VIVID) {
                return None;
            }
            v as u8
        }
        _ => return None,
    };
    Some(PageColor::Hue { hue, vivid })
}

/// The color a page has of its own: none for a journal, else what its
/// preamble gives it.
pub fn own_color(page: &Page) -> Option<PageColor> {
    match page.kind {
        PageKind::Journal(_) => None,
        PageKind::Page => page_color(page.doc.preamble()),
    }
}

/// The value of `line` (no terminator needed) when it is a property line with
/// key `color`, whatever the value.
fn is_color_property(line: &str) -> Option<String> {
    let (k, v) = property(line.trim_end_matches(['\r', '\n']))?;
    k.eq_ignore_ascii_case("color").then_some(v)
}

/// The first property line of `preamble` after the front matter whose key is
/// `color` (ASCII case-insensitive) and whose value is a page color: its index
/// among `preamble.split('\n')` and the color.
pub fn color_line(preamble: &str) -> Option<(usize, PageColor)> {
    let skip = front_matter_len(preamble).map_or(0, |n| preamble[..n].matches('\n').count());
    preamble
        .split('\n')
        .enumerate()
        .skip(skip)
        .find_map(|(i, l)| {
            let v = is_color_property(l)?;
            parse_color(&v).map(|c| (i, c))
        })
}

/// The color the page's preamble gives it.
pub fn page_color(preamble: &str) -> Option<PageColor> {
    color_line(preamble).map(|(_, c)| c)
}

/// `preamble` with `color::` set. With `Some(c)` the first `color::` line (any
/// value) after the front matter becomes `color:: c`; without one, the line is
/// added after the first valid `title::` line, else as the first line after the
/// front matter. With `None` every `color::` line after the front matter is
/// removed. Front matter is never changed. The caller passes the canonical text
/// of a [`PageColor`].
pub fn recolor(preamble: &str, color: Option<&str>, le: LineEnding) -> String {
    let (front, body) = preamble.split_at(front_matter_len(preamble).unwrap_or(0));
    let mut lines: Vec<String> = body.split_inclusive('\n').map(str::to_string).collect();
    let Some(c) = color else {
        lines.retain(|l| is_color_property(l).is_none());
        return format!("{front}{}", lines.concat());
    };
    if let Some(i) = lines.iter().position(|l| is_color_property(l).is_some()) {
        let end = if lines[i].ends_with("\r\n") {
            "\r\n"
        } else if lines[i].ends_with('\n') {
            "\n"
        } else {
            ""
        };
        lines[i] = format!("color:: {c}{end}");
        return format!("{front}{}", lines.concat());
    }
    let new = format!("color:: {c}{}", le.as_str());
    // `title_line` indexes `body` by line, as `split_inclusive` does.
    match title_line(body) {
        Some((i, _)) => {
            if !lines[i].ends_with('\n') {
                lines[i].push_str(le.as_str());
            }
            lines.insert(i + 1, new);
            format!("{front}{}", lines.concat())
        }
        None => {
            // A closing front-matter line without terminator needs one first.
            let sep = if front.is_empty() || front.ends_with('\n') {
                ""
            } else {
                le.as_str()
            };
            format!("{front}{sep}{new}{}", lines.concat())
        }
    }
}
