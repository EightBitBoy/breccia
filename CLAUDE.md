# Breccia: notes for Claude

Breccia is a local-first outliner desktop app: Markdown files in a notes folder, with a journal, pages, links and
boards. The remote is `git@github.com:EightBitBoy/breccia.git`. The repository will become public with the first
release, 1.0.0.

Read `docs/STATUS.md` first. It says what the app does, what is in progress, and what to do next.

## Where things are

- Spec (the binding authority): `docs/spec.md`.
- Plans, one per piece of work: `docs/plans/YYYY-MM-DD-NN-<name>.md`, numbered from 1. A finished plan gets a
  `-followups.md` file with the work it deferred; open follow-ups are taken by later plans or moved to the backlog.
- Progress logs of plan runs: `.superpowers/sdd/<plan>/progress.md` (see "Portability" below).
- Release pipeline: `.github/workflows/release.yml` (builds the installer and publishes a GitHub release for `vX.Y.Z`
  tags) and `docs/releasing.md` (how to cut a release).
- README for people outside the project: `README.md` (screenshots in `docs/images/`, made by `just screenshots`).
- Notes format reference: `docs/format.md`, checked by `crates/core/tests/it/format_doc.rs`. Update it with any format
  change. `docs/compatibility.md` compares the format with Obsidian and Logseq, and `docs/demo/` is a sample notes
  folder.
- Changelog: `CHANGELOG.md`, written by `just release` from `cliff.toml` (git-cliff); the release workflow uses the
  tagged section as the release text.
- Open work and ideas not yet in a plan: `docs/backlog.md`. Items are numbered, and a number is never reused.
- Owner review list: `docs/review.md`. Add a numbered item for every change a user can see and every open question
  for the owner, in the same commit or right after it lands. Numbers are never reused.
- Reviewed items: `docs/reviewed.md` (made when the first item is ticked). When the owner ticks items in `review.md`,
  move them there with their notes, under the same headings, keeping their numbers.
- Code: Cargo workspace with `crates/core` (`breccia-core`: files, outline, edits, links, boards) and `app/src-tauri`
  (`breccia`, the Tauri 2 shell). The frontend is in `app/`: Svelte 5, TypeScript, Vite, Vitest and CodeMirror 6.
  Editor logic is in `app/src/editor/`, and logic with unit tests is in `app/src/lib/`.

## Commands

- `just test`: frontend build, Vitest, then `cargo test --workspace`; it prints a hint when `target/` is over 15 GB.
  The core's integration tests are one program (`crates/core/tests/it/main.rs`, each file a module): run one file with
  `cargo test -p breccia-core <file>::`.
- `just clean-stale [--dry-run]`: deletes build outputs in `target/` older than 7 days, keeping the newest of each
  (`app/scripts/clean-stale.mjs`).
- `just lint`: `cargo fmt --check`, clippy with `-D warnings`, and `svelte-check`. Run `cargo fmt --all` if it fails
  on formatting.
- `just e2e`: builds the release exe and drives it over the WebView2 DevTools port (`app/e2e/smoke.mjs`). It is
  Windows-only. Every step prints a `PASS` line, and the expected count is in `docs/STATUS.md`.
- `just graph-scale [--onscreen]`: measures the graph at 5,000 pages; the results go to `target/graph-scale/`.
- `just bundle` builds the Windows installer (NSIS) into `target/release/bundle/nsis/`. `just version X.Y.Z` sets the
  app version everywhere, and `just check-version` checks that all version files agree.
- `just release [X.Y.Z] [--yes]`: cuts a release (`app/scripts/release.mjs`). It checks (on `main`, clean, in sync
  with origin, version newer than the latest tag, tag free, git-cliff present), bumps the version, writes the
  `CHANGELOG.md` section, pauses for edits (Enter = commit `chore(release): X.Y.Z`, tag `vX.Y.Z`,
  `git push --atomic`; `n` = undo), then prints the Actions URL. With no tag yet the version must be given; the first
  release is `just release 1.0.0`. Never run it against the real origin without the owner asking; the owner cuts
  releases (`docs/releasing.md`).
- `just changelog`: previews the next `CHANGELOG.md` section and writes nothing.
- `just screenshots`: retakes the README images from `docs/demo/`.
- `just dev` runs the app in dev mode. `just dev-debug` does the same with DevTools on port 9222.
- The justfile uses PowerShell. Use a POSIX shell only for one-off commands.
- Environment variables:
  - `BRECCIA_CONFIG_DIR` replaces the app config dir. e2e always uses a temp dir, so it never touches the user's real
    settings.
  - `BRECCIA_TRACE=1` makes the shell log command and watcher timings.
  - `BRECCIA_OFFSCREEN=1` starts the main window unfocused and off-screen. e2e sets it, so a run never takes the
    keyboard or comes to the front.
- Toolchain known to work: Windows 11, Rust 1.90, Node 24, just 1.58, git-cliff 2.14.2 (`just release` and
  `just test` need it).

## Git

- Commit directly on `main` and push after each commit without asking. Never force-push.
- Each clone needs the owner's identity: `git config user.name "Stefan Härtel"` and
  `git config user.email haertel.dev@gmail.com`. Set it repo-local, not global.
- Write conventional commit subjects, e.g. `feat(core): …`, `fix(app): …`, `docs: …`. Add no `Co-Authored-By` or
  other attribution lines to commits or pull requests (`.claude/settings.json` turns Claude Code's attribution off).
- `feat` and `fix` subjects describe the effect a user sees; they become `CHANGELOG.md` lines (git-cliff,
  `cliff.toml`). Internal work uses `chore`, `refactor`, `test`, `docs` or `ci`, which the changelog skips.
- Write every `feat` and `fix` subject so it can go into the published changelog unedited:
  - plain words a user of the app understands: what they can now do, or what no longer goes wrong;
  - no code names, file paths, function or variable names, review or finding IDs, plan or task numbers;
  - one change per commit, one line, at most about 90 characters, no trailing period;
  - name the area first when it helps (`Git sync: …`, `Search: …`, `Graph: …`);
  - changes only developers notice (release scripts, the workflow, tests, docs) are `chore`, `ci`, `test` or `docs`,
    never `fix`.
  - Good: `fix(core): Git sync: a refused pull is retried once before it turns red`. Not:
    `fix(core): retry a refused pull once (engine.rs)`, or `fix: all-or-nothing version bump` for a release-script
    change.
- All text files use LF line endings (`.gitattributes`). Breccia itself saves every notes file with LF (spec §4).

## How the work is done

Work comes in plans. Each plan goes through the same steps:

1. **Write the plan.** Before writing, read `docs/STATUS.md`, `docs/backlog.md`, the open follow-ups of earlier plans,
   the spec, and the code. Use the `superpowers:writing-plans` skill, and have an opus subagent write it.
2. **The owner reviews it.** The owner is the product owner. Present the tasks and every product decision in plain
   words, not code, and wait for approval. Ask open questions interactively (one question with options at a time, not
   a list in the chat). Change the plan where the owner decides differently.
3. **Execute it** with `superpowers:subagent-driven-development`, on `main`. That means a pre-flight scan, then one
   implementer and one reviewer per task, then a whole-plan final review on opus and one fix wave.
4. **Finish it.**
   - Run `just test`, `just lint` and `just e2e` yourself.
   - Write the plan's follow-ups doc.
   - Update `docs/STATUS.md`.
   - Report to the owner: what was built, the verification results, every ruling you made with what it costs if
     wrong, and the open items.

Small changes the owner asks for directly (a fix, a tweak) need no plan: a failing test first, the change, the
checks, a `docs/review.md` item, a commit.

Delegate to subagents to save tokens, and always name the model:
- opus: plan writing, the pre-flight scan, UI-integration tasks and their reviews, the final review and its fix wave;
- sonnet: most implementation tasks, task reviews and re-reviews;
- haiku: purely mechanical work.

Subagents write their reports to files and return short summaries.

## Portability (any session, any account)

- Everything needed to continue must be in this repo. Nothing may depend on one machine's Claude memory or on one
  session's context.
- The subagent-driven-development workspace is `.superpowers/sdd/<plan>/`. The committed `.superpowers/sdd/.gitignore`
  ignores everything there except each plan's `progress.md` (the ledger) and its `plan-path` marker. Briefs, reports
  and review diffs stay local.
  - Commit and push the ledger after each task completes, and at the end of the plan.
  - When a plan finishes, delete the workspace's scratch files but keep `progress.md` and `plan-path`. Do not
    `rm -rf` the whole folder.
  - A new session resumes a plan from its ledger plus `git log`.
- When the owner makes or changes a product decision, record it in the plan file (or in `docs/STATUS.md` if no plan
  is open), not only in chat.

## Lessons that keep coming back

- Spec anti-goal §2: never silently drop, reorder or reformat text the user wrote. This includes
  `breccia/config.toml`, which must keep its comments and unknown keys.
- Tauri event names are `noun:verb` on the wire (`page:changed`, not the spec's `page.changed`). Command names keep
  their dots (`block.setState`).
- Event payloads keep struct field order (serde_json `preserve_order`), because the frontend's echo check compares
  `JSON.stringify` output.
- Unit tests under Node miss WebView-only failures, for example calling `setTimeout` as a method. Run `just e2e`
  whenever app wiring changes.
- `App.svelte` has no unit-test harness. Put logic that needs tests in `app/src/lib/`.
- Every test must be able to fail. Capture a failing (RED) run before implementing.
- e2e steps must assert the bytes on disk where a file changes. Fix flaky steps by waiting for the right state, never
  by adding sleeps.
- No colour literals or `color-mix` outside `app/src/styles/tokens.css` (a test checks it).
