//! Task states, boards and Git settings from `<root>/breccia/config.toml`.

use std::path::Path;

use serde::Deserialize;
use toml_edit::{
    Array, ArrayOfTables, Decor, DocumentMut, InlineTable, Item, RawString, Table, TableLike, Value,
};

/// The colour names a state may use (the frontend maps each to a theme token).
pub const PALETTE: [&str; 8] = [
    "grey", "amber", "violet", "green", "dim", "blue", "red", "teal",
];

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct State {
    pub keyword: String,
    /// Palette name: one of `grey amber violet green dim blue red teal`.
    #[serde(default = "default_color")]
    pub color: String,
    #[serde(default)]
    pub finished: bool,
    #[serde(default)]
    pub in_cycle: bool,
}

fn default_color() -> String {
    "grey".to_string()
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct Board {
    pub name: String,
    /// State keywords; not validated here.
    #[serde(default)]
    pub columns: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(default)]
pub struct BoardSettings {
    pub archive_after_days: u32,
    /// Finished tasks done more than `archive_after_days` ago are archived by
    /// themselves.
    pub auto_archive: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(default)]
pub struct GitSettings {
    pub enabled: bool,
    pub commit_delay_minutes: u32,
    pub pull_interval_minutes: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(default)]
pub struct Config {
    pub states: Vec<State>,
    pub boards: Vec<Board>,
    pub board: BoardSettings,
    pub git: GitSettings,
}

/// What a config writer expects `config.toml` to hold before it writes.
#[derive(Debug, Clone, Copy)]
pub enum Expect<'a> {
    /// Write over whatever the file holds.
    Any,
    /// Write only if the file still holds this text (`None`: no file), else
    /// [`ConfigError::Changed`]: a hand save since it was read is never lost (§2).
    Text(Option<&'a str>),
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("config.toml changed on disk since it was read")]
    Changed,
    #[error("cannot read config: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid config: {0}")]
    Toml(String),
    #[error("invalid state keyword: {0:?}")]
    InvalidKeyword(String),
    #[error("duplicate state: {0}")]
    DuplicateState(String),
    #[error("config defines no states")]
    NoStates,
    #[error("invalid board: {0}")]
    InvalidBoard(String),
    #[error("invalid state: {0}")]
    InvalidState(String),
}

impl Default for BoardSettings {
    fn default() -> Self {
        BoardSettings {
            archive_after_days: 14,
            auto_archive: true,
        }
    }
}

impl Default for GitSettings {
    fn default() -> Self {
        GitSettings {
            enabled: true,
            commit_delay_minutes: 5,
            pull_interval_minutes: 5,
        }
    }
}

fn state(keyword: &str, color: &str, finished: bool, in_cycle: bool) -> State {
    State {
        keyword: keyword.into(),
        color: color.into(),
        finished,
        in_cycle,
    }
}

impl Default for Config {
    fn default() -> Self {
        Config {
            states: vec![
                state("TODO", "grey", false, true),
                state("DOING", "amber", false, true),
                state("WAITING", "violet", false, false),
                state("DONE", "green", true, true),
            ],
            boards: vec![Board {
                name: "Tasks".into(),
                columns: ["TODO", "DOING", "WAITING", "DONE"]
                    .map(String::from)
                    .to_vec(),
            }],
            board: BoardSettings::default(),
            git: GitSettings::default(),
        }
    }
}

const DEFAULT_TOML: &str = r#"[[states]]
keyword = "TODO"
color = "grey"
finished = false
in_cycle = true

[[states]]
keyword = "DOING"
color = "amber"
finished = false
in_cycle = true

[[states]]
keyword = "WAITING"
color = "violet"
finished = false
in_cycle = false

[[states]]
keyword = "DONE"
color = "green"
finished = true
in_cycle = true

[[boards]]
name = "Tasks"
columns = ["TODO", "DOING", "WAITING", "DONE"]

[board]
archive_after_days = 14
auto_archive = true

[git]
enabled = true
commit_delay_minutes = 5
pull_interval_minutes = 5
"#;

fn columns_value(b: &Board) -> toml_edit::Value {
    toml_edit::Value::Array(b.columns.iter().collect())
}

fn board_table(b: &Board) -> toml_edit::Table {
    let mut t = toml_edit::Table::new();
    t["name"] = toml_edit::value(b.name.trim());
    t["columns"] = toml_edit::Item::Value(columns_value(b));
    t
}

fn board_inline(b: &Board) -> toml_edit::InlineTable {
    let mut t = toml_edit::InlineTable::new();
    t.insert("name", toml_edit::Value::from(b.name.trim()));
    t.insert("columns", columns_value(b));
    t
}

/// Pairs each new board with the old board it continues, by index into `old`:
/// the old board with the same name (ignoring case), or, when the number of
/// boards is unchanged, the old board at the same place (a rename). Each old
/// board is used at most once.
fn match_boards(old: &[String], new: &[Board]) -> Vec<Option<usize>> {
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
fn board_in(t: &dyn toml_edit::TableLike) -> (String, Vec<String>) {
    let name = t
        .get("name")
        .and_then(toml_edit::Item::as_str)
        .unwrap_or_default()
        .to_string();
    let columns = t
        .get("columns")
        .and_then(toml_edit::Item::as_array)
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
fn update_board(t: &mut dyn toml_edit::TableLike, b: &Board) {
    let (name, columns) = board_in(t);
    if name != b.name.trim() {
        set_keeping_decor(t, "name", toml_edit::Value::from(b.name.trim()));
    }
    if columns != b.columns
        || t.get("columns")
            .and_then(toml_edit::Item::as_array)
            .is_none()
    {
        match t.get_mut("columns").and_then(toml_edit::Item::as_array_mut) {
            Some(array) if is_multi_line(array) => set_columns(array, &b.columns),
            _ => set_keeping_decor(t, "columns", columns_value(b)),
        }
    }
}

/// Whether `array` spans lines (so it can hold comments).
fn is_multi_line(array: &Array) -> bool {
    let has_newline = |r: Option<&RawString>| {
        r.and_then(RawString::as_str)
            .is_some_and(|s| s.contains('\n'))
    };
    has_newline(Some(array.trailing())) || array.iter().any(|v| has_newline(v.decor().prefix()))
}

/// Sets a board's columns in place: each kept column keeps its comments (§2).
fn set_columns(array: &mut Array, columns: &[String]) {
    let old: Vec<String> = array
        .iter()
        .map(|v| v.as_str().unwrap_or_default().to_string())
        .collect();
    let mut used = vec![false; old.len()];
    let matched: Vec<Option<usize>> = columns
        .iter()
        .map(|c| {
            let j = (0..old.len()).find(|&j| !used[j] && old[j] == *c)?;
            used[j] = true;
            Some(j)
        })
        .collect();
    rebuild_array(array, &matched, |j, kept| {
        kept.unwrap_or_else(|| Value::from(columns[j].as_str()))
    });
}

/// Sets `key`, keeping the comments and spacing around its old value.
fn set_keeping_decor(t: &mut dyn toml_edit::TableLike, key: &str, mut value: toml_edit::Value) {
    if let Some(old) = t.get(key).and_then(toml_edit::Item::as_value) {
        *value.decor_mut() = old.decor().clone();
    }
    t.insert(key, toml_edit::Item::Value(value));
}

/// Rebuilds `tables` from `matched`: entry `i` is the old table that new item `i`
/// continues (updated by `update`, keeping its decor, unknown keys and place in the
/// file), or `None` for a table made by `create`. Returns the old tables.
fn rebuild_tables(
    tables: &mut ArrayOfTables,
    matched: &[Option<usize>],
    mut update: impl FnMut(&mut Table, usize),
    mut create: impl FnMut(usize) -> Table,
) -> Vec<Table> {
    let old: Vec<Table> = tables.iter().cloned().collect();
    // Tables are printed in file-position order; when they were reordered,
    // hand the kept positions out again in the new order.
    let mut positions: Vec<isize> = matched
        .iter()
        .filter_map(|m| m.and_then(|j| old[j].position()))
        .collect();
    let in_order = positions.windows(2).all(|w| w[0] < w[1]);
    positions.sort_unstable();
    let mut positions = positions.into_iter();
    tables.clear();
    for (i, m) in matched.iter().enumerate() {
        let t = match m {
            Some(j) => {
                let mut t = old[*j].clone();
                update(&mut t, i);
                if !in_order && t.position().is_some() {
                    t.set_position(positions.next());
                }
                t
            }
            None => create(i),
        };
        tables.push(t);
    }
    old
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
fn write_board_inline(array: &mut toml_edit::Array, boards: &[Board]) {
    let old: Vec<toml_edit::Value> = array.iter().cloned().collect();
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
            Some(toml_edit::Value::InlineTable(mut t)) => {
                update_board(&mut t, b);
                array.push_formatted(toml_edit::Value::InlineTable(t));
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
    let path = root.join("breccia").join("config.toml");
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
        .map_err(|e: toml_edit::TomlError| ConfigError::Toml(e.to_string()))?;
    change(&mut doc)?;
    let out = doc.to_string().replace("\r\n", "\n");
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    crate::fsio::write_atomic(&path, &out)?;
    Ok(out)
}

fn has_comment(raw: Option<&RawString>) -> bool {
    raw.and_then(RawString::as_str)
        .is_some_and(|s| s.contains('#'))
}

/// True when `key`'s text carries a comment that removing the key would lose: one
/// in the key's decor prefix, in the value's suffix or inside an array's end.
fn keeps_a_comment(doc: &DocumentMut, key: &str) -> bool {
    let Some((k, item)) = doc.as_table().get_key_value(key) else {
        return false;
    };
    let Item::Value(v) = item else { return false };
    has_comment(k.leaf_decor().prefix())
        || has_comment(v.decor().suffix())
        || v.as_array()
            .is_some_and(|a| !a.trailing().as_str().unwrap_or_default().trim().is_empty())
}

/// Values compare by what they hold, not by how they are written.
fn same_value(a: &Value, b: &Value) -> bool {
    a.as_str() == b.as_str() && a.as_bool() == b.as_bool() && a.as_integer() == b.as_integer()
}

/// Appending a key to a table: an inline table needs the old last value's
/// trailing space moved behind the new value (`{ a = 1 , b = 2 }` otherwise).
trait AppendKey: TableLike {
    fn append_key(&mut self, key: &str, value: Value);
}

impl AppendKey for Table {
    fn append_key(&mut self, key: &str, value: Value) {
        self.insert(key, Item::Value(value));
    }
}

impl AppendKey for InlineTable {
    fn append_key(&mut self, key: &str, mut value: Value) {
        let mut suffix = None;
        if let Some((_, last)) = self.iter_mut().last() {
            suffix = last.decor().suffix().cloned();
            last.decor_mut().set_suffix("");
        }
        if !self.is_empty() {
            value.decor_mut().set_prefix(" ");
        }
        if let Some(suffix) = suffix {
            value.decor_mut().set_suffix(suffix);
        }
        self.insert(key, value);
    }
}

/// Sets `key` to `value` only when the file says otherwise: an existing key that
/// differs is set (keeping its decor); a missing key is added unless `value` is
/// `default`. A `default` of `None` always adds a missing key.
fn put<T: AppendKey>(t: &mut T, key: &str, value: Value, default: Option<&Value>) {
    match t.get(key).and_then(Item::as_value) {
        Some(old) => {
            if !same_value(old, &value) {
                set_keeping_decor(t, key, value);
            }
        }
        None => {
            if default.is_none_or(|d| !same_value(d, &value)) {
                t.append_key(key, value);
            }
        }
    }
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

/// The comment lines (not the blank ones) of a decor prefix.
fn comment_lines(raw: Option<&RawString>) -> String {
    comment_lines_str(raw.and_then(RawString::as_str).unwrap_or_default())
}

fn comment_lines_str(text: &str) -> String {
    text.lines()
        .filter(|l| l.trim_start().starts_with('#'))
        .map(|l| format!("{l}\n"))
        .collect()
}

/// Puts `comments` at the start of `decor`'s prefix.
fn prepend_comments(decor: &mut Decor, comments: &str) {
    let old = decor
        .prefix()
        .and_then(RawString::as_str)
        .unwrap_or_default();
    decor.set_prefix(format!("{comments}{old}"));
}

/// The comment lines above a removed state table move to the next kept state
/// table (as it was in the old order). What no kept table follows is returned.
fn carry_removed_comments(
    tables: &mut ArrayOfTables,
    old: &[Table],
    matched: &[Option<usize>],
) -> String {
    let mut tail = String::new();
    for (r, t) in old.iter().enumerate() {
        if matched.contains(&Some(r)) {
            continue;
        }
        let comments = comment_lines(t.decor().prefix());
        if comments.is_empty() {
            continue;
        }
        let next = (r + 1..old.len()).find_map(|k| matched.iter().position(|m| *m == Some(k)));
        match next.and_then(|n| tables.get_mut(n)) {
            Some(n) => prepend_comments(n.decor_mut(), &comments),
            None => tail.push_str(&comments),
        }
    }
    tail
}

/// Puts `comments` above the first table of the document that sits after the
/// position `after`, or at the end of the document when there is none.
fn put_comments_after(doc: &mut DocumentMut, after: Option<isize>, comments: &str) {
    let mut best: Option<(isize, String, usize)> = None;
    if let Some(after) = after {
        for (key, item) in doc.iter() {
            let positions: Vec<Option<isize>> = match item {
                Item::Table(t) => vec![t.position()],
                Item::ArrayOfTables(a) => a.iter().map(Table::position).collect(),
                _ => continue,
            };
            for (i, p) in positions.into_iter().enumerate() {
                if let Some(p) = p.filter(|p| *p > after)
                    && best.as_ref().is_none_or(|(b, _, _)| p < *b)
                {
                    best = Some((p, key.to_string(), i));
                }
            }
        }
    }
    let target = best.and_then(|(_, key, i)| match doc.get_mut(&key) {
        Some(Item::Table(t)) => Some(t.decor_mut()),
        Some(Item::ArrayOfTables(a)) => a.get_mut(i).map(Table::decor_mut),
        _ => None,
    });
    match target {
        Some(decor) => prepend_comments(decor, comments),
        None => {
            let trailing = format!("{}{comments}", doc.trailing().as_str().unwrap_or_default());
            doc.set_trailing(trailing);
        }
    }
}

/// Splits the text before an array element into the comment that ends the
/// previous element's line (with its newline) and the rest.
fn split_trail(raw: &str) -> (String, String) {
    match raw.find('\n') {
        Some(n) if raw[..n].contains('#') => (raw[..=n].to_string(), raw[n + 1..].to_string()),
        _ => (String::new(), raw.to_string()),
    }
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

/// Rebuilds `array` from `matched`: entry `j` is the old element that new element
/// `j` continues, or `None` for a new one; `make(j, old)` makes the element. Each
/// kept element keeps its own formatting and comments: the ones before it and the
/// one ending its line (which the parser stores in front of the next element, or
/// in the array's trailing text). The comments of a removed element go to the end
/// of the array; a new element goes on its own line in a multi-line array.
fn rebuild_array(
    array: &mut Array,
    matched: &[Option<usize>],
    mut make: impl FnMut(usize, Option<Value>) -> Value,
) {
    let old: Vec<Value> = array.iter().cloned().collect();
    let prefix_of = |v: &Value| {
        v.decor()
            .prefix()
            .and_then(RawString::as_str)
            .unwrap_or_default()
            .to_string()
    };
    let trailing_old = array.trailing().as_str().unwrap_or_default().to_string();
    let (last_trail, trailing_rest) = split_trail(&trailing_old);
    // Per old element: the text before it without the previous line's comment
    // (as a line start), and the comment ending its own line.
    let leads: Vec<String> = old
        .iter()
        .enumerate()
        .map(|(i, v)| {
            let raw = prefix_of(v);
            match (i, split_trail(&raw)) {
                (0, _) => raw,
                (_, (t, rest)) if !t.is_empty() => format!("\n{rest}"),
                (_, (_, rest)) => rest,
            }
        })
        .collect();
    let trails: Vec<String> = (0..old.len())
        .map(|i| match old.get(i + 1) {
            Some(next) => split_trail(&prefix_of(next)).0,
            None => last_trail.clone(),
        })
        .collect();
    let last_suffix = old.last().and_then(|v| v.decor().suffix().cloned());
    let multi_line = old.last().is_some() && leads.last().is_some_and(|l| l.contains('\n'));
    let new_lead = match leads.last() {
        Some(l) if multi_line => format!("\n{}", l.rsplit('\n').next().unwrap_or_default()),
        _ => " ".to_string(),
    };
    let indent = |lead: &str| lead.rsplit('\n').next().unwrap_or_default().to_string();

    let mut orphans = String::new();
    for i in (0..old.len()).filter(|i| !matched.contains(&Some(*i))) {
        orphans.push_str(&comment_lines_str(&leads[i]));
        orphans.push_str(&comment_lines_str(&trails[i]));
    }

    array.clear();
    let mut prev_trail = String::new();
    for (j, m) in matched.iter().enumerate() {
        let (mut value, lead, trail) = match m {
            Some(i) => (
                make(j, Some(old[*i].clone())),
                leads[*i].clone(),
                trails[*i].clone(),
            ),
            None => (
                make(j, None),
                if j == 0 && old.is_empty() {
                    String::new()
                } else {
                    new_lead.clone()
                },
                String::new(),
            ),
        };
        // After the previous element's line comment: this element's own comment
        // lines, then its indent.
        let prefix = if j > 0 && !prev_trail.is_empty() {
            format!("{prev_trail}{}{}", comment_lines_str(&lead), indent(&lead))
        } else {
            lead
        };
        let d = value.decor_mut();
        d.set_prefix(prefix);
        d.set_suffix("");
        if let Some(i) = m
            && *i + 1 != old.len()
            && let Some(suffix) = old[*i].decor().suffix()
        {
            d.set_suffix(suffix.clone());
        }
        prev_trail = trail;
        array.push_formatted(value);
    }
    if let (Some(last), Some(suffix)) = (array.len().checked_sub(1), last_suffix)
        && let Some(v) = array.get_mut(last)
    {
        v.decor_mut().set_suffix(suffix);
    }
    let mut trailing = format!("{prev_trail}{trailing_rest}");
    if !trailing.contains('\n') && trailing_old.contains('\n') {
        trailing.push('\n');
    }
    if !orphans.is_empty() {
        if !trailing.ends_with('\n') {
            trailing.push('\n');
        }
        trailing.push_str(&orphans);
    }
    array.set_trailing(trailing);
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

/// One key of a settings section with its default.
struct Entry {
    key: &'static str,
    value: Value,
    default: Value,
}

impl Entry {
    fn new(key: &'static str, value: impl Into<Value>, default: impl Into<Value>) -> Entry {
        Entry {
            key,
            value: value.into(),
            default: default.into(),
        }
    }
}

fn put_entries<T: AppendKey>(t: &mut T, entries: &[Entry]) {
    for e in entries {
        put(t, e.key, e.value.clone(), Some(&e.default));
    }
}

/// Writes a settings section (`[git]`, `[board]`): into the table as the user wrote
/// it (a table, a dotted table or an inline table); a missing section is appended
/// at the end, holding only the keys that differ from the defaults.
fn write_section(doc: &mut DocumentMut, name: &str, entries: &[Entry]) -> Result<(), ConfigError> {
    match doc.get_mut(name) {
        Some(Item::Table(t)) => put_entries(t, entries),
        Some(Item::Value(Value::InlineTable(t))) => put_entries(t, entries),
        Some(_) => return Err(ConfigError::Toml(format!("`{name}` is not a table"))),
        None => {
            let mut t = Table::new();
            for e in entries.iter().filter(|e| !same_value(&e.value, &e.default)) {
                t.insert(e.key, Item::Value(e.value.clone()));
            }
            if !t.is_empty() {
                doc.insert(name, Item::Table(t));
            }
        }
    }
    Ok(())
}

fn valid_keyword(k: &str) -> bool {
    let mut chars = k.chars();
    matches!(chars.next(), Some('A'..='Z'))
        && chars.all(|c| matches!(c, 'A'..='Z' | '0'..='9' | '_'))
}

impl Config {
    pub fn parse(s: &str) -> Result<Config, ConfigError> {
        let config: Config = toml::from_str(s).map_err(|e| ConfigError::Toml(e.to_string()))?;
        config.validate()?;
        Ok(config)
    }

    /// Reads `<root>/breccia/config.toml`; a missing file gives the defaults.
    pub fn load(root: &Path) -> Result<Config, ConfigError> {
        Ok(Config::load_with_text(root)?.0)
    }

    /// Like [`load`](Config::load), also returning the text it was read from
    /// (`None`: the file is missing).
    pub fn load_with_text(root: &Path) -> Result<(Config, Option<String>), ConfigError> {
        let text = Config::read_text(root)?;
        let config = match &text {
            Some(text) => Config::parse(text)?,
            None => Config::default(),
        };
        Ok((config, text))
    }

    /// The text of `<root>/breccia/config.toml`; `None` when it is missing.
    pub fn read_text(root: &Path) -> Result<Option<String>, ConfigError> {
        match std::fs::read_to_string(root.join("breccia").join("config.toml")) {
            Ok(text) => Ok(Some(text)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Names trimmed non-blank and unique ignoring case; columns non-empty,
    /// configured states, no repeats. A column whose state is no longer configured
    /// (skipped and named, not shown) is accepted on the board that already had it (`self.boards`, matched by name,
    /// or by place for a rename), so it does not block edits to other boards.
    pub fn check_boards(&self, boards: &[Board]) -> Result<(), ConfigError> {
        let bad = |m: String| Err(ConfigError::InvalidBoard(m));
        let names: Vec<String> = self.boards.iter().map(|b| b.name.clone()).collect();
        let matched = match_boards(&names, boards);
        for (i, b) in boards.iter().enumerate() {
            let had = |c: &String| matched[i].is_some_and(|j| self.boards[j].columns.contains(c));
            let name = b.name.trim();
            if name.is_empty() {
                return bad("a board needs a name".into());
            }
            if boards[..i]
                .iter()
                .any(|p| p.name.trim().to_lowercase() == name.to_lowercase())
            {
                return bad(format!("duplicate board name: {name}"));
            }
            if b.columns.is_empty() {
                return bad(format!("board {name} has no columns"));
            }
            for (j, c) in b.columns.iter().enumerate() {
                if self.state(c).is_none() && !had(c) {
                    return bad(format!("board {name}: unknown state {c}"));
                }
                if b.columns[..j].contains(c) {
                    return bad(format!("board {name}: repeated column {c}"));
                }
            }
        }
        Ok(())
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

    /// Checks `states` before [`write_states`](Config::write_states): at least one,
    /// valid and unique keywords, and a palette colour. A colour is checked only for
    /// a new state and for a state whose colour differs from the one the same
    /// keyword has in `current` (renames already applied), so a hand-written colour
    /// outside the palette never blocks later changes.
    pub fn check_states(states: &[State], current: &[State]) -> Result<(), ConfigError> {
        if states.is_empty() {
            return Err(ConfigError::NoStates);
        }
        for (i, s) in states.iter().enumerate() {
            if !valid_keyword(&s.keyword) {
                return Err(ConfigError::InvalidKeyword(s.keyword.clone()));
            }
            if states[..i].iter().any(|p| p.keyword == s.keyword) {
                return Err(ConfigError::DuplicateState(s.keyword.clone()));
            }
            let kept = current
                .iter()
                .any(|c| c.keyword == s.keyword && c.color == s.color);
            if !kept && !PALETTE.contains(&s.color.as_str()) {
                return Err(ConfigError::InvalidState(format!(
                    "unknown colour {} for {}",
                    s.color, s.keyword
                )));
            }
        }
        Ok(())
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

    pub fn default_toml() -> &'static str {
        DEFAULT_TOML
    }

    pub fn state(&self, keyword: &str) -> Option<&State> {
        self.states.iter().find(|s| s.keyword == keyword)
    }

    /// The in-cycle state after `current` in list order (the first one from `None`, or from a keyword that is not
    /// configured), wrapping from the last to the first: a state outside the cycle goes on to the next in-cycle state
    /// after it. Cycling never leads to "no state"; `None` only when no state is in the cycle.
    pub fn cycle_next(&self, current: Option<&str>) -> Option<&State> {
        let start = current
            .and_then(|k| self.states.iter().position(|s| s.keyword == k))
            .map_or(0, |i| i + 1);
        self.states[start..]
            .iter()
            .find(|s| s.in_cycle)
            .or_else(|| self.states.iter().find(|s| s.in_cycle))
    }

    fn validate(&self) -> Result<(), ConfigError> {
        if self.states.is_empty() {
            return Err(ConfigError::NoStates);
        }
        for (i, s) in self.states.iter().enumerate() {
            if !valid_keyword(&s.keyword) {
                return Err(ConfigError::InvalidKeyword(s.keyword.clone()));
            }
            if self.states[..i].iter().any(|p| p.keyword == s.keyword) {
                return Err(ConfigError::DuplicateState(s.keyword.clone()));
            }
        }
        Ok(())
    }
}
