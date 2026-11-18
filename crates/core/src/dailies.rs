//! The list of dailies (`breccia/dailies.md`): a plain outline file whose top-level blocks
//! are the dailies. A daily's first line is its text; `checked:: <date> <time>` among the
//! property lines after it says when it was last checked.

use chrono::{NaiveDate, NaiveDateTime, NaiveTime, Timelike};

use crate::error::EditError;
use crate::inline;
use crate::outline::{BlockId, Document, IdGen};

/// How a `checked::` line writes the time: local, to the minute.
pub const CHECKED_FORMAT: &str = "%Y-%m-%d %H:%M";

/// The daily's text: the first line of the block's text.
pub fn daily_text(text: &str) -> &str {
    text.split('\n').next().unwrap_or("")
}

/// When the daily was checked: the first `checked::` property line, as `YYYY-MM-DD HH:MM`
/// (Breccia's form), with seconds, or a plain date (the start of that day). Anything else
/// is none.
pub fn checked_at(text: &str) -> Option<NaiveDateTime> {
    let props = inline::properties(text);
    let (_, value) = props.iter().find(|(k, _)| k == "checked")?;
    let value = value.trim();
    let day = value.get(..10).and_then(plain_day)?;
    let rest = &value[10..];
    if rest.is_empty() {
        return Some(day.and_time(NaiveTime::MIN));
    }
    if !rest.starts_with(' ') {
        return None;
    }
    let t = rest.trim();
    let time = match t.len() {
        5 => NaiveTime::parse_from_str(t, "%H:%M"),
        8 => NaiveTime::parse_from_str(t, "%H:%M:%S"),
        _ => return None,
    }
    .ok()?;
    // Seconds are read but not kept: a daily is checked to the minute.
    Some(day.and_time(time.with_second(0).unwrap_or(time)))
}

/// `YYYY-MM-DD` and nothing else.
fn plain_day(s: &str) -> Option<NaiveDate> {
    let ok = s.len() == 10
        && s.bytes()
            .enumerate()
            .all(|(i, b)| (i == 4 || i == 7) == (b == b'-') && (b == b'-' || b.is_ascii_digit()));
    ok.then(|| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        .flatten()
}

/// One line of non-empty text, or why not.
fn one_line(text: &str) -> Result<String, EditError> {
    let text: String = text.chars().filter(|&c| c != '\r').collect();
    if text.contains('\n') {
        return Err(EditError::MultiLineDaily);
    }
    let text = text.trim();
    if text.is_empty() {
        return Err(EditError::EmptyDaily);
    }
    Ok(text.to_string())
}

impl Document {
    /// A daily is a top-level block.
    fn daily(&self, id: BlockId) -> Result<&crate::outline::Block, EditError> {
        let block = self.block(id)?;
        if block.depth() != 0 {
            return Err(EditError::NotADaily);
        }
        Ok(block)
    }

    /// Appends a daily: a top-level block at the end. A text that would change the outline
    /// (it opens a code fence) is refused and leaves the document as it was.
    pub fn add_daily(&mut self, text: &str, ids: &mut IdGen) -> Result<BlockId, EditError> {
        let text = one_line(text)?;
        let snapshot = self.clone();
        let result = self
            .insert_after(None, "", ids)
            .and_then(|id| self.edit_daily(id, &text).map(|()| id));
        if result.is_err() {
            *self = snapshot;
        }
        result
    }

    /// Writes one `checked:: <date> <time>` line, in the place of the first old one or after
    /// the last property line.
    pub fn check_daily(&mut self, id: BlockId, now: NaiveDateTime) -> Result<(), EditError> {
        let block = self.daily(id)?;
        let value = now.format(CHECKED_FORMAT).to_string();
        let text = inline::with_property(&block.text, "checked", Some(&value));
        if text == block.text {
            return Ok(());
        }
        self.replace_keeping_structure(id, &text)
    }

    /// Removes every `checked::` property line.
    pub fn uncheck_daily(&mut self, id: BlockId) -> Result<(), EditError> {
        let block = self.daily(id)?;
        let text = inline::with_property(&block.text, "checked", None);
        if text == block.text {
            return Ok(());
        }
        self.replace_keeping_structure(id, &text)
    }

    /// Changes the first line; every line after it stays.
    pub fn edit_daily(&mut self, id: BlockId, text: &str) -> Result<(), EditError> {
        let block = self.daily(id)?;
        let first = one_line(text)?;
        let new = match block.text.split_once('\n') {
            Some((_, rest)) => format!("{first}\n{rest}"),
            None => first,
        };
        if new == block.text {
            return Ok(());
        }
        self.replace_keeping_structure(id, &new)
    }

    /// Moves a daily (with whatever is nested under it) before `before`, or to the end.
    pub fn move_daily(&mut self, id: BlockId, before: Option<BlockId>) -> Result<(), EditError> {
        self.daily(id)?;
        if let Some(b) = before {
            self.daily(b)?;
        }
        self.move_before(id, before)
    }
}
