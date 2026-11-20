//! The events the shell emits to the window, and the order they go in.

use breccia_core::Output;
use tauri::{AppHandle, Emitter};

/// Emitted with the `PageView` of a page changed outside the window. Tauri event
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
/// The Dailies list after another program or a Git pull changed `breccia/dailies.md`.
pub(crate) const DAILIES_CHANGED: &str = "dailies:changed";
/// The progress of the background build of the search index.
pub(crate) const INDEX_CHANGED: &str = "index:changed";
/// The session was recovered after an internal error (see `RecoveredEvent`).
pub(crate) const SESSION_RECOVERED: &str = "session:recovered";

/// The events one watcher run or Git step gives rise to, in emit order. Only changes made outside
/// the window are sent: a command's own changes reach the window in its answer (§9).
pub(crate) fn events(output: &Output) -> Vec<(&'static str, serde_json::Value)> {
    fn json<T: serde::Serialize>(v: &T) -> serde_json::Value {
        serde_json::to_value(v).unwrap_or(serde_json::Value::Null)
    }
    let mut out = Vec::new();
    // First, so the pages after it show with the new states.
    if let Some(config) = &output.config {
        out.push((CONFIG_CHANGED, json(config)));
    }
    // After the settings (the reset time) and before the pages.
    if let Some(dailies) = &output.dailies {
        out.push((DAILIES_CHANGED, json(dailies)));
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
    if !output.saved.is_empty() {
        out.push((PAGES_SAVED, json(&output.saved)));
    }
    if !output.notices.is_empty() {
        out.push((NOTICES_ADDED, json(&output.notices)));
    }
    out
}

pub(crate) fn emit_all(app: &AppHandle, output: &Output) {
    for (name, payload) in events(output) {
        let _ = app.emit(name, payload);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use breccia_core::session::Notice;
    use breccia_core::{Answer, Command, Request, Session};

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
                crate::test_clock(),
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
            answer: Some(Answer::Pages(vec![page])),
            tree: Some(tree),
            removed: vec!["x".into()],
            notices: vec![Notice::Refused {
                message: "n".into(),
            }],
            ..Output::default()
        };
        let names: Vec<&str> = events(&out).iter().map(|e| e.0).collect();
        assert_eq!(
            names,
            [
                "page:changed",
                "page:changed",
                "tree:changed",
                "page:removed",
                "notices:added"
            ]
        );
    }

    /// An answer is for the asker only: an output that holds nothing else sends no event.
    #[test]
    fn events_ignore_the_answer() {
        let dir = tempfile::tempdir().unwrap();
        let mut session = Session::new();
        let mut run = |command| {
            let generation = session.generation();
            session
                .run(
                    Request {
                        generation,
                        command,
                    },
                    crate::test_clock(),
                )
                .unwrap()
        };
        run(Command::FolderOpen {
            path: dir.path().to_path_buf(),
        });
        let page = run(Command::PageToday).page.unwrap();
        let out = Output {
            answer: Some(Answer::Pages(vec![page])),
            ..Output::default()
        };
        assert!(events(&out).is_empty());
    }

    #[test]
    fn dailies_changed_follows_config_changed() {
        let dir = tempfile::tempdir().unwrap();
        let mut session = Session::new();
        let mut run = |command| {
            let generation = session.generation();
            session
                .run(
                    Request {
                        generation,
                        command,
                    },
                    crate::test_clock(),
                )
                .unwrap()
        };
        run(Command::FolderOpen {
            path: dir.path().to_path_buf(),
        });
        let config = run(Command::ConfigGet).config.unwrap();
        let out = Output {
            config: Some(config),
            dailies: Some(Vec::new()),
            ..Output::default()
        };
        let names: Vec<&str> = events(&out).iter().map(|e| e.0).collect();
        assert_eq!(names, ["config:changed", "dailies:changed"]);
    }

    /// An event payload goes through `serde_json::Value`, which keeps the struct's field order only
    /// with `preserve_order`: `lib/configChange.ts` compares a `ConfigView` from an answer with one
    /// from `config:changed` as JSON text, and a `PageView` keeps the same order as an answer's.
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
                crate::test_clock(),
            )
            .unwrap();
        let generation = session.generation();
        let page = session
            .run(
                Request {
                    generation,
                    command: Command::PageToday,
                },
                crate::test_clock(),
            )
            .unwrap()
            .page
            .unwrap();
        let out = Output {
            page: Some(page.clone()),
            ..Output::default()
        };
        assert!(!page.blocks.is_empty());
        let events = events(&out);
        assert_eq!(events[0].0, PAGE_CHANGED);
        assert_eq!(
            serde_json::to_string(&events[0].1).unwrap(),
            serde_json::to_string(&page).unwrap()
        );
    }

    /// A pull that brought new settings sends them first, so the pages after
    /// them show with the new states.
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
                crate::test_clock(),
            )
            .unwrap();
        let generation = session.generation();
        let config = session
            .run(
                Request {
                    generation,
                    command: Command::ConfigGet,
                },
                crate::test_clock(),
            )
            .unwrap()
            .config
            .unwrap();
        let out = Output {
            config: Some(config.clone()),
            removed: vec!["x".into()],
            ..Output::default()
        };
        let sent = events(&out);
        assert_eq!(sent[0].0, "config:changed");
        assert_eq!(
            serde_json::to_string(&sent[0].1).unwrap(),
            serde_json::to_string(&config).unwrap(),
            "field order kept"
        );
        let names: Vec<&str> = sent.iter().map(|e| e.0).collect();
        assert_eq!(names, ["config:changed", "page:removed"]);
    }

    /// Only the watcher and the Git thread send events, so every change goes: the window learns of an
    /// outside change only this way.
    #[test]
    fn outside_runs_send_every_change() {
        let dir = tempfile::tempdir().unwrap();
        let mut session = Session::new();
        let mut run = |command| {
            let generation = session.generation();
            session
                .run(
                    Request {
                        generation,
                        command,
                    },
                    crate::test_clock(),
                )
                .unwrap()
        };
        run(Command::FolderOpen {
            path: dir.path().to_path_buf(),
        });
        let config = run(Command::ConfigGet).config.unwrap();
        let out = Output {
            config: Some(config),
            dailies: Some(Vec::new()),
            saved: vec!["a".into()],
            notices: vec![Notice::Refused {
                message: "n".into(),
            }],
            ..Output::default()
        };
        let names: Vec<&str> = events(&out).iter().map(|e| e.0).collect();
        assert_eq!(
            names,
            [
                "config:changed",
                "dailies:changed",
                "pages:saved",
                "notices:added"
            ]
        );
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
        let names: Vec<&str> = events(&out).iter().map(|e| e.0).collect();
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
        let all = events(&out);
        let names: Vec<&str> = all.iter().map(|e| e.0).collect();
        // Saved first, then the notices, the order `apply` uses for a command:
        // a page saved and then failing again keeps its new notice.
        assert_eq!(names, ["pages:saved", "notices:added"]);
        assert!(all.contains(&("pages:saved", serde_json::json!(["a"]))));
    }
}
