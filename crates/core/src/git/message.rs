//! The generated commit message.

use std::cmp::Ordering;
use std::path::{Path, PathBuf};

/// One staged change in the notes folder, folder-relative.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Change {
    Added(PathBuf),
    Modified(PathBuf),
    Deleted(PathBuf),
    Renamed { from: PathBuf, to: PathBuf },
}

/// The subject is cut down to about this many characters (Git tools' usual width).
pub const SUBJECT_MAX: usize = 72;

/// A name as it goes into a commit subject: a control character (a newline in
/// a file name, say) would end or break the subject line, so it becomes a space.
fn clean(name: String) -> String {
    name.chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect()
}

fn parts(path: &Path) -> Vec<String> {
    path.components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect()
}

/// How a file is named, and where it sorts: pages (by name), journal days
/// (newest first), settings, then other files (by file name).
#[derive(Clone, Debug, PartialEq, Eq)]
struct Name {
    rank: u8,
    text: String,
}

impl Name {
    fn of(path: &Path) -> Name {
        let p = parts(path);
        let file = p.last().cloned().unwrap_or_default();
        let stem = || {
            path.file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| file.clone())
        };
        let is_md = path.extension().is_some_and(|e| e == "md");
        let (rank, text) = if p.len() >= 2 && p[0] == "pages" && is_md {
            (0, stem())
        } else if p.len() == 2 && p[0] == "journals" && is_md {
            (1, stem())
        } else if p.len() == 2 && p[0] == "breccia" && p[1] == "config.toml" {
            (2, "settings".to_string())
        } else {
            (3, file.clone())
        };
        Name {
            rank,
            text: clean(text),
        }
    }

    fn cmp(&self, other: &Name) -> Ordering {
        self.rank.cmp(&other.rank).then_with(|| match self.rank {
            1 => other.text.cmp(&self.text),
            _ => (self.text.to_lowercase(), &self.text)
                .cmp(&(other.text.to_lowercase(), &other.text)),
        })
    }
}

/// `add Meeting notes; update Project X, 2026-11-03 +1; rename Old -> New; delete Draft`.
///
/// Groups come in the order add, update, rename, move, delete; empty groups are
/// left out, and `; ` separates them. Names are page names (the file stem of
/// `pages/**.md`), journal days (`journals/*.md`, newest first), `settings`
/// (`breccia/config.toml`) and the file names of other files, without repeats.
/// A rename that keeps the name (a page moved to another folder) is a `move`.
/// While the subject is longer than [`SUBJECT_MAX`] characters, the group with
/// the most names shown drops its last one into a `+N`; every group keeps at
/// least one name, so a subject of long names can stay longer.
///
/// A page whose name lives in `title::` (a name a file cannot hold) shows its
/// file stem, because only paths are known here.
pub fn commit_message(changes: &[Change]) -> String {
    let mut add = Vec::new();
    let mut update = Vec::new();
    let mut rename = Vec::new();
    let mut moved = Vec::new();
    let mut delete = Vec::new();
    for c in changes {
        match c {
            Change::Added(p) => add.push(Name::of(p)),
            Change::Modified(p) => update.push(Name::of(p)),
            Change::Deleted(p) => delete.push(Name::of(p)),
            Change::Renamed { from, to } => {
                let (from, to) = (Name::of(from), Name::of(to));
                if from.text == to.text {
                    moved.push(to);
                } else {
                    rename.push(Name {
                        rank: from.rank,
                        text: format!("{} -> {}", from.text, to.text),
                    });
                }
            }
        }
    }
    let mut groups: Vec<(&str, Vec<String>, usize)> = Vec::new();
    for (verb, mut names) in [
        ("add", add),
        ("update", update),
        ("rename", rename),
        ("move", moved),
        ("delete", delete),
    ] {
        names.sort_by(Name::cmp);
        names.dedup();
        if !names.is_empty() {
            let shown = names.len();
            groups.push((verb, names.into_iter().map(|n| n.text).collect(), shown));
        }
    }
    if groups.is_empty() {
        return "update notes".into();
    }
    let render = |groups: &[(&str, Vec<String>, usize)]| {
        groups
            .iter()
            .map(|(verb, names, shown)| {
                let mut s = format!("{verb} {}", names[..*shown].join(", "));
                if *shown < names.len() {
                    s.push_str(&format!(" +{}", names.len() - shown));
                }
                s
            })
            .collect::<Vec<_>>()
            .join("; ")
    };
    loop {
        let subject = render(&groups);
        if subject.chars().count() <= SUBJECT_MAX {
            return subject;
        }
        // The group with the most names shown gives one up (the later one on a tie).
        let Some(g) = groups
            .iter_mut()
            .filter(|g| g.2 > 1)
            .max_by(|a, b| a.2.cmp(&b.2))
        else {
            return subject;
        };
        g.2 -= 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(s: &str) -> PathBuf {
        PathBuf::from_iter(s.split('/'))
    }
    fn m(s: &str) -> Change {
        Change::Modified(p(s))
    }

    #[test]
    fn groups_come_in_order_with_their_names() {
        assert_eq!(
            commit_message(&[
                Change::Deleted(p("pages/Old idea.md")),
                m("pages/Project X.md"),
                Change::Added(p("pages/Meeting notes.md")),
            ]),
            "add Meeting notes; update Project X; delete Old idea"
        );
    }

    #[test]
    fn pages_then_days_newest_first_then_settings_then_files() {
        assert_eq!(
            commit_message(&[
                m("breccia/config.toml"),
                m("journals/2026-11-02.md"),
                m("assets/z.png"),
                m("pages/b.md"),
                m("journals/2026-11-03.md"),
                m("pages/Projects/A.md"),
            ]),
            "update A, b, 2026-11-03, 2026-11-02, settings, z.png"
        );
    }

    #[test]
    fn renames_show_both_names_and_moves_one() {
        assert_eq!(
            commit_message(&[
                Change::Renamed {
                    from: p("pages/Old.md"),
                    to: p("pages/New.md")
                },
                Change::Renamed {
                    from: p("pages/A.md"),
                    to: p("pages/Archive/A.md")
                },
            ]),
            "rename Old -> New; move A"
        );
    }

    #[test]
    fn a_long_subject_is_cut_to_counts() {
        let many: Vec<Change> = (0..30)
            .map(|i| m(&format!("pages/Page number {i:02}.md")))
            .collect();
        let s = commit_message(&many);
        assert!(s.chars().count() <= SUBJECT_MAX, "{s}");
        assert!(
            s.starts_with("update Page number 00, Page number 01"),
            "{s}"
        );
        let shown = s.matches("Page number").count();
        assert!(s.ends_with(&format!(" +{}", 30 - shown)), "{s}");
    }

    #[test]
    fn the_biggest_group_gives_up_names_first() {
        let mut c: Vec<Change> = (0..6)
            .map(|i| m(&format!("pages/Updated page {i}.md")))
            .collect();
        c.push(Change::Added(p("pages/Brand new page.md")));
        c.push(Change::Deleted(p("pages/X.md")));
        assert_eq!(
            commit_message(&c),
            "add Brand new page; update Updated page 0, Updated page 1 +4; delete X"
        );
    }

    #[test]
    fn repeats_are_named_once_and_nothing_gives_a_plain_subject() {
        assert_eq!(
            commit_message(&[m("assets/z.png"), m("x/z.png")]),
            "update z.png"
        );
        assert_eq!(commit_message(&[]), "update notes");
    }

    #[test]
    fn control_characters_in_names_become_spaces() {
        let s = commit_message(&[m("pages/a\nb.md")]);
        assert_eq!(s, "update a b");
    }
}
