# Breccia status

Last updated: 2026-11-07. Keep this file current: update it when a plan starts, after each task while a plan is in
progress, and when a plan finishes.

## Where the project stands

The app is complete in its first form, as the spec describes it (`docs/spec.md` §7): the journal feed with a date
picker; pages with `[[links]]`, `#tags`, aliases and linked references; a page tree with folders and drag and drop;
configurable task states, cycling with `Ctrl Enter`, `created::` and `done::` times; Kanban boards over every task
block, with priority by dragging, hidden columns and automatic archiving; the Archive and All pages views; search
(`Ctrl K`) with filters and typed dates; Git sync and a Git history view; six themes plus System; zoom; back and
forward between views; the `F1` shortcut overlay; the graph; a tray icon; a Windows installer built by the release
workflow. Since plan 1 (not released yet): page colors, 25 named colors per page shown as soft washes behind journal
blocks, set from a swatch on the page title or by right-clicking a link in the journal.

This repository starts from a prototype, without its history. Breccia 1.0.0, the first public release, was published
on 2026-11-06 (https://github.com/EightBitBoy/breccia/releases/tag/v1.0.0), and the repository is public since then.

## Plans

| # | Plan | State | Plan file | Follow-ups |
|---|---|---|---|---|
| 1 | Page colors | done 2026-11-07 | `docs/plans/2026-11-07-01-page-colors.md` | `docs/plans/2026-11-07-01-page-colors-followups.md` |
| 2 | Custom page colors | approved 2026-11-07, in progress | `docs/plans/2026-11-07-02-custom-page-colors.md` | |

Plan 2's design is `docs/superpowers/specs/2026-11-07-custom-page-colors-design.md` (ledger
`.superpowers/sdd/2026-11-07-02-custom-page-colors/progress.md`). Plan 1's design is `docs/superpowers/specs/2026-11-07-page-colors-design.md`; the owner's decisions are in the design
and in the plan's "Owner decisions" section. Progress ledger: `.superpowers/sdd/2026-11-07-01-page-colors/progress.md`.

## Next

Plan 1 (page colors) is done and on `main`, not yet released. The next plan is not chosen yet; to settle with the
owner. Candidates:

- the by-hand checks in `docs/review.md` (items 1 to 33; 25 to 33 are page colors);
- plan 1's follow-ups (`docs/plans/2026-11-07-01-page-colors-followups.md`);
- a release with page colors (`just release`, by the owner);
- backlog items the owner picks (`docs/backlog.md`, 71 items);
- automatic updates (backlog #52) and a GitHub Pages site (backlog #64), now possible because the repository is public.

## Test baseline

- `just test`: Vitest (866 tests) and cargo tests pass (git-cliff 2.14.2 must be on PATH). `just lint` is clean.
- `just e2e`: 164 PASS lines (`expectFile` prints its own PASS lines besides a step's). e2e uses its own WebView2
  folder, so an open Breccia does not disturb it. The app window starts off-screen and unfocused
  (`BRECCIA_OFFSCREEN=1`, set by `smoke.mjs`).

## Owner decisions in force

- Notes files are always saved with LF line endings; files Breccia did not change stay byte-identical (spec §2, §4).
- Commits carry no attribution lines; `.claude/settings.json` turns Claude Code's attribution off.
- The installer is not code signed (SmartScreen warns on the first run of each version).
- Only the NSIS installer is built; an MSI only if someone asks (backlog #51).
- The Git history view stays read-only: clicking a commit does nothing.

## Setting up a new machine or account

1. Clone `git@github.com:EightBitBoy/breccia.git`.
2. Set the repo-local git identity (see `CLAUDE.md`).
3. Install Rust, Node, `just` and the Tauri 2 prerequisites (WebView2 on Windows). Run `npm install` in `app/`.
   Install git-cliff 2.14.2 too (`winget install git-cliff`, or `cargo install git-cliff --version 2.14.2 --locked`):
   `just test` runs the real git-cliff in the release script tests, and `just release` needs it.
4. Install the `superpowers` Claude Code plugin from the `claude-plugins-official` marketplace. The workflow uses its
   writing-plans and subagent-driven-development skills.
5. Start Claude Code in the repo and say: "Read CLAUDE.md and docs/STATUS.md, then continue."
