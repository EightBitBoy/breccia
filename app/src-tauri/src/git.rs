//! The Git thread: it owns the engine, wakes on a timer and on messages, and
//! emits what each step gave rise to. It never holds the session lock between
//! steps; the engine takes it per piece, and emits happen after it is released.

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, Sender, channel};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use breccia_core::Session;
use breccia_core::git::{Git, GitEngine, GitView, Now, Step};
use tauri::{AppHandle, Emitter, Manager};

use crate::App;
use crate::events::{GIT_CHANGED, emit_all};
use crate::guard::{Guarded, with_session};
use crate::indexing::index_if_large;
use crate::recovery::{Cause, after_recovery};

/// How often the thread looks at the schedule when nothing else wakes it.
const TICK: Duration = Duration::from_secs(10);

/// What the close waits for the last commit and push.
pub const CLOSE_LIMIT: Duration = Duration::from_secs(15);

pub enum GitMsg {
    /// Files changed in the folder, or the folder switched.
    Changed,
    /// A click on the Git item.
    SyncNow,
    /// `git init` was asked for.
    Init,
    /// The app closes: commit, push, then answer.
    Exit(Sender<()>),
}

/// Waits for `rx` at most `limit`; true if something arrived (or the sender is
/// gone, which means the thread ended).
fn wait_at_most(rx: &Receiver<()>, limit: Duration) -> bool {
    !matches!(
        rx.recv_timeout(limit),
        Err(std::sync::mpsc::RecvTimeoutError::Timeout)
    )
}

/// The end of the close: waits for the Git thread's answer at most `limit`.
/// On a time-out the Git thread is still working, perhaps inside a rebase
/// under the session lock. `gave_up` is set at once, before the lock wait, so
/// no closing commit or push starts once the time is up (see `begin_close`).
/// The lock is then taken once (a poisoned one counts as taken) so the exit
/// does not cut that rebase short, and false is returned so the caller ends
/// running git processes. Breccia never pulls at close, so a rebase only runs
/// here when one was already under way.
pub fn finish_close(
    wait: &Receiver<()>,
    limit: Duration,
    session: &Mutex<Session>,
    gave_up: &AtomicBool,
) -> bool {
    if wait_at_most(wait, limit) {
        return true;
    }
    gave_up.store(true, Ordering::SeqCst);
    drop(session.lock());
    false
}

/// The start of the close in the Git thread: true when the closing commit and
/// push may run. The shell sets `cancel` to end a running fetch, which the
/// close commit must not inherit. But once the shell gave up waiting
/// (`gave_up`), nothing may start, or a push would outlive the app.
pub fn begin_close(cancel: &AtomicBool, gave_up: &AtomicBool) -> bool {
    if gave_up.load(Ordering::SeqCst) {
        return false;
    }
    cancel.store(false, Ordering::SeqCst);
    // The shell may have given up between the check and the store.
    if gave_up.load(Ordering::SeqCst) {
        cancel.store(true, Ordering::SeqCst);
        return false;
    }
    true
}

fn now_of(app: &App) -> Now {
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64);
    Now {
        ms,
        local: chrono::Local::now().naive_local(),
        clock: app.clock(),
    }
}

fn remember(handle: &AppHandle, view: &GitView) {
    let state = handle.state::<App>();
    let mut stored = state.git_view.lock().unwrap_or_else(|e| e.into_inner());
    *stored = view.clone();
    drop(stored);
    let _ = handle.emit(GIT_CHANGED, view);
}

/// Runs one step: says "working" first when the engine has something to do,
/// then runs it, then reports the result and the reloads it made.
fn run_step(
    handle: &AppHandle,
    engine: &mut GitEngine,
    asked: bool,
    f: impl FnOnce(&mut GitEngine, &Mutex<breccia_core::Session>, Now) -> Step,
) {
    let state = handle.state::<App>();
    let now = now_of(&state);
    if let Some(view) = engine.begin(now, asked) {
        remember(handle, &view);
    }
    let step = f(engine, &state.session, now);
    let news = step.view.is_some() || !step.outputs.is_empty();
    let view = step.view.unwrap_or_else(|| engine.view().clone());
    let changed = *state.git_view.lock().unwrap_or_else(|e| e.into_inner()) != view;
    if changed {
        remember(handle, &view);
    }
    if state.trace && news {
        log::trace!(target: "trace", "trace git state={:?}", view.state);
    }
    for (generation, output) in &step.outputs {
        emit_all(handle, output, true);
        index_if_large(handle, *generation, output);
    }
}

fn new_engine(cancel: &Arc<AtomicBool>) -> GitEngine {
    GitEngine::new(Git::new().with_cancel(cancel.clone()))
}

/// What woke the Git thread.
#[derive(Clone, Copy, Debug)]
enum Wake {
    /// The schedule's timer (and the first look at start).
    Timer,
    /// Files changed, or the folder switched.
    Changed,
    /// A click on the Git item, or `git init`.
    Asked,
}

/// Whether a step runs. After a step panicked (`paused`), the timer retries
/// nothing: a panic that repeats must not loop. The next change or click
/// tries again.
fn step_runs(paused: bool, wake: Wake) -> bool {
    !paused || !matches!(wake, Wake::Timer)
}

/// `run_step`, surviving a panic in it; true if it panicked. The engine is
/// then replaced by a fresh one, and if the engine's part poisoned the session
/// lock (it takes the lock itself), the session is recovered and the shell
/// follows it, without waking this thread again.
fn guarded_step(
    handle: &AppHandle,
    engine: &mut GitEngine,
    cancel: &Arc<AtomicBool>,
    asked: bool,
    f: impl FnOnce(&mut GitEngine, &Mutex<breccia_core::Session>, Now) -> Step,
) -> bool {
    if catch_unwind(AssertUnwindSafe(|| run_step(handle, engine, asked, f))).is_ok() {
        return false;
    }
    log::error!("git: a step panicked; the Git engine starts afresh at the next change or click");
    *engine = new_engine(cancel);
    if let Guarded::Recovered(r) = with_session(&handle.state::<App>().session, |_| ()) {
        after_recovery(handle, &r, Cause::Git);
    }
    true
}

pub fn start_git(app: &AppHandle) -> Sender<GitMsg> {
    let (tx, rx) = channel();
    let handle = app.clone();
    let cancel = app.state::<App>().cancel.clone();
    let gave_up = app.state::<App>().close_gave_up.clone();
    std::thread::spawn(move || {
        let mut engine = new_engine(&cancel);
        let tick = |e: &mut GitEngine, s: &Mutex<breccia_core::Session>, n| e.tick(s, n);
        let mut paused = guarded_step(&handle, &mut engine, &cancel, false, tick);
        loop {
            match rx.recv_timeout(TICK) {
                Ok(GitMsg::Changed) => {
                    let now = now_of(&handle.state::<App>());
                    engine.changed(now);
                    if step_runs(paused, Wake::Changed) {
                        paused = guarded_step(&handle, &mut engine, &cancel, false, tick);
                    }
                }
                Ok(GitMsg::SyncNow) => {
                    if step_runs(paused, Wake::Asked) {
                        paused = guarded_step(&handle, &mut engine, &cancel, true, |e, s, n| {
                            e.sync_now(s, n)
                        });
                    }
                }
                Ok(GitMsg::Init) => {
                    if step_runs(paused, Wake::Asked) {
                        paused = guarded_step(&handle, &mut engine, &cancel, true, |e, s, n| {
                            e.init(s, n)
                        });
                    }
                }
                Ok(GitMsg::Exit(reply)) => {
                    if begin_close(&cancel, &gave_up) {
                        // A panic here is not recovered from: the app is
                        // closing, and the close must stay bounded.
                        let closed = catch_unwind(AssertUnwindSafe(|| {
                            run_step(&handle, &mut engine, true, |e, s, n| e.close(s, n))
                        }));
                        if closed.is_err() {
                            log::error!("git: the closing step panicked");
                        }
                    }
                    let _ = reply.send(());
                    return;
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    if step_runs(paused, Wake::Timer) {
                        paused = guarded_step(&handle, &mut engine, &cancel, false, tick);
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return,
            }
        }
    });
    tx
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn after_a_panic_only_a_change_or_a_click_runs_a_step() {
        assert!(step_runs(false, Wake::Timer));
        assert!(!step_runs(true, Wake::Timer), "the timer retries nothing");
        assert!(step_runs(true, Wake::Changed));
        assert!(step_runs(true, Wake::Asked));
    }

    #[test]
    fn a_close_that_has_not_given_up_runs() {
        let cancel = AtomicBool::new(true);
        let gave_up = AtomicBool::new(false);
        assert!(begin_close(&cancel, &gave_up));
        assert!(!cancel.load(Ordering::SeqCst));
    }

    #[test]
    fn a_close_that_gave_up_runs_nothing() {
        let cancel = AtomicBool::new(true);
        let gave_up = AtomicBool::new(true);
        assert!(!begin_close(&cancel, &gave_up));
        assert!(cancel.load(Ordering::SeqCst));
    }

    #[test]
    fn finish_close_waits_for_the_session_lock() {
        let session = Arc::new(Mutex::new(Session::new()));
        let (_tx, rx) = channel::<()>();
        let (held_tx, held_rx) = channel::<()>();
        let gave_up = Arc::new(AtomicBool::new(false));
        let holder = Arc::clone(&session);
        let seen = Arc::clone(&gave_up);
        let thread = std::thread::spawn(move || {
            let _guard = holder.lock().unwrap();
            held_tx.send(()).unwrap();
            // The close gives up while this thread still holds the lock.
            let deadline = Instant::now() + Duration::from_secs(5);
            while !seen.load(Ordering::SeqCst) && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(5));
            }
            let given_up_under_lock = seen.load(Ordering::SeqCst);
            std::thread::sleep(Duration::from_millis(300));
            given_up_under_lock
        });
        // The holder has the lock before the close starts.
        held_rx.recv().unwrap();
        let start = Instant::now();
        assert!(!finish_close(
            &rx,
            Duration::from_millis(50),
            &session,
            &gave_up
        ));
        assert!(
            start.elapsed() >= Duration::from_millis(300),
            "returned after {:?}, before the lock was released",
            start.elapsed()
        );
        assert!(
            thread.join().unwrap(),
            "gave up only after the lock was released"
        );

        // An answer that is already there: true at once, no lock needed.
        let (tx, rx) = channel::<()>();
        tx.send(()).unwrap();
        let _guard = session.lock().unwrap();
        let gave_up = AtomicBool::new(false);
        let start = Instant::now();
        assert!(finish_close(
            &rx,
            Duration::from_millis(50),
            &session,
            &gave_up
        ));
        assert!(start.elapsed() < Duration::from_millis(50));
        assert!(!gave_up.load(Ordering::SeqCst));
    }

    #[test]
    fn finish_close_survives_a_poisoned_lock() {
        let session = Arc::new(Mutex::new(Session::new()));
        let poison = Arc::clone(&session);
        let _ = std::thread::spawn(move || {
            let _guard = poison.lock().unwrap();
            panic!("poison the lock");
        })
        .join();
        let (_tx, rx) = channel::<()>();
        let gave_up = AtomicBool::new(false);
        assert!(!finish_close(
            &rx,
            Duration::from_millis(20),
            &session,
            &gave_up
        ));
        assert!(gave_up.load(Ordering::SeqCst));
    }
}
