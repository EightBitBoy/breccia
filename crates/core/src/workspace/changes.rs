//! What changed in the workspace since someone last asked.
//!
//! Who bumps what:
//! - `tree_version`: whatever may change the page tree (a page file written
//!   for the first time, a page or folder created, renamed or removed).
//! - `link_version`: whatever may change the linked-only pages (a page's link
//!   targets or content, the aliases).
//! - `touched`: every page removal, block replacement, insert and save, so
//!   the search index knows which pages to read again.
//! - `topics`: keys whose color, existence or alias winner changed, so the
//!   journal blocks linking to them may need another wash.

use std::collections::BTreeSet;

#[derive(Debug, Default)]
pub(super) struct Changes {
    tree_version: u64,
    link_version: u64,
    topics: BTreeSet<String>,
    touched: BTreeSet<String>,
}

impl Changes {
    pub(super) fn bump_tree(&mut self) {
        self.tree_version += 1;
    }

    pub(super) fn bump_links(&mut self) {
        self.link_version += 1;
    }

    pub(super) fn touch(&mut self, key: &str) {
        self.touched.insert(key.to_string());
    }

    pub(super) fn topic(&mut self, key: &str) {
        self.topics.insert(key.to_string());
    }

    /// Sorted, without repeats; empties the set.
    pub(super) fn take_touched(&mut self) -> Vec<String> {
        std::mem::take(&mut self.touched).into_iter().collect()
    }

    pub(super) fn take_topics(&mut self) -> BTreeSet<String> {
        std::mem::take(&mut self.topics)
    }

    pub(super) fn tree_version(&self) -> u64 {
        self.tree_version
    }

    pub(super) fn link_version(&self) -> u64 {
        self.link_version
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn take_touched_is_sorted_and_empties() {
        let mut c = Changes::default();
        c.touch("b");
        c.touch("a");
        c.touch("b");
        assert_eq!(c.take_touched(), vec!["a".to_string(), "b".to_string()]);
        assert!(c.take_touched().is_empty());
    }

    #[test]
    fn take_topics_is_sorted_and_empties() {
        let mut c = Changes::default();
        c.topic("z");
        c.topic("m");
        let t: Vec<String> = c.take_topics().into_iter().collect();
        assert_eq!(t, vec!["m".to_string(), "z".to_string()]);
        assert!(c.take_topics().is_empty());
    }

    #[test]
    fn versions_only_go_up() {
        let mut c = Changes::default();
        assert_eq!((c.tree_version(), c.link_version()), (0, 0));
        c.bump_tree();
        c.bump_links();
        c.bump_links();
        assert_eq!((c.tree_version(), c.link_version()), (1, 2));
        c.take_touched();
        c.take_topics();
        assert_eq!((c.tree_version(), c.link_version()), (1, 2));
    }
}
