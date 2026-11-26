# Plan 15 (the contract): follow-ups

Work the plan deferred. Open items are taken by later plans or moved to `docs/backlog.md`. Found by the per-task
reviews and the final whole-plan review (2026-11-20). The final review found nothing that had to be fixed before
finishing; its one doc point (STATUS still named audit plan 3 and review item 66 as open) was fixed in the fix wave.
Nothing a user sees changed, so there are no owner checks.

## Code

1. **The shell's command names are listed by hand** next to their serde renames (`app/src-tauri/src/commands.rs`), so
   a fifth shell command could be missed in that list.
2. ~~**The window's refreshes now run at the end of `apply`** (`App.svelte`). If `apply` throws first, they are skipped;
   the old events ran them separately.~~ Done in plan 19 (the search, name list and graph refreshes run in a `finally`
   once the route is known; `app.svelte.test.ts` checks it).
3. **`ts(optional = nullable)` on two `bool` fields** of a command reads as "null accepted", though serde refuses null
   there. The generated types are correct (`link?: boolean`, `keepOne?: boolean`); use `ts(optional)` next time
   `command.rs` is touched.

## Tests

4. **The contract test looks for event emits only in the shell's `commands.rs`;** an emit from a helper in another
   file would pass.
5. **The command table's "a row for every command" test compares lengths only** and repeats the first test; tighten
   it or delete it.
6. **`refreshGraph` has no test for a hidden graph** (route only has the "query" negative with the graph shown).
   Harmless today: the graph does nothing while hidden.

## Not in this plan

7. **M34** (one command for machine settings) stays open in the audit; the audit's plans 4 and 5 still wait for the
   owner.
