# Page colors: design

Status: agreed with the owner on 2026-11-07, in a brainstorming session with mockups. Next step: a plan in
`docs/plans/`.

## Intent

A journal day is well structured, but to see what a day was spent on you have to read it. With page colors, a glance at
the journal shows which blocks belong together and which topic they belong to, without reading the text.

The owner writes links hierarchically: the main topic comes first. In `[[Project]]: Today [[Sam]] gave me new tasks.`
the block is about Project; Sam is a detail. So the first link of a block names its topic.

## Goals

- A page can be given one of 25 fixed colors, or none.
- Wherever a journal day is shown (the journal feed, and a day opened on its own as a page), every top-level block whose first link or tag goes to a colored page is shown with a soft wash
  of that color behind it and all its sub-blocks.
- Colors fit every theme: the wash, the theme's own colors and the text always go together, and text stays readable.

## Non-goals

- Free choice of any color (RGB, hex, a color wheel). The owner chose a fixed set.
- Showing the color anywhere else: not in the page tree, links, linked references, search, the graph, boards or All
  pages. Only the journal wash and the page's own swatch.
- Coloring blocks on pages that are not journal days.
- User-defined palettes or per-theme overrides by the user.

## Anti-goals

- Text that becomes hard to read on a wash in any theme.
- Colors that look out of place in a theme (for example bright saturated washes in Dark).
- Changing anything in a notes file beyond the one `color::` line (spec §2: never drop, reorder or reformat the user's
  text).

## Decided by the owner

### The swatch and the picker

- Every page shows a swatch at the right end of its title row. Without a color: an empty outline (rounded square).
  With a color: a filled rounded square in that color.
- A click on the swatch opens a picker: 25 colors in a 5 × 5 grid, and a "No color" entry below the grid. Picking
  saves at once and closes the picker. The current color is marked in the grid.
- The grid is arranged as four color families and a quiet row (mockup B):
  1. reds and oranges,
  2. yellows and greens,
  3. teals and blues,
  4. violets and pinks,
  5. browns and greys.

### Where the color is saved

- As a page-level line `color:: <name>` in the preamble of the page file, for example `color:: red`, beside the
  `title::` line Breccia already writes there when needed (`docs/format.md`, "The preamble and front matter"). Front
  matter is never changed.
- "No color" removes the line. Nothing else in the file changes.
- The value is a color name from the fixed set, not a hex value, so each theme can give the name its own shade.

### Which blocks get a color (journal days only)

- The colors show wherever a journal day is shown: in the journal feed, and on a single day opened as a page (by
  clicking its title, jumping to a date, or going Back). A day looks the same in both.
- Only **top-level blocks** of a journal day decide a color. A top-level block takes the color of the page named by its
  **first link or tag that goes to a topic page** (`[[Page]]`, `#tag`, `#[[tag]]`). Links to journal days and links to
  pages that do not exist are skipped, so in `[[2026-11-06]]: follow-up on [[Project]]` Project decides. If the first
  topic page has no color, the block has none; links after it are not looked at.
- **Sub-blocks always take their parent's color**, also when a sub-block starts with a link of its own to another
  colored page. Example: under a red `[[Project]]` block, a sub-block `[[Hiring]]: …` (Hiring is blue) stays red.
- A block with no link or tag at all stays plain.

### How it looks

- **Soft fill** (mockup A), at the stronger of the two strengths shown (about 2.3 times the first mockup's wash). The
  text keeps the theme's normal text, link and tag colors.
- A top-level block and all its sub-blocks form **one continuous rounded area** (a blob), with no gaps or lines between
  the blocks inside it.
- **Consecutive top-level blocks that resolve to the same page merge** into one blob.
- Consecutive blocks that resolve to **different pages stay separate blobs, even when both pages have the same color**.
  There is a visible gap between them.

## Calls made in the conversation (Claude's, accepted by the owner)

- A tag counts exactly like a link: `#garden` resolves to the page Garden.
- A link written through an alias resolves to the aliased page and takes its color (alias rules: `docs/format.md`
  section 4).
- A tag-only page (a tag with no page file) shows the swatch too; picking a color creates its page file holding just
  the `color::` line.
- Journal days get no swatch: they are the feed, not a topic. A link to a journal day never colors a block (it is
  skipped, see above).
- A rename keeps the page's color (it lives in the file), and blocks linking to the renamed page keep theirs.
- The color stays while a block is being edited, and it updates as soon as typing changes the block's first link.
- No color library: the 25 names get hand-tuned shades per theme, the way task-state colors work today (`--c-red`,
  `--c-blue`, ... in `app/src/styles/tokens.css`).

## Calls made after the builder check (Claude's; the owner can overrule)

- The `color::` line is hidden in the page view, the way the `title::` line already is; the swatch shows the color.
- "First link" counts links anywhere in the top-level block's own text: its first line, later lines and property
  values, in reading order. Sub-blocks never count.
- The `color::` key is matched ignoring case, like `title::`. A `color` value in YAML front matter is not read.
- A tag-only page gets its file the way any new page does today, holding only the `color::` line.
- Target wash strength, from the stronger mockup: the page color's theme shade at about 28 % opacity on light themes
  and about 34 % on dark themes (mockup values: alpha `0x47` and `0x57`). The mockups are not in git, so the plan uses
  these numbers.

## Constraints

- Every color comes from `app/src/styles/tokens.css`; no color literals or `color-mix` elsewhere (a test checks it).
  The 25 page colors and their wash become tokens in each of the six themes (Light, Dark, Violet, Graphite, Taupe,
  Teal), and in the System theme's dark block.
- `docs/format.md` gets the `color::` line, and its checked examples (`crates/core/tests/it/format_doc.rs`) cover
  reading, setting and removing it. `docs/spec.md` gets the feature (§5 file format, §7.3 pages, §7.4 journal).
- Files Breccia did not change stay byte-identical; setting a color changes only the preamble line.
- The journal feed must stay as fast as it is with many days loaded.
- `docs/compatibility.md` notes how Obsidian and Logseq show the `color::` line.

## Left to the builder

- The 25 color names and their shade per theme, tuned so the wash reads well and neighbouring colors differ enough;
  the wash strength per theme (the stronger mockup is the target look).
- How the blob is drawn (one background behind a block and its children, merging across consecutive blocks), including
  rounded corners and the gap between different pages.
- How the color of a block's first link is resolved and kept current (the index already knows links and pages).
- What happens with a `color::` line whose value is not one of the 25 names (suggestion: treated as no color, the line
  kept as written until the user picks a color).
- Keyboard access to the picker (arrows, Enter, Escape) and its accessible names.
- Where the `color::` line goes relative to `title::` and other preamble text when it is added.
- e2e steps: pick a color and check the bytes on disk; remove it; the wash and the merging in the journal.
