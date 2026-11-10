# SDD ledger — plan: docs/plans/2026-11-10-06-safety-net.md

The owner saw the task list and answered all nine product questions on 2026-11-10 (plan commit `61a01a3`), and asked
to continue in the same session with subagents. Baseline before Task 1: `61a01a3`.

Owner, 2026-11-10: private vulnerability reporting is turned on in the GitHub repository (for Task 2, `SECURITY.md`).

## Pre-flight (opus, 2026-11-10)

The scan tables are in the local `preflight.md` (pairs of tasks, each task against itself): all rows consistent on
counts, anchors, PASS counts and commit subjects except where a finding below says otherwise.

Ruling: every finding below is adopted with its proposed ruling as written; the cost if wrong is the one each finding
names. F1, F2, F3, F7, F21 go to Task 8; F3, F4(a), F6, F10, F11, F19 to Task 7; F4 also to Tasks 8 and 10; F5, F12,
F13 to Task 5; F8, F16 to Task 3; F14 to Task 2; F15 to Task 4; F17 to Task 1; F18 to Task 6; F20 to the follow-ups.
The single-instance plugin API (Task 9) is unverified until the crate is fetched; the implementer checks it first.

**F1 (C) — Tasks 7 and 8: typed text is dropped after a recovery.**
`host.refuseCommand` (`app/src/editor/host.svelte.ts:139-148`) turns a failed `block.setText` into the copyable
`UNSENT` notice only when the code is `unknownBlock`; any other code goes to `refuse` (plain message). After a
`Reopened` the generation is new, so pending typing that `flush()` sends (captured with the old generation,
`lib/api.ts:51-53`) comes back `stale`; a `block.setText` waiting on a poisoned lock comes back `recovered` without
running (T7 `with_session`). Both lose the text (spec §2). The plan's "host.backgroundFailed already shows typed text;
leave it untouched" is wrong. Also, `RecoveryEnv.flush` is `client.flush()` only; notes.md (area 7) requires
`host.leave()` before `client.flush()` in every flow that leaves a view, or text still in the open editor is not yet
pending.
*Ruling:* in T8, `refuseCommand` treats codes `stale` and `recovered` like `unknownBlock` for `block.setText` (same
`UNSENT` conflict notice), with a host unit test (RED first); `RecoveryEnv.flush` = `host.leave()` then
`client.flush()`. *Cost if wrong:* words the user typed in the last 300 ms before an internal error vanish.

**F2 (C) — Task 8: `quiet('recovered', …)` is true always.** It contradicts the plan's own rule that typed text keeps
its notice. *Ruling:* `quiet` returns false for any `block.setText` command, whatever the code; true for `recovered`
otherwise. Add `quiet_never_hides_typed_text` for `recovered` too. *Cost:* as F1.

**F3 (I) — Tasks 7 and 8: `NoFolder` looks like `Kept`.** `RecoveredEvent { reopened: bool }` is false for both. For
`NoFolder` the session has no folder (and a bumped or unchanged generation), but the window keeps showing the old
journal; every command then fails "no folder". *Ruling:* send `reopened: true` for `Reopened` **and** `NoFolder`
(rename nothing; doc comment: "the window must reload"); `reload()` runs `folder.status` and shows the Welcome screen
when no folder is open. In `after_recovery` for `NoFolder`, drop the watcher and clear `notes_root`. *Cost:* a
window that looks alive while nothing it shows can be edited.

**F4 (I) — Tasks 7, 8, 10: the test hook re-fires; reload loops are not bounded.** The hook panics on every
`search.query` with that text, regardless of generation; `search.refresh()` re-sends the box's text on `tree:changed`
and `page:changed` (`App.svelte:1460, 1491, 1498`). Today the reload's `folder.status` closes the box first
(`App.svelte:569`), so it does not loop, but only by ordering. A real panic that repeats on every reload (say in
`journal.feed`) would loop reload → panic → reload, with the notice suppressed for 60 s. *Ruling:* (a) the hook fires
once per process (`App::test_panic: Mutex<Option<String>>`, `take()` on first match), which also matches T10's "the
next `search.query`"; (b) `Recovery` reloads at most once per 60 s; a second `reopened` event inside that window only
shows Q2's restart text; (c) step 127 asserts the search box is detached instead of closing it. *Cost:* a
deterministic panic makes the window reload forever.

**F5 (I) — Task 5: other crates' log records reach the file and stderr.** `log::set_max_level(Trace)` under
`BRECCIA_TRACE` (and `Info` otherwise) passes every `log` record of tauri, tao, wry, notify and friends to the
logger. That breaks Q6's "only the messages that exist today" (and could fill 1 MB quickly), and adds lines to the
stderr that `trace.mjs` reads (harmless to its parser, which skips non-`trace ` lines, but not "unchanged").
*Ruling:* `LogFile::enabled` accepts only targets starting with `breccia` (`breccia_core`, `breccia_lib`) or equal
to `trace` and `panic`; the stderr sink writes `"{}\n"` of `record.args()` exactly as `eprintln!` did; add a test
that a record with target `tao::x` is not written. *Cost:* note-adjacent text from a dependency in a file the user
sends with a bug report.

**F6 (I) — Task 7: a panic inside `recover`.** `recover` runs under the guard outside `catch_unwind`; if it panics
(the state it reads is the one that just panicked), the lock is poisoned and the panic leaves `with_session`, so every
later take recovers again and may panic again. *Ruling:* run `recover` inside `catch_unwind` too; if it panics,
replace the session with a fresh one that keeps the search cache dir (add `Session::reset(&mut self)` that keeps
`search`'s cache dir, or give `with_session` a `fresh: impl Fn() -> Session`) and return `Recovered(NoFolder)`.
*Cost:* a stuck app where every command answers `recovered`.

**F7 (I) — Task 8: `quiet` only guards `App.refuse`.** Search (`search.svelte.ts:143,154`), Journal, AllPages,
Archive, Network, Boards and PageFlows call `env.notify({kind:'refused', message: errorMessage(e)})` directly. A
`stale` from one of them during the reload shows "request is for generation N…". The e2e "exactly one notice" holds
today only because `addNotice` de-duplicates equal messages (`lib/notices.ts:13-15`) and the `recovered` message
equals the event's text. *Ruling:* put the check where all of them meet: `App.svelte`'s `notify(n)` drops a
`refused` notice when `recovery.quietMessage(n.message)` (true for the three recovery texts while a recovery notice
is shown, and for messages starting `request is for generation` during the reload window); `quiet(code, cmd)` stays
for `refuse` and the host. Keep the run_blocking message equal to the notice text. *Cost:* one or two confusing
extra notices after an internal error.

**F8 (I) — Task 3: reading the Rust files from `app/src/lib/contract.test.ts`.** `node:fs` there fails `just lint`
(see table 2). *Ruling:* import the five files with `?raw` (`import commandRs from
'../../../crates/core/src/session/command.rs?raw'`), as `theme.test.ts` does; if Vitest refuses a path outside the
app root, move the file to `app/scripts/contract.test.mjs` and use `node:fs`. Parse robustly: end the Rust enum or
struct at the first line that is exactly `}`; take variants by `^    ([A-Z]\w*)` (skip `///` and `#[`); take
fields by `^    pub (\w+):`; filter the Rust event constants by the same value pattern as the TS side. Today's
formatting (rustfmt, multi-line `#[serde(` on `Notice`, doc comments inside `Command`) passes these.
*Cost:* a red `just lint` at task 3.

**F9 (verified, no change) — Task 7 lock handling.** With `catch_unwind(AssertUnwindSafe(|| f(&mut guard)))` the
guard is not dropped during unwinding, so a command panic never poisons. Only code that takes the lock outside
`with_session` can poison it: the Git engine (`crates/core/src/git/engine.rs:155-157`, its own `lock()`), and
`finish_close`. Recovery then happens once, by whichever `with_session` takes the poisoned lock first (the next
command, the watcher run, the index step, or the Git thread's own `with_session(.., |_| ())`); `clear_poison` makes
the others see `Ran`. Nothing is emitted under the guard: `recover` is core code with no emitter; the panic hook only
logs (logger mutex, not the session's); `after_recovery` runs after release and takes `notes_root`, `watcher`,
`git_tx` (never with the session lock), so no new lock order appears. Watcher runs queued with the old generation get
`stale` and are ignored (`lib.rs:433`). The index loop that recovers calls `index_in_background(new)` (swap succeeds,
its own `compare_exchange(old, 0)` then fails harmlessly) and must `return` (state it, M). The hook is read once
through a pure `test_panic(var)` with a test: confined as the constraints require.

**F10 (I) — Task 7: recovery during the close.** On `GitMsg::Exit`, a panic in `e.close` would make the Git thread
recover (reopen the whole folder) and restart the watcher and index while `finish_close` waits, then takes the lock
(`git.rs:60`), so the close waits for the reopen. *Ruling:* on the Exit path, after a caught panic send the reply at
once and do not call `with_session` or `after_recovery`. *Cost:* the "close is bounded" invariant (notes.md, shell).

**F11 (M) — Task 7: `recover` keeps the typing run.** `replace_folder` (`mod.rs:953-969`) does not clear `typing` or
`typed_step`; through `folder.open` that is harmless because `dispatch` took it, but `recover` is not a command. A
new block with the old id number typed into within 1 s would coalesce into a step that no longer exists, so its first
change cannot be undone. *Ruling:* `recover` sets `typing = None`, `typed_step = None` before reopening.

**F12 (M) — Task 5 details.** (a) `logging.test.mjs`: cut each file at the first line matching `^#\[cfg\(test\)\]`
followed by a `mod` line, not at the first `#[cfg(test)]` (`session/history.rs:105` is a method attribute). (b)
`rotates_before_the_cap`: test the cap with a raw `LogFile::write_line(&str)` (or state "messages of 30 bytes" and
compute the full line length). (c) Level is `{:<5}` (the regex has `WARN  `). (d) The panic hook must not take the
logger's lock if this thread already holds it: use `try_lock` in the hook path. (e) Close the file before renaming
it on rotation (Windows refuses to rename an open file without `FILE_SHARE_DELETE`). (f) "At the top of `setup`":
put `init` before `App` is built (so `today_override`'s warning is logged), after `config_dir` is known.

**F13 (M) — Task 5: token-only URLs.** `https://ghp_xxx@github.com/a.git` carries a secret without a colon; the rule
masks only `user:secret@`. *Ruling:* mask the whole user-info for `http`/`https` (`https://***@github.com/…`); keep
`ssh://git@host` as is; add the case to `redact_masks_url_credentials`.

**F14 (I) — Task 2: text against Q9 and Q7.** Item 71: "From next week Dependabot opens grouped pull requests" →
"From the start of next month …" (monthly, Q9); "if Q7 stays as recommended" → drop (decided). Test: every group in
every entry lists `update-types: ["minor", "patch"]` only (the `tauri*` and `@tauri-apps/*` groups included), and the
Tauri group comes first in its entry (Dependabot puts a dependency in the first group that matches).

**F15 (M) — Task 4.** Reuse `an_external_change_still_ends_the_typing_run` (`session.rs:752`) as the guard instead of
a second copy, or name the new one and delete nothing. The rationale for `page.today/show/open` = Edit should read
"they end the run today and keep doing so"; `journal.feed` and `page.renameReach` also make pages in memory and are
Query, which is fine (no undo step). A `stale` query may restore the run too (harmless).

**F16 (M) — Task 3 Interfaces.** Replace "Task 7 adds an event; Task 8 its TypeScript twin" with "Task 7 adds an
event and its twin". Filter both sides of `event_names_match` by `^[a-z]+:[a-z]+$`.

**F17 (M) — Task 1.** Replace the whole release version step (drop its `env:` block) by `- name: Check the version`
with `run: |` `node app/scripts/version.mjs check` and the `$LASTEXITCODE` line; the test compares the rest byte for
byte. Pushes to `dependabot/**` branches run CI twice (push and pull_request); and with `cancel-in-progress` on
`main`, frequent pushes cancel runs before rust-cache's post step saves. Both cost only time (public repo); accept.

**F18 (M) — Task 6.** `open_path(path.to_string_lossy().into_owned(), None::<&str>)`. The button's `title`: App
calls `logFolder()` once Settings opens and passes `logFolder: string | null` as a prop (SettingsView does not call
the API itself, like the other props). Add `'troubleshooting'` to `SettingsSection` only if something opens Settings
there; nothing needs to. In step 126 check `DONE ship` instead of the bare `ship`.

**F19 (M) — Task 7 small items.** `Session::recover(&mut self, clock)`: if `clock` is not used, drop it from
`recover` and `with_session` (an unused parameter is a warning, and `just lint` denies warnings). `recovery_notice`
returns `Some` for every variant; return `Notice`. `commands::startup_notices` (`lib.rs:683-686`) uses `poisoned()`
for the `startup_notices` mutex: replace with `unwrap_or_else(|e| e.into_inner())` when `poisoned()` goes. At
startup (`open_startup_folder`, the status run), a `Recovered` goes into `startup_notices` via `recovery_notice`; no
`after_recovery` (App is not managed yet). Load warnings of the reopen are dropped by `Recovery`; accept (log them).

**F20 (M, accepted by Q2) — Task 7: `Kept` keeps a session that panicked mid-command.** `mutate_tracked` restores the
document on `Err`, not on a panic; a half-applied edit can stay and later be saved by any save or the Git engine's
`retry_saves`. The Q2 notice asks for a restart. Put it in the follow-ups.

**F21 (M) — Task 8 step 127 preconditions.** "The journal matches its last `expectFile`": find the last journal
assertion before 125 and wait for it; if any page is still unsaved (a failed save left open), the core answers `Kept`
and the step fails with Q2's text, so a clear failure message helps. The RED in step 3 will show at `expectFile`
(typing goes `stale`), not as "the raw `recovered` error", since that message already equals Q1's text.

## 4. Order effects

- T5 before T7: the panic hook and `panic_line` exist when T7's tests panic; T7 relies on `log::error!`. Fine.
- T7 must add the `api.ts` twin itself (its step 4 runs `just test` with T3's contract test). Fine as T7's Files say.
- T8's e2e count (189) assumes T6's 187; T9 keeps 189. Consistent.
- F1/F2 must be fixed in T8 (host test), but the cause is T7's `recovered` code; give T8's implementer F1, F2, F3, F7.
- F3 needs T7's payload or `after_recovery` changed before T8 consumes it: give T7's implementer F3, F4(a), F6, F10, F11.
- T9 adds a crate not in `Cargo.lock`: `cargo` will fetch it; CI (T1) will build it; nothing earlier blocks it.
- T2's Dependabot `github-actions` PRs must update `ci.yml` and `release.yml` together or T1's byte-for-byte test
  fails; Dependabot does so in one PR per ecosystem directory, so fine.

## Tasks

Task 1: complete (commits b4053d4..6a3e0b1, review clean: spec compliant, quality approved; first CI run green).
Task 1: minor (deferred): a push to a branch with an open same-repo pull request runs CI twice (accepted, F17).
Task 1: minor (deferred): cancel-in-progress on main can cancel a run before the cache is saved (accepted, F17).
Task 1: minor (deferred): the step-equality test fails with a vague message if the release's version step is renamed.
Task 1: minor (deferred): only the file-level RED was recorded for the workflow test, no mutation per test.
