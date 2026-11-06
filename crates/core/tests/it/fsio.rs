use breccia_core::fsio::write_atomic;
use std::fs;

#[test]
fn failed_write_leaves_no_temp_file() {
    let t = tempfile::tempdir().unwrap();
    fs::create_dir(t.path().join("x.md")).unwrap();
    assert!(write_atomic(&t.path().join("x.md"), "new").is_err());
    assert!(!t.path().join(".x.md.breccia-tmp").exists());
}

#[test]
fn writes_through_a_symlink() {
    let t = tempfile::tempdir().unwrap();
    let real = t.path().join("real.md");
    let link = t.path().join("link.md");
    fs::write(&real, "old").unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(&real, &link).unwrap();
    #[cfg(windows)]
    if std::os::windows::fs::symlink_file(&real, &link).is_err() {
        eprintln!("skipped: symlinks need Developer Mode");
        return;
    }
    write_atomic(&link, "new").unwrap();
    assert!(link.symlink_metadata().unwrap().file_type().is_symlink());
    assert_eq!(fs::read_to_string(&real).unwrap(), "new");
}

#[cfg(unix)]
#[test]
fn keeps_permissions() {
    use std::os::unix::fs::PermissionsExt;
    let t = tempfile::tempdir().unwrap();
    let p = t.path().join("a.md");
    fs::write(&p, "old").unwrap();
    fs::set_permissions(&p, fs::Permissions::from_mode(0o600)).unwrap();
    write_atomic(&p, "new").unwrap();
    assert_eq!(
        fs::metadata(&p).unwrap().permissions().mode() & 0o777,
        0o600
    );
}

/// Git, run without Breccia's lock, may hold a page open while Breccia saves it.
#[cfg(windows)]
#[test]
fn a_rename_blocked_by_an_open_reader_is_retried() {
    use std::os::windows::fs::OpenOptionsExt;
    let t = tempfile::tempdir().unwrap();
    let p = t.path().join("a.md");
    fs::write(&p, "old").unwrap();
    // FILE_SHARE_READ | FILE_SHARE_WRITE, no FILE_SHARE_DELETE.
    let held = fs::OpenOptions::new()
        .read(true)
        .share_mode(1 | 2)
        .open(&p)
        .unwrap();
    let release = std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(40));
        drop(held);
    });
    write_atomic(&p, "new").unwrap();
    release.join().unwrap();
    assert_eq!(fs::read_to_string(&p).unwrap(), "new");
}
