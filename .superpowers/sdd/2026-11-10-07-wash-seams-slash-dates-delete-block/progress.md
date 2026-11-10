# SDD ledger — plan: docs/plans/2026-11-10-07-wash-seams-slash-dates-delete-block.md

The owner answered all nine product questions as recommended and approved the plan on 2026-11-10 (plan commit `132aaca`). Baseline before Task 1: `132aaca`.

## Pre-flight (opus, 2026-11-10)

The scan tables are in the local `preflight.md`. No task contradicts the owner's decisions; the "Under Q… (b)/(c)" lines left in Tasks 3 to 5 are dead text.
Ruling: every finding is adopted with its proposed ruling as written in `preflight.md`; the cost if wrong is the one each finding names. F1, F2 and the 100 % mutation go to Task 1; F4 (step 129 types ` /toda` and checks Today is highlighted before Enter) to Task 4; F7 (the split replay stops after a delete) to Task 6; F8 (an emptied only block is written `-\n`) to Tasks 5 and 6; F10 (old test objects gain the new fields; narrow the union before reading `icon` or `words`) to Tasks 3 and 4; the minors to their tasks (no `THEMES` in `smoke.mjs`; `replace_keeping_structure` for the delete; `group` on the `SHORTCUTS` entry; Task 3's subject split in two).
Ruling: F12: if Task 1 cannot reproduce a seam, the controller stops and asks the owner before Task 2 (the plan's own stop); step 128 and review items keep their numbers either way. Cost if wrong: renumbering two review items.

## Tasks

Task 1: implemented (commit 5073551; e2e 190). Seam reproduced: none at 100 %, up to 6 (named) / 16 (custom) brightness steps at 125 %; it is a gap toward the page background on the one device-pixel row where two rows meet, not an overlap. Departures: CDP `Page.captureScreenshot` instead of Playwright (which resampled the image); `seamAt(shot, band, i, what)`. Step 115 failed once (flaky, untouched).
Task 1: complete (commits d945de9..5073551, review clean: spec compliant, both departures judged justified, quality approved).
Task 1: minor (deferred): `smoke.mjs` `capture128` uses the rounded `png.width / innerWidth` instead of `view.dpr` (under half a device pixel).
Task 1: minor (deferred): `png.mjs:41`, `png.test.mjs:211` colour types 0, 3, 4 refused but untested; a PNG without IDAT throws a zlib error.
Task 1: minor (deferred): `smoke.mjs` the pointer is moved off the rows once, not after each theme and zoom change.
Task 2: implemented (commit d99bed0; e2e 190; step 128 passes at 100/110/125 % in all themes, worst residue 1 step at 125 %, tolerance 2 unchanged). Hovered and selected washed rows not looked at by eye.
Task 3: implemented (commit f550a39, one commit for the rename and Yesterday; slash tests 12/12; only lib changed, no e2e).
Task 2: complete (commits f612883..d99bed0, review clean on opus: same look everywhere a wash sits, the 1 px reach never paints a wrong colour, token rule kept).
Task 2: minor (deferred, fix in the finish): `docs/review.md` item 76 should ask for one check at a Windows display scale of 125 % or 150 % and a selected washed row.
Task 2: minor (deferred): step 128's margin is one step (worst 1 against tolerance 2) on one machine; if it turns flaky, measure again, never raise the tolerance.
Task 2: minor (deferred): `pageColors.test.ts:72` matches exact CSS text, spaces included.
Task 3: complete (commits 554c51d..f550a39, review clean: date arithmetic works on date keys, no hour arithmetic). The spec line (§7, "today's date") and a review item for the visible change were handed to Task 4, which edits both files.
Task 3: minor (deferred): `slash.test.ts:84-85` the daylight-saving assertion can fail only in a European time zone (CI runs in UTC).
Task 3: minor (deferred): `/toda` and `/d` are not tested directly.
Task 3: minor (deferred): one commit holds the new entry and the rename (borderline against "one change per commit"; the subject reads fine).
Task 4: implemented (commit 5cce0b5; e2e 192; spec §7.2 and review item 77 also cover Task 3's visible change).
Task 4: complete (commits f550a39..5cce0b5, review clean: the icon exists once (`CalendarIcon.svelte`), `currentColor`, `aria-hidden`).
Task 4: minor (deferred): `smoke.mjs:3597-3598` across midnight the cross product also accepts the impossible pairing.
Task 4: minor (deferred): `smoke.mjs:3583` the "query is gone" wait can pass at once; the final bytes still cover the outcome.
Task 4: minor (deferred): `editor/slash.ts:~39` the icon pass-through has no unit test.
Task 4: minor (deferred, fix in the finish): `docs/review.md:103` item 43 says "Today's date" stays, contradicting item 77.
Task 4: minor (deferred, owner to judge in item 77): labels of entries with an icon sit about 22 px right of those without.
Task 5: implemented (commit 05e5aca; core 734, Vitest 1024, lint clean; no e2e, only the type twin outside the core). Interface: `{ type: "block.delete", id }`, kind Edit / `kindOf` "text"; `focus` `{ id, at: 0 }` only when the only block was emptied, else null; unknown id refused `unknownBlock`, no write, no undo step.
