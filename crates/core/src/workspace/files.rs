//! Finding and reading the files of a notes folder.

use std::collections::HashSet;
use std::ffi::OsStr;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use chrono::NaiveDate;

use super::LoadWarning;
use crate::inline::title_line;
use crate::layout::PAGES;
use crate::outline::Document;

/// A file found by the scan, before duplicates are resolved.
pub(super) struct Found {
    pub(super) rel_path: PathBuf,
    pub(super) folder: String,
    pub(super) stem: String,
    pub(super) journal: Option<NaiveDate>,
}

/// Visible entries of `root/rel_dir` as `(name, is_dir)`, sorted by name.
/// Symlinked directories are not followed. A folder, or a `.md` file, whose
/// name is not valid Unicode is reported and skipped.
pub(super) fn read_dir_sorted(
    root: &Path,
    rel_dir: &Path,
    warnings: &mut Vec<LoadWarning>,
) -> io::Result<Vec<(String, bool)>> {
    let entries = match fs::read_dir(root.join(rel_dir)) {
        Ok(e) => e,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e),
    };
    let mut out = Vec::new();
    for entry in entries {
        let entry = entry?;
        let name = match entry.file_name().into_string() {
            Ok(name) => name,
            Err(raw) => {
                let lossy = raw.to_string_lossy();
                if !is_hidden(&lossy) && (has_md_extension(&lossy) || entry.file_type()?.is_dir()) {
                    warnings.push(LoadWarning::NonUnicodeName(rel_dir.join(&raw)));
                }
                continue;
            }
        };
        if is_hidden(&name) {
            continue;
        }
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            out.push((name, true));
        } else if file_type.is_symlink() && fs::metadata(entry.path()).is_ok_and(|m| m.is_dir()) {
            warnings.push(LoadWarning::LinkedFolder(rel_dir.join(&name)));
        } else if fs::metadata(entry.path()).is_ok_and(|m| m.is_file()) {
            out.push((name, false));
        }
    }
    out.sort();
    Ok(out)
}

/// `(rel_path, stem)` of the `.md` files among `entries` of `rel_dir`. A name
/// with another spelling of the extension (`.MD`) is reported, not listed.
pub(super) fn list_md(
    rel_dir: &Path,
    entries: &[(String, bool)],
    warnings: &mut Vec<LoadWarning>,
) -> Vec<(PathBuf, String)> {
    let mut out = Vec::new();
    for (name, is_dir) in entries {
        if *is_dir {
            continue;
        }
        if let Some(stem) = name.strip_suffix(".md") {
            out.push((rel_dir.join(name), stem.to_string()));
        } else if has_md_extension(name) {
            warnings.push(LoadWarning::ExtensionCase(rel_dir.join(name)));
        }
    }
    out
}

/// Whether `name` ends in `.md`, ignoring ASCII case.
pub(super) fn has_md_extension(name: &str) -> bool {
    let b = name.as_bytes();
    b.len() >= 3 && b[b.len() - 3..].eq_ignore_ascii_case(b".md")
}

/// Collects the pages under `root/rel_dir`, recursing into sub-folders.
pub(super) fn walk_pages(
    root: &Path,
    rel_dir: &Path,
    out: &mut Vec<Found>,
    folders: &mut Vec<String>,
    warnings: &mut Vec<LoadWarning>,
) -> io::Result<()> {
    let folder = rel_dir
        .strip_prefix(PAGES)
        .unwrap_or(rel_dir)
        .iter()
        .map(|c| c.to_string_lossy())
        .collect::<Vec<_>>()
        .join("/");
    if !folder.is_empty() {
        folders.push(folder.clone());
    }
    let entries = read_dir_sorted(root, rel_dir, warnings)?;
    for (rel_path, stem) in list_md(rel_dir, &entries, warnings) {
        out.push(Found {
            rel_path,
            folder: folder.clone(),
            stem,
            journal: None,
        });
    }
    for (name, is_dir) in entries {
        if is_dir {
            walk_pages(root, &rel_dir.join(name), out, folders, warnings)?;
        }
    }
    Ok(())
}

/// Turns the result of reading a file into its text, or the warning for it.
pub(super) fn decode(rel_path: &Path, read: io::Result<Vec<u8>>) -> Result<String, LoadWarning> {
    match read {
        Ok(bytes) => {
            String::from_utf8(bytes).map_err(|_| LoadWarning::NotUtf8(rel_path.to_path_buf()))
        }
        Err(e) => Err(LoadWarning::Unreadable {
            path: rel_path.to_path_buf(),
            error: e.to_string(),
        }),
    }
}

pub(super) fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

/// Lower-cased names of all entries in a directory but the one named
/// exactly `except`. Read errors give no names; `save` and the renames check
/// the path again before they write.
pub(super) fn names_in_dir(dir: &Path, except: Option<&OsStr>) -> HashSet<String> {
    fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.file_name())
        .filter(|n| Some(n.as_os_str()) != except)
        .map(|n| n.to_string_lossy().to_lowercase())
        .collect()
}

/// The `title::` value among the preamble's lines, if it is a valid name.
pub(super) fn preamble_title(preamble: &str) -> Option<String> {
    title_line(preamble).map(|(_, v)| v)
}

/// Whether a file exists at `path` under exactly its name (not only another
/// case of it, which a case-insensitive file system would also open).
pub(super) fn is_exact_file(path: &Path) -> bool {
    let (Some(dir), Some(name)) = (path.parent(), path.file_name()) else {
        return false;
    };
    fs::metadata(path).is_ok_and(|m| m.is_file())
        && fs::read_dir(dir)
            .into_iter()
            .flatten()
            .flatten()
            .any(|e| e.file_name() == name)
}

/// Whether a document has no block with text; its preamble does not count.
pub(super) fn is_blank(doc: &Document) -> bool {
    doc.blocks.iter().all(|b| b.text.trim().is_empty())
}

/// Whether something exists at `path`, comparing the file name case-insensitively.
pub(super) fn path_taken(path: &Path) -> io::Result<bool> {
    match path.symlink_metadata() {
        Ok(_) => return Ok(true),
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(e),
    }
    let (Some(dir), Some(name)) = (path.parent(), path.file_name()) else {
        return Ok(false);
    };
    let name = name.to_string_lossy().to_lowercase();
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(e) => return Err(e),
    };
    for entry in entries {
        if entry?.file_name().to_string_lossy().to_lowercase() == name {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Whether the folder `path` is `folder` or inside it.
pub(super) fn is_within(path: &str, folder: &str) -> bool {
    path == folder
        || path
            .strip_prefix(folder)
            .is_some_and(|rest| rest.starts_with('/'))
}

/// Whether the folder `path` is within `folder`, where `""` holds them all.
pub(super) fn within_or_all(path: &str, folder: &str) -> bool {
    folder.is_empty() || is_within(path, folder)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_error_becomes_a_warning() {
        let err = io::Error::new(io::ErrorKind::PermissionDenied, "denied");
        let w = decode(Path::new("pages/a.md"), Err(err)).unwrap_err();
        assert_eq!(
            w,
            LoadWarning::Unreadable {
                path: "pages/a.md".into(),
                error: "denied".into()
            }
        );
        assert_eq!(
            decode(Path::new("a.md"), Ok(vec![0xff])),
            Err(LoadWarning::NotUtf8("a.md".into()))
        );
        assert_eq!(decode(Path::new("a.md"), Ok(b"x".to_vec())), Ok("x".into()));
    }

    #[test]
    fn folder_containment() {
        assert!(is_within("a", "a"));
        assert!(is_within("a/b", "a"));
        assert!(!is_within("ab", "a"));
        assert!(!is_within("a", "a/b"));
    }
}
