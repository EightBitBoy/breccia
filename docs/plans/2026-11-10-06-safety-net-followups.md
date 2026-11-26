# Plan 6 (Safety net): follow-ups

Work the plan deferred. Open items are taken by later plans or moved to `docs/backlog.md`. Found by the pre-flight
scan, the per-task reviews and the final whole-plan review (2026-11-10). The plan closed audit findings B5, B6, B7,
M9, M17, M41, M52 and M54 (`docs/audit/2026-11-10/`).

## Owner checks

1. ~~**Review items 70 to 75** (`docs/review.md`). Not tried by anyone yet: clicking "Open log folder" (73); a second
   start bringing the window to the front from the tray, rather than only flashing it in the taskbar (75); whether
   the installer closes a Breccia that sits in the tray before it installs an update (75; matters for automatic
   updates, backlog #52).~~ Closed in plan 12: review items 70 to 75 stay open in `docs/review.md`.

## Recovery after an internal error

2. ~~**A kept session may hold a half-applied edit.** When an internal error happens while some edits are unsaved,
   Breccia keeps the session (owner's decision). The edit that failed may be half done, because the document is
   restored after an error but not after a panic, and a later save could write it. The notice asks for a restart.~~ Closed in plan 12: owner decision of plan 6: the notice asks for a restart.
3. ~~**The watcher and the folder root carry no generation.** If a folder is opened within microseconds of a recovery
   that came from a background thread, the old folder's watcher could replace the new one's. Store the generation
   with both and never let an older one replace or clear a newer one.~~ Done in plan 12 (the watcher and the notes root keep their folder generation).
4. ~~**A Git step that fails mid-rebase** leaves a rebase that the fresh Git engine treats as the user's, so sync stays
   stuck until the user resolves it.~~ Moved to backlog #89.
5. ~~**After a Git failure** the fresh engine's pull is due at once. If the pull itself keeps failing, every save while
   Git is paused recovers and reloads the window (user-paced). Edits made before the failure are not scheduled for a
   commit until the next change or sync click (closing the app still commits them); no test records this.~~ Moved to backlog #89.
6. ~~**After an indexing failure** a search that indexes the same page recovers once per search (user-paced). The test
   for the indexing loop checks the decision function, not a running app.~~ Closed in plan 12: user-paced by design; the decision function is tested.
7. ~~**A recovery during start-up** starts no watcher and no indexing; the notice says so.~~ Closed in plan 12: the notice says so; a restart fixes it.
8. ~~**Smaller points in the shell:** a second recovery met while looking up the folder root is only logged; the reset
   after a failed reopen runs outside `catch_unwind`.~~ Closed in plan 12: double-failure paths; logging is the right reaction.
9. ~~**The 60-second rule can hide a more serious notice:** a recovery that keeps the session within a minute of a
   reload, or a closed folder after a kept session, shows no new notice.~~ Moved to backlog #89.
10. ~~**The window's reload:** a reload whose flush never settles keeps the quiet window open; after the "again"
    notice, other commands show the raw "request is for generation" text; an error during the flush ends with the
    restart notice although the reload worked; events from the old session may still arrive after the new feed (the
    same class as switching folders today); an action in the sidebar, All pages or Graph made before the reload's
    status answer is dropped without a notice; an empty card just made with "+ Add" stays in the journal file
    (`clear()` skips `closeCard()`).~~ Moved to backlog #89.
11. ~~**The window matches the core's recovery texts by their English start,** and the event's fields, the codes
    `recovered` and `stale`, and those texts are copied by hand on both sides. Extend the contract test to cover them.~~ Done in plan 12 (the contract tests also check the recovery codes and texts).
12. ~~**The host's decisions** (which codes make typed text copyable, when a refusal is quiet) sit in its class, not
    in a pure function in `lib/`.~~ Closed in plan 12: the audit's move M39 (the frontend controller) covers it.
13. ~~**e2e step 127:** its "journal shown" wait can pass on an element that was there before; it does not cover text
    still waiting to be sent when the error hits; one failure message claims more than it checks.~~ Done in plan 12 (step 127 waits for a fresh day, its message says what failed, and the "typed but not yet sent" case is documented as unreachable: a search always sends the typed text first).

## Log file

14. ~~**stderr is not redacted** (the file is); a failed reopen after a rotation stops logging for the rest of the
    run; a failed rename on rotation deletes the current log; an unencoded `/`, `?` or `#` in a password leaves the
    part before it unmasked; if `set_logger` fails the panic hook is not installed; a panic while another thread
    writes a line loses the panic's line; single-quoted characters and unquoted values in a panic message are not
    redacted; no test writes from two threads at once.~~ Done in plan 12 (a Git password with a slash, a question mark or a hash is masked, stderr gets the redacted text, a failed reopen is retried, a failed rename at the size limit keeps the log, single quotes in a panic line are masked, a two-thread test; the `set_logger` failure and the panic that interleaves with another thread's line stay as they are, documented in the code).
15. ~~**Not logged yet:** errors in the window (`console.error`) and Git failures.~~ Moved to backlog #90.
16. ~~**"Open log folder"** stays enabled when there is no log folder (clicking it shows a notice); if the background
    worker crashes, the notice shows a raw technical error.~~ Closed in plan 12: the click with no folder gives a notice that says so; a worker crash is a bug of its own.

## Contract and command kinds

17. ~~**The contract test's parser:** a `Command` variant without a `serde(rename)` is not seen; an event name outside
    `noun:verb` is ignored on both sides; the Rust side matches any `&str` constant of that shape; a non-exported
    TypeScript declaration after a type is read as part of it. Optional `Output` fields are not compared (M42 will
    generate the types).~~ Closed in plan 12: the audit's move M42 (generated types) replaces the parser.
18. ~~**`folder.*` commands in the shell** could use `Command::kind` instead of their own list; `countsInFlight` in the
    frontend is still a hand-kept list (M44).~~ Done in plan 9 (no hand list is left in the shell).
19. ~~**Tests of command kinds:** the query loop reports only the first failing query; two queries may run only their
    error path; no test pins that the archive run keeps the typing run; the doc of the background kind could say
    that the archive run writes.~~ Done in plan 12 (the command-kind test reports every failing query and covers the archive run; no query reaches only its error path, so it fails on any error answer).

## CI and repository

20. ~~**CI runs twice** on a branch with an open pull request; `cancel-in-progress` on `main` can cancel a run before
    its cache is saved; the step-equality test fails with a vague message if the release's version step is renamed.~~ Done in plan 12 (one CI run per change, and main keeps its cache).
21. ~~**e2e in CI** (audit M53) is not done.~~ Moved to backlog #87.
22. ~~**Small text points:** step 51's PASS text says "seven sections" (there are nine); a 140-character line in
    `app/scripts/docs.test.mjs`; the log-file and single-instance lines in `CLAUDE.md` sit under "Environment
    variables"; `BRECCIA_TEST_PANIC` is not yet in the audit notes' list of test hooks; the single-instance order test
    checks the text of the builder, not the registration.~~ Done in plan 12 (step 51 prints the real number of sections; the docs and CLAUDE.md parts are tidied).

23. ~~**Closing the date picker on a reload has no automated test** (`clear()` is inline in `App.svelte`, and an
    internal error from a search closes the picker first, so step 127 cannot reach it). Covered when `clear()` moves
    to `lib/` (audit M39).~~ Done in plan 19 (the reload's `clear()` moved into the window's controller, and
    `app.svelte.test.ts` checks that a reload closes the search, the date picker and the due calendar).
24. ~~**The `trace git state=…` lines** are not in the form `app/e2e/trace.mjs` parses; it counts them as 12 unparsed
    lines. They predate plan 6.~~ Done in plan 12 (the trace summary counts the Git state lines).
25. ~~**The `BRECCIA_TEST_PANIC` line in `CLAUDE.md`** is about 165 characters, where the file wraps at about 120.~~ Done in plan 12 (the line in CLAUDE.md is wrapped).

## History

- The usage limit stopped the session once, during the reviews of Tasks 8 and 9; both subagents were resumed and
  finished.
- The pre-flight scan found two critical gaps in the plan (typed text lost after a recovery; the notice for it
  hidden); both were fixed in Task 8.
