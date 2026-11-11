//! The Tauri commands the window calls, and the answers the shell gives itself.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use breccia_core::git::{Discovered, Git, GitView, discover};
use breccia_core::session::Notice;
use breccia_core::{Command, CommandError, Output, Request};
use tauri::{AppHandle, Manager, State};

use crate::events::emit_all;
use crate::git::{CLOSE_LIMIT, GitMsg, finish_close};
use crate::guard::{Guarded, with_session};
use crate::indexing::index_in_background;
use crate::recovery::{Cause, after_recovery, recovered_error, take_test_panic};
use crate::tray::tray_wanted;
use crate::watching::start_watcher;
use crate::{App, ready_log_dir, settings};

/// The window state the frontend keeps in `settings.json`.
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UiState {
    sidebar_width: Option<u32>,
    sidebar_hidden: bool,
    #[serde(default)]
    board_column_width: Option<u32>,
    /// The chosen theme; `set_ui_state` never changes it (see `set_theme`).
    /// A caller that leaves it out sends `None`.
    #[serde(default)]
    theme: Option<String>,
    /// The zoom level in percent; `set_ui_state` never changes it (see `set_zoom`).
    #[serde(default)]
    zoom_percent: Option<u32>,
    /// Where the sidebar lists Journals; `set_ui_state` never changes it (see `set_journals_at`).
    #[serde(default)]
    journals_at: Option<String>,
}

/// One entry of the recent-folders list, for the folder picker.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecentFolder {
    path: PathBuf,
    name: String,
    exists: bool,
}

pub(crate) fn send_git(app: &AppHandle, msg: GitMsg) {
    let state = app.state::<App>();
    if let Ok(slot) = state.git_tx.lock()
        && let Some(tx) = slot.as_ref()
    {
        let _ = tx.send(msg);
    }
}

/// The commands the shell answers itself, with what to tell the Git thread.
pub(crate) fn shell_answer(cmd: &Command, view: &GitView) -> Option<(Output, Option<GitMsg>)> {
    let msg = match cmd {
        Command::GitStatus => None,
        Command::GitSync => Some(GitMsg::SyncNow),
        Command::GitInit => Some(GitMsg::Init),
        _ => return None,
    };
    let out = Output {
        git: Some(view.clone()),
        ..Output::default()
    };
    Some((out, msg))
}

/// `git.log`: one page of the notes folder's commits, read from `root`'s
/// repository; `None` for any other command.
pub(crate) fn git_log_answer(
    cmd: &Command,
    git: &Git,
    root: Option<&Path>,
) -> Option<Result<Output, CommandError>> {
    let Command::GitLog { skip, limit } = *cmd else {
        return None;
    };
    let refused = |message: String| CommandError {
        code: "git".into(),
        message,
    };
    let Some(root) = root else {
        return Some(Err(refused("No notes folder is open.".into())));
    };
    let page = match discover(git, root) {
        Ok(Discovered::Repo(repo)) => repo.log(skip, limit),
        Ok(Discovered::NotInstalled) => {
            return Some(Err(refused("Git is not installed.".into())));
        }
        Ok(Discovered::NotARepo) => {
            return Some(Err(refused(
                "The notes folder is not in a Git repository.".into(),
            )));
        }
        Err(e) => Err(e),
    };
    Some(
        page.map(|page| Output {
            git_log: Some(page),
            ..Output::default()
        })
        .map_err(|e| refused(format!("Git could not read the history: {e}"))),
    )
}

/// The close: ends a running fetch, then lets the last commit and push run for
/// at most `CLOSE_LIMIT`.
pub(crate) fn close_git(app: &AppHandle) {
    let state = app.state::<App>();
    state.cancel.store(true, Ordering::SeqCst);
    let tx = state.git_tx.lock().ok().and_then(|mut s| s.take());
    let Some(tx) = tx else { return };
    let (reply, wait) = std::sync::mpsc::channel();
    let gave_up = &state.close_gave_up;
    if tx.send(GitMsg::Exit(reply)).is_ok()
        && !finish_close(&wait, CLOSE_LIMIT, &state.session, gave_up)
    {
        // `finish_close` has set `close_gave_up`, so the Git thread starts
        // nothing more. Kill the running git process tree so nothing outlives
        // the app.
        state.cancel.store(true, Ordering::SeqCst);
    }
}

/// `BRECCIA_TRACE` set and non-empty.
pub(crate) fn trace_enabled(var: Option<OsString>) -> bool {
    var.is_some_and(|v| !v.is_empty())
}

/// One timing line: how long a run waited for the session lock, and how long
/// it ran under it.
pub(crate) fn trace_line(kind: &str, name: &str, wait: Duration, run: Duration) -> String {
    format!(
        "trace {kind} {name} wait={:.1}ms run={:.1}ms",
        wait.as_secs_f64() * 1000.0,
        run.as_secs_f64() * 1000.0
    )
}

pub(crate) fn error(code: &str, message: String) -> CommandError {
    CommandError {
        code: code.into(),
        message,
    }
}

/// Runs one named command. The frontend sends everything through here.
/// It runs off the main thread, so a slow save never freezes the window;
/// the client sends one command at a time and the session is behind a lock.
#[tauri::command]
pub async fn run(app: AppHandle, request: serde_json::Value) -> Result<Output, CommandError> {
    tauri::async_runtime::spawn_blocking(move || run_blocking(&app, request))
        .await
        .map_err(|e| error("internal", e.to_string()))?
}

fn run_blocking(app: &AppHandle, request: serde_json::Value) -> Result<Output, CommandError> {
    let state = app.state::<App>();
    let name = state.trace.then(|| {
        request["command"]["type"]
            .as_str()
            .unwrap_or("?")
            .to_string()
    });
    let request: Request =
        serde_json::from_value(request).map_err(|e| error("badRequest", e.to_string()))?;
    // On this blocking thread, outside the session lock and the Git thread,
    // so a long sync does not hold the history up.
    let root = state.notes_root.lock().ok().and_then(|r| r.clone());
    if let Some(answer) = git_log_answer(&request.command, &Git::new(), root.as_deref()) {
        return answer;
    }
    let view = state.git_view.lock().map(|v| v.clone()).unwrap_or_default();
    if let Some((out, msg)) = shell_answer(&request.command, &view) {
        if let Some(msg) = msg {
            send_git(app, msg);
        }
        return Ok(out);
    }
    // These write `breccia/config.toml`, so the Git timer starts (a hand edit
    // starts it through the watcher).
    let writes_config = request.command.writes_config();
    let opened = match &request.command {
        Command::FolderOpen { path } | Command::FolderCreate { path } => Some(path.clone()),
        _ => None,
    };
    let panic_for = take_test_panic(&state.test_panic, &request.command);
    let clock = state.clock();
    let asked = Instant::now();
    let guarded = with_session(&state.session, |session| {
        let wait = asked.elapsed();
        let began = Instant::now();
        if let Some(text) = panic_for {
            panic!("test panic for `{text}`");
        }
        let result = session.run(request, clock);
        (result, wait, began.elapsed())
    });
    // The session lock is released here.
    let (result, wait, run) = match guarded {
        Guarded::Ran(ran) => ran,
        Guarded::Recovered(r) => {
            after_recovery(app, &r, Cause::Other);
            return Err(recovered_error(&r));
        }
    };
    if let Some(name) = name {
        log::trace!(target: "trace", "{}", trace_line("run", &name, wait, run));
    }
    let mut output = result?;
    if let Some(path) = &opened {
        state.remember_folder(path.clone());
    }
    if opened.is_some()
        && let Some(folder) = &output.folder
        && let Some(root) = &folder.path
    {
        let notice = start_watcher(app, root, folder.generation);
        output.notices.extend(notice);
        index_in_background(app, folder.generation);
    }
    if opened.is_some() || writes_config {
        send_git(app, GitMsg::Changed);
    }
    emit_all(app, &output, false);
    Ok(output)
}

/// The sidebar's saved width and visibility.
#[tauri::command]
pub fn ui_state(app: State<'_, App>) -> UiState {
    let s = settings::load(&app.config_dir);
    UiState {
        sidebar_width: s.sidebar_width,
        sidebar_hidden: s.sidebar_hidden,
        board_column_width: s.board_column_width,
        theme: s.theme,
        zoom_percent: s.zoom_percent,
        journals_at: s.journals_at,
    }
}

/// Saves the zoom level in percent (`None` is 100).
#[tauri::command]
pub fn set_zoom(app: State<'_, App>, percent: Option<u32>) {
    if let Err(e) = settings::update(&app.config_dir, |s| s.zoom_percent = percent) {
        log::warn!("could not save settings: {e}");
    }
}

/// Saves where the sidebar lists Journals ("top", "bottom" or "inline"; `None` is bottom).
#[tauri::command]
pub fn set_journals_at(app: State<'_, App>, at: Option<String>) {
    if let Err(e) = settings::update(&app.config_dir, |s| s.journals_at = at) {
        log::warn!("could not save settings: {e}");
    }
}

/// Saves the chosen theme (`None` follows the operating system).
#[tauri::command]
pub fn set_theme(app: State<'_, App>, theme: Option<String>) {
    if let Err(e) = settings::update(&app.config_dir, |s| s.theme = theme) {
        log::warn!("could not save settings: {e}");
    }
}

/// The recent folders in list order. The existence checks run off the
/// main thread: a missing network path can hang.
#[tauri::command]
pub async fn recent_folders(app: State<'_, App>) -> Result<Vec<RecentFolder>, String> {
    let dir = app.config_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        settings::load(&dir)
            .recent_folders
            .into_iter()
            .map(|path| RecentFolder {
                name: path
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_else(|| path.to_string_lossy().into_owned()),
                exists: path.is_dir(),
                path,
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

/// Whether the `git` command can be started. Only "not installed" counts as missing.
#[tauri::command]
pub async fn git_installed() -> bool {
    tauri::async_runtime::spawn_blocking(|| {
        let git = breccia_core::git::Git::new();
        let dir = std::env::temp_dir();
        !matches!(
            git.run(&dir, &["--version"], breccia_core::git::LOCAL_LIMIT),
            Err(breccia_core::git::GitError::NotInstalled)
        )
    })
    .await
    .unwrap_or(true)
}

/// Whether the app lives in the tray: its close button then hides the window instead of quitting.
#[tauri::command]
pub fn tray_enabled() -> bool {
    tray_wanted(std::env::var_os("BRECCIA_NO_TRAY"))
}

/// Drops a folder from the recent list.
#[tauri::command]
pub async fn forget_folder(app: State<'_, App>, path: PathBuf) -> Result<(), String> {
    let dir = app.config_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(e) = settings::update(&dir, |s| settings::forget(s, &path)) {
            log::warn!("could not save settings: {e}");
        }
    })
    .await
    .map_err(|e| e.to_string())
}

/// The hidden board columns saved for notes folder `folder`: board name to state keywords.
#[tauri::command]
pub fn hidden_columns(
    app: State<'_, App>,
    folder: PathBuf,
) -> std::collections::BTreeMap<String, Vec<String>> {
    settings::hidden_for(&settings::load(&app.config_dir), &folder)
}

/// Saves the hidden board columns of notes folder `folder` (all its boards at once).
#[tauri::command]
pub fn set_hidden_columns(
    app: State<'_, App>,
    folder: PathBuf,
    boards: std::collections::BTreeMap<String, Vec<String>>,
) {
    if let Err(e) = settings::update(&app.config_dir, |s| {
        settings::set_hidden(s, &folder, boards)
    }) {
        log::warn!("could not save settings: {e}");
    }
}

#[tauri::command]
pub fn set_ui_state(app: State<'_, App>, state: UiState) {
    let result = settings::update(&app.config_dir, |s| {
        s.sidebar_width = state.sidebar_width;
        s.sidebar_hidden = state.sidebar_hidden;
        s.board_column_width = state.board_column_width;
    });
    if let Err(e) = result {
        log::warn!("could not save settings: {e}");
    }
}

/// The log folder's path, for Settings; `None` if the app has none.
#[tauri::command]
pub fn log_folder(app: State<'_, App>) -> Option<String> {
    app.log_dir
        .as_ref()
        .map(|d| d.to_string_lossy().into_owned())
}

/// Opens the log folder in the file manager, making it first if needed.
/// Off the main thread: starting the file manager may take a moment.
#[tauri::command]
pub async fn open_log_folder(app: AppHandle) -> Result<(), String> {
    let dir = app.state::<App>().log_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_opener::OpenerExt;
        let path = ready_log_dir(dir.as_deref())?;
        app.opener()
            .open_path(path.to_string_lossy().into_owned(), None::<&str>)
            .map_err(|e| format!("The log folder could not be opened: {e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The notices of the startup folder open, once; empty after that.
#[tauri::command]
pub fn startup_notices(state: State<'_, App>) -> Vec<Notice> {
    std::mem::take(
        &mut *state
            .startup_notices
            .lock()
            .unwrap_or_else(|e| e.into_inner()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use breccia_core::git::LOCAL_LIMIT;

    #[test]
    fn trace_needs_a_non_empty_value() {
        assert!(!trace_enabled(None));
        assert!(!trace_enabled(Some("".into())));
        assert!(trace_enabled(Some("1".into())));
    }

    #[test]
    fn trace_line_format() {
        let ms = std::time::Duration::from_micros;
        assert_eq!(
            trace_line("run", "block.split", ms(2_000), ms(5_260)),
            "trace run block.split wait=2.0ms run=5.3ms"
        );
    }

    /// A `Git` that reads no user or system config and finds no repository above `root`.
    fn test_git(root: &Path) -> Git {
        let canon = root.canonicalize().unwrap().to_string_lossy().to_string();
        let canon = canon.strip_prefix(r"\\?\").unwrap_or(&canon).to_string();
        let sep = if cfg!(windows) { ";" } else { ":" };
        Git::new()
            .with_env("GIT_CONFIG_NOSYSTEM", "1")
            .with_env("GIT_CONFIG_GLOBAL", root.join("gitconfig"))
            .with_env(
                "GIT_CEILING_DIRECTORIES",
                format!("{}{sep}{canon}", root.display()),
            )
            .with_env("GIT_AUTHOR_NAME", "Shell Test")
            .with_env("GIT_AUTHOR_EMAIL", "shell@example.invalid")
            .with_env("GIT_COMMITTER_NAME", "Shell Test")
            .with_env("GIT_COMMITTER_EMAIL", "shell@example.invalid")
    }

    #[test]
    fn git_log_is_answered_by_the_shell() {
        let t = tempfile::tempdir().unwrap();
        let g = test_git(t.path());
        let notes = t.path().join("notes");
        std::fs::create_dir_all(&notes).unwrap();
        let log = |root: Option<&Path>| {
            git_log_answer(
                &Command::GitLog {
                    skip: 0,
                    limit: 200,
                },
                &g,
                root,
            )
            .unwrap()
        };
        // Other commands are not this answer's.
        assert!(git_log_answer(&Command::GitStatus, &g, Some(&notes)).is_none());
        // No folder, and a folder outside Git: refused with a message.
        assert_eq!(log(None).unwrap_err().code, "git");
        let not_repo = log(Some(&notes)).unwrap_err();
        assert_eq!(not_repo.code, "git");
        assert!(
            not_repo.message.contains("not in a Git repository"),
            "{}",
            not_repo.message
        );
        let run = |args: &[&str]| g.ok(&notes, args, LOCAL_LIMIT).unwrap();
        run(&["init", "-q"]);
        // No commits yet: an empty page, not an error.
        let empty = log(Some(&notes)).unwrap().git_log.unwrap();
        assert!(empty.entries.is_empty() && !empty.more);
        std::fs::write(
            notes.join("a.md"),
            "- a
",
        )
        .unwrap();
        run(&["add", "-A"]);
        run(&["commit", "-q", "-m", "notes: hello"]);
        let out = log(Some(&notes)).unwrap();
        let page = out.git_log.unwrap();
        assert_eq!(page.entries.len(), 1);
        assert_eq!(page.entries[0].subject, "notes: hello");
        assert_eq!(page.entries[0].author, "Shell Test");
        assert_eq!(page.skip, 0);
        assert!(out.git.is_none());
    }

    #[test]
    fn git_commands_are_answered_by_the_shell() {
        let view = GitView::default();
        let answer = |c: Command| shell_answer(&c, &view);
        let (out, msg) = answer(Command::GitStatus).unwrap();
        assert_eq!(out.git, Some(view.clone()));
        assert!(msg.is_none());
        assert!(matches!(
            answer(Command::GitSync),
            Some((_, Some(GitMsg::SyncNow)))
        ));
        assert!(matches!(
            answer(Command::GitInit),
            Some((_, Some(GitMsg::Init)))
        ));
        assert!(answer(Command::FolderStatus).is_none());
    }
}
