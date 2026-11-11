//! Reading and writing `<root>/breccia/config.toml`: the file access and the adapters that put
//! states and boards into the user's TOML.

use std::path::Path;

use toml_edit::{
    Array, ArrayOfTables, DocumentMut, InlineTable, Item, Table, TableLike, TomlError, Value,
};

use super::model::DEFAULT_TOML;
use super::toml_keep::{
    AppendKey, Entry, carry_removed_comments, is_multi_line, keeps_a_comment, put,
    put_comments_after, rebuild_array, rebuild_tables, set_columns, set_keeping_decor,
    write_section,
};
use super::{Board, BoardSettings, Config, ConfigError, GitSettings, Replaced, State};
use crate::layout;

/// What a config writer expects `config.toml` to hold before it writes.
#[derive(Debug, Clone, Copy)]
pub enum Expect<'a> {
    /// Write over whatever the file holds.
    Any,
    /// Write only if the file still holds this text (`None`: no file), else
    /// [`ConfigError::Changed`]: a hand save since it was read is never lost (§2).
    Text(Option<&'a str>),
}

fn columns_value(b: &Board) -> Value {
    Value::Array(b.columns.iter().collect())
}

fn board_table(b: &Board) -> Table {
    let mut t = Table::new();
    t["name"] = toml_edit::value(b.name.trim());
    t["columns"] = Item::Value(columns_value(b));
    t
}

fn board_inline(b: &Board) -> InlineTable {
    let mut t = InlineTable::new();
    t.insert("name", Value::from(b.name.trim()));
    t.insert("columns", columns_value(b));
    t
}

/// Pairs each new board with the old board it continues, by index into `old`:
/// the old board with the same name (ignoring case), or, when the number of
/// boards is unchanged, the old board at the same place (a rename). Each old
/// board is used at most once.
pub(super) fn match_boards(old: &[String], new: &[Board]) -> Vec<Option<usize>> {
    let key = |s: &str| s.trim().to_lowercase();
    let mut used = vec![false; old.len()];
    let mut out: Vec<Option<usize>> = new
        .iter()
        .map(|b| {
            let j = old
                .iter()
                .enumerate()
                .position(|(j, o)| !used[j] && key(o) == key(&b.name))?;
            used[j] = true;
            Some(j)
        })
        .collect();
    if old.len() == new.len() {
        for (i, m) in out.iter_mut().enumerate() {
            if m.is_none() && !used[i] {
                used[i] = true;
                *m = Some(i);
            }
        }
    }
    out
}

/// The board stored in a `[[boards]]` table or an inline table.
fn board_in(t: &dyn TableLike) -> (String, Vec<String>) {
    let name = t
        .get("name")
        .and_then(Item::as_str)
        .unwrap_or_default()
        .to_string();
    let columns = t
        .get("columns")
        .and_then(Item::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    (name, columns)
}

/// Writes `b` into the table of the board it continues, touching only the values
/// that changed, so an untouched board keeps its text byte for byte.
fn update_board(t: &mut dyn TableLike, b: &Board) {
    let (name, columns) = board_in(t);
    if name != b.name.trim() {
        set_keeping_decor(t, "name", Value::from(b.name.trim()));
    }
    if columns != b.columns || t.get("columns").and_then(Item::as_array).is_none() {
        match t.get_mut("columns").and_then(Item::as_array_mut) {
            Some(array) if is_multi_line(array) => set_columns(array, &b.columns),
            _ => set_keeping_decor(t, "columns", columns_value(b)),
        }
    }
}

/// Updates a `[[boards]]` array of tables to `boards`, keeping each kept board's
/// table (and so its comments and unknown keys) and the place it had in the file.
fn write_board_tables(tables: &mut ArrayOfTables, boards: &[Board]) {
    let names: Vec<String> = tables.iter().map(|t| board_in(t).0).collect();
    let matched = match_boards(&names, boards);
    rebuild_tables(
        tables,
        &matched,
        |t, i| update_board(t, &boards[i]),
        |i| board_table(&boards[i]),
    );
}

/// The same for an inline `boards = [{ … }, …]` array, kept inline.
fn write_board_inline(array: &mut Array, boards: &[Board]) {
    let old: Vec<Value> = array.iter().cloned().collect();
    let names: Vec<String> = old
        .iter()
        .map(|v| {
            v.as_inline_table()
                .map(|t| board_in(t).0)
                .unwrap_or_default()
        })
        .collect();
    let matched = match_boards(&names, boards);
    array.clear();
    for (b, m) in boards.iter().zip(matched) {
        match m.map(|j| old[j].clone()) {
            Some(Value::InlineTable(mut t)) => {
                update_board(&mut t, b);
                array.push_formatted(Value::InlineTable(t));
            }
            _ => array.push(board_inline(b)),
        }
    }
}

/// Reads `<root>/breccia/config.toml` (the default text when missing), applies
/// `change` to the parsed document and writes it back atomically with LF endings
/// (spec §4), unless `expect` names text the file no longer holds. Returns the
/// text written.
fn edit_file(
    root: &Path,
    expect: Expect<'_>,
    change: impl FnOnce(&mut DocumentMut) -> Result<(), ConfigError>,
) -> Result<String, ConfigError> {
    let path = layout::config_path(root);
    let found = match std::fs::read_to_string(&path) {
        Ok(text) => Some(text),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(e.into()),
    };
    if let Expect::Text(expected) = expect
        && found.as_deref() != expected
    {
        return Err(ConfigError::Changed);
    }
    let text = found.unwrap_or_else(|| DEFAULT_TOML.to_string());
    let mut doc: DocumentMut = text
        .parse()
        .map_err(|e: TomlError| ConfigError::Toml(e.to_string()))?;
    change(&mut doc)?;
    let out = doc.to_string().replace("\r\n", "\n");
    crate::fsio::write_atomic(&path, &out)?;
    Ok(out)
}

fn keyword_in(t: &dyn TableLike) -> String {
    t.get("keyword")
        .and_then(Item::as_str)
        .unwrap_or_default()
        .to_string()
}

/// Writes `s` into the table of the state it continues, touching only the values
/// that changed. A key the table lacked is added only when it is not the default.
fn update_state<T: AppendKey>(t: &mut T, s: &State) {
    put(t, "keyword", Value::from(s.keyword.as_str()), None);
    put(
        t,
        "color",
        Value::from(s.color.as_str()),
        Some(&Value::from("grey")),
    );
    put(
        t,
        "finished",
        Value::from(s.finished),
        Some(&Value::from(false)),
    );
    put(
        t,
        "in_cycle",
        Value::from(s.in_cycle),
        Some(&Value::from(false)),
    );
}

fn state_table(s: &State) -> Table {
    let mut t = Table::new();
    t["keyword"] = toml_edit::value(s.keyword.as_str());
    t["color"] = toml_edit::value(s.color.as_str());
    t["finished"] = toml_edit::value(s.finished);
    t["in_cycle"] = toml_edit::value(s.in_cycle);
    t
}

fn state_inline(s: &State) -> InlineTable {
    let mut t = InlineTable::new();
    t.insert("keyword", Value::from(s.keyword.as_str()));
    t.insert("color", Value::from(s.color.as_str()));
    t.insert("finished", Value::from(s.finished));
    t.insert("in_cycle", Value::from(s.in_cycle));
    t
}

/// Pairs each new state with the old one it continues (an index into `old`): the
/// old state a rename says it came from, else the old state with its keyword. Each
/// old state is used at most once.
fn match_states(old: &[String], new: &[State], renames: &[(String, String)]) -> Vec<Option<usize>> {
    let mut used = vec![false; old.len()];
    new.iter()
        .map(|s| {
            let from = renames
                .iter()
                .filter(|(_, to)| *to == s.keyword)
                .map(|(from, _)| from.as_str());
            for kw in from.chain(std::iter::once(s.keyword.as_str())) {
                if let Some(j) = (0..old.len()).find(|&j| !used[j] && old[j] == kw) {
                    used[j] = true;
                    return Some(j);
                }
            }
            None
        })
        .collect()
}

/// The same for an inline `states = [{ … }, …]` array, kept inline.
fn write_state_inline(array: &mut Array, states: &[State], renames: &[(String, String)]) {
    let names: Vec<String> = array
        .iter()
        .map(|v| {
            v.as_inline_table()
                .map(|t| keyword_in(t))
                .unwrap_or_default()
        })
        .collect();
    let matched = match_states(&names, states, renames);
    rebuild_array(array, &matched, |j, old| match old {
        Some(Value::InlineTable(mut t)) => {
            update_state(&mut t, &states[j]);
            Value::InlineTable(t)
        }
        Some(other) => other,
        None => Value::InlineTable(state_inline(&states[j])),
    });
}

/// Every board column equal to a renamed state's old keyword becomes the new one;
/// each array element keeps its decor. Nothing else in the boards changes.
fn rename_board_columns(doc: &mut DocumentMut, renames: &[(String, String)]) {
    if renames.is_empty() {
        return;
    }
    let rename = |t: &mut dyn TableLike| {
        let Some(Item::Value(Value::Array(columns))) = t.get_mut("columns") else {
            return;
        };
        let mut touched = false;
        for i in 0..columns.len() {
            let new = columns
                .get(i)
                .and_then(Value::as_str)
                .and_then(|c| renames.iter().find(|(from, _)| from == c))
                .map(|(_, to)| to.clone());
            if let Some(to) = new {
                columns.replace(i, to);
                touched = true;
            }
        }
        // A rename onto a column the board already has merges the two: a board
        // never lists a column twice (it would refuse every later change). A board
        // this call did not rename in is left as written.
        if !touched {
            return;
        }
        let names: Vec<Option<String>> = columns
            .iter()
            .map(|v| v.as_str().map(String::from))
            .collect();
        let repeated = |j: usize| names[j].is_some() && names[..j].contains(&names[j]);
        if (0..names.len()).any(repeated) {
            let matched: Vec<Option<usize>> = (0..names.len())
                .filter(|&j| !repeated(j))
                .map(Some)
                .collect();
            rebuild_array(columns, &matched, |_, kept| {
                kept.unwrap_or_else(|| Value::from(""))
            });
        }
    };
    match doc.get_mut("boards") {
        Some(Item::ArrayOfTables(tables)) => tables.iter_mut().for_each(|t| rename(t)),
        Some(Item::Value(Value::Array(array))) => {
            for v in array.iter_mut() {
                if let Value::InlineTable(t) = v {
                    rename(t);
                }
            }
        }
        _ => {}
    }
}

impl Config {
    /// Reads `<root>/breccia/config.toml`; a missing file gives the defaults.
    pub fn load(root: &Path) -> Result<Config, ConfigError> {
        Ok(Config::load_with_text(root)?.0)
    }

    /// Like [`load`](Config::load), also returning the text it was read from
    /// (`None`: the file is missing).
    /// Also returns the numbers read as their defaults (nothing is written).
    pub fn load_with_text(
        root: &Path,
    ) -> Result<(Config, Option<String>, Vec<Replaced>), ConfigError> {
        let text = Config::read_text(root)?;
        let (config, replaced) = match &text {
            Some(text) => Config::parse_reporting(text)?,
            None => (Config::default(), Vec::new()),
        };
        Ok((config, text, replaced))
    }

    /// The text of `<root>/breccia/config.toml`; `None` when it is missing.
    pub fn read_text(root: &Path) -> Result<Option<String>, ConfigError> {
        match std::fs::read_to_string(layout::config_path(root)) {
            Ok(text) => Ok(Some(text)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Sets the `boards` of `<root>/breccia/config.toml` (the default text if the
    /// file is missing) and writes it atomically. Existing `[[boards]]` tables are
    /// updated in place, so their comments and unknown keys stay, as does everything
    /// else in the file. No boards are written as `boards = []`, so they stay zero.
    /// Returns the text written.
    pub fn write_boards(
        root: &Path,
        expect: Expect<'_>,
        boards: &[Board],
    ) -> Result<String, ConfigError> {
        edit_file(root, expect, |doc| {
            match doc.get_mut("boards") {
                Some(Item::ArrayOfTables(tables)) if !boards.is_empty() => {
                    write_board_tables(tables, boards);
                }
                Some(Item::Value(Value::Array(array)))
                    if !array.is_empty() && array.iter().all(Value::is_inline_table) =>
                {
                    write_board_inline(array, boards);
                }
                // An empty array stays as it is, with its comments.
                Some(Item::Value(Value::Array(array))) if array.is_empty() && boards.is_empty() => {
                }
                _ if boards.is_empty() => doc["boards"] = toml_edit::value(Array::new()),
                _ => {
                    if keeps_a_comment(doc, "boards") {
                        // `boards = []` with a comment around it stays inline,
                        // so the comment (the key's or value's decor) is kept.
                        return match doc.get_mut("boards") {
                            Some(Item::Value(Value::Array(array))) => {
                                write_board_inline(array, boards);
                                Ok(())
                            }
                            _ => Err(ConfigError::Toml(
                                "`boards` is not a list of boards".to_string(),
                            )),
                        };
                    }
                    let mut tables = ArrayOfTables::new();
                    for b in boards {
                        tables.push(board_table(b));
                    }
                    // Removed first, so `boards = []`'s key spacing does not end
                    // up inside the new `[[boards]]` headers.
                    doc.remove("boards");
                    doc.insert("boards", Item::ArrayOfTables(tables));
                }
            }
            Ok(())
        })
    }

    /// Sets the `states` of `<root>/breccia/config.toml`, touching only what changed:
    /// a state continues the table of the old state with its keyword (or the one
    /// `renames`, `(from, to)` pairs, says it was renamed from) and keeps that
    /// table's comments, unknown keys and formatting. New states get a new table,
    /// removed ones lose theirs (the comment lines above a removed table move to
    /// the next table). A rename also renames the keyword in every board's
    /// columns. Returns the text written.
    pub fn write_states(
        root: &Path,
        expect: Expect<'_>,
        states: &[State],
        renames: &[(String, String)],
    ) -> Result<String, ConfigError> {
        if states.is_empty() {
            return Err(ConfigError::NoStates);
        }
        edit_file(root, expect, |doc| {
            match doc.get_mut("states") {
                Some(Item::ArrayOfTables(tables)) => {
                    let names: Vec<String> = tables.iter().map(|t| keyword_in(t)).collect();
                    let matched = match_states(&names, states, renames);
                    let old = rebuild_tables(
                        tables,
                        &matched,
                        |t, i| update_state(t, &states[i]),
                        |i| state_table(&states[i]),
                    );
                    let tail = carry_removed_comments(tables, &old, &matched);
                    let last = old.iter().filter_map(Table::position).max();
                    if !tail.is_empty() {
                        put_comments_after(doc, last, &tail);
                    }
                }
                Some(Item::Value(Value::Array(array)))
                    if array.iter().all(Value::is_inline_table) =>
                {
                    write_state_inline(array, states, renames);
                }
                Some(_) => {
                    return Err(ConfigError::Toml(
                        "`states` is not a list of tables".to_string(),
                    ));
                }
                None => {
                    let mut tables = ArrayOfTables::new();
                    for s in states {
                        tables.push(state_table(s));
                    }
                    doc.insert("states", Item::ArrayOfTables(tables));
                }
            }
            rename_board_columns(doc, renames);
            Ok(())
        })
    }

    /// Sets the `[git]` settings, writing only the values that differ from the file
    /// (a key the file lacks counts as its default).
    pub fn write_git(
        root: &Path,
        expect: Expect<'_>,
        git: &GitSettings,
    ) -> Result<String, ConfigError> {
        let d = GitSettings::default();
        let entries = [
            Entry::new("enabled", git.enabled, d.enabled),
            Entry::new(
                "commit_delay_minutes",
                i64::from(git.commit_delay_minutes),
                i64::from(d.commit_delay_minutes),
            ),
            Entry::new(
                "pull_interval_minutes",
                i64::from(git.pull_interval_minutes),
                i64::from(d.pull_interval_minutes),
            ),
        ];
        edit_file(root, expect, |doc| write_section(doc, "git", &entries))
    }

    /// Sets the `[board]` settings, as [`write_git`](Config::write_git) does for `[git]`.
    pub fn write_board_settings(
        root: &Path,
        expect: Expect<'_>,
        board: &BoardSettings,
    ) -> Result<String, ConfigError> {
        let d = BoardSettings::default();
        let entries = [
            Entry::new(
                "archive_after_days",
                i64::from(board.archive_after_days),
                i64::from(d.archive_after_days),
            ),
            Entry::new("auto_archive", board.auto_archive, d.auto_archive),
        ];
        edit_file(root, expect, |doc| write_section(doc, "board", &entries))
    }
}
