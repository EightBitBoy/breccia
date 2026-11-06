//! Task states (a leading keyword), the `done::` date property and the
//! `archived::` property that hides a task on boards.

use chrono::{NaiveDate, NaiveDateTime, NaiveTime};

use crate::config::{Config, State};
use crate::error::EditError;
use crate::inline::{self, LinkKind, property};
use crate::naming::parse_journal_name;
use crate::outline::{BlockId, Document};

/// Whether `text`'s first line starts with `keyword` followed by a space or
/// the end of the line (spec §5). The one rule for "this block is in that
/// state"; [`task_state`] and the state rename both use it.
pub fn starts_with_keyword(text: &str, keyword: &str) -> bool {
    let first = text.split('\n').next().unwrap_or("");
    !keyword.is_empty()
        && first
            .strip_prefix(keyword)
            .is_some_and(|rest| rest.is_empty() || rest.starts_with(' '))
}

/// The keyword in front of `text`'s first line, if it is a configured state
/// followed by a space or ending the line, and the byte length it covers
/// (with the space, if any).
fn split_keyword<'c>(text: &str, cfg: &'c Config) -> Option<(&'c State, usize)> {
    let state = cfg
        .states
        .iter()
        .find(|s| starts_with_keyword(text, &s.keyword))?;
    let first = text.split('\n').next().unwrap_or("");
    let space = usize::from(first.len() > state.keyword.len());
    Some((state, state.keyword.len() + space))
}

/// The block's state: a configured keyword followed by a space or ending
/// the first line.
pub fn task_state<'c>(text: &str, cfg: &'c Config) -> Option<&'c State> {
    split_keyword(text, cfg).map(|(s, _)| s)
}

/// Replaces, adds or removes the leading keyword; the rest is unchanged.
/// No trailing space is written: a keyword that ends the first line stands
/// alone.
pub fn with_state(text: &str, keyword: Option<&str>, cfg: &Config) -> String {
    let rest = match split_keyword(text, cfg) {
        Some((_, n)) => &text[n..],
        None => text,
    };
    match keyword {
        Some(k) if rest.is_empty() || rest.starts_with('\n') => format!("{k}{rest}"),
        Some(k) => format!("{k} {rest}"),
        None => rest.to_string(),
    }
}

/// The day of the first page link in `value` that names a journal.
pub(crate) fn journal_date_in(value: &str) -> Option<NaiveDate> {
    inline::links(value)
        .into_iter()
        .filter(|l| l.kind == LinkKind::Page)
        .find_map(|l| parse_journal_name(&l.target))
}

/// The date of the first `done::` property (in the properties directly
/// after the first line) whose value links to a journal.
pub fn done_date(text: &str) -> Option<NaiveDate> {
    inline::properties(text)
        .iter()
        .filter(|(k, _)| k == "done")
        .find_map(|(_, v)| journal_date_in(v))
}

/// The day of the first `archived::` property among the property lines: a
/// plain `YYYY-MM-DD` (as Breccia writes it, now with a time) or a link
/// to a journal.
pub fn archived_date(text: &str) -> Option<NaiveDate> {
    archived_at(text).map(|t| t.date())
}

/// The done date and time: the day of [`done_date`] and the `HH:MM:SS`
/// after its link; a value without a time counts as the start of that day.
pub fn done_at(text: &str) -> Option<NaiveDateTime> {
    let (day, time) = done_parts(text)?;
    Some(day.and_time(time.unwrap_or(NaiveTime::MIN)))
}

/// The time written after the done date's link, if any.
pub fn done_time(text: &str) -> Option<NaiveTime> {
    done_parts(text)?.1
}

/// The archived date and time: [`archived_date`] with the `HH:MM:SS` after
/// it; the start of the day without one.
pub fn archived_at(text: &str) -> Option<NaiveDateTime> {
    let props = inline::properties(text);
    let (_, value) = props.iter().find(|(k, _)| k == "archived")?;
    let value = value.trim();
    // A plain date, as Breccia writes it, or a journal link.
    let (day, rest) = match value.get(..10).and_then(plain_day) {
        Some(day) => (day, &value[10..]),
        None => journal_link_in(value)?,
    };
    Some(day.and_time(time_of(rest).unwrap_or(NaiveTime::MIN)))
}

/// When the task got its state: the first `created::` property
/// line, `YYYY-MM-DD HH:MM:SS` as Breccia writes it; a plain date counts as the
/// start of that day.
pub fn created_at(text: &str) -> Option<NaiveDateTime> {
    let props = inline::properties(text);
    let (_, value) = props.iter().find(|(k, _)| k == "created")?;
    let value = value.trim();
    let day = value.get(..10).and_then(plain_day)?;
    let rest = &value[10..];
    if rest.is_empty() {
        return Some(day.and_time(NaiveTime::MIN));
    }
    time_of(rest).map(|t| day.and_time(t))
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

/// The day of the first journal link in `value` and the text after it.
fn journal_link_in(value: &str) -> Option<(NaiveDate, &str)> {
    inline::links(value)
        .into_iter()
        .filter(|l| l.kind == LinkKind::Page)
        .find_map(|l| parse_journal_name(&l.target).map(|d| (d, &value[l.range.end..])))
}

/// `HH:MM:SS` (after spaces), when that is all of `rest`.
fn time_of(rest: &str) -> Option<NaiveTime> {
    let t = rest.trim();
    if t.len() != 8 || !rest.starts_with(' ') {
        return None;
    }
    NaiveTime::parse_from_str(t, "%H:%M:%S").ok()
}

/// The done date and, if written after its link, the time.
fn done_parts(text: &str) -> Option<(NaiveDate, Option<NaiveTime>)> {
    inline::properties(text)
        .iter()
        .filter(|(k, _)| k == "done")
        .find_map(|(_, v)| journal_link_in(v).map(|(d, rest)| (d, time_of(rest))))
}

/// The task's priority: the value of the first `priority::`
/// property among the property lines, when it is a whole number from 1 up
/// (ASCII digits only). Anything else (`0`, `-1`, `high`, `2.5`) is none.
pub fn priority(text: &str) -> Option<u32> {
    let props = inline::properties(text);
    let (_, value) = props.iter().find(|(k, _)| k == "priority")?;
    let v = value.trim();
    if v.is_empty() || !v.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    v.parse::<u32>().ok().filter(|&n| n >= 1)
}

fn is_priority_line(line: &str) -> bool {
    property(line).is_some_and(|(k, _)| k == "priority")
}

/// `text` with its `priority::` property lines replaced by one `priority:: n`
/// at the first one's place (or after the last property line), or removed.
fn with_priority(text: &str, value: Option<u32>) -> String {
    let lines: Vec<&str> = text.split('\n').collect();
    let end = props_end(&lines);
    let new = value.map(|n| format!("priority:: {n}"));
    let mut out: Vec<&str> = Vec::with_capacity(lines.len() + 1);
    let mut placed = false;
    for (i, l) in lines.iter().enumerate() {
        if i >= 1 && i < end && is_priority_line(l) {
            if let (Some(n), false) = (&new, placed) {
                out.push(n);
                placed = true;
            }
            continue;
        }
        if i == end
            && let (Some(n), false) = (&new, placed)
        {
            out.push(n);
            placed = true;
        }
        out.push(l);
    }
    if let (Some(n), false) = (&new, placed) {
        out.push(n);
    }
    out.join("\n")
}

fn is_done_line(line: &str) -> bool {
    property(line).is_some_and(|(k, _)| k == "done")
}

fn is_archived_line(line: &str) -> bool {
    property(line).is_some_and(|(k, _)| k == "archived")
}

/// Whether the block is archived: an `archived::` property, with any value,
/// among the properties directly after its first line. Boards leave it out.
pub fn is_archived(text: &str) -> bool {
    inline::properties(text)
        .iter()
        .any(|(k, _)| k == "archived")
}

/// The index of the first line after the first line's properties.
fn props_end(lines: &[&str]) -> usize {
    1 + lines[1..]
        .iter()
        .take_while(|l| property(l).is_some())
        .count()
}

/// Adds `archived:: <date> <time>` after the properties (`Some`, when there is no
/// `archived::` line yet), or removes every `archived::` line (`None`).
fn with_archived(text: &str, on: Option<NaiveDateTime>) -> String {
    let mut lines: Vec<&str> = text.split('\n').collect();
    let end = props_end(&lines);
    match on {
        Some(now) => {
            if lines[1..end].iter().any(|l| is_archived_line(l)) {
                return text.to_string();
            }
            let line = format!("archived:: {}", now.format("%Y-%m-%d %H:%M:%S"));
            lines.insert(end, &line);
            lines.join("\n")
        }
        None => lines
            .iter()
            .enumerate()
            .filter(|&(i, l)| !(i >= 1 && i < end && is_archived_line(l)))
            .map(|(_, l)| *l)
            .collect::<Vec<_>>()
            .join("\n"),
    }
}

fn is_created_line(line: &str) -> bool {
    property(line).is_some_and(|(k, _)| k == "created")
}

/// Adds `created:: <date> <time>` after the properties (`Some`, when there is no
/// `created::` line yet), or removes every `created::` property line (`None`).
fn with_created(text: &str, on: Option<NaiveDateTime>) -> String {
    let mut lines: Vec<&str> = text.split('\n').collect();
    let end = props_end(&lines);
    match on {
        Some(now) => {
            if lines[1..end].iter().any(|l| is_created_line(l)) {
                return text.to_string();
            }
            let line = format!("created:: {}", now.format("%Y-%m-%d %H:%M:%S"));
            lines.insert(end, &line);
            lines.join("\n")
        }
        None => lines
            .iter()
            .enumerate()
            .filter(|&(i, l)| !(i >= 1 && i < end && is_created_line(l)))
            .map(|(_, l)| *l)
            .collect::<Vec<_>>()
            .join("\n"),
    }
}

/// What a change of state from `from` to `to` does to the property lines
/// (the keyword itself is already `to`'s): `created::` comes with a state
/// given to a block without one and goes with the state, `done::`
/// follows whether `to` is finished, any change unarchives, and a finished
/// task, or a block whose state is removed, loses its priority.
fn with_state_lines(
    text: &str,
    from: Option<&str>,
    to: Option<&State>,
    now: NaiveDateTime,
) -> String {
    let mut text = match (from, to) {
        (None, Some(_)) => with_created(text, Some(now)),
        (_, None) => with_created(text, None),
        _ => text.to_string(),
    };
    let finished = to.is_some_and(|s| s.finished);
    text = with_done(&text, finished, now);
    if from != to.map(|s| s.keyword.as_str()) {
        text = with_archived(&text, None);
    }
    if finished || to.is_none() {
        text = with_priority(&text, None);
    }
    text
}

/// Adds or removes the `done::` line in `text` for a finished/unfinished state.
fn with_done(text: &str, finished: bool, now: NaiveDateTime) -> String {
    let mut lines: Vec<&str> = text.split('\n').collect();
    let props_end = props_end(&lines);
    if finished {
        if !lines[1..props_end].iter().any(|l| is_done_line(l)) {
            let line = format!(
                "done:: [[{}]] {}",
                now.format("%Y-%m-%d"),
                now.format("%H:%M:%S")
            );
            lines.insert(props_end, &line);
            return lines.join("\n");
        }
    } else {
        let kept: Vec<&str> = lines
            .iter()
            .enumerate()
            .filter(|&(i, l)| !(i >= 1 && i < props_end && is_done_line(l)))
            .map(|(_, l)| *l)
            .collect();
        return kept.join("\n");
    }
    text.to_string()
}

impl Document {
    /// Sets, changes or removes the block's state keyword and adds or
    /// removes its `created::` and `done::` lines. A change of state also removes the
    /// `archived::` line: a task worked on again shows again. Removing the state removes
    /// `priority::` too; removing it from a block without one changes nothing. A change that would make the block's
    /// bytes re-read as another outline (for example by opening or closing
    /// a code fence) is refused with [`EditError::WouldChangeStructure`]
    /// and leaves the document unchanged.
    pub fn set_state(
        &mut self,
        id: BlockId,
        keyword: Option<&str>,
        cfg: &Config,
        now: NaiveDateTime,
    ) -> Result<(), EditError> {
        let block = self
            .blocks
            .iter()
            .find(|b| b.id == id)
            .ok_or(EditError::UnknownBlock)?;
        let to = match keyword {
            Some(k) => Some(
                cfg.state(k)
                    .ok_or_else(|| EditError::UnknownState(k.to_string()))?,
            ),
            None => None,
        };
        let current = task_state(&block.text, cfg).map(|s| s.keyword.as_str());
        // Removing the state of a block that has none touches nothing: its property lines are its own.
        if current.is_none() && to.is_none() {
            return Ok(());
        }
        let text = with_state_lines(&with_state(&block.text, keyword, cfg), current, to, now);
        if text == block.text {
            return Ok(());
        }
        self.replace_keeping_structure(id, &text)
    }

    /// Archives the block (adds `archived:: <date> <time>`) or unarchives it
    /// (removes every `archived::` line). Fails like [`Self::set_state`].
    pub fn set_archived(
        &mut self,
        id: BlockId,
        on: bool,
        now: NaiveDateTime,
    ) -> Result<(), EditError> {
        let block = self
            .blocks
            .iter()
            .find(|b| b.id == id)
            .ok_or(EditError::UnknownBlock)?;
        let mut text = with_archived(&block.text, on.then_some(now));
        // An archived task leaves the board, and its place with it.
        if on {
            text = with_priority(&text, None);
        }
        if text == block.text {
            return Ok(());
        }
        self.replace_keeping_structure(id, &text)
    }

    /// Sets the block's priority (`Some`: the first `priority::` property line
    /// becomes `priority:: n` and any further ones go, or the line is added
    /// after the last property line) or removes every `priority::` property
    /// line (`None`). Fails like [`Self::set_state`].
    pub fn set_priority(&mut self, id: BlockId, value: Option<u32>) -> Result<(), EditError> {
        let block = self
            .blocks
            .iter()
            .find(|b| b.id == id)
            .ok_or(EditError::UnknownBlock)?;
        let text = with_priority(&block.text, value);
        if text == block.text {
            return Ok(());
        }
        self.replace_keeping_structure(id, &text)
    }

    /// The block's text with the property lines a change of state from
    /// `before` to the state its text has now brings (what [`Self::set_state`]
    /// does, without touching the keyword): for a keyword typed or removed by
    /// hand. `None` when nothing changes: the state is the same,
    /// or `before` is no longer a configured state (renamed or removed meanwhile).
    pub fn settled_text(
        &self,
        id: BlockId,
        before: Option<&str>,
        cfg: &Config,
        now: NaiveDateTime,
    ) -> Result<Option<String>, EditError> {
        let block = self
            .blocks
            .iter()
            .find(|b| b.id == id)
            .ok_or(EditError::UnknownBlock)?;
        if before.is_some_and(|k| cfg.state(k).is_none()) {
            return Ok(None);
        }
        let to = task_state(&block.text, cfg);
        if before == to.map(|s| s.keyword.as_str()) {
            return Ok(None);
        }
        let text = with_state_lines(&block.text, before, to, now);
        Ok((text != block.text).then_some(text))
    }

    /// Applies [`Self::settled_text`]. Fails like [`Self::set_state`].
    pub fn settle_state(
        &mut self,
        id: BlockId,
        before: Option<&str>,
        cfg: &Config,
        now: NaiveDateTime,
    ) -> Result<(), EditError> {
        match self.settled_text(id, before, cfg, now)? {
            Some(text) => self.replace_keeping_structure(id, &text),
            None => Ok(()),
        }
    }

    /// Adds `created:: <date> <time>` to the block when it has none (a new
    /// task). Fails like [`Self::set_state`].
    pub fn add_created(&mut self, id: BlockId, now: NaiveDateTime) -> Result<(), EditError> {
        let block = self
            .blocks
            .iter()
            .find(|b| b.id == id)
            .ok_or(EditError::UnknownBlock)?;
        let text = with_created(&block.text, Some(now));
        if text == block.text {
            return Ok(());
        }
        self.replace_keeping_structure(id, &text)
    }

    /// Moves the block to the next state in the cycle ([`Config::cycle_next`]: from the last
    /// back to the first, never to "no state"); returns the new keyword. A block without a
    /// state gets the first one. Fails with [`EditError::NoCycle`] when no state is in the
    /// cycle, else like [`Self::set_state`].
    pub fn cycle_state(
        &mut self,
        id: BlockId,
        cfg: &Config,
        now: NaiveDateTime,
    ) -> Result<Option<String>, EditError> {
        let block = self
            .blocks
            .iter()
            .find(|b| b.id == id)
            .ok_or(EditError::UnknownBlock)?;
        let current = task_state(&block.text, cfg).map(|s| s.keyword.as_str());
        let next = cfg
            .cycle_next(current)
            .ok_or(EditError::NoCycle)?
            .keyword
            .clone();
        self.set_state(id, Some(&next), cfg, now)?;
        Ok(Some(next))
    }

    /// Like [`Self::cycle_state`] for a task block (a click on its label); a block without a
    /// state stays as it is (`None`). Fails like [`Self::cycle_state`].
    pub fn step_state(
        &mut self,
        id: BlockId,
        cfg: &Config,
        now: NaiveDateTime,
    ) -> Result<Option<String>, EditError> {
        let block = self
            .blocks
            .iter()
            .find(|b| b.id == id)
            .ok_or(EditError::UnknownBlock)?;
        if cfg.cycle_next(None).is_none() {
            return Err(EditError::NoCycle);
        }
        if task_state(&block.text, cfg).is_none() {
            return Ok(None);
        }
        self.cycle_state(id, cfg, now)
    }
}
