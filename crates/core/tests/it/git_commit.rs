use crate::gitenv::*;
use breccia_core::git::{
    Discovered, GITATTRIBUTES, GITIGNORE, Git, GitLogView, LOCAL_LIMIT, Repo, commit_message,
    discover, init,
};
use std::path::{Path, PathBuf};

fn open(g: &Git, dir: &Path) -> Repo {
    match discover(g, dir).unwrap() {
        Discovered::Repo(r) => r,
        _ => panic!("not a repo"),
    }
}

#[test]
fn only_the_notes_folder_is_committed() {
    let e = env();
    let top = repo(
        &e,
        "big",
        &[("other/x.txt", "x\n"), ("notes/pages/A.md", "- a\n")],
    );
    std::fs::write(top.join("other/x.txt"), "staged\n").unwrap();
    git(&e, &top, &["add", "other/x.txt"]); // the user's staged work
    std::fs::write(top.join("other/y.txt"), "untracked\n").unwrap();
    std::fs::write(top.join("notes/pages/A.md"), "- a2\n").unwrap();
    std::fs::write(top.join("notes/pages/New.md"), "- n\n").unwrap();
    std::fs::write(top.join("notes/pages/.New.md.breccia-tmp"), "half").unwrap();
    let r = open(&e.git, &top.join("notes"));
    assert_eq!(
        r.changes().unwrap(),
        [
            PathBuf::from("pages").join("A.md"),
            PathBuf::from("pages").join("New.md")
        ]
    );
    let hash = r.commit("notes: test").unwrap().unwrap();
    assert_eq!(
        git(&e, &top, &["show", "--name-only", "--format=", &hash]),
        "notes/pages/A.md\nnotes/pages/New.md"
    );
    assert_eq!(
        git(&e, &top, &["diff", "--cached", "--name-only"]),
        "other/x.txt"
    ); // still staged, not committed
    assert_eq!(git(&e, &top, &["log", "-1", "--format=%s"]), "notes: test");
    assert!(r.commit("again").unwrap().is_none()); // nothing left in the folder
}

#[test]
fn the_message_says_what_happened_to_each_file() {
    let e = env();
    let old = "- a long enough text that Git sees the same file after the rename\n";
    let top = repo(
        &e,
        "m",
        &[
            ("other/x.txt", "x\n"),
            ("notes/pages/Project X.md", "- p\n"),
            ("notes/pages/Old idea.md", "- o\n"),
            ("notes/pages/Draft.md", old),
            ("notes/journals/2026-11-02.md", "- j\n"),
            ("notes/breccia/config.toml", "# c\n"),
        ],
    );
    let notes = top.join("notes");
    std::fs::write(notes.join("pages/Project X.md"), "- p2\n").unwrap();
    std::fs::write(notes.join("pages/Meeting notes.md"), "- m\n").unwrap();
    std::fs::remove_file(notes.join("pages/Old idea.md")).unwrap();
    std::fs::rename(notes.join("pages/Draft.md"), notes.join("pages/Plan.md")).unwrap();
    std::fs::write(notes.join("journals/2026-11-02.md"), "- j2\n").unwrap();
    std::fs::write(notes.join("journals/2026-11-03.md"), "- today\n").unwrap();
    std::fs::write(notes.join("breccia/config.toml"), "# c2\n").unwrap();
    std::fs::write(top.join("other/x.txt"), "outside\n").unwrap();
    let r = open(&e.git, &notes);
    r.commit_with(commit_message).unwrap().unwrap();
    assert_eq!(
        git(&e, &top, &["log", "-1", "--format=%s"]),
        "add Meeting notes +1; update Project X +2; rename Draft -> Plan; delete Old idea"
    );
    // The changes outside the notes folder are not committed and not named.
    assert_eq!(git(&e, &top, &["status", "--short"]), " M other/x.txt");
}

#[test]
fn deletions_are_committed() {
    let e = env();
    let top = repo(&e, "d", &[("pages/A.md", "- a\n"), ("pages/B.md", "- b\n")]);
    std::fs::remove_file(top.join("pages/A.md")).unwrap();
    let r = open(&e.git, &top);
    assert_eq!(r.changes().unwrap(), [PathBuf::from("pages").join("A.md")]);
    assert!(r.commit("notes: del").unwrap().is_some());
    assert_eq!(git(&e, &top, &["ls-files"]), "pages/B.md");
}

#[test]
fn missing_identity_is_reported_before_committing() {
    let e = env();
    let top = repo(&e, "i", &[("a.md", "x\n")]);
    assert!(open(&e.git, &top).identity_ok().unwrap());
    // Git for Windows would auto-detect an identity, so forbid that.
    let config = e.root.path().join("home").join("noident");
    std::fs::write(&config, "[user]\n\tuseConfigOnly = true\n").unwrap();
    let g = e
        .git
        .clone()
        .with_env("GIT_CONFIG_GLOBAL", &config)
        .without_env("GIT_AUTHOR_NAME")
        .without_env("GIT_AUTHOR_EMAIL")
        .without_env("GIT_COMMITTER_NAME")
        .without_env("GIT_COMMITTER_EMAIL")
        .without_env("EMAIL");
    assert!(!open(&g, &top).identity_ok().unwrap());
}

#[test]
fn init_adds_the_two_files_only_when_missing() {
    let e = env();
    let dir = e.root.path().join("fresh");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join(".gitignore"), "keep\n").unwrap();
    assert!(matches!(
        discover(&e.git, &dir).unwrap(),
        Discovered::NotARepo
    ));
    let r = init(&e.git, &dir).unwrap();
    assert_eq!(r.prefix, "");
    assert!(dir.join(".git").exists());
    assert_eq!(
        std::fs::read_to_string(dir.join(".gitignore")).unwrap(),
        "keep\n"
    );
    assert_eq!(
        std::fs::read_to_string(dir.join(".gitattributes")).unwrap(),
        GITATTRIBUTES
    );
    // A second init refuses: it is a repository now.
    assert!(init(&e.git, &dir).is_err());
    // The first commit of an empty repository works.
    assert!(r.commit("notes: first").unwrap().is_some());
    assert_eq!(git(&e, &dir, &["ls-files"]), ".gitattributes\n.gitignore");
}

#[test]
fn init_writes_the_default_gitignore_when_missing() {
    let e = env();
    let dir = e.root.path().join("fresh2");
    std::fs::create_dir_all(&dir).unwrap();
    init(&e.git, &dir).unwrap();
    assert_eq!(
        std::fs::read_to_string(dir.join(".gitignore")).unwrap(),
        GITIGNORE
    );
}

#[test]
fn init_refuses_inside_a_repository() {
    let e = env();
    let top = repo(&e, "outer", &[("a.md", "x\n")]);
    let inner = top.join("notes");
    std::fs::create_dir_all(&inner).unwrap();
    assert!(init(&e.git, &inner).is_err());
    assert!(!inner.join(".git").exists());
}

fn dated(g: &Git, when: &str) -> Git {
    g.clone()
        .with_env("GIT_AUTHOR_DATE", when)
        .with_env("GIT_COMMITTER_DATE", when)
}

fn ms(when: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(when)
        .unwrap()
        .timestamp()
        * 1000
}

#[test]
fn created_dates_are_the_oldest_add() {
    let e = env();
    let dir = e.root.path().join("dates");
    std::fs::create_dir_all(dir.join("pages")).unwrap();
    git(&e, &dir, &["init", "-q"]);
    let a = "2026-01-01T10:00:00+00:00";
    let b = "2026-02-01T10:00:00+00:00";
    let c = "2026-03-01T10:00:00+00:00";
    let step = |when: &str, name: &str, text: &str| {
        std::fs::write(dir.join("pages").join(name), text).unwrap();
        open(&dated(&e.git, when), &dir)
            .commit("m")
            .unwrap()
            .unwrap();
    };
    step(a, "A.md", "1\n");
    step(b, "A.md", "2\n");
    step(c, "B.md", "3\n");
    let r = open(&e.git, &dir);
    let d = r.created_dates().unwrap();
    assert_eq!(d.len(), 2);
    assert_eq!(d[&PathBuf::from("pages").join("A.md")], ms(a));
    assert_eq!(d[&PathBuf::from("pages").join("B.md")], ms(c));
    assert_eq!(r.last_commit_ms().unwrap(), Some(ms(c)));
}

#[test]
fn an_empty_repository_has_no_dates() {
    let e = env();
    let dir = e.root.path().join("empty");
    std::fs::create_dir_all(&dir).unwrap();
    git(&e, &dir, &["init", "-q"]);
    let r = open(&e.git, &dir);
    assert_eq!(r.last_commit_ms().unwrap(), None);
    assert!(r.created_dates().unwrap().is_empty());
}

/// Writes `text` to `file` under `dir`, then commits everything with `message` at `when`.
fn commit_at(e: &Env, dir: &Path, when: &str, file: &str, text: &str, message: &str) {
    let p = dir.join(file);
    std::fs::create_dir_all(p.parent().unwrap()).unwrap();
    std::fs::write(p, text).unwrap();
    let g = dated(&e.git, when);
    g.ok(dir, &["add", "-A"], LOCAL_LIMIT).unwrap();
    g.ok(dir, &["commit", "-q", "-m", message], LOCAL_LIMIT)
        .unwrap();
}

fn subjects(page: &GitLogView) -> Vec<&str> {
    page.entries.iter().map(|x| x.subject.as_str()).collect()
}

#[test]
fn the_log_lists_the_folders_commits_newest_first() {
    let e = env();
    let dir = e.root.path().join("log");
    std::fs::create_dir_all(&dir).unwrap();
    git(&e, &dir, &["init", "-q"]);
    let a = "2026-01-01T10:00:00+00:00";
    let b = "2026-02-01T10:00:00+00:00";
    let c = "2026-03-01T10:00:00+00:00";
    commit_at(&e, &dir, a, "pages/A.md", "1\n", "first");
    commit_at(&e, &dir, b, "pages/A.md", "2\n", "second");
    commit_at(&e, &dir, c, "pages/B.md", "3\n", "third");
    let page = open(&e.git, &dir).log(0, 200).unwrap();
    assert_eq!(subjects(&page), ["third", "second", "first"]);
    assert!(!page.more);
    assert_eq!(page.skip, 0);
    let top = &page.entries[0];
    assert_eq!(top.hash, git(&e, &dir, &["rev-parse", "HEAD"]));
    assert_eq!(top.hash.len(), 40);
    assert_eq!(top.short, top.hash[..7]);
    assert_eq!(top.time_ms, ms(c));
    assert_eq!(page.entries[2].time_ms, ms(a));
    assert_eq!(top.author, "Breccia Test");
    // No remote: nothing is marked as not pushed.
    assert!(page.entries.iter().all(|x| x.pushed));
}

#[test]
fn the_log_holds_only_commits_that_touch_the_notes_folder() {
    let e = env();
    let top = repo(&e, "sub", &[("other/x.txt", "x\n")]);
    let t = "2026-01-01T10:00:00+00:00";
    commit_at(&e, &top, t, "notes/pages/A.md", "1\n", "notes one");
    commit_at(&e, &top, t, "other/x.txt", "2\n", "outside");
    commit_at(&e, &top, t, "notes/pages/A.md", "3\n", "notes two");
    let page = open(&e.git, &top.join("notes")).log(0, 200).unwrap();
    assert_eq!(subjects(&page), ["notes two", "notes one"]);
    // At the top of the repository every commit counts.
    let all = open(&e.git, &top).log(0, 200).unwrap();
    assert_eq!(
        subjects(&all),
        ["notes two", "outside", "notes one", "init"]
    );
}

#[test]
fn the_log_comes_in_pages() {
    let e = env();
    let dir = e.root.path().join("paged");
    std::fs::create_dir_all(&dir).unwrap();
    git(&e, &dir, &["init", "-q"]);
    for i in 1..=5 {
        let when = format!("2026-01-0{i}T10:00:00+00:00");
        commit_at(&e, &dir, &when, "a.md", &format!("{i}\n"), &format!("c{i}"));
    }
    let r = open(&e.git, &dir);
    let p1 = r.log(0, 2).unwrap();
    assert_eq!(
        (subjects(&p1), p1.more, p1.skip),
        (vec!["c5", "c4"], true, 0)
    );
    let p2 = r.log(2, 2).unwrap();
    assert_eq!(
        (subjects(&p2), p2.more, p2.skip),
        (vec!["c3", "c2"], true, 2)
    );
    let p3 = r.log(4, 2).unwrap();
    assert_eq!((subjects(&p3), p3.more, p3.skip), (vec!["c1"], false, 4));
    let exact = r.log(0, 5).unwrap();
    assert_eq!((exact.entries.len(), exact.more), (5, false));
    let past = r.log(9, 2).unwrap();
    assert_eq!((past.entries.len(), past.more), (0, false));
}

#[test]
fn the_log_keeps_subjects_with_special_characters_intact() {
    let e = env();
    let dir = e.root.path().join("chars");
    std::fs::create_dir_all(&dir).unwrap();
    git(&e, &dir, &["init", "-q"]);
    let t = "2026-01-01T10:00:00+00:00";
    let odd = "notes: 3 Oct 09:05 · Größe, \"q\" <x> & | %s %x00 \\ 'é' 日本";
    commit_at(&e, &dir, t, "a.md", "1\n", odd);
    commit_at(
        &e,
        &dir,
        t,
        "a.md",
        "2\n",
        "line one\n\nbody that is not shown",
    );
    let page = open(&e.git, &dir).log(0, 200).unwrap();
    assert_eq!(subjects(&page), ["line one", odd]);
}

#[test]
fn an_unborn_branch_has_an_empty_log() {
    let e = env();
    let dir = e.root.path().join("unborn");
    std::fs::create_dir_all(&dir).unwrap();
    git(&e, &dir, &["init", "-q"]);
    let page = open(&e.git, &dir).log(0, 200).unwrap();
    assert!(page.entries.is_empty());
    assert!(!page.more);
}

#[test]
fn commits_the_remote_lacks_are_marked_not_pushed() {
    let e = env();
    let dir = e.root.path().join("pushy");
    std::fs::create_dir_all(&dir).unwrap();
    git(&e, &dir, &["init", "-q"]);
    let t = "2026-01-01T10:00:00+00:00";
    commit_at(&e, &dir, t, "a.md", "1\n", "pushed");
    let remote = bare(&e, "pushy.git");
    git(
        &e,
        &dir,
        &["remote", "add", "origin", &remote.to_string_lossy()],
    );
    // A remote that has nothing yet (no upstream either): the commit is not pushed.
    let r = open(&e.git, &dir);
    assert!(!r.log(0, 200).unwrap().entries[0].pushed);
    git(&e, &dir, &["push", "-q", "-u", "origin", "main"]);
    commit_at(&e, &dir, t, "a.md", "2\n", "local one");
    commit_at(&e, &dir, t, "a.md", "3\n", "local two");
    let page = r.log(0, 200).unwrap();
    let marks: Vec<(&str, bool)> = page
        .entries
        .iter()
        .map(|x| (x.subject.as_str(), x.pushed))
        .collect();
    assert_eq!(
        marks,
        [("local two", false), ("local one", false), ("pushed", true)]
    );
    git(&e, &dir, &["push", "-q"]);
    assert!(r.log(0, 200).unwrap().entries.iter().all(|x| x.pushed));
}

#[test]
fn non_ascii_names_are_committed_and_named_intact() {
    let e = env();
    let top = repo(&e, "u", &[("notes/pages/x.md", "- x\n")]);
    std::fs::create_dir_all(top.join("notes/pages/Übung")).unwrap();
    std::fs::write(top.join("notes/pages/Härtel.md"), "- h\n").unwrap();
    std::fs::write(top.join("notes/pages/Übung/Größe.md"), "- g\n").unwrap();
    let r = open(&e.git, &top.join("notes"));
    let changed = r.changes().unwrap();
    assert_eq!(
        changed,
        [
            PathBuf::from("pages").join("Härtel.md"),
            PathBuf::from("pages").join("Übung").join("Größe.md")
        ]
    );
    r.commit_with(commit_message).unwrap().unwrap();
    assert_eq!(
        git(&e, &top, &["log", "-1", "--format=%s"]),
        "add Größe, Härtel"
    );
    let listed = e
        .git
        .ok(&top, &["ls-files", "-z", "notes/pages"], LOCAL_LIMIT)
        .unwrap()
        .nul_list();
    assert!(listed.contains(&"notes/pages/Härtel.md".to_string()));
    assert!(listed.contains(&"notes/pages/Übung/Größe.md".to_string()));
}

#[test]
fn an_empty_page_file_is_added_and_moved_by_name() {
    let e = env();
    let top = repo(&e, "empty", &[("pages/B.md", "- [[Idea]]\n")]);
    std::fs::create_dir_all(top.join("pages/X")).unwrap();
    std::fs::write(top.join("pages/Idea.md"), "").unwrap();
    let r = open(&e.git, &top);
    assert_eq!(
        r.changes().unwrap(),
        [PathBuf::from("pages").join("Idea.md")]
    );
    r.commit_with(commit_message).unwrap().unwrap();
    assert_eq!(git(&e, &top, &["log", "-1", "--format=%s"]), "add Idea");
    assert_eq!(git(&e, &top, &["ls-files"]), "pages/B.md\npages/Idea.md");
    // Moved into a folder, the empty file is named as moved, not as added and deleted.
    std::fs::rename(top.join("pages/Idea.md"), top.join("pages/X/Idea.md")).unwrap();
    r.commit_with(commit_message).unwrap().unwrap();
    assert_eq!(git(&e, &top, &["log", "-1", "--format=%s"]), "move Idea");
    assert_eq!(git(&e, &top, &["ls-files"]), "pages/B.md\npages/X/Idea.md");
}
