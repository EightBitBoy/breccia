//! The schema, and the SQL that updates and queries it.

use rusqlite::types::Value;
use rusqlite::{Connection, OptionalExtension, Transaction, params, params_from_iter};

use super::fold::{Segment, fold, highlight};
use super::query::Query;
use super::{SCHEMA_VERSION, SearchError, SearchIndex, page_hash};
use crate::inline::links;
use crate::task::task_state;
use crate::workspace::{Page, PageKind, Workspace};

/// A matching block.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Hit {
    pub page: String,
    /// The block's index in the page's `doc.blocks()`.
    pub pos: usize,
    pub state: Option<String>,
    pub segments: Vec<Segment>,
}

const WIDTH: usize = 160;

pub(super) fn create_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(&format!(
        r#"
BEGIN;
CREATE TABLE pages (key TEXT PRIMARY KEY, hash INTEGER NOT NULL, recent INTEGER NOT NULL);
CREATE TABLE blocks (id INTEGER PRIMARY KEY, page TEXT NOT NULL, pos INTEGER NOT NULL, state TEXT,
  text TEXT NOT NULL, folded TEXT NOT NULL);
CREATE INDEX blocks_page ON blocks(page);
CREATE TABLE links (block INTEGER NOT NULL, target TEXT NOT NULL);
CREATE INDEX links_target ON links(target);
CREATE INDEX links_block ON links(block);
CREATE VIRTUAL TABLE blocks_fts USING fts5(folded, content='blocks', content_rowid='id',
  tokenize = "trigram");
CREATE TRIGGER blocks_ai AFTER INSERT ON blocks BEGIN
  INSERT INTO blocks_fts(rowid, folded) VALUES (new.id, new.folded);
END;
CREATE TRIGGER blocks_ad AFTER DELETE ON blocks BEGIN
  INSERT INTO blocks_fts(blocks_fts, rowid, folded) VALUES ('delete', old.id, old.folded);
END;
CREATE TRIGGER blocks_au AFTER UPDATE ON blocks BEGIN
  INSERT INTO blocks_fts(blocks_fts, rowid, folded) VALUES ('delete', old.id, old.folded);
  INSERT INTO blocks_fts(rowid, folded) VALUES (new.id, new.folded);
END;
PRAGMA user_version = {SCHEMA_VERSION};
COMMIT;
"#
    ))
}

/// A journal's date at 00:00 UTC, or a page's edit time, in milliseconds.
fn recent(page: &Page) -> i64 {
    match &page.kind {
        PageKind::Journal(d) => d
            .and_hms_opt(0, 0, 0)
            .map(|t| t.and_utc().timestamp_millis())
            .unwrap_or(0),
        PageKind::Page => page
            .edited()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0),
    }
}

fn stored_hash(conn: &Connection, key: &str) -> Result<Option<i64>, rusqlite::Error> {
    Ok(stored_row(conn, key)?.map(|(hash, _)| hash))
}

/// The stored `(hash, recent)` of a page.
fn stored_row(conn: &Connection, key: &str) -> Result<Option<(i64, i64)>, rusqlite::Error> {
    conn.query_row("SELECT hash, recent FROM pages WHERE key = ?", [key], |r| {
        Ok((r.get(0)?, r.get(1)?))
    })
    .optional()
}

fn remove_page(tx: &Transaction, key: &str) -> Result<(), rusqlite::Error> {
    tx.execute(
        "DELETE FROM links WHERE block IN (SELECT id FROM blocks WHERE page = ?)",
        [key],
    )?;
    tx.execute("DELETE FROM blocks WHERE page = ?", [key])?;
    tx.execute("DELETE FROM pages WHERE key = ?", [key])?;
    Ok(())
}

fn insert_page(tx: &Transaction, page: &Page, ws: &Workspace) -> Result<(), rusqlite::Error> {
    remove_page(tx, &page.key)?;
    tx.execute(
        "INSERT INTO pages (key, hash, recent) VALUES (?, ?, ?)",
        params![page.key, page_hash(page, &ws.config), recent(page)],
    )?;
    let mut block = tx.prepare_cached(
        "INSERT INTO blocks (page, pos, state, text, folded) VALUES (?, ?, ?, ?, ?)",
    )?;
    let mut link = tx.prepare_cached("INSERT INTO links (block, target) VALUES (?, ?)")?;
    for (pos, b) in page.doc.blocks().iter().enumerate() {
        let text = b.text();
        if text.trim().is_empty() {
            continue;
        }
        let state = task_state(text, &ws.config).map(|s| s.keyword.as_str());
        block.execute(params![page.key, pos as i64, state, text, fold(text)])?;
        let id = tx.last_insert_rowid();
        let mut seen: Vec<String> = Vec::new();
        for l in links(text) {
            if !seen.contains(&l.key) {
                link.execute(params![id, l.key])?;
                seen.push(l.key);
            }
        }
    }
    Ok(())
}

/// The page, if it exists and has content: the only pages the index holds.
fn indexable<'w>(ws: &'w Workspace, key: &str) -> Option<&'w Page> {
    ws.page(key).filter(|p| p.has_content())
}

/// A phrase for FTS5: quoted, with `"` doubled. With the trigram tokenizer a
/// phrase matches any substring.
fn phrase(word: &str) -> String {
    format!("\"{}\"", word.replace('"', "\"\""))
}

fn like_pattern(word: &str) -> String {
    let mut out = String::from("%");
    for c in word.chars() {
        if matches!(c, '%' | '_' | '\\') {
            out.push('\\');
        }
        out.push(c);
    }
    out.push('%');
    out
}

impl SearchIndex {
    /// Brings the rows of `keys` up to date with `ws`, in one transaction.
    /// Returns how many pages had their rows replaced or removed.
    pub fn update(&mut self, ws: &Workspace, keys: &[String]) -> Result<usize, SearchError> {
        let tx = self.conn.transaction()?;
        let mut changed = 0;
        for key in keys {
            let stored = stored_hash(&tx, key)?;
            match indexable(ws, key) {
                Some(page) if stored == Some(page_hash(page, &ws.config)) => {
                    tx.execute(
                        "UPDATE pages SET recent = ? WHERE key = ?",
                        params![recent(page), key],
                    )?;
                }
                Some(page) => {
                    insert_page(&tx, page, ws)?;
                    changed += 1;
                }
                None if stored.is_some() => {
                    remove_page(&tx, key)?;
                    changed += 1;
                }
                None => {}
            }
        }
        tx.commit()?;
        Ok(changed)
    }

    /// Removes the stored pages that are not pages with content in `ws`.
    pub fn prune(&mut self, ws: &Workspace) -> Result<usize, SearchError> {
        let stored: Vec<String> = {
            let mut st = self.conn.prepare("SELECT key FROM pages")?;
            st.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?
        };
        let tx = self.conn.transaction()?;
        let mut removed = 0;
        for key in stored.iter().filter(|k| indexable(ws, k).is_none()) {
            remove_page(&tx, key)?;
            removed += 1;
        }
        tx.commit()?;
        Ok(removed)
    }

    /// The keys among `keys` for which `update` would change rows or the edit
    /// time, in the given order. Reads only the `pages` table.
    pub fn stale(&self, ws: &Workspace, keys: &[String]) -> Result<Vec<String>, SearchError> {
        let mut out = Vec::new();
        for key in keys {
            let stored = stored_row(&self.conn, key)?;
            let current = indexable(ws, key).map(|p| (page_hash(p, &ws.config), recent(p)));
            if stored != current {
                out.push(key.clone());
            }
        }
        Ok(out)
    }

    /// At most `limit` blocks matching `q`, newest page first, then page key,
    /// then file order.
    pub fn query(&self, q: &Query, limit: usize) -> Result<Vec<Hit>, SearchError> {
        let folded: Vec<String> = q
            .words
            .iter()
            .map(|w| fold(w))
            .filter(|w| w.chars().any(char::is_alphanumeric))
            .collect();
        if folded.is_empty() && q.states.is_empty() && q.links.is_empty() {
            return Ok(Vec::new());
        }
        let (long, short): (Vec<&String>, Vec<&String>) =
            folded.iter().partition(|w| w.chars().count() >= 3);

        let mut sql = String::from(
            "SELECT b.page, b.pos, b.state, b.text FROM blocks b \
             JOIN pages p ON p.key = b.page WHERE 1",
        );
        let mut args: Vec<Value> = Vec::new();
        if !long.is_empty() {
            sql.push_str(" AND b.id IN (SELECT rowid FROM blocks_fts WHERE blocks_fts MATCH ?)");
            let expr: Vec<String> = long.iter().map(|w| phrase(w)).collect();
            args.push(Value::Text(expr.join(" ")));
        }
        for w in &short {
            sql.push_str(" AND b.folded LIKE ? ESCAPE '\\'");
            args.push(Value::Text(like_pattern(w)));
        }
        if !q.states.is_empty() {
            let marks = vec!["?"; q.states.len()].join(", ");
            sql.push_str(&format!(" AND b.state IN ({marks})"));
            args.extend(q.states.iter().cloned().map(Value::Text));
        }
        for link in &q.links {
            let keys = &link.keys;
            let marks = vec!["?"; keys.len()].join(", ");
            sql.push_str(&format!(
                " AND EXISTS (SELECT 1 FROM links l WHERE l.block = b.id AND l.target IN ({marks}))"
            ));
            args.extend(keys.iter().cloned().map(Value::Text));
        }
        sql.push_str(" ORDER BY p.recent DESC, p.key, b.pos LIMIT ?");
        args.push(Value::Integer(limit as i64));

        let mut st = self.conn.prepare(&sql)?;
        let rows = st.query_map(params_from_iter(args), |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, String>(3)?,
            ))
        })?;
        let mut hits = Vec::new();
        for row in rows {
            let (page, pos, state, text) = row?;
            hits.push(Hit {
                page,
                pos: pos as usize,
                state,
                segments: highlight(&text, &folded, WIDTH),
            });
        }
        Ok(hits)
    }
}
