# SDD ledger — plan: docs/plans/2026-11-26-19-the-frontend-controller.md

Started 2026-11-26 on main (owner-approved: commit on main, per CLAUDE.md). Owner answers in the plan, "Settled".
BASE before Task 1: 9cff8ce

## Pre-flight (opus, 2026-11-26)

20 pair rows, 10 per-task rows, 19 findings (full table in the local preflight.md). Every proposed ruling below is
adopted as a Ruling by the controller: the spec (§2) and the owner's Settled answers are the authority; cost if wrong is
noted per finding. F1 reads the owner's Q2 "reload anyway" as "stop waiting, show the unanswered text to copy, then
queue the reload" (a literal skip past a stuck core is not possible: the core runs every command under one lock); told
to the owner in the final report.

## 3. Findings and proposed rulings

**F1 (high). Q2 cannot be built from `recovery.ts` and the controller alone.**
- The client is one promise chain (`lib/api.ts`, `tail`). `client.flush()` = send pending text, `await tail`. If the
  `block.setText` never answers, `tail` never settles, so the reload (`folder.status`, then `openFolder`'s commands, all
  through `client.run`) queues behind it and never runs either. "Reload anyway" with today's client only re-queues.
- The text to copy is gone from the window's reach: once sent, the client keeps neither the command nor its text
  (`pending` holds only text in the typing pause; `sending` is a count). The existing copy notice is built in
  `EditorHost.refuseCommand` (private) from an error that a hang never brings.
- The core runs every core command behind the session lock (`commands.rs` `run` → `with_session`), so a core that is
  really stuck blocks any reload, bypass or not. A bypass only helps if one answer is lost on the way, and it opens a
  worse hole: the stuck command's late answer would be applied (`onOutput` → `apply`) over the reloaded view with the
  old session's block ids, and `InFlight` would keep holding outside-change events (its count drops only when the stuck
  invoke settles).
- `UNSENT` says "This block is gone, so your text was not saved"; for Q2 the text *may* have reached the disk (a slow
  save that finishes later), so pasting it back can duplicate it.

*Ruling:* keep the queue order (no bypass). After 10 s without the flush settling, `Recovery` stops waiting, shows the
unanswered `block.setText` texts as copy notices (kind `conflict`, as the recovery's notices), and calls `reload()`,
which runs as soon as the stuck command ends; a second 10 s timer on the reload shows `NOT_ANSWERING` and ends the layer.
A slow save thus still lands before the reload (no stale answer over the new view, events held in the right order);
a real hang ends in the restart notice, which the owner's answer covers ("if the reload itself … never answers").
Needed beyond the plan: `Client.unanswered(): { id: BlockId; text: string }[]` (sent `block.setText` not yet answered)
in `lib/api.ts` with tests in `api.test.ts`; a `RecoveryEnv.unanswered()` (or the copy notices built by the env) and a
new message in `notices.ts`, e.g. "Breccia did not answer, so this text may not have been saved. Copy it from here:".
Add `lib/api.ts`, `api.test.ts`, `notices.ts` to Task 9's files. *Cost if wrong:* if the owner meant "reload even past a
stuck command", the window still ends at "please restart" in the only case where that matters (stuck core); a bypass
would add the late-answer and held-events risks for the lost-answer case only.

**F2 (high). No controller key handler for Q4.** Task 8/R5 keeps the key routing in `App.svelte`; Task 9 tests it in
`app.svelte.test.ts`. Also: the layer holding focus does not stop shortcuts, because `installDom` listens on `document`
in the capture phase (`Ctrl K`, F1, `Alt ←`, `Ctrl N`, `Ctrl ,`, zoom) and the bubble `key` handler runs `Ctrl Z`
(`viewHistoryKey` → `history.undo`, a core command). *Ruling:* Task 8 moves the bodies of `key` and `keyCapture` into
`app.key(e)` / `app.keyCapture(e)` (App wires them in `installDom`), with the existing `opening` gate; Task 9 adds the
reload gate there, letting only the zoom keys through (as "only the zoom works" while opening; F1 help would open
under the layer). *Cost if wrong:* a few more lines in the controller; none for users.

**F3 (medium). `closing` drops out of the dialog guard (Task 5).** Today `dialogOpen()` is true during the close
question, so `Ctrl N`, F1, the picker and the Git set-up do not open under it, and the picker `$effect` closes the date
picker when it comes up (also when the folder closes). *Ruling:* `Overlays` takes `blocked: () => boolean` (no folder or
the close question) in its constructor instead of `folderOpen`, `dialogOpen()` = `blocked() || current` other than
search; the picker close runs from a small `$effect` on `overlays.dialogOpen() || overlays.is('search')`, or `onOpen`
plus the two cases, with a test each. *Cost if wrong:* a behaviour change under the close question, against "No
behaviour change".

**F4 (medium). The Q4 layer and the close question.** With a stuck core the layer stays up to 20 s; closing the window
then runs `closeCheck` (up to 5 s + 5 s) and shows "Close anyway?". *Ruling:* the layer renders under the R1 close
question (DOM order and z-index), does not take focus back from it, and the recovery's notices stay under the layer
(their buttons send commands); add to review item 161. *Cost if wrong:* a window that can be neither used nor closed.

**F5 (medium). The R3 guard table cannot fail on what it claims (Task 5).** It would assert `Overlays` methods against
a re-implementation of today's `dialogOpen()` in the test, with opener names as labels; which check each opener calls
stays in `App.svelte`, so a swapped guard passes. *Ruling:* put the mapping in code: `const GUARD: Record<Opener,
'dialog' | 'any'>` in `overlay.svelte.ts` and `overlays.may(opener)` used by every opener; the table tests `may` per
opener per overlay state. *Cost if wrong:* none; it is the same lines, now pinned.

**F6 (low). `exactly one kind is shown after any sequence…` cannot fail (Task 3).** *Ruling:* assert the invariant that
matters: after any seeded sequence of `show` / `leave` / `leaveFor`, every registered part other than the shown one has
had `left()` since its last show (fake parts recording calls). *Cost if wrong:* none.

**F7 (low). Task 9's `a reload closes the search, the date picker and the due calendar` has no RED.** `clear()` does all
three today and Task 7 moves it. *Ruling:* add the test in Task 7 (RED: no module), and close plan 6 FU 23 there.
*Cost if wrong:* none.

**F8 (medium). A `confirm` overlay must always answer.** `confirmAsk` returns a promise settled by `answer`; an overlay
closed by `close`, by another `open`, by a new folder or by the reload's `clear()` must call `answer(false)`. *Ruling:*
`Overlays` does it in `close`/`open`/a new `closeAll()`, with a test. *Cost if wrong:* a Settings rename or a Dailies
delete left waiting forever.

**F9 (low). Who closes the changelog overlay when Settings is left (Tasks 1, 5).** *Ruling:* Task 5 gives
`SettingsScreen`'s env an `onLeft` (App/controller: `overlays.close('changelog')`), with a test `leaving Settings closes
the changelog`. *Cost if wrong:* a changelog dialog left over another view.

**F10 (low). `ConfigEnv` needs the overlay (Task 5).** *Ruling:* Task 5 adds `openDialog()/closeDialog()` (or the
`Overlays`) to `ConfigEnv` and updates Task 4's dialog tests to assert the overlay. *Cost if wrong:* a board dialog shown
with no data, or the overlay left open after a hand edit (Review Focus 2).

**F11 (medium). Direct `page = null` with an area on `'page'` (Task 3).** *Ruling:* Task 3 replaces the three direct
assignments (`App.svelte` 348 in `clear()`, 820 in `apply`, 921 in `leaveMainView`) with `area.leave('page')` /
`leaveFor`, calls `area.show({ kind: 'page' })` before `page = r.show`, and the template branch reads
`area.is('page') && page`. *Cost if wrong:* a blank or crashing main area after a reload or a feed answer.

**F12 (low). `shownView()` priority (Task 2).** *Ruling:* copy `placeHere`'s order exactly (newPage, settings, graph,
board, gitLog, archive, dailies, allPages, feed, page). *Cost if wrong:* none in practice (one view at a time).

**F13 (low). `AppEnv` in Task 7 is short of what the controller owns.** *Ruling:* Task 7 brings the `shell` object for
the calls its classes need (`setZoom`, `hiddenColumns`, `setHiddenColumns`, and `window.setZoom` for the webview), adds
`dom.slot(id)` for `EditorHost`, and moves `host.test.ts`'s fake `mount` into a shared `editor/mount.testing.ts` used by
both (add `host.test.ts` to Task 7's files). *Cost if wrong:* a second copy of the fake editor, or a controller that
cannot be built in node.

**F14 (low). The due calendar closing when a dialog opens is new (Task 5).** *Ruling:* `onOpen` closes the date picker
only, as today; the due calendar stays as it is and goes into the follow-ups. *Cost if wrong:* none known.

**F15 (medium). R2 fixes nothing a user can reach today.** `client.flush()` never rejects (`tail` swallows every result
and error; hooks are wrapped in `safely`), and `RecoveryEnv.flush` is exactly that. Only a fake env can make the flush
throw. `#89`'s "an error during the flush ends with the sidebar's actions dropped" is the Q4 case, not a rejected flush.
A `fix(app)` subject would put a changelog line for something no user sees (CLAUDE.md: `fix` describes an effect a user
sees). *Ruling:* keep the `try/catch` (Q2's timeout needs the same path) and its unit test, but fold it into the Q2
commit; drop review item 158 or let it say "no change to see", and renumber 159 to 162 down (or keep the numbers and
let 158 be the Q2 item). *Cost if wrong:* a changelog line describing a fault that never happened.

**F16 (low). The spec has no recovery paragraph to edit (Task 9).** No line of `docs/spec.md` mentions an internal
error, a reload or a restart. *Ruling:* add one bullet to §6 "How data flows" after the opening bullet: after an
internal error the notes reload; while they do the window is greyed out and takes no input (only the zoom); a save not
answered in 10 s is shown to copy and the reload goes ahead; a reload not answered in 10 s asks for a restart.
*Cost if wrong:* none.

**F17 (low). Step 127 cannot time a click "during" the reload; the layer can still be observed.** The reload is local
and fast, and there is no frontend hook to slow it (a shell hook would break "no core or shell change"). *Ruling:*
install a `MutationObserver` before the search fill, as the step already does for `__e2eFeedGone127`; when the layer
element appears, record that it appeared, that `aria-busy` is set, and that `document.elementFromPoint` at the centre of
the sidebar row `p:anna` is the layer (so a click there would reach the layer, not the row). Then assert the layer is
gone. Drop "a click on a sidebar row during it opens nothing"; the unit test `a shortcut while reloading does nothing`
covers keys. The step keeps one PASS line, so 290 stays. *Cost if wrong:* none; no sleep, deterministic.

**F18 (low). Two names in Task 9's interface.** `Recovery` has a private `reloading()` (the stale window, which runs
`STALE_MS` past the end); a public `reloading` field clashes, and means something else (the layer ends at the reload's
end). `recovery.ts` is plain TS, so `$state` is not available there. *Ruling:* a callback `RecoveryEnv.reloading(on:
boolean)` that the controller turns into `$state`; keep the private method, renamed `inStaleWindow()`. Also a second
constant, e.g. `RELOAD_WAIT_MS = 10_000`, used for both timers. *Cost if wrong:* none.

**F19 (low). After `NOT_ANSWERING`, Q3's wording.** Q3 covers refusals after "again"; after `NOT_ANSWERING` a later
answer (if the core comes back) can bring `stale` refusals too. *Ruling:* both restart notices set one
`needsRestart` flag that `message()` uses for `stale` refusals. *Cost if wrong:* raw "request is for generation" text in
that rarer case.

Checked against the Global Constraints, CLAUDE.md and the spec: no colour literal is mandated (the layer's colour comes
from `tokens.css`); timers are passed bound; Q5 a keeps the bare `TODO` line (no text dropped, spec §2); Q2 keeps typed
text in a copy notice (spec §2) provided F1's wording says "may not have been saved"; the commit subjects of Task 9 are
in plain words except the R2 one (F15).

Task -> findings to carry: T1 F9; T2 F12; T3 F6 F11; T4 F10; T5 F3 F5 F8 F9 F10 F14; T7 F7 F13; T8 F2; T9 F1 F2 F4 F15 F16 F17 F18 F19.
- Task 1: dispatched (sonnet implementer ad43efcc348ca841a), BASE 2c0681b
- Task 1 review (sonnet): spec ✅, Approved. Minors (deferred to final review): thin Dailies/Settings pair tests, register overwrites silently, import order dailies.svelte.ts, no reactivity test.
Task 1: complete (commits 2c0681b..aba5014, review clean)
- Task 2: dispatched (sonnet implementer a499c4674bdf4f7e1), BASE fa3c98c
