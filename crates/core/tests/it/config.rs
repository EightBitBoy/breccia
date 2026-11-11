use breccia_core::config::*;

#[test]
fn empty_file_gives_defaults() {
    let c = Config::parse("").unwrap();
    assert_eq!(c, Config::default());
    let kw: Vec<_> = c
        .states
        .iter()
        .map(|s| (s.keyword.as_str(), s.finished, s.in_cycle, s.color.as_str()))
        .collect();
    assert_eq!(
        kw,
        vec![
            ("TODO", false, true, "grey"),
            ("DOING", false, true, "amber"),
            ("WAITING", false, false, "violet"),
            ("DONE", true, true, "green"),
        ]
    );
    assert_eq!(c.boards[0].name, "Tasks");
    assert_eq!(c.boards[0].columns, ["TODO", "DOING", "WAITING", "DONE"]);
    assert_eq!(c.board.archive_after_days, 14);
    assert!(c.board.auto_archive);
    assert_eq!(
        (
            c.git.enabled,
            c.git.commit_delay_minutes,
            c.git.pull_interval_minutes
        ),
        (true, 5, 5)
    );
}

#[test]
fn default_toml_matches_default() {
    assert_eq!(
        Config::parse(Config::default_toml()).unwrap(),
        Config::default()
    );
}

#[test]
fn custom_states_replace_defaults() {
    let c = Config::parse(
        "[[states]]\nkeyword = \"NEXT\"\ncolor = \"blue\"\nfinished = false\nin_cycle = true\n",
    )
    .unwrap();
    assert_eq!(c.states.len(), 1);
    assert_eq!(c.git.commit_delay_minutes, 5);
}

#[test]
fn invalid_configs() {
    let st = |k: &str| {
        format!(
            "[[states]]\nkeyword = \"{k}\"\ncolor = \"grey\"\nfinished = false\nin_cycle = true\n"
        )
    };
    assert!(
        matches!(Config::parse(&(st("TODO") + &st("TODO"))), Err(ConfigError::DuplicateState(k)) if k == "TODO")
    );
    assert!(matches!(
        Config::parse(&st("todo")),
        Err(ConfigError::InvalidKeyword(_))
    ));
    assert!(matches!(
        Config::parse("states = []"),
        Err(ConfigError::NoStates)
    ));
    assert!(matches!(Config::parse("[git\n"), Err(ConfigError::Toml(m)) if m.contains("line 1")));
}

#[test]
fn cycle_order() {
    let c = Config::default();
    let n = |s: Option<&str>| c.cycle_next(s).map(|s| s.keyword.clone());
    assert_eq!(n(None).as_deref(), Some("TODO"));
    assert_eq!(n(Some("TODO")).as_deref(), Some("DOING"));
    assert_eq!(n(Some("DOING")).as_deref(), Some("DONE"));
    // After the last one it starts again at the first; it never leads to "no state".
    assert_eq!(n(Some("DONE")).as_deref(), Some("TODO"));
    assert_eq!(n(Some("WAITING")).as_deref(), Some("DONE"));
}

#[test]
fn load_missing_file_is_default() {
    let dir = tempfile::tempdir().unwrap();
    assert_eq!(Config::load(dir.path()).unwrap(), Config::default());
}

const HAND: &str = "# my settings\n[[states]]\nkeyword = \"TODO\" # first\ncolor = \"grey\"\nin_cycle = true\nmine = 1\n\n[[states]]\nkeyword = \"DONE\"\ncolor = \"green\"\nfinished = true\nin_cycle = true\n\n[[boards]]\nname = \"Tasks\"\ncolumns = [\"TODO\", \"DONE\"] # keep\n\n[custom]\nx = 1\n";

fn root_with(text: Option<&str>) -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    if let Some(text) = text {
        let p = dir.path().join("breccia");
        std::fs::create_dir_all(&p).unwrap();
        std::fs::write(p.join("config.toml"), text).unwrap();
    }
    dir
}

fn on_disk(dir: &tempfile::TempDir) -> String {
    std::fs::read_to_string(dir.path().join("breccia").join("config.toml")).unwrap()
}

fn st(keyword: &str, color: &str, finished: bool, in_cycle: bool) -> State {
    State {
        keyword: keyword.into(),
        color: color.into(),
        finished,
        in_cycle,
    }
}

fn sorted_lines(s: &str) -> Vec<String> {
    let mut v: Vec<String> = s.lines().map(String::from).collect();
    v.sort();
    v
}

#[test]
fn write_states_keeps_comments_unknown_keys_and_order() {
    let dir = root_with(Some(HAND));
    let mut states = Config::parse(HAND).unwrap().states;
    states[0].color = "blue".into();
    let out = Config::write_states(dir.path(), Expect::Any, &states, &[]).unwrap();
    let expected1 = HAND.replace("color = \"grey\"", "color = \"blue\"");
    assert_eq!(out, expected1);
    assert_eq!(on_disk(&dir), expected1);

    states.push(st("WAITING", "violet", false, false));
    Config::write_states(dir.path(), Expect::Any, &states, &[]).unwrap();
    let expected2 = expected1.replace(
        "\n[[boards]]",
        "\n[[states]]\nkeyword = \"WAITING\"\ncolor = \"violet\"\nfinished = false\nin_cycle = false\n\n[[boards]]",
    );
    assert_eq!(on_disk(&dir), expected2);

    let reordered = vec![states[1].clone(), states[0].clone(), states[2].clone()];
    Config::write_states(dir.path(), Expect::Any, &reordered, &[]).unwrap();
    let after = on_disk(&dir);
    let kws: Vec<String> = Config::parse(&after)
        .unwrap()
        .states
        .into_iter()
        .map(|s| s.keyword)
        .collect();
    assert_eq!(kws, ["DONE", "TODO", "WAITING"]);
    assert_eq!(sorted_lines(&after), sorted_lines(&expected2));
}

#[test]
fn write_states_renames_the_table_and_board_columns() {
    let dir = root_with(Some(HAND));
    let mut states = Config::parse(HAND).unwrap().states;
    states[0].keyword = "OPEN".into();
    Config::write_states(
        dir.path(),
        Expect::Any,
        &states,
        &[("TODO".into(), "OPEN".into())],
    )
    .unwrap();
    let expected = HAND
        .replace("keyword = \"TODO\"", "keyword = \"OPEN\"")
        .replace("[\"TODO\", \"DONE\"]", "[\"OPEN\", \"DONE\"]");
    assert_eq!(on_disk(&dir), expected);
    assert!(expected.contains("# first") && expected.contains("mine = 1"));
}

#[test]
fn write_states_renames_inline_board_columns() {
    let text = "boards = [{ name = \"T\", columns = [\"TODO\" , \"DONE\"] }]\n\n[[states]]\nkeyword = \"TODO\"\n\n[[states]]\nkeyword = \"DONE\"\n";
    let dir = root_with(Some(text));
    let mut states = Config::parse(text).unwrap().states;
    states[0].keyword = "OPEN".into();
    Config::write_states(
        dir.path(),
        Expect::Any,
        &states,
        &[("TODO".into(), "OPEN".into())],
    )
    .unwrap();
    let expected = text
        .replace("keyword = \"TODO\"", "keyword = \"OPEN\"")
        .replace("[\"TODO\" ,", "[\"OPEN\" ,");
    assert_eq!(on_disk(&dir), expected);
}

#[test]
fn write_states_removes_a_table_and_keeps_the_next_comment() {
    let text = format!(
        "{}[[states]]\nkeyword = \"LATER\"\ncolor = \"blue\"\n# kept\n[custom]\nkey = 1\n",
        Config::default_toml()
    );
    let dir = root_with(Some(&text));
    Config::write_states(dir.path(), Expect::Any, &Config::default().states, &[]).unwrap();
    assert_eq!(
        on_disk(&dir),
        format!("{}# kept\n[custom]\nkey = 1\n", Config::default_toml())
    );
}

#[test]
fn write_states_inline_array_stays_inline() {
    let text = "states = [{ keyword = \"TODO\", in_cycle = true }, { keyword = \"DONE\", finished = true }] # mine\n";
    let dir = root_with(Some(text));
    let mut states = Config::parse(text).unwrap().states;
    states[1].color = "green".into();
    Config::write_states(dir.path(), Expect::Any, &states, &[]).unwrap();
    assert_eq!(
        on_disk(&dir),
        "states = [{ keyword = \"TODO\", in_cycle = true }, { keyword = \"DONE\", finished = true, color = \"green\" }] # mine\n"
    );
}

#[test]
fn write_git_keeps_everything_else() {
    let base = Config::default_toml().replace("[git]\n", "# sync\n[git]\n");
    let base = base.replace("enabled = true", "enabled = true # on");
    let dir = root_with(Some(&base));
    let git = GitSettings {
        enabled: false,
        commit_delay_minutes: 5,
        pull_interval_minutes: 5,
    };
    Config::write_git(dir.path(), Expect::Any, &git).unwrap();
    let expected = base.replace("enabled = true # on", "enabled = false # on");
    assert_eq!(on_disk(&dir), expected);

    // CRLF input: same result, LF only.
    let dir = root_with(Some(&base.replace('\n', "\r\n")));
    Config::write_git(dir.path(), Expect::Any, &git).unwrap();
    assert_eq!(on_disk(&dir), expected);

    // Dotted.
    let dotted = "git.enabled = true\n[[states]]\nkeyword = \"TODO\"\n";
    let dir = root_with(Some(dotted));
    Config::write_git(dir.path(), Expect::Any, &git).unwrap();
    assert_eq!(
        on_disk(&dir),
        "git.enabled = false\n[[states]]\nkeyword = \"TODO\"\n"
    );

    // Inline: a new key is appended to the inline table.
    let dir = root_with(Some("git = { enabled = true }\n"));
    let git = GitSettings {
        enabled: true,
        commit_delay_minutes: 10,
        pull_interval_minutes: 5,
    };
    Config::write_git(dir.path(), Expect::Any, &git).unwrap();
    assert_eq!(
        on_disk(&dir),
        "git = { enabled = true, commit_delay_minutes = 10 }\n"
    );
}

#[test]
fn a_missing_git_table_is_added_at_the_end() {
    let dir = root_with(Some("[[states]]\nkeyword = \"TODO\"\n"));
    let git = GitSettings {
        enabled: true,
        commit_delay_minutes: 10,
        pull_interval_minutes: 5,
    };
    Config::write_git(dir.path(), Expect::Any, &git).unwrap();
    assert_eq!(
        on_disk(&dir),
        "[[states]]\nkeyword = \"TODO\"\n\n[git]\ncommit_delay_minutes = 10\n"
    );

    let dir = root_with(None);
    let git = GitSettings {
        enabled: false,
        ..GitSettings::default()
    };
    Config::write_git(dir.path(), Expect::Any, &git).unwrap();
    assert_eq!(
        on_disk(&dir),
        Config::default_toml().replace("[git]\nenabled = true", "[git]\nenabled = false")
    );
}

#[test]
fn write_board_settings_sets_only_archive_days() {
    let dir = root_with(Some(Config::default_toml()));
    Config::write_board_settings(
        dir.path(),
        Expect::Any,
        &BoardSettings {
            archive_after_days: 30,
            auto_archive: true,
        },
    )
    .unwrap();
    assert_eq!(
        on_disk(&dir),
        Config::default_toml().replace("archive_after_days = 14", "archive_after_days = 30")
    );
}

#[test]
fn auto_archive_reads_and_is_written_alone() {
    let c = Config::parse(
        "[board]
auto_archive = false
",
    )
    .unwrap();
    assert!(!c.board.auto_archive);
    assert_eq!(c.board.archive_after_days, 14);
    // A comment, an unknown key and the other key keep their bytes.
    let text = "# mine
[board]
archive_after_days = 30 # keep
unknown = 1
";
    let dir = root_with(Some(text));
    let off = BoardSettings {
        archive_after_days: 30,
        auto_archive: false,
    };
    Config::write_board_settings(dir.path(), Expect::Any, &off).unwrap();
    assert_eq!(
        on_disk(&dir),
        format!(
            "{text}auto_archive = false
"
        )
    );
    let on = BoardSettings {
        auto_archive: true,
        ..off
    };
    Config::write_board_settings(dir.path(), Expect::Any, &on).unwrap();
    assert_eq!(
        on_disk(&dir),
        format!(
            "{text}auto_archive = true
"
        )
    );
}

#[test]
fn a_missing_board_table_is_added_at_the_end() {
    let dir = root_with(Some("[[states]]\nkeyword = \"TODO\"\n"));
    Config::write_board_settings(
        dir.path(),
        Expect::Any,
        &BoardSettings {
            archive_after_days: 30,
            auto_archive: true,
        },
    )
    .unwrap();
    assert_eq!(
        on_disk(&dir),
        "[[states]]\nkeyword = \"TODO\"\n\n[board]\narchive_after_days = 30\n"
    );
}

#[test]
fn check_states_rules() {
    let d = Config::default().states;
    assert!(Config::check_states(&d, &d).is_ok());
    assert!(matches!(
        Config::check_states(&[], &d),
        Err(ConfigError::NoStates)
    ));
    for k in ["todo", "TO DO", "1X"] {
        assert!(
            matches!(
                Config::check_states(&[st(k, "grey", false, false)], &d),
                Err(ConfigError::InvalidKeyword(_))
            ),
            "{k}"
        );
    }
    assert!(matches!(
        Config::check_states(
            &[
                st("TODO", "grey", false, false),
                st("TODO", "blue", false, false)
            ],
            &d
        ),
        Err(ConfigError::DuplicateState(_))
    ));
    let pink = vec![st("TODO", "pink", false, true)];
    assert!(matches!(
        Config::check_states(&pink, &d),
        Err(ConfigError::InvalidState(m)) if m.contains("pink") && m.contains("TODO")
    ));
    // A colour already in the file is accepted as it stands.
    assert!(Config::check_states(&pink, &pink).is_ok());
    let pinkish = vec![st("TODO", "pinkish", false, true)];
    assert!(matches!(
        Config::check_states(&pinkish, &pink),
        Err(ConfigError::InvalidState(_))
    ));
    assert_eq!(PALETTE.len(), 8);
}

#[test]
fn write_states_removing_a_table_keeps_the_comment_above_it() {
    let dir = root_with(Some(HAND));
    let done = Config::parse(HAND).unwrap().states[1].clone();
    Config::write_states(dir.path(), Expect::Any, &[done], &[]).unwrap();
    let after = on_disk(&dir);
    assert!(
        after.starts_with("# my settings\n") && after.contains("\n[[states]]\nkeyword = \"DONE\""),
        "{after}"
    );
    assert!(!after.contains("# first") && !after.contains("mine = 1"));
    assert!(after.contains("[[boards]]") && after.contains("[custom]\nx = 1\n"));

    // The removed table was the last one: its comment stays at the end.
    let text = "[[states]]\nkeyword = \"TODO\"\n\n# bye\n[[states]]\nkeyword = \"DONE\"\n";
    let dir = root_with(Some(text));
    let todo = Config::parse(text).unwrap().states[0].clone();
    Config::write_states(dir.path(), Expect::Any, &[todo], &[]).unwrap();
    let after = on_disk(&dir);
    assert!(after.contains("# bye"), "{after}");
    assert!(!after.contains("DONE"));
    assert!(after.trim_end().ends_with("# bye"), "{after}");
}

#[test]
fn write_states_without_a_states_key_writes_every_state() {
    let text = "[git]\nenabled = true\n";
    let dir = root_with(Some(text));
    Config::write_states(dir.path(), Expect::Any, &Config::default().states, &[]).unwrap();
    let after = on_disk(&dir);
    assert!(after.starts_with(text));
    assert_eq!(after.matches("[[states]]").count(), 4);
    assert_eq!(
        Config::parse(&after).unwrap().states,
        Config::default().states
    );
}

#[test]
fn an_empty_inline_boards_array_keeps_its_comment() {
    let board = Board {
        name: "Tasks".into(),
        columns: vec!["TODO".into()],
    };
    for text in [
        "boards = [ # none yet\n]\n",
        "boards = [] # none yet\n",
        "# my boards\nboards = []\n",
    ] {
        let dir = root_with(Some(text));
        Config::write_boards(dir.path(), Expect::Any, std::slice::from_ref(&board)).unwrap();
        let after = on_disk(&dir);
        assert!(
            after.contains("# none yet") || after.contains("# my boards"),
            "{text:?} -> {after:?}"
        );
        assert_eq!(Config::parse(&after).unwrap().boards.len(), 1, "{after}");
    }
}

const INLINE: &str =
    "states = [\n  { keyword = \"TODO\" }, # first\n  { keyword = \"DONE\" }, # second\n]\n";

fn inline_write(states: Vec<State>) -> String {
    let dir = root_with(Some(INLINE));
    Config::write_states(dir.path(), Expect::Any, &states, &[]).unwrap();
    on_disk(&dir)
}

#[test]
fn a_commented_multi_line_inline_states_array_keeps_each_comment_with_its_element() {
    let s = Config::parse(INLINE).unwrap().states;
    // Remove DONE: `# second` is kept (with the array's end), `# first` stays on TODO.
    let out = inline_write(vec![s[0].clone()]);
    assert!(out.contains("{ keyword = \"TODO\" }, # first\n"), "{out}");
    assert!(out.contains("# second"), "{out}");
    // Remove TODO: both comments stay.
    let out = inline_write(vec![s[1].clone()]);
    assert!(out.contains("# first") && out.contains("# second"), "{out}");
    assert!(Config::parse(&out).is_ok(), "{out}");
    // Add X: nothing moves, X goes on its own line.
    let mut v = s.clone();
    v.push(st("X", "violet", false, false));
    assert_eq!(
        inline_write(v),
        "states = [\n  { keyword = \"TODO\" }, # first\n  { keyword = \"DONE\" }, # second\n  { keyword = \"X\", color = \"violet\", finished = false, in_cycle = false },\n]\n"
    );
    // Reorder: each comment travels with its element.
    assert_eq!(
        inline_write(vec![s[1].clone(), s[0].clone()]),
        "states = [\n  { keyword = \"DONE\" }, # second\n  { keyword = \"TODO\" }, # first\n]\n"
    );
}

#[test]
fn zero_boards_keep_the_comment_of_an_empty_boards_array() {
    for text in [
        "boards = [] # none yet\n",
        "# my boards\nboards = []\n",
        "boards = [ # none yet\n]\n",
    ] {
        let dir = root_with(Some(text));
        Config::write_boards(dir.path(), Expect::Any, &[]).unwrap();
        assert_eq!(on_disk(&dir), text);
    }
}

#[test]
fn a_commented_boards_value_that_is_no_array_is_refused() {
    let text = "boards = 5 # why\n";
    let dir = root_with(Some(text));
    let board = Board {
        name: "T".into(),
        columns: vec!["TODO".into()],
    };
    assert!(matches!(
        Config::write_boards(dir.path(), Expect::Any, &[board]),
        Err(ConfigError::Toml(_))
    ));
    assert_eq!(on_disk(&dir), text);
}

// ---- final fix wave: compare-and-swap, merged columns, columns kept in place ----

#[test]
fn a_writer_refuses_when_the_file_changed_since_it_was_read() {
    let read = Config::default_toml();
    let theirs = format!("# theirs\n{read}");
    let board = Board {
        name: "Tasks".into(),
        columns: vec!["TODO".into()],
    };
    let states = Config::default().states;
    type Write<'a> = Box<dyn Fn(&std::path::Path, Expect<'_>) -> Result<String, ConfigError> + 'a>;
    let writes: Vec<Write> = vec![
        Box::new(|r, e| Config::write_boards(r, e, std::slice::from_ref(&board))),
        Box::new(|r, e| Config::write_states(r, e, &states, &[])),
        Box::new(|r, e| Config::write_git(r, e, &GitSettings::default())),
        Box::new(|r, e| {
            Config::write_board_settings(
                r,
                e,
                &BoardSettings {
                    archive_after_days: 30,
                    auto_archive: true,
                },
            )
        }),
    ];
    for (i, write) in writes.iter().enumerate() {
        let dir = root_with(Some(&theirs));
        for expect in [Expect::Text(Some(read)), Expect::Text(None)] {
            assert!(
                matches!(write(dir.path(), expect), Err(ConfigError::Changed)),
                "writer {i}"
            );
            assert_eq!(on_disk(&dir), theirs, "writer {i}");
        }
        // The text it read is still there: the write goes through.
        write(dir.path(), Expect::Text(Some(&theirs))).unwrap();
        assert!(on_disk(&dir).starts_with("# theirs\n"), "writer {i}");
        // No file, and none expected: the default text is written.
        let empty = root_with(None);
        write(empty.path(), Expect::Text(None)).unwrap();
    }
}

#[test]
fn a_rename_onto_a_column_the_board_has_merges_it() {
    let text = "[[states]]\nkeyword = \"WAITING\"\n\n[[states]]\nkeyword = \"DONE\"\n\n[[boards]]\nname = \"T\"\ncolumns = [\"WAITING\", \"BLOCKED\", \"DONE\"]\n";
    let dir = root_with(Some(text));
    let states = vec![
        st("BLOCKED", "violet", false, false),
        st("DONE", "green", true, true),
    ];
    let pairs = [("WAITING".to_string(), "BLOCKED".to_string())];
    let out = Config::write_states(dir.path(), Expect::Any, &states, &pairs).unwrap();
    assert!(
        out.ends_with("columns = [\"BLOCKED\", \"DONE\"]\n"),
        "{out}"
    );
    // A multi-line array keeps the removed element's comment (at its end).
    let text = "[[states]]\nkeyword = \"WAITING\"\n\n[[boards]]\nname = \"T\"\ncolumns = [\n  \"WAITING\",\n  # the old one\n  \"BLOCKED\",\n  \"DONE\",\n]\n";
    let dir = root_with(Some(text));
    let out = Config::write_states(dir.path(), Expect::Any, &states[..1], &pairs).unwrap();
    assert!(
        out.ends_with("columns = [\n  \"BLOCKED\",\n  \"DONE\",\n  # the old one\n]\n"),
        "{out}"
    );
    assert_eq!(
        Config::parse(&out).unwrap().boards[0].columns,
        ["BLOCKED", "DONE"]
    );
}

#[test]
fn a_rename_merges_only_the_boards_it_touched() {
    let text = "[[states]]
keyword = \"TODO\"

[[states]]
keyword = \"WAITING\"

[[states]]
keyword = \"DONE\"

[[boards]]
name = \"Work\"
columns = [\"TODO\", \"WAITING\", \"BLOCKED\"]

[[boards]]
name = \"Hand\"
columns = [\"DONE\", \"DONE\"]
";
    let dir = root_with(Some(text));
    let states = vec![
        st("TODO", "blue", false, false),
        st("BLOCKED", "violet", false, false),
        st("DONE", "green", true, true),
    ];
    let pairs = [("WAITING".to_string(), "BLOCKED".to_string())];
    let out = Config::write_states(dir.path(), Expect::Any, &states, &pairs).unwrap();
    assert!(
        out.contains(
            "columns = [\"TODO\", \"BLOCKED\"]
"
        ),
        "{out}"
    );
    assert!(
        out.ends_with(
            "columns = [\"DONE\", \"DONE\"]
"
        ),
        "{out}"
    );
}

#[test]
fn changing_a_multi_line_columns_array_keeps_its_comments() {
    let text = "[[boards]]\nname = \"T\"\ncolumns = [ # mine\n  \"TODO\", # first\n  # before doing\n  \"DOING\",\n  \"DONE\", # last\n]\n";
    let write = |columns: &[&str]| {
        let dir = root_with(Some(text));
        let board = Board {
            name: "T".into(),
            columns: columns.iter().map(|c| c.to_string()).collect(),
        };
        Config::write_boards(dir.path(), Expect::Any, &[board]).unwrap()
    };
    // DOING removed: its comment goes to the end of the array.
    assert_eq!(
        write(&["TODO", "DONE"]),
        "[[boards]]\nname = \"T\"\ncolumns = [ # mine\n  \"TODO\", # first\n  \"DONE\", # last\n  # before doing\n]\n"
    );
    // WAITING added at the end, on its own line.
    assert_eq!(
        write(&["TODO", "DOING", "DONE", "WAITING"]),
        "[[boards]]\nname = \"T\"\ncolumns = [ # mine\n  \"TODO\", # first\n  # before doing\n  \"DOING\",\n  \"DONE\", # last\n  \"WAITING\",\n]\n"
    );
    // Reordered: each comment travels with its column (`# mine` is before TODO).
    assert_eq!(
        write(&["DOING", "TODO", "DONE"]),
        "[[boards]]\nname = \"T\"\ncolumns = [\n  # before doing\n  \"DOING\", # mine\n  \"TODO\", # first\n  \"DONE\", # last\n]\n"
    );
}

#[test]
fn cycle_wraps_from_a_state_outside_the_cycle() {
    let mut c = Config::default();
    c.states.push(st("CANCELED", "red", true, false));
    let n = |s: Option<&str>| c.cycle_next(s).map(|s| s.keyword.clone());
    assert_eq!(n(Some("WAITING")).as_deref(), Some("DONE"));
    assert_eq!(n(Some("CANCELED")).as_deref(), Some("TODO"));
    assert_eq!(n(Some("NOPE")).as_deref(), Some("TODO"));
}

#[test]
fn cycle_with_no_state_in_it_is_none() {
    let mut c = Config::default();
    for s in &mut c.states {
        s.in_cycle = false;
    }
    assert!(c.cycle_next(None).is_none());
    assert!(c.cycle_next(Some("TODO")).is_none());
}

/// A hand-written file (LF here; the test turns it into CRLF), comments above and beside tables, unknown keys in a
/// state table and in `[git]`, and inline-table boards.
const HAND_LF: &str = "# my settings
boards = [
  { name = \"Tasks\", columns = [\"TODO\", \"WAITING\", \"DONE\"] }, # main
  { name = \"Other\", columns = [\"DONE\"] },
]

# the first state
[[states]]
keyword = \"TODO\" # open
color = \"grey\"
in_cycle = true
mine = 1

# waiting is going away
[[states]]
keyword = \"WAITING\"
color = \"violet\"

# the last state
[[states]]
keyword = \"DONE\"
color = \"green\"
finished = true
in_cycle = true

[board]
archive_after_days = 14 # days

# sync
[git]
enabled = true
secret = \"x\"
";

#[test]
fn writers_keep_the_users_file_bytes() {
    let crlf = HAND_LF.replace('\n', "\r\n");
    assert!(crlf.contains("\r\n"), "the fixture must use CRLF");
    let dir = root_with(Some(&crlf));
    let root = dir.path();

    // A state renamed (the board columns follow it), one removed.
    let states = [
        st("NEXT", "grey", false, true),
        st("DONE", "green", true, true),
    ];
    let renames = [("TODO".to_string(), "NEXT".to_string())];
    Config::write_states(root, Expect::Any, &states, &renames).unwrap();
    assert_eq!(
        on_disk(&dir),
        "# my settings\nboards = [\n  { name = \"Tasks\", columns = [\"NEXT\", \"WAITING\", \"DONE\"] }, # main\n  { name = \"Other\", columns = [\"DONE\"] },\n]\n\n# the first state\n[[states]]\nkeyword = \"NEXT\" # open\ncolor = \"grey\"\nin_cycle = true\nmine = 1\n# waiting is going away\n\n# the last state\n[[states]]\nkeyword = \"DONE\"\ncolor = \"green\"\nfinished = true\nin_cycle = true\n\n[board]\narchive_after_days = 14 # days\n\n# sync\n[git]\nenabled = true\nsecret = \"x\"\n"
    );

    // A board renamed and its columns changed.
    let boards = [
        Board {
            name: "Work".into(),
            columns: vec!["DONE".into(), "NEXT".into()],
        },
        Board {
            name: "Other".into(),
            columns: vec!["DONE".into()],
        },
    ];
    Config::write_boards(root, Expect::Any, &boards).unwrap();
    assert_eq!(
        on_disk(&dir),
        "# my settings\nboards = [\n  { name = \"Work\", columns = [\"DONE\", \"NEXT\"] }, # main\n  { name = \"Other\", columns = [\"DONE\"] },\n]\n\n# the first state\n[[states]]\nkeyword = \"NEXT\" # open\ncolor = \"grey\"\nin_cycle = true\nmine = 1\n# waiting is going away\n\n# the last state\n[[states]]\nkeyword = \"DONE\"\ncolor = \"green\"\nfinished = true\nin_cycle = true\n\n[board]\narchive_after_days = 14 # days\n\n# sync\n[git]\nenabled = true\nsecret = \"x\"\n"
    );

    // `[git]` changed.
    let git = GitSettings {
        enabled: false,
        ..GitSettings::default()
    };
    Config::write_git(root, Expect::Any, &git).unwrap();
    assert_eq!(
        on_disk(&dir),
        "# my settings\nboards = [\n  { name = \"Work\", columns = [\"DONE\", \"NEXT\"] }, # main\n  { name = \"Other\", columns = [\"DONE\"] },\n]\n\n# the first state\n[[states]]\nkeyword = \"NEXT\" # open\ncolor = \"grey\"\nin_cycle = true\nmine = 1\n# waiting is going away\n\n# the last state\n[[states]]\nkeyword = \"DONE\"\ncolor = \"green\"\nfinished = true\nin_cycle = true\n\n[board]\narchive_after_days = 14 # days\n\n# sync\n[git]\nenabled = false\nsecret = \"x\"\n"
    );

    // `[board]` changed.
    let board = BoardSettings {
        archive_after_days: 30,
        ..BoardSettings::default()
    };
    Config::write_board_settings(root, Expect::Any, &board).unwrap();
    assert_eq!(
        on_disk(&dir),
        "# my settings\nboards = [\n  { name = \"Work\", columns = [\"DONE\", \"NEXT\"] }, # main\n  { name = \"Other\", columns = [\"DONE\"] },\n]\n\n# the first state\n[[states]]\nkeyword = \"NEXT\" # open\ncolor = \"grey\"\nin_cycle = true\nmine = 1\n# waiting is going away\n\n# the last state\n[[states]]\nkeyword = \"DONE\"\ncolor = \"green\"\nfinished = true\nin_cycle = true\n\n[board]\narchive_after_days = 30 # days\n\n# sync\n[git]\nenabled = false\nsecret = \"x\"\n"
    );
}

#[test]
fn git_settings_check_limits() {
    let g = |c, p| GitSettings {
        enabled: true,
        commit_delay_minutes: c,
        pull_interval_minutes: p,
    };
    assert!(g(1440, 1440).check().is_ok());
    assert!(g(0, 0).check().is_ok());
    for bad in [g(1441, 5), g(5, 1441)] {
        let e = bad.check().unwrap_err();
        assert!(matches!(e, ConfigError::InvalidSetting(_)));
        assert_eq!(e.to_string(), "the minutes must be at most 1440 (one day)");
    }
}

#[test]
fn board_settings_check_limits() {
    let b = |d| BoardSettings {
        archive_after_days: d,
        auto_archive: true,
    };
    assert!(b(1).check().is_ok());
    assert!(b(3650).check().is_ok());
    for bad in [b(0), b(3651)] {
        let e = bad.check().unwrap_err();
        assert!(matches!(e, ConfigError::InvalidSetting(_)));
        assert_eq!(
            e.to_string(),
            "archive after days must be between 1 and 3650"
        );
    }
}

#[test]
fn check_states_reports_the_first_state_first() {
    let d = Config::default().states;
    let states = [
        st("A", "nope", false, false),
        st("B b", "grey", false, false),
    ];
    assert!(matches!(
        Config::check_states(&states, &d),
        Err(ConfigError::InvalidState(m)) if m.contains("nope")
    ));
}

#[test]
fn parse_and_check_states_agree_on_keywords() {
    let d = Config::default().states;
    let cases: [(&[&str], &str); 3] = [
        (&["bad word"], "InvalidKeyword"),
        (&[""], "InvalidKeyword"),
        (&["TODO", "TODO"], "DuplicateState"),
    ];
    for (kws, want) in cases {
        let text: String = kws
            .iter()
            .map(|k| format!("[[states]]\nkeyword = \"{k}\"\ncolor = \"grey\"\n"))
            .collect();
        let states: Vec<State> = kws.iter().map(|k| st(k, "grey", false, false)).collect();
        let a = format!("{:?}", Config::parse(&text).unwrap_err());
        let b = format!("{:?}", Config::check_states(&states, &d).unwrap_err());
        assert!(a.starts_with(want), "{a}");
        assert!(b.starts_with(want), "{b}");
    }
}
