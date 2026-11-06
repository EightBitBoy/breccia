//! When to commit and when to pull. Pure: the caller passes the time.

use crate::config::GitSettings;

const MINUTE_MS: i64 = 60_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Due {
    pub commit: bool,
    pub pull: bool,
}

#[derive(Clone, Debug)]
pub struct Schedule {
    /// `None`: no timer, a commit happens on a pull, a click or at close.
    delay: Option<i64>,
    /// `None`: pull only at start and on a click.
    interval: Option<i64>,
    last_change: Option<i64>,
    next_pull: Option<i64>,
}

fn minutes(m: u32) -> Option<i64> {
    (m > 0).then(|| i64::from(m) * MINUTE_MS)
}

impl Schedule {
    /// The first pull is due at `now`, whatever the interval.
    pub fn new(settings: &GitSettings, now: i64) -> Schedule {
        Schedule {
            delay: minutes(settings.commit_delay_minutes),
            interval: minutes(settings.pull_interval_minutes),
            last_change: None,
            next_pull: Some(now),
        }
    }

    /// A change happened (or a commit has to be tried again later): the wait restarts.
    pub fn changed(&mut self, now: i64) {
        self.last_change = Some(now);
    }

    pub fn due(&self, now: i64) -> Due {
        let commit = match (self.last_change, self.delay) {
            (Some(at), Some(delay)) => now >= at + delay,
            _ => false,
        };
        let pull = self.next_pull.is_some_and(|at| now >= at);
        Due { commit, pull }
    }

    pub fn committed(&mut self) {
        self.last_change = None;
    }

    /// The next pull is due at `at`, whatever the interval says (a pull that
    /// was refused is tried once more shortly).
    pub fn pull_at(&mut self, at: i64) {
        self.next_pull = Some(at);
    }

    /// After every pull attempt: the next one is an interval later, or never.
    pub fn pulled(&mut self, now: i64) {
        self.next_pull = self.interval.map(|i| now + i);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn commits_wait_for_the_pause_and_pulls_repeat() {
        let s5 = GitSettings {
            enabled: true,
            commit_delay_minutes: 5,
            pull_interval_minutes: 5,
        };
        let min = 60_000;
        let mut s = Schedule::new(&s5, 0);
        assert_eq!(
            s.due(0),
            Due {
                commit: false,
                pull: true
            }
        ); // pull at start
        s.pulled(0);
        s.changed(min);
        s.changed(3 * min); // a new change restarts the wait
        assert!(!s.due(7 * min).commit);
        assert!(s.due(8 * min).commit);
        s.committed();
        assert!(!s.due(9 * min).commit);
        assert!(s.due(5 * min).pull && !s.due(4 * min).pull);
        // 0: no timers; the pull at start still happens once
        let mut off = Schedule::new(
            &GitSettings {
                commit_delay_minutes: 0,
                pull_interval_minutes: 0,
                ..s5
            },
            0,
        );
        assert!(off.due(0).pull);
        off.pulled(0);
        off.changed(min);
        assert_eq!(
            off.due(1000 * min),
            Due {
                commit: false,
                pull: false
            }
        );
    }

    #[test]
    fn pull_at_makes_a_pull_due_then() {
        let s5 = GitSettings {
            enabled: true,
            commit_delay_minutes: 5,
            pull_interval_minutes: 5,
        };
        let mut s = Schedule::new(&s5, 0);
        s.pulled(0);
        assert!(!s.due(1000).pull);
        s.pull_at(11_000);
        assert!(!s.due(1000).pull);
        assert!(s.due(11_000).pull);
    }
}
