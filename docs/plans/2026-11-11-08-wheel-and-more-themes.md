# Wheel over the theme button, and four more themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The scroll wheel over the status bar's theme button steps through System and every theme (backlog #76),
and four new themes join the six: Vampire, Fjord, Ember (dark) and Parchment (light).

**Architecture:** A theme stays one token block in `app/src/styles/tokens.css` plus an id in `THEMES`
(`app/src/lib/theme.ts`). First every token test takes its theme list from `THEMES`, so a new id is checked by all of
them at once, and a new test pins the readability of the plain surfaces (selection, jump highlight, hover, card,
editor, sidebar). Then the four token blocks go in, with values worked out and checked against every test before this
plan was written. The wheel is two pure functions (`stepTheme` in `lib/theme.ts`, `wheelTheme` in a new
`lib/themeWheel.ts`, which reuses the zoom's `WheelSteps`); `ThemeMenu.svelte` only listens and `App.svelte` only
applies the result through the existing `chooseTheme`.

**Tech Stack:** Svelte 5 + TypeScript, bits-ui `DropdownMenu`, Vitest, Playwright over WebView2 (e2e). No Rust change.

**Spec:** `docs/backlog.md` #76 (and #73, #74 for the card buttons and the theme button); `docs/spec.md` §7.10
(themes), §7.12 (Settings > Appearance), §7.13 (status bar); this plan's "Owner decisions" and "The owner's answers".

## Owner decisions (2026-11-11)

1. **The wheel.** With the pointer over the theme button (◐) in the status bar, the scroll wheel steps through System
   and all themes, in the menu's order. It wraps around: after the last theme comes System, and wheel up from System
   goes to the last theme. The choice is applied at once and kept on this computer only, exactly like a pick in the
   menu (`settings.json`, never the notes folder).
2. **Four new themes**, with our own names, taking only the general palette idea of popular editor themes and never
   their files:
   - **Vampire**: dark, a purple-grey background with pink and red accents (the idea of Dracula); the owner's "dark,
     reddish" wish.
   - **Fjord**: dark, a cool arctic blue-grey (the idea of Nord).
   - **Ember**: dark, a warm retro brown-grey with orange and yellow accents (the idea of Gruvbox).
   - **Parchment**: light, a cream background with muted blue and cyan accents (the idea of Solarized Light).
3. **Each new theme** has all tokens in `app/src/styles/tokens.css`; passes the same readability checks as the existing
   themes (page color washes with the 25 named colors and every custom hue and vividness, text and link contrast,
   selection, jump highlight); is listed in Settings > Appearance and in the status bar menu; has its card buttons
   (#73) checked; and is covered by e2e as the existing themes are (steps 124, 125, 128).

## The owner's answers to the plan's questions (2026-11-11)

- **Q1. Order (changed from the recommendation): light themes first.** Everywhere (the status bar menu, Settings >
  Appearance, the wheel): **System, Light, Taupe, Parchment, Dark, Graphite, Violet, Teal, Vampire, Fjord, Ember.**
  Taupe moves up, and Dark, Graphite and Violet change places among themselves. Every test and e2e step that pins the
  old order changes with it (Task 2).
- **Q2. Showing the name:** no toast. The button's tooltip names the current theme and says the wheel works
  ("Theme: Vampire. Scroll to switch."); its accessible name stays "Theme" (Task 3, Task 4).
- **Q3. How much wheel is one step:** the same rule as `Ctrl` and the wheel for zoom: one notch is one step, a
  trackpad's small movements add up to one step per notch-worth (100 px), turning back starts over (Task 3).
- **Q4. Direction:** wheel down goes down the menu, wheel up goes up (Task 3).
- **Q5. Menu open:** the wheel does nothing while the menu is open (Task 4).
- **Q6. F1 list and Settings > Keyboard:** one row for the wheel (Task 4).
- Wrap-around stays (decision 1).
- **Teal is fixed in this plan.** Its selection colour (and whatever else falls short) changes so text on the
  selection and the jump highlight reads at least 4.5:1, while Teal otherwise looks the same. The plain-surface check's
  text bar is then 4.5:1 for every theme. The fix is its own `fix` commit and review item (Task 1).

## Licences of the inspirations (checked for this plan; Task 2's implementer re-checks the four links)

Only the general idea of each palette is taken (a background family and an accent family). Every hex value below was
picked for Breccia and tuned against Breccia's own readability tests; no theme file, palette file or token list was
copied, and the products' names appear nowhere in the app.

| New theme | Idea from | Licence | Where |
|---|---|---|---|
| Vampire | Dracula | MIT | https://github.com/dracula/dracula-theme (LICENSE) |
| Fjord | Nord | MIT | https://github.com/nordtheme/nord (LICENSE.md) |
| Ember | Gruvbox | MIT | https://github.com/morhetz/gruvbox (LICENSE) |
| Parchment | Solarized (light) | MIT | https://github.com/altercation/solarized (LICENSE) |

MIT would allow copying with the notice, but nothing is copied, so no notice is needed. "Dracula" and "Dracula PRO"
are product names of their owner; Breccia uses none of the four names. The existing Teal theme already takes
Solarized's dark idea (its `--bg` is `#002b36`); Parchment is its light counterpart in spirit only.

## Code against the backlog (checked 2026-11-11 at `34f9d1e`)

- **The theme list.** `THEMES` and `THEME_NAMES` in `app/src/lib/theme.ts:2`–`14` are the only list the app uses:
  `ThemeMenu.svelte:9` and `settings/AppearanceSection.svelte:6` both build `['system', ...THEMES]`. The stored value
  is checked only by `parseTheme` (an unknown id is System); the Rust side (`app/src-tauri/src/settings.rs`,
  `set_theme`) stores any string, so a new id needs no Rust change.
- **The window title bar** follows `windowTheme` (`theme.ts:22`): `light` and `taupe` are light, every other id dark.
  Parchment must be added as light.
- **The tests hard-code the six themes** in nine places: `lib/theme.test.ts` (lines 37, 69, 112, 141–145 as
  `THEME_SELECTORS`, the `PARAMS` table at 229 and `TODAYS_SHADES` at 340), `lib/cardButtonColors.test.ts:4`,
  `lib/graphColours.test.ts:15`. A new theme added to `THEMES` alone is therefore checked by none of them. Task 1 makes
  them all follow `THEMES`.
- **Selection and jump highlight.** A selected row is `background: var(--hover)` with an `--accent` outline
  (`app/src/styles/app.css:146`); the jump highlight fades from `--select` to the row's wash (`app.css:472`–`474`); the
  theme button when pressed or open uses `--select` too (`app.css:603`). No test checks text on `--hover` or
  `--select`. Measured today: text on `--select` is 3.11:1 in Teal (6.32 to 9.95 elsewhere), text on `--edit` 4.00:1 in
  Teal, text on `--hover` 4.17:1 in Teal;
  every other plain-surface pair is at least 4.5:1 for text and 3:1 for links, tags and the accent. Teal's text
  (`#93a1a1`) is only 5.61:1 on its own background, so the three surfaces must come close to the background to reach
  4.5:1; changing the text colour instead would change every custom-color digest and pin of Teal, and its look. Task 1
  darkens the three surfaces only (values below, checked with all ten themes in the scratch script):

  | Teal token | Today | New | Text on it | vs `--bg` |
  |---|---|---|---|---|
  | `--hover` (a selected row, button hover) | `#0a4150` | `#053643` | 4.17 → 4.86 | 1.35 → 1.15 |
  | `--edit` (the edited block, code) | `#0a4452` | `#063845` | 4.00 → 4.73 | |
  | `--select` (jump highlight, pressed theme button, search hits) | `#145568` | `#083b49` | 3.11 → 4.53 | 1.81 → 1.24 |

  Links and tags on the new `--select`: 4.60 and 5.01 (were 3.15 and 3.43). The cost: the jump highlight and a
  selected row stand out less from Teal's background (1.24 and 1.15, near Taupe's 1.25 and Dark's 1.14). None of the
  three tokens enters the page-color math, so no wash, digest or pin changes.
- **Wheel today.** The only wheel handler is the window zoom: `Ctrl` (Cmd on macOS) and the wheel, on `document` in
  the capture phase, which stops the event (`App.svelte:1495`–`1505`). It feeds `WheelSteps` (`lib/zoom.ts:37`):
  about 100 units are one step, a reversal starts over, and `deltaY` is scaled by the zoom
  (`Math.round(e.deltaY * zoom.percent / 100)`) because a notch is fewer CSS pixels when zoomed in. The theme wheel
  reuses both, so it behaves the same at 125 % as at 100 %. `Ctrl` and the wheel over the theme button keep zooming
  (the capture handler stops the event before the button sees it).
- **No component tests exist** (`App.svelte` and the components have no harness), so the wheel's decisions live in
  `app/src/lib/` with tests and the components only carry them out (CLAUDE.md).
- **Screenshots** (`app/e2e/screenshots.mjs`) use the Light theme only; nothing to add for new themes. The website
  (`site/index.html:89`) and `README.md:44` say "Six themes"; `app/scripts/site.test.mjs:387` pins the site heading.
- **The status item's tooltip** is `themeItem()` in `lib/status.ts:68` (tip and label both "Theme"), set by an effect
  in `App.svelte:365`; e2e step 125 asserts both are "Theme".

## How the new token values were made (so a re-tune follows the same rule)

The base tokens (`--bg` to `--on-accent`, `--c-*`) were picked by hand per theme. The 25 page colors are not picked:
each is `ruleShade(l + (L - 0.66) * ds, C * cs, h)` (`lib/customColor.ts`) of the Light theme's shade with
OKLCH `L, C, h`, with the theme's `--pc-l`, `--pc-cs`, `--pc-ds`; this is exactly what the test "the shade rule
reproduces the 25 fixed shades" checks. All four blocks were run through every check of `theme.test.ts`,
`cardButtonColors.test.ts` and Task 1's new test (text bar 4.5:1 on every surface) before this plan was written (scratch script, not committed). Their
measured margins:

| Theme | Faded / bg | Lowest on a named wash: text, link, tag | Card buttons (rest/card, hover/rest, text on rest, on hover) | Text on `--select` |
|---|---|---|---|---|
| Vampire | 2.16 | 7.03, 3.82, 4.01 | 1.40, 1.31, 8.72, 6.68 | 9.50 |
| Fjord | 2.16 | 5.94, 4.16, 4.26 | 1.45, 1.32, 6.29, 4.76 | 6.63 |
| Ember | 2.09 | 6.02, 4.51, 4.22 | 1.42, 1.31, 7.14, 5.44 | 7.55 |
| Parchment | 1.79 | 6.90, 3.86, 3.75 | 1.28, 1.19, 7.62, 6.41 | 7.21 |

Every custom hue at every vividness (50 to 200 in steps of 5) is readable in all four, and no hue is held back at
vividness 100 or below. Wash strengths: 34 % for the three dark themes, 28 % for Parchment (as Light and Taupe).

## Global Constraints

- No colour literal or `color-mix` outside `app/src/styles/tokens.css` (`no colour literals outside tokens`).
- Every test fails first (RED) and the RED run is in the task report. A test that pins what already holds is shown
  to fail by a temporary mutation, noted and reverted.
- Decisions are pure functions in `app/src/lib/` with tests; `App.svelte` and components only carry them out.
- The theme choice is a setting of this computer only (spec §4, §7.10): stored through the existing `setTheme`
  (`settings.json`), never in the notes folder or `breccia/config.toml`.
- Theme ids are lowercase words: `vampire`, `fjord`, `ember`, `parchment`. Names: `Vampire`, `Fjord`, `Ember`,
  `Parchment`.
- e2e: steps 124, 125 and 128 are extended (Task 2, Task 4); one new step 132 after step 131 and before step 45
  (Task 4). Steps wait for states, never sleep, and assert the stored `settings.json` where the choice changes.
  Expected after the plan: 198 PASS lines (197 + step 132). The counted number is the rule.
- `docs/review.md`: new heading `## Wheel and more themes (plan 8)`, items 80 to 86 (79 is taken).
- Commits: conventional subjects; `feat`/`fix` only for what a user sees, in plain words, no code names, at most about
  90 characters, no trailing period, no attribution lines. Commit on `main` and push after each commit.
- No new dependency.

## Review Focus

- **A block is being edited when the wheel turns.** The edit and the caret must stay (the wheel moves no focus), as
  with a pick in the menu. Pinned in Task 4, e2e step 132.
- **`Ctrl` and the wheel over the theme button.** It must zoom the window, never switch the theme. Pinned in Task 4,
  step 132.
- **A fast spin.** After many quick notches the stored theme must be the one shown (no write lost or applied out of
  order). Pinned in Task 4, step 132 (five notches without waiting, then the attribute and `settings.json` agree).
- **The window zoomed to 125 %.** One notch is still one step, not two notches per step. Pinned in Task 3
  (`wheelTheme` scales by the zoom) and by the shared `WheelSteps` rule.
- **A theme that falls out of the list** (a `settings.json` from a later Breccia with a theme this one lacks). It must
  start as System and the wheel must start from System, never throw. Pinned in Task 3 (`stepTheme` from every
  choice; `parseTheme` unknown id stays System).

---

### Task 1: Every token test follows the theme list; plain surfaces are readable, Teal fixed (model: sonnet)

Two commits: the test lists (no user-visible change), then the plain-surface test with Teal's fix (visible).

**Files:**
- Modify: `app/src/lib/theme.ts` (export `THEME_CHOICES`)
- Modify: `app/src/components/ThemeMenu.svelte:9`, `app/src/components/settings/AppearanceSection.svelte:6` (use it)
- Modify: `app/src/lib/theme.test.ts`, `app/src/lib/cardButtonColors.test.ts`, `app/src/lib/graphColours.test.ts`
- Modify: `app/src/styles/tokens.css` (the Teal block: `--hover`, `--edit`, `--select`)
- Create: `app/src/lib/themeSurfaces.test.ts`

**Interfaces:**
- Produces: `export const THEME_CHOICES: readonly ThemeChoice[]` in `lib/theme.ts`, equal to `['system', ...THEMES]`.
  The menu, Settings and Task 3's `stepTheme` all use it.
- Produces: in each of the three test files, the selector list is built from `THEMES`:
  `selectorOf(t) = t === 'light' ? ':root, [data-theme="light"]' : `[data-theme="${t}"]``, plus
  `':root:not([data-theme])'` where the file checks the System dark block today.

- [ ] **Step 1: Make the lists follow `THEMES`.** In `theme.test.ts` replace the four literal lists (the
  `every theme defines every token` loop, the `faded` test's `sels`, `THEME_SELECTORS`, and the `windowTheme` test's
  list) with lists from `THEMES`; same in `cardButtonColors.test.ts` (`SELECTORS`) and `graphColours.test.ts`. Change
  `PARAMS` and `TODAYS_SHADES` from position-based to keyed by selector (`Record<string, …>`), and add
  `expect(Object.keys(PARAMS).sort()).toEqual([...THEME_SELECTORS].sort())` and the same for `TODAYS_SHADES`, so a theme
  without its row fails by name. `windowTheme` test: assert every id in `THEMES` maps to `'light'` or `'dark'`, with
  the light set pinned as `['light', 'taupe']` (Task 2 adds `'parchment'`).
- [ ] **Step 2: Show the lists now follow `THEMES` (RED by mutation).** Temporarily add `'zz'` to `THEMES` and run
  `cd app; npx vitest run src/lib/theme.test.ts src/lib/cardButtonColors.test.ts src/lib/graphColours.test.ts`.
  Expected: FAIL naming `[data-theme="zz"]` in the token, PARAMS and card-button tests. Revert the mutation; PASS.
- [ ] **Step 3: Write the plain-surface test** in `themeSurfaces.test.ts`, over every `THEMES` selector and
  `':root:not([data-theme])'`, with the same `block` and WCAG `contrast` helpers as `cardButtonColors.test.ts`.
  `test.each` one case per theme; each assertion's message names the pair:

  | Pair (foreground on background) | At least | What it guards |
  |---|---|---|
  | `--text` on `--bg`, `--side`, `--card`, `--hover`, `--edit`, `--select` | 4.5 | body text, sidebar, cards, a selected row, the edited block, the jump highlight, the pressed theme button |
  | `--link`, `--tag` on `--bg` | 3.0 | links and tags |
  | `--link`, `--tag` on `--hover`, on `--select` | 3.0 | links and tags in a selected or highlighted row |
  | `--muted` on `--bg` | 3.0 | muted text |
  | `--accent` on `--bg` | 3.0 | the selection outline and focus rings |
  | `--on-accent` on `--accent` | 4.5 | text on accent buttons |
  | `--hover` vs `--bg` | 1.1 | a selected row is seen |
  | `--select` vs `--bg` | 1.2 | the jump highlight is seen |
  | each `--c-*` except `--c-dim`, on `--bg` | 3.0 | task-state colours |

- [ ] **Step 4: RED.** Run `npx vitest run src/lib/themeSurfaces.test.ts`. Expected: FAIL only for
  `[data-theme="teal"]`: text on `--hover` 4.17, on `--edit` 4.00, on `--select` 3.11. Every other theme passes
  (lowest elsewhere: Light hover vs bg 1.21, Taupe select vs bg 1.25, Light `--c-amber` 3.26).
- [ ] **Step 4b: Fix Teal.** In the `[data-theme="teal"]` block set `--hover: #053643;`, `--edit: #063845;`,
  `--select: #083b49;` (nothing else). Run `npx vitest run`: all PASS (the page-color tests do not read these
  three tokens). Then show the background bars can fail: temporarily set Dark's `--select` to `#1b1b1d` (its
  `--bg`), expect FAIL `[data-theme="dark"] --select vs --bg`, revert.
- [ ] **Step 5: `THEME_CHOICES`.** Export it from `lib/theme.ts`; use it in `ThemeMenu.svelte` and
  `AppearanceSection.svelte` instead of their local `choices`. Add to `theme.test.ts`:
  `expect(THEME_CHOICES).toEqual(['system', ...THEMES])`.
- [ ] **Step 6: Verify.** `cd app; npx vitest run` all PASS; `just lint` clean.
- [ ] **Step 7: Commit twice**, pushing after each: first steps 1, 2 and 5 as
  `test: every theme test follows the theme list`; then steps 3, 4 and 4b as
  `fix(app): Teal theme: selected and highlighted text is easier to read`.

### Task 2: Four new themes (model: sonnet)

**Files:**
- Modify: `app/src/styles/tokens.css` (four blocks, after the Taupe block, before the `color-mix` blocks)
- Modify: `app/src/lib/theme.ts` (`THEMES`, `THEME_NAMES`, `windowTheme`)
- Modify: `app/src/lib/theme.test.ts` (`PARAMS`, `TODAYS_SHADES`, `windowTheme`, `parseTheme`)
- Modify: `app/e2e/smoke.mjs` (steps 124, 125, 128)

**Interfaces:**
- Consumes: Task 1's `THEMES`-driven test lists, keyed `PARAMS` and `TODAYS_SHADES`.
- Produces: `THEMES = ['light', 'taupe', 'parchment', 'dark', 'graphite', 'violet', 'teal', 'vampire', 'fjord', 'ember']`
  (the owner's order, Q1; the menu, Settings and the wheel all follow it); `THEME_NAMES` gains `vampire: 'Vampire'`, `fjord: 'Fjord'`, `ember: 'Ember'`,
  `parchment: 'Parchment'`; `windowTheme('parchment') === 'light'`.

- [ ] **Step 1: Re-check the licences** in the table above (open the four LICENSE files); note in the report that
  each is still MIT. If one is not, stop and report.
- [ ] **Step 2: RED.** Add the four ids to `THEMES` and `THEME_NAMES` only. Run `npx vitest run src/lib`. Expected:
  FAIL in `theme.test.ts`, `cardButtonColors.test.ts`, `graphColours.test.ts` and `themeSurfaces.test.ts`, naming
  `[data-theme="vampire"]` and the others (no tokens yet).
- [ ] **Step 3: Add the test rows.** In `theme.test.ts`: `PARAMS` gains
  `'[data-theme="vampire"]': [0.66, 0.95, 0.6]`, `'[data-theme="fjord"]': [0.62, 0.7, 0.6]`,
  `'[data-theme="ember"]': [0.64, 0.85, 0.6]`, `'[data-theme="parchment"]': [0.71, 0.8, 0.8]`. `TODAYS_SHADES` (the
  vividness-100 digests, computed from the blocks below with the test's own `shadeDigest`) gains
  `'[data-theme="vampire"]': 'dfd317f'`, `'[data-theme="fjord"]': '84005bd8'`, `'[data-theme="ember"]': '69a10b74'`,
  `'[data-theme="parchment"]': '93d51a9d'`. The light set in the `windowTheme` test becomes
  `['light', 'taupe', 'parchment']`. `parseTheme('ember')` is `'ember'`.
- [ ] **Step 4: Add the four token blocks** to `tokens.css`, exactly as below, after the Taupe block. Each block has
  the same 56 token names as Light (the test compares them).

```css
[data-theme="vampire"] {
  color-scheme: dark;
  --bg: #26232f;
  --side: #1f1c27;
  --line: #38334a;
  --faded: #5b5470;
  --text: #f1edf4;
  --muted: #8f86a6;
  --hover: #332e40;
  --accent: #ff6e9c;
  --link: #ff8fb8;
  --tag: #c8a6ff;
  --card: #2d2939;
  --card-btn: #453e58;
  --card-btn-hover: #574e6e;
  --edit: #2f2a3b;
  --select: #4b3452;
  --on-accent: #1f1c27;
  --shadow: rgba(0, 0, 0, .4);
  --shadow-strong: rgba(0, 0, 0, .5);
  --overlay: rgba(0, 0, 0, .45);
  --c-grey: #a59fb8;
  --c-amber: #f5b36b;
  --c-violet: #c9a6ff;
  --c-green: #6ee39b;
  --c-dim: #8f86a6;
  --c-blue: #8ab6ff;
  --c-red: #ff6b72;
  --c-teal: #7fdde6;
  --pc-crimson: #d65e72;
  --pc-red: #e46458;
  --pc-coral: #dd7b54;
  --pc-orange: #d57c2c;
  --pc-amber: #cc9029;
  --pc-yellow: #b9a53e;
  --pc-olive: #8d9149;
  --pc-lime: #83ae44;
  --pc-green: #55a459;
  --pc-emerald: #49ab80;
  --pc-teal: #3fa59a;
  --pc-cyan: #33abbb;
  --pc-sky: #4da5cf;
  --pc-blue: #518ae0;
  --pc-indigo: #707ddc;
  --pc-violet: #917cde;
  --pc-purple: #a371cd;
  --pc-magenta: #c869c1;
  --pc-pink: #d377a2;
  --pc-rose: #cf8499;
  --pc-brown: #a0755a;
  --pc-tan: #ad9070;
  --pc-sand: #ad9f83;
  --pc-slate: #7d8d9f;
  --pc-grey: #929292;
  --pc-wash: 34%;
  --pc-l: 0.66;
  --pc-cs: 0.95;
  --pc-ds: 0.6;
}

[data-theme="fjord"] {
  color-scheme: dark;
  --bg: #2b313c;
  --side: #252a34;
  --line: #3a4252;
  --faded: #596377;
  --text: #dde3ec;
  --muted: #8a95a8;
  --hover: #353c4a;
  --accent: #86bccc;
  --link: #93c7d8;
  --tag: #b0c99a;
  --card: #313845;
  --card-btn: #465063;
  --card-btn-hover: #566279;
  --edit: #333a47;
  --select: #3f4d63;
  --on-accent: #22272f;
  --shadow: rgba(0, 0, 0, .4);
  --shadow-strong: rgba(0, 0, 0, .5);
  --overlay: rgba(0, 0, 0, .45);
  --c-grey: #a3acbc;
  --c-amber: #e6c488;
  --c-violet: #bf98b8;
  --c-green: #a7c28f;
  --c-dim: #8a95a8;
  --c-blue: #88a9cc;
  --c-red: #d4808a;
  --c-teal: #8fc4c1;
  --pc-crimson: #b8616d;
  --pc-red: #c4685d;
  --pc-coral: #c0795d;
  --pc-orange: #b97945;
  --pc-amber: #b38947;
  --pc-yellow: #a79954;
  --pc-olive: #808352;
  --pc-lime: #7e9d55;
  --pc-green: #5b925d;
  --pc-emerald: #589a7a;
  --pc-teal: #51948b;
  --pc-cyan: #4e9ba6;
  --pc-sky: #5a96b4;
  --pc-blue: #5680bd;
  --pc-indigo: #6a75b9;
  --pc-violet: #8476bd;
  --pc-purple: #906daf;
  --pc-magenta: #ae6aa8;
  --pc-pink: #b87693;
  --pc-rose: #b67f8e;
  --pc-brown: #8c6d59;
  --pc-tan: #9b866f;
  --pc-sand: #9e937f;
  --pc-slate: #75808e;
  --pc-grey: #868686;
  --pc-wash: 34%;
  --pc-l: 0.62;
  --pc-cs: 0.7;
  --pc-ds: 0.6;
}

[data-theme="ember"] {
  color-scheme: dark;
  --bg: #2a2624;
  --side: #221f1d;
  --line: #3d3733;
  --faded: #5f5650;
  --text: #ecdcb8;
  --muted: #a0917e;
  --hover: #36302c;
  --accent: #f2913d;
  --link: #f5b553;
  --tag: #acc46c;
  --card: #312c29;
  --card-btn: #4b433d;
  --card-btn-hover: #5e544c;
  --edit: #342e2a;
  --select: #4e3e2e;
  --on-accent: #221f1d;
  --shadow: rgba(0, 0, 0, .4);
  --shadow-strong: rgba(0, 0, 0, .5);
  --overlay: rgba(0, 0, 0, .45);
  --c-grey: #a89a87;
  --c-amber: #f2b23e;
  --c-violet: #d394aa;
  --c-green: #b6bf4c;
  --c-dim: #a0917e;
  --c-blue: #92b3a6;
  --c-red: #f2654f;
  --c-teal: #96c489;
  --pc-crimson: #c95e6f;
  --pc-red: #d66559;
  --pc-coral: #d07956;
  --pc-orange: #c97a37;
  --pc-amber: #c18c36;
  --pc-yellow: #b19f47;
  --pc-olive: #868a4c;
  --pc-lime: #80a64a;
  --pc-green: #579b59;
  --pc-emerald: #4ea37c;
  --pc-teal: #469d93;
  --pc-cyan: #3fa3b1;
  --pc-sky: #529dc3;
  --pc-blue: #5285d1;
  --pc-indigo: #6c79cd;
  --pc-violet: #8b79cf;
  --pc-purple: #9a6ec0;
  --pc-magenta: #bc68b6;
  --pc-pink: #c7769b;
  --pc-rose: #c38193;
  --pc-brown: #977158;
  --pc-tan: #a58b6e;
  --pc-sand: #a69980;
  --pc-slate: #788797;
  --pc-grey: #8c8c8c;
  --pc-wash: 34%;
  --pc-l: 0.64;
  --pc-cs: 0.85;
  --pc-ds: 0.6;
}

[data-theme="parchment"] {
  color-scheme: light;
  --bg: #fbf5e6;
  --side: #f0e9d6;
  --line: #e3dbc6;
  --faded: #c2b9a2;
  --text: #33454c;
  --muted: #6f7f83;
  --hover: #ece5d1;
  --accent: #2777af;
  --link: #1f6ca5;
  --tag: #17766f;
  --card: #fffcf3;
  --card-btn: #e9e0c9;
  --card-btn-hover: #d9ceb3;
  --edit: #f3ecd9;
  --select: #cfdde3;
  --on-accent: #ffffff;
  --shadow: rgba(0, 0, 0, .15);
  --shadow-strong: rgba(0, 0, 0, .25);
  --overlay: rgba(0, 0, 0, .25);
  --c-grey: #77868a;
  --c-amber: #a26c0c;
  --c-violet: #6a6ec2;
  --c-green: #5f7d10;
  --c-dim: #93a1a1;
  --c-blue: #2a7db6;
  --c-red: #c03f39;
  --c-teal: #1b8079;
  --pc-crimson: #da7482;
  --pc-red: #ea7e71;
  --pc-coral: #e79372;
  --pc-orange: #de9256;
  --pc-amber: #d9a75a;
  --pc-yellow: #ccbb6a;
  --pc-olive: #999d62;
  --pc-lime: #9abf6a;
  --pc-green: #6eaf70;
  --pc-emerald: #6bb994;
  --pc-teal: #63b2a8;
  --pc-cyan: #61bbc8;
  --pc-sky: #6fb6da;
  --pc-blue: #6898e1;
  --pc-indigo: #7e8cdc;
  --pc-violet: #9e8ee1;
  --pc-purple: #ac83d1;
  --pc-magenta: #d180ca;
  --pc-pink: #de8fb2;
  --pc-rose: #dc9cad;
  --pc-brown: #a58069;
  --pc-tan: #bba286;
  --pc-sand: #c0b49c;
  --pc-slate: #8b99a9;
  --pc-grey: #a1a1a1;
  --pc-wash: 28%;
  --pc-l: 0.71;
  --pc-cs: 0.8;
  --pc-ds: 0.8;
}
```

- [ ] **Step 5: `windowTheme`**: `light`, `taupe` and `parchment` are light.
- [ ] **Step 6: Verify.** `cd app; npx vitest run` all PASS (the vividness test now runs about twice as long; its
  60 s limit holds). If a value had to change, re-run every theme test and say which and why in the report.
- [ ] **Step 7: e2e.** In `smoke.mjs`: step 124's theme loop becomes
  `['light', 'violet', 'teal', 'graphite', 'parchment', 'vampire', 'fjord', 'ember']`; step 125's expected list
  becomes `['System', 'Light', 'Taupe', 'Parchment', 'Dark', 'Graphite', 'Violet', 'Teal', 'Vampire', 'Fjord', 'Ember']`
  (rename `'125 seven choices'` to `'125 eleven choices'` and the comment "System and the six themes" to "System and
  the ten themes"); step 128's `THEMES128` becomes
  `['light', 'taupe', 'parchment', 'dark', 'graphite', 'violet', 'teal', 'vampire', 'fjord', 'ember']` (it must equal
  the menu without System). Step 125's arrow-key check from Teal stays generic (Teal's next is now Vampire). Run
  `just e2e`: 197 PASS.
- [ ] **Step 8: Commit** five times, pushing after each. First the new order of the six existing themes alone
  (`THEMES` becomes `['light', 'taupe', 'dark', 'graphite', 'violet', 'teal']`, step 125's and 128's lists to
  match): `feat(app): Themes: light themes come first in the menu and in Settings`. Then one theme each (tokens, its
  test rows and its place in `THEMES` together; Parchment goes after Taupe, the dark ones after Teal; the e2e lists
  grow with each):
  - `feat(app): Themes: Vampire, a dark theme with pink and red accents`
  - `feat(app): Themes: Fjord, a dark theme in cool arctic blue-grey`
  - `feat(app): Themes: Ember, a dark theme in warm brown with orange accents`
  - `feat(app): Themes: Parchment, a light cream theme with blue accents`
  Each commit must pass `npx vitest run` on its own (add one theme's id, test rows and block per commit).

### Task 3: Which theme the wheel picks (model: sonnet)

**Files:**
- Modify: `app/src/lib/theme.ts` (add `stepTheme`)
- Create: `app/src/lib/themeWheel.ts`, `app/src/lib/themeWheel.test.ts`
- Modify: `app/src/lib/status.ts` (`themeItem` takes the choice), `app/src/lib/status.test.ts`

**Interfaces:**
- Consumes: `THEME_CHOICES` (Task 1), `THEME_NAMES`, `WheelSteps` from `lib/zoom.ts` (its `add(deltaY)` returns `1` for
  wheel up, `-1` for wheel down, `0` until about 100 units have collected; a reversal starts over).
- Produces:
  - `stepTheme(c: ThemeChoice, by: 1 | -1): ThemeChoice` in `lib/theme.ts`: the next (`1`, down the menu) or previous
    (`-1`) entry of `THEME_CHOICES`, wrapping at both ends.
  - `wheelTheme(current: ThemeChoice, steps: WheelSteps, deltaY: number, zoomPercent: number): ThemeChoice | null` in
    `lib/themeWheel.ts`: feeds `Math.round(deltaY * zoomPercent / 100)` to `steps`; wheel down (positive `deltaY`) is
    `stepTheme(current, 1)`, wheel up `stepTheme(current, -1)`; `null` while no whole step has collected or when
    `deltaY` is 0. It lives in its own file so `theme.ts` does not import `zoom.ts` (which imports `status.ts`, which
    imports `theme.ts` after this task).
  - `themeItem(c: ThemeChoice): StatusItem` in `lib/status.ts`: as today, but `tip` is
    `` `Theme: ${THEME_NAMES[c]}. Scroll to switch.` `` (Q2 (a)); `label` stays `'Theme'`.

- [ ] **Step 1: Write the failing tests** in `themeWheel.test.ts`:
  - `stepTheme('system', 1)` is `'light'`; `stepTheme('light', 1)` is `'taupe'`; `stepTheme('parchment', 1)` is
    `'dark'`; `stepTheme('system', -1)` is `'ember'`; `stepTheme('ember', 1)` is `'system'`;
    `stepTheme('teal', 1)` is `'vampire'`.
  - Walking `stepTheme(c, 1)` eleven times from `'system'` visits `THEME_CHOICES` in order and ends at `'system'`;
    for every choice `stepTheme(stepTheme(c, 1), -1) === c`.
  - `wheelTheme('system', new WheelSteps(), 100, 100)` is `'light'`; with `-100` it is `'ember'`.
  - At zoom 125 a notch is 80 CSS px: `wheelTheme('dark', new WheelSteps(), 80, 125)` is `'graphite'`.
  - A trackpad trickle on one `WheelSteps`: `25, 25, 25` give `null` each (current `'dark'`), the fourth `25` gives
    `'graphite'`.
  - Turning back starts over: `60` then `-60` give `null`, `null`.
  - `deltaY` 0 gives `null`.
  - In `status.test.ts`: `themeItem('vampire').tip` is `'Theme: Vampire. Scroll to switch.'`,
    `themeItem('system').tip` is `'Theme: System. Scroll to switch.'`; `label` is `'Theme'`; the existing placement
    test passes a choice.
- [ ] **Step 2: Run** `cd app; npx vitest run src/lib/themeWheel.test.ts src/lib/status.test.ts`; expected FAIL
  (`stepTheme` and `wheelTheme` not exported, the tip is `'Theme'`).
- [ ] **Step 3: Implement** `stepTheme`, `wheelTheme` and `themeItem(c)`. Update the one caller in `App.svelte:366`
  to `themeItem(theme)` (the effect then follows the theme).
- [ ] **Step 4: Run** the same command; PASS. Then `npx vitest run` and `just lint`.
- [ ] **Step 5: Commit** `refactor(app): the theme wheel's choice as a pure function`; push. (The new tooltip is
  visible from this commit, but it describes Task 4's feature, so it ships under Task 4's `feat` line.)

### Task 4: The wheel over the theme button, with e2e (model: opus)

**Files:**
- Modify: `app/src/components/ThemeMenu.svelte`, `app/src/components/StatusBar.svelte`, `app/src/App.svelte`
- Modify: `app/src/lib/shortcuts.ts`, `app/src/lib/shortcuts.test.ts` (Q6)
- Modify: `app/e2e/smoke.mjs` (step 125's tooltip assertion; new step 132)

**Interfaces:**
- Consumes: `wheelTheme` and `WheelSteps` (Task 3), `chooseTheme` (`App.svelte:1202`, applies, sets the attribute and
  the window theme, stores through `setTheme`), `zoom.percent`.
- Produces: `ThemeMenu` prop `onwheel: (deltaY: number) => void`; `StatusBar` prop `onthemewheel` passed through.

- [ ] **Step 1: Shortcut row (RED first).** Test in `shortcuts.test.ts`: some row of `shortcutRows(false)` has
  `what` matching `/theme/i` and `keys` `'Wheel over ◐'` (same on mac). Run, FAIL. Add
  `{ group: 'Window and zoom', keys: 'Wheel over ◐', mac: 'Wheel over ◐', what: 'In the status bar: next or previous theme' }`
  after the `Ctrl 0` row. PASS.
- [ ] **Step 2: e2e step 132 first (RED).** After step 131, before step 45. The status bar shows the theme button
  (step 125's locators `theme125`, `menu125`, `attr125`, `settingsJson`, `focused125` are in scope). Start from System
  (assert `attr125()` is `''`). Sub-checks, each waiting for state:
  1. Edit a journal block (as step 125 does), keep its text. Move the pointer over the button
     (`theme125.hover()`), `page.mouse.wheel(0, 100)`: the attribute becomes `light` and `settingsJson().theme` is
     `'light'`; the block is still edited (`focused125` is `'editor'`, one `.cm-editor`, same text); the tooltip
     (`title`) is `'Theme: Light. Scroll to switch.'`.
  2. Wheel down nine more notches, waiting for each attribute in turn: `taupe`, `parchment`, `dark`, `graphite`,
     `violet`, `teal`, `vampire`, `fjord`, `ember`; one more: the attribute is gone (System) and the stored theme is
     `null` (wrap).
  3. Wheel up once from System: `ember`, stored `'ember'` (wrap the other way).
  4. Trackpad: four `wheel(0, -25)` without waiting: `fjord` after the fourth only (check after the third that it is
     still `ember`).
  5. Fast spin: five `wheel(0, 100)` without waiting, from `fjord` (ember, System, light, taupe, parchment): wait for
     the attribute `parchment`, then for `settingsJson().theme` to be `'parchment'`.
  6. `Ctrl` + wheel over the button (`kb.down('Control')`, `wheel(0, -100)`, `kb.up('Control')`): the zoom item
     appears (`110 %`), the theme attribute is unchanged; click the zoom item to go back to 100 %.
  7. Menu open: click the button, the menu shows; `wheel(0, 100)` over the button: theme unchanged (Q5 (a)); Esc.
  8. Settings > Appearance (`Control+Comma`) shows the wheel's choice checked; close it. Leave the theme on System
     (pick System in the menu) and the stored theme `null`, as step 125 leaves it.
  Print `PASS 132 the wheel over the theme button steps through the themes in the menu's order, wraps, and stores the choice`.
  Run `just e2e`: step 132 FAILS (nothing listens). Also update step 125's tooltip check: `title` is
  `'Theme: System. Scroll to switch.'` (aria-label stays `'Theme'`).
- [ ] **Step 3: Wire it.** In `ThemeMenu.svelte`: `bind:ref` on `DropdownMenu.Trigger`; an `$effect` adds a `wheel`
  listener on that element with `{ passive: false }` (Svelte's `onwheel` is passive, so it cannot `preventDefault`):
  ignore when `open`, when `ctrlKey` or `metaKey` is held, or when `deltaY` is 0; else `preventDefault()` and
  `onwheel(e.deltaY)`. The listener is removed in the effect's cleanup. `StatusBar.svelte` passes `onthemewheel` to
  `ThemeMenu` as `onwheel`. In `App.svelte`: one `const themeSteps = new WheelSteps()` and
  `onthemewheel={(dy) => { const c = wheelTheme(theme, themeSteps, dy, zoom.percent); if (c !== null) chooseTheme(c) }}`.
  Nothing else in `App.svelte` changes.
- [ ] **Step 4: Verify.** `npx vitest run`, `just lint`, `just e2e`: 198 PASS lines, step 132 among them.
- [ ] **Step 5: Commit** `feat(app): Status bar: the mouse wheel over the theme button switches the theme`; push.

### Task 5: Spec, README and website (model: haiku)

**Files:**
- Modify: `docs/spec.md` §7.10, §7.13
- Modify: `README.md:44`, `site/index.html:89`–`90`, `app/scripts/site.test.mjs:387`

- [ ] **Step 1: RED.** In `site.test.mjs` change `'Six themes'` to `'Ten themes'`; run
  `cd app; npx vitest run scripts/site.test.mjs`; FAIL.
- [ ] **Step 2: Site.** `site/index.html`: heading `Ten themes`, text
  `Light, Taupe, Parchment, Dark, Graphite, Violet, Teal, Vampire, Fjord and Ember, plus System, which follows Windows.`
  PASS; `just site-check` clean.
- [ ] **Step 3: README.** `- **Ten themes** (Light, Taupe, Parchment, Dark, Graphite, Violet, Teal, Vampire, Fjord,
  Ember), plus System, which follows Windows. The mouse wheel over the theme button in the status bar switches
  between them.`
- [ ] **Step 4: Spec §7.10.** First bullet: "Ten built-in themes: **Light, Taupe, Parchment, Dark, Graphite, Violet,
  Teal, Vampire, Fjord, Ember** (light ones first; the order of the menu, Settings and the wheel)." The wash strengths: "28 % in Light, Taupe and Parchment, 30 % in Teal, 34 % in
  the others". New bullet after the "choice (or System)" bullet: "The theme button in the status bar (§7.13) opens a
  menu with System and the themes, in this order. The mouse wheel over it steps through the same list: down goes to
  the next, up to the previous, and it wraps around at both ends. About one wheel notch is one step (a trackpad's small
  movements add up, the same rule as `Ctrl` and the wheel for zoom); `Ctrl` and the wheel there still zoom; while the
  menu is open the wheel does nothing there. The choice is applied and kept exactly like a pick in the menu."
  §7.13: add to the first paragraph "and, left of the help button, the theme button (§7.10)".
- [ ] **Step 5: Commit** `docs: ten themes and the theme wheel in the spec, README and website`; push.

---

## Finish (the controller, not a task)

- `just test`, `just lint`, `just e2e` (198 PASS expected) on the final `main`; CI green on the last commit.
- Follow-ups doc `docs/plans/2026-11-11-08-wheel-and-more-themes-followups.md`, at least: Teal's jump highlight and
  selected row are quieter after the fix (1.24 and 1.15 against its background; a lighter Teal text would give room,
  at the cost of its look and its custom-color pins); the wheel uses only `deltaY` in pixels (WebView2 always sends pixels; line or page `deltaMode`
  is not handled); the theme menu now has eleven entries (whether it should group light and dark later); whether the
  Settings > Appearance previews want a second row label.
- `docs/STATUS.md`: plan 8 done, ten themes, the test baseline (Vitest count, 198 e2e PASS), review items 80 to 86,
  the owner's answers to Q1 to Q6 and the Teal fix.
- `docs/review.md`, heading `## Wheel and more themes (plan 8)`:
  - 80. **The wheel:** with the pointer on ◐ in the status bar, turn the wheel down: Light, Dark, … Parchment, then
    System again; up from System goes to Ember. A block being edited stays edited. A trackpad swipe moves about one
    theme per notch-worth, not all at once. The tooltip names the theme. Restart Breccia: the last theme is kept.
    `Ctrl` and the wheel there still zoom.
  - 81. **Vampire:** journal, a page, the board (hover a card: the ↗ and … buttons), search, the graph, Settings; a few
    page colors and a custom hue at vividness 50 and 200. Dark and reddish enough? Links pink, tags lilac.
  - 82. **Fjord:** the same tour. Cool and calm, not too grey?
  - 83. **Ember:** the same tour. Warm, orange accent, yellow links, green tags: too busy?
  - 84. **Parchment:** the same tour; the window title bar is light. Cream not too yellow; text dark slate.
  - 85. **The list:** Settings > Appearance and the status bar menu show eleven choices in the same order: System,
    Light, Taupe, Parchment, Dark, Graphite, Violet, Teal, Vampire, Fjord, Ember; F1 lists the wheel.
  - 86. **Teal, easier to read:** in Teal, select a few rows (`Shift ↓`), edit a block, follow a link to a block (the
    jump highlight), open the theme menu (the pressed button): text, links and tags read well on each. Does Teal
    otherwise look as before? Are the selection and the highlight still seen well enough?
- Delete the plan's scratch files in `.superpowers/sdd/2026-11-11-08-wheel-and-more-themes/`, keep `progress.md` and
  `plan-path`; commit and push the ledger.
- Report to the owner: what was built, the verification results, every ruling with its cost if wrong, open items.
