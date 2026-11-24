# Vocabulary

The words Breccia uses, one line each, and where they show up. Write the app's texts, the docs and commit messages with
these words. Where the code or the older docs use another word for the same thing, it is listed under "Also said" so
it can be found and, when a text is touched anyway, changed. This list follows how the app and `docs/spec.md` use the
words today; the preferred word is a proposal until the owner confirms it (`docs/review.md`, item 100).

## The notes

| Word | Meaning | Where |
|---|---|---|
| **notes folder** | The folder Breccia opens: `journals/`, `pages/`, `breccia/config.toml` and `breccia/dailies.md`. Everything else in it is ignored. | Settings, the title of the window, `docs/format.md` §2 |
| **page** | A `.md` file under `pages/`, with a name and a title. Its blocks are what you edit. | Sidebar "Pages", page view, All pages |
| **journal day** | The page of one day, `journals/YYYY-MM-DD.md`. | "Journal" in the sidebar (the feed of days), the date picker, "Journals" in the page tree |
| **folder** | A folder inside `pages/`, shown in the page tree. It is not part of the page name. The root is called the notes folder, not a folder. | Sidebar "Pages" |
| **block** | One bullet of the outline with its children; the unit you edit, move and link to. | Page view, journal feed |
| **property** | A `key:: value` line under a block (`created::`, `done::`, `archived::`, `priority::`, `due::`), or in a page's first lines (`title::`, `color::`). | The editor; `docs/format.md` §8 |
| **link** | `[[Page]]`, to a page or a journal day. A link through an alias or with `#Heading` counts for the page it goes to. | The editor, linked references, search |
| **tag** | `#tag` or `#[[two words]]`; it links to the page of that name. | Sidebar "Tags", the editor |
| **linked references** | The blocks in other pages that link to this page, listed under the page. | Page view, "Linked from" counts |
| **daily** | One entry of the Dailies view: a thing you do every day, ticked once a day. One line of text in `breccia/dailies.md`, plain (no links). "Add a daily". It is not a task: it has no state and no board. | Dailies view, status bar |
| **linked-only page** | A page that has no file yet: `[[links]]` point to it. It is listed in italics and gets a file once it is moved into a folder or given text. | Page tree, All pages |
| **tag-only page** | A page without a file that is linked to only as `#tag`. | Graph filter, sidebar "Tags" |

## Tasks and boards

| Word | Meaning | Where |
|---|---|---|
| **task** | A block that starts with a state keyword. | Page view, boards, Archive |
| **due date** | The day a task should be finished by: a `due::` line with a link to that day. Shown as a chip; a line with words after the date stays visible next to it. | Task right-click menu, the due chip, `docs/format.md` §8 |
| **due chip** | The small label after a task, or on its card, that shows its due date ("due tomorrow", "overdue 22 Nov"). | Page view, journal, board cards |
| **due date calendar** | The month calendar that sets or removes a task's due date. Not the date picker, which goes to a day. | "Set due date…" in the task and card menus, `Ctrl D` |
| **state** | The keyword a task starts with (`TODO`, `DOING`, `WAITING`, `DONE` by default). A state can be *finished* and *in the cycle* (what `Ctrl Enter` steps through). | Settings > Task states, the slash menu |
| **board** | A view of the tasks of the whole folder in columns. Boards are listed in `breccia/config.toml`. | Sidebar "Boards" |
| **column** | One state of a board: it lists the tasks in that state. A column can be hidden. | A board |
| **card** | A task as shown on a board. Say "card" on a board and "task" everywhere else. | A board |
| **archive** | The place for tasks that were archived: an `archived::` line adds them, the boards leave them out, and a change of state brings them back. | Sidebar "Archive", a card's menu |

## The window

| Word | Meaning | Where |
|---|---|---|
| **sidebar** | The left column: search, Journal, Dailies, All pages, Boards, the page tree, Tags, Graph and Settings. | Left of the window |
| **status bar** | The strip along the bottom: save and index state, Git, the Dailies count ("Dailies 3 open", "Dailies ✓"), the theme button, help. | Bottom of the window |
| **Dailies** | The view of the things you do every day: a checkbox list, ticked ones hidden in the "Done" section at the bottom, starting afresh at the reset time set in Settings > Dailies. | Sidebar "Dailies", status bar |
| **view** | What the main area shows: the journal, a page, a board, Dailies, All pages, Archive, Git history, Graph, Settings. Back and Forward step through views. | The main area |

## Also said (the proposed word is the first one)

- **journal day**, not "journal page" or "day page". The *Journal* is the feed of days. (The graph filter still says
  "Hide journal pages".)
- **task** and **card** are the same block seen two ways; "task block" means the block of a task in the notes.
- **linked-only** and **tag-only** are two different things: a link `[[X]]` or a tag `#X` made the page appear. Do not
  say "virtual page".
- **notes folder** for the folder that is open, **folder** for a folder of the page tree.
- **daily** and **Dailies**, not "habit" or "routine". A daily is not a **task**: it has no state, no board and no
  link to a page.
