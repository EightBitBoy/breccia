# The changelog inside the app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Show changelog" button in Settings > About opens an overlay with Breccia's `CHANGELOG.md`, built into
the app and rendered as Markdown; `Esc` closes it and leaves Settings as it was (backlog #79).

**Architecture:** A small Vite plugin serves the repository's `CHANGELOG.md` as the module `virtual:changelog` (a
string), so the app bundle, `vite dev` and Vitest all read the same file at build time and nothing is fetched at run
time. A pure parser in `app/src/lib/changelog.ts` turns the text into a typed list of blocks (headings, paragraphs,
lists; inline code, bold, links); the overlay renders that tree with plain Svelte text nodes, never `{@html}`. Whether
the overlay is open is a flag on the existing `SettingsScreen` state, so `App.svelte` treats it as a dialog (global
shortcuts stay quiet) and it can never outlive Settings.

**Tech Stack:** Svelte 5 + TypeScript, bits-ui `Dialog` (as the F1 overlay), Vite 8 plugin API, Vitest, Playwright
over WebView2 (e2e). No Rust change. No new dependency.

**Spec:** `docs/backlog.md` #79; `docs/spec.md` §7.12 (Settings); `docs/releasing.md` (how `CHANGELOG.md` is
written); this plan's "Owner decisions" and "Rulings".

## Owner decisions (2026-11-11)

1. **Where:** an overlay over Settings, opened from the About section. `Esc` closes it and returns to Settings.
2. **Where it opens:** at the top, newest first, as the file is ordered. It does not scroll to the running version.
   A dev build shows the same text with a note that the running version is a dev build.
3. **The text:** `CHANGELOG.md`, built into the app (works offline, no network request), rendered as Markdown.
4. **Button (Q1, answered 2026-11-11):** "Show changelog", below the About list.
5. **Running version (Q2, answered 2026-11-11):** not marked; the overlay shows the file as written.
6. **Plan approved by the owner, 2026-11-11.**

## Rulings (made in this plan; each with what it costs if wrong)

- **R1. Bundling: a virtual module, not `?raw`.** `import text from '../../../CHANGELOG.md?raw'` would work in
  `vite build` and Vitest, but `vite dev` (`just dev`) refuses files outside `app/` (Vite's `server.fs.allow` defaults
  to the package root, `app/`), so the dev app would fail to load. A plugin
  (`app/changelog-plugin.ts`, `virtual:changelog`) reads the file with `fs` instead; virtual modules are not subject to
  `fs.allow`, and `addWatchFile` makes `just dev` reload when the file changes. Cost if wrong: one small plugin file
  to maintain; swapping to `?raw` plus an `fs.allow` entry later is a two-line change.
- **R2. A missing `CHANGELOG.md` fails the build** with "CHANGELOG.md not found at <path>", rather than shipping an
  empty overlay. Cost if wrong: a build from a tree without the file (none exists today) stops; easy to relax.
- **R3. Rendering: our own parser for the subset the file uses, no Markdown library, no `{@html}`.** The file is
  written by git-cliff (`cliff.toml`: `#`, `##`, `###` headings, `- ` bullets, plain paragraphs) and hand-edited at
  the release pause. The parser supports headings, bullet lists (`-`, `*`, `+`; deeper indentation is flattened into
  the same list, continuation lines join their item), paragraphs, and inline `` `code` ``, `**bold**` and
  `[text](url)`. A link opens in the system browser only for `http://` and `https://` targets (class `ext`, which the
  app's anchor handler already routes, `lib/links.ts`); any other target shows its text only. A line that is wholly
  an HTML comment (`<!-- … -->`) is skipped; any other HTML, `_`, single `*`, tables, numbered lists show as literal
  text. Everything is rendered as text nodes, so no character in the file can inject markup. Cost if wrong: a future
  hand edit with richer Markdown (a table, emphasis, nested lists) shows plainer than on GitHub, never broken and never
  missing text; adding a construct is a parser case plus a test.
- **R4. The file's own `# Changelog` line is not shown** (only when it is the first non-blank line): the overlay's
  title already says "Changelog". The intro sentence below it is shown. Version headings `## [1.5.0] - 2026-11-11`
  show without the brackets, "1.5.0 - 2026-11-11", and carry `data-version="1.5.0"`. Cost if wrong: cosmetic.
- **R5. "Dev build" means the Vite dev mode (`just dev`, `import.meta.env.DEV`).** The note reads "This is a
  development build of Breccia 1.5.0. Changes made since that release are not listed yet." (or "…of Breccia. Changes
  made since the last release…" while the version is unknown). A release exe built locally from unreleased commits
  (`just bundle`, `just e2e`) shows no note: it is a release build of the same version number. Cost if wrong: the
  owner may want the note also in such local release builds; that needs a build-time flag (e.g. "is this commit
  tagged") and is a follow-up, not a redesign.
- **R6. The state lives on `SettingsScreen`** (`changelog` flag, `showChangelog()`, `hideChangelog()`; `close()` also
  hides it), and `App.svelte`'s `dialogOpen()` includes it. So `F1`, `Ctrl K`, `Ctrl ,` and the other global keys do
  nothing while it is open (as over every other dialog), and anything that leaves Settings (a folder switch, the
  recovery path, `leaveMainView`) takes the overlay with it. Cost if wrong: none known.
- **R7. Focus.** On open, focus goes to the overlay's scrolling body (`tabindex="-1"`, with `preventScroll`), not to
  the first link, so the overlay opens at the top and `PageDown`, `↓`, `Home`, `End` scroll it. On close (`Esc` or a
  click outside, bits-ui's defaults), focus returns to the "Show changelog" button. No close button, as the F1
  overlay has none. Cost if wrong: a mouse user must click outside or press `Esc`; adding a button is one line.
- **R8. The button:** "Show changelog", in the About section right after the `<dl>` (in a `settings-folder-actions`
  row, as "Open log folder" is), `data-testid="show-changelog"`. Cost if wrong: label and place are one line each
  (see open question Q1).
- **R9. No F1 row.** `Esc` closing an overlay is not a new shortcut, and the F1 list has no row for closing the other
  overlays either.
- **R10. `just release` keeps working unchanged.** It rewrites `CHANGELOG.md` before its commit and tag; the release
  workflow builds the installer from the tagged commit, so the installer's overlay shows the new section, including
  edits made at the pause. No script change. `docs/releasing.md` gets one sentence saying so.
- **R11. Size.** The file is 92 lines (5 KB) and grows by about 15 lines a release; it is imported statically with
  the overlay's component, no lazy load and no virtual list. Revisit past about 200 KB.
- **R12. Styling** uses tokens only (`var(--muted)`, `var(--line)`, `var(--edit)` for code, as existing rules do);
  no colour literal or `color-mix` outside `tokens.css` (the existing test checks it).

## Open questions for the owner (the plan proceeds with the stated default)

- **Q1. Label and place of the button:** "Show changelog" below the About list (default), or "What's new" next to the
  version number?
- **Q2. Mark the running version?** The overlay could add "(this version)" after the heading of the running version,
  without scrolling to it. Default: no (not asked for); a follow-up if wanted.

## Code against the backlog (checked 2026-11-11 at `45396ed`)

- **About section:** `app/src/components/SettingsView.svelte:173`–`188`: icon, then a `<dl>` with Application,
  Version (`appVersion`, from `getAppVersion()` in `App.svelte:1110`, the Cargo version), Developer, License, Source
  code. e2e step 64 (`app/e2e/smoke.mjs:2165`–`2185`) checks it with Settings open, then clicks `nav-journal`.
- **The F1 overlay** (`ShortcutsDialog.svelte`) is a bits-ui `Dialog.Root open` mounted under `{#if helpShown}` in
  `App.svelte:1685`; Esc and a click outside call `onOpenChange(false)`; `onCloseAutoFocus` restores the element that
  had focus when it opened. CSS: `.overlay`, `.dialog`, `.dialog.shortcuts-dialog` (`app/src/styles/app.css:334`,
  `:628`).
- **Global keys** check `dialogOpen()` (`App.svelte:1091`); `toggleHelp` (F1) opens nothing while it is true.
- **Settings state:** `SettingsScreen` in `app/src/lib/settings.svelte.ts` (tests in `settings.test.ts`);
  `settings.close()` is called from `App.svelte:603`, `:667`, `:760`.
- **Anchor clicks:** one document-level handler (`onAnchorClick`, `App.svelte:1390`) routes `a.ext` to the system
  browser via `linkClick` (`lib/links.ts`); it also covers bits-ui portals.
- **No Markdown renderer exists** in the frontend (block text is rendered by the core); `?raw` imports are used only
  by tests of files inside the repo.
- **`CHANGELOG.md`:** header `# Changelog` plus one sentence (from `cliff.toml`), then `## [X.Y.Z] - YYYY-MM-DD`
  sections, newest first, with `### Features` / `### Fixes` and `- ` bullets; 1.0.0 has a paragraph. Today no
  backticks, links or bold. `just release` (`app/scripts/release.mjs`, `insertSection`) puts the new section before
  the first `## `.
- **e2e:** 202 PASS lines today (`docs/STATUS.md`). Steps 132 and 133 are taken; the new step is **134**.
- **Review list:** items up to 87 are used; the new item is **88**.

## Global Constraints

- No colour literal or `color-mix` outside `app/src/styles/tokens.css`.
- Every test fails first (RED) and the RED run is in the task report. A test pinning what already holds is shown to
  fail by a temporary mutation, noted and reverted.
- Decisions are pure functions in `app/src/lib/` with tests; components and `App.svelte` only carry them out.
- No network request and no runtime file read for the changelog: the text is in the JS bundle.
- No `{@html}` and no `innerHTML` for changelog text.
- e2e: one new step 134 inside step 64's Settings visit; expected after the plan **203 PASS lines** (202 + 1). The
  counted number is the rule. Steps wait for states, never sleep.
- `docs/review.md`: new heading `## Changelog in the app (plan 10)`, item 88.
- Commits: conventional subjects; `feat`/`fix` only for what a user sees, in plain words, at most about 90 characters,
  no trailing period, no attribution lines. Commit on `main`, push after each commit.
- No new dependency.

## Review Focus

- **A hand edit at the release pause adds Markdown the parser does not know** (a table, `_emphasis_`, `1.` items,
  `<b>`). Every character of text must still show, as literal text; nothing is dropped and nothing becomes markup.
  Pinned in Task 2 (the "nothing dropped" test over the real file and over a hostile sample).
- **A `[text](javascript:…)` or relative link.** It must not become a clickable anchor. Pinned in Task 2
  (`parseInline`) and Task 3 (e2e: every anchor in the overlay has class `ext`).
- **Leaving Settings while the overlay is open** (folder switch, internal-error recovery). The overlay must close and
  must not leave `dialogOpen()` stuck true (which would block every shortcut). Pinned in Task 2
  (`SettingsScreen.close()` hides it).
- **Opening it a second time after scrolling to the bottom.** It must open at the top again. Pinned in Task 3, e2e
  step 134.
- **A `CHANGELOG.md` with CRLF line endings** (a checkout that ignored `.gitattributes`). It must parse the same as
  LF. Pinned in Task 2.

---

### Task 1: The changelog built into the app (model: sonnet)

**Files:**
- Create: `app/changelog-plugin.ts`, `app/changelog-plugin.test.ts`
- Create: `app/src/virtual-changelog.d.ts`
- Create: `app/src/lib/changelogText.test.ts`
- Modify: `app/vite.config.ts` (add the plugin), `app/tsconfig.node.json` (`include` the two new root files)

**Interfaces:**
- Produces: `changelogPlugin(file: string): Plugin` (from `vite`) in `app/changelog-plugin.ts`. Module id
  `virtual:changelog`, resolved id `'\0virtual:changelog'`; `load` calls `this.addWatchFile(file)` and returns
  `` `export default ${JSON.stringify(text)}` ``; if the file does not exist it throws
  `Error(`CHANGELOG.md not found at ${file}`)` (R2).
- Produces: `declare module 'virtual:changelog' { const text: string; export default text }` in
  `app/src/virtual-changelog.d.ts`, so `svelte-check` knows the module.
- `vite.config.ts`: `plugins: [svelte(), changelogPlugin(fileURLToPath(new URL('../CHANGELOG.md', import.meta.url)))]`.

- [ ] **Step 1: Write the failing tests.**
  - `app/src/lib/changelogText.test.ts`: `import text from 'virtual:changelog'`; it equals
    `readFileSync(new URL('../../../CHANGELOG.md', import.meta.url), 'utf8')`, and it starts with `'# Changelog'`.
  - `app/changelog-plugin.test.ts`: with a temp file holding `'## [9.9.9] - 2030-01-01\n- "quoted" \\ line\n'`,
    `resolveId('virtual:changelog')` is `'\0virtual:changelog'`, `resolveId('other')` is null/undefined;
    `load('\0virtual:changelog')` (called with a `this` stub recording `addWatchFile`) returns a module whose
    `JSON.parse` of the part after `export default ` equals the file text, and `addWatchFile` was called with the
    path; `load` of another id returns null/undefined; for a missing path `load` throws `/CHANGELOG.md not found at/`.
- [ ] **Step 2: Run** `cd app; npx vitest run changelog-plugin.test.ts src/lib/changelogText.test.ts`. Expected:
  FAIL (cannot resolve `./changelog-plugin.ts` and `virtual:changelog`).
- [ ] **Step 3: Implement** the plugin, the declaration, and the `vite.config.ts` and `tsconfig.node.json` changes.
- [ ] **Step 4: Verify.** The same command PASSES; `npx vitest run` all PASS; `just lint` clean; `npm run build` in
  `app/` succeeds and `dist/assets/*.js` contains the string `User-visible changes to Breccia, newest first.`
  (`grep -l` finds it). Start `npx vite` in `app/` and fetch `http://localhost:1420/@id/__x00__virtual:changelog`:
  it answers 200 with the text (the `just dev` path of R1); stop the server.
- [ ] **Step 5: Commit** `chore(app): build CHANGELOG.md into the app bundle`; push.

### Task 2: Parse the changelog, and the overlay's state (model: sonnet)

**Files:**
- Create: `app/src/lib/changelog.ts`, `app/src/lib/changelog.test.ts`
- Modify: `app/src/lib/settings.svelte.ts`, `app/src/lib/settings.test.ts`

**Interfaces:**
- Consumes: `virtual:changelog` (Task 1), only in the test of the real file.
- Produces, in `app/src/lib/changelog.ts`:
  ```ts
  export type Inline =
    | { kind: 'text'; text: string }
    | { kind: 'code'; text: string }
    | { kind: 'strong'; text: string }
    | { kind: 'link'; text: string; href: string }
  export type Block =
    | { kind: 'heading'; level: 1 | 2 | 3; inlines: Inline[]; version: string | null }
    | { kind: 'paragraph'; inlines: Inline[] }
    | { kind: 'list'; items: Inline[][] }
  export function parseInline(s: string): Inline[]
  export function parseChangelog(md: string): Block[]
  export function changelogNote(dev: boolean, version: string | null): string | null
  /** All text a reader sees, for tests: block texts joined by '\n'. */
  export function plainText(blocks: Block[]): string
  ```
  Rules (R3, R4): split on `/\r?\n/`; `#` is level 1, `##` level 2, `###` and deeper level 3; the first non-blank line,
  if it is a level-1 heading, is skipped; a level-2 heading whose text starts with `[X]` (not followed by `(`) gets
  `version: 'X'` and the brackets removed; `-`/`*`/`+` + space starts a list item at any indentation; a non-blank,
  non-bullet line indented under an item joins that item with one space; a blank line ends a list or paragraph;
  consecutive other lines join into one paragraph with one space; a line that is wholly `<!-- … -->` is skipped.
  Inline: `` `x` `` code, `**x**` strong, `[t](u)` a link when `u` starts with `http://` or `https://`, else text `t`;
  an unclosed marker is literal text; adjacent text runs are merged.
  `changelogNote(false, …)` is `null`; `changelogNote(true, '1.5.0')` is
  `'This is a development build of Breccia 1.5.0. Changes made since that release are not listed yet.'`;
  `changelogNote(true, null)` is
  `'This is a development build of Breccia. Changes made since the last release are not listed yet.'`.
- Produces, on `SettingsScreen`: `changelog = $state(false)`; `showChangelog(): void` (only while `shown`; else
  nothing); `hideChangelog(): void`; `close()` also sets `changelog = false`.

- [ ] **Step 1: Write the failing tests** in `changelog.test.ts`:
  - `parseChangelog('# Changelog\n\nIntro.\n\n## [1.5.0] - 2026-11-11\n\n### Features\n\n- A\n- B\n')` equals
    `[paragraph 'Intro.', heading 2 '1.5.0 - 2026-11-11' version '1.5.0', heading 3 'Features' version null,
    list [['A'], ['B']]]` (as `Block` objects with `text` inlines).
  - The same text with `\r\n` gives the same result.
  - `'## Unreleased'` is a level-2 heading with `version: null`; `'#### Deep'` is level 3; a `# Title` not first is kept
    as level 1.
  - `'- one\n  continued\n  - nested\n- two'` is one list `[['one continued'], ['nested'], ['two']]`.
  - `'- a\n\n- b'` is two lists; `'line one\nline two'` is one paragraph `'line one line two'`.
  - `'<!-- 1 -->\n- a'` is one list; `'<b>x</b>'` is a paragraph with the literal text `'<b>x</b>'`.
  - `parseInline('Use `Ctrl K` and **bold** [site](https://x.org) [rel](docs/a.md) [js](javascript:alert(1))')`:
    text, code `'Ctrl K'`, text, strong `'bold'`, text, link `{ text: 'site', href: 'https://x.org' }`, text `' rel '`
    … — exactly one `link` inline, and no inline has an `href` not starting with `http`.
  - `parseInline('a `b and **c')` is one text inline `'a `b and **c'`; `parseInline('2 * 3 _x_')` is one text inline.
  - **Nothing dropped (hostile sample):** for
    `'| a | b |\n1. one\n_em_ <script>x</script> & &amp;\n- [x](ftp://h) `c`'`, every word character sequence of the
    input (`/\w+/g`, minus `ftp`, `h` — the dropped link target) appears in `plainText(parseChangelog(...))`.
  - **The real file** (`import text from 'virtual:changelog'`): the `version` values of the headings equal the
    `/^## \[([^\]]+)\]/gm` captures of the text, in order; the number of list items equals the count of
    `/^\s*[-*+] /gm`; every word of every non-blank line except the first (`# Changelog`) and wholly-comment lines
    appears in `plainText`.
  - `changelogNote` as in Interfaces (three cases).
  In `settings.test.ts`: `showChangelog()` while closed leaves `changelog` false; `open()`, `showChangelog()` makes it
  true; `hideChangelog()` false; `showChangelog()` then `close()` leaves `changelog` false.
- [ ] **Step 2: Run** `cd app; npx vitest run src/lib/changelog.test.ts src/lib/settings.test.ts`; FAIL (module and
  methods missing).
- [ ] **Step 3: Implement** `changelog.ts` and the `SettingsScreen` additions.
- [ ] **Step 4: Run** the same command; PASS. Then `npx vitest run` and `just lint`.
- [ ] **Step 5: Commit** `refactor(app): parse the changelog for display`; push.

### Task 3: The overlay over Settings, with e2e (model: opus)

**Files:**
- Create: `app/src/components/ChangelogDialog.svelte`
- Modify: `app/src/components/SettingsView.svelte` (button, prop `onchangelog`)
- Modify: `app/src/App.svelte` (mount, `dialogOpen()`)
- Modify: `app/src/styles/app.css` (`.dialog.changelog-dialog` and its content rules, tokens only)
- Modify: `app/e2e/smoke.mjs` (step 134)

**Interfaces:**
- Consumes: `parseChangelog`, `changelogNote`, `Block`, `Inline` (Task 2); `virtual:changelog` (Task 1);
  `settings.changelog`, `settings.showChangelog()`, `settings.hideChangelog()` (Task 2); `appVersion` (App state).
- Produces: `ChangelogDialog` props `{ version: string | null; onclose: () => void }`; it imports the text itself and
  computes `parseChangelog(text)` once, and `changelogNote(import.meta.env.DEV, version)`.
  `SettingsView` prop `onchangelog: () => void`.
- DOM contract (e2e relies on it): content `data-testid="changelog"`, class `dialog changelog-dialog`; visible
  `Dialog.Title` "Changelog" (class `dialog-title`); note `<p data-testid="changelog-dev-note">` only when the note is
  not null; scrolling body `<div class="changelog-body" data-testid="changelog-body" tabindex="-1">`; level 1 and 2
  headings render as `<h3>`, level 3 as `<h4>`; a version heading has `data-version`; lists are `<ul><li>`; code is
  `<code>`, strong `<strong>`, links `<a class="ext" href=…>`.

- [ ] **Step 1: e2e step 134 first (RED).** In `smoke.mjs`, inside step 64's Settings visit: after step 64's
  assertions and its `PASS 64` line, before step 64's `nav-journal` click (move that click after step 134). Read
  `CHANGELOG.md` from `root`; `versions` = the `/^## \[([^\]]+)\]/gm` captures; `items` = the count of
  `/^\s*[-*+] /gm`. Sub-checks, each waiting for state:
  1. Click `[data-testid="show-changelog"]` (its text is `Show changelog`): `[data-testid="changelog"]` is visible
     and its title reads `Changelog`.
  2. The `[data-version]` attributes in the overlay, in order, equal `versions`; the first equals
     `readVersions(root).cargo`; the `li` count equals `items`.
  3. No `[data-testid="changelog-dev-note"]` (a release build, R5). Every `a` in the overlay has class `ext`.
  4. `changelog-body` is the focused element and its `scrollTop` is 0; `PageDown` (keyboard) makes `scrollTop` > 0.
  5. `F1` while it is open: no `[data-testid="shortcuts"]` appears (wait one animation frame pair, then count 0).
  6. Scroll the body to its end (`el.scrollTop = el.scrollHeight`); the `data-version="1.0.0"` heading is in view.
     `Esc`: the overlay is detached, `[data-testid="settings"]` is still visible with the About section, and the
     focused element is the `show-changelog` button.
  7. Click the button again: the body's `scrollTop` is 0 (opens at the top). Click the overlay backdrop
     (`.overlay`, at a corner): the overlay is detached and Settings is still shown.
  Print `PASS 134 Settings > About shows the changelog built into the app; Esc returns to Settings`.
  Run `just e2e`: step 134 FAILS (no button).
- [ ] **Step 2: Implement.** `ChangelogDialog.svelte` after `ShortcutsDialog.svelte`'s pattern: `Dialog.Root open`
  with `onOpenChange={(o) => !o && onclose()}`, `Dialog.Portal`, `Dialog.Overlay class="overlay"`,
  `Dialog.Content` with `aria-describedby={undefined}`, `onOpenAutoFocus` that prevents the default and focuses the
  body with `{ preventScroll: true }` (R7), `onCloseAutoFocus` that prevents the default and refocuses the element
  focused when the overlay was created (the button). Inline rendering by `{#each}` over `Inline` with `{#if}` per
  kind; no `{@html}`. `SettingsView`: the "Show changelog" button in a `settings-folder-actions` div after the About
  `<dl>` (R8), calling `onchangelog`. `App.svelte`: `onchangelog={() => settings.showChangelog()}`; next to the F1
  overlay, `{#if settings.changelog}<ChangelogDialog version={appVersion} onclose={() => settings.hideChangelog()} />{/if}`;
  `dialogOpen()` gains `|| settings.changelog`. CSS in `app.css`: `.dialog.changelog-dialog { top: 8%;
  width: min(720px, 94vw); max-height: 84vh; display: flex; flex-direction: column; }`, `.changelog-body
  { overflow-y: auto; outline: none; }`, heading, list and `code` rules with `var(--muted)`, `var(--line)`,
  `var(--edit)` only (R12).
- [ ] **Step 3: Verify.** `npx vitest run` (the token test stays green), `just lint`, `just e2e`: **203 PASS lines**,
  step 134 among them. By hand with `just dev`: the dev note shows at the top, the text is the same.
- [ ] **Step 4: Commit** `feat(app): Settings: read the changelog inside the app, also offline`; push.

### Task 4: Spec and release docs (model: haiku)

**Files:**
- Modify: `docs/spec.md` §7.12, `docs/releasing.md` ("The changelog" section)
- Modify: `app/scripts/docs.test.mjs` only if it pins the changed text (check first)

- [ ] **Step 1: Spec §7.12.** After the "Troubleshooting" paragraph add: "The About section shows the app's name,
  version, developer, licence and source link, and a "Show changelog" button. It opens the changelog
  (`CHANGELOG.md`, built into the app, so it needs no network) as an overlay over Settings, newest release first,
  rendered as Markdown; `Esc` or a click outside closes it and returns to Settings. A development build (`just dev`)
  shows the same text with a note that it is a development build."
- [ ] **Step 2: `docs/releasing.md`**, "The changelog": add "The app shows `CHANGELOG.md` in Settings > About; it is
  built into the installer from the tagged commit, so your edits at the pause appear there too."
- [ ] **Step 3: Verify.** `cd app; npx vitest run scripts/docs.test.mjs` PASS.
- [ ] **Step 4: Commit** `docs: the changelog in Settings in the spec and release guide`; push.

---

## Finish (the controller, not a task)

- `just test`, `just lint`, `just e2e` (203 PASS expected) on the final `main`; CI green on the last commit.
- Follow-ups doc `docs/plans/2026-11-11-10-changelog-in-app-followups.md`, at least: Q2 (mark the running version);
  the R5 limit (a local release build of unreleased commits shows no note); Markdown the parser shows as literal text
  (tables, emphasis, numbered and nested lists); no close button (R7).
- `docs/backlog.md`: #79 heading gets "(done 2026-11-11, plan 10)".
- `docs/STATUS.md`: plan 10 in the table and in "Where the project stands"/"Next", the owner decisions above, the test
  baseline (Vitest count, 203 e2e PASS), review item 88.
- `docs/review.md`, heading `## Changelog in the app (plan 10)`:
  - 88. **The changelog:** Settings > About, "Show changelog": an overlay with the changelog, newest release first,
    starting at the top; headings, groups (Features, Fixes) and bullets read well in a light and a dark theme.
    `Esc` closes it and Settings stays where it was; open it again: it is at the top. Turn off the network: it still
    opens. With `just dev`, a note at the top says it is a development build. Is "Show changelog" below the About
    list the right label and place (Q1)? Should the running version be marked (Q2)?
- Delete the plan's scratch files in `.superpowers/sdd/2026-11-11-10-changelog-in-app/`, keep `progress.md` and
  `plan-path`; commit and push the ledger.
- Report to the owner: what was built, the verification results, every ruling with its cost if wrong, open items.
