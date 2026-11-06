//! Undo and redo stacks of whole-document snapshots, one pair per page, all
//! pages under one memory budget. A change to several pages at once (a drop
//! on a board that raises cards on other pages) records one step on
//! each under one group id; undo and redo take the group back as one step.

use std::collections::{BTreeMap, HashMap, VecDeque};

use crate::outline::{BlockId, Document};

/// The most undo steps a page keeps; the oldest go first.
pub(crate) const UNDO_LIMIT: usize = 200;

/// The most estimated bytes all pages' undo and redo steps may hold together.
pub(crate) const UNDO_BYTES: usize = 64 * 1024 * 1024;

/// Typing into the same block within this many milliseconds of the last
/// `block.setText` on it stays in the same undo step.
pub(crate) const COALESCE_MS: u64 = 1000;

/// A stored snapshot with its estimated size, its age and the multi-page
/// change it belongs to, if any.
struct Step {
    doc: Document,
    bytes: usize,
    seq: u64,
    group: Option<u64>,
}

/// A snapshot taken off a stack: its page, the document and its group.
pub(crate) struct Taken {
    pub(crate) key: String,
    pub(crate) doc: Document,
    pub(crate) group: Option<u64>,
}

#[derive(Default)]
struct History {
    undo: VecDeque<Step>,
    redo: Vec<Step>,
}

/// The undo and redo stacks of every page, under one memory budget.
pub(crate) struct Histories {
    /// Pages with at least one step; a page with both stacks empty has no entry.
    pages: HashMap<String, History>,
    /// Every undo step's sequence number and its page, so the oldest step is
    /// found without scanning the pages.
    order: BTreeMap<u64, String>,
    bytes: usize,
    next_seq: u64,
    next_group: u64,
    budget: usize,
}

impl Default for Histories {
    fn default() -> Self {
        Self::new(UNDO_BYTES)
    }
}

impl Histories {
    pub(crate) fn new(budget: usize) -> Self {
        Self {
            pages: HashMap::new(),
            order: BTreeMap::new(),
            bytes: 0,
            next_seq: 0,
            next_group: 0,
            budget,
        }
    }

    /// Records `before` as page `key`'s newest undo step; its redo steps go.
    pub(crate) fn record(&mut self, key: &str, before: Document) {
        self.clear_redo(key);
        self.push_undo(key, before, None);
    }

    /// Records one change to several pages: each page's `before` becomes its
    /// newest undo step, all under one new group id.
    pub(crate) fn record_group(&mut self, steps: Vec<(String, Document)>) {
        let group = self.next_group;
        self.next_group += 1;
        for (key, before) in steps {
            self.clear_redo(&key);
            self.push_undo(&key, before, Some(group));
        }
    }

    /// The sequence number of page `key`'s newest undo step: it names that step
    /// until another one is recorded or it is undone.
    pub(crate) fn newest_seq(&self, key: &str) -> Option<u64> {
        self.pages.get(key)?.undo.back().map(|s| s.seq)
    }

    /// An edit coalesced into the last undo step still ends any redo.
    pub(crate) fn clear_redo(&mut self, key: &str) {
        if let Some(h) = self.pages.get_mut(key) {
            let freed: usize = h.redo.drain(..).map(|s| s.bytes).sum();
            self.bytes -= freed;
            self.drop_if_empty(key);
        }
    }

    #[cfg(test)]
    pub(crate) fn take_undo(&mut self, key: &str) -> Option<Document> {
        self.pop_undo(key).map(|s| s.doc)
    }

    #[cfg(test)]
    pub(crate) fn take_redo(&mut self, key: &str) -> Option<Document> {
        self.pop_redo(key).map(|s| s.doc)
    }

    /// Page `key`'s newest undo step and, if it belongs to a group, the newest
    /// undo step of every other page that still belongs to the same group
    /// (a page edited since keeps its part). `key`'s comes first.
    pub(crate) fn take_undo_group(&mut self, key: &str) -> Vec<Taken> {
        self.take_group(key, false)
    }

    /// Like [`Self::take_undo_group`], for redo.
    pub(crate) fn take_redo_group(&mut self, key: &str) -> Vec<Taken> {
        self.take_group(key, true)
    }

    fn take_group(&mut self, key: &str, redo: bool) -> Vec<Taken> {
        let pop = |h: &mut Self, k: &str| if redo { h.pop_redo(k) } else { h.pop_undo(k) };
        let Some(first) = pop(self, key) else {
            return Vec::new();
        };
        let group = first.group;
        let mut out = vec![Taken {
            key: key.to_string(),
            doc: first.doc,
            group,
        }];
        let Some(g) = group else {
            return out;
        };
        let mut others: Vec<String> = self
            .pages
            .iter()
            .filter(|(k, h)| {
                let top = if redo { h.redo.last() } else { h.undo.back() };
                k.as_str() != key && top.is_some_and(|s| s.group == Some(g))
            })
            .map(|(k, _)| k.clone())
            .collect();
        others.sort();
        for k in others {
            if let Some(step) = pop(self, &k) {
                out.push(Taken {
                    key: k,
                    doc: step.doc,
                    group,
                });
            }
        }
        out
    }

    fn pop_undo(&mut self, key: &str) -> Option<Step> {
        let step = self.pages.get_mut(key)?.undo.pop_back()?;
        self.order.remove(&step.seq);
        self.bytes -= step.bytes;
        self.drop_if_empty(key);
        Some(step)
    }

    fn pop_redo(&mut self, key: &str) -> Option<Step> {
        let step = self.pages.get_mut(key)?.redo.pop()?;
        self.bytes -= step.bytes;
        self.drop_if_empty(key);
        Some(step)
    }

    /// Keeps the document an undo replaced, so redo can bring it back; a
    /// grouped step's redo keeps its group.
    pub(crate) fn push_redo(&mut self, key: &str, doc: Document, group: Option<u64>) {
        let step = self.step(doc, group);
        self.bytes += step.bytes;
        self.pages
            .entry(key.to_string())
            .or_default()
            .redo
            .push(step);
        self.evict(None);
    }

    /// Keeps the document a redo replaced, without touching the redo stack.
    pub(crate) fn push_undo_from_redo(&mut self, key: &str, doc: Document, group: Option<u64>) {
        self.push_undo(key, doc, group);
    }

    /// Applies `f` to every undo and redo snapshot of page `key`: a change made
    /// outside the history (an automatic archive) is then in every state undo
    /// or redo goes back to, so they take back only the user's own edits.
    pub(crate) fn rebase(&mut self, key: &str, mut f: impl FnMut(&mut Document)) {
        let Some(h) = self.pages.get_mut(key) else {
            return;
        };
        for step in h.undo.iter_mut().chain(h.redo.iter_mut()) {
            f(&mut step.doc);
            let bytes = step.doc.approx_bytes();
            self.bytes = self.bytes - step.bytes + bytes;
            step.bytes = bytes;
        }
    }

    pub(crate) fn remove(&mut self, key: &str) {
        if let Some(h) = self.pages.remove(key) {
            let freed: usize = h.undo.iter().chain(&h.redo).map(|s| s.bytes).sum();
            self.bytes -= freed;
            for s in &h.undo {
                self.order.remove(&s.seq);
            }
        }
    }

    pub(crate) fn clear(&mut self) {
        self.pages.clear();
        self.order.clear();
        self.bytes = 0;
    }

    /// The estimated bytes held, undo and redo steps together.
    #[cfg(test)]
    pub(crate) fn bytes(&self) -> usize {
        self.bytes
    }

    /// How many pages hold at least one step.
    #[cfg(test)]
    fn pages_len(&self) -> usize {
        self.pages.len()
    }

    fn drop_if_empty(&mut self, key: &str) {
        if self
            .pages
            .get(key)
            .is_some_and(|h| h.undo.is_empty() && h.redo.is_empty())
        {
            self.pages.remove(key);
        }
    }

    fn step(&mut self, doc: Document, group: Option<u64>) -> Step {
        let seq = self.next_seq;
        self.next_seq += 1;
        Step {
            bytes: doc.approx_bytes(),
            doc,
            seq,
            group,
        }
    }

    fn push_undo(&mut self, key: &str, doc: Document, group: Option<u64>) {
        let step = self.step(doc, group);
        let seq = step.seq;
        self.bytes += step.bytes;
        let h = self.pages.entry(key.to_string()).or_default();
        if h.undo.len() == UNDO_LIMIT
            && let Some(old) = h.undo.pop_front()
        {
            self.bytes -= old.bytes;
            self.order.remove(&old.seq);
        }
        h.undo.push_back(step);
        self.order.insert(seq, key.to_string());
        self.evict(Some(seq));
    }

    /// Drops the oldest undo step of any page while over budget. Redo steps
    /// and the undo step with sequence number `keep` stay, so this ends once
    /// no other undo step is left.
    fn evict(&mut self, keep: Option<u64>) {
        while self.bytes > self.budget {
            let Some((seq, key)) = self
                .order
                .iter()
                .find(|(seq, _)| Some(**seq) != keep)
                .map(|(seq, key)| (*seq, key.clone()))
            else {
                break;
            };
            self.order.remove(&seq);
            if let Some(h) = self.pages.get_mut(&key)
                && let Some(old) = h.undo.pop_front()
            {
                self.bytes -= old.bytes;
            }
            self.drop_if_empty(&key);
        }
    }
}

/// The last `block.setText`, when it was the most recent command.
#[derive(Clone, Copy)]
pub(crate) struct Typing {
    pub(crate) id: BlockId,
    pub(crate) ms: u64,
}

impl Typing {
    /// Whether a `block.setText` on `id` at `ms` joins this one's undo step.
    pub(crate) fn continues(self, id: BlockId, ms: u64) -> bool {
        self.id == id && ms >= self.ms && ms - self.ms <= COALESCE_MS
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::outline::{IdGen, parse};

    fn doc(text: &str) -> Document {
        parse(text, &mut IdGen::new())
    }

    fn text(d: Option<Document>) -> Option<String> {
        d.map(|d| d.render())
    }

    #[test]
    fn the_oldest_step_of_any_page_goes_first() {
        let one = doc("- 1\n").approx_bytes();
        let mut h = Histories::new(3 * one);
        h.record("a", doc("- 1\n"));
        h.record("a", doc("- 2\n"));
        h.record("b", doc("- 3\n"));
        h.record("b", doc("- 4\n"));
        assert!(h.bytes() <= 3 * one);
        assert_eq!(text(h.take_undo("a")), Some("- 2\n".to_string()));
        assert!(h.take_undo("a").is_none());
        assert_eq!(text(h.take_undo("b")), Some("- 4\n".to_string()));
        assert_eq!(text(h.take_undo("b")), Some("- 3\n".to_string()));
    }

    #[test]
    fn the_newest_step_stays_even_over_budget() {
        let mut h = Histories::new(1);
        h.record("a", doc("- big\n"));
        assert!(h.take_undo("a").is_some());
    }

    #[test]
    fn remove_and_clear_free_their_bytes() {
        let one = doc("- 1\n").approx_bytes();
        let mut h = Histories::default();
        h.record("a", doc("- 1\n"));
        h.record("b", doc("- 2\n"));
        h.remove("a");
        assert_eq!(h.bytes(), one);
        h.clear();
        assert_eq!(h.bytes(), 0);
    }

    #[test]
    fn a_page_keeps_at_most_undo_limit_steps() {
        let mut h = Histories::default();
        for _ in 0..=UNDO_LIMIT {
            h.record("a", doc("- 1\n"));
        }
        let mut n = 0;
        while h.take_undo("a").is_some() {
            n += 1;
        }
        assert_eq!(n, UNDO_LIMIT);
        assert_eq!(h.bytes(), 0);
    }

    #[test]
    fn redo_steps_count_and_go_with_a_new_record() {
        let one = doc("- 1\n").approx_bytes();
        let mut h = Histories::default();
        h.record("a", doc("- 1\n"));
        let d = h.take_undo("a").unwrap();
        assert_eq!(h.bytes(), 0);
        h.push_redo("a", d, None);
        assert_eq!(h.bytes(), one);
        h.record("a", doc("- 1\n"));
        assert!(h.take_redo("a").is_none());
        assert_eq!(h.bytes(), one);
    }

    #[test]
    fn redo_steps_survive_the_budget_and_eviction_ends() {
        let mut h = Histories::new(1);
        h.record("a", doc("- 1\n"));
        let d = h.take_undo("a").unwrap();
        h.push_redo("a", d, None);
        h.record("b", doc("- 2\n"));
        assert!(h.take_redo("a").is_some());
        assert!(h.take_undo("b").is_some());
    }

    #[test]
    fn a_page_with_empty_stacks_leaves_no_entry() {
        let mut h = Histories::new(UNDO_BYTES);
        h.record("a", doc("- 1\n"));
        assert_eq!(h.pages_len(), 1);
        let d = h.take_undo("a").unwrap();
        assert_eq!(h.pages_len(), 0, "both stacks are empty");
        h.push_redo("a", d, None);
        assert_eq!(h.pages_len(), 1);
        h.take_redo("a").unwrap();
        assert_eq!(h.pages_len(), 0);
    }

    #[test]
    fn eviction_drops_steps_oldest_first_across_pages() {
        let one = doc("- 1\n").approx_bytes();
        let mut h = Histories::new(2 * one);
        h.record("a", doc("- 1\n"));
        h.record("b", doc("- 2\n"));
        h.record("a", doc("- 3\n"));
        h.record("c", doc("- 4\n"));
        assert!(
            h.take_undo("b").is_none(),
            "b's only step was the oldest left"
        );
        assert_eq!(h.pages_len(), 2);
        assert_eq!(text(h.take_undo("a")), Some("- 3\n".to_string()));
        assert_eq!(text(h.take_undo("c")), Some("- 4\n".to_string()));
    }

    fn keys(t: &[Taken]) -> Vec<(&str, String)> {
        t.iter().map(|t| (t.key.as_str(), t.doc.render())).collect()
    }

    #[test]
    fn a_group_is_undone_and_redone_as_one_step() {
        let mut h = Histories::default();
        h.record("c", doc("- c0\n"));
        h.record_group(vec![
            ("a".into(), doc("- a0\n")),
            ("b".into(), doc("- b0\n")),
        ]);
        let undone = h.take_undo_group("b");
        assert_eq!(
            keys(&undone),
            [("b", "- b0\n".to_string()), ("a", "- a0\n".to_string())]
        );
        assert!(h.take_undo("a").is_none(), "a's part went with b's");
        assert_eq!(
            text(h.take_undo("c")),
            Some("- c0\n".to_string()),
            "c is no part"
        );
        // Redo: the replaced documents go back to the redo stacks with the group.
        let group = undone[0].group;
        assert!(group.is_some());
        h.push_redo("b", doc("- b1\n"), group);
        h.push_redo("a", doc("- a1\n"), group);
        assert_eq!(
            keys(&h.take_redo_group("a")),
            [("a", "- a1\n".to_string()), ("b", "- b1\n".to_string())]
        );
    }

    #[test]
    fn a_page_edited_since_keeps_its_part_of_the_group() {
        let mut h = Histories::default();
        h.record_group(vec![
            ("a".into(), doc("- a0\n")),
            ("b".into(), doc("- b0\n")),
        ]);
        h.record("b", doc("- b1\n"));
        assert_eq!(keys(&h.take_undo_group("a")), [("a", "- a0\n".to_string())]);
        assert_eq!(text(h.take_undo("b")), Some("- b1\n".to_string()));
        assert_eq!(text(h.take_undo("b")), Some("- b0\n".to_string()));
        // Two groups never mix.
        h.record_group(vec![("a".into(), doc("- x\n")), ("b".into(), doc("- y\n"))]);
        h.record_group(vec![("a".into(), doc("- x2\n"))]);
        assert_eq!(keys(&h.take_undo_group("a")), [("a", "- x2\n".to_string())]);
    }

    #[test]
    fn rebase_changes_every_snapshot_of_the_page_and_its_size() {
        let mut h = Histories::new(UNDO_BYTES);
        h.record(
            "a",
            doc("- 1
"),
        );
        h.record(
            "a",
            doc("- 2
"),
        );
        h.push_redo(
            "a",
            doc("- 3
"),
            None,
        );
        h.record(
            "b",
            doc("- b
"),
        );
        let other = doc("- b
")
        .approx_bytes();
        h.rebase("a", |d| {
            *d = doc("- longer text
")
        });
        let long = doc("- longer text
")
        .approx_bytes();
        assert_eq!(
            h.bytes(),
            3 * long + other,
            "two undo steps and one redo step of a"
        );
        assert_eq!(
            text(h.take_redo("a")),
            Some(
                "- longer text
"
                .to_string()
            )
        );
        assert_eq!(
            text(h.take_undo("a")),
            Some(
                "- longer text
"
                .to_string()
            )
        );
        assert_eq!(
            text(h.take_undo("a")),
            Some(
                "- longer text
"
                .to_string()
            )
        );
        assert_eq!(
            text(h.take_undo("b")),
            Some(
                "- b
"
                .to_string()
            )
        );
    }
}
