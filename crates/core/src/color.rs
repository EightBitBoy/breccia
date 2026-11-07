//! The `color::` line of a page's preamble: reading it, writing it, and the
//! 25 colors a page can have.

use crate::inline::{property, title_line};
use crate::outline::{LineEnding, front_matter_len};

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

/// Whether `line` (no terminator needed) is a property line with key `color`.
fn is_color_property(line: &str) -> Option<String> {
    let (k, v) = property(line.trim_end_matches(['\r', '\n']))?;
    k.eq_ignore_ascii_case("color").then_some(v)
}

/// The first property line of `preamble` after the front matter whose key is
/// `color` (ASCII case-insensitive) and whose value is a page color: its index
/// among `preamble.split('\n')` and the canonical color name.
pub fn color_line(preamble: &str) -> Option<(usize, &'static str)> {
    let skip = front_matter_len(preamble).map_or(0, |n| preamble[..n].matches('\n').count());
    preamble
        .split('\n')
        .enumerate()
        .skip(skip)
        .find_map(|(i, l)| {
            let v = is_color_property(l)?;
            canonical_color(&v).map(|c| (i, c))
        })
}

/// The color the page's preamble gives it.
pub fn page_color(preamble: &str) -> Option<&'static str> {
    color_line(preamble).map(|(_, c)| c)
}

/// `preamble` with `color::` set. With `Some(c)` the first `color::` line (any
/// value) after the front matter becomes `color:: c`; without one, the line is
/// added after the first valid `title::` line, else as the first line after the
/// front matter. With `None` every `color::` line after the front matter is
/// removed. Front matter is never changed. The caller passes canonical names.
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
