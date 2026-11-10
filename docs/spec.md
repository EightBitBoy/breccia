# Breccia — design

This is the binding design of Breccia: what it does and why. Code cites its sections (§1 to §12).
Remarks in the form *(my call)* mark choices the builder made where the design left room.

> Breccia is a rock made of broken fragments cemented together into one stone.
> Breccia is a notes app where the fragments of everyday work and tasks bind into one body of knowledge.

## 1. Intent

The user works in daily notes. Each day's note holds many tasks, and those tasks are not just checklist items: they carry
context, decisions and links to people, projects and topics. Over time the tasks *are* the knowledge base. That is why
tasks and notes cannot live in separate tools.

Logseq comes closest (daily journals, outliner blocks, `[[links]]`, linked references per block, `TODO`/`DOING`/`DONE`),
but its tasks are never displayed well, it has many features the user does not need, and its graph view stutters. Obsidian
works per document, not per line, and has no native task states. Every Kanban plugin tried for either tool was either a
separate board file that does not know about the daily notes, or did not fit the workflow. Other task tools model a
task as a whole note; Breccia models a task as **one block (line)** in any page, which is the core difference.

Breccia is a lean, personal Logseq: keep what is used daily, drop the rest, and add a **Kanban board in which every task
block anywhere in the notes is a card**. Moving a card changes the block in its page, so the board and the notes can
never disagree.

**Success** means the user works in Breccia every day instead of Logseq.

## 2. Goals, non-goals, anti-goals

**Goals (first version)**
- Notes are plain Markdown files in a folder the user chooses, readable and editable without Breccia.
- Block-based outliner editing.
- Pages, `[[links]]` and `#tags`; every page shows the blocks that link to it (linked references).
- A continuous journal of daily pages.
- Configurable task states (default `TODO`, `DOING`, `WAITING`, `DONE`).
- Kanban boards whose columns are states and whose cards are task blocks from all pages.
- An "All pages" table, search, Git integration, themes and a network (graph) view.
- Windows first; the code base must also build and run on Linux and macOS.

**Non-goals (first version; most are "later", see §11)**
- Plugins (but see §9: the architecture keeps room for them), mobile, import from Logseq, real-time collaboration,
  whiteboards, flashcards, PDF annotation, encryption, block embeds (`((block-id))`), tabs.

**Anti-goals: things that make Breccia a failure even if every feature works**
- **Losing or mangling text.** Breccia must never silently drop, reorder or reformat content the user wrote. A file Breccia
  did not change must stay byte-identical; a block Breccia did not change must stay byte-identical within its file,
  except that its line endings become LF when Breccia saves the file (§4).
- **Board and notes disagreeing.** The board is a view over the files, never a second copy.
- **Lock-in.** Files must stay pleasant to read in any text editor and in Git diffs. No hidden database is the source of
  truth.
- **A stuttering graph view or a sluggish editor.** Speed is not the top priority, but typing and the graph must feel
  smooth.

## 3. Platform and stack (decided)

| Part | Choice | Why |
|---|---|---|
| Desktop shell | **Tauri 2** | small, Rust backend, uses the system web engine; Electron rejected, Electrobun too immature on Windows |
| Core / backend | **Rust** | parsing many Markdown files, indexing, file watching, Git |
| Frontend | **Svelte 5 + TypeScript, plain Vite** (no SvelteKit) | little boilerplate, fine-grained updates for long outlines; the heavy libraries below are framework-independent |
| Block editor | **CodeMirror 6**, one instance for the block being edited | edits the Markdown text directly, so the file stays the truth (rich-text editors such as ProseMirror/Tiptap keep their own model and lose detail on the way back to Markdown) |
| Network view | **sigma.js + graphology**, layout (ForceAtlas2) in a web worker | WebGL, handles tens of thousands of nodes; layout off the main thread avoids stutter |
| Board drag and drop | **pragmatic-drag-and-drop** (Atlassian) | framework-independent, used by Trello/Jira |
| Long lists | **TanStack Virtual** | journal feed, All pages, search results |
| Menus, dialogs | **bits-ui** (unstyled, accessible Svelte components) | |
| Styling | plain CSS with CSS variables (tokens) | themes are token sets; no Tailwind |
| Index and search | **SQLite** via rusqlite with **FTS5** full-text search | a rebuildable cache, never the source of truth |
| File watching | **notify** crate | |
| Git | the user's installed **`git` command** (`std::process::Command`) | existing credentials (Git Credential Manager, SSH keys) work; commits are standard |
| Tests | Rust unit/integration tests; Vitest for frontend logic | |
| Tooling | `just` for all commands | |

Repository layout: a Cargo workspace with `crates/core` (pure Rust library, no Tauri dependency:
parser, model, writer, index, Git, config) and `app/src-tauri` (thin Tauri shell exposing commands and events), plus the
frontend in `app/src`. The core must be testable without a window.

**Known risk:** on Linux, Tauri uses WebKitGTK, the weakest of the three system web engines. Before building far, a spike
should check that CodeMirror 6 and the sigma.js view run smoothly on Linux.

## 4. The notes folder

The user picks or creates a notes folder on first start ("Open folder…" / "New folder…"). Breccia works with one folder at
a time; it can be switched in Settings.
Settings and the welcome screen list the recently opened folders (the last 10, newest first; a folder that no longer
exists is shown as missing). Breccia does not switch while a page holds changes it could not save.

**The user starts with a new, empty notes folder** (decided). Breccia does not open or convert an existing Logseq graph,
so Logseq's file naming (`2026_10_29.md`, `Projects___Page.md`), its date-link titles (`[[Oct 29th, 2026]]`) and its
extra keywords (`LATER`, `NOW`, `CANCELED`) do not need to be supported. The format below borrows Logseq's block syntax
because it reads well, not for compatibility; whether Logseq can open a Breccia folder is not a requirement.

Layout:

```
<notes>/
  journals/2026-10-29.md        one file per day that has content
  pages/Project X.md            pages; sub-folders are the folders of the page tree
  pages/Projects/Website relaunch.md
  breccia/config.toml             states, boards, Git and journal settings (shared, tracked in Git)
```

- **Page names are unique** across all folders; `[[Website relaunch]]` finds the page wherever it lives. The page name
  is the file name without `.md`. Characters that are not allowed in Windows file names (`\ / : * ? " < > |`) are
  replaced in the file name and the real name is stored in a `title::` property on the first line (Logseq does the
  same). *(my call)*
- **Page names, links and tags are case-insensitive**: `[[project x]]`, `[[Project X]]` and `#project-x`… are matched by
  their lower-cased name (`#Project-X` and `[[Project X]]` stay different because the name differs, as in Logseq). The
  page keeps the spelling of its file name; links keep the spelling the user typed; renaming rewrites links in any
  case. This also avoids two files differing only in case, which Windows cannot hold. *(my call, Logseq behaviour)*
- Journal pages are named by ISO date (`2026-10-29`), so links to days are `[[2026-10-29]]`. Breccia **displays** them as
  "Thursday, 29 Oct 2026" wherever a day link is rendered; the file keeps `[[2026-10-29]]`. *(my call: ISO is
  unambiguous, sorts correctly and needs no locale)*
- Files are UTF-8. Breccia saves every file with LF line endings: a file it creates gets LF, and an existing file with
  CRLF line endings is converted to LF the first time Breccia saves it. A file Breccia does not save keeps its bytes.
- Machine-local settings (window size and position, selected theme, where the sidebar lists Journals, last opened folder, recent folders) live in the app's own config
  directory, not in the notes folder. *(my call)*

## 5. File format

Logseq-style Markdown, so the files stay familiar and read well in any editor. Example:

```markdown
- Standup with [[Anna]] and [[Ben]]
	- DOING Draft the migration plan for [[Project X]] #infra
	- TODO Ask [[Ben]] about the licence costs #budget
- Learned: [[Kubernetes]] readiness probes start before the cache is warm
	- Fix: add a startup probe with a longer delay
- DONE Review PR 412 for [[Website relaunch]]
  done:: [[2026-10-29]]
- WAITING Feedback from legal on the [[Hiring]] contract template
```

- **Blocks.** Every `- ` bullet starts a block. Indentation (tab, or the indentation the file already uses) nests
  blocks. Continuation lines of a block (multi-line text, properties) are indented to the block's text. A file may start
  with page-level lines (properties) before the first bullet.
- **Front matter.** A file whose first line is `---`, whose second line is neither blank nor a bullet, which has a later
  `---` line and no bullet at column 0 before it, starts with front matter up to that line (Obsidian's properties).
  Breccia keeps it as page-level text, shows it dimmed and does not read values from it; a rename still rewrites a
  `[[link]]` inside it, and a `title::` line Breccia adds goes after it.
  It reads one value from it, `aliases` (other names of the page, which links resolve); a new page whose file name
  differs from its name gets an alias block, and a rename keeps only that block in step.
- **Links.** `[[Page name]]` links to a page. `[[Page|shown text]]` links to `Page` and shows "shown text" (Obsidian's
  form); a rename keeps the shown text. A page name with `|` cannot be linked.
  `[[Page#Heading]]` and `[[x\|y]]` (Obsidian's table form) link to `Page` and `x`, and a link written as an alias goes
  to the page that lists it.
  `#tag` and `#[[multi word tag]]` are links too: a tag is a page. A link to
  a page that does not exist yet is valid; clicking it opens an empty page, and its file is created when the user
  types something.
- **Task state.** A block is a task when its text starts with a configured state keyword followed by a space
  (`TODO …`). Only the keyword at the very start counts.
- **Properties.** `key:: value` lines directly after the block's first line. Breccia itself writes only `created::`,
  `done::`, `archived::` and `priority::` on blocks (`docs/format.md` §8), and `title::` and `color::` on pages (§4, §8); any other
  properties are kept as they are and shown dimmed.
- **Done date.** When a block enters a *finished* state (DONE or any state marked finished), Breccia adds
  `done:: [[YYYY-MM-DD]]` (today) if it is not there yet. When it leaves the finished states, Breccia removes the
  property. Because the value is a page link, the task also appears in the linked references of the day it was finished.
- **Everything else** (headings, emphasis, code, quotes, tables, plain URLs, Logseq syntax Breccia does not know such as
  `SCHEDULED:` or `:LOGBOOK:` drawers) is preserved verbatim and rendered as Markdown where possible.
- **Round trip.** The parser keeps the original text of every block. Writing a file re-emits unchanged blocks exactly as
  they were read; only blocks the user changed are regenerated. This is how the "never mangle text" anti-goal is met,
  and it needs thorough tests (parse → write must give back the identical file for a large set of sample files).
- **Block identity.** Breccia needs stable block identities while running (to edit a card on the board, to jump to a
  block). These are in-memory IDs held by the index and are **not** written into the files. *(my call; block
  references `((id))` are a later feature, see §11)*

**One interpretation.** The Rust parser is the only place that decides what text means (blocks, links, tags, states,
properties). The frontend gets parsed structure from the core and only adds syntax highlighting inside the editor.

## 6. How data flows

- **The files are the truth.** On opening a folder the core reads all files, parses them and builds the index (SQLite in
  the app's cache directory). When the index already exists, only files that changed since are re-read. Index
  rebuilding runs in the background; the journal is usable before it finishes. Its progress shows in the status bar
  (§7.13).
- **The frontend never writes files.** It sends intents to the core: "set this block's text", "set this block's state to
  DOING", "insert block after", "indent", "move", "create page", "rename page", and so on. The core applies the intent to
  its model, writes the file (atomically: write a temporary file, then rename), updates the index and emits a change
  event. Every open view (page, journal, board, All pages, graph, search) updates from those events.
- **External changes** (another editor, a Git pull) are picked up by the file watcher; Breccia's own writes are recognised
  and ignored by the watcher. If a file changes on disk while the user is editing a block in it, the edit in progress
  is kept, the rest of the file is reloaded, and if the block itself changed on disk the user gets a notice with both
  versions instead of a silent overwrite. *(my call)*
  Changes to `breccia/config.toml` made while Breccia runs are read at once; a file that cannot be read keeps the
  settings in use, and Breccia does not write it until it can.
- **Saving** happens shortly after typing pauses (well under a second); there is no Save button.

## 7. Features

### 7.1 Layout and sidebar

A left sidebar, a main area, and a status bar along the bottom of the window (§7.13).

Sidebar, top to bottom:
- **Search** box with the `Ctrl K` hint (opens search, §7.8).
- **Journal**: opens the journal feed at today.
- **All pages**: opens the All pages table.
- **Boards**: one entry per board, plus "New board".
- **Pages**: the page tree (folders and pages from `pages/`). Folders fold open and closed. Right-click offers new page,
  new folder, rename, move, delete. At the bottom of the tree sits a folded **Journals** entry that groups journal pages
  by year and month; journal pages cannot be moved or renamed there. Pages and folders can also be
  dragged onto a folder, onto a page in a folder (into that folder), or onto the "Pages" heading (the top level);
  journals and tags cannot be dragged. A page that is only linked to can be moved into a folder, which writes its file
  there, empty; it cannot be deleted. A deleted page that is still linked to stays listed as linked-only.
- Footer: **Graph** and **Settings**.

The sidebar can be resized and hidden. *(my call)*

**Back and forward**: `Alt ←` / `Alt →` (`Cmd [` / `Cmd ]` on a Mac) or the ← → buttons at the top left
of the main area step through the views shown in this session (pages, journal days, boards, All pages, Archive, Git
history, Graph, Settings), the newest 50, not stored. Scrolling, cards and dialogs are not steps. The scroll position
comes back; in the journal, the day that was at the top. Deleted pages are skipped; renamed ones are followed. A
second click on the Git history button is Back.

### 7.2 Outliner editor

- Every block is shown rendered. Clicking a block turns **only that block** into a CodeMirror 6 editor showing its
  Markdown, with light live formatting; leaving it renders it again.
- Keys (Logseq conventions): `Enter` new block below (the text after the cursor moves into it); `Shift Enter` new line
  inside the block; `Tab` / `Shift Tab` indent / outdent; `Alt ↑` / `Alt ↓` move the block with its children; `↑` / `↓`
  at the first/last line move to the previous/next block; `Backspace` in an empty block deletes it and moves to the end
  of the previous one, at the start of a non-empty block merges it into the previous one; `Esc` leaves editing;
  `Ctrl Enter` cycles the state through the states marked "in cycle", in list order, and after the last one starts
  again at the first (default: none → TODO → DOING → DONE → TODO); it never removes the state. `Ctrl Shift Enter`
  removes the state, also on a selection; so does deleting the keyword; `Ctrl Shift K` deletes the block with its
  children, also on a selection; the caret moves to the end of the block above (the start of the next one for a page's
  first block); the only block of a page is emptied instead (while editing; on a selection the key deletes every selected block,
  as `Backspace` and `Delete` do); one `Ctrl Z` brings it back; `Ctrl Z` /
  `Ctrl Y` undo / redo, also across block boundaries (splits, merges, moves).
- Blocks with children have a fold arrow; folding is remembered per block for the session. *(my call: Logseq writes
  `collapsed:: true` into the file; Breccia does not, to keep files clean)*
- **Autocomplete:** typing `[[` lists page names (fuzzy) and offers "create page"; typing `#` does the same for tags.
- **Slash menu:** `/` at the start of a word opens a menu with every configured state (`/todo`, `/waiting`, …), "link
  to page", "Today" and "Yesterday" (a link to that journal day; "date" finds both) and "Date…", which opens the date
  picker at the sidebar and inserts the picked day as a `[[YYYY-MM-DD]]` link at the caret; the three date entries
  show a small calendar.
- Selecting several blocks (Shift-click or `Shift ↑/↓` from editing) allows indent, outdent, move, delete and set state
  for all of them.
- Clicking a rendered `[[link]]` or `#tag` opens that page; `Ctrl`-click is reserved for "open in new tab" later.
- Pasting multi-line text with bullets creates blocks.

### 7.3 Pages and linked references

A page shows its title, its own blocks (editable), and below them **Linked references**: every block in any other page
that links to this page (by `[[link]]`, `#tag` or a property value), grouped by source page, newest journal first. Each
reference shows the block with its children and a small breadcrumb of its parent blocks, and it is editable in place.

Renaming a page (title or tree) renames the file and, after confirmation, **rewrites every link to it** in all files.
*(my call; Logseq does the same)*

**Page color.** Every page shows a swatch at the right of its title: an empty outline, or filled with the page's color.
A click opens 25 colors in a 5 × 5 grid (reds and oranges, yellows and greens, teals and blues, violets and pinks,
browns and greys) and "No color". A pick saves at once as `color:: <name>` (`docs/format.md` §8). Arrows, Home / End,
Enter and Esc work in the picker. A tag-only page gets its file when a color is picked. Journal days have no swatch.
A pick is its own undo step: `Ctrl Z` with the swatch focused (right after a pick) or while editing a block of the page
takes it back, and earlier typing stays undoable.

Below the grid and "No color" the picker has a custom part. A "Custom hue" slider runs around the color wheel (0 to
359): arrows change it by 1, Page Up / Down by 10, Home / End jump to the ends; Tab order is given in the next
paragraph. On the slider, arrow keys only preview; Enter saves and closes. A drag saves once on release and keeps the
picker open, so a second drag can follow. A preview line (sample text with a link and a tag, on the color under the
pointer, else the focused one, in the current theme) follows the 25 cells and the slider; the saved color stays
marked. Between two grid colors (the gaps) the preview keeps the last one; on the preview box, the labels, the greyed
Vividness slider and when the pointer leaves the picker it shows the focused choice, and during a slider drag it keeps
following that slider. A slider that stands at the page's saved color says so to a screen reader ("Hue 212, page
color", "Vividness 150, page color"). The slider thumbs stay inside their tracks, and both tracks are as wide as the
grid. A custom color is saved as `color:: hue <h>`. Picking a name after a hue, or a hue after a name, replaces the
line. One save is one undo step. The right-click "Color…" menu in the journal opens the same picker.

Under the hue slider is a "Vividness" slider (50 to 200, 100 is the normal look). It is always shown, so the picker
never changes its layout, and it is greyed out (disabled, not a tab stop) until the page's color is a custom hue or
the hue slider has been reached; after that it stays enabled until the picker closes. Its keys: arrows change it by 5,
Page Up / Down by 25, Home and End jump to 50 and 200. Tab moves grid, hue slider, vividness slider (only while it is
enabled), then back to the grid, and Shift Tab the other way. Enter on either slider saves hue and vividness together
and closes; a drag saves once on release and keeps the picker open. A custom color is saved as `color:: hue <h> vivid
<v>`, and `vivid 100` is left out, so a plain hue stays `color:: hue <h>`. Picking a name drops the vividness (the
file has one `color::` line), and undo brings it back; reopening the picker on a named color starts the vividness at
100. When the theme softens the color so text stays readable, the preview shows the note "Softened here so text stays
readable", in the normal text color and in italics.

### 7.4 Journal

- One continuous, scrollable feed: **today at the top**, and scrolling down goes back in time day by day.
- Every day in the feed is fully editable in place.
- Days without content are skipped. **Today is always shown**, with a "start writing…" placeholder when empty; its file
  is created when the user types.
- Older days load as the user scrolls (virtualised), so years of notes stay fast.
- Clicking a day's title opens that day as a normal page, with its linked references (e.g. tasks finished that day via
  `done::`). The feed itself shows no linked references, to stay compact.
- **Page color washes.** Each top-level block gets a faint wash of the color of the first link or tag in it that goes to
  a topic page with a color (named or custom: a custom color washes and merges exactly like a named one). Journal days
  and missing pages are skipped, aliases are followed, and sub-blocks follow their parent. Consecutive blocks whose
  topic is the same page merge into one band; blocks of different pages stay separate, with a small gap, even in the
  same color. The feed and a day page look the same. Washes follow edits after the typing pause and any change of a
  page's color, from anywhere. A selected row and the jump highlight (after a jump from a card or a search result)
  keep the band's rounded ends; the highlight starts in the selection color and fades back to the band's color.
- **Color from a link.** A right-click on a link or tag in a journal day opens a menu with "Color…", which opens the
  same picker for the page the link goes to (aliases followed, tag-only pages included). Links to journal days and to
  pages that do not exist get no "Color…" entry. Inside an open block editor, and on selected text that is not a link
  to a colorable page (including a link to a day or a missing page), the normal browser menu stays, so copy and paste
  keep working; elsewhere no menu opens. When the menu or the picker closes (a pick, Esc, a click outside), the focus
  is on the link again, unless something else already holds it. If the day is drawn anew while the picker is open,
  the picker stays at its link; if the link is gone, it stays where it was, and a pick still colors the page.
- **Jump to a date** through search (§7.8): typing a date (`12 Mar`, `12.3.`, `2026-03-12`, `yesterday`, …) offers "Go
  to ‹day›" first. A day with an entry (or today) opens the feed scrolled to that day. Any other day, past or future,
  opens as its day page with the "start writing…" placeholder; its file is created when the user types, and from then
  on the day is in the feed in its place. A date without a year means the most recent such day not after today.
- **Date picker**: a calendar icon right of the sidebar's "Journal" entry, or `Ctrl Shift D` from anywhere (also while
  editing), opens a month below the icon. Weeks start on Monday; days with a journal file have a dot, today is
  outlined; it opens at the journal day shown, else at today. Arrows move by day and week, Page Up / Page Down by
  month, Home / End to the week's start and end, Enter or a click picks, Esc closes (the focus goes back where it
  was); ‹ › change the month and "Today" shows today. A picked day, past or future, jumps exactly as a typed date does
  (above): nothing is written until the user types.

### 7.5 Task states

Configured in Settings and stored in `breccia/config.toml`. Each state has a **keyword** (upper-case word), a **colour**,
a **finished** flag and an **in cycle** flag. Defaults:

| Keyword | Finished | In cycle | Colour (light theme) |
|---|---|---|---|
| TODO | no | yes | grey |
| DOING | no | yes | amber |
| WAITING | no | no | violet |
| DONE | yes | yes | green |

- `Ctrl Enter` cycles through the "in cycle" states in list order; the others are set via `/`, the board or drag and
  drop. *(my call; matches Logseq's TODO → DOING → DONE)* After the last one it starts again at the first; a state
  outside the cycle goes on to the next in-cycle state after it in the list (WAITING → DONE), wrapping at the end. With
  no state in the cycle, `Ctrl Enter` and a click on the label change nothing and show a note. Cycling never removes
  the state: `Ctrl Shift Enter` does, or deleting the keyword.
- **Rename** a state: after confirmation, every block using the old keyword is rewritten. **Remove** a state: blocks keep
  their text; the word is simply no longer a state. *(my call)*
- Rename changes only the keyword at the start of each block in that state, and the boards' columns. Changing the
  finished or in-cycle flag rewrites no block. A board column naming a removed state stays and is shown as missing.
  Settings writes `breccia/config.toml` in place: comments, unknown keys and order stay.
- **Archiving** keeps the DONE column from overflowing: an archived task keeps its state, but boards leave it out
  (§7.6, `docs/format.md` §8).

### 7.6 Kanban boards

- A board has a **name** and an ordered list of **columns**; each column shows **all task blocks in one state**, from
  every page and journal. Boards are stored in `breccia/config.toml`. The default board "Tasks" has TODO, DOING, WAITING,
  DONE. The user mostly uses one board, but can create more with other columns (e.g. "Focus": DOING, WAITING).
- **Card**: the block's first line rendered (links and tags visible), its **description**, the source page (journal date
  or page name), and the done date for finished tasks.
- **Nested blocks** (decided):
  - **Children without a state are the task's description.** They are displayed on the card, rendered, below the task
    line, with their own nesting (and their children, as long as those have no state either). Long descriptions are
    cut off after a few lines with "show more". *(the cut-off length is my call)*
  - **Children with a state are tasks of their own, with their own cards**, in their own columns. No task is ever hidden
    from the board. Their own stateless children are *their* description, not the parent's.
  - The parent card shows a progress hint for its task children, e.g. "1/2 subtasks" (finished / all).
  - A nested task's card shows a small line naming its parent task, e.g. "↳ Release version 2".
  - Changing the state of a task (drag, archive, `Ctrl Enter`) changes **only that block**. Its children keep their
    states.

  Example: in

  ```markdown
  - TODO Release version 2
  	- TODO Write release notes
  	- DONE Update the changelog
  	- Check with [[Anna]] about the date
  ```

  "Release version 2" is a TODO card with the description "Check with Anna about the date" and "1/2 subtasks";
  "Write release notes" is a TODO card and "Update the changelog" a DONE card, both marked "↳ Release version 2".
- **Click a card to edit it right there** with the same block editor; the change goes straight into the source block.
  While the card is open, all its children (description and subtasks) are shown and editable, as in the file.
- **Hovering a card shows a small jump icon**; clicking it opens the source page and scrolls to the block, highlighted
  briefly.
- **Drag a card to another column** to change the block's state in its file (done date added or removed per §5).
- **Order within a column:** cards with a `priority::` number first, highest first; then newest source
  first (journal date, or the page's last edit), then position in the file. Finished columns sort by done date and
  time, newest first. *(my call)*
- **Drag a card to a place in a column**: the place is kept as its `priority::` (one more than the card
  below; cards above are raised when needed; among the cards without one the line goes). Finishing or archiving a task
  removes it. Format: `docs/format.md` §8 and §10.
- **"+ Add"** at the bottom of a column creates a new block in that state at the end of **today's journal** and opens it
  for editing on the board.
- **Archiving:** a card's menu has "Archive", which adds an `archived::` line; the task keeps its state and leaves the
  board, and the Archive view lists it. A finished column has "Archive finished more than N days ago" (N configurable,
  default 14), and Breccia archives such tasks by itself while auto-archive is on (`docs/format.md` §8 and §11).
- Board settings (rename, add/remove/reorder columns, delete board) open from the board's title.
- **Hiding columns**: hovering a column shows a hide icon in its title (the ⋯ menu has no
  Hide or Show all entries). A hidden column is a faint thin line with a ▾ at the top; its tooltip names
  it and its cards ("WAITING (3 cards), click to show"), and a click shows it again. Hiding narrows the column away in
  about 150 ms (none with reduced motion). The last visible column cannot be hidden. A dragged card resting on a
  marker for about 0.5 s opens the column until the drag ends. The choice is kept on this PC in `settings.json`, per
  notes folder and board name (a rename in the board dialog keeps it), never in the notes folder; hiding changes only
  the board, every state stays in use elsewhere.
- Filtering a board by tag or page is later.

### 7.7 All pages

A table of all pages, sorted alphabetically by default, replacing the main area.

| Column | Meaning |
|---|---|
| Page | name; click to open |
| Folder | folder in the page tree, `—` at top level |
| Created | date of the first Git commit that contains the file; for files not yet committed, the file system's creation date. A page renamed or moved counts from the commit that added it at its current path; the dates refresh after each commit and pull. |
| Last edited | file modification time |
| Linked from | number of blocks in other pages that link to this page |
| Links out | number of links this page makes to other pages |

Every column sorts on click (again to reverse). A filter box narrows by name as the user types. Journal pages are hidden
by default, with a "Show journal pages" switch. Multi-select for delete/move is later.

### 7.8 Search

`Ctrl K` (or the sidebar box) opens a quick search:
- Typing finds **page names** (fuzzy) first; `Enter` opens the selected page, or creates it if none matches exactly.
- Below the pages, **full-text results** from all blocks (SQLite FTS5), grouped by page, with the match highlighted;
  selecting one jumps to the block.
- Filters can be typed into the same box: `#budget` limits to blocks with that tag; a state keyword (`TODO`) limits to
  blocks in that state; they combine (`TODO #budget licence`).
- A date typed into the box offers "Go to ‹day›" above everything else (§7.4).

### 7.9 Git

- **Automatic commits** a few minutes (default 5, configurable; 0 turns the timer off) after the last change, and when
  the app closes (the window closes at once; the last commit and push take at most 15 s in the background). The
  message is generated from what changed: `add Meeting notes; update Project X, 2026-11-03 +1; rename Old -> New;
  delete Draft` (pages, journal days and `settings`; cut to counts past about 72 characters; no prefix, no date, which
  the commit records anyway).
- **What a commit includes:** every change **inside the notes folder** (`git add -A -- <notes folder>`), including files
  changed by other editors, but nothing outside it. The notes folder is normally the repository root; it may also be a
  sub-folder of a larger repository, in which case Breccia still commits only its own folder. The page list in the
  message and the "N changes not pushed" count refer to that folder's changes and commits. *(my call)*
- **If the repository has a remote:** pull when the app starts and every few minutes (default 5, configurable; 0 turns
  the timer off), and push after each commit. Pulls rebase local commits on top of remote ones.
- **Conflicts:** if a pull cannot be applied cleanly, Breccia stops syncing, leaves the repository in a state the user can
  resolve with normal Git tools (or aborts the rebase so local work is untouched — builder's choice, but no automatic
  resolution) and shows a red status with an explanation. It never discards text.
  Breccia aborts its own rebase at once, so the files and local commits are exactly as before the pull, keeps committing
  locally, and stops pulling and pushing until the user clicks the Git status or restarts. A remote that cannot be
  reached is not a red state: the status says so quietly and Breccia tries again at the next pull.
- Uses the installed `git` command. If the notes folder is not a Git repository, Breccia offers to create one (`git
  init`, plus a `.gitignore`). It offers this through the Git status ("Not in Git · Set up…"), and adds a
  `.gitattributes` with `* text=auto eol=lf` too; neither file is replaced if it exists.
- **Git status** in the status bar (§7.13), on its right: "Saved to Git 2 min ago", "Synced", "3 changes not pushed", or a red warning.
  Clicking it commits and syncs immediately; a history button next to it opens the Git history.
- Git can be switched off per folder in Settings (the `[git] enabled` setting in `breccia/config.toml`).

### 7.10 Themes

- Six built-in themes: **Light, Dark, Violet, Graphite, Taupe, Teal**. The default follows the
  operating system's light/dark setting.
- The choice (or "System") is a setting of this computer (§4). Each theme is a token set on `[data-theme="…"]`; the
  window's title bar follows its light or dark.
- Every colour in the UI comes from a token (CSS variable): backgrounds, sidebar, lines, text, muted text, accent, link,
  tag, card, one colour per task state, the 25 page colors (§7.3) and the strength of the page-color wash (§7.4): 28 %
  in Light and Taupe, 30 % in Teal, 34 % in the others. They also include each theme's shade parameters (base
  lightness, chroma and offset factors). A custom hue's shade (§7.3) is computed from them at runtime with the same rule
  as the 25 colors. A page's vividness `v` (§7.3; the named colors have none) scales the custom shade's chroma and the
  wash strength by `v/100` (rounded to a whole percent). At 100 nothing changes. In a theme where text (4.5:1), links
  or tags (3:1) would otherwise be hard to read on its wash, the wash strength is lowered step by step from that scaled
  strength down to half of it, or half the theme's strength if that is lower (rounded up to a whole percent); if that
  is not enough, the shade loses chroma step by step at that lowest strength, down to grey; if even grey is not
  readable, the hue gets no wash. A theme is a set of token values. Switching applies instantly.
- User-made themes (e.g. a `breccia/themes/*.css` file with token overrides) are later, but the token structure must
  allow them.

### 7.11 Network view

- Opens from the sidebar footer. Pages are dots, links (including tags) are lines. Dot size grows with "Linked from".
- Click a dot to open the page; hover highlights its neighbours.
- Filters: hide journal pages (default on), hide tag-only pages, limit to a folder or tag.
- The layout runs in a web worker and settles; the view must stay smooth (pan, zoom, hover) at least at 5,000 pages and
  50,000 links.
- A tag-only page is a page without a file that is linked to only as `#tag`. Limit to a folder shows that folder and its
  sub-folders; limit to a tag shows the tag and the pages that link to it. One layout places every dot, so filters never
  move a page. The layout stops when the dots are still (or after 10 s); the positions are remembered on this computer,
  in Breccia's cache folder, never in the notes folder. The view never writes notes or `breccia/config.toml`.
- A small "neighbours of this page" graph in the page view is later.

### 7.12 Settings

One screen with sections: Notes folder (open/switch), States, Boards, Git, Journal (nothing yet beyond defaults),
Appearance (theme), Keyboard (read-only list of shortcuts in the first version).

Settings opens in the main area from the sidebar footer, with `Ctrl ,`, or by clicking the folder name; changes apply
at once.

Settings ends with a section "Troubleshooting" whose "Open log folder" opens the folder where Breccia keeps its log
(warnings and errors, at most 2 MB).

### 7.13 Status bar

A thin strip along the bottom of the window, as in VS Code, for short state the user may want to glance at: the search
index while it is built ("Indexing for search · 1,200 of 5,000 pages", with a progress line) and the Git status (§7.9).
Any part of Breccia can show and remove an item there; items sit on the left or the right. With nothing to show, the
strip stays empty and quiet.

## 8. Scale and speed

Targets *(my call)*: a notes folder with 5,000 pages / 100,000 blocks opens with the journal usable within 2 seconds
(index refresh continues in the background); typing never waits for the index; the board and All pages update within a
few hundred milliseconds of a change.

## 9. Room for plugins later

No plugin API in the first version, but: every user action goes through a named **command** (e.g. `block.setState`,
`page.rename`) and every change emits a named **event**. Views register with the shell rather than being hard-wired.
A later plugin API can expose those commands and events plus a plain DOM container to render into, so plugins never
depend on Svelte internals.

## 10. Build order

The first version was built in steps, each ending with something usable and tested: the core (notes folder, parser
and writer with the round-trip guarantee, model, config), then the outliner editor, pages and links, the journal,
states and boards, All pages, search, Git, themes and the network view. Everything in §7 exists today.

**Builds and platforms** *(my call)*: Breccia is built and run locally with `just`; a tagged release builds the Windows
installer and publishes it on GitHub (`docs/releasing.md`). There is no auto-update or code signing yet. Linux and
macOS are covered by keeping platform-specific code out of the core; installers and CI builds for them are later.

## 11. Later (explicitly out of the first version)

Tabs and split views, plugins, mobile, Logseq import,
board filters by tag or page, block references and embeds (`((id))`), unlinked references, local
graph per page, user-made themes, encryption, multi-select actions in All pages, installers and CI builds for Linux
and macOS. A "‹ yesterday" link in the day header is not planned; the continuous feed replaces it.

## 12. Left to the builder

- Exact parser and writer implementation (hand-written outline parser plus a CommonMark library such as pulldown-cmark
  or comrak for inline rendering is the expected shape).
- Whether rendered block HTML is produced in Rust or in the frontend from tokens the core provides — as long as the
  meaning comes from the Rust parser (§5).
- IPC payload shapes, index schema, how the watcher recognises Breccia's own writes.
- Icon set, typography, spacing.
- The exact Git conflict handling within the rule "stop, explain, never discard text".
