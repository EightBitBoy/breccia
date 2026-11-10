//! Atomic file writes.

use std::fs::{self, File};
use std::io::{self, Write};
use std::path::Path;

#[cfg(target_os = "macos")]
use std::os::macos::fs::FileTimesExt;
#[cfg(windows)]
use std::os::windows::fs::FileTimesExt;

/// Writes `contents` to `path` atomically: creates the parent directories,
/// writes `.<file name>.breccia-tmp` in the same directory, syncs it, then
/// renames it over the target. The temp file is removed if any step fails.
///
/// If `path` is a symlink, the file it points to is replaced and the link
/// stays a link. An existing target keeps its permissions where the file
/// system can hold them (a failure to copy them is logged, not fatal: vfat
/// and some SMB mounts refuse `chmod`). On Windows and macOS it keeps the
/// creation time too (a failure is logged, not fatal). On Unix the
/// directory is synced after the rename (an error from that sync is
/// ignored); other platforms do not sync the directory.
pub fn write_atomic(path: &Path, contents: &str) -> io::Result<()> {
    write_atomic_with(path, contents, |file, perms| file.set_permissions(perms))
}

/// `write_atomic`, copying the permissions with `set_permissions` (a test seam).
fn write_atomic_with(
    path: &Path,
    contents: &str,
    set_permissions: impl FnOnce(&File, fs::Permissions) -> io::Result<()>,
) -> io::Result<()> {
    let resolved;
    let path = if path.is_symlink() {
        resolved = fs::canonicalize(path)?;
        resolved.as_path()
    } else {
        path
    };
    let name = path
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path has no file name"))?;
    let dir = path.parent().unwrap_or(Path::new(""));
    if !dir.as_os_str().is_empty() {
        fs::create_dir_all(dir)?;
    }
    let mut tmp_name = std::ffi::OsString::from(".");
    tmp_name.push(name);
    tmp_name.push(".breccia-tmp");
    let tmp = dir.join(tmp_name);

    let result = (|| {
        let mut file = File::create(&tmp)?;
        file.write_all(contents.as_bytes())?;
        if let Ok(meta) = fs::metadata(path)
            && let Err(e) = set_permissions(&file, meta.permissions())
        {
            log::warn!("could not copy the permissions of {}: {e}", path.display());
        }
        #[cfg(any(windows, target_os = "macos"))]
        if let Some(born) = fs::metadata(path).ok().and_then(|m| m.created().ok())
            && let Err(e) = file.set_times(fs::FileTimes::new().set_created(born))
        {
            log::warn!(
                "could not keep the creation time of {}: {e}",
                path.display()
            );
        }
        file.sync_all()?;
        drop(file);
        rename_retrying(&tmp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
        return result;
    }
    #[cfg(unix)]
    {
        let sync_dir = if dir.as_os_str().is_empty() {
            Path::new(".")
        } else {
            dir
        };
        let _ = File::open(sync_dir).and_then(|d| d.sync_all());
    }
    result
}

/// Renames `from` over `to`. On Windows a rename can fail with `PermissionDenied`
/// while another program (Git, hashing a changed page) has the target open
/// without sharing delete access, so it is tried again a few times.
fn rename_retrying(from: &Path, to: &Path) -> io::Result<()> {
    #[cfg(windows)]
    for _ in 0..5 {
        match fs::rename(from, to) {
            Err(e) if e.kind() == io::ErrorKind::PermissionDenied => {
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            other => return other,
        }
    }
    fs::rename(from, to)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_file_system_refusing_permissions_still_saves() {
        let t = tempfile::tempdir().unwrap();
        let p = t.path().join("a.md");
        fs::write(&p, "old").unwrap();
        let refuse = |_: &File, _| Err(io::Error::from(io::ErrorKind::PermissionDenied));
        write_atomic_with(&p, "new", refuse).unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "new");
        assert!(!t.path().join(".a.md.breccia-tmp").exists());
    }
}
