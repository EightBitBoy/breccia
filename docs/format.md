# Breccia notes format, version 8

## 1. About this document

This is the technical description of a Breccia notes folder: which files Breccia reads, what it reads from them, and
what it writes. It is meant for anyone who writes an app, a script or a converter that should work with the same folder.
You should not need to run Breccia to follow it.

The format has a version number. It goes up only when a file that already exists would be read differently (a block, a
link, a name or a state that changes). New things that only appear in new files, and changes to the app, do not change
the version. The [history](#14-format-history) at the end lists the versions.

This document describes the files. How the app behaves (screens, keys, boards, search) is described in the design
spec, [`docs/spec.md`](spec.md), which stays the authority for the app.

The examples are checked: a test in `crates/core/tests/it/format_doc.rs` reads every `example` below with Breccia's parser
and fails when the result differs from the `reads` block after it. The `reads` blocks use this notation, one item a
line, with strings written in Rust's debug form (`\n` is a line break inside a block, `\t` a tab):

- `preamble "…"`: the page-level text before the first block, without the front matter (only when there is some);
- `front-matter N lines`: the file starts with front matter of N lines, both `---` lines included;
- `title "…"`: the page name the `title::` line gives;
- `color "…"`: the page color the `color::` line gives, a name, `hue <h>`, or `hue <h> vivid <v>` (section 8);
- `alias "…"`: an alias the front matter gives (section 4);
- one line per block: its depth (0 is the top level), its task state or `-`, and its text;
- under a block, indented: each `link` (with `shown "…"` when it has its own shown text) and `tag` in text order, each
  `property` (key and value), `created` with the time the task got its state, `done` with the done date (and its
  time, when one is written), and `priority` with the task's priority (section 8).

## 2. The notes folder

```text
<notes>/
  journals/2026-10-29.md        one file per day
  pages/Project X.md            pages
  pages/Projects/Website.md     sub-folders of pages/ are the folders of the page tree
  breccia/config.toml           task states, boards and Git settings
```

Breccia reads only these places:

- `journals/`: the `.md` files directly in it. Sub-folders of `journals/` are ignored.
- `pages/`: the `.md` files in it and in all its sub-folders, at any depth. A sub-folder is a folder of the page tree;
  it is not part of the page name.
- `breccia/config.toml` (section 11). Nothing else in `breccia/` is read.

Everything else is ignored without a message: files and folders at the top level of the notes folder (including `.md`
files there), files with other extensions, and every file or folder whose name starts with `.` (for example `.git`,
`.obsidian`).

Some things are reported to the user and skipped (the folder still opens):

- a file whose extension is `.md` in another case (`.MD`, `.Md`): only `.md` is read;
- a link (symlink or junction) to a folder inside `journals/` or `pages/`: Breccia does not follow it;
- a file or folder name that is not valid Unicode;
- a file that is not valid UTF-8, or that cannot be read;
- a file in `journals/` whose name is not a date (section 5);
- a page whose name is not valid (section 4);
- a second page with the same name (section 4).

While saving, Breccia writes the new text to a temporary file `.<file name>.breccia-tmp` in the same folder (for
example `pages/.Project X.md.breccia-tmp`) and then renames it over the file. Such a file is left behind only when a
save is interrupted. Its name starts with `.`, so it is never read as a page.

When Breccia sets up Git for a folder (only on the user's request, and only in a folder that is not yet in a Git
repository), it writes these two files at the top of the notes folder, each only if it does not exist yet.

`.gitignore`:

```text
# Breccia's temporary files while saving
.*.breccia-tmp
# System files
.DS_Store
Thumbs.db
desktop.ini
```

`.gitattributes`:

```text
# Breccia saves every file with LF line endings
* text=auto eol=lf
```

## 3. Files

- Every file is UTF-8. A page or journal file that is not valid UTF-8 is not loaded, and it is reported.
- A byte order mark (BOM) at the start of a file is allowed. It is not part of the text, and Breccia keeps it when it
  saves the file.
- Breccia writes LF line endings. A file with CRLF line endings is read as it is; the first time Breccia saves it, every
  CRLF in the file becomes LF. A lone CR is not a line break and stays.
- A file Breccia does not save keeps its bytes. Breccia saves a file only when its text changed in Breccia (the user
  edited it, a rename or a state rename rewrote a link or keyword in it, or a move to another folder wrote a `title::`
  line into it), and never writes over a file that changed on disk since Breccia read it (unless the user chooses to
  keep Breccia's version).
- A new page or journal gets its file only once it has a block with text. An empty page leaves no file. Moving a page
  without a file into a folder creates its file, empty (only a `title::` line when the file name must differ from the
  name). A page file with 0 bytes is a page with no blocks.
- Breccia removes CR characters from text the user types or pastes.

## 4. Page names and file names

### The name of a page

- A journal's name is its file name without `.md` (section 5).
- A page's name is the first valid `title::` line of its preamble (section 6), or else its file name without `.md`.
  The `title::` key is matched ignoring ASCII case (`Title::`, `TITLE::`). A `title::` line whose value is not a valid
  name does not count, and the next one is tried. A `title::` line inside front matter does not count. In journals,
  `title::` is not read.
- A name is **valid** when it is not empty, does not start or end with whitespace, holds no control character
  (U+0000–U+001F, U+007F) and does not contain `[[` or `]]`. A page file whose name would not be valid is not loaded,
  and it is reported.
- A name is **linkable** when it is valid and holds none of `[`, `]` and `|`. Breccia's "new page" and "rename"
  accept only linkable names that are not dates in the journal form (`YYYY-MM-DD`). A page with an unlinkable name can
  still exist (from its file name, its `title::`, or a tag such as `#a|b`), but a `[[…]]` link cannot reach it.

### Names are case-insensitive

Pages, links and tags are matched by their **key**: the name lower-cased with Unicode's lower-case mapping
(`Project X` and `project x` have the key `project x`; `ÄRGER` has `ärger`). No other folding is done (`#project-x`
and `[[Project X]]` are different pages). Each page keeps the spelling of its name, and each link keeps the spelling
it was typed with.

### Aliases

A page can have other names, its **aliases**, which Obsidian calls the `aliases` property. Breccia reads them from the
page's front matter (section 6):

- Only the key `aliases` is read, in lower case at the start of a line. The old key `alias:` is not read.
- Three forms are read: a list with one `- name` a line (indented, as Obsidian writes it), a list on one line
  (`aliases: [a, "b"]`), and a single name (`aliases: a`). A name may be quoted (`"…"` or `'…'`); a quote counts only
  at the start of a name, so `[don't panic, dp]` is two names. Spaces around a name are trimmed, inside quotes too. A
  ` #` comment after a name or after the closing `]` is ignored, and so is a `#` comment line inside a `- name` list.
  A list spread over several lines inside brackets, and YAML block text (`|`, `>`), give no aliases and no error.
- An alias is skipped when it is not linkable (section 4, it holds `[`, `]` or `|`), when it is a date in the journal
  form (`2026-10-29`; such a name always means a journal), when it repeats an earlier alias of the page (by key), and
  when it is the page's own name. Journals can have aliases too.

A link written as an alias (`[[k8s]]`, `#k8s`, `#[[k8s]]`) goes to the page that lists it: it counts as a reference of
that page, and opening it opens that page. The link keeps its text. A page that has no file and no block (a blank
page made by a click) does not resolve and does not beat an alias.

When two names clash, the order is:

1. A page with content that has the name (by key) always wins over an alias of that name.
2. When several pages list the same alias, the first in the page order of the next section wins (journals first,
   then pages by their path).

Breccia reports each clash once while it lasts. Breccia's "new page" and "rename" refuse a name that another page
lists as an alias.

### Page names are unique

Names are unique across the whole folder, whatever sub-folder a page is in. When two files give the same key, the
first one wins and each other one is reported and not loaded. The order is: journals first (by file name), then pages
by their path under `pages/`.

### File names Breccia writes

When Breccia creates or renames a page, it derives the file name from the page name:

- each of `\ / : * ? " < > |` becomes `_`;
- each `.` and space at the end becomes `_`;
- a `.` at the start becomes `_`;
- if the part before the first `.` is a reserved Windows name (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`,
  `LPT1`–`LPT9`, in any case), `_` is added after that part.

```text file-names
Project X → Project X
Q&A: hiring → Q&A_ hiring
a/b → a_b
What? → What_
v1.0. → v1.0_
Wait ... → Wait____
.hidden → _hidden
con → con_
LPT1.notes → LPT1_.notes
C# → C#
```

If the file name is taken in that folder (ignoring case, by a file on disk or by another page), Breccia adds ` 2`,
` 3`, … to it: `a_b.md`, `a_b 2.md`. Whenever the file name differs from the page name, Breccia writes a
`title:: <name>` line as the first line of the file (after front matter, if there is any). When a rename makes the file
name equal to the name again, Breccia removes the `title::` lines. Apps that rename files must keep the `title::` line
(section 13).

For a **new page** whose file name differs from its name, Breccia also writes an alias block in front of the `title::`
line, so Obsidian lists the name as an alias of the page. The name is always in double quotes, with `\` and `"` escaped
by a `\`; journals get no block, and existing files are never given one. A new page gets an LF block; a rename
recognises and rewrites the block in the file's own line ending. For the page `Q&A: hiring` the new file starts
with:

```text
---
aliases:
  - "Q&A: hiring"
---
title:: Q&A: hiring
```

A rename never adds an alias block. When the page's preamble starts with exactly the block Breccia writes for the old
name, the rename replaces it with the block for the new name (when the new file name still differs from the name) or
removes it (when the file name now equals the name). Any other front matter is not changed, apart from links
(section 7), and the old name is not added as an alias.

A move to another folder keeps the file name. Only when that name is taken there does Breccia add ` 2`, ` 3`, … to it,
and then it writes the `title::` line (unless the new file name equals the page name).

Folder names Breccia creates are valid names that are also valid file names as typed (the rules above leave them
unchanged), and are not `.` or `..`.

## 5. Journals

A journal is a file `journals/YYYY-MM-DD.md`, one per day, named by the date (`journals/2026-10-29.md`). Only the
canonical form of a real date is a journal: `2026-1-5.md`, `2026-02-30.md` and `26-10-29.md` are reported and not
loaded. The journal's name is the date, so a link to a day is `[[2026-10-29]]`.

Breccia shows days as "Thursday, 29 Oct 2026" wherever it shows a journal name or a link to one. That display form is
Breccia's; the file name and the links always use `YYYY-MM-DD`.

Front matter at the top of a journal file is read the same way as in a page (section 6).

## 6. Outline syntax

A file is a **preamble** (page-level text, possibly empty) followed by **blocks**. Each block starts at a bullet line
and holds every following line up to the next bullet line.

### Bullet lines

A bullet line is: optional spaces and tabs (the indent), `-`, then a space, a tab or the end of the line. The block's
text starts after that one space or tab, so `-  two` has the text ` two`. `*`, `+`, `1.`, `--` and `-x` do not start a
block. Inside fenced code no line is a bullet line (see below).

### Depth

A block's depth comes from the width of its indent, where a tab counts 4 and a space 1. Breccia goes through the
blocks in order and keeps the list of blocks that are still open; a new block closes every open block whose indent is
as wide as its own or wider, and its depth is the number of blocks still open. So the first block has depth 0, a block
is never more than one level deeper than the block before it, and two blocks with different indents can be siblings.

```markdown example
- Standup with [[Anna]]
	- DOING Draft the plan for [[Project X]] #infra
		- child text
- DONE Review PR 412
  done:: [[2026-10-29]]
```

```text reads
0 - "Standup with [[Anna]]"
  link "Anna"
1 DOING "DOING Draft the plan for [[Project X]] #infra"
  link "Project X"
  tag "infra"
2 - "child text"
0 DONE "DONE Review PR 412\ndone:: [[2026-10-29]]"
  link "2026-10-29"
  property "done" "[[2026-10-29]]"
  done 2026-10-29
```

With spaces, any width works, and uneven widths are read against the blocks that are open:

```markdown example
- a
      - b
  - c
    - d
- e
```

```text reads
0 - "a"
1 - "b"
1 - "c"
2 - "d"
0 - "e"
```

### Continuation lines

Every line after a bullet line that is not a bullet line belongs to that block: more lines of text, property lines,
blank lines, and lines with less indent or none. In the block's text, each continuation line loses the prefix "the
block's indent plus two spaces"; a line that does not start with exactly that prefix loses as much leading whitespace as
is not wider than the prefix. A blank line before the next bullet line belongs to the block above it, so that block's
text ends in a line break.

```markdown example
- First line
  second line

  after a blank line

- Next
continued without indent
	- tab child
	  its own continuation
```

```text reads
0 - "First line\nsecond line\n\nafter a blank line\n"
0 - "Next\ncontinued without indent"
1 - "tab child\nits own continuation"
```

### Fenced code

A line whose text (after the indent and, on a bullet line, after the bullet) starts with three or more backticks or
tildes opens a fence. A backtick fence's opening line must not hold another backtick after the run (```` ```x``` ```` is
inline code). The fence closes on a line that holds only a run of the same character at least as long as the opening
run, with nothing but whitespace around it (as in CommonMark). Inside a fence no line is a bullet line and nothing is a
link or tag, so a fence keeps the block it starts in going until it closes.

````markdown example
- Shell notes
  ```sh
  - not a block [[not a link]] #nottag
  ```
  after the fence [[Real]]
- Next
````

```text reads
0 - "Shell notes\n```sh\n- not a block [[not a link]] #nottag\n```\nafter the fence [[Real]]"
  link "Real"
0 - "Next"
```

A fence that is never closed runs to the end of the file:

```markdown example
- open
  ~~~
- swallowed
```

```text reads
0 - "open\n~~~\n- swallowed"
```

### The preamble and front matter

The lines before the first bullet line are the preamble: page-level text that belongs to no block. A preamble may hold
`title::` (section 4), `color::` (section 8), other text, and front matter.

The file starts with **front matter** (Obsidian's properties, in YAML) when:

- its first line is `---` (trailing spaces and tabs allowed), and
- its second line is not blank and not a bullet line, and
- a later line is `---`, and
- no line between them is a bullet line at column 0 (`- x` with no indent).

The front matter runs through that closing `---` line. It is part of the preamble, and its lines are never bullet
lines, fence lines or `title::` lines, so an indented YAML list (`  - item`, as Obsidian writes it) stays front matter.
Breccia shows it as read-only text and reads one value from it, `aliases` (section 4). It never changes it (apart from
line endings, section 3), with two exceptions: when a page is renamed, a `[[link]]` to it inside front matter is
rewritten like any other (section 7), and a rename replaces or removes Breccia's own alias block (section 4). A
`title::` line that Breccia adds goes after the front matter, and so does a `color::` line it adds when the page has no
`title::` line (it goes after the `title::` line when there is one).

```markdown example
---
tags:
  - work
related: "[[Project X]]"
---
title:: Project X
- DOING Draft
```

```text reads
preamble "title:: Project X\n"
front-matter 5 lines
title "Project X"
0 DOING "DOING Draft"
```

A YAML list at column 0 (as Jekyll writes it) is not front matter; its items read as blocks:

```markdown example
---
tags:
- work
---
- a
```

```text reads
preamble "---\ntags:\n"
0 - "work\n---"
0 - "a"
```

Aliases are read from front matter in the form Obsidian writes:

```markdown example
---
aliases:
  - k8s
  - "Kube: prod"
---
- a
```

```text reads
front-matter 5 lines
alias "k8s"
alias "Kube: prod"
0 - "a"
```

A `---` line followed by a blank line is a horizontal rule, not front matter:

```markdown example
---

Some text
---
- a
```

```text reads
preamble "---\n\nSome text\n---\n"
0 - "a"
```

### What Breccia writes

Apart from line endings (section 3), Breccia keeps the bytes of every block it did not change exactly as read. It
changes the preamble only to set or remove `title::`, to set or remove `color::`, to write, replace or remove its own alias block (section 4) and to
rewrite links on a rename (section 7). A block
it changed (its text, its state or its depth) is written in this form:

- the block's indent, `-`, a space and the first line of its text (`-` alone if the first line is empty);
- each further line of text indented by the block's indent plus two spaces; an empty line stays empty.

A new block, or a block whose depth changes, gets the indent of its previous sibling, or else its parent's indent plus
one indent unit, or else no indent at the top level. The indent unit is the indent of the first block at depth 1 under
a block without indent, as found in the file; a file without one uses a tab. If the file's last line has no line break
and Breccia writes something after it, it adds one.

## 7. Links and tags

- `[[name]]` links to the page `name`. The name runs to the first `[` or `]`, which must start `]]`; whitespace around
  the name is ignored (`[[ Spaced ]]` links to `Spaced`). An empty name is no link.
- `[[name|shown text]]` links to `name` and shows "shown text". The name is the part before the first `|`, the shown
  text the rest, both trimmed. With nothing before the `|` it is no link; with nothing after it, it is a plain link.
  Obsidian writes the `|` as `\|` inside a table cell; Breccia reads `[[x\|y]]` the same way everywhere (not only in
  tables) as a link to `x` shown as "y", and a `\` right before the `|` is not part of the name.
- `#tag` is a link to the page `tag`. It needs whitespace or the start of a line before the `#`. The tag runs to the
  next whitespace or one of `, ; ! ? ( ) [ ] { } " ' `` ` ``, and a `.` or `:` at its end is not part of it. `##…` is
  not a tag (a run of `#` is skipped), and neither are `x#b` and `(#f)`.
- `#[[two words]]` is a tag with any name the brackets can hold. In tags, `|` is part of the name.
- A link to a page that does not exist is valid; the page is created when it gets content.
- Nothing inside inline code (a backtick run up to the next run of the same length, which may continue on the next
  line of the same paragraph) or fenced code is a link or a tag.
- `[[Page#Heading]]` (also `[[Page#Heading|shown]]`, `[[Page#Heading#Sub]]` and the block link `[[Page#^id]]`) is a link
  to the page `Page`, when a page with content or an alias named `Page` exists. Else the whole text is a page name as
  typed (`[[Issue #42]]` and `[[C# basics]]` link to pages of those names). A page or alias named exactly
  `Page#Heading` wins over the split. A heading link shows as typed, and its heading is ignored. `[[C#]]` (nothing after
  the `#`) and `[[#Heading]]` (nothing before it) are never split; they link to pages named `C#` and `#Heading`. A tag
  is never split (`#C#` is one tag). `![[x]]` is `!` followed by a link to `x`. Breccia has no block or embed support.
  In the `reads` blocks below, a link shows its target as typed; the resolution is this prose.

```markdown example
- #a, x#b #c. ##d #[[two words]] #e: (#f) #g/h
```

```text reads
0 - "#a, x#b #c. ##d #[[two words]] #e: (#f) #g/h"
  tag "a"
  tag "c"
  tag "two words"
  tag "e"
  tag "g/h"
```

```markdown example
- See [[Project X|the project]], [[ Spaced ]], [[Ben|]] and [[|x]]
  not [[a [b]] but [[Page#Heading]] and ![[diagram.png]]
```

```text reads
0 - "See [[Project X|the project]], [[ Spaced ]], [[Ben|]] and [[|x]]\nnot [[a [b]] but [[Page#Heading]] and ![[diagram.png]]"
  link "Project X" shown "the project"
  link "Spaced"
  link "Ben"
  link "Page#Heading"
  link "diagram.png"
```

A pipe escaped for a table cell:

```markdown example
- | [[x\|y]] | 2 |
```

```text reads
0 - "| [[x\\|y]] | 2 |"
  link "x" shown "y"
```

```markdown example
- Write `[[not a link]]` and ``a ` #notag`` but [[Yes]]
  `code across
  lines [[no]]` #yes
```

```text reads
0 - "Write `[[not a link]]` and ``a ` #notag`` but [[Yes]]\n`code across\nlines [[no]]` #yes"
  link "Yes"
  tag "yes"
```

**Which links count.** Links in a block's text count as references of the page they name (its linked references,
boards, search, graph), and that includes links in property values (`owner:: [[Anna]]`). A link through an alias
(section 4) and a heading link count for the page they go to. Links in the preamble are
shown as links but do not count. Links inside front matter are neither shown nor counted.

**Web addresses.** Breccia shows `[text](https://…)`, `<https://…>` and a bare `http://` or `https://` address in
the text as a link that opens in the browser (`mailto:` links in the Markdown form only). A bare address ends at
whitespace, a quote or an angle bracket, and leaves out the sentence punctuation after it (`.` `,` `;` `:` `!` `?`) and
a closing bracket that has no opening one in the address. It starts at a word's beginning; inside code, inside a
Markdown link's text and in front matter it is plain text. Showing it as a link changes no byte of the file.

**Renames.** When a page is renamed, Breccia rewrites every link to it in every page (blocks, preamble and front
matter), matching by key:

- `[[old]]` becomes `[[New]]`; `[[old|shown]]` becomes `[[New|shown]]`, keeping every byte from the `|` (or from the
  `\` before it) on;
- `#[[old]]` becomes `#[[New]]`;
- `#old` becomes `#New` if that reads back as the same whole tag, else `#[[New]]`;
- a heading link by the old name keeps every byte from the name's end on: `[[Old#H]]` becomes `[[New#H]]`,
  `[[Old#H|shown]]` becomes `[[New#H|shown]]`, `[[Old#^id]]` becomes `[[New#^id]]` (blanks before the name are dropped,
  as in `[[ Old ]]`; blanks between the name and the `#` stay: `[[Old #x]]` becomes `[[New #x]]`). It is left alone
  when its new form would name another page or alias. A tag such as `#Old#x` is not rewritten.

Links written as an alias (`[[k8s]]`, `[[k8s#Setup]]`) stay as they are, and the old name is not added as an alias.
Code is left alone, and a text whose rewrite would not read back with the same links is left as it is.

## 8. Properties

A **property line** is `key:: value`: a key of ASCII letters, digits, `_` and `-`, then `::`, then either the end of
the line or a space and the value. The value is trimmed. Only the first `::` splits, so `a:: b:: c` has the value
`b:: c`.

A block's properties are the property lines directly after its first line (in its text, so after the continuation
prefix is removed). The first line that is not a property line ends them; property lines after it are plain text.
Keys keep their case. Breccia itself writes only `created::`, `done::`, `archived::` and `priority::` on blocks
(sections 9 and 10) and `title::` and `color::` in the preamble (sections 4 and 8); it keeps every other property as it is. The `created`,
`done`, `archived` and `priority` keys are matched exactly: `Done::` and `DONE::` are plain properties. Only `title::` and `color::` are matched ignoring
case (sections 4 and 8).

```markdown example
- Meeting
  a-b_1:: one
  Key:: [[Two]]
  empty::
  k::v
  later:: not read
```

```text reads
0 - "Meeting\na-b_1:: one\nKey:: [[Two]]\nempty::\nk::v\nlater:: not read"
  link "Two"
  property "a-b_1" "one"
  property "Key" "[[Two]]"
  property "empty" ""
```

**Preamble properties.** Property lines in the preamble are page-level text. Breccia reads only `title::` and `color::` from
them (sections 4 and 8) and shows the others as text.

```markdown example
TITLE::
Title:: Q&A: hiring
type:: meeting [[Notes]]

Some page text.
- DONE Hire
  owner:: [[Anna]]
  done:: [[2026-10-28]]

  done:: [[2026-10-30]]
```

```text reads
preamble "TITLE::\nTitle:: Q&A: hiring\ntype:: meeting [[Notes]]\n\nSome page text.\n"
title "Q&A: hiring"
0 DONE "DONE Hire\nowner:: [[Anna]]\ndone:: [[2026-10-28]]\n\ndone:: [[2026-10-30]]"
  link "Anna"
  link "2026-10-28"
  link "2026-10-30"
  property "owner" "[[Anna]]"
  property "done" "[[2026-10-28]]"
  done 2026-10-28
```

**Page color (`color::`).** The first preamble property line with the key `color` (ASCII case ignored) whose value is
one of the names below (case ignored), or a custom hue, gives the page its color. A custom hue is `hue <h>`: the word
`hue` (case ignored), ASCII whitespace, and a whole number `<h>` from 0 to 359 (leading zeros allowed), an angle on the
color wheel. A custom hue may be followed by `vivid <v>`: the word `vivid` (case ignored), ASCII whitespace, and a
whole number `<v>` from 50 to 200 (leading zeros allowed). It is how vivid the color is, in percent of normal: 100 is the
same as leaving it out. Lines inside front matter and a `color` key in YAML do not count. Other values (`hue 360`,
`hue 12.5`, `hue x`, `vivid 300`, `vivid x`, a lone `vivid`) are no color and are kept as written. In journals `color::`
is not read. Breccia writes a name, `hue <h>` or `hue <h> vivid <v>` with single spaces and no leading zeros, in lower
case, and leaves out `vivid 100`: choosing a color replaces the first `color::` line or adds one, and "no color"
removes every `color::` line. What the color does in the app is described in [`docs/spec.md`](spec.md)
section 7.4, and how a hue becomes a color in each theme is the app's business (sections 7.3 and 7.10). The names, row
by row:

```text page-colors
crimson red coral orange amber
yellow olive lime green emerald
teal cyan sky blue indigo
violet purple magenta pink rose
brown tan sand slate grey
```

```markdown example
title:: Garden
Color:: Green
color:: blue
- a
```

```text reads
preamble "title:: Garden\nColor:: Green\ncolor:: blue\n"
title "Garden"
color "green"
0 - "a"
```

```markdown example
---
color: red
---
color:: banana
- a
```

```text reads
preamble "color:: banana\n"
front-matter 3 lines
0 - "a"
```

```markdown example
Color:: HUE 0212
- a
```

```text reads
preamble "Color:: HUE 0212\n"
color "hue 212"
0 - "a"
```

```markdown example
Color:: Hue 212 Vivid 0150
- a
```

```text reads
preamble "Color:: Hue 212 Vivid 0150\n"
color "hue 212 vivid 150"
0 - "a"
```

```markdown example
color:: hue 212 vivid 300
- a
```

```text reads
preamble "color:: hue 212 vivid 300\n"
0 - "a"
```

Setting a color on a page changes only its preamble:

```markdown before
- a
```

```markdown after-red
color:: red
- a
```

```markdown before
title:: Q&A: hiring
- a
```

```markdown after-teal
title:: Q&A: hiring
color:: teal
- a
```

```markdown before
color:: banana
notes
- a
```

```markdown after-blue
color:: blue
notes
- a
```

```markdown before
title:: x
color:: red
- a
```

```markdown after-none
title:: x
- a
```

```markdown before
- a
```

```markdown after-hue-212
color:: hue 212
- a
```

```markdown before
color:: red
notes
- a
```

```markdown after-hue-7
color:: hue 7
notes
- a
```

```markdown before
title:: x
color:: hue 360
- a
```

```markdown after-teal
title:: x
color:: teal
- a
```

```markdown before
- a
```

```markdown after-hue-212-vivid-150
color:: hue 212 vivid 150
- a
```

```markdown before
color:: hue 212 vivid 150
notes
- a
```

```markdown after-hue-40-vivid-60
color:: hue 40 vivid 60
notes
- a
```

**`created::`.** When a task got its state: the first `created::` property, written by Breccia as
`created:: YYYY-MM-DD HH:MM:SS` (local time; a plain date, not a link, so it adds nothing to that day's linked
references). A plain date without a time counts as the start of that day; any other value is no created time. Breccia
adds the line when a block without a state gets one and removes it with the state (section 9); a change from one state
to another leaves it as it is. Breccia shows how long a finished task took, from its created time to its done date and
time. A task without a `created::` line (made before version 5, or by another app) simply has none; Breccia does not
add one later. A `created::` line that is not among the property lines is plain text.

**`done::`.** A block's done date is the day of the first `done::` property whose value holds a `[[…]]` link to a
journal name (`done:: [[2026-10-29]]`). Breccia writes the time after the link, to the second:
`done:: [[2026-10-29]] 14:05:09` (local time; the link keeps the task in that day's linked references). The time is
read when the rest of the value after the link is exactly `HH:MM:SS`; a value without one (as Breccia wrote it before
version 4) counts as the start of that day. A `done::` line that is not among the property lines (like the last line
above) is plain text: it is not read as the done date, and Breccia does not add, change or remove it.

**`archived::`.** A task is **archived** when its properties hold an `archived::` line, whatever its value. An archived
task keeps its state; boards leave it out (section 10), and Breccia's Archive view lists it. Breccia writes the line as
`archived:: YYYY-MM-DD HH:MM:SS`, the day and local time it was archived, as a plain date and not a link, so archiving
adds nothing to that day's linked references. A plain date without a time (as Breccia wrote it before version 4) or a
`[[…]]` link to a journal is read too; without a time it counts as the start of that day. It adds the line after the
last property line, and unarchiving removes every `archived::` line among the properties. Archiving also removes every
`priority::` line among the properties. An `archived::` line that is not among the property lines is plain text.

Breccia writes the line in three cases: the user archives a card; a finished column's "Archive finished …" archives
its tasks; and, while `[board] auto_archive` is on (section 11), Breccia itself archives every task in a finished state
whose done date is more than `[board] archive_after_days` days ago, in all pages and journals. It does that when a
folder opens, once an hour while it is open, and when either setting changes. It changes nothing else in the file. A
finished task without a done date is never archived by itself. A block being edited, and a file that changed on disk
since Breccia read it, are left for a later run.

```markdown
- DONE Ship the release
  done:: [[2026-10-20]] 17:42:10
  archived:: 2026-11-03 09:00:12
```

**`priority::`.** A task's **priority** is the value of the first `priority::` property, when it is a whole number from
1 up written in ASCII digits only (`priority:: 3`). Any other value (`0`, `-1`, `+2`, `2.5`, `high`) means the task
has no priority; Breccia leaves such a line as it is until the user drags that card on a board. The priority places the
card in its board column (section 10). Breccia writes it only when a card is dragged on a board; finishing a task
(section 9) and archiving it remove it. Breccia replaces the first `priority::` line where it stands and removes any
further ones, or adds the line after the last property line.

```markdown example
- TODO Write the release notes
  priority:: 3
- TODO Book the venue
  priority:: high
- DONE Ship
  done:: [[2026-11-03]] 14:05:09
  archived:: 2026-11-03 14:20:00
```

```text reads
0 TODO "TODO Write the release notes\npriority:: 3"
  property "priority" "3"
  priority 3
0 TODO "TODO Book the venue\npriority:: high"
  property "priority" "high"
0 DONE "DONE Ship\ndone:: [[2026-11-03]] 14:05:09\narchived:: 2026-11-03 14:20:00"
  link "2026-11-03"
  property "done" "[[2026-11-03]] 14:05:09"
  property "archived" "2026-11-03 14:20:00"
  done 2026-11-03 14:05:09
```

## 9. Task states

A block is a **task** when the first line of its text starts with a configured state keyword (section 11) followed by
a space or the end of the line. Case matters, and only the very start of the text counts. A keyword followed by a tab,
or by more letters, is no state.

```markdown example
- TODO
- TODOS are not tasks
- todo is not a task
- Call Ben TODO
- DONE	is followed by a tab
- WAITING for [[Ben]]
  done:: [[2026-10-29]]
```

```text reads
0 TODO "TODO"
0 - "TODOS are not tasks"
0 - "todo is not a task"
0 - "Call Ben TODO"
0 - "DONE\tis followed by a tab"
0 WAITING "WAITING for [[Ben]]\ndone:: [[2026-10-29]]"
  link "Ben"
  link "2026-10-29"
  property "done" "[[2026-10-29]]"
  done 2026-10-29
```

When the user changes a block's state, Breccia changes only that block (its children keep theirs):

- the keyword and the one space after it are replaced by the new keyword and a space; a block without a state gets the
  keyword in front; removing the state removes the keyword and its space. A keyword that ends the line gets no space.
- A block without a state that gets one gets `created:: YYYY-MM-DD HH:MM:SS` (today and the local time) after the last
  property line, unless the property lines already hold a `created::` line. A change from one state to another (also
  to a finished state and back) leaves it as it is; removing the state removes every `created::` line among the
  property lines. A new task added on a board gets it too.
- On entering a **finished** state, if the property lines hold no `done::` line, Breccia adds
  `done:: [[YYYY-MM-DD]] HH:MM:SS` (today and the local time) after the last property line. A `done::` line that is
  already there stays as it is, also when the block moves from one finished state to another. It also removes every
  `priority::` line among the property lines: a finished task has no place among the open ones (section 10).
- On entering a state that is not finished, or removing the state, Breccia removes every `done::` line among the
  property lines.
- Any change of the state (to another state, or removing it) also removes every `archived::` line among the property
  lines (section 8): a task that is worked on again is no longer archived. A `priority::` line stays when the new
  state is not finished; removing the state removes every `priority::` line among the property lines too. Removing
  the state of a block that has none changes nothing.
- A change that would make the file read as another outline (for example a keyword that opens a code fence) is
  refused.

A keyword typed or deleted by hand at the start of a block counts as a change of state too: when the block's editor
closes, Breccia compares the state with the one the block had when the editor opened and, if it differs, changes the
`created::`, `done::`, `archived::` and `priority::` lines as above (the keyword is already as typed). While the editor
is open, typing writes only the text typed. Pasted and moved blocks keep their lines as they are.

```markdown example
- TODO Book the venue
  created:: 2026-11-01 09:12:30
- DONE Ship the release
  created:: 2026-10-31 16:00:00
  done:: [[2026-11-03]] 14:05:09
```

```text reads
0 TODO "TODO Book the venue\ncreated:: 2026-11-01 09:12:30"
  property "created" "2026-11-01 09:12:30"
  created 2026-11-01 09:12:30
0 DONE "DONE Ship the release\ncreated:: 2026-10-31 16:00:00\ndone:: [[2026-11-03]] 14:05:09"
  link "2026-11-03"
  property "created" "2026-10-31 16:00:00"
  property "done" "[[2026-11-03]] 14:05:09"
  created 2026-10-31 16:00:00
  done 2026-11-03 14:05:09
```

When a state is renamed in the settings, Breccia changes the keyword in every block in that state and nothing else in
those blocks: indent, bullet, properties and children keep their bytes (the save makes line endings LF, section 3).
Text in the preamble and words elsewhere in a block are not touched. When a state is removed, its blocks keep their
text; the word is simply no state any more.

## 10. Boards

Boards exist only in `breccia/config.toml` (section 11): a name and a list of columns, each column a state keyword. A
column shows every task block in its state, from all pages and journals, except archived ones (an `archived::`
property, section 8). A card is its block: moving a card changes the block's state as described in section 9, and
archiving a card adds the `archived::` line.

**The order in a column.** A column of a finished state shows the newest done date and time first (a done date
without a time counts as the start of its day; no done date last). Any other column shows the tasks with a priority
(section 8) first, highest first, then the others. Ties, and the tasks without a priority, are in the computed order:
newest source date first (a journal's day, or the day a page's file was last changed), journals before pages, the
file changed last first, then by page and by place in the page.

**Dragging a card** to a place in a column that is not finished writes its `priority::` line for that place, one more
than the card below it:

- above a card with a priority `n`: `n + 1`;
- at the top of a column without priorities, or just below the last card with a priority: `1`;
- into an empty column: nothing is written; a `priority::` line the task has stays as it is;
- among the cards without a priority: the `priority::` line is removed, and the card takes its computed place.

Then each card above it that is not higher than the card below it is raised to one more, upwards, until the order
holds; those cards may be on other pages. A drag into another column changes the state too. A drag into a finished
column only changes the state (which removes the priority, section 9), and a drag within a finished column changes
nothing. A drag that leaves a card where it was changes nothing.

## 11. `breccia/config.toml`

The settings shared by everyone who uses the folder. Breccia writes this file when it creates a new notes folder:

```toml default-config
[[states]]
keyword = "TODO"
color = "grey"
finished = false
in_cycle = true

[[states]]
keyword = "DOING"
color = "amber"
finished = false
in_cycle = true

[[states]]
keyword = "WAITING"
color = "violet"
finished = false
in_cycle = false

[[states]]
keyword = "DONE"
color = "green"
finished = true
in_cycle = true

[[boards]]
name = "Tasks"
columns = ["TODO", "DOING", "WAITING", "DONE"]

[board]
archive_after_days = 14
auto_archive = true

[git]
enabled = true
commit_delay_minutes = 5
pull_interval_minutes = 5
```

The numbers below have a range: 0 to 1440 for the Git minutes, 1 to 3650 for `archive_after_days`. A whole number
outside it (a negative one too) is read as the key's default, with a notice naming the key; Breccia does not change
the file.

| Key | Type | Default when missing | Meaning |
|---|---|---|---|
| `[[states]]` | list of tables | the four states above | the task states, in order |
| `keyword` | string, required | | the word that starts a task block (section 9) |
| `color` | string | `"grey"` | the colour of the state, one of the names below |
| `finished` | boolean | `false` | entering the state adds `done::`, leaving it removes `done::` |
| `in_cycle` | boolean | `false` | the state is in the cycle `Ctrl Enter` steps through, in list order; after the last one it starts again at the first (cycling never removes a state) |
| `[[boards]]` | list of tables | the board "Tasks" above | the boards, in order; `boards = []` means none |
| `name` | string, required | | the board's name |
| `columns` | list of strings | `[]` | the state keyword of each column, in order |
| `[board] archive_after_days` | integer, 1 to 3650 | `14` | tasks in a finished state whose done date is more than this many days ago are archived (`archived::`, section 8): by Breccia itself while `auto_archive` is on, and by a finished column's "Archive finished …" |
| `[board] auto_archive` | boolean | `true` | Breccia archives such tasks by itself, in all pages and journals: when a folder opens, once an hour, and when this setting or `archive_after_days` changes (section 8) |
| `[git] enabled` | boolean | `true` | Breccia commits and pulls when the folder is in a Git repository |
| `[git] commit_delay_minutes` | integer, 0 to 1440 | `5` | commit after this many minutes without changes; `0` turns off the timed commit, and changes are still committed before each pull, when the Git item is clicked and when Breccia closes |
| `[git] pull_interval_minutes` | integer, 0 to 1440 | `5` | pull this often; `0` pulls only once, at start |

The colour names:

```text colours
grey amber violet green dim blue red teal
```

**Validation.** The file must be valid TOML with the types above, and must define at least one state
(`states = []` is an error). Each keyword is an upper-case ASCII letter followed by upper-case letters, digits and
`_` (`[A-Z][A-Z0-9_]*`), and keywords are unique. A file that breaks these rules stops the folder from opening, and
the error is reported. Colours and board columns are not checked when the file is read: a column naming a state that is
not configured is shown as missing. Unknown keys are ignored. A number of the wrong type (`"5"`, `5.5`) is an error like any other type.

**A missing file** means the defaults above. Breccia writes the file when it creates a notes folder and when the user
changes a setting.

**Writing.** When Breccia changes a setting, it changes only what changed and keeps the file's comments, unknown keys,
formatting and order. In `[board]` and `[git]` it writes only values that differ from the file (a missing key counts
as its default). The file it writes has LF line endings. It never writes over the file if it changed on disk since
Breccia read it.

## 12. Outside the notes folder

Breccia keeps some data of its own outside the notes folder, per user and machine:

- in the app's config directory: `settings.json` (the last and the recently opened folders, the theme, the sidebar's
  width and whether it is hidden; keys it does not know are kept) and the window's size and place;
- in the app's cache directory: the search index and the saved layout of the graph view, one file each per notes
  folder.

None of it holds notes. Deleting it loses no notes: the search index is rebuilt from the files, the graph is laid out
again, and the settings go back to their defaults.

## 13. For other apps

To work well with Breccia on the same folder:

- Keep text you do not understand exactly as it is, including properties, `title::` lines, `color::` lines, front matter, blank lines
  and indentation.
- Write UTF-8 with LF line endings.
- Do not write block ids (such as Logseq's `id::` properties) into files for Breccia's sake; Breccia does not need or
  use them. It keeps them as text if they are there.
- When you rename a page file, keep its `title::` line, or add one when the new file name differs from the page name,
  and keep Breccia's alias block (or the `aliases` entry that names the page).
- Keep a page's `color::` line; write one only with a name, `hue <h>` or `hue <h> vivid <v>` from section 8.
- Leave the comments and unknown keys in `breccia/config.toml` alone.
- Write files atomically (write a temporary file, then rename it), so Breccia never reads half a file.

## 14. Format history

- **Version 1**: first published. Since this version, front matter at the top of a file is read as
  page-level text (section 6), and `[[Page|shown text]]` links to `Page` (section 7). Before, front matter list items
  read as blocks and `[[Page|shown text]]` linked to a page named `Page|shown text`.
  A page whose file starts with `---`, `title:: X`, `---` was named `X` before version 1; since then that block is front
  matter and the page is named by its file (section 4).

- **Version 2**: aliases name a page (section 4); `[[Page#Heading]]` links to `Page` unless a page has
  that whole name (section 7); `[[x\|y]]` links to `x` (section 7); and a new page whose file name differs from its name
  gets an alias block (section 4). Before, `[[k8s]]` linked to a page `k8s`, `[[Page#Heading]]` to a page
  `Page#Heading`, and `[[x\|y]]` to a page `x\`.

- **Version 3**: an `archived::` property archives a task: boards leave it out, and the task keeps its
  state (section 8). A change of state removes the line (section 9). The default states no longer include `ARCHIVED`,
  so in a folder without `breccia/config.toml`, a block starting with `ARCHIVED` is no task. Before, archiving set the
  state `ARCHIVED`, and an `archived::` line was a plain property.
  Since then, Breccia also archives finished tasks by itself (`[board] auto_archive`, on by default, sections 8 and 11);
  that changes no file's reading, so the version stays 3.

- **Version 4**: a `priority::` property orders a task in its board column (sections 8 and 10);
  dragging a card writes it, and finishing or archiving a task removes it. `done::` and `archived::` carry the local
  time after the date (`done:: [[2026-11-03]] 14:05:09`, `archived:: 2026-11-03 14:05:09`); a finished column sorts by
  done date and time. Lines without a time are read as before and are not rewritten. Before, `priority::` was a plain
  property, a column of a state that is not finished had only the computed order, and the text after a done date's
  link was ignored.

- **Version 5**: a `created::` property records when a task got its state (sections 8 and 9): giving a
  block a state adds it, also when the keyword is typed by hand, and removing the state removes it. Tasks that have none
  are left as they are. Before, `created::` was a plain property.

- **Version 6**: a `color::` line in a page's preamble gives the page a color (section 8), which journal days show
  behind the blocks that link to it. Before, it was plain page-level text.

- **Version 7**: a `color::` line may hold a custom hue, `hue <h>` (section 8). Before, such a value was no color and
  was kept as text; older Breccia versions still read it that way.

- **Version 8**: a custom hue may carry a vividness, `hue <h> vivid <v>` (section 8). Before, such a value was no color
  and was kept as text; older Breccia versions still read it that way.
