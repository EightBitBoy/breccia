# Plan 19: The frontend controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `App.svelte` from an untestable 2,189-line controller into a thin component over a tested
`AppController` in `app/src/lib/`, with one value for what the main area shows and one for the open dialog, the
folder's settings in a `ConfigStore`, and the window's edges of recovery after an internal error closed (backlog #89).

**Architecture:** The audit's plan 4 (`docs/audit/2026-11-10/README.md`, "Priorities", item 4): moves M36, M37, M38,
M39, M40 and M49 of `docs/audit/2026-11-10/program.md` (T13, T17). One pattern runs through it: **one value says which
view (or dialog) is open; the class that owns that view keeps its data.** `MainArea` holds the shown view's kind,
`Overlays` the open dialog's kind; the view classes (`AllPages`, `Journal`, `Boards`, …) read `shown` from them and
drop their data when the area moves on. Then the folder's settings move into `ConfigStore`, the rest of the glue into
`AppController`, and the large components take state objects instead of 30 to 48 props. Each task leaves the app
working and `just e2e` green.

**Tech Stack:** Svelte 5 (runes in `.svelte.ts` classes), TypeScript, Vitest in node (no DOM), Playwright over the
WebView2 DevTools port (`app/e2e/smoke.mjs`). No new dependency. No core or shell change.

**Spec:** `docs/spec.md` (binding; §2 anti-goals, §6 "How data flows", §7 the views, §9 "Views register with the
shell"), `docs/audit/2026-11-10/program.md` (T13 M36 to M40, T17 M49), `docs/audit/2026-11-10/notes.md` ("Frontend:
app shell and state", the rules a refactor must keep), `docs/backlog.md` #89, plan 15 follow-up 2
(`docs/plans/2026-11-20-15-the-contract-followups.md`), plan 6 follow-up 23
(`docs/plans/2026-11-10-06-safety-net-followups.md`).

## State

Written 2026-11-26 at commit `6e66ba2` (1.9.1 released); the owner approved it on 2026-11-26 with the answers under
"Owner questions". Ledger:
`.superpowers/sdd/2026-11-26-19-the-frontend-controller/progress.md`.
Numbers: review items start at **158** (`docs/review.md` ends at 157); e2e has 290 PASS lines, the last step is 168,
so a new step is **169**; backlog's highest number is 104, so a new item is **#105**.

## Where the audit is out of date (checked against today's code)

The audit read commit `4b91b0c` (1.3.0). Plans 6 to 18 changed the file a lot; the moves still hold, the details do
not:

- `App.svelte` is 2,189 lines, its script 1,906 (audit: 1,839 and 1,590). Every line number in T13 has moved.
- **M36:** ten values now describe the main area, not nine: `dailies.shown` (plan 13) joined, and `opening` (plan 18)
  sits in front of all of them. `leaveMainView` closes eight views; `route` returns seven `leave…` flags plus
  `leavePage`; `placeOf` (`lib/view.ts`) takes seven booleans. Three more places read the flags than the audit lists:
  `undoView` (plan 12's view undo), `editable()` and `viewsTake` (the old `page:changed` handler, which since plan 15
  also takes `Route.others` from `apply`). `NavPlace` already has `dailies`.
- **M37:** `dialogOpen()` has nine conditions (`!folder` and `settings.changelog` joined); `dialogOpen() ||
  search.shown` is written at 11 places, `dialogOpen()` 15 times in all. There are three `ConfirmDialog` blocks, not
  four (the Dailies delete reuses `confirmAsk`). The due calendar (`duePick`, plan 16) is a second popover beside the
  date picker.
- **M38:** the subject grew: `dailiesResetInvalid`, `numbersInvalid`, `setDailiesReset` and `dailies.setReset`
  (plans 13 and 14). `WriteQueue`, `writeConfig`, `dialogVersion` and `foreignAfterRefusal` are already pure and tested
  in `lib/configWrite.ts`; what has no test is their composition in `App.svelte`.
- **M39:** own echoes are gone (plan 15: the window takes its changes from the answer), so `apply` does the refreshes
  the events used to do, and `notes.md`'s "Own echoes are recognised" rule is obsolete. The startup sequence (plan 18)
  is already in `lib/startup.ts`, the recovery (plan 6) in `lib/recovery.ts`. The 300-line target for the script was
  set at 1,590 lines; with 300 more lines of behaviour since, this plan aims at **under 400** (ruling R5).
- **M40:** seven status effects, not six (`zoom`, `git`, `save`, `dailies`, `help`, `theme`, `gitLog`); the status
  bar's click handler is five-way, not four. The three `reconcile(null).catch(…)` copies and both stacked doc comments
  (above `hiddenCols` and above `going`) are still there.
- **M49:** `Board.svelte` takes 31 props (audit: 25), `SettingsView.svelte` 48 (about 30), `Sidebar.svelte` 38
  (about 25). `DailiesView` already takes its state object.

## Owner questions

Ask one at a time, with the options. The plan is written with the recommended answers; another answer changes the task
named. Everything else in the plan changes nothing a user sees.

**Settled 2026-11-26 (owner).** These answers win over the options and recommendations below; Task 9 follows them.
- **Q1: b.** The reload's points and the "one notice a minute" rule; the two Git edges stay in #89.
- **Q2: not a, not b. Reload anyway after 10 s.** If the save before the reload has not answered after 10 seconds,
  the window stops waiting and reloads the notes. Text from that save that may not have reached the disk is kept in a
  "could not be saved" notice to copy (the existing pattern of the recovery's notices), so the window never drops it
  silently (spec §2). If the reload itself is refused or never answers, the notice says to restart Breccia.
- **Q3: a.** Refusals after "internal error again" say in plain words that Breccia needs a restart (wording at the
  implementer's choice, along "Not done: Breccia needs a restart after an internal error.").
- **Q4: the owner's own answer. While the window reloads it is greyed out and takes no input.** A layer covers the
  window for the duration of the reload: no clicks, no typing, no shortcuts reach the views (keyboard focus held on
  the layer), so no click can be refused or dropped. It goes away when the reload ends (or turns into the Q2/Q3
  restart notice). A reload that ends normally shows no extra notice.
- **Q5: a.** The empty card is accepted and documented; #89's point is closed.
- **R1 to R7:** confirmed as written.

- **Q1. Which of backlog #89's edges to close here.** *What it is about:* #89 lists four edges of the recovery after
  an internal error. Two are in the window and fit this plan, because the code they live in moves here anyway: (1) the
  window's reload (four small points, Q2 to Q5) and (2) the "one notice a minute" rule, which can swallow a second,
  different notice (a session kept, then within a minute one that had to be reopened, or the folder closed). Two are in
  Git sync in the core (a rebase left after a failed Git step; edits made before a Git failure are not committed until
  the next change) and have nothing to do with the window. (Task 9)
  - a. The reload's points only.
  - b. The reload's points and the "one notice a minute" rule: a second notice within the minute is shown when it says
    something different (the folder was reopened or closed); the same notice again stays quiet, as today.
  - c. All four, Git included. The plan grows by core work of another kind.
  - **Recommendation: b.** Both are window logic that this plan puts under unit tests; the Git edges stay in #89 for a
    Git plan.

- **Q2. When the reload waits forever.** *What it is about:* after an internal error Breccia first saves the text you
  just typed, then reloads the notes. If that save never answers (the core is stuck), the window stays quiet and empty
  for good: no journal, no notice. Waiting longer cannot help, because the reload has to go through the same queue.
  (Task 9)
  - a. After 10 seconds without an answer, a notice says "Breccia is not answering. Please restart Breccia." and the
    window stops hiding the refusals that follow.
  - b. As today: the window waits.
  - **Recommendation: a.** It is the honest outcome; nothing is lost that is not lost today.

- **Q3. After "Breccia hit an internal error again".** *What it is about:* when a reload did not help within a minute,
  Breccia asks for a restart and does not reload again. Every click after that is refused by the core, and the notice
  shows its raw technical text ("request is for generation 3, …"). (Task 9)
  - a. Those refusals say in plain words: "Not done: Breccia needs a restart after an internal error."
  - b. They stay unshown (the restart notice is already there).
  - **Recommendation: a.** A click that silently does nothing looks like a broken button; typed text keeps its own
    notice with the text to copy in both options.

- **Q4. A click during the reload.** *What it is about:* in the second or so while the notes reload, a click in the
  sidebar, All pages or the Graph is refused by the core (it names the old session) and today is dropped without a
  word. (Task 9)
  - a. A notice says "Not done: Breccia was reloading the notes. Please try again."
  - b. As today: nothing happens.
  - c. The click is done again after the reload. Risky: the page or block it named may be numbered differently now.
  - **Recommendation: a.**

- **Q5. An empty card from "+ Add" at the moment of the error.** *What it is about:* "+ Add" on a board writes a bare
  task (only its keyword, for example `TODO`) into today's journal and opens it as a card; closing the card without
  typing deletes it again. If an internal error hits while that card is open, the reload closes the card without that
  delete, and the bare `TODO` line stays in today's journal. Deleting it after the reload means finding it again by
  its text, which could hit a line you wrote yourself. (Task 9)
  - a. Accept it: the line stays and you delete it by hand. Documented; #89's point is closed.
  - b. After the reload, delete today's last block if it is exactly that bare keyword with nothing under it.
  - **Recommendation: a.** It needs an internal error at that exact moment, and the cost is one visible line; b can
    delete text you wrote, which the spec's §2 forbids.

**Rulings to confirm** (the planner's calls; the owner may overrule):

- **R1. The close question stays above every dialog.** Today "Close anyway?" (closing the window with unsaved pages)
  can show over an open dialog; with one value for the open dialog it would have to replace it. It stays a separate
  layer, so nothing changes: Cancel goes back to the dialog as it was. Cost if wrong: none.
- **R2. A failed save during the reload no longer stops the reload.** Today an error while the typed text is sent
  skips the reload, and the window stays empty. The reload now runs anyway; the text that could not be saved is shown
  to copy, as for any failed save. This is a fix of an obvious fault (`fix(app)` commit, review item), not a question.
  Cost if wrong: none known.
- **R3. Each way to open a dialog keeps exactly today's guard.** Some open over the search box (`Ctrl K` again), some
  not (F1, `Ctrl N`, the Git set-up); `Overlays` offers both checks so each caller keeps its own. A table test pins
  them. Cost if wrong: none; any other choice would be a behaviour change.
- **R4. The window's refreshes run even when applying an answer fails part-way** (plan 15 follow-up 2): the search,
  name list and graph refreshes at the end of `apply` move into a `finally`. Cost: a refresh after a failed apply asks
  the core once more.
- **R5. Target: the script of `App.svelte` under 400 lines** (the audit's 300 was set when it had 1,590). What stays:
  imports, the `AppEnv` that binds Tauri and the DOM, `onMount` (DOM, wheel, shell events, timers), `onAnchorClick`,
  `onPointerDown`. Cost if wrong: none.
- **R6. Components get the state object and the controller** (`{app}`), not a callback per action: `Board`,
  `SettingsView` and `Sidebar` call `app.openCard(…)` themselves. Components stay without unit tests (audit Q4 is
  plan 5's). Cost: components now depend on `AppController`'s method names; `svelte-check` catches a rename.
- **R7. Spec §9's sentence "Views register with the shell rather than being hard-wired" stays.** After Task 3 the
  window's own views register with `MainArea`; a plugin view would register the same way. No spec change.

## Items not taken

- Backlog #89's Git edges (unless Q1 c). Backlog #90 (what may be logged) is a separate decision.
- Plan 6 follow-up 12 (the editor host's refusal decisions as a pure function): in `editor/`, not the controller.
- Audit M45 to M48, M50, M51, M53 (frontend hygiene, plan 5 of the audit), M46 / audit Q4 (component tests).

## Global Constraints

- **No behaviour change** except the owner's answers to Q1 to Q5 ("Settled") and R2. Spec §2: never silently drop,
  reorder or reformat text the user wrote; every flow that leaves a view calls `host.leave()` and `client.flush()` first, in that order
  (`notes.md`, "One command at a time").
- `apply` stays the one place an `Output` is applied; decisions stay in pure functions (`route`), carried out by
  classes (`notes.md`).
- Logic with unit tests lives in `app/src/lib/`. Vitest runs in node without a DOM: classes take an `env` with the
  Tauri, DOM and timer calls injected (like `Boards`, `Journal`, `Recovery`). A class that uses `$effect` or
  `$derived` is created during component setup in the app, and inside `$effect.root` in tests (file name
  `*.svelte.test.ts`, as `zoom.svelte.test.ts`).
- Timer functions are passed bound (`window.setTimeout.bind(window)`): WebView2 refuses them called as methods.
- Every test must be able to fail: capture a RED run before the change. A move with no new behaviour shows RED as the
  new test failing on the missing export or signature, then GREEN.
- `just test`, `just lint` and `just e2e` stay green after every task; e2e keeps its 290 PASS lines (more only where a
  task adds a step). Fix a flaky step by waiting for the right state, never by sleeping.
- No colour literals or `color-mix` outside `app/src/styles/tokens.css`.
- Commits: `refactor(app): …` for moves; `fix(app): Recovery: …` in plain words for Q1 to Q3 and R2 (`feat(app)` for
  the Q4 layer); no file or function names in `fix` subjects; no attribution lines; on `main`, push after each commit;
  ledger committed after each task. Lines wrapped at 120.
- Words from `docs/vocabulary.md`: view, page, journal day, block, task, board, card, column, Archive, All pages.

## Review Focus

1. **Typing, then leaving the view at once** (Back, `Ctrl K`, a sidebar click, a board): the typed text is sent before
   the next view loads, never lost or applied to the wrong page. Pinned by Task 8's `Back sends the typed text before
   the step is shown` and the existing e2e steps.
2. **A hand edit of `config.toml` while the board dialog is open:** the dialog's save is refused, it closes, the hand
   edit stays in the file. Pinned by Task 4's `a board dialog opened before a hand edit is refused and closes`.
3. **A page changed on disk while a non-page view shows** (a board, All pages, the Graph): only that view reloads;
   the page view does not reappear. Pinned by Task 7's `an outside change while All pages shows reloads only the table`.
4. **Closing the window while a dialog is open** (R1): the close question shows over it, Cancel gives the dialog back
   unchanged. Pinned by Task 5's `the close question shows over an open dialog`.
5. **Switching to another folder while a view and a dialog are open:** nothing of the old folder stays (no view, no
   dialog, no history step). Pinned by Task 7's `a new folder closes every view and dialog and clears the history`.

---

## Tasks

Every task ends with `npm test` in `app/` (or `just test`), `just lint` and `just e2e`, then a commit and the ledger.

### Task 1: One value for the screens of the main area (model: sonnet; review: sonnet)

**Files:**
- Create: `app/src/lib/mainArea.svelte.ts`, `app/src/lib/mainArea.svelte.test.ts`
- Modify: `app/src/lib/allPages.svelte.ts`, `archive.svelte.ts`, `dailies.svelte.ts`, `gitLog.svelte.ts`,
  `network.svelte.ts`, `settings.svelte.ts` and their state tests (`allPagesState.test.ts`, `archiveState.test.ts`,
  `dailiesState.test.ts`, `gitLog.test.ts`, `network.test.ts`, `settings.test.ts`)
- Modify: `app/src/App.svelte` (create one `MainArea`, pass it to the six classes)

**Interfaces:**
- Produces, in `mainArea.svelte.ts`:
  ```ts
  export type MainView =
    | { kind: 'none' } | { kind: 'newPage'; folder: string } | { kind: 'page' } | { kind: 'feed' } | { kind: 'board' }
    | { kind: 'allPages' } | { kind: 'archive' } | { kind: 'dailies' } | { kind: 'gitLog' } | { kind: 'graph' }
    | { kind: 'settings' }
  export type MainKind = MainView['kind']
  /** A view's part in the area: `left()` drops its data when the area shows another kind. */
  export interface MainPart { left(): void }
  export class MainArea {
    view: MainView // $state.raw, starts { kind: 'none' }
    register(kind: MainKind, part: MainPart): void
    is(kind: MainKind): boolean
    /** Shows `v`; when its kind differs from the shown one, the shown part's `left()` runs first. */
    show(v: MainView): void
    /** Back to 'none' when `kind` is shown (its `left()` runs); else nothing. */
    leave(kind: MainKind): void
    /** Back to 'none' unless `kind` is shown (`leaveMainView(keep)`). */
    leaveFor(kind: MainKind): void
  }
  ```
- Each of the six classes takes `area: MainArea` (in its env; `SettingsScreen` and `GitLog` gain one), registers its
  part in the constructor, and keeps its public surface: `shown` becomes a getter (`this.env.area.is('allPages')`),
  `open()` calls `area.show(…)` **before its first await**, `close()` calls `area.leave(…)`; what `close()` did
  beside `shown = false` (rows to null, the changelog off, …) moves into `left()`.

- [ ] **Step 1: Write the failing tests** in `mainArea.svelte.test.ts`: `show replaces the view and runs the old
  part's left`; `showing the same kind again runs no left`; `leave of a kind not shown does nothing`; `leave of the
  shown kind goes to none and runs its left`; `leaveFor keeps the given kind and leaves any other`. In one state test
  per class (shared real `MainArea`): `opening All pages closes the Archive and drops its rows` (and the like for each
  pair the tests already build). Run `npx vitest run src/lib/mainArea.svelte.test.ts`: FAIL (no module).
- [ ] **Step 2: Implement** `MainArea` and move the six classes onto it. `App.svelte` only creates the area and passes
  it; its own `leaveMainView` lines still call each `close()` (harmless now) until Task 3.
- [ ] **Step 3: Run** `npm test`, `just lint`, `just e2e` (290 PASS).
- [ ] **Step 4: Commit** `refactor(app): one value says which screen the main area shows`.

### Task 2: The routing decisions take one view kind (model: sonnet; review: sonnet)

**Files:**
- Modify: `app/src/lib/route.ts`, `route.test.ts`, `app/src/lib/view.ts`, `view.test.ts`, `app/src/lib/nav.ts`,
  `nav.test.ts`, `app/src/App.svelte`

**Interfaces:**
- Consumes: `MainView`, `MainKind` (Task 1).
- Produces:
  - `ShownView` loses `board`, `allPages`, `settings`, `graph`, `gitLog`, `archive`, `dailies` and gains
    `main: MainKind`. `Route` loses `leaveBoard`, `leaveAllPages`, `leaveSettings`, `leaveGraph`, `leaveGitLog`,
    `leaveArchive`, `leaveDailies` and gains `leave: boolean` ("a navigation or an applied feed answer leaves the shown
    board or screen"). `leavePage` stays.
  - `placeOf(cmd, shown: { page: string | null; days: ReadonlySet<string> | null; main: MainKind }, key): Place`: a
    view other than `none`, `page`, `feed` and `newPage` counts as today's `other`.
  - `placeHere(…)` is replaced by `placeOfView(v: MainView, ctx: { board: string | null; feedDay: string | null; page:
    string | null }): NavPlace | null` in `nav.ts` (`newPage` and `none` give null).
  - In `App.svelte`, a temporary `shownView(): MainView` builds the value from the area and the four flags still
    outside it (priority as `placeHere` today: newPage, the area's screen, board, feed, page). Task 3 deletes it.

- [ ] **Step 1: Write the failing tests:** rewrite the `ShownView` fixtures of `route.test.ts` and `view.test.ts` to
  `main`; add `leave is one flag for every screen and the board` (table over the seven kinds × navigate / feed answer /
  edit) and `placeOfView gives the same places as placeHere did` (table over every kind, carried over from
  `nav.test.ts`). Run: FAIL (types and missing export).
- [ ] **Step 2: Implement.** In `apply`, `if (r.leave) area.leave(area.view.kind)` plus `boards.close()` while the
  board is still outside the area.
- [ ] **Step 3: Run** `npm test`, `just lint`, `just e2e`.
- [ ] **Step 4: Commit** `refactor(app): the routing decisions take the shown view as one value`.

### Task 3: The page, the journal, the board and the untitled page join the main area (model: opus; review: opus)

**Files:**
- Modify: `app/src/lib/journal.svelte.ts`, `journal.test.ts`, `app/src/lib/boards.svelte.ts`, `boards.test.ts`,
  `app/src/App.svelte`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: `Journal` and `Boards` take `area` like the six screens. `Journal.feed` stays the data and is non-null
  only while `area.is('feed')` (its `left()` sets it to null); `applyFeed` returning true shows the feed. `Boards.index`
  and `card` are meaningful only while `area.is('board')`; `left()` nulls them (the open card's text is already sent:
  `leaveMainView` closes the card first, as today). The page's part is registered by `App.svelte`: `left()` sets
  `page` and `refs` to null and clears `madeInRefs`. The untitled page is `{ kind: 'newPage', folder }`: the
  `newPageFolder` state and the `$effect` that ended it go.
- In `App.svelte`: `here` is `placeOfView(area.view, …)`; `leaveMainView(keep)` is `rememberHere`, `closeCard`,
  `host.leave`, `area.leaveFor(keep)`, `sel.clear`, scroll to top; `restore` is one `switch` over the place kind;
  `undoView` and `viewsTake` switch over `area.view.kind`; the new-folder branch of `apply` is `area.show({ kind:
  'none' })` plus the classes' own `newFolder`/`forget`; the template's chain becomes `{#if}` branches on
  `area.view.kind`; `editable()` reads `area.is('board')`; `shownView()` from Task 2 is deleted.

- [ ] **Step 1: Write the failing tests:** `journal.test.ts`: `open shows the feed and the page part leaves`, `leaving
  the feed drops it`; `boards.test.ts`: `open shows the board`, `another view shown drops the index and the card`; in
  `mainArea.svelte.test.ts`: `exactly one kind is shown after any sequence of shows and leaves` (a seeded loop over
  random calls asserting `is` is true for one kind only). Run: FAIL.
- [ ] **Step 2: Implement** the classes, then `App.svelte` as above.
- [ ] **Step 3: Check** that `grep -nE "\.shown|newPageFolder|boards\.index !== null|journal\.feed !== null"
  app/src/App.svelte` lists no place that decides which view shows (data reads such as `journal.feed` passed to the
  feed component stay).
- [ ] **Step 4: Run** `npm test`, `just lint`, `just e2e`.
- [ ] **Step 5: Commit** `refactor(app): one value says what the main area shows`.

### Task 4: The folder's settings in a ConfigStore (model: opus; review: opus)

**Files:**
- Create: `app/src/lib/config.svelte.ts`, `app/src/lib/config.svelte.test.ts`
- Modify: `app/src/App.svelte` (the state and functions listed in M38, plus `dailiesResetInvalid`, `numbersInvalid`,
  `setDailiesReset`)

**Interfaces:**
- Consumes: `writeConfig`, `WriteQueue`, `dialogVersion`, `foreignAfterRefusal`, `gitCommand` (`configWrite.ts`);
  `boardDialogAfterConfig`, `settingsIndexAfterConfig`, `settingsAfterSet`, `withBoard`, `withoutBoard`,
  `moveBoardNamed`, `defaultColumns` (`board.ts`); `configShift`, `isNewerConfig` (`configChange.ts`);
  `archiveShift` (`autoArchive.ts`); `statesSet` (`stateEdit.ts`).
- Produces:
  ```ts
  export interface ConfigEnv {
    /** host.exec: `refused(code)` returns true to keep the refusal quiet. */
    exec(cmd: Command, refused?: (code: string) => boolean): Promise<void>
    leave(): void
    flush(): Promise<void>
    notify(n: Notice): void
  }
  export interface ConfigShift { tasks: boolean; board: boolean; archiveNow: boolean }
  export interface BoardDialog { index: number; name: string; version: number }
  export class ConfigStore {
    // $state: states, boards, archiveDays, autoArchive, git, version, dailiesReset, dailiesResetInvalid,
    // numbersInvalid: { delay: boolean; interval: boolean; archive: boolean }, dialog: BoardDialog | null
    constructor(env: ConfigEnv)
    /** null: older than the settings shown. `foreign`: from `config:changed`. The dialog follows its board by name. */
    apply(c: ConfigView, foreign?: boolean): ConfigShift | null
    newFolder(): void
    send(cmd: Command): Promise<{ ok: boolean; code: string | null }>
    ready(): Promise<void>
    countUsage(): Promise<void>
    setStates(list: StateView[], renames: StateRename[], version: number): Promise<void>
    setGit(patch: Partial<GitSettings>): Promise<void>
    setDailiesReset(reset: string): Promise<void>
    setBoardSettings(patch: { archiveAfterDays?: number; autoArchive?: boolean }): Promise<void>
    moveBoard(i: number, dir: -1 | 1): Promise<void>
    /** The new board's index when accepted, else null. */
    newBoard(name: string): Promise<number | null>
    editBoard(i: number): void
    closeBoardDialog(): void
    saveBoard(b: BoardSummary): Promise<{ at: number; ok: boolean; renamedFrom: string | null }>
    deleteBoard(): Promise<{ at: number; ok: boolean }>
  }
  ```
  `App.svelte` acts on the results: `host.setKeywords`, `dailies.setReset`, `refreshTasks`, `boards.refresh`,
  `states.usage`, `autoArchive.run` from the shift; `nav.boardRenamed` and `hiddenCols.renamed` from `renamedFrom`;
  `boards.open` / `shownAfterDelete` after a save or delete.

- [ ] **Step 1: Write the failing tests** in `config.svelte.test.ts` with a fake `exec` that answers with a scripted
  `ConfigView` through `apply` (as `App.apply` does): `a write carries the version shown`; `two quick writes: the
  second carries the version the first answer left`; `a configChanged refusal asks config.get and counts later
  versions as foreign`; `a board dialog opened before a hand edit is refused and closes`; `an own Settings change while
  the dialog is open does not refuse it`; `the dialog follows its board by name when a hand edit reorders the boards`;
  `the dialog's board removed by hand: a notice and the dialog closes`; `the dialog's own boards.set answer is not
  followed`; `an older config is ignored`; `the replaced keys set dailiesResetInvalid and numbersInvalid`; `a new
  folder's first config is no shift`. Run: FAIL (no module).
- [ ] **Step 2: Implement** `ConfigStore` by moving the code; App keeps one `const config = new ConfigStore(…)` and
  passes `config.x` to the template.
- [ ] **Step 3: Run** `npm test`, `just lint`, `just e2e` (the Settings and board dialog steps carry it).
- [ ] **Step 4: Commit** `refactor(app): the folder's settings and their write rules move into one tested store`.

### Task 5: One value for the open dialog (model: opus; review: opus)

**Files:**
- Create: `app/src/lib/overlay.svelte.ts`, `app/src/lib/overlay.svelte.test.ts`
- Modify: `app/src/lib/search.svelte.ts`, `searchState.test.ts`, `app/src/lib/pageFlows.svelte.ts`, `pageFlows.test.ts`,
  `app/src/lib/settings.svelte.ts` (the changelog flag goes), `app/src/lib/config.svelte.ts` (the board dialog),
  `app/src/App.svelte`

**Interfaces:**
- Produces:
  ```ts
  export type Overlay =
    | { kind: 'search' } | { kind: 'help' } | { kind: 'changelog' } | { kind: 'flow' } | { kind: 'boardSettings' }
    | { kind: 'newBoard'; from: 'sidebar' | 'settings' }
    | { kind: 'confirm'; message: string; ok: string; answer: (yes: boolean) => void }
  export class Overlays {
    current: Overlay | null // $state.raw
    constructor(folderOpen: () => boolean)
    /** No folder, or a dialog other than the search box is open (today's `dialogOpen()`). */
    dialogOpen(): boolean
    /** A folder is open and nothing is (today's `!(dialogOpen() || search.shown)`). */
    canOpen(): boolean
    is(kind: Overlay['kind']): boolean
    /** Opens `o`; callbacks from `onOpen` run (the date picker and the due calendar close). */
    open(o: Overlay): void
    close(kind: Overlay['kind']): void
    onOpen(cb: () => void): void
  }
  ```
  `Search.shown`, `PageFlows.dialog !== null` and `ConfigStore.dialog !== null` follow their overlay kind (the class
  keeps the dialog's data, the overlay says it is open). `settingUpGit` and `question` become `confirm`: one
  `ConfirmDialog` block. `closing` stays its own layer (R1). `pickerOpen` stays (the sidebar binds it); the `$effect`
  that closed it becomes `onOpen`.

- [ ] **Step 1: Write the failing tests** in `overlay.svelte.test.ts`: `canOpen is false without a folder`; `opening a
  dialog closes the date picker` (via `onOpen`); `close of a kind not open does nothing`; `dialogOpen ignores the search
  box, canOpen does not`; and the guard table of R3: one row per opener in today's `App.svelte` (`openSearch`,
  `toggleHelp`, `startNewPage`, `openGraph`, `toggleGitLog`, `openSettings`, `confirmAsk`, `togglePicker`, `go`,
  `clickGit`'s set-up, `host.pickDate`, `pickDue`) with its guard as written today, asserting the new call gives the
  same answer for every overlay state. In `pageFlows.test.ts`: `the flow dialog opens as the flow overlay`. Run: FAIL.
- [ ] **Step 2: Implement**; the 11 `dialogOpen() || search.shown` sites and the four other `dialogOpen()` uses map
  1:1 to `canOpen()` / `dialogOpen()`.
- [ ] **Step 3: Add the test for Review Focus 4** where the close handler lives (`App.svelte` until Task 8): as an e2e
  check inside the existing close-question step if it opens a dialog first, else a note in the ledger that Task 8's
  `the close question shows over an open dialog` pins it.
- [ ] **Step 4: Run** `npm test`, `just lint`, `just e2e`.
- [ ] **Step 5: Commit** `refactor(app): one value says which dialog is open`.

### Task 6: Small repeats in App.svelte (model: sonnet; review: sonnet)

**Files:**
- Modify: `app/src/lib/status.svelte.ts`, create `app/src/lib/status.svelte.test.ts`, `app/src/lib/status.ts`,
  `status.test.ts`, `app/src/App.svelte`

**Interfaces:**
- Produces: `StatusItems.bind(id: string, item: () => StatusItem | null): void` (an `$effect` that sets or clears the
  item; called during component setup). `statusAction(id: string, opening: boolean): 'git' | 'gitLog' | 'dailies' |
  'zoom' | 'help' | null` in `status.ts` (uses `allowedWhileOpening`); App maps the action to its handler in one
  object. One `reconcileShown()` in App (later the controller) for the three `host.reconcile(null).catch(…)` copies.

- [ ] **Step 1: Write the failing tests:** `bind sets the item and clears it when the value turns null` (inside
  `$effect.root`, `flushSync`); `statusAction` table over every id, opening and not. Run: FAIL.
- [ ] **Step 2: Implement**; the seven status `$effect` blocks become `status.bind(…)`; fix the two stacked doc
  comments (above `hiddenCols`, above `going`).
- [ ] **Step 3: Run** `npm test`, `just lint`, `just e2e`.
- [ ] **Step 4: Commit** `refactor(app): status items bind to their value; one handler table for the status bar`.

### Task 7: The controller, part 1: state, answers and outside changes (model: opus; review: opus)

**Files:**
- Create: `app/src/lib/app.svelte.ts`, `app/src/lib/app.svelte.test.ts`, `app/src/lib/appEnv.testing.ts` (the fake
  env: a scripted core answering `invoke`, the fake editor mount of `editor/host.test.ts`, fake timers and DOM hooks)
- Modify: `app/src/App.svelte`

**Interfaces:**
- Produces:
  ```ts
  export interface AppEnv {
    invoke(req: { generation: number; command: Command }): Promise<Output> // invokeRun
    mountEditor: typeof mountEditor // the editor host's mount, injected for tests
    dom: {
      scroller(): HTMLElement | undefined
      /** The feed's day at the top of the main area (`topDayOf` over the rendered days). */
      topDay(): string | null
      scrollToBlock(id: BlockId): void
      tick(): Promise<void>
      setBusy(busy: boolean): void // data-busy for e2e
    }
    timers: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout; setInterval: typeof setInterval;
      clearInterval: typeof clearInterval }
    now(): number
  }
  export class AppController {
    constructor(env: AppEnv)
    // owns: client, host, sel, area, overlays, config, nav, notices, recovery, status and every view class
    // state moved from App.svelte: folder, page, refs, tree, folded, flash, slashMenu, linkMenu, unsavedText, …
    apply(out: Output, cmd: Command): void
    notify(n: Notice): void
    refuse(e: unknown): void
    viewsTake(p: PageView): void
    /** The handlers `listenShell` takes (`lib/shellEvents.ts`), held by `InFlight` as today. */
    shellHandlers(): Omit<ShellHandlers, 'trayExit' | 'closeRequested'>
  }
  ```
  The window's own calls that Task 8 needs (window, dialog, opener, settings on this computer) join `AppEnv` there.
  R4 lands here: the refreshes at the end of `apply` run in a `finally`.

- [ ] **Step 1: Write the failing tests** in `app.svelte.test.ts` (inside `$effect.root`): `a new folder closes every
  view and dialog and clears the history` (Review Focus 5); `a page removed on disk while shown: a notice and the
  journal`; `removed right after a rename: the page follows the rename, no notice`; `an outside change while All
  pages shows reloads only the table` (Review Focus 3); `a config change from disk refreshes the shown page's tasks`;
  `the refreshes run when applying an answer fails part-way` (R4: a view's apply throws). Run: FAIL (no module).
- [ ] **Step 2: Implement** by moving code; `App.svelte` builds `AppEnv` from Tauri and the DOM, creates `const app =
  new AppController(env)` in setup, passes `app.shellHandlers()` to `listenShell`, and reads `app.x` in the template.
- [ ] **Step 3: Run** `npm test`, `just lint`, `just e2e`.
- [ ] **Step 4: Commit** `refactor(app): the window's answers and outside changes are handled in a tested controller`.

### Task 8: The controller, part 2: navigation, folders, Git and closing (model: opus; review: opus)

**Files:**
- Modify: `app/src/lib/app.svelte.ts`, `app.svelte.test.ts`, `appEnv.testing.ts`, `app/src/App.svelte`

**Interfaces:**
- Consumes: Task 7.
- Produces on `AppController`: `go(dir)`, `restore`, `openJournal`, `goToDay`, `pickDay`, `openPage(name, link?)`,
  `jumpTo(key, id)`, `reveal(id)`, `openBoard`, `openCard`, `addCard`, `closeCard`, `openAllPages`, `openArchive`,
  `openDailies`, `openGraph`, `toggleGitLog`, `openSettings(section?)`, `openSearch`, `chooseRow`, `toggleHelp`,
  `togglePicker`, `startNewPage`, `createUntitled`, `switchFolder`, `pickAndSwitch`, `loadRecent`, `forgetRecent`,
  `clickGit`, `syncGit`, `setUpGit`, `exitFromTray`, `closeRequested(event)`, `closeAnyway`, `openFolder`, `start()`
  (the startup sequence of `onMount`), and the choices kept on this computer (`chooseTheme`, `chooseJournalsAt`,
  `chooseLinkDisplay`, `toggleSidebar`, `saveLayout`). `AppEnv` gains `window` (`show`, `unminimize`, `setFocus`,
  `hide`, `destroy`, `setTheme`), `pickFolder(): Promise<string | null>`, `openUrl`, and the machine-settings calls of
  `app/src/api.ts` it uses (`uiState`, `setUiState`, `setTheme`, `setJournalsAt`, `setLinkDisplay`, `recentFolders`,
  `forgetFolder`, `getAppVersion`, `logFolder`, `openLogFolder`, `gitInstalled`, `trayEnabled`, `startupOpen`,
  `startupNotices`), as one `shell` object typed from `api.ts`'s exports.
- `App.svelte` keeps: imports, building `AppEnv`, `onMount` (`installDom` with the key routing, the wheel, the shell
  events, timers, cleanup), `onAnchorClick`, `onPointerDown`, the template. Script under 400 lines (R5).

- [ ] **Step 1: Write the failing tests:** `Back sends the typed text before the step is shown` (Review Focus 1: the
  fake core records the order `block.setText` then `page.show`); `Back skips a page removed meanwhile`; `a folder
  switch is refused while a page is unsaved`; `the close question shows over an open dialog` (Review Focus 4, R1);
  `closing with nothing unsaved closes at once`; `the Git set-up question does not open over another dialog`; `jumpTo
  unfolds the ancestors and flashes the block for 1.5 s` (fake timers). Run: FAIL.
- [ ] **Step 2: Implement** by moving code.
- [ ] **Step 3: Check** `awk '/<script/,/<\/script>/' app/src/App.svelte | wc -l` is under 400.
- [ ] **Step 4: Run** `npm test`, `just lint`, `just e2e`.
- [ ] **Step 5: Commit** `refactor(app): navigation, folder switching, Git and closing move into the controller`.

### Task 9: Recovery after an internal error: the window's edges (backlog #89) (model: opus; review: opus)

Written for the owner's settled answers (Q1 b, Q2 "reload anyway after 10 s", Q3 a, Q4 "grey the window out", Q5 a)
and R2. Opus, since Q4 adds a visible layer to the window.

**Files:**
- Modify: `app/src/lib/recovery.ts`, `recovery.test.ts`, `app/src/lib/app.svelte.ts` (the env's `clear`),
  `app.svelte.test.ts`, `app/src/App.svelte` (the reload layer), `app/src/styles/tokens.css` (the layer's colour, if
  a new token is needed), `app/e2e/smoke.mjs` (step 127 checks the layer), `docs/backlog.md` (#89 keeps only the Git
  edges), `docs/spec.md` (the recovery's paragraph: the layer and the 10 s rule), `docs/review.md` (items 158 to 162,
  heading "The frontend controller (plan 19)")

**Interfaces:**
- `RecoveryEnv` gains `setTimeout`/`clearTimeout` (bound). `Recovery` gains `reloading: boolean` (`$state`, or a
  callback the controller turns into state): true from the start of the reload until it ends or turns into a restart
  notice. New exported texts in `recovery.ts`: `NOT_ANSWERING = 'Breccia is not answering. Please restart
  Breccia.'` (the reload itself is refused or does not answer) and `NEEDS_RESTART = 'Not done: Breccia needs a restart
  after an internal error.'` (Q3; final wording at the implementer's choice, plain words).
- `Recovery.message(code: string | null, cmd: Command | null, raw: string): string | null`: what a refusal says (null:
  unshown), replacing the two calls to `quiet` and `quietMessage` in `refuse`/`notify`/the host's `quiet` hook.
  `block.setText` refusals keep their text to copy unchanged.
- The layer (Q4): while `reloading`, `App.svelte` shows a full-window layer over everything (greyed, with a short
  "Reloading the notes…" text), which takes pointer events and holds keyboard focus, and the controller's key handler
  ignores shortcuts. Colour from `tokens.css` only. `aria-busy` on the main area.

- [ ] **Step 1: Write the failing tests** in `recovery.test.ts`: `a failed flush still reloads` (R2); `a flush that
  does not answer in 10 s reloads anyway and keeps the text to copy` (Q2: the text of the unanswered `block.setText`
  shows in a "could not be saved" notice); `a reload that is refused or does not answer shows NOT_ANSWERING` (Q2);
  `after the again notice a stale refusal says NEEDS_RESTART` (Q3); `reloading is true from the start of the reload
  until it ends` and `a reload that ends normally shows no extra notice` (Q4); `typed text keeps its notice in every
  case`; `within a minute, a reopened session after a kept one shows its notice, the same notice twice stays quiet`
  (Q1 b). In `app.svelte.test.ts`: `a reload closes the search, the date picker and the due calendar` (plan 6
  follow-up 23) and `a shortcut while reloading does nothing` (Q4). Run: FAIL.
- [ ] **Step 2: Implement.** Q5 a: no code; a comment in `clear()` says why the bare card is not deleted, and #89's
  point is closed in `docs/backlog.md` as accepted.
- [ ] **Step 3: e2e.** Step 127 (the reload after `BRECCIA_TEST_PANIC`) also asserts the layer: it is shown during the
  reload (wait on its element, with `BRECCIA_TEST_OPEN_DELAY`-style hook only if the reload is too fast to see; never a
  sleep) and gone afterwards, and a click on a sidebar row during it opens nothing. If the reload is too fast to
  observe the layer reliably, assert only that it is gone afterwards and say so in the step.
- [ ] **Step 4: Run** `npm test`, `just lint`, `just e2e`.
- [ ] **Step 5: Review items** 158 (R2), 159 (Q2), 160 (Q3), 161 (Q4, the layer: how it looks in a light and a dark
  theme), 162 (Q1 b): each says what to look for and "covered by unit tests; by hand only with `BRECCIA_TEST_PANIC`"
  where it applies.
- [ ] **Step 6: Commits** one per point, e.g. `fix(app): Recovery: the notes reload even when saving the last typed
  text fails`, `fix(app): Recovery: the notes reload after 10 s if Breccia stops answering, keeping your text`,
  `fix(app): Recovery: refused clicks after an internal error say a restart is needed`, `feat(app): Recovery: the
  window is greyed out while the notes reload`, `fix(app): Recovery: a second, different error notice within a minute
  is shown`.

### Task 10: Components take the state object (model: opus; review: opus)

**Files:**
- Modify: `app/src/components/Board.svelte`, `SettingsView.svelte`, `Sidebar.svelte`, `app/src/App.svelte`

**Interfaces:**
- Consumes: `AppController` (Task 8), `ConfigStore` (Task 4), `Boards`, `HiddenColumns`, `MainArea`.
- Produces: `Board` takes `{ app, boards, hiddenCols }` plus `folded`, `columnWidth`; `SettingsView` takes `{ app,
  config, settings }` plus `recent`, `theme`, `journalsAt`, `mac`; `Sidebar` takes `{ app }` plus `width` and
  `bind:pickerOpen`; each under 10 props. The components call `app.…` themselves (R6).

- [ ] **Step 1: RED:** change the props first and run `just lint`: `svelte-check` FAILS on every old prop `App.svelte`
  still passes.
- [ ] **Step 2: Implement:** the inline arrow functions of the template move into the components or the controller.
- [ ] **Step 3: Run** `npm test`, `just lint`, `just e2e`, and `just screenshots`: the README images do not change
  (compare with `git diff --stat docs/images/`; revert them if only bytes differ).
- [ ] **Step 4: Commit** `refactor(app): the board, Settings and sidebar take their state objects`.

## Finish

- `just test`, `just lint`, `just e2e` (expected: 290 PASS lines, the last step 168; record them in `docs/STATUS.md`).
- Review item 163: "Click once through every view and dialog (journal, page, board and card, All pages, Archive,
  Dailies, Git history, Graph, Settings and each of its dialogs, search, F1, the untitled page, Back and Forward):
  everything behaves as in 1.9.1." The refactor touches every view; e2e does not cover every dialog.
- Update `docs/audit/2026-11-10/notes.md`: the "Own echoes are recognised" rule is obsolete (plan 15); "State classes
  take an env" now names `MainArea`, `Overlays`, `ConfigStore` and `AppController`. Mark M36 to M40 and M49 done in
  `docs/audit/2026-11-10/progress.md`.
- Close plan 15 follow-up 2 and plan 6 follow-up 23 in their files ("done in plan 19"); #89 keeps its Git edges (or
  moves to `docs/backlogged.md` if Q1 c).
- Follow-ups doc `docs/plans/2026-11-26-19-the-frontend-controller-followups.md`.
- Update `docs/STATUS.md` (plan table row 19, "Next", owner decisions Q1 to Q5) and `CLAUDE.md` ("`App.svelte` has no
  unit-test harness" now points at `lib/app.svelte.ts` for the controller's logic).
