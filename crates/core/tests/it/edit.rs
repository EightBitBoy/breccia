use breccia_core::{BlockId, Carried, Config, Document, EditError, IdGen, carry_ids, parse};
use chrono::NaiveDate;

fn with<F: FnOnce(&mut Document, &[BlockId], &mut IdGen)>(src: &str, f: F) -> String {
    let mut ids = IdGen::new();
    let mut d = parse(src, &mut ids);
    let b: Vec<_> = d.blocks().iter().map(|b| b.id()).collect();
    f(&mut d, &b, &mut ids);
    d.render()
}

fn shape(d: &Document) -> Vec<(usize, String)> {
    d.blocks()
        .iter()
        .map(|b| (b.depth(), b.text().to_string()))
        .collect()
}

#[test]
fn indent_outdent() {
    assert_eq!(
        with("- a\n- b\n- c\n", |d, b, _| d.indent(b[1]).unwrap()),
        "- a\n\t- b\n- c\n"
    );
    assert_eq!(
        with("- a\n  - b\n- c\n", |d, b, _| d.indent(b[2]).unwrap()),
        "- a\n  - b\n  - c\n"
    );
    assert_eq!(
        with("- a\n\t- b\n\t- c\n", |d, b, _| d.outdent(b[1]).unwrap()),
        "- a\n- b\n\t- c\n"
    );
    assert_eq!(
        with("- a\n\t- b\n\t\t- x\n", |d, b, _| d.outdent(b[1]).unwrap()),
        "- a\n- b\n\t- x\n"
    );
    assert_eq!(
        with("- a\n", |d, b, _| assert_eq!(
            d.indent(b[0]),
            Err(EditError::NoPreviousSibling)
        )),
        "- a\n"
    );
}

#[test]
fn edge_errors() {
    with("- a\n\t- b\n", |d, b, ids| {
        assert_eq!(d.outdent(b[0]), Err(EditError::NoParent));
        assert_eq!(d.move_up(b[1]), Err(EditError::NoPreviousSibling));
        assert_eq!(d.merge_into_previous(b[0], ids), Err(EditError::NoPrevious));
        assert_eq!(d.split(b[0], 2, ids), Err(EditError::InvalidOffset));
        assert_eq!(d.indent(BlockId(999)), Err(EditError::UnknownBlock));
        assert_eq!(
            d.insert_after(Some(BlockId(999)), "x", ids),
            Err(EditError::UnknownBlock)
        );
    });
    with("- ä\n", |d, b, ids| {
        assert_eq!(d.split(b[0], 1, ids), Err(EditError::InvalidOffset));
    });
}

#[test]
fn tree_queries() {
    let d = parse("- a\n\t- b\n\t\t- c\n\t- d\n- e\n", &mut IdGen::new());
    let b: Vec<_> = d.blocks().iter().map(|b| b.id()).collect();
    assert_eq!(d.index_of(b[3]), Some(3));
    assert_eq!(d.parent_of(b[2]), Some(b[1]));
    assert_eq!(d.parent_of(b[0]), None);
    assert_eq!(d.children_of(b[0]), vec![b[1], b[3]]);
    assert_eq!(d.subtree_end(0), 4);
    assert_eq!(d.subtree_end(1), 3);
}

#[test]
fn moves_keep_raw_bytes() {
    assert_eq!(
        with("- a  \n\t- x\n- b\n", |d, b, _| d.move_down(b[0]).unwrap()),
        "- b\n- a  \n\t- x\n"
    );
    assert_eq!(
        with("- a  \n\t- x\n- b\n", |d, b, _| d.move_up(b[2]).unwrap()),
        "- b\n- a  \n\t- x\n"
    );
    assert_eq!(
        with("- a\n- b\n", |d, b, _| assert_eq!(
            d.move_down(b[1]),
            Err(EditError::NoNextSibling)
        )),
        "- a\n- b\n"
    );
}

#[test]
fn split_and_merge() {
    assert_eq!(
        with("- hello world\n", |d, b, ids| {
            d.split(b[0], 5, ids).unwrap();
        }),
        "- hello\n- world\n"
    );
    // a block with children gets the new block as its first child; an empty first line renders as a bare "-"
    assert_eq!(
        with("- a\n\t- c\n", |d, b, ids| {
            d.split(b[0], 1, ids).unwrap();
        }),
        "- a\n\t-\n\t- c\n"
    );
    assert_eq!(
        with("- a\n- b\n\t- c\n", |d, b, ids| assert_eq!(
            d.merge_into_previous(b[1], ids).unwrap(),
            (b[0], 1)
        )),
        "- ab\n\t- c\n"
    );
    assert_eq!(
        with("- a\n\t- x\n- \n", |d, b, ids| assert_eq!(
            d.merge_into_previous(b[2], ids).unwrap(),
            (b[1], 1)
        )),
        "- a\n\t- x\n"
    );
}

#[test]
fn merge_reparents_children_deeper() {
    let out = with("- a\n\t- x\n- b\n\t- c\n", |d, b, ids| {
        assert_eq!(d.merge_into_previous(b[2], ids).unwrap(), (b[1], 1));
    });
    assert_eq!(out, "- a\n\t- xb\n\t\t- c\n");
}

#[test]
fn merge_that_would_leave_a_fence_open_is_refused() {
    // "```x" no longer closes the fence; closing it would invent a line
    for src in ["- ```\n  code\n  ```\n- x\n", "- ``\n- `\n- z\n"] {
        assert_eq!(
            with(src, |d, b, ids| assert_eq!(
                d.merge_into_previous(b[1], ids),
                Err(EditError::WouldChangeStructure)
            )),
            src
        );
    }
}

#[test]
fn split_inside_fence_is_refused() {
    let src = "- ```\n  one\n  two\n  ```\n";
    // right after "one\n"
    assert_eq!(
        with(src, |d, b, ids| assert_eq!(
            d.split(b[0], 8, ids),
            Err(EditError::InsideFence)
        )),
        src
    );
    // at the end of the opener line
    let src = "- ```\n  x\n  ```\n- z\n";
    assert_eq!(
        with(src, |d, b, ids| assert_eq!(
            d.split(b[0], 3, ids),
            Err(EditError::InsideFence)
        )),
        src
    );
    // through the opener: the right part would open a fence
    let src = "- ```\n  x\n  ```\n";
    assert_eq!(
        with(src, |d, b, ids| assert_eq!(
            d.split(b[0], 1, ids),
            Err(EditError::InsideFence)
        )),
        src
    );
    // after the closed fence is fine; the left part keeps its line break
    assert_eq!(
        with("- ```\n  x\n  ```\n  y\n", |d, b, ids| {
            d.split(b[0], 10, ids).unwrap();
        }),
        "- ```\n  x\n  ```\n\n- y\n"
    );
}

#[test]
fn merge_with_bullet_line_splices_blocks() {
    // prev text "a\n" ends in a blank continuation line, so "a\n" + "- y"
    // puts a bullet line into the text; it becomes a block of its own,
    // ahead of the merged block's re-parented child.
    let mut ids = IdGen::new();
    let mut d = parse("- a\n\n- - y\n\t- c\n", &mut ids);
    let b: Vec<_> = d.blocks().iter().map(|b| b.id()).collect();
    // the cursor offset is clamped to the shortened text "a"
    assert_eq!(d.merge_into_previous(b[1], &mut ids).unwrap(), (b[0], 1));
    assert_eq!(shape(&d), shape(&parse(&d.render(), &mut IdGen::new())));
    let got: Vec<_> = d.blocks().iter().map(|b| (b.depth(), b.text())).collect();
    assert_eq!(got, vec![(0, "a"), (1, "y"), (1, "c")]);
    assert_eq!(d.blocks()[2].id(), b[2]);
}

#[test]
fn depth_changes_take_neighbour_indents() {
    // indent_unit is "   " here
    assert_eq!(
        with("- a\n   - b\n   - c\n- d\n", |d, b, _| d
            .indent(b[3])
            .unwrap()),
        "- a\n   - b\n   - c\n   - d\n"
    );
    // indent_unit is "\t", but the previous sibling c uses two spaces; a
    // "\t" indent would make d a child of c on re-read
    assert_eq!(
        with("- a\n\t- b\n  - c\n- d\n", |d, b, _| d
            .indent(b[3])
            .unwrap()),
        "- a\n\t- b\n  - c\n  - d\n"
    );
    // a moved block keeps its bytes unless its width would re-read it at
    // another depth: b's 3 spaces after e's tab would make it e's sibling
    assert_eq!(
        with("- a\n   - b\n  - c\n\t- e\n- d\n", |d, b, _| d
            .move_down(b[1])
            .unwrap()),
        "- a\n  - c\n\t- e\n  - b\n- d\n"
    );
    // a first child takes its parent's indent plus indent_unit
    assert_eq!(
        with("  - a\n  - b\n", |d, b, _| d.indent(b[1]).unwrap()),
        "  - a\n  \t- b\n"
    );
}

#[test]
fn block_after_an_unclosed_fence_closes_it() {
    let out = with("- ```\n  x", |d, _, ids| {
        d.insert_after(None, "z", ids).unwrap();
    });
    assert_eq!(out, "- ```\n  x\n  ```\n- z\n");
    let out = with("- a\n- ```\n  x", |d, b, _| d.move_up(b[1]).unwrap());
    assert_eq!(parse(&out, &mut IdGen::new()).blocks().len(), 2, "{out:?}");
    // the closing line repeats the opener's run exactly
    let out = with("- ````\n  x", |d, _, ids| {
        d.insert_after(None, "z", ids).unwrap();
    });
    assert_eq!(out, "- ````\n  x\n  ````\n- z\n");
}

#[test]
fn former_last_block_without_open_fence_keeps_its_bytes() {
    // a lone CR in a block Breccia never edited must survive
    let src = "- a\n- b\rc";
    let mut ids = IdGen::new();
    let mut d = parse(src, &mut ids);
    let b: Vec<_> = d.blocks().iter().map(|b| b.id()).collect();
    d.insert_after(None, "z", &mut ids).unwrap();
    assert_eq!(d.blocks()[1].raw(), Some("- b\rc"));
    assert_eq!(d.render(), "- a\n- b\rc\n- z\n");
    d.move_up(b[1]).unwrap();
    assert_eq!(d.blocks()[0].raw(), Some("- b\rc"));
    assert_eq!(d.render(), "- b\rc\n- a\n- z\n");
}

#[test]
fn existing_lone_cr_survives_merge_and_split() {
    assert_eq!(
        with("- a\rb\n- c\n", |d, b, ids| assert_eq!(
            d.merge_into_previous(b[1], ids).unwrap(),
            (b[0], 3)
        )),
        "- a\rbc\n"
    );
    assert_eq!(
        with("- a\rb c\n", |d, b, ids| {
            d.split(b[0], 3, ids).unwrap();
        }),
        "- a\rb\n- c\n"
    );
    assert_eq!(
        with("- x a\rb\n", |d, b, ids| {
            d.split(b[0], 1, ids).unwrap();
        }),
        "- x\n- a\rb\n"
    );
}

#[test]
fn set_text_closes_a_long_fence_with_its_own_run() {
    let out = with("- a\n- z\n", |d, b, ids| {
        d.set_text(b[0], "````\ncode", ids).unwrap();
    });
    let d = parse(&out, &mut IdGen::new());
    assert_eq!(d.blocks().len(), 2, "{out:?}");
    assert_eq!(d.blocks()[0].text(), "````\ncode\n````");
}

#[test]
fn insert_and_delete() {
    assert_eq!(
        with("- a\n\t- x\n- b\n", |d, b, ids| {
            d.insert_after(Some(b[0]), "new", ids).unwrap();
        }),
        "- a\n\t- x\n- new\n- b\n"
    );
    assert_eq!(
        with("", |d, _, ids| {
            d.insert_after(None, "first", ids).unwrap();
        }),
        "- first\n"
    );
    assert_eq!(
        with("- a\n\t- x\n- b\n", |d, b, _| d.delete(b[0]).unwrap()),
        "- b\n"
    );
}

#[test]
fn delete_block_takes_the_subtree() {
    assert_eq!(
        with("- a\n- b\n\t- c\n- d\n", |d, b, _| assert_eq!(
            d.delete_block(b[1]),
            Ok(None)
        )),
        "- a\n- d\n"
    );
    // A last child of a page of several blocks goes like any other block.
    assert_eq!(
        with("- a\n\t- c\n", |d, b, _| assert_eq!(
            d.delete_block(b[1]),
            Ok(None)
        )),
        "- a\n"
    );
}

#[test]
fn delete_block_keeps_an_emptied_only_block() {
    assert_eq!(
        with("- a\n\t- c\n\t\t- e\n", |d, b, _| assert_eq!(
            d.delete_block(b[0]),
            Ok(Some(b[0]))
        )),
        "-\n"
    );
    assert_eq!(
        with("- a\n", |d, b, _| assert_eq!(
            d.delete_block(b[0]),
            Ok(Some(b[0]))
        )),
        "-\n"
    );
}

#[test]
fn delete_block_refuses_an_unknown_block() {
    assert_eq!(
        with("- a\n", |d, _, _| assert_eq!(
            d.delete_block(BlockId(9999)),
            Err(EditError::UnknownBlock)
        )),
        "- a\n"
    );
}

#[test]
fn set_text_with_bullet_lines_creates_blocks() {
    let out = with("- a\n- z\n", |d, b, ids| {
        let extra = d.set_text(b[0], "a\n- b\n  - c", ids).unwrap();
        assert_eq!(extra.len(), 2);
    });
    let d = parse(&out, &mut IdGen::new());
    let got: Vec<_> = d.blocks().iter().map(|b| (b.depth(), b.text())).collect();
    assert_eq!(got, vec![(0, "a"), (1, "b"), (2, "c"), (0, "z")]);
}

#[test]
fn set_text_closes_an_unclosed_fence() {
    let out = with("- a\n- z\n", |d, b, ids| {
        d.set_text(b[0], "```\ncode", ids).unwrap();
    });
    let d = parse(&out, &mut IdGen::new());
    assert_eq!(d.blocks().len(), 2, "{out:?}");
    assert_eq!(d.blocks()[0].text(), "```\ncode\n```");
}

#[test]
fn set_text_removes_cr_and_keeps_crlf_file() {
    let out = with("- a\r\n- z\r\n", |d, b, ids| {
        d.set_text(b[0], "x\r\ny", ids).unwrap();
    });
    assert_eq!(out, "- x\r\n  y\r\n- z\r\n");
}

/// Block text: the brief's alphabet, plus token runs so fences and bullet
/// lines (rare from single characters) come up often.
fn text() -> impl proptest::strategy::Strategy<Value = String> {
    use proptest::prelude::*;
    let tokens = proptest::collection::vec(
        proptest::sample::select(vec![
            "a", " ", "\t", "-", "- ", "\n", "```", "~~~", "`", "#", "[[x]]", "\r\n",
        ]),
        0..8,
    )
    .prop_map(|t| t.concat());
    prop_oneof!["[a-z \\-\\n#\\[\\]`]{0,12}", tokens]
}

/// Seed documents: the brief's tab-indented one, two-space indents, uneven
/// indent widths (b uses 3 spaces, its sibling c 2, e a tab), CRLF with a
/// lone CR inside b and the last block d, a preamble, a first block whose
/// first line opens a fence, and a BOM and CRLF preamble holding a fence
/// with a bullet line in it.
const SEEDS: [&str; 7] = [
    "- a\n\t- b\n\t\t- c\n- d\n",
    "- a\n  - b\n    - c\n- d\n",
    "- a\n   - b\n  - c\n\t- e\n- d\n",
    "- a\r\n\t- b\rx\r\n\t\t- c\r\n- d\ry\r\n",
    "title:: x\n\n- a\n\t- b\n\t\t- c\n- d\n",
    "- ```rust\n  code\n  ```\n- next\n- [[Link]]\n",
    "\u{feff}title:: x\r\nalias:: y\r\n```\r\n- not a block\r\n```\r\n- a\r\n\t- b\r\n- c\r\n",
];
/// The seed whose uneven widths can make `fix_indents` re-indent a block
/// the op did not target.
const UNEVEN: usize = 2;

proptest::proptest! {
    /// After any sequence of edits, the file re-read gives the blocks that
    /// are in memory, and blocks the edit did not touch keep their bytes.
    #[test]
    fn ops_keep_render_parse_consistent(seed in 0..SEEDS.len(), ops in proptest::collection::vec((0u8..12, 0usize..12, text()), 0..40)) {
        use std::collections::HashSet;
        let cfg = Config::default();
        let today = NaiveDate::from_ymd_opt(2026, 10, 29)
            .unwrap()
            .and_hms_opt(14, 5, 9)
            .unwrap();
        let mut ids = IdGen::new();
        let mut d = parse(SEEDS[seed], &mut ids);
        // No op touches the preamble: its bytes (after any BOM) stay put.
        let preamble = d.preamble().to_string();
        let head = if d.bom() { format!("\u{feff}{preamble}") } else { preamble.clone() };
        for (k, i, s) in ops {
            let old = d.render();
            let len = d.blocks().len();
            // The blocks the op may regenerate: its target (set_text, split),
            // its target's subtree (indent, outdent, merge), and for merge
            // the previous block, for paste its target (the blocks it adds
            // are new). Inserts and moves may regenerate none.
            let mut touched: HashSet<BlockId> = HashSet::new();
            let before: Vec<(BlockId, String, String, String)> = d
                .blocks()
                .iter()
                .filter_map(|b| Some((b.id(), b.raw()?.to_string(), b.text().to_string(), b.indent().to_string())))
                .collect();
            if len == 0 {
                let _ = d.insert_after(None, &s, &mut ids);
            } else {
                let t = i % len;
                let id = d.blocks()[t].id();
                let subtree = d.blocks()[t..d.subtree_end(t)].iter().map(|b| b.id());
                match k {
                    0 | 2 | 9 | 10 | 11 => {
                        touched.insert(id);
                    }
                    3 => {
                        touched.extend(subtree);
                        touched.extend(t.checked_sub(1).map(|p| d.blocks()[p].id()));
                    }
                    5 | 6 => touched.extend(subtree),
                    _ => {}
                }
                let result = match k {
                    0 => d.set_text(id, &s, &mut ids).map(|_| ()),
                    1 => d.insert_after(if i == 11 { None } else { Some(id) }, &s, &mut ids).map(|_| ()),
                    2 => {
                        let at = s.len() % (d.blocks()[t].text().len() + 1);
                        d.split(id, at, &mut ids).map(|_| ())
                    }
                    3 => d.merge_into_previous(id, &mut ids).map(|_| ()),
                    4 => d.delete(id),
                    5 => d.indent(id),
                    6 => d.outdent(id),
                    7 => d.move_up(id),
                    8 => d.move_down(id),
                    9 => {
                        // a default keyword, or None
                        let n = s.len() % (cfg.states.len() + 1);
                        let kw = cfg.states.get(n).map(|st| st.keyword.as_str());
                        d.set_state(id, kw, &cfg, today)
                    }
                    10 => d.cycle_state(id, &cfg, today).map(|_| ()),
                    _ => {
                        let at = i % (d.blocks()[t].text().len() + 1);
                        d.paste(id, at, &s, &mut ids).map(|_| ())
                    }
                };
                if result.is_err() {
                    proptest::prop_assert_eq!(d.render(), old.clone(), "a failed op must change nothing");
                }
            }
            let out = d.render();
            proptest::prop_assert_eq!(d.preamble(), preamble.as_str());
            proptest::prop_assert!(out.starts_with(&head), "preamble bytes changed: {:?}", out);
            let re = parse(&out, &mut IdGen::new());
            proptest::prop_assert_eq!(shape(&re), shape(&d), "{:?}", out);
            proptest::prop_assert_eq!(re.render(), out.clone());
            let unique: HashSet<_> = d.blocks().iter().map(|b| b.id()).collect();
            proptest::prop_assert_eq!(unique.len(), d.blocks().len(), "block IDs must stay unique");
            // Untouched blocks keep their exact bytes. In the uneven seed,
            // fix_indents may re-indent one: then only its indent changes.
            for (id, raw, text, indent) in &before {
                if touched.contains(id) {
                    continue;
                }
                let Some(b) = d.blocks().iter().find(|b| b.id() == *id) else {
                    continue;
                };
                if b.raw() == Some(raw.as_str()) {
                    continue;
                }
                let reindented = seed == UNEVEN && b.raw().is_none() && b.text() == text && b.indent() != indent;
                proptest::prop_assert!(reindented, "untouched block {:?} lost its bytes {:?}: {:?}", id, raw, out);
            }
        }
    }
}

#[test]
fn insert_after_none_refuses_when_preamble_ends_in_open_fence() {
    let mut ids = IdGen::new();
    let mut d = parse("```\ncode\n", &mut ids);
    assert_eq!(
        d.insert_after(None, "x", &mut ids),
        Err(EditError::WouldChangeStructure)
    );
    assert_eq!(d.render(), "```\ncode\n");
}

fn paste(src: &str, i: usize, at: usize, text: &str) -> (String, String, usize) {
    let mut ids = IdGen::new();
    let mut d = parse(src, &mut ids);
    let id = d.blocks()[i].id();
    let r = d.paste(id, at, text, &mut ids).unwrap();
    let last = d.blocks()[d.index_of(r.last).unwrap()].text().to_string();
    (d.render(), last, r.at)
}

#[test]
fn paste_plain_text_inserts_in_place() {
    assert_eq!(paste("- one two\n", 0, 4, "plain ").0, "- one plain two\n");
}
#[test]
fn paste_bullets_creates_sibling_blocks() {
    assert_eq!(paste("- x\n", 0, 1, "- a\n- b").0, "- xa\n- b\n");
    assert_eq!(
        paste("- \n", 0, 0, "- a\n\t- b\n- c").0,
        "- a\n\t- b\n- c\n"
    );
}
#[test]
fn paste_moves_text_after_cursor_to_last_block() {
    let (out, last, at) = paste("- XY\n", 0, 1, "- a\n- b");
    assert_eq!(out, "- Xa\n- bY\n");
    assert_eq!((last.as_str(), at), ("bY", 1));
}
#[test]
fn paste_normalises_indented_source_and_keeps_preamble_text() {
    assert_eq!(paste("- x\n", 0, 1, "\t- a\n\t\t- b").0, "- xa\n\t- b\n");
    assert_eq!(paste("- x\n", 0, 1, "intro\n- a").0, "- xintro\n- a\n");
}
#[test]
fn paste_under_a_nested_block_keeps_its_depth() {
    assert_eq!(
        paste("- p\n\t- x\n", 1, 1, "- a\n- b").0,
        "- p\n\t- xa\n\t- b\n"
    );
}
#[test]
fn paste_strips_cr_and_checks_offset() {
    assert_eq!(paste("- x\n", 0, 1, "- a\r\n- b\r\n").0, "- xa\n- b\n");
    let mut ids = IdGen::new();
    let mut d = parse("- ä\n", &mut ids);
    let id = d.blocks()[0].id();
    assert_eq!(d.paste(id, 1, "x", &mut ids), Err(EditError::InvalidOffset));
}

#[test]
fn paste_plain_text_returns_cursor_after_it() {
    let (out, last, at) = paste("- one two\n", 0, 4, "plain ");
    assert_eq!(
        (out.as_str(), last.as_str(), at),
        ("- one plain two\n", "one plain two", 10)
    );
}

#[test]
fn paste_keeps_existing_children_after_the_pasted_blocks() {
    // the children stay in place; re-reading makes them the last pasted
    // block's children
    let (out, last, at) = paste("- xy\n\t- c\n", 0, 1, "- a\n- b");
    assert_eq!(out, "- xa\n- by\n\t- c\n");
    assert_eq!((last.as_str(), at), ("by", 1));
}

#[test]
fn paste_that_would_leave_a_fence_open_is_refused() {
    for (src, i, at, text) in [
        // a pasted block opens a fence a following block would close
        ("- x\n- y\n", 0, 1, "- a\n- ```"),
        // plain text opens a fence in a block that is not the last
        ("- x\n- y\n", 0, 0, "```"),
        // the cursor is inside a fence: the pasted bullets would be code
        ("- ```\n  code\n  ```\n", 0, 5, "- a\n- b"),
    ] {
        let mut ids = IdGen::new();
        let mut d = parse(src, &mut ids);
        let id = d.blocks()[i].id();
        assert_eq!(
            d.paste(id, at, text, &mut ids),
            Err(EditError::WouldChangeStructure),
            "{src:?} {text:?}"
        );
        assert_eq!(d.render(), src);
    }
}

#[test]
fn paste_fenced_bullets_stay_text() {
    // bullet lines inside a fence are code, not blocks
    assert_eq!(
        paste("- x\n", 0, 1, "\n```\n- a\n```").0,
        "- x\n  ```\n  - a\n  ```\n"
    );
}

#[test]
fn paste_into_a_last_block_whose_fence_the_file_never_closes() {
    // the fence was open already and nothing follows it: no line is needed
    assert_eq!(paste("- ```\n  x", 0, 5, "y").0, "- ```\n  xy\n");
    // but blocks after it would be swallowed
    let mut ids = IdGen::new();
    let mut d = parse("- ```\n  x", &mut ids);
    let id = d.blocks()[0].id();
    assert_eq!(
        d.paste(id, 5, "- a\n- b", &mut ids),
        Err(EditError::WouldChangeStructure)
    );
}

fn carry(old: &str, new: &str) -> (Vec<BlockId>, Vec<BlockId>, Carried) {
    let mut ids = IdGen::new();
    let o = parse(old, &mut ids);
    let mut n = parse(new, &mut ids);
    let old_ids = o.blocks().iter().map(|b| b.id()).collect();
    let carried = carry_ids(&o, &mut n);
    (
        old_ids,
        n.blocks().iter().map(|b| b.id()).collect(),
        carried,
    )
}

#[test]
fn carry_keeps_ids_of_equal_blocks_and_pairs_changed_ones() {
    let (o, n, c) = carry("- a\n- b\n- c\n", "- a\n- B\n- c\n- d\n");
    assert_eq!(n[..3], o[..]);
    assert!(!o.contains(&n[3]));
    assert_eq!(c.changed, vec![(o[1], "B".to_string())]);
    assert!(c.removed.is_empty());
}

#[test]
fn carry_reports_removed_blocks_with_their_predecessor() {
    let (o, n, c) = carry("- a\n- b\n- c\n", "- a\n- c\n");
    assert_eq!(n, vec![o[0], o[2]]);
    assert_eq!(c.removed, vec![(o[1], Some(o[0]))]);
    assert!(c.changed.is_empty());
    let (o, _, c) = carry("- a\n- b\n", "- b\n");
    assert_eq!(c.removed, vec![(o[0], None)]);
}

proptest::proptest! {
    #[test]
    fn carry_ids_stay_unique(a in 0..SEEDS.len(), b in 0..SEEDS.len(), ta in text(), tb in text()) {
        let (a, b) = (format!("{}- {ta}\n", SEEDS[a]), format!("{}- {tb}\n", SEEDS[b]));
        let (o, n, c) = carry(&a, &b);
        let uniq: std::collections::HashSet<_> = n.iter().collect();
        proptest::prop_assert_eq!(uniq.len(), n.len());
        let fresh = n.iter().filter(|i| !o.contains(i)).count();
        let kept = n.len() - fresh;
        proptest::prop_assert_eq!(kept + c.removed.len(), o.len());
    }
}

#[test]
fn trailing_blank_lines_are_part_of_their_blocks_text() {
    // A blank line before the next bullet belongs to the block above it (docs/format.md, section 3): its text ends in
    // line breaks, and the editor sends them back with every change.
    let src = "- a


- b
";
    let d = parse(src, &mut IdGen::new());
    assert_eq!(
        shape(&d),
        [
            (
                0,
                "a

"
                .to_string()
            ),
            (0, "b".to_string())
        ]
    );
    let out = with(src, |d, b, ids| {
        d.set_text(
            b[0], "A

", ids,
        )
        .unwrap();
    });
    assert_eq!(
        out,
        "- A


- b
",
        "the blank lines stay when the text keeps them"
    );
    // The other half of the rule: a text without them writes none.
    let out = with(src, |d, b, ids| {
        d.set_text(b[0], "A", ids).unwrap();
    });
    assert_eq!(
        out,
        "- A
- b
"
    );
}

#[test]
fn a_paste_keeps_the_text_around_the_caret_at_every_character_boundary() {
    let text = "a😀é b";
    for at in 0..=text.len() {
        let mut ids = IdGen::new();
        let mut d = parse(&format!("- {text}\n"), &mut ids);
        let id = d.blocks()[0].id();
        let r = d.paste(id, at, "X", &mut ids);
        if text.is_char_boundary(at) {
            r.unwrap_or_else(|e| panic!("at {at}: {e:?}"));
            assert_eq!(
                d.render(),
                format!("- {}X{}\n", &text[..at], &text[at..]),
                "at {at}"
            );
        } else {
            assert!(matches!(r, Err(EditError::InvalidOffset)), "at {at}");
            assert_eq!(
                d.render(),
                format!("- {text}\n"),
                "a refused paste changes nothing"
            );
        }
    }
}

#[test]
fn a_pasted_outline_whose_last_block_is_deeper_puts_the_rest_after_it() {
    let out = with("- ab\n", |d, b, ids| {
        d.paste(b[0], 1, "- x\n\t- y\n", ids).unwrap();
    });
    assert_eq!(out, "- ax\n\t- yb\n");
}

#[test]
fn a_paste_with_a_crlf_document_and_crlf_text_keeps_crlf() {
    let out = with("- a\r\n", |d, b, ids| {
        d.paste(b[0], 1, "b\r\nc", ids).unwrap();
    });
    assert_eq!(out, "- ab\r\n  c\r\n");
}

#[test]
fn a_paste_that_starts_with_a_preamble_and_a_blank_line_loses_no_text() {
    // "intro" is no bullet, so it joins the block at the caret; the blank line after it stays with that block.
    let out = with(
        "- ab
",
        |d, b, ids| {
            d.paste(
                b[0],
                1,
                "intro

- x
",
                ids,
            )
            .unwrap();
        },
    );
    assert_eq!(
        out,
        "- aintro

- xb
"
    );
}

#[test]
fn a_re_read_of_the_rendered_text_keeps_every_id() {
    let mut ids = IdGen::new();
    let old = parse("- a\n\t- b\n- c\n\t- d\n", &mut ids);
    let mut new = parse(&old.render(), &mut ids);
    let carried = carry_ids(&old, &mut new);
    let ids_of = |d: &Document| d.blocks().iter().map(|b| b.id()).collect::<Vec<_>>();
    assert_eq!(ids_of(&new), ids_of(&old));
    assert!(carried.changed.is_empty() && carried.removed.is_empty());
}

#[test]
fn a_reload_that_moves_a_block_keeps_the_ids_of_the_ones_that_stayed() {
    let mut ids = IdGen::new();
    let old = parse("- a\n- b\n- c\n", &mut ids);
    let (a, b, c) = (
        old.blocks()[0].id(),
        old.blocks()[1].id(),
        old.blocks()[2].id(),
    );
    let mut new = parse("- c\n- a\n- b\n", &mut ids);
    let carried = carry_ids(&old, &mut new);
    let got: Vec<BlockId> = new.blocks().iter().map(|b| b.id()).collect();
    println!("IDS old a,b,c = {a:?} {b:?} {c:?}; new = {got:?}; carried = {carried:?}");
    assert_eq!((got[1], got[2]), (a, b), "a and b stayed in order");
}
