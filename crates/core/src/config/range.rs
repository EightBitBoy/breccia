//! Out-of-range numbers and bad reset times in a `toml_edit` document: found and replaced by their
//! defaults, in memory only.

use toml_edit::{DocumentMut, Item, Value};

use super::model::{BoardSettings, DailiesSettings, GitSettings, Replaced, valid_reset};
use super::toml_keep::set_keeping_decor;

/// One row of the table of bounded keys: the section and key as written in the file, the label
/// the notice shows (`[section] key`, built from the two), the allowed range and the default.
macro_rules! bounded_key {
    ($section:literal, $key:literal, $range:expr, $default:expr) => {
        (
            $section,
            $key,
            concat!("[", $section, "] ", $key),
            $range,
            $default,
        )
    };
}

/// The bounded keys, in the order the notices list them: section, key, label, range, default.
fn bounded() -> [(
    &'static str,
    &'static str,
    &'static str,
    std::ops::RangeInclusive<u32>,
    u32,
); 3] {
    let git = GitSettings::default();
    let board = BoardSettings::default();
    [
        bounded_key!(
            "git",
            "commit_delay_minutes",
            GitSettings::MINUTES,
            git.commit_delay_minutes
        ),
        bounded_key!(
            "git",
            "pull_interval_minutes",
            GitSettings::MINUTES,
            git.pull_interval_minutes
        ),
        bounded_key!(
            "board",
            "archive_after_days",
            BoardSettings::DAYS,
            board.archive_after_days
        ),
    ]
}

/// A string key with a rule: section, key, label and the rule as the notice says it, the check, the default.
struct CheckedString {
    section: &'static str,
    key: &'static str,
    label: &'static str,
    rule: &'static str,
    valid: fn(&str) -> bool,
    default: String,
}

/// The string keys with a rule (one row today).
fn checked_strings() -> [CheckedString; 1] {
    [CheckedString {
        section: "dailies",
        key: "reset",
        label: "[dailies] reset",
        rule: "is not a time from 00:00 to 23:59",
        valid: valid_reset,
        default: DailiesSettings::default().reset,
    }]
}

/// Replaces each whole number outside its range by the default and records it, in the order of the
/// table `bounded` returns.
pub(super) fn replace_out_of_range(doc: &mut DocumentMut) -> Vec<Replaced> {
    let mut records = Vec::new();
    for (section, key, label, range, default) in bounded() {
        let Some(table) = doc.get_mut(section).and_then(Item::as_table_like_mut) else {
            continue;
        };
        let Some(Value::Integer(n)) = table.get(key).and_then(Item::as_value) else {
            continue;
        };
        let value = *n.value();
        if u32::try_from(value).is_ok_and(|v| range.contains(&v)) {
            continue;
        }
        set_keeping_decor(table, key, Value::from(i64::from(default)));
        records.push(Replaced {
            key: label,
            value: value.to_string(),
            rule: format!("is outside {} to {}", range.start(), range.end()),
            default: default.to_string(),
        });
    }
    for c in checked_strings() {
        let Some(table) = doc.get_mut(c.section).and_then(Item::as_table_like_mut) else {
            continue;
        };
        let Some(Value::String(s)) = table.get(c.key).and_then(Item::as_value) else {
            continue;
        };
        let value = s.value().clone();
        if (c.valid)(&value) {
            continue;
        }
        set_keeping_decor(table, c.key, Value::from(c.default.as_str()));
        records.push(Replaced {
            key: c.label,
            value: format!("\"{value}\""),
            rule: c.rule.to_string(),
            default: c.default,
        });
    }
    records
}
