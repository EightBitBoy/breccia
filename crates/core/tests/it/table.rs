//! `pages.table`: one row per page, with link counts and file times.

use crate::support::{self, DAY, clock_on, open_at, put};
use breccia_core::session::PageRowView;
use breccia_core::{Clock, Output, Session};
use chrono::TimeZone;
use serde_json::{Value, json};
use std::fs;
use std::path::Path;

fn clock(day: (i32, u32, u32)) -> Clock {
    clock_on(day, 0)
}

fn ok_on(s: &mut Session, json: Value, date: (i32, u32, u32)) -> Output {
    support::ok(s, json, clock(date))
}

fn ok(s: &mut Session, json: Value) -> Output {
    ok_on(s, json, (2026, 10, 29))
}

fn open(root: &Path) -> Session {
    open_at(root, clock(DAY))
}
fn touch(root: &Path, rel: &str, (y, m, d, h): (i32, u32, u32, u32)) {
    let t = chrono::Local.with_ymd_and_hms(y, m, d, h, 0, 0).unwrap();
    fs::File::options()
        .write(true)
        .open(root.join(rel))
        .unwrap()
        .set_modified(t.into())
        .unwrap();
}

fn table(s: &mut Session) -> Vec<PageRowView> {
    ok(s, json!({"type": "pages.table"})).table.unwrap()
}
fn row<'a>(rows: &'a [PageRowView], key: &str) -> &'a PageRowView {
    rows.iter().find(|r| r.key == key).unwrap()
}

#[test]
fn the_table_lists_pages_with_files_and_counts_their_links() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/Anna.md", "- hi [[Ben]] and [[Ben]]\n");
    put(t.path(), "pages/Projects/Ben.md", "- x\n");
    put(
        t.path(),
        "journals/2026-10-28.md",
        "- met [[Anna]] and [[Ben]]\n\t- again [[Anna]]\n- #anna tag\n- [[2026-10-28]] self\n",
    );
    let mut s = open(t.path());
    ok(&mut s, json!({"type": "page.open", "name": "Ghost"})); // blank, no file
    let rows = table(&mut s);
    let keys: Vec<&str> = rows.iter().map(|r| r.key.as_str()).collect();
    assert_eq!(keys, ["2026-10-28", "anna", "ben"]);
    let anna = row(&rows, "anna");
    assert_eq!((anna.linked_from, anna.links_out), (2, 1));
    assert_eq!(anna.folder, "");
    let ben = row(&rows, "ben");
    assert_eq!(
        (ben.name.as_str(), ben.folder.as_str()),
        ("Ben", "Projects")
    );
    assert_eq!((ben.linked_from, ben.links_out), (2, 0));
    let day = row(&rows, "2026-10-28");
    assert_eq!(day.title, "Wednesday, 28 Oct 2026");
    assert_eq!((day.linked_from, day.links_out), (0, 2));
    assert!(rows.iter().all(|r| r.edited.is_some()));
    // Some Linux file systems have no creation time; there `created` may be None.
    #[cfg(any(windows, target_os = "macos"))]
    assert!(rows.iter().all(|r| r.created.is_some()));
}

#[test]
fn edited_is_the_file_time_also_after_an_own_save() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/P.md", "- a\n");
    touch(t.path(), "pages/P.md", (2026, 10, 20, 12));
    let mut s = open(t.path());
    let when = chrono::Local
        .with_ymd_and_hms(2026, 10, 20, 12, 0, 0)
        .unwrap()
        .timestamp_millis();
    assert_eq!(row(&table(&mut s), "p").edited, Some(when));
    let id = ok(&mut s, json!({"type": "page.get", "key": "p"}))
        .page
        .unwrap()
        .blocks[0]
        .id;
    ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "b"}),
    );
    let mtime = fs::metadata(t.path().join("pages/P.md"))
        .unwrap()
        .modified()
        .unwrap();
    let ms = mtime
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    assert_eq!(row(&table(&mut s), "p").edited, Some(ms));
}

#[cfg(any(windows, target_os = "macos"))]
#[test]
fn a_save_keeps_the_file_creation_time() {
    #[cfg(target_os = "macos")]
    use std::os::macos::fs::FileTimesExt;
    #[cfg(windows)]
    use std::os::windows::fs::FileTimesExt;
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/P.md", "- a\n");
    let born: std::time::SystemTime = chrono::Local
        .with_ymd_and_hms(2026, 1, 5, 12, 0, 0)
        .unwrap()
        .into();
    fs::File::options()
        .write(true)
        .open(t.path().join("pages/P.md"))
        .unwrap()
        .set_times(fs::FileTimes::new().set_created(born))
        .unwrap();
    let mut s = open(t.path());
    let id = ok(&mut s, json!({"type": "page.get", "key": "p"}))
        .page
        .unwrap()
        .blocks[0]
        .id;
    ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "b"}),
    );
    assert_eq!(
        fs::read_to_string(t.path().join("pages/P.md")).unwrap(),
        "- b\n"
    );
    assert_eq!(
        fs::metadata(t.path().join("pages/P.md"))
            .unwrap()
            .created()
            .unwrap(),
        born
    );
    let ms = chrono::Local
        .with_ymd_and_hms(2026, 1, 5, 12, 0, 0)
        .unwrap()
        .timestamp_millis();
    assert_eq!(row(&table(&mut s), "p").created, Some(ms));
}

#[test]
fn links_to_pages_without_a_file_and_done_dates_count() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "pages/Plan.md",
        "- see [[Nowhere]]\n- DONE ship\n  done:: [[2026-10-28]]\n",
    );
    put(t.path(), "journals/2026-10-28.md", "- day\n");
    let mut s = open(t.path());
    let rows = table(&mut s);
    // (a) the link to a page with no file counts in links_out.
    // (b) the done:: date links the journal day (links_out of Plan, linked_from of the day).
    assert_eq!(row(&rows, "plan").links_out, 2);
    assert_eq!(row(&rows, "2026-10-28").linked_from, 1);
}

#[test]
fn created_comes_from_git_when_known() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/A.md", "- a\n");
    put(t.path(), "pages/B.md", "- b\n");
    let mut s = open(t.path());
    let rows = table(&mut s);
    let (a_file, b_file) = (row(&rows, "a").created, row(&rows, "b").created);
    let generation = s.generation();
    let dates = |ms| {
        std::collections::HashMap::from([(std::path::PathBuf::from("pages").join("A.md"), ms)])
    };
    // Another generation's dates are ignored.
    s.set_git_created(generation + 1, dates(7));
    assert_eq!(row(&table(&mut s), "a").created, a_file);
    s.set_git_created(generation, dates(1_000));
    let rows = table(&mut s);
    assert_eq!(row(&rows, "a").created, Some(1_000));
    assert_eq!(row(&rows, "b").created, b_file, "b keeps the file date");
    // A folder switch drops them.
    let other = tempfile::tempdir().unwrap();
    put(other.path(), "pages/A.md", "- a\n");
    ok(&mut s, json!({"type": "folder.open", "path": other.path()}));
    assert_ne!(row(&table(&mut s), "a").created, Some(1_000));
}
