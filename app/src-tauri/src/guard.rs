//! The one way into the session. A panic inside a command never poisons the
//! session lock: it is caught while the lock is held, and the session is
//! recovered (`Session::recover`) before the lock is released. A lock that
//! code outside this guard poisoned (the Git engine takes the lock itself) is
//! recovered by the next take, once.

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::Mutex;

use breccia_core::session::Notice;
use breccia_core::{Recovery, Session};

/// What a guarded take did.
#[derive(Debug, PartialEq, Eq)]
pub enum Guarded<R> {
    /// The closure ran and returned.
    Ran(R),
    /// The session was recovered; the closure did not finish (it panicked) or
    /// did not run (the lock was poisoned: its request belongs to the old
    /// state). The caller runs the shell's follow-up once the lock is released.
    Recovered(Recovery),
}

/// Runs `f` on the session under its lock, recovering after a panic.
pub fn with_session<R>(session: &Mutex<Session>, f: impl FnOnce(&mut Session) -> R) -> Guarded<R> {
    let mut guard = match session.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            let mut guard = poisoned.into_inner();
            session.clear_poison();
            return Guarded::Recovered(recover(
                &mut guard,
                Session::begin_recovery,
                Session::reopen,
            ));
        }
    };
    // The guard lives outside the closure, so it is not dropped while the
    // panic unwinds, and the lock is not poisoned.
    match catch_unwind(AssertUnwindSafe(|| f(&mut guard))) {
        Ok(r) => Guarded::Ran(r),
        Err(_) => Guarded::Recovered(recover(
            &mut guard,
            Session::begin_recovery,
            Session::reopen,
        )),
    }
}

/// `Session::recover` in its two steps, each guarded on its own. `unsaved`
/// (`Session::begin_recovery`) says whether some page holds unsaved edits;
/// if it says so, or panics, the session is kept: nothing may drop edits
/// unless that check has run to the end and found none. Only then `reopen`
/// (`Session::reopen`) runs; if it panics, the session is replaced by a
/// fresh one without a folder.
fn recover(
    session: &mut Session,
    unsaved: impl FnOnce(&mut Session) -> bool,
    reopen: impl FnOnce(&mut Session) -> Recovery,
) -> Recovery {
    match catch_unwind(AssertUnwindSafe(|| unsaved(session))) {
        Ok(false) => {}
        Ok(true) => return Recovery::Kept,
        Err(_) => {
            log::error!("recovery: the check for unsaved pages failed; the session is kept");
            return Recovery::Kept;
        }
    }
    match catch_unwind(AssertUnwindSafe(|| reopen(session))) {
        Ok(r) => r,
        Err(_) => {
            session.reset();
            Recovery::NoFolder
        }
    }
}

/// What the user is told about a recovery.
pub fn recovery_notice(r: &Recovery) -> Notice {
    let message = match r {
        Recovery::Reopened { .. } => {
            "Breccia hit an internal error and reloaded your notes from disk. Everything saved is safe; undo starts afresh."
        }
        Recovery::Kept => {
            "Breccia hit an internal error. Some changes are not saved yet, so your notes were not reloaded. Copy what you need from the 'could not be saved' notices, then restart Breccia."
        }
        Recovery::NoFolder => {
            "Breccia hit an internal error and closed the notes folder. Open it again with Open folder… or from Recent folders."
        }
    };
    Notice::Refused {
        message: message.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    use breccia_core::{Clock, Command, Request};

    fn clock() -> Clock {
        Clock {
            today: chrono::NaiveDate::from_ymd_opt(2026, 10, 29).unwrap(),
            time: chrono::NaiveTime::from_hms_opt(14, 5, 9).unwrap(),
            ms: 0,
        }
    }

    /// A session with `dir` open.
    fn opened(dir: &std::path::Path) -> Session {
        let mut session = Session::new();
        session
            .run(
                Request {
                    generation: 0,
                    command: Command::FolderOpen {
                        path: dir.to_path_buf(),
                    },
                },
                clock(),
            )
            .unwrap();
        session
    }

    #[test]
    fn a_panic_inside_is_recovered_and_the_lock_stays_clean() {
        let dir = tempfile::tempdir().unwrap();
        let mutex = Mutex::new(opened(dir.path()));
        let g = mutex.lock().unwrap().generation();
        let got = with_session::<()>(&mutex, |_| panic!("x"));
        assert_eq!(
            got,
            Guarded::Recovered(Recovery::Reopened { generation: g + 1 })
        );
        assert!(!mutex.is_poisoned());
        assert_eq!(
            with_session(&mutex, |s| s.generation()),
            Guarded::Ran(g + 1)
        );
    }

    #[test]
    fn a_lock_poisoned_elsewhere_is_recovered_on_the_next_take() {
        let dir = tempfile::tempdir().unwrap();
        let session = Arc::new(Mutex::new(opened(dir.path())));
        let g = session.lock().unwrap().generation();
        let poison = Arc::clone(&session);
        let _ = std::thread::spawn(move || {
            let _guard = poison.lock().unwrap();
            panic!("poison the lock");
        })
        .join();
        assert!(session.is_poisoned());
        let mut ran = false;
        let got = with_session(&session, |_| ran = true);
        assert_eq!(
            got,
            Guarded::Recovered(Recovery::Reopened { generation: g + 1 })
        );
        assert!(!ran, "the request belongs to the old state");
        assert!(!session.is_poisoned());
        assert_eq!(with_session(&session, |_| ()), Guarded::Ran(()));
    }

    #[test]
    fn a_recovery_that_panics_leaves_a_fresh_session_without_a_folder() {
        let dir = tempfile::tempdir().unwrap();
        let mut session = opened(dir.path());
        let g = session.generation();
        // The unsaved check passed; the reopen panics.
        let got = recover(&mut session, |_| false, |_| panic!("reopen fails"));
        assert_eq!(got, Recovery::NoFolder);
        assert!(session.git_target().is_none());
        assert!(session.generation() > g, "old block ids are stale");
    }

    #[test]
    fn an_unsaved_check_that_panics_keeps_the_session() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("pages")).unwrap();
        std::fs::write(
            dir.path().join("pages").join("P.md"),
            "- a
",
        )
        .unwrap();
        let mut session = opened(dir.path());
        let g = session.generation();
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
        let page = run(&mut session, Command::PageGet { key: "p".into() });
        let id = page.page.unwrap().blocks[0].id;
        // The file changes first, so the save of the edit fails and the page stays unsaved.
        std::fs::write(
            dir.path().join("pages").join("P.md"),
            "- theirs
",
        )
        .unwrap();
        run(
            &mut session,
            Command::BlockSetText {
                id,
                text: "mine".into(),
            },
        );
        let mut reopened = false;
        let got = recover(
            &mut session,
            |_| panic!("the unsaved check fails"),
            |_| {
                reopened = true;
                Recovery::NoFolder
            },
        );
        assert_eq!(got, Recovery::Kept);
        assert!(!reopened, "no reopen and no reset without a passed check");
        assert_eq!(session.generation(), g);
        let page = run(&mut session, Command::PageGet { key: "p".into() });
        assert_eq!(page.page.unwrap().blocks[0].text, "mine");
    }

    #[test]
    fn recovery_notices_say_what_happened() {
        let text = |r: Recovery| match recovery_notice(&r) {
            Notice::Refused { message } => message,
            other => panic!("{other:?}"),
        };
        assert_eq!(
            text(Recovery::Reopened { generation: 3 }),
            "Breccia hit an internal error and reloaded your notes from disk. Everything saved is safe; undo starts afresh."
        );
        assert_eq!(
            text(Recovery::Kept),
            "Breccia hit an internal error. Some changes are not saved yet, so your notes were not reloaded. Copy what you need from the 'could not be saved' notices, then restart Breccia."
        );
        assert_eq!(
            text(Recovery::NoFolder),
            "Breccia hit an internal error and closed the notes folder. Open it again with Open folder… or from Recent folders."
        );
    }
}
