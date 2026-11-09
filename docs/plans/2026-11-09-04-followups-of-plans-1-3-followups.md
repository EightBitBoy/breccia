# Plan 4 (follow-ups of plans 1 to 3): follow-ups

Work the plan deferred. Open items are taken by later plans or moved to `docs/backlog.md`. Found by the per-task
reviews and the final whole-plan review (2026-11-09). The items of the earlier follow-up lists that this plan did not
take stay in those lists (`docs/plans/*-followups.md`).

## Code

1. ~~**Double blank line** left in `app/src/App.svelte` and `app/src/components/PageColorPicker.svelte` where the Mac
   check was removed (it moved to `app/src/lib/platform.ts`).~~ Done in the plan's fix wave.
2. **No focus fallback on open.** If the picker's content cannot take the focus within one frame, nothing is focused.
   Sturdier: focus from `onOpenAutoFocus` and keep the frame retry as the fallback.
3. **Dead CSS:** the `.page-color-picker` `padding`, `min-width` and `z-index` lines are overridden by `.menu`
   (`app/src/styles/app.css`).
4. **The focus given back to a link ends late** (`LinkColorMenu.svelte`): it ends only on a `pointerdown` or `focusin`
   elsewhere. A day drawn anew in between can still hand the focus to the new link.
5. **`tabindex` is written into `{@html}` content** when the link is focused (`LinkColorMenu.svelte`); the attribute
   stays on the anchor in the DOM until the day is drawn anew.
9. **Grab a slider thumb without a jump.** A press runs the pointer mapping at once, so a press on the thumb anywhere
   but its exact middle moves the value (up to about ±11 hue or ±5 vividness). Like a native slider, a press on the
   thumb should keep the value: keep the press offset when the press lands on the thumb (a helper in
   `app/src/lib/pageColors.ts` and two lines in `sliderDrag` in `PageColorGrid.svelte`).

## Tests

6. ~~**e2e step 95 (the journal date picker) failed once in a run.** It looks like an old race in the test: it waits for
   `start-writing`, which the previous empty day also shows (`app/e2e/smoke.mjs` near line 1897). Wait for the
   picked day's own title instead.~~ Done in the plan's fix wave (each pick waits for the page title).
7. **Step 121's focus-on-open check only pins behaviour** that held before the plan (it guards the refactor); it
   cannot fail on today's code.
8. **Step 123:** also assert that the end of the highlight animation differs from white; it covers only the named blue
   wash, not a custom (opaque) one; `getAnimations()[0]` should filter by the animation's name.
