//! Machine-local settings: they live in the app's config dir, never in the
//! notes folder.

use std::collections::BTreeMap;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default)]
    pub last_folder: Option<PathBuf>,
    /// The sidebar's width in px; `None` is the default.
    #[serde(default)]
    pub sidebar_width: Option<u32>,
    #[serde(default)]
    pub sidebar_hidden: bool,
    /// The board's column width in px; `None` lets the columns fill the window.
    #[serde(default)]
    pub board_column_width: Option<u32>,
    /// The chosen theme's id; `None` follows the operating system.
    #[serde(default)]
    pub theme: Option<String>,
    /// The zoom level in percent; `None` is 100.
    #[serde(default)]
    pub zoom_percent: Option<u32>,
    /// Where the sidebar lists Journals: "top", "bottom" or "inline"; `None` is bottom.
    #[serde(default)]
    pub journals_at: Option<String>,
    /// Show a web address without its `https://`; `None` is off.
    #[serde(default)]
    pub hide_link_scheme: Option<bool>,
    /// Show a long web address cut short; `None` is off.
    #[serde(default)]
    pub shorten_links: Option<bool>,
    /// Folders opened before, the most recent first, at most `RECENT_MAX`.
    #[serde(default)]
    pub recent_folders: Vec<PathBuf>,
    /// Hidden board columns: notes folder path, then board name, then the hidden state keywords.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub hidden_columns: BTreeMap<String, BTreeMap<String, Vec<String>>>,
    /// Keys this version does not know (a newer Breccia wrote them); kept on save.
    #[serde(flatten)]
    pub other: serde_json::Map<String, serde_json::Value>,
}

/// How many recent folders are kept.
pub const RECENT_MAX: usize = 10;

fn normalized(p: &Path) -> String {
    let s = p.to_string_lossy();
    let s = s.trim_end_matches(['/', '\\']);
    if cfg!(windows) {
        s.replace('/', "\\").to_ascii_lowercase()
    } else {
        s.to_string()
    }
}

/// Whether two paths name the same folder: equal after dropping trailing
/// separators; on Windows also ignoring ASCII case and the slash direction.
pub fn same_folder(a: &Path, b: &Path) -> bool {
    normalized(a) == normalized(b)
}

/// Makes `path` the last folder and puts it first in the recent list.
pub fn remember(s: &mut Settings, path: PathBuf) {
    s.recent_folders.retain(|p| !same_folder(p, &path));
    s.recent_folders.insert(0, path.clone());
    s.recent_folders.truncate(RECENT_MAX);
    s.last_folder = Some(path);
}

/// Drops `path` from the recent list; `last_folder` stays.
pub fn forget(s: &mut Settings, path: &Path) {
    s.recent_folders.retain(|p| !same_folder(p, path));
}

/// The hidden columns saved for `folder` (any spelling `same_folder` accepts), board name to keywords.
pub fn hidden_for(s: &Settings, folder: &Path) -> BTreeMap<String, Vec<String>> {
    s.hidden_columns
        .iter()
        .find(|(k, _)| same_folder(Path::new(k), folder))
        .map(|(_, v)| v.clone())
        .unwrap_or_default()
}

/// Replaces the hidden columns of `folder`; empty lists are dropped, and so is the folder when none is left.
pub fn set_hidden(s: &mut Settings, folder: &Path, boards: BTreeMap<String, Vec<String>>) {
    s.hidden_columns
        .retain(|k, _| !same_folder(Path::new(k), folder));
    let boards: BTreeMap<_, _> = boards.into_iter().filter(|(_, v)| !v.is_empty()).collect();
    if !boards.is_empty() {
        s.hidden_columns
            .insert(folder.to_string_lossy().into_owned(), boards);
    }
}

/// `hidden_columns` from its JSON value: anything that is not a map of maps of string lists is dropped, entry by entry.
fn hidden_from(v: Option<serde_json::Value>) -> BTreeMap<String, BTreeMap<String, Vec<String>>> {
    let Some(serde_json::Value::Object(folders)) = v else {
        return BTreeMap::new();
    };
    folders
        .into_iter()
        .filter_map(|(folder, boards)| {
            let serde_json::Value::Object(boards) = boards else {
                return None;
            };
            let boards: BTreeMap<String, Vec<String>> = boards
                .into_iter()
                .filter_map(|(b, cols)| {
                    serde_json::from_value::<Vec<String>>(cols)
                        .ok()
                        .map(|c| (b, c))
                })
                .collect();
            (!boards.is_empty()).then_some((folder, boards))
        })
        .collect()
}

/// One read-modify-write at a time in this process.
static LOCK: Mutex<()> = Mutex::new(());

const FILE: &str = "settings.json";

/// Decodes one field of the settings object alone; a wrong type gives `None`.
fn field<T: serde::de::DeserializeOwned>(
    map: &mut serde_json::Map<String, serde_json::Value>,
    key: &str,
) -> Option<T> {
    map.remove(key).and_then(|v| serde_json::from_value(v).ok())
}

/// Settings from the file's bytes: `None` unless they are UTF-8 text holding a
/// JSON object. Each known field is decoded alone, so a wrong-typed value costs
/// only itself; the other keys go to `other`.
fn from_bytes(bytes: &[u8]) -> Option<Settings> {
    let text = std::str::from_utf8(bytes).ok()?;
    let serde_json::Value::Object(mut map) = serde_json::from_str(text).ok()? else {
        return None;
    };
    let recent_folders = match map.remove("recent_folders") {
        Some(serde_json::Value::Array(items)) => items
            .into_iter()
            .filter_map(|v| serde_json::from_value::<PathBuf>(v).ok())
            .collect(),
        _ => Vec::new(),
    };
    Some(Settings {
        last_folder: field(&mut map, "last_folder"),
        sidebar_width: field(&mut map, "sidebar_width"),
        sidebar_hidden: field(&mut map, "sidebar_hidden").unwrap_or_default(),
        board_column_width: field(&mut map, "board_column_width"),
        theme: field(&mut map, "theme"),
        zoom_percent: field(&mut map, "zoom_percent"),
        journals_at: field(&mut map, "journals_at"),
        hide_link_scheme: field(&mut map, "hide_link_scheme"),
        shorten_links: field(&mut map, "shorten_links"),
        recent_folders,
        hidden_columns: hidden_from(map.remove("hidden_columns")),
        other: map,
    })
}

/// Reads `settings.json` from `dir`. A missing or unreadable file gives the
/// default; a wrong-typed value gives that field's default and keeps the rest.
pub fn load(dir: &Path) -> Settings {
    std::fs::read(dir.join(FILE))
        .ok()
        .and_then(|bytes| from_bytes(&bytes))
        .unwrap_or_default()
}

pub fn save(dir: &Path, s: &Settings) -> io::Result<()> {
    let text = serde_json::to_string_pretty(s).map_err(io::Error::other)?;
    breccia_core::fsio::write_atomic(&dir.join(FILE), &text)
}

/// Loads the settings, lets `change` edit them, and saves them: whoever
/// changes one field keeps the others.
pub fn update(dir: &Path, change: impl FnOnce(&mut Settings)) -> io::Result<()> {
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let path = dir.join(FILE);
    let mut s = match std::fs::read(&path) {
        Ok(bytes) => match from_bytes(&bytes) {
            Some(s) => s,
            None => {
                // Not settings at all: keep the old bytes aside before replacing.
                std::fs::copy(&path, dir.join(format!("{FILE}.broken")))?;
                Settings::default()
            }
        },
        Err(_) => Settings::default(),
    };
    change(&mut s);
    save(dir, &s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_file_gives_default() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load(dir.path()), Settings::default());
    }

    #[test]
    fn round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let s = Settings {
            last_folder: Some(PathBuf::from("C:/notes")),
            ..Settings::default()
        };
        save(dir.path(), &s).unwrap();
        assert_eq!(
            load(dir.path()).last_folder,
            Some(PathBuf::from("C:/notes"))
        );
    }

    #[test]
    fn save_creates_missing_config_dir() {
        let dir = tempfile::tempdir().unwrap();
        let nested = dir.path().join("a").join("b");
        save(&nested, &Settings::default()).unwrap();
        assert!(nested.join(FILE).is_file());
    }

    #[test]
    fn corrupt_file_gives_default() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(FILE), "{nope").unwrap();
        assert_eq!(load(dir.path()), Settings::default());
    }

    #[test]
    fn old_settings_file_still_loads() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(FILE), r#"{"last_folder": "C:/x"}"#).unwrap();
        let s = load(dir.path());
        assert_eq!(s.last_folder, Some(PathBuf::from("C:/x")));
        assert_eq!(s.sidebar_width, None);
        assert!(!s.sidebar_hidden);
        assert_eq!(s.theme, None);
        assert!(s.recent_folders.is_empty());
    }

    #[test]
    fn remember_dedupes_and_caps() {
        let mut s = Settings::default();
        for i in 0..12 {
            remember(&mut s, PathBuf::from(format!("C:\\n{i}")));
        }
        assert_eq!(s.recent_folders.len(), RECENT_MAX);
        assert_eq!(s.recent_folders[0], PathBuf::from("C:\\n11"));
        remember(&mut s, PathBuf::from("C:\\n5\\"));
        assert_eq!(s.recent_folders[0], PathBuf::from("C:\\n5\\"));
        let same = s
            .recent_folders
            .iter()
            .filter(|p| same_folder(p, Path::new("C:\\n5")))
            .count();
        assert_eq!(same, 1);
        assert_eq!(s.last_folder, Some(PathBuf::from("C:\\n5\\")));
    }

    #[test]
    #[cfg(windows)]
    fn same_folder_ignores_case_and_slashes_on_windows() {
        assert!(same_folder(Path::new("C:\\Notes"), Path::new("c:/notes/")));
        assert!(!same_folder(
            Path::new("C:\\Notes"),
            Path::new("C:\\Notes2")
        ));
    }

    #[test]
    fn forget_keeps_the_last_folder() {
        let mut s = Settings::default();
        let (a, b) = (PathBuf::from("C:\\a"), PathBuf::from("C:\\b"));
        remember(&mut s, a.clone());
        remember(&mut s, b.clone());
        forget(&mut s, &a);
        assert_eq!(s.recent_folders, vec![b.clone()]);
        assert_eq!(s.last_folder, Some(b.clone()));
        forget(&mut s, &b);
        assert!(s.recent_folders.is_empty());
        assert_eq!(s.last_folder, Some(b));
    }

    #[test]
    fn update_holds_the_lock_across_read_and_write() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path().to_path_buf();
        update(&d, |s| s.sidebar_width = Some(1)).unwrap();
        let (tx, rx) = std::sync::mpsc::channel();
        let d2 = d.clone();
        let mut second = None;
        update(&d, |s| {
            s.sidebar_hidden = true; // the read is taken, the write is pending
            second = Some(std::thread::spawn(move || {
                update(&d2, |s| remember(s, PathBuf::from("C:/x"))).unwrap();
                tx.send(()).unwrap();
            }));
            // With the lock the second update is blocked until this one has saved.
            assert!(
                rx.recv_timeout(std::time::Duration::from_millis(300))
                    .is_err(),
                "a second update ran inside the first one's read-modify-write"
            );
        })
        .unwrap();
        second.unwrap().join().unwrap();
        let s = load(&d);
        assert!(s.sidebar_hidden);
        assert_eq!(s.sidebar_width, Some(1));
        assert_eq!(s.recent_folders, vec![PathBuf::from("C:/x")]);
    }

    #[test]
    fn unknown_keys_survive_an_update() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join(FILE),
            r#"{"last_folder": "C:/x", "from_the_future": {"a": [1, 2]}}"#,
        )
        .unwrap();
        update(dir.path(), |s| s.sidebar_hidden = true).unwrap();
        let text = std::fs::read_to_string(dir.path().join(FILE)).unwrap();
        let v: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(v["from_the_future"]["a"][1], 2);
        assert_eq!(v["sidebar_hidden"], true);
    }

    #[test]
    fn the_board_column_width_is_kept_and_a_wrong_type_is_none() {
        let dir = tempfile::tempdir().unwrap();
        update(dir.path(), |s| s.board_column_width = Some(300)).unwrap();
        assert_eq!(load(dir.path()).board_column_width, Some(300));
        std::fs::write(dir.path().join(FILE), r#"{"board_column_width":"wide"}"#).unwrap();
        assert_eq!(load(dir.path()).board_column_width, None);
    }

    #[test]
    fn the_journals_placement_is_kept_and_a_wrong_type_is_none() {
        let dir = tempfile::tempdir().unwrap();
        update(dir.path(), |s| s.journals_at = Some("inline".into())).unwrap();
        assert_eq!(load(dir.path()).journals_at.as_deref(), Some("inline"));
        std::fs::write(dir.path().join(FILE), r#"{"journals_at":3}"#).unwrap();
        assert_eq!(load(dir.path()).journals_at, None);
    }

    #[test]
    fn the_link_display_choices_are_kept_and_a_wrong_type_is_none() {
        let dir = tempfile::tempdir().unwrap();
        update(dir.path(), |s| {
            s.hide_link_scheme = Some(true);
            s.shorten_links = Some(false);
        })
        .unwrap();
        let s = load(dir.path());
        assert_eq!(
            (s.hide_link_scheme, s.shorten_links),
            (Some(true), Some(false))
        );
        std::fs::write(
            dir.path().join(FILE),
            r#"{"hide_link_scheme":"yes","shorten_links":1}"#,
        )
        .unwrap();
        let s = load(dir.path());
        assert_eq!((s.hide_link_scheme, s.shorten_links), (None, None));
    }

    #[test]
    fn the_zoom_is_kept_and_a_wrong_type_is_none() {
        let dir = tempfile::tempdir().unwrap();
        update(dir.path(), |s| s.zoom_percent = Some(125)).unwrap();
        assert_eq!(load(dir.path()).zoom_percent, Some(125));
        std::fs::write(dir.path().join(FILE), r#"{"zoom_percent":"big"}"#).unwrap();
        assert_eq!(load(dir.path()).zoom_percent, None);
    }

    #[test]
    fn a_wrong_typed_value_keeps_the_others() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join(FILE),
            r#"{"last_folder":"C:/x","recent_folders":["C:/x","C:/y"],"sidebar_width":"wide","theme":"dark"}"#,
        )
        .unwrap();
        let s = load(dir.path());
        assert_eq!(s.sidebar_width, None);
        assert_eq!(s.last_folder, Some(PathBuf::from("C:/x")));
        assert_eq!(
            s.recent_folders,
            vec![PathBuf::from("C:/x"), PathBuf::from("C:/y")]
        );
        assert_eq!(s.theme.as_deref(), Some("dark"));
        update(dir.path(), |s| s.sidebar_hidden = true).unwrap();
        let text = std::fs::read_to_string(dir.path().join(FILE)).unwrap();
        assert!(text.contains("C:/x") && text.contains("C:/y"), "{text}");
        assert!(!text.contains("wide"), "{text}");
    }

    #[test]
    fn recent_entries_that_are_not_text_are_dropped() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join(FILE),
            r#"{"recent_folders":["C:/a", 3, null, "C:/b"]}"#,
        )
        .unwrap();
        assert_eq!(
            load(dir.path()).recent_folders,
            vec![PathBuf::from("C:/a"), PathBuf::from("C:/b")]
        );
    }

    #[test]
    fn a_file_that_is_not_settings_is_kept_aside() {
        let cases: [&[u8]; 3] = [b"{nope", b"[1,2]", b"{\"theme\":\"\xff\xfe\"}"];
        for old in cases {
            let dir = tempfile::tempdir().unwrap();
            std::fs::write(dir.path().join(FILE), old).unwrap();
            update(dir.path(), |s| s.sidebar_hidden = true).unwrap();
            assert_eq!(
                std::fs::read(dir.path().join("settings.json.broken")).unwrap(),
                old
            );
            assert!(load(dir.path()).sidebar_hidden);
        }
    }

    fn boards(pairs: &[(&str, &[&str])]) -> BTreeMap<String, Vec<String>> {
        pairs
            .iter()
            .map(|(b, cols)| (b.to_string(), cols.iter().map(|c| c.to_string()).collect()))
            .collect()
    }

    #[test]
    fn hidden_columns_round_trip_per_folder() {
        let dir = tempfile::tempdir().unwrap();
        let a = PathBuf::from("C:\\a");
        update(dir.path(), |s| {
            set_hidden(s, &a, boards(&[("Tasks", &["WAITING"])]))
        })
        .unwrap();
        let s = load(dir.path());
        assert_eq!(hidden_for(&s, &a), boards(&[("Tasks", &["WAITING"])]));
        assert!(hidden_for(&s, Path::new("C:\\b")).is_empty());
    }

    #[test]
    #[cfg(windows)]
    fn hidden_columns_same_folder_is_one_entry() {
        let mut s = Settings::default();
        set_hidden(
            &mut s,
            Path::new("C:\\Notes"),
            boards(&[("Tasks", &["DONE"])]),
        );
        set_hidden(
            &mut s,
            Path::new("c:/notes/"),
            boards(&[("Tasks", &["WAITING"])]),
        );
        assert_eq!(s.hidden_columns.len(), 1);
        assert_eq!(
            hidden_for(&s, Path::new("C:\\Notes")),
            boards(&[("Tasks", &["WAITING"])])
        );
    }

    #[test]
    fn empty_hidden_columns_remove_the_folder() {
        let mut s = Settings::default();
        let a = Path::new("C:/a");
        set_hidden(&mut s, a, boards(&[("Tasks", &["DONE"])]));
        set_hidden(&mut s, a, boards(&[("Tasks", &[])]));
        assert!(s.hidden_columns.is_empty());
    }

    #[test]
    fn wrong_typed_hidden_columns_keep_the_others() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join(FILE),
            r#"{"hidden_columns":3,"theme":"dark"}"#,
        )
        .unwrap();
        let s = load(dir.path());
        assert!(s.hidden_columns.is_empty());
        assert_eq!(s.theme.as_deref(), Some("dark"));
        std::fs::write(
            dir.path().join(FILE),
            r#"{"hidden_columns":{"C:/a":{"Tasks":["X",1],"Focus":["DONE"]},"C:/b":7}}"#,
        )
        .unwrap();
        let s = load(dir.path());
        assert_eq!(
            hidden_for(&s, Path::new("C:/a")),
            boards(&[("Focus", &["DONE"])])
        );
        assert!(hidden_for(&s, Path::new("C:/b")).is_empty());
    }
}
