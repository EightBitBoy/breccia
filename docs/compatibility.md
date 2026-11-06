# Breccia, Obsidian and Logseq

Breccia keeps notes as Markdown files in a folder, and so do Obsidian and Logseq. This page says how far the three
agree, how to set Obsidian or Logseq up to open a Breccia folder, and what does not carry over.

Breccia's side is described exactly in [the notes format](format.md) (format version 5); this page links to its sections
instead of repeating them. For the other two apps:

- Statements about Obsidian were checked against Obsidian's help pages (obsidian.md/help) on 2026-10-31. The ones about
  aliases, properties and links were checked again on 2026-11-01 (format version 2).
- Statements about Logseq's settings were checked against the `config.edn` template of Logseq 0.10.9 on 2026-10-31.
- Everything else comes from knowledge of Obsidian 1.x and Logseq 0.10 and was not checked against a current version.
  Each such statement is marked **(not verified)**.

The sample folder [`demo/`](demo/) is a small notes folder in Breccia's format: three journals, ten
pages and a board. A test (`crates/core/tests/it/demo.rs`) opens it with Breccia and checks that Breccia reads
it without warnings and would write every file back byte for byte. Its `breccia/config.toml` is the default with
automatic archiving turned off, so opening the folder in Breccia never adds `archived::` lines to it.

## Topic by topic

### Folder layout

| Breccia | Obsidian | Logseq | What carries over |
|---|---|---|---|
| Reads `journals/*.md` and `pages/**/*.md` only; everything else in the folder is ignored ([§2](format.md#2-the-notes-folder)). | Reads Markdown files anywhere in the vault, at any depth (not verified). | Keeps pages in `pages/` and journals in `journals/` (the defaults of `:pages-directory` and `:journals-directory`). | Logseq: the same two folders. Obsidian: a Breccia folder opens as is; notes Obsidian keeps outside `pages/` and `journals/` are not seen by Breccia. |

**Decision:** Breccia keeps reading only `pages/` and `journals/`; reading Markdown files anywhere may come later.

### File names

| Breccia | Obsidian | Logseq | What carries over |
|---|---|---|---|
| A page's file name is its name with the characters Windows does not allow (`\ / : * ? " < > \|`) and a few others replaced by `_`: `Q&A: hiring` is `Q&A_ hiring.md` ([§4](format.md#file-names-breccia-writes)). | The file name is the note's name. Its help warns that `# \| ^ : %% [[ ]]` in a name may not work in links. | Escapes special characters in file names with its own method (`:file/name-format :triple-lowbar`, the default). | Plain names (letters, digits, spaces, `-`) are the same file in all three; so is `&` (not verified). Names with special characters get different file names in each app, which is why Breccia writes `title::` (next topic). |

**Decision:** Breccia keeps its file-name rule and `title::` for the names a file cannot hold.

### Page names and `title::`

| Breccia | Obsidian | Logseq | What carries over |
|---|---|---|---|
| The name is the first valid `title::` line of the page-level text, else the file name ([§4](format.md#the-name-of-a-page)); names match ignoring case ([§4](format.md#names-are-case-insensitive)). A page also answers to its `aliases` from front matter ([§4](format.md#aliases)). | The name is the file name; a `title::` line is plain text (not verified). Aliases are the `aliases` property. | Reads `title::` at the top of a file as the page name (not verified). | Logseq shows `Q&A: hiring` for the file `Q&A_ hiring.md` (not verified). A new page like this that Breccia creates also gets an alias block with its name, so Obsidian can resolve `[[Q&A: hiring]]` (it offers aliases in link suggestions; that a typed `[[alias]]` resolves is not verified). Pages without an alias block show their file name in Obsidian. |

**Decision:** `title::` stays; new pages whose file name differs from their name also get an alias block, existing pages are not changed, and a rename keeps Breccia's own block in step.

### Journals

| Breccia | Obsidian | Logseq | What carries over |
|---|---|---|---|
| One file per day, `journals/YYYY-MM-DD.md`; a link to a day is `[[2026-10-29]]` ([§5](format.md#5-journals)). | The Daily notes plugin names a note by the date in `YYYY-MM-DD` format; the folder is set with "New file location" (the default is the top of the vault, not verified). | Default file name `yyyy_MM_dd` (`:journal/file-name-format`), default page title `MMM do, yyyy` (`:journal/page-title-format`, e.g. "Jan 19th, 2038"). | Obsidian: the same file name, once the folder is set. Logseq: needs both formats set to `yyyy-MM-dd` (see below), then file names and `[[2026-10-29]]` links agree. |

**Decision:** Breccia keeps `journals/YYYY-MM-DD.md`.

### Outline and bullets

| Breccia | Obsidian | Logseq | What carries over |
|---|---|---|---|
| A page is page-level text followed by blocks; a block starts at a `- ` line, and its depth comes from the indent ([§6](format.md#6-outline-syntax)). Other lines belong to the block above. | Free Markdown; `- ` lines are list items, other lines are paragraphs, headings and so on. | Every block is a `- ` line, indented with tabs by default (not verified). | Logseq files read as the same outline (not verified). Obsidian shows a Breccia page as a nested list; an Obsidian note without `- ` lines shows in Breccia as page-level text only. |

**Decision:** Breccia stays an outliner; text before the first `- ` line is page-level text and is kept as it is.

### Links

| Form | Breccia | Obsidian | Logseq | What carries over |
|---|---|---|---|---|
| `[[x]]` | Link to page `x`, matched ignoring case ([§7](format.md#7-links-and-tags)). | Link to note `x`. | Link to page `x` (not verified). | Carries over in all three. |
| `[[x\|y]]` | Link to `x`, shown as "y"; a rename keeps "y". | Link to `x`, shown as "y". | No such form; Logseq writes `[y]([[x]])` (not verified). | Breccia and Obsidian agree. |
| `[[x#h]]` | Link to the page `x` when it (or an alias) exists, else to a page named `x#h`; the heading is not shown; a rename of `x` rewrites it to `[[New#h]]` ([§7](format.md#7-links-and-tags)). | Link to heading `h` in `x`; `[[x#^id]]` links to a block. | No heading links; block references are `((uuid))` (not verified). | The link reaches the same page in Breccia and Obsidian and survives a rename; Breccia does not show the heading. |
| `![[x]]` | `!` followed by a link to `x`. | Embeds `x` (a note or a file). | Embeds are `{{embed [[x]]}}` (not verified). | Does not carry over; in Breccia it is a plain link. |
| `[text](url)` | A web link for `http:`, `https:` and `mailto:`; other targets show only "text". | A link; with "Use [[Wikilinks]]" off, Obsidian writes its own links in this form. | A link (not verified). | Web links carry over; links to local files do not. |

Inside a table cell, Obsidian escapes the pipe (`[[x\|y]]`); Breccia reads that as a link to `x` shown as "y",
in a table or not (format version 2; before it, it linked to a page named `x\`). Obsidian's help pages do not
describe the escape, and that Obsidian reads `[[x\|y]]` outside tables is not verified. `[[#h]]` (a heading of the
same page) stays a link to a page named `#h`.

**Decision:** Breccia reads `[[x|y]]` and `[[x\|y]]` like Obsidian, and `[[x#h]]` goes to `x`;
block links and embeds are not read yet.

### Tags

| Breccia | Obsidian | Logseq | What carries over |
|---|---|---|---|
| `#tag` and `#[[two words]]` are links to the page of that name ([§7](format.md#7-links-and-tags)); `#2026` is a tag. | A tag is a label, not a note. Letters, digits, `_`, `-` and `/` (nested tags); at least one character that is not a digit (`#1984` is no tag); no spaces; case-insensitive. | `#tag` and `#[[two words]]` are links to pages, as in Breccia (not verified). | Logseq: the same. Obsidian: `#infra` is a tag there too, but has no page; `#[[on call]]` and `#2026` are no tags there (not verified for `#[[…]]`). |

**Decision:** Breccia keeps tags as pages.

### Properties and front matter

| Breccia | Obsidian | Logseq | What carries over |
|---|---|---|---|
| Block properties are `key:: value` lines right after a block's first line ([§8](format.md#8-properties)). Front matter (`---` … `---` at the top) is page-level text that Breccia shows and reads `aliases` from ([§4](format.md#aliases): a list, a one-line list or a single name; not the old `alias:`). It never changes it, except link targets on a rename, its own alias block on a rename, and CRLF line endings, which become LF on the first save ([§3](format.md#3-files), [§6](format.md#the-preamble-and-front-matter)). Front matter whose YAML list items start at column 0 (hand-written, Jekyll style) is not front matter: those items read as blocks. | Properties are YAML front matter at the top of the file: `name: value`, lists one `- item` a line, links in quotes (`"[[x]]"`); default properties `tags`, `aliases`, `cssclasses`. `key:: value` lines are plain text (not verified). | Properties are `key:: value` lines, on a block or at the top of the page (not verified). | Logseq: `key:: value` is the same syntax (not verified). Obsidian (which indents list items): front matter survives in Breccia byte for byte, apart from CRLF line endings, and Breccia reads `aliases` from it (no tags or title). Obsidian's help lists `aliases` as a list property, and says the old `alias` key was deprecated in 1.4 and dropped as a default property in 1.9; whether Obsidian reads a single-string `aliases:` is not verified. |

**Decision:** Breccia reads front matter as page-level text, reads `aliases` from it and otherwise leaves it untouched; reading `tags` and `title` may come later.

### Tasks

| Breccia | Obsidian | Logseq | What carries over |
|---|---|---|---|
| A block is a task when its text starts with a state keyword from `breccia/config.toml`: `TODO`, `DOING`, `WAITING`, `DONE` by default; an `archived::` property hides a task on boards and keeps its state ([§9](format.md#9-task-states)). | Tasks are checkboxes: `- [ ] task`; any character in the brackets marks it done (`[x]`). `- TODO …` is a list item starting with the word TODO. | Tasks start with a keyword: `TODO`/`DOING` or `LATER`/`NOW` (`:preferred-workflow`, `:now` by default), plus `DONE`, `WAITING`, `CANCELED` and others (not verified for the others). | Logseq: `TODO`, `DOING`, `WAITING` and `DONE` carry over (with `:preferred-workflow :todo`). Obsidian: keywords are plain words, checkboxes are plain text in Breccia. |

**Decision:** Breccia keeps task keywords and does not read Obsidian checkboxes (this may come later).

### Done dates

| Breccia | Obsidian | Logseq | What carries over |
|---|---|---|---|
| Entering a finished state adds `done:: [[YYYY-MM-DD]]` to the block; leaving it removes the line ([§9](format.md#9-task-states)). | Nothing (not verified for plugins such as Tasks). | Marks a task `DONE` without a date; with time tracking on, it adds a `:LOGBOOK:` drawer to the block (not verified). | In Obsidian a `done::` line is text; in Logseq a property with a link to the journal (not verified). Breccia keeps Logseq's `:LOGBOOK:` lines as text. |

**Decision:** Breccia keeps `done::`; it is ordinary text to the other apps.

### Attachments and images

| Breccia | Obsidian | Logseq | What carries over |
|---|---|---|---|
| Shows images with `http:` and `https:` addresses; a local image shows as its alt text. Breccia does not read or manage attachment files. | Embeds local files with `![[file.png]]`; new attachments go to the top of the vault unless "Default location for new attachments" says otherwise (not verified). | Copies attachments into `assets/` and links them as `![x](../assets/x.png)` (not verified). | Web images carry over. Local images and other attachments show only as text in Breccia. |

**Decision:** Breccia does not read attachments yet; keep them in `assets/` (Logseq's place), the place a later Breccia would most likely read.

### Config folders

| Breccia | Obsidian | Logseq | What carries over |
|---|---|---|---|
| `breccia/config.toml`: task states, boards, Git settings ([§11](format.md#11-brecciaconfigtoml)). Nothing else in `breccia/` is read. | `.obsidian/` in the vault holds all its settings. | `logseq/` holds `config.edn` and its other files (not verified). | Nothing; each app keeps its own folder and ignores the others' (Breccia ignores every top-level folder but `pages/`, `journals/` and `breccia/`). |

**Decision:** The three folders can live side by side in one notes folder.

## Opening a Breccia folder in Obsidian

1. Open the notes folder as a vault ("Open folder as vault").
2. Settings, Core plugins: turn on **Daily notes**. In its options set **New file location** to `journals` and the date
   format to `YYYY-MM-DD` (the default).
3. Settings, Files and links: set **Default location for new notes** to the folder `pages`, and leave **Use
   [[Wikilinks]]** on (the default).

What to expect:

- Pages, journals and `[[links]]` work, including `[[x|y]]`, `[[x#heading]]` and links to days (`[[2026-10-29]]`).
- Task keywords (`TODO`, `DONE`, …) are plain words; Obsidian's task features do not see them.
- `done::`, `created::`, `priority::`, `archived::`, `title::` and other `key:: value` lines are text (not verified).
- `#[[two words]]` is no tag, and a page named by `title::` shows its file name. For pages Breccia creates, the
  alias block lets Obsidian resolve a link such as `[[Q&A: hiring]]` to that page (not verified for a typed link).
  Pages without an alias block (made by another app, or before format version 2) have none; a link to them by their
  `title::` name may create a new, duplicate note in Obsidian (not verified). Add an `aliases` entry to such a page to fix it.
- Obsidian creates `.obsidian/` in the folder; Breccia ignores it.
- Keep text Obsidian does not understand as it is; [§13 of the format](format.md#13-for-other-apps) lists what else
  Breccia needs from another app.

## Opening it in Logseq

1. Add the notes folder as a graph ("Add a graph" or "Open a local directory", not verified).
2. In `logseq/config.edn` set:

   ```clojure
   :journal/file-name-format "yyyy-MM-dd"
   :journal/page-title-format "yyyy-MM-dd"
   :preferred-format "Markdown"
   :preferred-workflow :todo
   ```

   The file-name format makes Logseq read `journals/2026-10-29.md` as a journal; the page-title format makes a
   journal's page name `2026-10-29`, so `[[2026-10-29]]` links reach it. `:preferred-format` is already `"Markdown"` by
   default. `:preferred-workflow :todo` makes Logseq write `TODO`/`DOING` instead of `LATER`/`NOW`.
3. Re-index the graph after changing the formats (not verified).

What to expect:

- Logseq adds a `logseq/` folder (its settings) to the notes folder; Breccia ignores it.
- Before the formats are set, Logseq may create `pages/contents.md`, which Breccia then shows as a page, and journals
  named `yyyy_MM_dd`, which Breccia reports and does not load (not verified). Set the formats first.
- Logseq may add `id::` properties (when a block is referenced) and `collapsed:: true` (when a block is folded) to
  blocks (not verified). Breccia keeps them as text and does not need them ([§13](format.md#13-for-other-apps)).
- `[[x|y]]` links are not read by Logseq (not verified).
- Tasks in `TODO`, `DOING`, `WAITING` and `DONE` show as tasks in both apps; Breccia's `done::` lines show as block
  properties in Logseq (not verified).

## Opening an Obsidian vault in Breccia

Breccia reads only `pages/` and `journals/` ([§2](format.md#2-the-notes-folder)). A vault that keeps its notes at the
top level or in other folders opens empty, apart from those two folders. To try Breccia on a vault:
put the notes into `pages/` (sub-folders are fine; they become the folders of the page tree) and the daily notes into
`journals/` with `YYYY-MM-DD.md` names. Breccia ignores `.obsidian/`. Front matter stays as it is, except link targets
on a rename (and Breccia's own alias block), and CRLF line endings, which become LF on the first save
([§3](format.md#3-files)); YAML list items at column 0 make it read as blocks. `[[x|y]]` links work, `aliases` count
as page names, `[[x#h]]` links go to `x`, and checkbox tasks stay plain text: cycling one in Breccia
makes `- [ ] task` into `- TODO [ ] task`.
