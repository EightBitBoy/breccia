//! `board.get` and the boards in `config.get`.

use crate::support::{DAY, clock_on, open_at, put, request, run};
use breccia_core::session::{BoardView, CardView, Notice, SaveFailReason};
use breccia_core::{Clock, CommandError, Output, Session};
use serde_json::{Value, json};
use std::fs;
use std::path::Path;

fn clock(day: (i32, u32, u32)) -> Clock {
    clock_on(day, 0)
}

fn cmd_on(s: &mut Session, mut json: Value, date: (i32, u32, u32)) -> Result<Output, CommandError> {
    // `boards.set` carries the config version it was made from: these tests
    // make it from the settings the session shows now.
    if json["type"] == "boards.set" && json.get("version").is_none() {
        let get = request(s, json!({"type": "config.get"}));
        let v = s.run(get, clock(date)).unwrap().config.unwrap().version;
        json["version"] = json!(v);
    }
    run(s, json, clock(date))
}

fn ok_on(s: &mut Session, json: Value, date: (i32, u32, u32)) -> Output {
    let j = json.clone();
    cmd_on(s, json, date).unwrap_or_else(|e| panic!("{j}: {e:?}"))
}

fn ok(s: &mut Session, json: Value) -> Output {
    ok_on(s, json, (2026, 10, 29))
}

fn open(root: &Path) -> Session {
    open_at(root, clock(DAY))
}
fn board(s: &mut Session, index: usize) -> BoardView {
    ok(s, json!({"type": "board.get", "index": index}))
        .board
        .unwrap()
}
fn first_line(c: &CardView) -> &str {
    c.blocks[0].text.split('\n').next().unwrap()
}
fn titles(b: &BoardView, kw: &str) -> Vec<String> {
    b.columns
        .iter()
        .find(|c| c.keyword == kw)
        .unwrap()
        .cards
        .iter()
        .map(|c| first_line(c).to_string())
        .collect()
}
fn card<'a>(b: &'a BoardView, line: &str) -> &'a CardView {
    b.columns
        .iter()
        .flat_map(|c| &c.cards)
        .find(|c| first_line(c) == line)
        .unwrap()
}
fn touch(root: &Path, rel: &str, (y, m, d, h): (i32, u32, u32, u32)) {
    use chrono::TimeZone;
    let t = chrono::Local.with_ymd_and_hms(y, m, d, h, 0, 0).unwrap();
    fs::File::options()
        .write(true)
        .open(root.join(rel))
        .unwrap()
        .set_modified(t.into())
        .unwrap();
}

#[test]
fn cards_from_every_page_in_their_columns() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "journals/2026-10-29.md",
        "- TODO a\n- DOING b\n- note\n",
    );
    put(
        t.path(),
        "pages/P.md",
        "- WAITING c\n- DONE d\n  done:: [[2026-10-28]]\n- ARCHIVED e\n",
    );
    let mut s = open(t.path());
    let b = board(&mut s, 0);
    assert_eq!(b.name, "Tasks");
    let kws: Vec<&str> = b.columns.iter().map(|c| c.keyword.as_str()).collect();
    assert_eq!(kws, ["TODO", "DOING", "WAITING", "DONE"]);
    assert_eq!(b.columns[1].color, "amber");
    assert!(b.columns[3].finished);
    assert_eq!(titles(&b, "TODO"), ["TODO a"]);
    assert_eq!(titles(&b, "DOING"), ["DOING b"]);
    assert_eq!(titles(&b, "WAITING"), ["WAITING c"]);
    assert_eq!(titles(&b, "DONE"), ["DONE d"]);
    let d = card(&b, "DONE d");
    assert_eq!(
        (d.source.as_str(), d.page.as_str(), d.page_name.as_str()),
        ("P", "p", "P")
    );
    assert_eq!(d.done.as_deref(), Some("28 Oct"));
    assert_eq!(d.html, "<span class=\"done-text\">d</span>");
    assert_eq!(card(&b, "TODO a").source, "29 Oct 2026");
    assert_eq!(card(&b, "TODO a").done, None);
}

#[test]
fn the_spec_example_gives_three_cards() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "pages/R.md",
        "- TODO Release version 2\n\t- TODO Write release notes\n\t- DONE Update the changelog\n\t- Check with [[Anna]] about the date\n",
    );
    let mut s = open(t.path());
    let b = board(&mut s, 0);
    assert_eq!(
        titles(&b, "TODO"),
        ["TODO Release version 2", "TODO Write release notes"]
    );
    let r = card(&b, "TODO Release version 2");
    assert_eq!((r.subtasks_done, r.subtasks_total), (1, 2));
    assert_eq!(r.parent, None);
    assert_eq!(r.html, "Release version 2");
    let depths: Vec<usize> = r.blocks.iter().map(|b| b.depth).collect();
    assert_eq!(depths, [0, 1, 1, 1]);
    assert_eq!(
        card(&b, "TODO Write release notes").parent.as_deref(),
        Some("Release version 2")
    );
    assert_eq!(
        card(&b, "DONE Update the changelog").parent.as_deref(),
        Some("Release version 2")
    );
    assert_eq!(card(&b, "TODO Write release notes").subtasks_total, 0);
}

#[test]
fn nested_tasks_follow_the_nearest_task_ancestor() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "pages/N.md",
        "- TODO A\n\t- note\n\t\t- TODO B\n\t\t\t- detail\n\t\t\t- DONE C\n",
    );
    let mut s = open(t.path());
    let b = board(&mut s, 0);
    let a = card(&b, "TODO A");
    assert_eq!((a.subtasks_done, a.subtasks_total), (0, 1));
    assert_eq!(a.blocks.len(), 5);
    let bb = card(&b, "TODO B");
    assert_eq!(bb.parent.as_deref(), Some("A"));
    assert_eq!((bb.subtasks_done, bb.subtasks_total), (1, 1));
    assert_eq!(card(&b, "DONE C").parent.as_deref(), Some("B"));
}

#[test]
fn cards_are_ordered_newest_source_first() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "journals/2020-10-27.md", "- TODO j27\n");
    put(
        t.path(),
        "journals/2020-10-29.md",
        "- TODO j29\n- TODO j29b\n",
    );
    put(t.path(), "pages/Old.md", "- TODO old\n");
    put(t.path(), "pages/New.md", "- TODO new\n");
    put(t.path(), "pages/Same.md", "- TODO same\n");
    touch(t.path(), "pages/Old.md", (2020, 10, 20, 12));
    touch(t.path(), "pages/New.md", (2020, 10, 28, 12));
    touch(t.path(), "pages/Same.md", (2020, 10, 29, 9));
    // Older than "Same", so only the journal-before-page rule puts j29 first.
    touch(t.path(), "journals/2020-10-27.md", (2020, 10, 1, 12));
    touch(t.path(), "journals/2020-10-29.md", (2020, 10, 1, 12));
    let mut s = open(t.path());
    assert_eq!(
        titles(&board(&mut s, 0), "TODO"),
        [
            "TODO j29",
            "TODO j29b",
            "TODO same",
            "TODO new",
            "TODO j27",
            "TODO old"
        ]
    );
    // A save is the page's newest edit.
    let id = card(&board(&mut s, 0), "TODO old").id;
    ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "TODO old!"}),
    );
    assert_eq!(titles(&board(&mut s, 0), "TODO")[0], "TODO old!");
}

#[test]
fn finished_columns_sort_by_done_date() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "journals/2026-10-29.md",
        "- DONE x\n  done:: [[2026-10-20]]\n- DONE y\n  done:: [[2026-10-28]]\n- DONE z\n",
    );
    let mut s = open(t.path());
    assert_eq!(
        titles(&board(&mut s, 0), "DONE"),
        ["DONE y", "DONE x", "DONE z"]
    );
}

#[test]
fn finished_columns_sort_by_done_time_and_a_date_only_line_is_the_start_of_its_day() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "journals/2026-10-29.md",
        "- DONE early\n  done:: [[2026-10-28]] 08:00:00\n- DONE old form\n  done:: [[2026-10-28]]\n- DONE late\n  done:: [[2026-10-28]] 17:30:05\n- DONE next day\n  done:: [[2026-10-29]] 00:00:01\n",
    );
    let mut s = open(t.path());
    let b = board(&mut s, 0);
    assert_eq!(
        titles(&b, "DONE"),
        ["DONE next day", "DONE late", "DONE early", "DONE old form"]
    );
    // The card's chip shows the day only.
    assert_eq!(card(&b, "DONE late").done.as_deref(), Some("28 Oct"));
}

#[test]
fn prioritized_cards_come_first_highest_first() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "journals/2026-10-29.md",
        "- TODO new\n- TODO two\n  priority:: 2\n- TODO high word\n  priority:: high\n",
    );
    put(
        t.path(),
        "pages/P.md",
        "- TODO five\n  priority:: 5\n- TODO zero\n  priority:: 0\n- TODO tie a\n  priority:: 2\n- DONE finished with one\n  priority:: 9\n  done:: [[2026-10-01]]\n- DONE later\n  done:: [[2026-10-02]]\n",
    );
    let mut s = open(t.path());
    let b = board(&mut s, 0);
    // Prioritized first, highest first; a tie falls back to today's order (the page, edited
    // now, before the older journal day); invalid values count as none and keep today's order.
    assert_eq!(
        titles(&b, "TODO"),
        [
            "TODO five",
            "TODO tie a",
            "TODO two",
            "TODO zero",
            "TODO new",
            "TODO high word"
        ]
    );
    // A finished column keeps its done-date order.
    assert_eq!(titles(&b, "DONE"), ["DONE later", "DONE finished with one"]);
}

#[test]
fn the_archive_sorts_by_done_and_archived_time() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "pages/P.md",
        "- DONE a\n  done:: [[2026-09-01]] 09:00:00\n  archived:: 2026-10-01 10:00:00\n- DONE b\n  done:: [[2026-09-01]] 18:00:00\n  archived:: 2026-10-01\n- DONE c\n  done:: [[2026-09-01]] 09:00:00\n  archived:: 2026-10-01 11:00:00\n",
    );
    let mut s = open(t.path());
    let rows = ok(&mut s, json!({"type": "archive.list"})).archive.unwrap();
    let texts: Vec<&str> = rows.iter().map(|r| r.text.as_str()).collect();
    assert_eq!(texts, ["b", "c", "a"]);
    assert_eq!(rows[2].archived.as_deref(), Some("2026-10-01"));
}

#[test]
fn unknown_columns_are_skipped_and_named() {
    let t = tempfile::tempdir().unwrap();
    let toml = breccia_core::Config::default_toml().replace(
        "columns = [\"TODO\", \"DOING\", \"WAITING\", \"DONE\"]",
        "columns = [\"TODO\", \"LATER\"]",
    );
    put(t.path(), "breccia/config.toml", &toml);
    let mut s = open(t.path());
    let b = board(&mut s, 0);
    assert_eq!(b.columns.len(), 1);
    assert_eq!(b.unknown, ["LATER"]);
}

#[test]
fn unknown_board_is_refused() {
    let t = tempfile::tempdir().unwrap();
    let mut s = open(t.path());
    let e = cmd_on(
        &mut s,
        json!({"type": "board.get", "index": 5}),
        (2026, 10, 29),
    )
    .unwrap_err();
    assert_eq!(e.code, "unknownBoard");
}

#[test]
fn config_get_lists_the_boards() {
    let t = tempfile::tempdir().unwrap();
    let mut s = open(t.path());
    let c = ok(&mut s, json!({"type": "config.get"})).config.unwrap();
    assert_eq!(c.boards.len(), 1);
    assert_eq!(c.boards[0].name, "Tasks");
    assert_eq!(c.boards[0].columns, ["TODO", "DOING", "WAITING", "DONE"]);
    assert_eq!(c.archive_after_days, 14);
}

#[test]
fn archive_old_marks_tasks_done_more_than_n_days_ago() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "journals/2026-10-29.md",
        "- DONE old
  done:: [[2026-10-10]]
- DONE edge
  done:: [[2026-10-15]]
- DONE recent
  done:: [[2026-10-20]]
- DONE undated
",
    );
    put(
        t.path(),
        "pages/P.md",
        "- DONE p
  done:: [[2026-10-01]]
- DONE already
  done:: [[2026-10-01]]
  archived:: 2026-10-02
- TODO q
",
    );
    let mut s = open(t.path());
    let out = ok(&mut s, json!({"type": "board.archive", "keyword": "DONE"}));
    let mut keys: Vec<&str> = out.changed.iter().map(|p| p.key.as_str()).collect();
    keys.sort();
    assert_eq!(keys, ["2026-10-29", "p"]);
    assert_eq!(
        fs::read_to_string(t.path().join("journals/2026-10-29.md")).unwrap(),
        "- DONE old
  done:: [[2026-10-10]]
  archived:: 2026-10-29 14:05:09
- DONE edge
  done:: [[2026-10-15]]
- DONE recent
  done:: [[2026-10-20]]
- DONE undated
"
    );
    assert_eq!(
        fs::read_to_string(t.path().join("pages/P.md")).unwrap(),
        "- DONE p
  done:: [[2026-10-01]]
  archived:: 2026-10-29 14:05:09
- DONE already
  done:: [[2026-10-01]]
  archived:: 2026-10-02
- TODO q
"
    );
    ok(&mut s, json!({"type": "history.undo", "page": "p"}));
    assert_eq!(
        fs::read_to_string(t.path().join("pages/P.md")).unwrap(),
        "- DONE p
  done:: [[2026-10-01]]
- DONE already
  done:: [[2026-10-01]]
  archived:: 2026-10-02
- TODO q
"
    );
}

#[test]
fn archive_goes_on_past_a_page_that_cannot_be_saved() {
    let t = tempfile::tempdir().unwrap();
    let old = "- DONE x
  done:: [[2026-09-29]]
";
    put(t.path(), "pages/A.md", old);
    put(t.path(), "pages/B.md", old);
    let mut s = open(t.path());
    // Another program changes B after Breccia read it.
    let outside = "- DONE x
  done:: [[2026-09-29]]
- outside
";
    fs::write(t.path().join("pages/B.md"), outside).unwrap();
    let out = ok(&mut s, json!({"type": "board.archive", "keyword": "DONE"}));
    let mut keys: Vec<&str> = out.changed.iter().map(|p| p.key.as_str()).collect();
    keys.sort();
    assert_eq!(keys, ["a", "b"]);
    assert_eq!(
        fs::read_to_string(t.path().join("pages/A.md")).unwrap(),
        "- DONE x
  done:: [[2026-09-29]]
  archived:: 2026-10-29 14:05:09
"
    );
    assert_eq!(
        fs::read_to_string(t.path().join("pages/B.md")).unwrap(),
        outside
    );
    let failed: Vec<_> = out
        .notices
        .iter()
        .filter(|n| {
            matches!(n, Notice::SaveFailed { page, reason: SaveFailReason::ChangedOnDisk, .. } if page == "b")
        })
        .collect();
    assert_eq!(failed.len(), 1, "{:?}", out.notices);
}

#[test]
fn archive_old_is_refused_for_open_states_only() {
    let t = tempfile::tempdir().unwrap();
    let mut s = open(t.path());
    let e = cmd_on(
        &mut s,
        json!({"type": "board.archive", "keyword": "TODO"}),
        (2026, 10, 29),
    )
    .unwrap_err();
    assert_eq!(e.code, "notFinished");
}

#[test]
fn archived_cards_are_left_off_the_board() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "pages/P.md",
        "- DONE shown
  done:: [[2026-10-28]]
- DONE hidden
  done:: [[2026-10-01]]
  archived:: 2026-10-02
- TODO parked
  archived:: 2026-10-03
",
    );
    let mut s = open(t.path());
    let b = board(&mut s, 0);
    assert_eq!(titles(&b, "DONE"), ["DONE shown"]);
    assert_eq!(titles(&b, "TODO"), Vec::<String>::new());
    // Boards show only live tasks; the view carries no archived count or flag.
    let json = serde_json::to_value(&b).unwrap();
    assert!(json["columns"][0].get("archived").is_none(), "{json}");
    assert!(
        json["columns"][3]["cards"][0].get("archived").is_none(),
        "{json}"
    );
}

#[test]
fn the_archive_lists_archived_tasks_newest_done_first() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "pages/P.md",
        "- DONE older [[Anna]]
  done:: [[2026-09-01]]
  archived:: 2026-10-02
- DONE live
  done:: [[2026-09-01]]
- TODO parked
  archived:: 2026-10-03
- not a task
  archived:: 2026-10-04
- DONE newer
  done:: [[2026-09-20]]
  archived:: 2026-10-05
",
    );
    put(
        t.path(),
        "journals/2026-09-10.md",
        "- DONE same day, archived later
  done:: [[2026-09-01]]
  archived:: [[2026-10-09]]
",
    );
    let mut s = open(t.path());
    let rows = ok(&mut s, json!({"type": "archive.list"})).archive.unwrap();
    let texts: Vec<&str> = rows.iter().map(|r| r.text.as_str()).collect();
    assert_eq!(
        texts,
        ["newer", "same day, archived later", "older Anna", "parked"]
    );
    let json = serde_json::to_value(&rows[1]).unwrap();
    assert_eq!(json["page"], "2026-09-10");
    assert_eq!(json["pageName"], "2026-09-10");
    assert_eq!(json["pageKind"], "journal");
    assert_eq!(json["source"], "10 Sep 2026");
    assert_eq!(json["state"], "DONE");
    assert_eq!(json["color"], "green");
    assert_eq!(json["done"], "2026-09-01");
    assert_eq!(json["archived"], "2026-10-09");
    let parked = serde_json::to_value(&rows[3]).unwrap();
    assert_eq!(
        (parked["source"].as_str(), parked["done"].as_str()),
        (Some("P"), None)
    );
    assert_eq!(parked["archived"], "2026-10-03");
}

#[test]
fn set_archived_marks_and_unmarks_cards() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/P.md", "- TODO a\n- TODO b\n");
    let mut s = open(t.path());
    let b = board(&mut s, 0);
    let ids = vec![card(&b, "TODO a").id];
    ok(
        &mut s,
        json!({"type": "blocks.setArchived", "ids": ids, "archived": true}),
    );
    assert_eq!(
        fs::read_to_string(t.path().join("pages/P.md")).unwrap(),
        "- TODO a\n  archived:: 2026-10-29 14:05:09\n- TODO b\n"
    );
    assert_eq!(titles(&board(&mut s, 0), "TODO"), ["TODO b"]);
    ok(
        &mut s,
        json!({"type": "blocks.setArchived", "ids": ids, "archived": false}),
    );
    assert_eq!(
        fs::read_to_string(t.path().join("pages/P.md")).unwrap(),
        "- TODO a\n- TODO b\n"
    );
    // Moving an archived card to another column unarchives it.
    ok(
        &mut s,
        json!({"type": "blocks.setArchived", "ids": ids, "archived": true}),
    );
    ok(
        &mut s,
        json!({"type": "blocks.setState", "ids": ids, "keyword": "DOING"}),
    );
    assert_eq!(
        fs::read_to_string(t.path().join("pages/P.md")).unwrap(),
        "- DOING a\n- TODO b\n"
    );
}

fn boards_json() -> Value {
    json!([{"name": "Tasks", "columns": ["TODO", "DOING", "WAITING", "DONE"]},
           {"name": "Focus", "columns": ["DOING", "WAITING"]}])
}

#[test]
fn boards_set_keeps_comments_and_unknown_keys() {
    let t = tempfile::tempdir().unwrap();
    let text = format!(
        "# my states\n{}\n[extra]\nkey = 1 # mine\n",
        breccia_core::Config::default_toml()
    );
    put(t.path(), "breccia/config.toml", &text);
    let mut s = open(t.path());
    let out = ok(
        &mut s,
        json!({"type": "boards.set", "boards": boards_json()}),
    );
    let names: Vec<String> = out
        .config
        .unwrap()
        .boards
        .into_iter()
        .map(|b| b.name)
        .collect();
    assert_eq!(names, ["Tasks", "Focus"]);
    let file = fs::read_to_string(t.path().join("breccia/config.toml")).unwrap();
    assert!(file.starts_with("# my states\n"), "{file}");
    assert!(file.contains("key = 1 # mine"), "{file}");
    assert!(!file.contains('\r'), "{file}");
    let cfg = breccia_core::Config::parse(&file).unwrap();
    assert_eq!(cfg.boards[1].name, "Focus");
    assert_eq!(cfg.boards[1].columns, ["DOING", "WAITING"]);
    assert_eq!(cfg.states, breccia_core::Config::default().states);
    assert_eq!(board(&mut s, 1).columns.len(), 2);
}

#[test]
fn boards_set_keeps_comments_around_other_sections() {
    let t = tempfile::tempdir().unwrap();
    let text = "# top\n[[states]]\nkeyword = \"TODO\" # the start\n\n[[states]]\nkeyword = \"DONE\"\nfinished = true\n\n[git]\n# pulling\nenabled = false\n";
    put(t.path(), "breccia/config.toml", text);
    let mut s = open(t.path());
    ok(
        &mut s,
        json!({"type": "boards.set", "boards": [{"name": "B", "columns": ["TODO"]}]}),
    );
    let file = fs::read_to_string(t.path().join("breccia/config.toml")).unwrap();
    for keep in [
        "# top\n",
        "keyword = \"TODO\" # the start",
        "# pulling\nenabled = false",
    ] {
        assert!(file.contains(keep), "{keep}: {file}");
    }
    assert_eq!(
        breccia_core::Config::parse(&file).unwrap().boards[0].name,
        "B"
    );
}

#[test]
fn boards_set_writes_a_missing_config() {
    let t = tempfile::tempdir().unwrap();
    let mut s = open(t.path());
    ok(
        &mut s,
        json!({"type": "boards.set", "boards": boards_json()}),
    );
    let file = fs::read_to_string(t.path().join("breccia/config.toml")).unwrap();
    let cfg = breccia_core::Config::parse(&file).unwrap();
    assert_eq!(cfg.boards.len(), 2);
    assert_eq!(cfg.git, breccia_core::Config::default().git);
}

#[test]
fn zero_boards_stay_zero() {
    let t = tempfile::tempdir().unwrap();
    let mut s = open(t.path());
    ok(&mut s, json!({"type": "boards.set", "boards": []}));
    let mut s = open(t.path());
    let c = ok(&mut s, json!({"type": "config.get"})).config.unwrap();
    assert!(c.boards.is_empty());
    // A new board after zero boards becomes a plain `[[boards]]` table again.
    set_boards(&mut s, json!([{"name": "A", "columns": ["TODO"]}]));
    let file = config_file(t.path());
    assert!(
        file.contains("[[boards]]\nname = \"A\"\ncolumns = [\"TODO\"]\n"),
        "{file}"
    );
    assert!(!file.contains("boards = ["), "{file}");
}

#[test]
fn invalid_boards_are_refused_and_nothing_is_written() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "breccia/config.toml",
        breccia_core::Config::default_toml(),
    );
    let mut s = open(t.path());
    for boards in [
        json!([{"name": " ", "columns": ["TODO"]}]),
        json!([{"name": "A", "columns": ["TODO"]}, {"name": "a", "columns": ["DONE"]}]),
        json!([{"name": "A", "columns": []}]),
        json!([{"name": "A", "columns": ["LATER"]}]),
        json!([{"name": "A", "columns": ["TODO", "TODO"]}]),
    ] {
        let e = cmd_on(
            &mut s,
            json!({"type": "boards.set", "boards": boards}),
            (2026, 10, 29),
        )
        .unwrap_err();
        assert_eq!(e.code, "invalidBoard", "{boards}");
    }
    assert_eq!(
        fs::read_to_string(t.path().join("breccia/config.toml")).unwrap(),
        breccia_core::Config::default_toml()
    );
    assert_eq!(board(&mut s, 0).name, "Tasks");
}

#[test]
fn boards_set_saves_with_lf_even_if_the_file_had_crlf() {
    let t = tempfile::tempdir().unwrap();
    let text = format!(
        "# mine\r\n{}",
        breccia_core::Config::default_toml().replace('\n', "\r\n")
    );
    put(t.path(), "breccia/config.toml", &text);
    let mut s = open(t.path());
    ok(
        &mut s,
        json!({"type": "boards.set", "boards": boards_json()}),
    );
    let file = fs::read_to_string(t.path().join("breccia/config.toml")).unwrap();
    assert!(file.starts_with("# mine\n"), "{file:?}");
    assert!(!file.contains('\r'), "{file:?}");
}

#[test]
fn boards_set_keeps_the_decor_and_unknown_keys_of_a_renamed_board() {
    let t = tempfile::tempdir().unwrap();
    let text = "# my boards\n[[states]]\nkeyword = \"TODO\"\n\n[[states]]\nkeyword = \"DONE\"\n\n# my boards\n[[boards]]\nname = \"Old\" # the name\ncolumns = [\"TODO\"] # the columns\ncolor = \"red\"\n\n[git]\nenabled = false\n";
    put(t.path(), "breccia/config.toml", text);
    let mut s = open(t.path());
    ok(
        &mut s,
        json!({"type": "boards.set", "boards": [{"name": "New", "columns": ["TODO", "DONE"]}]}),
    );
    let file = fs::read_to_string(t.path().join("breccia/config.toml")).unwrap();
    for keep in [
        "# my boards\n[[boards]]",
        "# the name",
        "# the columns",
        "color = \"red\"",
        "name = \"New\"",
    ] {
        assert!(file.contains(keep), "{keep}: {file}");
    }
    let cfg = breccia_core::Config::parse(&file).unwrap();
    assert_eq!(cfg.boards.len(), 1);
    assert_eq!(cfg.boards[0].columns, ["TODO", "DONE"]);
}

#[test]
fn boards_set_adds_and_removes_tables_and_stores_trimmed_names() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "breccia/config.toml",
        breccia_core::Config::default_toml(),
    );
    let mut s = open(t.path());
    let out = ok(
        &mut s,
        json!({"type": "boards.set", "boards": [
        {"name": " A ", "columns": ["TODO"]}, {"name": "B", "columns": ["DONE"]}]}),
    );
    assert_eq!(out.config.unwrap().boards[0].name, "A");
    assert_eq!(board(&mut s, 0).name, "A");
    ok(
        &mut s,
        json!({"type": "boards.set", "boards": [{"name": "Z", "columns": ["DONE"]}]}),
    );
    let file = fs::read_to_string(t.path().join("breccia/config.toml")).unwrap();
    let cfg = breccia_core::Config::parse(&file).unwrap();
    assert_eq!(cfg.boards.len(), 1);
    assert_eq!(cfg.boards[0].name, "Z");
}

fn config_file(root: &Path) -> String {
    fs::read_to_string(root.join("breccia/config.toml")).unwrap()
}

fn set_boards(s: &mut Session, boards: Value) {
    ok(s, json!({"type": "boards.set", "boards": boards}));
}

const TWO_BOARDS: &str = "# work\n[[boards]]\nname = \"Work\"\ncolumns = [\"TODO\"]\nowner = \"me\"\n\n# home, keep small\n[[boards]]\nname = \"Home\"\ncolumns = [\"TODO\"]\nicon = \"house\"\n";

#[test]
fn deleting_a_board_keeps_the_comment_and_keys_of_the_next_one() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "breccia/config.toml", TWO_BOARDS);
    let mut s = open(t.path());
    set_boards(&mut s, json!([{"name": "Home", "columns": ["TODO"]}]));
    // Home's table keeps its own text, including the blank line above it; Work's
    // comment and key go with Work.
    assert_eq!(
        config_file(t.path()),
        "\n# home, keep small\n[[boards]]\nname = \"Home\"\ncolumns = [\"TODO\"]\nicon = \"house\"\n"
    );
}

#[test]
fn reordering_boards_moves_their_comments_and_keys_with_them() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "breccia/config.toml", TWO_BOARDS);
    let mut s = open(t.path());
    set_boards(
        &mut s,
        json!([{"name": "Home", "columns": ["TODO"]}, {"name": "Work", "columns": ["TODO"]}]),
    );
    let file = config_file(t.path());
    let home = file.find(
        "# home, keep small\n[[boards]]\nname = \"Home\"\ncolumns = [\"TODO\"]\nicon = \"house\"\n",
    );
    let work =
        file.find("# work\n[[boards]]\nname = \"Work\"\ncolumns = [\"TODO\"]\nowner = \"me\"\n");
    assert!(home.is_some() && work.is_some() && home < work, "{file}");
    let cfg = breccia_core::Config::parse(&file).unwrap();
    let names: Vec<_> = cfg.boards.iter().map(|b| b.name.as_str()).collect();
    assert_eq!(names, ["Home", "Work"]);
}

#[test]
fn adding_and_removing_a_board_leaves_the_rest_of_the_file_byte_identical() {
    let t = tempfile::tempdir().unwrap();
    let text = "# top\n[[states]]\nkeyword = \"TODO\" # the start\n\n[[states]]\nkeyword = \"DONE\"\nfinished = true\n\n# mine\n[[boards]]\nname = 'Tasks'\ncolumns = [\n  \"TODO\", # first\n  \"DONE\",\n]\n\n# pulling\n[git]\nenabled = false # off\n";
    put(t.path(), "breccia/config.toml", text);
    let mut s = open(t.path());
    set_boards(
        &mut s,
        json!([{"name": "Tasks", "columns": ["TODO", "DONE"]}, {"name": "Focus", "columns": ["DONE"]}]),
    );
    let file = config_file(t.path());
    let tasks =
        "# mine\n[[boards]]\nname = 'Tasks'\ncolumns = [\n  \"TODO\", # first\n  \"DONE\",\n]\n";
    for keep in [
        "# top\n[[states]]\nkeyword = \"TODO\" # the start\n",
        tasks,
        "# pulling\n[git]\nenabled = false # off\n",
    ] {
        assert!(file.contains(keep), "{keep}: {file}");
    }
    let cfg = breccia_core::Config::parse(&file).unwrap();
    assert_eq!(cfg.boards[1].name, "Focus");
    set_boards(
        &mut s,
        json!([{"name": "Tasks", "columns": ["TODO", "DONE"]}]),
    );
    assert_eq!(config_file(t.path()), text);
}

#[test]
fn a_board_with_an_unknown_column_does_not_block_other_edits() {
    let t = tempfile::tempdir().unwrap();
    let text = "[[states]]\nkeyword = \"TODO\"\n\n[[states]]\nkeyword = \"DONE\"\n\n[[boards]]\nname = \"Tasks\"\ncolumns = [\"TODO\", \"DONE\"]\n\n[[boards]]\nname = \"Old\"\ncolumns = [\"TODO\", \"BLOCKED\"]\n";
    put(t.path(), "breccia/config.toml", text);
    let mut s = open(t.path());
    set_boards(
        &mut s,
        json!([{"name": "Tasks", "columns": ["TODO", "DONE"]},
               {"name": "Old", "columns": ["TODO", "BLOCKED"]},
               {"name": "Focus", "columns": ["TODO"]}]),
    );
    let file = config_file(t.path());
    assert!(
        file.starts_with(text),
        "the old boards must stay as they were: {file}"
    );
    // A rename of that board keeps the column it already had.
    set_boards(
        &mut s,
        json!([{"name": "Tasks", "columns": ["TODO", "DONE"]},
               {"name": "Older", "columns": ["BLOCKED", "TODO"]},
               {"name": "Focus", "columns": ["TODO"]}]),
    );
    let cfg = breccia_core::Config::parse(&config_file(t.path())).unwrap();
    assert_eq!(cfg.boards[1].columns, ["BLOCKED", "TODO"]);
    // Any other board still cannot take a state that does not exist.
    let before = config_file(t.path());
    let e = cmd_on(
        &mut s,
        json!({"type": "boards.set", "boards": [
            {"name": "Tasks", "columns": ["TODO", "BLOCKED"]},
            {"name": "Older", "columns": ["BLOCKED", "TODO"]},
            {"name": "Focus", "columns": ["TODO"]}]}),
        (2026, 10, 29),
    )
    .unwrap_err();
    assert_eq!(e.code, "invalidBoard");
    assert_eq!(config_file(t.path()), before);
}

#[test]
fn boards_set_edits_an_inline_boards_array_in_place() {
    let t = tempfile::tempdir().unwrap();
    let text = "boards = [\n  # the main one\n  { name = \"Tasks\", columns = [\"TODO\"], icon = \"x\" },\n] # inline\n\n[git]\nenabled = false\n";
    put(t.path(), "breccia/config.toml", text);
    let mut s = open(t.path());
    set_boards(
        &mut s,
        json!([{"name": "Tasks", "columns": ["TODO"]}, {"name": "Focus", "columns": ["DONE"]}]),
    );
    let file = config_file(t.path());
    for keep in [
        "  # the main one\n  { name = \"Tasks\", columns = [\"TODO\"], icon = \"x\" },",
        "] # inline\n",
        "[git]\nenabled = false\n",
    ] {
        assert!(file.contains(keep), "{keep}: {file}");
    }
    let cfg = breccia_core::Config::parse(&file).unwrap();
    let names: Vec<_> = cfg.boards.iter().map(|b| b.name.as_str()).collect();
    assert_eq!(names, ["Tasks", "Focus"]);
    assert_eq!(cfg.boards[1].columns, ["DONE"]);
    set_boards(&mut s, json!([{"name": "Tasks", "columns": ["TODO"]}]));
    assert_eq!(config_file(t.path()), text);
}

#[test]
fn a_done_property_without_a_day_keeps_the_card_visible() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "pages/P.md",
        "- DONE dated\n  done:: [[2026-10-20]]\n- DONE undated\n  done:: [[Project X]]\n",
    );
    let mut s = open(t.path());
    assert_eq!(
        titles(&board(&mut s, 0), "DONE"),
        ["DONE dated", "DONE undated"]
    );
    assert_eq!(card(&board(&mut s, 0), "DONE undated").done, None);
}

#[test]
fn a_parent_line_is_the_first_line_of_a_multi_line_task() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "pages/P.md",
        "- TODO Release\n  owner:: [[Anna]]\n\t- TODO Sub\n",
    );
    let mut s = open(t.path());
    assert_eq!(
        card(&board(&mut s, 0), "TODO Sub").parent.as_deref(),
        Some("Release")
    );
}

/// Spec §2: a `boards.set` must not write the session's old boards over a
/// config.toml that changed on disk since the session read it (a pull, an
/// editor). It is refused, and the session reads the new file, so the next
/// `boards.set`, made from the new list, keeps the other machine's board.
#[test]
fn boards_set_is_refused_when_the_config_changed_on_disk() {
    let t = tempfile::tempdir().unwrap();
    let text = format!("# mine\n{}", breccia_core::Config::default_toml());
    put(t.path(), "breccia/config.toml", &text);
    let mut s = open(t.path());
    let theirs = format!("{text}\n[[boards]]\nname = \"Theirs\" # from B\ncolumns = [\"DONE\"]\n");
    put(t.path(), "breccia/config.toml", &theirs);

    let err = cmd_on(
        &mut s,
        json!({"type": "boards.set", "boards": [{"name": "Tasks", "columns": ["TODO"]}]}),
        (2026, 10, 29),
    )
    .expect_err("the stale list must be refused");
    assert_eq!(err.code, "configChanged");
    let file = fs::read_to_string(t.path().join("breccia/config.toml")).unwrap();
    assert_eq!(file, theirs, "the file was not touched");

    let c = ok(&mut s, json!({"type": "config.get"})).config.unwrap();
    let names: Vec<String> = c.boards.iter().map(|b| b.name.clone()).collect();
    assert_eq!(names, ["Tasks", "Theirs"], "the session read the new file");

    ok(
        &mut s,
        json!({"type": "boards.set", "boards": [
            {"name": "Tasks", "columns": ["TODO"]},
            {"name": "Theirs", "columns": ["DONE"]}
        ]}),
    );
    let file = fs::read_to_string(t.path().join("breccia/config.toml")).unwrap();
    assert!(file.starts_with("# mine\n"), "{file}");
    assert!(file.contains("name = \"Theirs\" # from B"), "{file}");
    // Its own write is not a change on disk.
    ok(
        &mut s,
        json!({"type": "boards.set", "boards": [{"name": "Tasks", "columns": ["DOING"]}, {"name": "Theirs", "columns": ["DONE"]}]}),
    );
}

#[test]
fn boards_set_is_refused_while_the_changed_config_does_not_parse() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "breccia/config.toml",
        breccia_core::Config::default_toml(),
    );
    let mut s = open(t.path());
    put(t.path(), "breccia/config.toml", "[[states]\nbroken");
    for _ in 0..2 {
        let err = cmd_on(
            &mut s,
            json!({"type": "boards.set", "boards": [{"name": "Tasks", "columns": ["TODO"]}]}),
            (2026, 10, 29),
        )
        .expect_err("refused");
        assert_eq!(err.code, "configChanged");
    }
    let file = fs::read_to_string(t.path().join("breccia/config.toml")).unwrap();
    assert_eq!(file, "[[states]\nbroken");
}

#[test]
fn a_column_listed_twice_shows_once() {
    let t = tempfile::tempdir().unwrap();
    let toml = breccia_core::Config::default_toml().replace(
        "columns = [\"TODO\", \"DOING\", \"WAITING\", \"DONE\"]",
        "columns = [\"TODO\", \"DOING\", \"TODO\"]",
    );
    put(t.path(), "breccia/config.toml", &toml);
    put(t.path(), "pages/P.md", "- TODO a\n");
    let mut s = open(t.path());
    let b = board(&mut s, 0);
    let kws: Vec<&str> = b.columns.iter().map(|c| c.keyword.as_str()).collect();
    assert_eq!(kws, ["TODO", "DOING"]);
    assert_eq!(titles(&b, "TODO"), ["TODO a"]);
    assert_eq!(
        fs::read_to_string(t.path().join("breccia/config.toml")).unwrap(),
        toml
    );
}

#[test]
fn the_archive_lists_created_done_times_and_how_long_a_task_took() {
    // The Archive table also shows the created time and the duration.
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "pages/P.md",
        "- DONE timed
  created:: 2026-08-29 09:00:00
  done:: [[2026-09-01]] 14:05:09
  archived:: 2026-10-06 08:00:00
- DONE untimed
  done:: [[2026-08-01]]
  archived:: 2026-10-02
",
    );
    let mut s = open(t.path());
    let rows = ok(&mut s, json!({"type": "archive.list"})).archive.unwrap();
    let timed = serde_json::to_value(&rows[0]).unwrap();
    assert_eq!(timed["created"], "2026-08-29 09:00");
    assert_eq!(timed["done"], "2026-09-01 14:05");
    assert_eq!(timed["took"], "3 days");
    assert_eq!(timed["archived"], "2026-10-06");
    let untimed = serde_json::to_value(&rows[1]).unwrap();
    assert_eq!(untimed["created"], serde_json::Value::Null);
    assert_eq!(untimed["done"], "2026-08-01");
    assert_eq!(untimed["took"], serde_json::Value::Null);
}
