//! Breccia's Git commands ignore the variables that point Git at another
//! repository (a shell or a hook that started Breccia may have them set).
//! This file holds a single test, because it changes the process environment.
use crate::gitenv::*;
use breccia_core::git::{Git, LOCAL_LIMIT};

#[test]
fn inherited_repository_variables_are_removed() {
    let e = env();
    let mine = repo(&e, "mine", &[("a.md", "- a\n")]);
    let other = repo(&e, "other", &[("b.md", "- b\n")]);
    let other_git = other.join(".git");
    let vars = [
        ("GIT_DIR", other_git.clone()),
        ("GIT_WORK_TREE", other.clone()),
        ("GIT_INDEX_FILE", other_git.join("index")),
        ("GIT_OBJECT_DIRECTORY", other_git.join("objects")),
        ("GIT_COMMON_DIR", other_git.clone()),
    ];
    // SAFETY: this test binary has only this one test, so no other thread
    // reads the environment meanwhile.
    for (k, v) in &vars {
        unsafe { std::env::set_var(k, v) };
    }
    // A fresh `Git`, as the app makes it: only the test's config isolation.
    let config = e.root.path().join("home").join("gitconfig");
    let g = Git::new()
        .with_env("GIT_CONFIG_NOSYSTEM", "1")
        .with_env("GIT_CONFIG_GLOBAL", &config);
    let top = g
        .ok(&mine, &["rev-parse", "--show-toplevel"], LOCAL_LIMIT)
        .map(|o| o.text());
    let files = g.ok(&mine, &["ls-files"], LOCAL_LIMIT).map(|o| o.text());
    for (k, _) in &vars {
        unsafe { std::env::remove_var(k) };
    }
    let top = top.unwrap();
    assert!(
        top.replace('\\', "/").ends_with("/mine"),
        "Git worked on another repository: {top}"
    );
    assert_eq!(files.unwrap(), "a.md");
}
