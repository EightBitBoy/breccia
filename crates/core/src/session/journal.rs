//! The journal feed and bulk page reads.

use chrono::{NaiveDate, NaiveDateTime};

use crate::naming::{journal_display, journal_name};

use crate::task::task_state;

use super::tree::JournalDay;
use super::view::{CommandError, FeedView, Focus, Output, PageView};
use super::{Session, caret_at_end};
use crate::workspace::PageKind;

impl Session {
    /// Today's page is made in memory (no file) so the feed always has it.
    pub(super) fn journal_feed(&mut self, today: NaiveDate) -> Result<Output, CommandError> {
        let name = journal_name(today);
        let ws = self.ws_mut()?;
        ws.ensure_page(&name)?;
        let days = ws
            .journal_feed(today)
            .into_iter()
            .map(|p| JournalDay {
                key: p.key.clone(),
                title: match p.kind {
                    PageKind::Journal(d) => journal_display(d),
                    // Today's page may be an ordinary page with that name.
                    PageKind::Page => journal_display(today),
                },
            })
            .collect();
        Ok(Output {
            feed: Some(FeedView { today: name, days }),
            ..Output::default()
        })
    }

    /// Adds a top-level block with `text` at the end of today's journal. A text
    /// that starts with a state is a new task: it gets `created::`,
    /// and the caret goes to the end of its first line.
    pub(super) fn journal_append(
        &mut self,
        now: NaiveDateTime,
        text: String,
    ) -> Result<Output, CommandError> {
        let key = self.ws_mut()?.ensure_page(&journal_name(now.date()))?;
        self.mutate(
            &key,
            false,
            Box::new(move |d, ids, cfg| {
                let id = d.insert_after(None, &text, ids)?;
                if task_state(&text, cfg).is_some() {
                    d.add_created(id, now)?;
                    let at = text.split('\n').next().unwrap_or("").len();
                    return Ok(Some(Focus { id, at }));
                }
                Ok(Some(caret_at_end(d, id)))
            }),
        )
    }

    /// Views of the known keys, in the order first asked, each once; unknown keys are skipped.
    pub(super) fn pages_get(&mut self, keys: &[String]) -> Result<Output, CommandError> {
        let ws = self.ws()?;
        let mut pages: Vec<PageView> = Vec::new();
        for k in keys {
            if pages.iter().any(|p| &p.key == k) {
                continue;
            }
            if let Some(p) = ws.page(k) {
                pages.push(PageView::of(p, &ws.config));
            }
        }
        for p in &pages {
            self.acknowledge_page(&p.key);
        }
        Ok(Output {
            pages,
            ..Output::default()
        })
    }
}
