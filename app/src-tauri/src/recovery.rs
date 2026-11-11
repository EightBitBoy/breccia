//! What the shell does after the session recovered from a panic, and the
//! `BRECCIA_TEST_PANIC` hook that makes one.

use std::ffi::OsString;
use std::sync::Mutex;

use breccia_core::session::Notice;
use breccia_core::{Command, CommandError, Recovery};
use tauri::{AppHandle, Emitter, Manager};

use crate::App;
use crate::commands::{self, send_git};
use crate::events::SESSION_RECOVERED;
use crate::git::GitMsg;
use crate::guard::{Guarded, recovery_notice, with_session};
use crate::indexing::index_in_background;
use crate::watching::start_watcher;

/// The payload of `session:recovered`.
#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecoveredEvent {
    /// The window must reload: the notes were read again from disk, or no
    /// folder is open any more. False when the session was kept as it was.
    reopened: bool,
    /// What the user is told.
    notice: Notice,
}

impl RecoveredEvent {
    fn of(r: &Recovery) -> RecoveredEvent {
        RecoveredEvent {
            reopened: !matches!(r, Recovery::Kept),
            notice: recovery_notice(r),
        }
    }
}

/// The answer to a command that met a recovery: it did not run (or did not
/// finish), and the message is the recovery's notice.
pub(crate) fn recovered_error(r: &Recovery) -> CommandError {
    let message = match recovery_notice(r) {
        Notice::Refused { message } => message,
        other => format!("{other:?}"),
    };
    commands::error("recovered", message)
}

/// `BRECCIA_TEST_PANIC` (the e2e hook): a `search.query` for exactly this
/// text panics inside the session, once per process. Unset or empty: never.
pub(crate) fn test_panic(var: Option<OsString>) -> Option<String> {
    var.filter(|v| !v.is_empty())
        .map(|v| v.to_string_lossy().into_owned())
}

/// The text to panic with if `cmd` is the `search.query` the test hook waits
/// for; the hook is used up by it.
pub(crate) fn take_test_panic(slot: &Mutex<Option<String>>, cmd: &Command) -> Option<String> {
    let Command::SearchQuery { text } = cmd else {
        return None;
    };
    let mut slot = slot.lock().unwrap_or_else(|e| e.into_inner());
    if slot.as_deref() == Some(text.as_str()) {
        slot.take()
    } else {
        None
    }
}

/// Where the panic that led to a recovery happened.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Cause {
    /// A step of the index loop.
    Index,
    /// A step of the Git thread.
    Git,
    /// A command or a watcher run.
    Other,
}

/// What the shell does after a recovery.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct FollowUp {
    /// Watch the reopened folder in this generation.
    watch: Option<u64>,
    /// Index the reopened folder in this generation.
    index: Option<u64>,
    /// Stop watching: no folder is open.
    stop_watching: bool,
    /// Tell the Git thread to look again.
    tell_git: bool,
}

/// The follow-up of recovery `r`. A panic that repeats must not loop: a
/// recovery the index loop caused does not start indexing again (search
/// stays on what it has until the next folder open), and one the Git thread
/// caused does not wake the Git thread.
pub(crate) fn follow_up(r: &Recovery, cause: Cause) -> FollowUp {
    let reopened = match r {
        Recovery::Reopened { generation } => Some(*generation),
        Recovery::Kept | Recovery::NoFolder => None,
    };
    FollowUp {
        watch: reopened,
        index: reopened.filter(|_| cause != Cause::Index),
        stop_watching: *r == Recovery::NoFolder,
        tell_git: cause != Cause::Git,
    }
}

/// The shell's part of a recovery, run once the session lock is released:
/// the watcher and the index follow the reopened folder (or stop with no
/// folder), the Git thread looks again, and the window is told
/// (see `follow_up`).
pub(crate) fn after_recovery(app: &AppHandle, r: &Recovery, cause: Cause) {
    let what = match r {
        Recovery::Reopened { .. } => "reopened",
        Recovery::Kept => "kept",
        Recovery::NoFolder => "no folder",
    };
    log::error!("the session was recovered ({what})");
    let state = app.state::<App>();
    let follow = follow_up(r, cause);
    if cause == Cause::Index && follow.watch.is_some() {
        log::warn!("index: not started again after the recovery; search uses what it has");
    }
    if let Some(generation) = follow.watch {
        // The folder of this generation; none if another one opened since.
        let root = match with_session(&state.session, |s| {
            s.git_target()
                .filter(|(_, g, _)| *g == generation)
                .map(|(root, _, _)| root)
        }) {
            Guarded::Ran(root) => root,
            Guarded::Recovered(again) => {
                log::error!("the session was recovered again ({again:?})");
                None
            }
        };
        if let Some(root) = root {
            if let Some(notice) = start_watcher(app, &root, generation) {
                log::warn!("recovery: {notice:?}");
            }
            if let Some(generation) = follow.index {
                index_in_background(app, generation);
            }
        }
    }
    if follow.stop_watching {
        let old = state
            .watcher
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .take();
        drop(old);
        *state.notes_root.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }
    if follow.tell_git {
        send_git(app, GitMsg::Changed);
    }
    let _ = app.emit(SESSION_RECOVERED, RecoveredEvent::of(r));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_index_panic_does_not_restart_indexing() {
        let reopened = Recovery::Reopened { generation: 3 };
        let after_index = follow_up(&reopened, Cause::Index);
        assert_eq!(after_index.index, None, "a repeating panic must not loop");
        assert_eq!(after_index.watch, Some(3));
        assert!(after_index.tell_git);
        // From elsewhere, indexing starts again for the new generation.
        assert_eq!(follow_up(&reopened, Cause::Other).index, Some(3));
        for cause in [Cause::Index, Cause::Git, Cause::Other] {
            assert_eq!(follow_up(&Recovery::Kept, cause).index, None);
            let none = follow_up(&Recovery::NoFolder, cause);
            assert_eq!(
                (none.index, none.watch, none.stop_watching),
                (None, None, true)
            );
        }
    }

    #[test]
    fn a_git_panic_does_not_wake_git_again() {
        for r in [
            Recovery::Reopened { generation: 3 },
            Recovery::Kept,
            Recovery::NoFolder,
        ] {
            assert!(!follow_up(&r, Cause::Git).tell_git, "{r:?}");
            assert!(follow_up(&r, Cause::Other).tell_git, "{r:?}");
        }
        assert_eq!(
            follow_up(&Recovery::Reopened { generation: 3 }, Cause::Git).index,
            Some(3)
        );
    }

    #[test]
    fn test_panic_needs_a_non_empty_value() {
        assert_eq!(test_panic(None), None);
        assert_eq!(test_panic(Some("".into())), None);
        assert_eq!(test_panic(Some("boom".into())), Some("boom".to_string()));
    }

    #[test]
    fn the_test_panic_fires_once_for_its_search_text() {
        let slot = Mutex::new(Some("boom".to_string()));
        let query = |text: &str| Command::SearchQuery { text: text.into() };
        assert_eq!(take_test_panic(&slot, &query("other")), None);
        assert_eq!(take_test_panic(&slot, &Command::FolderStatus), None);
        assert_eq!(
            take_test_panic(&slot, &query("boom")),
            Some("boom".to_string())
        );
        assert_eq!(take_test_panic(&slot, &query("boom")), None, "once");
        assert_eq!(take_test_panic(&Mutex::new(None), &query("boom")), None);
    }

    #[test]
    fn recovered_event_payload() {
        let event = RecoveredEvent {
            reopened: true,
            notice: Notice::Refused {
                message: "m".into(),
            },
        };
        assert_eq!(
            serde_json::to_string(&event).unwrap(),
            r#"{"reopened":true,"notice":{"kind":"refused","message":"m"}}"#
        );
        // The window reloads after a reopen and after the folder was closed;
        // only a kept session stays as it is.
        assert!(RecoveredEvent::of(&Recovery::Reopened { generation: 2 }).reopened);
        assert!(RecoveredEvent::of(&Recovery::NoFolder).reopened);
        assert!(!RecoveredEvent::of(&Recovery::Kept).reopened);
        assert_eq!(
            RecoveredEvent::of(&Recovery::Kept).notice,
            recovery_notice(&Recovery::Kept)
        );
    }

    #[test]
    fn a_recovered_command_answers_with_the_notice_text() {
        let err = recovered_error(&Recovery::Kept);
        assert_eq!(err.code, "recovered");
        assert_eq!(
            Notice::Refused {
                message: err.message
            },
            recovery_notice(&Recovery::Kept)
        );
    }
}
