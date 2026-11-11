# SDD ledger — plan: docs/plans/2026-11-11-10-changelog-in-app.md

Owner approved plan 2026-11-11 (Q1, Q2 defaults). Executing on main per CLAUDE.md.

## Pre-flight scan (2026-11-11, at 411805d)

| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1 -> T2 | T1: `virtual:changelog` (plugin in vite.config, `src/virtual-changelog.d.ts`); T2: `changelog.test.ts` imports it | OK. Vitest uses vite.config.ts (`vitest/config`), so the plugin resolves the id in tests. |
| T1 -> T3 | T1: module + d.ts; T3: `ChangelogDialog.svelte` imports it | OK for svelte-check (d.ts is under `src/`, tsconfig.app includes it; `moduleDetection: force` skips .d.ts, so the ambient `declare module` works). Bundle check belongs here, see Ruling 1. |
| T2 -> T3 | T2: `parseChangelog`, `changelogNote`, `Block`, `Inline`, `SettingsScreen.changelog/showChangelog/hideChangelog`; T3 consumes all | OK, names and shapes match. Heading `version` feeds `data-version`. |
| T2 -> T3 (App) | `close()` hides the flag; T3 adds `|| settings.changelog` to `dialogOpen()` | OK. Every exit from Settings goes through `settings.close()` (App.svelte 603, 667, 760); nothing sets `settings.shown` directly. F1 (`toggleHelp`), Ctrl K/N/, , nav keys, date picker all check `dialogOpen()`; zoom keys work over any dialog (existing behaviour). `onPointerDown` has no guard for the overlay; harmless (Settings: no editing, no card). |
| T2 real-file test -> release workflow | `release.yml` runs `just test` on the tagged commit, after hand edits at the pause | RISK: the "every word appears in plainText" check fails if a hand edit adds a link (`https`, `github`, `com` are not in plainText). See Ruling 2. |
| T3 -> Finish | step 134, one PASS line | OK: 202 + 1 = 203 (STATUS.md line 116 says 202). No `PASS 134` exists yet; 133 is the last step. |
| T1/T3 -> T4 | releasing.md sentence (R10), spec text | OK. `docs.test.mjs` checks links in releasing.md and CHANGELOG.md; the new sentence has no link; spec.md is not in its list. |
| `just release` -> `virtual:changelog` | `insertSection` puts the new section before the first `## `, writes LF; the plugin reads the file at build time | No break: release.yml builds from the tagged commit. A BOM added by an editor at the pause would defeat R4's first-line rule and T1's "starts with `# Changelog`" test, see Ruling 6. |
| Task 1 (self) | tests vs code; files | Step 4 "dist/assets/*.js contains `User-visible changes...`" cannot pass in Task 1: nothing in `src/` imports the module until Task 3 (only tests do). See Ruling 1. tsconfig.node.json uses `module: nodenext`: vite.config.ts must import `./changelog-plugin.ts` with the extension, and the test must narrow Vite 8's hook type (function or `{ handler }`) and cast the `this` stub, or `npm run check` (`tsc -p tsconfig.node.json`, part of `just lint`) fails. R1 confirmed: Vite's `searchForWorkspaceRoot` falls back to `app/` (no workspace file or root package.json). Dev URL `/@id/__x00__virtual:changelog` is right. |
| Task 2 (self) | rules vs tests | (a) `parseInline` test: adjacent text runs merge, so `' rel '` cannot be its own inline; with the URL ending at the first `)`, the tail is `' rel js)'`. See Ruling 4. (b) Rules do not say what an unindented non-bullet line right after an item does, nor whether a heading line ends a paragraph without a blank line. See Ruling 5. (c) Hostile sample: `_em_` is one `\w+` word, so it must show literally (R3 says so). Consistent. (d) Real-file versions regex `/^## \[([^\]]+)\]/gm` ignores the parser's "not followed by `(`" rule; same on today's file, differs only for a `## [x](url)` heading. Acceptable. |
| Task 3 (self) | e2e vs code; files | Step 64's `nav-journal` click is at smoke.mjs 2182, BEFORE `PASS 64` (2183), not after it as the plan says. See Ruling 3. DOM contract, props and CSS agree. `.dialog-title` exists (app.css 340). Tokens `--muted`, `--line`, `--edit` exist in every theme. F1 overlay class is `dialog search-dialog shortcuts-dialog`; the changelog uses `dialog changelog-dialog` (no search-dialog): fine, `.dialog` gives position and padding. Body `overflow-y: auto` in a flex column shrinks without `min-height: 0` (non-visible overflow). The colour test (`theme.test.ts`) scans `src/**/*.{css,svelte,ts}` except tests: comments must not hold `#` + 3/4/6/8 hex chars (e.g. "#100"). |
| Task 4 (self) | docs | Spec 7.12 has no About text yet; the plan adds it "after the Troubleshooting paragraph", but About comes before Troubleshooting in the UI and the spec says Settings "ends with" Troubleshooting. See Ruling 7. |
| Plan claims | paths, numbers | Correct: SettingsView About 173-188; App.svelte 603/667/760, 1390, 1685; app.css 334, 628; e2e 202; last review item 87 (88 free; reviewed.md has none higher); backlog #79; CHANGELOG 92 lines, no backticks/links/bold/comments today. Off: dialogOpen at App.svelte 1092 (not 1091), `getAppVersion()` at 1112 (not 1110), file is 3.3 KB (not 5 KB). Harmless. |

Ruling: 1. Task 1 Step 4 drops the `dist/assets/*.js` grep (nothing imports the module yet); keeps the `vite` dev fetch. Task 3 Step 3 does the bundle grep. Cost if wrong: none; otherwise Task 1 fails its own check or adds a stray import.
Ruling: 2. Task 2's real-file test takes words from the text with link targets removed (`](...)` dropped before `/\w+/g`), so a hand-edited link at the release pause cannot fail `just test` in the release workflow on a pushed tag. Cost if wrong: a release run fails after the tag is pushed.
Ruling: 3. Step 134 goes after step 64's last assertion; `PASS 64` prints before it, and the `nav-journal` click moves after `PASS 134`. Cost if wrong: none.
Ruling: 4. A link URL ends at the first `)` (no whitespace inside); the `parseInline` test expects exactly one link, no non-http href, and the merged trailing text `' rel js)'`. Cost if wrong: a stray `)` shows after a `javascript:` link text; cosmetic.
Ruling: 5. An unindented non-bullet, non-heading line directly after a list item joins that item (CommonMark lazy continuation); a heading or bullet line ends a paragraph or list without a blank line. Task 2 adds one test each. Cost if wrong: cosmetic.
Ruling: 6. `parseChangelog` strips a leading U+FEFF before the R4 first-line check; one test. Cost if wrong: an editor-added BOM shows "# Changelog" as a heading; cosmetic.
Ruling: 7. Task 4's spec sentence goes before the "Settings ends with a section Troubleshooting" paragraph, not after it. Cost if wrong: cosmetic.
Ruling: 8. Task 1's plugin test narrows the hook (`typeof h === 'function' ? h : h.handler`) and casts the `this` stub; vite.config.ts imports `./changelog-plugin.ts` with the extension and `fileURLToPath` from `node:url`. Cost if wrong: `just lint` (`tsc -p tsconfig.node.json`) fails.

Task 1: minor (deferred): test fixture loses a backslash, so escaping is untested
Task 1: minor (deferred): existsSync/readFileSync race, harmless
Task 1: complete (commits 411805d..8da2132, review clean)
Task 2: minor (deferred): literal U+FEFF in source/test, use \uFEFF
Task 2: minor (deferred): empty-text link, weak toContain word tests, comment before h1, untested +/* bullets and empty markers
Task 2: complete (commits c9e38e8..6976d2f, review clean)
Task 3: minor (deferred): changelog reparsed on each overlay open
Task 3: minor (deferred): e2e backdrop click relies on a free top-left corner
Task 3: minor (deferred): dev note not checked by hand (review item 88)
Task 3: complete (commits 25b9077..cd905ed, review clean)
Task 4: complete (commits 40ab29d..bc7ff80; docs only, covered by the final review)
