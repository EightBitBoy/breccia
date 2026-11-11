use breccia_core::session::Notice;
use breccia_core::{BlockId, Clock, Command, CommandError, Output, Recovery, Session};
use chrono::NaiveDate;
use serde_json::{Value, json};
use std::fs;
use std::path::Path;
use tempfile::TempDir;

fn clock(ms: u64) -> Clock {
    Clock {
        today: NaiveDate::from_ymd_opt(2026, 10, 29).unwrap(),
        time: chrono::NaiveTime::from_hms_opt(14, 5, 9).unwrap(),
        ms,
    }
}

fn cmd(s: &mut Session, json: Value, ms: u64) -> Result<Output, CommandError> {
    let req = serde_json::from_value(json!({"generation": s.generation(), "command": json}))
        .unwrap_or_else(|e| panic!("bad request: {e}"));
    s.run(req, clock(ms))
}

fn ok(s: &mut Session, json: Value, ms: u64) -> Output {
    let j = json.clone();
    cmd(s, json, ms).unwrap_or_else(|e| panic!("{j}: {e:?}"))
}

fn put(root: &Path, rel: &str, text: &str) {
    let p = root.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, text).unwrap();
}

fn folder(files: &[(&str, &str)]) -> (TempDir, Session) {
    let t = tempfile::tempdir().unwrap();
    for (rel, text) in files {
        put(t.path(), rel, text);
    }
    let mut s = Session::new();
    ok(&mut s, json!({"type": "folder.open", "path": t.path()}), 0);
    (t, s)
}

fn read(t: &TempDir, rel: &str) -> String {
    fs::read_to_string(t.path().join(rel)).unwrap()
}

/// Block ids of a page, in document order.
fn ids(s: &mut Session, key: &str) -> Vec<BlockId> {
    let out = ok(s, json!({"type": "page.get", "key": key}), 0);
    out.page.unwrap().blocks.iter().map(|b| b.id).collect()
}

#[test]
fn command_names_deserialize() {
    for j in [
        json!({"type":"block.setText","id":1,"text":"x"}),
        json!({"type":"blocks.moveUp","ids":[1,2]}),
        json!({"type":"block.delete","id":1}),
        json!({"type":"block.split","id":1,"at":3}),
        json!({"type":"history.undo","page":"p"}),
        json!({"type":"blocks.setState","ids":[1],"keyword":null}),
        json!({"type": "search.query", "text": "x"}),
        json!({"type":"page.today"}),
        json!({"type":"page.setColor","key":"p","color":"red"}),
        json!({"type":"page.setColor","key":"p","color":null}),
        json!({"type":"journal.feed"}),
        json!({"type":"pages.get","keys":["a"]}),
        json!({"type": "board.get", "index": 0}),
        json!({"type": "journal.append", "text": "TODO"}),
        json!({"type": "block.settle", "id": 1, "before": null}),
        json!({"type": "board.archive", "keyword": "DONE"}),
        json!({"type": "boards.set", "boards": [], "version": 0}),
        json!({"type": "states.usage"}),
        json!({"type": "states.set", "states": [{"keyword": "A", "color": "grey", "finished": false, "inCycle": true}],
               "renames": [{"from": "B", "to": "A"}], "version": 0}),
        json!({"type": "config.setGit", "enabled": true, "commitDelayMinutes": 5, "pullIntervalMinutes": 5, "version": 0}),
        json!({"type": "config.setBoard", "archiveAfterDays": 30, "version": 0}),
        json!({"type": "page.show", "key": "p"}),
        json!({"type": "pages.table"}),
        json!({"type": "graph.get"}),
        json!({"type": "graph.saveLayout", "positions": [{"key": "a", "x": 1.0, "y": 2.0}]}),
        json!({"type": "git.status"}),
        json!({"type": "git.sync"}),
        json!({"type": "git.init"}),
        json!({"type": "git.log", "skip": 200, "limit": 200}),
    ] {
        serde_json::from_value::<Command>(j.clone()).unwrap_or_else(|e| panic!("{j}: {e}"));
    }
}

#[test]
fn git_commands_belong_to_the_shell() {
    let (_t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    for name in ["git.status", "git.sync", "git.init"] {
        assert_eq!(
            cmd(&mut s, json!({"type": name}), 0).unwrap_err().code,
            "shellOnly"
        );
    }
    assert_eq!(
        cmd(
            &mut s,
            json!({"type": "git.log", "skip": 0, "limit": 200}),
            0
        )
        .unwrap_err()
        .code,
        "shellOnly"
    );
}

#[test]
fn retry_saves_writes_what_could_not_be_saved() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let a = ids(&mut s, "p")[0];
    put(t.path(), "pages/P.md", "- other\n");
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"mine"}),
        0,
    );
    assert_eq!(s.retry_saves(), 1, "still changed on disk");
    assert_eq!(read(&t, "pages/P.md"), "- other\n");
    put(t.path(), "pages/P.md", "- a\n");
    assert_eq!(s.retry_saves(), 0);
    assert_eq!(read(&t, "pages/P.md"), "- mine\n");
}

#[test]
fn git_target_names_the_folder_and_its_settings() {
    assert!(Session::new().git_target().is_none());
    let (t, s) = folder(&[("pages/P.md", "- a\n")]);
    let (root, generation, settings) = s.git_target().unwrap();
    assert_eq!(root, t.path());
    assert_eq!(generation, s.generation());
    assert!(settings.enabled);
}

#[test]
fn stale_generation_is_refused() {
    let (_t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let r = s.run(
        serde_json::from_value(
            json!({"generation": 999, "command": {"type":"page.get","key":"p"}}),
        )
        .unwrap(),
        clock(0),
    );
    assert_eq!(r.unwrap_err().code, "stale");
}

#[test]
fn set_text_saves_and_returns_page() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let a = ids(&mut s, "p")[0];
    let out = ok(&mut s, json!({"type":"block.setText","id":a,"text":"b"}), 0);
    assert_eq!(read(&t, "pages/P.md"), "- b\n");
    let page = out.page.unwrap();
    assert_eq!(page.blocks[0].html, "<p>b</p>\n");
    assert!(out.focus.is_none());
    assert!(out.notices.is_empty());
}

#[test]
fn set_text_that_makes_blocks_focuses_the_last_one() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let a = ids(&mut s, "p")[0];
    let out = ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"a\n- b\n- cé"}),
        0,
    );
    // The typed bullets have no indent of their own, so they land as children.
    assert_eq!(read(&t, "pages/P.md"), "- a\n\t- b\n\t- cé\n");
    let page = out.page.unwrap();
    let texts: Vec<&str> = page.blocks.iter().map(|b| b.text.as_str()).collect();
    assert_eq!(texts, ["a", "b", "cé"]);
    let focus = out.focus.expect("focus on the last new block");
    assert_eq!(focus.id, page.blocks[2].id);
    assert_eq!(focus.at, "cé".len());
}

#[test]
fn split_after_emoji() {
    let (t, mut s) = folder(&[("pages/P.md", "- 😀x\n")]);
    let a = ids(&mut s, "p")[0];
    let out = ok(&mut s, json!({"type":"block.split","id":a,"at":4}), 0);
    assert_eq!(read(&t, "pages/P.md"), "- 😀\n- x\n");
    let page = out.page.unwrap();
    let focus = out.focus.unwrap();
    assert_eq!(focus.id, page.blocks[1].id);
    assert_eq!(focus.at, 0);
}

#[test]
fn today_creates_journal_without_file() {
    let (t, mut s) = folder(&[]);
    let out = ok(&mut s, json!({"type":"page.today"}), 0);
    let page = out.page.unwrap();
    assert_eq!(page.key, "2026-10-29");
    let v = serde_json::to_value(&page).unwrap();
    assert_eq!(v["kind"], "journal");
    assert_eq!(page.title, "Thursday, 29 Oct 2026");
    assert!(page.blocks.is_empty());

    let out = ok(
        &mut s,
        json!({"type":"block.insert","page":"2026-10-29","after":null,"text":""}),
        0,
    );
    assert!(out.notices.is_empty());
    let focus = out.focus.unwrap();
    assert_eq!(focus.at, 0);
    let file = t.path().join("journals/2026-10-29.md");
    assert!(!file.exists());

    ok(
        &mut s,
        json!({"type":"block.setText","id":focus.id,"text":"hi"}),
        0,
    );
    assert_eq!(fs::read_to_string(file).unwrap(), "- hi\n");
}

#[test]
fn undo_restores_the_text_and_saves_it_with_lf() {
    let original = "- a  \r\n- b\r\n";
    let (t, mut s) = folder(&[("pages/P.md", original)]);
    let a = ids(&mut s, "p")[0];
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"a1"}),
        0,
    );
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"a12"}),
        300,
    );
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"a123"}),
        600,
    );
    ok(&mut s, json!({"type":"block.split","id":a,"at":2}), 2000);
    assert_eq!(read(&t, "pages/P.md"), "- a1\n- 23\n- b\n");

    let undo = json!({"type":"history.undo","page":"p"});
    let redo = json!({"type":"history.redo","page":"p"});
    ok(&mut s, undo.clone(), 2100);
    assert_eq!(read(&t, "pages/P.md"), "- a123\n- b\n");
    let out = ok(&mut s, undo.clone(), 2200);
    assert_eq!(read(&t, "pages/P.md"), "- a  \n- b\n");
    assert_eq!(out.page.unwrap().blocks[0].text, "a  ");
    // The stack is empty now: a no-op that still returns the page.
    let out = ok(&mut s, undo.clone(), 2300);
    assert_eq!(read(&t, "pages/P.md"), "- a  \n- b\n");
    assert_eq!(out.page.unwrap().blocks.len(), 2);

    ok(&mut s, redo.clone(), 2400);
    assert_eq!(read(&t, "pages/P.md"), "- a123\n- b\n");

    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"x"}),
        5000,
    );
    assert_eq!(read(&t, "pages/P.md"), "- x\n- b\n");
    let out = ok(&mut s, redo, 5100);
    assert_eq!(read(&t, "pages/P.md"), "- x\n- b\n");
    assert!(out.page.is_some());
}

#[test]
fn coalescing_stops_after_a_pause_or_another_block() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n")]);
    let [a, _]: [BlockId; 2] = ids(&mut s, "p").try_into().unwrap();
    let undo = json!({"type":"history.undo","page":"p"});
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"a1"}),
        0,
    );
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"a2"}),
        1500,
    );
    ok(&mut s, undo.clone(), 1600);
    assert_eq!(read(&t, "pages/P.md"), "- a1\n- b\n");
    ok(&mut s, undo.clone(), 1700);
    assert_eq!(read(&t, "pages/P.md"), "- a\n- b\n");

    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n")]);
    let [a, b]: [BlockId; 2] = ids(&mut s, "p").try_into().unwrap();
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"a1"}),
        0,
    );
    ok(
        &mut s,
        json!({"type":"block.setText","id":b,"text":"b1"}),
        100,
    );
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"a2"}),
        200,
    );
    assert_eq!(read(&t, "pages/P.md"), "- a2\n- b1\n");
    ok(&mut s, undo.clone(), 300);
    assert_eq!(read(&t, "pages/P.md"), "- a1\n- b1\n");
    ok(&mut s, undo.clone(), 400);
    assert_eq!(read(&t, "pages/P.md"), "- a1\n- b\n");
    ok(&mut s, undo.clone(), 500);
    assert_eq!(read(&t, "pages/P.md"), "- a\n- b\n");
}

#[test]
fn batch_indent_moves_selected_roots_together() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n\t- c\n- d\n")]);
    let [_, b, c, d]: [BlockId; 4] = ids(&mut s, "p").try_into().unwrap();
    let out = ok(&mut s, json!({"type":"blocks.indent","ids":[b, c, d]}), 0);
    assert_eq!(read(&t, "pages/P.md"), "- a\n\t- b\n\t\t- c\n\t- d\n");
    assert!(out.focus.is_none());
    // One undo step for the whole batch.
    ok(&mut s, json!({"type":"history.undo","page":"p"}), 0);
    assert_eq!(read(&t, "pages/P.md"), "- a\n- b\n\t- c\n- d\n");
}

#[test]
fn batch_is_all_or_nothing() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n")]);
    let [a, b]: [BlockId; 2] = ids(&mut s, "p").try_into().unwrap();
    // Listed out of order: the roots still run in document order.
    let err = cmd(&mut s, json!({"type":"blocks.indent","ids":[b, a]}), 0).unwrap_err();
    assert_eq!(err.code, "noPreviousSibling");
    assert_eq!(read(&t, "pages/P.md"), "- a\n- b\n");
    let out = ok(&mut s, json!({"type":"page.get","key":"p"}), 0);
    assert!(out.page.unwrap().blocks.iter().all(|b| b.depth == 0));
}

#[test]
fn batch_move_down_keeps_order() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n- c\n")]);
    let [a, b, _]: [BlockId; 3] = ids(&mut s, "p").try_into().unwrap();
    ok(&mut s, json!({"type":"blocks.moveDown","ids":[a, b]}), 0);
    assert_eq!(read(&t, "pages/P.md"), "- c\n- a\n- b\n");
}

#[test]
fn set_state_on_selection_and_cycle() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n")]);
    let [a, b]: [BlockId; 2] = ids(&mut s, "p").try_into().unwrap();
    let out = ok(
        &mut s,
        json!({"type":"blocks.setState","ids":[a, b],"keyword":"DONE"}),
        0,
    );
    assert_eq!(
        read(&t, "pages/P.md"),
        "- DONE a\n  created:: 2026-10-29 14:05:09\n  done:: [[2026-10-29]] 14:05:09\n- DONE b\n  created:: 2026-10-29 14:05:09\n  done:: [[2026-10-29]] 14:05:09\n"
    );
    let page = out.page.unwrap();
    assert_eq!(page.blocks[0].state.as_deref(), Some("DONE"));
    assert!(page.blocks[0].finished);

    // After the last state the cycle starts again at the first.
    let out = ok(&mut s, json!({"type":"block.cycleState","id":a}), 0);
    assert_eq!(
        read(&t, "pages/P.md"),
        "- TODO a\n  created:: 2026-10-29 14:05:09\n- DONE b\n  created:: 2026-10-29 14:05:09\n  done:: [[2026-10-29]] 14:05:09\n"
    );
    let page = out.page.unwrap();
    assert_eq!(page.blocks[0].state.as_deref(), Some("TODO"));
    assert!(!page.blocks[0].finished);
    // Removing the state is its own command.
    ok(
        &mut s,
        json!({"type":"blocks.setState","ids":[a],"keyword":null}),
        0,
    );
    assert_eq!(
        read(&t, "pages/P.md"),
        "- a\n- DONE b\n  created:: 2026-10-29 14:05:09\n  done:: [[2026-10-29]] 14:05:09\n"
    );

    // A click on the label steps on to the next state and wraps, without removing it.
    ok(&mut s, json!({"type":"block.stepState","id":b}), 0);
    assert_eq!(
        read(&t, "pages/P.md"),
        "- a
- TODO b
  created:: 2026-10-29 14:05:09
"
    );

    let err = cmd(
        &mut s,
        json!({"type":"blocks.setState","ids":[a, b],"keyword":"NOPE"}),
        0,
    )
    .unwrap_err();
    assert_eq!(err.code, "unknownState");
}

#[test]
fn refusals_surface_as_error_codes() {
    let text = "- ```\n  one\n  two\n  ```\n";
    let (t, mut s) = folder(&[("pages/P.md", text)]);
    let a = ids(&mut s, "p")[0];
    // Byte 4 is the start of `one`, inside the fence.
    let err = cmd(&mut s, json!({"type":"block.split","id":a,"at":4}), 0).unwrap_err();
    assert_eq!(err.code, "insideFence");
    assert!(!err.message.is_empty());
    assert_eq!(read(&t, "pages/P.md"), text);
    // A refused command leaves no undo step behind.
    ok(&mut s, json!({"type":"history.undo","page":"p"}), 0);
    assert_eq!(read(&t, "pages/P.md"), text);
}

#[test]
fn save_failure_keeps_edit_and_reports() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let a = ids(&mut s, "p")[0];
    put(t.path(), "pages/P.md", "- theirs\n");
    let out = ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"mine"}),
        0,
    );
    assert_eq!(out.notices.len(), 1);
    assert!(matches!(
        &out.notices[0],
        Notice::SaveFailed { page, reason, .. }
            if page == "p" && serde_json::to_value(reason).unwrap() == "changedOnDisk"
    ));
    assert_eq!(out.page.unwrap().blocks[0].text, "mine");
    assert_eq!(read(&t, "pages/P.md"), "- theirs\n");

    let out = ok(&mut s, json!({"type":"page.overwrite","key":"p"}), 0);
    assert!(out.notices.is_empty());
    assert_eq!(read(&t, "pages/P.md"), "- mine\n");

    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    put(t.path(), "pages/P.md", "- c\n");
    let out = ok(&mut s, json!({"type":"page.reload","key":"p"}), 0);
    assert_eq!(out.page.unwrap().blocks[0].text, "c");
}

#[test]
fn output_serializes_camel_case() {
    let (t, mut s) = folder(&[
        ("pages/P.md", "- a\n\t- b\n"),
        ("journals/notes.md", "- x\n"),
    ]);
    let v = serde_json::to_value(ok(&mut s, json!({"type":"page.get","key":"p"}), 0)).unwrap();
    let page = &v["page"];
    assert!(page.get("preambleHtml").is_some(), "{v}");
    assert_eq!(page["kind"], "page");
    assert_eq!(page["blocks"][0]["hasChildren"], true);
    assert_eq!(page["blocks"][1]["hasChildren"], false);
    assert!(page["blocks"][0]["id"].is_u64());

    let v = serde_json::to_value(ok(&mut s, json!({"type":"folder.status"}), 0)).unwrap();
    assert_eq!(v["folder"]["generation"], 1);
    assert!(v["page"].is_null() && v["config"].is_null());

    let v = serde_json::to_value(ok(&mut s, json!({"type":"config.get"}), 0)).unwrap();
    assert_eq!(v["config"]["states"][0]["keyword"], "TODO");
    assert_eq!(v["config"]["states"][0]["inCycle"], true);
    let v = serde_json::to_value(ok(&mut s, json!({"type":"folder.status"}), 0)).unwrap();
    assert!(v.get("board").is_some(), "{v}");

    // Opening reports the bad journal name as a notice.
    let mut s2 = Session::new();
    let v = serde_json::to_value(ok(
        &mut s2,
        json!({"type":"folder.open","path":t.path()}),
        0,
    ))
    .unwrap();
    assert_eq!(v["notices"][0]["kind"], "loadWarning");
    assert!(v["notices"][0]["message"].is_string());
}

#[test]
fn no_folder_and_unknown_page() {
    let mut s = Session::new();
    let err = cmd(&mut s, json!({"type":"page.get","key":"p"}), 0).unwrap_err();
    assert_eq!(err.code, "noFolder");
    let v = serde_json::to_value(ok(&mut s, json!({"type":"folder.status"}), 0)).unwrap();
    assert!(v["folder"]["path"].is_null());
    assert_eq!(v["folder"]["generation"], 0);

    let (_t, mut s) = folder(&[]);
    let err = cmd(&mut s, json!({"type":"page.get","key":"nope"}), 0).unwrap_err();
    assert_eq!(err.code, "unknownPage");
    let err = cmd(&mut s, json!({"type":"page.open","name":"a]]b"}), 0).unwrap_err();
    assert_eq!(err.code, "invalidName");
    let err = cmd(
        &mut s,
        json!({"type":"block.setText","id":999,"text":"x"}),
        0,
    )
    .unwrap_err();
    assert_eq!(err.code, "unknownBlock");
}

fn depths(s: &mut Session, key: &str) -> Vec<usize> {
    let out = ok(s, json!({"type": "page.get", "key": key}), 0);
    out.page.unwrap().blocks.iter().map(|b| b.depth).collect()
}

#[test]
fn edits_that_change_nothing_leave_history_alone() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n")]);
    let [a, b]: [BlockId; 2] = ids(&mut s, "p").try_into().unwrap();
    let undo = json!({"type":"history.undo","page":"p"});
    let redo = json!({"type":"history.redo","page":"p"});
    let done = "- DONE a\n  created:: 2026-10-29 14:05:09\n  done:: [[2026-10-29]] 14:05:09\n";
    ok(
        &mut s,
        json!({"type":"blocks.setState","ids":[a],"keyword":"DONE"}),
        0,
    );
    ok(
        &mut s,
        json!({"type":"block.setText","id":b,"text":"b1"}),
        0,
    );
    // Same text (a blur) and the same state: no undo steps.
    ok(
        &mut s,
        json!({"type":"block.setText","id":b,"text":"b1"}),
        5000,
    );
    ok(
        &mut s,
        json!({"type":"blocks.setState","ids":[a],"keyword":"DONE"}),
        5000,
    );
    ok(&mut s, undo.clone(), 6000);
    assert_eq!(read(&t, "pages/P.md"), format!("{done}- b\n"));
    ok(&mut s, undo.clone(), 6100);
    assert_eq!(read(&t, "pages/P.md"), "- a\n- b\n");

    // Redo survives the same no-ops.
    ok(&mut s, redo.clone(), 6200);
    ok(
        &mut s,
        json!({"type":"block.setText","id":b,"text":"b"}),
        9000,
    );
    ok(
        &mut s,
        json!({"type":"blocks.setState","ids":[a],"keyword":"DONE"}),
        9000,
    );
    ok(&mut s, redo.clone(), 9100);
    assert_eq!(read(&t, "pages/P.md"), format!("{done}- b1\n"));

    // Typing right after a no-op still gets its own undo step.
    ok(
        &mut s,
        json!({"type":"block.setText","id":b,"text":"b1"}),
        20000,
    );
    ok(
        &mut s,
        json!({"type":"block.setText","id":b,"text":"b2"}),
        20100,
    );
    ok(&mut s, undo, 20200);
    assert_eq!(read(&t, "pages/P.md"), format!("{done}- b1\n"));
}

#[test]
fn failed_batch_step_rolls_back_earlier_steps() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n\t- b\n- c\n")]);
    let [a, b, c]: [BlockId; 3] = ids(&mut s, "p").try_into().unwrap();
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"a1"}),
        0,
    );
    // b outdents, then c has no parent: b goes back too.
    let err = cmd(&mut s, json!({"type":"blocks.outdent","ids":[b, c]}), 5000).unwrap_err();
    assert_eq!(err.code, "noParent");
    assert_eq!(read(&t, "pages/P.md"), "- a1\n\t- b\n- c\n");
    assert_eq!(depths(&mut s, "p"), [0, 1, 0]);
    // The batch pushed no undo step: undo goes back past the setText.
    ok(&mut s, json!({"type":"history.undo","page":"p"}), 6000);
    assert_eq!(read(&t, "pages/P.md"), "- a\n\t- b\n- c\n");
}

#[test]
fn undo_keeps_at_most_200_steps() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let a = ids(&mut s, "p")[0];
    for n in 1..=201u64 {
        ok(
            &mut s,
            json!({"type":"block.setText","id":a,"text":format!("a{n}")}),
            n * 5000,
        );
    }
    let undo = json!({"type":"history.undo","page":"p"});
    for _ in 0..200 {
        ok(&mut s, undo.clone(), 2_000_000);
    }
    // The first step was dropped: the oldest state left is after edit 1.
    assert_eq!(read(&t, "pages/P.md"), "- a1\n");
    ok(&mut s, undo, 2_000_000);
    assert_eq!(read(&t, "pages/P.md"), "- a1\n");
}

#[test]
fn coalesced_typing_clears_redo() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n")]);
    let [a, b]: [BlockId; 2] = ids(&mut s, "p").try_into().unwrap();
    ok(
        &mut s,
        json!({"type":"block.setText","id":b,"text":"b1"}),
        0,
    );
    ok(&mut s, json!({"type":"history.undo","page":"p"}), 100);
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"a1"}),
        1000,
    );
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"a12"}),
        1100,
    );
    ok(&mut s, json!({"type":"history.redo","page":"p"}), 1200);
    assert_eq!(read(&t, "pages/P.md"), "- a12\n- b\n");
    // The two setTexts were one step.
    ok(&mut s, json!({"type":"history.undo","page":"p"}), 1300);
    assert_eq!(read(&t, "pages/P.md"), "- a\n- b\n");
}

#[test]
fn reload_clears_the_page_history() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n"), ("pages/Q.md", "- q\n")]);
    let a = ids(&mut s, "p")[0];
    let q = ids(&mut s, "q")[0];
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"a1"}),
        0,
    );
    ok(
        &mut s,
        json!({"type":"block.setText","id":q,"text":"q1"}),
        0,
    );
    put(t.path(), "pages/P.md", "- c\n");
    ok(&mut s, json!({"type":"page.reload","key":"p"}), 0);
    let out = ok(&mut s, json!({"type":"history.undo","page":"p"}), 0);
    assert_eq!(out.page.unwrap().blocks[0].text, "c");
    assert_eq!(read(&t, "pages/P.md"), "- c\n");
    // Another page keeps its history.
    ok(&mut s, json!({"type":"history.undo","page":"q"}), 0);
    assert_eq!(read(&t, "pages/Q.md"), "- q\n");
}

#[test]
fn reopening_makes_old_requests_stale() {
    let (_t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let old = s.generation();
    let a = ids(&mut s, "p")[0];
    let other = tempfile::tempdir().unwrap();
    put(other.path(), "pages/P.md", "- x\n");
    ok(&mut s, json!({"type":"folder.open","path":other.path()}), 0);
    assert_eq!(s.generation(), old + 1);
    let req = serde_json::from_value(json!({
        "generation": old,
        "command": {"type":"block.setText","id":a,"text":"y"}
    }))
    .unwrap();
    assert_eq!(s.run(req, clock(0)).unwrap_err().code, "stale");
    assert_eq!(read(&other, "pages/P.md"), "- x\n");
}

#[test]
fn batch_with_a_block_of_another_page_is_refused() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n"), ("pages/Q.md", "- q\n")]);
    let b = ids(&mut s, "p")[1];
    let q = ids(&mut s, "q")[0];
    let err = cmd(&mut s, json!({"type":"blocks.indent","ids":[b, q]}), 0).unwrap_err();
    assert_eq!(err.code, "unknownBlock");
    assert_eq!(read(&t, "pages/P.md"), "- a\n- b\n");
    assert_eq!(read(&t, "pages/Q.md"), "- q\n");
    assert_eq!(depths(&mut s, "p"), [0, 0]);
}

#[test]
fn block_delete_is_one_undo_step() {
    let original = "- a\n- b\n\t- c\n- d\n";
    let (t, mut s) = folder(&[("pages/P.md", original)]);
    let b = ids(&mut s, "p")[1];
    let out = ok(&mut s, json!({"type":"block.delete","id":b}), 0);
    assert_eq!(read(&t, "pages/P.md"), "- a\n- d\n");
    assert!(out.focus.is_none());
    assert_eq!(out.page.unwrap().blocks.len(), 2);
    ok(&mut s, json!({"type":"history.undo","page":"p"}), 10);
    assert_eq!(read(&t, "pages/P.md"), original);
}

#[test]
fn block_delete_after_typing_undoes_to_the_typed_text() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n\t- c\n- d\n")]);
    let b = ids(&mut s, "p")[1];
    ok(
        &mut s,
        json!({"type":"block.setText","id":b,"text":"bee"}),
        0,
    );
    ok(&mut s, json!({"type":"block.delete","id":b}), 100);
    assert_eq!(read(&t, "pages/P.md"), "- a\n- d\n");
    ok(&mut s, json!({"type":"history.undo","page":"p"}), 200);
    assert_eq!(read(&t, "pages/P.md"), "- a\n- bee\n\t- c\n- d\n");
}

#[test]
fn block_delete_of_the_only_block_keeps_it_empty() {
    let original = "- a\n\t- c\n";
    let (t, mut s) = folder(&[("pages/P.md", original)]);
    let a = ids(&mut s, "p")[0];
    let out = ok(&mut s, json!({"type":"block.delete","id":a}), 0);
    assert_eq!(read(&t, "pages/P.md"), "-\n");
    let focus = out.focus.unwrap();
    assert_eq!((focus.id, focus.at), (a, 0));
    let page = out.page.unwrap();
    assert_eq!(page.blocks.len(), 1);
    assert_eq!(page.blocks[0].text, "");
    ok(&mut s, json!({"type":"history.undo","page":"p"}), 10);
    assert_eq!(read(&t, "pages/P.md"), original);
}

#[test]
fn blocks_delete_of_every_block_keeps_one_empty_block() {
    let original = "- a\n\t- c\n- b\n";
    let (t, mut s) = folder(&[("pages/P.md", original)]);
    let all = ids(&mut s, "p");
    let out = ok(
        &mut s,
        json!({"type":"blocks.delete","ids":all,"keepOne":true}),
        0,
    );
    assert_eq!(read(&t, "pages/P.md"), "-\n");
    let focus = out.focus.unwrap();
    assert_eq!(focus.at, 0);
    let page = out.page.unwrap();
    assert_eq!(page.blocks.len(), 1);
    assert_eq!(page.blocks[0].id, focus.id);
    assert_eq!(page.blocks[0].text, "");
    ok(&mut s, json!({"type":"history.undo","page":"p"}), 10);
    assert_eq!(read(&t, "pages/P.md"), original);
}

#[test]
fn blocks_delete_without_keep_one_can_leave_no_block() {
    let (t, mut s) = folder(&[(
        "pages/P.md",
        "- a
- b
",
    )]);
    let all = ids(&mut s, "p");
    let out = ok(&mut s, json!({"type":"blocks.delete","ids":all}), 0);
    assert_eq!(read(&t, "pages/P.md"), "");
    assert!(out.focus.is_none());
}

#[test]
fn blocks_delete_that_leaves_a_block_sets_no_focus() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n- c\n")]);
    let all = ids(&mut s, "p");
    let out = ok(&mut s, json!({"type":"blocks.delete","ids":&all[..2]}), 0);
    assert_eq!(read(&t, "pages/P.md"), "- c\n");
    assert!(out.focus.is_none());
}

#[test]
fn block_delete_of_an_unknown_block_is_refused() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n")]);
    let b = ids(&mut s, "p")[1];
    let err = cmd(&mut s, json!({"type":"block.delete","id":999_999}), 0).unwrap_err();
    assert_eq!(err.code, "unknownBlock");
    assert_eq!(read(&t, "pages/P.md"), "- a\n- b\n");
    // No undo step was recorded: undo changes nothing.
    ok(&mut s, json!({"type":"history.undo","page":"p"}), 10);
    assert_eq!(read(&t, "pages/P.md"), "- a\n- b\n");
    assert_eq!(ids(&mut s, "p")[1], b);
}

#[test]
fn block_delete_in_a_journal_day() {
    let original = "- one\n\t- sub\n- two\n";
    let (t, mut s) = folder(&[("journals/2026-10-28.md", original)]);
    let one = ids(&mut s, "2026-10-28")[0];
    let out = ok(&mut s, json!({"type":"block.delete","id":one}), 0);
    assert_eq!(read(&t, "journals/2026-10-28.md"), "- two\n");
    assert!(out.focus.is_none());
    let two = ids(&mut s, "2026-10-28")[0];
    let out = ok(&mut s, json!({"type":"block.delete","id":two}), 10);
    assert_eq!(read(&t, "journals/2026-10-28.md"), "-\n");
    assert_eq!(out.focus.unwrap().id, two);
    ok(
        &mut s,
        json!({"type":"history.undo","page":"2026-10-28"}),
        20,
    );
    ok(
        &mut s,
        json!({"type":"history.undo","page":"2026-10-28"}),
        30,
    );
    assert_eq!(read(&t, "journals/2026-10-28.md"), original);
}

#[test]
fn block_delete_never_overwrites_a_file_changed_elsewhere() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n")]);
    let b = ids(&mut s, "p")[1];
    put(t.path(), "pages/P.md", "- theirs\n");
    let out = ok(&mut s, json!({"type":"block.delete","id":b}), 0);
    assert_eq!(out.notices.len(), 1);
    assert!(matches!(
        &out.notices[0],
        Notice::SaveFailed { page, reason, .. }
            if page == "p" && serde_json::to_value(reason).unwrap() == "changedOnDisk"
    ));
    assert_eq!(read(&t, "pages/P.md"), "- theirs\n");
    assert_eq!(out.page.unwrap().blocks.len(), 1);
}

#[test]
fn insert_after_a_block_goes_past_its_children() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n\t- c\n- b\n")]);
    let a = ids(&mut s, "p")[0];
    let out = ok(
        &mut s,
        json!({"type":"block.insert","page":"p","after":a,"text":"né"}),
        0,
    );
    assert_eq!(read(&t, "pages/P.md"), "- a\n\t- c\n- né\n- b\n");
    let page = out.page.unwrap();
    let focus = out.focus.unwrap();
    assert_eq!(focus.id, page.blocks[2].id);
    assert_eq!(focus.at, "né".len());
}

#[test]
fn reload_after_a_title_change_returns_the_page_under_its_new_key() {
    let (t, mut s) = folder(&[("pages/x.md", "title:: Alpha\n- a\n")]);
    put(t.path(), "pages/x.md", "title:: Beta\n- a\n");
    let out = ok(&mut s, json!({"type":"page.reload","key":"alpha"}), 0);
    assert_eq!(out.page.unwrap().key, "beta");
    assert_eq!(out.removed, vec!["alpha".to_string()]);
}

#[test]
fn an_own_write_seen_by_the_watcher_keeps_the_typing_run() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let id = ids(&mut s, "p")[0];
    ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "ab"}),
        100,
    );
    // The watcher reports the file Breccia just wrote: nothing changed.
    let out = ok(
        &mut s,
        json!({"type": "files.changed", "paths": ["pages/P.md"]}),
        150,
    );
    assert!(out.changed.is_empty() && out.removed.is_empty() && out.notices.is_empty());
    ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "abc"}),
        200,
    );
    ok(&mut s, json!({"type": "history.undo", "page": "p"}), 300);
    assert_eq!(read(&t, "pages/P.md"), "- a\n");
}

#[test]
fn an_external_change_still_ends_the_typing_run() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n"), ("pages/Q.md", "- q\n")]);
    let id = ids(&mut s, "p")[0];
    ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "ab"}),
        100,
    );
    put(t.path(), "pages/Q.md", "- q2\n");
    let out = ok(
        &mut s,
        json!({"type": "files.changed", "paths": ["pages/Q.md"]}),
        150,
    );
    assert_eq!(out.changed.len(), 1);
    ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "abc"}),
        200,
    );
    ok(&mut s, json!({"type": "history.undo", "page": "p"}), 300);
    assert_eq!(read(&t, "pages/P.md"), "- ab\n");
}

#[test]
fn page_show_opens_an_existing_page_and_never_creates_one() {
    let (_t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let out = ok(&mut s, json!({"type": "page.show", "key": "p"}), 0);
    assert_eq!(out.page.unwrap().name, "P");
    for _ in 0..2 {
        // A second refusal proves the first created nothing.
        let e = cmd(&mut s, json!({"type": "page.show", "key": "gone"}), 0).unwrap_err();
        assert_eq!(e.code, "unknownPage");
    }
}

#[test]
fn refs_of_an_unknown_page_are_refused() {
    let (_t, mut s) = folder(&[("pages/P.md", "- [[Q]]\n")]);
    // A link target without a file is a page once opened; before that, it is unknown.
    let e = cmd(&mut s, json!({"type": "page.refs", "key": "gone"}), 0).unwrap_err();
    assert_eq!(e.code, "unknownPage");
    ok(&mut s, json!({"type": "page.open", "name": "Q"}), 0);
    let refs = ok(&mut s, json!({"type": "page.refs", "key": "q"}), 0)
        .refs
        .unwrap();
    assert_eq!(refs.groups.len(), 1);
}

#[test]
fn an_outside_title_change_reports_the_rename() {
    let (t, mut s) = folder(&[(
        "pages/P.md",
        "title:: Old
- x
",
    )]);
    put(
        t.path(),
        "pages/P.md",
        "title:: New
- x
",
    );
    let out = ok(
        &mut s,
        json!({"type":"files.changed","paths":["pages/P.md"]}),
        0,
    );
    assert_eq!(
        serde_json::to_value(&out.renamed).unwrap(),
        json!([{"from":"old","to":"new"}])
    );
    assert_eq!(out.removed, ["old"]);
}

// ---- settings: states, git, board, the config guard ----

const CONFIG: &str = "breccia/config.toml";

fn version(s: &mut Session) -> u64 {
    ok(s, json!({"type": "config.get"}), 0)
        .config
        .unwrap()
        .version
}

fn default_states(s: &mut Session) -> Vec<Value> {
    let c = ok(s, json!({"type": "config.get"}), 0).config.unwrap();
    serde_json::to_value(&c.states)
        .unwrap()
        .as_array()
        .unwrap()
        .clone()
}

/// The default states with WAITING spelled BLOCKED.
fn blocked_states(s: &mut Session) -> Vec<Value> {
    let mut states = default_states(s);
    for st in &mut states {
        if st["keyword"] == "WAITING" {
            st["keyword"] = json!("BLOCKED");
        }
    }
    states
}

fn states_set(
    s: &mut Session,
    states: Vec<Value>,
    renames: Value,
    version: u64,
) -> Result<Output, CommandError> {
    cmd(
        s,
        json!({"type": "states.set", "states": states, "renames": renames, "version": version}),
        0,
    )
}

#[test]
fn states_set_renames_after_the_config_is_written() {
    let (t, mut s) = folder(&[("journals/2026-10-01.md", "- WAITING Call Ben\n")]);
    // An edit first, so there is history that a rename must not let undo cross.
    let id = ids(&mut s, "2026-10-01")[0];
    ok(
        &mut s,
        json!({"type":"block.setText","id":id,"text":"WAITING Call Ben2"}),
        0,
    );
    let states = blocked_states(&mut s);
    let v = version(&mut s);
    let out = states_set(
        &mut s,
        states,
        json!([{"from": "WAITING", "to": "BLOCKED"}]),
        v,
    )
    .unwrap();
    assert_eq!(
        read(&t, CONFIG),
        breccia_core::Config::default_toml().replace("\"WAITING\"", "\"BLOCKED\"")
    );
    assert_eq!(read(&t, "journals/2026-10-01.md"), "- BLOCKED Call Ben2\n");
    let config = out.config.unwrap();
    assert_eq!(config.states[2].keyword, "BLOCKED");
    assert!(config.version > v);
    assert_eq!(out.changed.len(), 1);
    assert_eq!(out.changed[0].key, "2026-10-01");
    assert_eq!(out.changed[0].blocks[0].state.as_deref(), Some("BLOCKED"));
    // Not an undo step: undo does nothing, and never brings WAITING back.
    ok(
        &mut s,
        json!({"type":"history.undo","page":"2026-10-01"}),
        9000,
    );
    assert_eq!(read(&t, "journals/2026-10-01.md"), "- BLOCKED Call Ben2\n");
    // Its own write is not an outside change.
    let v = version(&mut s);
    ok(
        &mut s,
        json!({"type":"config.setBoard","archiveAfterDays":20,"version":v}),
        0,
    );
}

#[test]
fn states_set_refuses_bad_lists_and_changes_nothing() {
    let (t, mut s) = folder(&[
        ("breccia/config.toml", breccia_core::Config::default_toml()),
        ("journals/2026-10-01.md", "- WAITING Call Ben\n"),
    ]);
    let v = version(&mut s);
    let good = default_states(&mut s);
    let with = |f: &dyn Fn(&mut Vec<Value>)| {
        let mut l = good.clone();
        f(&mut l);
        l
    };
    let renamed = |l: Vec<Value>, from: &str, to: &str| (l, json!([{"from": from, "to": to}]));
    let extra = json!({"keyword": "X", "color": "red", "finished": false, "inCycle": false});
    let bad: Vec<(Vec<Value>, Value)> = vec![
        // NoStates, a lowercase keyword, an unknown colour, a repeated keyword.
        (vec![], json!([])),
        (with(&|l| l[0]["keyword"] = json!("todo")), json!([])),
        (with(&|l| l[0]["color"] = json!("pink")), json!([])),
        (with(&|l| l.push(l[0].clone())), json!([])),
        // `to` missing from the list.
        renamed(good.clone(), "WAITING", "BLOCKED"),
        // An unknown `from`.
        renamed(
            with(&|l| l[2]["keyword"] = json!("BLOCKED")),
            "NOPE",
            "BLOCKED",
        ),
        // `to` already a current state.
        renamed(
            with(&|l| l[2]["keyword"] = json!("DOING")),
            "WAITING",
            "DOING",
        ),
        // `from` still in the list.
        renamed(with(&|l| l.push(extra.clone())), "WAITING", "X"),
        // The same `from` twice.
        (
            with(&|l| l[2]["keyword"] = json!("BLOCKED")),
            json!([{"from": "WAITING", "to": "BLOCKED"}, {"from": "WAITING", "to": "BLOCKED"}]),
        ),
    ];
    for (states, renames) in bad {
        let err = states_set(&mut s, states.clone(), renames.clone(), v).unwrap_err();
        assert_eq!(err.code, "invalidState", "{states:?} {renames}");
    }
    assert_eq!(read(&t, CONFIG), breccia_core::Config::default_toml());
    assert_eq!(read(&t, "journals/2026-10-01.md"), "- WAITING Call Ben\n");
}

#[test]
fn a_hand_written_colour_does_not_block_state_changes() {
    let text = "[[states]]\nkeyword = \"TODO\"\ncolor = \"pink\"\nin_cycle = true\n";
    let (t, mut s) = folder(&[("breccia/config.toml", text)]);
    let v = version(&mut s);
    let mut states = default_states(&mut s);
    assert_eq!(states[0]["color"], "pink");
    states.push(json!({"keyword": "LATER", "color": "blue", "finished": false, "inCycle": false}));
    states_set(&mut s, states.clone(), json!([]), v).unwrap();
    assert!(read(&t, CONFIG).contains("color = \"pink\""));
    let v = version(&mut s);
    states.push(json!({"keyword": "NEW", "color": "pink", "finished": false, "inCycle": false}));
    let err = states_set(&mut s, states, json!([]), v).unwrap_err();
    assert_eq!(err.code, "invalidState");
}

#[test]
fn states_usage_answers_counts() {
    let (_t, mut s) = folder(&[("journals/2026-10-01.md", "- WAITING Call Ben\n")]);
    let out = ok(&mut s, json!({"type": "states.usage"}), 0);
    let usage = serde_json::to_value(out.usage.unwrap()).unwrap();
    assert_eq!(
        usage,
        json!([
            {"keyword": "TODO", "blocks": 0, "pages": 0},
            {"keyword": "DOING", "blocks": 0, "pages": 0},
            {"keyword": "WAITING", "blocks": 1, "pages": 1},
            {"keyword": "DONE", "blocks": 0, "pages": 0},
        ])
    );
    assert_eq!(out.usage_skipped, Some(0));
}

#[test]
fn states_usage_counts_the_pages_that_did_not_load() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/Good.md", "- TODO a\n");
    fs::write(t.path().join("pages/Bad.md"), [0xff, 0xfe, 0x00]).unwrap();
    let mut s = Session::new();
    ok(&mut s, json!({"type": "folder.open", "path": t.path()}), 0);
    let out = ok(&mut s, json!({"type": "states.usage"}), 0);
    assert_eq!(out.usage_skipped, Some(1));
}

#[test]
fn config_set_git_and_board_write_and_answer() {
    let (t, mut s) = folder(&[("breccia/config.toml", breccia_core::Config::default_toml())]);
    let v = version(&mut s);
    let out = ok(
        &mut s,
        json!({"type": "config.setGit", "enabled": false, "commitDelayMinutes": 5, "pullIntervalMinutes": 5, "version": v}),
        0,
    );
    let c = out.config.unwrap();
    assert!(!c.git.enabled);
    assert!(c.version > v);
    assert_eq!(
        read(&t, CONFIG),
        breccia_core::Config::default_toml().replace("enabled = true", "enabled = false")
    );
    assert!(!s.git_target().unwrap().2.enabled);
    // A second change right after the first: the session's own write is not an outside change.
    let out = ok(
        &mut s,
        json!({"type": "config.setBoard", "archiveAfterDays": 30, "version": c.version}),
        0,
    );
    let c = out.config.unwrap();
    assert_eq!(c.archive_after_days, 30);
    assert!(c.auto_archive, "a change without the switch keeps it");
    assert!(read(&t, CONFIG).contains("archive_after_days = 30"));
    // The switch alone: `auto_archive = false` in place of the default line.
    let before = read(&t, CONFIG);
    let out = ok(
        &mut s,
        json!({"type": "config.setBoard", "archiveAfterDays": 30, "autoArchive": false, "version": c.version}),
        0,
    );
    assert!(!out.config.unwrap().auto_archive);
    assert_eq!(
        read(&t, CONFIG),
        before.replace("auto_archive = true", "auto_archive = false")
    );
    let v = version(&mut s);
    for bad in [
        json!({"type": "config.setGit", "enabled": true, "commitDelayMinutes": 1441, "pullIntervalMinutes": 5, "version": v}),
        json!({"type": "config.setGit", "enabled": true, "commitDelayMinutes": 5, "pullIntervalMinutes": 1441, "version": v}),
        json!({"type": "config.setBoard", "archiveAfterDays": 0, "version": v}),
        json!({"type": "config.setBoard", "archiveAfterDays": 3651, "version": v}),
    ] {
        assert_eq!(
            cmd(&mut s, bad.clone(), 0).unwrap_err().code,
            "invalidSetting",
            "{bad}"
        );
    }
}

/// The four commands that write config.toml, each made from `version`.
fn all_writes(v: u64, states: Vec<Value>) -> Vec<(&'static str, Value)> {
    vec![
        (
            "boards.set",
            json!({"type": "boards.set", "boards": [{"name": "Tasks", "columns": ["TODO"]}], "version": v}),
        ),
        (
            "states.set",
            json!({"type": "states.set", "states": states, "renames": [], "version": v}),
        ),
        (
            "config.setGit",
            json!({"type": "config.setGit", "enabled": false, "commitDelayMinutes": 5, "pullIntervalMinutes": 5, "version": v}),
        ),
        (
            "config.setBoard",
            json!({"type": "config.setBoard", "archiveAfterDays": 30, "version": v}),
        ),
    ]
}

#[test]
fn a_change_made_from_a_stale_version_is_refused() {
    for which in 0..4 {
        let (t, mut s) = folder(&[("breccia/config.toml", breccia_core::Config::default_toml())]);
        let old = version(&mut s);
        let states = default_states(&mut s);
        let theirs = format!("# theirs\n{}", breccia_core::Config::default_toml());
        put(t.path(), CONFIG, &theirs);
        let out = ok(
            &mut s,
            json!({"type": "files.changed", "paths": [CONFIG]}),
            0,
        );
        let new = out.config.unwrap().version;
        assert!(new > old);
        let (name, stale) = all_writes(old, states.clone()).remove(which);
        let err = cmd(&mut s, stale, 0).unwrap_err();
        assert_eq!(err.code, "configChanged", "{name}");
        assert_eq!(read(&t, CONFIG), theirs, "{name}");
        let (_, fresh) = all_writes(new, states).remove(which);
        ok(&mut s, fresh, 0);
        assert!(read(&t, CONFIG).starts_with("# theirs\n"), "{name}");
    }
}

#[test]
fn every_config_write_is_refused_after_an_outside_change() {
    for which in 0..4 {
        let (t, mut s) = folder(&[("breccia/config.toml", breccia_core::Config::default_toml())]);
        let v = version(&mut s);
        let states = default_states(&mut s);
        let theirs = format!("# theirs\n{}", breccia_core::Config::default_toml());
        put(t.path(), CONFIG, &theirs);
        let (name, write) = all_writes(v, states.clone()).remove(which);
        let err = cmd(&mut s, write, 0).unwrap_err();
        assert_eq!(err.code, "configChanged", "{name}");
        assert_eq!(read(&t, CONFIG), theirs, "{name}");
        let v2 = version(&mut s);
        assert!(v2 > v, "{name}: config.get carries the raised version");
        let (_, write) = all_writes(v2, states).remove(which);
        ok(&mut s, write, 0);
    }
}

#[test]
fn a_hand_edit_of_config_is_followed() {
    let (t, mut s) = folder(&[
        ("breccia/config.toml", breccia_core::Config::default_toml()),
        ("pages/P.md", "- a\n"),
    ]);
    let block_ids = ids(&mut s, "p");
    let text = format!(
        "{}\n[[states]]\nkeyword = \"LATER\"\ncolor = \"blue\"\n",
        breccia_core::Config::default_toml()
    );
    put(t.path(), CONFIG, &text);
    let out = ok(
        &mut s,
        json!({"type": "files.changed", "paths": [CONFIG]}),
        0,
    );
    let last = |c: &breccia_core::session::ConfigView| c.states.last().unwrap().keyword.clone();
    assert_eq!(last(out.config.as_ref().unwrap()), "LATER");
    let got = ok(&mut s, json!({"type": "config.get"}), 0).config.unwrap();
    assert_eq!(last(&got), "LATER");
    assert!(out.changed.is_empty() && out.removed.is_empty());
    assert_eq!(ids(&mut s, "p"), block_ids, "no page was reloaded");
}

#[test]
fn a_broken_config_keeps_the_old_one_and_refuses_writes() {
    let (t, mut s) = folder(&[("breccia/config.toml", breccia_core::Config::default_toml())]);
    let v = version(&mut s);
    put(t.path(), CONFIG, "states = 1");
    let out = ok(
        &mut s,
        json!({"type": "files.changed", "paths": [CONFIG]}),
        0,
    );
    assert!(out.config.is_none());
    match out.notices.as_slice() {
        [Notice::LoadWarning { message }] => {
            assert!(message.contains("breccia/config.toml"), "{message}")
        }
        n => panic!("{n:?}"),
    }
    let got = ok(&mut s, json!({"type": "config.get"}), 0).config.unwrap();
    assert_eq!(got.states.len(), 4);
    let err = cmd(
        &mut s,
        json!({"type": "config.setGit", "enabled": false, "commitDelayMinutes": 5, "pullIntervalMinutes": 5, "version": v}),
        0,
    )
    .unwrap_err();
    assert_eq!(err.code, "configChanged");
    assert_eq!(read(&t, CONFIG), "states = 1");
}

#[test]
fn folder_open_is_refused_while_a_page_is_unsaved() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let other = tempfile::tempdir().unwrap();
    let a = ids(&mut s, "p")[0];
    // The file changes first, so the save of the edit fails and the page stays dirty.
    put(t.path(), "pages/P.md", "- changed elsewhere\n");
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"mine"}),
        0,
    );
    let err = cmd(
        &mut s,
        json!({"type": "folder.open", "path": other.path()}),
        0,
    )
    .unwrap_err();
    assert_eq!(err.code, "unsaved");
    assert!(err.message.contains('P'), "{}", err.message);
    let status = ok(&mut s, json!({"type": "folder.status"}), 0);
    assert_eq!(status.folder.unwrap().path.as_deref(), Some(t.path()));
    let dirty = ok(&mut s, json!({"type": "session.dirty"}), 0);
    assert_eq!(dirty.dirty.unwrap().len(), 1);
    let fresh = other.path().join("new-notes");
    let err = cmd(&mut s, json!({"type": "folder.create", "path": fresh}), 0).unwrap_err();
    assert_eq!(err.code, "unsaved");
    assert!(!fresh.exists(), "nothing was created");
    ok(&mut s, json!({"type": "page.reload", "key": "p"}), 0);
    ok(
        &mut s,
        json!({"type": "folder.open", "path": other.path()}),
        0,
    );
}

#[test]
fn a_config_write_from_another_folders_version_is_refused() {
    let (_a, mut s) = folder(&[(
        "pages/P.md",
        "- a
",
    )]);
    let v = version(&mut s);
    let b = tempfile::tempdir().unwrap();
    ok(&mut s, json!({"type": "folder.open", "path": b.path()}), 0);
    let err = cmd(
        &mut s,
        json!({"type": "config.setBoard", "archiveAfterDays": 30, "version": v}),
        0,
    )
    .unwrap_err();
    assert_eq!(err.code, "configChanged");
    assert!(!b.path().join(CONFIG).exists());
}

#[test]
fn config_writes_without_a_folder_say_no_folder() {
    let mut s = Session::new();
    for (name, write) in all_writes(5, vec![]) {
        let err = cmd(&mut s, write, 0).unwrap_err();
        assert_eq!(err.code, "noFolder", "{name}");
    }
}

#[test]
fn folder_open_refuses_a_folder_that_does_not_exist_or_is_a_file() {
    // With no folder open: nothing opens, and no phantom folder is made.
    let t = tempfile::tempdir().unwrap();
    let gone = t.path().join("gone");
    let mut s = Session::new();
    let err = cmd(&mut s, json!({"type": "folder.open", "path": gone}), 0).unwrap_err();
    assert_eq!(err.code, "folderMissing");
    assert!(err.message.contains("no longer exists"), "{}", err.message);
    assert!(err.message.contains("gone"), "{}", err.message);
    assert!(!gone.exists(), "nothing was created");
    let status = ok(&mut s, json!({"type": "folder.status"}), 0);
    assert_eq!(status.folder.unwrap().path, None);
    put(t.path(), "a-file.md", "- x\n");
    let err = cmd(
        &mut s,
        json!({"type": "folder.open", "path": t.path().join("a-file.md")}),
        0,
    )
    .unwrap_err();
    assert_eq!(err.code, "folderMissing");

    // With a folder open: it stays open.
    let (open, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let generation = s.generation();
    let err = cmd(&mut s, json!({"type": "folder.open", "path": gone}), 0).unwrap_err();
    assert_eq!(err.code, "folderMissing");
    assert_eq!(s.generation(), generation);
    let status = ok(&mut s, json!({"type": "folder.status"}), 0);
    assert_eq!(status.folder.unwrap().path.as_deref(), Some(open.path()));

    // folder.create still makes a new folder.
    let fresh = t.path().join("fresh");
    ok(&mut s, json!({"type": "folder.create", "path": fresh}), 0);
    assert!(fresh.is_dir());
}

#[test]
fn a_combined_change_shows_its_pages_with_the_new_states() {
    let (t, mut s) = folder(&[
        ("breccia/config.toml", breccia_core::Config::default_toml()),
        ("pages/P.md", "- a\n"),
    ]);
    let text = format!(
        "{}\n[[states]]\nkeyword = \"LATER\"\ncolor = \"blue\"\n",
        breccia_core::Config::default_toml()
    );
    put(t.path(), CONFIG, &text);
    put(t.path(), "pages/P.md", "- LATER call mom\n");
    let out = ok(
        &mut s,
        json!({"type": "files.changed", "paths": [CONFIG, "pages/P.md"]}),
        0,
    );
    assert!(out.config.is_some());
    assert_eq!(out.changed[0].blocks[0].state.as_deref(), Some("LATER"));
}

#[test]
fn a_rename_onto_a_column_the_board_has_leaves_the_board_editable() {
    let text = format!(
        "{}\n[[boards]]\nname = \"Mine\"\ncolumns = [\"WAITING\", \"BLOCKED\"]\n",
        breccia_core::Config::default_toml()
    );
    let (_t, mut s) = folder(&[("breccia/config.toml", &text)]);
    let states = blocked_states(&mut s);
    let v = version(&mut s);
    let out = states_set(
        &mut s,
        states,
        json!([{"from": "WAITING", "to": "BLOCKED"}]),
        v,
    )
    .unwrap();
    let c = out.config.unwrap();
    let mine = c.boards.iter().find(|b| b.name == "Mine").unwrap();
    assert_eq!(mine.columns, ["BLOCKED"]);
    // Every board as it is now, sent back: not refused for a repeated column.
    let boards = serde_json::to_value(&c.boards).unwrap();
    ok(
        &mut s,
        json!({"type": "boards.set", "boards": boards, "version": c.version}),
        0,
    );
}

#[test]
fn only_pages_that_failed_before_are_reported_saved() {
    // The save fails as a changed file (portable; a rename over a read-only
    // file succeeds on Unix), then the file is as Breccia read it again.
    let (t, mut s) = folder(&[("pages/A.md", "- a\n"), ("pages/B.md", "- b\n")]);
    let a = ids(&mut s, "a")[0];
    let b = ids(&mut s, "b")[0];
    put(t.path(), "pages/A.md", "- outside\n");
    let out = ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"a1"}),
        0,
    );
    assert!(matches!(&out.notices[..], [Notice::SaveFailed { page, .. }] if page == "a"));
    assert!(out.saved.is_empty());
    let out = ok(
        &mut s,
        json!({"type":"block.setText","id":b,"text":"b1"}),
        0,
    );
    assert!(out.saved.is_empty());
    put(t.path(), "pages/A.md", "- a\n");
    let out = ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"a2"}),
        0,
    );
    assert_eq!(out.saved, vec!["a".to_string()]);
    assert_eq!(read(&t, "pages/A.md"), "- a2\n");
    let out = ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"a3"}),
        0,
    );
    assert!(out.saved.is_empty());
}

/// A page `a` whose save failed (the file changed on disk, then was put back
/// as Breccia read it), ready to be renamed.
fn folder_with_failed_save_of_a() -> (TempDir, Session) {
    let (t, mut s) = folder(&[("pages/A.md", "- a\n")]);
    let a = ids(&mut s, "a")[0];
    put(t.path(), "pages/A.md", "- outside\n");
    let out = ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"a1"}),
        0,
    );
    assert!(matches!(&out.notices[..], [Notice::SaveFailed { page, .. }] if page == "a"));
    put(t.path(), "pages/A.md", "- a\n");
    (t, s)
}

#[test]
fn a_rename_that_saves_the_page_reports_its_old_key_saved() {
    let (t, mut s) = folder_with_failed_save_of_a();
    let out = ok(
        &mut s,
        json!({"type":"page.rename","key":"a","name":"B"}),
        0,
    );
    assert_eq!(out.saved, vec!["a".to_string()]);
    assert!(
        !out.notices
            .iter()
            .any(|n| matches!(n, Notice::SaveFailed { .. }))
    );
    assert_eq!(read(&t, "pages/B.md"), "- a1\n");
}

#[test]
fn after_a_rename_a_failed_save_is_tracked_under_the_new_key() {
    let (t, mut s) = folder_with_failed_save_of_a();
    ok(
        &mut s,
        json!({"type":"page.rename","key":"a","name":"B"}),
        0,
    );
    let b = ids(&mut s, "b")[0];
    put(t.path(), "pages/B.md", "- outside\n");
    let out = ok(
        &mut s,
        json!({"type":"block.setText","id":b,"text":"b2"}),
        0,
    );
    assert!(matches!(&out.notices[..], [Notice::SaveFailed { page, .. }] if page == "b"));
    assert!(out.saved.is_empty());
    put(t.path(), "pages/B.md", "- a1\n");
    let out = ok(
        &mut s,
        json!({"type":"block.setText","id":b,"text":"b3"}),
        0,
    );
    assert_eq!(out.saved, vec!["b".to_string()]);
}

#[test]
fn a_page_whose_save_fails_in_a_rename_is_reported_saved_later() {
    let (t, mut s) = folder(&[("pages/A.md", "- a\n"), ("pages/C.md", "- see [[A]]\n")]);
    let c = ids(&mut s, "c")[0];
    put(t.path(), "pages/C.md", "- outside\n");
    let out = ok(
        &mut s,
        json!({"type":"page.rename","key":"a","name":"B"}),
        0,
    );
    assert!(
        out.notices
            .iter()
            .any(|n| matches!(n, Notice::SaveFailed { page, .. } if page == "c"))
    );
    put(t.path(), "pages/C.md", "- see [[A]]\n");
    let out = ok(
        &mut s,
        json!({"type":"block.setText","id":c,"text":"see [[B]]!"}),
        0,
    );
    assert_eq!(out.saved, vec!["c".to_string()]);
}

#[test]
fn a_rename_to_its_own_name_never_reports_an_unsaved_page_saved() {
    let (t, mut s) = folder_with_failed_save_of_a();
    // The file holds outside text again: nothing can be saved.
    put(t.path(), "pages/A.md", "- outside\n");
    let out = ok(
        &mut s,
        json!({"type":"page.rename","key":"a","name":"A"}),
        0,
    );
    assert!(out.saved.is_empty(), "nothing was saved: {:?}", out.saved);
    assert_eq!(read(&t, "pages/A.md"), "- outside\n");
    // The failure is still tracked: a later good save reports the page saved.
    let a = ids(&mut s, "a")[0];
    put(t.path(), "pages/A.md", "- a\n");
    let out = ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"a2"}),
        0,
    );
    assert_eq!(out.saved, vec!["a".to_string()]);
}

#[test]
fn an_overwrite_and_a_retry_report_the_page_saved() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let a = ids(&mut s, "p")[0];
    put(t.path(), "pages/P.md", "- theirs\n");
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"mine"}),
        0,
    );
    let out = ok(&mut s, json!({"type":"page.overwrite","key":"p"}), 0);
    assert_eq!(out.saved, vec!["p".to_string()]);
    assert!(
        s.take_saved().is_empty(),
        "run already moved it to the output"
    );

    put(t.path(), "pages/P.md", "- theirs\n");
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"again"}),
        0,
    );
    put(t.path(), "pages/P.md", "- mine\n");
    assert_eq!(s.retry_saves(), 0);
    assert_eq!(s.take_saved(), vec!["p".to_string()]);
    assert!(s.take_saved().is_empty());
}

#[test]
fn a_page_saved_then_failing_again_is_not_reported_saved() {
    // The retry saves the page, then a command's save of it fails again
    // before the saved keys are handed on: only the failure may go out.
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let a = ids(&mut s, "p")[0];
    put(t.path(), "pages/P.md", "- theirs\n");
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"mine"}),
        0,
    );
    put(t.path(), "pages/P.md", "- a\n");
    assert_eq!(s.retry_saves(), 0);
    put(t.path(), "pages/P.md", "- theirs again\n");
    let out = ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"mine again"}),
        0,
    );
    assert!(matches!(&out.notices[..], [Notice::SaveFailed { page, .. }] if page == "p"));
    assert!(out.saved.is_empty(), "{:?}", out.saved);
}

#[test]
fn opening_a_folder_forgets_the_failed_saves() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let a = ids(&mut s, "p")[0];
    put(t.path(), "pages/P.md", "- theirs\n");
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"mine"}),
        0,
    );
    // Reloading drops the edit (the page matches its file), then the folder is opened again.
    ok(&mut s, json!({"type":"page.reload","key":"p"}), 0);
    ok(&mut s, json!({"type":"folder.open","path":t.path()}), 0);
    let a = ids(&mut s, "p")[0];
    let out = ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"new"}),
        0,
    );
    assert!(out.saved.is_empty());
}

#[test]
fn an_output_is_empty_until_a_field_is_set() {
    assert!(Output::default().is_empty());
    let out = Output {
        saved: vec!["a".into()],
        ..Output::default()
    };
    assert!(!out.is_empty());
}

#[test]
fn a_link_click_opens_the_heading_page() {
    let (t, mut s) = folder(&[
        ("pages/Page.md", "- p\n"),
        ("pages/Kubernetes.md", "---\naliases: [k8s]\n---\n- k\n"),
    ]);
    let out = ok(
        &mut s,
        json!({"type": "page.open", "name": "Page#Setup", "link": true}),
        0,
    );
    assert_eq!(out.page.unwrap().key, "page");
    let e = cmd(&mut s, json!({"type": "page.get", "key": "page#setup"}), 0).unwrap_err();
    assert_eq!(e.code, "unknownPage");
    // Through an alias.
    let out = ok(
        &mut s,
        json!({"type": "page.open", "name": "k8s#Setup", "link": true}),
        0,
    );
    assert_eq!(out.page.unwrap().key, "kubernetes");
    // Without the base page, the whole text is the name.
    let out = ok(
        &mut s,
        json!({"type": "page.open", "name": "Issue #42", "link": true}),
        0,
    );
    assert_eq!(out.page.unwrap().key, "issue #42");
    // Without `link`, the name is the page name as typed.
    let out = ok(&mut s, json!({"type": "page.open", "name": "C# basics"}), 0);
    let page = out.page.unwrap();
    assert_eq!(page.key, "c# basics");
    let out = ok(
        &mut s,
        json!({"type": "page.open", "name": "Page#Setup"}),
        0,
    );
    assert_eq!(out.page.unwrap().key, "page#setup");
    // Opening writes nothing.
    assert!(!t.path().join("pages/Page#Setup.md").exists());
    assert!(!t.path().join("pages/C# basics.md").exists());
    assert_eq!(read(&t, "pages/Page.md"), "- p\n");
}

#[test]
fn a_tag_click_never_splits_at_the_hash() {
    // A heading link with the same text as the tag must not make the tag's
    // click (no `link`) open the base page.
    let (_t, mut s) = folder(&[
        ("pages/Page.md", "- p\n"),
        ("pages/Ops.md", "- #Page#tag and [[Page#tag]]\n"),
    ]);
    let out = ok(&mut s, json!({"type": "page.open", "name": "Page#tag"}), 0);
    assert_eq!(out.page.unwrap().key, "page#tag");
    let out = ok(
        &mut s,
        json!({"type": "page.open", "name": "Page#tag", "link": true}),
        0,
    );
    assert_eq!(out.page.unwrap().key, "page");
}

#[test]
fn a_clash_is_warned_once() {
    let (t, mut s) = folder(&[("pages/K.md", "---\naliases: [k8s]\n---\n- k\n")]);
    let alias_notices = |out: &Output| {
        out.notices
            .iter()
            .filter(
                |n| matches!(n, Notice::LoadWarning { message } if message.contains("the alias")),
            )
            .count()
    };
    put(t.path(), "pages/k8s.md", "- own\n");
    let out = ok(
        &mut s,
        json!({"type": "files.changed", "paths": ["pages/k8s.md"]}),
        100,
    );
    assert_eq!(alias_notices(&out), 1);
    assert!(out.notices.iter().any(|n| matches!(n, Notice::LoadWarning { message }
        if message == "the alias “k8s” in pages/K.md is the name of the page pages/k8s.md; links to it go to that page")));
    let id = ids(&mut s, "k")[0];
    let out = ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "kk"}),
        200,
    );
    assert_eq!(alias_notices(&out), 0);
    fs::remove_file(t.path().join("pages/k8s.md")).unwrap();
    let out = ok(
        &mut s,
        json!({"type": "files.changed", "paths": ["pages/k8s.md"]}),
        300,
    );
    assert_eq!(alias_notices(&out), 0);
    put(t.path(), "pages/k8s.md", "- own\n");
    let out = ok(
        &mut s,
        json!({"type": "files.changed", "paths": ["pages/k8s.md"]}),
        400,
    );
    assert_eq!(alias_notices(&out), 1);
}

#[test]
fn the_rename_question_counts_rewrites() {
    let (_t, mut s) = folder(&[
        (
            "pages/Kubernetes.md",
            "---\naliases:\n  - k8s\n---\n- the page [[Kubernetes]]\n",
        ),
        ("pages/A.md", "- [[Kubernetes]]\n"),
        ("pages/B.md", "- [[Kubernetes#Setup]]\n"),
        ("pages/C.md", "- [[k8s]] #k8s\n"),
        ("pages/D.md", "- [[kubernetes]]\n"),
    ]);
    let refs = ok(&mut s, json!({"type": "page.refs", "key": "kubernetes"}), 0)
        .refs
        .unwrap();
    assert_eq!(refs.groups.len(), 4);
    let reach = |s: &mut Session, name: &str| {
        ok(
            s,
            json!({"type": "page.renameReach", "key": "kubernetes", "name": name}),
            0,
        )
        .reach
    };
    assert_eq!(reach(&mut s, "Cluster"), Some(3));
    // Counted from the real new name: D's link is already spelled that way.
    assert_eq!(reach(&mut s, "kubernetes"), Some(2));
    assert_eq!(reach(&mut s, "Kubernetes"), Some(0));
    // A name links cannot hold changes nothing.
    assert_eq!(reach(&mut s, "a]b"), Some(0));
    // The query writes nothing and is no page output.
    let out = ok(
        &mut s,
        json!({"type": "page.renameReach", "key": "kubernetes", "name": "X"}),
        0,
    );
    assert!(out.page.is_none() && out.refs.is_none());
    let e = cmd(
        &mut s,
        json!({"type": "page.renameReach", "key": "gone", "name": "X"}),
        0,
    )
    .unwrap_err();
    assert_eq!(e.code, "unknownPage");
}

// A keyword typed by hand gets the state's lines when the editor closes (`block.settle`).

const CREATED: &str = "  created:: 2026-10-29 14:05:09\n";

#[test]
fn a_typed_keyword_gets_created_when_the_editor_closes() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let a = ids(&mut s, "p")[0];
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"TODO a"}),
        0,
    );
    // While typing, nothing is added.
    assert_eq!(read(&t, "pages/P.md"), "- TODO a\n");
    let out = ok(
        &mut s,
        json!({"type":"block.settle","id":a,"before":null}),
        100,
    );
    assert_eq!(read(&t, "pages/P.md"), format!("- TODO a\n{CREATED}"));
    assert_eq!(out.page.unwrap().key, "p");
    // The typing and the lines are one undo step.
    ok(&mut s, json!({"type":"history.undo","page":"p"}), 200);
    assert_eq!(read(&t, "pages/P.md"), "- a\n");
}

#[test]
fn a_typed_finished_keyword_gets_created_and_done() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let a = ids(&mut s, "p")[0];
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"DONE a  \nowner:: Ben\nsome text"}),
        0,
    );
    ok(
        &mut s,
        json!({"type":"block.settle","id":a,"before":null}),
        100,
    );
    // The text typed is otherwise as it was; the lines go after the properties.
    assert_eq!(
        read(&t, "pages/P.md"),
        format!(
            "- DONE a  \n  owner:: Ben\n{CREATED}  done:: [[2026-10-29]] 14:05:09\n  some text\n"
        )
    );
}

#[test]
fn a_typed_change_of_state_applies_what_a_state_change_does() {
    let src = "- TODO a\n  created:: 2026-10-01 08:00:00\n  priority:: 2\n  archived:: 2026-10-02 08:00:00\n";
    let (t, mut s) = folder(&[("pages/P.md", src)]);
    let a = ids(&mut s, "p")[0];
    let typed =
        "DONE a\ncreated:: 2026-10-01 08:00:00\npriority:: 2\narchived:: 2026-10-02 08:00:00";
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":typed}),
        0,
    );
    ok(
        &mut s,
        json!({"type":"block.settle","id":a,"before":"TODO"}),
        100,
    );
    // Finished: done:: comes, priority:: and archived:: go, created:: stays.
    assert_eq!(
        read(&t, "pages/P.md"),
        "- DONE a\n  created:: 2026-10-01 08:00:00\n  done:: [[2026-10-29]] 14:05:09\n"
    );
    // The keyword removed by hand: created:: and done:: go.
    let typed = "a\ncreated:: 2026-10-01 08:00:00\ndone:: [[2026-10-29]] 14:05:09";
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":typed}),
        5000,
    );
    ok(
        &mut s,
        json!({"type":"block.settle","id":a,"before":"DONE"}),
        5100,
    );
    assert_eq!(read(&t, "pages/P.md"), "- a\n");
}

#[test]
fn an_old_task_typed_into_another_state_gets_no_created() {
    let (t, mut s) = folder(&[("pages/P.md", "- TODO a\n")]);
    let a = ids(&mut s, "p")[0];
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"DOING a"}),
        0,
    );
    ok(
        &mut s,
        json!({"type":"block.settle","id":a,"before":"TODO"}),
        100,
    );
    assert_eq!(read(&t, "pages/P.md"), "- DOING a\n");
}

#[test]
fn settle_changes_nothing_for_the_same_state_or_a_state_that_is_gone() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let a = ids(&mut s, "p")[0];
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"TODO a"}),
        0,
    );
    // The state the editor opened with is the state now: nothing to do.
    ok(
        &mut s,
        json!({"type":"block.settle","id":a,"before":"TODO"}),
        100,
    );
    assert_eq!(read(&t, "pages/P.md"), "- TODO a\n");
    // A keyword no longer configured (renamed in Settings meanwhile): nothing either.
    ok(
        &mut s,
        json!({"type":"block.settle","id":a,"before":"OPEN"}),
        200,
    );
    assert_eq!(read(&t, "pages/P.md"), "- TODO a\n");
    let e = cmd(
        &mut s,
        json!({"type":"block.settle","id":999,"before":null}),
        300,
    )
    .unwrap_err();
    assert_eq!(e.code, "unknownBlock");
}

#[test]
fn settle_after_another_step_is_a_step_of_its_own() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n- b\n")]);
    let [a, b]: [BlockId; 2] = ids(&mut s, "p").try_into().unwrap();
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"TODO a"}),
        0,
    );
    ok(
        &mut s,
        json!({"type":"block.setText","id":b,"text":"b1"}),
        100,
    );
    ok(
        &mut s,
        json!({"type":"block.settle","id":a,"before":null}),
        200,
    );
    assert_eq!(read(&t, "pages/P.md"), format!("- TODO a\n{CREATED}- b1\n"));
    // Undo takes the lines alone; the typing in b and in a stay steps of their own.
    ok(&mut s, json!({"type":"history.undo","page":"p"}), 300);
    assert_eq!(read(&t, "pages/P.md"), "- TODO a\n- b1\n");
    ok(&mut s, json!({"type":"history.undo","page":"p"}), 400);
    assert_eq!(read(&t, "pages/P.md"), "- TODO a\n- b\n");
}

#[test]
fn settle_joins_a_typing_step_that_queries_came_between() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let a = ids(&mut s, "p")[0];
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"TODO a"}),
        0,
    );
    // Reads between the typing and the close record no step.
    ok(&mut s, json!({"type":"pages.list"}), 50);
    ok(&mut s, json!({"type":"page.get","key":"p"}), 60);
    ok(
        &mut s,
        json!({"type":"block.settle","id":a,"before":null}),
        100,
    );
    ok(&mut s, json!({"type":"history.undo","page":"p"}), 200);
    assert_eq!(read(&t, "pages/P.md"), "- a\n");
}

// Removing a state is its own command; cycling never removes it.

#[test]
fn removing_state_of_selection_with_a_plain_block() {
    let src = "- TODO a\n  created:: 2026-10-01 08:00:00\n  priority:: 2\n- b\n";
    let (t, mut s) = folder(&[("pages/P.md", src)]);
    let [a, b]: [BlockId; 2] = ids(&mut s, "p").try_into().unwrap();
    ok(
        &mut s,
        json!({"type":"blocks.setState","ids":[a, b],"keyword":null}),
        0,
    );
    assert_eq!(read(&t, "pages/P.md"), "- a\n- b\n");
    ok(&mut s, json!({"type":"history.undo","page":"p"}), 0);
    assert_eq!(read(&t, "pages/P.md"), src);
}

#[test]
fn removing_state_of_a_plain_block_records_nothing() {
    let (t, mut s) = folder(&[("pages/P.md", "- TODO a\n- b\n")]);
    let [a, b]: [BlockId; 2] = ids(&mut s, "p").try_into().unwrap();
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"TODO a!"}),
        0,
    );
    ok(
        &mut s,
        json!({"type":"blocks.setState","ids":[b],"keyword":null}),
        0,
    );
    assert_eq!(read(&t, "pages/P.md"), "- TODO a!\n- b\n");
    // The undo takes back the typing, the step before: the removal recorded none.
    ok(&mut s, json!({"type":"history.undo","page":"p"}), 0);
    assert_eq!(read(&t, "pages/P.md"), "- TODO a\n- b\n");
}

#[test]
fn cycling_with_no_state_in_the_cycle_is_refused() {
    let config = "[[states]]\nkeyword = \"TODO\"\ncolor = \"grey\"\nin_cycle = false\n";
    let (t, mut s) = folder(&[
        ("breccia/config.toml", config),
        ("pages/P.md", "- TODO a\n- b\n"),
    ]);
    let [a, b]: [BlockId; 2] = ids(&mut s, "p").try_into().unwrap();
    for c in [
        json!({"type":"block.cycleState","id":a}),
        json!({"type":"block.cycleState","id":b}),
        json!({"type":"block.stepState","id":a}),
    ] {
        let err = cmd(&mut s, c, 0).unwrap_err();
        assert_eq!(err.code, "noCycle");
        assert_eq!(err.message, "No state is in the cycle (Settings → States)");
    }
    assert_eq!(read(&t, "pages/P.md"), "- TODO a\n- b\n");
}

/// Back shows a page again with `page.show`: it finds a page opened without a file, and not a deleted one.
#[test]
fn page_show_finds_a_page_opened_without_a_file() {
    let (_t, mut s) = folder(&[("pages/Anna.md", "- see [[Nowhere]]\n")]);
    let nowhere = ok(&mut s, json!({"type": "page.open", "name": "Nowhere"}), 0)
        .page
        .unwrap()
        .key;
    let anna = ok(&mut s, json!({"type": "page.open", "name": "Anna"}), 0)
        .page
        .unwrap()
        .key;
    let again = ok(&mut s, json!({"type": "page.show", "key": nowhere}), 0);
    assert_eq!(again.page.unwrap().key, nowhere);
    ok(&mut s, json!({"type": "page.delete", "key": anna}), 0);
    let err = cmd(&mut s, json!({"type": "page.show", "key": anna}), 0).unwrap_err();
    assert_eq!(err.code, "unknownPage");
}

/// `a`, typed to `ab` at ms 0, then `step` at ms 100, then `abc` at ms 500,
/// then one undo: the page text the undo leaves.
fn undo_after_keystrokes_around(step: Value) -> String {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let id = ids(&mut s, "p")[0];
    ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "ab"}),
        0,
    );
    // A query may be answered with an error (no such board); the run goes on.
    let _ = cmd(&mut s, step, 100);
    ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "abc"}),
        500,
    );
    ok(&mut s, json!({"type": "history.undo", "page": "p"}), 600);
    read(&t, "pages/P.md")
}

#[test]
fn a_query_between_two_keystrokes_keeps_one_undo_step() {
    let queries = [
        json!({"type": "pages.list"}),
        json!({"type": "page.get", "key": "p"}),
        json!({"type": "pages.get", "keys": ["p"]}),
        json!({"type": "board.get", "index": 0}),
        json!({"type": "config.get"}),
        json!({"type": "states.usage"}),
        json!({"type": "session.dirty"}),
        json!({"type": "graph.get"}),
        json!({"type": "journal.feed"}),
        json!({"type": "folder.tree"}),
        json!({"type": "folder.status"}),
        json!({"type": "page.refs", "key": "p"}),
        json!({"type": "page.renameReach", "key": "p", "name": "Q"}),
        json!({"type": "pages.table"}),
    ];
    for q in queries {
        assert_eq!(undo_after_keystrokes_around(q.clone()), "- a\n", "{q}");
    }
}

#[test]
fn an_edit_between_two_keystrokes_ends_the_run() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let id = ids(&mut s, "p")[0];
    ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "ab"}),
        0,
    );
    ok(
        &mut s,
        json!({"type": "block.insert", "page": "p", "after": id, "text": "x"}),
        100,
    );
    ok(
        &mut s,
        json!({"type": "block.setText", "id": id, "text": "abc"}),
        500,
    );
    ok(&mut s, json!({"type": "history.undo", "page": "p"}), 600);
    assert_eq!(read(&t, "pages/P.md"), "- ab\n- x\n");
}

#[test]
fn an_edit_that_leaves_no_step_still_ends_the_run() {
    // `page.today` makes no undo step, but it is not a query: the second
    // keystroke starts a new step, so one undo gives back "ab".
    assert_eq!(
        undo_after_keystrokes_around(json!({"type": "page.today"})),
        "- ab\n"
    );
}

#[test]
fn recover_reopens_a_saved_folder() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let g = s.generation();
    let a = ids(&mut s, "p")[0];
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"a1"}),
        0,
    );
    assert_eq!(read(&t, "pages/P.md"), "- a1\n");
    // Written behind the session's back, and not yet seen by it.
    put(t.path(), "pages/New.md", "- new\n");
    assert_eq!(s.recover(), Recovery::Reopened { generation: g + 1 });
    assert_eq!(s.generation(), g + 1);
    ok(&mut s, json!({"type":"page.show","key":"new"}), 0);
    // Undo starts afresh: nothing to take back.
    let out = ok(&mut s, json!({"type":"history.undo","page":"p"}), 0);
    assert_eq!(out.page.unwrap().blocks[0].text, "a1");
    assert_eq!(read(&t, "pages/P.md"), "- a1\n");
}

#[test]
fn recover_keeps_a_session_with_unsaved_pages() {
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let g = s.generation();
    let a = ids(&mut s, "p")[0];
    // The file changes first, so the save of the edit fails and the page stays unsaved.
    put(t.path(), "pages/P.md", "- theirs\n");
    ok(
        &mut s,
        json!({"type":"block.setText","id":a,"text":"mine"}),
        0,
    );
    assert_eq!(s.recover(), Recovery::Kept);
    assert_eq!(s.generation(), g);
    let out = ok(&mut s, json!({"type":"page.get","key":"p"}), 0);
    assert_eq!(out.page.unwrap().blocks[0].text, "mine");
    assert_eq!(read(&t, "pages/P.md"), "- theirs\n");
}

#[test]
fn recover_without_a_folder() {
    let mut s = Session::new();
    assert_eq!(s.recover(), Recovery::NoFolder);
    // A folder that is gone by the time of the recovery: no folder is open after it.
    let (t, mut s) = folder(&[("pages/P.md", "- a\n")]);
    let g = s.generation();
    let root = t.path().to_path_buf();
    drop(t);
    assert!(!root.exists());
    assert_eq!(s.recover(), Recovery::NoFolder);
    let status = ok(&mut s, json!({"type":"folder.status"}), 0);
    let folder = status.folder.unwrap();
    assert_eq!(folder.path, None);
    assert!(folder.generation > g, "old block ids are stale");
}

#[test]
fn reset_keeps_the_search_cache_and_moves_the_generation_on() {
    let cache = tempfile::tempdir().unwrap();
    let notes = tempfile::tempdir().unwrap();
    put(notes.path(), "pages/P.md", "- a\n");
    let mut s = Session::with_cache(cache.path().to_path_buf());
    ok(&mut s, json!({"type":"folder.open","path":notes.path()}), 0);
    let g = s.generation();
    s.reset();
    assert!(s.generation() > g);
    assert!(s.git_target().is_none());
    // The cache directory is kept: the next open stores its index there again.
    let before: Vec<_> = fs::read_dir(cache.path()).unwrap().collect();
    for f in fs::read_dir(cache.path()).unwrap() {
        fs::remove_file(f.unwrap().path()).unwrap();
    }
    assert!(!before.is_empty());
    ok(&mut s, json!({"type":"folder.open","path":notes.path()}), 0);
    assert!(fs::read_dir(cache.path()).unwrap().next().is_some());
}
