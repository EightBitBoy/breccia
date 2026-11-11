//! The events the shell emits to the window, and the order they go in.

use breccia_core::Output;
use tauri::{AppHandle, Emitter};

/// Emitted with the `PageView` whenever a command returns a page. Tauri event
/// names allow no `.`, so this is the `page:changed` spelling of `page.changed`.
pub(crate) const PAGE_CHANGED: &str = "page:changed";
pub(crate) const TREE_CHANGED: &str = "tree:changed";
pub(crate) const PAGE_RENAMED: &str = "page:renamed";
pub(crate) const PAGE_REMOVED: &str = "page:removed";
/// The Git item's state.
pub(crate) const GIT_CHANGED: &str = "git:changed";
pub(crate) const NOTICES_ADDED: &str = "notices:added";
/// Keys of pages saved after a failed save; their "could not be saved" notice goes.
pub(crate) const PAGES_SAVED: &str = "pages:saved";
/// New settings (states, boards) that a Git pull brought.
pub(crate) const CONFIG_CHANGED: &str = "config:changed";
/// The progress of the background build of the search index.
pub(crate) const INDEX_CHANGED: &str = "index:changed";
/// The session was recovered after an internal error (see `RecoveredEvent`).
pub(crate) const SESSION_RECOVERED: &str = "session:recovered";

/// The events one command or watcher run gives rise to, in emit order.
/// Notices only travel as an event for watcher runs; a command's caller
/// finds them in its `Output`.
pub(crate) fn events(
    output: &Output,
    from_watcher: bool,
) -> Vec<(&'static str, serde_json::Value)> {
    fn json<T: serde::Serialize>(v: &T) -> serde_json::Value {
        serde_json::to_value(v).unwrap_or(serde_json::Value::Null)
    }
    let mut out = Vec::new();
    // First, so the pages after it show with the new states. A command's
    // own answer carries its config itself.
    if from_watcher && let Some(config) = &output.config {
        out.push((CONFIG_CHANGED, json(config)));
    }
    for page in output.page.iter().chain(&output.changed) {
        out.push((PAGE_CHANGED, json(page)));
    }
    if let Some(tree) = &output.tree {
        out.push((TREE_CHANGED, json(tree)));
    }
    for rename in &output.renamed {
        out.push((PAGE_RENAMED, json(rename)));
    }
    for key in &output.removed {
        out.push((PAGE_REMOVED, json(key)));
    }
    // Saved before notices, as `apply` does for a command: a page saved and
    // then failing again in one run keeps its new notice.
    if from_watcher && !output.saved.is_empty() {
        out.push((PAGES_SAVED, json(&output.saved)));
    }
    if from_watcher && !output.notices.is_empty() {
        out.push((NOTICES_ADDED, json(&output.notices)));
    }
    out
}

pub(crate) fn emit_all(app: &AppHandle, output: &Output, from_watcher: bool) {
    for (name, payload) in events(output, from_watcher) {
        let _ = app.emit(name, payload);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use breccia_core::session::Notice;
    use breccia_core::{Clock, Command, Request, Session};

    fn clock() -> Clock {
        Clock {
            today: chrono::NaiveDate::from_ymd_opt(2026, 10, 29).unwrap(),
            time: chrono::NaiveTime::from_hms_opt(14, 5, 9).unwrap(),
            ms: 0,
        }
    }

    #[test]
    fn events_cover_pages_tree_and_removals() {
        let dir = tempfile::tempdir().unwrap();
        let mut session = Session::new();
        let run = |s: &mut Session, command| {
            let generation = s.generation();
            s.run(
                Request {
                    generation,
                    command,
                },
                clock(),
            )
            .unwrap()
        };
        run(
            &mut session,
            Command::FolderOpen {
                path: dir.path().to_path_buf(),
            },
        );
        let page = run(&mut session, Command::PageToday).page.unwrap();
        let tree = run(&mut session, Command::FolderTree).tree.unwrap();
        let out = Output {
            page: Some(page.clone()),
            changed: vec![page.clone()],
            pages: vec![page],
            tree: Some(tree),
            removed: vec!["x".into()],
            notices: vec![Notice::Refused {
                message: "n".into(),
            }],
            ..Output::default()
        };
        let names = |from_watcher| -> Vec<&str> {
            events(&out, from_watcher).iter().map(|e| e.0).collect()
        };
        assert_eq!(
            names(false),
            [
                "page:changed",
                "page:changed",
                "tree:changed",
                "page:removed"
            ]
        );
        assert_eq!(names(true).last(), Some(&"notices:added"));
    }

    /// The frontend tells an own command's `page:changed` echo from news by
    /// comparing JSON strings, so the event payload must keep the field order
    /// of the command answer (`serde_json::to_string(&page)`).
    #[test]
    fn page_changed_payload_keeps_the_answer_field_order() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("journals")).unwrap();
        std::fs::write(
            dir.path().join("journals").join("2026-10-29.md"),
            "- TODO one
  - two
",
        )
        .unwrap();
        let mut session = Session::new();
        let generation = session.generation();
        session
            .run(
                Request {
                    generation,
                    command: Command::FolderOpen {
                        path: dir.path().to_path_buf(),
                    },
                },
                clock(),
            )
            .unwrap();
        let generation = session.generation();
        let page = session
            .run(
                Request {
                    generation,
                    command: Command::PageToday,
                },
                clock(),
            )
            .unwrap()
            .page
            .unwrap();
        let out = Output {
            page: Some(page.clone()),
            ..Output::default()
        };
        assert!(!page.blocks.is_empty());
        let events = events(&out, false);
        assert_eq!(events[0].0, PAGE_CHANGED);
        assert_eq!(
            serde_json::to_string(&events[0].1).unwrap(),
            serde_json::to_string(&page).unwrap()
        );
    }

    /// A pull that brought new settings sends them first, so the pages after
    /// them show with the new states. A command's own answer carries them.
    #[test]
    fn events_send_a_pulled_config_first() {
        let dir = tempfile::tempdir().unwrap();
        let mut session = Session::new();
        let generation = session.generation();
        session
            .run(
                Request {
                    generation,
                    command: Command::FolderOpen {
                        path: dir.path().to_path_buf(),
                    },
                },
                clock(),
            )
            .unwrap();
        let generation = session.generation();
        let config = session
            .run(
                Request {
                    generation,
                    command: Command::ConfigGet,
                },
                clock(),
            )
            .unwrap()
            .config
            .unwrap();
        let out = Output {
            config: Some(config.clone()),
            removed: vec!["x".into()],
            ..Output::default()
        };
        let sent = events(&out, true);
        assert_eq!(sent[0].0, "config:changed");
        assert_eq!(
            serde_json::to_string(&sent[0].1).unwrap(),
            serde_json::to_string(&config).unwrap(),
            "field order kept"
        );
        let names: Vec<&str> = events(&out, false).iter().map(|e| e.0).collect();
        assert_eq!(names, ["page:removed"]);
    }

    #[test]
    fn events_put_renames_before_removals() {
        let out = Output {
            renamed: vec![breccia_core::session::RenameView {
                from: "old".into(),
                to: "new".into(),
            }],
            removed: vec!["old".into()],
            ..Output::default()
        };
        let names: Vec<&str> = events(&out, false).iter().map(|e| e.0).collect();
        assert_eq!(names, ["page:renamed", "page:removed"]);
    }

    #[test]
    fn events_tell_a_watcher_run_of_pages_saved_after_a_failure() {
        let out = Output {
            notices: vec![Notice::Refused {
                message: "n".into(),
            }],
            saved: vec!["a".into()],
            ..Output::default()
        };
        let all = |from_watcher| events(&out, from_watcher);
        let names: Vec<&str> = all(true).iter().map(|e| e.0).collect();
        // Saved first, then the notices, the order `apply` uses for a command:
        // a page saved and then failing again keeps its new notice.
        assert_eq!(names, ["pages:saved", "notices:added"]);
        assert!(all(true).contains(&("pages:saved", serde_json::json!(["a"]))));
        assert!(all(false).iter().all(|e| e.0 != "pages:saved"));
    }
}
