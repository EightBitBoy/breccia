//! A parsed search: words that must appear in a block, states the block is
//! in, and page keys the block links to.

use crate::config::Config;
use crate::inline::{LinkKind, links};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Query {
    /// The words as typed; the store folds them.
    pub words: Vec<String>,
    /// State keywords; a block matches when it is in any of them.
    pub states: Vec<String>,
    /// One entry per typed link (tags and page links alike). A block must
    /// link to one key of every entry.
    pub links: Vec<QueryLink>,
}

/// A link typed in a search, with the keys that count as a link to it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct QueryLink {
    /// The target as typed, so the session can widen `keys` from it.
    pub target: String,
    pub kind: LinkKind,
    /// The raw link keys that match. `parse_query` fills `vec![key]`; the
    /// session widens them to the page's aliases and heading links.
    pub keys: Vec<String>,
}

impl Query {
    /// No words and no filters.
    pub fn is_empty(&self) -> bool {
        self.words.is_empty() && self.states.is_empty() && self.links.is_empty()
    }
}

/// Splits what the user typed into a [`Query`]: the `[[links]]` and `#tags`
/// that [`links`] finds become `links` (their keys, in order, without
/// repeats) and are cut out of the text; of the remaining words, one equal
/// (case-sensitive) to a configured state keyword goes to `states` (without
/// repeats), the others to `words`, as typed.
pub fn parse_query(text: &str, cfg: &Config) -> Query {
    let mut q = Query::default();
    let mut rest = String::new();
    let mut at = 0;
    for l in links(text) {
        if !q.links.iter().any(|k| k.keys[0] == l.key) {
            q.links.push(QueryLink {
                target: l.target.clone(),
                kind: l.kind,
                keys: vec![l.key.clone()],
            });
        }
        rest.push_str(&text[at..l.range.start]);
        rest.push(' ');
        at = l.range.end;
    }
    rest.push_str(&text[at..]);
    for token in rest.split_whitespace() {
        if cfg.states.iter().any(|s| s.keyword == token) {
            if !q.states.iter().any(|s| s == token) {
                q.states.push(token.to_string());
            }
        } else {
            q.words.push(token.to_string());
        }
    }
    q
}
