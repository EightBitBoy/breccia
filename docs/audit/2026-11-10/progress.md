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
| 6 | Shell | `app/src-tauri/` | done |
| 7 | Frontend: app shell and state | `app/src/App.svelte`, `app/src/api.ts`, `app/src/main.ts`, `app/src/lib/*.svelte.ts`, `app/src/lib/types.ts` | done (`App.svelte`, both `api.ts`, the head of `types.ts`; the `*.svelte.ts` classes are read with area 8) |
| 8 | Frontend: lib logic and its tests | `app/src/lib/` (the rest) | done (sampled, see `notes.md`) |
| 9 | Frontend: editor | `app/src/editor/` | done (sampled, see `notes.md`) |
| 10 | Frontend: components and styles | `app/src/components/`, `app/src/styles/` | done (sampled) |
| 11 | e2e | `app/e2e/` | done (sampled) |
| 12 | Scripts, justfile, CI, release | `app/scripts/`, `justfile`, `.github/workflows/`, `cliff.toml`, build configs | partly: workflows, justfile and configs read; `app/scripts/` not read |
| 13 | Site | `site/` | not read |
| 14 | Docs against the code | `docs/spec.md`, `docs/format.md`, `README.md`, `CLAUDE.md`, `docs/compatibility.md`, `docs/releasing.md` | partly: only where the audit touched (T20) |
| 15 | Cross-cutting synthesis | architecture, boundaries, future-proofing; writes `README.md` | done |

Next free keys: `B8`, `T22`, `M56`, `Q7`. The owner questions Q1 to Q6 are in `README.md` and in `docs/review.md` (items 64 to 69).

## Log

- 2026-11-10: ledger and stubs created.
- 2026-11-10: area 1 done (B1, B2; T1 to T4; M1 to M9).
- 2026-11-10: area 2 done (B3, B4; T5, T6; M10 to M15; Q1).
- 2026-11-10: area 3 done (B5; T7 to T9; M16 to M25).
- 2026-11-10: area 4 done (no defect; T10; M26 to M30).
- 2026-11-10: area 5 done, sampled, not read in full (T11; M31, M32).
- 2026-11-10: area 6 done (B6, B7; T12; M33 to M35; Q2).
- 2026-11-10: area 7 done (T13, T14; M36 to M42). B5 verified for link completion.
- 2026-11-10: areas 8 and 9 done, sampled (T15, T16; M43 to M47).
- 2026-11-10: areas 10 to 14 done as far as the table says (T17 to T20; M48 to M54).
- 2026-11-10: area 15 done (T21; M55); `README.md` written. The audit is complete as far as the table above says. Next: the owner answers Q1 to Q6, then plan 1 of the README ("Safety net") is written as a normal plan.
- 2026-11-11: plan 9 closed M1 to M8, M10 to M14, M16, M18, M22 to M31, M33.

## To check in later areas

- Area 6: done, see M35.
- Area 7: done, see T14 (types are mirrored by hand, no test).
- Area 9: B5 is verified for `pages.list` (`app/src/editor/host.svelte.ts`); the other queries were not traced.
- Area 15: done, see T21 and M55.
