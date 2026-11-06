//! Dates typed into the search box (spec §7.4, §7.8).

use chrono::{Datelike, Days, NaiveDate};

const MONTHS: [&str; 12] = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
];

/// The date the whole trimmed `text` names, if it is exactly one date:
/// `2026-03-12`, `12 Mar`, `Mar 12 2025`, `12.3.`, `12.3.2026`, `today`,
/// `yesterday`, `tomorrow`. A form without a year means the most recent such
/// day that is not after `today`. Anything else is `None`.
pub fn parse_typed_date(text: &str, today: NaiveDate) -> Option<NaiveDate> {
    let text = text.trim();
    match text.to_ascii_lowercase().as_str() {
        "today" => return Some(today),
        "yesterday" => return today.checked_sub_days(Days::new(1)),
        "tomorrow" => return today.checked_add_days(Days::new(1)),
        _ => {}
    }
    let words: Vec<&str> = text.split_whitespace().collect();
    if words.len() == 1 {
        return iso(text).or_else(|| dotted(text, today));
    }
    let (day, month, year) = match words.as_slice() {
        [a, b] | [a, b, _] if number(a, 2).is_some() => (number(a, 2)?, month(b)?, words.get(2)),
        [a, b] | [a, b, _] if month(a).is_some() => (number(b, 2)?, month(a)?, words.get(2)),
        _ => return None,
    };
    let year = match year {
        Some(y) => Some(number(y, 4).filter(|_| y.len() == 4)? as i32),
        None => None,
    };
    resolve(day, month, year, today)
}

/// `YYYY-MM-DD`, month and day with one or two digits.
fn iso(text: &str) -> Option<NaiveDate> {
    let parts: Vec<&str> = text.split('-').collect();
    let [y, m, d] = parts.as_slice() else {
        return None;
    };
    if y.len() != 4 {
        return None;
    }
    NaiveDate::from_ymd_opt(number(y, 4)? as i32, number(m, 2)?, number(d, 2)?)
}

/// `12.3.` and `12.3.2026`.
fn dotted(text: &str, today: NaiveDate) -> Option<NaiveDate> {
    let parts: Vec<&str> = text.split('.').collect();
    match parts.as_slice() {
        [d, m, ""] => resolve(number(d, 2)?, number(m, 2)?, None, today),
        [d, m, y] if y.len() == 4 => resolve(
            number(d, 2)?,
            number(m, 2)?,
            Some(number(y, 4)? as i32),
            today,
        ),
        _ => None,
    }
}

/// All ASCII digits, one to `max` of them.
fn number(s: &str, max: usize) -> Option<u32> {
    if s.is_empty() || s.len() > max || !s.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    s.parse().ok()
}

/// A month from its English name, full or the first three letters, or `sept`.
fn month(s: &str) -> Option<u32> {
    let s = s.to_ascii_lowercase();
    let at = MONTHS.iter().position(|m| {
        *m == s || (s.len() == 3 && m.starts_with(&s)) || (s == "sept" && *m == "september")
    })?;
    Some(at as u32 + 1)
}

/// With a year, that day; without, the latest such day not after `today`
/// (looking back far enough for 29 Feb).
fn resolve(day: u32, month: u32, year: Option<i32>, today: NaiveDate) -> Option<NaiveDate> {
    if let Some(y) = year {
        return NaiveDate::from_ymd_opt(y, month, day);
    }
    (0..=8)
        .filter_map(|back| NaiveDate::from_ymd_opt(today.year() - back, month, day))
        .find(|d| *d <= today)
}
