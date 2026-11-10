# Audit ledger

Whole-application audit, started 2026-11-10 at commit `4b91b0c`. This file is the takeover point: a new session
reads it, then continues with the first area that is not `done`.

## Owner decisions (2026-11-10)

- **Mode:** report first, fixes later as normal plans (plan 6 onward). The audit changes no product code.
- **Storage:** committed here, in `docs/audit/2026-11-10/`, and pushed after each area. The repository is public, so
  a security-relevant finding is not written here before the owner has seen it.
- **Reader:** the session model reads all code itself, one area at a time. No subagents.
- **Scope and posture:** everything, strict: bugs, structure, style, legibility, tests, scripts, CI, the site, and
  whether the docs agree with the code.

## Method

The method is the `aplus:audit` skill, strict posture (standard: its `code-quality` skill). Its `new-audit.mts`
script refuses a folder that is not gitignored, so these files were made by hand from its templates.

- `bugs.md`: one `## B<n>: title` per defect, with the problem, a failure scenario and the evidence (`file:line`).
- `program.md`: one `## T<n>: title` per structural theme, with its refactor moves as `### M<n>: title`.
- `notes.md`: patterns the code follows or breaks, and what works and must survive a refactor.
- `README.md`: verdict, priorities, open questions for the owner. Written last; until then it is a stub.

Keys are stable and never reused. Each finding must stand on its own, so that another model can implement it without
this session's context: say where, what is wrong, why it matters, and what the fix is.

Rules for whoever continues:

1. Read the area's files in full, not excerpts.
2. Verify a suspected bug against the code (and a test, if one covers it) before writing it down. Mark anything not
   verified as `unverified`.
3. After each area: append the findings, set the area to `done` below with the next free keys, commit
   (`docs: audit, <area>`) and push.

## Areas

| # | Area | Files | State |
|---|---|---|---|
| 1 | Core: format and outline | `crates/core/src/{lib,error,fsio,outline,inline,render,edit,task,dates,naming,color,aliases,relink,index,config}.rs` | done |
| 2 | Core: workspace | `crates/core/src/workspace/`, `watch.rs` | done |
| 3 | Core: session | `crates/core/src/session/` | done |
| 4 | Core: search and Git | `crates/core/src/search/`, `crates/core/src/git/` | done |
| 5 | Core: tests | `crates/core/tests/` | done (sampled) |
| 6 | Shell | `app/src-tauri/` | open |
| 7 | Frontend: app shell and state | `app/src/App.svelte`, `app/src/api.ts`, `app/src/main.ts`, `app/src/lib/*.svelte.ts`, `app/src/lib/types.ts` | open |
| 8 | Frontend: lib logic and its tests | `app/src/lib/` (the rest) | open |
| 9 | Frontend: editor | `app/src/editor/` | open |
| 10 | Frontend: components and styles | `app/src/components/`, `app/src/styles/` | open |
| 11 | e2e | `app/e2e/` | open |
| 12 | Scripts, justfile, CI, release | `app/scripts/`, `justfile`, `.github/workflows/`, `cliff.toml`, build configs | open |
| 13 | Site | `site/` | open |
| 14 | Docs against the code | `docs/spec.md`, `docs/format.md`, `README.md`, `CLAUDE.md`, `docs/compatibility.md`, `docs/releasing.md` | open |
| 15 | Cross-cutting synthesis | architecture, boundaries, future-proofing; writes `README.md` | open |

Next free keys: `B6`, `T12`, `M33`. Owner questions so far: Q1 (deleting a page removes the file for good; recycle bin?).

## Log

- 2026-11-10: ledger and stubs created.
- 2026-11-10: area 1 done (B1, B2; T1 to T4; M1 to M9).
- 2026-11-10: area 2 done (B3, B4; T5, T6; M10 to M15; Q1).
- 2026-11-10: area 3 done (B5; T7 to T9; M16 to M25).
- 2026-11-10: area 4 done (no defect; T10; M26 to M30).
- 2026-11-10: area 5 done, sampled, not read in full (T11; M31, M32).

## To check in later areas

- Area 6: are the `git.*` variants in the core's `Command` enum (answered only by the shell) worth moving out?
- Area 7: are the TypeScript types in `app/src/lib/types.ts` tied to the Rust view structs by a test or generated?
- Area 9: verify B5 (which commands the editor sends between two `block.setText`).
- Area 15: the cost of a full `PageView` per edit (see `notes.md`, area 3).
