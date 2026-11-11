//! Helpers the integration tests share: files in a notes folder, a fixed clock, and a session that
//! runs commands. A file whose call shape differs keeps a one-line wrapper over these.
#![allow(dead_code)]

use breccia_core::{BlockId, Clock, CommandError, Output, Request, Session};
use chrono::{NaiveDate, NaiveTime};
use serde_json::{Value, json};
use std::fs;
use std::path::Path;
use tempfile::TempDir;

/// The day most test files fix as "today".
pub const DAY: (i32, u32, u32) = (2026, 10, 29);

/// Writes `text` to `rel` under `root`, creating the parent folders.
pub fn put(root: &Path, rel: &str, text: &str) {
    let p = root.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
}

/// Reads `rel` under `root` as text.
pub fn read(root: &Path, rel: &str) -> String {
    fs::read_to_string(root.join(rel)).unwrap_or_else(|e| panic!("{rel}: {e}"))
}

/// A clock on `day` at 14:05:09, `ms` milliseconds into the run.
pub fn clock_on((y, m, d): (i32, u32, u32), ms: u64) -> Clock {
    Clock {
        today: NaiveDate::from_ymd_opt(y, m, d).unwrap(),
        time: NaiveTime::from_hms_opt(14, 5, 9).unwrap(),
        ms,
    }
}

/// A request for `command`, stamped with the session's generation.
pub fn request(s: &Session, command: Value) -> Request {
    serde_json::from_value(json!({"generation": s.generation(), "command": command}))
        .unwrap_or_else(|e| panic!("bad request: {e}"))
}

pub fn run(s: &mut Session, command: Value, clock: Clock) -> Result<Output, CommandError> {
    let req = request(s, command);
    s.run(req, clock)
}

/// Runs a command that must succeed; a failure panics with the command and the error.
pub fn ok(s: &mut Session, command: Value, clock: Clock) -> Output {
    let j = command.clone();
    run(s, command, clock).unwrap_or_else(|e| panic!("{j}: {e:?}"))
}

/// Opens `root` in a new session.
pub fn open_at(root: &Path, clock: Clock) -> Session {
    let mut s = Session::new();
    ok(&mut s, json!({"type": "folder.open", "path": root}), clock);
    s
}

/// A temp folder holding `files`, opened in a new session.
pub fn folder_at(files: &[(&str, &str)], clock: Clock) -> (TempDir, Session) {
    let t = tempfile::tempdir().unwrap();
    for (rel, text) in files {
        put(t.path(), rel, text);
    }
    let s = open_at(t.path(), clock);
    (t, s)
}

/// Block ids of a page, in document order.
pub fn ids(s: &mut Session, key: &str) -> Vec<BlockId> {
    let out = ok(s, json!({"type": "page.get", "key": key}), clock_on(DAY, 0));
    out.page.unwrap().blocks.iter().map(|b| b.id).collect()
}
