//! The search index: a SQLite file (FTS5, trigram tokenizer) in the app's
//! cache directory. It is a rebuildable cache of the pages, never the source
//! of truth: a damaged or outdated file is deleted and built again, and
//! nothing here writes into the notes folder.

mod fold;
mod query;
mod store;

use std::fs;
use std::path::Path;
use std::time::Duration;

use rusqlite::{Connection, ErrorCode};

use crate::config::Config;
use crate::workspace::{Page, PageKind};

pub use fold::{Segment, fold, highlight};
pub use query::{Query, QueryLink, parse_query};
pub use store::Hit;

/// Bumped whenever the tables or what they hold change; a file with another
/// version is rebuilt. 2: `[[a|b]]` links are indexed under the target `a`.
/// 3: link keys are re-read after the `[[a\|b]]` change.
pub const SCHEMA_VERSION: i32 = 3;
/// How many pages the shell indexes in one step of the background build.
pub const INDEX_CHUNK_PAGES: usize = 25;

#[derive(Debug, thiserror::Error)]
pub enum SearchError {
    #[error("search index: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("search index: {0}")]
    Io(#[from] std::io::Error),
}

impl SearchError {
    /// Whether SQLite found the file damaged (not a database, or corrupt):
    /// the cache is then deleted and built again.
    pub fn is_damage(&self) -> bool {
        matches!(self, SearchError::Sql(e) if is_damage(e))
    }
}

pub struct SearchIndex {
    conn: Connection,
}

/// Opens `file` and sets the connection up (WAL, relaxed sync, busy wait).
fn connect(file: &Path) -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open(file)?;
    conn.busy_timeout(Duration::from_millis(2000))?;
    conn.pragma_update_and_check(None, "journal_mode", "WAL", |r| r.get::<_, String>(0))?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    Ok(conn)
}

impl SearchIndex {
    /// Opens the index at `file`, creating it and its folder if missing. A
    /// file with another schema version is deleted and created again. A file
    /// that is not a database is not touched: the error says so
    /// ([`SearchError::is_damage`]) and the caller decides what to delete.
    pub fn open(file: &Path) -> Result<SearchIndex, SearchError> {
        if let Some(dir) = file.parent() {
            fs::create_dir_all(dir)?;
        }
        let existed = file.exists();
        let mut conn = connect(file)?;
        let version: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version != SCHEMA_VERSION && existed {
            // Another version, or a file nobody versioned: start over.
            drop(conn);
            remove_index_files(file)?;
            conn = connect(file)?;
        }
        if version != SCHEMA_VERSION {
            store::create_schema(&conn)?;
        }
        Ok(SearchIndex { conn })
    }

    /// An index that lives in memory only.
    pub fn in_memory() -> Result<SearchIndex, SearchError> {
        let conn = Connection::open_in_memory()?;
        store::create_schema(&conn)?;
        Ok(SearchIndex { conn })
    }
}

fn is_damage(e: &rusqlite::Error) -> bool {
    matches!(
        e.sqlite_error_code(),
        Some(ErrorCode::NotADatabase | ErrorCode::DatabaseCorrupt)
    )
}

/// Deletes the database file and its WAL companions.
pub(crate) fn remove_index_files(file: &Path) -> Result<(), SearchError> {
    for suffix in ["", "-wal", "-shm", "-journal"] {
        let mut name = file.as_os_str().to_owned();
        name.push(suffix);
        match fs::remove_file(&name) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
    }
    Ok(())
}

const FNV_OFFSET: u64 = 0xcbf29ce484222325;
const FNV_PRIME: u64 = 0x100000001b3;

fn fnv1a64_from(mut h: u64, bytes: &[u8]) -> u64 {
    for b in bytes {
        h ^= u64::from(*b);
        h = h.wrapping_mul(FNV_PRIME);
    }
    h
}

/// A hash of the canonicalised notes folder `root`: names the per-folder
/// files in the cache directory.
pub fn folder_hash(root: &Path) -> u64 {
    let root = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    fnv1a64_from(FNV_OFFSET, root.to_string_lossy().as_bytes())
}

/// The file name of the index of the notes folder `root`: one index per
/// folder, all in one cache directory.
pub fn index_file_name(root: &Path) -> String {
    format!("index-{:016x}.sqlite3", folder_hash(root))
}

/// What decides whether a page's rows are current: the schema version, the
/// kind, every configured state keyword (a changed state list indexes every
/// page again) and every block's text.
pub fn page_hash(page: &Page, cfg: &Config) -> i64 {
    let mut h = FNV_OFFSET;
    let mut feed = |bytes: &[u8]| {
        h = fnv1a64_from(h, bytes);
        h = fnv1a64_from(h, b"\0");
    };
    feed(&SCHEMA_VERSION.to_le_bytes());
    feed(match page.kind {
        PageKind::Journal(_) => b"journal",
        PageKind::Page => b"page",
    });
    for s in &cfg.states {
        feed(s.keyword.as_bytes());
    }
    for b in page.doc.blocks() {
        feed(b.text().as_bytes());
    }
    h as i64
}
