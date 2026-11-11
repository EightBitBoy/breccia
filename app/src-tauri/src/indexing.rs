//! The background build of the search index.

use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::Instant;

use breccia_core::search::INDEX_CHUNK_PAGES;
use breccia_core::{CommandError, IndexProgress, Output};
use tauri::{AppHandle, Emitter, Manager};

use crate::App;
use crate::commands::trace_line;
use crate::events::INDEX_CHANGED;
use crate::guard::{Guarded, with_session};
use crate::recovery::{Cause, after_recovery};

/// The payload of `index:changed`: the progress of the build for one folder
/// generation (a build of an older generation must not move the new one's status).
#[derive(serde::Serialize, Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct IndexEvent {
    done: usize,
    total: usize,
    generation: u64,
}

/// A large outside change (more pages than one index chunk) starts an index run.
pub(crate) fn needs_index_run(out: &Output) -> bool {
    out.changed.len() + out.removed.len() > INDEX_CHUNK_PAGES
}

pub(crate) fn index_if_large(app: &AppHandle, generation: u64, out: &Output) {
    if needs_index_run(out) {
        index_in_background(app, generation);
    }
}

/// The search index lives in the app cache dir; under `BRECCIA_CONFIG_DIR` it
/// is `<that dir>/cache`, so a test run never touches the real cache. `None`
/// keeps the index in memory.
pub(crate) fn cache_dir_for(
    config_override: Option<&Path>,
    default: Option<PathBuf>,
) -> Option<PathBuf> {
    match config_override {
        Some(dir) => Some(dir.join("cache")),
        None => default,
    }
}

/// A build of one chunk is over too fast to show.
pub(crate) fn reports_progress(total: usize) -> bool {
    total > INDEX_CHUNK_PAGES
}

/// What one indexing step gives rise to: the event to emit, if any, and
/// whether the loop stops. A loop that stops after it reported progress ends
/// with `{done: t, total: t}` for the last reported total `t`, so the status
/// item goes away however the loop ended (a finished build, a folder switch,
/// an error, or `search.query` having flushed the pending pages).
pub(crate) fn progress_event(
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
pub(crate) fn index_in_background(app: &AppHandle, generation: u64) {
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

pub(crate) fn index_loop(handle: &AppHandle, generation: u64) {
    {
        let state = handle.state::<App>();
        let mut last_total = None;
        loop {
            let asked = Instant::now();
            let (step, pages, wait, run) = match with_session(&state.session, |session| {
                let wait = asked.elapsed();
                let began = Instant::now();
                let step = session.index_step(generation, INDEX_CHUNK_PAGES);
                (step, session.index_step_pages(), wait, began.elapsed())
            }) {
                Guarded::Ran(ran) => ran,
                // This loop's generation is gone. When this loop caused the
                // recovery, the follow-up does not start indexing again
                // (search uses what it has); other causes start it there.
                Guarded::Recovered(r) => return after_recovery(handle, &r, Cause::Index),
            };
            // std's Mutex is not fair: give a command that waited for this
            // chunk (a keystroke) the chance to take the lock before the next.
            std::thread::yield_now();
            if state.trace {
                log::trace!(
                    target: "trace",
                    "{}",
                    trace_line("index", &format!("pages={pages}"), wait, run)
                );
            }
            if let Err(e) = &step {
                log::warn!("index: {}", e.message);
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands;

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
    fn large_outside_changes_start_an_index_run() {
        let n = |k: usize| Output {
            removed: (0..k).map(|i| format!("p{i}")).collect(),
            ..Output::default()
        };
        assert!(needs_index_run(&n(INDEX_CHUNK_PAGES + 1)));
        assert!(!needs_index_run(&n(INDEX_CHUNK_PAGES)));
    }
}
