//! Git through the user's installed `git` command. No Git library, no global
//! state: callers build a [`Git`] and pass it around.

mod commit;
mod engine;
mod log;
mod message;
mod repo;
mod run;
mod schedule;
mod sync;
mod view;

pub use commit::{GITATTRIBUTES, GITIGNORE, TMP_EXCLUDE, init};
pub use engine::{GitEngine, Now, Step};
pub use log::{GitLogView, LogEntry};
pub use message::{Change, SUBJECT_MAX, commit_message};
pub use repo::{Busy, Discovered, HeadState, Repo, classify_discover, discover};
pub use run::{Git, GitError, GitOut, LOCAL_LIMIT, NETWORK_LIMIT, run_limited, without_auto_gc};
pub use schedule::{Due, Schedule};
pub use sync::{Integrated, Problem, Pushed, Target, is_ssh_url};
pub use view::{GitState, GitView, ProblemView};
