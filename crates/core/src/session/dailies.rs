//! The dailies commands: `dailies.list`, `.add`, `.check`, `.uncheck`, `.edit`, `.delete` and
//! `.move`. The list is `breccia/dailies.md`, read again before every command. A change is made
//! on the file as it is, written at once and never over text Breccia did not read. There is no
//! undo for dailies.

use std::fs;
use std::io;

use serde::Serialize;

use crate::dailies::{CHECKED_FORMAT, checked_at, daily_text};
use crate::error::EditError;
use crate::fsio::write_atomic;
use crate::layout::{DAILIES_REL, dailies_path};
use crate::outline::{BlockId, Document, IdGen, carry_ids, parse};
use crate::workspace::Workspace;

use super::Session;
use super::view::{CommandError, Output};

/// One daily as the Dailies view shows it.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyView {
    pub id: BlockId,
    /// The first line.
    pub text: String,
    /// When it was checked, `YYYY-MM-DD HH:MM`; `None`: not checked.
    pub checked: Option<String>,
    /// Text the view does not show is written under it: child blocks, continuation lines or properties other than
    /// `checked::` (deleting the daily deletes them too).
    pub nested: bool,
}

impl DailyView {
    /// The top-level blocks of `doc`, in file order.
    pub fn list(doc: &Document) -> Vec<DailyView> {
        let blocks = doc.blocks();
        blocks
            .iter()
            .enumerate()
            .filter(|(_, b)| b.depth() == 0)
            .map(|(i, b)| DailyView {
                id: b.id(),
                text: daily_text(b.text()).to_string(),
                checked: checked_at(b.text()).map(|t| t.format(CHECKED_FORMAT).to_string()),
                nested: blocks.get(i + 1).is_some_and(|n| n.depth() > 0)
                    || has_hidden_lines(b.text()),
            })
            .collect()
    }
}

/// Whether the lines after the first hold anything but `checked::`, which the view shows as a state.
fn has_hidden_lines(text: &str) -> bool {
    text.lines()
        .skip(1)
        .any(|l| !l.trim_start().starts_with("checked::"))
}

fn changed_elsewhere() -> CommandError {
    CommandError::new(
        "unknownDaily",
        "This daily changed in another program; the list now shows the file as it is.",
    )
}

fn unreadable(reason: &str) -> CommandError {
    CommandError::new(
        "dailiesUnreadable",
        format_args!("{DAILIES_REL} cannot be read ({reason}), so this change was not saved."),
    )
}

impl Workspace {
    /// Reads the file again; if it differs from what Breccia holds, the new text is taken, with the
    /// ids of the dailies whose block did not change. `Err`: the file cannot be read (the list stays).
    fn sync_dailies(&mut self) -> Result<(), String> {
        let path = dailies_path(&self.root);
        let text = match fs::read(&path) {
            Ok(bytes) => match String::from_utf8(bytes) {
                Ok(t) => Some(t),
                Err(_) => return self.dailies_unreadable("not valid UTF-8".to_string()),
            },
            Err(e) if e.kind() == io::ErrorKind::NotFound => None,
            Err(e) => return self.dailies_unreadable(e.to_string()),
        };
        self.dailies.unreadable = None;
        if text == self.dailies.on_disk {
            return Ok(());
        }
        let mut doc = parse(text.as_deref().unwrap_or(""), &mut self.ids);
        carry_ids(&self.dailies.doc, &mut doc);
        self.dailies.doc = doc;
        self.dailies.on_disk = text;
        Ok(())
    }

    fn dailies_unreadable(&mut self, reason: String) -> Result<(), String> {
        self.dailies.unreadable = Some(reason.clone());
        Err(reason)
    }
}

impl Session {
    fn dailies_output(&self) -> Result<Output, CommandError> {
        Ok(Output {
            dailies: Some(DailyView::list(&self.ws()?.dailies.doc)),
            ..Output::default()
        })
    }

    /// Follows a change other programs made to `breccia/dailies.md`. `Some`: the file's text differs from what
    /// Breccia holds (ids carried); a deleted file gives `Some` of an empty list. `None`: nothing changed, or the
    /// file cannot be read (the list stays, `unreadable` is set).
    pub fn reload_dailies(&mut self) -> Option<Vec<DailyView>> {
        let ws = self.ws.as_mut()?;
        let before = ws.dailies.on_disk.clone();
        ws.sync_dailies().ok()?;
        (ws.dailies.on_disk != before).then(|| DailyView::list(&ws.dailies.doc))
    }

    /// The list, as the file is now. A file that cannot be read keeps the list as it was.
    pub(super) fn dailies_list(&mut self) -> Result<Output, CommandError> {
        let _ = self.ws_mut()?.sync_dailies();
        self.dailies_output()
    }

    /// Makes one change to the list: reads the file, takes an outside change first, applies `op`
    /// to a copy and writes the result. `target` is the daily the change is about and the first
    /// line the window showed for it: the change is refused (`unknownDaily`) when that daily is
    /// gone or the file now gives it another first line. The window's text is the one compared,
    /// not the one Breccia held: a watcher run may have taken the outside text (keeping the id)
    /// while a confirm or an edit field was open.
    pub(super) fn dailies_change(
        &mut self,
        target: Option<(BlockId, &str)>,
        op: impl FnOnce(&mut Document, &mut IdGen) -> Result<(), EditError>,
    ) -> Result<Output, CommandError> {
        let ws = self.ws_mut()?;
        if let Err(reason) = ws.sync_dailies() {
            return Err(unreadable(&reason));
        }
        if let Some((id, shown)) = target {
            let now = ws
                .dailies
                .doc
                .block(id)
                .ok()
                .filter(|b| b.depth() == 0)
                .map(|b| daily_text(b.text()));
            if now != Some(shown) {
                return Err(changed_elsewhere());
            }
        }
        let mut doc = ws.dailies.doc.clone();
        if let Err(e) = op(&mut doc, &mut ws.ids) {
            return Err(match e {
                EditError::NotADaily | EditError::UnknownBlock => changed_elsewhere(),
                e => e.into(),
            });
        }
        if doc != ws.dailies.doc {
            doc.to_lf();
            let text = doc.render();
            if ws.dailies.on_disk.as_deref() != Some(text.as_str()) {
                write_atomic(&dailies_path(&ws.root), &text).map_err(|e| {
                    CommandError::new(
                        "dailiesSave",
                        format_args!("{DAILIES_REL} could not be saved: {e}"),
                    )
                })?;
                ws.dailies.on_disk = Some(text);
            }
            ws.dailies.doc = doc;
        }
        self.dailies_output()
    }
}
