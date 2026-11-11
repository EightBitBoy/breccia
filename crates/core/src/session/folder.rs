//! The open folder: `folder.open`, `folder.create`, recovery after a panic, and
//! `files.changed`, the changes other programs made to files.

use std::path::{Path, PathBuf};

use crate::layout;
use crate::workspace::{SaveError, Workspace};

use super::search::IndexState;
use super::view::{CommandError, FolderView, Notice, Output, PageView, RenameView};
use super::{DiskMark, Session};

/// What [`Session::recover`] did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Recovery {
    /// The open folder was read again from disk; block ids of before are stale.
    Reopened { generation: u64 },
    /// Some page holds edits its file does not, so nothing was changed.
    Kept,
    /// No folder is open (none was, or it could not be opened again).
    NoFolder,
}

impl Session {
    pub(super) fn folder_open(&mut self, path: &Path) -> Result<Output, CommandError> {
        self.refuse_unsaved_switch()?;
        // A folder deleted (or a file) never opens as an empty phantom folder.
        if !path.is_dir() {
            return Err(CommandError::new(
                "folderMissing",
                format_args!("This folder no longer exists: {}", path.display()),
            ));
        }
        self.open_folder(path)
    }

    pub(super) fn folder_create(&mut self, path: &Path) -> Result<Output, CommandError> {
        self.refuse_unsaved_switch()?;
        let ws = Workspace::create(path).map_err(|e| CommandError::new("create", e))?;
        Ok(self.replace_folder(ws, Vec::new()))
    }

    /// Journal days with a block whose topic's color, existence or alias
    /// changed travel with the command, unless the folder was switched
    /// (the changes then belong to another folder, or to a fresh one).
    pub(super) fn resend_journals(&mut self, out: &mut Output, before: Option<u64>) {
        let generation = self.generation;
        let Some(ws) = self.ws.as_mut() else {
            return;
        };
        let changes = ws.take_topic_changes();
        if before != Some(generation) || changes.is_empty() {
            return;
        }
        for key in ws.journals_linking(&changes) {
            let sent = out.page.as_ref().is_some_and(|p| p.key == key)
                || out.changed.iter().any(|p| p.key == key)
                || out.removed.contains(&key);
            if let (false, Some(page)) = (sent, ws.page(&key)) {
                out.changed.push(PageView::of(page, ws));
            }
        }
    }

    /// The generation, tree version and link version, while a folder is open.
    pub(super) fn tree_state(&self) -> Option<(u64, u64, u64)> {
        self.ws
            .as_ref()
            .map(|ws| (self.generation, ws.tree_version(), ws.link_version()))
    }

    /// Switching folders drops the open pages from memory, so it is refused
    /// while any of them holds text its file does not.
    fn refuse_unsaved_switch(&self) -> Result<(), CommandError> {
        let Some(ws) = self.ws.as_ref() else {
            return Ok(());
        };
        let titles: Vec<&str> = ws.unsaved().iter().map(|p| p.name.as_str()).collect();
        if titles.is_empty() {
            return Ok(());
        }
        Err(CommandError::new(
            "unsaved",
            format_args!(
                "Breccia did not switch folders: changes to {} could not be saved. Resolve the notices first (Reload from disk or Keep mine), or copy the text.",
                titles.join(", ")
            ),
        ))
    }

    pub(super) fn folder_view(&self) -> FolderView {
        FolderView {
            path: self.ws.as_ref().map(|ws| ws.root.clone()),
            generation: self.generation,
        }
    }

    fn open_folder(&mut self, path: &Path) -> Result<Output, CommandError> {
        let (ws, warnings) = Workspace::open(path).map_err(|e| CommandError::new("open", e))?;
        let notices = warnings.iter().map(Notice::load_warning).collect();
        Ok(self.replace_folder(ws, notices))
    }

    /// Puts the session back on its feet after an internal error (a panic)
    /// left it in an unknown state. The files are the truth and every edit is
    /// saved at once, so the open folder is read again from disk, as
    /// `folder.open` does: a new generation, a fresh undo history. A session
    /// holding edits its files do not is kept as it is (`Kept`): reading the
    /// disk would drop them. A folder that cannot be opened again leaves the
    /// session with no folder.
    ///
    /// It is the two steps [`Session::begin_recovery`] and [`Session::reopen`];
    /// a caller that guards against a panic in either runs them one by one.
    pub fn recover(&mut self) -> Recovery {
        if self.begin_recovery() {
            return Recovery::Kept;
        }
        self.reopen()
    }

    /// The first step of [`Session::recover`]: ends the typing run, and
    /// answers whether some page holds edits its file does not. If so, the
    /// session must be kept as it is.
    pub fn begin_recovery(&mut self) -> bool {
        self.typing = None;
        self.typed_step = None;
        self.ws.as_ref().is_some_and(|ws| !ws.unsaved().is_empty())
    }

    /// The second step of [`Session::recover`], only once
    /// [`Session::begin_recovery`] answered false: reads the open folder
    /// again from disk.
    pub fn reopen(&mut self) -> Recovery {
        let Some(ws) = self.ws.as_ref() else {
            return Recovery::NoFolder;
        };
        let root = ws.root.clone();
        // As `folder.open`: a folder that is gone never opens as an empty one.
        let opened = if root.is_dir() {
            Workspace::open(&root).map_err(|e| e.to_string())
        } else {
            Err("it no longer exists".to_string())
        };
        match opened {
            Ok((ws, warnings)) => {
                // Logged, not shown: the window gets the recovery's own notice.
                let notices = warnings.iter().map(Notice::load_warning).collect();
                for notice in self.replace_folder(ws, notices).notices {
                    log::warn!("recovery: {notice:?}");
                }
                Recovery::Reopened {
                    generation: self.generation,
                }
            }
            Err(e) => {
                log::error!("recovery: the notes folder could not be opened again: {e}");
                self.reset();
                Recovery::NoFolder
            }
        }
    }

    /// Replaces the session with a fresh one without a folder. The search
    /// cache directory stays, and the generation and config version move on,
    /// so no request or settings write of before is taken for a current one.
    pub fn reset(&mut self) {
        let search = match self.search.cache_dir() {
            Some(dir) => IndexState::with_cache(dir.to_path_buf()),
            None => IndexState::default(),
        };
        *self = Session {
            search,
            generation: self.generation + 1,
            config_version: self.config_version + 1,
            ..Session::default()
        };
    }

    /// Switches to another folder; block IDs of the old one become stale.
    fn replace_folder(&mut self, ws: Workspace, mut notices: Vec<Notice>) -> Output {
        self.ws = Some(ws);
        self.generation += 1;
        // A config write made from the previous folder's settings never passes.
        self.config_version += 1;
        self.history.clear();
        self.marks.clear();
        self.git_created.clear();
        self.failed_saves.clear();
        self.saved_now.clear();
        notices.extend(self.open_index());
        Output {
            folder: Some(self.folder_view()),
            notices,
            ..Output::default()
        }
    }

    /// Applies changes other programs made to files. Pages with unsaved
    /// edits are left alone and get a `saveFailed` notice; reloaded pages
    /// lose their history and mark the blocks that changed or went.
    pub(super) fn files_changed(&mut self, paths: &[PathBuf]) -> Result<Output, CommandError> {
        let config_path = Path::new(layout::CONFIG_REL);
        let config_touched = paths.iter().any(|p| p == config_path);
        let paths: Vec<PathBuf> = paths
            .iter()
            .filter(|p| *p != config_path)
            .cloned()
            .collect();
        let ws = self.ws_mut()?;
        let report = ws.apply_disk_changes(&paths);
        let mut notices: Vec<Notice> = report.warnings.iter().map(Notice::load_warning).collect();
        for key in &report.kept_unsaved {
            if let Some(page) = ws.page(key) {
                let path = ws.root.join(&page.rel_path);
                notices.push(Notice::save_failed(key, &SaveError::ChangedOnDisk(path)));
            }
        }
        for key in report.removed.iter().chain(&report.added) {
            self.history.remove(key);
        }
        for (old, new) in &report.rekeyed {
            self.rekey_marks(old, new);
        }
        for r in &report.reloaded {
            self.history.remove(&r.key);
            for (id, theirs) in &r.carried.changed {
                let theirs = theirs.clone();
                self.marks.insert(*id, DiskMark::Changed { theirs });
            }
            for &(id, after) in &r.carried.removed {
                let page = r.key.clone();
                self.marks.insert(id, DiskMark::Removed { page, after });
            }
        }
        // A hand edit of the settings (or a pull's) is followed first, so the
        // pages below show with the new states. A file that cannot be read
        // leaves the old settings in use and refuses writes.
        let mut config = None;
        if config_touched {
            match self.reload_config() {
                Ok(view) => config = view,
                Err(message) => notices.push(Notice::LoadWarning {
                    message: format!(
                        "breccia/config.toml cannot be read ({message}); Breccia keeps the settings it had"
                    ),
                }),
            }
        }
        let ws = self.ws.as_ref().ok_or_else(CommandError::no_folder)?;
        // Marks of blocks and pages that no longer exist can never be used.
        self.marks.retain(|&id, m| match m {
            DiskMark::Changed { .. } => ws.locate(id).is_some(),
            DiskMark::Removed { page, .. } => ws.page(page).is_some(),
        });
        let changed = report
            .reloaded
            .iter()
            .map(|r| r.key.as_str())
            .chain(report.added.iter().map(String::as_str))
            .filter_map(|k| ws.page(k))
            .map(|p| PageView::of(p, ws))
            .collect();
        Ok(Output {
            notices,
            config,
            changed,
            removed: report.removed,
            renamed: report
                .rekeyed
                .into_iter()
                .map(|(from, to)| RenameView { from, to })
                .collect(),
            ..Output::default()
        })
    }
}
