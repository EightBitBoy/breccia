# SDD ledger — plan: docs/plans/2026-11-09-05-github-pages-site.md

Owner approved the plan 2026-11-09 (AskUserQuestion "Approve, build it").

## Pre-flight rulings (adopted 2026-11-09; each: cost if wrong = rework of that task only)

1. **T1 serve test:** use `node:http` `get` with raw paths (`/breccia/..%2fsecret.txt`, `/breccia/../secret.txt`) and a
   `secret.txt` written beside the fixture `siteDir`; assert 404 and that the body is not the secret. Keep the `/` 302
   and `/other` 404 checks. Prove it can fail by disabling the containment check once.
2. **T1 missing tests:** add `refuses_missing_head_meta` (lang, charset, viewport, title, description, icon link),
   `refuses_inline_handlers`, `refuses_a_missing_srcset_or_import_target`, `refuses_a_site_without_index`. Each
   refusing case reports exactly one problem (root-absolute is reported once, not also as missing).
3. **T1 `serve`:** returns the server; callers await `'listening'`. Resolve every repo path from `import.meta.url`.
4. **T2 toggle name:** one fixed `aria-label="Light theme"` in the static HTML, `aria-pressed="true"` when light is
   on; no label switching. (Alternative if the owner prefers: switch label, drop `aria-pressed`.)
5. **T2 shards:** no CSS `transform` on `.shard` in the static state; position with layout + `clip-path`. `transform`
   is T4's.
6. **T2 colours:** the seven scheme properties are `#rrggbb` literals; palette parser matches selectors exactly.
7. **T3 lazy images:** before asserting, scroll to the bottom and wait until every `img` is complete with
   `naturalWidth > 0`; assert that for all images, not only `img.shot`.
8. **T3 no-JS case:** separate context for no-JS; toggle/reload/Tab in a JS-enabled context.
9. **T4 timing:** wait for states with timeouts instead of fixed sleeps, except the 3 s fallback check (time is the
   point there). T4 Step 4 re-runs `site.test.mjs` too.
10. **T2 checker vs inline SVG:** no `xmlns` attribute in inline SVG (or no inline SVG).
11. **T6:** use `curl.exe` or the Bash tool; T6 Step 3's "item 62" is written by T7.

Task 1: complete — commit 3a3fc02, review approved (spec pass, quality approved, 3 minor non-issues).

Task 2: complete — commit 29ec8b5 (+ comment fix), review approved. Parked: no test for 'invents no feature' (hand-checked); light accent links on surface 4.67:1 (little headroom).

Task 3: complete — commits 7e7d2e6, a43fdf8 (visual fixes), 47ed0d5 (check fixes); review approved. Parked: no hint that board image scrolls sideways at 375; sparse one-line cards at 768.

Task 4: complete — commits 37d041b, 28be11c (review fixes: background tab, shard fallback, late-load checks, transition cleanup); opus review approved after fix; I re-ran site-check, vitest (164) and site-shots (79 PASS). Parked: tiles pass over 'What it is' text at 375px for ~0.5 s; brightness flash repaints tile layer 360 ms; hero seen only in headless frames, owner checks in a real browser.

Task 5: complete — commit 1e7bdf4; reviewed by the controller directly (workflow read, 3 pinned SHAs verified with gh api). First run 42700284201 failed at configure-pages: Pages not enabled (expected, Task 6).

Task 6: complete — owner chose 'You turn it on now'; Pages enabled (build_type workflow); run 42700654560 green; site and images answer 200.

Task 7: complete — commit ad945cd (docs, haiku), diff read by the controller. Open for finish: STATUS test baseline unchanged (no app tests added), #64 heading check at close.
