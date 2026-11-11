//! The settings commands: `config.get`, `boards.set`, `states.usage`,
//! `states.set`, `config.setGit` and `config.setBoard`, and reading
//! `breccia/config.toml` again. Every write goes through
//! [`Session::config_guard`], then [`Session::write_config`].

use crate::config::{Board, BoardSettings, Config, GitSettings, State};

use super::command::{StateInput, StateRename};
use super::view::{CommandError, ConfigView, Notice, Output, PageView};
use super::{DiskMark, Session};

impl Session {
    /// Reads `breccia/config.toml` again if its text is not what the session
    /// last read or wrote. `Ok(Some)`: the new settings are in use. `Err`: it
    /// changed but cannot be read; the old settings stay, and `boards.set` is
    /// refused until it can, so the file is never written over.
    pub fn reload_config(&mut self) -> Result<Option<ConfigView>, String> {
        let Some(ws) = self.ws.as_mut() else {
            return Ok(None);
        };
        let text = Config::read_text(&ws.root).map_err(|e| e.to_string())?;
        if text == ws.config_text {
            return Ok(None);
        }
        let config = match &text {
            Some(t) => Config::parse(t).map_err(|e| e.to_string())?,
            None => Config::default(),
        };
        ws.config = config;
        ws.config_text = text;
        self.config_version += 1;
        Ok(Some(ConfigView::of(&ws.config, self.config_version)))
    }

    pub(super) fn config_output(&self) -> Result<Output, CommandError> {
        Ok(Output {
            config: Some(ConfigView::of(&self.ws()?.config, self.config_version)),
            ..Output::default()
        })
    }

    pub(super) fn boards_set(
        &mut self,
        boards: &[Board],
        version: u64,
    ) -> Result<Output, CommandError> {
        // The list was made from the boards the session knows. If the
        // file changed since (a pull, an editor), writing it would put
        // them back over the new ones (spec §2).
        self.config_guard(version)?;
        self.ws()?
            .config
            .check_boards(boards)
            .map_err(|e| CommandError::new("invalidBoard", e))?;
        self.write_config(|root, expect| Config::write_boards(root, expect, boards))?;
        self.config_output()
    }

    pub(super) fn states_usage(&self) -> Result<Output, CommandError> {
        let ws = self.ws()?;
        Ok(Output {
            usage: Some(ws.state_usage()),
            usage_skipped: Some(ws.skipped_count()),
            ..Output::default()
        })
    }

    /// `config.setGit`: the limits are checked first, before the guard.
    pub(super) fn config_set_git(
        &mut self,
        git: GitSettings,
        version: u64,
    ) -> Result<Output, CommandError> {
        git.check()
            .map_err(|e| CommandError::new("invalidSetting", e.to_string()))?;
        self.config_guard(version)?;
        self.write_config(|root, expect| Config::write_git(root, expect, &git))?;
        self.config_output()
    }

    /// `config.setBoard`: the limit is checked first, on a value that needs no
    /// folder, so with none open the answer is still `invalidSetting`.
    /// `auto_archive` left out keeps the switch as it is.
    pub(super) fn config_set_board(
        &mut self,
        archive_after_days: u32,
        auto_archive: Option<bool>,
        version: u64,
    ) -> Result<Output, CommandError> {
        BoardSettings {
            archive_after_days,
            auto_archive: false,
        }
        .check()
        .map_err(|e| CommandError::new("invalidSetting", e.to_string()))?;
        self.config_guard(version)?;
        let current = self.ws()?.config.board.auto_archive;
        let board = BoardSettings {
            archive_after_days,
            auto_archive: auto_archive.unwrap_or(current),
        };
        self.write_config(|root, expect| Config::write_board_settings(root, expect, &board))?;
        self.config_output()
    }

    /// `states.set`: the guard, the checks, the config write, then the rename of
    /// each changed keyword in the notes. A failure before the write changes nothing.
    pub(super) fn states_set(
        &mut self,
        inputs: Vec<StateInput>,
        renames: Vec<StateRename>,
        version: u64,
    ) -> Result<Output, CommandError> {
        self.config_guard(version)?;
        let invalid = |e: String| CommandError::new("invalidState", e);
        let ws = self.ws()?;
        let new: Vec<State> = inputs
            .into_iter()
            .map(|s| State {
                keyword: s.keyword,
                color: s.color,
                finished: s.finished,
                in_cycle: s.in_cycle,
            })
            .collect();
        // The current states under their new keywords, so a colour already in
        // the file is accepted even if it is not in the palette.
        let current: Vec<State> = ws
            .config
            .states
            .iter()
            .map(|s| {
                let mut s = s.clone();
                if let Some(r) = renames.iter().find(|r| r.from == s.keyword) {
                    s.keyword = r.to.clone();
                }
                s
            })
            .collect();
        Config::check_states(&new, &current).map_err(|e| invalid(e.to_string()))?;
        for (i, r) in renames.iter().enumerate() {
            let ok = ws.config.state(&r.from).is_some()
                && !new.iter().any(|s| s.keyword == r.from)
                && new.iter().any(|s| s.keyword == r.to)
                && ws.config.state(&r.to).is_none()
                && !renames[..i]
                    .iter()
                    .any(|p| p.from == r.from || p.to == r.to);
            if !ok {
                return Err(invalid(format!("cannot rename {} to {}", r.from, r.to)));
            }
        }
        let pairs: Vec<(String, String)> = renames
            .iter()
            .map(|r| (r.from.clone(), r.to.clone()))
            .collect();
        self.write_config(|root, expect| Config::write_states(root, expect, &new, &pairs))?;
        let ws = self.ws_mut()?;
        let mut rewritten: Vec<String> = Vec::new();
        let mut notices: Vec<Notice> = Vec::new();
        for r in &renames {
            let report = ws.rename_state(&r.from, &r.to);
            for key in report.rewritten {
                if !rewritten.contains(&key) {
                    rewritten.push(key);
                }
            }
            for (key, e) in &report.save_errors {
                notices.push(Notice::save_failed(key, e));
            }
        }
        // A rename is not an undo step: undo across it would bring the old
        // keyword back over the new config.
        for key in &rewritten {
            self.history.remove(key);
        }
        let ws = self.ws.as_ref().ok_or_else(CommandError::no_folder)?;
        self.marks.retain(|&id, m| match m {
            DiskMark::Changed { .. } => ws
                .locate(id)
                .is_none_or(|(p, _)| !rewritten.contains(&p.key)),
            DiskMark::Removed { page, .. } => !rewritten.contains(page),
        });
        let changed = rewritten
            .iter()
            .filter_map(|k| ws.page(k))
            .map(|p| PageView::of(p, ws))
            .collect();
        Ok(Output {
            config: Some(ConfigView::of(&ws.config, self.config_version)),
            changed,
            notices,
            ..Output::default()
        })
    }
}
