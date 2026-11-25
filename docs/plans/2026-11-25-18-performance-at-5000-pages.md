# Plan 18: Performance at 5,000 pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure Breccia at 5,000 pages with repeatable numbers, then fix the three worst points the owner named
(the blank first window, the Git pause, the long lists), decide the rest from the numbers, and measure again.

**Architecture:** Measuring comes first and stays in the repo: the core's scale test (`crates/core/tests/it/scale.rs`)
gains the missing core measures, and a new local script (`app/e2e/perf-scale.mjs`, `just perf-scale`) drives the
release exe on the same 5,000-page folder that `just graph-scale` writes. Both print `name value bar ok|OVER` lines; the
results go to `docs/perf/`. The fixes: the shell opens the startup folder on a thread after the window shows, and the
window shows "Opening…" until the folder is open; a pull rebases without the notes lock (`git replay`, no working tree)
and only moves the files under the lock; the Git history and the Archive view reuse the All pages virtualiser.

**Tech Stack:** Rust 1.90 (`crates/core`, `app/src-tauri`, Tauri 2), Git 2.45 on the owner's machine (`git replay` needs
2.44), Svelte 5 + TypeScript, `@tanstack/virtual-core`, Vitest, Playwright over the WebView2 DevTools port. No new
dependency.

**Spec:** `docs/spec.md` (binding; §2 anti-goals, §6 "How data flows", §7.7 All pages, §7.9 Git, §7.13 status bar,
§8 "Scale and speed"), `docs/backlog.md` #85 (the measured points and the owner's note of 2026-11-24), #83 (the graph's
numbers, not in scope), plan 17 follow-up 2 (`docs/plans/2026-11-24-17-due-date-follow-ups-followups.md`).

## State

Written 2026-11-25 at commit `7dd308a`; waits for the owner's review. Ledger:
`.superpowers/sdd/2026-11-25-18-performance-at-5000-pages/progress.md`.
Numbers: review items start at **151** (`docs/review.md` ends at 150); e2e steps start at **166** (the last is 165,
286 PASS lines); backlog's highest number is 101, so a new item is **#102**.

## Owner questions

**Settled 2026-11-25 (owner):** Q1 (a): the window shows at once with "Opening ‹folder›…"; typing once the files are
read (a counter or an early journal is later work). Q2 (b): search keeps waiting for the complete index; an early
partial answer goes to the backlog. Q3: the bars as proposed. Q4 (a): small fixes in this plan, big ones into #85 with
their numbers; the owner sees Task 6's list before any of its fixes start. Rulings R4 and R5 (`git replay`, no
`post-rewrite` hooks on Breccia's pulls, older Git keeps today's locked rebase): accepted.

Ask one at a time, with the options. The plan is written with the recommended answers; another answer changes the task
named.

- **Q1. What the window shows while the folder opens, and what works then.** *What it is about:* today Breccia reads
  every file of the notes folder before the window appears, so with a large folder you see nothing, or a blank window,
  for as long as that takes (we will know the exact time after Task 2; it grows with the folder). After this plan the
  window appears at once and the folder opens inside it. While it opens, the files are not read yet, so there is no
  journal to type into: Breccia does not know what today's page holds until it has read it. (Task 3)
  - a. The whole window shows (sidebar, status bar, theme, zoom) with "Opening ‹folder name›…" in the middle of the
    main area and nothing clickable but the theme and help buttons. The journal appears as soon as the folder is
    open. Cheapest, and honest: nothing looks usable that is not.
  - b. As a, plus a count in the status bar ("Opening · 1,200 of 5,000 files"). Nicer for a very slow first open
    (Windows Defender checks each fresh file), but the core has to report progress from inside the open, which is a
    medium-sized extra change.
  - c. Show today's journal day first and let you type in it while the rest loads. The most useful, but it splits the
    open into two parts with their own errors and races (what if a link you type points at a page not read yet); it
    is a plan of its own.
  - **Recommendation: a.** The open is expected to take well under the spec's 2 seconds on a warm start; if Task 2's
    numbers show a long open even when warm, b becomes a follow-up.

- **Q2. Search while the first index is still being built.** *What it is about:* the first time a large folder opens
  (or after the cache is cleared), Breccia builds its search index in the background, which takes several seconds at
  5,000 pages; the status bar shows "Indexing for search · 1,200 of 5,000 pages". A search typed in that time today
  waits until every page is indexed (about 3 seconds at 5,000 pages, the last measurement), and then gives the full
  answer. (Task 6)
  - a. Answer at once from what is indexed so far, with a line in the results: "Still indexing: 1,200 of 5,000 pages
    searched." The answer may miss blocks; typing the search again later gives the full one. Page names are always
    complete (they do not need the index).
  - b. Keep waiting, as today: the answer is always complete, but the search box sits for a few seconds once.
  - **Recommendation: b for this plan, a as a backlog item.** It happens only on a first open or a cleared cache, and
    a complete answer is never wrong. If you prefer a, it becomes a fix task in Task 6 (small: the core skips the
    flush and marks the answer).

- **Q3. The budget bars.** *What it is about:* each measure gets a bar; a number above its bar is "OVER" and must be
  either fixed in this plan or written down as a follow-up. The bars become part of the spec (§8), so later plans keep
  to them. Proposed bars (all on the owner's machine, 5,000 pages, a warm start):
  - typing: the core's time for one keystroke (`block.setText`) under 16 ms (one frame), and a keystroke never waits
    more than 16 ms for the notes lock, also while the first index is built;
  - the window shows within 500 ms of starting Breccia; the journal is usable within 2 s (spec §8 already says 2 s);
  - Git: the notes lock is held under 100 ms during a pull (today about 577 ms; the old bar was 500 ms);
  - long lists (Git history at 3,000 commits, Archive at 3,000 tasks): the view opens within 200 ms and scrolls at
    50 frames per second (each frame under 20 ms, the graph's bar);
  - a page color change on a page linked from 1,000 pages and journal days: under 300 ms (spec §8, "a few hundred
    milliseconds");
  - moving the caret down a row on a page of 5,000 rows: under 16 ms;
  - the first automatic archive of 2,000 old tasks: under 2 s, once.
  - **Recommendation: these bars.** Choose other values if a number matters more or less to you; a stricter typing
    bar than one frame buys nothing you can feel.

- **Q4. What may stay above its bar.** *What it is about:* Task 6 looks at every measure that is still OVER after the
  three named fixes. A small fix (about a day's work or less, one task with its own test) is done in this plan; a big
  one becomes a follow-up in backlog #85 with its number, for a later plan. (Task 6)
  - a. That rule: small ones now, big ones written down with their numbers.
  - b. Fix everything above its bar in this plan, however big. The plan grows by an unknown amount.
  - c. Fix only the three named points; everything else is written down.
  - **Recommendation: a.** Expected big ones, if they are OVER: the first-index typing pause if the index chunk
    cannot simply be made smaller, and the graph (#83, out of scope by your note of 2026-11-24).

## Pre-flight rulings (the planner's calls; the owner may overrule)

- **R1. Measuring stays local.** `scale.rs` measures stay `#[ignore]`; `just perf-scale` is not in `just test`, `just
  e2e` or any workflow. No GitHub Actions run measures anything. Cost if wrong: none.
- **R2. One folder for every measure.** `perf-scale.mjs` writes the folder with the generator of `graph-scale.mjs`,
  moved to `app/e2e/scaleFolder.mjs` (the same 2,000 pages in 50 folders + 3,000 journal days, 50,000 links), plus
  what a measure needs on top: a Git repository with 3,000 commits, 3,000 archived tasks, one page of 5,000 rows, a hub
  page linked from 1,000 pages and days. `scale.rs` keeps its own generator (it runs in-process). Cost if wrong: the
  core and window numbers come from two folders of the same size but not the same bytes.
- **R3. Every window number is the median of 3 runs after one discarded warm-up run** (as `graph-scale.mjs` does for
  Windows Defender). Cost: the script takes several minutes.
- **R4. The rebase outside the lock uses `git replay`** (Git 2.44+, no working tree, no hooks): Breccia computes the
  rebased commits without the lock, then under the lock checks that the branch has not moved, moves the files with
  `git read-tree -m -u <old> <new>` (refuses to overwrite a changed file) and the branch with `git update-ref <ref>
  <new> <old>` (refuses if it moved). That is not `reset`, `stash` or `clean` (sync.rs's promise holds). When `git
  replay` is missing (older Git), stops on a conflict, or the branch moved meanwhile, Breccia does what it does today
  (the rebase under the lock), so conflicts, their messages and their abort are unchanged. A scratch worktree was the
  other way; it writes a second copy of the 5,000 files on every pull. Cost if wrong: on a Git older than 2.44 the
  pause stays as today (577 ms), and the status says nothing.
- **R5. Git's own rebase hooks (`post-rewrite`) no longer run on Breccia's pulls** when the fast path is taken. Commit
  hooks still run (under the lock: a follow-up). Cost: a user who relies on a `post-rewrite` hook in the notes repo
  sees it skipped; nobody is known to.
- **R6. "Opening…" is shell state, not core state.** The shell sets an `opening` flag with the folder path, answers it
  with a new command `startup_opening`, and emits `folder:opened` when the open (and its follow-up: status, watcher,
  index, notices) is done. `FolderView` (a wire type) does not change. Cost: none.
- **R7. The e2e step for the opening state uses a test hook**, `BRECCIA_TEST_OPEN_DELAY=<ms>`: the startup open thread
  waits that long before opening (like `BRECCIA_TEST_PANIC`, never set in normal use). The e2e step itself waits on
  states, never sleeps. Cost: a hook in the shipped exe that does nothing unless set.
- **R8. The virtualiser is shared through one helper**, `app/src/lib/fixedRows.svelte.ts`, used by All pages, Git
  history and Archive (fixed row heights; nothing is measured). The journal feed keeps its own (measured rows). Cost:
  All pages is touched by a refactor; its e2e steps cover it.

## Items not taken (go to the follow-ups or Task 6)

- The graph (#83): out of scope (owner, 2026-11-24).
- Commit hooks and Git LFS under the lock, merging queued messages to the Git thread (#85, was #57): Task 6 decides
  from the numbers.
- The Git history re-reading every shown row after each commit, and reading every not-pushed hash for a remote never
  pushed to (#85, was #58): Task 6 decides.

## Global Constraints

- Spec §2 anti-goal: never silently drop, reorder or reformat text the user wrote. A pull must leave every file and
  every local commit as a plain `git pull --rebase` would; a refused or failed fast path must leave the repository
  exactly as before it.
- Spec §8: 5,000 pages / 100,000 blocks open with the journal usable within 2 seconds; typing never waits for the
  index; the board and All pages update within a few hundred milliseconds of a change.
- sync.rs promise: nothing runs `reset`, `stash`, `clean`, `--amend` or a forced push.
- No GitHub Actions use; every measurement runs locally. `just e2e` stays green; e2e steps assert the bytes on disk
  where a file changes and wait for states, never sleep.
- Tauri event names are `noun:verb` (`folder:opened`); command names keep their dots in the core.
- After a wire type change, run `just types`. Logic with unit tests lives in `app/src/lib/`; `App.svelte` and
  components have no unit-test harness.
- Every test must be able to fail: capture a RED run (for a measure: the baseline number OVER its bar) first.
- No colour literal or `color-mix` outside `app/src/styles/tokens.css`.
- Commits: conventional subjects; user-visible speed changes as `feat`/`fix` in plain words (Task 3:
  `feat(app): Startup: the window shows at once and the folder opens inside it`); measuring work is `test` or `chore`;
  no file or function names in `feat`/`fix` subjects; no attribution lines; on `main`, push after each commit.
- Words from `docs/vocabulary.md`: page, journal day, block, task, view, Archive, Git history.

## Review Focus

1. **A save typed while the pull's replay runs** (the lock is free now): the save lands, the branch moved check fails
   or the read-tree refuses, Breccia falls back to the locked rebase, and both the typed text and the pulled change are
   in the files and in the history. Pinned by Task 4's `save_during_replay_falls_back_and_keeps_both`.
2. **A pull that conflicts**: the same red "Your notes and the remote both changed …" message as today, files and
   commits as before. Pinned by Task 4 (the existing conflict tests stay green, plus `conflict_after_replay_is_reported_as_before`).
3. **The startup folder fails to open or is gone** while the window already shows "Opening…": the Welcome screen with
   the notice, as today, never a stuck "Opening…". Pinned by Task 3's `startup.test.ts` (`failed open shows the
   notices`) and the shell test `startup_open_of_a_gone_folder_opens_nothing_and_says_so` (kept).
4. **A Git history scrolled far down when a new commit arrives**: the new row on top, the scroll position kept, no
   blank gap. Pinned by Task 5's e2e step 167.
5. **Archive filter at 3,000 rows**: typing in the filter narrows the rows and the virtualiser shows the first match at
   the top, not an empty window below the old scroll position. Pinned by Task 5's e2e step 168.

---

## Tasks

### Task 1: Core measures for every #85 point (model: sonnet)

**Files:**
- Modify: `crates/core/tests/it/scale.rs`

**Interfaces:**
- Produces: new `report(...)` lines (names exact, later tasks and the results doc compare them):
  `"block.setText on today's journal day"` (bar 16), `"page.setColor on a page linked from 1,000"` (bar 300),
  `"archive.auto, first run, 2,000 old tasks"` (bar 2000), `"search.query during the first build"` (bar 300),
  `"index_step (one chunk)"` (exists; bar stays 16), `"git.log 200 of 3,000 commits"` (bar 100),
  `"git.log unpushed, remote never pushed to"` (bar 100), and the existing `git_at_scale` lock lines with the bar
  changed from 500 to **100**.

- [ ] **Step 1:** Add the measures to `scale_5000_pages`: today's journal day gets 20 blocks linking 20 colored pages
  (`color::` on those pages), then `block.setText` on its first block (21 runs, median); a hub page `Hub` linked once
  from 500 pages and 500 journal days, then the command that sets its color (find it in `session/command.rs`, the one
  the link-color menu sends), median of 5 with alternating colors; 2,000 `DONE` blocks with `done::` 400 days before
  `today()` spread over 200 pages, then `archive.auto` once (one run, not a median: it is a first run); the existing
  query-time flush measure, renamed to the line above.
- [ ] **Step 2:** Add to `git_at_scale`: 3,000 commits made with `git fast-import` in the test's repo (one stream,
  each commit changing one page), then `git.log` with skip 0, limit 200 (median of 5); the same with a remote added
  that was never pushed to.
- [ ] **Step 3: Run** `cargo test --release -p breccia-core -- --ignored --nocapture scale::`. Expected: every new
  line prints with a number; `git lock held …` lines print OVER against 100 (the RED for Task 4).
- [ ] **Step 4: Run** `cargo test -p breccia-core` (the normal suite still compiles and passes).
- [ ] **Step 5: Commit** `test(core): measure every large-folder point at 5,000 pages`.

### Task 2: Window measures and the baseline (model: opus)

**Files:**
- Create: `app/e2e/scaleFolder.mjs` (the folder generator moved out of `graph-scale.mjs`, plus the extras of R2)
- Modify: `app/e2e/graph-scale.mjs` (imports the generator; its output must not change: same file count and link count
  lines)
- Create: `app/e2e/perf-scale.mjs`, `justfile` recipe `perf-scale *args: build`
- Create: `docs/perf/2026-11-25-baseline.md`
- Modify: `CLAUDE.md` (Commands: one line for `just perf-scale`)

**Interfaces:**
- Consumes: `app/e2e/trace.mjs` `summarize(log)` for the trace lines.
- Produces: `export function writeScaleFolder(dir: string, opts: { git?: boolean, archive?: boolean, longPage?: boolean,
  hub?: boolean }): { files: number, links: number }` in `scaleFolder.mjs`; `perf-scale.mjs` prints one line per
  measure, `name value bar ok|OVER`, and writes `target/perf-scale/<date>.json`. Measure names (exact):
  `window shows` (bar 500, ms from spawn to the WebView's first contentful paint, `performance.timeOrigin` plus the
  paint entry minus the spawn time), `journal usable` (bar 2000, ms from spawn to the first journal block row),
  `typing during first build, wait p95` (bar 16) and `run p95` (bar 16) (from `BRECCIA_TRACE=1` lines for
  `block.setText`, 40 keystrokes typed while `index:changed` still reports progress, on a fresh config dir so the
  index is cold), `search during first build` (ms from the search key to the first full-text result),
  `git history open` (bar 200), `git history show more x10` (each, bar 200), `git history scroll frame p95` (bar 20),
  `archive open` (bar 200), `archive scroll frame p95` (bar 20), `caret down at 5,000 rows p95` (bar 16, ms from the
  key to the next animation frame, 50 presses on the long page), `journal scroll back 500 days frame p95` (bar 20).
  Frames are read with a `requestAnimationFrame` loop injected over CDP while the script scrolls by wheel events.

- [ ] **Step 1:** Move the generator; run `just graph-scale` and check its folder lines are unchanged.
- [ ] **Step 2:** Write `perf-scale.mjs` following `graph-scale.mjs` (spawn, `BRECCIA_OFFSCREEN=1` unless
  `--onscreen`, fresh `BRECCIA_CONFIG_DIR`, `connectOverCDP`, one discarded warm-up launch, 3 measured launches per R3).
- [ ] **Step 3: Run** `cargo test --release -p breccia-core -- --ignored --nocapture scale::` and `just perf-scale`.
  Expected: every line prints; at least `git lock held` is OVER.
- [ ] **Step 4:** Write `docs/perf/2026-11-25-baseline.md`: machine (CPU, RAM, Windows build, Git version), commit,
  the commands, then one table `measure | bar | baseline | verdict | backlog #85 point` covering every #85 point (large
  folders, first start, Git, long lists, first archive, the three plan-12-triage notes, plan 17 follow-up 2); a point
  with no measure says why (for example "Git LFS: not measured, no LFS in the folder"). Raw outputs below the table.
- [ ] **Step 5: Commit** `test: measure the window at 5,000 pages; baseline results`.

### Task 3: The window shows at once and the folder opens inside it (model: opus; review: opus)

**Files:**
- Modify: `app/src-tauri/src/lib.rs` (`setup`: no open; a thread does `open_startup_folder`, status, watcher, index,
  then emits), `app/src-tauri/src/commands.rs` (`startup_opening`), `app/src-tauri/src/events.rs` (`folder:opened`)
- Create: `app/src/lib/startup.ts`, `app/src/lib/startup.test.ts`
- Modify: `app/src/lib/api.ts` (`startupOpening()`), `app/src/App.svelte` (startup sequence and the opening view)
- Modify: `app/e2e/smoke.mjs` (step 166), `CLAUDE.md` (env var `BRECCIA_TEST_OPEN_DELAY`), `docs/spec.md` §6 (first
  bullet: "The window shows at once; while the folder opens it says Opening ‹name›…"), `docs/review.md` (item 151,
  heading "Performance at 5,000 pages (plan 18)")

**Interfaces:**
- Produces (shell): `App.opening: Mutex<Option<PathBuf>>`; command `startup_opening(state) -> Option<String>` (the path
  while opening, else `None`); event `folder:opened` with payload `{ generation: u64 }` emitted after the startup
  notices are stored and the watcher and index have started.
- Produces (window): `export async function awaitStartupOpen(env: { opening(): Promise<string | null>; onOpened(cb: () =>
  void): () => void }, show: (path: string) => void): Promise<void>` in `startup.ts`: subscribes first, then asks;
  `null` resolves at once; otherwise calls `show(path)` and resolves on the event (an event that came before the
  answer also resolves it).

- [ ] **Step 1: Write the failing tests** in `startup.test.ts`: `resolves at once when nothing opens`;
  `shows the folder and waits for the event`; `an event before the answer still resolves`; `unsubscribes after
  resolving`; `failed open shows the notices` (the event comes, `folder.status` then has no folder: the caller gets
  the Welcome path; test the sequencing helper the App calls, `startupSequence(env)`, returns `'welcome'` or
  `'folder'`).
- [ ] **Step 2: Write the failing e2e step 166** at the end of `smoke.mjs`: launch a second exe (own
  `BRECCIA_CONFIG_DIR`, port 9223, `BRECCIA_FOLDER` = a fresh copy of the demo folder, `BRECCIA_TEST_OPEN_DELAY=3000`),
  wait for `[data-testid="opening"]` with text `Opening ‹folder name›…`, then for the journal; type `opened` into today's
  first block; assert the day file's bytes end with that text; close it. Run `just e2e`: step 166 FAILS (no opening
  view; the window is blank until the open ends).
- [ ] **Step 3: Implement** the shell part (R6, R7) and the window part (Q1 a): `App.svelte` renders the shell with an
  `Opening ‹name›…` main area (`data-testid="opening"`) while `awaitStartupOpen` runs, then the existing
  `folder.status` / `openFolder()` / `startupNotices()` sequence.
- [ ] **Step 4: Run** `npm test` in `app/`, `cargo test --workspace`, `just e2e` (expected: 166 PASS, count +1 or more),
  and `just perf-scale`: `window shows` under 500 ms.
- [ ] **Step 5:** Review item 151: by hand, start Breccia on a large folder; the window appears at once with "Opening…",
  then the journal.
- [ ] **Step 6: Commit** `feat(app): Startup: the window shows at once and the folder opens inside it`.

### Task 4: A Git pull no longer pauses typing (model: sonnet; review: opus)

**Files:**
- Modify: `crates/core/src/git/sync.rs` (`prepare_integrate`, `apply_prepared`), `crates/core/src/git/engine.rs`
  (`fetch_integrate` calls `prepare_integrate` without the lock; `integrate_locked` tries `apply_prepared` first, falls
  back to `repo.integrate(t)`), the test seam `while_replaying(f)` under `test-seams`
- Test: the Git sync tests in `crates/core/tests/it/` (find them with `grep -rln "integrate\|before_rebase" crates/core/tests`)
- Modify: `docs/spec.md` §7.9 (one sentence: the pull's rebase is prepared without holding up typing; a conflict is
  handled as before), `docs/review.md` (item 152)

**Interfaces:**
- Produces: `pub struct Prepared { pub base: String, pub tip: String, pub branch_ref: String }`;
  `pub fn prepare_integrate(&self, t: &Target) -> Result<Option<Prepared>, Problem>` (`Ok(None)`: nothing to do or
  the fast path does not apply, so the locked path decides; runs `merge-base --is-ancestor` both ways: remote already
  in HEAD gives `None`; HEAD in remote gives `tip = remote`; else `git replay --onto <remote> <remote>..HEAD` with the
  `REBASE_FLAGS` config, whose last `update` line names the tip; any non-zero exit gives `None`);
  `pub fn apply_prepared(&self, p: &Prepared) -> Result<Option<Integrated>, Problem>` (`Ok(None)` when HEAD is no
  longer `p.base`, the tree is not clean, or `read-tree` refuses: the caller falls back; otherwise `read-tree -m -u
  base tip`, `update-ref <branch_ref> tip base`, then the same `diff --name-only` as `integrate` for `changed`).

- [ ] **Step 1: Write the failing tests:** `pull_replays_without_the_lock` (the `while_replaying` seam asserts
  `session.try_lock().is_ok()`; today there is no replay, so the test fails on "seam never ran"; also asserts the
  pulled change is in the file and the history is linear with the local commit on top);
  `save_during_replay_falls_back_and_keeps_both` (the seam saves a block; after the pull the block's text and the
  pulled page's text are both in their files, `rev-list --merges` is empty); `conflict_after_replay_is_reported_as_before`
  (the remote and the local commit change the same line: `Problem::Conflict` with that file, HEAD and files exactly as
  before); `old_git_without_replay_still_pulls` (a `Git` whose replay is forced to fail through the seam: the pull
  works through the locked rebase).
- [ ] **Step 2: Run** `cargo test -p breccia-core --features test-seams <module>::` (the feature the seams use; check
  the module's existing `cfg`). Expected: the first and second FAIL, the third and fourth pass.
- [ ] **Step 3: Implement** per R4.
- [ ] **Step 4: Run** `cargo test --workspace`, then the scale run: `git lock held …` lines under 100 ms (record the
  number for Task 7).
- [ ] **Step 5:** Review item 152: by hand, type in a journal day while a pull with a remote change runs (two clones);
  no pause, both changes kept.
- [ ] **Step 6: Commit** `fix(core): Git sync: a pull no longer pauses typing in large folders`.

### Task 5: Long Git histories and archives scroll smoothly (model: opus; review: opus)

**Files:**
- Create: `app/src/lib/fixedRows.svelte.ts`
- Modify: `app/src/components/AllPagesView.svelte` (uses it; no change a user sees),
  `app/src/components/GitLogView.svelte`, `app/src/components/ArchiveView.svelte` (and their CSS: fixed row height,
  one line, ellipsis, if not already)
- Modify: `app/e2e/smoke.mjs` (steps 167, 168), `docs/review.md` (item 153)

**Interfaces:**
- Produces: `export function fixedRows<T>(opts: { scroller: () => HTMLElement; rows: () => T[]; key: (row: T, i: number)
  => string | number; rowHeight: number; overscan?: number; rowsEl: () => HTMLElement | undefined; headEl: () =>
  HTMLElement | undefined }): { readonly items: VirtualItem[]; readonly height: number; scrollToIndex(i: number): void }`
  — the body is All pages' current `options` / `margin` / `$effect` code moved, not rewritten.

- [ ] **Step 1: Write the failing e2e steps** (they run in a scratch folder made by the step, reached through the
  recent-folder switch as step 57 does, and switch back at the end):
  - 167: the scratch folder's repo has 600 commits (one `git fast-import` stream, each changing `pages/Log.md`, then
    `git checkout -f main` in that scratch repo by the test); open the Git history, press "Show more" twice: the count
    says `newest 600 commits` or `600 commits`, and the DOM holds at most 80 `log-row` elements; scroll to the end, the
    last row's `data-hash` is the first commit; type in a page and click the Git item: the new commit's row is on top
    once scrolled up, and the page's file bytes hold the typed text (Review Focus 4).
  - 168: the scratch folder has `pages/Old.md` with 1,500 archived `DONE` blocks; open the Archive: the count says
    `1,500 tasks` (or the existing `countLabel` form), at most 80 `archive-row` elements; type `task 1499` in the filter:
    the first row shows it at the top (Review Focus 5); click it: the page opens on that block.
  Run `just e2e`: 167 and 168 FAIL on the row-count assertions.
- [ ] **Step 2: Implement** `fixedRows`, move All pages onto it, then Git history and Archive.
- [ ] **Step 3: Run** `npm test`, `just lint`, `just e2e` (all PASS), and `just perf-scale`: the four long-list lines
  under their bars.
- [ ] **Step 4:** Review item 153: by hand, open a long Git history and the Archive; scrolling is smooth.
- [ ] **Step 5: Commit** `fix(app): Long Git histories and archives open and scroll without stutter`.

### Task 6: Decide the rest from the numbers (model: opus for the decision; sonnet per small fix)

**Files:**
- Modify: `docs/perf/2026-11-25-baseline.md` (a "Decisions" section), `docs/backlog.md` #85 (rewritten to what is
  left, with numbers), and the files of each small fix.

- [ ] **Step 1:** Run both scale commands. For every line still OVER (and the #85 points without a measure), write in
  "Decisions": the number, the cause if known, small fix now (Q4 a: one task, about a day or less, with its own
  failing test or measure) or follow-up (why it is big). Expected candidates and their likely shape:
  - `typing during first build, wait p95` OVER: make the index chunk smaller until one chunk is under 16 ms (a
    constant in the indexing loop; the measure is the test).
  - `page.setColor on a page linked from 1,000` OVER (plan 17 follow-up 2, plan 1 follow-up 9): send only the page
    views the window shows; the core test asserts the answer's page count.
  - `git.log … unpushed, remote never pushed to` OVER: ask Git once for the commits not on the remote instead of
    reading every hash.
  - The Git history re-reading every shown row after each commit: reload only the top page and merge.
  - `archive.auto` first run OVER: likely acceptable once; follow-up unless trivial.
  - `caret down at 5,000 rows` OVER (plan 7 follow-up 19): the lookup made linear.
  - Q2 a chosen: search answers from the partial index, marked "Still indexing: N of M pages searched".
- [ ] **Step 2:** Present the list to the controller, who shows it to the owner before any fix starts (one line per
  item: number, bar, fix or follow-up).
- [ ] **Step 3:** Each small fix: failing test or OVER measure first, the fix, the after-number, a review item, one
  commit (`fix(core): …` or `fix(app): …` in user words, for example `fix(core): Page colors: changing a widely linked
  page's color is quick again`; a change no user notices is `refactor` or `chore`).
- [ ] **Step 4: Commit** the decisions: `docs: plan 18 decisions from the 5,000-page numbers`.

### Task 7: Measure again and compare (model: sonnet)

**Files:**
- Create: `docs/perf/2026-11-25-plan-18-after.md`
- Modify: `docs/spec.md` §8 (the bars of Q3), `docs/backlog.md` #85 (closed points move to `docs/backlogged.md` under
  the same number if nothing is left, else stays with the rest), `docs/STATUS.md` (plan 18 row, Next, test counts)

- [ ] **Step 1: Run** `cargo test --release -p breccia-core -- --ignored --nocapture scale::` and `just perf-scale` on
  the same machine as the baseline.
- [ ] **Step 2:** Write the after file: the same table with `baseline | after | bar | verdict`, a line per change that
  explains a moved number, and every measure still OVER with its follow-up.
- [ ] **Step 3:** Spec §8: add the bars (Q3) as targets after the existing paragraph.
- [ ] **Step 4: Commit** `docs: plan 18 measured again; bars in the spec`.

## Finish

- `just test`, `just lint`, `just e2e` (expected: the last step is 168; record the PASS count in `docs/STATUS.md`).
- Follow-ups doc `docs/plans/2026-11-25-18-performance-at-5000-pages-followups.md`; mark plan 17 follow-up 2 as taken
  by plan 18 (done or moved) in its follow-ups file.
- Update `docs/STATUS.md` (plan table row 18, "Next", owner decisions Q1 to Q4).
