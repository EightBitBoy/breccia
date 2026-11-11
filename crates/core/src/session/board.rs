//! `board.get`: the cards of one configured board, grouped into columns.

use std::cmp::Ordering;
use std::time::SystemTime;

use chrono::{DateTime, Local, NaiveDate, NaiveDateTime};
use serde::Serialize;

use crate::config::Config;
use crate::error::EditError;
use crate::outline::{BlockId, Document};
use crate::render::{card_html, crumb, plain_line, took};
use crate::task::{
    archived_at, created_at, done_at, done_date, done_time, is_archived, priority, task_state,
    with_state,
};
use crate::workspace::{Page, PageKind, Workspace};

use super::Session;
use super::view::{BlockView, CommandError, Notice, Output, PageView, PageViewKind, title_of};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardView {
    pub index: usize,
    pub name: String,
    pub columns: Vec<ColumnView>,
    /// Column keywords that name no configured state; not shown as columns. A column whose state is no
    /// longer configured is skipped and named here, not shown.
    pub unknown: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnView {
    pub keyword: String,
    pub color: String,
    pub finished: bool,
    pub cards: Vec<CardView>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardView {
    pub id: BlockId,
    /// The source page's key, name and kind.
    pub page: String,
    pub page_name: String,
    pub page_kind: PageViewKind,
    /// `29 Oct 2026` (`%-d %b %Y`) for a journal, else the page name.
    pub source: String,
    /// `card_html` of the block.
    pub html: String,
    /// The block and its whole subtree; depth relative to the block (0).
    pub blocks: Vec<BlockView>,
    pub subtasks_done: usize,
    pub subtasks_total: usize,
    /// `crumb` of the nearest task ancestor's text without its keyword.
    pub parent: Option<String>,
    /// The done date as `29 Oct` (`%-d %b`), for a finished state with one.
    pub done: Option<String>,
}

/// A row of the Archive view (`archive.list`): an archived task.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchivedView {
    pub id: BlockId,
    /// The source page's key, name and kind.
    pub page: String,
    pub page_name: String,
    pub page_kind: PageViewKind,
    /// `29 Oct 2026` for a journal, else the page name (as on a card).
    pub source: String,
    /// The first line without its keyword, links shown as their text.
    pub text: String,
    pub state: String,
    pub color: String,
    /// `YYYY-MM-DD`, with ` HH:MM` when the done line has a time.
    pub done: Option<String>,
    /// `YYYY-MM-DD`, when `archived::` holds a day.
    pub archived: Option<String>,
    /// `YYYY-MM-DD HH:MM` (or the day alone) from `created::`, when there is one.
    pub created: Option<String>,
    /// How long the task took, as the done chip says it (`3 days`), when both times are known.
    pub took: Option<String>,
}

/// A card with what its position in the column depends on.
struct Sorted {
    card: CardView,
    /// The done date and time, in a finished column.
    done: Option<NaiveDateTime>,
    /// `priority::`, in a column that is not finished.
    priority: Option<u32>,
    source_date: Option<NaiveDate>,
    journal: bool,
    edited: Option<SystemTime>,
    index: usize,
}

type Column = (ColumnView, Vec<Sorted>);

/// Descending, with `None` last.
fn newest_first<T: Ord>(a: &Option<T>, b: &Option<T>) -> Ordering {
    match (a, b) {
        (Some(a), Some(b)) => b.cmp(a),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => Ordering::Equal,
    }
}

impl BoardView {
    /// The board's columns; archived cards are left out.
    pub(crate) fn of(ws: &Workspace, index: usize) -> Option<BoardView> {
        let board = ws.config.boards.get(index)?;
        let mut unknown = Vec::new();
        let mut columns: Vec<Column> = Vec::new();
        for kw in &board.columns {
            // A keyword listed twice is shown once, at its first place.
            if columns.iter().any(|(c, _)| c.keyword == *kw) || unknown.contains(kw) {
                continue;
            }
            match ws.config.state(kw) {
                Some(s) => columns.push((
                    ColumnView {
                        keyword: s.keyword.clone(),
                        color: s.color.clone(),
                        finished: s.finished,
                        cards: Vec::new(),
                    },
                    Vec::new(),
                )),
                None => unknown.push(kw.clone()),
            }
        }
        for page in ws.pages() {
            collect(ws, page, &mut columns);
        }
        let columns = columns
            .into_iter()
            .map(|(mut col, mut cards)| {
                sort_column(&mut cards, col.finished);
                col.cards = cards.into_iter().map(|s| s.card).collect();
                col
            })
            .collect();
        Some(BoardView {
            index,
            name: board.name.clone(),
            columns,
            unknown,
        })
    }
}

/// A column's order. Finished: done date and time, newest first. Otherwise
/// the prioritized cards first, highest first. Then, and for ties, the
/// computed order: source date (newest first), journal first, last edited,
/// page, place in the page.
fn sort_column(cards: &mut [Sorted], finished: bool) {
    cards.sort_by(|a, b| {
        let first = if finished {
            newest_first(&a.done, &b.done)
        } else {
            newest_first(&a.priority, &b.priority)
        };
        first
            .then_with(|| newest_first(&a.source_date, &b.source_date))
            .then_with(|| b.journal.cmp(&a.journal))
            .then_with(|| newest_first(&a.edited, &b.edited))
            .then_with(|| a.card.page.cmp(&b.card.page))
            .then_with(|| a.index.cmp(&b.index))
    });
}

/// Adds the page's tasks that sit in a column of `columns` to it, except
/// archived ones.
fn collect(ws: &Workspace, page: &Page, columns: &mut [Column]) {
    let cfg = &ws.config;
    let blocks = page.doc.blocks();
    // Per block: its nearest task ancestor (an index into `blocks`), found
    // with a stack of the open tasks.
    let mut parent: Vec<Option<usize>> = vec![None; blocks.len()];
    let mut stack: Vec<(usize, usize)> = Vec::new();
    let mut counts = vec![(0usize, 0usize); blocks.len()];
    for (i, b) in blocks.iter().enumerate() {
        while stack.last().is_some_and(|&(d, _)| d >= b.depth()) {
            stack.pop();
        }
        parent[i] = stack.last().map(|&(_, t)| t);
        if let Some(state) = task_state(b.text(), cfg) {
            if let Some(p) = parent[i] {
                counts[p].1 += 1;
                if state.finished {
                    counts[p].0 += 1;
                }
            }
            stack.push((b.depth(), i));
        }
    }
    let (page_kind, _) = title_of(page);
    let (source, source_date) = match &page.kind {
        PageKind::Journal(d) => (card_source(d), Some(*d)),
        PageKind::Page => (
            page.name.clone(),
            page.edited()
                .map(|t| DateTime::<Local>::from(t).date_naive()),
        ),
    };
    for (i, b) in blocks.iter().enumerate() {
        let Some(state) = task_state(b.text(), cfg) else {
            continue;
        };
        if is_archived(b.text()) {
            continue;
        }
        let Some((_, cards)) = columns.iter_mut().find(|(c, _)| c.keyword == state.keyword) else {
            continue;
        };
        let depth = b.depth();
        let end = blocks[i + 1..]
            .iter()
            .position(|n| n.depth() <= depth)
            .map_or(blocks.len(), |n| i + 1 + n);
        let mut views = BlockView::list(&blocks[i..end], cfg);
        for v in &mut views {
            v.depth -= depth;
        }
        let done = if state.finished {
            done_at(b.text())
        } else {
            None
        };
        cards.push(Sorted {
            card: CardView {
                id: b.id(),
                page: page.key.clone(),
                page_name: page.name.clone(),
                page_kind,
                source: source.clone(),
                html: card_html(b.text(), cfg),
                blocks: views,
                subtasks_done: counts[i].0,
                subtasks_total: counts[i].1,
                parent: parent[i].map(|p| crumb(&with_state(blocks[p].text(), None, cfg))),
                done: done.map(|d| d.format("%-d %b").to_string()),
            },
            done,
            priority: if state.finished {
                None
            } else {
                priority(b.text())
            },
            source_date,
            journal: matches!(page.kind, PageKind::Journal(_)),
            edited: page.edited(),
            index: i,
        });
    }
}

/// A card of a column, for a drop: its block, its page and its priority.
struct Slot {
    id: BlockId,
    page: String,
    priority: Option<u32>,
}

/// The cards of column `keyword` (a state that is not finished), in board
/// order, from the notes as they are now.
fn column_slots(ws: &Workspace, keyword: &str) -> Vec<Slot> {
    let mut columns: Vec<Column> = vec![(
        ColumnView {
            keyword: keyword.to_string(),
            color: String::new(),
            finished: false,
            cards: Vec::new(),
        },
        Vec::new(),
    )];
    for page in ws.pages() {
        collect(ws, page, &mut columns);
    }
    let mut cards = columns.pop().map(|(_, c)| c).unwrap_or_default();
    sort_column(&mut cards, false);
    cards
        .into_iter()
        .map(|s| Slot {
            id: s.card.id,
            page: s.card.page,
            priority: s.priority,
        })
        .collect()
}

/// The number a card dropped at index `at` of `slots` (the column without
/// it) gets: one more than a prioritized card below it; 1 at the end
/// of the prioritized cards or at the top of a column without any; none
/// among the unprioritized cards. Into an empty column the card keeps the
/// priority it has (`own`), or gets none.
fn drop_value(slots: &[Slot], at: usize, own: Option<u32>) -> Option<u32> {
    if slots.is_empty() {
        return own;
    }
    match slots.get(at).map(|s| s.priority) {
        Some(Some(below)) => Some(below.saturating_add(1)),
        _ => match at.checked_sub(1).map(|j| slots[j].priority) {
            None | Some(Some(_)) => Some(1),
            Some(None) => None,
        },
    }
}

/// The cards above index `at` raised so each is higher than the one below
/// it, from the dropped card's `value` upwards, until the order holds.
fn raises(slots: &[Slot], at: usize, value: Option<u32>) -> Vec<(BlockId, String, Option<u32>)> {
    let Some(mut floor) = value else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for s in slots[..at].iter().rev() {
        if s.priority.is_some_and(|p| p > floor) {
            break;
        }
        floor = floor.saturating_add(1);
        out.push((s.id, s.page.clone(), Some(floor)));
    }
    out
}

fn board_changed() -> CommandError {
    CommandError::new(
        "boardChanged",
        "Nothing was moved: the board changed since it was shown. It shows the notes as they are now; drop the card again.",
    )
}

/// A journal day as a card names it: `29 Oct 2026`.
fn card_source(d: &NaiveDate) -> String {
    d.format("%-d %b %Y").to_string()
}

/// One archived task with what its place in the list depends on.
type ArchivedRow = (
    ArchivedView,
    Option<NaiveDateTime>,
    Option<NaiveDateTime>,
    usize,
);

/// Every archived task (a block in a configured state with an `archived::`
/// line), newest done date and time first (none last), then newest archived date and time, then
/// by page key and place in the page.
pub(crate) fn archived_tasks(ws: &Workspace) -> Vec<ArchivedView> {
    let cfg = &ws.config;
    let day = |d: NaiveDateTime| d.format("%Y-%m-%d").to_string();
    let mut rows: Vec<ArchivedRow> = Vec::new();
    for page in ws.pages() {
        let (page_kind, _) = title_of(page);
        let source = match &page.kind {
            PageKind::Journal(d) => card_source(d),
            PageKind::Page => page.name.clone(),
        };
        for (i, b) in page.doc.blocks().iter().enumerate() {
            let Some(state) = task_state(b.text(), cfg) else {
                continue;
            };
            if !is_archived(b.text()) {
                continue;
            }
            let done = done_at(b.text());
            let archived = archived_at(b.text());
            rows.push((
                ArchivedView {
                    id: b.id(),
                    page: page.key.clone(),
                    page_name: page.name.clone(),
                    page_kind,
                    source: source.clone(),
                    text: plain_line(&with_state(b.text(), None, cfg)),
                    state: state.keyword.clone(),
                    color: state.color.clone(),
                    done: done_time(b.text()).map_or_else(
                        || done.map(day),
                        |t| done.map(|d| format!("{} {}", day(d), t.format("%H:%M"))),
                    ),
                    archived: archived.map(day),
                    created: created_at(b.text()).map(|c| {
                        if c.time() != chrono::NaiveTime::MIN {
                            c.format("%Y-%m-%d %H:%M").to_string()
                        } else {
                            day(c)
                        }
                    }),
                    took: match (created_at(b.text()), done_time(b.text()), done) {
                        (Some(c), Some(_), Some(d)) => took(c, d),
                        _ => None,
                    },
                },
                done,
                archived,
                i,
            ));
        }
    }
    rows.sort_by(|a, b| {
        newest_first(&a.1, &b.1)
            .then_with(|| newest_first(&a.2, &b.2))
            .then_with(|| a.0.page.cmp(&b.0.page))
            .then_with(|| a.3.cmp(&b.3))
    });
    rows.into_iter().map(|r| r.0).collect()
}

/// Whether a block is due for archiving: a task in a finished state, not yet
/// archived, whose done date is more than `days` days before `today`.
fn due(text: &str, cfg: &Config, today: NaiveDate, days: i64) -> bool {
    task_state(text, cfg).is_some_and(|s| s.finished)
        && !is_archived(text)
        && done_date(text).is_some_and(|d| (today - d).num_days() > days)
}

/// The note after an automatic run.
fn archived_note(n: usize, days: u32) -> String {
    let tasks = if n == 1 { "task" } else { "tasks" };
    let unit = if days == 1 { "day" } else { "days" };
    format!("Archived {n} finished {tasks} (done more than {days} {unit} ago)")
}

impl Session {
    /// `board.get`: board `index` as it is now. Its cards were shown, so their
    /// blocks are no longer marked as changed on disk.
    pub(super) fn board_get(&mut self, index: usize) -> Result<Output, CommandError> {
        let board = BoardView::of(self.ws()?, index).ok_or_else(|| {
            CommandError::new("unknownBoard", format_args!("unknown board: {index}"))
        })?;
        for c in &board.columns {
            for card in &c.cards {
                for b in &card.blocks {
                    self.marks.remove(&b.id);
                }
            }
        }
        Ok(Output {
            board: Some(board),
            ..Output::default()
        })
    }

    /// `board.place`: card `id` goes into column `keyword` above
    /// card `before` (at the end without one). The column is taken from the
    /// notes as they are now, so a board shown before a change cannot place
    /// by stale numbers; a `before` no longer in the column is refused.
    ///
    /// A finished column only takes the state; within it nothing
    /// changes. A drop at the card's own place changes nothing. Otherwise the
    /// number is set by [`drop_value`] and [`raises`]. Every page to be written must
    /// hold no unsaved edits and match its file, else nothing changes. All
    /// edits are made in memory first and one that fails puts every page
    /// back; then one grouped undo step and a save per page.
    pub(super) fn place_card(
        &mut self,
        id: BlockId,
        keyword: &str,
        before: Option<BlockId>,
        now: NaiveDateTime,
    ) -> Result<Output, CommandError> {
        let ws = self.ws()?;
        let cfg = &ws.config;
        let state = cfg.state(keyword).ok_or_else(|| {
            CommandError::new("unknownState", format_args!("unknown state: {keyword}"))
        })?;
        let (page, i) = ws.locate(id).ok_or(EditError::UnknownBlock)?;
        let key = page.key.clone();
        let current = task_state(page.doc.blocks()[i].text(), cfg)
            .map(|s| s.keyword.clone())
            .ok_or_else(board_changed)?;
        let same = current == keyword;
        if state.finished {
            if same {
                return Ok(Output::default());
            }
            let keyword = keyword.to_string();
            return self.mutate(
                &key,
                false,
                Box::new(move |d, _, cfg| {
                    d.set_state(id, Some(&keyword), cfg, now)?;
                    Ok(None)
                }),
            );
        }
        let mut slots = column_slots(ws, keyword);
        let own = slots.iter().position(|s| s.id == id);
        if let Some(i) = own {
            let next = slots.get(i + 1).map(|s| s.id);
            if before == Some(id) || before == next {
                return Ok(Output::default());
            }
            slots.remove(i);
        }
        let at = match before {
            Some(b) => slots
                .iter()
                .position(|s| s.id == b)
                .ok_or_else(board_changed)?,
            None => slots.len(),
        };
        let own_priority = priority(page.doc.blocks()[i].text());
        let mut writes = vec![(id, key.clone(), drop_value(&slots, at, own_priority))];
        writes.extend(raises(&slots, at, writes[0].2));
        // The pages in the order of their first write; the dropped card's first.
        let mut keys: Vec<String> = Vec::new();
        for (_, k, _) in &writes {
            if !keys.contains(k) {
                keys.push(k.clone());
            }
        }
        for k in &keys {
            let fresh = ws.page(k).is_some_and(|p| !p.is_unsaved()) && ws.matches_disk(k);
            if !fresh {
                let title = ws.page(k).map_or_else(|| k.clone(), |p| title_of(p).1);
                return Err(CommandError::new(
                    "boardChanged",
                    format_args!(
                        "Nothing was moved: {title} changed on disk or holds changes that are not saved. The board shows the notes as they are now; drop the card again."
                    ),
                ));
            }
        }
        let ws = self.ws_mut()?;
        let mut befores: Vec<(String, Document)> = Vec::new();
        let mut failed = None;
        for k in &keys {
            let Some(page) = ws.page(k) else { continue };
            befores.push((k.clone(), page.doc.clone()));
            let mine: Vec<(BlockId, Option<u32>)> = writes
                .iter()
                .filter(|(_, wk, _)| wk == k)
                .map(|(w, _, v)| (*w, *v))
                .collect();
            let state_too = *k == key && !same;
            let result = ws.edit_with_config(k, |d, _, cfg| -> Result<(), EditError> {
                if state_too {
                    d.set_state(id, Some(keyword), cfg, now)?;
                }
                for (w, v) in mine {
                    d.set_priority(w, v)?;
                }
                Ok(())
            });
            if let Some(Err(e)) = result {
                failed = Some(e);
                break;
            }
        }
        if let Some(e) = failed {
            for (k, doc) in befores {
                ws.edit(&k, |d, _| *d = doc);
            }
            return Err(e.into());
        }
        let changed: Vec<(String, Document)> = befores
            .into_iter()
            .filter(|(k, doc)| ws.page(k).is_some_and(|p| p.doc != *doc))
            .collect();
        let keys: Vec<String> = changed.iter().map(|(k, _)| k.clone()).collect();
        if !changed.is_empty() {
            self.history.record_group(changed);
        }
        let mut notices = Vec::new();
        for k in &keys {
            notices.extend(self.save(k));
        }
        let mut out = self.page_output(&key, None, notices)?;
        let ws = self.ws()?;
        out.changed = keys
            .iter()
            .filter(|k| **k != key)
            .filter_map(|k| ws.page(k))
            .map(|p| PageView::of(p, ws))
            .collect();
        Ok(out)
    }

    /// `archive.auto`: archives every due task in every page and
    /// journal while `[board] auto_archive` is on. Left for a later run: the
    /// block `editing`, blocks changed on disk and not shown since, and
    /// pages that hold unsaved edits or whose file changed on disk. No undo
    /// step: the page's undo and redo snapshots get the same archive, so undo
    /// takes back only what the user did.
    pub(super) fn auto_archive(
        &mut self,
        now: NaiveDateTime,
        editing: Option<BlockId>,
    ) -> Result<Output, CommandError> {
        let today = now.date();
        let ws = self.ws()?;
        let cfg = &ws.config;
        if !cfg.board.auto_archive {
            return Ok(Output::default());
        }
        let days = i64::from(cfg.board.archive_after_days);
        let mut work: Vec<(String, Vec<BlockId>)> = Vec::new();
        for page in ws.pages() {
            let ids: Vec<BlockId> = page
                .doc
                .blocks()
                .iter()
                .filter(|b| Some(b.id()) != editing && !self.marks.contains_key(&b.id()))
                .filter(|b| due(b.text(), cfg, today, days))
                .map(|b| b.id())
                .collect();
            if !ids.is_empty() && !page.is_unsaved() && ws.matches_disk(&page.key) {
                work.push((page.key.clone(), ids));
            }
        }
        let setting = cfg.board.archive_after_days;
        let mut out = Output::default();
        let mut count = 0;
        for (key, ids) in work {
            let ws = self.ws_mut()?;
            let done = ws
                .edit_with_config(&key, |d, _, _| {
                    // A refused one (it would change the outline) is left as it is.
                    ids.iter()
                        .filter(|&&id| d.set_archived(id, true, now).is_ok())
                        .count()
                })
                .unwrap_or(0);
            if done == 0 {
                continue;
            }
            count += done;
            let cfg = ws.config.clone();
            self.history.rebase(&key, |d| {
                for &id in &ids {
                    let is_due = d
                        .index_of(id)
                        .is_some_and(|i| due(d.blocks()[i].text(), &cfg, today, days));
                    if is_due {
                        let _ = d.set_archived(id, true, now);
                    }
                }
            });
            let notices = self.save(&key);
            out.notices.extend(notices);
            let ws = self.ws()?;
            if let Some(page) = ws.page(&key) {
                out.changed.push(PageView::of(page, ws));
            }
        }
        if count > 0 {
            out.notices.push(Notice::Info {
                message: archived_note(count, setting),
            });
        }
        Ok(out)
    }

    /// Archives the tasks in state `keyword` finished more than
    /// `archive_after_days` before `today` (adds `archived::`); one undo step
    /// and save per page.
    pub(super) fn archive_finished(
        &mut self,
        keyword: &str,
        now: NaiveDateTime,
    ) -> Result<Output, CommandError> {
        let today = now.date();
        let ws = self.ws()?;
        let cfg = &ws.config;
        let Some(state) = cfg.state(keyword) else {
            return Err(CommandError::new(
                "unknownState",
                format_args!("unknown state: {keyword}"),
            ));
        };
        if !state.finished {
            return Err(CommandError::new(
                "notFinished",
                format_args!("{keyword} is not a finished state"),
            ));
        }
        let days = i64::from(cfg.board.archive_after_days);
        let mut work: Vec<(String, Vec<BlockId>)> = Vec::new();
        for page in ws.pages() {
            let ids: Vec<BlockId> = page
                .doc
                .blocks()
                .iter()
                .filter(|b| task_state(b.text(), cfg).is_some_and(|s| s.keyword == keyword))
                .filter(|b| due(b.text(), cfg, today, days))
                .map(|b| b.id())
                .collect();
            if !ids.is_empty() {
                work.push((page.key.clone(), ids));
            }
        }
        let mut out = Output::default();
        for (key, ids) in work {
            // One page that cannot be archived must not stop the others.
            match self.mutate_tracked(
                &key,
                false,
                Box::new(move |d, _, _| {
                    for id in &ids {
                        d.set_archived(*id, true, now)?;
                    }
                    Ok(None)
                }),
            ) {
                Ok((res, _)) => {
                    out.changed.extend(res.page);
                    out.notices.extend(res.notices);
                }
                Err(e) => {
                    let title = self
                        .ws
                        .as_ref()
                        .and_then(|ws| ws.page(&key))
                        .map_or_else(|| key.clone(), |p| title_of(p).1);
                    out.notices.push(Notice::Refused {
                        message: format!("could not archive in {title}: {}", e.message),
                    });
                }
            }
        }
        Ok(out)
    }
}
