//! Page names: map keys, validity, and Windows-safe file stems.

use chrono::NaiveDate;

const FORBIDDEN: [char; 9] = ['\\', '/', ':', '*', '?', '"', '<', '>', '|'];

const RESERVED: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

const JOURNAL_FORMAT: &str = "%Y-%m-%d";

/// Lower-cased page name, used as the map key everywhere.
pub fn page_key(name: &str) -> String {
    name.to_lowercase()
}

/// A page name must not be blank, start or end with whitespace, contain
/// control characters (U+0000–U+001F, U+007F), or contain `[[` / `]]`.
pub fn is_valid_page_name(name: &str) -> bool {
    !name.is_empty()
        && name.trim() == name
        && !name
            .chars()
            .any(|c| matches!(c, '\u{0}'..='\u{1f}' | '\u{7f}'))
        && !name.contains("[[")
        && !name.contains("]]")
}

/// A name other pages can link to: valid, and without `[` or `]`, which would
/// break the `[[…]]` syntax that holds it, or `|`, which starts the shown text.
pub fn is_linkable_name(name: &str) -> bool {
    is_valid_page_name(name) && !name.contains(['[', ']', '|'])
}

/// File stem (without extension) that is safe on Windows for the given page name.
pub fn file_stem_for(name: &str) -> String {
    let mut chars: Vec<char> = name
        .chars()
        .map(|c| if FORBIDDEN.contains(&c) { '_' } else { c })
        .collect();

    for c in chars.iter_mut().rev() {
        if *c == '.' || *c == ' ' {
            *c = '_';
        } else {
            break;
        }
    }

    if chars.first() == Some(&'.') {
        chars[0] = '_';
    }

    let mut stem: String = chars.into_iter().collect();
    let head_len = stem.find('.').unwrap_or(stem.len());
    if RESERVED.contains(&stem[..head_len].to_uppercase().as_str()) {
        stem.insert(head_len, '_');
    }
    stem
}

/// Journal page name (`YYYY-MM-DD`) for a date.
pub fn journal_name(date: NaiveDate) -> String {
    date.format(JOURNAL_FORMAT).to_string()
}

/// Parses a journal page name; only the canonical `YYYY-MM-DD` form of a
/// real date matches, the one [`journal_name`] gives.
pub fn parse_journal_name(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s, JOURNAL_FORMAT)
        .ok()
        .filter(|&d| journal_name(d) == s)
}

/// Long English form of a journal date, e.g. `Thursday, 29 Oct 2026`.
pub fn journal_display(date: NaiveDate) -> String {
    day_long(date)
}

/// `29 Oct`.
pub fn day_short(d: NaiveDate) -> String {
    d.format("%-d %b").to_string()
}

/// `29 Oct 2026`.
pub fn day_with_year(d: NaiveDate) -> String {
    d.format("%-d %b %Y").to_string()
}

/// `Thursday, 29 Oct 2026`.
pub fn day_long(d: NaiveDate) -> String {
    d.format("%A, %-d %b %Y").to_string()
}

/// The month's English name, e.g. `October`.
pub fn month_name(d: NaiveDate) -> String {
    d.format("%B").to_string()
}

/// How `created::` and `archived::` lines write a date and time.
pub(crate) const STAMP_FORMAT: &str = "%Y-%m-%d %H:%M:%S";

/// A folder path under `pages/`: components joined with `/`, each a valid page
/// name that is also a valid file name as typed (folders have no `title::`).
pub fn is_valid_folder_path(path: &str) -> bool {
    path.split('/')
        .all(|c| is_valid_page_name(c) && file_stem_for(c) == c && c != "." && c != "..")
}
