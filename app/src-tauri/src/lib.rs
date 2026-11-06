//! The Tauri shell: wiring only. All behaviour lives in `breccia_core`.

mod git;
mod settings;

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use breccia_core::git::{Discovered, Git, GitView, discover};
use breccia_core::search::INDEX_CHUNK_PAGES;
use breccia_core::session::Notice;
use breccia_core::watch::FolderWatcher;
use breccia_core::{Clock, Command, CommandError, IndexProgress, Output, Request, Session};
use chrono::NaiveDate;
use git::{CLOSE_LIMIT, GitMsg, finish_close};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State};

/// Emitted with the `PageView` whenever a command returns a page. Tauri event
/// names allow no `.`, so this is the `page:changed` spelling of `page.changed`.
const PAGE_CHANGED: &str = "page:changed";
const TREE_CHANGED: &str = "tree:changed";
const PAGE_RENAMED: &str = "page:renamed";
const PAGE_REMOVED: &str = "page:removed";
/// The Git item's state.
const GIT_CHANGED: &str = "git:changed";
const NOTICES_ADDED: &str = "notices:added";
/// Keys of pages saved after a failed save; their "could not be saved" notice goes.
const PAGES_SAVED: &str = "pages:saved";
/// New settings (states, boards) that a Git pull brought.
const CONFIG_CHANGED: &str = "config:changed";
/// The progress of the background build of the search index.
const INDEX_CHANGED: &str = "index:changed";

/// The payload of `index:changed`: the progress of the build for one folder
/// generation (a build of an older generation must not move the new one's status).
#[derive(serde::Serialize, Clone, Copy, Debug, PartialEq, Eq)]
struct IndexEvent {
    done: usize,
    total: usize,
    generation: u64,
}

/// The window state the frontend keeps in `settings.json`.
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct UiState {
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
}

/// One entry of the recent-folders list, for the folder picker.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RecentFolder {
    path: PathBuf,
    name: String,
    exists: bool,
}

struct App {
    session: Mutex<Session>,
    started: Instant,
    config_dir: PathBuf,
    /// What the startup folder open has to tell the user (its load warnings,
    /// or why it failed), handed out once.
    startup_notices: Mutex<Vec<Notice>>,
    /// Watches the open folder; replaced whenever a folder is opened.
    watcher: Mutex<Option<FolderWatcher>>,
    /// `BRECCIA_TRACE`: print command and watcher timings to stderr.
    trace: bool,
    /// `BRECCIA_TODAY`: the date `today` means (the e2e hook).
    today: Option<NaiveDate>,
    /// The Git item's last state, for `git.status`.
    git_view: Mutex<GitView>,
    /// Messages to the Git thread; set once the thread runs.
    git_tx: Mutex<Option<Sender<GitMsg>>>,
    /// Ends a running `git` command (on close); shared with the engine's `Git`.
    cancel: Arc<AtomicBool>,
    /// Set when the close gave up waiting for the Git thread; the thread then
    /// starts no closing commit or push.
    close_gave_up: Arc<AtomicBool>,
    /// The generation of the running index loop, 0 for none.
    indexing: AtomicU64,
    /// The open notes folder, set with its watcher, so `git.log` finds the
    /// repository without the session lock (a pull's rebase holds it).
    notes_root: Mutex<Option<PathBuf>>,
}

/// `BRECCIA_TODAY` as `YYYY-MM-DD`; anything else is ignored.
fn today_override(var: Option<OsString>) -> Option<NaiveDate> {
    let var = var.filter(|v| !v.is_empty())?;
    let parsed = var
        .to_str()
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());
    if parsed.is_none() {
        eprintln!("BRECCIA_TODAY must be YYYY-MM-DD; ignored");
    }
    parsed
}

/// A large outside change (more pages than one index chunk) starts an index run.
fn needs_index_run(out: &Output) -> bool {
    out.changed.len() + out.removed.len() > INDEX_CHUNK_PAGES
}

fn index_if_large(app: &AppHandle, generation: u64, out: &Output) {
    if needs_index_run(out) {
        index_in_background(app, generation);
    }
}

fn send_git(app: &AppHandle, msg: GitMsg) {
    let state = app.state::<App>();
    if let Ok(slot) = state.git_tx.lock()
        && let Some(tx) = slot.as_ref()
    {
        let _ = tx.send(msg);
    }
}

/// The commands the shell answers itself, with what to tell the Git thread.
fn shell_answer(cmd: &Command, view: &GitView) -> Option<(Output, Option<GitMsg>)> {
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
fn git_log_answer(
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
fn close_git(app: &AppHandle) {
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
fn trace_enabled(var: Option<OsString>) -> bool {
    var.is_some_and(|v| !v.is_empty())
}

/// One timing line: how long a run waited for the session lock, and how long
/// it ran under it.
fn trace_line(kind: &str, name: &str, wait: Duration, run: Duration) -> String {
    format!(
        "trace {kind} {name} wait={:.1}ms run={:.1}ms",
        wait.as_secs_f64() * 1000.0,
        run.as_secs_f64() * 1000.0
    )
}

impl App {
    fn clock(&self) -> Clock {
        use chrono::Timelike;
        // One reading for both, so a command just at midnight gets a matching date and time.
        let local = chrono::Local::now();
        Clock {
            today: self.today.unwrap_or_else(|| local.date_naive()),
            // Whole seconds: the notes keep `HH:MM:SS`.
            time: local.time().with_nanosecond(0).unwrap_or(local.time()),
            ms: self.started.elapsed().as_millis() as u64,
        }
    }

    fn remember_folder(&self, path: PathBuf) {
        if let Err(e) = settings::update(&self.config_dir, |s| settings::remember(s, path)) {
            eprintln!("could not save settings: {e}");
        }
    }
}

/// The events one command or watcher run gives rise to, in emit order.
/// Notices only travel as an event for watcher runs; a command's caller
/// finds them in its `Output`.
fn events(output: &Output, from_watcher: bool) -> Vec<(&'static str, serde_json::Value)> {
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

fn emit_all(app: &AppHandle, output: &Output, from_watcher: bool) {
    for (name, payload) in events(output, from_watcher) {
        let _ = app.emit(name, payload);
    }
}

/// The search index lives in the app cache dir; under `BRECCIA_CONFIG_DIR` it
/// is `<that dir>/cache`, so a test run never touches the real cache. `None`
/// keeps the index in memory.
fn cache_dir_for(config_override: Option<&Path>, default: Option<PathBuf>) -> Option<PathBuf> {
    match config_override {
        Some(dir) => Some(dir.join("cache")),
        None => default,
    }
}

/// A build of one chunk is over too fast to show.
fn reports_progress(total: usize) -> bool {
    total > INDEX_CHUNK_PAGES
}

/// What one indexing step gives rise to: the event to emit, if any, and
/// whether the loop stops. A loop that stops after it reported progress ends
/// with `{done: t, total: t}` for the last reported total `t`, so the status
/// item goes away however the loop ended (a finished build, a folder switch,
/// an error, or `search.query` having flushed the pending pages).
fn progress_event(
    last_total: Option<usize>,
    step: &Result<Option<IndexProgress>, CommandError>,
) -> (Option<IndexProgress>, bool) {
    let closing = |t: Option<usize>| t.map(|t| IndexProgress { done: t, total: t });
    match step {
        Ok(Some(p)) if p.total > 0 && p.done < p.total => {
            ((reports_progress(p.total)).then_some(*p), false)
        }
        Ok(Some(p)) => (
            closing(last_total.or(reports_progress(p.total).then_some(p.total))),
            true,
        ),
        Ok(None) | Err(_) => (closing(last_total), true),
    }
}

/// Builds the search index of the open folder in the background, one chunk
/// per session lock, so typing waits at most one chunk.
fn index_in_background(app: &AppHandle, generation: u64) {
    if app
        .state::<App>()
        .indexing
        .swap(generation, Ordering::SeqCst)
        == generation
    {
        return;
    }
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        index_loop(&handle, generation);
        let _ = handle.state::<App>().indexing.compare_exchange(
            generation,
            0,
            Ordering::SeqCst,
            Ordering::SeqCst,
        );
    });
}

fn index_loop(handle: &AppHandle, generation: u64) {
    {
        let state = handle.state::<App>();
        let mut last_total = None;
        loop {
            let asked = Instant::now();
            let (step, pages, wait, run) = match state.session.lock() {
                Ok(mut session) => {
                    let wait = asked.elapsed();
                    let began = Instant::now();
                    let step = session.index_step(generation, INDEX_CHUNK_PAGES);
                    (step, session.index_step_pages(), wait, began.elapsed())
                }
                Err(_) => return eprintln!("index: the session lock is poisoned"),
            };
            // std's Mutex is not fair: give a command that waited for this
            // chunk (a keystroke) the chance to take the lock before the next.
            std::thread::yield_now();
            if state.trace {
                eprintln!(
                    "{}",
                    trace_line("index", &format!("pages={pages}"), wait, run)
                );
            }
            if let Err(e) = &step {
                eprintln!("index: {}", e.message);
            }
            // The session lock is released before anything is emitted.
            let (event, stop) = progress_event(last_total, &step);
            if let Some(p) = event {
                last_total = Some(p.total);
                let event = IndexEvent {
                    done: p.done,
                    total: p.total,
                    generation,
                };
                let _ = handle.emit(INDEX_CHANGED, event);
            }
            if stop {
                return;
            }
        }
    }
}

/// Watches `root`; each batch of changed files runs `files.changed` in the
/// session generation `generation`, off the watcher's thread.
fn start_watcher(app: &AppHandle, root: &std::path::Path, generation: u64) -> Option<Notice> {
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
            let (result, wait, run) = match state.session.lock() {
                Ok(mut session) => {
                    let wait = asked.elapsed();
                    let began = Instant::now();
                    let result = session.run(request, clock);
                    (result, wait, began.elapsed())
                }
                Err(_) => return eprintln!("watcher: the session lock is poisoned"),
            };
            if state.trace {
                eprintln!("{}", trace_line("watch", &format!("paths={n}"), wait, run));
            }
            // The session lock is released before anything is emitted.
            match result {
                Ok(output) => {
                    emit_all(&handle, &output, true);
                    index_if_large(&handle, generation, &output);
                }
                Err(e) if e.code == "stale" => {}
                Err(e) => eprintln!("watcher: {}", e.message),
            }
            send_git(&handle, GitMsg::Changed);
        });
    });
    let state = app.state::<App>();
    let mut notice = None;
    let new = match started {
        Ok(w) => Some(w),
        Err(e) => {
            eprintln!("could not watch the folder: {e}");
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

mod commands {
    use super::*;

    pub fn error(code: &str, message: String) -> CommandError {
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
        let writes_config = matches!(
            request.command,
            Command::BoardsSet { .. }
                | Command::StatesSet { .. }
                | Command::ConfigSetGit { .. }
                | Command::ConfigSetBoard { .. }
        );
        let opened = match &request.command {
            Command::FolderOpen { path } | Command::FolderCreate { path } => Some(path.clone()),
            _ => None,
        };
        let clock = state.clock();
        let asked = Instant::now();
        let mut session = state
            .session
            .lock()
            .map_err(|_| error("internal", "the session lock is poisoned".into()))?;
        let wait = asked.elapsed();
        let began = Instant::now();
        let result = session.run(request, clock);
        let run = began.elapsed();
        drop(session);
        if let Some(name) = name {
            eprintln!("{}", trace_line("run", &name, wait, run));
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
        }
    }

    /// Saves the zoom level in percent (`None` is 100).
    #[tauri::command]
    pub fn set_zoom(app: State<'_, App>, percent: Option<u32>) {
        if let Err(e) = settings::update(&app.config_dir, |s| s.zoom_percent = percent) {
            eprintln!("could not save settings: {e}");
        }
    }

    /// Saves the chosen theme (`None` follows the operating system).
    #[tauri::command]
    pub fn set_theme(app: State<'_, App>, theme: Option<String>) {
        if let Err(e) = settings::update(&app.config_dir, |s| s.theme = theme) {
            eprintln!("could not save settings: {e}");
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
        super::tray_wanted(std::env::var_os("BRECCIA_NO_TRAY"))
    }

    /// Drops a folder from the recent list.
    #[tauri::command]
    pub async fn forget_folder(app: State<'_, App>, path: PathBuf) -> Result<(), String> {
        let dir = app.config_dir.clone();
        tauri::async_runtime::spawn_blocking(move || {
            if let Err(e) = settings::update(&dir, |s| settings::forget(s, &path)) {
                eprintln!("could not save settings: {e}");
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
            eprintln!("could not save settings: {e}");
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
            eprintln!("could not save settings: {e}");
        }
    }

    /// The notices of the startup folder open, once; empty after that.
    #[tauri::command]
    pub fn startup_notices(state: State<'_, App>) -> Vec<Notice> {
        match state.startup_notices.lock() {
            Ok(mut slot) => std::mem::take(&mut *slot),
            Err(_) => vec![poisoned()],
        }
    }
}

/// The tray icon exists on Windows only, unless `BRECCIA_NO_TRAY` is set and non-empty.
fn tray_wanted(no_tray: Option<OsString>) -> bool {
    cfg!(windows) && no_tray.is_none_or(|v| v.is_empty())
}

/// The tray's event: the frontend runs its normal close (with the question about unsaved pages) and quits.
const TRAY_EXIT: &str = "tray:exit";

/// Shows the main window and brings it to the front.
fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// The tray icon: a click opens the window; the menu has "Open" and "Exit" only.
fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
    let exit = MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &exit])?;
    let mut tray = TrayIconBuilder::new()
        .tooltip("Breccia")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "exit" => {
                let _ = app.emit(TRAY_EXIT, ());
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// `BRECCIA_OFFSCREEN` set and non-empty (the e2e hook). Off screen is
/// Windows-only in effect: on other platforms `show_offscreen` shows the window
/// with `show()`, which activates it.
fn offscreen_enabled(var: Option<OsString>) -> bool {
    var.is_some_and(|v| !v.is_empty())
}

/// Where an off-screen window's top left corner goes, in physical pixels on
/// both axes: far beyond any monitor layout.
const OFFSCREEN: i32 = -20_000;

/// Makes every window start hidden and unfocused. tao ignores a start
/// position off every monitor, so `show_offscreen` moves it there and only
/// then shows it.
fn place_offscreen(windows: &mut [tauri::utils::config::WindowConfig]) {
    for w in windows {
        w.focus = false;
        w.visible = false;
    }
}

/// Moves the main window off screen and shows it without activating it, so
/// an e2e run neither takes the keyboard nor comes to the front. Shown, not
/// minimised: WebView2 may throttle a minimised window.
fn show_offscreen(app: &tauri::App) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    window.set_position(tauri::PhysicalPosition::new(OFFSCREEN, OFFSCREEN))?;
    show_inactive(&window)
}

/// `show()` activates the window (`SW_SHOW`); this shows it in the background.
#[cfg(windows)]
fn show_inactive(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    #[link(name = "user32")]
    unsafe extern "system" {
        fn ShowWindow(hwnd: *mut std::ffi::c_void, cmd: i32) -> i32;
    }
    const SW_SHOWNOACTIVATE: i32 = 4;
    let hwnd = window.hwnd()?;
    // SAFETY: a live top-level window of this process, called on its UI
    // thread (setup runs on the main thread).
    unsafe { ShowWindow(hwnd.0, SW_SHOWNOACTIVATE) };
    Ok(())
}

#[cfg(not(windows))]
fn show_inactive(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    window.show()
}

/// `BRECCIA_CONFIG_DIR` (the test hook): where the settings and the window
/// state live instead of the app config dir. Unset or empty means the default.
fn config_override(var: Option<std::ffi::OsString>) -> Option<PathBuf> {
    var.filter(|p| !p.is_empty()).map(PathBuf::from)
}

/// The window-state plugin, or `None` for an off-screen run: a restored
/// state would bring the window back on screen and focus it, and a saved one
/// would put it off screen on the next normal start.
fn window_state(
    config_override: Option<&Path>,
    offscreen: bool,
) -> Option<tauri_plugin_window_state::Builder> {
    if offscreen {
        return None;
    }
    let mut window_state = tauri_plugin_window_state::Builder::default();
    // The plugin joins its file name onto the app config dir, and joining an
    // absolute path replaces that dir.
    if let Some(dir) = config_override {
        window_state = window_state.with_filename(dir.join(".window-state.json").to_string_lossy());
    }
    Some(window_state)
}

pub fn run() {
    let config_override = config_override(std::env::var_os("BRECCIA_CONFIG_DIR"));
    let mut context = tauri::generate_context!();
    let offscreen = offscreen_enabled(std::env::var_os("BRECCIA_OFFSCREEN"));
    if offscreen {
        place_offscreen(&mut context.config_mut().app.windows);
    }
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());
    if let Some(window_state) = window_state(config_override.as_deref(), offscreen) {
        builder = builder.plugin(window_state.build());
    }
    builder
        .invoke_handler(tauri::generate_handler![
            commands::run,
            commands::startup_notices,
            commands::ui_state,
            commands::set_ui_state,
            commands::hidden_columns,
            commands::set_hidden_columns,
            commands::set_theme,
            commands::set_zoom,
            commands::recent_folders,
            commands::forget_folder,
            commands::git_installed,
            commands::tray_enabled
        ])
        .setup(move |app| {
            if offscreen {
                show_offscreen(app)?;
            }
            if tray_wanted(std::env::var_os("BRECCIA_NO_TRAY")) {
                build_tray(app)?;
            }
            let config_dir = match config_override.clone() {
                Some(dir) => dir,
                None => app.path().app_config_dir()?,
            };
            let session =
                match cache_dir_for(config_override.as_deref(), app.path().app_cache_dir().ok()) {
                    Some(dir) => Session::with_cache(dir),
                    None => Session::new(),
                };
            let state = App {
                session: Mutex::new(session),
                started: Instant::now(),
                config_dir,
                startup_notices: Mutex::new(Vec::new()),
                watcher: Mutex::new(None),
                trace: trace_enabled(std::env::var_os("BRECCIA_TRACE")),
                today: today_override(std::env::var_os("BRECCIA_TODAY")),
                git_view: Mutex::new(GitView::default()),
                git_tx: Mutex::new(None),
                cancel: Arc::new(AtomicBool::new(false)),
                close_gave_up: Arc::new(AtomicBool::new(false)),
                indexing: AtomicU64::new(0),
                notes_root: Mutex::new(None),
            };
            let mut watch = None;
            if let Some(path) = startup_folder(&state.config_dir) {
                let notices = open_startup_folder(&state.session, path.clone(), state.clock());
                *state
                    .startup_notices
                    .lock()
                    .unwrap_or_else(|e| e.into_inner()) = notices;
                let status = Request {
                    generation: 0,
                    command: Command::FolderStatus,
                };
                let clock = state.clock();
                let mut session = state.session.lock().unwrap_or_else(|e| e.into_inner());
                if let Ok(out) = session.run(status, clock)
                    && let Some(folder) = out.folder
                    && let Some(root) = folder.path
                {
                    watch = Some((root, folder.generation));
                    // The open folder is always first in the recent list.
                    state.remember_folder(path);
                }
            }
            app.manage(state);
            if let Some((root, generation)) = watch {
                let notice = start_watcher(app.handle(), &root, generation);
                if let Some(notice) = notice {
                    let state = app.state::<App>();
                    state
                        .startup_notices
                        .lock()
                        .unwrap_or_else(|e| e.into_inner())
                        .push(notice);
                }
                index_in_background(app.handle(), generation);
            }
            let tx = git::start_git(app.handle());
            *app.state::<App>()
                .git_tx
                .lock()
                .unwrap_or_else(|e| e.into_inner()) = Some(tx);
            Ok(())
        })
        .build(context)
        .expect("error while building breccia")
        .run(|handle, event| {
            if let RunEvent::Exit = event {
                close_git(handle);
            }
        });
}

/// `BRECCIA_FOLDER` (the test hook), or else the last folder, if any. A
/// startup folder that opens is remembered like any other, so a `just dev` run
/// with `BRECCIA_FOLDER` on the real config dir sets the last folder and the
/// recent list to that folder.
fn startup_folder(config_dir: &std::path::Path) -> Option<PathBuf> {
    match std::env::var_os("BRECCIA_FOLDER") {
        Some(p) if !p.is_empty() => Some(PathBuf::from(p)),
        _ => settings::load(config_dir).last_folder,
    }
}

/// Opens `path` at startup and returns what the user must be told: the load
/// warnings, or why the folder did not open (the session then has no folder).
fn open_startup_folder(session: &Mutex<Session>, path: PathBuf, clock: Clock) -> Vec<Notice> {
    let request = Request {
        generation: 0,
        command: Command::FolderOpen { path },
    };
    let result = match session.lock() {
        Ok(mut session) => session.run(request, clock),
        Err(_) => return vec![poisoned()],
    };
    match result {
        Ok(output) => output.notices,
        Err(e) => vec![Notice::Refused { message: e.message }],
    }
}

fn poisoned() -> Notice {
    Notice::Refused {
        message: "the session lock is poisoned".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use breccia_core::git::LOCAL_LIMIT;

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

    #[test]
    fn startup_open_keeps_load_warnings() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("pages")).unwrap();
        std::fs::write(dir.path().join("pages").join("Bin.md"), b"\xff\xfe\x00- x").unwrap();
        let session = Mutex::new(Session::new());
        let notices = open_startup_folder(&session, dir.path().to_path_buf(), clock());
        assert!(
            notices.iter().any(|n| matches!(
                n,
                Notice::LoadWarning { message } if message.contains("not valid UTF-8")
            )),
            "{notices:?}"
        );
    }

    #[test]
    fn startup_open_failure_is_a_notice() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("breccia")).unwrap();
        std::fs::write(dir.path().join("breccia").join("config.toml"), "states = 1").unwrap();
        let session = Mutex::new(Session::new());
        let notices = open_startup_folder(&session, dir.path().to_path_buf(), clock());
        assert!(
            matches!(notices.as_slice(), [Notice::Refused { .. }]),
            "{notices:?}"
        );
    }

    #[test]
    fn startup_open_of_a_gone_folder_opens_nothing_and_says_so() {
        let dir = tempfile::tempdir().unwrap();
        let gone = dir.path().join("gone");
        let session = Mutex::new(Session::new());
        let notices = open_startup_folder(&session, gone.clone(), clock());
        assert!(
            matches!(notices.as_slice(), [Notice::Refused { message }] if message.contains("no longer exists")),
            "{notices:?}"
        );
        // No folder is open, so the Welcome screen shows (with the recent list).
        let status = session
            .lock()
            .unwrap()
            .run(
                Request {
                    generation: 0,
                    command: Command::FolderStatus,
                },
                clock(),
            )
            .unwrap();
        assert_eq!(status.folder.unwrap().path, None);
        assert!(!gone.exists());
    }

    #[test]
    fn startup_open_of_a_clean_folder_says_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let session = Mutex::new(Session::new());
        let notices = open_startup_folder(&session, dir.path().to_path_buf(), clock());
        assert!(notices.is_empty(), "{notices:?}");
    }

    #[test]
    fn trace_needs_a_non_empty_value() {
        assert!(!trace_enabled(None));
        assert!(!trace_enabled(Some("".into())));
        assert!(trace_enabled(Some("1".into())));
    }

    #[test]
    fn only_builds_of_more_than_one_chunk_report_progress() {
        use breccia_core::search::INDEX_CHUNK_PAGES;
        assert!(!reports_progress(0));
        assert!(!reports_progress(INDEX_CHUNK_PAGES));
        assert!(reports_progress(INDEX_CHUNK_PAGES + 1));
    }

    #[test]
    fn cache_dir_follows_the_config_override() {
        assert_eq!(
            cache_dir_for(Some(Path::new("cfg")), Some(PathBuf::from("app-cache"))),
            Some(PathBuf::from("cfg").join("cache"))
        );
        assert_eq!(
            cache_dir_for(None, Some(PathBuf::from("app-cache"))),
            Some(PathBuf::from("app-cache"))
        );
        assert_eq!(cache_dir_for(None, None), None);
    }

    fn progress(done: usize, total: usize) -> IndexProgress {
        IndexProgress { done, total }
    }

    #[test]
    fn index_events_carry_their_generation() {
        let event = IndexEvent {
            done: 1,
            total: 2,
            generation: 7,
        };
        assert_eq!(
            serde_json::to_string(&event).unwrap(),
            r#"{"done":1,"total":2,"generation":7}"#
        );
    }

    #[test]
    fn progress_event_reports_steps_of_a_big_build() {
        let big = INDEX_CHUNK_PAGES * 3;
        let step = Ok(Some(progress(INDEX_CHUNK_PAGES, big)));
        assert_eq!(
            progress_event(None, &step),
            (Some(progress(INDEX_CHUNK_PAGES, big)), false)
        );
        // A small build is over too fast to show.
        let small = Ok(Some(progress(1, INDEX_CHUNK_PAGES)));
        assert_eq!(progress_event(None, &small), (None, false));
    }

    #[test]
    fn progress_event_closes_the_status_when_the_loop_stops() {
        let t = INDEX_CHUNK_PAGES * 3;
        let done = Some(progress(t, t));
        let err: Result<Option<IndexProgress>, CommandError> =
            Err(commands::error("internal", "x".into()));
        assert_eq!(
            progress_event(Some(t), &Ok(Some(progress(t, t)))),
            (done, true)
        );
        assert_eq!(progress_event(Some(t), &Ok(None)), (done, true));
        assert_eq!(progress_event(Some(t), &err), (done, true));
        // search.query flushed the pending pages: the next step answers 0/0.
        assert_eq!(
            progress_event(Some(t), &Ok(Some(progress(0, 0)))),
            (done, true)
        );
        // Nothing was reported, so there is nothing to close.
        assert_eq!(progress_event(None, &Ok(None)), (None, true));
        assert_eq!(progress_event(None, &err), (None, true));
        assert_eq!(
            progress_event(None, &Ok(Some(progress(0, 0)))),
            (None, true)
        );
    }

    #[test]
    fn trace_line_format() {
        let ms = std::time::Duration::from_micros;
        assert_eq!(
            trace_line("run", "block.split", ms(2_000), ms(5_260)),
            "trace run block.split wait=2.0ms run=5.3ms"
        );
    }

    #[test]
    fn offscreen_needs_a_non_empty_value() {
        assert!(!offscreen_enabled(None));
        assert!(!offscreen_enabled(Some("".into())));
        assert!(offscreen_enabled(Some("1".into())));
    }

    #[test]
    fn the_tray_is_for_windows_and_can_be_turned_off() {
        assert_eq!(tray_wanted(None), cfg!(windows));
        assert_eq!(tray_wanted(Some("".into())), cfg!(windows));
        assert!(!tray_wanted(Some("1".into())));
    }

    /// The e2e run must neither take the keyboard focus nor show the window
    /// in front. tao ignores a start position off every monitor, so the
    /// window starts hidden and unfocused; setup moves it off screen and
    /// only then shows it.
    #[test]
    fn offscreen_windows_start_hidden_and_unfocused() {
        let ctx: tauri::Context<tauri::Wry> = tauri::generate_context!();
        let mut windows = ctx.config().app.windows.clone();
        assert!(windows[0].focus && windows[0].visible, "config changed");
        place_offscreen(&mut windows);
        let w = &windows[0];
        assert!(!w.focus, "window still takes the focus");
        assert!(!w.visible, "window shows before it is off screen");
        assert!(!w.maximized && !w.fullscreen, "window covers a screen");
    }

    /// An off-screen run neither restores nor saves the window state, so it
    /// cannot put the window off screen on the next normal start.
    #[test]
    fn offscreen_runs_have_no_window_state() {
        assert!(window_state(None, true).is_none());
        assert!(window_state(Some(Path::new("cfg")), true).is_none());
        assert!(window_state(None, false).is_some());
        assert!(window_state(Some(Path::new("cfg")), false).is_some());
    }

    #[test]
    fn config_dir_override_needs_a_non_empty_value() {
        assert_eq!(config_override(None), None);
        assert_eq!(config_override(Some("".into())), None);
        assert_eq!(
            config_override(Some("cfg".into())),
            Some(PathBuf::from("cfg"))
        );
    }

    /// The e2e test writes the folder's config itself; it must not drift from
    /// what `New folder...` writes.
    #[test]
    fn e2e_config_is_the_default_config() {
        let smoke = include_str!("../../e2e/smoke.mjs");
        assert!(
            smoke.contains(breccia_core::Config::default_toml()),
            "app/e2e/smoke.mjs CONFIG_TOML differs from DEFAULT_TOML"
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

    #[test]
    fn today_override_needs_a_date() {
        assert_eq!(
            today_override(Some("2026-03-12".into())),
            NaiveDate::from_ymd_opt(2026, 3, 12)
        );
        assert_eq!(today_override(Some("12 Mar".into())), None);
        assert_eq!(today_override(None), None);
    }

    #[test]
    fn large_outside_changes_start_an_index_run() {
        let n = |k: usize| Output {
            removed: (0..k).map(|i| format!("p{i}")).collect(),
            ..Output::default()
        };
        assert!(needs_index_run(&n(INDEX_CHUNK_PAGES + 1)));
        assert!(!needs_index_run(&n(INDEX_CHUNK_PAGES)));
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
