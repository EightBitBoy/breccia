# Breccia status

Last updated: 2026-11-09. Keep this file current: update it when a plan starts, after each task while a plan is in
progress, and when a plan finishes.

## Where the project stands

The app is complete in its first form, as the spec describes it (`docs/spec.md` §7): the journal feed with a date
picker; pages with `[[links]]`, `#tags`, aliases and linked references; a page tree with folders and drag and drop;
configurable task states, cycling with `Ctrl Enter`, `created::` and `done::` times; Kanban boards over every task
block, with priority by dragging, hidden columns and automatic archiving; the Archive and All pages views; search
(`Ctrl K`) with filters and typed dates; Git sync and a Git history view; six themes plus System; zoom; back and
forward between views; the `F1` shortcut overlay; the graph; a tray icon; a Windows installer built by the release
workflow. Since 1.1.0 (released 2026-11-07, plans 1 and 2): page colors, 25 named colors or a custom hue per page, shown as soft
washes behind journal blocks, set from a swatch on the page title or by right-clicking a link in the journal, with a
live preview in the picker. Since 1.2.0 (released 2026-11-09, plan 3): a Vividness slider makes a custom color softer or
stronger per page (`color:: hue 212 vivid 150`, format version 8), held back where text would be hard to read.

This repository starts from a prototype, without its history. Breccia 1.0.0, the first public release, was published
on 2026-11-06 (https://github.com/EightBitBoy/breccia/releases/tag/v1.0.0), and the repository is public since then.

## Plans

| # | Plan | State | Plan file | Follow-ups |
|---|---|---|---|---|
| 1 | Page colors | done 2026-11-07 | `docs/plans/2026-11-07-01-page-colors.md` | `docs/plans/2026-11-07-01-page-colors-followups.md` |
| 2 | Custom page colors | done 2026-11-07 | `docs/plans/2026-11-07-02-custom-page-colors.md` | `docs/plans/2026-11-07-02-custom-page-colors-followups.md` |
| 3 | Custom color vividness | done 2026-11-09 | `docs/plans/2026-11-09-03-custom-color-vividness.md` | `docs/plans/2026-11-09-03-custom-color-vividness-followups.md` |

Plan 2's design is `docs/superpowers/specs/2026-11-07-custom-page-colors-design.md` (ledger
`.superpowers/sdd/2026-11-07-02-custom-page-colors/progress.md`). Plan 1's design is `docs/superpowers/specs/2026-11-07-page-colors-design.md`; the owner's decisions are in the design
and in the plan's "Owner decisions" section. Progress ledger: `.superpowers/sdd/2026-11-07-01-page-colors/progress.md`.

## Next

Plan 3 (custom color vividness, backlog #72) is done (2026-11-09; owner decisions and pre-flight rulings in the plan,
ledger `.superpowers/sdd/2026-11-09-03-custom-color-vividness/progress.md`). It is released as 1.2.0 (2026-11-09,
https://github.com/EightBitBoy/breccia/releases/tag/v1.2.0); the owner still checks review items 46 to 50.

Released since 1.1.0: 1.1.1 and 1.2.0 (2026-11-09; 1.1.1: state chips and "Date…" in the slash menu, Journals position setting, no
"Now:" line in Git settings).

Candidates for the next plan, to settle with the owner:

- the by-hand checks in `docs/review.md` (items 1 to 50; 25 to 41 are page colors, 46 to 50 vividness);
- the follow-ups of plans 1 to 3 (`docs/plans/*-followups.md`);
- backlog items the owner picks (`docs/backlog.md`, 72 items, #72 done);
- automatic updates (backlog #52) and a GitHub Pages site (backlog #64), now possible because the repository is public.

## Test baseline

- `just test`: Vitest (913 tests) and cargo tests pass (git-cliff 2.14.2 must be on PATH). `just lint` is clean.
- `just e2e`: 176 PASS lines (`expectFile` prints its own PASS lines besides a step's). e2e uses its own WebView2
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
