use breccia_core::inline::LinkKind;
use breccia_core::{
    Config, LoadWarning, NameEntry, OpenError, PageError, PageKind, ReloadError, SaveError,
    SaveOutcome, Workspace,
};
use std::fs;

fn put(root: &std::path::Path, rel: &str, s: &[u8]) {
    let p = root.join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, s).unwrap();
}

fn open(files: &[(&str, &str)]) -> (tempfile::TempDir, Workspace) {
    let t = tempfile::tempdir().unwrap();
    for (rel, text) in files {
        put(t.path(), rel, text.as_bytes());
    }
    let (ws, _) = Workspace::open(t.path()).unwrap();
    (t, ws)
}

#[test]
fn create_new_folder() {
    let t = tempfile::tempdir().unwrap();
    let root = t.path().join("notes");
    Workspace::create(&root).unwrap();
    assert!(root.join("journals").is_dir() && root.join("pages").is_dir());
    assert_eq!(
        fs::read_to_string(root.join("breccia/config.toml")).unwrap(),
        Config::default_toml()
    );
    put(t.path(), "full/x.txt", b"x");
    assert!(matches!(
        Workspace::create(&t.path().join("full")),
        Err(OpenError::NotEmpty(_))
    ));
}

#[test]
fn open_reads_pages_journals_and_titles() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "journals/2026-10-29.md", b"- TODO Ask [[Ben]]\n");
    put(t.path(), "pages/Projects/Website relaunch.md", b"- plan\n");
    put(t.path(), "pages/a_b.md", b"title:: a/b\n- x\n");
    put(t.path(), "journals/notes.md", b"- ignored\n");
    let (ws, warn) = Workspace::open(t.path()).unwrap();
    assert_eq!(ws.page("website relaunch").unwrap().folder, "Projects");
    assert_eq!(ws.page("a/b").unwrap().name, "a/b");
    assert_eq!(
        ws.page("2026-10-29").unwrap().kind,
        PageKind::Journal(chrono::NaiveDate::from_ymd_opt(2026, 10, 29).unwrap())
    );
    assert!(
        warn.iter()
            .any(|w| matches!(w, LoadWarning::BadJournalName(_)))
    );
}

#[test]
fn editing_one_page_leaves_other_files_identical() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/A.md", b"- one\r\n- two  \n");
    put(t.path(), "pages/B.md", b"\xef\xbb\xbf- b\n\t- c");
    let (mut ws, _) = Workspace::open(t.path()).unwrap();
    ws.edit("a", |d, ids| {
        let id = d.blocks()[0].id();
        d.set_text(id, "ONE", ids).unwrap();
    });
    assert!(matches!(ws.save("a").unwrap(), SaveOutcome::Written(_)));
    assert_eq!(
        fs::read(t.path().join("pages/A.md")).unwrap(),
        b"- ONE\n- two  \n"
    );
    assert_eq!(ws.save("b").unwrap(), SaveOutcome::Unchanged);
    assert_eq!(
        fs::read(t.path().join("pages/B.md")).unwrap(),
        b"\xef\xbb\xbf- b\n\t- c"
    );
    assert!(!t.path().join("pages/.A.md.breccia-tmp").exists());
}

#[test]
fn saving_a_crlf_file_writes_lf() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/A.md", b"- one\r\n- two  \r\n");
    let (mut ws, _) = Workspace::open(t.path()).unwrap();
    ws.edit("a", |d, ids| {
        let id = d.blocks()[0].id();
        d.set_text(id, "ONE", ids).unwrap();
    });
    assert!(matches!(ws.save("a").unwrap(), SaveOutcome::Written(_)));
    assert_eq!(
        fs::read(t.path().join("pages/A.md")).unwrap(),
        b"- ONE\n- two  \n"
    );
    assert!(ws.unsaved().is_empty());
}

#[test]
fn a_crlf_file_that_is_not_saved_keeps_its_bytes() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/A.md", b"- one\r\n");
    let (mut ws, _) = Workspace::open(t.path()).unwrap();
    assert_eq!(ws.save("a").unwrap(), SaveOutcome::Unchanged);
    assert_eq!(fs::read(t.path().join("pages/A.md")).unwrap(), b"- one\r\n");
}

#[test]
fn new_page_file_appears_only_with_content() {
    let t = tempfile::tempdir().unwrap();
    Workspace::create(&t.path().join("n")).unwrap();
    let (mut ws, _) = Workspace::open(&t.path().join("n")).unwrap();
    let key = ws.ensure_page("New/Page?").unwrap();
    assert_eq!(ws.save(&key).unwrap(), SaveOutcome::NotCreated);
    assert!(!t.path().join("n/pages/New_Page_.md").exists());
    ws.edit(&key, |d, ids| {
        d.insert_after(None, "hello", ids).unwrap();
    });
    ws.save(&key).unwrap();
    assert_eq!(
        fs::read_to_string(t.path().join("n/pages/New_Page_.md")).unwrap(),
        "---\naliases:\n  - \"New/Page?\"\n---\ntitle:: New/Page?\n- hello\n"
    );
    let (ws2, _) = Workspace::open(&t.path().join("n")).unwrap();
    assert_eq!(
        ws2.page("new/page?").unwrap().doc.blocks()[0].text(),
        "hello"
    );
}

#[test]
fn ensure_page_trims_the_name() {
    let t = tempfile::tempdir().unwrap();
    let mut ws = Workspace::create(&t.path().join("n")).unwrap();
    let key = ws.ensure_page("Foo ").unwrap();
    assert_eq!(key, "foo");
    let page = ws.page(&key).unwrap();
    assert_eq!(page.name, "Foo");
    assert_eq!(page.rel_path, std::path::Path::new("pages").join("Foo.md"));
    assert_eq!(page.doc.preamble(), "");
    assert_eq!(ws.ensure_page(" foo").unwrap(), "foo");
    assert!(ws.ensure_page(" \t ").is_err());
}

#[test]
fn colliding_file_names_get_suffix() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/a_b.md", b"- page a_b\n");
    let (mut ws, _) = Workspace::open(t.path()).unwrap();
    let key = ws.ensure_page("a/b").unwrap();
    ws.edit(&key, |d, ids| {
        d.insert_after(None, "x", ids).unwrap();
    });
    ws.save(&key).unwrap();
    assert_eq!(
        fs::read_to_string(t.path().join("pages/a_b 2.md")).unwrap(),
        "---\naliases:\n  - \"a/b\"\n---\ntitle:: a/b\n- x\n"
    );
    assert_eq!(
        fs::read_to_string(t.path().join("pages/a_b.md")).unwrap(),
        "- page a_b\n"
    );
}

#[test]
fn non_utf8_file_is_skipped_and_never_overwritten() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/Bin.md", b"\xff\xfe\x00- x");
    let (mut ws, warn) = Workspace::open(t.path()).unwrap();
    assert!(warn.iter().any(|w| matches!(w, LoadWarning::NotUtf8(_))));
    assert!(ws.page("bin").is_none());
    let key = ws.ensure_page("Bin").unwrap();
    // the occupied path makes ensure_page choose "Bin 2.md"; the original stays untouched
    ws.edit(&key, |d, ids| {
        d.insert_after(None, "y", ids).unwrap();
    });
    ws.save(&key).unwrap();
    assert_eq!(
        fs::read(t.path().join("pages/Bin.md")).unwrap(),
        b"\xff\xfe\x00- x"
    );
    assert_eq!(
        fs::read_to_string(t.path().join("pages/Bin 2.md")).unwrap(),
        "---\naliases:\n  - \"Bin\"\n---\ntitle:: Bin\n- y\n"
    );
}

#[test]
fn duplicate_names_keep_first() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/A.md", b"- top\n");
    put(t.path(), "pages/Sub/a.md", b"- sub\n");
    let (ws, warn) = Workspace::open(t.path()).unwrap();
    assert_eq!(ws.page("a").unwrap().doc.blocks()[0].text(), "top");
    assert!(
        warn.iter()
            .any(|w| matches!(w, LoadWarning::DuplicatePage { .. }))
    );
}

#[test]
fn file_appearing_on_disk_is_never_overwritten() {
    let t = tempfile::tempdir().unwrap();
    Workspace::create(&t.path().join("n")).unwrap();
    let (mut ws, _) = Workspace::open(&t.path().join("n")).unwrap();
    let key = ws.ensure_page("Late").unwrap();
    put(
        &t.path().join("n"),
        "pages/Late.md",
        b"- written elsewhere\n",
    );
    ws.edit(&key, |d, ids| {
        d.insert_after(None, "mine", ids).unwrap();
    });
    assert!(matches!(ws.save(&key), Err(SaveError::PathTaken(_))));
    assert_eq!(
        fs::read(t.path().join("n/pages/Late.md")).unwrap(),
        b"- written elsewhere\n"
    );
}

#[test]
fn invalid_config_fails_open() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "breccia/config.toml", b"[git\n");
    assert!(matches!(
        Workspace::open(t.path()),
        Err(OpenError::Config(_))
    ));
    assert_eq!(
        fs::read(t.path().join("breccia/config.toml")).unwrap(),
        b"[git\n"
    );
}

#[test]
fn locate_blocks() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/P.md", b"- a\n- b\n");
    let (mut ws, _) = Workspace::open(t.path()).unwrap();
    let new = ws
        .edit("p", |d, ids| d.insert_after(None, "c", ids).unwrap())
        .unwrap();
    let (page, idx) = ws.locate(new).unwrap();
    assert_eq!((page.key.as_str(), idx), ("p", 2));
}

#[test]
fn file_changed_on_disk_is_never_overwritten() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/P.md", b"- a\n");
    let (mut ws, _) = Workspace::open(t.path()).unwrap();
    put(t.path(), "pages/P.md", b"- changed elsewhere\n");
    ws.edit("p", |d, ids| {
        let id = d.blocks()[0].id();
        d.set_text(id, "mine", ids).unwrap();
    });
    assert!(matches!(ws.save("p"), Err(SaveError::ChangedOnDisk(_))));
    assert_eq!(
        fs::read(t.path().join("pages/P.md")).unwrap(),
        b"- changed elsewhere\n"
    );
    fs::remove_file(t.path().join("pages/P.md")).unwrap();
    assert!(matches!(ws.save("p"), Err(SaveError::ChangedOnDisk(_))));
    assert!(!t.path().join("pages/P.md").exists());
}

#[test]
fn invalid_stem_names_are_reported_not_loaded() {
    let t = tempfile::tempdir().unwrap();
    let root = t.path();
    put(root, "pages/Foo .md", b"- x\n");
    let (mut ws, warnings) = Workspace::open(root).unwrap();
    assert!(
        warnings.contains(&LoadWarning::InvalidName("pages/Foo .md".into())),
        "{warnings:?}"
    );
    assert!(ws.page("foo ").is_none() && ws.page("foo").is_none());
    let key = ws.ensure_page("Foo").unwrap();
    ws.edit(&key, |d, ids| d.insert_after(None, "new", ids).unwrap());
    ws.save(&key).unwrap();
    assert_eq!(fs::read(root.join("pages/Foo.md")).unwrap(), b"- new\n");
    assert_eq!(fs::read(root.join("pages/Foo .md")).unwrap(), b"- x\n");
}

#[test]
fn reload_replaces_document_from_disk() {
    let t = tempfile::tempdir().unwrap();
    let root = t.path();
    put(root, "pages/P.md", b"- a\n");
    let (mut ws, _) = Workspace::open(root).unwrap();
    let id = ws.page("p").unwrap().doc.blocks()[0].id();
    ws.edit("p", |d, ids| d.set_text(id, "b", ids).unwrap());
    fs::write(root.join("pages/P.md"), "- c\n").unwrap();
    ws.reload("p").unwrap();
    let page = ws.page("p").unwrap();
    assert_eq!(page.doc.blocks()[0].text(), "c");
    assert_eq!(page.doc.blocks()[0].id(), id);
    assert!(ws.locate(id).is_some());
    assert_eq!(ws.save("p").unwrap(), SaveOutcome::Unchanged);
    assert!(matches!(
        ws.reload("nope"),
        Err(ReloadError::UnknownPage(_))
    ));
}

#[test]
fn save_overwrite_writes_over_external_change() {
    let t = tempfile::tempdir().unwrap();
    let root = t.path();
    put(root, "pages/P.md", b"- a\n");
    let (mut ws, _) = Workspace::open(root).unwrap();
    let id = ws.page("p").unwrap().doc.blocks()[0].id();
    ws.edit("p", |d, ids| d.set_text(id, "mine", ids).unwrap());
    fs::write(root.join("pages/P.md"), "- theirs\n").unwrap();
    assert!(matches!(ws.save("p"), Err(SaveError::ChangedOnDisk(_))));
    assert!(matches!(
        ws.save_overwrite("p"),
        Ok(SaveOutcome::Written(_))
    ));
    assert_eq!(
        fs::read_to_string(root.join("pages/P.md")).unwrap(),
        "- mine\n"
    );
}

#[test]
fn upper_case_extension_is_reported() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/A.MD", b"- x\n");
    let (ws, warn) = Workspace::open(t.path()).unwrap();
    assert!(ws.page("a").is_none());
    assert!(warn.contains(&LoadWarning::ExtensionCase("pages/A.MD".into())));
}

#[cfg(any(unix, windows))]
#[test]
fn non_unicode_name_is_reported() {
    #[cfg(unix)]
    let name = {
        use std::os::unix::ffi::OsStrExt;
        std::ffi::OsStr::from_bytes(b"\xff.md").to_os_string()
    };
    #[cfg(windows)]
    let name = {
        use std::os::windows::ffi::OsStringExt;
        std::ffi::OsString::from_wide(&[0xD800, '.' as u16, 'm' as u16, 'd' as u16])
    };
    let t = tempfile::tempdir().unwrap();
    fs::create_dir_all(t.path().join("pages")).unwrap();
    // Some file systems refuse such a name; then there is nothing to test.
    if fs::write(t.path().join("pages").join(&name), b"- x\n").is_err() {
        eprintln!("skipped: file system refuses a non-Unicode name");
        return;
    }
    let (_, warn) = Workspace::open(t.path()).unwrap();
    assert!(
        warn.iter()
            .any(|w| matches!(w, LoadWarning::NonUnicodeName(p) if p.starts_with("pages"))),
        "{warn:?}"
    );
}

#[test]
fn reload_keeps_ids_of_unchanged_blocks() {
    let t = tempfile::tempdir().unwrap();
    let root = t.path();
    put(root, "pages/P.md", b"- a\n- b\n- c\n");
    let (mut ws, _) = Workspace::open(root).unwrap();
    let ids: Vec<_> = ws
        .page("p")
        .unwrap()
        .doc
        .blocks()
        .iter()
        .map(|b| b.id())
        .collect();
    fs::write(root.join("pages/P.md"), "- a\n- B\n- c\n").unwrap();
    let r = ws.reload("p").unwrap();
    let now: Vec<_> = ws
        .page("p")
        .unwrap()
        .doc
        .blocks()
        .iter()
        .map(|b| b.id())
        .collect();
    assert_eq!(now, ids);
    assert_eq!(r.carried.changed, vec![(ids[1], "B".to_string())]);
    assert!(ws.locate(ids[0]).is_some());
}

#[test]
fn reload_rekeys_a_changed_title() {
    let t = tempfile::tempdir().unwrap();
    let root = t.path();
    put(root, "pages/x.md", b"title:: Alpha\n- a [[Alpha]]\n");
    let (mut ws, _) = Workspace::open(root).unwrap();
    let id = ws.page("alpha").unwrap().doc.blocks()[0].id();
    let v = ws.tree_version();
    fs::write(root.join("pages/x.md"), "title:: Beta\n- a [[Alpha]]\n").unwrap();
    let r = ws.reload("alpha").unwrap();
    assert_eq!(r.key, "beta");
    assert!(r.warning.is_none());
    assert!(ws.page("alpha").is_none());
    assert_eq!(ws.page("beta").unwrap().name, "Beta");
    assert_eq!(ws.locate(id).unwrap().0.key, "beta");
    assert!(ws.tree_version() > v);
    // Links are not rewritten; the index follows the new key.
    assert_eq!(
        ws.page("beta").unwrap().doc.blocks()[0].text(),
        "a [[Alpha]]"
    );

    let t = tempfile::tempdir().unwrap();
    let root = t.path();
    put(root, "pages/x.md", b"title:: Alpha\n- a\n");
    put(root, "pages/y.md", b"title:: Beta\n- b\n");
    let (mut ws, _) = Workspace::open(root).unwrap();
    fs::write(root.join("pages/x.md"), "title:: Beta\n- a\n").unwrap();
    let r = ws.reload("alpha").unwrap();
    assert_eq!(r.key, "alpha");
    assert!(matches!(r.warning, Some(LoadWarning::DuplicatePage { .. })));
    assert_eq!(ws.page("alpha").unwrap().name, "Alpha");
    assert_eq!(
        ws.page("beta").unwrap().rel_path,
        std::path::Path::new("pages/y.md")
    );
}

#[test]
fn a_page_knows_when_it_was_last_edited() {
    use chrono::TimeZone;
    let t = tempfile::tempdir().unwrap();
    let p = t.path().join("pages").join("P.md");
    std::fs::create_dir_all(p.parent().unwrap()).unwrap();
    std::fs::write(&p, "- a\n").unwrap();
    let when = std::time::SystemTime::from(
        chrono::Local
            .with_ymd_and_hms(2026, 10, 20, 12, 0, 0)
            .unwrap(),
    );
    std::fs::File::options()
        .write(true)
        .open(&p)
        .unwrap()
        .set_modified(when)
        .unwrap();
    std::fs::create_dir_all(t.path().join("journals")).unwrap();
    let (mut ws, _) = Workspace::open(t.path()).unwrap();
    assert_eq!(ws.page("p").unwrap().edited(), Some(when));
    ws.edit("p", |d, ids| {
        let id = d.blocks()[0].id();
        d.set_text(id, "b", ids).unwrap();
    });
    ws.save("p").unwrap();
    let mtime = std::fs::metadata(&p).unwrap().modified().unwrap();
    assert_eq!(ws.page("p").unwrap().edited(), Some(mtime));
    ws.ensure_page("New").unwrap();
    assert_eq!(ws.page("new").unwrap().edited(), None);
    assert_eq!(ws.page("new").unwrap().created(), None);
}

#[test]
fn a_failed_reload_of_a_fileless_page_leaves_the_tree_version() {
    let t = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(t.path().join("journals")).unwrap();
    std::fs::create_dir_all(t.path().join("pages")).unwrap();
    let (mut ws, _) = Workspace::open(t.path()).unwrap();
    ws.ensure_page("Q").unwrap();
    std::fs::write(t.path().join("pages/Q.md"), [0xff, 0xfe, b'\n']).unwrap();
    let v = ws.tree_version();
    assert!(ws.reload("q").is_err());
    assert_eq!(ws.tree_version(), v);
}

/// §2: a page with text but no file (a save failed, or another program
/// deleted its file under unsaved edits) blocks deleting its folder, even
/// when the folder is empty on disk.
#[test]
fn folder_delete_refuses_a_folder_with_unsaved_text_and_no_file() {
    let t = tempfile::tempdir().unwrap();
    let mut ws = Workspace::create(&t.path().join("n")).unwrap();
    ws.create_folder("Dir").unwrap();
    let key = ws.create_page("N", "Dir").unwrap();
    ws.edit(&key, |d, ids| {
        d.insert_after(None, "unsaved", ids).unwrap();
    });
    let dir = t.path().join("n/pages/Dir");
    assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
    assert!(!ws.page(&key).unwrap().has_file());
    assert!(matches!(
        ws.delete_folder("Dir"),
        Err(PageError::FolderNotEmpty(f)) if f == "Dir"
    ));
    assert!(dir.is_dir());
    assert_eq!(ws.page(&key).unwrap().doc.blocks()[0].text(), "unsaved");
}

#[test]
fn touched_pages_are_reported_once_and_then_cleared() {
    let (_t, mut ws) = open(&[
        (
            "pages/A.md",
            "- a
",
        ),
        (
            "pages/B.md",
            "- b
",
        ),
    ]);
    assert_eq!(ws.take_touched(), ["a", "b"]); // open touches every page
    assert!(ws.take_touched().is_empty());
    let id = ws.page("a").unwrap().doc.blocks()[0].id();
    ws.edit("a", |d, ids| d.set_text(id, "a2", ids))
        .unwrap()
        .unwrap();
    ws.edit("a", |d, ids| d.set_text(id, "a3", ids))
        .unwrap()
        .unwrap();
    assert_eq!(ws.take_touched(), ["a"]);
    ws.rename_page("b", "C").unwrap();
    assert_eq!(ws.take_touched(), ["b", "c"]);
    ws.delete_page("c").unwrap();
    assert_eq!(ws.take_touched(), ["c"]);
}

#[test]
fn a_save_and_a_reload_touch_the_page() {
    let (t, mut ws) = open(&[
        (
            "pages/A.md",
            "- a
",
        ),
        (
            "pages/B.md",
            "- b
",
        ),
    ]);
    ws.take_touched();
    let id = ws.page("a").unwrap().doc.blocks()[0].id();
    ws.edit("a", |d, ids| d.set_text(id, "a2", ids))
        .unwrap()
        .unwrap();
    ws.take_touched();
    assert!(matches!(ws.save("a").unwrap(), SaveOutcome::Written(_)));
    assert_eq!(ws.take_touched(), ["a"]);
    assert_eq!(ws.save("a").unwrap(), SaveOutcome::Unchanged);
    assert!(ws.take_touched().is_empty());

    put(
        t.path(),
        "pages/B.md",
        b"- b changed
",
    );
    ws.apply_disk_changes(&[std::path::PathBuf::from("pages/B.md")]);
    assert_eq!(ws.take_touched(), ["b"]);

    fs::remove_file(t.path().join("pages/B.md")).unwrap();
    ws.apply_disk_changes(&[std::path::PathBuf::from("pages/B.md")]);
    assert!(ws.page("b").is_none());
    assert_eq!(ws.take_touched(), ["b"]);
}

/// A link to a folder: a symlink, or on Windows without Developer Mode a
/// directory junction (no privilege needed). `None` if neither can be made.
fn link_dir(real: &std::path::Path, link: &std::path::Path) -> bool {
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

#[test]
fn a_linked_folder_is_reported_once_and_not_followed() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/Real/A.md", b"- a\n");
    if !link_dir(&t.path().join("pages/Real"), &t.path().join("pages/Link")) {
        eprintln!("skipped: cannot create a folder link");
        return;
    }
    let (ws, warnings) = Workspace::open(t.path()).unwrap();
    let linked: Vec<_> = warnings
        .iter()
        .filter(|w| matches!(w, LoadWarning::LinkedFolder(_)))
        .collect();
    assert_eq!(linked.len(), 1, "{warnings:?}");
    assert_eq!(
        *linked[0],
        LoadWarning::LinkedFolder(std::path::Path::new("pages").join("Link"))
    );
    assert_eq!(ws.pages().filter(|p| p.key == "a").count(), 1);
    assert_eq!(
        ws.page("a").unwrap().rel_path,
        std::path::Path::new("pages").join("Real").join("A.md")
    );
    assert!(!ws.folders().any(|f| f.ends_with("Link")));
}

#[test]
fn a_dangling_link_is_not_written_and_says_why() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/gone.md", b"- g\n");
    let link = t.path().join("pages/P.md");
    #[cfg(unix)]
    std::os::unix::fs::symlink(t.path().join("pages/gone.md"), &link).unwrap();
    #[cfg(windows)]
    if std::os::windows::fs::symlink_file(t.path().join("pages/gone.md"), &link).is_err() {
        eprintln!("skipped: symlinks need Developer Mode");
        return;
    }
    let (mut ws, _) = Workspace::open(t.path()).unwrap();
    fs::remove_file(t.path().join("pages/gone.md")).unwrap();
    ws.edit("p", |d, ids| {
        let id = d.blocks()[0].id();
        d.set_text(id, "changed", ids).unwrap();
    });
    let err = ws.save("p").unwrap_err();
    assert!(matches!(err, SaveError::DanglingLink(_)), "{err:?}");
    assert!(!t.path().join("pages/gone.md").exists());
    assert!(ws.unsaved().iter().any(|p| p.key == "p"));
}

#[test]
fn a_bad_file_is_warned_about_once_until_it_changes_state() {
    let t = tempfile::tempdir().unwrap();
    put(t.path(), "pages/Bad.md", &[0xff, 0xfe, b'x']);
    let (mut ws, warnings) = Workspace::open(t.path()).unwrap();
    assert_eq!(
        warnings
            .iter()
            .filter(|w| matches!(w, LoadWarning::NotUtf8(_)))
            .count(),
        1
    );
    let bad = [std::path::PathBuf::from("pages/Bad.md")];
    assert!(ws.apply_disk_changes(&bad).warnings.is_empty());
    assert!(ws.apply_disk_changes(&bad).warnings.is_empty());
    put(
        t.path(),
        "pages/Bad.md",
        b"- fine
",
    );
    let r = ws.apply_disk_changes(&bad);
    assert!(r.warnings.is_empty());
    assert!(ws.page("bad").is_some());
    put(t.path(), "pages/Bad.md", &[0xff, 0xfe, b'y']);
    let r = ws.apply_disk_changes(&bad);
    assert_eq!(r.warnings.len(), 1, "{:?}", r.warnings);
    assert!(ws.apply_disk_changes(&bad).warnings.is_empty());
}

#[test]
fn a_dotted_folder_deleted_on_disk_drops_its_pages() {
    let (t, mut ws) = open(&[(
        "pages/v1.2/A.md",
        "- a
",
    )]);
    assert!(ws.page("a").is_some());
    fs::remove_dir_all(t.path().join("pages/v1.2")).unwrap();
    let r = ws.apply_disk_changes(&[std::path::Path::new("pages").join("v1.2")]);
    assert_eq!(r.removed, ["a"]);
    assert!(ws.page("a").is_none());
    assert!(!ws.folders().any(|f| f == "v1.2"));
}

#[test]
fn a_folder_link_found_by_a_rescan_is_one_warning_and_no_duplicate_page() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "pages/Real/A.md",
        b"- a
",
    );
    let (mut ws, _) = Workspace::open(t.path()).unwrap();
    if !link_dir(&t.path().join("pages/Real"), &t.path().join("pages/Link")) {
        eprintln!("skipped: cannot create a folder link");
        return;
    }
    let paths = breccia_core::watch::rescan(t.path());
    let r = ws.apply_disk_changes(&paths);
    let link = std::path::Path::new("pages").join("Link");
    assert_eq!(r.warnings, [LoadWarning::LinkedFolder(link.clone())]);
    assert_eq!(ws.pages().filter(|p| p.key == "a").count(), 1);
    assert_eq!(
        ws.page("a").unwrap().rel_path,
        std::path::Path::new("pages").join("Real").join("A.md")
    );
    // reported again: nothing more to say
    assert!(ws.apply_disk_changes(&[link]).warnings.is_empty());
}

const K: &str = "---\naliases:\n  - k8s\n---\n- the page\n";

#[test]
fn opening_an_alias_opens_its_page() {
    let (t, mut ws) = open(&[("pages/Kubernetes.md", K)]);
    assert_eq!(ws.ensure_page("K8S").unwrap(), "kubernetes");
    assert!(ws.page("k8s").is_none());
    let files: Vec<_> = fs::read_dir(t.path().join("pages"))
        .unwrap()
        .map(|e| e.unwrap().file_name().into_string().unwrap())
        .collect();
    assert_eq!(files, ["Kubernetes.md"]);
}

#[test]
fn aliases_are_page_names() {
    let (_t, ws) = open(&[
        ("pages/Kubernetes.md", K),
        ("pages/Ops.md", "- see [[k8s]]\n"),
    ]);
    let names = ws.page_names();
    let entry = |key: &str| names.iter().filter(|e| e.key == key).collect::<Vec<_>>();
    assert_eq!(
        entry("k8s"),
        [&NameEntry {
            key: "k8s".into(),
            name: "k8s".into(),
            exists: true
        }]
    );
    assert_eq!(entry("kubernetes").len(), 1);
    assert!(names.iter().all(|e| e.exists));
}

#[test]
fn an_outside_edit_adds_an_alias() {
    let (t, mut ws) = open(&[("pages/Kubernetes.md", K)]);
    assert_eq!(ws.link_target("k8s", LinkKind::Page).key, "kubernetes");
    put(
        t.path(),
        "pages/Kubernetes.md",
        b"---\naliases: [kube]\n---\n- the page\n",
    );
    ws.apply_disk_changes(&[std::path::PathBuf::from("pages/Kubernetes.md")]);
    assert_eq!(ws.link_target("kube", LinkKind::Page).key, "kubernetes");
    let k8s = ws.link_target("k8s", LinkKind::Page);
    assert_eq!(k8s.key, "k8s");
    assert!(!k8s.exists);
}

#[test]
fn a_journal_alias_counts() {
    let (_t, ws) = open(&[(
        "journals/2026-10-29.md",
        "---\naliases: [standup]\n---\n- x\n",
    )]);
    assert_eq!(ws.link_target("standup", LinkKind::Page).key, "2026-10-29");
}

#[test]
fn a_blank_page_does_not_beat_an_alias() {
    let (t, mut ws) = open(&[("pages/Kubernetes.md", "- the page\n")]);
    // A click on `[[k8s]]` before the alias existed made a blank page.
    assert_eq!(ws.ensure_page("k8s").unwrap(), "k8s");
    put(t.path(), "pages/Kubernetes.md", K.as_bytes());
    ws.apply_disk_changes(&[std::path::PathBuf::from("pages/Kubernetes.md")]);
    assert_eq!(ws.link_target("k8s", LinkKind::Page).key, "kubernetes");
    assert_eq!(ws.ensure_page("k8s").unwrap(), "kubernetes");
}

#[test]
fn clashes_are_warned_at_open() {
    let t = tempfile::tempdir().unwrap();
    put(
        t.path(),
        "pages/Kubernetes.md",
        b"---\naliases: [k8s]\n---\n- k\n",
    );
    put(t.path(), "pages/k8s.md", b"- own page\n");
    put(t.path(), "pages/A.md", b"---\naliases: [x]\n---\n- a\n");
    put(t.path(), "pages/B.md", b"---\naliases: [X]\n---\n- b\n");
    let (_ws, warn) = Workspace::open(t.path()).unwrap();
    let is_name: Vec<_> = warn
        .iter()
        .filter(|w| matches!(w, LoadWarning::AliasIsName { .. }))
        .collect();
    assert_eq!(
        is_name,
        [&LoadWarning::AliasIsName {
            alias: "k8s".into(),
            listed_in: "pages/Kubernetes.md".into(),
            page: "pages/k8s.md".into(),
        }]
    );
    let dup: Vec<_> = warn
        .iter()
        .filter(|w| matches!(w, LoadWarning::DuplicateAlias { .. }))
        .collect();
    assert_eq!(
        dup,
        [&LoadWarning::DuplicateAlias {
            alias: "x".into(),
            kept: "pages/A.md".into(),
            ignored: "pages/B.md".into(),
        }]
    );
}

fn type_x(ws: &mut Workspace, key: &str) {
    ws.edit(key, |d, ids| {
        d.insert_after(None, "x", ids).unwrap();
    });
}

#[test]
fn a_new_page_with_a_colon_gets_an_alias() {
    let t = tempfile::tempdir().unwrap();
    Workspace::create(&t.path().join("n")).unwrap();
    let (mut ws, _) = Workspace::open(&t.path().join("n")).unwrap();
    let key = ws.create_page("Q&A: hiring", "").unwrap();
    type_x(&mut ws, &key);
    ws.save(&key).unwrap();
    assert_eq!(
        fs::read_to_string(t.path().join("n/pages/Q&A_ hiring.md")).unwrap(),
        "---\naliases:\n  - \"Q&A: hiring\"\n---\ntitle:: Q&A: hiring\n- x\n"
    );
    let (ws2, warnings) = Workspace::open(&t.path().join("n")).unwrap();
    assert_eq!(ws2.page("q&a: hiring").unwrap().name, "Q&A: hiring");
    assert!(ws2.aliases_of("q&a: hiring").is_empty());
    assert!(warnings.is_empty(), "{warnings:?}");
}

#[test]
fn a_page_with_a_plain_name_gets_none() {
    let t = tempfile::tempdir().unwrap();
    Workspace::create(&t.path().join("n")).unwrap();
    let (mut ws, _) = Workspace::open(&t.path().join("n")).unwrap();
    let key = ws.create_page("Plain", "").unwrap();
    type_x(&mut ws, &key);
    ws.save(&key).unwrap();
    assert_eq!(
        fs::read_to_string(t.path().join("n/pages/Plain.md")).unwrap(),
        "- x\n"
    );
}

#[test]
fn a_taken_stem_also_gets_an_alias() {
    let t = tempfile::tempdir().unwrap();
    Workspace::create(&t.path().join("n")).unwrap();
    put(t.path(), "n/pages/a_b.md", &[0xff, 0xfe, 0xfd]);
    let (mut ws, _) = Workspace::open(&t.path().join("n")).unwrap();
    let key = ws.create_page("a/b", "").unwrap();
    type_x(&mut ws, &key);
    ws.save(&key).unwrap();
    let text = fs::read_to_string(t.path().join("n/pages/a_b 2.md")).unwrap();
    assert_eq!(
        text,
        format!(
            "{}title:: a/b\n- x\n",
            breccia_core::aliases::alias_block("a/b", breccia_core::outline::LineEnding::Lf)
        )
    );
}

#[test]
fn an_untouched_new_page_writes_nothing() {
    let t = tempfile::tempdir().unwrap();
    Workspace::create(&t.path().join("n")).unwrap();
    let (mut ws, _) = Workspace::open(&t.path().join("n")).unwrap();
    let key = ws.create_page("Q&A: x", "").unwrap();
    assert_eq!(ws.save(&key).unwrap(), SaveOutcome::NotCreated);
    assert!(!t.path().join("n/pages/Q&A_ x.md").exists());
}
