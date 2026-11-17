# Plan 5 (GitHub Pages site): follow-ups

Work the plan deferred. Open items are taken by later plans or moved to `docs/backlog.md`. Found by the per-task
reviews and the final whole-plan review (2026-11-09). Backlog #64 is done by this plan.

## Owner checks

1. ~~**Review items 61 to 63** (`docs/review.md`): the look in a real browser, publishing, the text. The hero has so far
   been seen only in headless frames, so its smoothness at full frame rate is unchecked.~~ Closed in plan 12: the review items 61 to 63 stay open in `docs/review.md`.

## Look

2. ~~**The board image scrolls sideways at 375 px** with no visible hint that it does.~~ Done in plan 12 (the board image shows a scroll hint at 375 px (owner decision Q4)).
3. ~~**The one-line cards look sparse at 768 px** (Page colors and Graph each sit alone in a full-width row).~~ Done in plan 12 (lone cards share the tablet grid (owner decision Q4)).
4. ~~**Tiles cross the "What it is" text at 375 px** for about half a second while the hero assembles.~~ Closed in plan 12: owner decision Q4: the opening animation stays as it is.
5. ~~**The brightness flash at the snap repaints the whole tile layer** for 360 ms (cheap to avoid if it ever janks).~~ Closed in plan 12: 360 ms once per visit; no jank seen.
6. ~~**On a slow connection the hero could fade into a screenshot that has not loaded yet** (84 KB, so unlikely). Start
   the assembly after `img.decode()`.~~ Done in plan 12 (the hero fades in after the screenshot has decoded).
7. ~~**If `hero.js` starts late and then throws,** the screenshot can stay hidden until about 4.3 s instead of 2.5 s.
   Tested and acceptable.~~ Closed in plan 12: tested and accepted in plan 5.

## Tests and process

8. ~~**Nothing checks that the site's wording follows the README.** A change to the README does not change the site;
   review item 63 covers the text. Consider a check that lists README features missing from the page.~~ Closed in plan 12: review item 63 covers the text; a matcher would cost more than the drift it catches.
9. ~~**Light-scheme link contrast has little headroom** (4.67:1 on the surface colour; the test now pins it at 4.5:1).~~ Closed in plan 12: the test pins 4.5:1, so a change that drops below it fails.
10. ~~**A custom domain** is still open (backlog #64, "Open").~~ Moved to backlog #88.

## History

- The first deploy run failed, as planned, because Pages was off; the owner agreed to turn it on, and the second run
  succeeded.
