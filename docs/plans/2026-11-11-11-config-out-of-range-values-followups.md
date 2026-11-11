# Plan 11 (Out-of-range values in config.toml): follow-ups

Work the plan deferred. Open items are taken by later plans or moved to `docs/backlog.md`. The plan closed backlog #80.

## Owner decisions

1. **Q1, wording:** the planned text ("breccia/config.toml: [git] pull_interval_minutes = 100000 is outside 0 to 1440,
   so Breccia uses 5 instead. Change it in Settings or in the file.").
2. **Q2, where:** the notice list only. A line under the field in Settings was declined by the owner.
3. **Q3:** one notice per bad key. **Q4:** only the bad key is replaced. **Q5:** a Settings save of that section may
   write the default over the bad number.

## Known behaviour

4. **R3. A wrong type still refuses the file.** `"5"`, `5.5` and `true` are errors as before; only whole numbers are
   range-checked.
5. **R6. A dismissed notice returns** on the next read of the file while a value is still out of range.
6. **R7. A Settings save writes the default** over the hand-written number in that section.
7. **R8. A column number may shift** on the replaced value's line.
8. **R9. Notices from a git-pull reload arrive with the next command**, not at once.

## Minors from the task reviews

9. **Task 1:** the wrong-types test also passes before the change (a regression guard only); the key and label strings
   are duplicated in `crates/core/src/config/range.rs`; the doc comment there is untidy.

## Found by the final review and the finish

- A comment in `crates/core/src/config/range.rs` says "file order", but the records come out in a fixed order.
- Spec §6 and `docs/format.md` §11 say the file is left unchanged; it should read "when it is read", because a later Settings save overwrites the number.
- e2e flake seen once on 2026-11-11 (first run stopped after step 119 in the vividness step: "locator.scrollIntoViewIfNeeded: Element is not attached to the DOM"; the rerun passed all 203). Unrelated to config; worth making that step wait for a stable element.
