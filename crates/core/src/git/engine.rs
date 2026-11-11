//! The Git engine: when to commit, pull and push, and what to tell the
//! status bar. It owns no thread: the shell calls `tick` and friends from one
//! worker, passing the session behind its lock.
//!
//! The session lock is taken for short pieces only: reading the folder, saving
//! what failed to save, the local rebase with the reload after it, and setting
//! the created dates. It is never held during `fetch`, `push`, `add`, `commit`
//! or `log`, so typing never waits for the network.

use super::repo::{Discovered, HeadState, Repo, discover};
use super::run::Git;
use super::schedule::{Due, Schedule};
use super::sync::{Problem, Pushed, Target, first_stderr_line};
use super::view::{GitState, GitView, ProblemView};
use super::{GitError, commit_message, init};
use crate::config::GitSettings;
use crate::layout;
use crate::session::{Clock, Command, Notice, Output, Request, Session};
use chrono::NaiveDateTime;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

/// The time of a call: epoch milliseconds for the schedule, the local time for
/// commit messages, and the shell's clock for running `files.changed`.
#[derive(Clone, Copy, Debug)]
pub struct Now {
    pub ms: i64,
    pub local: NaiveDateTime,
    pub clock: Clock,
}

/// What a call did: the new view when it changed, and the reloads a pull made.
#[derive(Debug, Default)]
pub struct Step {
    pub view: Option<GitView>,
    /// `(generation, output)` of each `files.changed` the engine ran; the
    /// shell emits them like the watcher's.
    pub outputs: Vec<(u64, Output)>,
}

enum Found {
    /// No folder, or Git is off for it.
    Unknown,
    NoGit,
    NotRepo,
    /// Discovery failed in a way other than "not a repository".
    Failed(Problem),
    Repo(Box<Repo>),
}

struct Known {
    root: PathBuf,
    generation: u64,
    settings: GitSettings,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Mode {
    /// The timer or a change: only what is due.
    Tick,
    /// A click: commit, pull, push, and try again after a stop.
    Sync,
    /// The app closes: commit and push, never pull.
    Close,
    /// Right after `git init`: only the first commit.
    Init,
}

/// How long an `index.lock` may block Breccia quietly before it is shown.
const LOCK_PATIENCE_MS: i64 = 60_000;

/// Why a step ended early.
enum Stop {
    /// Git's `index.lock` is held. Usually another Git command holds it for a
    /// moment, so it is quiet at first and tried again at the next tick.
    Locked,
    Problem(Problem),
}

/// What a step works on, passed to the parts of it.
struct Ctx<'a> {
    session: &'a Mutex<Session>,
    now: Now,
    repo: &'a Repo,
    generation: u64,
    /// This pull is the one retry after a refused rebase.
    retrying: bool,
}

struct Ready {
    repo: Repo,
    generation: u64,
    due: Due,
}

pub struct GitEngine {
    git: Git,
    view: GitView,
    known: Option<Known>,
    found: Found,
    schedule: Schedule,
    /// A conflict, a dirty tree outside the folder or an unclear remote ended
    /// syncing; commits go on, pulls and pushes wait for a click.
    stopped: bool,
    /// The problem that stopped syncing; it stays on the item until a click.
    sticky: Option<Problem>,
    /// The problem of the last step, if it was not one that stops.
    problem: Option<Problem>,
    target: Option<Target>,
    last_sync: Option<i64>,
    need_dates: bool,
    /// When a step first found `index.lock` held, in the current run of
    /// steps that all found it so.
    locked_since: Option<i64>,
    locked_for: Option<Duration>,
    #[cfg(feature = "test-seams")]
    after_fetch: Option<Box<dyn FnMut() + Send>>,
    #[cfg(feature = "test-seams")]
    before_lock: Option<Box<dyn FnMut() + Send>>,
    #[cfg(feature = "test-seams")]
    before_rebase: Option<Box<dyn FnMut() + Send>>,
    /// A rebase was refused and the pull is being tried once more.
    refused_once: bool,
}

/// How long a refused pull waits before its one retry.
const REFUSED_RETRY_MS: i64 = 10_000;

fn first_line(e: &GitError) -> String {
    match e {
        GitError::Failed { stderr, .. } => {
            first_stderr_line(stderr).unwrap_or_else(|| e.to_string())
        }
        e => e.to_string(),
    }
}

/// `git add` and `git commit` fail on an `index.lock` that the user's own Git
/// command (or Git reading a file) holds for a moment.
fn is_lock(e: &GitError) -> bool {
    matches!(e, GitError::Failed { stderr, .. } if stderr.contains("index.lock"))
}

fn poisoned() -> Problem {
    Problem::Failed {
        message: "the session lock is poisoned".into(),
    }
}

fn lock(session: &Mutex<Session>) -> Result<MutexGuard<'_, Session>, Problem> {
    session.lock().map_err(|_| poisoned())
}

impl GitEngine {
    pub fn new(git: Git) -> GitEngine {
        GitEngine {
            git,
            view: GitView::default(),
            known: None,
            found: Found::Unknown,
            schedule: Schedule::new(&GitSettings::default(), 0),
            stopped: false,
            sticky: None,
            problem: None,
            target: None,
            last_sync: None,
            need_dates: false,
            locked_since: None,
            locked_for: None,
            #[cfg(feature = "test-seams")]
            after_fetch: None,
            #[cfg(feature = "test-seams")]
            before_lock: None,
            #[cfg(feature = "test-seams")]
            before_rebase: None,
            refused_once: false,
        }
    }

    pub fn view(&self) -> &GitView {
        &self.view
    }

    /// How long the last pull held the session lock (commit, rebase and reload).
    pub fn last_lock_held(&self) -> Option<Duration> {
        self.locked_for
    }

    /// A test seam: `f` runs right after each fetch, before the commit that
    /// precedes the lock, which is where a save of the user's can land.
    #[cfg(feature = "test-seams")]
    pub fn after_fetch(&mut self, f: Box<dyn FnMut() + Send>) {
        self.after_fetch = Some(f);
    }

    /// A test seam: `f` runs after that commit, just before the lock is
    /// taken: a save landing now is left for the commit under the lock.
    #[cfg(feature = "test-seams")]
    pub fn before_lock(&mut self, f: Box<dyn FnMut() + Send>) {
        self.before_lock = Some(f);
    }

    /// A test seam: `f` runs inside the locked part, just before the rebase:
    /// a write landing now makes Git refuse to start it.
    #[cfg(feature = "test-seams")]
    pub fn before_rebase(&mut self, f: Box<dyn FnMut() + Send>) {
        self.before_rebase = Some(f);
    }

    /// Files changed in the folder: the commit waits for a pause.
    pub fn changed(&mut self, now: Now) {
        self.schedule.changed(now.ms);
    }

    /// When a commit or a pull is due (or `asked`, for a click, `init` or
    /// close) in a repository that is ready, shows "working" and returns the
    /// view, so the shell can say so before the slow part.
    pub fn begin(&mut self, now: Now, asked: bool) -> Option<GitView> {
        if !matches!(self.view.state, GitState::Ready | GitState::Problem)
            || !matches!(self.found, Found::Repo(_))
        {
            return None;
        }
        let due = self.schedule.due(now.ms);
        if !(asked || due.commit || (due.pull && !self.stopped)) {
            return None;
        }
        self.view.state = GitState::Working;
        Some(self.view.clone())
    }

    /// Does what is due. With nothing due it runs no Git command at all.
    pub fn tick(&mut self, session: &Mutex<Session>, now: Now) -> Step {
        self.step(session, now, Mode::Tick)
    }

    /// A click: clears a stop, then commits, pulls and pushes.
    pub fn sync_now(&mut self, session: &Mutex<Session>, now: Now) -> Step {
        self.stopped = false;
        self.sticky = None;
        self.refused_once = false;
        self.step(session, now, Mode::Sync)
    }

    /// The app closes: commit what is left and push it; never pull.
    pub fn close(&mut self, session: &Mutex<Session>, now: Now) -> Step {
        self.step(session, now, Mode::Close)
    }

    /// `git init` in a folder that is not a repository, then the first commit.
    pub fn init(&mut self, session: &Mutex<Session>, now: Now) -> Step {
        let before = self.view.clone();
        let mut outputs = Vec::new();
        let ready = self.prepare(session, now, true);
        if let Some(ready) = ready {
            // A repository appeared meanwhile: only commit.
            self.work(session, now, ready, Mode::Init, &mut outputs);
        } else if matches!(self.found, Found::NotRepo)
            && let Some(known) = &self.known
        {
            let root = known.root.clone();
            let generation = known.generation;
            match init(&self.git, &root) {
                Ok(repo) => {
                    self.set_repo(repo.clone());
                    let due = self.schedule.due(now.ms);
                    let ready = Ready {
                        repo,
                        generation,
                        due,
                    };
                    self.work(session, now, ready, Mode::Init, &mut outputs);
                }
                Err(e) => self.found = Found::Failed(Problem::failed(&e)),
            }
        }
        self.finish(before, outputs)
    }

    fn step(&mut self, session: &Mutex<Session>, now: Now, mode: Mode) -> Step {
        let before = self.view.clone();
        let mut outputs = Vec::new();
        if let Some(ready) = self.prepare(session, now, mode != Mode::Tick) {
            self.work(session, now, ready, mode, &mut outputs);
        }
        self.finish(before, outputs)
    }

    fn finish(&mut self, before: GitView, outputs: Vec<(u64, Output)>) -> Step {
        self.settle();
        Step {
            view: (self.view != before).then(|| self.view.clone()),
            outputs,
        }
    }

    /// The state and problem the item shows, from what is known now. Never `Working`.
    fn settle(&mut self) {
        let shown = self.problem.clone().or_else(|| self.sticky.clone());
        match &self.found {
            Found::Unknown => {
                self.view = GitView::default();
            }
            Found::NoGit => {
                self.view.state = GitState::NoGit;
                self.view.problem = None;
            }
            Found::NotRepo => {
                self.view.state = GitState::NotRepo;
                self.view.problem = None;
            }
            Found::Failed(p) => {
                self.view.state = GitState::Problem;
                self.view.problem = Some(ProblemView::of(p));
            }
            Found::Repo(_) => {
                self.view.state = if shown.is_some() {
                    GitState::Problem
                } else {
                    GitState::Ready
                };
                self.view.problem = shown.as_ref().map(ProblemView::of);
            }
        }
    }

    fn reset_off(&mut self) {
        self.known = None;
        self.found = Found::Unknown;
        self.stopped = false;
        self.sticky = None;
        self.problem = None;
        self.target = None;
        self.last_sync = None;
        self.locked_since = None;
    }

    fn set_repo(&mut self, repo: Repo) {
        self.view.top = Some(repo.top.clone());
        self.found = Found::Repo(Box::new(repo));
        self.need_dates = true;
    }

    fn discover(&mut self, root: &Path) {
        self.view = GitView::default();
        self.target = None;
        self.last_sync = None;
        match discover(&self.git, root) {
            Ok(Discovered::NotInstalled) => self.found = Found::NoGit,
            Ok(Discovered::NotARepo) => self.found = Found::NotRepo,
            Ok(Discovered::Repo(repo)) => self.set_repo(repo),
            Err(e) => self.found = Found::Failed(Problem::failed(&e)),
        }
    }

    /// Reads the open folder, finds the repository when needed, and says
    /// whether there is work. The fast path (nothing due, nothing asked, the
    /// folder as before) runs no Git command.
    fn prepare(&mut self, session: &Mutex<Session>, now: Now, asked: bool) -> Option<Ready> {
        let target = match lock(session) {
            Ok(guard) => guard.git_target(),
            Err(p) => {
                self.found = Found::Failed(p);
                return None;
            }
        };
        let Some((root, generation, settings)) = target.filter(|t| t.2.enabled) else {
            self.reset_off();
            return None;
        };
        let same = self.known.as_ref().is_some_and(|k| {
            k.root == root && k.generation == generation && k.settings == settings
        });
        let mut fresh = false;
        if !same {
            self.schedule = Schedule::new(&settings, now.ms);
            self.known = Some(Known {
                root: root.clone(),
                generation,
                settings,
            });
            self.stopped = false;
            self.sticky = None;
            self.problem = None;
            self.refused_once = false;
            self.locked_since = None;
            self.discover(&root);
            fresh = true;
        }
        let due = self.schedule.due(now.ms);
        let wanted = asked || due.commit || due.pull;
        if !matches!(self.found, Found::Repo(_)) {
            if wanted {
                // Without a repository nothing is committed or pulled; a
                // repository made or a Git installed since is noticed here.
                if !fresh {
                    self.discover(&root);
                }
                self.schedule.committed();
                self.schedule.pulled(now.ms);
            }
            if !matches!(self.found, Found::Repo(_)) {
                return None;
            }
        }
        if !wanted {
            return None;
        }
        let Found::Repo(repo) = &self.found else {
            return None;
        };
        Some(Ready {
            repo: (**repo).clone(),
            generation,
            due,
        })
    }

    /// A problem that does not stop syncing; it is cleared by the next step.
    fn flag(&mut self, p: Problem) {
        self.problem = Some(p);
    }

    /// A problem that stops pulls and pushes until a click.
    fn stop_with(&mut self, p: Problem) {
        self.stopped = true;
        self.sticky = Some(p);
    }

    /// A failed fetch or push: an SSH key problem stops pulls and pushes until
    /// a click (every try would wait out the limit); the rest is tried again.
    fn net_problem(&mut self, p: Problem) {
        match p {
            Problem::SshKey { .. } => self.stop_with(p),
            p => self.flag(p),
        }
    }

    /// A step found `index.lock` held. Quiet at first; once it has blocked
    /// Breccia for a while (a Git that crashed or was killed leaves it
    /// behind) it is shown red. Breccia never deletes it.
    fn on_lock(&mut self, now: Now) {
        let since = *self.locked_since.get_or_insert(now.ms);
        if now.ms - since >= LOCK_PATIENCE_MS {
            self.flag(Problem::Locked);
        }
    }

    /// A failed pull step: a conflict and its like stop syncing. A rebase that
    /// Git refused to start is tried once more shortly (the cause is usually a
    /// write by another program that is over by then), quietly; a second
    /// refusal in a row stops syncing.
    fn pull_problem(&mut self, p: Problem, now: Now, retrying: bool) {
        match p {
            Problem::RebaseRefused { .. } if !retrying => {
                self.refused_once = true;
                self.schedule.pull_at(now.ms + REFUSED_RETRY_MS);
            }
            Problem::RebaseRefused { .. } => self.stop_with(p),
            Problem::Conflict { .. } | Problem::DirtyOutside { .. } | Problem::Failed { .. } => {
                self.stop_with(p)
            }
            p => self.flag(p),
        }
    }

    fn guard(repo: &Repo) -> Result<String, Problem> {
        if let Some(b) = repo.busy().map_err(|e| Problem::failed(&e))? {
            return Err(Problem::Busy {
                what: b.name().into(),
            });
        }
        match repo.head().map_err(|e| Problem::failed(&e))? {
            HeadState::Branch(name) | HeadState::Unborn(name) => Ok(name),
            HeadState::Detached => Err(Problem::Detached),
        }
    }

    /// The changes in the notes folder, committed. `Ok(None)`: nothing to commit.
    fn commit_changes(repo: &Repo) -> Result<Option<String>, Stop> {
        let changes = repo.changes().map_err(|e| {
            if is_lock(&e) {
                Stop::Locked
            } else {
                Stop::Problem(Problem::failed(&e))
            }
        })?;
        if changes.is_empty() {
            return Ok(None);
        }
        repo.commit_with(commit_message).map_err(|e| {
            if is_lock(&e) {
                Stop::Locked
            } else {
                Stop::Problem(Problem::CommitRefused {
                    message: first_line(&e),
                })
            }
        })
    }

    /// Saves what could not be saved, then commits the folder. Pages the
    /// retry saved after a failed save are reported in an `Output.saved`.
    fn commit_step(
        &mut self,
        cx: &Ctx,
        outputs: &mut Vec<(u64, Output)>,
    ) -> Result<Option<String>, Stop> {
        let saved = {
            let mut session = lock(cx.session).map_err(Stop::Problem)?;
            session.retry_saves();
            session.take_saved()
        };
        if !saved.is_empty() {
            outputs.push((
                cx.generation,
                Output {
                    saved,
                    ..Output::default()
                },
            ));
        }
        match cx.repo.identity_ok() {
            Ok(true) => {}
            Ok(false) => return Err(Stop::Problem(Problem::Identity)),
            Err(e) => return Err(Stop::Problem(Problem::failed(&e))),
        }
        Self::commit_changes(cx.repo)
    }

    fn work(
        &mut self,
        session: &Mutex<Session>,
        now: Now,
        ready: Ready,
        mode: Mode,
        outputs: &mut Vec<(u64, Output)>,
    ) {
        let Ready {
            repo,
            generation,
            due,
        } = ready;
        self.problem = None;
        let pull_due = match mode {
            Mode::Tick => due.pull,
            Mode::Sync => true,
            Mode::Close | Mode::Init => false,
        };
        // Every attempt counts, also one that cannot run or fails.
        if pull_due {
            self.schedule.pulled(now.ms);
        }
        // A pull attempt uses up the mark of a refusal: only a refusal of this
        // attempt sets it again, so a retry that ends otherwise (offline, a
        // held lock) makes a later refusal a first one again.
        let retrying = pull_due && std::mem::take(&mut self.refused_once);
        let cx = Ctx {
            session,
            now,
            repo: &repo,
            generation,
            retrying,
        };
        let refresh = self.work_inner(&cx, due, mode, pull_due, outputs);
        Self::drop_stale_saved(session, outputs);
        if self.repository_vanished() {
            // The `.git` folder was deleted: start over from "not in Git"
            // instead of showing Git's own complaint.
            if let Some(root) = self.known.as_ref().map(|k| k.root.clone()) {
                self.problem = None;
                self.sticky = None;
                self.stopped = false;
                self.discover(&root);
            }
            return;
        }
        if refresh {
            self.refresh(&cx);
        }
    }

    /// The step's outputs go out only after it ends, a fetch and a push after
    /// the retry saved a page. A page whose save failed again meanwhile, or a
    /// folder switched since, must not have its notice cleared by them.
    fn drop_stale_saved(session: &Mutex<Session>, outputs: &mut Vec<(u64, Output)>) {
        if outputs.iter().all(|(_, o)| o.saved.is_empty()) {
            return;
        }
        let guard = lock(session).ok();
        outputs.retain_mut(|(generation, o)| {
            if o.saved.is_empty() {
                return true;
            }
            match &guard {
                Some(g) => g.retain_saved(*generation, &mut o.saved),
                None => o.saved.clear(),
            }
            // The retry's own output carried nothing else: drop it whole.
            !o.saved.is_empty() || !o.is_empty()
        });
    }

    /// Whether the step's problem says Git no longer finds the repository.
    fn repository_vanished(&self) -> bool {
        [&self.problem, &self.sticky].into_iter().flatten().any(
            |p| matches!(p, Problem::Failed { message } if message.contains("not a git repository")),
        )
    }

    /// Returns whether the view should be refreshed from the repository.
    fn work_inner(
        &mut self,
        cx: &Ctx,
        due: Due,
        mode: Mode,
        pull_due: bool,
        outputs: &mut Vec<(u64, Output)>,
    ) -> bool {
        let Ctx { now, repo, .. } = *cx;
        // A commit that cannot be made is tried again after a pause, not at
        // every tick.
        let retry_later = |this: &mut GitEngine| {
            if due.commit {
                this.schedule.changed(now.ms);
            }
        };
        let branch = match Self::guard(repo) {
            Ok(b) => b,
            Err(p) => {
                self.flag(p);
                retry_later(self);
                return false;
            }
        };
        self.target = match repo.target(&branch) {
            Ok(Ok(t)) => t,
            Ok(Err(p)) => {
                self.stop_with(p);
                None
            }
            Err(e) => {
                self.flag(Problem::failed(&e));
                None
            }
        };
        let committed = match self.commit_step(cx, outputs) {
            Ok(hash) => {
                self.locked_since = None;
                self.schedule.committed();
                if hash.is_some() {
                    self.need_dates = true;
                }
                hash
            }
            Err(Stop::Locked) => {
                self.on_lock(now);
                return false;
            }
            Err(Stop::Problem(p)) => {
                self.flag(p);
                retry_later(self);
                return true;
            }
        };
        let Some(t) = self.target.clone() else {
            return true;
        };
        if self.stopped {
            return true;
        }
        let net = Repo {
            git: if mode == Mode::Sync {
                repo.git.clone()
            } else {
                // A timer must not open a sign-in window.
                repo.git.clone().with_env("GCM_INTERACTIVE", "never")
            },
            ..repo.clone()
        };
        let pulling = pull_due && mode != Mode::Init;
        if pulling && !self.fetch_integrate(cx, &net, &t, outputs) {
            return true;
        }
        let push = pulling || mode == Mode::Close || committed.is_some();
        if push && mode != Mode::Init {
            self.push_if_ahead(cx, &net, &t, mode != Mode::Close, outputs);
        }
        true
    }

    /// Fetches (no lock), then rebases under the lock and reloads what the pull
    /// changed. Returns whether it worked; a problem is already recorded.
    fn fetch_integrate(
        &mut self,
        cx: &Ctx,
        net: &Repo,
        t: &Target,
        outputs: &mut Vec<(u64, Output)>,
    ) -> bool {
        if let Err(p) = net.fetch(t) {
            self.net_problem(p);
            return false;
        }
        #[cfg(feature = "test-seams")]
        if let Some(hook) = self.after_fetch.as_mut() {
            hook();
        }
        // Saves that landed during the fetch are committed here, without the
        // lock (a save is an atomic rename, so Git reads a whole file), so the
        // locked part below normally finds nothing left to commit.
        match Self::commit_changes(cx.repo) {
            Ok(hash) => self.need_dates |= hash.is_some(),
            Err(Stop::Locked) => {
                self.on_lock(cx.now);
                return false;
            }
            Err(Stop::Problem(p)) => {
                self.flag(p);
                return false;
            }
        }
        #[cfg(feature = "test-seams")]
        if let Some(hook) = self.before_lock.as_mut() {
            hook();
        }
        match self.integrate_locked(cx, t, outputs) {
            Ok(()) => {
                self.last_sync = Some(cx.now.ms);
                true
            }
            Err(Stop::Locked) => {
                self.on_lock(cx.now);
                false
            }
            Err(Stop::Problem(p)) => {
                self.pull_problem(p, cx.now, cx.retrying);
                false
            }
        }
    }

    /// The local part of a pull. The lock is held from the commit of what a
    /// save left behind during the fetch, over the rebase, to the reload.
    fn integrate_locked(
        &mut self,
        cx: &Ctx,
        t: &Target,
        outputs: &mut Vec<(u64, Output)>,
    ) -> Result<(), Stop> {
        let Ctx {
            session,
            now,
            repo,
            generation,
            ..
        } = *cx;
        let mut guard = lock(session).map_err(Stop::Problem)?;
        let held = Instant::now();
        // The folder was switched during the fetch: leave the old one as it is.
        if !matches!(guard.git_target(), Some((_, g, _)) if g == generation) {
            return Ok(());
        }
        // A save during the fetch left a tracked file modified, and a rebase
        // refuses to start then. Saves only happen under this lock, so the
        // tree stays clean from here to the end of the rebase.
        if Self::commit_changes(repo)?.is_some() {
            self.need_dates = true;
        }
        #[cfg(feature = "test-seams")]
        if let Some(hook) = self.before_rebase.as_mut() {
            hook();
        }
        let done = repo.integrate(t).map_err(Stop::Problem)?;
        if !done.changed.is_empty() {
            let mut paths: Vec<PathBuf> = Vec::new();
            for path in &done.changed {
                paths.push(path.clone());
                // A deleted folder is reported through its files; the folder
                // itself must be told too, or it stays in the tree.
                for dir in path.ancestors().skip(1) {
                    if dir.as_os_str().is_empty() || repo.folder.join(dir).exists() {
                        break;
                    }
                    if !paths.iter().any(|p| p == dir) {
                        paths.push(dir.to_path_buf());
                    }
                }
            }
            let request = Request {
                generation,
                command: Command::FilesChanged { paths },
            };
            match guard.run(request, now.clock) {
                Ok(mut out) => {
                    // The pull may have brought another machine's settings
                    // (boards, states): they are used and sent on, so a later
                    // board edit does not write the old ones back.
                    // `files.changed` has already followed `breccia/config.toml`
                    // among the pulled paths, so this second read usually finds
                    // nothing new and must not wipe what that one set.
                    match guard.reload_config() {
                        Ok(Some(config)) => out.config = Some(config),
                        Ok(None) => {}
                        Err(message) => {
                            let warned = out.notices.iter().any(|n| {
                                matches!(n, Notice::LoadWarning { message } if message.contains(layout::CONFIG_REL))
                            });
                            if !warned {
                                out.notices.push(Notice::LoadWarning {
                                    message: format!(
                                        "breccia/config.toml from Git cannot be read ({message}); the old settings stay in use"
                                    ),
                                });
                            }
                        }
                    }
                    outputs.push((generation, out));
                }
                Err(e) => {
                    return Err(Stop::Problem(Problem::Failed {
                        message: format!("could not reload the pulled files: {}", e.message),
                    }));
                }
            }
        }
        if done.moved {
            self.need_dates = true;
        }
        self.locked_for = Some(held.elapsed());
        Ok(())
    }

    /// Pushes when the remote lacks commits of the folder. A remote that
    /// moved is fetched and integrated once more, unless `may_pull` is false
    /// (at close: never a pull, so no rebase can be cut short by the exit).
    fn push_if_ahead(
        &mut self,
        cx: &Ctx,
        net: &Repo,
        t: &Target,
        may_pull: bool,
        outputs: &mut Vec<(u64, Output)>,
    ) {
        match cx.repo.ahead(&t.remote) {
            Ok(0) => return,
            Ok(_) => {}
            Err(e) => return self.flag(Problem::failed(&e)),
        }
        for attempt in 0..2 {
            match net.push(t) {
                Ok(Pushed::Done) => {
                    self.last_sync = Some(cx.now.ms);
                    self.need_dates = true;
                    return;
                }
                Ok(Pushed::Rejected) if attempt == 0 && may_pull => {
                    if !self.fetch_integrate(cx, net, t, outputs) {
                        return;
                    }
                }
                Ok(Pushed::Rejected) => {
                    let message = if may_pull {
                        "the remote changed again while pushing"
                    } else {
                        "the remote has newer changes, not pushed"
                    };
                    return self.flag(Problem::Unreachable {
                        message: message.into(),
                    });
                }
                Err(p) => return self.net_problem(p),
            }
        }
    }

    /// Brings the view's facts up to date after a step.
    fn refresh(&mut self, cx: &Ctx) {
        let Ctx {
            session,
            repo,
            generation,
            ..
        } = *cx;
        self.view.top = Some(repo.top.clone());
        self.view.remote = self.target.as_ref().map(|t| t.remote.clone());
        self.view.ahead = self
            .target
            .as_ref()
            .and_then(|t| repo.ahead(&t.remote).ok())
            .unwrap_or(0);
        self.view.head = repo.head_hash().ok().flatten();
        self.view.last_commit = repo.last_commit_ms().ok().flatten();
        self.view.last_sync = self.last_sync;
        if self.need_dates
            && let Ok(dates) = repo.created_dates()
        {
            match lock(session) {
                Ok(mut guard) => {
                    guard.set_git_created(generation, dates);
                    self.need_dates = false;
                }
                Err(p) => self.flag(p),
            }
        }
    }
}
