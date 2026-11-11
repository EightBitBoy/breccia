use breccia_core::{BlockId, Config, Document, EditError, IdGen, parse, task::*};
use chrono::{NaiveDate, NaiveDateTime};

/// The time every change in these tests happens at.
fn today() -> NaiveDateTime {
    NaiveDate::from_ymd_opt(2026, 10, 29)
        .unwrap()
        .and_hms_opt(14, 5, 9)
        .unwrap()
}
fn apply(src: &str, i: usize, kw: Option<&str>) -> String {
    let mut d = parse(src, &mut IdGen::new());
    let id = d.blocks()[i].id();
    d.set_state(id, kw, &Config::default(), today()).unwrap();
    d.render()
}

#[test]
fn detects_state() {
    let c = Config::default();
    assert_eq!(
        task_state("TODO Ask", &c).map(|s| s.keyword.as_str()),
        Some("TODO")
    );
    // a keyword that ends the first line is a state too
    for t in ["TODO", "TODO\nowner:: Ben"] {
        assert_eq!(
            task_state(t, &c).map(|s| s.keyword.as_str()),
            Some("TODO"),
            "{t:?}"
        );
    }
    for t in ["TODOs list", "todo x", "Ask TODO x", "", "DOINGs"] {
        assert!(task_state(t, &c).is_none(), "{t:?}");
    }
}

#[test]
fn replaces_keyword() {
    let c = Config::default();
    assert_eq!(with_state("TODO Ask", Some("DOING"), &c), "DOING Ask");
    assert_eq!(with_state("Ask", Some("TODO"), &c), "TODO Ask");
    assert_eq!(with_state("DONE Ask", None, &c), "Ask");
}

#[test]
fn done_date_added_and_removed() {
    let done = apply("- TODO Review PR 412\n", 0, Some("DONE"));
    assert_eq!(
        done,
        "- DONE Review PR 412\n  done:: [[2026-10-29]] 14:05:09\n"
    );
    assert_eq!(apply(&done, 0, Some("TODO")), "- TODO Review PR 412\n");
    assert_eq!(apply(&done, 0, None), "- Review PR 412\n");
}

#[test]
fn finished_to_finished_keeps_date() {
    let mut c = Config::default();
    c.states.push(breccia_core::config::State {
        keyword: "SHIPPED".into(),
        color: "green".into(),
        finished: true,
        in_cycle: false,
    });
    let mut d = parse("- DONE x\n  done:: [[2026-10-20]]\n", &mut IdGen::new());
    let id = d.blocks()[0].id();
    d.set_state(id, Some("SHIPPED"), &c, today()).unwrap();
    assert_eq!(d.render(), "- SHIPPED x\n  done:: [[2026-10-20]]\n");
}

fn archive(src: &str, i: usize, on: bool) -> String {
    let mut d = parse(src, &mut IdGen::new());
    let id = d.blocks()[i].id();
    d.set_archived(id, on, today()).unwrap();
    d.render()
}

#[test]
fn archived_is_a_property_after_the_others() {
    let src = "- DONE x\n  done:: [[2026-10-20]]\n  - child\n";
    let on = archive(src, 0, true);
    assert_eq!(
        on,
        "- DONE x\n  done:: [[2026-10-20]]\n  archived:: 2026-10-29 14:05:09\n  - child\n"
    );
    assert!(is_archived(
        "DONE x\ndone:: [[2026-10-20]]\narchived:: 2026-10-29"
    ));
    assert!(!is_archived("DONE x\ndone:: [[2026-10-20]]"));
    // Archiving again changes nothing; unarchiving removes only that line.
    assert_eq!(archive(&on, 0, true), on);
    assert_eq!(archive(&on, 0, false), src);
    // Any value counts, and every archived line goes.
    let odd = "- TODO y\n  archived:: yes\n  owner:: Ben\n  archived::\n";
    assert!(is_archived("TODO y\narchived:: yes"));
    assert_eq!(archive(odd, 0, false), "- TODO y\n  owner:: Ben\n");
    // An open task can be archived too.
    assert_eq!(
        archive("- TODO z\n", 0, true),
        "- TODO z\n  archived:: 2026-10-29 14:05:09\n"
    );
}

#[test]
fn a_state_change_unarchives() {
    let on = "- DONE x\n  done:: [[2026-10-20]]\n  archived:: 2026-10-25\n";
    assert_eq!(apply(on, 0, Some("TODO")), "- TODO x\n");
    assert_eq!(apply(on, 0, None), "- x\n");
    // The same state again is no change, so it stays archived.
    assert_eq!(apply(on, 0, Some("DONE")), on);
}

#[test]
fn done_goes_after_existing_properties() {
    assert_eq!(
        apply(
            "- TODO x\n  owner:: Ben\n  SCHEDULED: <2026-11-01 Sun>\n",
            0,
            Some("DONE")
        ),
        "- DONE x\n  owner:: Ben\n  done:: [[2026-10-29]] 14:05:09\n  SCHEDULED: <2026-11-01 Sun>\n"
    );
}

#[test]
fn only_the_block_changes() {
    let out = apply(
        "- TODO Release\n\t- TODO Notes\n\t- DONE Log\n\t  done:: [[2026-10-01]]\n",
        0,
        Some("DONE"),
    );
    assert_eq!(
        out,
        "- DONE Release\n  done:: [[2026-10-29]] 14:05:09\n\t- TODO Notes\n\t- DONE Log\n\t  done:: [[2026-10-01]]\n"
    );
}

#[test]
fn set_state_keeps_crlf() {
    assert_eq!(
        apply("- TODO x\r\n- y\r\n", 0, Some("DONE")),
        "- DONE x\r\n  done:: [[2026-10-29]] 14:05:09\r\n- y\r\n"
    );
}

#[test]
fn errors_and_cycle() {
    let mut d = parse("- x\n", &mut IdGen::new());
    let id = d.blocks()[0].id();
    let c = Config::default();
    assert_eq!(
        d.set_state(id, Some("NOPE"), &c, today()),
        Err(EditError::UnknownState("NOPE".into()))
    );
    assert_eq!(
        d.set_state(BlockId(999), None, &c, today()),
        Err(EditError::UnknownBlock)
    );
    let seq: Vec<_> = (0..4)
        .map(|_| d.cycle_state(id, &c, today()).unwrap())
        .collect();
    assert_eq!(
        seq,
        vec![
            Some("TODO".into()),
            Some("DOING".into()),
            Some("DONE".into()),
            Some("TODO".into())
        ]
    );
    assert_eq!(d.render(), "- TODO x\n  created:: 2026-10-29 14:05:09\n");
}

#[test]
fn state_change_that_would_open_or_close_a_fence_is_refused() {
    let c = Config::default();
    // DONE in front of the opener turns the old closing line into an opener
    let src = "- ```rust\n  code\n  ```\n- next\n- [[Link]]\n";
    let mut d = parse(src, &mut IdGen::new());
    let id = d.blocks()[0].id();
    assert_eq!(
        d.cycle_state(id, &c, today()),
        Err(EditError::WouldChangeStructure)
    );
    assert_eq!(
        d.set_state(id, Some("DONE"), &c, today()),
        Err(EditError::WouldChangeStructure)
    );
    assert_eq!(d.render(), src);
    // removing the keyword makes the first line open a fence
    let src = "- TODO ```x\n- next\n";
    let mut d = parse(src, &mut IdGen::new());
    let id = d.blocks()[0].id();
    assert_eq!(
        d.set_state(id, None, &c, today()),
        Err(EditError::WouldChangeStructure)
    );
    assert_eq!(d.render(), src);
}

#[test]
fn state_change_in_an_unclosed_last_fence_is_allowed() {
    // the last block may end inside a fence the file never closes
    assert_eq!(
        apply("- a\n- b\n  ```\n  code", 1, Some("TODO")),
        "- a\n- TODO b\n  created:: 2026-10-29 14:05:09\n  ```\n  code\n"
    );
}

#[test]
fn keyword_only_block_cycles_through_every_state() {
    let c = Config::default();
    let mut d = parse("- TODO\n", &mut IdGen::new());
    let id = d.blocks()[0].id();
    let state = |d: &Document| task_state(d.blocks()[0].text(), &c).map(|s| s.keyword.clone());
    assert_eq!(state(&d), Some("TODO".into()));
    let mut seen = Vec::new();
    for _ in 0..3 {
        let next = d.cycle_state(id, &c, today()).unwrap();
        assert_eq!(state(&d), next, "{:?}", d.render());
        seen.push((next, d.render()));
    }
    assert_eq!(
        seen,
        vec![
            (Some("DOING".into()), "- DOING\n".into()),
            (
                Some("DONE".into()),
                "- DONE\n  done:: [[2026-10-29]] 14:05:09\n".into()
            ),
            // after the last state the cycle starts again at the first
            (Some("TODO".into()), "- TODO\n".into()),
        ]
    );
    assert_eq!(apply("- DONE\n", 0, None), "-\n");
    assert_eq!(with_state("DONE", Some("TODO"), &c), "TODO");
    assert_eq!(with_state("TODO\nowner:: Ben", None, &c), "\nowner:: Ben");
    assert_eq!(
        with_state("\nowner:: Ben", Some("TODO"), &c),
        "TODO\nowner:: Ben"
    );
}

#[test]
fn empty_block_gets_a_keyword_without_trailing_space() {
    let c = Config::default();
    let mut d = parse("- \n", &mut IdGen::new());
    let id = d.blocks()[0].id();
    assert_eq!(d.cycle_state(id, &c, today()).unwrap(), Some("TODO".into()));
    assert_eq!(d.render(), "- TODO\n  created:: 2026-10-29 14:05:09\n");
    assert_eq!(with_state("", Some("TODO"), &c), "TODO");
}

#[test]
fn done_date_reads_the_property_block_only() {
    use breccia_core::task::done_date;
    let d = chrono::NaiveDate::from_ymd_opt(2026, 10, 28).unwrap();
    assert_eq!(done_date("DONE x\ndone:: [[2026-10-28]]"), Some(d));
    assert_eq!(
        done_date("DONE x\nowner:: a\ndone:: [[2026-10-28]]"),
        Some(d)
    );
    assert_eq!(done_date("DONE x\n\ndone:: [[2026-10-28]]"), None);
    assert_eq!(done_date("DONE x\ndone:: soon"), None);
    assert_eq!(done_date("DONE x"), None);
}

#[test]
fn the_first_done_property_wins() {
    let d = |s| NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap();
    assert_eq!(
        done_date("DONE x\ndone:: [[2026-10-01]]\ndone:: [[2026-10-05]]"),
        Some(d("2026-10-01"))
    );
}

#[test]
fn step_state_wraps_around_and_keeps_the_label() {
    let c = Config::default();
    let mut d = parse("- DOING x\n", &mut IdGen::new());
    let id = d.blocks()[0].id();
    let seq: Vec<_> = (0..3)
        .map(|_| d.step_state(id, &c, today()).unwrap())
        .collect();
    assert_eq!(
        seq,
        vec![
            Some("DONE".into()),
            Some("TODO".into()),
            Some("DOING".into())
        ]
    );
    assert!(d.render().starts_with("- DOING x"));
}

#[test]
fn step_state_leaves_a_block_without_a_state_alone() {
    let c = Config::default();
    let mut d = parse("- x\n", &mut IdGen::new());
    let id = d.blocks()[0].id();
    assert_eq!(d.step_state(id, &c, today()).unwrap(), None);
    assert_eq!(d.render(), "- x\n");
}

#[test]
fn archived_date_reads_a_plain_date_or_a_journal_link() {
    let d = |s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok();
    assert_eq!(
        archived_date("DONE x\narchived:: 2026-11-03"),
        d("2026-11-03")
    );
    assert_eq!(
        archived_date("DONE x\narchived:: [[2026-11-02]]"),
        d("2026-11-02")
    );
    assert_eq!(archived_date("DONE x\narchived:: yes"), None);
    assert_eq!(archived_date("DONE x"), None);
    // Only among the property lines, like `done::`.
    assert_eq!(archived_date("DONE x\n\narchived:: 2026-11-03"), None);
}

#[test]
fn done_and_archived_read_a_time_or_the_start_of_the_day() {
    use chrono::NaiveTime;
    let at = |d: &str, t: &str| {
        NaiveDate::parse_from_str(d, "%Y-%m-%d")
            .unwrap()
            .and_time(NaiveTime::parse_from_str(t, "%H:%M:%S").unwrap())
    };
    // The form Breccia writes now, and the old date-only form.
    let new = "DONE x\ndone:: [[2026-11-03]] 14:05:09\narchived:: 2026-11-04 08:00:01";
    assert_eq!(done_at(new), Some(at("2026-11-03", "14:05:09")));
    assert_eq!(done_time(new), NaiveTime::from_hms_opt(14, 5, 9));
    assert_eq!(done_date(new), NaiveDate::from_ymd_opt(2026, 11, 3));
    assert_eq!(archived_at(new), Some(at("2026-11-04", "08:00:01")));
    assert_eq!(archived_date(new), NaiveDate::from_ymd_opt(2026, 11, 4));
    let old = "DONE x\ndone:: [[2026-11-03]]\narchived:: 2026-11-04";
    assert_eq!(done_at(old), Some(at("2026-11-03", "00:00:00")));
    assert_eq!(done_time(old), None);
    assert_eq!(archived_at(old), Some(at("2026-11-04", "00:00:00")));
    // A journal link as the archived value, with or without a time.
    assert_eq!(
        archived_at("DONE x\narchived:: [[2026-11-02]] 09:10:11"),
        Some(at("2026-11-02", "09:10:11"))
    );
    // Something else after the date is no time: the day still counts.
    let odd = "DONE x\ndone:: [[2026-11-03]] late\narchived:: 2026-11-04 soon";
    assert_eq!(done_at(odd), Some(at("2026-11-03", "00:00:00")));
    assert_eq!(archived_at(odd), Some(at("2026-11-04", "00:00:00")));
    assert_eq!(archived_date(odd), NaiveDate::from_ymd_opt(2026, 11, 4));
    // On the same day, a time sorts after the start of the day.
    assert!(done_at(new) > done_at(old));
}

#[test]
fn priority_is_a_whole_number_from_one_up() {
    assert_eq!(priority("TODO x\npriority:: 3"), Some(3));
    assert_eq!(priority("TODO x\nowner:: Ben\npriority::  12 "), Some(12));
    assert_eq!(priority("TODO x\npriority:: 1"), Some(1));
    for bad in ["0", "-1", "+2", "high", "2.5", "", "1 2", "99999999999"] {
        assert_eq!(
            priority(&format!("TODO x\npriority:: {bad}")),
            None,
            "{bad:?}"
        );
    }
    // The key is matched exactly, only among the property lines, and the first line counts.
    assert_eq!(priority("TODO x\nPriority:: 3"), None);
    assert_eq!(priority("TODO x\n\npriority:: 3"), None);
    assert_eq!(priority("TODO x\npriority:: high\npriority:: 4"), None);
    assert_eq!(priority("TODO x"), None);
}

fn prioritize(src: &str, value: Option<u32>) -> String {
    let mut d = parse(src, &mut IdGen::new());
    let id = d.blocks()[0].id();
    d.set_priority(id, value).unwrap();
    d.render()
}

#[test]
fn set_priority_adds_replaces_and_removes_the_line() {
    // Added after the last property line, before the children.
    assert_eq!(
        prioritize("- TODO x\n  owner:: Ben\n  note\n  - child\n", Some(2)),
        "- TODO x\n  owner:: Ben\n  priority:: 2\n  note\n  - child\n"
    );
    // Replaced where it stands; an invalid value is replaced too, and further lines go.
    assert_eq!(
        prioritize(
            "- TODO x\n  priority:: high\n  owner:: Ben\n  priority:: 7\n",
            Some(5)
        ),
        "- TODO x\n  priority:: 5\n  owner:: Ben\n"
    );
    // Removed; a priority:: line that is not a property line is plain text and stays.
    assert_eq!(
        prioritize(
            "- TODO x\n  priority:: 3\n  owner:: Ben\n\n  priority:: 9\n",
            None
        ),
        "- TODO x\n  owner:: Ben\n\n  priority:: 9\n"
    );
    // Nothing to change.
    let src = "- TODO x\n  priority:: 4\n";
    assert_eq!(prioritize(src, Some(4)), src);
    assert_eq!(prioritize("- TODO x\n", None), "- TODO x\n");
    let mut d = parse("- x\n", &mut IdGen::new());
    assert_eq!(
        d.set_priority(BlockId(999), Some(1)),
        Err(EditError::UnknownBlock)
    );
}

#[test]
fn finishing_or_archiving_removes_the_priority() {
    let src = "- TODO x\n  priority:: 3\n  owner:: Ben\n";
    assert_eq!(
        apply(src, 0, Some("DONE")),
        "- DONE x\n  owner:: Ben\n  done:: [[2026-10-29]] 14:05:09\n"
    );
    assert_eq!(
        archive(src, 0, true),
        "- TODO x\n  owner:: Ben\n  archived:: 2026-10-29 14:05:09\n"
    );
    // Another state that is not finished keeps it; removing the state removes it.
    assert_eq!(
        apply(src, 0, Some("DOING")),
        "- DOING x\n  priority:: 3\n  owner:: Ben\n"
    );
    assert_eq!(apply(src, 0, None), "- x\n  owner:: Ben\n");
    // An invalid value goes too when the task is finished.
    assert_eq!(
        apply("- TODO x\n  priority:: high\n", 0, Some("DONE")),
        "- DONE x\n  done:: [[2026-10-29]] 14:05:09\n"
    );
    // Through the cycle as well.
    let mut d = parse("- DOING x\n  priority:: 2\n", &mut IdGen::new());
    let id = d.blocks()[0].id();
    d.cycle_state(id, &Config::default(), today()).unwrap();
    assert_eq!(d.render(), "- DONE x\n  done:: [[2026-10-29]] 14:05:09\n");
}

#[test]
fn old_date_only_lines_are_not_rewritten() {
    // Archiving an archived task changes nothing; a move between finished
    // states keeps the old done line.
    let src = "- DONE x\n  done:: [[2026-10-20]]\n  archived:: 2026-10-21\n";
    assert_eq!(archive(src, 0, true), src);
    let mut c = Config::default();
    c.states.push(breccia_core::config::State {
        keyword: "SHIPPED".into(),
        color: "green".into(),
        finished: true,
        in_cycle: false,
    });
    let mut d = parse("- DONE x\n  done:: [[2026-10-20]]\n", &mut IdGen::new());
    let id = d.blocks()[0].id();
    d.set_state(id, Some("SHIPPED"), &c, today()).unwrap();
    assert_eq!(d.render(), "- SHIPPED x\n  done:: [[2026-10-20]]\n");
}

// `created::` on tasks.

#[test]
fn a_block_that_gets_a_state_gets_created() {
    assert_eq!(
        apply("- Ask Ben\n", 0, Some("TODO")),
        "- TODO Ask Ben\n  created:: 2026-10-29 14:05:09\n"
    );
    // Straight to a finished state: created, then done.
    assert_eq!(
        apply("- Ask Ben\n", 0, Some("DONE")),
        "- DONE Ask Ben\n  created:: 2026-10-29 14:05:09\n  done:: [[2026-10-29]] 14:05:09\n"
    );
    // After the properties already there; children stay below.
    assert_eq!(
        apply("- Ask\n  owner:: Ben\n  - child\n", 0, Some("TODO")),
        "- TODO Ask\n  owner:: Ben\n  created:: 2026-10-29 14:05:09\n  - child\n"
    );
}

#[test]
fn a_change_between_states_keeps_created() {
    let src = "- TODO Ask\n  created:: 2026-10-01 08:00:00\n";
    assert_eq!(
        apply(src, 0, Some("DOING")),
        "- DOING Ask\n  created:: 2026-10-01 08:00:00\n"
    );
    let done = apply(src, 0, Some("DONE"));
    assert_eq!(
        done,
        "- DONE Ask\n  created:: 2026-10-01 08:00:00\n  done:: [[2026-10-29]] 14:05:09\n"
    );
    // Reopened: created stays, done goes.
    assert_eq!(apply(&done, 0, Some("TODO")), src);
}

#[test]
fn removing_the_state_removes_created() {
    let done = "- DONE Ask\n  owner:: Ben\n  created:: 2026-10-01 08:00:00\n  done:: [[2026-10-02]] 09:00:00\n  created:: again\n";
    assert_eq!(apply(done, 0, None), "- Ask\n  owner:: Ben\n");
}

#[test]
fn an_old_task_without_created_gets_none() {
    // Only a block that gets a state from none is "assigned" one.
    assert_eq!(apply("- TODO Ask\n", 0, Some("DOING")), "- DOING Ask\n");
    assert_eq!(
        apply("- TODO Ask\n", 0, Some("DONE")),
        "- DONE Ask\n  done:: [[2026-10-29]] 14:05:09\n"
    );
}

#[test]
fn a_created_line_already_there_is_kept() {
    // A block without a state that carries created:: (pasted, or written by hand) keeps it.
    assert_eq!(
        apply("- Ask\n  created:: 2026-10-01 08:00:00\n", 0, Some("TODO")),
        "- TODO Ask\n  created:: 2026-10-01 08:00:00\n"
    );
}

#[test]
fn the_cycle_keeps_created_when_it_wraps() {
    let c = Config::default();
    let mut d = parse("- Ask\n", &mut IdGen::new());
    let id = d.blocks()[0].id();
    d.cycle_state(id, &c, today()).unwrap();
    assert_eq!(d.render(), "- TODO Ask\n  created:: 2026-10-29 14:05:09\n");
    let later = today() + chrono::Duration::hours(2);
    d.cycle_state(id, &c, later).unwrap();
    d.cycle_state(id, &c, later).unwrap();
    assert_eq!(
        d.render(),
        "- DONE Ask\n  created:: 2026-10-29 14:05:09\n  done:: [[2026-10-29]] 16:05:09\n"
    );
    d.cycle_state(id, &c, later).unwrap();
    assert_eq!(d.render(), "- TODO Ask\n  created:: 2026-10-29 14:05:09\n");
}

#[test]
fn created_at_reads_the_property_lines() {
    let at = |t: &str| created_at(t).map(|t| t.to_string());
    assert_eq!(
        at("TODO x\ncreated:: 2026-11-04 09:12:30").as_deref(),
        Some("2026-11-04 09:12:30")
    );
    // A plain date counts as the start of the day.
    assert_eq!(
        at("TODO x\ncreated:: 2026-11-04").as_deref(),
        Some("2026-11-04 00:00:00")
    );
    assert_eq!(at("TODO x\ncreated:: yesterday"), None);
    assert_eq!(at("TODO x\ncreated:: 2026-11-04 9:12"), None);
    assert_eq!(at("TODO x\n\ncreated:: 2026-11-04 09:12:30"), None);
    assert_eq!(at("TODO x"), None);
}

// Cycling never removes the state.

fn no_cycle() -> Config {
    let mut c = Config::default();
    for s in &mut c.states {
        s.in_cycle = false;
    }
    c
}

#[test]
fn wrap_from_done_drops_done_and_archived() {
    let src = "- DONE Ask\n  created:: 2026-10-01 08:00:00\n  done:: [[2026-10-02]] 09:00:00\n  archived:: 2026-10-20 10:00:00\n";
    let mut d = parse(src, &mut IdGen::new());
    let id = d.blocks()[0].id();
    assert_eq!(
        d.cycle_state(id, &Config::default(), today()).unwrap(),
        Some("TODO".into())
    );
    assert_eq!(d.render(), "- TODO Ask\n  created:: 2026-10-01 08:00:00\n");
}

#[test]
fn cycle_with_no_state_in_it_is_refused() {
    let c = no_cycle();
    for src in ["- TODO a\n", "- a\n"] {
        let mut d = parse(src, &mut IdGen::new());
        let id = d.blocks()[0].id();
        assert_eq!(d.cycle_state(id, &c, today()), Err(EditError::NoCycle));
        assert_eq!(d.step_state(id, &c, today()), Err(EditError::NoCycle));
        assert_eq!(d.render(), src);
    }
    assert_eq!(
        EditError::NoCycle.to_string(),
        "No state is in the cycle (Settings → States)"
    );
}

#[test]
fn removing_the_state_removes_priority() {
    assert_eq!(
        apply(
            "- TODO a\n  created:: 2026-10-01 08:00:00\n  priority:: 3\n",
            0,
            None
        ),
        "- a\n"
    );
    // A keyword deleted by hand, settled when the editor closes.
    let c = Config::default();
    let mut d = parse("- a\n  priority:: 3\n", &mut IdGen::new());
    let id = d.blocks()[0].id();
    d.settle_state(id, Some("TODO"), &c, today()).unwrap();
    assert_eq!(d.render(), "- a\n");
}

#[test]
fn removing_the_state_of_a_plain_block_changes_nothing() {
    // Property lines on a block that is no task are the user's own text.
    let src = "- notes\n  created:: 2026-10-01 08:00:00\n  done:: [[2026-10-02]]\n  priority:: 3\n  archived:: 2026-10-03\n";
    assert_eq!(apply(src, 0, None), src);
}

#[test]
fn property_lines_edits_keep_every_other_byte() {
    // A block of one line: the new line follows it.
    assert_eq!(
        prioritize("- TODO x\n", Some(3)),
        "- TODO x\n  priority:: 3\n"
    );
    assert_eq!(
        apply("- TODO x\n", 0, Some("DONE")),
        "- DONE x\n  created:: 2026-10-29 14:05:09\n  done:: [[2026-10-29]] 14:05:09\n"
            .replace("  created:: 2026-10-29 14:05:09\n", "")
    );
    // Two priority lines: set replaces the first and drops the second; remove drops both.
    let two = "- TODO x\n  priority:: 1\n  owner:: Ben\n  priority:: 2\n";
    assert_eq!(
        prioritize(two, Some(9)),
        "- TODO x\n  priority:: 9\n  owner:: Ben\n"
    );
    assert_eq!(prioritize(two, None), "- TODO x\n  owner:: Ben\n");
    // A property line after a non-property line is text and is not touched.
    let late = "- TODO x\n  plain\n  priority:: 1\n";
    assert_eq!(prioritize(late, None), late);
    assert_eq!(
        prioritize(late, Some(2)),
        "- TODO x\n  priority:: 2\n  plain\n  priority:: 1\n"
    );
    // created:: already there: a state change keeps it, bytes unchanged.
    let created = "- TODO x\n  created:: 2026-10-01 08:00:00\n";
    assert_eq!(
        apply(created, 0, Some("DOING")),
        "- DOING x\n  created:: 2026-10-01 08:00:00\n"
    );
    // done:: present and the state stays finished: unchanged.
    let done = "- DONE x\n  done:: [[2026-10-01]] 08:00:00\n";
    assert_eq!(apply(done, 0, Some("DONE")), done);
    // A foreign property first: the new line goes after it.
    assert_eq!(
        archive("- TODO x\n  owner:: Ben\n", 0, true),
        "- TODO x\n  owner:: Ben\n  archived:: 2026-10-29 14:05:09\n"
    );
    assert_eq!(
        archive(
            "- TODO x\n  owner:: Ben\n  archived:: 2026-10-01\n  archived:: 2026-10-02\n",
            0,
            false
        ),
        "- TODO x\n  owner:: Ben\n"
    );
    let arch = "- TODO x\n  archived:: 2026-10-01\n";
    assert_eq!(archive(arch, 0, true), arch);
}
