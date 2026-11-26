# Owner review list

What the owner should look at in the running app. Claude adds a numbered item for every change a user can see, and
every open question, when it lands. The owner ticks an item off (`[x]`) or writes a note under it. Numbers are never
reused. Ticked items move to `docs/reviewed.md` with their notes.

## Carried over from the prototype

9. [ ] **Git with a real remote:** sync click, closing the app during a sync, and a conflict created from another
   machine.
10. [ ] **Git over SSH without an agent:** a remote whose key needs a passphrase and no agent running; the sync should
   fail with a clear message, not hang.
11. [ ] **Settings:** themes, renaming and removing a used task state, hand edits of `config.toml` while Settings is
   open, switching folders and the recent folders list.
12. [ ] **Typing in Settings boxes:** type in one box while another change is saved or refused; the typed text must
   stay.
15. [ ] **Graph:** filters, hover, Find, keyboard keys, Re-arrange.
17. [ ] **Graph at scale:** run `just graph-scale --onscreen` and judge pan and zoom by eye (wheel zoom at 5,000 pages
   is known to be slow, backlog #56).
18. [ ] **`just release` at a real console:** at the pause, try Ctrl+C and a wrong answer (it should ask again); with an
   SSH key that needs a passphrase, check the push prompt after the pause.
19. [ ] **Open the demo in Obsidian:** open a copy of `docs/demo/` in Obsidian and compare what you see with
   `docs/compatibility.md`.
20. [ ] **Alias links in Obsidian:** check that a typed `[[Q&A: hiring]]` link resolves through the alias Breccia writes
   (`docs/compatibility.md` still says "not verified").

## Page colors

31. [ ] **Color from a link in the journal:** right-click a link or tag in the feed and on a day page, choose "Color…"
   and pick; the linked page gets the color and the washes follow. An alias link colors the aliased page, a tag
   without a page gets its file, and links to days or to missing pages show no "Color…" entry. Inside an open block
   editor, and on selected text that is not a link to a colorable page (including a link to a day or a missing page),
   the normal browser menu stays, so copy and paste keep working; say if you want the color menu there too. Undo for
   such a pick is on the linked page (its swatch or its blocks), not in the journal.
32. [ ] **Demo and README:** the demo pages Q&A: hiring, Release 2, on call and Project X have colors, the
   2026-10-29 journal has one new block, and the README journal screenshot shows the washes.

## Follow-ups of plans 1 to 3

54. [ ] **Focus after a pick from a link:** right-click a link in the journal, choose Color… and pick, or press Esc:
   the focus is on the link again (it shows a focus ring when you used the keyboard), and Tab moves on from there. If
   you click elsewhere, for example in the search box, the focus stays there. Undo for the pick is still on the linked
   page. Say if `Ctrl Z` on the link should undo the pick too.
## Website

63. [ ] **The text:** read the page once. Every sentence comes from the README; say what to cut, add or reword. The
   download button names no version (it opens the newest release); say if you want the number shown.

## Audit of 2026-11-10

The whole-application audit is in `docs/audit/2026-11-10/` (start with its `README.md`). It changed no code. These
are its questions for you; each answer decides what a later plan does.

65. [ ] **Remote images in notes:** `![](https://…)` in a note is fetched as soon as the page is shown. A note
   pulled from a shared repository can so make Breccia contact an outside address. Keep it, or show remote images
   only after a click? (Audit Q2.)
## Email links

100. [ ] **Vocabulary (backlog #63):** read `docs/vocabulary.md`. It lists each term with one line and where it shows
   up, written from how the app and the spec use the words today. Please check two things: (a) is every meaning right,
   and does anything missing deserve a line? (b) the proposed words where the app uses several: **journal day** (not
   "journal page" or "day page"; the graph filter still says "Hide journal pages"), **card** on a board and **task**
   everywhere else, **linked-only** and **tag-only** as two different things, and **notes folder** (the open folder)
   versus **folder** (a folder of the page tree). Say which to change. Nothing in the app was changed; bringing texts
   in line would be a later step, only for the words you confirm.

102. [ ] **Pasted text with a hidden mark (backlog #8):** copy text out of a file saved "UTF-8 with BOM" (Notepad's "UTF-8
   with BOM" option) that starts with `TODO buy milk`, and paste it into an empty block: it is a task, not plain text.
   Before, a hidden character in front kept it from being one. Hard to try by hand; covered by unit tests.

## Dailies (plan 13)

119. [ ] **The status bar item:** the left of the status bar shows "Dailies 3 open"; with all ticked it shows "Dailies
   ✓"; with no dailies at all it shows nothing. A click opens the view. Back and Forward step through the view like
   the Archive.

120. [ ] **Starting afresh:** in Settings > Dailies (after Journal) the field takes `4:00` and saves `"04:00"` in
   `breccia/config.toml` under `[dailies]` (its comments stay). With 04:00, a daily ticked at 01:30 counts for the day
   before: it is open again after the 04:00 reset, and a daily ticked at 05:00 stays ticked until 04:00 the next day.
   Leave the window open across the reset time: the ticks go on their own (within a minute). Close Breccia, or let the
   PC sleep, over the reset time: on return the daily is open. Writing `reset = "4am"` in the file gives a notice and
   is read as 00:00; the file is not changed. Then type `00:00` (or any time) in the Settings field and leave it: the
   file now says `reset = "00:00"`, and the notice does not come back.

121. [ ] **Outside edits and Git:** edit `breccia/dailies.md` in another editor (add, reorder, tick a daily by adding a
   `checked::` line): the view follows at once. In Breccia, right-click a daily and choose Delete, and leave the
   question open; change that daily's text in the editor and save; then press Delete in Breccia: it is refused with
   "This daily changed in another program; the list now shows the file as it is.", and the file keeps the changed daily.
   The same holds for an edit field left open (click a daily's text, change it in the editor, then press Enter in
   Breccia): the editor's text stays. Text you added by hand (an intro line, a note under a daily) stays; the other
   dailies keep their text (a file with CRLF line endings becomes LF on Breccia's first write). A Git sync commit that
   touched only this file says "dailies" in its message.

122. [ ] **Dailies are plain text:** a daily written `Call [[Mum]] #family` shows exactly that, with no link and no
   tag; the text is not found by search and `Mum` gets no linked reference from it.

123. [ ] **Question (answered): deleting a daily:** the plan recommended an undo for a deleted daily. **Answered (owner,
   2026-11-18): ask before deleting and have no undo.** Done: the question names the daily, and when the daily has lines
   under it that the view does not show (nested blocks, a `note::` line, any property but `checked::`), it says that
   those lines go too. Is that enough, or should a deleted daily also be recoverable (the file is in Git, if you use
   it)?

124. [ ] **Dailies: ticked dailies are hidden:** tick a daily: it leaves the list and the header "▸ Done (1)" appears
   below the open dailies. Click the header: it opens (the triangle turns down) and shows the ticked dailies greyed and
   struck through, in their file order; they can be unticked, edited, dragged and deleted there as before. Click it
   again to close it. The section is closed whenever Breccia starts and stays as you left it while Breccia runs (it is
   not saved). With nothing ticked the header is gone; with all ticked the view still says "All done for today" above
   it. Should the open or closed state be remembered across restarts?

125. [ ] **Dailies: adding with "+":** the field "Add a daily" no longer stays at the bottom. Click the "+" beside the
   title "Dailies": the field opens at the bottom with the cursor in it. Enter adds the daily and keeps the field open
   for the next one; Esc, or clicking elsewhere with the field empty, closes it (Esc does not leave the view). Typed
   text keeps the field open when you click elsewhere. With no dailies at all the field shows at once.

126. [ ] **Dailies: deleting by emptying the text:** click a daily's text, delete all of it and press Enter (or click
   elsewhere): Breccia asks "Delete the daily '…'?", the same question as Delete in the right-click menu (with the
   note about hidden lines under it). Delete removes it; Cancel or Esc keeps the daily with its old text. Esc while
   editing still cancels the edit without asking.

## Open follow-ups (plans 12 and 13)

127. [ ] **The log hides a Git password with an apostrophe:** a remote such as `https://me:pa'ss@example.com/repo.git`
   in a log line has its user name and password replaced by `***`, with no part of the password left (before,
   everything from the apostrophe on stayed visible). Hard to try by hand: Breccia does not log failed Git commands yet
   (backlog #90), so no remote address reaches `breccia.log`. Covered by the unit test
   `redact_handles_apostrophes_and_empty_authorities` in `app/src-tauri/src/logfile.rs`; check that it is there.

128. [ ] **The log no longer masks part of a file address:** an address such as `file:///C:/notes/a@b.md` in a log
   line shows in full, because it has no user name or password. Addresses with credentials are still replaced by
   `***`, and `https://host:8080/a@b` is still partly masked (it errs on the side of hiding). Hard to try by hand:
   nothing in Breccia writes a `file:///` address to the log today. The file addresses and addresses without
   credentials are covered by the unit tests `redact_handles_apostrophes_and_empty_authorities` and
   `redact_leaves_a_quoted_url_without_credentials_alone` in `app/src-tauri/src/logfile.rs`; check that they are there.

129. [ ] **A daily is not deleted when lines were added under it while asking:** right-click a daily and choose Delete,
   and leave the question open. In an editor add a line under that daily in `breccia/dailies.md` (for example
   `  note:: x`) and save. Press Delete in Breccia: it is refused with "This daily changed in another program; the list
   now shows the file as it is.", and the file keeps the daily and the new line. Delete it again: the question now says
   that the lines under it go too.

130. [ ] **Right-click while editing a daily shows the text menu:** click a daily's text to edit it and right-click in
   the field: the usual text menu appears with Cut, Copy and Paste, and Paste puts text into the field. Right-click a
   row you are not editing: the Dailies menu with Delete shows as before.

131. [ ] **Typing the default into a Settings number field fixes a wrong value in the file:** in
   `breccia/config.toml` write `archive_after_days = 0` (or a wrong `commit_delay_minutes`) and open Settings: the
   field shows the default (14 for the archive days) and Breccia shows a notice. Type the number shown, or any valid
   number, and leave the field: the file now has that number, its comments and other keys are unchanged, and the notice
   does not come back. Just clicking into the field and out again also writes the default it shows (as the Dailies
   reset field does); in Settings > Git, leaving either minutes field writes both. This happens only while the file's
   value is refused.

132. [ ] **Dailies: a drag handle:** move the pointer over a daily: a handle of six dots appears left of its checkbox
   (the row does not shift), and the pointer turns into a hand on it. Drag a daily by the handle within its group: it
   moves as before. The handle hides when the pointer leaves the row; dragging anywhere else on the row still works.

133. [ ] **Web links: full address on hover, "Copy link" on right-click:** with "Shorten" on in Settings > Appearance,
   rest the pointer on a long web address in a block: after a short pause its full address shows as a tooltip (also
   on a named link and a card; a mail link shows the address without `mailto:`). Right-click the address in a journal
   day or on a page: the menu holds "Copy link"; choose it and paste somewhere: the full address is pasted. Open
   question: should board cards get the "Copy link" menu too (today only the tooltip)?

134. [ ] **Quotes look like quotes:** write a block `> Some quote` (or add a second line `  > more` under it) and leave
   the editor: the quote shows with a thin bar on its left and muted text, flush with the row, without the big indent
   and extra space it had before. The same in a page's preamble and on a board card.

135. [ ] **Boards: an open card keeps its text inside the task:** on a board, click a card to open it, put the caret at
   the end of the task's line and press Enter: a new line appears one level deeper, first under the task (above any
   description or subtasks); type a word and press Esc twice. The card now shows the word as its description, and the
   file has it as a line under the task (before this, the line went next to the task and dropped off the card). Press
   Enter with the caret at the very start of the task line, or inside its state word (such as `TODO `): the task line
   stays whole and an empty line opens first under it. Paste several bullet lines (`- a`, `- b`) into the task line:
   they appear first under the task, keeping their nesting, and the task line keeps its text. In the
   open card, Shift Tab on a line directly under the task, Alt ↑ on the first of them, Alt ↓ on the last, and Backspace
   at the start of the task's line do nothing; deeper lines still outdent, and every key in the journal and on pages
   works as before.

## Due dates (plan 16)

136. [ ] **Due dates on tasks:** by hand, in a journal day or on a page:
   - Type `TODO Send the offer`, press Shift Enter and type `due:: [[2026-12-01]]` (a day 6 or more days away). When you
     leave the block, the `due::` line is hidden and a chip "due 1 Dec" shows after the task.
   - Right-click the task (not on a link): the menu has "Set due date…". It opens the due date calendar at the task.
     Pick a day: the chip changes and the file has one `due:: [[YYYY-MM-DD]]` line after the task's other property lines.
     Open the calendar again: it says "Remove due date"; choose it and the chip and the line are gone.
   - While editing a task press `Ctrl D` (`Cmd D` on a Mac): the same calendar opens. `Ctrl D` was free in Breccia's
     editor; `Ctrl Shift D` still opens the go-to-a-day calendar. On a line that is not a task, `Ctrl D` shows "Only a
     task can have a due date." and writes nothing.
   - On a board, hover a card, open its menu and choose "Set due date…": the same calendar; the card shows the chip.
   - The chip's words (unfinished task) and tones: 6 or more days: "due 29 Nov" (with the year when it is not this
     year), muted; 3 to 5 days: "due in 3 days", muted; 2 days: "due in 2 days", amber; tomorrow: "due tomorrow",
     amber; today: "due today", amber; yesterday or earlier: "overdue 22 Nov", red. A chip in words ("today" to "in 5
     days", and "overdue") shows the date as its tooltip, such as "1 Dec 2026".
   - One pick or removal is one undo step: `Ctrl Z` brings the old `due::` line (or its absence) back.
   - Finish the task (`Ctrl Enter` to DONE): the `due::` line stays and the chip says "due 22 Nov", muted. Make it
     open again: the words and the colour come back.
   - Open the page of the due day (click the date in a link, or search it): the task is in its linked references.
   - Keep the app open over midnight, or let the PC sleep over it: the chip's words and colour follow the new day.
   - A `due:: soon` line shows as an ordinary dimmed property and a `DEADLINE: <2026-12-01 Tue>` line as ordinary
     text; neither gives a chip.
   Things you may want to object to:
   - Setting a date rewrites the first `due::` line even when it holds words (`due:: ask Ben`), and "Remove due date"
     deletes every `due::` line, including dimmed ones. Should Breccia leave lines without a date alone?
   - Chips also show in linked references and in an open card, wherever the task is drawn, not only in the journal, on
     pages and on board cards. There they have no task right-click menu (only journal days and pages have one).
   - On ordinary pages the right-click zone is new: outside an open editor and off selected text the browser's own
     right-click menu no longer opens (as in journal days). Links on pages get "Copy link" and the task menu, but no
     "Color…" (only journal days list colorable links; plan 17 changed this, see item 138).
   - A board card's menu button shows only on hover, so "Set due date…" (and Archive) on a card has no way in by
     keyboard. This was so before; backlog #99 holds it. Should a card have a key, as a task in the journal has `Ctrl D`?
   - Boards cannot sort by due date yet (backlog #98). Which order do you want: a column setting, or due dates first
     after `priority::`?

## Due date follow-ups (plan 17)

137. [ ] **A due line with words stays visible:** by hand, on a task type `due:: [[2026-12-01]] client waits` in one
   block and `due:: [[2026-12-01]]` in another, and leave each block. The line with only the date is hidden; the one
   with words shows dimmed next to the chip. Links in the words open their pages.
   Then pick a new date on the line with words: the line becomes `due:: [[the new day]]` and the words go; Ctrl Z
   brings them back.

138. [ ] **Pages get the journal's right-click menu:** by hand, on an ordinary page with a link to another page and a
   tag, right-click the link and the tag: each has "Color…". Color them and check the journal's washes follow. A
   page's link to itself has "Color…" too. A link to a journal day has no menu entry.

139. [ ] **Due date calendar and task menu focus:** by hand, in a journal day:
   - Give a task today's due date and open the calendar again on it: today's ring shows inside the filled day.
   - Click on empty space so nothing is focused, right-click the task, "Set due date…", pick a day; then right-click
     it again and press Esc. The Esc writes nothing. Afterwards nothing holds the focus, not even a hidden part of
     the outline (e2e step 155 checks this; by hand it shows only in where Tab goes next).
   - Edit another block, right-click the task, "Set due date…", pick a day: the editor has the focus back with the
     caret where it was, and you can type on.
   - Open the calendar and click another block's text: that block opens for editing and keeps the focus. On a board,
     open the calendar from a card's menu and click an empty column: the focus is on nothing, not back on the card.
   - On a board, open a card, put the caret in its task line, press Ctrl D and pick a day: the due line goes under
     the task.

## Heading links and `#` in page names (backlog #13)

140. [ ] **Heading links, tags and `#` in names:** by hand, in a fresh folder (`just dev`):
   - In a block type `[[Plan#Goals]]` with no page `Plan`, and click it: a blank page `Plan` opens, not `Plan#Goals`.
     Type into it; the file is `pages/Plan.md`. Click the link again: `Plan` opens.
   - On a page `Plan` with content, add `[[Plan#Goals]]` on one page and `#Plan#Goals` on another: Plan's linked
     references list only the first; the Tags section lists `Plan#Goals`; in the graph the tag's page has an edge to
     a node `Plan#Goals`, not to `Plan`.
   - New page `C# notes`, and renaming any page to a name with `#`: both are refused with "a page name cannot contain
     [, ], | or #". A page file `C# notes.md` made outside Breccia keeps its name and `[[C# notes]]` still opens it.
   - In the `[[` menu, typing `Page#H` offers no "Create page"; existing pages with `#` are still offered.
   - Open question: two clicks can still make a blank page with `#` in its name (it gets a file once you type), as
     before: a tag (`#[[C# x]]`), and the All pages row of a linked-only page `Gone#H` (from `[[Gone#H]]` with no
     page `Gone`). Should the tag be refused, and should the row open `Gone` like the link does?

## Aliases: fresh name lists and reader edge cases (backlog #14)

141. [ ] **Aliases:** by hand, in a fresh folder (`just dev`):
   - Open `Ctrl K` and type `wildebeest`. In another editor, add `aliases: [wildebeest]` to the front matter of an
     existing page and save: the page row for `wildebeest` appears in the open box at once (it used to need the box
     closed and opened again). The same in a block: type `[[wilde` and leave the completion open, then add the alias
     outside: it is offered at once.
   - Give two pages the same alias (`aliases: [x]` in `A.md` and `B.md`), outside Breccia: one warning. Rename `B` in
     Breccia: no second warning. A third page that adds `x` is warned.
   - Front matter Breccia now reads as Obsidian does: `aliases: ['it''s, here']` is one alias `it's, here`;
     `aliases:x` (no space) gives no alias; `aliases: {a: b}`, an item `- a: b` and `[{a: b}, c]` give no alias for
     the mapping (`c` stays). A name with `: ` needs quotes, as in YAML: `- "Kube: prod"`.

## Drag a page into the outline (backlog #15)

142. [ ] **Drag a page from the sidebar into the outline:** by hand (`just dev`), on a page and in the journal:
   - Click a block to edit it, then drag a page from the sidebar over its text: the block is outlined (there is no drop caret); drop,
     and `[[Page name]]` is in the text at that place, with the caret after it. The page stays in its folder.
   - Drag a page onto a rendered block (not edited): a line shows under the row; drop, and a new block holding
     `[[Page name]]` comes after that block and its children, being edited.
   - Open the Journals fold and drag a day: it inserts `[[YYYY-MM-DD]]`. Drag a page onto an empty page's "start
     writing" line: the link is its first block.
   - Dragging pages onto folders still moves them; a drop on linked references, a board or the page title does nothing.
   - My calls (spec §7.2): a rendered block gets a new block after it rather than the link appended to its text (the
     text may end with property lines, and a new block changes no text you wrote); linked references and boards take
     no drop. Should a drop on a rendered block append to its text instead?

## Back and Forward restore the edited or selected block (backlog #17)

143. [ ] **Back gives back the block you left from:** by hand (`just dev`):
   - On a page, click into a block and move the caret into the middle of its text. Open another page from the sidebar,
     then press `Alt ←`: the block is edited again, the caret where it was.
   - Select two blocks (click one, `Shift` click another), go to another page and press `Alt ←`: both are selected
     again. `Alt →` and `Alt ←` once more do the same.
   - The same in the journal, on a day's block.
   - Delete the block in the other view (or outside Breccia) before going Back: the page and its scroll position
     come back, with no block edited.
   - Leaving a board (with a card open), the graph or Settings and coming back opens no editor.
   - My call: the caret comes back at the same character count, clamped to the text's end, even if the text changed
     meanwhile.

## Undo with no block edited: page, journal and board (backlog #21, #91)

144. [ ] **`Ctrl Z` works without clicking into a block:** by hand (`just dev`):
   - On a page, move or delete a block, press `Esc`, then `Ctrl Z`: the change is taken back. `Ctrl Shift Z` (or
     `Ctrl Y`) makes it again.
   - In the journal, change blocks on two days, press `Esc`, then `Ctrl Z` twice: the newer change goes first, then
     the older one, each on its own day.
   - On a board, drag a card to another column (or to another place in its column), then `Ctrl Z`: the card goes back
     and its file is as before; `Ctrl Shift Z` drops it again. The same for "Archive" and "Archive finished…".
   - With the search box, a dialog, a menu or the board settings open, or while a block is edited, `Ctrl Z` does what
     it did before (the editor keeps its own undo).
   - My calls: in the journal feed and on a board the keys step back through the changes made in that view, newest
     first; a change made in another view starts that list again (so after editing a page, `Ctrl Z` on the board does
     nothing until the next board change). Changes in an open card count as board changes. Should the journal instead
     always undo on the day at the top of the screen?

## A refused command no longer splits the typing undo step (backlog #86)

145. [ ] **Typing around a refused command is one undo step:** by hand (`just dev`): type in a block, press `Ctrl Enter`
   on a block whose state cycle is empty (or do anything the app refuses with a message) within a second, type more in
   the same block, then `Ctrl Z`: both bursts of typing go in one step. A command that does change something (a move,
   a state change) still ends the step.

## A heading link jumps to its heading (backlog #47)

146. [ ] **`[[Page#Heading]]` opens the page at that heading:** by hand (`just dev`): on a page with a long outline,
   write a block `## Plans` far down; elsewhere link `[[That page#plans]]` and click it: the page opens with the
   `## Plans` block in the middle of the view, briefly highlighted as a card jump is (any case, spaces around the
   heading ignored, any level `#` to `######`). A heading the page does not have (`[[That page#Nowhere]]`) opens it at
   the top. The same link clicked in a page's linked references jumps too. `[[#Plans]]` (same page) and
   `[[Page#Heading#Sub]]` do not jump (the second opens at the top). Is the middle of the view right, or should the
   heading sit at the top?

## Board columns sort by due date (backlog #98)

147. [ ] **Within a priority, cards with a due date come first:** by hand (`just dev`): on a board, give three cards in
   one open column the same priority (or none) and set due dates on two of them with "Set due date…", one soon and one
   later; leave the third without. The two with a date come first, the soonest first, then the one without. A card
   with a higher priority still comes above them all. Change a date and the cards re-order. Finished columns still go
   by done date, and a card dropped among cards without a priority takes its place by the new order. Only the
   `due:: [[YYYY-MM-DD]]` form counts. Open question: should dropping a card above an earlier-due card of the same
   priority be possible (the drop only writes the priority, so due dates win within one priority)?

## A card's menu and due date by keyboard (backlog #99)

148. [ ] **A card's menu and due date can be reached by keyboard:** by hand (`just dev`): open a board and press `Tab`
   until a card has the focus: its ↗ and ⋯ buttons show (also with the mouse elsewhere), and two more `Tab`s reach
   them. Back on the card, `Shift F10` (or the context-menu key) opens the card menu with its first item focused; `Esc`
   closes it and the focus is back on the card. `Ctrl D` on the focused card opens the due date calendar; `Esc` writes
   nothing and leaves the focus on the card, a picked day writes `due:: [[YYYY-MM-DD]]` under the task. Inside an open
   card, `Ctrl D` still sets the due date of the edited task. A mouse click on a card does not show its buttons once the
   pointer leaves.

## A quick click outside the due date calendar (backlog #101)

149. [ ] **A quick click outside the due date calendar always closes it:** by hand (`just dev`): open the due date
   calendar on a task (right-click the task, "Set due date…", or `Ctrl D` while editing it), then click quickly on
   another block's text. The calendar closes, that block is edited with the caret in it, and nothing is written. Open
   the calendar again from there: `Esc` and a picked day give the focus back to that block's editor. A right-click
   outside the calendar now closes it too, at the press.

## The help explains how to write (backlog #81)

150. [ ] **A Writing tab in the help shows the syntax:** by hand (`just dev`): press `F1`. The help opens on
   "Shortcuts" as before; next to it is a tab "Writing". Click it (or `Shift Tab` from the filter, then `→`): one row
   per syntax, the example as typed in a monospace box and a few words: links, `[[Page|other text]]`, heading links,
   journal day links, tags, `#[[two words]]`, aliases, a task (its example starts with your first state, and the row
   lists your states: rename one in Settings > Task states and reopen the help), `key:: value`, `due::`, `priority::`,
   then the Markdown basics (bold, italic, strikethrough, inline code, heading, quote, web and mail links, code fence).
   Type `due` in the filter: only the due date row is left; the filter narrows whichever tab is shown and keeps its
   text when you switch. `Esc` clears the filter, a second `Esc` closes the help; the ? button and Settings > Keyboard
   "open the list" still open it. Open questions: are lists and tables wanted too (left out: the outline is the list)?
   Should the rows also show the rendered result?

## Performance at 5,000 pages (plan 18)

151. [ ] **The window shows at once and the folder opens inside it:** by hand, start Breccia on a large notes folder of
   your own. The window appears at once with the status bar and "Opening ‹folder name›…" in the middle; the help
   (`F1`), the theme and the zoom work, nothing else does yet. As soon as the files are read the journal shows and takes typing. A last folder that is gone or cannot be opened shows the
   Welcome screen with the reason, never a window stuck on "Opening…". If the open itself fails inside Breccia, the
   Welcome screen says "Breccia hit an internal error while opening the folder." Open question: is the plain text enough, or is
   a count of the files read wanted (Q1 b, later work)?

152. [ ] **A pull no longer makes typing wait while Git rebases:** by hand (two clones of one remote, `just dev` on one):
   in the other clone change a page and push; in Breccia's clone make a local commit first (or just type), then wait
   for the pull (or click the Git status). Type in a journal day while it runs: typing does not stop for the rebase
   (a short pause while the files move is expected), and afterwards your text and the pulled page's text are both
   there, the history is one line with your commit on top, and no extra "notes:" commit appears. A pull with a
   conflict still shows the red state with the file names and leaves your files as they were. Known differences: Git
   hooks named `post-rewrite` do not run on the fast path, and an older Git (before 2.44) keeps today's locked
   rebase; Git 2.53 and newer are handled too (item 157). Measured at 5,000 pages (`scale::`): the time the notes are locked during a pull fell from 855 to about 500
   ms (a save during the fetch) and from 703 to about 470 ms (none); the rest is two scans of the folder by Git
   (about 100 ms each) plus the move of the files. Open question: is that enough, or should the locked commit step
   be skipped when nothing was saved since the unlocked one (Task 6)? Done in item 154.

153. [ ] **Long Git histories and archives open and scroll without stutter:** by hand, in a notes folder with a long
   history (thousands of commits) open the Git history and press "Show more" several times, then scroll from top to
   bottom and back; open the Archive with many archived tasks and do the same. Scrolling stays smooth, and the rows,
   their hover and a click on an Archive row work as before. With the history scrolled down, make a commit (type in a
   page, click the Git status): the rows you look at stay in place, nothing goes blank, and the new commit is on top
   when you scroll up. In the Archive, scroll down, then type in the filter: the list jumps to its top and shows the
   first match. Back (`Alt ←`) from a page opened in either view brings its scroll position back (the Git history
   reloads only its newest 200 commits, as before). Only the rows on screen are drawn now, as in All pages.

154. [ ] **A pull right after typing no longer holds up typing for a second:** by hand (two clones of one remote,
   `just dev` on one): change a page in the other clone and push; in Breccia's clone keep typing in a journal day while
   the pull runs (wait for the timer, or click the Git status), also with a keystroke landing the instant the pull
   starts. Typing pauses for a fraction of a second at most (no longer a full second when you typed just before the
   pull), and afterwards your text and the pulled page's text are both there, the history is one line with your
   commit on top, and the Git status is green. Known difference: a page you created in the last instant before the
   pull goes in with the next regular commit (after the usual wait), not before the pull (the text is the same).
   Measured at 5,000 pages (`scale::`), the time the notes are locked during a pull fell from 460 to about 360 ms (a
   save during the fetch), from 424 to about 360 ms (none) and from 1267 to about 350 ms (a save just before the lock). Still over the 100 ms goal (follow-up in
   backlog #85).

155. [ ] **The Git history opens faster:** by hand, in a notes folder that is the top folder of its Git repository
   (the usual case) with a long history, open the Git history and press "Show more" a few times. The list looks as
   before and the "not pushed" marks are the same (a commit the remote lacks is marked, one it has is not; a remote
   never pushed to marks them all). Known difference: a commit that changed no file at all (made by hand with
   `git commit --allow-empty`, or the side of a merge that brought nothing new) now shows in the history; Breccia
   itself never makes such commits; after one, the history's top row is newer than the "last commit" time shown
   elsewhere, which still counts only commits that change a notes file. A notes folder inside a bigger repository still shows only the commits that
   touch the notes folder. Measured at 5,000 pages (`scale::git_at_scale`, medians): `git.log` of 200 of 3,000
   commits 164 to 183 ms before, 181 to 193 after (no clear change on this machine's noise); with a remote never
   pushed to 247 to 287 before, 186 to 224 after. Both still over the 100 ms goal (the rest is in backlog #85: fewer
   Git starts per load).

156. [ ] **Typing pauses less while a large folder is indexed for the first time:** by hand (`just dev`, or open a
   folder of a few thousand pages for the first time): while "Indexing" shows in the status bar, type in a journal day.
   The text appears as usual; the pauses between keystrokes are shorter than before. Search still answers when the
   index is complete, and the build ends as before. Measured at 5,000 pages (`scale::`): one step of the first build
   went from 20.5 to about 7.5 ms (the goal is one frame, 16 ms); the whole build takes about 0.5 to 1.3 s longer (4.7 to
   about 6.0 s in the last runs, `docs/perf/2026-11-25-plan-18-after.md`; goal 10 s). Two steps per build, about 0.15 s each, are longer (SQLite's full-text merge); that is in
   backlog #85.

157. [ ] **With a newer Git, a pull no longer undoes the other computer's changes:** Git 2.53 changed the command
   behind item 152's faster pull so that it moves the branch by itself. Without this fix, every pull with commits of
   your own on top would have taken back the pulled text in the next commit and pushed that to the other computer
   (still in the history, but gone from the pages, with no red state). Breccia now asks Git for the old behaviour,
   and checks afterwards that the branch has not moved; if it has, it puts the branch back and does the plain rebase.
   This machine has Git 2.45, so the new behaviour was only imitated in a test. By hand, if a Git 2.53 or newer is at
   hand (for example a portable Git on `PATH` for `just dev`): do item 152's steps; afterwards both texts are there,
   the history is one line with your commit on top, and no "notes:" commit undoes the pulled page.

## The frontend controller (plan 19)

The window's code moved into a tested controller; nothing else changes but the recovery after an internal error
(backlog #89, the owner's answers Q1 to Q5). Saving the typed text before the reload cannot fail in a way you
could reach, so the reload going ahead after such a failure has no item of its own. Each item below is covered by unit
tests; by hand only with `BRECCIA_TEST_PANIC` (CLAUDE.md), and the slow-save cases not at all, as nothing makes the
core hang on purpose.

158. [ ] **The notes reload after 10 s if Breccia stops answering, keeping your text:** after an internal error the
   window first saves what you just typed. If that save has not answered after 10 seconds, the window stops waiting:
   the text shows in a notice "Breccia did not answer, so this text may not have been saved. Copy it from here:" with
   the text to copy, and the notes reload as soon as the stuck save ends. If the reload is refused or has not answered
   10 seconds later either, a notice says "Breccia is not answering. Please restart Breccia." and the window can be
   used again (it may show nothing until you restart). If a second internal error hit during the reload, the notice
   says "Breccia hit an internal error again. Please restart Breccia." instead, even when the reload also failed (unit
   tests only: it needs two errors). Closing the window while such a notice is shown asks first.
   Pasting the text back after a slow save that did land can repeat it; the notice says "may".

159. [ ] **Refused clicks after an internal error say a restart is needed:** once Breccia has said "Breccia hit an
   internal error again. Please restart Breccia." (or "Breccia is not answering…"), a click that the core refuses says
   "Not done: Breccia needs a restart after an internal error." instead of "request is for generation 3, …". Typed text
   still keeps its own notice with the text to copy. Unit tests only: `BRECCIA_TEST_PANIC` panics once per run, and the
   "again" case needs a second error within a minute.

160. [ ] **The window is greyed out while the notes reload:** after an internal error, for the moment the notes take to
   reload, a grey layer covers the whole window with "Reloading the notes…" in the middle; clicks, typing and shortcuts
   do nothing (only the zoom keys work), so no click is lost. A reload that ends normally shows no notice but the one
   saying the notes were reloaded. Look at it in a light and a dark theme: the grey is the one behind dialogs, the text
   box reads like a menu. The notices stay under the layer until it goes. If you close the window while it shows, the
   "Close anyway?" question shows above the layer and works. By hand: `BRECCIA_TEST_PANIC=zz` and search for `zz` (the
   layer may flash by too fast to see; e2e step 127 checks it is there).

161. [ ] **A second, different error notice within a minute is shown:** after an internal error, the same notice again
   within a minute stays quiet, as before; a notice with other words is now shown, for example "your notes were not
   reloaded" followed within the minute by "reloaded your notes from disk", or by "closed the notes folder". Unit tests
   only.

162. [ ] **An open dialog closes when the notes reload after an internal error (and when another notes folder
   opens):** in 1.9.1 the reload closed only the search box. Now help, the changelog, a Move, Rename or New board
   dialog, the board settings and a question all close too, as they name the old notes. A question counts as Cancel,
   and a name typed into a dialog is not kept. Covered by unit tests; by hand with `BRECCIA_TEST_PANIC` only if a
   dialog can be open at the panic (it cannot from step 127's search), so unit tests only.

163. [ ] **Click once through every view and dialog:** journal, page, board and card, All pages, Archive, Dailies,
   Git history, Graph, Settings and each of its dialogs, search, F1, the untitled page, Back and Forward. Everything
   behaves as in 1.9.1. The refactor touches every view, and e2e does not cover every dialog.

The empty card that "+ Add" makes on a board is left in today's journal (as its bare keyword, for example `TODO`) if
an internal error hits while it is open; delete it by hand (owner, Q5 a).
