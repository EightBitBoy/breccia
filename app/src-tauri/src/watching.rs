//! The watcher of the open notes folder.

use std::time::Instant;

use breccia_core::session::Notice;
use breccia_core::watch::FolderWatcher;
use breccia_core::{Command, Request};
use tauri::{AppHandle, Manager};

use crate::App;
use crate::commands::{send_git, trace_line};
use crate::events::emit_all;
use crate::git::GitMsg;
use crate::guard::{Guarded, with_session};
use crate::indexing::index_if_large;
use crate::recovery::{Cause, after_recovery};

/// Watches `root`; each batch of changed files runs `files.changed` in the
/// session generation `generation`, off the watcher's thread.
pub(crate) fn start_watcher(
    app: &AppHandle,
    root: &std::path::Path,
    generation: u64,
) -> Option<Notice> {
    *app.state::<App>()
        .notes_root
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = Some(root.to_path_buf());
    let handle = app.clone();
    let started = FolderWatcher::start(root, move |paths| {
        let handle = handle.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let state = handle.state::<App>();
            let request = Request {
                generation,
                command: Command::FilesChanged { paths },
            };
            let clock = state.clock();
            let n = match &request.command {
                Command::FilesChanged { paths } => paths.len(),
                _ => 0,
            };
            let asked = Instant::now();
            let (result, wait, run) = match with_session(&state.session, |session| {
                let wait = asked.elapsed();
                let began = Instant::now();
                let result = session.run(request, clock);
                (result, wait, began.elapsed())
            }) {
                Guarded::Ran(ran) => ran,
                Guarded::Recovered(r) => return after_recovery(&handle, &r, Cause::Other),
            };
            if state.trace {
                log::trace!(target: "trace", "{}", trace_line("watch", &format!("paths={n}"), wait, run));
            }
            // The session lock is released before anything is emitted.
            match result {
                Ok(output) => {
                    emit_all(&handle, &output, true);
                    index_if_large(&handle, generation, &output);
                }
                Err(e) if e.code == "stale" => {}
                Err(e) => log::warn!("watcher: {}", e.message),
            }
            send_git(&handle, GitMsg::Changed);
        });
    });
    let state = app.state::<App>();
    let mut notice = None;
    let new = match started {
        Ok(w) => Some(w),
        Err(e) => {
            log::warn!("could not watch the folder: {e}");
            notice = Some(Notice::LoadWarning {
                message: format!(
                    "Breccia cannot follow changes other programs make in this folder: {e}"
                ),
            });
            None
        }
    };
    let old = match state.watcher.lock() {
        Ok(mut slot) => std::mem::replace(&mut *slot, new),
        Err(_) => None,
    };
    drop(old);
    notice
}
