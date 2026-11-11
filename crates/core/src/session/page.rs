//! The `page.*` and `dir.*` commands: create, show, rename, color, move,
//! reload, overwrite and delete pages and folders, and a page's references.

use crate::workspace::ReloadError;

use super::view::{CommandError, Notice, Output, PageView, RefsView};
use super::{DiskMark, Session};

impl Session {
    pub(super) fn page_create(&mut self, name: &str, folder: &str) -> Result<Output, CommandError> {
        let key = self.ws_mut()?.create_page(name, folder)?;
        self.page_output(&key, None, Vec::new())
    }

    pub(super) fn dir_create(&mut self, path: &str) -> Result<Output, CommandError> {
        self.ws_mut()?.create_folder(path)?;
        Ok(Output::default())
    }

    pub(super) fn page_rename(&mut self, key: &str, name: &str) -> Result<Output, CommandError> {
        self.load_linked(key)?;
        let out = self.rename_page(key, name)?;
        if let Some(page) = &out.page {
            self.rekey_marks(key, &page.key);
        }
        Ok(out)
    }

    pub(super) fn page_set_color(
        &mut self,
        key: &str,
        color: Option<&str>,
    ) -> Result<Output, CommandError> {
        self.load_linked(key)?;
        let (preamble, create) = self.ws()?.color_change(key, color)?;
        let out = self.mutate(
            key,
            false,
            Box::new(move |d, _, _| {
                d.set_preamble(&preamble)?;
                Ok(None)
            }),
        )?;
        if !create {
            return Ok(out);
        }
        // `mutate` skips the blank page without a file; a page with a
        // color gets its file now.
        let result = self.ws_mut()?.create_file(key);
        let mut notices = out.notices;
        notices.extend(self.note_save(key, result));
        self.page_output(key, None, notices)
    }

    pub(super) fn page_move(&mut self, key: &str, folder: &str) -> Result<Output, CommandError> {
        // A page only linked to is made in memory first, as for a rename.
        self.load_linked(key)?;
        let create = self.ws_mut()?.move_page(key, folder)?;
        self.history.remove(key);
        // A new `title::` line is written here; a page without a file
        // gets its file, empty if it is blank.
        let notices = if create {
            let result = self.ws_mut()?.create_file(key);
            self.note_save(key, result)
        } else {
            self.save(key)
        };
        self.page_output(key, None, notices)
    }

    pub(super) fn page_delete(&mut self, key: String) -> Result<Output, CommandError> {
        self.ws_mut()?.delete_page(&key)?;
        self.history.remove(&key);
        Ok(Output {
            removed: vec![key],
            ..Output::default()
        })
    }

    pub(super) fn dir_rename(&mut self, path: &str, to: &str) -> Result<Output, CommandError> {
        self.ws_mut()?.rename_folder(path, to)?;
        Ok(Output::default())
    }

    pub(super) fn dir_delete(&mut self, path: &str) -> Result<Output, CommandError> {
        let removed = self.ws_mut()?.delete_folder(path)?;
        for key in &removed {
            self.history.remove(key);
        }
        Ok(Output {
            removed,
            ..Output::default()
        })
    }

    pub(super) fn page_show(&mut self, key: &str) -> Result<Output, CommandError> {
        if self.ws()?.page(key).is_none() {
            return Err(CommandError::unknown_page(key));
        }
        self.open_page(key, false)
    }

    pub(super) fn page_get(&mut self, key: &str) -> Result<Output, CommandError> {
        let out = self.page_output(key, None, Vec::new())?;
        self.acknowledge_page(key);
        Ok(out)
    }

    pub(super) fn page_reload(&mut self, key: String) -> Result<Output, CommandError> {
        let reloaded = self.ws_mut()?.reload(&key).map_err(|e| match e {
            ReloadError::UnknownPage(_) => CommandError::unknown_page(&key),
            e => CommandError::new("reload", e),
        })?;
        self.history.remove(&key);
        self.rekey_marks(&key, &reloaded.key);
        self.acknowledge_page(&reloaded.key);
        let notices = reloaded.warning.iter().map(Notice::load_warning).collect();
        let mut out = self.page_output(&reloaded.key, None, notices)?;
        if reloaded.key != key {
            out.removed = vec![key];
        }
        Ok(out)
    }

    pub(super) fn page_refs(&mut self, key: &str) -> Result<Output, CommandError> {
        let ws = self.ws()?;
        ws.page(key)
            .ok_or_else(|| CommandError::unknown_page(key))?;
        let refs = RefsView::of(ws, key);
        for g in &refs.groups {
            for r in &g.refs {
                for b in &r.blocks {
                    self.marks.remove(&b.id);
                }
            }
        }
        Ok(Output {
            refs: Some(refs),
            ..Output::default()
        })
    }

    pub(super) fn page_rename_reach(
        &mut self,
        key: &str,
        name: &str,
    ) -> Result<Output, CommandError> {
        self.load_linked(key)?;
        let ws = self.ws()?;
        ws.page(key)
            .ok_or_else(|| CommandError::unknown_page(key))?;
        Ok(Output {
            reach: Some(ws.rename_reach(key, name)),
            ..Output::default()
        })
    }

    pub(super) fn page_overwrite(&mut self, key: &str) -> Result<Output, CommandError> {
        let ws = self.ws_mut()?;
        if ws.page(key).is_none() {
            return Err(CommandError::unknown_page(key));
        }
        let result = ws.save_overwrite(key);
        let notices = self.note_save(key, result);
        self.page_output(key, None, notices)
    }

    /// Renames a page and rewrites the links to it. Rename is not an undo
    /// step: undo across it would make files and links disagree, so the
    /// history of every page it touched goes.
    /// A page that is only linked to (no file, not open) is made in memory,
    /// as a click on a link makes it, so it can be renamed.
    fn load_linked(&mut self, key: &str) -> Result<(), CommandError> {
        let ws = self.ws_mut()?;
        if ws.page(key).is_some() {
            return Ok(());
        }
        if let Some((_, name)) = ws.link_targets().into_iter().find(|(k, _)| k == key) {
            ws.ensure_page(&name)?;
        }
        Ok(())
    }

    fn rename_page(&mut self, key: &str, name: &str) -> Result<Output, CommandError> {
        let report = self.ws_mut()?.rename_page(key, name)?;
        // The page's file now has the new key: a failed save is tracked under that key from here on, and the
        // notice for the old key is done. If the rename's own save fails again, the notice just moves from the old
        // key to the new one (below): the page is never reported saved while that new notice stands.
        if report.key != key && self.failed_saves.remove(key) {
            self.saved_now.push(key.to_string());
        }
        for k in [key, report.key.as_str()]
            .into_iter()
            .chain(report.rewritten.iter().map(String::as_str))
        {
            self.history.remove(k);
        }
        // Only pages the rename really saved count as saved; a failed save is tracked and gets its notice.
        let mut notices: Vec<Notice> = Vec::new();
        for k in &report.saved {
            self.note_save(k, Ok(()));
        }
        for (k, e) in &report.save_errors {
            notices.push(self.note_failed_save(k, e));
        }
        if report.skipped > 0 {
            notices.push(Notice::Refused {
                message: format!("{} links could not be updated", report.skipped),
            });
        }
        let mut out = self.page_output(&report.key, None, notices)?;
        let ws = self.ws()?;
        out.changed = report
            .rewritten
            .iter()
            .filter(|k| **k != report.key)
            .filter_map(|k| ws.page(k))
            .map(|p| PageView::of(p, ws))
            .collect();
        Ok(out)
    }

    pub(super) fn open_page(&mut self, name: &str, link: bool) -> Result<Output, CommandError> {
        let ws = self.ws_mut()?;
        let key = if link {
            ws.open_link(name)?
        } else {
            ws.ensure_page(name)?
        };
        let out = self.page_output(&key, None, Vec::new())?;
        self.acknowledge_page(&key);
        Ok(out)
    }

    /// The page was shown with its current text: its blocks are no longer
    /// marked as changed on disk.
    pub(super) fn acknowledge_page(&mut self, key: &str) {
        let Some(ws) = self.ws.as_ref() else {
            return;
        };
        self.marks.retain(|&id, m| match m {
            DiskMark::Changed { .. } => ws.locate(id).is_none_or(|(p, _)| p.key != key),
            DiskMark::Removed { page, .. } => page != key,
        });
    }

    /// Deleted-block marks follow their page to its new key.
    pub(super) fn rekey_marks(&mut self, old: &str, new: &str) {
        for m in self.marks.values_mut() {
            if let DiskMark::Removed { page, .. } = m
                && page == old
            {
                *page = new.to_string();
            }
        }
    }
}
