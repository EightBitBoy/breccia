//! The `block.*` and `blocks.*` commands, and undo and redo: edits to the
//! blocks of one page, each one undo step, saved at once.

use chrono::NaiveDateTime;

use crate::error::EditError;
use crate::outline::{BlockId, Document};

use super::batch;
use super::history::Typing;
use super::view::{CommandError, Focus, Notice, Output, PageView};
use super::{DiskMark, Session, TypedStep};

impl Session {
    pub(super) fn block_insert(
        &mut self,
        page: &str,
        after: Option<BlockId>,
        text: String,
    ) -> Result<Output, CommandError> {
        self.mutate(
            page,
            false,
            Box::new(move |d, ids, _| {
                let id = d.insert_after(after, &text, ids)?;
                Ok(Some(caret_at_end(d, id)))
            }),
        )
    }

    /// `typing` is the run of typing the previous command left, `ms` the
    /// clock's counter: a `block.setText` that continues the run joins its
    /// undo step.
    pub(super) fn block_set_text(
        &mut self,
        id: BlockId,
        text: String,
        typing: Option<Typing>,
        ms: u64,
    ) -> Result<Output, CommandError> {
        if let Some(out) = self.set_text_on_marked(id, &text)? {
            return Ok(out);
        }
        let key = self.page_of(id)?;
        let coalesce = typing.is_some_and(|t| t.continues(id, ms));
        // `set_text` fails only before it changes anything, so a
        // coalesced call needs no snapshot.
        let (out, changed) = self.mutate_tracked(
            &key,
            coalesce,
            // Text that became several blocks moves the caret to the
            // end of the last one, so the editor follows the split.
            Box::new(move |d, ids, _| {
                let extras = d.set_text(id, &text, ids)?;
                Ok(extras.last().map(|&last| caret_at_end(d, last)))
            }),
        )?;
        // A run of typing starts with a change that recorded a step;
        // typing that changes nothing does not start one.
        if changed {
            self.typing = Some(Typing { id, ms });
            self.typed_step = Some(TypedStep {
                id,
                page: key.clone(),
                seq: self.history.newest_seq(&key),
            });
        }
        Ok(out)
    }

    pub(super) fn block_settle(
        &mut self,
        id: BlockId,
        before: Option<String>,
        now: NaiveDateTime,
    ) -> Result<Output, CommandError> {
        let key = self.page_of(id)?;
        let ws = self.ws()?;
        let page = ws
            .page(&key)
            .ok_or_else(|| CommandError::unknown_page(&key))?;
        let settled = page
            .doc
            .settled_text(id, before.as_deref(), &ws.config, now)?;
        if settled.is_none() {
            return self.page_output(&key, None, Vec::new());
        }
        // The lines join the typing that gave or took the state while
        // that is still the page's newest step: one undo takes both.
        let coalesce = self.typed_step.as_ref().is_some_and(|t| {
            t.id == id && t.page == key && t.seq.is_some() && t.seq == self.history.newest_seq(&key)
        });
        self.mutate(
            &key,
            coalesce,
            Box::new(move |d, _, cfg| {
                d.settle_state(id, before.as_deref(), cfg, now)?;
                Ok(None)
            }),
        )
    }

    pub(super) fn block_split(&mut self, id: BlockId, at: usize) -> Result<Output, CommandError> {
        let key = self.page_of(id)?;
        self.mutate(
            &key,
            false,
            Box::new(move |d, ids, _| {
                let new = d.split(id, at, ids)?;
                Ok(Some(Focus { id: new, at: 0 }))
            }),
        )
    }

    pub(super) fn block_merge(&mut self, id: BlockId) -> Result<Output, CommandError> {
        let key = self.page_of(id)?;
        self.mutate(
            &key,
            false,
            Box::new(move |d, ids, _| {
                let (prev, at) = d.merge_into_previous(id, ids)?;
                Ok(Some(Focus { id: prev, at }))
            }),
        )
    }

    pub(super) fn block_paste(
        &mut self,
        id: BlockId,
        at: usize,
        text: String,
    ) -> Result<Output, CommandError> {
        let key = self.page_of(id)?;
        self.mutate(
            &key,
            false,
            Box::new(move |d, ids, _| {
                let r = d.paste(id, at, &text, ids)?;
                Ok(Some(Focus {
                    id: r.last,
                    at: r.at,
                }))
            }),
        )
    }

    pub(super) fn block_cycle_state(
        &mut self,
        id: BlockId,
        now: NaiveDateTime,
    ) -> Result<Output, CommandError> {
        let key = self.page_of(id)?;
        self.mutate(
            &key,
            false,
            Box::new(move |d, _, cfg| d.cycle_state(id, cfg, now).map(|_| None)),
        )
    }

    pub(super) fn block_step_state(
        &mut self,
        id: BlockId,
        now: NaiveDateTime,
    ) -> Result<Output, CommandError> {
        let key = self.page_of(id)?;
        self.mutate(
            &key,
            false,
            Box::new(move |d, _, cfg| d.step_state(id, cfg, now).map(|_| None)),
        )
    }

    pub(super) fn blocks_set_state(
        &mut self,
        ids: Vec<BlockId>,
        keyword: Option<String>,
        now: NaiveDateTime,
    ) -> Result<Output, CommandError> {
        let key = self.page_of_selection(&ids)?;
        self.mutate(
            &key,
            false,
            Box::new(move |d, _, cfg| {
                for id in batch::all(d, &ids)? {
                    d.set_state(id, keyword.as_deref(), cfg, now)?;
                }
                Ok(None)
            }),
        )
    }

    pub(super) fn blocks_set_archived(
        &mut self,
        ids: Vec<BlockId>,
        archived: bool,
        now: NaiveDateTime,
    ) -> Result<Output, CommandError> {
        let key = self.page_of_selection(&ids)?;
        self.mutate(
            &key,
            false,
            Box::new(move |d, _, _| {
                for id in batch::all(d, &ids)? {
                    d.set_archived(id, archived, now)?;
                }
                Ok(None)
            }),
        )
    }

    pub(super) fn blocks_delete(
        &mut self,
        ids: Vec<BlockId>,
        keep_one: bool,
    ) -> Result<Output, CommandError> {
        let key = self.page_of_selection(&ids)?;
        self.mutate(
            &key,
            false,
            Box::new(move |d, _, _| {
                // The last block left stays, emptied, so the page keeps one to write in.
                let mut focus = None;
                for id in batch::roots(d, &ids)? {
                    if keep_one {
                        if let Some(id) = d.delete_block(id)? {
                            focus = Some(Focus { id, at: 0 });
                        }
                    } else {
                        d.delete(id)?;
                    }
                }
                Ok(focus)
            }),
        )
    }

    pub(super) fn block_delete(&mut self, id: BlockId) -> Result<Output, CommandError> {
        let key = self.page_of(id)?;
        self.mutate(
            &key,
            false,
            Box::new(move |d, _, _| Ok(d.delete_block(id)?.map(|id| Focus { id, at: 0 }))),
        )
    }

    /// `block.setText` on a block marked by a reload from disk; `None` if
    /// the block is not marked. The mark is used up only on success.
    ///
    /// A changed block takes the text as usual, with a conflict notice when
    /// it differs from the disk text. A deleted block's text becomes a new
    /// block after the nearest earlier block that stayed (or at the end of
    /// the page), so the user's typing is never lost.
    fn set_text_on_marked(
        &mut self,
        id: BlockId,
        text: &str,
    ) -> Result<Option<Output>, CommandError> {
        let out = match self.marks.get(&id) {
            None => return Ok(None),
            Some(DiskMark::Changed { theirs }) => {
                let theirs = theirs.clone();
                let key = self.page_of(id)?;
                let mine = text.to_string();
                let mut out = self.mutate(
                    &key,
                    false,
                    Box::new(move |d, ids, _| {
                        let extras = d.set_text(id, &mine, ids)?;
                        Ok(extras.last().map(|&last| caret_at_end(d, last)))
                    }),
                )?;
                if text != theirs {
                    let n = Notice::changed_on_disk(&key, id, text, &theirs);
                    out.notices.push(n);
                }
                out
            }
            Some(DiskMark::Removed { page, after }) => {
                let (key, after) = (page.clone(), *after);
                let mine = text.to_string();
                let mut out = self.mutate(
                    &key,
                    false,
                    Box::new(move |d, ids, _| {
                        let after = after.filter(|&a| d.index_of(a).is_some());
                        let new = match d.insert_after(after, &mine, ids) {
                            // A preamble ending in an open fence refuses a
                            // new top-level block: go after the last block.
                            Err(EditError::WouldChangeStructure) if after.is_none() => {
                                let last = d.blocks().last().map(|b| b.id());
                                let last = last.ok_or(EditError::WouldChangeStructure)?;
                                d.insert_after(Some(last), &mine, ids)?
                            }
                            r => r?,
                        };
                        Ok(Some(caret_at_end(d, new)))
                    }),
                )?;
                if let Some(focus) = out.focus {
                    out.notices
                        .push(Notice::deleted_on_disk(&key, focus.id, text));
                }
                out
            }
        };
        self.marks.remove(&id);
        Ok(Some(out))
    }

    /// The key of the page holding the block.
    fn page_of(&self, id: BlockId) -> Result<String, CommandError> {
        match self.ws()?.locate(id) {
            Some((page, _)) => Ok(page.key.clone()),
            None => Err(EditError::UnknownBlock.into()),
        }
    }

    /// The page of a selection's first block; the others must be on it too.
    fn page_of_selection(&self, ids: &[BlockId]) -> Result<String, CommandError> {
        match ids.first() {
            Some(&id) => self.page_of(id),
            None => Err(CommandError::new("unknownBlock", "no blocks selected")),
        }
    }

    /// Runs `step` on each selected root, last root first if `reverse`.
    pub(super) fn on_roots(
        &mut self,
        ids: &[BlockId],
        reverse: bool,
        step: fn(&mut Document, BlockId) -> Result<(), EditError>,
    ) -> Result<Output, CommandError> {
        let key = self.page_of_selection(ids)?;
        self.mutate(
            &key,
            false,
            Box::new(move |d, _, _| {
                let mut roots = batch::roots(d, ids)?;
                if reverse {
                    roots.reverse();
                }
                for id in roots {
                    step(d, id)?;
                }
                Ok(None)
            }),
        )
    }

    /// Undo (or redo): swaps the page's document with the last snapshot and
    /// saves. A step of a multi-page change takes the other pages' parts with
    /// it (see [`Histories::take_undo_group`](super::history::Histories::take_undo_group));
    /// they are in `changed`. With nothing to undo it only returns the page.
    pub(super) fn step_history(&mut self, key: &str, redo: bool) -> Result<Output, CommandError> {
        let ws = self.ws.as_mut().ok_or_else(CommandError::no_folder)?;
        if ws.page(key).is_none() {
            return Err(CommandError::unknown_page(key));
        }
        let taken = if redo {
            self.history.take_redo_group(key)
        } else {
            self.history.take_undo_group(key)
        };
        let mut notices = Vec::new();
        let mut others = Vec::new();
        for t in taken {
            let ws = self.ws.as_mut().ok_or_else(CommandError::no_folder)?;
            // Every page of a step is known: a page that goes loses its history.
            let Some(current) = ws.edit(&t.key, |d, _| std::mem::replace(d, t.doc)) else {
                continue;
            };
            if redo {
                self.history.push_undo_from_redo(&t.key, current, t.group);
            } else {
                self.history.push_redo(&t.key, current, t.group);
            }
            notices.extend(self.save(&t.key));
            if t.key != key {
                others.push(t.key);
            }
        }
        let mut out = self.page_output(key, None, notices)?;
        let ws = self.ws()?;
        out.changed = others
            .iter()
            .filter_map(|k| ws.page(k))
            .map(|p| PageView::of(p, ws))
            .collect();
        Ok(out)
    }
}

/// The caret at the end of a block's text.
pub(super) fn caret_at_end(doc: &Document, id: BlockId) -> Focus {
    let at = doc.index_of(id).map_or(0, |i| doc.blocks()[i].text().len());
    Focus { id, at }
}
