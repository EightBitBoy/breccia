# Breccia status

Last updated: 2026-11-11. Keep this file current: update it when a plan starts, after each task while a plan is in
progress, and when a plan finishes.

## Where the project stands

The app is complete in its first form, as the spec describes it (`docs/spec.md` §7): the journal feed with a date
picker; pages with `[[links]]`, `#tags`, aliases and linked references; a page tree with folders and drag and drop;
configurable task states, cycling with `Ctrl Enter`, `created::` and `done::` times; Kanban boards over every task
block, with priority by dragging, hidden columns and automatic archiving; the Archive and All pages views; search
(`Ctrl K`) with filters and typed dates; Git sync and a Git history view; ten themes plus System; zoom; back and
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
| 6 | Safety net (from the audit) | done 2026-11-10 | `docs/plans/2026-11-10-06-safety-net.md` | `docs/plans/2026-11-10-06-safety-net-followups.md` |
| 7 | Wash seams, Today and Yesterday, delete a block | done 2026-11-10 | `docs/plans/2026-11-10-07-wash-seams-slash-dates-delete-block.md` | `docs/plans/2026-11-10-07-wash-seams-slash-dates-delete-block-followups.md` |
| 8 | Theme wheel and four more themes | done 2026-11-11 | `docs/plans/2026-11-11-08-wheel-and-more-themes.md` | `docs/plans/2026-11-11-08-wheel-and-more-themes-followups.md` |
| 9 | Core housekeeping (from the audit) | done 2026-11-11 | `docs/plans/2026-11-11-09-core-housekeeping.md` | `docs/plans/2026-11-11-09-core-housekeeping-followups.md` |
| 10 | The changelog inside the app | done 2026-11-11 | `docs/plans/2026-11-11-10-changelog-in-app.md` | `docs/plans/2026-11-11-10-changelog-in-app-followups.md` |
| 11 | Out-of-range values in config.toml | done 2026-11-11 | `docs/plans/2026-11-11-11-config-out-of-range-values.md` | `docs/plans/2026-11-11-11-config-out-of-range-values-followups.md` |

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

Plan 6, the audit's "Safety net", is done (2026-11-10; owner decisions in the plan's "Product questions", rulings in
the ledger `.superpowers/sdd/2026-11-10-06-safety-net/progress.md`). Only one Breccia runs per user (a second start
shows the open window); after an internal error Breccia reloads the notes from disk (or keeps them, and says so, when
something is unsaved) instead of staying unusable until restart; a log file with "Open log folder" in Settings >
Troubleshooting; CI on every push and pull request; monthly Dependabot, `SECURITY.md`, `CONTRIBUTING.md`; a contract
test between the core's and the frontend's names; read-only commands no longer split undo while typing. It closed
audit findings B5, B6, B7, M9, M17, M41, M52 and M54. The owner checks review items 70 to 75; nobody has yet clicked
"Open log folder" or started Breccia twice for real.

Plan 7 is done (2026-11-10; owner decisions in the plan, ledger
`.superpowers/sdd/2026-11-10-07-wash-seams-slash-dates-delete-block/progress.md`): no faint lines between the rows of a
page color wash at zoom 110 % and 125 % (backlog #75, measured by e2e step 128); "Today" and "Yesterday" with a small
calendar in the slash menu (#77); `Ctrl Shift K` deletes the whole block with its sub-blocks (#78). Plans 6 and 7 are released as 1.4.0 (2026-11-10,
https://github.com/EightBitBoy/breccia/releases/tag/v1.4.0). The owner checks review items 70 to 78.

Plan 8 is done (2026-11-11, backlog #76): the mouse wheel over the theme button switches the theme; four new themes
(Vampire, Fjord, Ember, Parchment), ten plus System in all (Oxblood, an eleventh, came after), with the light ones first; Teal's text, selection and
highlights read better. The owner checks review items 80 to 86.

Plan 9, the audit's core housekeeping, is done (2026-11-11; owner decisions Q1 and Q2 in the plan's "Product
questions", rulings in the ledger `.superpowers/sdd/2026-11-11-09-core-housekeeping/progress.md`). It is a refactor of
the core and the shell with one visible fix: a page file saved as `.MD` while Breccia runs now gives the "only `.md`
is loaded" notice at once (Q2, review item 87). The session's command dispatch is split by area
(`crates/core/src/session/`, `mod.rs` 1,494 to 522 lines), the settings code by job (`crates/core/src/config/`), the
shell's main file by job (`app/src-tauri/src/lib.rs` 1,841 to 437 lines); one path classifier serves folder open and
the watcher; workspace bookkeeping goes through one `Changes` record; link filters in search are no longer paired by
position (backlog #31). Out-of-range values in a hand-edited `config.toml` were left to plan 11 (Q1, backlog #80). It
closed audit moves M1 to M8, M10 to M14, M16, M18, M22 to M31 and M33. The owner checks review item 87.

Plan 10 is done (2026-11-11, backlog #79; ledger `.superpowers/sdd/2026-11-11-10-changelog-in-app/progress.md`):
Settings > About has a "Show changelog" button that opens the bundled `CHANGELOG.md` offline as an overlay, newest release
first, rendered as a small Markdown subset (tables, emphasis and numbered lists show as plain text); a development build
adds a note. The running version is not marked (owner decisions Q1 and Q2). The owner checks review item 88; open
follow-ups are in the plan's follow-ups file (D1: a hand-edited changelog heading can fail the release-time tests).

Plan 11 is done (2026-11-11, backlog #80; ledger `.superpowers/sdd/2026-11-11-11-config-out-of-range-values/progress.md`):
a whole number in a hand-edited `breccia/config.toml` outside its range (Git minutes 0 to 1440, archive days 1 to 3650,
negative ones too) no longer loads silently. The key is read as its default and one notice per key names it; the file
is not changed (a later Settings save of that section writes the default over it). Owner decisions Q1 to Q5: the
planned wording, the notice list only (no line in Settings), one notice per key, only that key replaced, a Settings
save may write the default. A wrong type (`"5"`) still refuses the file. The owner checks review item 89; open
follow-ups are in the plan's follow-ups file.

A whole-application audit was made on 2026-11-10 at commit `4b91b0c` (`docs/audit/2026-11-10/`, start with its
`README.md`; the ledger `progress.md` says what was read). It changed no code: 7 defects, 21 structural themes with
55 refactor moves, and a proposed order of plans. Review items 65 to 67 and 69 are still open. The audit's plans 3 to 5 (its "Priorities") still wait for the owner.

Candidates for the next plan, to settle with the owner:

- the by-hand checks in `docs/review.md` (items 1 to 63; 25 to 41 are page colors, 46 to 50 vividness, 51 to 58 plan 4,
  61 to 63 the website);
- the follow-ups of plans 1 to 3 (`docs/plans/*-followups.md`);
- backlog items the owner picks (`docs/backlog.md`, 80 items; #71 to #75, #77, #78, #80 done, #64 done by plan 5, #31 by
  plan 9);
- automatic updates (backlog #52);
- the plans the audit proposes (`docs/audit/2026-11-10/README.md`, "Priorities").

## Test baseline

- `just test`: Vitest (1107 tests) and cargo tests (core: lib 50, integration 774 with 2 ignored; shell 77) pass
  (git-cliff 2.14.2 must be on PATH). `just lint` is clean.
- `just e2e`: 206 PASS lines (`expectFile` prints its own PASS lines besides a step's). e2e uses its own WebView2
  folder, so an open Breccia does not disturb it. The app window starts off-screen and unfocused
  (`BRECCIA_OFFSCREEN=1`, set by `smoke.mjs`). `BRECCIA_TRACE=1 just e2e` prints the timing summary; it reports
  12 unparsed lines, the `trace git state=…` lines, which predate plan 6.
- CI (`.github/workflows/ci.yml`) runs `just test` and `just lint` on every push; e2e runs only locally.

## Owner decisions in force

- Notes files are always saved with LF line endings; files Breccia did not change stay byte-identical (spec §2, §4).
- Commits carry no attribution lines; `.claude/settings.json` turns Claude Code's attribution off.
- The installer is not code signed (SmartScreen warns on the first run of each version).
- Deleting every selected block (`Delete`, `Backspace` or `Ctrl Shift K`) keeps one empty block with the caret in it
  (owner, 2026-11-11; review 79).
- Only the NSIS installer is built; an MSI only if someone asks (backlog #51).
- The Git history view stays read-only: clicking a commit does nothing.
- One Breccia per user; a second start brings the open window to the front, with no notice (plan 6, Q3).
- After an internal error with nothing unsaved, Breccia reloads the notes and shows the journal; with unsaved edits it
  does not reload and asks for a restart (plan 6, Q1 and Q2).
- The log keeps two files of 1 MB; it may hold paths, never note text, search text or credentials (plan 6, Q5, Q6).
- Security reports go through GitHub's private vulnerability reporting; pull requests are welcome after an agreed
  issue; Dependabot runs monthly (plan 6, Q7 to Q9).
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
