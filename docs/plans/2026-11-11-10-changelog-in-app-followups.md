# Plan 10 (The changelog inside the app): follow-ups

Work the plan deferred. Open items are taken by later plans or moved to `docs/backlog.md`. Found by the per-task
reviews and the final whole-plan review (2026-11-11). The plan closed backlog #79. The final review's M1 to M5 were
fixed in the fix wave.

## Owner decisions and checks

1. **Q1, label and place:** a button "Show changelog" below the About list (as the owner chose).
2. **Q2, the running version:** not marked in the overlay (as the owner chose).
3. **Review item 88** asks the owner to check the overlay by hand. The development note ("development build") was only
   unit-tested and checked in e2e for its absence in the release exe; look at it once in `just dev`.

## Release risk

4. **D1. Parser and test regexes differ on hand edits.** The real-file tests (`changelogText.test.ts`, e2e step 134) use
   `/^## \[([^\]]+)\]/gm` and `/^\s*[-*+] /gm`, while the parser treats `## [x](url)` as not a version heading and
   accepts a tab after a bullet marker. A hand edit of `CHANGELOG.md` at the `just release` pause that uses either form
   passes the parser but can fail `just test` in `release.yml` after the tag is pushed. Unlikely with git-cliff output.
   Either note it in `docs/releasing.md` or align the regexes.

## Parser

5. **D2. A comment line before `# Changelog` makes the title show** (the first-line flag is set before the comment
   check). Cosmetic.
6. **D3. `[](https://...)` renders an empty, invisible anchor** and its URL is not shown. Could fall back to the URL as
   text.
7. **Supported Markdown is a subset.** Tables, emphasis (`*x*`, `_x_`) and numbered lists show as literal text. Fine for
   git-cliff output; widen the parser if the changelog ever uses them.
8. **Non-http link targets** (`javascript:`, relative, `ftp:`) show their text only; the URL is dropped by design.

## Tests

9. **D4. Weak tests:** the hostile-sample test uses `toContain` per word (short words match anywhere); `+` and `*`
   bullets and an empty `- ` marker are untested.
10. **D6. The e2e backdrop click at (4, 4)** assumes that corner is not covered by the dialog. True at every window size
    the dialog's `top: 8%` allows.
11. **`existsSync` then `readFileSync` in the Vite plugin** is a harmless race.

## Other

12. **D5. `parseChangelog` runs on every open** (3 KB, negligible). Cache only if the file grows a lot.
13. **R5, local release builds** show the changelog of the committed `CHANGELOG.md`, which has no section for the
    version being built until `just release` writes it.
14. **No close button** in the overlay: `Esc` and a click outside close it.
