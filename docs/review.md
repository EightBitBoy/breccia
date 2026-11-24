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
     "Color…" (only journal days list colorable links).
   - A board card's menu button shows only on hover, so "Set due date…" (and Archive) on a card has no way in by
     keyboard. This was so before; backlog #99 holds it. Should a card have a key, as a task in the journal has `Ctrl D`?
   - Boards cannot sort by due date yet (backlog #98). Which order do you want: a column setting, or due dates first
     after `priority::`?

## Due date follow-ups (plan 17)

137. [ ] **A due line with words stays visible:** by hand, on a task type `due:: [[2026-12-01]] client waits` in one
   block and `due:: [[2026-12-01]]` in another, and leave each block. The line with only the date is hidden; the one
   with words shows dimmed next to the chip. Links in the words open their pages.
