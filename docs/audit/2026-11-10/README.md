---
scope: whole-app
created: 2026-11-10
author: claude-fable
model: claude-fable-5-2
posture: strict
round: 00
---

# Audit: the whole application

**Author:** claude-fable · **Posture:** strict · **Baseline:** commit `4b91b0c` (1.3.0) · **Verdict:** the core is
careful and well tested and needs tidying, not redesign; the weight of future work is in the frontend's controller
(`App.svelte`) and in the hand-kept contract between the core and the frontend.

The audit changed no product code. It is a report for the plans that follow.

## Files

| File          | Contents                                                                      |
| ------------- | ----------------------------------------------------------------------------- |
| `progress.md` | The ledger: the owner's decisions, the method, which areas were read and how  |
| `bugs.md`     | 7 defects (`B1` to `B7`), each with a failure scenario and a fix              |
| `program.md`  | 21 structural themes (`T1` to `T21`) with 55 refactor moves (`M1` to `M55`)   |
| `notes.md`    | What works and must survive a refactor, area by area                          |

## What was read, and what was not

Read in full: the whole core (`crates/core/src/`, about 13,000 lines), the shell (`app/src-tauri/`), `App.svelte`,
both `api.ts`, the routing, sync, echo and external-change modules of `app/src/lib/`, the editor host and the
block editor, the workflows, the justfile and the build configuration.

Sampled (counts, searches and a few files): the core's tests, the rest of `app/src/lib/`, the rest of
`app/src/editor/`, the components, the styles, `app/e2e/smoke.mjs`.

Not read: `app/scripts/`, `site/`, `README.md`, `docs/releasing.md`, `docs/compatibility.md`. The table in
`progress.md` says the same per area. A second pass over these is open question Q6.

## TL;DR

- **The core's safety rules hold everywhere they were checked.** Bytes Breccia did not read are never written
  over, every edit re-reads its result and refuses a change of the outline, Git never destroys, settings are never
  written from stale knowledge. No defect that loses text was found. `notes.md` lists these rules so that a
  refactor does not weaken them.
- **Two defects a user can meet today:** Breccia can be started twice on the same notes folder, which the tray
  icon makes likely (B6), and one panic in a command leaves the app running but dead until restart (B7). Both are
  small to fix.
- **Nothing checks a commit before a release.** Tests and lint run in CI only on a tag; e2e runs nowhere but on
  the owner's machine; the frontend has no linter or formatter; the TypeScript types mirror the Rust ones by hand
  (M52, M53, M45, M41). These are the cheapest wins for a project that agents build.
- **Three structures will slow every next feature:** `App.svelte` as an untestable 1,590-line controller with the
  shown view kept in nine flags (T13); one reply type with 26 optional fields for every command (T8); and a whole
  mechanism in the frontend whose only job is to drop events the shell did not need to send (T15).
- **The core itself needs housekeeping only:** three files over 1,000 lines with clear seams (T1, T7, T12),
  repeated bookkeeping (T5), four copies of one property editor (T2), five places that decide what a page file is
  (T6).

## Priorities: a proposed order of plans

Each line is one plan in the project's usual sense (written, reviewed by the owner, executed with subagents). The
moves inside a plan do not change behaviour unless marked **(visible)**; those need the owner's decision first.

1. **Safety net** (small). B6 (single instance) **(visible)**, B7 (recover from a panic) **(visible)**, M52 (CI on
   every push), M41 (contract test), M54 (Dependabot, `SECURITY.md`), M17 with B5 (a command says what kind it is),
   M9 (a log file; "Open log folder" is **(visible)**). Everything later is safer after this.
2. **Core housekeeping** (medium, mechanical, sonnet-sized tasks). M1 to M8 (config split, property editor,
   layering), M10 to M14 (workspace bookkeeping, one path classifier), M16 and M18 (dispatch table, validation in
   the model), M22 to M31 (naming, date formats, view types, Git helpers, test support module), M33 (split the
   shell's `lib.rs`).
3. **The contract** (medium, changes the wire format, needs `just e2e` at every step). M19 (error codes as an
   enum), M20 (split `Output` into effects and an answer), M35 (shell commands out of the core), M42 (generate the
   TypeScript types), M44 (one command table), then M43 (no own echoes) after the owner's decision Q3.
4. **The frontend controller** (large; opus for the plan and the UI tasks). M36 (one value for the shown view),
   M37 (one value for the open overlay), M38 (`ConfigStore`), M39 (the controller into `lib/`), M40, M49.
5. **Frontend hygiene** (medium, mechanical). M45 (Prettier and ESLint), M48 (styles next to components), M50,
   M51 (e2e in scenarios), M53 (e2e in CI), M46 after decision Q4.
6. **Measure, then decide** (no plan yet). B1 (re-read of a large file), B3 (the watcher sees `.git`), M15 (path
   index), M21 (board drop renders the column), M32 (scale tests on a schedule), T21 (a full page per edit). Run
   the scale tests and a trace first; fix only what shows.
7. **Before the first macOS or Linux build.** B2 (Unicode-normalised page keys), B4 (case-only renames).

Plans 6 (backlog #75) and the theme work (#76) that `docs/STATUS.md` names as next are user-visible features and
do not conflict with plan 1 above; plans 3 and 4 above touch the same files as any frontend feature, so they are
best done in a quiet stretch between features.

## Open questions

These are for the owner. They are also in `docs/review.md` (items 64 to 69).

- **Q1. Deleting a page removes its file for good** (`fs::remove_file` in `Workspace::delete_page`). Without Git
  there is no way back. Should a deleted page go to the operating system's recycle bin instead?
- **Q2. Remote images in a note are fetched when the page is shown** (the content security policy allows
  `http` and `https` images). That is what `![](https://…)` needs, and it means a note pulled from a shared
  repository can make Breccia contact an outside address. Keep it, or show remote images only after a click?
- **Q3. Should Breccia stop sending a command's own result back as events?** (M43.) It removes a fragile mechanism
  and three serialisations per edit, and it changes how spec §9's sentence "every change emits a named event" is
  met: outside changes still emit events; the window's own commands answer directly. A later plugin API or second
  window would get events with an origin field.
- **Q4. How should components be tested?** Keep the rule "logic lives in `lib/`, components stay thin" and enforce
  it for the six large components, or add a component test setup (M46)?
- **Q5. A log file** (M9): Breccia would write its warnings to a size-capped file in its data folder, with an
  "Open log folder" entry in Settings. Wanted?
- **Q6. A second audit pass** over what was not read (`app/scripts/`, `site/`, the rest of `lib/`, `editor/` and
  the components, the core's test files in full): now, or after plan 1?

## Resources

No external package documentation or website was consulted; every statement comes from the repository at commit
`4b91b0c`. The review standard is the `code-quality` skill of the `aplus` plugin (strict posture).
