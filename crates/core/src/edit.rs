//! Outliner edits on a [`Document`]: block text and outline structure.
//!
//! Every edit keeps the document consistent with its file: `parse(render())`
//! gives back the blocks in memory. Blocks an edit does not touch keep their
//! `raw` bytes; a block whose text or depth changes is regenerated.

use crate::error::EditError;
use crate::outline::{
    Block, BlockId, Document, IdGen, LineEnding, closing_fence, front_matter_len, parse,
    regenerate, ws_width,
};

/// Blocks as a re-read of the file would see them: (depth relative to the
/// first block, text). The first entry always exists and has depth 0.
type Fragment = Vec<(usize, String)>;

/// Where a paste ended: the last block it wrote to, and the UTF-8 byte
/// offset in that block's text just before the text that followed the
/// cursor.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PasteResult {
    pub last: BlockId,
    pub at: usize,
}

/// Regenerates `text` as a top-level block with no indent.
fn regen_plain(text: &str, le: LineEnding) -> String {
    let block = Block {
        id: BlockId(0),
        depth: 0,
        indent: String::new(),
        text: text.to_string(),
        raw: None,
    };
    regenerate(&block, le)
}

/// New text from the user: `\r` is removed. Text already in the document
/// keeps its bytes.
fn user_text(text: &str) -> String {
    text.chars().filter(|&c| c != '\r').collect()
}

/// Re-reads regenerated block bytes as a fragment.
fn reread(src: &str) -> Fragment {
    parse(src, &mut IdGen::new())
        .blocks
        .into_iter()
        .map(|b| (b.depth, b.text))
        .collect()
}

impl Document {
    /// Parses `text` as one block's text, the way a re-read of the file
    /// would. If the text ends inside an open fence, a closing line with the
    /// opener's marker run is appended, so the fence cannot swallow the
    /// blocks after it.
    fn fragment(&self, text: &str) -> Fragment {
        let le = self.line_ending;
        let src = regen_plain(text, le);
        match closing_fence(&src) {
            Some(close) => reread(&regen_plain(&format!("{text}\n{close}"), le)),
            None => reread(&src),
        }
    }

    /// Whether `text`, written as a block, ends inside an open fence.
    fn ends_in_fence(&self, text: &str) -> bool {
        closing_fence(&regen_plain(text, self.line_ending)).is_some()
    }

    /// Replaces a block's text with `text` that Breccia derived from it (a
    /// state change), only if the outline stays as it is: `text` must
    /// re-read as exactly one block, and must not end inside an open fence
    /// unless the old text already did (which only the last block can).
    /// No fence lines are added. A refused change leaves the document as it
    /// was.
    pub(crate) fn replace_keeping_structure(
        &mut self,
        id: BlockId,
        text: &str,
    ) -> Result<(), EditError> {
        let i = self.find(id)?;
        let frag = reread(&regen_plain(text, self.line_ending));
        if frag.len() != 1
            || (self.ends_in_fence(text) && !self.ends_in_fence(&self.blocks[i].text))
        {
            return Err(EditError::WouldChangeStructure);
        }
        // One block: no new IDs are handed out.
        self.store(i, frag, &mut IdGen::new()).map(|_| ())
    }
}

impl Document {
    pub fn index_of(&self, id: BlockId) -> Option<usize> {
        self.blocks.iter().position(|b| b.id == id)
    }

    pub fn parent_of(&self, id: BlockId) -> Option<BlockId> {
        let i = self.index_of(id)?;
        let depth = self.blocks[i].depth;
        self.blocks[..i]
            .iter()
            .rev()
            .find(|b| b.depth < depth)
            .map(|b| b.id)
    }

    pub fn children_of(&self, id: BlockId) -> Vec<BlockId> {
        let Some(i) = self.index_of(id) else {
            return Vec::new();
        };
        let depth = self.blocks[i].depth;
        self.blocks[i + 1..self.subtree_end(i)]
            .iter()
            .filter(|b| b.depth == depth + 1)
            .map(|b| b.id)
            .collect()
    }

    /// Exclusive index of the end of the subtree of the block at `index`.
    pub fn subtree_end(&self, index: usize) -> usize {
        let Some(block) = self.blocks.get(index) else {
            return self.blocks.len();
        };
        (index + 1..self.blocks.len())
            .find(|&j| self.blocks[j].depth <= block.depth)
            .unwrap_or(self.blocks.len())
    }

    /// Sets the block's text. Lines of `text` that are bullet lines outside a
    /// fence become new blocks after it; their IDs are returned.
    pub fn set_text(
        &mut self,
        id: BlockId,
        text: &str,
        ids: &mut IdGen,
    ) -> Result<Vec<BlockId>, EditError> {
        let i = self.find(id)?;
        let extras = self.store(i, self.fragment(&user_text(text)), ids)?;
        self.fix_indents();
        Ok(extras)
    }

    /// Inserts a block: with `Some(id)`, the next sibling after `id`'s
    /// subtree; with `None`, a top-level block at the end (refused with
    /// [`EditError::WouldChangeStructure`] if the preamble ends in an open fence).
    pub fn insert_after(
        &mut self,
        after: Option<BlockId>,
        text: &str,
        ids: &mut IdGen,
    ) -> Result<BlockId, EditError> {
        let last = self.blocks.last().map(|b| b.id);
        let (pos, depth, indent) = match after {
            Some(id) => {
                let i = self.find(id)?;
                let b = &self.blocks[i];
                (self.subtree_end(i), b.depth, b.indent.clone())
            }
            None => {
                // A preamble left in an open fence would swallow the new
                // block; closing it would mean inventing a fence line.
                let after_front = &self.preamble[front_matter_len(&self.preamble).unwrap_or(0)..];
                if closing_fence(after_front).is_some() {
                    return Err(EditError::WouldChangeStructure);
                }
                let indent = self
                    .blocks
                    .iter()
                    .rev()
                    .find(|b| b.depth == 0)
                    .map_or_else(String::new, |b| b.indent.clone());
                (self.blocks.len(), 0, indent)
            }
        };
        let new = self.insert_block(pos, depth, indent, &user_text(text), ids);
        self.seal_former_last(last);
        self.fix_indents();
        Ok(new)
    }

    /// Splits the block at byte offset `at` (Enter). The new block holds the
    /// right part; it becomes the first child if the block has children,
    /// else the next sibling. A split that leaves either part ending inside
    /// an open fence (a split inside a fence, or before a fence the file
    /// never closes, or through a fence opener) is refused with
    /// [`EditError::InsideFence`]: it would need fence lines the user did
    /// not type.
    pub fn split(&mut self, id: BlockId, at: usize, ids: &mut IdGen) -> Result<BlockId, EditError> {
        let i = self.find(id)?;
        let text = &self.blocks[i].text;
        if at > text.len() || !text.is_char_boundary(at) {
            return Err(EditError::InvalidOffset);
        }
        let left = text[..at].trim_end_matches([' ', '\t']).to_string();
        let right = text[at..].trim_start_matches([' ', '\t']).to_string();
        if self.ends_in_fence(&left) || self.ends_in_fence(&right) {
            return Err(EditError::InsideFence);
        }
        let first_child_indent =
            (self.subtree_end(i) > i + 1).then(|| self.blocks[i + 1].indent.clone());

        let extras = self.store(i, self.fragment(&left), ids)?.len();
        let block = &self.blocks[i];
        let (pos, depth, indent) = match first_child_indent {
            Some(indent) => (i + 1 + extras, block.depth + 1, indent),
            None => (self.subtree_end(i), block.depth, block.indent.clone()),
        };
        let new = self.insert_block(pos, depth, indent, &right, ids);
        self.fix_indents();
        Ok(new)
    }

    /// Appends the block's text to the preceding block (Backspace at the
    /// start). The block's children move under the previous block. Returns
    /// the previous block and the cursor offset in its new text (its old
    /// text length, at most the new length).
    /// If the merged text holds bullet lines, they become new blocks after
    /// the previous block, ahead of the re-parented children.
    /// A merge whose text would end inside an open fence (for example text
    /// joined onto a fence's closing line) would need a fence line the user
    /// did not type; it is refused with [`EditError::WouldChangeStructure`].
    pub fn merge_into_previous(
        &mut self,
        id: BlockId,
        ids: &mut IdGen,
    ) -> Result<(BlockId, usize), EditError> {
        let i = self.find(id)?;
        if i == 0 {
            return Err(EditError::NoPrevious);
        }
        let p = i - 1;
        let offset = self.blocks[p].text.len();
        let (from, to) = (self.blocks[i].depth, self.blocks[p].depth);
        let children = self.subtree_end(i) - i - 1;
        let joined = format!("{}{}", self.blocks[p].text, self.blocks[i].text);
        if self.ends_in_fence(&joined) {
            return Err(EditError::WouldChangeStructure);
        }
        self.blocks.remove(i);
        let extras = self.store(p, self.fragment(&joined), ids)?.len();
        // Shift the children only now, so their indents follow the blocks
        // that end up before them.
        let start = p + 1 + extras;
        for j in start..start + children {
            let depth = self.blocks[j].depth + to - from;
            self.set_depth(j, depth);
        }
        self.fix_indents();
        // A bullet line split off at the join can shorten the text (a
        // trailing blank line goes); keep the cursor inside it.
        let prev = &self.blocks[p];
        Ok((prev.id, offset.min(prev.text.len())))
    }

    /// Pastes `text` into the block at byte offset `at` (`\r` is removed).
    /// Text without bullet lines is inserted in place. With bullet lines,
    /// a non-blank preamble (else the first pasted block) joins the text
    /// before the cursor; the other pasted blocks follow the block, ahead of
    /// its children, at their depth relative to the shallowest pasted block,
    /// and the text after the cursor goes onto the last of them. The
    /// block's children stay in place; re-reading decides their parent.
    /// A result that would re-read differently, or leave a fence open that
    /// was not open before, is refused with
    /// [`EditError::WouldChangeStructure`]: closing it would mean inventing
    /// a fence line.
    pub fn paste(
        &mut self,
        id: BlockId,
        at: usize,
        text: &str,
        ids: &mut IdGen,
    ) -> Result<PasteResult, EditError> {
        let i = self.find(id)?;
        let old = &self.blocks[i].text;
        if at > old.len() || !old.is_char_boundary(at) {
            return Err(EditError::InvalidOffset);
        }
        let (before, after) = old.split_at(at);
        let text = user_text(text);
        let pasted = parse(&text, &mut IdGen::new());

        let mut pieces: Fragment = if pasted.blocks.is_empty() {
            vec![(0, format!("{before}{text}"))]
        } else {
            let shallowest = pasted.blocks.iter().map(|b| b.depth).min().unwrap_or(0);
            let mut rest = pasted
                .blocks
                .into_iter()
                .map(|b| (b.depth - shallowest, b.text));
            let first = if pasted.preamble.trim().is_empty() {
                rest.next().map(|(_, t)| t).unwrap_or_default()
            } else {
                let p = &pasted.preamble;
                p.strip_suffix('\n').unwrap_or(p).to_string()
            };
            std::iter::once((0, format!("{before}{first}")))
                .chain(rest)
                .collect()
        };
        let n = pieces.len() - 1;
        let cursor = pieces[n].1.len();
        pieces[n].1.push_str(after);

        // Each piece must re-read as itself, one block, with no fence left
        // open; only a last block that already ended in an open fence may
        // keep ending in one (nothing follows it).
        let open_before = self.ends_in_fence(old);
        for (k, (_, t)) in pieces.iter().enumerate() {
            let back = reread(&regen_plain(t, self.line_ending));
            if back.len() != 1
                || back[0].1 != *t
                || (self.ends_in_fence(t) && !(k == n && open_before))
            {
                return Err(EditError::WouldChangeStructure);
            }
        }

        let new = self.store(i, pieces, ids)?;
        self.fix_indents();
        Ok(PasteResult {
            last: new.last().copied().unwrap_or(id),
            at: cursor,
        })
    }

    /// Removes the block with its subtree.
    pub fn delete(&mut self, id: BlockId) -> Result<(), EditError> {
        let i = self.find(id)?;
        let end = self.subtree_end(i);
        self.blocks.drain(i..end);
        self.fix_indents();
        Ok(())
    }

    /// Removes the block with its subtree and returns `None`. If that would
    /// leave the document without a block, the block stays instead: its text
    /// is emptied, its children go, and its id is returned.
    pub fn delete_block(&mut self, id: BlockId) -> Result<Option<BlockId>, EditError> {
        let i = self.find(id)?;
        if i == 0 && self.subtree_end(0) == self.blocks.len() {
            // The text first: it re-reads its result and may be refused.
            self.replace_keeping_structure(id, "")?;
            let i = self.find(id)?;
            let end = self.subtree_end(i);
            self.blocks.drain(i + 1..end);
            self.fix_indents();
            return Ok(Some(id));
        }
        self.delete(id)?;
        Ok(None)
    }

    /// Makes the block the last child of its previous sibling (Tab).
    pub fn indent(&mut self, id: BlockId) -> Result<(), EditError> {
        let i = self.find(id)?;
        self.prev_sibling(i).ok_or(EditError::NoPreviousSibling)?;
        for j in i..self.subtree_end(i) {
            self.set_depth(j, self.blocks[j].depth + 1);
        }
        self.fix_indents();
        Ok(())
    }

    /// Makes the block the next sibling of its parent (Shift-Tab); its
    /// following siblings become its last children.
    pub fn outdent(&mut self, id: BlockId) -> Result<(), EditError> {
        let i = self.find(id)?;
        if self.blocks[i].depth == 0 {
            return Err(EditError::NoParent);
        }
        // The following siblings stay where they are at the same depth, which
        // places them under the outdented block.
        for j in i..self.subtree_end(i) {
            self.set_depth(j, self.blocks[j].depth - 1);
        }
        self.fix_indents();
        Ok(())
    }

    /// Swaps the block's subtree with its previous sibling's (Alt-Up).
    pub fn move_up(&mut self, id: BlockId) -> Result<(), EditError> {
        let i = self.find(id)?;
        let last = self.blocks.last().map(|b| b.id);
        let p = self.prev_sibling(i).ok_or(EditError::NoPreviousSibling)?;
        let end = self.subtree_end(i);
        self.blocks[p..end].rotate_left(i - p);
        self.seal_former_last(last);
        self.fix_indents();
        Ok(())
    }

    /// Swaps the block's subtree with its next sibling's (Alt-Down).
    pub fn move_down(&mut self, id: BlockId) -> Result<(), EditError> {
        let i = self.find(id)?;
        let last = self.blocks.last().map(|b| b.id);
        let next = self.subtree_end(i);
        if self
            .blocks
            .get(next)
            .is_none_or(|b| b.depth != self.blocks[i].depth)
        {
            return Err(EditError::NoNextSibling);
        }
        let end = self.subtree_end(next);
        self.blocks[i..end].rotate_left(next - i);
        self.seal_former_last(last);
        self.fix_indents();
        Ok(())
    }

    fn find(&self, id: BlockId) -> Result<usize, EditError> {
        self.index_of(id).ok_or(EditError::UnknownBlock)
    }

    fn prev_sibling(&self, i: usize) -> Option<usize> {
        let depth = self.blocks[i].depth;
        (0..i)
            .rev()
            .find(|&j| self.blocks[j].depth <= depth)
            .filter(|&j| self.blocks[j].depth == depth)
    }

    /// Changes a block's depth; a changed depth gets the indent from
    /// [`Self::indent_for`] and regenerated bytes. The blocks before `i`
    /// must already be in place.
    fn set_depth(&mut self, i: usize, depth: usize) {
        if self.blocks[i].depth != depth {
            self.blocks[i].depth = depth;
            self.blocks[i].indent = self.indent_for(i);
            self.blocks[i].raw = None;
        }
    }

    /// The indent for the block at `i` at its depth: its previous sibling's
    /// indent if it has one, else its parent's indent plus `indent_unit`,
    /// else "" at the top level. Matching the neighbours keeps the re-read
    /// depths right in files whose indent widths are uneven.
    fn indent_for(&self, i: usize) -> String {
        let depth = self.blocks[i].depth;
        match self.blocks[..i].iter().rev().find(|b| b.depth <= depth) {
            Some(b) if b.depth == depth => b.indent.clone(),
            Some(parent) => format!("{}{}", parent.indent, self.indent_unit),
            None => String::new(),
        }
    }

    /// Re-reads the blocks' indents with the parser's width stack and gives
    /// every block that would come back at another depth the indent from
    /// [`Self::indent_for`]. Other blocks keep their bytes. This matters
    /// in files with uneven indent widths, where a moved subtree or a
    /// re-parented block can otherwise land under the wrong parent.
    fn fix_indents(&mut self) {
        let width = |indent: &str| indent.chars().map(ws_width).sum::<usize>();
        let mut stack: Vec<usize> = Vec::new();
        for j in 0..self.blocks.len() {
            let mut w = width(&self.blocks[j].indent);
            let reread = stack.iter().take_while(|&&s| s < w).count();
            if reread != self.blocks[j].depth {
                self.blocks[j].indent = self.indent_for(j);
                self.blocks[j].raw = None;
                w = width(&self.blocks[j].indent);
            }
            while stack.last().is_some_and(|&s| s >= w) {
                stack.pop();
            }
            stack.push(w);
        }
    }

    /// Inserts an empty block at `pos` and stores `text` in it.
    fn insert_block(
        &mut self,
        pos: usize,
        depth: usize,
        indent: String,
        text: &str,
        ids: &mut IdGen,
    ) -> BlockId {
        let id = ids.next();
        let block = Block {
            id,
            depth,
            indent,
            text: String::new(),
            raw: None,
        };
        self.blocks.insert(pos, block);
        // `pos` was just filled, so storing cannot fail.
        let frag = self.fragment(text);
        let _ = self.store(pos, frag, ids);
        id
    }

    /// Stores a fragment in the block at `i`: the first entry becomes its
    /// text, the rest new blocks spliced in after it. A block whose text does
    /// not change keeps its bytes. Returns the new blocks' IDs.
    fn store(
        &mut self,
        i: usize,
        frag: Fragment,
        ids: &mut IdGen,
    ) -> Result<Vec<BlockId>, EditError> {
        let mut parts = frag.into_iter();
        let Some((_, first)) = parts.next() else {
            return Ok(Vec::new());
        };
        let block = &self.blocks[i];
        let (id, depth) = (block.id, block.depth);
        if first != block.text {
            self.replace_text(id, &first)?;
        }
        let extras: Vec<Block> = parts
            .map(|(rel, text)| Block {
                id: ids.next(),
                depth: depth + rel,
                indent: String::new(),
                text,
                raw: None,
            })
            .collect();
        let new_ids: Vec<BlockId> = extras.iter().map(|b| b.id).collect();
        self.blocks.splice(i + 1..i + 1, extras);
        for k in i + 1..i + 1 + new_ids.len() {
            self.blocks[k].indent = self.indent_for(k);
        }
        Ok(new_ids)
    }

    /// The last block of a file may end inside an unclosed fence. Once
    /// another block follows it, the fence is closed so it does not swallow
    /// that block. The block's own bytes are scanned; a block whose fence is
    /// closed is left alone, byte for byte.
    fn seal_former_last(&mut self, former: Option<BlockId>) {
        let Some(i) = former.and_then(|id| self.index_of(id)) else {
            return;
        };
        if i + 1 == self.blocks.len() {
            return;
        }
        let block = &self.blocks[i];
        let src = match &block.raw {
            Some(raw) => raw.clone(),
            None => regenerate(block, self.line_ending),
        };
        if closing_fence(&src).is_none() {
            return;
        }
        // The fragment appends the closing line. An unclosed fence holds no
        // bullet lines, so this is one block; the check keeps the throwaway
        // IdGen from ever handing out IDs.
        let frag = self.fragment(&block.text);
        if frag.len() == 1 {
            let _ = self.store(i, frag, &mut IdGen::new());
        }
    }
}
