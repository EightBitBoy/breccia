//! Editing a TOML document without losing what the user wrote: comments, spacing, unknown keys.
//! Nothing here knows a state or a board.

use toml_edit::{
    Array, ArrayOfTables, Decor, DocumentMut, InlineTable, Item, RawString, Table, TableLike, Value,
};

use super::ConfigError;

/// Whether `array` spans lines (so it can hold comments).
pub(super) fn is_multi_line(array: &Array) -> bool {
    let has_newline = |r: Option<&RawString>| {
        r.and_then(RawString::as_str)
            .is_some_and(|s| s.contains('\n'))
    };
    has_newline(Some(array.trailing())) || array.iter().any(|v| has_newline(v.decor().prefix()))
}

/// Sets a board's columns in place: each kept column keeps its comments (§2).
pub(super) fn set_columns(array: &mut Array, columns: &[String]) {
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
pub(super) fn set_keeping_decor(t: &mut dyn TableLike, key: &str, mut value: Value) {
    if let Some(old) = t.get(key).and_then(Item::as_value) {
        *value.decor_mut() = old.decor().clone();
    }
    t.insert(key, Item::Value(value));
}

/// Rebuilds `tables` from `matched`: entry `i` is the old table that new item `i`
/// continues (updated by `update`, keeping its decor, unknown keys and place in the
/// file), or `None` for a table made by `create`. Returns the old tables.
pub(super) fn rebuild_tables(
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

fn has_comment(raw: Option<&RawString>) -> bool {
    raw.and_then(RawString::as_str)
        .is_some_and(|s| s.contains('#'))
}

/// True when `key`'s text carries a comment that removing the key would lose: one
/// in the key's decor prefix, in the value's suffix or inside an array's end.
pub(super) fn keeps_a_comment(doc: &DocumentMut, key: &str) -> bool {
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
pub(super) trait AppendKey: TableLike {
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
pub(super) fn put<T: AppendKey>(t: &mut T, key: &str, value: Value, default: Option<&Value>) {
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
pub(super) fn carry_removed_comments(
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
pub(super) fn put_comments_after(doc: &mut DocumentMut, after: Option<isize>, comments: &str) {
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

/// Rebuilds `array` from `matched`: entry `j` is the old element that new element
/// `j` continues, or `None` for a new one; `make(j, old)` makes the element. Each
/// kept element keeps its own formatting and comments: the ones before it and the
/// one ending its line (which the parser stores in front of the next element, or
/// in the array's trailing text). The comments of a removed element go to the end
/// of the array; a new element goes on its own line in a multi-line array.
pub(super) fn rebuild_array(
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

/// One key of a settings section with its default.
pub(super) struct Entry {
    key: &'static str,
    value: Value,
    default: Value,
}

impl Entry {
    pub(super) fn new(
        key: &'static str,
        value: impl Into<Value>,
        default: impl Into<Value>,
    ) -> Entry {
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
pub(super) fn write_section(
    doc: &mut DocumentMut,
    name: &str,
    entries: &[Entry],
) -> Result<(), ConfigError> {
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
