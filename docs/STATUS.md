# Breccia status

Last updated: 2026-11-10. Keep this file current: update it when a plan starts, after each task while a plan is in
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
| 4 | Follow-ups of plans 1 to 3 | done 2026-11-09 | `docs/plans/2026-11-09-04-followups-of-plans-1-3.md` | `docs/plans/2026-11-09-04-followups-of-plans-1-3-followups.md` |
| 5 | GitHub Pages site | done 2026-11-09 | `docs/plans/2026-11-09-05-github-pages-site.md` | `docs/plans/2026-11-09-05-github-pages-site-followups.md` |

Plan 2's design is `docs/superpowers/specs/2026-11-07-custom-page-colors-design.md` (ledger
`.superpowers/sdd/2026-11-07-02-custom-page-colors/progress.md`). Plan 1's design is `docs/superpowers/specs/2026-11-07-page-colors-design.md`; the owner's decisions are in the design
and in the plan's "Owner decisions" section. Progress ledger: `.superpowers/sdd/2026-11-07-01-page-colors/progress.md`.

## Next

Plan 3 (custom color vividness, backlog #72) is done (2026-11-09; owner decisions and pre-flight rulings in the plan,
ledger `.superpowers/sdd/2026-11-09-03-custom-color-vividness/progress.md`). It is released as 1.2.0 (2026-11-09,
https://github.com/EightBitBoy/breccia/releases/tag/v1.2.0); the owner still checks review items 46 to 50.

Released since 1.1.0: 1.1.1, 1.2.0 and 1.3.0 (2026-11-09; 1.1.1: state chips and "Date…" in the slash menu, Journals position setting, no
"Now:" line in Git settings).

Plan 4 (follow-ups of plans 1 to 3) is done (2026-11-09; owner decisions Q1 to Q8 and pre-flight rulings in the plan,
ledger `.superpowers/sdd/2026-11-09-04-followups-of-plans-1-3/progress.md`): the color picker's preview, slider thumbs
and screen reader text, the focus and picker position for the link menu, and the jump highlight and selection on a
colored row. The owner checks review items 51 to 58.

Backlog #73 (board card button background) is done; the owner checks review item 59.
Backlog #74 (a theme button in the status bar, left of "?") is done; the owner checks review item 60.
Plan 4 and backlog #73 and #74 are released as 1.3.0 (2026-11-09,
https://github.com/EightBitBoy/breccia/releases/tag/v1.3.0). The changelog line for a bug of plan 4 itself (commit
1a3bc80) was left out of the 1.3.0 notes by hand at the release pause.
Plan 5 (GitHub Pages site, backlog #64) is done (2026-11-09; plan file `docs/plans/2026-11-09-05-github-pages-site.md`,
ledger `.superpowers/sdd/2026-11-09-05-github-pages-site/progress.md`). The site is published at
https://eightbitboy.github.io/breccia/ (GitHub Pages on, with GitHub Actions as its source, turned on on 2026-11-09 with
the owner's approval). The site lives in `site/` (plain HTML, CSS and JS, no build
step) and is deployed by `.github/workflows/pages.yml` on each push to `main` that touches `site/`, `docs/images/` or the
app icons. It is not part of the app's release, and its commits are `chore`, `test`, `ci` or `docs`. Recipes:
`just site` (a local preview at http://127.0.0.1:4173/breccia/), `just site-check` (links, alt texts, sizes, no external
requests) and `just site-shots` (the views at three widths, dark and light, into `target/site-shots/`). The owner checks
review items 61 to 63.

Next is plan 6, the audit's "Safety net" (owner's decision of 2026-11-10): one running instance, recovery after an
internal error, a log file with "Open log folder" in Settings (review item 68: yes), CI on every push, a contract
test between the core's and the frontend's types, Dependabot with `SECURITY.md` and `CONTRIBUTING.md`, and commands
that say whether they change anything (audit keys B6, B7, M9, M52, M41, M54, M17 with B5). Then plan 7, backlog #75
(faint lines between rows of a color wash at zoom 110 % and 125 %) together with backlog #77 ("Yesterday" and
"Today" in the slash menu), then backlog #76 (the scroll wheel over the
theme button, and more themes). Each is a normal plan, with the owner's review.

A whole-application audit was made on 2026-11-10 at commit `4b91b0c` (`docs/audit/2026-11-10/`, start with its
`README.md`; the ledger `progress.md` says what was read). It changed no code: 7 defects, 21 structural themes with
55 refactor moves, and a proposed order of plans. Review items 65 to 67 and 69 are still open; none of them holds
up plan 6.

Candidates for the next plan, to settle with the owner:

- the by-hand checks in `docs/review.md` (items 1 to 63; 25 to 41 are page colors, 46 to 50 vividness, 51 to 58 plan 4,
  61 to 63 the website);
- the follow-ups of plans 1 to 3 (`docs/plans/*-followups.md`);
- backlog items the owner picks (`docs/backlog.md`, 77 items; #71, #72, #73, #74 done, #64 done by plan 5);
- automatic updates (backlog #52);
- the plans the audit proposes (`docs/audit/2026-11-10/README.md`, "Priorities").

## Test baseline

- `just test`: Vitest (978 tests) and cargo tests pass (git-cliff 2.14.2 must be on PATH). `just lint` is clean.
- `just e2e`: 186 PASS lines (`expectFile` prints its own PASS lines besides a step's). e2e uses its own WebView2
  folder, so an open Breccia does not disturb it. The app window starts off-screen and unfocused
  (`BRECCIA_OFFSCREEN=1`, set by `smoke.mjs`).

## Owner decisions in force

- Notes files are always saved with LF line endings; files Breccia did not change stay byte-identical (spec §2, §4).
- Commits carry no attribution lines; `.claude/settings.json` turns Claude Code's attribution off.
- The installer is not code signed (SmartScreen warns on the first run of each version).
- Only the NSIS installer is built; an MSI only if someone asks (backlog #51).
- The Git history view stays read-only: clicking a commit does nothing.
- Deleting a page removes its file for good; it does not go to the recycle bin (review item 64, 2026-11-10).

## Setting up a new machine or account

1. Clone `git@github.com:EightBitBoy/breccia.git`.
2. Set the repo-local git identity (see `CLAUDE.md`).
3. Install Rust, Node, `just` and the Tauri 2 prerequisites (WebView2 on Windows). Run `npm install` in `app/`.
   Install git-cliff 2.14.2 too (`winget install git-cliff`, or `cargo install git-cliff --version 2.14.2 --locked`):
   `just test` runs the real git-cliff in the release script tests, and `just release` needs it.
4. Install the `superpowers` Claude Code plugin from the `claude-plugins-official` marketplace. The workflow uses its
   writing-plans and subagent-driven-development skills.
5. Start Claude Code in the repo and say: "Read CLAUDE.md and docs/STATUS.md, then continue."
