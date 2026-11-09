# Plan 5 (GitHub Pages site): follow-ups

Work the plan deferred. Open items are taken by later plans or moved to `docs/backlog.md`. Found by the per-task
reviews and the final whole-plan review (2026-11-09). Backlog #64 is done by this plan.

## Owner checks

1. **Review items 61 to 63** (`docs/review.md`): the look in a real browser, publishing, the text. The hero has so far
   been seen only in headless frames, so its smoothness at full frame rate is unchecked.

## Look

2. **The board image scrolls sideways at 375 px** with no visible hint that it does.
3. **The one-line cards look sparse at 768 px** (Page colors and Graph each sit alone in a full-width row).
4. **Tiles cross the "What it is" text at 375 px** for about half a second while the hero assembles.
5. **The brightness flash at the snap repaints the whole tile layer** for 360 ms (cheap to avoid if it ever janks).
6. **On a slow connection the hero could fade into a screenshot that has not loaded yet** (84 KB, so unlikely). Start
   the assembly after `img.decode()`.
7. **If `hero.js` starts late and then throws,** the screenshot can stay hidden until about 4.3 s instead of 2.5 s.
   Tested and acceptable.

## Tests and process

8. **Nothing checks that the site's wording follows the README.** A change to the README does not change the site;
   review item 63 covers the text. Consider a check that lists README features missing from the page.
9. **Light-scheme link contrast has little headroom** (4.67:1 on the surface colour; the test now pins it at 4.5:1).
10. **A custom domain** is still open (backlog #64, "Open").

## History

- The first deploy run failed, as planned, because Pages was off; the owner agreed to turn it on, and the second run
  succeeded.
