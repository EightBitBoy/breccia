//! Task states across the folder: how many blocks use each one, and
//! renaming one in the notes.

use serde::Serialize;

use super::{SaveError, Workspace};
use crate::task::{starts_with_keyword, task_state};

/// How much of the notes uses a state.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StateUsage {
    pub keyword: String,
    /// Blocks in the state, journals included.
    pub blocks: usize,
    /// Pages with at least one such block.
    pub pages: usize,
}

/// What [`Workspace::rename_state`] did.
#[derive(Debug)]
pub struct StateRenameReport {
    /// The pages with a rewritten block, by key, in key order.
    pub rewritten: Vec<String>,
    /// How many blocks got the new keyword.
    pub blocks: usize,
    /// Pages whose rewrite is kept in memory but could not be saved.
    pub save_errors: Vec<(String, SaveError)>,
}

impl Workspace {
    /// How many files did not load (a warning is held for each): their blocks
    /// are neither counted by `state_usage` nor renamed by `rename_state`.
    pub fn skipped_count(&self) -> usize {
        self.warned.len()
    }

    /// For each configured state, in config order, the blocks of all loaded
    /// pages that are in it and the number of pages they are on.
    pub fn state_usage(&self) -> Vec<StateUsage> {
        let mut out: Vec<StateUsage> = self
            .config
            .states
            .iter()
            .map(|s| StateUsage {
                keyword: s.keyword.clone(),
                blocks: 0,
                pages: 0,
            })
            .collect();
        for page in self.pages() {
            let mut seen = vec![false; out.len()];
            for block in page.doc.blocks() {
                let Some(state) = task_state(block.text(), &self.config) else {
                    continue;
                };
                if let Some(i) = out.iter().position(|u| u.keyword == state.keyword) {
                    out[i].blocks += 1;
                    seen[i] = true;
                }
            }
            for (u, seen) in out.iter_mut().zip(seen) {
                u.pages += usize::from(seen);
            }
        }
        out
    }

    /// Changes the leading keyword `old` of every block that starts with it
    /// to `new`, on every loaded page, and saves the pages it changed with
    /// the usual rules (a page whose file changed on disk is not written;
    /// its change stays in memory and is listed in `save_errors`). Only the
    /// keyword's bytes change; blocks that merely contain the word, code
    /// blocks and preambles are left alone. It does not look at `config`:
    /// the caller changes that first.
    ///
    /// The pages change through [`edit`](Self::edit), which keeps the block
    /// and link indexes and the touched set (the search index's work list)
    /// current.
    pub fn rename_state(&mut self, old: &str, new: &str) -> StateRenameReport {
        let mut report = StateRenameReport {
            rewritten: Vec::new(),
            blocks: 0,
            save_errors: Vec::new(),
        };
        let mut keys: Vec<String> = self.pages().map(|p| p.key.clone()).collect();
        keys.sort();
        for key in keys {
            let Some(page) = self.page(&key) else {
                continue;
            };
            let ids: Vec<_> = page
                .doc
                .blocks()
                .iter()
                .filter(|b| starts_with_keyword(b.text(), old))
                .map(|b| b.id())
                .collect();
            if ids.is_empty() {
                continue;
            }
            let changed = self
                .edit(&key, |d, _| {
                    ids.iter()
                        .filter(|id| d.replace_keyword(**id, old, new) == Ok(true))
                        .count()
                })
                .unwrap_or(0);
            if changed == 0 {
                continue;
            }
            report.blocks += changed;
            report.rewritten.push(key.clone());
            if let Err(e) = self.save(&key) {
                report.save_errors.push((key, e));
            }
        }
        report
    }
}
