//! The settings as values: the states, boards and Git settings, their defaults and their rules.

use std::ops::RangeInclusive;

use serde::Deserialize;
use toml_edit::DocumentMut;

use super::ConfigError;
use super::file::match_boards;

/// The colour names a state may use (the frontend maps each to a theme token).
pub const PALETTE: [&str; 8] = [
    "grey", "amber", "violet", "green", "dim", "blue", "red", "teal",
];

/// A number in `config.toml` outside its range, read as its default (the file is not changed).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Replaced {
    /// `"[git] commit_delay_minutes"`, `"[git] pull_interval_minutes"` or `"[board] archive_after_days"`.
    pub key: &'static str,
    /// The number as written.
    pub value: i64,
    pub range: RangeInclusive<u32>,
    pub default: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct State {
    pub keyword: String,
    /// Palette name: one of `grey amber violet green dim blue red teal`.
    #[serde(default = "default_color")]
    pub color: String,
    #[serde(default)]
    pub finished: bool,
    #[serde(default)]
    pub in_cycle: bool,
}

fn default_color() -> String {
    "grey".to_string()
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct Board {
    pub name: String,
    /// State keywords; not validated here.
    #[serde(default)]
    pub columns: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(default)]
pub struct BoardSettings {
    pub archive_after_days: u32,
    /// Finished tasks done more than `archive_after_days` ago are archived by
    /// themselves.
    pub auto_archive: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(default)]
pub struct GitSettings {
    pub enabled: bool,
    pub commit_delay_minutes: u32,
    pub pull_interval_minutes: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(default)]
pub struct Config {
    pub states: Vec<State>,
    pub boards: Vec<Board>,
    pub board: BoardSettings,
    pub git: GitSettings,
}

/// State `i` has a valid keyword that no earlier state has.
fn check_keyword(states: &[State], i: usize) -> Result<(), ConfigError> {
    let keyword = &states[i].keyword;
    if !valid_keyword(keyword) {
        return Err(ConfigError::InvalidKeyword(keyword.clone()));
    }
    if states[..i].iter().any(|p| &p.keyword == keyword) {
        return Err(ConfigError::DuplicateState(keyword.clone()));
    }
    Ok(())
}

impl GitSettings {
    pub const MAX_MINUTES: u32 = 1440;
    pub const MINUTES: RangeInclusive<u32> = 0..=Self::MAX_MINUTES;

    pub fn check(&self) -> Result<(), ConfigError> {
        if !Self::MINUTES.contains(&self.commit_delay_minutes)
            || !Self::MINUTES.contains(&self.pull_interval_minutes)
        {
            return Err(ConfigError::InvalidSetting(
                "the minutes must be at most 1440 (one day)",
            ));
        }
        Ok(())
    }
}

impl BoardSettings {
    pub const DAYS: RangeInclusive<u32> = 1..=3650;

    pub fn check(&self) -> Result<(), ConfigError> {
        if !Self::DAYS.contains(&self.archive_after_days) {
            return Err(ConfigError::InvalidSetting(
                "archive after days must be between 1 and 3650",
            ));
        }
        Ok(())
    }
}

impl Default for BoardSettings {
    fn default() -> Self {
        BoardSettings {
            archive_after_days: 14,
            auto_archive: true,
        }
    }
}

impl Default for GitSettings {
    fn default() -> Self {
        GitSettings {
            enabled: true,
            commit_delay_minutes: 5,
            pull_interval_minutes: 5,
        }
    }
}

fn state(keyword: &str, color: &str, finished: bool, in_cycle: bool) -> State {
    State {
        keyword: keyword.into(),
        color: color.into(),
        finished,
        in_cycle,
    }
}

impl Default for Config {
    fn default() -> Self {
        Config {
            states: vec![
                state("TODO", "grey", false, true),
                state("DOING", "amber", false, true),
                state("WAITING", "violet", false, false),
                state("DONE", "green", true, true),
            ],
            boards: vec![Board {
                name: "Tasks".into(),
                columns: ["TODO", "DOING", "WAITING", "DONE"]
                    .map(String::from)
                    .to_vec(),
            }],
            board: BoardSettings::default(),
            git: GitSettings::default(),
        }
    }
}

pub(super) const DEFAULT_TOML: &str = r#"[[states]]
keyword = "TODO"
color = "grey"
finished = false
in_cycle = true

[[states]]
keyword = "DOING"
color = "amber"
finished = false
in_cycle = true

[[states]]
keyword = "WAITING"
color = "violet"
finished = false
in_cycle = false

[[states]]
keyword = "DONE"
color = "green"
finished = true
in_cycle = true

[[boards]]
name = "Tasks"
columns = ["TODO", "DOING", "WAITING", "DONE"]

[board]
archive_after_days = 14
auto_archive = true

[git]
enabled = true
commit_delay_minutes = 5
pull_interval_minutes = 5
"#;

fn valid_keyword(k: &str) -> bool {
    let mut chars = k.chars();
    matches!(chars.next(), Some('A'..='Z'))
        && chars.all(|c| matches!(c, 'A'..='Z' | '0'..='9' | '_'))
}

impl Config {
    /// Like [`parse_reporting`](Config::parse_reporting), without the records.
    pub fn parse(s: &str) -> Result<Config, ConfigError> {
        Config::parse_reporting(s).map(|(c, _)| c)
    }

    /// Parses `s`; a whole number outside its range (`[git]` minutes, `[board] archive_after_days`) is read as its
    /// default and reported. The text is never changed. Other errors are those of the plain parse.
    pub fn parse_reporting(s: &str) -> Result<(Config, Vec<Replaced>), ConfigError> {
        let plain = |text: &str| -> Result<Config, ConfigError> {
            let config: Config =
                toml::from_str(text).map_err(|e| ConfigError::Toml(e.to_string()))?;
            config.validate()?;
            Ok(config)
        };
        let Ok(mut doc) = s.parse::<DocumentMut>() else {
            return plain(s).map(|c| (c, Vec::new()));
        };
        let records = super::range::replace_out_of_range(&mut doc);
        if records.is_empty() {
            return plain(s).map(|c| (c, records));
        }
        plain(&doc.to_string()).map(|c| (c, records))
    }

    /// Names trimmed non-blank and unique ignoring case; columns non-empty,
    /// configured states, no repeats. A column whose state is no longer configured
    /// (skipped and named, not shown) is accepted on the board that already had it (`self.boards`, matched by name,
    /// or by place for a rename), so it does not block edits to other boards.
    pub fn check_boards(&self, boards: &[Board]) -> Result<(), ConfigError> {
        let bad = |m: String| Err(ConfigError::InvalidBoard(m));
        let names: Vec<String> = self.boards.iter().map(|b| b.name.clone()).collect();
        let matched = match_boards(&names, boards);
        for (i, b) in boards.iter().enumerate() {
            let had = |c: &String| matched[i].is_some_and(|j| self.boards[j].columns.contains(c));
            let name = b.name.trim();
            if name.is_empty() {
                return bad("a board needs a name".into());
            }
            if boards[..i]
                .iter()
                .any(|p| p.name.trim().to_lowercase() == name.to_lowercase())
            {
                return bad(format!("duplicate board name: {name}"));
            }
            if b.columns.is_empty() {
                return bad(format!("board {name} has no columns"));
            }
            for (j, c) in b.columns.iter().enumerate() {
                if self.state(c).is_none() && !had(c) {
                    return bad(format!("board {name}: unknown state {c}"));
                }
                if b.columns[..j].contains(c) {
                    return bad(format!("board {name}: repeated column {c}"));
                }
            }
        }
        Ok(())
    }

    /// Checks `states` before [`write_states`](Config::write_states): at least one,
    /// valid and unique keywords, and a palette colour. A colour is checked only for
    /// a new state and for a state whose colour differs from the one the same
    /// keyword has in `current` (renames already applied), so a hand-written colour
    /// outside the palette never blocks later changes.
    pub fn check_states(states: &[State], current: &[State]) -> Result<(), ConfigError> {
        if states.is_empty() {
            return Err(ConfigError::NoStates);
        }
        for (i, s) in states.iter().enumerate() {
            check_keyword(states, i)?;
            let kept = current
                .iter()
                .any(|c| c.keyword == s.keyword && c.color == s.color);
            if !kept && !PALETTE.contains(&s.color.as_str()) {
                return Err(ConfigError::InvalidState(format!(
                    "unknown colour {} for {}",
                    s.color, s.keyword
                )));
            }
        }
        Ok(())
    }

    pub fn default_toml() -> &'static str {
        DEFAULT_TOML
    }

    pub fn state(&self, keyword: &str) -> Option<&State> {
        self.states.iter().find(|s| s.keyword == keyword)
    }

    /// The in-cycle state after `current` in list order (the first one from `None`, or from a keyword that is not
    /// configured), wrapping from the last to the first: a state outside the cycle goes on to the next in-cycle state
    /// after it. Cycling never leads to "no state"; `None` only when no state is in the cycle.
    pub fn cycle_next(&self, current: Option<&str>) -> Option<&State> {
        let start = current
            .and_then(|k| self.states.iter().position(|s| s.keyword == k))
            .map_or(0, |i| i + 1);
        self.states[start..]
            .iter()
            .find(|s| s.in_cycle)
            .or_else(|| self.states.iter().find(|s| s.in_cycle))
    }

    fn validate(&self) -> Result<(), ConfigError> {
        if self.states.is_empty() {
            return Err(ConfigError::NoStates);
        }
        for i in 0..self.states.len() {
            check_keyword(&self.states, i)?;
        }
        Ok(())
    }
}
