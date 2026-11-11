//! Outline parser and round-trip writer.
//!
//! `parse` followed by [`Document::render`] gives back the identical bytes for
//! any input. Each block keeps its original bytes in `raw`; only blocks whose
//! `raw` has been cleared (because they were edited) are regenerated.

use crate::error::EditError;

/// In-memory identity of a block. Never written into a file.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(transparent)]
pub struct BlockId(pub u64);

/// Hands out block IDs that are unique per generator.
#[derive(Debug, Default)]
pub struct IdGen {
    next: u64,
}

impl IdGen {
    pub fn new() -> Self {
        Self::default()
    }

    // The name is part of the agreed interface; IdGen is not an iterator.
    #[allow(clippy::should_implement_trait)]
    pub fn next(&mut self) -> BlockId {
        self.next += 1;
        BlockId(self.next)
    }
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum LineEnding {
    Lf,
    CrLf,
}

impl LineEnding {
    pub fn as_str(self) -> &'static str {
        match self {
            LineEnding::Lf => "\n",
            LineEnding::CrLf => "\r\n",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Block {
    pub(crate) id: BlockId,
    pub(crate) depth: usize,
    /// The bullet line's leading whitespace, verbatim.
    pub(crate) indent: String,
    /// Content without the bullet, continuation lines de-indented, joined by `\n`.
    pub(crate) text: String,
    /// Original bytes from the bullet line up to the next bullet line;
    /// `None` once the block has been edited.
    pub(crate) raw: Option<String>,
}

impl Block {
    pub fn id(&self) -> BlockId {
        self.id
    }

    pub fn depth(&self) -> usize {
        self.depth
    }

    /// The bullet line's leading whitespace, verbatim.
    pub fn indent(&self) -> &str {
        &self.indent
    }

    /// Content without the bullet, continuation lines de-indented, joined by `\n`.
    pub fn text(&self) -> &str {
        &self.text
    }

    /// The block's original bytes, or `None` once Breccia has changed it and
    /// will regenerate it.
    pub fn raw(&self) -> Option<&str> {
        self.raw.as_deref()
    }
}

/// A parsed file. Its blocks change only through the edit and task
/// operations, which keep it consistent with its rendered bytes.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Document {
    pub(crate) bom: bool,
    pub(crate) line_ending: LineEnding,
    pub(crate) indent_unit: String,
    /// Lines before the first bullet line, kept raw.
    pub(crate) preamble: String,
    pub(crate) blocks: Vec<Block>,
}

impl Document {
    /// A cheap estimate of the memory this document holds; never renders.
    pub fn approx_bytes(&self) -> usize {
        self.preamble.len()
            + self
                .blocks
                .iter()
                .map(|b| b.indent.len() + b.text.len() + b.raw.as_deref().map_or(0, str::len) + 48)
                .sum::<usize>()
    }

    pub fn blocks(&self) -> &[Block] {
        &self.blocks
    }

    /// Lines before the first bullet line, kept raw.
    pub fn preamble(&self) -> &str {
        &self.preamble
    }

    /// Whether the file starts with a UTF-8 byte order mark.
    pub fn bom(&self) -> bool {
        self.bom
    }

    pub fn line_ending(&self) -> LineEnding {
        self.line_ending
    }

    /// Turns the document to LF line endings: `\r\n` becomes `\n`, repeatedly
    /// until none is left, in the preamble and in each kept raw block (a lone
    /// `\r` stays). For a block whose raw changed, a `\r` that ends a line of
    /// its text goes too, so text and raw agree and regenerating the block does
    /// not bring a CRLF back. Ids, indent and the BOM are unchanged.
    pub fn to_lf(&mut self) {
        self.line_ending = LineEnding::Lf;
        self.preamble = lf_only(&self.preamble);
        for b in &mut self.blocks {
            if let Some(raw) = &mut b.raw {
                let fixed = lf_only(raw);
                if fixed != *raw {
                    *raw = fixed;
                    b.text = strip_line_end_cr(&b.text);
                }
            }
        }
    }

    /// The indent one level deeper uses, as found in the file.
    pub fn indent_unit(&self) -> &str {
        &self.indent_unit
    }
}

/// `s` with every `\r\n` replaced by `\n` until none is left.
fn lf_only(s: &str) -> String {
    let mut s = s.to_string();
    while s.contains("\r\n") {
        s = s.replace("\r\n", "\n");
    }
    s
}

/// `text` without each `\r` that ends a line (before `\n` or at the end).
fn strip_line_end_cr(text: &str) -> String {
    text.split('\n')
        .map(|l| l.trim_end_matches('\r'))
        .collect::<Vec<_>>()
        .join("\n")
}

const FENCE_MARKERS: [&str; 2] = ["```", "~~~"];

/// Width of a whitespace run: tab = 4, space = 1.
pub(crate) fn ws_width(c: char) -> usize {
    if c == '\t' { 4 } else { 1 }
}

/// The line without its `\n` or `\r\n` terminator.
fn content(line: &str) -> &str {
    line.strip_suffix("\r\n")
        .or_else(|| line.strip_suffix('\n'))
        .unwrap_or(line)
}

/// If `line` (without terminator) is a bullet line, returns its leading
/// whitespace and the text after `-` plus one space or tab.
fn split_bullet(line: &str) -> Option<(&str, &str)> {
    let rest = line.trim_start_matches([' ', '\t']);
    let indent = &line[..line.len() - rest.len()];
    let after = rest.strip_prefix('-')?;
    if after.is_empty() {
        Some((indent, after))
    } else if let Some(t) = after.strip_prefix([' ', '\t']) {
        Some((indent, t))
    } else {
        None
    }
}

/// The marker of the fence `trimmed` opens, if any. As in CommonMark, a
/// backtick fence's info string (after the backtick run) must not contain a
/// backtick, so ```` ```x``` ```` is inline code, not a fence. Tilde fences
/// may have any info string.
pub(crate) fn fence_marker(trimmed: &str) -> Option<&'static str> {
    let marker = FENCE_MARKERS.into_iter().find(|m| trimmed.starts_with(m))?;
    if marker == "```" && trimmed.trim_start_matches('`').contains('`') {
        return None;
    }
    Some(marker)
}

/// Removes the continuation prefix `indent + "  "` from `line`, or, if the
/// line does not have it, as much leading whitespace as is no wider than it.
fn dedent<'a>(line: &'a str, prefix: &str) -> &'a str {
    if let Some(rest) = line.strip_prefix(prefix) {
        return rest;
    }
    let limit: usize = prefix.chars().map(ws_width).sum();
    let mut width = 0;
    let mut cut = 0;
    for (i, c) in line.char_indices() {
        if c != ' ' && c != '\t' {
            break;
        }
        width += ws_width(c);
        if width > limit {
            break;
        }
        cut = i + c.len_utf8();
    }
    &line[cut..]
}

/// Classifies lines one at a time, tracking whether a code fence is open.
/// Shared by [`parse`], the edit operations and [`crate::inline::links`] so
/// all agree on what is a bullet line and what is code.
#[derive(Default)]
pub(crate) struct LineScanner {
    /// The open fence's marker run, e.g. four backticks for a four-backtick
    /// fence; `None` outside a fence.
    open: Option<String>,
}

impl LineScanner {
    /// Feeds one line's text (bullet already removed, trimmed); returns true
    /// if it is a fence line or code inside a fence. As in CommonMark, a
    /// fence closes only on a line that is a run of the opener's character
    /// at least as long as the opener's run, with nothing but whitespace
    /// around it.
    pub(crate) fn code(&mut self, trimmed: &str) -> bool {
        if let Some(run) = &self.open {
            let mark = run.chars().next().unwrap_or('`');
            if trimmed.len() >= run.len() && trimmed.chars().all(|c| c == mark) {
                self.open = None;
            }
            return true;
        }
        let Some(marker) = fence_marker(trimmed) else {
            return false;
        };
        let mark = marker.chars().next().unwrap_or('`');
        self.open = Some(trimmed.chars().take_while(|&c| c == mark).collect());
        true
    }

    /// Feeds one line (without terminator); returns its bullet split if it
    /// is a bullet line. Inside a fence no line is a bullet line.
    pub(crate) fn line<'a>(&mut self, c: &'a str) -> Option<(&'a str, &'a str)> {
        if self.open.is_some() {
            self.code(c.trim());
            return None;
        }
        let bullet = split_bullet(c);
        let trimmed = match bullet {
            Some((_, t)) => t.trim(),
            None => c.trim(),
        };
        self.code(trimmed);
        bullet
    }
}

/// If the bytes `src` (bullet line first) end inside an open fence, the
/// closing line for it: the opener's exact marker run.
pub(crate) fn closing_fence(src: &str) -> Option<String> {
    let mut scan = LineScanner::default();
    for line in src.split_inclusive('\n') {
        scan.line(content(line));
    }
    scan.open
}

/// True for a line (without terminator) that is `---` plus optional trailing
/// spaces and tabs.
fn is_rule(line: &str) -> bool {
    line.strip_prefix("---")
        .is_some_and(|rest| rest.trim_matches([' ', '\t']).is_empty())
}

/// The byte length of the YAML front matter (Obsidian's properties) at the
/// start of `body` (BOM already removed), through its closing line's
/// terminator; `None` when there is none. Line 1 is `---`; line 2 exists and
/// is not blank and not a bullet line (unless it is the closing line); a
/// later line is `---`; and no line before that is a bullet at column 0, so
/// a Jekyll-style list never hides blocks.
pub fn front_matter_len(body: &str) -> Option<usize> {
    let mut lines = body.split_inclusive('\n');
    let first = lines.next()?;
    if !is_rule(content(first)) {
        return None;
    }
    let mut offset = first.len();
    for (i, line) in lines.enumerate() {
        let c = content(line);
        offset += line.len();
        if is_rule(c) {
            return Some(offset);
        }
        if i == 0 && (c.trim().is_empty() || split_bullet(c).is_some()) {
            return None;
        }
        if c.starts_with('-') && split_bullet(c).is_some() {
            return None;
        }
    }
    None
}

struct Pending<'a> {
    indent: &'a str,
    depth: usize,
    lines: Vec<&'a str>,
}

pub fn parse(src: &str, ids: &mut IdGen) -> Document {
    let (bom, body) = match src.strip_prefix('\u{feff}') {
        Some(rest) => (true, rest),
        None => (false, src),
    };
    let line_ending = match body.find('\n') {
        Some(i) if body[..i].ends_with('\r') => LineEnding::CrLf,
        _ => LineEnding::Lf,
    };

    // Front matter is page-level text and is never scanned for bullets.
    let front = front_matter_len(body).unwrap_or(0);
    let mut preamble_end = front; // byte length of the preamble within `body`
    let mut pending: Vec<Pending> = Vec::new();
    let mut scan = LineScanner::default();
    let mut offset = front;

    for line in body[front..].split_inclusive('\n') {
        let bullet = scan.line(content(line));
        match (bullet, pending.last_mut()) {
            (Some((indent, _)), _) => pending.push(Pending {
                indent,
                depth: 0,
                lines: vec![line],
            }),
            (None, Some(block)) => block.lines.push(line),
            (None, None) => preamble_end = offset + line.len(),
        }
        offset += line.len();
    }

    // Depth through a stack of (width, block index); also find indent_unit.
    let mut stack: Vec<(usize, usize)> = Vec::new();
    let mut indent_unit: Option<String> = None;
    for i in 0..pending.len() {
        let width: usize = pending[i].indent.chars().map(ws_width).sum();
        while stack.last().is_some_and(|&(w, _)| w >= width) {
            stack.pop();
        }
        pending[i].depth = stack.len();
        if indent_unit.is_none() && pending[i].depth == 1 {
            let parent = stack[0].1;
            if pending[parent].indent.is_empty() {
                indent_unit = Some(pending[i].indent.to_string());
            }
        }
        stack.push((width, i));
    }

    let blocks = pending
        .into_iter()
        .map(|p| {
            let prefix = format!("{}  ", p.indent);
            let mut text = String::new();
            for (n, line) in p.lines.iter().enumerate() {
                let c = content(line);
                if n == 0 {
                    text.push_str(split_bullet(c).map_or("", |(_, t)| t));
                } else {
                    text.push('\n');
                    text.push_str(dedent(c, &prefix));
                }
            }
            Block {
                id: ids.next(),
                depth: p.depth,
                indent: p.indent.to_string(),
                text,
                raw: Some(p.lines.concat()),
            }
        })
        .collect();

    Document {
        bom,
        line_ending,
        indent_unit: indent_unit.unwrap_or_else(|| "\t".to_string()),
        preamble: body[..preamble_end].to_string(),
        blocks,
    }
}

/// The canonical form of a block: bullet line, then continuation lines
/// indented by `indent + "  "`; empty lines stay empty.
pub(crate) fn regenerate(block: &Block, le: LineEnding) -> String {
    let le = le.as_str();
    let mut lines = block.text.split('\n');
    let first = lines.next().unwrap_or("");
    let mut out = format!("{}-", block.indent);
    if !first.is_empty() {
        out.push(' ');
        out.push_str(first);
    }
    out.push_str(le);
    for line in lines {
        if !line.is_empty() {
            out.push_str(&block.indent);
            out.push_str("  ");
            out.push_str(line);
        }
        out.push_str(le);
    }
    out
}

impl Document {
    pub fn render(&self) -> String {
        let mut out = String::new();
        if self.bom {
            out.push('\u{feff}');
        }
        let le = self.line_ending.as_str();
        let mut needs_le = false;
        let mut push = |out: &mut String, seg: &str| {
            if seg.is_empty() {
                return;
            }
            if needs_le {
                out.push_str(le);
            }
            out.push_str(seg);
            needs_le = !seg.ends_with('\n');
        };
        push(&mut out, &self.preamble);
        for block in &self.blocks {
            match &block.raw {
                Some(raw) => push(&mut out, raw),
                None => push(&mut out, &regenerate(block, self.line_ending)),
            }
        }
        out
    }

    /// The block with this id, or [`EditError::UnknownBlock`].
    pub(crate) fn block(&self, id: BlockId) -> Result<&Block, EditError> {
        let i = self.find(id)?;
        Ok(&self.blocks[i])
    }

    /// The index of the block with this id, or [`EditError::UnknownBlock`].
    pub(crate) fn find(&self, id: BlockId) -> Result<usize, EditError> {
        self.index_of(id).ok_or(EditError::UnknownBlock)
    }

    /// Replaces a block's text and marks it edited. No re-parsing.
    pub(crate) fn replace_text(&mut self, id: BlockId, text: &str) -> Result<(), EditError> {
        let i = self.find(id)?;
        let block = &mut self.blocks[i];
        block.text = text.to_string();
        block.raw = None;
        Ok(())
    }

    /// Replaces the preamble, only if the outline stays as it is: `text`
    /// must hold no bullet line, and must not end inside an open fence
    /// unless the old preamble already did (which only a file without
    /// blocks can). A refused change leaves the document as it was.
    pub(crate) fn set_preamble(&mut self, text: &str) -> Result<(), EditError> {
        let ends_in_fence = |src: &str| -> Option<bool> {
            let mut scan = LineScanner::default();
            let src = &src[front_matter_len(src).unwrap_or(0)..];
            for line in src.split_inclusive('\n') {
                if scan.line(content(line)).is_some() {
                    return None;
                }
            }
            Some(scan.open.is_some())
        };
        match ends_in_fence(text) {
            Some(open) if !open || ends_in_fence(&self.preamble) == Some(true) => {
                self.preamble = text.to_string();
                Ok(())
            }
            _ => Err(EditError::WouldChangeStructure),
        }
    }

    /// Changes the leading state keyword `old` of a block's text to `new`
    /// and returns whether it did. `Ok(false)` when the block's text does
    /// not start with `old` (see [`crate::task::starts_with_keyword`]).
    ///
    /// A block that still has its original bytes keeps all of them except
    /// the `old.len()` bytes where its text begins, which become `new`: its
    /// indentation, bullet, line endings, properties and children are
    /// untouched and the block stays unedited. A block edited earlier only
    /// has its text changed and is regenerated, as for any edit. A `new`
    /// that is empty, holds whitespace or starts a code fence is refused
    /// with [`EditError::WouldChangeStructure`].
    pub fn replace_keyword(
        &mut self,
        id: BlockId,
        old: &str,
        new: &str,
    ) -> Result<bool, EditError> {
        let i = self.find(id)?;
        let block = &mut self.blocks[i];
        if !crate::task::starts_with_keyword(&block.text, old) {
            return Ok(false);
        }
        if new.is_empty()
            || new.chars().any(|c| c.is_whitespace() || c.is_control())
            || new.starts_with(['`', '~'])
        {
            return Err(EditError::WouldChangeStructure);
        }
        let text = format!("{new}{}", &block.text[old.len()..]);
        let raw = block.raw.as_deref().and_then(|raw| {
            // Where the text begins comes from the bullet line's structure,
            // never from searching the raw for the keyword.
            let line = raw.split_inclusive('\n').next()?;
            let (_, after) = split_bullet(content(line))?;
            let at = content(line).len() - after.len();
            raw[at..]
                .starts_with(old)
                .then(|| format!("{}{new}{}", &raw[..at], &raw[at + old.len()..]))
        });
        block.text = text;
        block.raw = raw;
        Ok(true)
    }

    /// True when there is no preamble text and every block's text is
    /// whitespace only.
    pub fn is_blank(&self) -> bool {
        self.preamble.trim().is_empty() && self.blocks.iter().all(|b| b.text.trim().is_empty())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replace_keyword_keeps_every_other_byte() {
        let src =
            "- WAITING Call [[Ben]]\n  done:: x\n\t- WAITING nested\n- WAITINGROOM no\n- DONE ok\n";
        let mut d = parse(src, &mut IdGen::new());
        for id in d.blocks().iter().map(|b| b.id()).collect::<Vec<_>>() {
            let _ = d.replace_keyword(id, "WAITING", "BLOCKED").unwrap();
        }
        assert_eq!(
            d.render(),
            "- BLOCKED Call [[Ben]]\n  done:: x\n\t- BLOCKED nested\n- WAITINGROOM no\n- DONE ok\n"
        );
        assert!(d.blocks()[0].raw().is_some()); // still unedited: no regeneration
    }

    #[test]
    fn replace_keyword_handles_crlf_tab_bullet_and_edited_blocks() {
        let src = "-\tWAITING a\r\n   odd\r\n- WAITING\r\n";
        let mut d = parse(src, &mut IdGen::new());
        let ids: Vec<_> = d.blocks().iter().map(|b| b.id()).collect();
        for id in &ids {
            assert!(d.replace_keyword(*id, "WAITING", "OK").unwrap());
        }
        assert_eq!(d.render(), "-\tOK a\r\n   odd\r\n- OK\r\n");
        // Raw gone: only the text changes, the block is regenerated.
        d.replace_text(ids[0], "OK a").unwrap();
        assert!(d.replace_keyword(ids[0], "OK", "NEW").unwrap());
        assert_eq!(d.blocks()[0].text(), "NEW a");
        assert!(d.blocks()[0].raw().is_none());
        assert!(!d.replace_keyword(ids[0], "OK", "X").unwrap());
        assert!(d.replace_keyword(ids[0], "NEW", "A B").is_err());
        assert!(d.replace_keyword(ids[0], "NEW", "```").is_err());
    }

    #[test]
    fn to_lf_leaves_no_crlf() {
        let mut ids = IdGen::new();
        let mut d = parse("- a\r\r\n- b\rc\r\n", &mut ids);
        d.to_lf();
        assert_eq!(d.render(), "- a\n- b\rc\n");
        assert!(!d.render().contains("\r\n"));
        // text and raw agree: regenerating a block must not bring a CRLF back.
        let (first, second) = (d.blocks()[0].id(), d.blocks()[1].id());
        assert_eq!(d.blocks()[0].text(), "a");
        d.indent(second).unwrap();
        assert!(!d.render().contains("\r\n"));
        d.set_text(first, "a", &mut ids).unwrap();
        assert!(!d.render().contains("\r\n"));
    }

    #[test]
    fn to_lf_keeps_ids_text_and_bom() {
        let mut d = parse(
            "\u{feff}title:: x\r\n- a\r\n\t- b\rc\r\n",
            &mut IdGen::new(),
        );
        let before: Vec<_> = d
            .blocks()
            .iter()
            .map(|b| (b.id(), b.text().to_string()))
            .collect();
        d.to_lf();
        assert_eq!(d.render(), "\u{feff}title:: x\n- a\n\t- b\rc\n");
        let after: Vec<_> = d
            .blocks()
            .iter()
            .map(|b| (b.id(), b.text().to_string()))
            .collect();
        assert_eq!(before, after);
    }

    #[test]
    fn regenerate_canonical_form() {
        let mut d = parse("- a\r\n", &mut IdGen::new());
        d.blocks[0].text = "TODO a\ndone:: [[2026-10-29]]\n\nmore".into();
        d.blocks[0].raw = None;
        assert_eq!(
            d.render(),
            "- TODO a\r\n  done:: [[2026-10-29]]\r\n\r\n  more\r\n"
        );
    }

    #[test]
    fn edited_block_in_the_middle_keeps_neighbours_byte_identical() {
        let src = "- a  \r\n\t- b\r\n- c";
        let mut d = parse(src, &mut IdGen::new());
        d.blocks[1].text = "B".into();
        d.blocks[1].raw = None;
        assert_eq!(d.render(), "- a  \r\n\t- B\r\n- c");
        d.blocks[2].text = "C".into();
        d.blocks[2].raw = None;
        assert_eq!(d.render(), "- a  \r\n\t- B\r\n- C\r\n");
    }

    #[test]
    fn unterminated_last_raw_gets_line_ending_before_next_segment() {
        let mut d = parse("- a", &mut IdGen::new());
        let mut extra = d.blocks[0].clone();
        extra.raw = None;
        extra.text = "b".into();
        d.blocks.push(extra);
        assert_eq!(d.render(), "- a\n- b\n");
    }

    #[test]
    fn fence_opener_rules() {
        assert_eq!(fence_marker("```"), Some("```"));
        assert_eq!(fence_marker("````rust"), Some("```"));
        assert_eq!(fence_marker("```x``` text"), None);
        assert_eq!(fence_marker("``` foo ` bar"), None);
        assert_eq!(fence_marker("~~~ a ` b"), Some("~~~"));
        assert_eq!(fence_marker("``x"), None);
    }

    #[test]
    fn fence_closes_only_on_a_long_enough_bare_run() {
        let nested = "- ````md\n  ```js\n  - inside\n  ```\n  ````\n- next\n";
        let d = parse(nested, &mut IdGen::new());
        assert_eq!(d.blocks.len(), 2);
        assert_eq!(d.blocks[1].text, "next");
        // "``` trailing" has text after the run, so it does not close the
        // fence (CommonMark) and the fence swallows "- b".
        let d = parse("- ```\n  code\n  ``` trailing\n- b\n", &mut IdGen::new());
        assert_eq!(d.blocks.len(), 1);
        // trailing whitespace after the run is allowed; a shorter run or the
        // other marker character does not close it
        let d = parse("- ```\n  ```  \n- b\n", &mut IdGen::new());
        assert_eq!(d.blocks.len(), 2);
        let d = parse("- ````\n  ```\n  ~~~~\n- b\n", &mut IdGen::new());
        assert_eq!(d.blocks.len(), 1);
        let d = parse("- ~~~\n  ~~~~\n- b\n", &mut IdGen::new());
        assert_eq!(d.blocks.len(), 2);
    }

    #[test]
    fn bullet_detection() {
        assert!(split_bullet("-").is_some());
        assert!(split_bullet("\t-\tx").is_some());
        assert!(split_bullet("--").is_none());
        assert!(split_bullet("---").is_none());
        assert!(split_bullet("-x").is_none());
    }

    #[test]
    fn depth_never_jumps_and_first_is_zero() {
        let d = parse("\t\t- a\n- b\n\t\t\t- c\n  - d\n\t- e\n", &mut IdGen::new());
        let depths: Vec<_> = d.blocks.iter().map(|b| b.depth).collect();
        assert_eq!(depths, vec![0, 0, 1, 1, 2]);
    }

    #[test]
    fn dedent_falls_back_to_width() {
        // prefix "\t  " (width 6): a line indented by "    \t" (width 8) keeps
        // what would exceed the limit.
        let d = parse("\t- a\n    \tx\n\t  y\n", &mut IdGen::new());
        assert_eq!(d.blocks[0].text, "a\n\tx\ny");
    }

    #[test]
    fn set_preamble_keeps_the_outline() {
        let mut d = parse("p\n- a\n", &mut IdGen::new());
        assert_eq!(
            d.set_preamble("p\n- b\n"),
            Err(EditError::WouldChangeStructure)
        );
        assert_eq!(
            d.set_preamble("```\n"),
            Err(EditError::WouldChangeStructure)
        );
        // A bullet-like line inside a closed fence is code, not a bullet.
        d.set_preamble("```\n- x\n```\n").unwrap();
        assert_eq!(d.render(), "```\n- x\n```\n- a\n");
        // A file without blocks may already end inside a fence.
        let mut d = parse("```\ncode\n", &mut IdGen::new());
        d.set_preamble("title:: t\n```\ncode\n").unwrap();
        assert_eq!(d.render(), "title:: t\n```\ncode\n");
    }

    #[test]
    fn ids_are_unique_and_is_blank() {
        let mut ids = IdGen::new();
        let d = parse("- \n\t-\n", &mut ids);
        assert_ne!(d.blocks[0].id, d.blocks[1].id);
        assert!(d.is_blank());
        assert!(!parse("x\n", &mut ids).is_blank());
        assert!(!parse("- y\n", &mut ids).is_blank());
    }
}

/// What [`carry_ids`] found out about the blocks of a re-read document.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Carried {
    /// Blocks that kept their ID although their text differs, with the new text.
    pub changed: Vec<(BlockId, String)>,
    /// Old blocks with no counterpart, each with the nearest earlier old
    /// block that survived (`None` if there is none).
    pub removed: Vec<(BlockId, Option<BlockId>)>,
}

/// Gives the blocks of `new`, a re-read of `old`, the IDs of the blocks they
/// correspond to. Blocks equal in depth and text are matched (common prefix
/// and suffix, then a longest common subsequence); in each gap between
/// matches, old and new blocks pair up in order and the new ones keep the
/// old IDs. Unpaired new blocks keep their fresh IDs.
pub fn carry_ids(old: &Document, new: &mut Document) -> Carried {
    let key = |b: &Block| (b.depth, b.text.clone());
    let o: Vec<_> = old.blocks.iter().map(key).collect();
    let n: Vec<_> = new.blocks.iter().map(key).collect();

    let prefix = o.iter().zip(&n).take_while(|(a, b)| a == b).count();
    let suffix = o[prefix..]
        .iter()
        .rev()
        .zip(n[prefix..].iter().rev())
        .take_while(|(a, b)| a == b)
        .count();
    let (o_end, n_end) = (o.len() - suffix, n.len() - suffix);

    // `pairs`: (old index, new index, equal), in order.
    let mut pairs: Vec<(usize, usize, bool)> = (0..prefix).map(|i| (i, i, true)).collect();

    // LCS table of the middle, suffix-based so the walk goes forwards.
    let (om, nm) = (&o[prefix..o_end], &n[prefix..n_end]);
    let mut lcs = vec![vec![0usize; nm.len() + 1]; om.len() + 1];
    for i in (0..om.len()).rev() {
        for j in (0..nm.len()).rev() {
            lcs[i][j] = if om[i] == nm[j] {
                lcs[i + 1][j + 1] + 1
            } else {
                lcs[i + 1][j].max(lcs[i][j + 1])
            };
        }
    }
    let mut matches = Vec::new();
    let (mut i, mut j) = (0, 0);
    while i < om.len() && j < nm.len() {
        if om[i] == nm[j] {
            matches.push((i, j));
            i += 1;
            j += 1;
        } else if lcs[i + 1][j] >= lcs[i][j + 1] {
            i += 1;
        } else {
            j += 1;
        }
    }
    matches.push((om.len(), nm.len())); // sentinel closing the last gap
    let (mut gi, mut gj) = (0, 0);
    for (mi, mj) in matches {
        for k in 0..(mi - gi).min(mj - gj) {
            pairs.push((prefix + gi + k, prefix + gj + k, false));
        }
        if mi < om.len() {
            pairs.push((prefix + mi, prefix + mj, true));
        }
        gi = mi + 1;
        gj = mj + 1;
    }
    pairs.extend((0..suffix).map(|k| (o_end + k, n_end + k, true)));

    let mut out = Carried::default();
    let mut paired = vec![false; old.blocks.len()];
    for (oi, ni, equal) in pairs {
        paired[oi] = true;
        let id = old.blocks[oi].id;
        new.blocks[ni].id = id;
        if !equal && old.blocks[oi].text != new.blocks[ni].text {
            out.changed.push((id, new.blocks[ni].text.clone()));
        }
    }
    let mut last = None;
    for (b, kept) in old.blocks.iter().zip(paired) {
        if kept {
            last = Some(b.id);
        } else {
            out.removed.push((b.id, last));
        }
    }
    out
}
