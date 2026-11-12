//! The Tauri shell: wiring only. All behaviour lives in `breccia_core`.

mod commands;
mod events;
mod git;
mod guard;
mod indexing;
mod logfile;
mod recovery;
mod settings;
mod tray;
mod watching;
mod window;

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use breccia_core::git::GitView;
use breccia_core::session::Notice;
use breccia_core::watch::FolderWatcher;
use breccia_core::{Clock, Command, Request, Session};
use chrono::NaiveDate;
use commands::{close_git, trace_enabled};
use git::GitMsg;
use guard::{Guarded, recovery_notice, with_session};
use indexing::{cache_dir_for, index_in_background};
use recovery::test_panic;
use tauri::{Manager, RunEvent};
use tray::{build_tray, show_main, tray_wanted};
use watching::start_watcher;
use window::{offscreen_enabled, place_offscreen, set_title, show_offscreen, window_state};

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
    /// The folder of the log file; `None` if the app has none.
    log_dir: Option<PathBuf>,
    /// `BRECCIA_TEST_PANIC`: the search text whose `search.query` panics, once.
    test_panic: Mutex<Option<String>>,
}

/// The log folder, made if it is missing, ready to be opened; or the message
/// for the user.
fn ready_log_dir(dir: Option<&Path>) -> Result<PathBuf, String> {
    let dir = dir.ok_or("Breccia has no log folder on this computer.")?;
    std::fs::create_dir_all(dir).map_err(|e| format!("The log folder could not be made: {e}"))?;
    Ok(dir.to_path_buf())
}

/// `BRECCIA_TODAY` as `YYYY-MM-DD`; anything else is ignored.
fn today_override(var: Option<OsString>) -> Option<NaiveDate> {
    let var = var.filter(|v| !v.is_empty())?;
    let parsed = var
        .to_str()
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());
    if parsed.is_none() {
        log::warn!("BRECCIA_TODAY must be YYYY-MM-DD; ignored");
    }
    parsed
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
            log::warn!("could not save settings: {e}");
        }
    }
}

/// `BRECCIA_CONFIG_DIR` (the test hook): where the settings and the window
/// state live instead of the app config dir. Unset or empty means the default.
fn config_override(var: Option<std::ffi::OsString>) -> Option<PathBuf> {
    var.filter(|p| !p.is_empty()).map(PathBuf::from)
}

/// Only one Breccia runs per user, except under `BRECCIA_CONFIG_DIR` (the test
/// hook): e2e, `just dev` and the screenshots then run beside an installed Breccia.
fn single_instance_wanted(config_override: Option<&Path>) -> bool {
    config_override.is_none()
}

pub fn run() {
    let config_override = config_override(std::env::var_os("BRECCIA_CONFIG_DIR"));
    let mut context = tauri::generate_context!();
    let offscreen = offscreen_enabled(std::env::var_os("BRECCIA_OFFSCREEN"));
    set_title(
        &mut context.config_mut().app.windows,
        std::env::var_os("BRECCIA_WINDOW_TITLE"),
    );
    if offscreen {
        place_offscreen(&mut context.config_mut().app.windows);
    }
    let mut builder = tauri::Builder::default();
    if single_instance_wanted(config_override.as_deref()) {
        // First, as the plugin requires: a second start must be caught before
        // anything else is set up. The arguments are ignored; Breccia takes none.
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app)
        }));
    }
    builder = builder
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
            commands::set_journals_at,
            commands::set_zoom,
            commands::recent_folders,
            commands::forget_folder,
            commands::git_installed,
            commands::tray_enabled,
            commands::log_folder,
            commands::open_log_folder
        ])
        .setup(move |app| {
            // First, so that the warnings of the start are logged too.
            let log_dir =
                logfile::log_dir_for(config_override.as_deref(), app.path().app_log_dir().ok());
            logfile::init(
                log_dir.as_deref(),
                trace_enabled(std::env::var_os("BRECCIA_TRACE")),
            );
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
                log_dir,
                test_panic: Mutex::new(test_panic(std::env::var_os("BRECCIA_TEST_PANIC"))),
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
                let status = match with_session(&state.session, |s| s.run(status, clock)) {
                    Guarded::Ran(status) => status.ok(),
                    // `App` is not managed yet, so the follow-up cannot run;
                    // no watcher or index starts, and the notice says why.
                    Guarded::Recovered(r) => {
                        log::error!("the session was recovered at start-up ({r:?})");
                        state
                            .startup_notices
                            .lock()
                            .unwrap_or_else(|e| e.into_inner())
                            .push(recovery_notice(&r));
                        None
                    }
                };
                if let Some(out) = status
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
/// startup folder that opens is remembered like any other, so a run with
/// `BRECCIA_FOLDER` on the real config dir sets the last folder and the recent
/// list to that folder (`just dev` uses a temp config dir for this reason).
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
    let result = match with_session(session, |s| s.run(request, clock)) {
        Guarded::Ran(result) => result,
        Guarded::Recovered(r) => {
            log::error!("the session was recovered at start-up ({r:?})");
            return vec![recovery_notice(&r)];
        }
    };
    match result {
        Ok(output) => output.notices,
        Err(e) => vec![Notice::Refused { message: e.message }],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn clock() -> Clock {
        Clock {
            today: chrono::NaiveDate::from_ymd_opt(2026, 10, 29).unwrap(),
            time: chrono::NaiveTime::from_hms_opt(14, 5, 9).unwrap(),
            ms: 0,
        }
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
    fn config_dir_override_needs_a_non_empty_value() {
        assert_eq!(config_override(None), None);
        assert_eq!(config_override(Some("".into())), None);
        assert_eq!(
            config_override(Some("cfg".into())),
            Some(PathBuf::from("cfg"))
        );
    }

    #[test]
    fn the_log_folder_is_made_before_it_is_opened() {
        let t = tempfile::tempdir().unwrap();
        let dir = t.path().join("cfg").join("logs");
        assert_eq!(ready_log_dir(Some(&dir)), Ok(dir.clone()));
        assert!(dir.is_dir());
        // An existing folder is fine too.
        assert_eq!(ready_log_dir(Some(&dir)), Ok(dir.clone()));
        // No folder, and a folder that cannot be made: a message for the user.
        assert_eq!(
            ready_log_dir(None),
            Err("Breccia has no log folder on this computer.".to_string())
        );
        let file = t.path().join("a-file");
        std::fs::write(&file, "x").unwrap();
        let err = ready_log_dir(Some(&file.join("logs"))).unwrap_err();
        assert!(
            err.starts_with("The log folder could not be made: "),
            "{err}"
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
    fn single_instance_is_skipped_under_a_config_dir() {
        assert!(single_instance_wanted(None));
        assert!(!single_instance_wanted(Some(Path::new("cfg"))));
    }

    #[test]
    fn single_instance_is_the_first_plugin() {
        let src = include_str!("lib.rs");
        let body = &src[src.find("pub fn run()").unwrap()..];
        let first = body.find(".plugin(").unwrap();
        assert!(body[first..].starts_with(".plugin(tauri_plugin_single_instance::init("));
    }
}
