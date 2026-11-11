use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

use breccia_core::watch::{FolderWatcher, NotesCache, relevant, relevant_now, rescan, watch_roots};
use notify::RecursiveMode;
use notify_debouncer_full::FileIdCache;

#[test]
fn config_toml_is_relevant() {
    let r = Path::new("/n");
    assert_eq!(
        relevant(r, Path::new("/n/breccia/config.toml")),
        Some("breccia/config.toml".into())
    );
    for no in [
        "/n/breccia/other.toml",
        "/n/breccia/.config.toml.breccia-tmp",
        "/n/breccia/sub/config.toml",
        "/n/config.toml",
    ] {
        assert_eq!(relevant(r, Path::new(no)), None, "{no}");
    }
}

#[test]
fn rescan_includes_the_config_file() {
    let t = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(t.path().join("breccia")).unwrap();
    assert!(!rescan(t.path()).iter().any(|p| p.starts_with("breccia")));
    std::fs::write(t.path().join("breccia/config.toml"), "").unwrap();
    assert!(rescan(t.path()).contains(&PathBuf::from("breccia").join("config.toml")));
}

#[test]
fn relevant_filters_paths() {
    let r = Path::new("/n");
    assert_eq!(
        relevant(r, Path::new("/n/pages/a.md")),
        Some("pages/a.md".into())
    );
    assert_eq!(
        relevant(r, Path::new("/n/pages/sub/b.md")),
        Some("pages/sub/b.md".into())
    );
    assert_eq!(
        relevant(r, Path::new("/n/journals/2026-10-29.md")),
        Some("journals/2026-10-29.md".into())
    );
    assert_eq!(
        relevant(r, Path::new("/n/pages/Projects")),
        Some("pages/Projects".into())
    );
    for no in [
        "/n/pages/.a.md.breccia-tmp",
        "/n/pages/a.txt",
        "/n/journals/x/y.md",
        "/n/.git/HEAD",
        "/elsewhere/pages/a.md",
    ] {
        assert_eq!(relevant(r, Path::new(no)), None, "{no}");
    }
}

#[test]
fn watcher_reports_an_external_write() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().canonicalize().unwrap();
    std::fs::create_dir_all(root.join("pages")).unwrap();
    let (tx, rx) = mpsc::channel();
    let _w = FolderWatcher::start(&root, move |paths| {
        let _ = tx.send(paths);
    })
    .unwrap();
    std::fs::write(root.join("pages").join("x.md"), "- hi\n").unwrap();
    let mut seen = false;
    while let Ok(paths) = rx.recv_timeout(Duration::from_secs(5)) {
        if paths.contains(&"pages/x.md".into()) {
            seen = true;
            break;
        }
    }
    assert!(seen);
}

#[test]
fn errors_and_overflow_yield_a_rescan_batch() {
    use breccia_core::watch::batch_paths;
    use notify::{Event, EventKind};
    use notify_debouncer_full::DebouncedEvent;
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    std::fs::create_dir_all(root.join("pages/sub")).unwrap();
    std::fs::create_dir_all(root.join("journals")).unwrap();
    std::fs::create_dir_all(root.join(".git")).unwrap();
    std::fs::write(root.join("pages/a.md"), "- a\n").unwrap();
    std::fs::write(root.join("pages/sub/b.md"), "- b\n").unwrap();
    std::fs::write(root.join("journals/2026-10-29.md"), "- j\n").unwrap();
    std::fs::write(root.join("pages/x.txt"), "x").unwrap();
    std::fs::write(root.join(".git/HEAD"), "x").unwrap();
    // `pages` and `journals` themselves too: a top-level file deleted while
    // events were lost is found by `files.changed` only below a reported folder.
    let all: Vec<std::path::PathBuf> = [
        "journals",
        "journals/2026-10-29.md",
        "pages",
        "pages/a.md",
        "pages/sub",
        "pages/sub/b.md",
    ]
    .iter()
    .map(Into::into)
    .collect();

    let err = Err(vec![notify::Error::generic("boom")]);
    assert_eq!(batch_paths(root, err), all);

    let rescan = Event::new(EventKind::Other).set_flag(notify::event::Flag::Rescan);
    let ok = Ok(vec![DebouncedEvent::new(rescan, std::time::Instant::now())]);
    assert_eq!(batch_paths(root, ok), all);

    let plain = Event::new(EventKind::Any).add_path(root.join("pages/a.md"));
    let ok = Ok(vec![DebouncedEvent::new(plain, std::time::Instant::now())]);
    assert_eq!(
        batch_paths(root, ok),
        vec![std::path::PathBuf::from("pages/a.md")]
    );
}

#[test]
fn a_deleted_dotted_folder_is_relevant() {
    let t = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(t.path().join("pages")).unwrap();
    let gone = t.path().join("pages").join("v1.2"); // never created: it is gone
    assert_eq!(
        relevant_now(t.path(), &gone),
        Some(PathBuf::from("pages").join("v1.2"))
    );
    // an existing non-md file is still not relevant:
    std::fs::write(t.path().join("pages").join("a.txt"), "x").unwrap();
    assert_eq!(
        relevant_now(t.path(), &t.path().join("pages").join("a.txt")),
        None
    );
    // nothing under a dot folder, gone or not:
    assert_eq!(
        relevant_now(t.path(), &t.path().join("pages").join(".trash").join("x")),
        None
    );
}

#[test]
fn watch_roots_skip_dot_git() {
    let r = Path::new("n");
    let roots = watch_roots(r);
    assert!(roots.iter().all(|(p, _)| !p.ends_with(".git")));
    assert_eq!(roots[0], (r.to_path_buf(), RecursiveMode::NonRecursive));
    assert_eq!(roots.len(), 4);
}

/// A link to a folder: a symlink, or on Windows a directory junction.
fn link_dir(real: &Path, link: &Path) -> bool {
    #[cfg(unix)]
    return std::os::unix::fs::symlink(real, link).is_ok();
    #[cfg(windows)]
    {
        if std::os::windows::fs::symlink_dir(real, link).is_ok() {
            return true;
        }
        std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(link)
            .arg(real)
            .output()
            .is_ok_and(|o| o.status.success())
    }
}

#[cfg(not(any(target_os = "linux", target_os = "android")))]
#[test]
fn the_file_id_cache_never_holds_dot_git_or_linked_folders() {
    let t = tempfile::tempdir().unwrap();
    let root = t.path();
    std::fs::create_dir_all(root.join(".git/objects/aa")).unwrap();
    std::fs::write(root.join(".git/objects/aa/bb"), "x").unwrap();
    std::fs::create_dir_all(root.join("pages/Real")).unwrap();
    std::fs::write(root.join("pages/A.md"), "- a\n").unwrap();
    std::fs::write(root.join("pages/Real/R.md"), "- r\n").unwrap();
    let linked = link_dir(&root.join("pages/Real"), &root.join("pages/Link"));
    if !linked {
        eprintln!("note: cannot create a folder link; that half is skipped");
    }
    let mut cache = NotesCache::new(root);
    cache.add_path(root, RecursiveMode::Recursive);
    // A commit adds files under .git/objects: the debouncer reports each one.
    std::fs::write(root.join(".git/objects/aa/cc"), "y").unwrap();
    cache.add_path(&root.join(".git/objects/aa/cc"), RecursiveMode::Recursive);
    cache.add_path(&root.join(".git"), RecursiveMode::Recursive);
    assert!(cache.cached_file_id(&root.join("pages/A.md")).is_some());
    assert!(
        cache
            .cached_file_id(&root.join("pages/Real/R.md"))
            .is_some()
    );
    for p in [
        ".git",
        ".git/objects",
        ".git/objects/aa/bb",
        ".git/objects/aa/cc",
    ] {
        assert!(cache.cached_file_id(&root.join(p)).is_none(), "{p}");
    }
    if linked {
        assert!(
            cache
                .cached_file_id(&root.join("pages/Link/R.md"))
                .is_none()
        );
    }
}

#[test]
fn rescan_does_not_follow_folder_links() {
    let t = tempfile::tempdir().unwrap();
    let root = t.path();
    std::fs::create_dir_all(root.join("pages/Real")).unwrap();
    std::fs::write(root.join("pages/Real/A.md"), "- a\n").unwrap();
    if !link_dir(&root.join("pages/Real"), &root.join("pages/Link")) {
        eprintln!("skipped: cannot create a folder link");
        return;
    }
    let found = rescan(root);
    assert!(found.contains(&PathBuf::from("pages").join("Real").join("A.md")));
    assert!(
        !found
            .iter()
            .any(|p| p.starts_with(Path::new("pages").join("Link")) && p.components().count() > 2),
        "{found:?}"
    );
}

/// What a path in the notes folder is when the watcher sees it.
#[derive(Clone, Copy)]
enum Made {
    File,
    Dir,
    Missing,
}

/// The paths the classifier decides on, one temp folder each (on a
/// case-insensitive file system `a.md` and `a.MD` are one file):
/// `(path, what is there, relevant, relevant_now)`.
const RELEVANT_ROWS: &[(&str, Made, bool, bool)] = &[
    ("journals/2026-10-29.md", Made::File, true, true),
    ("journals/x.md", Made::File, true, true),
    ("journals/sub/2026-10-29.md", Made::File, false, false),
    ("journals/2026-10-29.MD", Made::File, false, false),
    ("pages/a.md", Made::File, true, true),
    ("pages/f/g/a.md", Made::File, true, true),
    ("pages/a.MD", Made::File, false, false),
    ("pages/.h/a.md", Made::File, false, false),
    ("pages/v1.2", Made::Dir, false, true),
    ("pages/v1.2", Made::Missing, false, true),
    ("pages/f", Made::Dir, true, true),
    ("breccia/config.toml", Made::File, true, true),
    ("breccia/other.toml", Made::File, false, false),
    ("other/a.md", Made::File, false, false),
    ("a.md", Made::File, false, false),
];

#[test]
fn relevant_table() {
    for &(rel, made, rel_ok, now_ok) in RELEVANT_ROWS {
        let t = tempfile::tempdir().unwrap();
        let path = t.path().join(rel);
        match made {
            Made::File => {
                std::fs::create_dir_all(path.parent().unwrap()).unwrap();
                std::fs::write(&path, "- x\n").unwrap();
            }
            Made::Dir => std::fs::create_dir_all(&path).unwrap(),
            Made::Missing => std::fs::create_dir_all(path.parent().unwrap()).unwrap(),
        }
        let want = |ok: bool| ok.then(|| PathBuf::from(rel));
        assert_eq!(relevant(t.path(), &path), want(rel_ok), "relevant {rel}");
        assert_eq!(
            relevant_now(t.path(), &path),
            want(now_ok),
            "relevant_now {rel}"
        );
    }
}
