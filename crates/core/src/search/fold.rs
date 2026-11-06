//! Case and accent folding, and the highlighting of folded matches in the
//! original text.

use serde::Serialize;
use unicode_normalization::UnicodeNormalization;
use unicode_normalization::char::is_combining_mark;

/// A piece of a result line: a match (`hit`) or the text around it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub text: String,
    pub hit: bool,
}

/// Lower case, then Unicode NFD with every combining mark dropped:
/// `fold("Härtel") == "hartel"`.
pub fn fold(text: &str) -> String {
    text.chars().flat_map(fold_char).collect()
}

fn fold_char(c: char) -> impl Iterator<Item = char> {
    c.to_lowercase().nfd().filter(|c| !is_combining_mark(*c))
}

/// `text` as segments, with every occurrence of every folded word in `words`
/// marked as a hit. The match is found in the folded text and mapped back,
/// so the hit is an exact substring of `text`, accents included. A text of
/// more than `width` characters is cut to `width` characters around the
/// first hit (or from the start), with `…` at each cut end. Newlines become
/// spaces.
pub fn highlight(text: &str, words: &[String], width: usize) -> Vec<Segment> {
    // Folded chars, each with the byte range of the char it came from.
    let mut folded: Vec<char> = Vec::new();
    let mut origin: Vec<(usize, usize)> = Vec::new();
    for (start, c) in text.char_indices() {
        let range = (start, start + c.len_utf8());
        for f in fold_char(c) {
            folded.push(f);
            origin.push(range);
        }
    }

    let mut ranges: Vec<(usize, usize)> = Vec::new();
    for w in words {
        let w: Vec<char> = w.chars().collect();
        if w.is_empty() || w.len() > folded.len() {
            continue;
        }
        for i in 0..=folded.len() - w.len() {
            if folded[i..i + w.len()] == w[..] {
                ranges.push((origin[i].0, origin[i + w.len() - 1].1));
            }
        }
    }
    ranges.sort_unstable();
    let mut merged: Vec<(usize, usize)> = Vec::new();
    for (s, e) in ranges {
        match merged.last_mut() {
            Some(last) if s <= last.1 => last.1 = last.1.max(e),
            _ => merged.push((s, e)),
        }
    }

    // The window, as byte offsets.
    let bounds: Vec<usize> = text
        .char_indices()
        .map(|(i, _)| i)
        .chain([text.len()])
        .collect();
    let n = bounds.len() - 1;
    let (mut from, mut to) = (0, n);
    if n > width {
        from = match merged.first() {
            Some(&(s, _)) => bounds.partition_point(|&b| b < s).saturating_sub(width / 5),
            None => 0,
        };
        to = (from + width).min(n);
        from = to.saturating_sub(width);
    }
    let (lo, hi) = (bounds[from], bounds[to]);

    let mut out: Vec<Segment> = Vec::new();
    let mut push = |s: &str, hit: bool| {
        if !s.is_empty() {
            out.push(Segment {
                text: s.replace(['\n', '\r'], " "),
                hit,
            });
        }
    };
    if from > 0 {
        push("…", false);
    }
    let mut at = lo;
    for (s, e) in merged {
        let (s, e) = (s.max(lo), e.min(hi));
        if s >= e {
            continue;
        }
        push(&text[at..s], false);
        push(&text[s..e], true);
        at = e;
    }
    push(&text[at..hi], false);
    if to < n {
        push("…", false);
    }
    out
}
