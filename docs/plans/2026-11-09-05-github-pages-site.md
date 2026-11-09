# The project website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-page website for Breccia at https://eightbitboy.github.io/breccia/: what Breccia is, its features with
the README screenshots, a "Download for Windows" button, install steps, and a hero where coloured shards drift in and
assemble into the journal screenshot.

**Architecture:** Hand-written static files in a new `site/` folder (HTML, CSS, two small ES modules), no build step
and no dependency. One Node script, `app/scripts/site.mjs`, copies the two screenshots and the icons into `site/`
(git-ignored copies), checks the page (links, alt texts, no external requests) and serves it locally under `/breccia/`.
A GitHub Actions workflow, `.github/workflows/pages.yml`, runs the same copy and check and deploys `site/` to GitHub
Pages. An Edge screenshot script checks the page by eye and by assertion at three widths. Backlog #64.

**Tech Stack:** HTML, CSS, plain JavaScript (ES modules), Node 24 built-ins, Vitest (existing), `playwright-core`
(existing devDependency) driving the installed Microsoft Edge, GitHub Actions (`actions/configure-pages`,
`actions/upload-pages-artifact`, `actions/deploy-pages`).

**Spec:** this plan's "Owner decisions" and "Rulings" sections; `README.md` is the source of every sentence about the
app (Features, Install, Your notes, License); backlog #64 (`docs/backlog.md`); `CLAUDE.md`. The app itself
(`docs/spec.md`) does not change.

## Owner decisions (2026-11-09)

1. **Hero: "Fragments assemble"** (inspired by kero.sh). Breccia is a rock of broken fragments cemented into one
   stone. On load, shards of colour (the app's 25 page colours) drift in and snap together, then resolve into the
   journal screenshot (`docs/images/journal.png`); the shards follow the pointer slightly. Plain CSS plus a little
   JavaScript (CSS transforms; canvas is allowed but not needed), no external libraries or CDNs. With
   `prefers-reduced-motion: reduce` the hero shows the assembled state at once and does not follow the pointer.
   Without JavaScript the hero is static and complete (screenshot visible).
2. **Hosting:** plain static files in `site/` (hand-written HTML, CSS and JS, no build step), deployed by
   `.github/workflows/pages.yml`: `actions/configure-pages`, `actions/upload-pages-artifact` with `path: site`,
   `actions/deploy-pages`. Triggers: a push to `main` touching `site/**` or `docs/images/**`, and
   `workflow_dispatch`. URL: https://eightbitboy.github.io/breccia/. Pages is not enabled yet. Enabling it is an
   outward-facing change that the owner approves or performs (Task 6, Step 1): it is never done silently.
3. **Look:** a dark page with the 25 page colours as accent palette (the real values from
   `app/src/styles/tokens.css`), and a light/dark toggle for readers who prefer light; with no choice made, the page
   follows `prefers-color-scheme`. The site's own CSS may hold colour literals: the app's "colours only in
   `tokens.css`" rule covers `app/` only.
4. **Content (one page):** hero with the tagline "Breccia is a notes app where the fragments of everyday work and tasks
   bind into one body of knowledge." and a Windows download button to
   https://github.com/EightBitBoy/breccia/releases/latest; what it is; feature sections (journal; pages, links and
   tags; page colours; tasks and Kanban boards with `board.png`; Git sync; six themes; graph; local-first plain
   Markdown; keyboard-driven); install steps with the SmartScreen note and "Windows only for now"; footer links
   (GitHub repository, releases, changelog, licence). Wording comes from `README.md`; no invented features.
5. **Quality:** semantic HTML, contrast, focus styles, alt texts; responsive down to phone width; Open Graph and
   Twitter meta and a favicon from `app/src-tauri/icons`; images sized, lazy-loaded below the fold; no tracking and
   no cookies.
6. **Commits** are `chore`, `test`, `ci` or `docs`, never `feat` or `fix`: the site is not an app change and must
   stay out of the app's changelog (`cliff.toml` skips these types).

- Pages enablement (Task 6), 2026-11-09: the owner chose that Claude turns Pages on. Done with `gh api -X POST repos/EightBitBoy/breccia/pages -f build_type=workflow`; the deploy run 42700654560 succeeded and the page and its images answer 200.

## Rulings (made while planning; each says what it costs if wrong)

- **R1. No version number on the page.** The button says "Download for Windows" and links to `releases/latest`,
  which always opens the newest release; a line under it says "Newest release on GitHub · Windows only for now". No
  GitHub API call: the page then makes no request outside its own origin, and nothing can show a stale or failed
  number. Cost if wrong: a small progressive-enhancement script later (fetch
  `api.github.com/repos/EightBitBoy/breccia/releases/latest`, fill in `tag_name`, keep the plain text on failure),
  plus relaxing the checker's no-external-request rule for that one URL.
- **R2. Screenshots and icons are copied, not committed twice.** `site/images/` and `site/icons/` are filled by
  `node app/scripts/site.mjs assemble` from `docs/images/` and `app/src-tauri/icons/`, and are git-ignored
  (`site/.gitignore`). The workflow runs the same command before uploading `site`. So `just screenshots` updates the
  site too, with no second copy to forget. Cost if wrong: commit the copies and drop the copy step.
- **R3. All site links are relative** (`images/journal.png`, `site.css`), because the page lives under `/breccia/`.
  The checker refuses root-absolute paths (`/images/…`), and the local server serves the site under `/breccia/` too,
  so a wrong path fails locally the way it would fail on Pages. Absolute URLs appear only in `<a href>` to GitHub and
  in the Open Graph / Twitter `content` values, which must be absolute
  (`https://eightbitboy.github.io/breccia/images/journal.png`).
- **R4. The light/dark choice is kept in `localStorage`** (key `breccia-site-scheme`, values `light` or `dark`). It is
  not a cookie and is never sent anywhere. Without JavaScript the toggle is hidden and the page follows
  `prefers-color-scheme`. Cost if wrong: drop the two lines that read and write it; the toggle then lasts one visit.
- **R5. Workflow trigger paths** are the owner's two (`site/**`, `docs/images/**`) plus `app/src-tauri/icons/**`,
  `app/scripts/site.mjs` and `.github/workflows/pages.yml`, because each of them changes what is deployed. Actions are
  pinned by full commit SHA with a `# vX.Y.Z` comment, as in `release.yml`.
- **R6. The deploy runs the checker first.** A broken link or a missing alt text fails the workflow before anything is
  published.
- **R7. The visual check uses the installed Edge** (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
  present on every Windows 11) through `playwright-core`'s `chromium.launch({ channel: 'msedge', headless: true })`.
  No browser download. It is a by-hand recipe (`just site-shots`), not part of `just test`, like `just screenshots`.
- **R8. `just e2e` is still run at the end** (CLAUDE.md's finish step), though the app does not change.
- **R9. Footer** also links the notes format (`docs/format.md`) and "Breccia, Obsidian and Logseq"
  (`docs/compatibility.md`) on GitHub, from the "Local-first, plain Markdown" section, as the README's "Your notes"
  does and backlog #64 asks. Search, All pages, zoom and the tray icon get one "And more" line, worded from the README.

No open product questions: the Pages enablement (Task 6) is the only step that waits for the owner.

## Global Constraints

- No external requests from the page: no CDN, web font, analytics, iframe, or `fetch` to another origin. No cookies
  (`document.cookie` never appears). No `target="_blank"`.
- No dependency added to `app/package.json`; scripts use Node built-ins, Vitest and the existing `playwright-core`.
- `site/` holds no build output except the git-ignored `site/images/` and `site/icons/`.
- Copy: the tagline exactly "Breccia is a notes app where the fragments of everyday work and tasks bind into one body
  of knowledge."; the rock sentence exactly "Breccia is a rock made of broken fragments cemented together into one
  stone." Every feature sentence is taken or shortened from `README.md`; nothing the README does not claim.
- Colours: the 25 `--pc-*` names in picker order (`app/src/lib/pageColors.ts`): crimson, red, coral, orange, amber,
  yellow, olive, lime, green, emerald, teal, cyan, sky, blue, indigo, violet, purple, magenta, pink, rose, brown, tan,
  sand, slate, grey. Dark values from the `[data-theme="dark"]` block of `tokens.css`, light values from the
  `:root, [data-theme="light"]` block.
- Text contrast at least 4.5:1 for body, muted and button text in both schemes (WCAG AA).
- LF line endings, English (`<html lang="en">`), British or American spelling as the README uses ("color" in UI
  names such as "Page colors", matching the app).
- Commit subjects: conventional, `chore`/`test`/`ci`/`docs` only, no attribution lines. Push after each commit.

## Review Focus

1. **The screenshot never stays hidden.** If `hero.js` throws or loads late, the journal screenshot must still show:
   a CSS-only fallback reveals it by 2.5 s. Pinned in Task 4 (`site-shots` asserts the image's computed opacity is 1
   at 3 s with a script that throws injected) and Task 2 (no-JS run).
2. **The page works under `/breccia/`, not only at `/`.** A root-absolute path works in a naive local server and
   breaks on Pages. Pinned in Task 1 (`refuses_root_absolute_paths`) and Task 3 (served under `/breccia/`, any 404
   fails).
3. **Phone width.** At 375 px nothing scrolls sideways (wide screenshots, the shard frame, long words). Pinned in
   Task 3 (`scrollWidth <= innerWidth` at each width).
4. **Light scheme and the toggle.** A reader with a light system theme gets a readable light page; the toggle
   overrides it and survives a reload, and the shards stay visible on the light background. Pinned in Task 2
   (contrast test for both blocks) and Task 3 (shots in both schemes, toggle click and reload).
5. **Keyboard and screen reader.** Focus is visible on the button, toggle and links; shards are `aria-hidden`; the
   toggle says what it does. Pinned in Task 1 (checker rules) and Task 3 (focus-ring shot after Tab).

---

### Task 1: The site checker and local preview (sonnet)

**Files:**
- Create: `app/scripts/site.mjs`
- Create: `app/scripts/site.test.mjs`
- Create: `site/.gitignore` (contents: `images/` and `icons/`, one per line)
- Modify: `justfile` (recipes `site` and `site-check`, after `changelog`)

**Interfaces:**
- Produces, in `app/scripts/site.mjs` (ES module, Node built-ins only, also a CLI when run directly):
  - `export const IMAGES = ['journal.png', 'board.png']` (from `docs/images/`) and
    `export const ICONS = ['icon.svg', '32x32.png', '128x128@2x.png']` (from `app/src-tauri/icons/`).
  - `export function assemble(root: string, siteDir = join(root, 'site')): void` copies them to
    `siteDir/images/` and `siteDir/icons/` (creates the folders, overwrites).
  - `export function checkSite(siteDir: string): string[]` returns problems as `"<file>: <message>"`, empty when the
    site passes. It reads every `.html`, `.css` and `.js` file under `siteDir` with a small regex tag/attribute
    scanner (attributes must be quoted; the site is hand-written).
  - `export function serve(siteDir: string, port = 4173): http.Server` listens on `127.0.0.1` only; `GET /` gives
    302 to `/breccia/`; `/breccia/<path>` serves `siteDir/<path>` (`/breccia/` gives `index.html`) with a content type
    for html, css, js, png, svg, ico; anything else, or a path that resolves outside `siteDir`, gives 404.
  - CLI: `node app/scripts/site.mjs assemble` | `check` (assembles, checks, prints each problem and exits 1, or prints
    `site check: OK (<n> files)`) | `serve [--port N]` (assembles, prints `http://127.0.0.1:<port>/breccia/`).

The checker's rules (one test each, see Step 1):

1. `index.html` exists; `<html lang="…">`, `<meta charset>`, a viewport meta, `<title>`, `<meta name="description">`;
   exactly one `<h1>`; heading levels never skip (h2 after h1, h3 after h2…).
2. Open Graph and Twitter: `og:title`, `og:description`, `og:type`, `og:url`, `og:image` (absolute https URL),
   `twitter:card` = `summary_large_image`; a `<link rel="icon">`.
3. Every `<img>` has an `alt` attribute, a non-empty one unless the image is inside an `aria-hidden="true"` element,
   plus numeric `width` and `height`; every `<img>` except the first has `loading="lazy"`.
4. Local references (`href`, `src`, `srcset` entries, CSS `url()`, JS `import … from '…'`) resolve to a file in
   `siteDir`; `#id` links resolve to an `id` in the page; root-absolute paths (`/x`) are refused.
5. No external request: `src`, `srcset`, `<link href>`, CSS `url()`/`@import`, JS `import`/`fetch(` pointing at
   `http:`, `https:` or `//` fail. `<a href>` to `https:` is allowed; `http:` anywhere fails. `og:`/`twitter:`
   `content` values are not requests.
6. No `document.cookie`, no `target="_blank"`, no inline `on…=` handlers.
7. Every `<button>` has text or an `aria-label`; every `id` is unique.

- [ ] **Step 1: Write the failing tests** in `app/scripts/site.test.mjs`. Each test writes a small fixture site to a
  fresh `mkdtempSync` folder (helper `fixture(files: Record<string, string>): string`, starting from a minimal valid
  page `VALID` that passes every rule) and asserts on `checkSite`. Names:
  `a_valid_page_has_no_problems` (`[]`), `refuses_a_missing_alt`, `allows_empty_alt_only_inside_aria_hidden`,
  `refuses_an_image_without_size`, `refuses_an_eager_image_below_the_first`, `refuses_a_missing_local_file`,
  `refuses_a_missing_anchor`, `refuses_root_absolute_paths`, `refuses_an_external_script_or_stylesheet`,
  `refuses_an_external_css_url_and_import`, `refuses_a_fetch_to_another_origin`, `allows_external_links_and_og_urls`,
  `refuses_http_links`, `refuses_cookies_and_target_blank`, `refuses_skipped_heading_levels`,
  `refuses_two_h1`, `refuses_missing_social_meta`, `refuses_a_button_without_a_name`, `refuses_duplicate_ids`.
  Each refusing test asserts one problem whose message contains the offending value (for example
  `expect(p).toEqual([expect.stringContaining('/images/a.png')])`). Plus
  `assemble_copies_screenshots_and_icons` (into a temp `siteDir`; all five files exist with the source's size) and
  `serve_maps_breccia_and_refuses_escapes` (start on port 0, `fetch` `/` → 302 with `location: /breccia/`,
  `/breccia/` → 200 `text/html`, `/breccia/%2e%2e/package.json` and `/other` → 404; close the server).
- [ ] **Step 2: Run** `cd app; npx vitest run scripts/site.test.mjs`. Expected: FAIL (cannot import `./site.mjs`).
- [ ] **Step 3: Implement** `app/scripts/site.mjs` as the Interfaces block says; create `site/.gitignore`.
- [ ] **Step 4: Run** `cd app; npx vitest run scripts/site.test.mjs`. Expected: all pass. Then check each refusing test
  can fail: comment out its rule, see that one test go red, restore it (note in the report which ones you tried).
- [ ] **Step 5: Add the recipes** to `justfile` (PowerShell, like the others):

```just
# Preview the website at http://127.0.0.1:4173/breccia/ (copies the screenshots and icons into site/)
site:
    node app/scripts/site.mjs serve

# Check the website: links, alt texts, sizes, no external requests (app/scripts/site.mjs)
site-check:
    node app/scripts/site.mjs check
```

  Run `just site-check`. Expected: exit 1 with `index.html: missing` (the page comes in Task 2).
- [ ] **Step 6: Commit and push**

```bash
git add app/scripts/site.mjs app/scripts/site.test.mjs site/.gitignore justfile
git commit -m "chore(site): a checker and a local preview for the website"
git push
```

### Task 2: The page, its text and its styles (sonnet)

**Files:**
- Create: `site/index.html`, `site/site.css`, `site/scheme.js`
- Modify: `app/scripts/site.test.mjs` (tests on the real `site/`)

**Interfaces:**
- Consumes: `assemble`, `checkSite` from Task 1.
- Produces for Task 4 (the hero task relies on these exact names):
  - `<header class="hero">` holding `<h1>Breccia</h1>`, the tagline in `<p class="tagline">`, the download link
    `<a class="download" href="https://github.com/EightBitBoy/breccia/releases/latest">Download for Windows</a>`, the
    line "Newest release on GitHub · Windows only for now", and `<figure class="stone">` containing
    `<img class="shot" src="images/journal.png" alt="The journal in Breccia" width="1280" height="800"
    fetchpriority="high">` (the first image, so not lazy).
  - Inside `.stone`, before the image, `<div class="frame" aria-hidden="true">` with 14 to 18
    `<span class="shard" style="--c: var(--pc-<name>); --d: <0.2..1>">` elements, each with a `clip-path: polygon(…)`
    class or inline value, laid as a mosaic border around the screenshot: this is the assembled, static state.
    `--d` is the shard's depth (used by Task 4's pointer follow).
  - `site.css` defines on `:root` (dark, the default) and on `[data-scheme="light"]` plus
    `@media (prefers-color-scheme: light) { :root:not([data-scheme]) { … } }` the custom properties `--bg`,
    `--surface`, `--text`, `--muted`, `--accent`, `--on-accent`, `--focus`, and all 25 `--pc-<name>`.
  - `scheme.js` (loaded with a plain `<script src="scheme.js"></script>` in `<head>`, before the CSS paints, so there
    is no flash): reads `localStorage['breccia-site-scheme']`, sets `data-scheme` on `<html>`; on DOMContentLoaded
    shows `<button class="scheme" hidden aria-pressed="…">` (removes `hidden`), which toggles light/dark and stores
    the choice. Its accessible name: "Light theme" / "Dark theme" via `aria-label` and `aria-pressed` reflecting
    light. Wrap `localStorage` in try/catch (blocked storage must not break the page).

Page sections, in order (`<main>` with `<section id="…">` each, an `<h2>` each; wording from `README.md`):
`what` ("What it is": the README's second paragraph and "made for one person…"), `features` (an `<h3>` per feature:
Journal; Pages, links and tags; Page colors; Tasks and Kanban boards with
`<img src="images/board.png" alt="A board in Breccia" width="1280" height="800" loading="lazy">`; Git sync; Six
themes; Graph; Local-first, plain Markdown (with the folder layout as a `<pre>` and links to `docs/format.md` and
`docs/compatibility.md` on GitHub, R9); Keyboard-driven (F1 overlay, `Ctrl K`, `Ctrl Enter`, `Alt ←/→`, with `<kbd>`);
"And more" line: search, All pages, zoom, tray icon), `install` (an `<ol>` of the README's three steps, the WebView2
sentence, "Breccia runs on Windows only for now."), then `<footer>` with links to
https://github.com/EightBitBoy/breccia, `/releases`, `/blob/main/CHANGELOG.md`, `/blob/main/LICENSE` ("MIT License"),
and the line "Breccia is a rock made of broken fragments cemented together into one stone." Head: title
"Breccia: local-first notes and tasks in plain Markdown", description = the tagline, `og:url`
`https://eightbitboy.github.io/breccia/`, `og:image` `https://eightbitboy.github.io/breccia/images/journal.png`,
icons `icons/icon.svg` (type `image/svg+xml`), `icons/32x32.png`, `apple-touch-icon` `icons/128x128@2x.png`.

Layout: a single centred column (max about 70 ch for text), feature sections as a responsive grid
(`grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr))`), images `max-width: 100%; height: auto`. Each feature
`<h3>` gets a small shard-shaped marker in one page colour. `:focus-visible` gets a 3 px `--focus` outline with
offset on every interactive element. A skip link ("Skip to content") to `#what`.

- [ ] **Step 1: Write the failing tests** (append to `site.test.mjs`):
  - `the_real_site_passes_the_check`: `assemble(root)`; `expect(checkSite(join(root, 'site'))).toEqual([])`.
  - `site_palette_matches_the_app`: parse the 25 `--pc-*` values from the `:root, [data-theme="light"]` and the
    `[data-theme="dark"]` blocks of `app/src/styles/tokens.css`, and from `site.css`'s dark (`:root`) and light
    (`[data-scheme="light"]`) blocks; expect equal maps, 25 entries each, in both schemes; the light media block equals
    the `[data-scheme="light"]` block.
  - `site_text_has_enough_contrast`: WCAG relative-luminance ratio (helper `contrast(a, b)` on `#rrggbb`) of `--text`
    and `--muted` on `--bg` and on `--surface`, and `--on-accent` on `--accent`, ≥ 4.5 in both blocks.
  - `site_copy_comes_from_the_readme`: `index.html` contains the tagline and rock sentence exactly; the download href
    is `https://github.com/EightBitBoy/breccia/releases/latest`; the page contains no version pattern `\d+\.\d+\.\d+`
    (R1); each of the nine feature `<h3>` names appears.
- [ ] **Step 2: Run** `cd app; npx vitest run scripts/site.test.mjs`. Expected: the four new tests FAIL (no
  `site/index.html`, no `site.css`).
- [ ] **Step 3: Write** `site/index.html`, `site/site.css`, `site/scheme.js` as above.
- [ ] **Step 4: Run** `cd app; npx vitest run scripts/site.test.mjs` and `just site-check`. Expected: all pass;
  `site check: OK (…)`. Open `just site` in a browser and look at the page with JavaScript off (DevTools, "Disable
  JavaScript"): screenshot visible, toggle hidden, page follows the system scheme.
- [ ] **Step 5: Commit and push**

```bash
git add site/index.html site/site.css site/scheme.js app/scripts/site.test.mjs
git commit -m "chore(site): the website's page, text and styles"
git push
```

### Task 3: The visual check in Edge (sonnet)

**Files:**
- Create: `app/scripts/site-shots.mjs`
- Modify: `justfile` (recipe `site-shots`)

**Interfaces:**
- Consumes: `assemble`, `serve` from Task 1; the class names of Task 2.
- Produces: `node app/scripts/site-shots.mjs` writes PNGs to `target/site-shots/` and prints one `PASS <what>` line
  per assertion; any failure prints `FAIL <what>` and exits 1. Task 4 adds its own assertions to this script.

What it does: `assemble`, `serve(site, 0)`, launch Edge (`chromium.launch({ channel: 'msedge', headless: true })`;
if Edge is missing, print `SKIP Edge not found` and exit 0). For each width 375, 768 and 1280 (height 900) and each
`colorScheme` `dark` and `light`, with `reducedMotion: 'reduce'` (a stable picture): open
`http://127.0.0.1:<port>/breccia/`, wait for `load`, take a full-page shot `<width>-<scheme>.png`, and assert:
- every response is from `127.0.0.1` and has status < 400 (record `page.on('request')` and `page.on('response')`);
- no console error and no `pageerror`;
- `document.documentElement.scrollWidth <= innerWidth` (no sideways scroll);
- `img.shot` is complete with `naturalWidth > 0` and computed opacity `1`.
Also, once at 1280 dark: with `javaScriptEnabled: false`, the screenshot is visible and `button.scheme` is hidden;
click `button.scheme`, reload, expect `data-scheme="light"` kept; press Tab until the download link has focus and
take `focus.png` (the ring must be visible by eye).

- [ ] **Step 1: Write the script with the assertions, before the page is fixed for them.** Run
  `node app/scripts/site-shots.mjs` against Task 2's page. Expected: every PASS, or a FAIL that shows a real fault in
  Task 2's page. To prove the assertions can fail, run once with a temporary root-absolute `src="/images/board.png"`
  in `index.html` (expect a 404 FAIL) and once with a temporary `width: 2000px` element (expect the scroll FAIL);
  revert both.
- [ ] **Step 2: Fix** any real fault in `site/` that it found.
- [ ] **Step 3: Add the recipe** and run it:

```just
# Screenshots of the website at 375, 768 and 1280 px, dark and light, in headless Edge (target/site-shots/)
site-shots:
    node app/scripts/site-shots.mjs
```

  Run `just site-shots`. Expected: only PASS lines, 6 shots plus `focus.png` in `target/site-shots/`. Look at each
  shot; note anything that looks wrong in the report.
- [ ] **Step 4: Commit and push**

```bash
git add app/scripts/site-shots.mjs justfile site/
git commit -m "test(site): screenshots of the website at three widths in Edge"
git push
```

### Task 4: The hero: fragments assemble (opus)

**Files:**
- Create: `site/shards.js` (pure functions, no DOM), `site/hero.js` (DOM, imports `./shards.js`)
- Create: `app/scripts/site-hero.test.mjs`
- Modify: `site/index.html` (`<script type="module" src="hero.js"></script>` at the end of `<body>`), `site/site.css`
  (hero states), `app/scripts/site-shots.mjs` (motion assertions)

**Interfaces:**
- Consumes: `.hero`, `.stone`, `.frame`, `.shard` with `--c` and `--d`, `img.shot` from Task 2.
- Produces, in `site/shards.js`:
  - `export function rng(seed: number): () => number` (mulberry32; same seed, same sequence; values in `[0, 1)`).
  - `export function tiles(cols: number, rows: number, jitter: number, seed: number): number[][][]` returns
    `cols * rows` quads, each `[[x, y] × 4]` in percent of the screenshot box (0 to 100), built from one jittered
    grid of `(cols + 1) × (rows + 1)` points: border points stay on the border, inner points move by at most
    `jitter` percent of a cell, so neighbouring quads share corners exactly (they snap into a seamless cover).
  - `export function scatter(i: number, n: number, seed: number): { x: number, y: number, r: number }` the start
    offset of shard `i` in viewport fractions (`x`, `y` in `[-1.2, 1.2]`, length at least `0.4`, so every shard
    visibly drifts in) and a rotation `r` in degrees within `[-120, 120]`.
  - `export function parallax(px: number, py: number, w: number, h: number, depth: number, max: number): { x, y }`
    pointer at `(px, py)` in a `w × h` box: `(0, 0)` at the centre, `±max * depth` at the edges, clamped beyond them.
  - `export function colorFor(i: number, seed: number): string` one of the 25 page colour names, never the same as
    for `i - 1`.

The sequence (`hero.js`), only when `matchMedia('(prefers-reduced-motion: reduce)')` does not match:
1. Add `class="assembling"` to `.stone`: CSS hides `img.shot` (opacity 0) only under `.assembling`, and a CSS
   animation on `.assembling img.shot` reveals it at 2.5 s whatever the script does (Review Focus 1).
2. Create a `.tiles` layer over the screenshot with `tiles(6, 4, 0.35, seed)` as `clip-path` polygons, coloured
   `var(--pc-<colorFor>)`; set every tile's and frame shard's start transform from `scatter` (translate by viewport
   fractions, rotate), opacity 0.
3. Next frame: transition each to its place (`transform: none`, opacity 1), 900 ms, an ease-out with a small
   overshoot (`cubic-bezier(.2, 1.3, .4, 1)`), staggered by at most 300 ms in total. The tiles' meeting is the
   "snap".
4. 150 ms after the last tile lands, fade the tiles to 0 over 500 ms while `img.shot` fades in: the stone resolves
   into the journal. Remove `.tiles` and `.assembling` at the end. The whole sequence ends by 2 s.
5. Pointer follow, only for `(pointer: fine)`: on `pointermove` over the hero (throttled to one
   `requestAnimationFrame`), move each frame shard by `parallax(…, depth = --d, max = 8)` px; on `pointerleave`,
   back to 0. Never moves the screenshot itself.
With reduced motion: nothing of the above; the frame shards stay in place (the static state of Task 2). The page
must look the same as Task 2's page without JavaScript once the sequence ends.

- [ ] **Step 1: Write the failing tests** in `app/scripts/site-hero.test.mjs` (import `../../site/shards.js`):
  `rng_is_deterministic_and_in_range`; `tiles_cover_the_box_and_share_corners` (for 6×4, jitter 0.35, three seeds:
  24 quads; every coordinate in [0, 100]; border corners on the border; each inner point appears in exactly 4 quads;
  the quads' shoelace areas sum to 10 000 within 1e-6); `tiles_jitter_is_bounded` (each inner point within
  `0.35 * cell` of its grid point); `scatter_starts_every_shard_away_and_in_bounds` (n = 40: `hypot(x, y) >= 0.4`,
  `|x|, |y| <= 1.2`, `|r| <= 120`, same seed same result); `parallax_is_zero_at_the_centre_and_clamped`
  (centre → `{0, 0}`; corner `(0, 0)` → `{-max*d, -max*d}`; a point far outside → the same clamp);
  `colorFor_uses_page_colors_and_never_repeats` (200 indices: all in the 25 names, no two neighbours equal).
- [ ] **Step 2: Run** `cd app; npx vitest run scripts/site-hero.test.mjs`. Expected: FAIL (no `site/shards.js`).
- [ ] **Step 3: Implement** `site/shards.js`, then `site/hero.js` and the CSS states.
- [ ] **Step 4: Run** the unit tests (expect PASS) and `just site-check` (expect OK).
- [ ] **Step 5: Add motion assertions to `site-shots.mjs`** and run `just site-shots`:
  - with `reducedMotion: 'no-preference'` at 1280 dark: at 300 ms `.stone` has class `assembling` and `.tiles` exists
    (shot `hero-assembling.png`); at 2.5 s neither exists and `img.shot` opacity is `1` (shot `hero-done.png`); move
    the mouse to the hero's top-left corner and back: some `.shard` has a non-`none` transform, then `none`;
  - with `reducedMotion: 'reduce'`: `.tiles` never appears and no `.shard` has a transform after a mouse move;
  - with `hero.js` replaced by a script that throws (`page.route('**/hero.js', …)` fulfilling
    `throw new Error('x')` after adding `assembling`): at 3 s `img.shot` opacity is `1` (Review Focus 1). This
    case expects exactly one `pageerror`.
  To prove the fallback assertion can fail, remove the CSS reveal animation once and see it FAIL; restore it.
  Expected at the end: only PASS lines. Look at the two hero shots and at the page in a real browser
  (`just site`): the shards should read as fragments of one stone, not as confetti.
- [ ] **Step 6: Commit and push**

```bash
git add site/shards.js site/hero.js site/index.html site/site.css app/scripts/site-hero.test.mjs app/scripts/site-shots.mjs
git commit -m "chore(site): the hero's shards drift in and assemble into the journal"
git push
```

### Task 5: The Pages workflow (sonnet)

**Files:**
- Create: `.github/workflows/pages.yml`
- Create: `app/scripts/pages-workflow.test.mjs`

**Interfaces:**
- Consumes: `node app/scripts/site.mjs check` (Task 1; it assembles first).

Workflow shape: `name: Pages`; `on.push.branches: [main]` with `paths` `site/**`, `docs/images/**`,
`app/src-tauri/icons/**`, `app/scripts/site.mjs`, `.github/workflows/pages.yml` (R5), plus `workflow_dispatch`;
top-level `permissions: contents: read`; `concurrency: { group: pages, cancel-in-progress: false }`. Job `build`
(`ubuntu-latest`, timeout 10 min): checkout (same SHA as `release.yml`, `persist-credentials: false`), setup-node 24
(same SHA as `release.yml`, no cache), `node app/scripts/site.mjs check`, `actions/configure-pages`,
`actions/upload-pages-artifact` with `path: site`. Job `deploy` (`needs: build`, `permissions: pages: write,
id-token: write`, `environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }`):
`actions/deploy-pages` with `id: deployment`. Pin the three Pages actions to the commit SHA of their newest release
tag, with a `# vX.Y.Z` comment; find them with
`gh api repos/actions/<name>/releases/latest --jq .tag_name` and
`gh api repos/actions/<name>/commits/<tag> --jq .sha`.

- [ ] **Step 1: Write the failing tests** in `app/scripts/pages-workflow.test.mjs` (read the YAML as text, as
  `workflow.test.mjs` does; no YAML library): `every_action_is_pinned_by_sha` (same regex as `workflow.test.mjs`);
  `runs_on_main_for_site_paths_and_by_hand` (`workflow_dispatch:`, `branches:` with `main`, each of the five paths
  listed); `uploads_the_site_folder` (`path: site`); `checks_the_site_before_upload` (the `site.mjs check` line comes
  before the `upload-pages-artifact` line); `deploy_has_only_the_pages_permissions` (`pages: write` and
  `id-token: write` appear only in the deploy job; top level is `contents: read`); `deploys_to_github_pages`
  (`name: github-pages`, `actions/deploy-pages@`).
- [ ] **Step 2: Run** `cd app; npx vitest run scripts/pages-workflow.test.mjs`. Expected: FAIL (no
  `pages.yml`).
- [ ] **Step 3: Write** `.github/workflows/pages.yml`.
- [ ] **Step 4: Run** the test again. Expected: PASS. If `actionlint` is on PATH, run
  `actionlint .github/workflows/pages.yml` too (expect no output); otherwise say so in the report.
- [ ] **Step 5: Commit and push.** The push touches `.github/workflows/pages.yml`, so the workflow starts; with Pages
  not yet enabled, `configure-pages` fails. That is expected and is not to be fixed by enabling Pages: Task 6 asks the
  owner.

```bash
git add .github/workflows/pages.yml app/scripts/pages-workflow.test.mjs
git commit -m "ci: publish the website to GitHub Pages"
git push
```

### Task 6: Enabling Pages (controller, with the owner)

Not a subagent task: the controller asks the owner one question and waits.

- [ ] **Step 1: Ask the owner** (one question, with options): "The website is ready and checked. To publish it,
  GitHub Pages must be turned on for the repository, with GitHub Actions as its source. This makes
  https://eightbitboy.github.io/breccia/ public. (a) I turn it on now with
  `gh api -X POST repos/EightBitBoy/breccia/pages -f build_type=workflow`; (b) you turn it on yourself in Settings >
  Pages > Source: GitHub Actions; (c) not yet." Record the answer in this plan's "Owner decisions".
- [ ] **Step 2: Only after (a) or (b)** is done: `gh api repos/EightBitBoy/breccia/pages --jq .build_type`. Expected:
  `workflow`. Then `gh workflow run pages.yml` and `gh run watch` (expected: both jobs green), then
  `curl -sI https://eightbitboy.github.io/breccia/` (expected: `HTTP/2 200`) and
  `curl -sI https://eightbitboy.github.io/breccia/images/journal.png` (expected: 200, `image/png`).
- [ ] **Step 3: With (c)**, leave Pages off, keep review item 62 open, and say in `docs/STATUS.md` that the site is
  built but not published.

### Task 7: README, status, review list, backlog (haiku)

**Files:**
- Modify: `README.md` (after the screenshot: "Website: https://eightbitboy.github.io/breccia/"; only if Pages is on
  after Task 6, else leave the README as it is and say so in STATUS)
- Modify: `docs/review.md` (new section `## Website`, items 61 to 63)
- Modify: `docs/backlog.md` (#64 heading gets "(done <date>, plan 5)"; the version and screenshot questions are
  answered by R1 and R2; a custom domain stays open, as a line under it)
- Modify: `docs/STATUS.md` (plan table row 5; "Next": plan 6 is backlog #75; recipes `just site`,
  `just site-check`, `just site-shots`; the site is not part of the app's release)
- Modify: `CLAUDE.md` ("Where things are": `site/` and `.github/workflows/pages.yml`; "Commands": the three recipes,
  one line each)

Review items (wording to use):
- 61. **The website's look:** run `just site` (or open the live site) at a phone width, a tablet width and a desktop
  width, in dark and light, and with "reduce motion" on in Windows. The shards drift in, snap together and give way
  to the journal; they follow the pointer slightly. Say if the motion is too much or too little, or the colours too
  loud. `just site-shots` writes the same views to `target/site-shots/`.
- 62. **Publishing:** GitHub Pages is on with GitHub Actions as its source (or still off, if you chose "not yet") and
  https://eightbitboy.github.io/breccia/ shows the page; a change to `site/` or to the README screenshots
  republishes it.
- 63. **The text:** read the page once. Every sentence comes from the README; say what to cut, add or reword. The
  download button names no version (it opens the newest release); say if you want the number shown.

- [ ] **Step 1:** Make the edits. Run `cd app; npx vitest run scripts/docs.test.mjs` (README links). Expected: PASS.
- [ ] **Step 2: Commit and push**

```bash
git add README.md docs/review.md docs/backlog.md docs/STATUS.md CLAUDE.md
git commit -m "docs: the website in the README, status and review list"
git push
```

### Task 8: Final review and finish (opus review, then controller)

- [ ] **Step 1:** Whole-plan review on opus against this plan, the README and the Review Focus list: copy against the
  README line by line, accessibility (headings, names, focus, contrast, reduced motion), the hero fallback, the
  workflow's permissions and pins, the checker's rules for gaps. One fix wave (sonnet, or opus for hero changes),
  commits `chore(site): …`/`test(site): …`.
- [ ] **Step 2:** Run `just test`, `just lint`, `just site-check`, `just site-shots` and `just e2e` (R8). Expected:
  all green; Vitest count = 935 + the new tests; e2e 186 PASS lines.
- [ ] **Step 3:** Write `docs/plans/2026-11-09-05-github-pages-site-followups.md`, update `docs/STATUS.md` (plan 5
  done), delete the SDD workspace's scratch files (keep `progress.md` and `plan-path`), commit
  `docs: plan 5 done, follow-ups and status`, push.
- [ ] **Step 4:** Report to the owner: what was built, the live URL (or that Pages is still off), the check results,
  rulings R1 to R9 with their costs, and review items 61 to 63.
