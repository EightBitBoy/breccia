//! Out-of-range numbers in a `toml_edit` document: found and replaced by their defaults, in memory only.

use toml_edit::{DocumentMut, Item, Value};

use super::model::{BoardSettings, GitSettings, Replaced};
use super::toml_keep::set_keeping_decor;

/// The bounded keys: section, key, label, range, default.
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
        (
            "git",
            "commit_delay_minutes",
            "[git] commit_delay_minutes",
            GitSettings::MINUTES,
            git.commit_delay_minutes,
        ),
        (
            "git",
            "pull_interval_minutes",
            "[git] pull_interval_minutes",
            GitSettings::MINUTES,
            git.pull_interval_minutes,
        ),
        (
            "board",
            "archive_after_days",
            "[board] archive_after_days",
            BoardSettings::DAYS,
            board.archive_after_days,
        ),
    ]
}

/// Replaces each whole number outside its range by the default and records it (file order of the keys).
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
            value,
            range,
            default,
        });
    }
    records
}
